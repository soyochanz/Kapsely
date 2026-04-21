import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Platform, View, Text, StyleSheet, ScrollView, TouchableOpacity,
    StatusBar, ActivityIndicator, Animated, PanResponder, Easing,
    Dimensions, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Colors, Fonts, Spacing, BorderRadius } from '../theme';
import SwipeableNotificationItem from '../components/SwipeableNotificationItem';
import { Notification } from '../data/mockNotifications';
import { supabase } from '../lib/supabase';
import { clearBadgeCount } from '../utils/pushNotifications';
import { safetyService } from '../utils/safety';

const { width, height } = Dimensions.get('window');

// ─── Pull-Up Threshold ────────────────────────────────────────────────────────
const PULL_THRESHOLD = 90;

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

// ─── Pull-up indicator ────────────────────────────────────────────────────────
function PullUpIndicator({ pullY, threshold }: { pullY: Animated.Value; threshold: number }) {
    const { t } = useTranslation();
    const progress = pullY.interpolate({
        inputRange: [0, threshold],
        outputRange: [0, 1],
        extrapolate: 'clamp',
    });
    const indicatorOpacity = pullY.interpolate({
        inputRange: [0, 20, threshold],
        outputRange: [0, 0.6, 1],
        extrapolate: 'clamp',
    });
    const indicatorTranslate = pullY.interpolate({
        inputRange: [0, threshold],
        outputRange: [20, 0],
        extrapolate: 'clamp',
    });
    const arrowRotate = pullY.interpolate({
        inputRange: [0, threshold],
        outputRange: ['0deg', '180deg'],
        extrapolate: 'clamp',
    });

    return (
        <Animated.View style={[pullS.wrap, { opacity: indicatorOpacity, transform: [{ translateY: indicatorTranslate }] }]}>
            <View style={pullS.pill}>
                <Animated.View style={{ transform: [{ rotate: arrowRotate }] }}>
                    <Ionicons name="arrow-up" size={14} color={Colors.primary} />
                </Animated.View>
                <Text style={pullS.pillText}>{t('notifications.mark_all_read')}</Text>
                {/* Progress arc */}
                <View style={pullS.progressWrap}>
                    <Animated.View style={[pullS.progressFill, {
                        width: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 28] }),
                        opacity: progress,
                    }]} />
                </View>
            </View>
        </Animated.View>
    );
}

