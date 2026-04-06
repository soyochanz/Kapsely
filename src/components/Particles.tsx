import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Platform } from 'react-native';

interface ParticlesProps {
    activeTint: string;
    capsuleType?: string;
}

// Star shape for eventcap - rendered as a rotated cross
const StarParticle = ({ size, color }: { size: number, color: string }) => (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', width: size, height: size * 0.25, backgroundColor: color, borderRadius: 2 }} />
        <View style={{ position: 'absolute', width: size * 0.25, height: size, backgroundColor: color, borderRadius: 2 }} />
        <View style={{ position: 'absolute', width: size * 0.8, height: size * 0.2, backgroundColor: color, borderRadius: 2, transform: [{ rotate: '45deg' }] }} />
        <View style={{ position: 'absolute', width: size * 0.8, height: size * 0.2, backgroundColor: color, borderRadius: 2, transform: [{ rotate: '-45deg' }] }} />
    </View>
);

const Particles: React.FC<ParticlesProps> = ({ activeTint, capsuleType }) => {
    const isEvent = capsuleType === 'eventcap';
    const isLegacy = capsuleType === 'legacycap';

    // EventCap: fewer but larger star particles; others: small dots
    const count = isEvent ? 8 : 10;

    const particles = useRef([...Array(count)].map((_, i) => ({
        id: Math.random().toString(),
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        size: isEvent ? Math.random() * 6 + 5 : Math.random() * 4 + 2,
        duration: Math.random() * 3600 + (isEvent ? 1800 : 2400),
        opacity: new Animated.Value(0),
        translateY: new Animated.Value(0),
        translateX: new Animated.Value(0),
        rotate: new Animated.Value(0),
        scale: new Animated.Value(isEvent ? 0.3 : 1),
    }))).current;

    useEffect(() => {
        particles.forEach((p) => {
            const animate = () => {
                p.opacity.setValue(0);
                p.translateY.setValue(0);
                p.scale.setValue(isEvent ? 0.3 : 1);
                if (isEvent) {
                    p.translateX.setValue((Math.random() - 0.5) * 20);
                    p.rotate.setValue(0);
                }

                const animations: Animated.CompositeAnimation[] = [
                    Animated.timing(p.opacity, {
                        toValue: Math.random() * 0.6 + 0.3,
                        duration: p.duration * 0.25,
                        useNativeDriver: true,
                    }),
                    Animated.timing(p.translateY, {
                        toValue: isEvent ? -(50 + Math.random() * 60) : -(60 + Math.random() * 40),
                        duration: p.duration,
                        useNativeDriver: true,
                    }),
                ];

                if (isEvent) {
                    // Stars drift sideways + spin + grow-shrink
                    animations.push(
                        Animated.timing(p.translateX, {
                            toValue: (Math.random() - 0.5) * 40,
                            duration: p.duration,
                            useNativeDriver: true,
                        }),
                        Animated.timing(p.rotate, {
                            toValue: Math.random() > 0.5 ? 1 : -1,
                            duration: p.duration,
                            useNativeDriver: true,
                        }),
                        Animated.sequence([
                            Animated.timing(p.scale, { toValue: 1.4, duration: p.duration * 0.4, useNativeDriver: true }),
                            Animated.timing(p.scale, { toValue: 0.6, duration: p.duration * 0.6, useNativeDriver: true }),
                        ])
                    );
                }

                Animated.parallel(animations).start(({ finished }) => {
                    if (finished) {
                        Animated.timing(p.opacity, {
                            toValue: 0,
                            duration: p.duration * 0.25,
                            useNativeDriver: true,
                        }).start(() => animate());
                    }
                });
            };
            // Stagger start
            setTimeout(() => animate(), Math.random() * 2000);
        });
    }, [capsuleType]);

    return (
        <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
            {particles.map((p, i) => {
                const rotateInterp = isEvent ? p.rotate.interpolate({
                    inputRange: [-1, 1],
                    outputRange: ['-180deg', '180deg'],
                }) : '0deg';

                // EventCap uses gold/warm star color tint
                const particleColor = isEvent
                    ? (i % 3 === 0 ? '#FFD700' : i % 3 === 1 ? '#FFA500' : activeTint)
                    : activeTint;

                return (
                    <Animated.View
                        key={p.id}
                        style={{
                            position: 'absolute',
                            left: p.left as any,
                            top: p.top as any,
                            width: p.size,
                            height: p.size,
                            // Non-event: circular dots; event: no borderRadius (star drawn via children)
                            borderRadius: isEvent ? 0 : p.size / 2,
                            backgroundColor: isEvent ? 'transparent' : particleColor,
                            opacity: p.opacity,
                            ...(Platform.OS === 'ios' && !isEvent ? {
                                shadowColor: particleColor,
                                shadowOffset: { width: 0, height: 0 },
                                shadowOpacity: 0.4,
                                shadowRadius: 3,
                            } : {}),
                            transform: [
                                { translateY: p.translateY },
                                { translateX: isEvent ? p.translateX : new Animated.Value(0) },
                                { scale: p.scale },
                                { rotate: isEvent ? rotateInterp as any : '0deg' },
                            ],
                        }}
                    >
                        {isEvent && (
                            <StarParticle size={p.size} color={particleColor} />
                        )}
                    </Animated.View>
                );
            })}
        </View>
    );
};

export default Particles;
