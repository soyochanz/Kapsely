import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator,
    StatusBar, Modal, TextInput, Alert, Platform, ScrollView
} from 'react-native';
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

    // Group creation states
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [groupSearchQuery, setGroupSearchQuery] = useState('');
    const [groupSearchResults, setGroupSearchResults] = useState<any[]>([]);
    const [groupSearching, setGroupSearching] = useState(false);
    const [selectedUsers, setSelectedUsers] = useState<any[]>([]);
    const [groupName, setGroupName] = useState('');

    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [startingChatId, setStartingChatId] = useState<string | null>(null);
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const channelRef = useRef<any>(null);

    // In-memory set of deleted conversation IDs so the realtime callback also respects it
    const deletedConvIdsRef = useRef<Set<string>>(new Set());

    const loadConversations = async (userId?: string) => {
        const uid = userId || currentUserId;
        if (!uid) return;

        // Load deleted chat timestamps from AsyncStorage
        const deletedKey = `deleted_chats_${uid}`;
        const existingDeleted = await AsyncStorage.getItem(deletedKey);
        let deletedStamps: Record<string, string> = {};
        if (existingDeleted) {
            try {
                const parsed = JSON.parse(existingDeleted);
                if (Array.isArray(parsed)) {
                    parsed.forEach((id: string) => { deletedStamps[id] = new Date(0).toISOString(); });
                } else {
                    deletedStamps = parsed;
                }
            } catch (e) {}
        }
        // Sync in-memory ref with persisted storage
        deletedConvIdsRef.current = new Set(Object.keys(deletedStamps));

        const { data: myConvs, error: convError } = await supabase
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', uid);

        if (convError || !myConvs) { setLoading(false); return; }
        const convIds = myConvs.map(c => c.conversation_id);
        if (convIds.length === 0) { setConversations([]); setLoading(false); return; }

        const [partsRes, lastMsgsRes, convsRes] = await Promise.all([
            supabase.from('conversation_participants').select('conversation_id, user_id').in('conversation_id', convIds).neq('user_id', uid),
            supabase.from('messages').select('conversation_id, content, created_at, sender_id, is_read').in('conversation_id', convIds).order('created_at', { ascending: false }),
            supabase.from('conversations').select('id, last_message_at, is_group, name, avatar_url').in('id', convIds)
        ]);

        const otherUserIdMap: Record<string, string> = {};
        (partsRes.data || []).forEach(p => {
            if (!otherUserIdMap[p.conversation_id]) otherUserIdMap[p.conversation_id] = p.user_id;
        });

        const otherUserIds = Object.values(otherUserIdMap);
        let profiles: any[] = [];
        if (otherUserIds.length > 0) {
            const { data: profs } = await supabase.from('profiles').select('id, username, avatar_url, display_name').in('id', otherUserIds);
            profiles = profs || [];
        }

        const latestMsgMap: Record<string, any> = {};
        (lastMsgsRes.data || []).forEach(m => { if (!latestMsgMap[m.conversation_id]) latestMsgMap[m.conversation_id] = m; });

        const convsMap: Record<string, any> = {};
        (convsRes.data || []).forEach(c => convsMap[c.id] = c);

        const chats = await Promise.all(convIds.map(async (cId) => {
            const conv = convsMap[cId];
            const lastMsg = latestMsgMap[cId];
            const lastMsgAt = conv?.last_message_at;
            const delTime = deletedStamps[cId];

            // If deleted, hide unless there's a NEW message AFTER the deletion timestamp
            if (delTime && (!lastMsgAt || new Date(lastMsgAt).getTime() <= new Date(delTime).getTime())) {
                return null;
            }

            const otherUserId = otherUserIdMap[cId];
            const otherUserProfile = profiles.find(p => p.id === otherUserId);

            let unreadCount = 0;
            if (lastMsg && lastMsg.sender_id !== uid && !lastMsg.is_read) {
                unreadCount = 1;
            }

            return {
                conversation_id: cId,
                otherUser: conv?.is_group
                    ? { display_name: conv.name || 'Grupo', avatar_url: conv.avatar_url }
                    : (otherUserProfile || { display_name: 'Usuario' }),
                lastMessage: lastMsg,
                unreadCount: unreadCount || 0,
                is_group: conv?.is_group || false,
            };
        }));

        const activeChats = chats.filter(c => c !== null && c.otherUser);
        const sorted = activeChats.sort((a: any, b: any) => {
            if ((b.unreadCount > 0 ? 1 : 0) !== (a.unreadCount > 0 ? 1 : 0)) {
                return (b.unreadCount > 0 ? 1 : 0) - (a.unreadCount > 0 ? 1 : 0);
            }
            const aTime = a.lastMessage?.created_at || 0;
            const bTime = b.lastMessage?.created_at || 0;
            return new Date(bTime).getTime() - new Date(aTime).getTime();
        });

        setConversations(sorted);
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
                }, (payload: any) => {
                    const msg = payload.new as any;
                    // If a new message arrives for a deleted conversation, remove the deletion stamp
                    // so the conversation reappears (Instagram-like: only show if someone sends a new msg)
                    if (msg?.conversation_id && deletedConvIdsRef.current.has(msg.conversation_id)) {
                        // A new message arrived — we load fresh, the stamp check will re-surface it
                    }
                    loadConversations(user.id);
                })
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

    /* ─── Direct message search ─── */
    const searchUsers = async (query: string) => {
        setSearchQuery(query);
        if (query.length < 2) { setSearchResults([]); return; }
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

    /* ─── Group user search ─── */
    const searchGroupUsers = async (query: string) => {
        setGroupSearchQuery(query);
        if (query.length < 2) { setGroupSearchResults([]); return; }
        setGroupSearching(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
            .from('profiles')
            .select('*')
            .ilike('username', `%${query}%`)
            .neq('id', user.id)
            .limit(10);
        setGroupSearchResults(data || []);
        setGroupSearching(false);
    };

    const toggleGroupUser = (user: any) => {
        setSelectedUsers(prev =>
            prev.some(u => u.id === user.id) ? prev.filter(u => u.id !== user.id) : [...prev, user]
        );
    };

    /* ─── Start a PRIVATE chat (never opens a group) ─── */
    const startChat = async (targetUser: any) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setStartingChatId(targetUser.id);

            // Look for an existing PRIVATE (non-group) conversation between these two users
            const { data: myParts } = await supabase
                .from('conversation_participants')
                .select('conversation_id')
                .eq('user_id', user.id);

            const { data: theirParts } = await supabase
                .from('conversation_participants')
                .select('conversation_id')
                .eq('user_id', targetUser.id);

            const myIds = new Set((myParts || []).map((p: any) => p.conversation_id));
            const commonIds = (theirParts || []).map((p: any) => p.conversation_id).filter((id: string) => myIds.has(id));

            let privateConvId: string | null = null;
            if (commonIds.length > 0) {
                const { data: convs } = await supabase
                    .from('conversations')
                    .select('id, is_group')
                    .in('id', commonIds)
                    .eq('is_group', false);
                if (convs && convs.length > 0) privateConvId = convs[0].id;
            }

            setShowSearch(false);
            setSearchQuery('');
            setSearchResults([]);

            if (privateConvId) {
                navigation.navigate('ChatDetail', { conversationId: privateConvId });
            } else {
                navigation.navigate('ChatDetail', { conversationId: 'new', otherUser: targetUser });
            }
        } catch (error: any) {
            Alert.alert('Error', 'No se pudo iniciar la conversación: ' + (error.message || ''));
        } finally {
            setStartingChatId(null);
        }
    };

    /* ─── Create group ─── */
    const createGroup = async () => {
        if (selectedUsers.length === 0) return;
        const nameToUse = groupName.trim() || `Grupo ${selectedUsers.map(u => u.display_name || u.username).join(', ')}`;
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setStartingChatId('group');

            const { data: conv, error: convError } = await supabase
                .from('conversations')
                .insert({ is_group: true, name: nameToUse.substring(0, 100) })
                .select()
                .single();

            if (convError || !conv) throw convError;

            const pData = [
                ...selectedUsers.map(u => ({ conversation_id: conv.id, user_id: u.id })),
                { conversation_id: conv.id, user_id: user.id },
            ];
            const { error: partError } = await supabase.from('conversation_participants').insert(pData);
            if (partError) throw partError;

            closeGroupModal();
            navigation.navigate('ChatDetail', { conversationId: conv.id });
        } catch (error: any) {
            Alert.alert('Error', 'No se pudo crear el grupo: ' + error.message);
        } finally {
            setStartingChatId(null);
        }
    };

    const closeGroupModal = () => {
        setShowGroupModal(false);
        setGroupName('');
        setGroupSearchQuery('');
        setGroupSearchResults([]);
        setSelectedUsers([]);
    };

    /* ─── Delete / hide conversation ─── */
    const handleDeleteConversation = async (conversationId: string) => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const uid = session?.user?.id;
            if (!uid) return;

            // 1. Remove from UI immediately
            setConversations(prev => prev.filter(c => c.conversation_id !== conversationId));

            // 2. Mark in-memory ref immediately so realtime callback respects it
            deletedConvIdsRef.current.add(conversationId);

            // 3. Persist the deletion timestamp
            const deletedKey = `deleted_chats_${uid}`;
            const existingDeleted = await AsyncStorage.getItem(deletedKey);
            let deletedStamps: Record<string, string> = {};
            if (existingDeleted) {
                try {
                    const parsed = JSON.parse(existingDeleted);
                    if (Array.isArray(parsed)) {
                        parsed.forEach((id: string) => { deletedStamps[id] = new Date(0).toISOString(); });
                    } else {
                        deletedStamps = parsed;
                    }
                } catch (e) {}
            }
            // Store current time so it only shows again if a message AFTER this time arrives
            deletedStamps[conversationId] = new Date().toISOString();
            await AsyncStorage.setItem(deletedKey, JSON.stringify(deletedStamps));
        } catch (error: any) {
            Alert.alert('Error', 'No se pudo eliminar el chat.');
        }
    };

    const renderItem = ({ item }: any) => (
        <SwipeableChatRow
            item={item}
            onDelete={handleDeleteConversation}
            onPress={() => navigation.navigate('ChatDetail', { conversationId: item.conversation_id })}
            onAvatarPress={() => !item.is_group && (navigation as any).navigate('UserProfile', { targetUserId: item.otherUser.id })}
        />
    );

    return (
        <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === 'ios' ? 10 : 0) }]}>
            <StatusBar barStyle="dark-content" />
            <View style={styles.header}>
                <View style={styles.headerContent}>
                    <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Messages</Text>
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                        <TouchableOpacity activeOpacity={0.7} onPress={() => setShowGroupModal(true)} style={styles.newChatBtn}>
                            <Ionicons name="people-outline" size={22} color={Colors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity activeOpacity={0.7} onPress={() => setShowSearch(true)} style={styles.newChatBtn}>
                            <Ionicons name="create-outline" size={22} color={Colors.primary} />
                        </TouchableOpacity>
                    </View>
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

            {/* ── Direct Message Search Modal ── */}
            <Modal visible={showSearch} animationType="slide">
                <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
                    <View style={styles.searchHeader}>
                        <TouchableOpacity activeOpacity={0.7} onPress={() => {
                            setShowSearch(false);
                            setSearchQuery('');
                            setSearchResults([]);
                        }}>
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
                                <TouchableOpacity
                                    style={styles.userItem}
                                    activeOpacity={0.7}
                                    onPress={() => startChat(item)}
                                    disabled={!!startingChatId}
                                >
                                    {item.avatar_url ? (
                                        <Image source={{ uri: item.avatar_url }} style={styles.userAvatar} />
                                    ) : (
                                        <View style={styles.userAvatarPlaceholder}>
                                            <Ionicons name="person" size={20} color={Colors.textMuted} />
                                        </View>
                                    )}
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.userName}>{item.display_name || item.username}</Text>
                                        <Text style={styles.userHandle}>@{item.username}</Text>
                                    </View>
                                    {startingChatId === item.id && (
                                        <ActivityIndicator size="small" color={Colors.primary} />
                                    )}
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

            {/* ── Create Group Modal ── */}
            <Modal visible={showGroupModal} animationType="slide">
                <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
                    {/* Header */}
                    <View style={styles.searchHeader}>
                        <TouchableOpacity activeOpacity={0.7} onPress={closeGroupModal}>
                            <Ionicons name="close" size={28} color={Colors.textPrimary} />
                        </TouchableOpacity>
                        <Text style={{ flex: 1, marginLeft: 12, fontSize: 17, fontFamily: Fonts.bold, color: Colors.textPrimary }}>
                            Nuevo Grupo
                        </Text>
                        {selectedUsers.length > 0 && (
                            <TouchableOpacity
                                style={styles.groupToggleBtn}
                                onPress={createGroup}
                                disabled={startingChatId === 'group'}
                            >
                                {startingChatId === 'group'
                                    ? <ActivityIndicator size="small" color={Colors.primary} />
                                    : <Text style={styles.groupToggleText}>Crear ({selectedUsers.length})</Text>}
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Group name field */}
                    <View style={styles.groupNameRow}>
                        <Ionicons name="camera-outline" size={20} color={Colors.textMuted} style={{ marginRight: 10 }} />
                        <TextInput
                            style={styles.groupNameInput}
                            placeholder="Nombre del grupo (opcional)"
                            placeholderTextColor={Colors.textMuted}
                            value={groupName}
                            onChangeText={setGroupName}
                        />
                    </View>

                    {/* Selected users chips */}
                    {selectedUsers.length > 0 && (
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.chipsScroll}
                            contentContainerStyle={{ paddingHorizontal: Spacing.md, gap: 8 }}
                        >
                            {selectedUsers.map(u => (
                                <TouchableOpacity
                                    key={u.id}
                                    style={styles.chip}
                                    onPress={() => toggleGroupUser(u)}
                                    activeOpacity={0.7}
                                >
                                    {u.avatar_url
                                        ? <Image source={{ uri: u.avatar_url }} style={styles.chipAvatar} />
                                        : <View style={[styles.chipAvatar, { backgroundColor: Colors.cardAlt, alignItems: 'center', justifyContent: 'center' }]}>
                                            <Ionicons name="person" size={12} color={Colors.textMuted} />
                                        </View>}
                                    <Text style={styles.chipName} numberOfLines={1}>{u.display_name || u.username}</Text>
                                    <Ionicons name="close-circle" size={14} color={Colors.textMuted} />
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    )}

                    {/* User search */}
                    <View style={styles.groupSearchRow}>
                        <Ionicons name="search-outline" size={18} color={Colors.textMuted} style={{ marginRight: 8 }} />
                        <TextInput
                            style={{ flex: 1, fontSize: 15, fontFamily: Fonts.regular, color: Colors.textPrimary }}
                            placeholder="Buscar usuarios..."
                            placeholderTextColor={Colors.textMuted}
                            value={groupSearchQuery}
                            onChangeText={searchGroupUsers}
                        />
                    </View>

                    {groupSearching ? (
                        <ActivityIndicator style={{ marginTop: 20 }} color={Colors.primary} />
                    ) : (
                        <FlatList
                            data={groupSearchResults}
                            keyExtractor={(item) => item.id}
                            renderItem={({ item }) => {
                                const isSelected = selectedUsers.some(u => u.id === item.id);
                                return (
                                    <TouchableOpacity
                                        style={styles.userItem}
                                        activeOpacity={0.7}
                                        onPress={() => toggleGroupUser(item)}
                                    >
                                        {item.avatar_url ? (
                                            <Image source={{ uri: item.avatar_url }} style={styles.userAvatar} />
                                        ) : (
                                            <View style={styles.userAvatarPlaceholder}>
                                                <Ionicons name="person" size={20} color={Colors.textMuted} />
                                            </View>
                                        )}
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.userName}>{item.display_name || item.username}</Text>
                                            <Text style={styles.userHandle}>@{item.username}</Text>
                                        </View>
                                        <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                                            {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                                        </View>
                                    </TouchableOpacity>
                                );
                            }}
                            ListEmptyComponent={
                                groupSearchQuery.length > 1 ? (
                                    <Text style={styles.noResults}>No users found</Text>
                                ) : (
                                    <Text style={styles.noResults}>Busca por nombre de usuario</Text>
                                )
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
    headerTitle: { fontSize: 18, fontFamily: Fonts.bold, color: Colors.textPrimary, flex: 1, marginLeft: 8 },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    newChatBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    list: { padding: Spacing.md },
    empty: { alignItems: 'center', justifyContent: 'center', marginTop: 100, gap: Spacing.md },
    emptyText: { fontSize: 16, fontFamily: Fonts.medium, color: Colors.textMuted },
    startBtn: { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, marginTop: 10 },
    startBtnText: { color: '#fff', fontFamily: Fonts.bold },

    // Modals
    modalContainer: { flex: 1, backgroundColor: Colors.background },
    searchHeader: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
    searchInput: { flex: 1, marginLeft: 15, fontSize: 16, fontFamily: Fonts.regular, color: Colors.textPrimary },

    // Group
    groupToggleBtn: { backgroundColor: Colors.primary + '15', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
    groupToggleText: { color: Colors.primary, fontFamily: Fonts.bold, fontSize: 13 },
    groupNameRow: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: Spacing.md, paddingVertical: 12,
        borderBottomWidth: 0.5, borderBottomColor: Colors.border,
    },
    groupNameInput: { flex: 1, fontSize: 15, fontFamily: Fonts.regular, color: Colors.textPrimary },
    chipsScroll: { maxHeight: 60, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
    chip: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: Colors.primary + '15',
        borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4,
    },
    chipAvatar: { width: 22, height: 22, borderRadius: 11 },
    chipName: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.primary, maxWidth: 70 },
    groupSearchRow: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: Spacing.md, paddingVertical: 10,
        borderBottomWidth: 0.5, borderBottomColor: Colors.border,
        backgroundColor: Colors.cardAlt,
    },

    // User list
    userItem: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
    userAvatar: { width: 44, height: 44, borderRadius: 22, marginRight: Spacing.md },
    userAvatarPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.cardAlt, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
    userName: { fontSize: 16, fontFamily: Fonts.bold, color: Colors.textPrimary },
    userHandle: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.textMuted },
    checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.textMuted, alignItems: 'center', justifyContent: 'center' },
    checkboxActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    noResults: { textAlign: 'center', marginTop: 30, color: Colors.textMuted, fontFamily: Fonts.medium },

    // Legacy (kept for SwipeableChatRow compat)
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
        position: 'absolute', bottom: 0, right: 0,
        width: 12, height: 12, borderRadius: 6,
        backgroundColor: Colors.primary, borderWidth: 2, borderColor: Colors.surface,
    },
    chatInfo: { flex: 1 },
    chatName: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.textPrimary },
    chatNameUnread: { fontFamily: Fonts.bold, color: Colors.textPrimary },
    lastMessage: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.textSecondary, marginTop: 2 },
    lastMessageUnread: { fontFamily: Fonts.semiBold, color: Colors.textPrimary },
    chatRight: { alignItems: 'flex-end', gap: 6 },
    chatTime: { fontSize: 11, fontFamily: Fonts.regular, color: Colors.textMuted },
    unreadBadge: {
        backgroundColor: Colors.primary, minWidth: 20, height: 20,
        borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
    },
    unreadBadgeText: { color: '#fff', fontSize: 11, fontFamily: Fonts.bold },
});
