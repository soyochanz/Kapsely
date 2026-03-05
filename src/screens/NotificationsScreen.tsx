import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, StatusBar, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Spacing, BorderRadius } from '../theme';
import SwipeableNotificationItem from '../components/SwipeableNotificationItem';
import { Notification } from '../data/mockNotifications';
import { supabase } from '../lib/supabase';

export default function NotificationsScreen() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [scrollEnabled, setScrollEnabled] = useState(true);

    const loadNotifications = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
            .from('notifications')
            .select(`
                *,
                sender:sender_id(username, avatar_url),
                capsules(title, type)
            `)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (data) {
            const mapped: Notification[] = data.map(n => {
                const createdDate = new Date(n.created_at);
                const expiryDate = new Date(createdDate.getTime() + (3 * 24 * 60 * 60 * 1000));
                const isExpired = n.type === 'capsule_invite' && new Date() > expiryDate;

                return {
                    id: n.id,
                    type: n.type as any,
                    user: {
                        id: n.sender_id,
                        username: n.sender?.username || 'Unknown',
                        avatar: n.sender?.avatar_url || 'https://via.placeholder.com/150'
                    },
                    message: n.message || '',
                    time: formatTime(n.created_at),
                    isRead: n.is_read,
                    capsuleId: n.capsule_id,
                    capsuleTitle: n.capsules?.title,
                    capsuleType: n.capsules?.type,
                    createdAt: n.created_at,
                    isExpired,
                    expiryDate,
                };
            });
            setNotifications(mapped);
        }
        setLoading(false);
    };

    useEffect(() => {
        loadNotifications();
    }, []);

    const formatTime = (dateStr: string) => {
        const now = new Date();
        const past = new Date(dateStr);
        const diff = now.getTime() - past.getTime();
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    };

    const unreadCount = notifications.filter((n) => !n.isRead).length;

    const handleDelete = async (id: string) => {
        await supabase.from('notifications').delete().eq('id', id);
        setNotifications((prev) => prev.filter((n) => n.id !== id));
    };

    const handleMarkRead = async (id: string) => {
        await supabase.from('notifications').update({ is_read: true }).eq('id', id);
        setNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
        );
    };

    const handleAcceptInvite = async (n: Notification) => {
        if (!n.capsuleId) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        await Promise.all([
            supabase.from('capsules').update({ invite_status: 'accepted' }).eq('id', n.capsuleId).eq('invited_user_id', user.id),
            supabase.from('capsule_invites').update({ status: 'accepted' }).eq('capsule_id', n.capsuleId).eq('user_id', user.id),
            handleDelete(n.id)
        ]);
    };

    const handleRejectInvite = async (n: Notification) => {
        if (!n.capsuleId) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        await Promise.all([
            supabase.from('capsules').update({ invite_status: 'rejected' }).eq('id', n.capsuleId).eq('invited_user_id', user.id),
            supabase.from('capsule_invites').update({ status: 'rejected' }).eq('capsule_id', n.capsuleId).eq('user_id', user.id),
            handleDelete(n.id)
        ]);
    };

    const handleMarkAllRead = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Optimistic UI update
        const previousNotifs = [...notifications];
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));

        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', user.id)
            .eq('is_read', false);

        if (error) {
            console.error('Mark all read error:', error);
            setNotifications(previousNotifs);
        }
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.centered]}>
                <ActivityIndicator color={Colors.primary} size="large" />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={Colors.surface} />
            <SafeAreaView>
                <View style={styles.header}>
                    <View>
                        <Text style={styles.headerTitle}>Notifications</Text>
                        {unreadCount > 0 && (
                            <Text style={styles.headerSubtitle}>{unreadCount} unread</Text>
                        )}
                    </View>
                    <TouchableOpacity style={styles.markAllBtn} onPress={handleMarkAllRead}>
                        <Ionicons name="checkmark-done" size={16} color={Colors.primary} />
                        <Text style={styles.markAllText}>Mark all read</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>

            {/* Swipe hint banner */}
            <View style={styles.hintBar}>
                <Ionicons name="swap-horizontal-outline" size={13} color={Colors.textMuted} />
                <Text style={styles.hintText}>
                    Swipe <Text style={{ color: Colors.success, fontFamily: Fonts.semiBold }}>right</Text> to mark read ·
                    Swipe <Text style={{ color: Colors.eventCap, fontFamily: Fonts.semiBold }}> left</Text> to delete
                </Text>
            </View>

            <ScrollView
                style={styles.scroll}
                scrollEnabled={scrollEnabled}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}>

                {notifications.length > 0 ? (
                    notifications.map((n) => (
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
                    ))
                ) : (
                    <View style={styles.emptyState}>
                        <Ionicons name="notifications-off-outline" size={52} color={Colors.textMuted} />
                        <Text style={styles.emptyTitle}>All clear!</Text>
                        <Text style={styles.emptyText}>No notifications left.</Text>
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
        backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
    },
    headerTitle: { color: Colors.textPrimary, fontSize: 22, fontFamily: Fonts.bold },
    headerSubtitle: { color: Colors.primary, fontSize: 12, fontFamily: Fonts.medium, marginTop: 2 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    markAllBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 12, paddingVertical: 6,
        borderRadius: 20, backgroundColor: Colors.instaCapLight,
        borderWidth: 1, borderColor: Colors.border,
    },
    markAllText: { color: Colors.primary, fontSize: 12, fontFamily: Fonts.medium },
    hintBar: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingVertical: 7, backgroundColor: Colors.cardAlt,
        borderBottomWidth: 1, borderBottomColor: Colors.border,
    },
    hintText: { color: Colors.textMuted, fontSize: 11, fontFamily: Fonts.regular },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 100, paddingTop: Spacing.sm },
    activityBanner: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        marginHorizontal: Spacing.md, marginBottom: Spacing.md, padding: Spacing.md,
        backgroundColor: Colors.eventCapLight,
        borderRadius: 12, borderWidth: 1, borderColor: Colors.eventCap + '25',
    },
    activityIconContainer: {
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: Colors.eventCap + '20', alignItems: 'center', justifyContent: 'center',
    },
    activityText: { flex: 1, color: Colors.textSecondary, fontSize: 13, fontFamily: Fonts.regular },
    activityBold: { color: Colors.textPrimary, fontFamily: Fonts.semiBold },
    sectionTitle: {
        color: Colors.textMuted, fontSize: 11, fontFamily: Fonts.semiBold,
        letterSpacing: 1.5, textTransform: 'uppercase',
        paddingHorizontal: Spacing.md, marginBottom: 4, marginTop: Spacing.sm,
    },
    divider: { height: 1, backgroundColor: Colors.divider, marginHorizontal: Spacing.md, marginVertical: Spacing.md },
    emptyState: { alignItems: 'center', paddingTop: 80, gap: 12 },
    emptyTitle: { color: Colors.textPrimary, fontSize: 18, fontFamily: Fonts.semiBold },
    emptyText: { color: Colors.textMuted, fontSize: 14, fontFamily: Fonts.regular },
});
