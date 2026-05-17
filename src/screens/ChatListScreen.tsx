import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
    StatusBar, Modal, TextInput, Alert, Platform, ScrollView
} from 'react-native';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';

const AnyFlashList = FlashList as any;
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Colors, Fonts, Spacing, BorderRadius, Shadow } from '../theme';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SwipeableChatRow from '../components/SwipeableChatRow';

export default function ChatListScreen() {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [conversations, setConversations] = useState<any[]>([]);
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);
    const [archivedConvIds, setArchivedConvIds] = useState<string[]>([]);
    const [showArchived, setShowArchived] = useState(false);

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
    const loadInFlightRef = useRef(false);
    const lastLoadAtRef = useRef(0);
    const realtimeRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // In-memory set of deleted conversation IDs so the realtime callback also respects it
    const deletedConvIdsRef = useRef<Set<string>>(new Set());

    const loadConversations = async (userId?: string) => {
        const uid = userId || currentUserId;
        if (!uid) return;
        if (loadInFlightRef.current) return;
        loadInFlightRef.current = true;

        try {
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

            const { data: rpcData, error: rpcError } = await supabase.rpc('get_chat_list_data');
            if (!rpcError && rpcData?.chats) {
                const activeChats = (rpcData.chats || [])
                    .map((chat: any) => {
                        const lastMsgTimeStr = chat.last_message?.created_at || chat.sort_at;
                        const delTime = deletedStamps[chat.conversation_id];
                        if (delTime && lastMsgTimeStr && new Date(lastMsgTimeStr).getTime() <= new Date(delTime).getTime()) {
                            return null;
                        }
                        return {
                            conversation_id: chat.conversation_id,
                            otherUser: chat.other_user || { display_name: t('chat.user_fallback') },
                            lastMessage: chat.last_message,
                            unreadCount: chat.unread_count || 0,
                            is_group: chat.is_group || false,
                        };
                    })
                    .filter(Boolean);

                setConversations(activeChats);
                setLoading(false);
                lastLoadAtRef.current = Date.now();
                return;
            }

        const { data: myConvs, error: convError } = await supabase
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', uid);

        if (convError || !myConvs) { setLoading(false); return; }
        const convIds = myConvs.map(c => c.conversation_id);
        if (convIds.length === 0) { setConversations([]); setLoading(false); return; }

        const [partsRes, lastMsgsRes, convsRes] = await Promise.all([
            supabase.from('conversation_participants').select('conversation_id, user_id').in('conversation_id', convIds).neq('user_id', uid),
            supabase.from('messages').select('conversation_id, content, created_at, sender_id, is_read, media_type').in('conversation_id', convIds).order('created_at', { ascending: false }),
            supabase.from('conversations').select('id, last_message_at, is_group, name, avatar_url').in('id', convIds)
        ]);

        const otherUserIdMap: Record<string, string> = {};
        (partsRes.data || []).forEach(p => {
            if (!otherUserIdMap[p.conversation_id]) otherUserIdMap[p.conversation_id] = p.user_id;
        });

        const otherUserIds = Object.values(otherUserIdMap);
        let profiles: any[] = [];
        if (otherUserIds.length > 0) {
            const { data: profs } = await supabase.from('profiles').select('id, username, avatar_url, display_name, favorite_color').in('id', otherUserIds);
            profiles = profs || [];
        }

        const latestMsgMap: Record<string, any> = {};
        (lastMsgsRes.data || []).forEach(m => { if (!latestMsgMap[m.conversation_id]) latestMsgMap[m.conversation_id] = m; });

        const convsMap: Record<string, any> = {};
        (convsRes.data || []).forEach(c => convsMap[c.id] = c);

        const chats = await Promise.all(convIds.map(async (cId) => {
            const conv = convsMap[cId];
            const lastMsg = latestMsgMap[cId];
            const delTime = deletedStamps[cId];

            const lastMsgTimeStr = lastMsg?.created_at || conv?.last_message_at;
            if (delTime && lastMsgTimeStr) {
                const lastMsgTime = new Date(lastMsgTimeStr).getTime();
                const deletionTime = new Date(delTime).getTime();
                if (lastMsgTime <= deletionTime) return null;
            }

            const otherUserId = otherUserIdMap[cId];
            const otherUserProfile = profiles.find(p => p.id === otherUserId);

            // Improved unread calculation: check mark read logic
            let unreadCount = 0;
            if (lastMsg && lastMsg.sender_id !== uid && !lastMsg.is_read) {
                unreadCount = 1; // Simplification: we show a dot/badge if there's any unread
            }

            return {
                conversation_id: cId,
                otherUser: conv?.is_group
                    ? { display_name: conv.name || t('chat.group_fallback'), avatar_url: conv.avatar_url }
                    : (otherUserProfile || { display_name: t('chat.user_fallback') }),
                lastMessage: lastMsg,
                unreadCount: unreadCount,
                is_group: conv?.is_group || false,
            };
        }));

        const activeChats = chats.filter(c => c !== null && c.otherUser);
        const sorted = activeChats.sort((a: any, b: any) => {
            // Priority to unread chats
            if ((b.unreadCount > 0) !== (a.unreadCount > 0)) {
                return (b.unreadCount > 0 ? 1 : -1);
            }
            const aTime = new Date(a.lastMessage?.created_at || 0).getTime();
            const bTime = new Date(b.lastMessage?.created_at || 0).getTime();
            return bTime - aTime;
        });

            setConversations(sorted);
            setLoading(false);
            lastLoadAtRef.current = Date.now();
        } finally {
            loadInFlightRef.current = false;
        }
    };

    useEffect(() => {
        const init = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            const user = session?.user;
            if (!user) return;
            setCurrentUserId(user.id);

            // Load archived chats
            const stored = await AsyncStorage.getItem(`archived_chats_${user.id}`);
            if (stored) setArchivedConvIds(JSON.parse(stored));

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
                    if (realtimeRefreshRef.current) clearTimeout(realtimeRefreshRef.current);
                    realtimeRefreshRef.current = setTimeout(() => loadConversations(user.id), 450);
                })
                .subscribe();
        };
        init();

        return () => {
            if (realtimeRefreshRef.current) clearTimeout(realtimeRefreshRef.current);
            if (channelRef.current) supabase.removeChannel(channelRef.current);
        };
    }, []);

    useFocusEffect(
        useCallback(() => {
            const refreshConversations = async () => {
                const { data: { session } } = await supabase.auth.getSession();
                const user = session?.user;
                if (user && Date.now() - lastLoadAtRef.current > 12_000) {
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
            .select('id, username, avatar_url, display_name, favorite_color')
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
            .select('id, username, avatar_url, display_name, favorite_color')
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

    const handleArchiveConversation = async (conversationId: string) => {
        try {
            const uid = currentUserId;
            if (!uid) return;
            const newArchived = [...archivedConvIds, conversationId];
            setArchivedConvIds(newArchived);
            await AsyncStorage.setItem(`archived_chats_${uid}`, JSON.stringify(newArchived));
        } catch (error) {
            Alert.alert('Error', 'No se pudo archivar el chat.');
        }
    };

    const handleUnarchiveConversation = async (conversationId: string) => {
        try {
            const uid = currentUserId;
            if (!uid) return;
            const newArchived = archivedConvIds.filter(id => id !== conversationId);
            setArchivedConvIds(newArchived);
            await AsyncStorage.setItem(`archived_chats_${uid}`, JSON.stringify(newArchived));
        } catch (error) {
            Alert.alert('Error', 'No se pudo desarchivar el chat.');
        }
    };

    const renderItem = ({ item }: any) => (
        <SwipeableChatRow
            item={item}
            onDelete={handleDeleteConversation}
            onArchive={showArchived ? handleUnarchiveConversation : handleArchiveConversation}
            onPress={() => navigation.navigate('ChatDetail', { conversationId: item.conversation_id })}
            onAvatarPress={() => !item.is_group && (navigation as any).navigate('ExternalProfile', { targetUserId: item.otherUser.id })}
            isArchived={showArchived}
        />
    );

    const filteredConversations = conversations.filter(c => 
        showArchived ? archivedConvIds.includes(c.conversation_id) : !archivedConvIds.includes(c.conversation_id)
    );

    return (
        <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === 'ios' ? 10 : 0) }]}>
            <StatusBar barStyle="dark-content" />
            <View style={styles.header}>
                <View style={styles.headerContent}>
                    <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{t('chat.messages')}</Text>
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

            {archivedConvIds.length > 0 && !loading && (
                <TouchableOpacity 
                    style={styles.archivedToggle} 
                    onPress={() => setShowArchived(!showArchived)}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Ionicons name={showArchived ? "chevron-up" : "archive-outline"} size={20} color={Colors.primary} />
                        <Text style={styles.archivedToggleText}>
                            {showArchived ? t('chat.back_to_messages') : t('chat.archived_count', { count: archivedConvIds.length })}
                        </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
                </TouchableOpacity>
            )}

            {loading ? (
                <View style={styles.list}>
                    {Array.from({ length: 8 }).map((_, i) => (
                        <View key={i} style={styles.chatSkeletonRow}>
                            <View style={styles.chatSkeletonAvatar} />
                            <View style={{ flex: 1 }}>
                                <View style={styles.chatSkeletonTitle} />
                                <View style={styles.chatSkeletonLine} />
                            </View>
                        </View>
                    ))}
                </View>
            ) : (
                <AnyFlashList
                    data={filteredConversations}
                    keyExtractor={(item: any) => item.conversation_id}
                    renderItem={renderItem}
                    estimatedItemSize={88}
                    contentContainerStyle={styles.list}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Ionicons name="chatbubbles-outline" size={64} color={Colors.textMuted} />
                            <Text style={styles.emptyText}>
                            {showArchived ? t('chat.no_archived_chats') : t('chat.no_messages_yet')}
                            </Text>
                            {!showArchived && (
                                <TouchableOpacity style={styles.startBtn} activeOpacity={0.8} onPress={() => setShowSearch(true)}>
                                    <Text style={styles.startBtnText}>{t('chat.start_conversation')}</Text>
                                </TouchableOpacity>
                            )}
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
                            placeholder={t('chat.search_by_username')}
                            placeholderTextColor={Colors.textMuted}
                            value={searchQuery}
                            onChangeText={searchUsers}
                            autoFocus
                            autoCorrect={false}
                            autoCapitalize="none"
                            spellCheck={false}
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
                                    <Image 
                                        source={{ uri: Colors.getAvatarUrl(item.avatar_url, item.display_name || item.username, item.favorite_color) }} 
                                        style={styles.userAvatar} 
                                        contentFit="cover"
                                        cachePolicy="memory-disk"
                                    />
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
                                    <Text style={styles.noResults}>{t('chat.no_users_found')}</Text>
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
                            {t('chat.new_group')}
                        </Text>
                        {selectedUsers.length > 0 && (
                            <TouchableOpacity
                                style={styles.groupToggleBtn}
                                onPress={createGroup}
                                disabled={startingChatId === 'group'}
                            >
                                {startingChatId === 'group'
                                    ? <ActivityIndicator size="small" color={Colors.primary} />
                                    : <Text style={styles.groupToggleText}>{t('chat.create_group_count', { count: selectedUsers.length })}</Text>}
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Group name field */}
                    <View style={styles.groupNameRow}>
                        <Ionicons name="camera-outline" size={20} color={Colors.textMuted} style={{ marginRight: 10 }} />
                        <TextInput
                            style={styles.groupNameInput}
                            placeholder={t('chat.group_name_optional')}
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
                                    <Image 
                                        source={{ uri: Colors.getAvatarUrl(u.avatar_url, u.display_name || u.username, u.favorite_color) }} 
                                        style={styles.chipAvatar} 
                                        contentFit="cover"
                                        cachePolicy="memory-disk"
                                    />
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
                            placeholder={t('chat.search_users')}
                            placeholderTextColor={Colors.textMuted}
                            value={groupSearchQuery}
                            onChangeText={searchGroupUsers}
                            autoCorrect={false}
                            autoCapitalize="none"
                            spellCheck={false}
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
                                        <Image 
                                            source={{ uri: Colors.getAvatarUrl(item.avatar_url, item.display_name || item.username, item.favorite_color) }} 
                                            style={styles.userAvatar} 
                                            contentFit="cover"
                                            cachePolicy="memory-disk"
                                        />
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
                                    <Text style={styles.noResults}>{t('chat.no_users_found')}</Text>
                                ) : (
                                    <Text style={styles.noResults}>{t('chat.search_by_username_hint')}</Text>
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
    chatSkeletonRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 22,
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.border,
        marginBottom: 10,
        gap: 12,
    },
    chatSkeletonAvatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: Colors.border },
    chatSkeletonTitle: { width: '46%', height: 14, borderRadius: 7, backgroundColor: Colors.border, marginBottom: 10 },
    chatSkeletonLine: { width: '74%', height: 11, borderRadius: 6, backgroundColor: Colors.border },
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
        padding: 16, borderRadius: 24, marginBottom: 12,
        borderWidth: 1, borderColor: '#F3F4F6', ...Shadow.subtle
    },
    chatItemUnread: {
        borderColor: Colors.primary + '30',
        backgroundColor: '#fff',
        borderWidth: 1.5,
    },
    avatarWrap: { position: 'relative', marginRight: 16 },
    avatar: { width: 56, height: 56, borderRadius: 28 },
    avatarPlaceholder: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
    unreadAvatarDot: {
        position: 'absolute', bottom: 2, right: 2,
        width: 14, height: 14, borderRadius: 7,
        backgroundColor: Colors.primary, borderWidth: 2, borderColor: '#fff',
    },
    chatInfo: { flex: 1 },
    chatName: { fontSize: 16, fontFamily: Fonts.semiBold, color: '#111827' },
    chatNameUnread: { fontFamily: Fonts.bold, color: '#000' },
    lastMessage: { fontSize: 14, fontFamily: Fonts.regular, color: '#6B7280', marginTop: 3 },
    lastMessageUnread: { fontFamily: Fonts.semiBold, color: '#111827' },
    chatRight: { alignItems: 'flex-end', gap: 8 },
    chatTime: { fontSize: 12, fontFamily: Fonts.medium, color: '#9CA3AF' },
    unreadBadge: {
        backgroundColor: Colors.primary, minWidth: 22, height: 22,
        borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
        ...Shadow.subtle
    },
    unreadBadgeText: { color: '#fff', fontSize: 11, fontFamily: Fonts.bold },

    archivedToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 14,
        backgroundColor: Colors.primary + '08',
        marginHorizontal: 16,
        marginTop: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: Colors.primary + '15',
    },
    archivedToggleText: {
        fontSize: 14,
        fontFamily: Fonts.bold,
        color: Colors.primary,
    },
});
