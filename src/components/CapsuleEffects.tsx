import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';

interface CapsuleEffectsProps {
    modelKey: string;
    width: number;
    height: number;
}

const CapsuleEffects: React.FC<CapsuleEffectsProps> = ({ modelKey, width, height }) => {
    // Check for chocolate model variants
    const isChoco = modelKey === 'choco' || modelKey === 'chocoopen' ||
        modelKey === 'chococap' || modelKey === 'chococapopen';

    if (!isChoco && modelKey !== 'discocap') {
        return null;
    }

    if (isChoco) {
        return <ChocolateDrip width={width} height={height} />;
    }

    return null;
};

const ChocolateDrip = ({ width, height }: { width: number, height: number }) => {
    // Fewer drips for a more subtle effect
    const dripCount = 4;
    const drips = useRef([...Array(dripCount)].map((_, i) => ({
        id: i,
        // Positioned along the melting chocolate line of the Choco model
        left: (30 + (i * 15) + (Math.random() * 5)) + '%',
        top: '38%',
        delay: Math.random() * 6000,
        duration: 4000 + Math.random() * 3000, // Slower, more subtle
        size: 3 + Math.random() * 2, // Thinner drips
        anim: new Animated.Value(0),
        opacity: new Animated.Value(0),
    }))).current;

    useEffect(() => {
        drips.forEach((d) => {
            const animate = () => {
                d.anim.setValue(0);
                d.opacity.setValue(0);

                Animated.sequence([
                    Animated.delay(d.delay),
                    Animated.parallel([
                        Animated.timing(d.opacity, {
                            toValue: 0.7,
                            duration: 800,
                            useNativeDriver: true,
                        }),
                        Animated.timing(d.anim, {
                            toValue: 1,
                            duration: d.duration,
                            easing: Easing.bezier(0.25, 0.1, 0.25, 1), // Very smooth constant drip
                            useNativeDriver: true,
                        })
                    ]),
                    Animated.timing(d.opacity, {
                        toValue: 0,
                        duration: 1000,
                        useNativeDriver: true,
                    })
                ]).start(() => {
                    d.delay = Math.random() * 3000;
                    animate();
                });
            };
            animate();
        });
    }, []);

    return (
        <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
            {drips.map((d) => (
                <Animated.View
                    key={d.id}
                    style={[
                        styles.drip,
                        {
                            left: d.left as any,
                            top: d.top as any,
                            width: d.size,
                            height: d.size * 2,
                            backgroundColor: '#ad4724', // Requested chocolate color
                            opacity: d.opacity,
                            transform: [
                                {
                                    translateY: d.anim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [0, height * 0.5] // Drip down to the bottom area
                                    })
                                },
                                {
                                    scaleX: d.anim.interpolate({
                                        inputRange: [0, 0.5, 1],
                                        outputRange: [1, 1.1, 0.6]
                                    })
                                },
                                {
                                    scaleY: d.anim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [0.8, 1.5]
                                    })
                                }
                            ]
                        }
                    ]}
                />
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    drip: {
        position: 'absolute',
        borderRadius: 10,
        zIndex: 20,
    }
});

export default CapsuleEffects;
