import React, { useRef, useEffect, useState, useMemo } from 'react';
import {
    View, Text, StyleSheet, Animated, Easing,
    Dimensions, Platform, TouchableOpacity,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { useTranslation } from 'react-i18next';
import CapsuleWithTimer from '../CapsuleWithTimer';

const { width, height } = Dimensions.get('window');

// Colores base de la app
const DETAIL_PURPLE = '#955aff';
const WHITE = '#ffffff';
const BLACK = '#000000';

type Phase = 'intro_quote' | 'vibrate' | 'flash' | 'outburst' | 'opened';

interface EpicOpeningProps {
    capsuleTitle: string;
    onComplete: () => void;
    epicImageUrls?: string[];
    modelImg?: string; 
    closedModelImg?: string;
    modelKey?: string;
    modelLayout?: any;
    tint?: string;
    countdown?: number;
}

const PARTICLES_COUNT = 30;
const OUTBURST_COUNT = 15;

export const EpicOpening = ({
    capsuleTitle, onComplete, epicImageUrls = [], modelImg, closedModelImg, modelKey = 'basicred_kap', modelLayout, tint, countdown = 10
}: EpicOpeningProps) => {
    const { t } = useTranslation();
    const [phase, setPhase] = useState<Phase>('intro_quote');
    const activeTint = tint || DETAIL_PURPLE;

    // Valores animados
    const introOpacity = useRef(new Animated.Value(0)).current;
    const vibratePos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
    const vibrateOpacity = useRef(new Animated.Value(1)).current; 
    const intensity = useRef(new Animated.Value(1)).current;
    const intensityRef = useRef(1);
    const [imgLoadError, setImgLoadError] = useState(false);
    const [openedImgLoadError, setOpenedImgLoadError] = useState(false);
    const flashOpacity = useRef(new Animated.Value(0)).current;
    const openedOpacity = useRef(new Animated.Value(0)).current;
    const openedScale = useRef(new Animated.Value(0.7)).current;
    const vibrateScale = useRef(new Animated.Value(1)).current;
    const vibrateRot = useRef(new Animated.Value(0)).current;
    
    // Asset loading state
    const [soundsReady, setSoundsReady] = useState(false);
    const [imagesLoaded, setImagesLoaded] = useState(false);
    const [introMinTimeDone, setIntroMinTimeDone] = useState(false);

    // Particles values
    const particles = useRef([...Array(PARTICLES_COUNT)].map(() => ({
        pos: new Animated.ValueXY({ x: 0, y: 0 }),
        opacity: new Animated.Value(0),
        scale: new Animated.Value(Math.random() * 0.5 + 0.5),
    }))).current;

    // Media Outburst values
    const outburstItems = useRef([...Array(OUTBURST_COUNT)].map((_, i) => ({
        pos: new Animated.ValueXY({ x: 0, y: 0 }),
        opacity: new Animated.Value(0),
        scale: new Animated.Value(0.1),
        rotate: new Animated.Value(0),
        type: i % 4 === 0 ? 'image' : i % 4 === 1 ? 'video' : i % 4 === 2 ? 'audio' : 'note',
        url: epicImageUrls[i % epicImageUrls.length] || null,
        target: {
            x: (Math.random() - 0.5) * width * 1.1,
            y: (Math.random() - 0.5) * height * 1.0,
            rot: (Math.random() - 0.5) * 60
        }
    }))).current;

    const introPad = useRef<Audio.Sound | null>(null);   // Phase 1: intro ambient
    const rumbleSound = useRef<Audio.Sound | null>(null); // Phase 2: vibration rumble
    const cardFlip = useRef<Audio.Sound | null>(null);    // Phase 3: card reveal
    const openSound = useRef<Audio.Sound | null>(null);   // Flash/open transition
    const vibeFrame = useRef<number | undefined>(undefined);

    useEffect(() => {
        const listenerId = intensity.addListener(({ value }) => {
            intensityRef.current = value;
        });
        loadSounds();
        prefetchImages();
        startSequence();
        return () => {
            intensity.removeListener(listenerId);
            if (vibeFrame.current) cancelAnimationFrame(vibeFrame.current);
            introPad.current?.unloadAsync();
            rumbleSound.current?.unloadAsync();
            cardFlip.current?.unloadAsync();
            openSound.current?.unloadAsync();
        };
    }, []);

    useEffect(() => {
        if (soundsReady && imagesLoaded && introMinTimeDone) {
            proceedToVibration();
        }
    }, [soundsReady, imagesLoaded, introMinTimeDone]);

    useEffect(() => {
        if (__DEV__) {
            console.log("[EpicOpening] Status:", { soundsReady, imagesLoaded, introMinTimeDone });
        }
    }, [soundsReady, imagesLoaded, introMinTimeDone]);

    const loadSounds = async () => {
        try {
            await Audio.setAudioModeAsync({
                playsInSilentModeIOS: true,
                staysActiveInBackground: false,
                shouldDuckAndroid: true,
                interruptionModeIOS: InterruptionModeIOS.DoNotMix,
                interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
                playThroughEarpieceAndroid: false,
            });

            const cfg = { shouldPlay: false, volume: 1.0 };

            // 3 reliable sounds from public CDNs
            const [
                { sound: s1 }, // intro ambient pad
                { sound: s2 }, // rumble / vibrate
                { sound: s3 }, // card flip
                { sound: s4 }, // open flash whoosh
            ] = await Promise.all([
                Audio.Sound.createAsync(
                    { uri: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_b35d32f8b2.mp3' }, // soft ambient drone
                    { ...cfg, volume: 0.45, isLooping: true }
                ),
                Audio.Sound.createAsync(
                    { uri: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c1539c.mp3' }, // low rumble
                    { ...cfg, volume: 0.8, isLooping: true }
                ),
                Audio.Sound.createAsync(
                    { uri: 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_39187cf94f.mp3' }, // card whoosh
                    { ...cfg, volume: 0.7 }
                ),
                Audio.Sound.createAsync(
                    { uri: 'https://cdn.pixabay.com/download/audio/2021/08/09/audio_dc39bede7d.mp3' }, // shiny open
                    { ...cfg, volume: 0.9 }
                ),
            ]);

            introPad.current = s1;
            rumbleSound.current = s2;
            cardFlip.current = s3;
            openSound.current = s4;

            console.log('[EpicOpening] Sounds loaded OK');
            setSoundsReady(true);
        } catch (e) {
            console.log('[EpicOpening] Error loading sounds:', e);
            setSoundsReady(true); // never block the animation
        }
    };

    const prefetchImages = async () => {
        if (!closedModelImg && !modelImg) {
            setImagesLoaded(true);
            return;
        }
        try {
            const urls = [];
            if (closedModelImg) urls.push(closedModelImg);
            if (modelImg) urls.push(modelImg);
            
            await Image.prefetch(urls);
            console.log("Images prefetched successfully in EpicOpening");
            setImagesLoaded(true);
        } catch (e) {
            console.log("Error prefetching images", e);
            setImagesLoaded(true); // Proceed anyway
        }
    };

    const startSequence = () => {
        // Phase 1: Intro — play ambient pad
        introPad.current?.playAsync().catch(() => {});
        Animated.timing(introOpacity, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
        }).start(() => {
            setTimeout(() => setIntroMinTimeDone(true), 3000);
        });
    };

    const proceedToVibration = () => {
        if (phase !== 'intro_quote') return;
        Animated.timing(introOpacity, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: true,
        }).start(() => {
            introPad.current?.stopAsync().catch(() => {});
            startVibrationPhase();
        });
    };

    const startVibrationPhase = () => {
        setPhase('vibrate');
        // Phase 2: Vibration rumble loop
        rumbleSound.current?.playAsync().catch(() => {});
        rumbleSound.current?.setIsLoopingAsync(true).catch(() => {});
        
        Animated.timing(vibrateOpacity, { toValue: 1, duration: 1000, useNativeDriver: true }).start();

        // Vibration loop (Rotational for more "aesthetic" feel)
        const shake = () => {
            if (intensityRef.current === 0) return; // Stop if intensity is 0
            
            const mult = intensityRef.current * 2; // Max ~8 degrees — subtler shake
            vibrateRot.setValue((Math.random() - 0.5) * mult);
            
            vibeFrame.current = requestAnimationFrame(shake);
        };
        shake();

        // Increase intensity and scale over 7 seconds
        Animated.parallel([
            Animated.timing(intensity, { toValue: 3, duration: 7000, useNativeDriver: true }),
            Animated.timing(vibrateScale, { toValue: 1.06, duration: 7000, useNativeDriver: true }),
        ]).start();

        // Particles outburst gradually
        particles.forEach((p, i) => {
            Animated.sequence([
                Animated.delay(2000 + i * 200),
                Animated.parallel([
                    Animated.timing(p.opacity, { toValue: 0.6, duration: 300, useNativeDriver: true }),
                    Animated.timing(p.pos, {
                        toValue: { x: (Math.random() - 0.5) * 500, y: (Math.random() - 0.5) * 500 },
                        duration: 2000,
                        easing: Easing.out(Easing.exp),
                        useNativeDriver: true
                    }),
                    Animated.timing(p.opacity, { toValue: 0, duration: 2000, useNativeDriver: true })
                ])
            ]).start();
        });

        // 7 seconds of vibrating then FLASH
        setTimeout(() => {
            if (vibeFrame.current) cancelAnimationFrame(vibeFrame.current);
            vibrateRot.setValue(0);
            intensityRef.current = 0;
            startFlashPhase();
        }, 7000);
    };

    const startFlashPhase = () => {
        setPhase('flash');
        rumbleSound.current?.stopAsync().catch(() => {});
        // Play open whoosh on the flash
        openSound.current?.replayAsync().catch(() => {});
        
        Animated.sequence([
            Animated.timing(flashOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
            Animated.delay(50),
            Animated.parallel([
                Animated.timing(flashOpacity, { toValue: 0, duration: 1200, useNativeDriver: true }),
                Animated.timing(openedOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
                Animated.spring(openedScale, { toValue: 1, friction: 5, tension: 30, useNativeDriver: true }),
            ])
        ]).start(() => {
            startOutburstPhase();
        });
    };

    const startOutburstPhase = () => {
        setPhase('outburst');

        // Phase 3: play card flip sound for each card with stagger
        outburstItems.forEach((item, i) => {
            Animated.sequence([
                Animated.delay(i * 100),
                Animated.parallel([
                    Animated.timing(item.opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
                    Animated.spring(item.pos, {
                        toValue: { x: item.target.x, y: item.target.y },
                        friction: 6, tension: 40, useNativeDriver: true
                    }),
                    Animated.spring(item.scale, { toValue: 1, friction: 5, useNativeDriver: true }),
                    Animated.timing(item.rotate, {
                        toValue: 1, duration: 800,
                        easing: Easing.out(Easing.back(1)), useNativeDriver: true
                    })
                ])
            ]).start();

            // Card flip sound — play every card with a small offset
            setTimeout(() => {
                cardFlip.current?.replayAsync().catch(() => {});
            }, i * 100);
        });

        // End opening after cards
        setTimeout(() => {
            setPhase('opened');
            setTimeout(onComplete, 5500);
        }, 3000);
    };

    const renderMediaCard = (item: any, i: number) => {
        const rotation = item.rotate.interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', `${item.target.rot}deg`]
        });

        return (
            <Animated.View
                key={i}
                style={[
                    styles.mediaCard,
                    {
                        opacity: item.opacity,
                        transform: [
                            { translateX: item.pos.x },
                            { translateY: item.pos.y },
                            { scale: item.scale },
                            { rotate: rotation }
                        ],
                        zIndex: 1000 + i
                    }
                ]}
            >
                {item.type === 'image' || item.type === 'video' ? (
                    item.url ? (
                        <Image source={{ uri: item.url }} style={styles.cardImg} contentFit="cover" cachePolicy="memory-disk" />
                    ) : (
                        <View style={[styles.cardPlaceholder, { backgroundColor: activeTint + '20' }]}>
                            <Ionicons name="image-outline" size={24} color={activeTint} />
                        </View>
                    )
                ) : item.type === 'audio' ? (
                    <View style={[styles.cardPlaceholder, { backgroundColor: '#58CC02' + '20' }]}>
                        <Ionicons name="mic-outline" size={24} color="#58CC02" />
                    </View>
                ) : (
                    <View style={[styles.cardPlaceholder, { backgroundColor: '#FFB800' + '20' }]}>
                        <Ionicons name="reader-outline" size={24} color="#FFB800" />
                    </View>
                )}
                <View style={styles.cardEdge} />
            </Animated.View>
        );
    };

    return (
        <View style={styles.container}>
            {/* BACKGROUNDS */}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: phase === 'intro_quote' ? BLACK : WHITE }]} />

            {/* INTRO QUOTE */}
            {phase === 'intro_quote' && (
                <Animated.View style={[styles.introBox, { opacity: introOpacity, backgroundColor: 'transparent' }]}>
                    <Text style={styles.mainQuote}>
                        "{t('detail.opening_quote')}"
                    </Text>
                </Animated.View>
            )}

            {/* ── CENTRAL CAPSULE (Persistent through all active phases) ── */}
            {phase !== 'intro_quote' && (
                <Animated.View style={[
                    styles.centerStage, 
                    { 
                        opacity: (phase === 'opened') ? openedOpacity : vibrateOpacity,
                        transform: (phase === 'opened') ? [{ scale: openedScale }] : []
                    }
                ]}>
                    {/* Particles - Visible during vibration and flash */}
                    {(phase === 'vibrate' || phase === 'flash') && particles.map((p, i) => (
                        <Animated.View
                            key={i}
                            style={[
                                styles.particle,
                                {
                                    backgroundColor: activeTint,
                                    opacity: p.opacity,
                                    transform: [
                                        { translateX: p.pos.x },
                                        { translateY: p.pos.y },
                                        { scale: p.scale }
                                    ]
                                }
                            ]}
                        />
                    ))}

                    <Animated.View style={{ 
                        transform: [
                            { translateX: vibratePos.x }, 
                            { translateY: vibratePos.y }, 
                            { scale: vibrateScale },
                            { rotate: vibrateRot.interpolate({
                                inputRange: [-10, 10],
                                outputRange: ['-10deg', '10deg']
                            })}
                        ],
                        zIndex: 100,
                        backgroundColor: 'transparent'
                    }}>
                        <CapsuleWithTimer 
                            modelKey={modelKey}
                            source={{ uri: (phase === 'outburst' || phase === 'opened') ? modelImg : closedModelImg }}
                            date={new Date().toISOString()}
                            modelLayout={modelLayout}
                            style={styles.capsuleModel}
                            hideTimer
                            hideParticles
                            isOpened={phase === 'outburst' || phase === 'opened'}
                            disableAnimations
                        />
                    </Animated.View>
                </Animated.View>
            )}

            {/* OPENED REVEAL CARD OVERLAY (Text and UI only, no box background) */}
            {phase === 'opened' && (
                <Animated.View style={[styles.finalReveal, { opacity: openedOpacity, transform: [{ scale: openedScale }], backgroundColor: 'transparent' }]}>
                    <View style={styles.revealContentWrapper}>
                        <View style={styles.finalModelBox}>
                            {/* Spacing for the capsule rendered by centerStage */}
                            <View style={styles.fullCapsule} />
                        </View>
                        <Text style={[styles.successText, { color: activeTint }]}>¡CÁPSULA ABIERTA!</Text>
                        <Text style={styles.capsuleNameFinal}>{capsuleTitle}</Text>
                        <View style={[styles.line, { backgroundColor: activeTint }]} />
                    </View>
                </Animated.View>
            )}

            {/* OUTBURST MEDIA CARDS */}
            {(phase === 'outburst' || phase === 'opened') && (
                <View style={styles.outburstContainer} pointerEvents="none">
                    {outburstItems.map((item, i) => renderMediaCard(item, i))}
                </View>
            )}

            {/* THE FLASH */}
            <Animated.View 
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, { backgroundColor: WHITE, opacity: flashOpacity, zIndex: 9999 }]} 
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    introBox: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: BLACK,
        paddingHorizontal: '10%',
        zIndex: 100,
    },
    mainQuote: {
        color: WHITE,
        fontSize: 22,
        fontWeight: '600',
        textAlign: 'center',
        lineHeight: 36,
        fontStyle: 'italic',
    },
    centerStage: {
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
        width: width,
        height: height,
    },
    capsuleModel: {
        width: 320,
        height: 320,
    },
    particle: {
        position: 'absolute',
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    outburstContainer: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2000,
    },
    mediaCard: {
        position: 'absolute',
        width: 110,
        height: 130,
        backgroundColor: WHITE,
        borderRadius: 15,
        padding: 6,
        borderWidth: 1.5,
        borderColor: '#F0F0F0',
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 15 },
            android: { elevation: 8 }
        })
    },
    cardImg: {
        width: '100%',
        height: '100%',
        borderRadius: 10,
    },
    cardPlaceholder: {
        width: '100%',
        height: '100%',
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cardEdge: {
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        height: 5,
        backgroundColor: 'rgba(0,0,0,0.04)',
        borderBottomLeftRadius: 15,
        borderBottomRightRadius: 15,
    },
    finalReveal: {
        position: 'absolute',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 50,
        width: width,
        height: height,
    },
    revealCard: {
        width: width * 0.88,
        height: height * 0.70,
        borderRadius: 45,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1.5,
        padding: 25,
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 30 },
            android: { elevation: 15 }
        })
    },
    revealContentWrapper: {
        width: width * 0.9,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    finalModelBox: {
        width: '100%',
        height: height * 0.45,
        justifyContent: 'center',
        alignItems: 'center',
    },
    fullCapsule: {
        width: 340,
        height: 340,
    },
    successText: {
        fontSize: 32,
        fontWeight: '900',
        marginTop: 10,
        letterSpacing: 1.5,
        textShadowColor: 'rgba(0,0,0,0.1)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
    },
    capsuleNameFinal: {
        fontSize: 18,
        color: '#5C5778',
        marginTop: 8,
        fontWeight: '600',
    },
    line: {
        width: 65,
        height: 5,
        borderRadius: 2.5,
        marginTop: 25,
    },
    closeBtn: {
        marginTop: 40,
        paddingHorizontal: 40,
        paddingVertical: 14,
        borderRadius: 30,
        elevation: 4,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
    },
    closeBtnText: {
        color: WHITE,
        fontSize: 16,
        fontWeight: 'bold',
        letterSpacing: 0.5,
    },
});
