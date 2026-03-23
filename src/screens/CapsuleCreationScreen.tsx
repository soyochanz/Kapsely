import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    TextInput, StatusBar, Dimensions, Switch,
    Image, Animated, Alert, ActivityIndicator,
    Easing, Modal, Platform, Keyboard,
} from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';
import { Colors, Fonts, Spacing, BorderRadius, Shadow } from '../theme';
import { CapsuleType } from '../data/mockCapsules';
import { supabase } from '../lib/supabase';
import { CAPSULE_MODELS, MODEL_IMAGES } from '../constants/models';
import CapsuleWithTimer from '../components/CapsuleWithTimer';
import { timerConfigManager } from '../utils/timerConfig';

// ─── Constants ────────────────────────────────────────────────────────────────
const { width, height } = Dimensions.get('window');
const MIN_DAYS = 14;
const MAX_DAYS = 365;
type Step = 'type' | 'design' | 'identity' | 'timing' | 'review';
const STEPS: Step[] = ['type', 'design', 'identity', 'timing', 'review'];

// ─── Design Tokens — White + Purple/Blue ─────────────────────────────────────
const L = {
    bg: '#F7F8FF',
    surface: '#FFFFFF',
    surfaceAlt: '#F0F1FA',
    border: '#E4E6F5',
    borderStrong: '#C8CBE8',
    text: '#16172B',
    textSec: '#5A5C78',
    textMuted: '#9B9DB8',
    shadow: 'rgba(80,90,200,0.07)',
    shadowMd: 'rgba(80,90,200,0.13)',
    // Brand purples
    purple: '#6B4FBF',
    purpleLight: '#F1EEFF',
    purpleBorder: '#D0C0F5',
    // Brand blues
    blue: '#3B5BDB',
    blueLight: '#EEF2FF',
    blueBorder: '#C5D0FA',
};

// ─── Per-type config ──────────────────────────────────────────────────────────
const TYPE_CFG = {
    legacycap: {
        accent: '#C84B31',
        light: '#FEF1EE',
        border: '#F2C0B4',
        gradient: ['#C84B31', '#E5623D'] as const,
        emoji: '⏳',
        icon: 'time' as const,
        label: 'LegacyCap',
        tagline: '5-year time vault. One life commitment.',
        limit: '1 active capsule max',
        limitIcon: 'alert-circle-outline' as const,
        rules: [
            'Only one LegacyCap at a time',
            'Locks for exactly 5 years',
            'Cannot change settings after sealing',
        ],
        groupOk: false,
    },
    instacap: {
        accent: '#6B4FBF',
        light: '#F1EEFF',
        border: '#D0C0F5',
        gradient: ['#6B4FBF', '#9270D6'] as const,
        emoji: '⚡',
        icon: 'camera' as const,
        label: 'InstaCap',
        tagline: 'Short-term moments. Open in weeks or months.',
        limit: '5 active capsules max',
        limitIcon: 'albums-outline' as const,
        rules: [
            'Up to 5 active at once',
            'Duration: 2 weeks → 1 year',
            'The only type that supports group capsules',
        ],
        groupOk: true,
    },
    eventcap: {
        accent: '#B87A1A',
        light: '#FEF8EE',
        border: '#F0D090',
        gradient: ['#B87A1A', '#D4922A'] as const,
        emoji: '🎉',
        icon: 'calendar' as const,
        label: 'EventCap',
        tagline: 'Synchronized global opening. One moment, worldwide.',
        limit: 'One per active event',
        limitIcon: 'earth-outline' as const,
        rules: [
            'Tied to a specific live event',
            'All EventCaps open simultaneously worldwide',
            'Uses exclusive event-only capsule models',
        ],
        groupOk: false,
    },
} as const;

function isEventActive(s?: string, e?: string) {
    if (!s || !e) return false;
    const now = new Date();
    return now >= new Date(s) && now <= new Date(e);
}

// ─── Step Pill Progress ───────────────────────────────────────────────────────
function StepPills({ index, total }: { index: number; total: number }) {
    return (
        <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
            {Array.from({ length: total }).map((_, i) => (
                <View key={i} style={{
                    height: 3.5, borderRadius: 2,
                    width: i === index ? 24 : 7,
                    backgroundColor: i <= index ? L.purple : L.border,
                    opacity: i < index ? 0.5 : 1,
                }} />
            ))}
        </View>
    );
}

// ─── Type Card ────────────────────────────────────────────────────────────────
function TypeCard({ typeKey, isSelected, isLocked, onPress }: {
    typeKey: keyof typeof TYPE_CFG;
    isSelected: boolean;
    isLocked: boolean;
    onPress: () => void;
}) {
    const cfg = TYPE_CFG[typeKey];
    const scale = useRef(new Animated.Value(1)).current;

    const press = () => {
        if (isLocked) return;
        Animated.sequence([
            Animated.timing(scale, { toValue: 0.97, duration: 65, useNativeDriver: true }),
            Animated.spring(scale, { toValue: 1, friction: 5, tension: 130, useNativeDriver: true }),
        ]).start();
        onPress();
    };

    return (
        <Animated.View style={{ transform: [{ scale }], marginBottom: 10 }}>
            <TouchableOpacity
                activeOpacity={1} onPress={press} disabled={isLocked}
                style={[
                    typeCardS.card,
                    isSelected && { borderColor: cfg.accent, backgroundColor: cfg.light },
                    isLocked && { opacity: 0.42 },
                ]}
            >
                <View style={typeCardS.topRow}>
                    <View style={[typeCardS.iconWrap, {
                        backgroundColor: isSelected ? cfg.accent + '18' : L.surfaceAlt,
                        borderColor: isSelected ? cfg.border : L.border,
                    }]}>
                        <Text style={{ fontSize: 30 }}>{cfg.emoji}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                            <Text style={[typeCardS.title, isSelected && { color: cfg.accent }]}>{cfg.label}</Text>
                            {cfg.groupOk && (
                                <View style={[typeCardS.groupBadge, { backgroundColor: cfg.accent + '14', borderColor: cfg.border }]}>
                                    <Ionicons name="people" size={9} color={cfg.accent} />
                                    <Text style={[typeCardS.groupText, { color: cfg.accent }]}>Group OK</Text>
                                </View>
                            )}
                        </View>
                        <Text style={typeCardS.tagline}>{cfg.tagline}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                            <Ionicons name={cfg.limitIcon} size={11} color={isSelected ? cfg.accent : L.textMuted} />
                            <Text style={[typeCardS.limit, isSelected && { color: cfg.accent }]}>{cfg.limit}</Text>
                        </View>
                    </View>
                    <View style={{ justifyContent: 'center' }}>
                        {isLocked
                            ? <View style={typeCardS.lockCircle}><Ionicons name="lock-closed" size={11} color={L.textMuted} /></View>
                            : isSelected
                                ? <View style={[typeCardS.checkCircle, { backgroundColor: cfg.accent }]}><Ionicons name="checkmark" size={13} color="#fff" /></View>
                                : <View style={typeCardS.emptyCircle} />
                        }
                    </View>
                </View>

                {isSelected && (
                    <View style={[typeCardS.rulesBox, { borderTopColor: cfg.border }]}>
                        {cfg.rules.map((r, i) => (
                            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: i < cfg.rules.length - 1 ? 5 : 0 }}>
                                <View style={[typeCardS.dot, { backgroundColor: cfg.accent }]} />
                                <Text style={[typeCardS.ruleText, { color: cfg.accent + 'CC' }]}>{r}</Text>
                            </View>
                        ))}
                    </View>
                )}
            </TouchableOpacity>
        </Animated.View>
    );
}

