import React from 'react';
import {
    View, Text, StyleSheet, Dimensions, TouchableOpacity
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
    runOnJS,
    interpolate,
    Extrapolate
} from 'react-native-reanimated';
import { Colors, Fonts, Shadow } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TRIGGER_THRESHOLD = SCREEN_WIDTH * 0.35;

interface Props {
    item: any;
    onDelete: (id: string) => void;
    onArchive: (id: string) => void;
    onPress: () => void;
    onAvatarPress: () => void;
    isArchived?: boolean;
}

export default function SwipeableChatRow({
    item, onDelete, onArchive, onPress, onAvatarPress, isArchived
}: Props) {
    const translateX = useSharedValue(0);
    const itemHeight = useSharedValue(88);
    const opacity = useSharedValue(1);

    const archiveAction = () => {
        'worklet';
        translateX.value = withTiming(SCREEN_WIDTH, { duration: 250 }, () => {
            opacity.value = withTiming(0, { duration: 200 }, () => {
                itemHeight.value = withTiming(0, { duration: 200 }, () => {
                    runOnJS(onArchive)(item.conversation_id);
                });
            });
        });
    };

    const deleteAction = () => {
        'worklet';
        translateX.value = withTiming(-SCREEN_WIDTH, { duration: 250 }, () => {
            opacity.value = withTiming(0, { duration: 200 }, () => {
                itemHeight.value = withTiming(0, { duration: 200 }, () => {
                    runOnJS(onDelete)(item.conversation_id);
                });
            });
        });
    };

    const gesture = Gesture.Pan()
        .activeOffsetX([-20, 20]) // Increased threshold to avoid accidental trigger during scroll/nav
        .failOffsetY([-10, 10])   // Fail pan if vertical movement is significant
        .onUpdate((event) => {
            translateX.value = event.translationX;
        })
        .onEnd((event) => {
            if (event.translationX > TRIGGER_THRESHOLD) {
                archiveAction();
            } else if (event.translationX < -TRIGGER_THRESHOLD) {
                deleteAction();
            } else {
                translateX.value = withSpring(0, { damping: 20, stiffness: 150 });
            }
        });

    const rRowStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    const rContainerStyle = useAnimatedStyle(() => ({
        height: itemHeight.value,
        opacity: opacity.value,
        marginBottom: itemHeight.value === 0 ? 0 : 2,
    }));

    const rDeleteBackdropStyle = useAnimatedStyle(() => ({
        opacity: interpolate(translateX.value, [-SCREEN_WIDTH * 0.4, -20], [1, 0], Extrapolate.CLAMP),
    }));

    const rArchiveBackdropStyle = useAnimatedStyle(() => ({
        opacity: interpolate(translateX.value, [20, SCREEN_WIDTH * 0.4], [0, 1], Extrapolate.CLAMP),
    }));

    const hasUnread = item.unreadCount > 0;

    return (
        <Animated.View style={[styles.wrapper, rContainerStyle]}>
            {/* Delete backdrop (swipe left) */}
            <Animated.View style={[styles.backdrop, styles.deleteBackdrop, rDeleteBackdropStyle]}>
                <Ionicons name="trash" size={24} color="#fff" />
                <Text style={styles.backdropLabel}>Eliminar</Text>
            </Animated.View>

            {/* Archive/Unarchive backdrop (swipe right) */}
            <Animated.View style={[styles.backdrop, styles.archiveBackdrop, rArchiveBackdropStyle]}>
                <Ionicons name={isArchived ? "chatbox-ellipses" : "archive"} size={24} color="#fff" />
                <Text style={styles.backdropLabel}>{isArchived ? 'Desarchivar' : 'Archivar'}</Text>
            </Animated.View>

            <GestureDetector gesture={gesture}>
                <Animated.View style={[styles.row, rRowStyle]}>
                    <TouchableOpacity
                        style={[styles.chatItem, hasUnread && styles.chatItemUnread]}
                        activeOpacity={0.8}
                        onPress={onPress}
                    >
                        <TouchableOpacity activeOpacity={0.7} onPress={onAvatarPress} style={styles.avatarWrap}>
                            <Image 
                                source={{ uri: Colors.getAvatarUrl(item.otherUser?.avatar_url, item.otherUser?.display_name || item.otherUser?.username, item.otherUser?.favorite_color) }} 
                                style={styles.avatar} 
                                contentFit="cover"
                                cachePolicy="memory-disk"
                                recyclingKey={item.conversation_id}
                            />
                            {hasUnread && <View style={styles.unreadAvatarDot} />}
                        </TouchableOpacity>

                        <View style={styles.chatInfo}>
                            <Text style={[styles.chatName, hasUnread && styles.chatNameUnread]}>
                                {item.otherUser?.display_name || item.otherUser?.username || 'Usuario'}
                            </Text>
                            <Text style={[styles.lastMessage, hasUnread && styles.lastMessageUnread]} numberOfLines={1}>
                                {(() => {
                                    const msg = item.lastMessage;
                                    if (!msg) return 'Sin mensajes';
                                    if (msg.media_type === 'capsule') return '🎁 Envió una cápsula';
                                    if (msg.media_type === 'image') return '📷 Envió una foto';
                                    if (msg.media_type === 'video') return '🎥 Envió un video';
                                    if (msg.media_type === 'audio') return '🎵 Envió un audio';
                                    return msg.content || 'Sin mensajes';
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
            </GestureDetector>
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
        borderRadius: 24,
        marginHorizontal: 16,
        marginVertical: 4,
    },
    deleteBackdrop: { left: 0, right: 0, backgroundColor: Colors.eventCap, justifyContent: 'flex-end' },
    archiveBackdrop: { left: 0, right: 0, backgroundColor: '#a66eff', justifyContent: 'flex-start' },
    backdropLabel: { color: '#fff', fontSize: 13, fontFamily: Fonts.bold },
    row: { zIndex: 10 },
    chatItem: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
        padding: 16, borderRadius: 24, marginBottom: 8,
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
