import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
    try {
        const payload = await req.json()
        const { record } = payload
        
        // Skip chat and capsule_chat notifications to prevent redundancy
        if (record.type === 'capsule_chat' || record.type === 'chat' || record.type === 'message') {
            return new Response(JSON.stringify({ message: 'Skipping chat/message notification' }), { status: 200 })
        }

        // record will be the new notification row:
        // { id, user_id, sender_id, type, message, capsule_id, ... }

        // Initialize Supabase client
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 1. Get the recipient's push token
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('push_token, username')
            .eq('id', record.user_id)
            .single()

        if (profileError || !profile?.push_token) {
            return new Response(JSON.stringify({ message: 'No push token found' }), { status: 200 })
        }

        // 2. Get sender info for a better message
        const { data: sender } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', record.sender_id)
            .single()

        const senderName = sender?.username ? `@${sender.username}` : 'Someone'
        const message = `${senderName} ${record.message || 'sent you a notification'}`

        // 3. Get unread count for badge
        const { count: unreadCount } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', record.user_id)
            .eq('is_read', false)

        // 4. Send to Expo
        const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                to: profile.push_token,
                sound: 'default',
                title: 'Kapsely',
                body: message,
                badge: unreadCount,
                data: {
                    notificationId: record.id,
                    capsuleId: record.capsule_id,
                    type: record.type
                },
            }),
        })

        const expoData = await expoResponse.json()
        return new Response(JSON.stringify(expoData), { headers: { 'Content-Type': 'application/json' } })

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }
})