const typeCardS = StyleSheet.create({
    card: {
        backgroundColor: L.surface, borderRadius: 20, borderWidth: 1.5, borderColor: L.border,
        shadowColor: L.shadow, shadowOpacity: 1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
        overflow: 'hidden',
    },
    topRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
    iconWrap: {
        width: 62, height: 62, borderRadius: 18,
        alignItems: 'center', justifyContent: 'center', borderWidth: 1, flexShrink: 0,
    },
    title: { fontSize: 17, fontFamily: Fonts.bold, color: L.text },
    tagline: { fontSize: 12, color: L.textSec, fontFamily: Fonts.regular, lineHeight: 17 },
    groupBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 3,
        paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20, borderWidth: 1,
    },
    groupText: { fontSize: 9, fontFamily: Fonts.bold },
    limit: { fontSize: 11, fontFamily: Fonts.semiBold, color: L.textMuted },
    checkCircle: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    emptyCircle: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: L.borderStrong },
    lockCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: L.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    rulesBox: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1 },
    dot: { width: 5, height: 5, borderRadius: 3, flexShrink: 0 },
    ruleText: { fontSize: 12, fontFamily: Fonts.medium, flex: 1 },
});

// ─── Model Picker Modal ───────────────────────────────────────────────────────
function ModelPickerModal({
    visible, onClose, models, selectedModel, onSelect, accent, selectedType, activeEvent,
}: {
    visible: boolean;
    onClose: () => void;
    models: any[];
    selectedModel: string;
    onSelect: (id: string) => void;
    accent: string;
    selectedType: string | null;
    activeEvent: any;
}) {
    const insets = useSafeAreaInsets();
    const slideAnim = useRef(new Animated.Value(height)).current;

    useEffect(() => {
        if (visible) {
            Animated.spring(slideAnim, {
                toValue: 0,
                tension: 65,
                friction: 12,
                useNativeDriver: true,
            }).start();
        } else {
            Animated.timing(slideAnim, {
                toValue: height,
                duration: 260,
                easing: Easing.in(Easing.quad),
                useNativeDriver: true,
            }).start();
        }
    }, [visible]);

    const filteredModels = models.filter(m => {
        if (m.is_active === false) return false;
        if (selectedType === 'eventcap') return m.is_event;
        return !m.is_event;
    });

    return (
        <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
            {/* Backdrop */}
            <TouchableOpacity
                style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' }}
                activeOpacity={1}
                onPress={onClose}
            />

            {/* Sheet */}
            <Animated.View style={[
                modalS.sheet,
                { paddingBottom: Math.max(insets.bottom, 24), transform: [{ translateY: slideAnim }] }
            ]}>
                {/* Handle */}
                <View style={modalS.handle} />

                {/* Header */}
                <View style={modalS.sheetHeader}>
                    <View>
                        <Text style={modalS.sheetTitle}>Choose Model</Text>
                        <Text style={modalS.sheetSub}>Pick a shell for your capsule</Text>
                    </View>
                    <TouchableOpacity onPress={onClose} style={modalS.closeBtn}>
                        <Ionicons name="close" size={16} color={L.textSec} />
                    </TouchableOpacity>
                </View>

                {/* Grid */}
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={modalS.grid}
                >
                    {filteredModels.map((model) => {
                        const isActive = selectedModel === model.id;
                        return (
                            <TouchableOpacity
                                key={model.id}
                                onPress={() => { onSelect(model.id); onClose(); }}
                                activeOpacity={0.8}
                                style={[modalS.modelCard, isActive && { borderColor: accent, backgroundColor: accent + '08' }]}
                            >
                                {/* Selected indicator */}
                                {isActive && (
                                    <View style={[modalS.selectedBadge, { backgroundColor: accent }]}>
                                        <Ionicons name="checkmark" size={10} color="#fff" />
                                    </View>
                                )}

                                {/* Capsule image */}
                                <View style={modalS.modelImgWrap}>
                                    <Image
                                        source={{ uri: model.image }}
                                        style={modalS.modelImg}
                                        resizeMode="contain"
                                    />
                                </View>

                                {/* Name */}
                                <Text
                                    style={[modalS.modelLabel, isActive && { color: accent }]}
                                    numberOfLines={2}
                                >
                                    {model.label}
                                </Text>

                                {/* Event badge */}
                                {model.is_event && (
                                    <View style={modalS.eventBadge}>
                                        <Text style={modalS.eventBadgeText}>EVENT</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </Animated.View>
        </Modal>
    );
}

const modalS = StyleSheet.create({
    sheet: {
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        backgroundColor: L.surface,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        maxHeight: height * 0.82,
        paddingTop: 10,
        shadowColor: '#000',
        shadowOpacity: 0.22,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: -6 },
        elevation: 20,
    },
    handle: {
        width: 36, height: 4, borderRadius: 2,
        backgroundColor: L.borderStrong,
        alignSelf: 'center', marginBottom: 14,
    },
    sheetHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, marginBottom: 18,
    },
    sheetTitle: { fontSize: 20, fontFamily: Fonts.bold, color: L.text, letterSpacing: -0.3 },
    sheetSub: { fontSize: 13, color: L.textMuted, fontFamily: Fonts.regular, marginTop: 2 },
    closeBtn: {
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: L.surfaceAlt, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: L.border,
    },
    grid: {
        flexDirection: 'row', flexWrap: 'wrap',
        paddingHorizontal: 16, gap: 12, paddingBottom: 20,
    },
    modelCard: {
        width: (width - 32 - 12 * 2) / 3,
        backgroundColor: L.surfaceAlt,
        borderRadius: 18, borderWidth: 1.5, borderColor: L.border,
        paddingVertical: 14, paddingHorizontal: 8,
        alignItems: 'center', gap: 8,
        position: 'relative',
    },
    selectedBadge: {
        position: 'absolute', top: 8, right: 8,
        width: 20, height: 20, borderRadius: 10,
        alignItems: 'center', justifyContent: 'center',
    },
    modelImgWrap: {
        width: 72, height: 72,
        alignItems: 'center', justifyContent: 'center',
    },
    modelImg: { width: 68, height: 68 },
    modelLabel: {
        fontSize: 11, fontFamily: Fonts.semiBold,
        color: L.textSec, textAlign: 'center', lineHeight: 15,
    },
    eventBadge: {
        backgroundColor: '#B87A1A20',
        paddingHorizontal: 7, paddingVertical: 2,
        borderRadius: 8,
    },
    eventBadgeText: {
        fontSize: 8, fontFamily: Fonts.bold,
        color: '#B87A1A', letterSpacing: 1,
    },
});

// ─── Seal Animation ───────────────────────────────────────────────────────────
function SealAnimation({ accent, modelUri, modelOpenUri, onDone }: {
    accent: string; modelUri: string; modelOpenUri?: string; onDone: () => void;
}) {
    const [stage, setStage] = useState<'enter' | 'filling' | 'sealed'>('enter');
    const capScale = useRef(new Animated.Value(0.75)).current;
    const capOpacity = useRef(new Animated.Value(0)).current;
    const breathe = useRef(new Animated.Value(1)).current;
    const glowScale = useRef(new Animated.Value(0.5)).current;
    const glowOpacity = useRef(new Animated.Value(0)).current;
    const flash = useRef(new Animated.Value(0)).current;
    const sealedOpacity = useRef(new Animated.Value(0)).current;
    const sealedScale = useRef(new Animated.Value(1.2)).current;
    const lockOpacity = useRef(new Animated.Value(0)).current;
    const lockScale = useRef(new Animated.Value(0.4)).current;
    const doneOpacity = useRef(new Animated.Value(0)).current;

    const particles = useRef(
        Array.from({ length: 8 }, (_, i) => {
            const angle = (i / 8) * Math.PI * 2;
            const dist = 70 + Math.random() * 55;
            return {
                x: new Animated.Value(0), y: new Animated.Value(0),
                op: new Animated.Value(0), sc: new Animated.Value(0),
                tx: Math.cos(angle) * dist, ty: Math.sin(angle) * dist,
                color: [accent, accent + 'BB', L.purple, L.blue, '#a855f7', '#818cf8', accent, L.blue][i],
            };
        })
    ).current;

    const items = useRef(
        Array.from({ length: 3 }, () => ({
            y: new Animated.Value(80), op: new Animated.Value(0), sc: new Animated.Value(0.6),
        }))
    ).current;

    const breathLoop = useRef<Animated.CompositeAnimation | null>(null);

    useEffect(() => {
        Animated.parallel([
            Animated.spring(capScale, { toValue: 1, friction: 7, tension: 50, useNativeDriver: true }),
            Animated.timing(capOpacity, { toValue: 1, duration: 450, useNativeDriver: true }),
            Animated.spring(glowScale, { toValue: 1, friction: 6, tension: 40, useNativeDriver: true }),
            Animated.timing(glowOpacity, { toValue: 0.65, duration: 550, useNativeDriver: true }),
        ]).start(() => {
            breathLoop.current = Animated.loop(Animated.sequence([
                Animated.timing(breathe, { toValue: 1.07, duration: 850, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
                Animated.timing(breathe, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            ]));
            breathLoop.current.start();

            setTimeout(() => {
                breathLoop.current?.stop();
                setStage('filling');
                const seqs = items.map((item, i) =>
                    Animated.sequence([
                        Animated.delay(i * 320),
                        Animated.parallel([
                            Animated.timing(item.op, { toValue: 1, duration: 220, useNativeDriver: true }),
                            Animated.spring(item.sc, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
                            Animated.timing(item.y, { toValue: -30, duration: 550, easing: Easing.out(Easing.quad), useNativeDriver: true }),
                        ]),
                        Animated.parallel([
                            Animated.timing(item.op, { toValue: 0, duration: 280, useNativeDriver: true }),
                            Animated.timing(item.y, { toValue: -100, duration: 380, easing: Easing.in(Easing.quad), useNativeDriver: true }),
                            Animated.timing(item.sc, { toValue: 0.2, duration: 380, useNativeDriver: true }),
                        ]),
                    ])
                );
                Animated.sequence([
                    Animated.parallel(seqs),
                    Animated.delay(180),
                    Animated.parallel([
                        Animated.timing(capScale, { toValue: 1.28, duration: 320, easing: Easing.out(Easing.back(1.3)), useNativeDriver: true }),
                        Animated.timing(glowScale, { toValue: 1.45, duration: 320, useNativeDriver: true }),
                        Animated.timing(glowOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
                    ]),
                    Animated.timing(flash, { toValue: 1, duration: 180, useNativeDriver: true }),
                ]).start(() => {
                    setStage('sealed');
                    Animated.parallel([
                        Animated.timing(flash, { toValue: 0, duration: 550, useNativeDriver: true }),
                        Animated.timing(capOpacity, { toValue: 0, duration: 80, useNativeDriver: true }),
                        Animated.timing(sealedOpacity, { toValue: 1, duration: 380, useNativeDriver: true }),
                        Animated.spring(sealedScale, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }),
                    ]).start(() => {
                        const burstAnims = particles.map(p =>
                            Animated.sequence([
                                Animated.parallel([
                                    Animated.timing(p.op, { toValue: 1, duration: 180, useNativeDriver: true }),
                                    Animated.spring(p.sc, { toValue: 1, friction: 4, tension: 100, useNativeDriver: true }),
                                    Animated.timing(p.x, { toValue: p.tx, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                                    Animated.timing(p.y, { toValue: p.ty, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                                ]),
                                Animated.timing(p.op, { toValue: 0, duration: 280, useNativeDriver: true }),
                            ])
                        );
                        Animated.parallel([
                            Animated.parallel(burstAnims),
                            Animated.sequence([
                                Animated.delay(220),
                                Animated.parallel([
                                    Animated.timing(lockOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
                                    Animated.spring(lockScale, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }),
                                ]),
                            ]),
                        ]).start(() => {
                            Animated.timing(doneOpacity, { toValue: 1, duration: 380, useNativeDriver: true }).start();
                            setTimeout(onDone, 1100);
                        });
                    });
                });
            }, 700);
        });
    }, []);

    const ITEM_ICONS = ['image-outline', 'videocam-outline', 'musical-notes-outline'] as const;

    return (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: L.bg, zIndex: 3000, alignItems: 'center', justifyContent: 'center' }]}>
            <Animated.View style={{ position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: accent + '18', transform: [{ scale: glowScale }], opacity: glowOpacity }} />
            <Animated.View style={{ position: 'absolute', width: 340, height: 340, borderRadius: 170, borderWidth: 1.5, borderColor: accent + '22', transform: [{ scale: glowScale }], opacity: glowOpacity }} />

            {items.map((item, i) => (
                <Animated.View key={i} style={{ position: 'absolute', bottom: '40%', left: width / 2 - 28 + (i - 1) * 72, transform: [{ translateY: item.y }, { scale: item.sc }], opacity: item.op }}>
                    <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: accent + '12', borderWidth: 1.5, borderColor: accent + '28', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name={ITEM_ICONS[i]} size={26} color={accent} />
                    </View>
                </Animated.View>
            ))}

            <Animated.View style={{ position: 'absolute', opacity: stage === 'sealed' ? new Animated.Value(0) : capOpacity, transform: [{ scale: Animated.multiply(capScale, breathe) }] }}>
                <Image source={{ uri: modelOpenUri || modelUri }} style={{ width: 230, height: 230 }} resizeMode="contain" />
            </Animated.View>

            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', opacity: flash }]} pointerEvents="none" />

            <Animated.View style={{ position: 'absolute', opacity: sealedOpacity, transform: [{ scale: sealedScale }], alignItems: 'center' }}>
                <Image source={{ uri: modelUri }} style={{ width: 230, height: 230 }} resizeMode="contain" />
                <Animated.View style={{ position: 'absolute', bottom: 22, right: '12%', width: 50, height: 50, borderRadius: 25, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', shadowColor: accent, shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 10, opacity: lockOpacity, transform: [{ scale: lockScale }] }}>
                    <Ionicons name="lock-closed" size={22} color="#fff" />
                </Animated.View>
            </Animated.View>

            {particles.map((p, i) => (
                <Animated.View key={i} style={{ position: 'absolute', width: 9, height: 9, borderRadius: 5, backgroundColor: p.color, opacity: p.op, transform: [{ translateX: p.x }, { translateY: p.y }, { scale: p.sc }] }} />
            ))}

            <Animated.View style={{ position: 'absolute', bottom: '16%', alignItems: 'center', opacity: doneOpacity }}>
                <Text style={{ fontSize: 23, fontFamily: Fonts.bold, color: L.text, letterSpacing: -0.4 }}>Sealed for the future ✦</Text>
                <Text style={{ fontSize: 14, color: L.textSec, fontFamily: Fonts.regular, marginTop: 5 }}>Your capsule is locked</Text>
            </Animated.View>
        </View>
    );
}

// ─── Duration Slider ──────────────────────────────────────────────────────────
function DurationSlider({ days, onChange, accent, daysToLabel, setScrollEnabled }: any) {
    return (
        <View style={{ width: '100%' }}>
            <Slider
                style={{ width: '100%', height: 40 }}
                minimumValue={MIN_DAYS} maximumValue={MAX_DAYS} step={1}
                value={days}
                onValueChange={v => onChange(Math.round(v))}
                onSlidingStart={() => setScrollEnabled(false)}
                onSlidingComplete={() => setScrollEnabled(true)}
                minimumTrackTintColor={accent}
                maximumTrackTintColor={L.border}
                thumbTintColor={accent}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 10, color: L.textMuted, fontFamily: Fonts.regular }}>2 weeks</Text>
                <Text style={{ fontSize: 13, color: accent, fontFamily: Fonts.bold }}>{daysToLabel(days)}</Text>
                <Text style={{ fontSize: 10, color: L.textMuted, fontFamily: Fonts.regular }}>1 year</Text>
            </View>
        </View>
    );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CapsuleCreationScreen() {
    const { t } = useTranslation();
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const scrollRef = useRef<ScrollView>(null);
    const titleInputRef = useRef<TextInput>(null);
    const descInputRef = useRef<TextInput>(null);

    const [currentStep, setCurrentStep] = useState<Step>('type');
    const [selectedType, setSelectedType] = useState<CapsuleType | null>(null);
    const [selectedModel, setSelectedModel] = useState('basicred_kap');
    const [hasLegacyCap, setHasLegacyCap] = useState(false);
    const [activeInstaCapCount, setActiveInstaCapCount] = useState(0);
    const [loadingLimits, setLoadingLimits] = useState(true);
    const [showModelPicker, setShowModelPicker] = useState(false);

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [isPublic, setIsPublic] = useState(true);
    const [selectedChainId, setSelectedChainId] = useState<string | null>(null);
    const [isShared, setIsShared] = useState(false);
    const [invitedUsers, setInvitedUsers] = useState<any[]>([]);
    const [userSearchQuery, setUserSearchQuery] = useState('');
    const [userSearchResults, setUserSearchResults] = useState<any[]>([]);
    const [searchingUsers, setSearchingUsers] = useState(false);

    const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
    const [showCustomSlider, setShowCustomSlider] = useState(false);
    const [customDays, setCustomDays] = useState(60);
    const [scrollEnabled, setScrollEnabled] = useState(true);

    const [availableModels, setAvailableModels] = useState<any[]>(timerConfigManager.models);
    const [sealing, setSealing] = useState(false);
    const [showSealAnim, setShowSealAnim] = useState(false);

    const slideAnim = useRef(new Animated.Value(0)).current;
    const capScaleAnim = useRef(new Animated.Value(1)).current;

    const stepIndex = STEPS.indexOf(currentStep);
    const cfg = selectedType ? TYPE_CFG[selectedType as keyof typeof TYPE_CFG] : null;
    const accent = cfg?.accent ?? L.purple;

    const activeEvent = useMemo(() =>
        availableModels.find(m => m.is_event && isEventActive(m.event_start, m.event_end)),
        [availableModels]
    );

    const PRESETS = [
        { label: '2 Weeks', days: 14, emoji: '⚡', sub: '14 days' },
        { label: '1 Month', days: 30, emoji: '🌙', sub: '30 days' },
        { label: '3 Months', days: 90, emoji: '🌸', sub: '90 days' },
        { label: '6 Months', days: 180, emoji: '⭐', sub: '180 days' },
        { label: '1 Year', days: 365, emoji: '🔮', sub: '365 days' },
        { label: 'Custom', days: -1, emoji: '🎛️', sub: 'Any range' },
    ];

    const daysToLabel = (d: number) => {
        if (d <= 14) return '2 Weeks';
        if (d <= 30) return '1 Month';
        if (d <= 90) return '3 Months';
        if (d <= 180) return '6 Months';
        if (d >= 365) return '1 Year';
        return `${d} days`;
    };

    const activeModel = useMemo(() =>
        availableModels.find(m => m.id === selectedModel) ||
        CAPSULE_MODELS.find((m: any) => m.id === selectedModel) ||
        CAPSULE_MODELS[0],
        [selectedModel, availableModels]
    );

    const finalDays: number | null =
        selectedType === 'legacycap' ? 365 * 5 :
            selectedType === 'eventcap' ? null :
                showCustomSlider ? customDays : selectedPreset;

    const openingDate = useMemo(() => {
        if (selectedType === 'eventcap' && activeEvent) return activeEvent.event_end;
        if (finalDays) {
            const d = new Date(); d.setSeconds(0, 0);
            return new Date(d.getTime() + finalDays * 86400000).toISOString();
        }
        return new Date(Date.now() + 365 * 86400000).toISOString();
    }, [selectedType, activeEvent, finalDays]);

    const displayDate = useMemo(() =>
        new Date(openingDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        [openingDate]
    );

    const isNextEnabled = useMemo(() => {
        if (currentStep === 'type') return !!selectedType;
        if (currentStep === 'identity') return title.trim().length > 0 && description.trim().length > 0;
        if (currentStep === 'timing' && selectedType === 'instacap') return !!selectedPreset || showCustomSlider;
        return true;
    }, [currentStep, selectedType, title, description, selectedPreset, showCustomSlider]);

    // ─── User search ──────────────────────────────────────────────────────────
    useEffect(() => {
        let isCurrent = true;
        const query = userSearchQuery.trim();
        if (query.length > 0) {
            const timeout = setTimeout(async () => {
                if (!isCurrent) return;
                setSearchingUsers(true);
                try {
                    const { data: { user } } = await supabase.auth.getUser();
                    let dbQuery = supabase.from('profiles').select('*')
                        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`).limit(10);
                    if (user) dbQuery = dbQuery.neq('id', user.id);
                    const { data } = await dbQuery;
                    if (isCurrent && data) setUserSearchResults(data);
                } catch (e) { } finally { if (isCurrent) setSearchingUsers(false); }
            }, 300);
            return () => { isCurrent = false; clearTimeout(timeout); };
        } else {
            setUserSearchResults([]);
            setSearchingUsers(false);
        }
    }, [userSearchQuery]);

    const toggleInviteUser = (u: any) => {
        if (invitedUsers.some(iu => iu.id === u.id)) {
            setInvitedUsers(invitedUsers.filter(iu => iu.id !== u.id));
        } else {
            if (invitedUsers.length >= 9) { Alert.alert('Limit reached', 'You can invite up to 9 members.'); return; }
            setInvitedUsers([...invitedUsers, u]);
        }
    };

    // ─── Effects ──────────────────────────────────────────────────────────────
    useEffect(() => {
        if (Platform.OS === 'android') {
            NavigationBar.setVisibilityAsync('hidden');
            NavigationBar.setBehaviorAsync('inset-touch');
        }
        const parent = navigation.getParent();
        if (parent) parent.setOptions({ tabBarStyle: { display: 'none' } });
        navigation.setOptions?.({ tabBarStyle: { display: 'none' } });
        return () => {
            if (Platform.OS === 'android') NavigationBar.setVisibilityAsync('visible');
            if (parent) parent.setOptions({ tabBarStyle: undefined });
        };
    }, [navigation]);

    useEffect(() => {
        const check = async () => {
            setLoadingLimits(true);
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const user = session?.user;
                if (user) {
                    const { count: lc } = await supabase.from('capsules').select('*', { count: 'exact', head: true }).eq('owner_id', user.id).eq('type', 'legacycap').eq('status', 'sealed');
                    if (lc != null) setHasLegacyCap(lc > 0);
                    const { count: ic } = await supabase.from('capsules').select('*', { count: 'exact', head: true }).eq('owner_id', user.id).eq('type', 'instacap').eq('status', 'sealed');
                    if (ic != null) setActiveInstaCapCount(ic);
                }
            } catch (e) { } finally { setLoadingLimits(false); }
        };
        check();
        const t = setTimeout(() => setLoadingLimits(false), 5000);
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        const sub = timerConfigManager.subscribe(() => setAvailableModels([...timerConfigManager.models]));
        setAvailableModels([...timerConfigManager.models]);
        return sub;
    }, []);

    useEffect(() => {
        if (selectedType === 'eventcap' && activeEvent?.capsule_model) setSelectedModel(activeEvent.capsule_model);
    }, [selectedType, activeEvent]);

    // ─── Navigation ───────────────────────────────────────────────────────────
    const goToStep = (next: Step, dir: number) => {
        Keyboard.dismiss();
        slideAnim.setValue(dir * width * 0.22);
        setCurrentStep(next);
        Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 11, useNativeDriver: true }).start();
        scrollRef.current?.scrollTo({ y: 0, animated: false });
    };

    const goNext = () => { if (!isNextEnabled) return; if (stepIndex < STEPS.length - 1) goToStep(STEPS[stepIndex + 1], 1); };
    const goBack = () => { if (stepIndex > 0) goToStep(STEPS[stepIndex - 1], -1); };

    // ─── Seal ─────────────────────────────────────────────────────────────────
    const sealCapsule = async () => {
        if (sealing) return;
        setSealing(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user || !selectedType) { setSealing(false); return; }

            if (selectedType === 'legacycap') {
                const { count } = await supabase.from('capsules').select('*', { count: 'exact', head: true }).eq('owner_id', user.id).eq('type', 'legacycap').eq('status', 'sealed');
                if (count && count >= 1) { Alert.alert('Limit reached', 'You already have an active LegacyCap.'); setSealing(false); return; }
            }
            if (selectedType === 'instacap') {
                const { count } = await supabase.from('capsules').select('*', { count: 'exact', head: true }).eq('owner_id', user.id).eq('type', 'instacap').eq('status', 'sealed');
                if (count && count >= 5) { Alert.alert('Limit reached', 'You have 5 active InstaCaps. Open or delete one first.'); setSealing(false); return; }
            }

            const opensAt = selectedType === 'eventcap' && activeEvent
                ? activeEvent.event_end
                : finalDays ? new Date(Date.now() + finalDays * 86400000).toISOString() : null;

            const { data: newCapsule, error } = await supabase.from('capsules').insert({
                owner_id: user.id, type: selectedType, model: selectedModel,
                title: title || 'Untitled Capsule', description,
                is_shared: isShared, duration_days: finalDays, opens_at: opensAt,
                is_public: isPublic, status: 'sealed', chain_id: selectedChainId || null,
            }).select().single();

            if (error) throw error;

            if (isShared && invitedUsers.length > 0 && newCapsule) {
                await supabase.from('capsule_invites').insert(invitedUsers.map(u => ({ capsule_id: newCapsule.id, user_id: u.id, status: 'pending' })));
            }

            setShowSealAnim(true);
            setTimeout(() => {
                setShowSealAnim(false); setSealing(false);
                navigation.reset({ index: 1, routes: [{ name: 'Main' }, { name: 'CapsuleDetail', params: { capsuleId: newCapsule.id } }] });
            }, 5800);
        } catch (e: any) {
            Alert.alert('Error', e.message ?? 'Could not create capsule');
            setSealing(false);
        }
    };

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <View style={s.root}>
            <StatusBar barStyle="dark-content" backgroundColor={L.bg} />

            {showSealAnim && (
                <SealAnimation accent={accent} modelUri={activeModel?.image ?? ''} modelOpenUri={activeModel?.image_open} onDone={() => { }} />
            )}

            {/* Model Picker Modal */}
            <ModelPickerModal
                visible={showModelPicker}
                onClose={() => setShowModelPicker(false)}
                models={availableModels}
                selectedModel={selectedModel}
                onSelect={(id) => {
                    setSelectedModel(id);
                    Animated.sequence([
                        Animated.timing(capScaleAnim, { toValue: 0.87, duration: 90, useNativeDriver: true }),
                        Animated.spring(capScaleAnim, { toValue: 1, friction: 4, tension: 100, useNativeDriver: true }),
                    ]).start();
                }}
                accent={accent}
                selectedType={selectedType}
                activeEvent={activeEvent}
            />

            {/* Header */}
            <View style={[s.header, { paddingTop: insets.top + 4 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Ionicons name="close" size={17} color={L.textSec} />
                </TouchableOpacity>

                <StepPills index={stepIndex} total={STEPS.length} />

                <View style={s.stepChip}>
                    <Text style={[s.stepChipText, { color: L.purple }]}>{stepIndex + 1} of {STEPS.length}</Text>
                </View>
            </View>

            {/* Scrollable content */}
            <Animated.ScrollView
                ref={scrollRef as any}
                style={[s.scroll, { transform: [{ translateX: slideAnim }] }]}
                scrollEnabled={scrollEnabled}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 110 }]}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="none"
            >
                {/* ═══ STEP 1: TYPE ═══════════════════════════════════════ */}
                {currentStep === 'type' && (
                    <View style={s.page}>
                        <Text style={s.eyebrow}>NEW CAPSULE</Text>
                        <Text style={s.pageTitle}>What kind of{'\n'}capsule?</Text>
                        <Text style={s.pageSub}>Each format has its own rules</Text>
                        <View style={{ marginTop: 24 }}>
                            <TypeCard typeKey="legacycap" isSelected={selectedType === 'legacycap'} isLocked={hasLegacyCap || loadingLimits} onPress={() => setSelectedType('legacycap')} />
                            <TypeCard typeKey="instacap" isSelected={selectedType === 'instacap'} isLocked={activeInstaCapCount >= 5 || loadingLimits} onPress={() => setSelectedType('instacap')} />
                            <TypeCard typeKey="eventcap" isSelected={selectedType === 'eventcap'} isLocked={!activeEvent || loadingLimits} onPress={() => setSelectedType('eventcap')} />
                        </View>
                        {selectedType && (
                            <TouchableOpacity activeOpacity={0.85} onPress={() => setIsPublic(p => !p)}
                                style={[s.privacyRow, { borderColor: accent + '35', backgroundColor: cfg?.light }]}>
                                <View style={[s.privacyIcon, { backgroundColor: accent + '18' }]}>
                                    <Ionicons name={isPublic ? 'globe-outline' : 'lock-closed-outline'} size={18} color={accent} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[s.privacyTitle, { color: accent }]}>{isPublic ? 'Public Capsule' : 'Private Capsule'}</Text>
                                    <Text style={s.privacySub}>{isPublic ? 'Visible on profile after opening' : 'Only visible to you'}</Text>
                                </View>
                                <Switch value={isPublic} onValueChange={setIsPublic}
                                    trackColor={{ false: L.border, true: accent + '55' }}
                                    thumbColor={isPublic ? accent : L.textMuted} />
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* ═══ STEP 2: DESIGN ═════════════════════════════════════ */}
                {currentStep === 'design' && (
                    <View style={s.page}>
                        <Text style={s.eyebrow}>APPEARANCE</Text>
                        <Text style={s.pageTitle}>Choose your{'\n'}shell</Text>
                        <Text style={s.pageSub}>Pick a model that feels right</Text>

                        {/* Hero preview — tapping opens the modal */}
                        <View style={s.designHero}>
                            <View style={[s.designGlow, { backgroundColor: accent + '18' }]} />
                            <Animated.View style={{ transform: [{ scale: capScaleAnim }] }}>
                                <CapsuleWithTimer
                                    modelKey={selectedModel}
                                    source={activeModel?.image ? { uri: activeModel.image } : (MODEL_IMAGES as any)[selectedModel]}
                                    date={openingDate}
                                    chainId={selectedChainId}
                                    style={{ width: 180, height: 180 }}
                                    hideTimer
                                />
                            </Animated.View>
                            <Text style={[s.designModelName, { color: accent }]}>{activeModel?.label}</Text>

                            {/* Change model button */}
                            <TouchableOpacity
                                onPress={() => setShowModelPicker(true)}
                                activeOpacity={0.8}
                                style={[s.changeModelBtn, { borderColor: accent + '50', backgroundColor: accent + '0C' }]}
                            >
                                <Ionicons name="color-palette-outline" size={15} color={accent} />
                                <Text style={[s.changeModelText, { color: accent }]}>Change Model</Text>
                                <Ionicons name="chevron-forward" size={13} color={accent + '80'} />
                            </TouchableOpacity>
                        </View>

                        {/* Chain selection */}
                        <Text style={s.sectionLabel}>CHAIN</Text>
                        <ScrollView
                            horizontal showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ paddingHorizontal: 20, gap: 10, paddingBottom: 4 }}
                            style={{ marginHorizontal: -20 }}
                        >
                            <TouchableOpacity
                                onPress={() => setSelectedChainId(null)}
                                style={[s.chainCard, !selectedChainId && { borderColor: accent, backgroundColor: cfg?.light }]}
                            >
                                <View style={s.chainIcon}><Ionicons name="close" size={15} color={L.textMuted} /></View>
                                <Text style={[s.chainLabel, !selectedChainId && { color: accent }]}>None</Text>
                            </TouchableOpacity>
                            {timerConfigManager.getChainLibrary().filter((c: any) => c.is_active !== false).map((chain: any) => (
                                <TouchableOpacity
                                    key={chain.id} onPress={() => setSelectedChainId(chain.id)}
                                    style={[s.chainCard, selectedChainId === chain.id && { borderColor: accent, backgroundColor: cfg?.light }]}
                                >
                                    <View style={s.chainIcon}>
                                        <Image source={{ uri: chain.thumbnail_url || chain.image_url }} style={{ width: '100%', height: '100%', borderRadius: 10 }} resizeMode="cover" />
                                    </View>
                                    <Text style={[s.chainLabel, selectedChainId === chain.id && { color: accent }]} numberOfLines={1}>{chain.name}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* ═══ STEP 3: IDENTITY ═══════════════════════════════════ */}
                {currentStep === 'identity' && (
                    <View style={s.page}>
                        <Text style={s.eyebrow}>IDENTITY</Text>
                        <Text style={s.pageTitle}>Name your{'\n'}capsule</Text>
                        <Text style={s.pageSub}>Write a message to your future self</Text>

                        <View style={[s.previewCard, { borderColor: accent + '35', backgroundColor: cfg?.light }]}>
                            <Image source={activeModel?.image ? { uri: activeModel.image } : (MODEL_IMAGES as any)[selectedModel]} style={{ width: 46, height: 46 }} resizeMode="contain" />
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={[s.previewTitle, { color: title ? L.text : L.textMuted }]} numberOfLines={1}>{title || 'Your title here...'}</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                    <Ionicons name={cfg?.icon as any} size={10} color={accent} />
                                    <Text style={[s.previewMeta, { color: accent }]}>{cfg?.label}</Text>
                                    <Text style={{ color: L.textMuted, fontSize: 10 }}>·</Text>
                                    <Text style={s.previewMeta}>{displayDate}</Text>
                                </View>
                            </View>
                        </View>

                        <View style={s.fieldGroup}>
                            <Text style={s.fieldLabel}>TITLE</Text>
                            <TextInput
                                ref={titleInputRef}
                                style={[s.fieldInput, { borderColor: title ? accent + '80' : L.border }]}
                                placeholder="Give your capsule a name..."
                                placeholderTextColor={L.textMuted}
                                value={title}
                                onChangeText={setTitle}
                                maxLength={31}
                                selectionColor={accent}
                                returnKeyType="next"
                                onSubmitEditing={() => descInputRef.current?.focus()}
                                blurOnSubmit={false}
                            />
                            <Text style={s.charCount}>{title.length}/31</Text>
                        </View>

                        <View style={s.fieldGroup}>
                            <Text style={s.fieldLabel}>MESSAGE</Text>
                            <TextInput
                                ref={descInputRef}
                                style={[s.fieldInput, s.fieldTextArea, { borderColor: description ? accent + '80' : L.border }]}
                                placeholder="Write something to remember. Your future self is listening..."
                                placeholderTextColor={L.textMuted}
                                value={description}
                                onChangeText={setDescription}
                                multiline
                                selectionColor={accent}
                                textAlignVertical="top"
                                scrollEnabled={false}
                            />
                        </View>

                        {selectedType === 'instacap' && (
                            <View style={{ marginTop: 10, gap: 12 }}>
                                <View style={[s.privacyRow, { borderColor: accent + '35', backgroundColor: cfg?.light }]}>
                                    <View style={[s.privacyIcon, { backgroundColor: accent + '18' }]}>
                                        <Ionicons name="people-outline" size={18} color={accent} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[s.privacyTitle, { color: accent }]}>Enable Group Capsule</Text>
                                        <Text style={s.privacySub}>Invite friends to add items to this capsule</Text>
                                    </View>
                                    <Switch value={isShared} onValueChange={setIsShared} trackColor={{ false: L.border, true: accent + '55' }} thumbColor={isShared ? accent : L.textMuted} />
                                </View>

                                {isShared && (
                                    <View style={{ gap: 10 }}>
                                        {invitedUsers.length > 0 && (
                                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                                {invitedUsers.map(u => (
                                                    <View key={u.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: accent + '14', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: accent + '40' }}>
                                                        <Text style={{ fontSize: 12, fontFamily: Fonts.bold, color: accent }}>@{u.username}</Text>
                                                        <TouchableOpacity onPress={() => toggleInviteUser(u)}><Ionicons name="close-circle" size={14} color={accent} /></TouchableOpacity>
                                                    </View>
                                                ))}
                                            </View>
                                        )}
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: L.surface, borderRadius: 16, borderWidth: 1.5, borderColor: L.border, paddingHorizontal: 16, height: 50 }}>
                                            <Ionicons name="search" size={16} color={L.textMuted} />
                                            <TextInput style={{ flex: 1, fontSize: 14, fontFamily: Fonts.semiBold, color: L.text }} placeholder="Search friend by @username..." placeholderTextColor={L.textMuted} value={userSearchQuery} onChangeText={setUserSearchQuery} autoCapitalize="none" />
                                            {searchingUsers && <ActivityIndicator size="small" color={accent} />}
                                        </View>
                                        {userSearchResults.length > 0 && (
                                            <View style={{ backgroundColor: L.surface, borderRadius: 16, borderWidth: 1.5, borderColor: L.border, maxHeight: 180, overflow: 'hidden', elevation: 2 }}>
                                                {userSearchResults.map(u => {
                                                    const isInvited = invitedUsers.some(iu => iu.id === u.id);
                                                    return (
                                                        <TouchableOpacity key={u.id} disabled={isInvited} onPress={() => { toggleInviteUser(u); setUserSearchQuery(''); setUserSearchResults([]); }} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: L.border }}>
                                                            <View>
                                                                <Text style={{ fontSize: 14, fontFamily: Fonts.bold, color: L.text }}>{u.display_name || u.username}</Text>
                                                                <Text style={{ fontSize: 11, color: L.textMuted, fontFamily: Fonts.medium }}>@{u.username}</Text>
                                                            </View>
                                                            {isInvited ? <Ionicons name="checkmark-circle" size={18} color={accent} /> : <Ionicons name="person-add" size={16} color={L.textSec} />}
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>
                                        )}
                                    </View>
                                )}
                            </View>
                        )}
                    </View>
                )}

                {/* ═══ STEP 4: TIMING ═════════════════════════════════════ */}
                {currentStep === 'timing' && (
                    <View style={s.page}>
                        <Text style={s.eyebrow}>TIMING</Text>
                        <Text style={s.pageTitle}>When does{'\n'}it open?</Text>
                        <Text style={s.pageSub}>Choose your reveal moment</Text>

                        {selectedType === 'legacycap' && (
                            <View style={[s.fixedCard, { borderColor: accent + '40', backgroundColor: cfg?.light }]}>
                                <Text style={{ fontSize: 44 }}>⏳</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={[s.fixedTitle, { color: accent }]}>Fixed 5-Year Term</Text>
                                    <Text style={s.fixedDateText}>Opens {displayDate}</Text>
                                    <Text style={s.fixedSub}>LegacyCaps always lock for exactly 5 years.</Text>
                                </View>
                            </View>
                        )}

                        {selectedType === 'instacap' && (<>
                            <View style={[s.presetGrid, { marginTop: 22 }]}>
                                {PRESETS.map(p => {
                                    const isCustom = p.days === -1;
                                    const isActive = isCustom ? showCustomSlider : (!showCustomSlider && selectedPreset === p.days);
                                    return (
                                        <TouchableOpacity key={p.label} activeOpacity={0.8}
                                            onPress={() => { if (isCustom) { setShowCustomSlider(true); setSelectedPreset(null); } else { setShowCustomSlider(false); setSelectedPreset(p.days); } }}
                                            style={[s.presetCard, isActive && { borderColor: accent, backgroundColor: cfg?.light }]}
                                        >
                                            <Text style={{ fontSize: 28, marginBottom: 4 }}>{p.emoji}</Text>
                                            <Text style={[s.presetLabel, isActive && { color: accent }]}>{p.label}</Text>
                                            <Text style={s.presetSub}>{p.sub}</Text>
                                            {isActive && <View style={[s.presetCheck, { backgroundColor: accent }]}><Ionicons name="checkmark" size={8} color="#fff" /></View>}
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                            {showCustomSlider && (
                                <View style={[s.sliderCard, { borderColor: accent + '40' }]}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                                        <Ionicons name="timer-outline" size={18} color={accent} />
                                        <Text style={[s.sliderTitle, { marginLeft: 8, flex: 1 }]}>Custom duration</Text>
                                        <Text style={[s.sliderTitle, { color: accent }]}>{daysToLabel(customDays)}</Text>
                                    </View>
                                    <DurationSlider days={customDays} onChange={setCustomDays} accent={accent} daysToLabel={daysToLabel} setScrollEnabled={setScrollEnabled} />
                                </View>
                            )}
                            {(selectedPreset || showCustomSlider) && (
                                <View style={[s.openDateRow, { borderColor: accent + '40', backgroundColor: cfg?.light }]}>
                                    <View style={[s.openDateIconWrap, { backgroundColor: accent + '18' }]}>
                                        <Ionicons name="calendar" size={20} color={accent} />
                                    </View>
                                    <View>
                                        <Text style={s.openDateLbl}>Opening date</Text>
                                        <Text style={[s.openDateVal, { color: accent }]}>{displayDate}</Text>
                                    </View>
                                </View>
                            )}
                        </>)}

                        {selectedType === 'eventcap' && (
                            <View style={[s.fixedCard, { borderColor: accent + '40', backgroundColor: cfg?.light }]}>
                                <Text style={{ fontSize: 44 }}>🌍</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={[s.fixedTitle, { color: accent }]}>Global Sync Opening</Text>
                                    <Text style={s.fixedDateText}>{activeEvent?.event_title ?? 'Event capsule'}</Text>
                                    <Text style={s.fixedSub}>All EventCaps open simultaneously worldwide.</Text>
                                </View>
                            </View>
                        )}
                    </View>
                )}

                {/* ═══ STEP 5: REVIEW ═════════════════════════════════════ */}
                {currentStep === 'review' && (
                    <View style={s.page}>
                        <Text style={s.eyebrow}>REVIEW</Text>
                        <Text style={s.pageTitle}>Almost{'\n'}there</Text>
                        <Text style={s.pageSub}>Sealing is permanent — settings can't be changed after</Text>

                        <View style={s.reviewHero}>
                            <View style={[s.reviewGlow, { backgroundColor: accent + '18' }]} />
                            <CapsuleWithTimer
                                modelKey={selectedModel}
                                source={{ uri: activeModel?.image ?? '' }}
                                date={openingDate}
                                chainId={selectedChainId}
                                capsuleType={selectedType || undefined}
                                style={{ width: 170, height: 170 }}
                            />
                            <View style={[s.reviewBadge, { backgroundColor: cfg?.light, borderColor: accent + '40' }]}>
                                <Ionicons name={cfg?.icon as any} size={11} color={accent} />
                                <Text style={[s.reviewBadgeText, { color: accent }]}>{cfg?.label}</Text>
                            </View>
                            <Text style={s.reviewTitle}>{title || 'Untitled Capsule'}</Text>
                            <Text style={s.reviewDate}>Opens {displayDate}</Text>
                        </View>

                        <View style={s.summaryGrid}>
                            {[
                                { icon: 'cube-outline', label: 'Type', value: cfg?.label ?? '—', ok: !!selectedType },
                                { icon: 'text-outline', label: 'Title', value: title || '—', ok: !!title },
                                { icon: 'time-outline', label: 'Duration', value: selectedType === 'legacycap' ? '5 Years' : selectedType === 'eventcap' ? 'Event sync' : finalDays ? daysToLabel(finalDays) : '—', ok: !!finalDays || selectedType !== 'instacap' },
                                { icon: 'color-palette-outline', label: 'Model', value: activeModel?.label ?? '—', ok: true },
                                { icon: isPublic ? 'globe-outline' : 'lock-closed-outline', label: 'Privacy', value: isPublic ? 'Public' : 'Private', ok: true },
                                { icon: 'people-outline', label: 'Group', value: selectedType === 'instacap' ? 'Supported ✓' : 'Solo only', ok: selectedType === 'instacap' },
                            ].map((item, i) => (
                                <View key={i} style={[s.summaryCard, { borderColor: item.ok ? accent + '28' : L.border }]}>
                                    <View style={[s.summaryIcon, { backgroundColor: item.ok ? accent + '12' : L.surfaceAlt }]}>
                                        <Ionicons name={item.icon as any} size={14} color={item.ok ? accent : L.textMuted} />
                                    </View>
                                    <Text style={s.summaryLabel}>{item.label}</Text>
                                    <Text style={[s.summaryValue, { color: item.ok ? L.text : L.textMuted }]} numberOfLines={1}>{item.value}</Text>
                                </View>
                            ))}
                        </View>

                        <View style={s.warningBox}>
                            <Ionicons name="information-circle-outline" size={16} color="#3B5BDB" />
                            <Text style={s.warningText}>Once sealed, title, type, and duration cannot be changed. You can still add media after sealing.</Text>
                        </View>

                        <TouchableOpacity onPress={sealCapsule} disabled={sealing} activeOpacity={0.88}
                            style={[s.sealBtn, { backgroundColor: accent, opacity: sealing ? 0.7 : 1 }]}>
                            {sealing ? <ActivityIndicator size="small" color="#fff" /> : (<>
                                <Ionicons name="lock-closed" size={19} color="#fff" />
                                <Text style={s.sealBtnText}>Seal Capsule</Text>
                            </>)}
                        </TouchableOpacity>

                        <TouchableOpacity onPress={goBack} style={s.editLink} activeOpacity={0.7}>
                            <Ionicons name="chevron-back" size={13} color={L.textMuted} />
                            <Text style={s.editLinkText}>Edit details</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </Animated.ScrollView>

            {/* Bottom Nav */}
            {currentStep !== 'review' && (
                <View style={[s.bottomNav, { paddingBottom: Math.max(insets.bottom + 6, 18) }]}>
                    {stepIndex > 0 && (
                        <TouchableOpacity onPress={goBack} style={s.backBtn} activeOpacity={0.75}>
                            <Ionicons name="chevron-back" size={20} color={L.textSec} />
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={goNext} disabled={!isNextEnabled} activeOpacity={0.88}
                        style={[s.nextBtn, { backgroundColor: isNextEnabled ? accent : L.borderStrong }]}>
                        <Text style={[s.nextBtnText, { color: isNextEnabled ? '#fff' : L.textMuted }]}>
                            {currentStep === 'timing' ? 'Review →' : 'Continue →'}
                        </Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: L.bg },

    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingBottom: 10, backgroundColor: L.bg, zIndex: 100,
    },
    closeBtn: {
        width: 34, height: 34, borderRadius: 17, backgroundColor: L.surface,
        borderWidth: 1, borderColor: L.border, alignItems: 'center', justifyContent: 'center',
        shadowColor: L.shadow, shadowOpacity: 1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1,
    },
    stepChip: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: L.purpleLight, borderRadius: 20, borderWidth: 1, borderColor: L.purpleBorder },
    stepChipText: { fontSize: 11, fontFamily: Fonts.bold, letterSpacing: 0.3 },

    scroll: { flex: 1, backgroundColor: L.bg },
    scrollContent: { paddingTop: 4 },

    page: { paddingHorizontal: 20, paddingTop: 10 },
    eyebrow: { fontSize: 10, fontFamily: Fonts.bold, color: L.purple, letterSpacing: 2, marginBottom: 8, opacity: 0.7 },
    pageTitle: { fontSize: 34, fontFamily: Fonts.bold, color: L.text, lineHeight: 40, letterSpacing: -0.8, marginBottom: 6 },
    pageSub: { fontSize: 14, color: L.textSec, fontFamily: Fonts.regular },

    privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1.5, padding: 14, marginTop: 16 },
    privacyIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    privacyTitle: { fontSize: 14, fontFamily: Fonts.semiBold },
    privacySub: { fontSize: 12, color: L.textSec, fontFamily: Fonts.regular, marginTop: 2 },

    // Design step
    designHero: { alignItems: 'center', justifyContent: 'center', paddingVertical: 24, position: 'relative' },
    designGlow: { position: 'absolute', width: 200, height: 200, borderRadius: 100, top: '5%' },
    designModelName: { fontSize: 15, fontFamily: Fonts.bold, marginTop: 12, letterSpacing: 0.3 },
    changeModelBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 7,
        marginTop: 14, paddingHorizontal: 18, paddingVertical: 10,
        borderRadius: 22, borderWidth: 1.5,
    },
    changeModelText: { fontSize: 13, fontFamily: Fonts.semiBold, flex: 1 },
    sectionLabel: { fontSize: 10, fontFamily: Fonts.bold, color: L.textMuted, letterSpacing: 2, marginBottom: 10 },

    chainCard: { width: 68, alignItems: 'center', padding: 8, gap: 5, borderRadius: 16, borderWidth: 1.5, borderColor: L.border, backgroundColor: L.surface },
    chainIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: L.surfaceAlt, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    chainLabel: { fontSize: 10, fontFamily: Fonts.medium, color: L.textSec, textAlign: 'center' },

    // Identity step
    previewCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1.5, padding: 14, marginTop: 20, marginBottom: 22 },
    previewTitle: { fontSize: 16, fontFamily: Fonts.bold, marginBottom: 4 },
    previewMeta: { fontSize: 11, fontFamily: Fonts.semiBold, color: L.textSec },
    fieldGroup: { marginBottom: 18 },
    fieldLabel: { fontSize: 10, fontFamily: Fonts.bold, color: L.purple, letterSpacing: 1.5, marginBottom: 8, opacity: 0.8 },
    fieldInput: {
        backgroundColor: L.surface, borderWidth: 1.5, borderRadius: 16,
        paddingHorizontal: 16, paddingVertical: 14,
        fontSize: 17, fontFamily: Fonts.semiBold, color: L.text,
        shadowColor: L.shadow, shadowOpacity: 1, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1,
    },
    fieldTextArea: { minHeight: 130, fontSize: 15, fontFamily: Fonts.regular, paddingTop: 14, textAlignVertical: 'top' },
    charCount: { fontSize: 10, color: L.textMuted, fontFamily: Fonts.regular, textAlign: 'right', marginTop: 5 },

    // Timing
    presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
    presetCard: {
        width: (width - 40 - 20) / 3,
        backgroundColor: L.surface, borderRadius: 20, borderWidth: 1.5, borderColor: L.border,
        paddingVertical: 18, paddingHorizontal: 8, alignItems: 'center', position: 'relative',
        shadowColor: L.shadow, shadowOpacity: 1, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    presetLabel: { fontSize: 13, fontFamily: Fonts.bold, color: L.text, textAlign: 'center', marginBottom: 2 },
    presetSub: { fontSize: 10, fontFamily: Fonts.regular, color: L.textMuted },
    presetCheck: { position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    fixedCard: { flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: 20, padding: 20, borderWidth: 1.5, marginTop: 20 },
    fixedTitle: { fontSize: 16, fontFamily: Fonts.bold, marginBottom: 4 },
    fixedDateText: { fontSize: 13, fontFamily: Fonts.semiBold, color: L.textSec, marginBottom: 4 },
    fixedSub: { fontSize: 12, fontFamily: Fonts.regular, color: L.textSec, lineHeight: 17 },
    sliderCard: { borderRadius: 18, borderWidth: 1.5, padding: 16, backgroundColor: L.surface, marginBottom: 14 },
    sliderTitle: { fontSize: 14, fontFamily: Fonts.semiBold, color: L.text },
    openDateRow: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 18, borderWidth: 1.5, padding: 14 },
    openDateIconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    openDateLbl: { fontSize: 11, color: L.textSec, fontFamily: Fonts.regular },
    openDateVal: { fontSize: 17, fontFamily: Fonts.bold, marginTop: 2 },

    // Review
    reviewHero: { alignItems: 'center', paddingVertical: 10, marginBottom: 22, marginTop: 16, position: 'relative' },
    reviewGlow: { position: 'absolute', width: 200, height: 200, borderRadius: 100, top: 0 },
    reviewBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, marginTop: 14 },
    reviewBadgeText: { fontSize: 11, fontFamily: Fonts.bold },
    reviewTitle: { fontSize: 24, fontFamily: Fonts.bold, color: L.text, marginTop: 6, textAlign: 'center', letterSpacing: -0.3 },
    reviewDate: { fontSize: 13, color: L.textSec, fontFamily: Fonts.regular, marginTop: 4 },

    summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
    summaryCard: {
        width: (width - 40 - 10) / 2,
        backgroundColor: L.surface, borderRadius: 18, borderWidth: 1.5,
        padding: 14, gap: 6,
        shadowColor: L.shadow, shadowOpacity: 1, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1,
    },
    summaryIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    summaryLabel: { fontSize: 10, fontFamily: Fonts.bold, color: L.textMuted, letterSpacing: 1 },
    summaryValue: { fontSize: 13, fontFamily: Fonts.semiBold },

    warningBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 14, borderWidth: 1, borderColor: L.blueBorder, backgroundColor: L.blueLight, padding: 14, marginBottom: 22 },
    warningText: { fontSize: 12, color: L.blue, fontFamily: Fonts.regular, flex: 1, lineHeight: 18 },

    sealBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 20, paddingVertical: 18, marginBottom: 10, shadowColor: L.shadowMd, shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 5 },
    sealBtnText: { color: '#fff', fontSize: 17, fontFamily: Fonts.bold },
    editLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8 },
    editLinkText: { fontSize: 13, color: L.textMuted, fontFamily: Fonts.medium },

    bottomNav: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 12, backgroundColor: L.surface, borderTopWidth: 1, borderTopColor: L.border, shadowColor: L.shadowMd, shadowOpacity: 1, shadowRadius: 14, shadowOffset: { width: 0, height: -4 }, elevation: 10 },
    backBtn: { width: 52, height: 52, borderRadius: 16, backgroundColor: L.surfaceAlt, borderWidth: 1, borderColor: L.border, alignItems: 'center', justifyContent: 'center' },
    nextBtn: { flex: 1, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: L.shadowMd, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
    nextBtnText: { fontSize: 15, fontFamily: Fonts.bold, letterSpacing: 0.3 },
});