import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated } from 'react-native';

interface CuteFaceProps {
    scale?: number;
    expressionColor?: string;
    overrideExpression?: 'standard' | 'surprised' | 'happy' | 'sad' | 'wink';
}

export default function CuteFace({
    scale = 1,
    expressionColor = '#1a1a1a',
    overrideExpression
}: CuteFaceProps) {
    const eyeAnim = useRef(new Animated.Value(1)).current;
    const [expression, setExpression] = useState<'standard' | 'surprised' | 'happy' | 'sad' | 'wink'>('standard');

    useEffect(() => {
        if (overrideExpression) {
            setExpression(overrideExpression);
            return;
        }

        // Blink logic
        const blink = () => {
            if (expression !== 'happy') {
                Animated.sequence([
                    Animated.timing(eyeAnim, { toValue: 0.1, duration: 100, useNativeDriver: true }),
                    Animated.timing(eyeAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
                ]).start(() => {
                    setTimeout(blink, Math.random() * 5000 + 2000);
                });
            } else {
                setTimeout(blink, 2000);
            }
        };
        const blinkTimeout = setTimeout(blink, 3000);

        // Rare expression change logic (1 every few minutes)
        const triggerExpression = () => {
            const exprs: any[] = ['surprised', 'happy', 'sad', 'wink', 'standard'];
            const nextExpr = exprs[Math.floor(Math.random() * exprs.length)];
            setExpression(prev => prev === 'standard' ? nextExpr : 'standard');

            const nextDelay = (Math.random() * 5 + 5) * 60 * 1000;
            setTimeout(triggerExpression, nextDelay);
        };
        const exprTimeout = setTimeout(triggerExpression, (Math.random() * 3 + 2) * 60 * 1000);

        return () => {
            clearTimeout(blinkTimeout);
            clearTimeout(exprTimeout);
        };
    }, [expression, overrideExpression]);

    const activeMouthColor = expressionColor;

    return (
        <View style={[styles.faceContainer, { transform: [{ scale }] }]}>
            <View style={styles.faceInner}>
                {/* Left side: Eye + Blush column */}
                <View style={styles.eyeCol}>
                    <Animated.View style={[
                        styles.eye,
                        { backgroundColor: expressionColor, transform: [{ scaleY: (expression === 'happy' || expression === 'wink') ? 0.2 : eyeAnim }] }
                    ]}>
                        <View style={styles.eyeReflection} />
                        <View style={styles.eyeReflectionSmall} />
                    </Animated.View>
                    <View style={styles.blush} />
                </View>

                {/* Mouth in middle */}
                <View style={styles.mouthContainer}>
                    {expression === 'surprised' ? (
                        <View style={[styles.mouthRound, { borderColor: activeMouthColor }]} />
                    ) : expression === 'sad' ? (
                        <View style={[styles.mouthFrown, { borderColor: activeMouthColor }]} />
                    ) : (
                        <View style={styles.mouthW}>
                            <View style={[styles.mouthCurve, { borderColor: activeMouthColor }]} />
                            <View style={[styles.mouthCurve, { borderColor: activeMouthColor }]} />
                        </View>
                    )}
                </View>

                {/* Right side: Eye + Blush column */}
                <View style={styles.eyeCol}>
                    <Animated.View style={[
                        styles.eye,
                        { backgroundColor: expressionColor, transform: [{ scaleY: expression === 'happy' ? 0.2 : eyeAnim }] }
                    ]}>
                        <View style={styles.eyeReflection} />
                        <View style={styles.eyeReflectionSmall} />
                    </Animated.View>
                    <View style={styles.blush} />
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    faceContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    faceInner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
    },
    eyeCol: {
        alignItems: 'center',
        gap: 2,
    },
    eye: {
        width: 16,
        height: 16,
        borderRadius: 8,
        position: 'relative',
    },
    eyeReflection: {
        width: 5,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: '#fff',
        position: 'absolute',
        top: 2.5,
        right: 2.5,
    },
    eyeReflectionSmall: {
        width: 2.5,
        height: 2.5,
        borderRadius: 1.25,
        backgroundColor: 'rgba(255,255,255,0.7)',
        position: 'absolute',
        bottom: 2.5,
        left: 2.5,
    },
    blush: {
        width: 10,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255, 105, 180, 0.85)',
    },
    mouthContainer: {
        width: 20,
        height: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 1,
    },
    mouthRound: {
        width: 8,
        height: 8,
        borderRadius: 4,
        borderWidth: 2,
        marginTop: 4,
    },
    mouthFrown: {
        width: 8,
        height: 4,
        borderTopLeftRadius: 5,
        borderTopRightRadius: 5,
        borderWidth: 2,
        borderBottomWidth: 0,
        marginTop: 6,
    },
    mouthW: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 6,
    },
    mouthCurve: {
        width: 7,
        height: 5,
        borderBottomLeftRadius: 4,
        borderBottomRightRadius: 4,
        borderWidth: 2.2,
        borderTopWidth: 0,
        marginHorizontal: -0.4,
    }
});
