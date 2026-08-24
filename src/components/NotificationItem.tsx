import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors, Fonts, Spacing, BorderRadius, Shadow } from '../theme';
import { Notification } from '../data/mockNotifications';
import { useNavigation } from '@react-navigation/native';
import CapsuleWithTimer from './CapsuleWithTimer';
import { MODEL_IMAGES } from '../constants/models';
import { timerConfigManager } from '../utils/timerConfig';

const typeConfig = {
    instacap: { color: Colors.instaCap },
    eventcap: { color: Colors.eventCap },
    legacycap: { color: Colors.legacyCap },
};
const INVITE_EXPIRY_MS = 48 * 60 * 60 * 1000;

const notifIcons: Record<string, { name: string; color: string }> = {
    like: { name: 'heart', color: '#e84545' },
    comment: { name: 'chatbubble', color: Colors.primaryLight },
    comment_reply: { name: 'return-down-forward', color: Colors.primary },
    follow: { name: 'person-add', color: Colors.primary },
    capsule_opened: { name: 'lock-open', color: Colors.legacyCap },
    opening_soon: { name: 'time', color: Colors.primary },
    capsule_deleted_empty: { name: 'trash', color: '#EF4444' },
    capsule_invite: { name: 'mail', color: Colors.eventCap },
    memory: { name: 'sparkles', color: Colors.legacyCap },
    chat_message: { name: 'chatbubbles', color: Colors.primary },
};

interface NotificationItemProps {
    notification: Notification;
    onMarkRead?: (id: string) => void;
    onAcceptInvite?: (notif: Notification) => void;
    onRejectInvite?: (notif: Notification) => void;
}

