import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Platform } from 'react-native';

interface ParticlesProps {
    activeTint: string;
    capsuleType?: string;
}

const Particles: React.FC<ParticlesProps> = ({ activeTint, capsuleType }) => {
    const isEvent = capsuleType === 'eventcap';
    const isLegacy = capsuleType === 'legacycap';

    // Create 15-25 particles based on type
    const count = isEvent ? 25 : 15;

    const particles = useRef([...Array(count)].map(() => ({
        id: Math.random().toString(),
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        size: Math.random() * (isEvent ? 8 : 4) + 2,
        duration: Math.random() * 3000 + 2000,
        opacity: new Animated.Value(0),
        translateY: new Animated.Value(0),
        scale: new Animated.Value(isEvent ? 0.5 : 1),
    }))).current;

    useEffect(() => {
        particles.forEach((p, i) => {
            const animate = () => {
                p.opacity.setValue(0);
                p.translateY.setValue(0);
                if (isEvent) p.scale.setValue(0.5);

                const animations = [
                    Animated.timing(p.opacity, {
                        toValue: Math.random() * 0.5 + 0.2,
                        duration: p.duration * 0.3,
                        useNativeDriver: true,
                    }),
                    Animated.timing(p.translateY, {
                        toValue: -60 - Math.random() * 40,
                        duration: p.duration,
                        useNativeDriver: true,
                    })
                ];

                if (isEvent) {
                    animations.push(
                        Animated.sequence([
                            Animated.timing(p.scale, { toValue: 1.5, duration: p.duration * 0.5, useNativeDriver: true }),
                            Animated.timing(p.scale, { toValue: 0.8, duration: p.duration * 0.5, useNativeDriver: true }),
                        ])
                    );
                }

                Animated.parallel(animations).start(({ finished }) => {
                    if (finished) {
                        Animated.timing(p.opacity, {
                            toValue: 0,
                            duration: p.duration * 0.3,
                            useNativeDriver: true,
                        }).start(() => animate());
                    }
                });
            };
            animate();
        });
    }, [capsuleType]);

    return (
        <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
            {particles.map((p, i) => (
                <Animated.View
                    key={p.id}
                    style={{
                        position: 'absolute',
                        left: p.left as any,
                        top: p.top as any,
                        width: p.size,
                        height: p.size,
                        borderRadius: (isEvent && i % 2 === 0) ? 2 : p.size / 2,
                        backgroundColor: activeTint,
                        opacity: p.opacity,
                        ...Platform.select({
                            web: { boxShadow: `0px 0px ${isEvent ? 6 : 3}px ${activeTint}` },
                            ios: {
                                shadowColor: activeTint,
                                shadowOffset: { width: 0, height: 0 },
                                shadowOpacity: isEvent ? 0.8 : 0.4,
                                shadowRadius: isEvent ? 6 : 3,
                            },
                            android: {
                                elevation: isEvent ? 4 : 2,
                            }
                        }),
                        transform: [
                            { translateY: p.translateY },
                            { scale: p.scale },
                            { rotate: isEvent && i % 3 === 0 ? '45deg' : '0deg' }
                        ],
                    }}
                />
            ))}
        </View>
    );
};

export default Particles;
