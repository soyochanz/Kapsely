import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Dimensions, TouchableOpacity, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { Colors } from '../theme';

const { height } = Dimensions.get('window');

interface FloatingEmoji {
    id: string;
    emoji: string;
    left: number;
    animValue: Animated.Value;
}

export default function FloatingEmojis({ capsuleId }: { capsuleId: string }) {
    const [emojis, setEmojis] = useState<FloatingEmoji[]>([]);

    useEffect(() => {
        const channel = supabase.channel(`capsule-${capsuleId}-reactions`);

        channel.on('broadcast', { event: 'reaction' }, (payload) => {
            if (payload.payload?.emoji) {
                addEmoji(payload.payload.emoji);
            }
        }).subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [capsuleId]);

    const addEmoji = useCallback((emoji: string) => {
        const id = Math.random().toString();
        const animValue = new Animated.Value(0);
        // Random horizontal position for some variance
        const left = Math.random() * 40 - 20;

        setEmojis((prev) => [...prev, { id, emoji, left, animValue }]);

        Animated.timing(animValue, {
            toValue: 1,
            duration: 2500,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
        }).start(() => {
            setEmojis((prev) => prev.filter((e) => e.id !== id));
        });
    }, []);

    const sendReaction = async (emoji: string) => {
        // Show locally instantly
        addEmoji(emoji);
        // Broadcast to others
        const channel = supabase.channel(`capsule-${capsuleId}-reactions`);
        await channel.send({
            type: 'broadcast',
            event: 'reaction',
            payload: { emoji },
        });
    };

    const REACTION_EMOJIS = ['❤️', '😂', '🎉', '🔥', '💯'];

    return (
        <View style={[styles.container, { pointerEvents: 'box-none' }]}>
            {/* The floating animation layer */}
            <View style={[styles.animationLayer, { pointerEvents: 'none' }]}>
                {emojis.map((e) => {
                    const translateY = e.animValue.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -height * 0.4] // Float up 40% of screen
                    });
                    const opacity = e.animValue.interpolate({
                        inputRange: [0, 0.1, 0.8, 1],
                        outputRange: [0, 1, 1, 0] // Fade in, then out
                    });
                    const scale = e.animValue.interpolate({
                        inputRange: [0, 0.1, 1],
                        outputRange: [0.5, 1.2, 1]
                    });

                    return (
                        <Animated.Text
                            key={e.id}
                            style={[
                                styles.emoji,
                                {
                                    transform: [
                                        { translateY },
                                        { translateX: e.left },
                                        { scale }
                                    ],
                                    opacity
                                }
                            ]}
                        >
                            {e.emoji}
                        </Animated.Text>
                    );
                })}
            </View>

            {/* The reaction toolbar (like YouTube Live chat side reactions) */}
            <View style={styles.toolbar}>
                {REACTION_EMOJIS.map((emoji) => (
                    <TouchableOpacity
                        key={emoji}
                        style={styles.reactionBtn}
                        activeOpacity={0.7}
                        onPress={() => sendReaction(emoji)}
                    >
                        <Text style={styles.toolbarEmoji}>{emoji}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 9999, // Floating above everything
        justifyContent: 'flex-end',
        alignItems: 'flex-end',
    },
    animationLayer: {
        position: 'absolute',
        right: 20, // Align with the toolbar
        bottom: 120, // Start just above the toolbar
        width: 50,
        height: 300,
        alignItems: 'center',
    },
    emoji: {
        position: 'absolute',
        fontSize: 28,
        bottom: 0,
    },
    toolbar: {
        width: 50,
        backgroundColor: 'rgba(20,20,30,0.85)',
        borderRadius: 25,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        paddingVertical: 10,
        alignItems: 'center',
        marginRight: 10,
        marginBottom: 80, // Above typical bottom bars
        ...Platform.select({
            web: { boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.3)' },
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 10,
            },
            android: {
                elevation: 10,
            }
        }),
    },
    reactionBtn: {
        padding: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    toolbarEmoji: {
        fontSize: 22,
    }
});
