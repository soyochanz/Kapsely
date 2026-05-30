/// <reference lib="deno.ns" />

import { serve } from "std/http/server.ts"
import { createClient } from 'supabase'

serve(async (req: Request) => {
    try {
        const payload = await req.json()
        const { record } = payload
        
        // Initialize Supabase client
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // 1. Get ALL push tokens for this user
        const { data: registeredTokens, error: tokenError } = await supabase
            .from('user_push_tokens')
            .select('token')
            .eq('user_id', record.user_id)

        let tokens = registeredTokens ?? []
        if (tokenError || !tokens || tokens.length === 0) {
            // Fallback to profiles table for legacy
            const { data: profile } = await supabase
                .from('profiles')
                .select('push_token')
                .eq('id', record.user_id)
                .single()
            
            if (!profile?.push_token) {
                return new Response(JSON.stringify({ message: 'No push tokens found' }), { status: 200 })
            }
            tokens = [{ token: profile.push_token }]
        }

        // 2. Get recipient's active status and sender info
        const { data: profile } = await supabase
            .from('profiles')
            .select('username, active_conversation_id')
            .eq('id', record.user_id)
            .single()

        // Suppress if user is active in this conversation
        const notificationData = record.data || {}
        const conversationId = record.conversation_id || notificationData.conversationId
        if (conversationId && profile?.active_conversation_id === conversationId) {
            return new Response(JSON.stringify({ message: 'User is active in this conversation, skipping push' }), { status: 200 })
        }

        const { data: sender } = await supabase
            .from('profiles')
            .select('username, avatar_url')
            .eq('id', record.sender_id)
            .single()

        // 3. Get capsule info if available for better aesthetics
        let capsuleCover = null
        if (record.capsule_id) {
            const { data: capsule } = await supabase
                .from('capsules')
                .select('cover_url, title')
                .eq('id', record.capsule_id)
                .single()
            capsuleCover = capsule?.cover_url
        }

        // 4. Get unread count for badge
        const { count: unreadCount } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', record.user_id)
            .eq('is_read', false)

        const senderName = sender?.username ? `@${sender.username}` : 'Kapsely'
        const messageText = record.message || 'sent you a notification'
        const fullMessage = sender?.username ? `${senderName} ${messageText}` : messageText

        // 5. Prepare notification payloads for ALL tokens
        const expoMessages = tokens.map(t => ({
            to: t.token,
            sound: 'default',
            title: 'Kapsely ✦',
            body: fullMessage,
            badge: unreadCount,
            mutableContent: true, // Required for media on iOS
            data: {
                notificationId: record.id,
                capsuleId: record.capsule_id,
                type: record.type,
                imageUrl: capsuleCover || sender?.avatar_url
            },
        }))

        // 6. Send to Expo in chunks (Expo allows up to 100 messages per request)
        const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify(expoMessages),
        })

        const expoData = await expoResponse.json()
        return new Response(JSON.stringify(expoData), { headers: { 'Content-Type': 'application/json' } })

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message || 'Unknown error' }), { status: 500 })
    }
})
