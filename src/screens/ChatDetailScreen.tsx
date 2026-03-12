import React, { useState, useEffect } from 'react';
import { 
    View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, 
    KeyboardAvoidingView, Platform, StatusBar, ActivityIndicator, Image 
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Fonts, Spacing, BorderRadius } from '../theme';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ChatDetailScreen() {
    const [loading, setLoading] = useState(true);
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [otherUser, setOtherUser] = useState<any>(null);
    const insets = useSafeAreaInsets();
    const navigation = useNavigation();
    const route = useRoute<any>();
    const { conversationId } = route.params;

    const loadData = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;
        setCurrentUserId(user.id);

        // Fetch other participant record
        const { data: partData } = await supabase
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', conversationId)
            .neq('user_id', user.id)
            .maybeSingle();

        if (partData) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', partData.user_id)
                .single();
            if (profile) setOtherUser(profile);
        }

        const { data: msgs } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });

        if (msgs) setMessages(msgs);
        setLoading(false);

        // Mark chat as visited (used by ChatListScreen to determine unread status)
        AsyncStorage.setItem(`chat_visited_${conversationId}`, new Date().toISOString());

        // Also mark received messages as read in DB (best effort)
        try {
            await Promise.all([
                supabase
                    .from('messages')
                    .update({ is_read: true })
                    .eq('conversation_id', conversationId)
                    .neq('sender_id', user.id),
                supabase
                    .from('notifications')
                    .update({ is_read: true })
                    .eq('conversation_id', conversationId)
                    .eq('user_id', user.id)
            ]);
        } catch (e) {
            // is_read column may not exist — visit timestamp is the fallback
            console.warn('Could not mark messages as read (is_read may not exist):', e);
        }
    };

    useEffect(() => { 
        loadData(); 

        const sub = supabase
            .channel(`chat-${conversationId}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
                (payload) => {
                    const newMsg = payload.new as any;
                    // Only add messages from OTHER users via realtime
                    // Our own sent messages are added locally in sendMessage()
                    supabase.auth.getSession().then(({ data: { session } }) => {
                        const user = session?.user;
                        if (!user || newMsg.sender_id === user.id) return;

                        // Add with dedup guard
                        setMessages(prev => {
                            if (prev.some(m => m.id === newMsg.id)) return prev;
                            return [...prev, newMsg];
                        });

                        // Mark as read immediately
                        supabase
                            .from('messages')
                            .update({ is_read: true })
                            .eq('id', newMsg.id)
                            .then();
                    });
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(sub); };
    }, [conversationId]);

    const sendMessage = async () => {
        if (!newMessage.trim() || !currentUserId) return;
        const msg = newMessage.trim();
        setNewMessage('');

        // Optimistic local add
        const tempId = `temp_${Date.now()}`;
        const tempMsg = {
            id: tempId,
            conversation_id: conversationId,
            sender_id: currentUserId,
            content: msg,
            created_at: new Date().toISOString(),
            is_read: false,
        };
        setMessages(prev => [...prev, tempMsg]);

        const { data, error } = await supabase.from('messages').insert({
            conversation_id: conversationId,
            sender_id: currentUserId,
            content: msg
        }).select().single();

        if (data) {
            // Replace temp message with real one (has correct db-generated ID & timestamp)
            setMessages(prev => prev.map(m => m.id === tempId ? data : m));
            try {
                await supabase.from('conversations').update({ last_message_at: new Date() }).eq('id', conversationId);
            } catch (e) {
                console.warn('Could not update last_message_at:', e);
            }
        } else {
            // Remove temp if insert failed
            setMessages(prev => prev.filter(m => m.id !== tempId));
            if (error) console.warn('Send error:', error.message);
        }
    };

    const renderMessage = ({ item }: any) => {
        const isMe = item.sender_id === currentUserId;
        return (
            <View style={[styles.msgWrapper, isMe ? styles.myMsg : styles.theirMsg]}>
                <View style={[styles.bubble, isMe ? styles.myBubble : styles.theirBubble]}>
                    <Text style={[styles.msgText, isMe && styles.myMsgText]}>{item.content}</Text>
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => otherUser && (navigation as any).navigate('UserProfile', { targetUserId: otherUser.id })}
                    style={styles.headerUserInfo}
                >
                    <Image source={{ uri: otherUser?.avatar_url || 'https://via.placeholder.com/150' }} style={styles.headerAvatar} />
                    <Text style={styles.headerTitle}>{otherUser?.display_name || otherUser?.username || 'Messages'}</Text>
                </TouchableOpacity>
                <View style={{ width: 40 }} />
            </View>

            <KeyboardAvoidingView 
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            >
                {loading ? (
                    <View style={styles.centered}><ActivityIndicator color={Colors.primary} /></View>
                ) : (
                    <FlatList
                        data={messages}
                        keyExtractor={(item) => item.id}
                        renderItem={renderMessage}
                        contentContainerStyle={styles.list}
                        showsVerticalScrollIndicator={false}
                        removeClippedSubviews={false}
                    />
                )}

                <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom || 16, Spacing.md) }]}>
                    <TextInput
                        style={styles.input}
                        value={newMessage}
                        onChangeText={setNewMessage}
                        placeholder="Say something..."
                        placeholderTextColor={Colors.textMuted}
                        multiline
                    />
                    <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
                        <Ionicons name="send" size={20} color="#fff" />
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        padding: Spacing.md, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border
    },
    headerUserInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    headerAvatar: { width: 32, height: 32, borderRadius: 16 },
    headerTitle: { fontSize: 17, fontFamily: Fonts.bold, color: Colors.textPrimary },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    list: { padding: Spacing.md },
    msgWrapper: { marginBottom: Spacing.sm, width: '100%' },
    myMsg: { alignItems: 'flex-end' },
    theirMsg: { alignItems: 'flex-start' },
    bubble: { maxWidth: '80%', padding: 12, borderRadius: BorderRadius.lg },
    myBubble: { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
    theirBubble: { backgroundColor: Colors.cardAlt, borderBottomLeftRadius: 4 },
    msgText: { fontSize: 15, fontFamily: Fonts.regular, color: Colors.textPrimary },
    myMsgText: { color: '#fff' },
    inputRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: Spacing.md, paddingTop: 10, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border },
    input: { flex: 1, minHeight: 44, maxHeight: 120, backgroundColor: Colors.background, borderRadius: 24, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 15, color: Colors.textPrimary },
    sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary, marginLeft: Spacing.sm, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
});
