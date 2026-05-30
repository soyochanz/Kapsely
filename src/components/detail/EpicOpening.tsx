import React, { useRef, useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Animated,
    Easing,
    Dimensions,
    Platform,
    Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { useTranslation } from 'react-i18next';
import CapsuleWithTimer from '../CapsuleWithTimer';

const { width, height } = Dimensions.get('window');

const BRAND_PURPLE = 'rgb(166, 110, 255)';
const BRAND_PURPLE_HEX = '#A66EFF';
const WHITE = '#ffffff';
const SOFT_TEXT = '#5C5778';
const LIGHT_TEXT = '#9B96B5';
const CARD_BORDER = '#F0ECFF';

type Phase =
    | 'intro'
    | 'awakening'
    | 'unlocking'
    | 'memory_release'
    | 'opened';

interface EpicOpeningProps {
    capsuleTitle: string;
    onComplete: () => void;
    epicImageUrls?: string[];
    flashbackComments?: string[];
    likeCount?: number;
    modelImg?: string;
    closedModelImg?: string;
    modelKey?: string;
    modelLayout?: any;
    tint?: string;
    countdown?: number;
    lockedForText?: string;
    interactive?: boolean;
    passiveTargetDate?: string | null;
    spectatorLabel?: string;
}

const PARTICLES_COUNT = 24;
const MEMORY_COUNT = 7;
const OPEN_BURST_COUNT = 14;
const INTRO_CAPSULE_SIZE = 250;

export const EpicOpening = ({
    capsuleTitle,
    onComplete,
    epicImageUrls = [],
    flashbackComments = [],
    likeCount = 0,
    modelImg,
    closedModelImg,
    modelKey = 'basicred_kap',
    modelLayout,
    tint,
    countdown = 10,
    lockedForText,
    interactive = true,
    passiveTargetDate,
    spectatorLabel,
}: EpicOpeningProps) => {
    const { t } = useTranslation();
    const activeTint = tint || BRAND_PURPLE;

    const [phase, setPhase] = useState<Phase>('intro');
    const [soundsReady, setSoundsReady] = useState(false);
    const [imagesLoaded, setImagesLoaded] = useState(false);
    const [introMinTimeDone, setIntroMinTimeDone] = useState(false);
    const [canTriggerOpening, setCanTriggerOpening] = useState(false);
    const [isPressingToOpen, setIsPressingToOpen] = useState(false);

    const introOpacity = useRef(new Animated.Value(0)).current;
    const introTranslateY = useRef(new Animated.Value(18)).current;

    const stageOpacity = useRef(new Animated.Value(0)).current;
    const capsuleScale = useRef(new Animated.Value(0.92)).current;
    const capsuleRotate = useRef(new Animated.Value(0)).current;
    const capsuleFloat = useRef(new Animated.Value(0)).current;

    const haloOpacity = useRef(new Animated.Value(0)).current;
    const haloScale = useRef(new Animated.Value(0.75)).current;

    const ringScale = useRef(new Animated.Value(0.4)).current;
    const ringOpacity = useRef(new Animated.Value(0)).current;

    const flashOpacity = useRef(new Animated.Value(0)).current;

    const openedOpacity = useRef(new Animated.Value(0)).current;
    const openedScale = useRef(new Animated.Value(0.94)).current;
    const finalTextOpacity = useRef(new Animated.Value(0)).current;
    const finalTextTranslateY = useRef(new Animated.Value(18)).current;

    const timeLabelOpacity = useRef(new Animated.Value(0)).current;
    const timeLabelTranslateY = useRef(new Animated.Value(12)).current;
    const holdProgress = useRef(new Animated.Value(0)).current;
    const liquidWaveShift = useRef(new Animated.Value(0)).current;
    const introCapsulePressScale = useRef(new Animated.Value(1)).current;

    const shimmerTranslate = useRef(new Animated.Value(-width)).current;

    const introPad = useRef<Audio.Sound | null>(null);
    const unlockSound = useRef<Audio.Sound | null>(null);
    const releaseSound = useRef<Audio.Sound | null>(null);

    const floatLoopRef = useRef<Animated.CompositeAnimation | null>(null);
    const haloLoopRef = useRef<Animated.CompositeAnimation | null>(null);
    const shimmerLoopRef = useRef<Animated.CompositeAnimation | null>(null);
    const holdCompleteRef = useRef(false);
    const holdAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
    const liquidWaveLoopRef = useRef<Animated.CompositeAnimation | null>(null);

    const particles = useRef(
        [...Array(PARTICLES_COUNT)].map(() => ({
            pos: new Animated.ValueXY({ x: 0, y: 0 }),
            opacity: new Animated.Value(0),
            scale: new Animated.Value(Math.random() * 0.45 + 0.45),
            target: {
                x: (Math.random() - 0.5) * width * 0.9,
                y: (Math.random() - 0.5) * height * 0.65,
            },
        }))
    ).current;

    const openBurstParticles = useRef(
        [...Array(OPEN_BURST_COUNT)].map((_, i) => {
            const angle = (Math.PI * 2 * i) / OPEN_BURST_COUNT;
            const radius = 78 + (i % 4) * 18;
            return {
                pos: new Animated.ValueXY({ x: 0, y: 0 }),
                opacity: new Animated.Value(0),
                scale: new Animated.Value(0.3),
                target: {
                    x: Math.cos(angle) * radius,
                    y: Math.sin(angle) * radius - 8,
                },
            };
        })
    ).current;

    const memoryItems = useRef(
        [...Array(MEMORY_COUNT)].map((_, i) => {
            const angle = (Math.PI * 2 * i) / MEMORY_COUNT - Math.PI / 2;
            const radiusX = width * 0.32;
            const radiusY = height * 0.22;

            return {
                pos: new Animated.ValueXY({ x: 0, y: 0 }),
                opacity: new Animated.Value(0),
                scale: new Animated.Value(0.2),
                rotate: new Animated.Value(0),
                type:
                    i % 4 === 0
                        ? 'image'
                        : i % 4 === 1
                        ? 'video'
                        : i % 4 === 2
                        ? 'audio'
                        : 'note',
                url: epicImageUrls[i % Math.max(epicImageUrls.length, 1)] || null,
                target: {
                    x: Math.cos(angle) * radiusX,
                    y: Math.sin(angle) * radiusY,
                    rot: (Math.random() - 0.5) * 18,
                },
            };
        })
    ).current;

    useEffect(() => {
        loadSounds();
        prefetchImages();
        startIntro();

        return () => {
            floatLoopRef.current?.stop();
            haloLoopRef.current?.stop();
            shimmerLoopRef.current?.stop();
            holdAnimationRef.current?.stop?.();
            liquidWaveLoopRef.current?.stop?.();
            introPad.current?.unloadAsync();
            unlockSound.current?.unloadAsync();
            releaseSound.current?.unloadAsync();
        };
    }, []);

    useEffect(() => {
        if (imagesLoaded && introMinTimeDone && phase === 'intro') {
            if (interactive) {
                setCanTriggerOpening(true);
            } else {
                startPassiveOpening();
            }
        }
    }, [imagesLoaded, introMinTimeDone, phase, interactive]);

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

            const cfg = { shouldPlay: false, volume: 1 };

            const soundTimeout = new Promise((resolve) => setTimeout(() => resolve(null), 1800));
            const loadedSounds = await Promise.race([
                Promise.all([
                    Audio.Sound.createAsync(
                        { uri: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_b35d32f8b2.mp3' },
                        { ...cfg, volume: 0.28, isLooping: true }
                    ),
                    Audio.Sound.createAsync(
                        { uri: 'https://cdn.pixabay.com/download/audio/2021/08/09/audio_dc39bede7d.mp3' },
                        { ...cfg, volume: 0.75 }
                    ),
                    Audio.Sound.createAsync(
                        { uri: 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_39187cf94f.mp3' },
                        { ...cfg, volume: 0.45 }
                    ),
                ]),
                soundTimeout,
            ]) as any;

            if (!loadedSounds) {
                setSoundsReady(true);
                return;
            }

            const [{ sound: s1 }, { sound: s2 }, { sound: s3 }] = loadedSounds;

            introPad.current = s1;
            unlockSound.current = s2;
            releaseSound.current = s3;

            setSoundsReady(true);
        } catch (e) {
            console.log('[EpicOpening] Error loading sounds:', e);
            setSoundsReady(true);
        }
    };

    const prefetchImages = async () => {
        try {
            const urls: string[] = [];

            if (closedModelImg) urls.push(closedModelImg);
            if (modelImg) urls.push(modelImg);
            epicImageUrls.forEach((url) => {
                if (url) urls.push(url);
            });

            if (urls.length > 0) {
                await Promise.race([
                    Image.prefetch(urls),
                    new Promise((resolve) => setTimeout(resolve, 2000)),
                ]);
            }

            setImagesLoaded(true);
        } catch (e) {
            console.log('[EpicOpening] Error prefetching images:', e);
            setImagesLoaded(true);
        }
    };

    const startIntro = () => {
        introPad.current?.playAsync().catch(() => {});

        Animated.parallel([
            Animated.timing(introOpacity, {
                toValue: 1,
                duration: 700,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.timing(introTranslateY, {
                toValue: 0,
                duration: 700,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
        ]).start();

        Animated.parallel([
            Animated.timing(timeLabelOpacity, {
                toValue: 1,
                duration: 900,
                delay: 500,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.timing(timeLabelTranslateY, {
                toValue: 0,
                duration: 900,
                delay: 500,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
        ]).start();

        setTimeout(() => {
            setIntroMinTimeDone(true);
        }, 2600);
    };

    const enterAwakening = (unlockDelayMs: number) => {
        holdCompleteRef.current = true;
        setIsPressingToOpen(false);
        holdAnimationRef.current?.stop?.();
        liquidWaveLoopRef.current?.stop?.();

        Animated.timing(holdProgress, {
            toValue: 1,
            duration: 140,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();

        Animated.timing(liquidWaveShift, {
            toValue: 0,
            duration: 180,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();

        setPhase('awakening');

        Animated.parallel([
            Animated.timing(introOpacity, {
                toValue: 0,
                duration: 550,
                easing: Easing.inOut(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.timing(stageOpacity, {
                toValue: 1,
                duration: 900,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.spring(capsuleScale, {
                toValue: 1,
                friction: 8,
                tension: 42,
                useNativeDriver: true,
            }),
        ]).start(() => {
            startAmbientMotion();
            startParticles();
            setTimeout(startUnlocking, unlockDelayMs);
        });
    };

    const startAwakening = () => {
        if (!canTriggerOpening || phase !== 'intro') return;
        enterAwakening(4300);
    };

    const startPassiveOpening = () => {
        if (phase !== 'intro') return;
        const remainingMs = passiveTargetDate
            ? Math.max(3200, new Date(passiveTargetDate).getTime() - Date.now())
            : 12900;
        const unlockAndRevealTailMs = 8600;
        const unlockDelayMs = Math.max(1200, remainingMs - unlockAndRevealTailMs);
        enterAwakening(unlockDelayMs);
    };

    const handlePressInCapsule = () => {
        if (!canTriggerOpening || phase !== 'intro' || holdCompleteRef.current) return;
        setIsPressingToOpen(true);

        Animated.spring(introCapsulePressScale, {
            toValue: 0.975,
            friction: 7,
            tension: 120,
            useNativeDriver: true,
        }).start();

        liquidWaveLoopRef.current?.stop?.();
        liquidWaveLoopRef.current = Animated.loop(
            Animated.sequence([
                Animated.timing(liquidWaveShift, {
                    toValue: 1,
                    duration: 650,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
                Animated.timing(liquidWaveShift, {
                    toValue: -1,
                    duration: 650,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
            ])
        );
        liquidWaveLoopRef.current.start();

        holdAnimationRef.current?.stop?.();
        holdAnimationRef.current = Animated.timing(holdProgress, {
            toValue: 1,
            duration: 1300,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
        });
        holdAnimationRef.current.start(({ finished }) => {
            if (finished && !holdCompleteRef.current) {
                startAwakening();
            }
        });
    };

    const handlePressOutCapsule = () => {
        if (holdCompleteRef.current || phase !== 'intro') return;
        setIsPressingToOpen(false);
        holdAnimationRef.current?.stop?.();
        liquidWaveLoopRef.current?.stop?.();

        Animated.spring(introCapsulePressScale, {
            toValue: 1,
            friction: 7,
            tension: 120,
            useNativeDriver: true,
        }).start();

        Animated.timing(liquidWaveShift, {
            toValue: 0,
            duration: 200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();

        Animated.timing(holdProgress, {
            toValue: 0,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    };

    const startAmbientMotion = () => {
        floatLoopRef.current = Animated.loop(
            Animated.sequence([
                Animated.timing(capsuleFloat, {
                    toValue: -10,
                    duration: 1800,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
                Animated.timing(capsuleFloat, {
                    toValue: 0,
                    duration: 1800,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
            ])
        );

        haloLoopRef.current = Animated.loop(
            Animated.sequence([
                Animated.parallel([
                    Animated.timing(haloOpacity, {
                        toValue: 0.2,
                        duration: 1600,
                        easing: Easing.inOut(Easing.cubic),
                        useNativeDriver: true,
                    }),
                    Animated.timing(haloScale, {
                        toValue: 1.15,
                        duration: 1600,
                        easing: Easing.inOut(Easing.cubic),
                        useNativeDriver: true,
                    }),
                ]),
                Animated.parallel([
                    Animated.timing(haloOpacity, {
                        toValue: 0.1,
                        duration: 1600,
                        easing: Easing.inOut(Easing.cubic),
                        useNativeDriver: true,
                    }),
                    Animated.timing(haloScale, {
                        toValue: 0.95,
                        duration: 1600,
                        easing: Easing.inOut(Easing.cubic),
                        useNativeDriver: true,
                    }),
                ]),
            ])
        );

        shimmerLoopRef.current = Animated.loop(
            Animated.sequence([
                Animated.timing(shimmerTranslate, {
                    toValue: width,
                    duration: 2200,
                    easing: Easing.inOut(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.delay(900),
                Animated.timing(shimmerTranslate, {
                    toValue: -width,
                    duration: 0,
                    useNativeDriver: true,
                }),
            ])
        );

        floatLoopRef.current.start();
        haloLoopRef.current.start();
        shimmerLoopRef.current.start();
    };

    const startParticles = () => {
        particles.forEach((p, i) => {
            Animated.loop(
                Animated.sequence([
                    Animated.delay(i * 120),
                    Animated.parallel([
                        Animated.timing(p.opacity, {
                            toValue: 0.55,
                            duration: 600,
                            easing: Easing.out(Easing.cubic),
                            useNativeDriver: true,
                        }),
                        Animated.timing(p.pos, {
                            toValue: {
                                x: p.target.x,
                                y: p.target.y,
                            },
                            duration: 2600 + Math.random() * 1200,
                            easing: Easing.out(Easing.exp),
                            useNativeDriver: true,
                        }),
                    ]),
                    Animated.timing(p.opacity, {
                        toValue: 0,
                        duration: 900,
                        easing: Easing.in(Easing.cubic),
                        useNativeDriver: true,
                    }),
                    Animated.timing(p.pos, {
                        toValue: { x: 0, y: 0 },
                        duration: 0,
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        });
    };

    const startUnlocking = () => {
        setPhase('unlocking');

        unlockSound.current?.replayAsync().catch(() => {});

        Animated.parallel([
            Animated.sequence([
                Animated.timing(capsuleScale, {
                    toValue: 1.045,
                    duration: 420,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.spring(capsuleScale, {
                    toValue: 1,
                    friction: 6,
                    tension: 36,
                    useNativeDriver: true,
                }),
            ]),
            Animated.sequence([
                Animated.timing(capsuleRotate, {
                    toValue: 1,
                    duration: 120,
                    useNativeDriver: true,
                }),
                Animated.timing(capsuleRotate, {
                    toValue: -1,
                    duration: 120,
                    useNativeDriver: true,
                }),
                Animated.timing(capsuleRotate, {
                    toValue: 0,
                    duration: 160,
                    useNativeDriver: true,
                }),
            ]),
            Animated.sequence([
                Animated.parallel([
                    Animated.timing(ringOpacity, {
                        toValue: 0.75,
                        duration: 120,
                        useNativeDriver: true,
                    }),
                    Animated.timing(ringScale, {
                        toValue: 0.75,
                        duration: 120,
                        useNativeDriver: true,
                    }),
                ]),
                Animated.parallel([
                    Animated.timing(ringOpacity, {
                        toValue: 0,
                        duration: 900,
                        easing: Easing.out(Easing.exp),
                        useNativeDriver: true,
                    }),
                    Animated.timing(ringScale, {
                        toValue: 2.4,
                        duration: 900,
                        easing: Easing.out(Easing.exp),
                        useNativeDriver: true,
                    }),
                ]),
            ]),
            Animated.sequence([
                Animated.timing(flashOpacity, {
                    toValue: 0.14,
                    duration: 90,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.timing(flashOpacity, {
                    toValue: 0,
                    duration: 260,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
            ]),
        ]).start(() => {
            startMemoryRelease();
        });
    };

    const startMemoryRelease = () => {
        setPhase('memory_release');

        releaseSound.current?.replayAsync().catch(() => {});

        Animated.parallel([
            Animated.timing(openedOpacity, {
                toValue: 1,
                duration: 760,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.spring(openedScale, {
                toValue: 1.04,
                friction: 7,
                tension: 38,
                useNativeDriver: true,
            }),
        ]).start();

        openBurstParticles.forEach((particle, index) => {
            particle.pos.setValue({ x: 0, y: 0 });
            particle.opacity.setValue(0);
            particle.scale.setValue(0.24);

            Animated.sequence([
                Animated.delay(index * 26),
                Animated.parallel([
                    Animated.timing(particle.opacity, {
                        toValue: 0.95,
                        duration: 130,
                        easing: Easing.out(Easing.cubic),
                        useNativeDriver: true,
                    }),
                    Animated.spring(particle.pos, {
                        toValue: particle.target,
                        friction: 7,
                        tension: 78,
                        useNativeDriver: true,
                    }),
                    Animated.spring(particle.scale, {
                        toValue: 1,
                        friction: 7,
                        tension: 88,
                        useNativeDriver: true,
                    }),
                ]),
                Animated.timing(particle.opacity, {
                    toValue: 0,
                    duration: 760,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
            ]).start();
        });

        memoryItems.forEach((item, i) => {
            Animated.sequence([
                Animated.delay(180 + i * 135),
                Animated.parallel([
                    Animated.timing(item.opacity, {
                        toValue: 1,
                        duration: 520,
                        easing: Easing.out(Easing.cubic),
                        useNativeDriver: true,
                    }),
                    Animated.spring(item.pos, {
                        toValue: {
                            x: item.target.x,
                            y: item.target.y,
                        },
                        friction: 7,
                        tension: 42,
                        useNativeDriver: true,
                    }),
                    Animated.spring(item.scale, {
                        toValue: i === 0 ? 1.06 : 0.96,
                        friction: 8,
                        tension: 42,
                        useNativeDriver: true,
                    }),
                    Animated.timing(item.rotate, {
                        toValue: 1,
                        duration: 860,
                        easing: Easing.out(Easing.back(0.45)),
                        useNativeDriver: true,
                    }),
                ]),
            ]).start();
        });

        setTimeout(() => {
            setPhase('opened');

            Animated.parallel([
                Animated.timing(finalTextOpacity, {
                    toValue: 1,
                    duration: 700,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.timing(finalTextTranslateY, {
                    toValue: 0,
                    duration: 700,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
            ]).start();

            Animated.spring(openedScale, {
                toValue: 1,
                friction: 8,
                tension: 34,
                useNativeDriver: true,
            }).start();

            setTimeout(() => {
                introPad.current?.stopAsync().catch(() => {});
                onComplete();
            }, 5200);
        }, 3400);
    };

    const grayOverlayOpacity = holdProgress.interpolate({
        inputRange: [0, 0.82, 1],
        outputRange: [0.62, 0.36, 0],
    });

    const grayOverlayTranslateY = holdProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -INTRO_CAPSULE_SIZE],
    });

    const liquidWaveTranslate = liquidWaveShift.interpolate({
        inputRange: [-1, 0, 1],
        outputRange: [-6, 0, 6],
    });

    const liquidWaveRotate = liquidWaveShift.interpolate({
        inputRange: [-1, 1],
        outputRange: ['-1deg', '1deg'],
    });

    const frontierTranslateY = holdProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -INTRO_CAPSULE_SIZE],
    });

    const capsuleRotation = capsuleRotate.interpolate({
        inputRange: [-1, 1],
        outputRange: ['-1.6deg', '1.6deg'],
    });

    const renderMemoryCard = (item: any, i: number) => {
        const rotation = item.rotate.interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', `${item.target.rot}deg`],
        });

        const isMain = i === 0;

        return (
            <Animated.View
                key={`memory-${i}`}
                style={[
                    styles.memoryCard,
                    isMain && styles.memoryCardMain,
                    {
                        opacity: item.opacity,
                        transform: [
                            { translateX: item.pos.x },
                            { translateY: item.pos.y },
                            { scale: item.scale },
                            { rotate: rotation },
                        ],
                        zIndex: 1000 + i,
                    },
                ]}
            >
                {item.type === 'image' || item.type === 'video' ? (
                    item.url ? (
                        <>
                            <Image
                                source={{ uri: item.url }}
                                style={styles.cardImg}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                            />
                            {item.type === 'video' && (
                                <View style={styles.videoBadge}>
                                    <Ionicons name="play" size={13} color={WHITE} />
                                </View>
                            )}
                        </>
                    ) : (
                        <View style={[styles.cardPlaceholder, { backgroundColor: `${BRAND_PURPLE_HEX}16` }]}>
                            <Ionicons name="image-outline" size={24} color={activeTint} />
                        </View>
                    )
                ) : item.type === 'audio' ? (
                    <View style={[styles.cardPlaceholder, { backgroundColor: '#58CC0218' }]}>
                        <Ionicons name="mic-outline" size={24} color="#58CC02" />
                    </View>
                ) : (
                    <View style={[styles.cardPlaceholder, { backgroundColor: '#FFB80018' }]}>
                        <Ionicons name="reader-outline" size={24} color="#FFB800" />
                    </View>
                )}

                <View style={[styles.cardBottomLine, { backgroundColor: activeTint }]} />
            </Animated.View>
        );
    };

    const closedCapsuleUri = closedModelImg || modelImg;
    const openedCapsuleUri = modelImg || closedModelImg;
    const isOpenedModel = phase === 'memory_release' || phase === 'opened';

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={['#FFFFFF', '#FBF8FF', '#F7F1FF', '#FFFFFF']}
                locations={[0, 0.42, 0.72, 1]}
                style={StyleSheet.absoluteFill}
            />

            <Animated.View
                pointerEvents="none"
                style={[
                    styles.shimmer,
                    {
                        transform: [{ translateX: shimmerTranslate }, { rotate: '18deg' }],
                    },
                ]}
            >
                <LinearGradient
                    colors={[
                        'rgba(255,255,255,0)',
                        'rgba(166,110,255,0.10)',
                        'rgba(255,255,255,0)',
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />
            </Animated.View>

            {phase === 'intro' && (
                <Animated.View
                    style={[
                        styles.introBox,
                        {
                            opacity: introOpacity,
                            transform: [{ translateY: introTranslateY }],
                        },
                    ]}
                >
                    <View style={[styles.introIconCircle, { borderColor: `${BRAND_PURPLE_HEX}30` }]}>
                        <Ionicons name="lock-closed-outline" size={28} color={activeTint} />
                    </View>

                    <Text style={styles.introTitle}>
                        {t('detail.opening_quote') || 'Esta cápsula ha estado esperando este momento'}
                    </Text>

                    <Pressable
                        disabled={!interactive || !canTriggerOpening}
                        onPressIn={handlePressInCapsule}
                        onPressOut={handlePressOutCapsule}
                        style={styles.introCapsuleTapArea}
                    >
                        <Animated.View
                            style={[
                                styles.introCapsulePressFrame,
                                { transform: [{ scale: introCapsulePressScale }] },
                            ]}
                        >
                            <CapsuleWithTimer
                                modelKey={modelKey}
                                source={{ uri: closedCapsuleUri }}
                                date={new Date().toISOString()}
                                modelLayout={modelLayout}
                                style={styles.introCapsuleModel}
                                hideTimer
                                hideParticles
                                isOpened={false}
                                disableAnimations
                            />

                            <Animated.View
                                pointerEvents="none"
                                style={[
                                    styles.introCapsuleGrayOverlay,
                                    {
                                        opacity: grayOverlayOpacity,
                                        transform: [{ translateY: grayOverlayTranslateY }],
                                    },
                                ]}
                            >
                                <LinearGradient
                                    colors={[
                                        'rgba(255,255,255,0.98)',
                                        'rgba(243,241,248,0.96)',
                                        'rgba(228,224,238,0.92)',
                                    ]}
                                    start={{ x: 0.5, y: 0 }}
                                    end={{ x: 0.5, y: 1 }}
                                    style={StyleSheet.absoluteFill}
                                />
                            </Animated.View>

                            <Animated.View
                                pointerEvents="none"
                                style={[
                                    styles.introFrontierLine,
                                    {
                                        backgroundColor: activeTint,
                                        opacity: holdProgress.interpolate({
                                            inputRange: [0, 0.04, 0.92, 1],
                                            outputRange: [0, 0.78, 0.78, 0],
                                        }),
                                        transform: [
                                            { translateY: frontierTranslateY },
                                            { translateX: liquidWaveTranslate },
                                            { rotate: liquidWaveRotate },
                                        ],
                                    },
                                ]}
                            >
                                <LinearGradient
                                    colors={[
                                        'rgba(255,255,255,0)',
                                        'rgba(255,255,255,0.75)',
                                        'rgba(255,255,255,0)',
                                    ]}
                                    start={{ x: 0, y: 0.5 }}
                                    end={{ x: 1, y: 0.5 }}
                                    style={StyleSheet.absoluteFill}
                                />
                            </Animated.View>
                        </Animated.View>
                    </Pressable>

                    <Animated.View
                        style={[
                            styles.timeBox,
                            {
                                opacity: timeLabelOpacity,
                                transform: [{ translateY: timeLabelTranslateY }],
                            },
                        ]}
                    >
                        <Text style={styles.timeLabel}>Cerrada durante</Text>
                        <Text style={[styles.timeValue, { color: activeTint }]}> 
                            {lockedForText || `${countdown} días`}
                        </Text>
                    </Animated.View>

                    <Text style={styles.introHint}>
                        {!imagesLoaded
                            ? 'Preparando la cápsula...'
                            : !interactive
                                ? spectatorLabel || 'La cápsula se está abriendo'
                                : !canTriggerOpening
                                    ? 'Un momento...'
                                    : isPressingToOpen
                                        ? 'Sigue manteniendo para revelar el color'
                                        : 'Mantén pulsada la cápsula para abrirla'}
                    </Text>

                    {likeCount > 0 && (
                        <View style={styles.introStatsRow}>
                            <View style={styles.statPill}>
                                <Ionicons name="heart" size={14} color="#F43F5E" />
                                <Text style={styles.statPillText}>{likeCount}</Text>
                            </View>
                        </View>
                    )}
                </Animated.View>
            )}

            {phase !== 'intro' && (
                <Animated.View
                    style={[
                        styles.centerStage,
                        {
                            opacity: stageOpacity,
                        },
                    ]}
                >
                    <Animated.View
                        style={[
                            styles.halo,
                            {
                                backgroundColor: activeTint,
                                opacity: haloOpacity,
                                transform: [{ scale: haloScale }],
                            },
                        ]}
                    />

                    <Animated.View
                        style={[
                            styles.unlockRing,
                            {
                                borderColor: activeTint,
                                opacity: ringOpacity,
                                transform: [{ scale: ringScale }],
                            },
                        ]}
                    />

                    {(phase === 'awakening' || phase === 'unlocking') &&
                        particles.map((p, i) => (
                            <Animated.View
                                key={`particle-${i}`}
                                style={[
                                    styles.particle,
                                    {
                                        backgroundColor: activeTint,
                                        opacity: p.opacity,
                                        transform: [
                                            { translateX: p.pos.x },
                                            { translateY: p.pos.y },
                                            { scale: p.scale },
                                        ],
                                    },
                                ]}
                            />
                        ))}

                    {(phase === 'memory_release' || phase === 'opened') &&
                        openBurstParticles.map((p, i) => (
                            <Animated.View
                                key={`open-burst-${i}`}
                                style={[
                                    styles.openBurstParticle,
                                    {
                                        backgroundColor: i % 3 === 0 ? '#FFFFFF' : activeTint,
                                        opacity: p.opacity,
                                        transform: [
                                            { translateX: p.pos.x },
                                            { translateY: p.pos.y },
                                            { scale: p.scale },
                                        ],
                                    },
                                ]}
                            />
                        ))}

                    <Animated.View
                        style={[
                            styles.capsuleWrapper,
                            isOpenedModel
                                ? {
                                      opacity: 1,
                                      transform: [
                                          { translateY: capsuleFloat },
                                          { scale: openedScale },
                                          { rotate: capsuleRotation },
                                      ],
                                  }
                                : {
                                      opacity: 1,
                                      transform: [
                                          { translateY: capsuleFloat },
                                          { scale: capsuleScale },
                                          { rotate: capsuleRotation },
                                      ],
                                  },
                        ]}
                    >
                        <CapsuleWithTimer
                            modelKey={modelKey}
                            source={{ uri: isOpenedModel ? openedCapsuleUri : closedCapsuleUri }}
                            date={new Date().toISOString()}
                            modelLayout={modelLayout}
                            style={styles.capsuleModel}
                            hideTimer
                            hideParticles
                            isOpened={isOpenedModel}
                            disableAnimations
                        />
                    </Animated.View>
                </Animated.View>
            )}

            {(phase === 'memory_release' || phase === 'opened') && (
                <View style={styles.memoryLayer} pointerEvents="none">
                    {memoryItems.map((item, i) => renderMemoryCard(item, i))}
                    {flashbackComments.slice(0, 2).map((comment, index) => (
                        <Animated.View
                            key={`flashback-comment-${index}`}
                            style={[
                                styles.flashbackBubble,
                                index === 0 ? styles.flashbackBubbleLeft : styles.flashbackBubbleRight,
                                {
                                    opacity: openedOpacity,
                                    transform: [
                                        { scale: 1 },
                                        { translateY: index === 0 ? -10 : 8 },
                                    ],
                                },
                            ]}
                        >
                            <Ionicons name="chatbubble-ellipses-outline" size={14} color={activeTint} />
                            <Text style={styles.flashbackText} numberOfLines={2}>
                                {comment}
                            </Text>
                        </Animated.View>
                    ))}
                </View>
            )}

            {phase === 'opened' && (
                <Animated.View
                    style={[
                        styles.finalReveal,
                        {
                            opacity: finalTextOpacity,
                            transform: [{ translateY: finalTextTranslateY }],
                        },
                    ]}
                    pointerEvents="none"
                >
                    <View style={styles.finalGlassCard}>
                        <Text style={[styles.successText, { color: activeTint }]}>Tu cápsula está abierta</Text>

                        <Text style={styles.finalSubtitle}>Guardaste esto para este momento</Text>

                        <View style={styles.finalStatsRow}>
                            <View style={styles.statPill}>
                                <Ionicons name="heart" size={14} color="#F43F5E" />
                                <Text style={styles.statPillText}>{likeCount}</Text>
                            </View>
                            {!!flashbackComments[0] && (
                                <View style={[styles.statPill, styles.commentPill]}>
                                    <Ionicons name="chatbubble-outline" size={14} color={activeTint} />
                                    <Text style={styles.statPillComment} numberOfLines={1}>
                                        {flashbackComments[0]}
                                    </Text>
                                </View>
                            )}
                        </View>

                        <Text style={styles.capsuleNameFinal} numberOfLines={2}>
                            {capsuleTitle}
                        </Text>

                        <View style={[styles.finalLine, { backgroundColor: activeTint }]} />
                    </View>
                </Animated.View>
            )}

            <Animated.View
                pointerEvents="none"
                style={[
                    StyleSheet.absoluteFill,
                    {
                        backgroundColor: activeTint,
                        opacity: flashOpacity,
                        zIndex: 9998,
                    },
                ]}
            />

            <Animated.View
                pointerEvents="none"
                style={[
                    StyleSheet.absoluteFill,
                    {
                        backgroundColor: WHITE,
                        opacity: flashOpacity.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, 0.08],
                        }),
                        zIndex: 9999,
                    },
                ]}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: WHITE,
        overflow: 'hidden',
    },

    shimmer: {
        position: 'absolute',
        width: width * 0.6,
        height: height * 1.4,
        top: -height * 0.2,
        opacity: 0.9,
    },

    introBox: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 34,
        zIndex: 100,
    },

    introCapsuleTapArea: {
        marginTop: 28,
        marginBottom: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },

    introCapsulePressFrame: {
        width: INTRO_CAPSULE_SIZE,
        height: INTRO_CAPSULE_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderRadius: 34,
    },

    introCapsuleModel: {
        width: INTRO_CAPSULE_SIZE,
        height: INTRO_CAPSULE_SIZE,
    },

    introCapsuleGrayOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: INTRO_CAPSULE_SIZE,
        height: INTRO_CAPSULE_SIZE,
        overflow: 'hidden',
        zIndex: 3,
    },

    introFrontierLine: {
        position: 'absolute',
        bottom: -1,
        left: 38,
        right: 38,
        height: 7,
        borderRadius: 999,
        overflow: 'hidden',
        zIndex: 4,
    },

    introIconCircle: {
        width: 76,
        height: 76,
        borderRadius: 38,
        backgroundColor: WHITE,
        borderWidth: 1.5,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 26,
        ...Platform.select({
            ios: {
                shadowColor: BRAND_PURPLE_HEX,
                shadowOpacity: 0.18,
                shadowRadius: 24,
                shadowOffset: { width: 0, height: 12 },
            },
            android: {
                elevation: 8,
            },
        }),
    },

    introTitle: {
        color: SOFT_TEXT,
        fontSize: 22,
        fontWeight: '700',
        textAlign: 'center',
        lineHeight: 32,
        maxWidth: 330,
    },

    timeBox: {
        marginTop: 34,
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingVertical: 16,
        borderRadius: 28,
        backgroundColor: WHITE,
        borderWidth: 1,
        borderColor: CARD_BORDER,
        ...Platform.select({
            ios: {
                shadowColor: BRAND_PURPLE_HEX,
                shadowOpacity: 0.12,
                shadowRadius: 22,
                shadowOffset: { width: 0, height: 10 },
            },
            android: {
                elevation: 5,
            },
        }),
    },

    timeLabel: {
        color: LIGHT_TEXT,
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 1.1,
        textTransform: 'uppercase',
        marginBottom: 6,
    },

    timeValue: {
        fontSize: 31,
        fontWeight: '900',
        letterSpacing: 0.2,
    },

    introHint: {
        marginTop: 18,
        color: LIGHT_TEXT,
        fontSize: 14,
        fontWeight: '700',
        textAlign: 'center',
    },

    introStatsRow: {
        flexDirection: 'row',
        marginTop: 18,
        gap: 10,
    },

    centerStage: {
        position: 'absolute',
        width,
        height,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2200,
    },

    halo: {
        position: 'absolute',
        width: 260,
        height: 260,
        borderRadius: 130,
        opacity: 0.22,
        ...Platform.select({
            ios: {
                shadowColor: BRAND_PURPLE_HEX,
                shadowOpacity: 0.18,
                shadowRadius: 28,
                shadowOffset: { width: 0, height: 0 },
            },
            android: {
                elevation: 8,
            },
        }),
    },

    unlockRing: {
        position: 'absolute',
        width: 255,
        height: 255,
        borderRadius: 127.5,
        borderWidth: 2,
        zIndex: 1,
    },

    particle: {
        position: 'absolute',
        width: 7,
        height: 7,
        borderRadius: 3.5,
        zIndex: 2,
    },

    capsuleWrapper: {
        zIndex: 2300,
        backgroundColor: 'transparent',
        ...Platform.select({
            ios: {
                shadowColor: '#5D3AE8',
                shadowOpacity: 0.18,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 10 },
            },
            android: {
                elevation: 10,
            },
        }),
    },

    capsuleModel: {
        width: 340,
        height: 340,
        opacity: 1,
        zIndex: 1,
    },

    openBurstParticle: {
        position: 'absolute',
        width: 12,
        height: 12,
        borderRadius: 999,
        zIndex: 2350,
        shadowColor: '#FFFFFF',
        shadowOpacity: 0.45,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 0 },
    },

    memoryLayer: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1800,
    },

    memoryCard: {
        position: 'absolute',
        width: 110,
        height: 136,
        backgroundColor: WHITE,
        borderRadius: 24,
        padding: 7,
        borderWidth: 1,
        borderColor: CARD_BORDER,
        overflow: 'hidden',
        ...Platform.select({
            ios: {
                shadowColor: '#25134D',
                shadowOpacity: 0.14,
                shadowRadius: 22,
                shadowOffset: { width: 0, height: 10 },
            },
            android: {
                elevation: 9,
            },
        }),
    },

    memoryCardMain: {
        width: 124,
        height: 150,
        borderRadius: 26,
    },

    cardImg: {
        width: '100%',
        height: '100%',
        borderRadius: 16,
        backgroundColor: '#F8F5FF',
    },

    cardPlaceholder: {
        width: '100%',
        height: '100%',
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },

    videoBadge: {
        position: 'absolute',
        right: 12,
        bottom: 12,
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'center',
        alignItems: 'center',
    },

    cardBottomLine: {
        position: 'absolute',
        left: 18,
        right: 18,
        bottom: 7,
        height: 3,
        borderRadius: 2,
        opacity: 0.75,
    },

    finalGlassCard: {
        width: width * 0.82,
        backgroundColor: 'rgba(255,255,255,0.92)',
        borderWidth: 1,
        borderColor: 'rgba(240,236,255,0.95)',
        borderRadius: 28,
        paddingHorizontal: 20,
        paddingVertical: 18,
        alignItems: 'center',
        ...Platform.select({
            ios: {
                shadowColor: '#25134D',
                shadowOpacity: 0.1,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 10 },
            },
            android: {
                elevation: 8,
            },
        }),
    },

    flashbackBubble: {
        position: 'absolute',
        maxWidth: width * 0.3,
        backgroundColor: 'rgba(255,255,255,0.96)',
        borderWidth: 1,
        borderColor: CARD_BORDER,
        borderRadius: 18,
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: 'row',
        gap: 8,
        alignItems: 'flex-start',
        ...Platform.select({
            ios: {
                shadowColor: '#25134D',
                shadowOpacity: 0.12,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 8 },
            },
            android: {
                elevation: 8,
            },
        }),
    },

    flashbackBubbleLeft: {
        left: 18,
        top: height * 0.22,
    },

    flashbackBubbleRight: {
        right: 18,
        bottom: height * 0.2,
    },

    flashbackText: {
        flex: 1,
        color: SOFT_TEXT,
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '700',
    },

    finalReveal: {
        position: 'absolute',
        left: 24,
        right: 24,
        bottom: height * 0.045,
        alignItems: 'center',
        zIndex: 2700,
    },

    successText: {
        fontSize: 26,
        fontWeight: '900',
        textAlign: 'center',
        letterSpacing: 0,
        textShadowColor: 'rgba(255,255,255,0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 6,
    },

    finalSubtitle: {
        marginTop: 8,
        color: SOFT_TEXT,
        fontSize: 15,
        fontWeight: '700',
        textAlign: 'center',
    },

    finalStatsRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 16,
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
    },

    statPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(255,255,255,0.92)',
        borderWidth: 1,
        borderColor: CARD_BORDER,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },

    statPillText: {
        color: SOFT_TEXT,
        fontSize: 13,
        fontWeight: '800',
    },

    commentPill: {
        maxWidth: width * 0.56,
    },

    statPillComment: {
        color: SOFT_TEXT,
        fontSize: 12,
        fontWeight: '700',
        maxWidth: width * 0.34,
    },

    capsuleNameFinal: {
        marginTop: 16,
        color: SOFT_TEXT,
        fontSize: 18,
        lineHeight: 24,
        fontWeight: '800',
        textAlign: 'center',
        maxWidth: width * 0.82,
    },

    finalLine: {
        width: 64,
        height: 5,
        borderRadius: 3,
        marginTop: 20,
    },
});
