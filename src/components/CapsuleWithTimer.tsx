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
        image_open_scale?: number | string | null;
        image_open_scale_x?: number | string | null;
        image_open_scale_y?: number | string | null;
        image_open_offset_x?: number | string | null;
        image_open_offset_y?: number | string | null;
        effect_type?: string | null;
        effect_tint?: string | null;
        effect_scale?: number | string | null;
        effect_offset_x?: number | string | null;
        effect_offset_y?: number | string | null;
        effect_opacity?: number | string | null;
        effect_layer?: string | null;
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
    preferModelLayout?: boolean; // In editors, use the passed modelLayout exactly as-is
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
    preferModelLayout,
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
    const liveModelLayout = preferModelLayout ? null : timerConfigManager.getModel(modelKey);
    const snapshotLayout = modelLayout || null;
    const snapshotImage = typeof (snapshotLayout as any)?.image === 'string' ? ((snapshotLayout as any).image as string) : '';
    const snapshotOpenImage = typeof (snapshotLayout as any)?.image_open === 'string' ? ((snapshotLayout as any).image_open as string) : '';
    const liveImage = typeof (liveModelLayout as any)?.image === 'string' ? ((liveModelLayout as any).image as string) : '';
    const liveOpenImage = typeof (liveModelLayout as any)?.image_open === 'string' ? ((liveModelLayout as any).image_open as string) : '';
    const snapshotHasDistinctOpenArt = !!snapshotOpenImage && snapshotOpenImage !== snapshotImage;
    const liveHasDistinctOpenArt = !!liveOpenImage && liveOpenImage !== liveImage;
    const shouldUseLiveClosedFallback =
        !!isOpened &&
        !snapshotHasDistinctOpenArt &&
        !liveHasDistinctOpenArt &&
        !!liveModelLayout;
    const shouldUseLiveOpenLayout = !!isOpened && !!liveModelLayout;

    // Opened capsules should reflect the latest open-layout calibration from the model editor.
    // If there is no dedicated open art, they should still inherit the latest closed-layout fallback.
    const resolvedModelLayout = preferModelLayout
        ? snapshotLayout
        : shouldUseLiveClosedFallback
        ? {
            ...snapshotLayout,
            ...liveModelLayout,
            image_open_scale: (liveModelLayout as any)?.image_open_scale ?? (liveModelLayout as any)?.image_scale ?? (snapshotLayout as any)?.image_open_scale ?? (snapshotLayout as any)?.image_scale,
            image_open_scale_x: (liveModelLayout as any)?.image_open_scale_x ?? (liveModelLayout as any)?.image_scale_x ?? (snapshotLayout as any)?.image_open_scale_x ?? (snapshotLayout as any)?.image_scale_x,
            image_open_scale_y: (liveModelLayout as any)?.image_open_scale_y ?? (liveModelLayout as any)?.image_scale_y ?? (snapshotLayout as any)?.image_open_scale_y ?? (snapshotLayout as any)?.image_scale_y,
            image_open_offset_x: (liveModelLayout as any)?.image_open_offset_x ?? (liveModelLayout as any)?.image_offset_x ?? (snapshotLayout as any)?.image_open_offset_x ?? (snapshotLayout as any)?.image_offset_x,
            image_open_offset_y: (liveModelLayout as any)?.image_open_offset_y ?? (liveModelLayout as any)?.image_offset_y ?? (snapshotLayout as any)?.image_open_offset_y ?? (snapshotLayout as any)?.image_offset_y,
        }
        : shouldUseLiveOpenLayout
            ? {
                ...snapshotLayout,
                ...liveModelLayout,
                image_open_scale: (liveModelLayout as any)?.image_open_scale ?? (snapshotLayout as any)?.image_open_scale ?? (liveModelLayout as any)?.image_scale ?? (snapshotLayout as any)?.image_scale,
                image_open_scale_x: (liveModelLayout as any)?.image_open_scale_x ?? (snapshotLayout as any)?.image_open_scale_x ?? (liveModelLayout as any)?.image_scale_x ?? (snapshotLayout as any)?.image_scale_x,
                image_open_scale_y: (liveModelLayout as any)?.image_open_scale_y ?? (snapshotLayout as any)?.image_open_scale_y ?? (liveModelLayout as any)?.image_scale_y ?? (snapshotLayout as any)?.image_scale_y,
                image_open_offset_x: (liveModelLayout as any)?.image_open_offset_x ?? (snapshotLayout as any)?.image_open_offset_x ?? (liveModelLayout as any)?.image_offset_x ?? (snapshotLayout as any)?.image_offset_x,
                image_open_offset_y: (liveModelLayout as any)?.image_open_offset_y ?? (snapshotLayout as any)?.image_open_offset_y ?? (liveModelLayout as any)?.image_offset_y ?? (snapshotLayout as any)?.image_offset_y,
            }
        : (snapshotLayout || liveModelLayout);
    const imageFrameSize = Math.max(1, Math.min(width || initialWidth || 300, height || initialHeight || 300));
    const layoutOffsetScale = imageFrameSize / 300;
    const openScale = Number(resolvedModelLayout?.image_open_scale);
    const openScaleX = Number(resolvedModelLayout?.image_open_scale_x);
    const openScaleY = Number(resolvedModelLayout?.image_open_scale_y);
    const openOffsetX = Number(resolvedModelLayout?.image_open_offset_x);
    const openOffsetY = Number(resolvedModelLayout?.image_open_offset_y);
    const useOpenLayout = !!isOpened && (
        Number.isFinite(openScale) ||
        Number.isFinite(openScaleX) ||
        Number.isFinite(openScaleY) ||
        Number.isFinite(openOffsetX) ||
        Number.isFinite(openOffsetY)
    );
    const imageScale = Math.max(0.5, Math.min(1.8, useOpenLayout ? (openScale || 1) : (Number(resolvedModelLayout?.image_scale) || 1)));
    const imageScaleX = Math.max(0.5, Math.min(1.8, useOpenLayout ? (openScaleX || 1) : (Number(resolvedModelLayout?.image_scale_x) || 1)));
    const imageScaleY = Math.max(0.5, Math.min(1.8, useOpenLayout ? (openScaleY || 1) : (Number(resolvedModelLayout?.image_scale_y) || 1)));
    const imageOffsetX = Math.max(-80, Math.min(80, useOpenLayout ? (openOffsetX || 0) : (Number(resolvedModelLayout?.image_offset_x) || 0)));
    const imageOffsetY = Math.max(-80, Math.min(80, useOpenLayout ? (openOffsetY || 0) : (Number(resolvedModelLayout?.image_offset_y) || 0)));
    const effectSource = { ...(liveModelLayout || {}), ...(resolvedModelLayout || {}) };
    const activeTint = (MODEL_TINTS as Record<string, string>)[modelKey] || '#a269ff';
    const effectType = String((effectSource as any)?.effect_type || 'none');
    const effectTint = String((effectSource as any)?.effect_tint || activeTint);
    const effectScale = Math.max(0.4, Math.min(2.2, Number((effectSource as any)?.effect_scale) || 1));
    const effectOffsetX = Math.max(-120, Math.min(120, Number((effectSource as any)?.effect_offset_x) || 0));
    const effectOffsetY = Math.max(-120, Math.min(120, Number((effectSource as any)?.effect_offset_y) || 0));
    const effectOpacity = Math.max(0, Math.min(1, Number((effectSource as any)?.effect_opacity) || 1));
    const effectLayer = String((effectSource as any)?.effect_layer || 'behind');
    const effectFrameSize = imageFrameSize * effectScale;
    const shouldRenderEffect = effectType !== 'none' && effectOpacity > 0.01;

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

    const isBirthdayCapsule = capsuleType === 'birthdaycap' || modelKey === 'birthday_candy_kap';

    return (
        <View style={containerStyle} onLayout={onLayout}>
            {/* Birthday capsules use animated confetti instead of the standard particles */}
            {width > 0 && isBirthdayCapsule && !hideParticles && !lightweight && !isMinimal && <BirthdayConfetti layer="back" />}
            {width > 0 && !isBirthdayCapsule && !hideParticles && !lightweight && !isMinimal && <Particles activeTint={activeTint} capsuleType={capsuleType} />}

            {/* Shadow: behind everything via zIndex */}
            {width > 0 && (
                <View style={[styles.groundShadow, {
                    width: width * 0.9,
                    height: width * 0.9,
                    bottom: -(width * 0.33),
                    backgroundColor: darkerShadow ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)',
                }]} />
            )}

            {width > 0 && shouldRenderEffect && effectLayer !== 'front' && (
                <CapsuleEffectLayer
                    type={effectType}
                    tint={effectTint}
                    frameSize={effectFrameSize}
                    opacity={effectOpacity}
                    offsetX={effectOffsetX * layoutOffsetScale}
                    offsetY={effectOffsetY * layoutOffsetScale}
                />
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

            {width > 0 && isBirthdayCapsule && !hideParticles && !lightweight && !isMinimal && <BirthdayConfetti layer="front" />}

            {width > 0 && shouldRenderEffect && effectLayer === 'front' && (
                <CapsuleEffectLayer
                    type={effectType}
                    tint={effectTint}
                    frameSize={effectFrameSize}
                    opacity={effectOpacity}
                    offsetX={effectOffsetX * layoutOffsetScale}
                    offsetY={effectOffsetY * layoutOffsetScale}
                />
            )}

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

const CapsuleEffectLayer = React.memo(({
    type,
    tint,
    frameSize,
    opacity,
    offsetX,
    offsetY,
}: {
    type: string;
    tint: string;
    frameSize: number;
    opacity: number;
    offsetX: number;
    offsetY: number;
}) => {
    const commonStyle = [
        styles.effectWrap,
        {
            width: frameSize,
            height: frameSize,
            opacity,
            transform: [{ translateX: offsetX }, { translateY: offsetY }],
        },
    ];

    if (type === 'glow') {
        return (
            <View pointerEvents="none" style={commonStyle}>
                <View style={[styles.effectGlowCore, { backgroundColor: tint + '55' }]} />
                <View style={[styles.effectGlowOuter, { backgroundColor: tint + '22' }]} />
            </View>
        );
    }

    if (type === 'fire') {
        return (
            <View pointerEvents="none" style={commonStyle}>
                <LinearGradient
                    colors={['rgba(255,255,255,0)', '#FFD166', '#FF7A18', '#FF3D6E']}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={styles.effectFire}
                />
                <LinearGradient
                    colors={['rgba(255,255,255,0)', tint + '55', tint + '12']}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={styles.effectFireGlow}
                />
            </View>
        );
    }

    if (type === 'sparkles') {
        const sparkles = [
            { left: '18%', top: '22%', size: 7 },
            { left: '72%', top: '16%', size: 9 },
            { left: '82%', top: '52%', size: 6 },
            { left: '25%', top: '68%', size: 8 },
            { left: '62%', top: '78%', size: 7 },
        ];
        return (
            <View pointerEvents="none" style={commonStyle}>
                {sparkles.map((item, index) => (
                    <View
                        key={`${type}-${index}`}
                        style={[
                            styles.effectSparkle,
                            {
                                left: item.left as any,
                                top: item.top as any,
                                width: item.size,
                                height: item.size,
                                backgroundColor: tint,
                            },
                        ]}
                    />
                ))}
            </View>
        );
    }

    return null;
});

const BirthdayConfetti = React.memo(({ layer }: { layer: 'back' | 'front' }) => {
    const CONFETTI_COLORS = ['#FF5C8A', '#FFD166', '#06D6A0', '#4D96FF', '#A855F7', '#FF8A3D'];
    const particles = useRef(
        Array.from({ length: 18 }, (_, i) => ({
            id: i,
            left: `${(i * 37) % 96}%`,
            delay: (i % 6) * 180,
            size: 5 + (i % 4),
            color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            layer: i % 3 === 0 ? 'back' : 'front',
        }))
    ).current;
    const anims = useRef(particles.map(() => new Animated.Value(0))).current;

    useEffect(() => {
        const loops = anims.map((anim, index) =>
            Animated.loop(
                Animated.sequence([
                    Animated.delay(particles[index].delay),
                    Animated.timing(anim, {
                        toValue: 1,
                        duration: 3600 + (index % 4) * 260,
                        easing: Easing.inOut(Easing.quad),
                        useNativeDriver: true,
                    }),
                    Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
                ])
            )
        );
        loops.forEach(loop => loop.start());
        return () => {
            loops.forEach(loop => loop.stop());
        };
    }, [anims, particles]);

    return (
        <View pointerEvents="none" style={[styles.birthdayConfetti, layer === 'back' ? styles.birthdayConfettiBack : styles.birthdayConfettiFront]}>
            {particles.filter(particle => particle.layer === layer).map((particle) => {
                const index = particle.id;
                const translateY = anims[index].interpolate({ inputRange: [0, 1], outputRange: [-20, 215] });
                const translateX = anims[index].interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, index % 2 ? 14 : -14, 0] });
                const rotate = anims[index].interpolate({ inputRange: [0, 1], outputRange: ['0deg', index % 2 ? '220deg' : '-220deg'] });
                const opacity = anims[index].interpolate({ inputRange: [0, 0.1, 0.82, 1], outputRange: [0, 1, 1, 0] });

                return (
                    <Animated.View
                        key={particle.id}
                        style={[
                            styles.confettiPiece,
                            {
                                left: particle.left as any,
                                width: particle.size,
                                height: particle.size * 1.6,
                                backgroundColor: particle.color,
                                opacity,
                                top: -24,
                                transform: [
                                    { translateX },
                                    { translateY },
                                    { rotate },
                                ],
                            },
                        ]}
                    />
                );
            })}
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
    },
    birthdayConfettiBack: {
        zIndex: 0,
        opacity: 0.72,
    },
    birthdayConfettiFront: {
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
    },
    effectWrap: {
        position: 'absolute',
        zIndex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none' as any,
    },
    effectGlowCore: {
        position: 'absolute',
        width: '68%',
        height: '68%',
        borderRadius: 999,
        shadowColor: '#fff',
        shadowOpacity: 0.18,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 0 },
    },
    effectGlowOuter: {
        position: 'absolute',
        width: '94%',
        height: '94%',
        borderRadius: 999,
    },
    effectFire: {
        position: 'absolute',
        bottom: '6%',
        width: '72%',
        height: '42%',
        borderTopLeftRadius: 120,
        borderTopRightRadius: 120,
        borderBottomLeftRadius: 70,
        borderBottomRightRadius: 70,
    },
    effectFireGlow: {
        position: 'absolute',
        bottom: '0%',
        width: '90%',
        height: '52%',
        borderRadius: 140,
    },
    effectSparkle: {
        position: 'absolute',
        borderRadius: 999,
        shadowColor: '#fff',
        shadowOpacity: 0.5,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 0 },
    },
});
