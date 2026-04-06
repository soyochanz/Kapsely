import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, LayoutChangeEvent, Animated, Easing } from 'react-native';
import { Image } from 'expo-image';

import { LinearGradient } from 'expo-linear-gradient';
import LiveTimer from './LiveTimer';
import { timerConfigManager, ModelTimerConfig, ModelChainConfig } from '../utils/timerConfig';
import { MODEL_TINTS } from '../constants/models';
import Particles from './Particles';


interface CapsuleWithTimerProps {
    modelKey: string;
    source: any; // Image source
    date: string; // The target date for the timer
    style?: any; // External dimensions (e.g. { width: 140, height: 140 })
    chainId?: string | null; // Selected chain ID
    configOverride?: ModelTimerConfig; // Used by the calibration tool
    chainConfigOverride?: ModelChainConfig; // Used by the calibration tool
    hideTimer?: boolean; // Hide the timer overlay entirely
    capsuleType?: string; // Optional type for specific particles
    isOpened?: boolean; // New prop for status
    hideParticles?: boolean; // Suppress particles (for thumbnails, notifications)
    darkerShadow?: boolean; // Use more intense shadow
    lightweight?: boolean; // Mode for off-screen or secondary cards
    disableAnimations?: boolean; // Stop pendulum/glint to save CPU
}

