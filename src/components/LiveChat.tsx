import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList,
    Image, Animated, Easing
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { Colors, Fonts, Spacing, BorderRadius } from '../theme';

interface ChatMessage {
    id: string;
    user_id: string;
    message: string;
    created_at: string;
    profiles?: { username: string; avatar_url: string | null };
}

interface FloatingEmoji {
    id: string;
    emoji: string;
    left: number;
    anim: Animated.Value;
}

const REACTION_EMOJIS = ['❤️', '😂', '🔥', '🎉', '💯', '😍', '😲', '👏'];

interface LiveChatProps {
    capsuleId: string;
    tint: string;
}

export default function LiveChat({ capsuleId, tint }: LiveChatProps) {
    const navigation = useNavigation<any>();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [userId, setUserId] = useState<string | null>(null);
    const [myProfile, setMyProfile] = useState<any>(null);
    const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);
    const flatListRef = useRef<FlatList>(null);

    useEffect(() => {
        initUser();
        loadMessages();

        // Subscribe to new messages
        const msgChannel = supabase
            .channel(`capsule-chat-${capsuleId}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'capsule_chat', filter: `capsule_id=eq.${capsuleId}` },
                (payload) => {
                    const newMsg = payload.new as ChatMessage;
                    // Fetch profile for the new message sender
                    supabase
                        .from('profiles')
                        .select('username, avatar_url')
                        .eq('id', newMsg.user_id)
                        .single()
                        .then(({ data }) => {
                            setMessages(prev => [...prev, { ...newMsg, profiles: data || undefined }]);
                            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
                        });
                }
            )
            .subscribe();

        // Subscribe to emoji reactions (broadcast)
        const emojiChannel = supabase.channel(`capsule-emoji-${capsuleId}`);
        emojiChannel
            .on('broadcast', { event: 'reaction' }, (payload) => {
                if (payload.payload?.emoji) {
                    addFloatingEmoji(payload.payload.emoji);
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(msgChannel);
            supabase.removeChannel(emojiChannel);
        };
    }, [capsuleId]);

    const initUser = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            setUserId(user.id);
            const { data } = await supabase
                .from('profiles')
                .select('username, avatar_url')
                .eq('id', user.id)
                .single();
            setMyProfile(data);
        }
    };

    const loadMessages = async () => {
        const { data } = await supabase
            .from('capsule_chat')
            .select('*, profiles:user_id(username, avatar_url)')
            .eq('capsule_id', capsuleId)
            .order('created_at', { ascending: true })
            .limit(100);
        if (data) {
            setMessages(data);
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 200);
        }
    };

    const sendMessage = async () => {
        if (!input.trim() || !userId) return;
        const text = input.trim();
        setInput('');
        await supabase.from('capsule_chat').insert({
            capsule_id: capsuleId,
            user_id: userId,
            message: text
        });
    };

    const addFloatingEmoji = useCallback((emoji: string) => {
        const id = `${Date.now()}-${Math.random()}`;
        const anim = new Animated.Value(0);
        const left = 10 + Math.random() * 70; // 10–80% from left

        setFloatingEmojis(prev => [...prev, { id, emoji, left, anim }]);

        Animated.timing(anim, {
            toValue: 1,
            duration: 2200,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
        }).start(() => {
            setFloatingEmojis(prev => prev.filter(e => e.id !== id));
        });
    }, []);

    const sendReaction = async (emoji: string) => {
        addFloatingEmoji(emoji);
        const channel = supabase.channel(`capsule-emoji-${capsuleId}`);
        await channel.send({
            type: 'broadcast',
            event: 'reaction',
            payload: { emoji },
        });
    };

    const formatTime = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const renderMessage = ({ item, index }: { item: ChatMessage; index: number }) => {
        const isMe = item.user_id === userId;
        const prevItem = messages[index - 1];
        const showAvatar = !prevItem || prevItem.user_id !== item.user_id;

        return (
            <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
                {!isMe && (
                    <View style={styles.avatarSlot}>
                        {showAvatar ? (
                            <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { targetUserId: item.user_id })}>
                                {item.profiles?.avatar_url
                                    ? <Image source={{ uri: item.profiles.avatar_url }} style={styles.msgAvatar} />
                                    : <View style={[styles.msgAvatar, styles.avatarPlaceholder]}>
                                        <Ionicons name="person" size={14} color={Colors.textMuted} />
                                    </View>}
                            </TouchableOpacity>
                        ) : null}
                    </View>
                )}
                <View style={[styles.bubble, isMe && { backgroundColor: tint + 'ee' }]}>
                    {!isMe && showAvatar && (
                        <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { targetUserId: item.user_id })}>
                            <Text style={styles.bubbleUser}>{item.profiles?.username || 'user'}</Text>
                        </TouchableOpacity>
                    )}
                    <Text style={[styles.bubbleText, isMe && { color: '#fff' }]}>{item.message}</Text>
                    <Text style={[styles.bubbleTime, isMe && { color: 'rgba(255,255,255,0.7)', textAlign: 'right' }]}>
                        {formatTime(item.created_at)}
                    </Text>
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={[styles.chatHeader, { borderBottomColor: tint + '44' }]}>
                <View style={[styles.liveDot, { backgroundColor: tint }]} />
                <Text style={[styles.chatHeaderText, { color: tint }]}>Live Chat</Text>
            </View>

            {/* Floating emoji layer */}
            <View style={[styles.floatLayer, { pointerEvents: 'none' }]}>
                {floatingEmojis.map(e => {
                    const translateY = e.anim.interpolate({ inputRange: [0, 1], outputRange: [0, -220] });
                    const opacity = e.anim.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 1, 1, 0] });
                    const scale = e.anim.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0.4, 1.3, 1] });
                    return (
                        <Animated.Text
                            key={e.id}
                            style={[styles.floatEmoji, {
                                left: `${e.left}%`,
                                transform: [{ translateY }, { scale }],
                                opacity,
                            } as any]}
                        >
                            {e.emoji}
                        </Animated.Text>
                    );
                })}
            </View>

            {/* Messages */}
            <FlatList
                ref={flatListRef}
                data={messages}
                keyExtractor={item => item.id}
                renderItem={renderMessage}
                contentContainerStyle={styles.messagesList}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                style={{ maxHeight: 260 }}
                ListEmptyComponent={
                    <View style={styles.emptyChat}>
                        <Ionicons name="chatbubbles-outline" size={32} color={Colors.textMuted} />
                        <Text style={styles.emptyChatText}>Be the first to say something! 👋</Text>
                    </View>
                }
            />

            {/* Emoji bar */}
            <View style={[styles.emojiBar, { borderTopColor: tint + '33' }]}>
                {REACTION_EMOJIS.map(emoji => (
                    <TouchableOpacity
                        key={emoji}
                        style={styles.emojiBtn}
                        onPress={() => sendReaction(emoji)}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.emojiChar}>{emoji}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Input area */}
            <View style={[styles.inputRow, { borderTopColor: Colors.border }]}>
                {myProfile?.avatar_url ? (
                    <Image source={{ uri: myProfile.avatar_url }} style={styles.inputAvatar} />
                ) : (
                    <View style={[styles.inputAvatar, styles.avatarPlaceholder]}>
                        <Ionicons name="person" size={16} color={Colors.textMuted} />
                    </View>
                )}
                <TextInput
                    style={styles.inputField}
                    placeholder="Say something..."
                    placeholderTextColor={Colors.textMuted}
                    value={input}
                    onChangeText={setInput}
                    onSubmitEditing={sendMessage}
                    returnKeyType="send"
                    multiline={false}
                    blurOnSubmit={false}
                />
                <TouchableOpacity
                    style={[styles.sendBtn, { backgroundColor: tint }]}
                    onPress={sendMessage}
                    disabled={!input.trim()}
                    activeOpacity={0.8}
                >
                    <Ionicons name="send" size={16} color="#fff" />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: Colors.surface,
        borderRadius: 20,
        marginHorizontal: Spacing.md,
        marginTop: Spacing.xl,
        marginBottom: Spacing.lg,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: Colors.border,
    },
    chatHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    liveDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    chatHeaderText: {
        fontSize: 13,
        fontFamily: Fonts.bold,
        textTransform: 'uppercase',
        letterSpacing: 1.5,
    },

    floatLayer: {
        position: 'absolute',
        bottom: 80,
        left: 0,
        right: 0,
        height: 250,
        zIndex: 50,
        overflow: 'hidden',
    },
    floatEmoji: {
        position: 'absolute',
        fontSize: 28,
        bottom: 0,
    },

    messagesList: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 4,
        flexGrow: 1,
    },
    msgRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 6,
        marginBottom: 4,
    },
    msgRowMe: {
        flexDirection: 'row-reverse',
    },
    avatarSlot: {
        width: 30,
        alignItems: 'center',
    },
    msgAvatar: {
        width: 28,
        height: 28,
        borderRadius: 14,
    },
    avatarPlaceholder: {
        backgroundColor: Colors.cardAlt,
        alignItems: 'center',
        justifyContent: 'center',
    },
    bubble: {
        maxWidth: '72%',
        backgroundColor: Colors.cardAlt,
        borderRadius: 16,
        borderBottomLeftRadius: 4,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    bubbleUser: {
        fontSize: 11,
        fontFamily: Fonts.bold,
        color: Colors.textMuted,
        marginBottom: 2,
    },
    bubbleText: {
        fontSize: 14,
        fontFamily: Fonts.regular,
        color: Colors.textPrimary,
        lineHeight: 20,
    },
    bubbleTime: {
        fontSize: 10,
        color: Colors.textMuted,
        marginTop: 3,
    },

    emptyChat: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 30,
        gap: 10,
    },
    emptyChatText: {
        color: Colors.textMuted,
        fontFamily: Fonts.medium,
        fontSize: 13,
    },

    emojiBar: {
        flexDirection: 'row',
        paddingHorizontal: 12,
        paddingVertical: 6,
        gap: 4,
        borderTopWidth: 1,
        flexWrap: 'wrap',
    },
    emojiBtn: {
        padding: 6,
    },
    emojiChar: {
        fontSize: 22,
    },

    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderTopWidth: 1,
    },
    inputAvatar: {
        width: 34,
        height: 34,
        borderRadius: 17,
    },
    inputField: {
        flex: 1,
        height: 38,
        backgroundColor: Colors.background,
        borderRadius: 19,
        paddingHorizontal: 14,
        fontFamily: Fonts.regular,
        fontSize: 14,
        color: Colors.textPrimary,
    },
    sendBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
