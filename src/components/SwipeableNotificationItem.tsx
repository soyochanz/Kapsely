import React from 'react';
import { View, Text, StyleSheet, Dimensions, Vibration, LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
    runOnJS,
    interpolate,
    Extrapolate,
} from 'react-native-reanimated';
import { Colors, Fonts } from '../theme';
import { Notification } from '../data/mockNotifications';
import NotificationItem from './NotificationItem';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TRIGGER_DELETE = SCREEN_WIDTH * 0.22;
const TRIGGER_READ   = SCREEN_WIDTH * 0.18;

interface Props {
    notification: Notification;
    onDelete: (id: string) => void;
    onMarkRead: (id: string) => void;
    onAcceptInvite?: (notif: Notification) => void;
    onRejectInvite?: (notif: Notification) => void;
    onSwipeStart?: () => void;
    onSwipeEnd?: () => void;
}

export default function SwipeableNotificationItem({
    notification, onDelete, onMarkRead, onAcceptInvite, onRejectInvite, onSwipeStart, onSwipeEnd,
}: Props) {
    const translateX  = useSharedValue(0);
    const itemHeight  = useSharedValue(-1);   // -1 = not yet measured; collapses to 0 on delete
    const itemOpacity = useSharedValue(1);
    const swipeActive = useSharedValue(false);

    // ── Actions ──────────────────────────────────────────────────────────────
    const doDelete = (id: string) => {
        if (onSwipeEnd) onSwipeEnd();
        Vibration.vibrate(20);
        onDelete(id);
    };

    const doMarkRead = (id: string) => {
        if (onSwipeEnd) onSwipeEnd();
        Vibration.vibrate(10);
        onMarkRead(id);
    };

    const triggerDelete = () => {
        'worklet';
        translateX.value = withTiming(-SCREEN_WIDTH, { duration: 230 }, () => {
            itemOpacity.value = withTiming(0, { duration: 150 }, () => {
                itemHeight.value = withTiming(0, { duration: 200 }, () => {
                    runOnJS(doDelete)(notification.id);
                });
            });
        });
    };

    const triggerRead = () => {
        'worklet';
        translateX.value = withSpring(0, { damping: 18, stiffness: 200 }, () => {
            runOnJS(doMarkRead)(notification.id);
        });
    };

    // ── Gesture ───────────────────────────────────────────────────────────────
    const gesture = Gesture.Pan()
        .activeOffsetX([-22, 22])
        .failOffsetY([-12, 12])
        .minDistance(10)
        .onBegin(() => {
            swipeActive.value = false;
        })
        .onUpdate((e) => {
            if (Math.abs(e.translationY) > Math.abs(e.translationX) * 0.7) return;
            if (!swipeActive.value && Math.abs(e.translationX) > 18) {
                swipeActive.value = true;
                if (onSwipeStart) runOnJS(onSwipeStart)();
            }
            // Resist right swipe slightly
            if (e.translationX > 0) {
                translateX.value = e.translationX * 0.85;
            } else {
                translateX.value = e.translationX;
            }
        })
        .onEnd((e) => {
            const dx = e.translationX;
            if (dx < -TRIGGER_DELETE) {
                triggerDelete();
            } else if (dx > TRIGGER_READ) {
                triggerRead();
            } else {
                translateX.value = withSpring(0, { damping: 20, stiffness: 250 });
                if (swipeActive.value && onSwipeEnd) runOnJS(onSwipeEnd)();
            }
        })
        .onFinalize((_e, success) => {
            // If gesture was cancelled / stolen by ScrollView, snap back
            if (!success) {
                translateX.value = withSpring(0, { damping: 22, stiffness: 260 });
                if (swipeActive.value && onSwipeEnd) runOnJS(onSwipeEnd)();
            }
            swipeActive.value = false;
        });

    // ── Animated styles ───────────────────────────────────────────────────────
    const rowStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    const wrapperStyle = useAnimatedStyle(() => {
        if (itemHeight.value < 0) return { opacity: itemOpacity.value };
        return {
            height: itemHeight.value,
            opacity: itemOpacity.value,
            overflow: 'hidden' as const,
        };
    });

    const readReveal = useAnimatedStyle(() => ({
        opacity: interpolate(translateX.value, [0, TRIGGER_READ], [0, 1], Extrapolate.CLAMP),
    }));

    const deleteReveal = useAnimatedStyle(() => ({
        opacity: interpolate(translateX.value, [-TRIGGER_DELETE, 0], [1, 0], Extrapolate.CLAMP),
    }));

    return (
        <Animated.View
            style={[styles.wrapper, wrapperStyle]}
            onLayout={(e: LayoutChangeEvent) => {
                const h = e.nativeEvent.layout.height;
                if (h > 0 && itemHeight.value < 0) {
                    itemHeight.value = h;
                }
            }}
        >
            {/* Mark-read backdrop (right swipe) */}
            <Animated.View style={[styles.backdrop, styles.readBackdrop, readReveal]}>
                <Ionicons name="checkmark-done" size={22} color="#fff" />
                <Text style={styles.backdropLabel}>Leído</Text>
            </Animated.View>

            {/* Delete backdrop (left swipe) */}
            <Animated.View style={[styles.backdrop, styles.deleteBackdrop, deleteReveal]}>
                <Ionicons name="trash" size={22} color="#fff" />
                <Text style={styles.backdropLabel}>Eliminar</Text>
            </Animated.View>

            {/* Swipeable row */}
            <GestureDetector gesture={gesture}>
                <Animated.View style={[styles.row, rowStyle]}>
                    <NotificationItem
                        notification={notification}
                        onMarkRead={onMarkRead}
                        onAcceptInvite={onAcceptInvite}
                        onRejectInvite={onRejectInvite}
                    />
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
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: 22,
    },
    readBackdrop: {
        left: 0, right: 0,
        backgroundColor: Colors.success,
        justifyContent: 'flex-start',
    },
    deleteBackdrop: {
        left: 0, right: 0,
        backgroundColor: Colors.eventCap,
        justifyContent: 'flex-end',
    },
    backdropLabel: { color: '#fff', fontSize: 13, fontFamily: Fonts.bold },
    row: { backgroundColor: Colors.background },
});
