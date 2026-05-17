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
    modelLayout?: {
        image_scale?: number | string | null;
        image_scale_x?: number | string | null;
        image_scale_y?: number | string | null;
        image_offset_x?: number | string | null;
        image_offset_y?: number | string | null;
    } | null;
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
    isMinimal?: boolean; // Minimal mode for thumbnails
}

const CapsuleWithTimer = React.memo(({
    modelKey,
    source,
    date,
    style,
    modelLayout,
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
    isMinimal,
}: CapsuleWithTimerProps) => {
    const [configVersion, setConfigVersion] = useState(0);
    
    // Try to pre-initialize size from style if they are numbers to avoid the onLayout flicker
    const flatStyle = StyleSheet.flatten(style);
    const initialWidth = (flatStyle?.width && typeof flatStyle.width === 'number') ? flatStyle.width : 0;
    const initialHeight = (flatStyle?.height && typeof flatStyle.height === 'number') ? flatStyle.height : 0;
    const [layoutSize, setLayoutSize] = useState({ width: initialWidth, height: initialHeight });

    const config = configOverride || timerConfigManager.getConfig(modelKey);
    const chainConfig = chainConfigOverride || (chainId ? timerConfigManager.getChainConfig(modelKey, chainId) : null);

    const swingAnim = useRef(new Animated.Value(-1)).current;
    const glintAnim = useRef(new Animated.Value(-1.5)).current;

    useEffect(() => {
        if (disableAnimations || isMinimal) return;

        // Pendulum animation: Smooth left-to-right-to-left cycle
        Animated.loop(
            Animated.sequence([
                Animated.timing(swingAnim, { toValue: 1, duration: 6000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
                Animated.timing(swingAnim, { toValue: -1, duration: 6000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
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
    const resolvedModelLayout = modelLayout || timerConfigManager.getModel(modelKey);
    const imageFrameSize = Math.max(1, Math.min(width || initialWidth || 300, height || initialHeight || 300));
    const layoutOffsetScale = imageFrameSize / 300;
    const imageScale = Math.max(0.5, Math.min(1.8, Number(resolvedModelLayout?.image_scale) || 1));
    const imageScaleX = Math.max(0.5, Math.min(1.8, Number(resolvedModelLayout?.image_scale_x) || 1));
    const imageScaleY = Math.max(0.5, Math.min(1.8, Number(resolvedModelLayout?.image_scale_y) || 1));
    const imageOffsetX = Math.max(-80, Math.min(80, Number(resolvedModelLayout?.image_offset_x) || 0));
    const imageOffsetY = Math.max(-80, Math.min(80, Number(resolvedModelLayout?.image_offset_y) || 0));

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
        outputRange: ['-3.5deg', '3.5deg']
    });

    const glintTranslate = glintAnim.interpolate({
        inputRange: [-1.5, 1.5],
        outputRange: [-((width * config.w) * 1.5), (width * config.w) * 1.5]
    });

    const activeTint = (MODEL_TINTS as Record<string, string>)[modelKey] || '#a269ff';
    const isBirthdayCapsule = capsuleType === 'birthdaycap' || modelKey === 'birthday_candy_kap';

    return (
        <View style={containerStyle} onLayout={onLayout}>
            {/* Particles - Hide if lightweight or explicitly requested */}
            {width > 0 && !hideParticles && !lightweight && !isMinimal && <Particles activeTint={activeTint} capsuleType={capsuleType} />}
            {width > 0 && isBirthdayCapsule && <BirthdayConfetti />}

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
                    {
                        zIndex: 1,
                        transform: [
                            { translateX: imageOffsetX * layoutOffsetScale },
                            { translateY: imageOffsetY * layoutOffsetScale },
                            { scaleX: imageScale * imageScaleX },
                            { scaleY: imageScale * imageScaleY },
                        ],
                    }
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
                        isOpened={isOpened}
                        lightweight={lightweight}
                    />

                    {/* Screen Glint Reflection overlay - Skip for performance if lightweight */}
                    {!isOpened && !lightweight && !disableAnimations && !isMinimal && (
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

const BirthdayConfetti = React.memo(() => {
    const pieces: Array<[string, `${number}%`, `${number}%`, `${number}deg`]> = [
        ['#FF5DA2', '9%', '17%', '8deg'], ['#7AD7FF', '19%', '9%', '-14deg'],
        ['#FFD166', '81%', '14%', '20deg'], ['#8B5CF6', '91%', '31%', '-18deg'],
        ['#34D399', '84%', '72%', '11deg'], ['#FF8A4C', '12%', '76%', '-20deg'],
        ['#F472B6', '29%', '88%', '16deg'], ['#60A5FA', '70%', '91%', '-10deg'],
        ['#FDE68A', '5%', '48%', '25deg'], ['#C084FC', '94%', '54%', '-24deg'],
    ];

    return (
        <View pointerEvents="none" style={styles.birthdayConfetti}>
            {pieces.map(([color, left, top, rotate], index) => (
                <View
                    key={`${color}-${index}`}
                    style={[
                        styles.confettiPiece,
                        {
                            backgroundColor: color,
                            left,
                            top,
                            transform: [{ rotate }],
                            borderRadius: index % 3 === 0 ? 999 : 2,
                        },
                    ]}
                />
            ))}
        </View>
    );
});

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
    },
    birthdayConfetti: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 4,
    },
    confettiPiece: {
        position: 'absolute',
        width: 7,
        height: 12,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
    }
});