const pullS = StyleSheet.create({
    wrap: {
        alignItems: 'center',
        paddingBottom: 12,
        paddingTop: 4,
    },
    pill: {
        flexDirection: 'row', alignItems: 'center', gap: 7,
        paddingHorizontal: 16, paddingVertical: 8,
        backgroundColor: Colors.instaCapLight,
        borderRadius: 30, borderWidth: 1.5,
        borderColor: Colors.primary + '33',
        shadowColor: Colors.primary,
        shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    pillText: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.primary },
    progressWrap: {
        width: 28, height: 3, borderRadius: 2,
        backgroundColor: Colors.primary + '20', overflow: 'hidden',
    },
    progressFill: {
        height: '100%', borderRadius: 2,
        backgroundColor: Colors.primary,
    },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function NotificationsScreen() {
    const insets = useSafeAreaInsets();
    const { t } = useTranslation();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [scrollEnabled, setScrollEnabled] = useState(true);
    const [showRipple, setShowRipple] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Pull-up gesture state
    const pullY = useRef(new Animated.Value(0)).current;
    const scrollRef = useRef<ScrollView>(null);
    const isAtBottom = useRef(false);
    const isPulling = useRef(false);
    const pulledEnough = useRef(false);

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

    const loadNotifications = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const blocked = await safetyService.getAllSafetyUserIds(user.id);
        const { data } = await supabase
            .from('notifications')
            .select('*, sender:sender_id(username, display_name, avatar_url), capsules(title, type, model, chain_id, opens_at, owner_id)')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50);

        if (data) {
            const mapped: Notification[] = data
                .filter(n => !blocked.includes(n.sender_id) && !n.conversation_id && n.type !== 'chat' && n.type !== 'message' && n.type !== 'capsule_chat' && n.type !== 'chat_message')
                .map(n => {
                    const createdDate = new Date(n.created_at);
                    const expiryDate = new Date(createdDate.getTime() + 3 * 86400000);
                    
                    // Dynamic message generation for language sync
                    let displayMessage = n.message || '';
                    const capTitle = n.capsules?.title ? `"${n.capsules.title}"` : '';
                    
                    if (n.type === 'follow') {
                        displayMessage = n.capsule_id 
                            ? `${t('detail.followed_your_capsule')} ${capTitle}`
                            : t('common.started_following_you');
                    } else if (n.type === 'new_item') {
                        displayMessage = `${t('detail.added_new_memory_to')} ${capTitle}`;
                    } else if (n.type === 'capsule_invite') {
                        displayMessage = `${t('detail.invited_you_to_capsule', { title: '' })} ${capTitle}`.trim();
                    } else if (n.type === 'like' || n.type === 'liked_capsule') {
                        displayMessage = `${t('detail.liked_your_capsule')} ${capTitle}`;
                    } else if (n.type === 'comment' || n.type === 'commented_capsule') {
                        displayMessage = `${t('notifications.commented_capsule')} ${capTitle}`;
                    }

                    return {
                        id: n.id,
                        type: n.type as any,
                        user: {
                            id: n.sender_id,
                            username: n.sender?.display_name || n.sender?.username || 'Unknown',
                            avatar: Colors.getAvatarUrl(n.sender?.avatar_url, n.sender?.display_name || n.sender?.username),
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
            setNotifications(mapped);
        }
        setLoading(false);
    };

    useEffect(() => {
        loadNotifications();
        if (Platform.OS !== 'web') clearBadgeCount();
        const channel = supabase.channel('notifications_realtime')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, loadNotifications)
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
        await loadNotifications();
        setRefreshing(false);
        setShowRipple(true);
    };

    // ─── Pull-up to mark all read ─────────────────────────────────────────
    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_, g) => {
                // Only capture upward drags when at bottom of scroll
                return isAtBottom.current && g.dy < -5 && Math.abs(g.dy) > Math.abs(g.dx);
            },
            onPanResponderGrant: () => {
                isPulling.current = true;
                pulledEnough.current = false;
            },
            onPanResponderMove: (_, g) => {
                if (!isPulling.current) return;
                const pull = Math.max(0, -g.dy);
                pullY.setValue(pull);
                pulledEnough.current = pull >= PULL_THRESHOLD;
            },
            onPanResponderRelease: () => {
                isPulling.current = false;
                const didPull = pulledEnough.current;
                Animated.spring(pullY, { toValue: 0, friction: 7, tension: 80, useNativeDriver: false }).start();
                if (didPull) {
                    setShowRipple(true);
                    handleMarkAllRead();
                }
            },
            onPanResponderTerminate: () => {
                isPulling.current = false;
                Animated.spring(pullY, { toValue: 0, friction: 7, tension: 80, useNativeDriver: false }).start();
            },
        })
    ).current;

    const unreadCount = notifications.filter(n => !n.isRead).length;

    // ─── Grouped notifications ─────────────────────────────────────────────
    const grouped = React.useMemo(() => {
        const today: Notification[] = [];
        const earlier: Notification[] = [];
        const now = Date.now();
        notifications.forEach(n => {
            const diff = now - new Date(n.createdAt || now).getTime();
            if (diff < 86400000) today.push(n);
            else earlier.push(n);
        });
        return { today, earlier };
    }, [notifications]);

    // ─── Render ────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <View style={[s.root, s.centered]}>
                <ActivityIndicator color={Colors.primary} size="large" />
            </View>
        );
    }

    return (
        <View style={s.root} {...panResponder.panHandlers}>
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
                                    {unreadCount} {t('notifications.unread', { count: unreadCount })}
                                </Text>
                            </View>
                        ) : (
                            <Text style={s.allReadText}>{t('notifications.all_caught_up')}</Text>
                        )}
                    </View>

                    {/* Unread count badge */}
                    {unreadCount > 0 && (
                        <View style={s.unreadBadge}>
                            <Text style={s.unreadBadgeText}>{unreadCount}</Text>
                        </View>
                    )}
                </View>

                {/* Pull-up hint — only when there are unread */}
                {unreadCount > 0 && (
                    <View style={s.swipeHint}>
                        <Ionicons name="arrow-down-outline" size={11} color={Colors.textMuted} />
                        <Text style={s.swipeHintText}>{t('notifications.swipe_all_read')}</Text>
                    </View>
                )}

                <View style={s.headerDivider} />
            </Animated.View>

            {/* ── SCROLL ──────────────────────────────────────────────── */}
            <ScrollView
                ref={scrollRef}
                style={s.scroll}
                scrollEnabled={scrollEnabled}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 110 }]}
                onScroll={e => {
                    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
                    isAtBottom.current = layoutMeasurement.height + contentOffset.y >= contentSize.height - 30;
                }}
                scrollEventThrottle={16}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={Colors.primary}
                        colors={[Colors.primary]}
                    />
                }
            >
                {notifications.length === 0 ? (
                    <View style={s.emptyState}>
                        <View style={s.emptyIconWrap}>
                            <Ionicons name="notifications-off-outline" size={36} color={Colors.textMuted} />
                        </View>
                        <Text style={s.emptyTitle}>{t('notifications.all_clear')}</Text>
                        <Text style={s.emptySub}>{t('notifications.no_notifications')}</Text>
                    </View>
                ) : (<>

                    {/* Today */}
                    {grouped.today.length > 0 && (<>
                        <View style={s.sectionHeader}>
                            <View style={[s.sectionDot, { backgroundColor: Colors.primary }]} />
                            <Text style={s.sectionTitle}>{t('notifications.today')}</Text>
                            <View style={s.sectionLine} />
                        </View>
                        {grouped.today.map((n, i) => (
                            <Animated.View
                                key={n.id}
                                style={{
                                    opacity: headerFade,
                                    transform: [{ translateY: headerSlide.interpolate({ inputRange: [-12, 0], outputRange: [-12 - i * 4, 0] }) }],
                                }}
                            >
                                <SwipeableNotificationItem
                                    notification={n}
                                    onDelete={handleDelete}
                                    onMarkRead={handleMarkRead}
                                    onAcceptInvite={handleAcceptInvite}
                                    onRejectInvite={handleRejectInvite}
                                    onSwipeStart={() => setScrollEnabled(false)}
                                    onSwipeEnd={() => setScrollEnabled(true)}
                                />
                            </Animated.View>
                        ))}
                    </>)}

                    {/* Earlier */}
                    {grouped.earlier.length > 0 && (<>
                        <View style={[s.sectionHeader, { marginTop: 12 }]}>
                            <View style={[s.sectionDot, { backgroundColor: Colors.textMuted }]} />
                            <Text style={[s.sectionTitle, { color: Colors.textMuted }]}>{t('notifications.earlier')}</Text>
                            <View style={s.sectionLine} />
                        </View>
                        {grouped.earlier.map(n => (
                            <SwipeableNotificationItem
                                key={n.id}
                                notification={n}
                                onDelete={handleDelete}
                                onMarkRead={handleMarkRead}
                                onAcceptInvite={handleAcceptInvite}
                                onRejectInvite={handleRejectInvite}
                                onSwipeStart={() => setScrollEnabled(false)}
                                onSwipeEnd={() => setScrollEnabled(true)}
                            />
                        ))}
                    </>)}

                    {/* Pull-up indicator — floats at the very bottom of list */}
                    {unreadCount > 0 && (
                        <PullUpIndicator pullY={pullY} threshold={PULL_THRESHOLD} />
                    )}

                </>)}
            </ScrollView>
        </View>
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

    swipeHint: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingBottom: 10, paddingTop: 2,
    },
    swipeHintText: { fontSize: 11, fontFamily: Fonts.regular, color: Colors.textMuted },

    headerDivider: { height: 1, backgroundColor: Colors.divider, marginBottom: 4 },

    // Scroll
    scroll: { flex: 1 },
    scrollContent: { paddingTop: 8 },

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