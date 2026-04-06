import React, { useEffect, useRef, useCallback, useState } from 'react';
import { View, StyleSheet, Animated, Easing, Dimensions, Text } from 'react-native';
import { supabase } from '../lib/supabase';

const { width, height } = Dimensions.get('window');

// ✅ Same channel name used in LiveChat.tsx — ensures all users see reactions
const EMOJI_CHANNEL = (capsuleId: string) => `capsule-emoji-${capsuleId}`;

interface FloatingItem {
    id: string;
    emoji: string;
    left: number;
    anim: Animated.Value;
    size: number;
    wiggle: number;
}

interface Props {
    capsuleId: string;
    // Optional callback to trigger a local emoji (for sender-side immediate feedback)
    onLocalEmoji?: (triggerFn: (emoji: string) => void) => void;
}

/**
 * FloatingEmojis - Premium Version
 *
 * ✅ Higher fidelity animations
 * ✅ Randomized sizes and wiggles
 * ✅ Sender also sees their own emoji immediately via the channel
 */
export default function FloatingEmojis({ capsuleId, onLocalEmoji }: Props) {
    const itemsRef = useRef<FloatingItem[]>([]);
    const [, forceUpdate] = useState(0);

    const addEmoji = useCallback((emoji: string) => {
        const id = `${Date.now()}-${Math.random()}`;
        const anim = new Animated.Value(0);

        // Randomize spawn and behavior
        const left = 10 + Math.random() * 80; // range 10% to 90%
        const size = 28 + Math.random() * 18;  // range 28 to 46
        const wiggle = (Math.random() - 0.5) * 60; // horizontal drift

        const item: FloatingItem = { id, emoji, left, anim, size, wiggle };
        itemsRef.current = [...itemsRef.current, item];
        forceUpdate(n => n + 1);

        Animated.timing(anim, {
            toValue: 1,
            duration: 3000 + Math.random() * 1200,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
        }).start(() => {
            itemsRef.current = itemsRef.current.filter(e => e.id !== id);
            forceUpdate(n => n + 1);
        });
    }, []);

    // Expose the addEmoji trigger to the parent so sender can call it directly
    useEffect(() => {
        if (onLocalEmoji) {
            onLocalEmoji(addEmoji);
        }
    }, [onLocalEmoji, addEmoji]);

    useEffect(() => {
        // Subscribe to Supabase Realtime emoji broadcasts
        // NOTE: Supabase broadcasts are received by ALL subscribers, including the sender,
        // because they are sent server-side. So the sender WILL see their emoji here too.
        const channel = supabase
            .channel(EMOJI_CHANNEL(capsuleId))
            .on('broadcast', { event: 'reaction' }, payload => {
                if (payload.payload?.emoji) addEmoji(payload.payload.emoji);
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [capsuleId, addEmoji]);

    return (
        <View style={st.container} pointerEvents="none">
            {itemsRef.current.map(e => {
                const translateY = e.anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -(height * 0.72)],
                });
                const opacity = e.anim.interpolate({
                    inputRange: [0, 0.08, 0.75, 1],
                    outputRange: [0, 1, 1, 0],
                });
                const scale = e.anim.interpolate({
                    inputRange: [0, 0.12, 0.45, 1],
                    outputRange: [0.2, 1.5, 1.15, 0.85],
                });
                const translateX = e.anim.interpolate({
                    inputRange: [0, 0.3, 0.65, 1],
                    outputRange: [0, e.wiggle * 0.5, -e.wiggle * 0.8, e.wiggle],
                });
                const rotate = e.anim.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: ['0deg', `${e.wiggle > 0 ? 22 : -22}deg`, '0deg'],
                });

                return (
                    <Animated.Text
                        key={e.id}
                        style={[
                            st.emoji,
                            {
                                left: `${e.left}%`,
                                fontSize: e.size,
                                opacity,
                                transform: [
                                    { translateY },
                                    { translateX },
                                    { scale },
                                    { rotate }
                                ],
                            },
                        ]}
                    >
                        {e.emoji}
                    </Animated.Text>
                );
            })}
        </View>
    );
}

const st = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 99999,
    },
    emoji: {
        position: 'absolute',
        bottom: 80,
    },
});