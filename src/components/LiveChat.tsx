import React, { useState, useEffect, useRef, useCallback, useImperativeHandle } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    ScrollView, Alert, Platform, ActivityIndicator, Animated,
    TouchableWithoutFeedback, Keyboard
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { Fonts, Shadow, Colors } from '../theme';
import { safetyService } from '../utils/safety';
import { LinearGradient } from 'expo-linear-gradient';
import VerifiedBadge from './VerifiedBadge';

export const EMOJI_CHANNEL = (capsuleId: string) => `capsule-emoji-${capsuleId}`;

const P = {
    bg: '#FFFFFF',
    surface: '#F8F6FF',
    surfaceAlt: '#F0EBFF',
    border: 'rgba(124,92,191,0.12)',
    borderStrong: 'rgba(124,92,191,0.25)',
    text: '#1A1330',
    textSec: 'rgba(26,19,48,0.75)',
    textMuted: 'rgba(26,19,48,0.4)',
    purple: '#7C5CBF',
    purpleLight: '#9B7DE0',
    rose: '#C06090',
};

interface ChatMessage {
    id: string;
    user_id: string;
    message: string;
    created_at: string;
    profiles?: { username: string; avatar_url: string | null; is_verified?: boolean; display_name?: string };
}

const REACTION_EMOJIS = ['❤️', '😂', '🔥', '🎉', '💯', '😍', '😲', '👏'];

export interface LiveChatRef {
    sendMessage: (text: string) => void;
    sendReaction: (emoji: string) => void;
}

interface LiveChatProps {
    capsuleId: string;
    tint: string;
    hideInput?: boolean;
    isOwner?: boolean;
    isNested?: boolean;
    onInteractionStart?: () => void;
    onInteractionEnd?: () => void;
}

const PulseDot = React.memo(({ color }: { color: string }) => {
    const pulseAnim = useRef(new Animated.Value(0.4)).current;
    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 0.4, duration: 900, useNativeDriver: true }),
            ])
        ).start();
    }, []);
    return <Animated.View style={[st.liveIndicator, { backgroundColor: color, opacity: pulseAnim }]} />;
});

