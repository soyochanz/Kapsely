import React, { useRef, useState } from 'react';
import {
    View, Text, StyleSheet, Animated, PanResponder, Dimensions, Vibration,
    TouchableOpacity
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Spacing, BorderRadius, Shadow } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TRIGGER_THRESHOLD = SCREEN_WIDTH * 0.32;

interface Props {
    item: any;
    onDelete: (id: string) => void;
    onPress: () => void;
    onAvatarPress: () => void;
}

export default function SwipeableChatRow({
    item, onDelete, onPress, onAvatarPress
}: Props) {
    const translateX = useRef(new Animated.Value(0)).current;
    const heightAnim = useRef(new Animated.Value(0)).current; // 0 to 1
    const [isMeasured, setIsMeasured] = useState(false);
    const measuredH = useRef(0);

    const springBack = () => {
        Animated.spring(translateX, {
            toValue: 0, useNativeDriver: true, tension: 180, friction: 18,
        }).start();
    };

    const collapseAndDelete = (id: string) => {
        Animated.sequence([
            Animated.timing(translateX, { toValue: -SCREEN_WIDTH, duration: 250, useNativeDriver: true }),
            Animated.timing(heightAnim, { toValue: 1, duration: 250, useNativeDriver: false }),
        ]).start(() => {
            onDelete(id);
        });
    };

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (_, g) => {
                const isHorizontal = Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 5;
                return isHorizontal;
            },
            onMoveShouldSetPanResponderCapture: (_, g) => {
                const isHorizontal = Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 5;
                return isHorizontal;
            },
            onPanResponderTerminationRequest: () => false,
            onPanResponderGrant: () => {
                (translateX as any).stopAnimation();
            },
            onPanResponderMove: (_, g) => {
                if (g.dx > 0) {
                    translateX.setValue(g.dx * 0.3); // Resist right swipe
                } else {
                    translateX.setValue(g.dx);
                }
            },
            onPanResponderRelease: (_, g) => {
                const dx = g.dx;
                if (dx < -TRIGGER_THRESHOLD * 0.8) {
                    collapseAndDelete(item.conversation_id);
                } else {
                    springBack();
                }
            },
            onPanResponderTerminate: () => springBack(),
        })
    ).current;

    const deleteReveal = translateX.interpolate({ inputRange: [-SCREEN_WIDTH, 0], outputRange: [1, 0], extrapolate: 'clamp' });

    const animatedHeight = heightAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [measuredH.current || 80, 0]
    });

    const hasUnread = item.unreadCount > 0;

    return (
        <Animated.View
            style={[styles.wrapper, isMeasured && { height: animatedHeight }]}
            onLayout={(e) => {
                if (!isMeasured) {
                    measuredH.current = e.nativeEvent.layout.height;
                    setIsMeasured(true);
                }
            }}
        >
            {/* Delete backdrop */}
            <Animated.View style={[styles.backdrop, styles.deleteBackdrop, { opacity: deleteReveal }]}>
                <Ionicons name="trash" size={24} color="#fff" />
                <Text style={styles.backdropLabel}>Delete</Text>
            </Animated.View>

            {/* Row Content */}
            <Animated.View style={[styles.row, { transform: [{ translateX }] }]} {...panResponder.panHandlers}>
                <TouchableOpacity
                    style={[styles.chatItem, hasUnread && styles.chatItemUnread]}
                    activeOpacity={0.7}
                    onPress={onPress}
                >
                    <TouchableOpacity activeOpacity={0.7} onPress={onAvatarPress} style={styles.avatarWrap}>
                        <Image 
                            source={{ uri: Colors.getAvatarUrl(item.otherUser?.avatar_url, item.otherUser?.display_name || item.otherUser?.username) }} 
                            style={styles.avatar} 
                            contentFit="cover"
                            cachePolicy="memory-disk"
                        />
                        {hasUnread && <View style={styles.unreadAvatarDot} />}
                    </TouchableOpacity>
                    <View style={styles.chatInfo}>
                        <Text style={[styles.chatName, hasUnread && styles.chatNameUnread]}>{item.otherUser?.display_name || item.otherUser?.username || 'User'}</Text>
                        <Text style={[styles.lastMessage, hasUnread && styles.lastMessageUnread]} numberOfLines={1}>
                            {(() => {
                                const msg = item.lastMessage;
                                if (!msg) return 'No messages yet';
                                if (msg.media_type === 'capsule') return '🎁 Sent a capsule';
                                if (msg.media_type === 'image') return '📷 Sent a photo';
                                if (msg.media_type === 'video') return '🎥 Sent a video';
                                if (msg.media_type === 'audio') return '🎵 Sent a voice message';
                                return msg.content || 'No messages yet';
                            })()}
                        </Text>
                    </View>
                    <View style={styles.chatRight}>
                        {item.lastMessage && (
                            <Text style={styles.chatTime}>
                                {new Date(item.lastMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                        )}
                        {hasUnread && (
                            <View style={styles.unreadBadge}>
                                <Text style={styles.unreadBadgeText}>{item.unreadCount > 9 ? '9+' : item.unreadCount}</Text>
                            </View>
                        )}
                    </View>
                </TouchableOpacity>
            </Animated.View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    wrapper: { position: 'relative', overflow: 'hidden' },
    backdrop: {
        position: 'absolute',
        top: 0, bottom: 0,
        alignItems: 'center', justifyContent: 'center',
        flexDirection: 'row', gap: 10,
        paddingHorizontal: 25,
    },
    deleteBackdrop: { left: 0, right: 0, backgroundColor: Colors.eventCap, justifyContent: 'flex-end' },
    backdropLabel: { color: '#fff', fontSize: 13, fontFamily: Fonts.bold },
    row: { backgroundColor: Colors.background, zIndex: 10 },
    chatItem: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
        padding: 16, borderRadius: 24, marginBottom: 12,
        borderWidth: 1, borderColor: '#F3F4F6', ...Shadow.subtle,
        marginHorizontal: 16,
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
        backgroundColor: Colors.primary,
        minWidth: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 6,
        ...Shadow.subtle
    },
    unreadBadgeText: { color: '#fff', fontSize: 11, fontFamily: Fonts.bold },
});
