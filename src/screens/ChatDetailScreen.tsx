import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, SafeAreaView, StatusBar, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Fonts, Spacing, BorderRadius } from '../theme';
import { supabase } from '../lib/supabase';

export default function ChatDetailScreen() {
    const [loading, setLoading] = useState(true);
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [otherUser, setOtherUser] = useState<any>(null);
    const navigation = useNavigation();
    const route = useRoute<any>();
    const { conversationId } = route.params;

    const loadData = async () => {
        const { data: { user } } = await supabase.auth.getUser();
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
            // Fetch profile separately to avoid join issues (often hidden behind secondary schemas)
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
    };

    useEffect(() => { loadData(); }, []);

    const sendMessage = async () => {
        if (!newMessage.trim() || !currentUserId) return;
        const msg = newMessage.trim();
        setNewMessage('');

        const { data, error } = await supabase.from('messages').insert({
            conversation_id: conversationId,
            sender_id: currentUserId,
            content: msg
        }).select().single();

        if (data) {
            setMessages([...messages, data]);
            await supabase.from('conversations').update({ last_message_at: new Date() }).eq('id', conversationId);
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
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <View style={styles.header}>
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

            {loading ? (
                <View style={styles.centered}><ActivityIndicator color={Colors.primary} /></View>
            ) : (
                <FlatList
                    data={messages}
                    keyExtractor={(item) => item.id}
                    renderItem={renderMessage}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                />
            )}

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={styles.inputRow}>
                    <TextInput
                        style={styles.input}
                        value={newMessage}
                        onChangeText={setNewMessage}
                        placeholder="Say something..."
                        placeholderTextColor={Colors.textMuted}
                    />
                    <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
                        <Ionicons name="send" size={20} color="#fff" />
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
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
    inputRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border },
    input: { flex: 1, height: 44, backgroundColor: Colors.background, borderRadius: 22, paddingHorizontal: 16, fontSize: 15, color: Colors.textPrimary },
    sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary, marginLeft: Spacing.sm, alignItems: 'center', justifyContent: 'center' },
});
