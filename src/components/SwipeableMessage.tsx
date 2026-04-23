import React from 'react';
import {
    View, StyleSheet, Dimensions
} from 'react-native';
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
    FadeInUp
} from 'react-native-reanimated';
import { PALETTE } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_LIMIT = 80;
const TRIGGER_THRESHOLD = 50;

interface Props {
    children: React.ReactNode;
    isMe: boolean;
    onReply?: () => void;
    onDelete?: () => void;
    isDeleted?: boolean;
}

export default function SwipeableMessage({
    children, isMe, onReply, onDelete, isDeleted
}: Props) {
    const translateX = useSharedValue(0);

    const gesture = Gesture.Pan()
        .activeOffsetX([-20, 20]) // Require more horizontal movement to start
        .failOffsetY([-10, 10])   // Fail if user is mostly scrolling vertically
        .onUpdate((event) => {
            if (isDeleted) return;
            // Limit swipe depending on side
            let val = event.translationX;
            if (val > 0) val = Math.min(val, SWIPE_LIMIT);
            else val = Math.max(val, -SWIPE_LIMIT);
            translateX.value = val;
        })
        .onEnd((event) => {
            if (isDeleted) {
                translateX.value = withSpring(0);
                return;
            }

            if (event.translationX > TRIGGER_THRESHOLD) {
                if (onReply) {
                    runOnJS(onReply)();
                }
            } else if (event.translationX < -TRIGGER_THRESHOLD) {
                if (onDelete) {
                    runOnJS(onDelete)();
                }
            }
            translateX.value = withSpring(0);
        });

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    const leftIconStyle = useAnimatedStyle(() => ({
        opacity: interpolate(translateX.value, [0, 40], [0, 1], Extrapolate.CLAMP),
        transform: [{ scale: interpolate(translateX.value, [0, 40], [0.5, 1], Extrapolate.CLAMP) }]
    }));

    const rightIconStyle = useAnimatedStyle(() => ({
        opacity: interpolate(translateX.value, [-40, 0], [1, 0], Extrapolate.CLAMP),
        transform: [{ scale: interpolate(translateX.value, [-40, 0], [1, 0.5], Extrapolate.CLAMP) }]
    }));

    return (
        <View style={styles.container}>
            {/* Background Icons */}
            <View style={styles.background}>
                <Animated.View style={[styles.iconWrap, styles.leftIcon, leftIconStyle]}>
                    <Ionicons name="arrow-undo" size={20} color={PALETTE.myBubble} />
                </Animated.View>
                <Animated.View style={[styles.iconWrap, styles.rightIcon, rightIconStyle]}>
                    <Ionicons name="trash" size={20} color="#E53935" />
                </Animated.View>
            </View>

            <GestureDetector gesture={gesture}>
                <Animated.View entering={FadeInUp.springify().damping(15)} style={animatedStyle}>
                    {children}
                </Animated.View>
            </GestureDetector>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { position: 'relative', width: '100%' },
    background: {
        ...StyleSheet.absoluteFillObject,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
    },
    iconWrap: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: 'rgba(155, 127, 212, 0.12)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    leftIcon: { backgroundColor: 'rgba(155, 127, 212, 0.12)' },
    rightIcon: { backgroundColor: 'rgba(229, 57, 53, 0.1)' },
});
