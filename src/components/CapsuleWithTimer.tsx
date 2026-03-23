import React, { useState, useEffect, useRef } from 'react';
import { View, Image, StyleSheet, LayoutChangeEvent, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import LiveTimer from './LiveTimer';
import { timerConfigManager, ModelTimerConfig } from '../utils/timerConfig';
import { MODEL_TINTS } from '../constants/models';
import Particles from './Particles';


interface CapsuleWithTimerProps {
    modelKey: string;
    source: any; // Image source
    date: string; // The target date for the timer
    style?: any; // External dimensions (e.g. { width: 140, height: 140 })
    chainId?: string | null; // Selected chain ID
    configOverride?: ModelTimerConfig; // Used by the calibration tool
    hideTimer?: boolean; // Hide the timer overlay entirely
    capsuleType?: string; // Optional type for specific particles
    isOpened?: boolean; // New prop for status
    hideParticles?: boolean; // Suppress particles (for thumbnails, notifications)
    darkerShadow?: boolean; // Use more intense shadow
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
}: CapsuleWithTimerProps) => {
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [config, setConfig] = useState(configOverride || timerConfigManager.getConfig(modelKey));
    const [chainConfig, setChainConfig] = useState(chainId ? timerConfigManager.getChainConfig(modelKey, chainId) : null);
    const swingAnim = useRef(new Animated.Value(0)).current;
    const glintAnim = useRef(new Animated.Value(-1.5)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(swingAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
                Animated.timing(swingAnim, { toValue: -1, duration: 3000, useNativeDriver: true }),
                Animated.timing(swingAnim, { toValue: 0, duration: 1500, useNativeDriver: true })
            ])
        ).start();

        // Glint reflection animation every 6 seconds
        Animated.loop(
            Animated.sequence([
                Animated.timing(glintAnim, { toValue: 1.5, duration: 1200, useNativeDriver: true }),
                Animated.delay(4800)
            ])
        ).start();

        return () => { };
    }, []);

    useEffect(() => {
        if (configOverride) {
            setConfig(configOverride);
            return;
        }

        const updateAll = () => {
            setConfig(timerConfigManager.getConfig(modelKey));
            setChainConfig(chainId ? timerConfigManager.getChainConfig(modelKey, chainId) : null);
        };

        const unsubscribe = timerConfigManager.subscribe(updateAll);
        updateAll();

        return unsubscribe;
    }, [modelKey, configOverride, chainId]);

    const onLayout = (e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 0 && height > 0) {
            setDimensions({ width, height });
        }
    };

    const { width, height } = dimensions;

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
        justifyContent: 'center' as const,
    } : { opacity: 0 };

    // Scale font based on timer height
    const baseFontSize = Math.max(10, (height * config.h) * 0.55);



    const rotateInterp = swingAnim.interpolate({
        inputRange: [-1, 1],
        outputRange: ['-3deg', '3deg']
    });

    const glintTranslate = glintAnim.interpolate({
        inputRange: [-1.5, 1.5],
        outputRange: [-((width * config.w) * 1.5), (width * config.w) * 1.5]
    });

    const activeTint = (MODEL_TINTS as Record<string, string>)[modelKey] || '#a269ff';

    return (
        <View style={containerStyle} onLayout={onLayout}>
            {/* Particles */}
            {width > 0 && !hideParticles && <Particles activeTint={activeTint} capsuleType={capsuleType} />}

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
                resizeMode="contain"
            />
            {width > 0 && !hideTimer && (
                <View style={[timerStyle, { zIndex: 2 }]}>
                    <LiveTimer
                        date={date}
                        modelId={modelKey}
                        configOverride={config}
                        style={{ fontSize: baseFontSize }}
                        hideLabel={isOpened}
                    />

                    {/* Screen Glint Reflection overlay */}
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
                </View>
            )}
            {width > 0 && chainItem && chainConfig && (
                <View style={[chainOverlayStyle, { zIndex: 2 }]}>
                    <Animated.View style={{
                        width: '100%',
                        height: '100%',
                        transform: [
                            { translateY: -((height * chainConfig.scale) / 2) },
                            { rotate: rotateInterp },
                            { translateY: (height * chainConfig.scale) / 2 }
                        ]
                    }}>
                        <Image
                            source={{ uri: chainItem.image_url }}
                            style={{ width: '100%', height: '100%' }}
                            resizeMode="contain"
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
