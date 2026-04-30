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
    runOnJS,
    interpolate,
    Extrapolate
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_LIMIT = 80;
const TRIGGER_THRESHOLD = 50;

interface Props {
    children: React.ReactNode;
    onDelete: () => void;
    canDelete: boolean;
}

export default function SwipeableComment({
    children, onDelete, canDelete
}: Props) {
    const translateX = useSharedValue(0);

    const gesture = Gesture.Pan()
        .activeOffsetX([-25, 25])
        .onUpdate((event) => {
            if (!canDelete) return;
            // Only allow swiping left for deletion
            let val = event.translationX;
            if (val > 0) val = val * 0.2; // Resist swiping right
            else val = Math.max(val, -SWIPE_LIMIT);
            translateX.value = val;
        })
        .onEnd((event) => {
            if (!canDelete) {
                translateX.value = withSpring(0);
                return;
            }

            if (event.translationX < -TRIGGER_THRESHOLD) {
                runOnJS(onDelete)();
            }
            translateX.value = withSpring(0);
        });

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    const rightIconStyle = useAnimatedStyle(() => ({
        opacity: interpolate(translateX.value, [-SWIPE_LIMIT, -20], [1, 0], Extrapolate.CLAMP),
        transform: [{ scale: interpolate(translateX.value, [-SWIPE_LIMIT, -20], [1, 0.5], Extrapolate.CLAMP) }]
    }));

    return (
        <View style={styles.container}>
            {/* Background Icon */}
            {canDelete && (
                <View style={styles.background}>
                    <View style={{ flex: 1 }} />
                    <Animated.View style={[styles.iconWrap, styles.rightIcon, rightIconStyle]}>
                        <Ionicons name="trash" size={20} color="#F43F5E" />
                    </Animated.View>
                </View>
            )}

            <GestureDetector gesture={gesture}>
                <Animated.View style={animatedStyle}>
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
        paddingHorizontal: 20,
    },
    iconWrap: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(244, 63, 94, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    rightIcon: { backgroundColor: 'rgba(244, 63, 94, 0.1)' },
});
