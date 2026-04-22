import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Spacing, BorderRadius } from '../theme';
import { Conversation } from '../data/mockChats';

const capsuleTypeColors: Record<string, string> = {
    instacap: Colors.instaCap,
    eventcap: Colors.eventCap,
    legacycap: Colors.legacyCap,
};

interface ChatRowProps {
    conversation: Conversation;
    onPress: () => void;
}

export default function ChatRow({ conversation, onPress }: ChatRowProps) {
    return (
        <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
            <View style={styles.avatarContainer}>
                <Image 
                    source={{ uri: Colors.getAvatarUrl(conversation.user.avatar, conversation.user.username) }} 
                    style={styles.avatar}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                />
                {conversation.user.isOnline && <View style={styles.onlineDot} />}
            </View>
            <View style={styles.content}>
                <View style={styles.topRow}>
                    <Text style={styles.username}>{conversation.user.username}</Text>
                    <Text style={styles.time}>{conversation.time}</Text>
                </View>
                <View style={styles.bottomRow}>
                    {conversation.isSharedCapsule ? (
                        <View style={styles.capsuleShare}>
                            <View style={[styles.capsuleShareDot, { backgroundColor: conversation.capsuleType ? capsuleTypeColors[conversation.capsuleType] : Colors.primary }]} />
                            <Ionicons name="lock-closed" size={10} color={Colors.textMuted} />
                            <Text style={styles.capsuleShareText} numberOfLines={1}>{conversation.capsuleTitle}</Text>
                        </View>
                    ) : (
                        <Text style={[styles.lastMessage, conversation.unreadCount > 0 && styles.unreadMessage]} numberOfLines={1}>
                            {conversation.lastMessage}
                        </Text>
                    )}
                    {conversation.unreadCount > 0 && (
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>{conversation.unreadCount}</Text>
                        </View>
                    )}
                </View>
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: Spacing.md, paddingVertical: 12, gap: Spacing.sm,
    },
    avatarContainer: { position: 'relative' },
    avatar: {
        width: 50, height: 50, borderRadius: 25,
        borderWidth: 2, borderColor: Colors.border,
    },
    onlineDot: {
        position: 'absolute', bottom: 1, right: 1,
        width: 12, height: 12, borderRadius: 6,
        backgroundColor: Colors.success, borderWidth: 2, borderColor: Colors.surface,
    },
    content: { flex: 1, gap: 5 },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    username: { color: Colors.textPrimary, fontSize: 14, fontFamily: Fonts.semiBold },
    time: { color: Colors.textMuted, fontSize: 11, fontFamily: Fonts.regular },
    bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    lastMessage: { color: Colors.textSecondary, fontSize: 13, fontFamily: Fonts.regular, flex: 1 },
    unreadMessage: { color: Colors.textPrimary, fontFamily: Fonts.semiBold },
    capsuleShare: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
    capsuleShareDot: { width: 6, height: 6, borderRadius: 3 },
    capsuleShareText: { color: Colors.textMuted, fontSize: 12, fontFamily: Fonts.medium, flex: 1 },
    badge: {
        backgroundColor: Colors.primary, borderRadius: BorderRadius.full,
        minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
    },
    badgeText: { color: '#fff', fontSize: 10, fontFamily: Fonts.bold },
});
