import React, { useRef, useState } from 'react';
import {
    View, Text, StyleSheet, Animated, PanResponder, Dimensions, Vibration,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../theme';
import { Notification } from '../data/mockNotifications';
import NotificationItem from './NotificationItem';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TRIGGER_THRESHOLD = SCREEN_WIDTH * 0.32;

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
    notification, onDelete, onMarkRead, onAcceptInvite, onRejectInvite, onSwipeStart, onSwipeEnd
}: Props) {
    const translateX = useRef(new Animated.Value(0)).current;
    const heightAnim = useRef(new Animated.Value(0)).current; // 0 to 1
    const [isMeasured, setIsMeasured] = useState(false);
    const measuredH = useRef(0);

    const springBack = () => {
        Animated.spring(translateX, {
            toValue: 0, useNativeDriver: true, tension: 180, friction: 18,
        }).start(() => {
            if (onSwipeEnd) onSwipeEnd();
        });
    };

    const collapseAndDelete = (id: string) => {
        Animated.sequence([
            Animated.timing(translateX, { toValue: -SCREEN_WIDTH, duration: 250, useNativeDriver: true }),
            Animated.timing(heightAnim, { toValue: 1, duration: 250, useNativeDriver: false }),
        ]).start(() => {
            if (onSwipeEnd) onSwipeEnd();
            onDelete(id);
        });
    };

    const springToRead = (id: string) => {
        Animated.spring(translateX, {
            toValue: 0, useNativeDriver: true, tension: 150, friction: 12,
        }).start(() => {
            if (onSwipeEnd) onSwipeEnd();
            Vibration.vibrate(10);
            onMarkRead(id);
        });
    };

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (_, g) => {
                const isHorizontal = Math.abs(g.dx) > 15;
                const isVerticalSignificant = Math.abs(g.dy) > 30;
                return isHorizontal && !isVerticalSignificant;
            },
            onMoveShouldSetPanResponderCapture: (_, g) => {
                // Capture more aggressively to allow swipe even if slightly vertical
                return Math.abs(g.dx) > 15 && Math.abs(g.dy) < 50;
            },
            onPanResponderGrant: () => {
                (translateX as any).stopAnimation();
                if (onSwipeStart) onSwipeStart();
            },
            onPanResponderMove: (_, g) => {
                // Don't swipe too far right or left beyond screen
                if (g.dx > 0) {
                    translateX.setValue(g.dx * 0.7); // resist swiping right too much
                } else {
                    translateX.setValue(g.dx);
                }
            },
            onPanResponderRelease: (_, g) => {
                const dx = g.dx;
                if (dx < -TRIGGER_THRESHOLD * 0.8) { // Delete threshold (left)
                    collapseAndDelete(notification.id);
                } else if (dx > TRIGGER_THRESHOLD * 0.5) { // Mark read threshold (right)
                    springToRead(notification.id);
                } else {
                    springBack();
                }
            },
            onPanResponderTerminate: () => springBack(),
        })
    ).current;

    const leftReveal = translateX.interpolate({ inputRange: [-SCREEN_WIDTH, 0], outputRange: [1, 0], extrapolate: 'clamp' });
    const rightReveal = translateX.interpolate({ inputRange: [0, SCREEN_WIDTH * 0.5], outputRange: [0, 1], extrapolate: 'clamp' });

    const animatedHeight = heightAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [measuredH.current || 80, 0]
    });

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
            {/* Mark read backdrop (shows when swiping right) */}
            <Animated.View style={[styles.backdrop, styles.readBackdrop, { opacity: rightReveal }]}>
                <Ionicons name="checkmark-done" size={24} color="#fff" />
                <Text style={styles.backdropLabel}>Mark Read</Text>
            </Animated.View>

            {/* Delete backdrop (shows when swiping left) */}
            <Animated.View style={[styles.backdrop, styles.deleteBackdrop, { opacity: leftReveal }]}>
                <Ionicons name="trash" size={24} color="#fff" />
                <Text style={styles.backdropLabel}>Delete</Text>
            </Animated.View>

            {/* Row Content */}
            <Animated.View style={[styles.row, { transform: [{ translateX }] }]} {...panResponder.panHandlers}>
                <NotificationItem
                    notification={notification}
                    onMarkRead={onMarkRead}
                    onAcceptInvite={onAcceptInvite}
                    onRejectInvite={onRejectInvite}
                />
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
    readBackdrop: { left: 0, right: 0, backgroundColor: Colors.success, justifyContent: 'flex-start' },
    deleteBackdrop: { left: 0, right: 0, backgroundColor: Colors.eventCap, justifyContent: 'flex-end' },
    backdropLabel: { color: '#fff', fontSize: 13, fontFamily: Fonts.bold },
    row: { backgroundColor: Colors.background, zIndex: 10 },
});