const CapsuleWithTimer = React.memo(({
    modelKey,
    source,
    date,
    style,
    chainId,
    configOverride,
    hideTimer,
    capsuleType,
    isOpened,
    hideParticles,
    darkerShadow,
    chainConfigOverride,
    lightweight,
    disableAnimations,
}: CapsuleWithTimerProps) => {
    const [configVersion, setConfigVersion] = useState(0);
    
    // Try to pre-initialize size from style if they are numbers to avoid the onLayout flicker
    const flatStyle = StyleSheet.flatten(style);
    const initialWidth = (flatStyle?.width && typeof flatStyle.width === 'number') ? flatStyle.width : 0;
    const initialHeight = (flatStyle?.height && typeof flatStyle.height === 'number') ? flatStyle.height : 0;
    const [layoutSize, setLayoutSize] = useState({ width: initialWidth, height: initialHeight });

    const config = configOverride || timerConfigManager.getConfig(modelKey);
    const chainConfig = chainConfigOverride || (chainId ? timerConfigManager.getChainConfig(modelKey, chainId) : null);

    const swingAnim = useRef(new Animated.Value(0)).current;
    const glintAnim = useRef(new Animated.Value(-1.5)).current;

    useEffect(() => {
        if (disableAnimations) return;

        // Pendulum animation
        swingAnim.setValue(-1);
        Animated.loop(
            Animated.sequence([
                Animated.timing(swingAnim, { 
                    toValue: 1, 
                    duration: 5000, 
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true 
                }),
                Animated.timing(swingAnim, { 
                    toValue: -1, 
                    duration: 5000, 
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true 
                })
            ])
        ).start();

        // Glint reflection
        Animated.loop(
            Animated.sequence([
                Animated.timing(glintAnim, { toValue: 1.5, duration: 1200, useNativeDriver: true }),
                Animated.delay(4800)
            ])
        ).start();

        const unsubscribe = timerConfigManager.subscribe(() => setConfigVersion(v => v + 1));
        return unsubscribe;
    }, []);

    const onLayout = (e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 0 && height > 0) {
            setLayoutSize({ width, height });
        }
    };

    const { width, height } = layoutSize;

    // Calculate absolute position based on normalized config (0..1)
    const containerStyle = [styles.container, style];

    // Default to invisible if not measured yet to avoid jump
    const timerStyle = width > 0 ? {
        position: 'absolute' as const,
        left: width * config.x,
        top: height * config.y,
        width: width * config.w,
        height: height * config.h,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        overflow: 'hidden' as const,
        borderRadius: 12, // More rounded, diffused look
    } : { opacity: 0 };

    // Chain style
    const chainItem = chainId ? timerConfigManager.getChainLibrary().find(c => c.id === chainId) : null;
    const chainOverlayStyle = (width > 0 && chainConfig && chainItem) ? {
        position: 'absolute' as const,
        left: width * chainConfig.x,
        top: height * chainConfig.y,
        width: width * chainConfig.scale,
        height: height * chainConfig.scale,
        transform: [
            { translateX: - (width * chainConfig.scale) / 2 },
            { translateY: - (height * chainConfig.scale) / 2 }
        ],
        alignItems: 'center' as const,
        justifyContent: 'flex-start' as const,
    } : { opacity: 0 };

    // Scale font based on timer height
    const baseFontSize = Math.max(8, (height * config.h) * 0.55);



    const rotateInterp = swingAnim.interpolate({
        inputRange: [-1, 1],
        outputRange: ['-2.5deg', '2.5deg']
    });

    const glintTranslate = glintAnim.interpolate({
        inputRange: [-1.5, 1.5],
        outputRange: [-((width * config.w) * 1.5), (width * config.w) * 1.5]
    });

    const activeTint = (MODEL_TINTS as Record<string, string>)[modelKey] || '#a269ff';

    return (
        <View style={containerStyle} onLayout={onLayout}>
            {/* Particles - Hide if lightweight or explicitly requested */}
            {width > 0 && !hideParticles && !lightweight && <Particles activeTint={activeTint} capsuleType={capsuleType} />}

            {/* Shadow: behind everything via zIndex */}
            {width > 0 && (
                <View style={[styles.groundShadow, {
                    width: width * 0.9,
                    height: width * 0.9,
                    bottom: -(width * 0.33),
                    backgroundColor: darkerShadow ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)',
                }]} />
            )}



            <Image
                source={source}
                style={[
                    styles.image, 
                    width > 0 ? { width, height } : {}, 
                    { zIndex: 1 }
                ]}
                contentFit="contain"
                cachePolicy="memory-disk"
                transition={0} // Disable transition to avoid additional flicker on mount
            />

            {width > 0 && !hideTimer && (
                <View style={[timerStyle, { zIndex: 2 }]}>
                    <LiveTimer
                        date={date}
                        modelId={modelKey}
                        configOverride={config}
                        style={{ fontSize: baseFontSize }}
                        hideLabel={isOpened}
                        lightweight={lightweight}
                    />

                    {/* Screen Glint Reflection overlay - Skip for performance if lightweight */}
                    {!lightweight && !disableAnimations && (
                        <Animated.View style={{
                            position: 'absolute',
                            top: 0, left: 0, right: 0, bottom: 0,
                            transform: [{ translateX: glintTranslate }],
                            zIndex: 3
                        }}>
                            <LinearGradient
                                colors={['transparent', 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.25)', 'rgba(255,255,255,0.1)', 'transparent']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={StyleSheet.absoluteFillObject}
                            />
                        </Animated.View>
                    )}
                </View>
            )}
            {width > 0 && chainItem && chainConfig && (
                <View style={[chainOverlayStyle, { zIndex: 2 }]}>
                    <Animated.View style={{
                        width: '100%',
                        height: '100%',
                        transformOrigin: 'top center' as any,
                        transform: [
                            { rotate: rotateInterp }
                        ]
                    }}>
                        <Image
                            source={{ uri: chainItem.image_url }}
                            style={{ width: '100%', height: '100%' }}
                            contentFit="contain"
                            cachePolicy="memory-disk"
                        />

                    </Animated.View>
                </View>
            )}
        </View>
    );
});

export default CapsuleWithTimer;

const styles = StyleSheet.create({
    container: {
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    groundShadow: {
        position: 'absolute',
        zIndex: 0,
        borderRadius: 1000,
        backgroundColor: 'rgba(0,0,0,0.05)', // More diffuse
        transform: [{ scaleY: 0.2 }],
    }
});
