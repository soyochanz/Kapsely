import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator, StatusBar, Modal, TextInput, Alert, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors, Fonts, Spacing, BorderRadius, Shadow } from '../theme';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SwipeableChatRow from '../components/SwipeableChatRow';

export default function ChatListScreen() {
    const [loading, setLoading] = useState(true);
    const [conversations, setConversations] = useState<any[]>([]);
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const channelRef = useRef<any>(null);

    const loadConversations = async (userId?: string) => {
        const uid = userId || currentUserId;
        if (!uid) return;

        // Load deleted chats timestamps
        const deletedKey = `deleted_chats_${uid}`;
        const existingDeleted = await AsyncStorage.getItem(deletedKey);
        let deletedStamps: Record<string, string> = {};
        if (existingDeleted) {
            try {
                const parsed = JSON.parse(existingDeleted);
                if (Array.isArray(parsed)) {
                    parsed.forEach((id: string) => { deletedStamps[id] = new Date().toISOString(); });
                } else {
                    deletedStamps = parsed;
                }
            } catch (e) {}
        }

        const { data, error } = await supabase
            .from('conversation_participants')
            .select(`
                conversation_id,
                conversations (
                    id,
                    last_message_at
                )
            `)
            .eq('user_id', uid);

        if (data) {
            // Filter locally deleted chats unless a new message has arrived
            const activeData = data.filter((c: any) => {
                const delTime = deletedStamps[c.conversation_id];
                if (!delTime) return true;
                
                if (c.conversations?.last_message_at) {
                    if (new Date(c.conversations.last_message_at).getTime() > new Date(delTime).getTime()) {
                        return true; // New message arrived, show chat again
                    }
                }
                return false;
            });

            const chats = await Promise.all(activeData.map(async (c: any) => {
                const { data: otherPartData } = await supabase
                    .from('conversation_participants')
                    .select('user_id')
                    .eq('conversation_id', c.conversation_id)
                    .neq('user_id', uid)
                    .maybeSingle();

                let otherUserProfile = null;
                if (otherPartData) {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', otherPartData.user_id)
                        .maybeSingle();
                    otherUserProfile = profile;
                }

                const { data: lastMsg } = await supabase
                    .from('messages')
                    .select('*')
                    .eq('conversation_id', c.conversation_id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                const lastVisitKey = `chat_visited_${c.conversation_id}`;
                const lastVisited = await AsyncStorage.getItem(lastVisitKey);
                let unreadCount = 0;

                if (lastMsg && lastMsg.sender_id !== uid) {
                    unreadCount = (!lastVisited || new Date(lastMsg.created_at).getTime() > new Date(lastVisited).getTime() + 2000) ? 1 : 0;
                }

                return {
                    ...c,
                    otherUser: otherUserProfile,
                    lastMessage: lastMsg,
                    unreadCount: unreadCount || 0,
                };
            }));

            const sorted = chats
                .filter(c => c.otherUser)
                .sort((a, b) => {
                    if ((b.unreadCount > 0 ? 1 : 0) !== (a.unreadCount > 0 ? 1 : 0)) {
                        return (b.unreadCount > 0 ? 1 : 0) - (a.unreadCount > 0 ? 1 : 0);
                    }
                    const aTime = a.lastMessage?.created_at || 0;
                    const bTime = b.lastMessage?.created_at || 0;
                    return new Date(bTime).getTime() - new Date(aTime).getTime();
                });

            setConversations(sorted);
        }
        setLoading(false);
    };

    useEffect(() => {
        const init = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            const user = session?.user;
            if (!user) return;
            setCurrentUserId(user.id);
            await loadConversations(user.id);

            channelRef.current = supabase
                .channel('chat_list_realtime')
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'messages',
                }, () => loadConversations(user.id))
                .subscribe();
        };
        init();

        return () => {
            if (channelRef.current) supabase.removeChannel(channelRef.current);
        };
    }, []);

    useFocusEffect(
        useCallback(() => {
            const refreshConversations = async () => {
                const { data: { session } } = await supabase.auth.getSession();
                const user = session?.user;
                if (user) {
                    await loadConversations(user.id);
                }
            };
            refreshConversations();
        }, [])
    );

    const searchUsers = async (query: string) => {
        setSearchQuery(query);
        if (query.length < 2) {
            setSearchResults([]);
            return;
        }
        setSearching(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
            .from('profiles')
            .select('*')
            .ilike('username', `%${query}%`)
            .neq('id', user.id)
            .limit(10);
        setSearchResults(data || []);
        setSearching(false);
    };

    const startChat = async (targetUser: any) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: userConvs } = await supabase
                .from('conversation_participants')
                .select('conversation_id')
                .eq('user_id', user.id);

            const convIds = (userConvs || []).map(c => c.conversation_id);
            let existing = null;
            if (convIds.length > 0) {
                const { data } = await supabase
                    .from('conversation_participants')
                    .select('conversation_id')
                    .in('conversation_id', convIds)
                    .eq('user_id', targetUser.id)
                    .maybeSingle();
                existing = data;
            }

            if (existing) {
                setShowSearch(false);
                navigation.navigate('ChatDetail', { conversationId: (existing as any).conversation_id });
            } else {
                const { data: newConv, error: convError } = await supabase.from('conversations').insert({
                    last_message_at: new Date().toISOString()
                }).select().single();

                if (convError) throw convError;
                if (newConv) {
                    const { error: partError } = await supabase.from('conversation_participants').insert([
                        { conversation_id: newConv.id, user_id: user.id },
                        { conversation_id: newConv.id, user_id: targetUser.id }
                    ]);
                    if (partError) throw partError;
                    setShowSearch(false);
                    navigation.navigate('ChatDetail', { conversationId: newConv.id });
                }
            }
        } catch (error: any) {
            console.error('Error starting chat:', error);
            Alert.alert('Error', 'Could not start conversation: ' + (error.message || 'Unknown error'));
        }
    };

    const handleDeleteConversation = async (conversationId: string) => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const uid = session?.user?.id;
            if (!uid) return;

            // 1. Update local state IMMEDIATELY
            setConversations(prev => prev.filter(c => c.conversation_id !== conversationId));

            // 2. Persist hidden status to AsyncStorage IMMEDIATELY
            const deletedKey = `deleted_chats_${uid}`;
            const existingDeleted = await AsyncStorage.getItem(deletedKey);
            let deletedStamps: Record<string, string> = {};
            if (existingDeleted) {
                try {
                    const parsed = JSON.parse(existingDeleted);
                    if (Array.isArray(parsed)) {
                        parsed.forEach((id: string) => { deletedStamps[id] = new Date().toISOString(); });
                    } else {
                        deletedStamps = parsed;
                    }
                } catch (e) {}
            }
            deletedStamps[conversationId] = new Date().toISOString();
            await AsyncStorage.setItem(deletedKey, JSON.stringify(deletedStamps));

            // 3. Mark as visited so unreadCount = 0
            await AsyncStorage.setItem(`chat_visited_${conversationId}`, new Date().toISOString());

            // We do NOT delete the participant record from Supabase.
            // This maintains standard chat app behaviour: if the other person texts again, the chat will reappear.
            // And it avoids destroying the chat for the other person since they query conversation_participants for their partner.
            
        } catch (error: any) {
            console.error('Error deleting chat:', error);
            Alert.alert('Error', 'An unexpected error occurred while deleting the chat.');
        }
    };


    const renderItem = ({ item }: any) => {
        return (
            <SwipeableChatRow
                item={item}
                onDelete={handleDeleteConversation}
                onPress={() => navigation.navigate('ChatDetail', { conversationId: item.conversation_id })}
                onAvatarPress={() => (navigation as any).navigate('UserProfile', { targetUserId: item.otherUser.id })}
            />
        );
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === 'ios' ? 10 : 0) }]}>
            <StatusBar barStyle="dark-content" />
            <View style={styles.header}>
                <View style={styles.headerContent}>
                    <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Messages</Text>
                    <TouchableOpacity activeOpacity={0.7} onPress={() => setShowSearch(true)} style={styles.newChatBtn}>
                        <Ionicons name="create-outline" size={24} color={Colors.primary} />
                    </TouchableOpacity>
                </View>
            </View>

            {loading ? (
                <View style={styles.centered}><ActivityIndicator color={Colors.primary} /></View>
            ) : (
                <FlatList
                    data={conversations}
                    keyExtractor={(item) => item.conversation_id}
                    renderItem={renderItem}
                    contentContainerStyle={styles.list}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Ionicons name="chatbubbles-outline" size={64} color={Colors.textMuted} />
                            <Text style={styles.emptyText}>No messages yet</Text>
                            <TouchableOpacity style={styles.startBtn} activeOpacity={0.8} onPress={() => setShowSearch(true)}>
                                <Text style={styles.startBtnText}>Start a conversation</Text>
                            </TouchableOpacity>
                        </View>
                    }
                />
            )}

            {/* Search Modal */}
            <Modal visible={showSearch} animationType="slide">
                <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
                    <View style={styles.searchHeader}>
                        <TouchableOpacity activeOpacity={0.7} onPress={() => setShowSearch(false)}>
                            <Ionicons name="close" size={28} color={Colors.textPrimary} />
                        </TouchableOpacity>
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search by username..."
                            placeholderTextColor={Colors.textMuted}
                            value={searchQuery}
                            onChangeText={searchUsers}
                            autoFocus
                        />
                    </View>
                    {searching ? (
                        <ActivityIndicator style={{ marginTop: 20 }} color={Colors.primary} />
                    ) : (
                        <FlatList
                            data={searchResults}
                            keyExtractor={(item) => item.id}
                            renderItem={({ item }) => (
                                <TouchableOpacity style={styles.userItem} activeOpacity={0.7} onPress={() => startChat(item)}>
                                    {item.avatar_url ? (
                                        <Image source={{ uri: item.avatar_url }} style={styles.userAvatar} />
                                    ) : (
                                        <View style={styles.userAvatarPlaceholder}>
                                            <Ionicons name="person" size={20} color={Colors.textMuted} />
                                        </View>
                                    )}
                                    <View>
                                        <Text style={styles.userName}>{item.display_name || item.username}</Text>
                                        <Text style={styles.userHandle}>@{item.username}</Text>
                                    </View>
                                </TouchableOpacity>
                            )}
                            ListEmptyComponent={
                                searchQuery.length > 1 ? (
                                    <Text style={styles.noResults}>No users found</Text>
                                ) : null
                            }
                        />
                    )}
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    header: { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
    headerContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, height: 60 },
    headerTitle: { fontSize: 18, fontFamily: Fonts.bold, color: Colors.textPrimary },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    newChatBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    list: { padding: Spacing.md },
    chatItem: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
        padding: Spacing.md, borderRadius: BorderRadius.lg, marginBottom: Spacing.sm,
        borderWidth: 1, borderColor: Colors.border, ...Shadow.subtle
    },
    chatItemUnread: {
        borderColor: Colors.primary + '40',
        backgroundColor: Colors.primary + '06',
    },
    avatarWrap: { position: 'relative', marginRight: Spacing.md },
    avatar: { width: 50, height: 50, borderRadius: 25 },
    avatarPlaceholder: { width: 50, height: 50, borderRadius: 25, backgroundColor: Colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
    unreadAvatarDot: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: Colors.primary,
        borderWidth: 2,
        borderColor: Colors.surface,
    },
    chatInfo: { flex: 1 },
    chatName: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.textPrimary },
    chatNameUnread: { fontFamily: Fonts.bold, color: Colors.textPrimary },
    lastMessage: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.textSecondary, marginTop: 2 },
    lastMessageUnread: { fontFamily: Fonts.semiBold, color: Colors.textPrimary },
    chatRight: { alignItems: 'flex-end', gap: 6 },
    chatTime: { fontSize: 11, fontFamily: Fonts.regular, color: Colors.textMuted },
    unreadBadge: {
        backgroundColor: Colors.primary,
        minWidth: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
    },
    unreadBadgeText: { color: '#fff', fontSize: 11, fontFamily: Fonts.bold },
    empty: { alignItems: 'center', justifyContent: 'center', marginTop: 100, gap: Spacing.md },
    emptyText: { fontSize: 16, fontFamily: Fonts.medium, color: Colors.textMuted },
    startBtn: { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, marginTop: 10 },
    startBtnText: { color: '#fff', fontFamily: Fonts.bold },
    modalContainer: { flex: 1, backgroundColor: Colors.background },
    searchHeader: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
    searchInput: { flex: 1, marginLeft: 15, fontSize: 16, fontFamily: Fonts.regular, color: Colors.textPrimary },
    userItem: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
    userAvatar: { width: 44, height: 44, borderRadius: 22, marginRight: Spacing.md },
    userAvatarPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.cardAlt, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
    userName: { fontSize: 16, fontFamily: Fonts.bold, color: Colors.textPrimary },
    userHandle: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.textMuted },
    noResults: { textAlign: 'center', marginTop: 30, color: Colors.textMuted, fontFamily: Fonts.medium },
});