export default function NotificationItem({ notification, onMarkRead, onAcceptInvite, onRejectInvite }: NotificationItemProps) {
    const { t } = useTranslation();
    const navigation = useNavigation<any>();
    const iconCfg = notifIcons[notification.type] || { name: 'notifications', color: Colors.textMuted };
    const isMemory = notification.type === 'memory';

    const handlePress = () => {
        if (!notification.isRead && onMarkRead) {
            onMarkRead(notification.id);
        }

        if (notification.type === 'chat_message' && notification.conversationId) {
            navigation.navigate('ChatDetail', { conversationId: notification.conversationId });
        } else if (notification.type === 'chat_message' && notification.capsuleId) {
            navigation.navigate('CapsuleDetail', { capsuleId: notification.capsuleId, initialTab: 'Chat', initialCapsule: notification.capsulePreview });
        } else if (notification.capsuleId) {
            navigation.navigate('CapsuleDetail', { capsuleId: notification.capsuleId, initialCapsule: notification.capsulePreview });
        } else if (notification.user?.id) {
            navigation.navigate('ExternalProfile', { targetUserId: notification.user.id });
        }
    };

    const isInvite = notification.type === 'capsule_invite';
    const isExpired = notification.expiryDate
        ? notification.expiryDate.getTime() <= Date.now()
        : notification.createdAt
        ? new Date(notification.createdAt).getTime() < Date.now() - INVITE_EXPIRY_MS
        : false;

    return (
        <TouchableOpacity
            style={[styles.row, !notification.isRead && styles.unread]}
            activeOpacity={0.7}
            onPress={handlePress}
        >
            <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => !isMemory && notification.user?.id && navigation.navigate('ExternalProfile', { targetUserId: notification.user.id })}
                style={styles.avatarContainer}
            >
                {isMemory ? (
                    <View style={[styles.systemAvatar, { backgroundColor: Colors.legacyCapLight, borderColor: Colors.legacyCap + '33' }]}>
                        <Ionicons name="time" size={22} color={Colors.legacyCap} />
                    </View>
                ) : (
                    <>
                        <Image 
                            source={{ uri: notification.user.avatar }} 
                            style={styles.avatar} 
                            contentFit="cover"
                            cachePolicy="memory-disk"
                            transition={200}
                        />
                        <View style={[styles.iconBadge, { backgroundColor: iconCfg.color }]}>
                            <Ionicons name={iconCfg.name as any} size={10} color="#fff" />
                        </View>
                    </>
                )}
            </TouchableOpacity>

            <View style={styles.mainCol}>
                <View style={styles.content}>
                    {!isMemory ? (
                        <Text style={styles.message}>
                            <Text style={styles.boldText}>{notification.user.username}</Text>
                            {' '}{t(notification.message, { title: notification.capsuleTitle || '...' })}
                        </Text>
                    ) : (
                        <Text style={styles.message}>{t(notification.message, { title: notification.capsuleTitle || '...' })}</Text>
                    )}
                    {notification.capsuleTitle && (
                        <View style={styles.capsuleRef}>
                            <View style={[styles.capsuleDot, { backgroundColor: notification.capsuleType ? typeConfig[notification.capsuleType]?.color : Colors.primary }]} />
                            <Text style={styles.capsuleRefText}>{notification.capsuleTitle}</Text>
                        </View>
                    )}
                    <Text style={styles.time}>{notification.time}</Text>
                </View>

                {isInvite && !isExpired && onAcceptInvite && onRejectInvite && (
                    <View style={styles.inviteActions}>
                        <TouchableOpacity style={styles.rejectBtn} activeOpacity={0.7} onPress={() => onRejectInvite(notification)}>
                            <Text style={styles.rejectBtnText}>{t('common.reject', { defaultValue: 'Rechazar' })}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.acceptBtn} activeOpacity={0.8} onPress={() => onAcceptInvite(notification)}>
                            <Text style={styles.acceptBtnText}>{t('common.accept', { defaultValue: 'Aceptar' })}</Text>
                        </TouchableOpacity>
                    </View>
                )}
                {isInvite && isExpired && (
                    <Text style={styles.expiredText}>{t('notifications.invite_expired') || 'Invitación Caducada'}</Text>
                )}
            </View>

            {!notification.isRead && <View style={styles.unreadDot} />}

            {notification.capsuleModel && (
                <View style={styles.capsulePreview}>
                    <CapsuleWithTimer
                        modelKey={notification.capsuleModel}
                        source={{ uri: timerConfigManager.getModelImage(notification.capsuleModel) || MODEL_IMAGES[notification.capsuleModel as keyof typeof MODEL_IMAGES] || (MODEL_IMAGES as any).basicred_kap }}
                        date={notification.capsuleOpensAt || ''}
                        chainId={notification.capsuleChainId}
                        capsuleType={notification.capsuleType}
                        hideTimer
                        hideParticles
                        style={styles.notifCapsule}
                    />
                </View>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row', alignItems: 'center',
        padding: Spacing.md, borderRadius: BorderRadius.md, gap: Spacing.sm,
    },
    unread: { backgroundColor: Colors.primary + '07' },
    avatarContainer: { position: 'relative', width: 46, height: 46 },
    avatar: {
        width: 46, height: 46, borderRadius: 23,
        borderWidth: 1.5, borderColor: Colors.border,
    },
    systemAvatar: {
        width: 46, height: 46, borderRadius: 23,
        borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
    },
    iconBadge: {
        position: 'absolute', bottom: -2, right: -2,
        width: 18, height: 18, borderRadius: 9,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: Colors.surface,
    },
    mainCol: { flex: 1 },
    content: { gap: 4 },
    message: { color: Colors.textSecondary, fontSize: 13, fontFamily: Fonts.regular, lineHeight: 18 },
    boldText: { color: Colors.textPrimary, fontFamily: Fonts.semiBold },
    capsuleRef: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
    capsuleDot: { width: 6, height: 6, borderRadius: 3 },
    capsuleRefText: { color: Colors.textMuted, fontSize: 11, fontFamily: Fonts.medium },
    time: { color: Colors.textMuted, fontSize: 11, fontFamily: Fonts.regular },
    expiredText: { color: Colors.eventCap, fontSize: 11, fontFamily: Fonts.medium, marginTop: 6 },
    unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary, marginTop: 4 },
    inviteActions: {
        flexDirection: 'row', gap: 6, marginTop: 10, width: '100%',
    },
    acceptBtn: {
        backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: BorderRadius.full,
        flex: 1, alignItems: 'center'
    },
    acceptBtnText: { color: '#fff', fontSize: 13, fontFamily: Fonts.semiBold },
    rejectBtn: {
        backgroundColor: Colors.cardAlt, paddingHorizontal: 16, paddingVertical: 8, borderRadius: BorderRadius.full,
        flex: 1, alignItems: 'center', borderWidth: 1, borderColor: Colors.borderLight
    },
    rejectBtnText: { color: Colors.textSecondary, fontSize: 13, fontFamily: Fonts.semiBold },
    capsulePreview: {
        width: 44,
        height: 44,
        marginLeft: 4,
        alignItems: 'center',
        justifyContent: 'center',
    },
    notifCapsule: {
        width: 40,
        height: 40,
    }
});