const LiveChat = React.forwardRef<LiveChatRef, LiveChatProps>(
    ({ capsuleId, tint, hideInput, isOwner: ownerProp, isNested, onInteractionStart, onInteractionEnd }, ref) => {

        const { t } = useTranslation();

        const [messages, setMessages] = useState<ChatMessage[]>([]);
        const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
        const [loadingMore, setLoadingMore] = useState(false);
        const [hasMore, setHasMore] = useState(true);
        const [input, setInput] = useState('');
        const [userId, setUserId] = useState<string | null>(null);
        const [myProfile, setMyProfile] = useState<any>(null);
        const [isBanned, setIsBanned] = useState(false);
        const [isOwner, setIsOwner] = useState(ownerProp ?? false);
        const [showScrollBottom, setShowScrollBottom] = useState(false);
        const [uniqueUsersCount, setUniqueUsersCount] = useState(0);

        // ✅ ScrollView ref instead of FlatList
        const scrollViewRef = useRef<ScrollView>(null);

        const userIdRef = useRef<string | null>(null);
        const blockedRef = useRef<string[]>([]);
        const emojiChannelRef = useRef<any>(null);

        useEffect(() => { if (ownerProp !== undefined) setIsOwner(ownerProp); }, [ownerProp]);
        useEffect(() => { userIdRef.current = userId; }, [userId]);
        useEffect(() => { blockedRef.current = blockedUserIds; }, [blockedUserIds]);

        useEffect(() => {
            initUser();
            loadMessages();
            checkStatus();

            emojiChannelRef.current = supabase.channel(EMOJI_CHANNEL(capsuleId)).subscribe();

            const profileCache = new Map<string, any>();

            const msgChannel = supabase
                .channel(`capsule-chat-${capsuleId}`)
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'capsule_chat', filter: `capsule_id=eq.${capsuleId}` },
                    async (payload) => {
                        if (payload.eventType === 'INSERT') {
                            const newMsg = payload.new as ChatMessage;
                            if (blockedRef.current.includes(newMsg.user_id)) return;

                            setMessages(prev => {
                                if (prev.some(m => m.id === newMsg.id)) return prev;

                                if (newMsg.user_id === userIdRef.current) {
                                    const tempIdx = prev.findIndex(m => m.id.startsWith('temp-') && m.message === newMsg.message);
                                    if (tempIdx !== -1) {
                                        const updated = [...prev];
                                        updated[tempIdx] = { ...newMsg, profiles: prev[tempIdx].profiles };
                                        return updated;
                                    }
                                }

                                const cached = profileCache.get(newMsg.user_id);
                                if (cached) {
                                    setTimeout(() => {
                                        setMessages(curr => curr.map(m => m.id === newMsg.id ? { ...m, profiles: cached } : m));
                                    }, 0);
                                } else {
                                    supabase.from('profiles').select('username, avatar_url, is_verified').eq('id', newMsg.user_id).single().then(({ data }) => {
                                        if (data) {
                                            profileCache.set(newMsg.user_id, data);
                                            setMessages(curr => {
                                                if (curr.some(m => m.id === newMsg.id)) {
                                                    return curr.map(m => m.id === newMsg.id ? { ...m, profiles: data } : m);
                                                }
                                                return [...curr, { ...newMsg, profiles: data }];
                                            });
                                        }
                                    });
                                }
                                // ✅ Nuevos mensajes van al FINAL (no invertido como FlatList)
                                return [...prev, { ...newMsg }];
                            });

                            // ✅ Auto-scroll al fondo cuando llega mensaje nuevo
                            setTimeout(() => scrollToBottom(), 100);

                        } else if (payload.eventType === 'DELETE') {
                            setMessages(prev => prev.filter(m => m.id !== payload.old.id));
                        } else if (payload.eventType === 'UPDATE') {
                            const updatedMsg = payload.new as ChatMessage;
                            setMessages(prev => prev.map(m => m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m));
                        }
                    }
                ).subscribe();

            return () => {
                supabase.removeChannel(msgChannel);
                if (emojiChannelRef.current) supabase.removeChannel(emojiChannelRef.current);
            };
        }, [capsuleId]);

        useEffect(() => {
            const users = new Set(messages.map(m => m.user_id));
            if (userId && !users.has(userId)) users.add(userId);
            setUniqueUsersCount(users.size);
        }, [messages, userId]);

        const initUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setUserId(user.id);
                userIdRef.current = user.id;
                const { data } = await supabase.from('profiles').select('username, avatar_url, is_verified').eq('id', user.id).single();
                setMyProfile(data);
            }
        };

        const checkStatus = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data: capsule } = await supabase.from('capsules').select('owner_id').eq('id', capsuleId).single();
            if (capsule?.owner_id === user.id) setIsOwner(true);
            const { data: ban } = await supabase.from('capsule_chat_bans').select('id').eq('capsule_id', capsuleId).eq('target_user_id', user.id).maybeSingle();
            if (ban) setIsBanned(true);
        };

        const loadMessages = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            let blocked: string[] = [];
            if (user) {
                blocked = await safetyService.getAllSafetyUserIds(user.id);
                const { data: bans } = await supabase.from('capsule_chat_bans').select('target_user_id').eq('capsule_id', capsuleId);
                if (bans) blocked = Array.from(new Set([...blocked, ...bans.map(b => b.target_user_id)]));
                setBlockedUserIds(blocked);
                blockedRef.current = blocked;
            }
            const { data } = await supabase
                .from('capsule_chat')
                .select('*, profiles:user_id(username, avatar_url, is_verified)')
                .eq('capsule_id', capsuleId)
                // ✅ ascending: true para ScrollView normal (más nuevo abajo)
                .order('created_at', { ascending: true })
                .limit(40);
            if (data) {
                setMessages(data.filter(m => !blocked.includes(m.user_id)));
                setHasMore(data.length === 40);

                const { data: countData } = await supabase.rpc('get_capsule_chat_participant_count', { p_capsule_id: capsuleId });
                if (countData !== null) setUniqueUsersCount(countData);
                else {
                    const users = new Set(data.map(m => m.user_id));
                    setUniqueUsersCount(users.size);
                }

                // ✅ Scroll al fondo tras cargar mensajes iniciales
                setTimeout(() => scrollToBottom(), 150);
            }
        };

        const loadMore = async () => {
            if (loadingMore || !hasMore || messages.length === 0) return;
            setLoadingMore(true);
            const firstMsg = messages[0];
            const { data } = await supabase
                .from('capsule_chat')
                .select('*, profiles:user_id(username, avatar_url, is_verified)')
                .eq('capsule_id', capsuleId)
                // ✅ Cargar mensajes ANTERIORES al primero visible
                .lt('created_at', firstMsg.created_at)
                .order('created_at', { ascending: true })
                .limit(40);
            if (data && data.length > 0) {
                setMessages(prev => [...data.filter(m => !blockedRef.current.includes(m.user_id)), ...prev]);
                setHasMore(data.length === 40);
            } else {
                setHasMore(false);
            }
            setLoadingMore(false);
        };

        const sendInternalMessage = async (textOverride?: string) => {
            if (isBanned) { Alert.alert(t('common.error'), 'Chat resticted.'); return; }
            const text = (textOverride ?? input).trim();
            if (!text || !userIdRef.current) return;
            if (!textOverride) setInput('');

            const tempId = `temp-${Date.now()}`;
            const optimistic: ChatMessage = {
                id: tempId, user_id: userIdRef.current, message: text,
                created_at: new Date().toISOString(), profiles: myProfile ?? undefined,
            };
            // ✅ Mensajes nuevos van al final
            setMessages(prev => [...prev, optimistic]);
            scrollToBottom();

            try {
                const { data, error } = await supabase
                    .from('capsule_chat')
                    .insert({ capsule_id: capsuleId, user_id: userIdRef.current, message: text })
                    .select('*, profiles:user_id(username, avatar_url, is_verified)')
                    .single();
                if (data && !error) {
                    setMessages(prev => prev.map(m => m.id === tempId ? data : m));
                } else if (error) {
                    setMessages(prev => prev.filter(m => m.id !== tempId));
                    Alert.alert('Error', error.message);
                }
            } catch (err) {
                setMessages(prev => prev.filter(m => m.id !== tempId));
            }
        };

        const sendReaction = async (emoji: string) => {
            if (emojiChannelRef.current) {
                await emojiChannelRef.current.send({ type: 'broadcast', event: 'reaction', payload: { emoji } });
            }
        };

        const scrollToBottom = () => {
            scrollViewRef.current?.scrollToEnd({ animated: true });
            setShowScrollBottom(false);
        };

        useImperativeHandle(ref, () => ({
            sendMessage: (text: string) => sendInternalMessage(text),
            sendReaction: (emoji: string) => sendReaction(emoji),
        }));

        const handleReportMessage = useCallback(async (msg: ChatMessage) => {
            if (!userId) return;
            Alert.alert(t('detail.report_message'), t('detail.report_reason'), [
                { text: t('detail.report_types.inappropriate'), onPress: async () => {
                    await safetyService.report({ reporterId: userId, targetId: msg.id, targetType: 'capsule_chat', reason: 'inappropriate' });
                    Alert.alert(t('common.ready'), t('detail.report_submitted'));
                }},
                { text: t('detail.report_types.spam'), onPress: async () => {
                    await safetyService.report({ reporterId: userId, targetId: msg.id, targetType: 'capsule_chat', reason: 'spam' });
                    Alert.alert(t('common.ready'), t('detail.report_submitted'));
                }},
                { text: t('common.cancel'), style: 'cancel' }
            ]);
        }, [userId, t]);

        const handleMessageOptions = useCallback((msg: ChatMessage) => {
            const isMe = msg.user_id === userId;
            const options: any[] = [];
            if (isMe) {
                options.push({
                    text: t('common.delete'), style: 'destructive', onPress: async () => {
                        const { error } = await supabase.from('capsule_chat').update({ message: '!!DELETED_FOR_ALL!!' }).eq('id', msg.id);
                        if (!error) setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, message: '!!DELETED_FOR_ALL!!' } : m));
                    }
                });
            } else {
                options.push({ text: t('common.report'), onPress: () => handleReportMessage(msg) });
                if (isOwner) options.push({
                    text: t('detail.block_user'), style: 'destructive', onPress: async () => {
                        await supabase.from('capsule_chat_bans').insert({ capsule_id: capsuleId, target_user_id: msg.user_id, banned_by: userId });
                        await supabase.from('capsule_chat').delete().eq('capsule_id', capsuleId).eq('user_id', msg.user_id);
                        setMessages(prev => prev.filter(m => m.user_id !== msg.user_id));
                    }
                });
            }
            options.push({ text: t('common.cancel'), style: 'cancel' });
            Alert.alert(t('detail.message_options'), '', options);
        }, [userId, isOwner, capsuleId, t, handleReportMessage]);

        const onScroll = (e: any) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;

            // ✅ Lógica invertida: mostrar botón si NO está cerca del fondo
            if (distanceFromBottom > 200) setShowScrollBottom(true);
            else setShowScrollBottom(false);

            // ✅ Cargar más mensajes al llegar al tope superior
            if (contentOffset.y < 40 && hasMore && !loadingMore) {
                loadMore();
            }
        };

        const renderMessage = useCallback((item: ChatMessage) => {
            const isSystem = item.message.startsWith('!!system:');
            const cleanMsg = isSystem ? item.message.replace('!!system:', '') : item.message;
            const isMe = item.user_id === userId;

            if (item.message === '!!DELETED_FOR_ALL!!') {
                if (isMe) return null;
                return (
                    <View key={item.id} style={st.msgContainer}>
                        <Image
                            source={{ uri: Colors.getAvatarUrl(item.profiles?.avatar_url, item.profiles?.display_name || item.profiles?.username) }}
                            style={[st.msgAvatar, { opacity: 0.5 }]}
                            cachePolicy="memory-disk"
                        />
                        <View style={st.msgBody}>
                            <View style={[st.msgBubble, { backgroundColor: P.surface, borderColor: P.border, borderStyle: 'dashed' }]}>
                                <Text style={[st.msgText, { color: P.textMuted, fontStyle: 'italic', fontSize: 13 }]}>
                                    Mensaje eliminado
                                </Text>
                            </View>
                        </View>
                    </View>
                );
            }

            return (
                <TouchableOpacity
                    key={item.id}
                    activeOpacity={0.7}
                    onLongPress={() => handleMessageOptions(item)}
                    style={st.msgContainer}
                >
                    <Image
                        source={{ uri: Colors.getAvatarUrl(item.profiles?.avatar_url, item.profiles?.display_name || item.profiles?.username) }}
                        style={st.msgAvatar}
                        cachePolicy="memory-disk"
                    />
                    <View style={st.msgBody}>
                        <View style={st.msgMeta}>
                            <Text style={[st.msgUsername, { color: isMe ? tint : P.purpleLight }]}>
                                {item.profiles?.username || 'user'}
                            </Text>
                            {item.profiles?.is_verified && <VerifiedBadge size={10} style={{ marginLeft: 2, marginTop: 1 }} />}
                            <Text style={st.msgTime}>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                        </View>
                        <View style={[st.msgBubble, isMe && { backgroundColor: tint + '22', borderColor: tint + '40' }]}>
                            <Text style={[st.msgText, isSystem && st.systemText]}>{cleanMsg}</Text>
                        </View>
                    </View>
                </TouchableOpacity>
            );
        }, [tint, userId, handleMessageOptions]);

        return (
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={[st.root, isNested && st.nestedRoot]}>
                    {/* Header */}
                    <View style={st.headerOuter}>
                        <View style={st.header}>
                            <View style={st.headerLeft}>
                                <PulseDot color={tint} />
                                <Text style={[st.headerTitle, { color: tint }]}>CHAT EN VIVO</Text>
                            </View>
                            <View />
                        </View>
                        <View style={[st.headerLine, { backgroundColor: tint + '15' }]} />
                    </View>

                    {/* ✅ ScrollView normal en lugar de FlatList — elimina el warning de VirtualizedLists anidados */}
                    <View
                        style={{ flex: 1, minHeight: 0 }}
                        onTouchStart={() => onInteractionStart?.()}
                        onTouchEnd={() => onInteractionEnd?.()}
                        onTouchCancel={() => onInteractionEnd?.()}
                    >
                        <ScrollView
                            ref={scrollViewRef}
                            style={st.flatList}
                            contentContainerStyle={st.listContent}
                            onScroll={onScroll}
                            scrollEventThrottle={16}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                        >
                            {/* Indicador de carga de mensajes anteriores */}
                            {loadingMore && (
                                <ActivityIndicator size="small" color={tint} style={{ marginVertical: 10 }} />
                            )}

                            {/* ✅ Render directo con map — sin VirtualizedList */}
                            {messages.map(msg => renderMessage(msg))}
                        </ScrollView>

                        {showScrollBottom && (
                            <TouchableOpacity style={[st.scrollBottomBtn, { backgroundColor: tint }]} onPress={scrollToBottom}>
                                <Ionicons name="arrow-down" size={16} color="#fff" />
                                <Text style={st.scrollBottomText}>Recientes</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {!hideInput && (
                        <View style={st.inputSection}>
                            <View style={st.emojiBar}>
                                {REACTION_EMOJIS.map(e => (
                                    <TouchableOpacity key={e} onPress={() => sendReaction(e)} style={[st.emojiTick, { backgroundColor: tint + '18' }]}>
                                        <Text style={{ fontSize: 20 }}>{e}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <View style={st.inputWrapper}>
                                <TextInput
                                    style={[st.input, { borderColor: input ? tint + '60' : P.border }]}
                                    placeholder="Di algo..."
                                    placeholderTextColor={P.textMuted}
                                    value={input}
                                    onChangeText={setInput}
                                    onSubmitEditing={() => sendInternalMessage()}
                                    returnKeyType="send"
                                    selectionColor={tint}
                                />
                                <TouchableOpacity onPress={() => sendInternalMessage()} style={[st.sendBtn]}>
                                    <LinearGradient colors={[tint, P.rose]} style={st.sendBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                                        <Ionicons name="send" size={15} color="#fff" />
                                    </LinearGradient>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                </View>
            </TouchableWithoutFeedback>
        );
    }
);

export default LiveChat;

const st = StyleSheet.create({
    root: {
        height: 520,
        backgroundColor: P.bg,
        borderRadius: 24,
        marginHorizontal: 16,
        marginVertical: 12,
        overflow: 'hidden',
        borderWidth: 1.5,
        borderColor: P.borderStrong,
    },
    nestedRoot: {
        marginHorizontal: 0,
        backgroundColor: P.bg,
        borderWidth: 0,
        borderRadius: 0,
        height: 480,
    },
    headerOuter: {
        backgroundColor: '#FFFFFF',
        zIndex: 10,
        ...Shadow.subtle,
    },
    headerLine: {
        height: 1.5,
        width: '100%',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    headerTitle: {
        fontSize: 12,
        fontFamily: Fonts.bold,
        letterSpacing: 2.2,
        paddingTop: 1,
    },
    liveIndicator: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    viewerBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 14,
        borderWidth: 1.2,
    },
    viewerCount: {
        fontSize: 11,
        fontFamily: Fonts.bold,
    },
    callBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.8)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(124,92,191,0.12)',
    },
    flatList: {
        flex: 1,
    },
    listContent: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        flexGrow: 1,
    },
    msgContainer: {
        flexDirection: 'row',
        paddingVertical: 6,
        alignItems: 'flex-start',
    },
    msgAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        marginRight: 10,
        borderWidth: 1.5,
        borderColor: P.border,
    },
    msgBody: {
        flex: 1,
    },
    msgMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 3,
        gap: 5,
    },
    msgUsername: {
        fontSize: 12,
        fontFamily: Fonts.bold,
    },
    msgTime: {
        fontSize: 10,
        color: P.textMuted,
        fontFamily: Fonts.regular,
        marginLeft: 2,
    },
    msgBubble: {
        backgroundColor: P.surfaceAlt,
        borderRadius: 12,
        borderTopLeftRadius: 4,
        paddingHorizontal: 12,
        paddingVertical: 7,
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: P.border,
    },
    msgText: {
        fontSize: 14,
        color: P.text,
        lineHeight: 20,
        fontFamily: Fonts.regular,
    },
    systemText: {
        color: '#7C5CBF',
        fontStyle: 'italic',
        fontSize: 13,
    },
    scrollBottomBtn: {
        position: 'absolute',
        bottom: 12,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 20,
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 6,
    },
    scrollBottomText: {
        color: '#fff',
        fontSize: 12,
        fontFamily: Fonts.bold,
    },
    inputSection: {
        borderTopWidth: 1,
        borderTopColor: P.borderStrong,
        backgroundColor: P.surface,
        paddingBottom: Platform.OS === 'ios' ? 20 : 10,
    },
    emojiBar: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: P.border,
    },
    emojiTick: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingTop: 10,
        gap: 10,
    },
    input: {
        flex: 1,
        height: 42,
        backgroundColor: P.surfaceAlt,
        borderRadius: 21,
        paddingHorizontal: 16,
        color: P.text,
        fontFamily: Fonts.medium,
        fontSize: 14,
        borderWidth: 1.5,
    },
    sendBtn: {
        width: 42,
        height: 42,
        borderRadius: 21,
        overflow: 'hidden',
    },
    sendBtnGrad: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
});