import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Platform, View, Text, StyleSheet, ScrollView, TouchableOpacity,
    StatusBar, ActivityIndicator, Animated, Easing,
    Dimensions, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Colors, Fonts, Spacing, BorderRadius } from '../theme';
import SwipeableNotificationItem from '../components/SwipeableNotificationItem';
import { Notification } from '../data/mockNotifications';
import { supabase } from '../lib/supabase';
import { FlashList } from '@shopify/flash-list';
import { useFocusEffect } from '@react-navigation/native';
import { clearBadgeCount } from '../utils/pushNotifications';
import { safetyService } from '../utils/safety';

const { width, height } = Dimensions.get('window');

const AnyFlashList = FlashList as any;
const INVITE_EXPIRY_MS = 48 * 60 * 60 * 1000;

// ─── Ripple success animation component ──────────────────────────────────────
function MarkAllRipple({ visible, onDone }: { visible: boolean; onDone: () => void }) {
    const scale = useRef(new Animated.Value(0)).current;
    const opacity = useRef(new Animated.Value(0)).current;
    const checkScale = useRef(new Animated.Value(0)).current;
    const checkOpacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!visible) return;
        scale.setValue(0);
        opacity.setValue(0.7);
        checkScale.setValue(0);
        checkOpacity.setValue(0);

        Animated.sequence([
            Animated.parallel([
                Animated.timing(scale, { toValue: 1.6, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
            ]),
            Animated.parallel([
                Animated.spring(checkScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
                Animated.timing(checkOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
            ]),
            Animated.delay(900),
            Animated.timing(checkOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start(onDone);
    }, [visible]);

    if (!visible) return null;

    return (
        <View style={[StyleSheet.absoluteFill, { zIndex: 99999 }]} pointerEvents="none">
            <View style={rippleS.center}>
                <Animated.View style={[rippleS.ring, { transform: [{ scale }], opacity }]} />
                <Animated.View style={[rippleS.check, { transform: [{ scale: checkScale }], opacity: checkOpacity }]}>
                    <Ionicons name="checkmark-done" size={30} color="#fff" />
                </Animated.View>
            </View>
        </View>
    );
}

const rippleS = StyleSheet.create({
    center: { ...StyleSheet.absoluteFillObject as any, alignItems: 'center', justifyContent: 'center' },
    ring: {
        position: 'absolute',
        width: 160, height: 160, borderRadius: 80,
        backgroundColor: Colors.primary + '30',
    },
    check: {
        width: 68, height: 68, borderRadius: 34,
        backgroundColor: Colors.primary,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: Colors.primary,
        shadowOpacity: 0.45, shadowRadius: 20, shadowOffset: { width: 0, height: 6 },
        elevation: 10,
    },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function NotificationsScreen() {
    const insets = useSafeAreaInsets();
    const { t } = useTranslation();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [showRipple, setShowRipple] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [totalUnread, setTotalUnread] = useState(0);

    const scrollRef = useRef<ScrollView>(null);

    // Header fade-in on mount
    const headerFade = useRef(new Animated.Value(0)).current;
    const headerSlide = useRef(new Animated.Value(-12)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(headerFade, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.timing(headerSlide, { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]).start();
    }, []);

    // ─── Data ──────────────────────────────────────────────────────────────
    const formatTime = (dateStr: string) => {
        const now = new Date();
        const diff = now.getTime() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return t('common.just_now');
        if (mins < 60) return t('common.m_ago', { count: mins });
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return t('common.h_ago', { count: hrs });
        return t('common.d_ago', { count: Math.floor(hrs / 24) });
    };

    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const PAGE_SIZE = 20;

    const loadNotifications = async (isRefresh = false) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const startPage = isRefresh ? 0 : page;

        if (!isRefresh) setLoadingMore(true);
        else setLoading(true);

        const parallelResults = await Promise.all([
            safetyService.getAllSafetyUserIds(user.id),
            Promise.resolve(supabase.rpc('reject_expired_capsule_invites')).catch(() => ({ data: null, error: null })),
            supabase.from('capsule_followers').select('capsule_id, created_at').eq('user_id', user.id),
            supabase.from('capsule_invites').select('capsule_id').eq('user_id', user.id).eq('status', 'accepted'),
            supabase.from('capsule_invites').select('capsule_id, expires_at, status, created_at').eq('user_id', user.id).eq('status', 'pending'),
        ]);
        const blocked = parallelResults[0] as string[];
        const followedCapsulesResult = parallelResults[2] as any;
        const participantCapsulesResult = parallelResults[3] as any;
        const pendingInviteRowsResult = parallelResults[4] as any;
        const followedCapsules = followedCapsulesResult.data || [];
        const followedCapsuleIds = new Set((followedCapsules || []).map((row: any) => row.capsule_id));
        const followedSinceByCapsule = new Map<string, string>(
            (followedCapsules || []).map((row: any) => [row.capsule_id, row.created_at] as [string, string])
        );
        const participantCapsules = participantCapsulesResult.data || [];
        const participantCapsuleIds = new Set((participantCapsules || []).map((row: any) => row.capsule_id));
        const pendingInviteRows = pendingInviteRowsResult.data || [];
        const pendingInvitesByCapsule = new Map<string, any>(
            (pendingInviteRows || []).map((invite: any) => [invite.capsule_id, invite] as [string, any])
        );
        const activePendingInvites = (pendingInviteRows || []).filter((invite: any) => {
            const expiryDate = invite.expires_at
                ? new Date(invite.expires_at)
                : new Date(new Date(invite.created_at || Date.now()).getTime() + INVITE_EXPIRY_MS);
            return expiryDate > new Date();
        });
        const activePendingCapsuleIds = activePendingInvites.map((invite: any) => invite.capsule_id).filter(Boolean);
        const { data: activeInviteCapsules } = activePendingCapsuleIds.length
            ? await supabase
                .from('capsules')
                .select('id, title, type, model, chain_id, opens_at, owner_id')
                .in('id', activePendingCapsuleIds)
            : { data: [] as any[] };
        const ownerIds = Array.from(new Set((activeInviteCapsules || []).map((cap: any) => cap.owner_id).filter(Boolean)));
        const { data: activeInviteOwners } = ownerIds.length
            ? await supabase
                .from('profiles')
                .select('id, username, display_name, avatar_url, favorite_color')
                .in('id', ownerIds)
            : { data: [] as any[] };
        const capsuleById = new Map((activeInviteCapsules || []).map((cap: any) => [cap.id, cap]));
        const ownerById = new Map((activeInviteOwners || []).map((profile: any) => [profile.id, profile]));
        const activeInviteNotifications: Notification[] = activePendingInvites
            .map((invite: any) => {
                const cap = capsuleById.get(invite.capsule_id);
                if (!cap) return null;
                const owner = ownerById.get(cap.owner_id) || {};
                const createdAt = invite.created_at || new Date().toISOString();
                const expiryDate = invite.expires_at
                    ? new Date(invite.expires_at)
                    : new Date(new Date(createdAt).getTime() + INVITE_EXPIRY_MS);
                const capTitle = cap.title ? `"${cap.title}"` : '';
                return {
                    id: `active-invite-${invite.capsule_id}`,
                    type: 'capsule_invite' as any,
                    user: {
                        id: cap.owner_id,
                        username: owner.display_name || owner.username || 'Kapsely',
                        avatar: Colors.getAvatarUrl(owner.avatar_url, owner.display_name || owner.username, owner.favorite_color),
                    },
                    message: `${t('detail.invited_you_to_capsule', { title: '' })} ${capTitle}`.trim(),
                    time: formatTime(createdAt),
                    isRead: false,
                    capsuleId: invite.capsule_id,
                    capsuleTitle: cap.title,
                    capsuleType: cap.type,
                    capsuleModel: cap.model,
                    capsuleChainId: cap.chain_id,
                    capsuleOpensAt: cap.opens_at,
                    capsuleOwnerId: cap.owner_id,
                    createdAt,
                    isExpired: false,
                    expiryDate,
                };
            })
            .filter(Boolean) as Notification[];

        let nextPage = startPage;
        let lastRawCount = 0;
        let mapped: Notification[] = [];
        let firstError: any = null;
        const maxRawPages = 5;

        while (mapped.length < PAGE_SIZE && nextPage < startPage + maxRawPages) {
            const start = nextPage * PAGE_SIZE;
            const end = start + PAGE_SIZE - 1;
            const { data, error } = await supabase
                .from('notifications')
                .select('*, sender:sender_id(username, display_name, avatar_url, favorite_color), capsules(title, type, model, chain_id, opens_at, owner_id)')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .range(start, end);

            if (error) {
                firstError = error;
                break;
            }

            const rawRows = data || [];
            lastRawCount = rawRows.length;
            nextPage += 1;

            const visibleRows: Notification[] = rawRows
                .filter(n => {
                    if (blocked.includes(n.sender_id) || n.conversation_id) return false;
                    if (['chat', 'message', 'capsule_chat', 'chat_message'].includes(n.type)) return false;
                    if (n.type === 'new_item') {
                        if (!n.capsule_id) return false;
                        if (participantCapsuleIds.has(n.capsule_id)) return true;
                        const followedSince = followedSinceByCapsule.get(n.capsule_id);
                        return !!followedSince && new Date(n.created_at) >= new Date(followedSince);
                    }
                    if (n.type === 'opening_soon') {
                        if (!n.capsule_id) return false;
                        const followedSince = followedSinceByCapsule.get(n.capsule_id);
                        return !!followedSince && new Date(n.created_at) >= new Date(followedSince);
                    }
                    return true;
                })
                .map(n => {
                    const createdDate = new Date(n.created_at);
                    const pendingInvite = n.capsule_id ? pendingInvitesByCapsule.get(n.capsule_id) : null;
                    const expiryDate = pendingInvite?.expires_at
                        ? new Date(pendingInvite.expires_at)
                        : new Date(createdDate.getTime() + INVITE_EXPIRY_MS);
                    
                    let displayMessage = n.message || '';
                    const capTitle = n.capsules?.title ? `"${n.capsules.title}"` : '';
                    
                    if (n.type === 'follow') {
                        displayMessage = n.capsule_id 
                            ? `${t('detail.followed_your_capsule')} ${capTitle}`
                            : t('common.started_following_you');
                    } else if (n.type === 'new_item') {
                        displayMessage = `${t('detail.added_new_memory_to')} ${capTitle}`;
                    } else if (n.type === 'opening_soon') {
                        displayMessage = `${t('notifications.capsule_opening_soon')} ${capTitle}`;
                    } else if (n.type === 'capsule_deleted_empty') {
                        displayMessage = t('notifications.capsule_deleted_empty');
                    } else if (n.type === 'capsule_invite') {
                        displayMessage = `${t('detail.invited_you_to_capsule', { title: '' })} ${capTitle}`.trim();
                    } else if (n.type === 'like' || n.type === 'liked_capsule') {
                        displayMessage = `${t('detail.liked_your_capsule')} ${capTitle}`;
                    } else if (n.type === 'comment_reply') {
                        displayMessage = n.message || `${t('notifications.comment_reply_body')} ${capTitle}`;
                    } else if (n.type === 'comment' || n.type === 'commented_capsule') {
                        displayMessage = `${t('notifications.commented_capsule')} ${capTitle}`;
                    }

                    return {
                        id: n.id,
                        type: n.type as any,
                        user: {
                            id: n.sender_id,
                            username: n.sender?.display_name || n.sender?.username || 'Unknown',
                            avatar: Colors.getAvatarUrl(n.sender?.avatar_url, n.sender?.display_name || n.sender?.username, n.sender?.favorite_color),
                        },
                        message: displayMessage,
                        time: formatTime(n.created_at),
                        isRead: n.is_read,
                        capsuleId: n.capsule_id,
                        conversationId: n.conversation_id,
                        capsuleTitle: n.capsules?.title,
                        capsuleType: n.capsules?.type,
                        capsuleModel: n.capsules?.model,
                        capsuleChainId: n.capsules?.chain_id,
                        capsuleOpensAt: n.capsules?.opens_at,
                        capsuleOwnerId: n.capsules?.owner_id,
                        createdAt: n.created_at,
                        isExpired: n.type === 'capsule_invite' && new Date() > expiryDate,
                        expiryDate,
                    };
                });

            mapped = [
                ...mapped,
                ...visibleRows.filter(n => !(n.type === 'capsule_invite' && n.capsuleId && pendingInvitesByCapsule.has(n.capsuleId))),
            ];

            if (lastRawCount < PAGE_SIZE) break;
        }

        if (firstError) {
            console.error('Error loading notifications:', firstError);
            setLoading(false);
            setLoadingMore(false);
            return;
        }

        if (isRefresh) {
            setNotifications([...activeInviteNotifications, ...mapped]);
            setPage(nextPage);
            setHasMore(lastRawCount === PAGE_SIZE);

            // Expire invitations in DB without deleting history.
            const expiredIds = mapped.filter(n => n.type === 'capsule_invite' && n.isExpired).map(n => n.capsuleId).filter(Boolean);
            if (expiredIds.length > 0) {
                supabase.from('capsule_invites')
                    .update({ status: 'rejected' })
                    .eq('user_id', user.id)
                    .in('capsule_id', expiredIds)
                    .eq('status', 'pending')
                    .then(({ error }) => {
                        if (!error) {
                            // Also remove from UI if desired, but here we just clean DB
                            // The next refresh will show them gone.
                        }
                    });
            }
        } else {
            setNotifications(prev => [...prev, ...mapped]);
            setPage(nextPage);
            setHasMore(lastRawCount === PAGE_SIZE);
        }
        setLoading(false);
        setLoadingMore(false);

        // Fetch total unread count for the +20 logic
        if (isRefresh) {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { count } = await supabase
                    .from('notifications')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', user.id)
                    .not('type', 'in', '("chat","message","capsule_chat","chat_message")')
                    .eq('is_read', false);

                const { data: unreadUploads } = await supabase
                    .from('notifications')
                    .select('id, capsule_id')
                    .eq('user_id', user.id)
                    .eq('type', 'new_item')
                    .eq('is_read', false);
                const hiddenUploadUnread = (unreadUploads || []).filter((n: any) => !n.capsule_id || (!followedCapsuleIds.has(n.capsule_id) && !participantCapsuleIds.has(n.capsule_id))).length;
                const { data: unreadOpeningSoon } = await supabase
                    .from('notifications')
                    .select('id, capsule_id')
                    .eq('user_id', user.id)
                    .eq('type', 'opening_soon')
                    .eq('is_read', false);
                const hiddenOpeningSoonUnread = (unreadOpeningSoon || []).filter((n: any) => !n.capsule_id || !followedCapsuleIds.has(n.capsule_id)).length;
                setTotalUnread(Math.max(0, (count || 0) - hiddenUploadUnread - hiddenOpeningSoonUnread));
            }
        }
    };

    const handleLoadMore = () => {
        if (!hasMore || loadingMore || loading) return;
        loadNotifications();
    };

    useFocusEffect(useCallback(() => {
        setPage(0);
        setHasMore(true);
        setNotifications([]);
        loadNotifications(true);
        if (Platform.OS !== 'web') clearBadgeCount();
    }, []));

    useEffect(() => {
        const channel = supabase.channel('notifications_realtime')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => loadNotifications(true))
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, []);

    // ─── Actions ───────────────────────────────────────────────────────────
    const handleDelete = async (id: string) => {
        await supabase.from('notifications').delete().eq('id', id);
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    const handleMarkRead = async (id: string) => {
        await supabase.from('notifications').update({ is_read: true }).eq('id', id);
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    };

    const handleAcceptInvite = async (n: Notification) => {
        if (!n.capsuleId) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        await Promise.all([
            supabase.from('capsules').update({ invite_status: 'accepted' }).eq('id', n.capsuleId).eq('invited_user_id', user.id),
            supabase.from('capsule_invites').update({ status: 'accepted' }).eq('capsule_id', n.capsuleId).eq('user_id', user.id),
            handleDelete(n.id),
        ]);
        if (n.capsuleOwnerId && n.capsuleOwnerId !== user.id) {
            await supabase.from('notifications').insert({
                user_id: n.capsuleOwnerId, sender_id: user.id, type: 'system',
                capsule_id: n.capsuleId, message: `${t('notifications.accepted_your_invite')} "${n.capsuleTitle || 'a capsule'}"`,
            });
        }
    };

    const handleRejectInvite = async (n: Notification) => {
        if (!n.capsuleId) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        await Promise.all([
            supabase.from('capsules').update({ invite_status: 'rejected' }).eq('id', n.capsuleId).eq('invited_user_id', user.id),
            supabase.from('capsule_invites').update({ status: 'rejected' }).eq('capsule_id', n.capsuleId).eq('user_id', user.id),
            handleDelete(n.id),
        ]);
    };

    const handleMarkAllRead = async () => {
        const prev = [...notifications];
        // Optimistic UI update
        setNotifications(p => p.map(n => ({ ...n, isRead: true })));
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setNotifications(prev); return; }
        
        try {
            const { error } = await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('user_id', user.id)
                .eq('is_read', false);
            if (error) throw error;
        } catch (error) {
            console.warn('Error marking all as read:', error);
            setNotifications(prev);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        // Mark all as read and reload to ensure everything is synced
        await handleMarkAllRead();
        await loadNotifications(true);
        setRefreshing(false);
        setShowRipple(true);
    };

    const unreadCount = totalUnread;
    const renderLoadingSkeleton = () => (
        <View style={s.skeletonWrap}>
            {Array.from({ length: 7 }).map((_, index) => (
                <View key={index} style={s.skeletonItem}>
                    <View style={s.skeletonAvatar} />
                    <View style={s.skeletonLines}>
                        <View style={[s.skeletonLine, { width: index % 2 === 0 ? '74%' : '58%' }]} />
                        <View style={[s.skeletonLineSmall, { width: index % 3 === 0 ? '44%' : '32%' }]} />
                    </View>
                </View>
            ))}
        </View>
    );

    // ─── Render ────────────────────────────────────────────────────────────
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={s.root}>
            <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

            {/* Ripple overlay */}
            <MarkAllRipple visible={showRipple} onDone={() => setShowRipple(false)} />

            {/* ── HEADER ──────────────────────────────────────────────── */}
            <Animated.View style={[s.headerWrap, { paddingTop: insets.top + 16, opacity: headerFade, transform: [{ translateY: headerSlide }] }]}>
                <View style={s.headerInner}>
                    <View>
                        <Text style={s.headerTitle}>{t('notifications.title')}</Text>
                        {unreadCount > 0 ? (
                            <View style={s.unreadRow}>
                                <View style={s.unreadDot} />
                                <Text style={s.unreadText}>
                                    {unreadCount > 20 ? '+20' : unreadCount} {t('notifications.unread', { count: unreadCount })}
                                </Text>
                            </View>
                        ) : (
                            <Text style={s.allReadText}>{t('notifications.all_caught_up')}</Text>
                        )}
                    </View>

                    {/* Unread count badge */}
                    {unreadCount > 0 && (
                        <View style={s.unreadBadge}>
                            <Text style={s.unreadBadgeText}>{unreadCount > 20 ? '+20' : unreadCount}</Text>
                        </View>
                    )}
                </View>

                {/* Mark all read button */}
                {unreadCount > 0 && (
                    <TouchableOpacity
                        style={s.markAllBtn}
                        activeOpacity={0.7}
                        onPress={() => { setShowRipple(true); handleMarkAllRead(); }}
                    >
                        <Ionicons name="checkmark-done" size={13} color={Colors.primary} />
                        <Text style={s.markAllBtnText}>{t('notifications.mark_all_read')}</Text>
                    </TouchableOpacity>
                )}

                <View style={s.headerDivider} />
            </Animated.View>

            {/* ── LIST ────────────────────────────────────────────────── */}
            <View style={{ flex: 1 }}>
                {loading && page === 0 ? (
                    renderLoadingSkeleton()
                ) : notifications.length === 0 ? (
                    <View style={s.emptyState}>
                        <View style={s.emptyIconWrap}>
                            <Ionicons name="notifications-off-outline" size={36} color={Colors.textMuted} />
                        </View>
                        <Text style={s.emptyTitle}>{t('notifications.all_clear')}</Text>
                        <Text style={s.emptySub}>{t('notifications.no_notifications')}</Text>
                    </View>
                ) : (
                    <AnyFlashList
                        data={notifications}
                        estimatedItemSize={90}
                        keyExtractor={(item: Notification) => item.id}
                        scrollEnabled={true}
                        onEndReached={handleLoadMore}
                        onEndReachedThreshold={0.1}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 110 }]}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={onRefresh}
                                tintColor={Colors.primary}
                                colors={[Colors.primary]}
                            />
                        }
                        ListFooterComponent={() => (
                            <View style={{ paddingBottom: insets.bottom + 120 }}>
                                {loadingMore ? (
                                    <ActivityIndicator color={Colors.primary} style={{ marginVertical: 20 }} />
                                ) : hasMore && notifications.length >= PAGE_SIZE ? (
                                    <TouchableOpacity 
                                        style={s.loadMoreBtn} 
                                        onPress={handleLoadMore}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={s.loadMoreText}>{t('notifications.load_more') || 'Cargar más'}</Text>
                                        <Ionicons name="chevron-down" size={18} color={Colors.primary} />
                                    </TouchableOpacity>
                                ) : null}
                            </View>
                        )}
                        renderItem={({ item, index }: { item: Notification; index: number }) => (
                            <Animated.View
                                style={{
                                    opacity: headerFade,
                                    transform: [{ translateY: headerSlide.interpolate({ inputRange: [-12, 0], outputRange: [-12 - index * 4, 0] }) }],
                                }}
                            >
                                <SwipeableNotificationItem
                                    notification={item}
                                    onDelete={handleDelete}
                                    onMarkRead={handleMarkRead}
                                    onAcceptInvite={handleAcceptInvite}
                                    onRejectInvite={handleRejectInvite}
                                    onSwipeStart={() => {}}
                                    onSwipeEnd={() => {}}
                                />
                            </Animated.View>
                        )}
                    />
                )}
            </View>
        </View>
        </GestureHandlerRootView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.background },
    centered: { justifyContent: 'center', alignItems: 'center' },

    // Header
    headerWrap: {
        backgroundColor: Colors.background,
        paddingHorizontal: 20,
        paddingBottom: 0,
        zIndex: 10,
    },
    headerInner: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingBottom: 8,
    },
    headerTitle: {
        fontSize: 30, fontFamily: Fonts.bold,
        color: Colors.textPrimary, letterSpacing: -0.8,
    },
    unreadRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
    unreadDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary },
    unreadText: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.primary },
    allReadText: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.textMuted, marginTop: 3 },
    unreadBadge: {
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: Colors.primary,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: Colors.primary,
        shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
        elevation: 4,
    },
    unreadBadgeText: { fontSize: 13, fontFamily: Fonts.bold, color: '#fff' },

    markAllBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingBottom: 10, paddingTop: 2, alignSelf: 'flex-start',
    },
    markAllBtnText: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.primary },

    headerDivider: { height: 1, backgroundColor: Colors.divider, marginBottom: 4 },

    // Scroll
    scroll: { flex: 1 },
    scrollContent: { paddingTop: 8 },
    skeletonWrap: { paddingHorizontal: 20, paddingTop: 14, gap: 12 },
    skeletonItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: 18,
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.borderLight || Colors.divider,
    },
    skeletonAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.cardAlt },
    skeletonLines: { flex: 1, gap: 8 },
    skeletonLine: { height: 12, borderRadius: 6, backgroundColor: Colors.cardAlt },
    skeletonLineSmall: { height: 10, borderRadius: 5, backgroundColor: Colors.cardAlt },

    // Section headers
    sectionHeader: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: 20, paddingVertical: 10,
    },
    sectionDot: { width: 6, height: 6, borderRadius: 3 },
    sectionTitle: {
        fontSize: 11, fontFamily: Fonts.bold,
        color: Colors.primary, letterSpacing: 1.2, textTransform: 'uppercase',
    },
    sectionLine: {
        flex: 1, height: 1, backgroundColor: Colors.divider,
    },

    loadMoreBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 16,
        marginTop: 20,
        marginHorizontal: 20,
        borderRadius: 18,
        backgroundColor: Colors.background,
        borderWidth: 1.5,
        borderColor: Colors.divider,
        borderStyle: 'dashed',
    },
    loadMoreText: {
        fontSize: 14,
        fontFamily: Fonts.bold,
        color: Colors.primary,
    },

    // Empty state
    emptyState: { paddingTop: 100, alignItems: 'center', gap: 12 },
    emptyIconWrap: {
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: Colors.cardAlt,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 4,
    },
    emptyTitle: { fontSize: 18, fontFamily: Fonts.bold, color: Colors.textPrimary },
    emptySub: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 40 },
});
