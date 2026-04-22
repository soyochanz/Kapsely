import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    TextInput, StatusBar, Dimensions, Switch,
    Image, Animated, Alert, ActivityIndicator,
    Easing, Modal, Platform, Keyboard, KeyboardAvoidingView,
} from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import DateTimePicker from '@react-native-community/datetimepicker';
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
const MIN_DAYS = 7;
const MAX_DAYS = 365 * 5;
type Step = 'mode' | 'design' | 'identity' | 'timing' | 'review';
const CLOSED_STEPS: Step[] = ['mode', 'design', 'identity', 'timing', 'review'];
const OPEN_STEPS: Step[] = ['mode', 'design', 'identity', 'review'];

// ─── Design Tokens — Soft White + Warm Rose/Lavender ─────────────────────────
const L = {
    bg: '#FDFBFF',
    surface: '#FFFFFF',
    surfaceAlt: '#F5F3FB',
    surfaceGlass: 'rgba(255,255,255,0.72)',
    border: '#EAE6F5',
    borderStrong: '#D4CEEC',
    text: '#1A1530',
    textSec: '#5C5778',
    textMuted: '#A09CC0',
    shadow: 'rgba(100,80,200,0.08)',
    shadowMd: 'rgba(100,80,200,0.18)',
    // Brand purples/rose
    purple: '#7C5CBF',
    purpleLight: '#F3EEFF',
    purpleBorder: '#DDD0F8',
    purpleMid: '#9B7FD4',
    rose: '#C06090',
    roseLight: '#FFF0F6',
    roseBorder: '#F5C6DC',
    // Brand blues
    blue: '#4A6BE0',
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
        gradientFull: ['#C84B31', '#E5623D', '#F0856A'] as const,
        emoji: '⏳',
        icon: 'time' as const,
        label: 'LegacyCap',
        tagline: '5-year time vault. One life commitment.',
        limit: '1 active capsule max',
        limitIcon: 'alert-circle-outline' as const,
        rules: [
            'Only one LegacyCap at a time',
            'Duration: 1 year → 5 years',
            'Cannot change settings after sealing',
        ],
        groupOk: true,
    },
    instacap: {
        accent: '#7C5CBF',
        light: '#F3EEFF',
        border: '#DDD0F8',
        gradient: ['#7C5CBF', '#9B7FD4'] as const,
        gradientFull: ['#7C5CBF', '#9B7FD4', '#C06090'] as const,
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
        gradientFull: ['#B87A1A', '#D4922A', '#E8B060'] as const,
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
        groupOk: true,
    },
    opencap: {
        accent: '#4A6BE0',
        light: '#EEF2FF',
        border: '#C5D0FA',
        gradient: ['#4A6BE0', '#6B8FF5'] as const,
        gradientFull: ['#4A6BE0', '#6B8FF5', '#9BB0FC'] as const,
        emoji: '📖',
        icon: 'book' as const,
        label: 'OpenCap',
        tagline: 'Permanent public capsule. No timer, no blur.',
        limit: 'Unlimited',
        limitIcon: 'infinite-outline' as const,
        rules: [
            'Instantly visible and public',
            'No blurring or lock mechanism',
            'Skip the timer — open to all',
        ],
        groupOk: true,
    },
} as const;

function isEventActive(s?: string, e?: string) {
    if (!s || !e) return false;
    const now = new Date();
    return now >= new Date(s) && now <= new Date(e);
}

// ─── Floating orb background decoration ──────────────────────────────────────
function AmbientOrbs({ accent }: { accent: string }) {
    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <View style={{
                position: 'absolute', top: -60, right: -40,
                width: 220, height: 220, borderRadius: 110,
                backgroundColor: accent + '0C',
            }} />
            <View style={{
                position: 'absolute', top: 80, left: -60,
                width: 160, height: 160, borderRadius: 80,
                backgroundColor: accent + '08',
            }} />
            <View style={{
                position: 'absolute', bottom: 100, right: -30,
                width: 140, height: 140, borderRadius: 70,
                backgroundColor: L.rose + '0A',
            }} />
        </View>
    );
}

// ─── Step Pill Progress (enhanced) ───────────────────────────────────────────
function StepPills({ index, total, accent }: { index: number; total: number; accent: string }) {
    const anims = useRef(Array.from({ length: total }, () => new Animated.Value(0))).current;

    useEffect(() => {
        anims.forEach((anim, i) => {
            Animated.timing(anim, {
                toValue: i <= index ? 1 : 0,
                duration: 300,
                delay: i * 40,
                useNativeDriver: false,
            }).start();
        });
    }, [index]);

    return (
        <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
            {Array.from({ length: total }).map((_, i) => {
                const widthAnim = anims[i].interpolate({
                    inputRange: [0, 1],
                    outputRange: [i === index ? 20 : 7, i === index ? 28 : 7],
                });
                return (
                    <Animated.View key={i} style={{
                        height: 5, borderRadius: 3,
                        width: i === index ? 28 : 7,
                        backgroundColor: i <= index ? accent : L.border,
                        opacity: i < index ? 0.55 : 1,
                    }} />
                );
            })}
        </View>
    );
}

// ─── Type Card (refined) ──────────────────────────────────────────────────────
function TypeCard({ typeKey, isSelected, isLocked, onPress }: {
    typeKey: keyof typeof TYPE_CFG;
    isSelected: boolean;
    isLocked: boolean;
    onPress: () => void;
}) {
    const cfg = TYPE_CFG[typeKey];
    const scale = useRef(new Animated.Value(1)).current;
    const glow = useRef(new Animated.Value(0)).current;

    const press = () => {
        if (isLocked) return;
        Animated.sequence([
            Animated.timing(scale, { toValue: 0.97, duration: 65, useNativeDriver: true }),
            Animated.spring(scale, { toValue: 1, friction: 5, tension: 130, useNativeDriver: true }),
        ]).start();
        Animated.timing(glow, { toValue: isSelected ? 0 : 1, duration: 250, useNativeDriver: false }).start();
        onPress();
    };

    useEffect(() => {
        Animated.timing(glow, { toValue: isSelected ? 1 : 0, duration: 300, useNativeDriver: false }).start();
    }, [isSelected]);

    const borderColor = glow.interpolate({
        inputRange: [0, 1],
        outputRange: [L.border, cfg.accent],
    });

    return (
        <Animated.View style={{ transform: [{ scale }], marginBottom: 10 }}>
            <Animated.View style={[typeCardS.card, { borderColor }, isSelected && { backgroundColor: cfg.light }, isLocked && { opacity: 0.42 }]}>
                <TouchableOpacity activeOpacity={1} onPress={press} disabled={isLocked}>
                    <View style={typeCardS.topRow}>
                        <View style={[typeCardS.iconWrap, {
                            backgroundColor: isSelected ? cfg.accent + '15' : L.surfaceAlt,
                            borderColor: isSelected ? cfg.border : L.border,
                        }]}>
                            <Text style={{ fontSize: 28 }}>{cfg.emoji}</Text>
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
                                    ? <LinearGradient colors={cfg.gradient} style={typeCardS.checkCircle}><Ionicons name="checkmark" size={13} color="#fff" /></LinearGradient>
                                    : <View style={typeCardS.emptyCircle} />
                            }
                        </View>
                    </View>

                    {isSelected && (
                        <View style={[typeCardS.rulesBox, { borderTopColor: cfg.border, backgroundColor: cfg.accent + '06' }]}>
                            {cfg.rules.map((r, i) => (
                                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: i < cfg.rules.length - 1 ? 6 : 0 }}>
                                    <LinearGradient colors={cfg.gradient} style={typeCardS.dot} />
                                    <Text style={[typeCardS.ruleText, { color: cfg.accent + 'CC' }]}>{r}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                </TouchableOpacity>
            </Animated.View>
        </Animated.View>
    );
}

const typeCardS = StyleSheet.create({
    card: {
        backgroundColor: L.surface, borderRadius: 22, borderWidth: 1.5, borderColor: L.border,
        shadowColor: L.shadow, shadowOpacity: 1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
        overflow: 'hidden',
    },
    topRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
    iconWrap: {
        width: 58, height: 58, borderRadius: 16,
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
    dot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
    ruleText: { fontSize: 12, fontFamily: Fonts.medium, flex: 1 },
});

// ─── Model Picker Modal ───────────────────────────────────────────────────────
function ModelPickerModal({
    visible, onClose, models, selectedModel, onSelect, accent, selectedType, activeEvent, drops
}: {
    visible: boolean;
    onClose: () => void;
    models: any[];
    selectedModel: string;
    onSelect: (id: string) => void;
    accent: string;
    selectedType: string | null;
    activeEvent: any;
    drops: any[];
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
        
        // If it's an event capsule, only show event models
        if (selectedType === 'eventcap') return m.is_event;
        
        // For other types, show non-event models
        return !m.is_event;
    });

    const groupedModels = useMemo(() => {
        const groups: Record<string, any[]> = { 'Regular': [] };
        
        filteredModels.forEach(m => {
            const drop = m.drop_id ? drops.find(d => d.id === m.drop_id) : null;
            if (drop) {
                // Check if drop is active (current date within range)
                const now = new Date();
                const isDropActive = now >= new Date(drop.start_date) && now <= new Date(drop.end_date);
                
                if (isDropActive) {
                    if (!groups[drop.name]) groups[drop.name] = [];
                    groups[drop.name].push(m);
                }
            } else {
                groups['Regular'].push(m);
            }
        });
        
        return groups;
    }, [filteredModels, drops]);

    return (
        <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
            <TouchableOpacity
                style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,10,30,0.55)' }}
                activeOpacity={1}
                onPress={onClose}
            />
            <Animated.View style={[
                modalS.sheet,
                { paddingBottom: Math.max(insets.bottom, 24), transform: [{ translateY: slideAnim }] }
            ]}>
                <View style={modalS.handle} />
                <LinearGradient
                    colors={[accent + '18', 'transparent']}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 80, borderTopLeftRadius: 32, borderTopRightRadius: 32 }}
                />
                <View style={modalS.sheetHeader}>
                    <View>
                        <Text style={modalS.sheetTitle}>Choose Model</Text>
                        <Text style={modalS.sheetSub}>Pick a shell for your capsule</Text>
                    </View>
                    <TouchableOpacity onPress={onClose} style={[modalS.closeBtn, { borderColor: accent + '30', backgroundColor: accent + '0A' }]}>
                        <Ionicons name="close" size={16} color={accent} />
                    </TouchableOpacity>
                </View>
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 20 }}
                >
                    {Object.entries(groupedModels).map(([groupName, groupModels]) => {
                        if (groupModels.length === 0) return null;
                        
                        return (
                            <View key={groupName} style={modalS.groupSection}>
                                <View style={modalS.groupHeader}>
                                    <Text style={modalS.groupTitle}>{groupName}</Text>
                                    {groupName !== 'Regular' && (
                                        <View style={[modalS.dropLabel, { backgroundColor: accent + '15' }]}>
                                            <Ionicons name="flash" size={10} color={accent} />
                                            <Text style={[modalS.dropLabelText, { color: accent }]}>ACTIVE DROP</Text>
                                        </View>
                                    )}
                                </View>
                                <View style={modalS.grid}>
                                    {groupModels.map((model) => {
                                        const isActive = selectedModel === model.id;
                                        return (
                                            <TouchableOpacity
                                                key={model.id}
                                                onPress={() => { onSelect(model.id); onClose(); }}
                                                activeOpacity={0.8}
                                                style={[modalS.modelCard, isActive && { borderColor: accent, backgroundColor: accent + '08' }]}
                                            >
                                                {isActive && (
                                                    <LinearGradient colors={[accent, accent + 'CC']} style={modalS.selectedBadge}>
                                                        <Ionicons name="checkmark" size={10} color="#fff" />
                                                    </LinearGradient>
                                                )}
                                                <View style={modalS.modelImgWrap}>
                                                    <Image source={{ uri: model.image }} style={modalS.modelImg} resizeMode="contain" />
                                                </View>
                                                <Text style={[modalS.modelLabel, isActive && { color: accent }]} numberOfLines={2}>{model.label}</Text>
                                                {model.is_event && (
                                                    <View style={modalS.eventBadge}>
                                                        <Text style={modalS.eventBadgeText}>EVENT</Text>
                                                    </View>
                                                )}
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>
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
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        maxHeight: height * 0.82,
        paddingTop: 10,
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 30,
        shadowOffset: { width: 0, height: -8 },
        elevation: 20,
    },
    handle: {
        width: 40, height: 4, borderRadius: 2,
        backgroundColor: L.borderStrong,
        alignSelf: 'center', marginBottom: 16,
    },
    sheetHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 22, marginBottom: 18,
    },
    sheetTitle: { fontSize: 22, fontFamily: Fonts.bold, color: L.text, letterSpacing: -0.5 },
    sheetSub: { fontSize: 13, color: L.textMuted, fontFamily: Fonts.regular, marginTop: 2 },
    closeBtn: {
        width: 34, height: 34, borderRadius: 17,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1,
    },
    grid: {
        flexDirection: 'row', flexWrap: 'wrap',
        paddingHorizontal: 16, gap: 12, paddingBottom: 20,
    },
    modelCard: {
        width: (width - 32 - 12 * 2) / 3,
        backgroundColor: L.surfaceAlt,
        borderRadius: 20, borderWidth: 1.5, borderColor: L.border,
        paddingVertical: 14, paddingHorizontal: 8,
        alignItems: 'center', gap: 8,
        position: 'relative',
    },
    selectedBadge: {
        position: 'absolute', top: 8, right: 8,
        width: 20, height: 20, borderRadius: 10,
        alignItems: 'center', justifyContent: 'center',
    },
    modelImgWrap: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
    modelImg: { width: 68, height: 68 },
    modelLabel: { fontSize: 11, fontFamily: Fonts.semiBold, color: L.textSec, textAlign: 'center', lineHeight: 15 },
    eventBadge: { backgroundColor: '#B87A1A20', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
    eventBadgeText: { fontSize: 8, fontFamily: Fonts.bold, color: '#B87A1A', letterSpacing: 1 },
    groupSection: { marginBottom: 20 },
    groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, marginBottom: 10 },
    groupTitle: { fontSize: 13, fontFamily: Fonts.bold, color: L.textSec, textTransform: 'uppercase', letterSpacing: 1 },
    dropLabel: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    dropLabelText: { fontSize: 9, fontFamily: Fonts.bold },
});

// ─── Seal Animation ───────────────────────────────────────────────────────────
function SealAnimation({ accent, modelUri, modelOpenUri, onDone, isOpen }: {
    accent: string; modelUri: string; modelOpenUri?: string; onDone: () => void; isOpen?: boolean;
}) {
    const { t } = useTranslation();
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
    const bgDarken = useRef(new Animated.Value(0)).current;
    const ring1Scale = useRef(new Animated.Value(0.1)).current;
    const ring1Opacity = useRef(new Animated.Value(0)).current;
    const ring2Scale = useRef(new Animated.Value(0.1)).current;
    const ring2Opacity = useRef(new Animated.Value(0)).current;
    const ring3Scale = useRef(new Animated.Value(0.1)).current;
    const ring3Opacity = useRef(new Animated.Value(0)).current;
    const capY = useRef(new Animated.Value(0)).current;

    const particles = useRef(
        Array.from({ length: 12 }, (_, i) => {
            const angle = (i / 12) * Math.PI * 2;
            const dist = 80 + Math.random() * 70;
            return {
                x: new Animated.Value(0), y: new Animated.Value(0),
                op: new Animated.Value(0), sc: new Animated.Value(0),
                tx: Math.cos(angle) * dist, ty: Math.sin(angle) * dist,
                color: [accent, accent + 'BB', '#a855f7', '#818cf8', '#c084fc', '#6366f1', accent, '#ddd6fe', accent + 'DD', L.purple, '#7c3aed', accent][i],
                size: 6 + Math.random() * 8,
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
                        Animated.delay(i * 280),
                        Animated.parallel([
                            Animated.timing(item.op, { toValue: 1, duration: 200, useNativeDriver: true }),
                            Animated.spring(item.sc, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
                            Animated.timing(item.y, { toValue: -20, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
                        ]),
                        Animated.parallel([
                            Animated.timing(item.op, { toValue: 0, duration: 240, useNativeDriver: true }),
                            Animated.timing(item.y, { toValue: -90, duration: 340, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
                            Animated.timing(item.sc, { toValue: 0.15, duration: 340, useNativeDriver: true }),
                        ]),
                    ])
                );
                Animated.sequence([
                    Animated.parallel(seqs),
                    Animated.delay(120),
                    Animated.parallel([
                        Animated.timing(bgDarken, { toValue: 1, duration: 400, useNativeDriver: true }),
                        Animated.timing(capY, { toValue: -8, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
                        Animated.timing(capScale, { toValue: 1.35, duration: 350, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }),
                        Animated.timing(glowScale, { toValue: 1.6, duration: 350, useNativeDriver: true }),
                        Animated.timing(glowOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
                    ]),
                    Animated.timing(flash, { toValue: 1, duration: 150, useNativeDriver: true }),
                ]).start(() => {
                    setStage('sealed');
                    Animated.parallel([
                        Animated.timing(flash, { toValue: 0, duration: 500, useNativeDriver: true }),
                        Animated.timing(capOpacity, { toValue: 0, duration: 60, useNativeDriver: true }),
                        Animated.timing(sealedOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
                        Animated.spring(sealedScale, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }),
                        Animated.parallel([
                            Animated.timing(ring1Scale, { toValue: 2.2, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                            Animated.sequence([
                                Animated.timing(ring1Opacity, { toValue: 0.9, duration: 80, useNativeDriver: true }),
                                Animated.timing(ring1Opacity, { toValue: 0, duration: 620, useNativeDriver: true }),
                            ]),
                        ]),
                        Animated.sequence([
                            Animated.delay(140),
                            Animated.parallel([
                                Animated.timing(ring2Scale, { toValue: 2.6, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                                Animated.sequence([
                                    Animated.timing(ring2Opacity, { toValue: 0.7, duration: 80, useNativeDriver: true }),
                                    Animated.timing(ring2Opacity, { toValue: 0, duration: 620, useNativeDriver: true }),
                                ]),
                            ]),
                        ]),
                        Animated.sequence([
                            Animated.delay(280),
                            Animated.parallel([
                                Animated.timing(ring3Scale, { toValue: 3.0, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                                Animated.sequence([
                                    Animated.timing(ring3Opacity, { toValue: 0.5, duration: 80, useNativeDriver: true }),
                                    Animated.timing(ring3Opacity, { toValue: 0, duration: 620, useNativeDriver: true }),
                                ]),
                            ]),
                        ]),
                    ]).start(() => {
                        const burstAnims = particles.map(p =>
                            Animated.sequence([
                                Animated.parallel([
                                    Animated.timing(p.op, { toValue: 1, duration: 160, useNativeDriver: true }),
                                    Animated.spring(p.sc, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
                                    Animated.timing(p.x, { toValue: p.tx, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                                    Animated.timing(p.y, { toValue: p.ty, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                                ]),
                                Animated.timing(p.op, { toValue: 0, duration: 300, useNativeDriver: true }),
                            ])
                        );
                        Animated.parallel([
                            Animated.parallel(burstAnims),
                            Animated.sequence([
                                Animated.delay(180),
                                Animated.parallel([
                                    Animated.timing(lockOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
                                    Animated.spring(lockScale, { toValue: 1, friction: 3, tension: 100, useNativeDriver: true }),
                                ]),
                            ]),
                        ]).start(() => {
                            Animated.timing(doneOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
                            setTimeout(onDone, 1200);
                        });
                    });
                });
            }, 700);
        });
    }, []);

    const ITEM_ICONS = ['image-outline', 'videocam-outline', 'musical-notes-outline'] as const;
    const bgColor = bgDarken.interpolate({ inputRange: [0, 1], outputRange: [L.bg, '#0D0A1A'] });

    return (
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: bgColor as any, zIndex: 3000, alignItems: 'center', justifyContent: 'center' }]}>
            <Animated.View style={{ position: 'absolute', width: 240, height: 240, borderRadius: 120, borderWidth: 2, borderColor: accent + '60', transform: [{ scale: ring1Scale }], opacity: ring1Opacity }} />
            <Animated.View style={{ position: 'absolute', width: 240, height: 240, borderRadius: 120, borderWidth: 1.5, borderColor: accent + '40', transform: [{ scale: ring2Scale }], opacity: ring2Opacity }} />
            <Animated.View style={{ position: 'absolute', width: 240, height: 240, borderRadius: 120, borderWidth: 1, borderColor: accent + '30', transform: [{ scale: ring3Scale }], opacity: ring3Opacity }} />
            <Animated.View style={{ position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: accent + '18', transform: [{ scale: glowScale }], opacity: glowOpacity }} />
            <Animated.View style={{ position: 'absolute', width: 340, height: 340, borderRadius: 170, borderWidth: 1.5, borderColor: accent + '22', transform: [{ scale: glowScale }], opacity: glowOpacity }} />
            {/* Sealing animation logic - items behind removed as per user request */}
            <Animated.View style={{ position: 'absolute', opacity: stage === 'sealed' ? new Animated.Value(0) : capOpacity, transform: [{ scale: Animated.multiply(capScale, breathe) }, { translateY: capY }] }}>
                <Image source={{ uri: modelOpenUri || modelUri }} style={{ width: 230, height: 230 }} resizeMode="contain" />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', opacity: flash }]} pointerEvents="none" />
            <Animated.View style={{ position: 'absolute', opacity: sealedOpacity, transform: [{ scale: sealedScale }], alignItems: 'center' }}>
                <Image source={{ uri: modelUri }} style={{ width: 230, height: 230 }} resizeMode="contain" />
                <Animated.View style={{ position: 'absolute', bottom: 22, right: '12%', width: 52, height: 52, borderRadius: 26, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', shadowColor: accent, shadowOpacity: 0.7, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 12, opacity: lockOpacity, transform: [{ scale: lockScale }] }}>
                    <Ionicons name="lock-closed" size={22} color="#fff" />
                </Animated.View>
            </Animated.View>
            {particles.map((p, i) => (
                <Animated.View key={i} style={{ position: 'absolute', width: p.size, height: p.size, borderRadius: p.size / 2, backgroundColor: p.color, opacity: p.op, transform: [{ translateX: p.x }, { translateY: p.y }, { scale: p.sc }] }} />
            ))}
            <Animated.View style={{ position: 'absolute', bottom: '14%', alignItems: 'center', opacity: doneOpacity }}>
                <Text style={{ fontSize: 26, fontFamily: Fonts.bold, color: '#fff', letterSpacing: -0.5, textShadowColor: accent, textShadowRadius: 20, textShadowOffset: { width: 0, height: 0 } }}>
                    {t('create.seal_anim_msg')}
                </Text>
                <Text style={{ fontSize: 14, color: '#ffffff99', fontFamily: Fonts.regular, marginTop: 6 }}>
                    {t('create.capsule_locked')}
                </Text>
            </Animated.View>
        </Animated.View>
    );
}

// ─── Open Cap Animation ────────────────────────────────────────────────────────
function OpenCapAnimation({ accent, modelUri, onDone }: {
    accent: string; modelUri: string; onDone: () => void;
}) {
    const { t } = useTranslation();
    const capScale = useRef(new Animated.Value(0.5)).current;
    const capOpacity = useRef(new Animated.Value(0)).current;
    const capY = useRef(new Animated.Value(40)).current;
    const doneOpacity = useRef(new Animated.Value(0)).current;
    const bloom1 = useRef(new Animated.Value(0.2)).current;
    const bloom1Op = useRef(new Animated.Value(0)).current;
    const bloom2 = useRef(new Animated.Value(0.2)).current;
    const bloom2Op = useRef(new Animated.Value(0)).current;
    const bloom3 = useRef(new Animated.Value(0.2)).current;
    const bloom3Op = useRef(new Animated.Value(0)).current;
    const checkScale = useRef(new Animated.Value(0)).current;
    const checkOpacity = useRef(new Animated.Value(0)).current;

    const confetti = useRef(
        Array.from({ length: 16 }, (_, i) => {
            const angle = (i / 16) * Math.PI * 2;
            const dist = 90 + Math.random() * 80;
            const colors = ['#4A6BE0', '#6B8FF5', '#74C0FC', '#a5d8ff', '#4DABF7', '#228BE6', '#fff', '#e7f5ff', '#339AF0', '#91A7FF', '#748FFC', '#4C6EF5', '#364FC7', '#6B8FF5', '#4A6BE0', '#74C0FC'];
            return {
                x: new Animated.Value(0), y: new Animated.Value(0),
                op: new Animated.Value(0), sc: new Animated.Value(0),
                rot: new Animated.Value(0),
                tx: Math.cos(angle) * dist, ty: Math.sin(angle) * dist,
                color: colors[i % colors.length],
                size: 5 + Math.random() * 9,
                isRect: Math.random() > 0.4,
            };
        })
    ).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(bloom1, { toValue: 2.5, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.sequence([
                Animated.timing(bloom1Op, { toValue: 0.9, duration: 200, useNativeDriver: true }),
                Animated.timing(bloom1Op, { toValue: 0, duration: 700, useNativeDriver: true }),
            ]),
            Animated.sequence([
                Animated.delay(150),
                Animated.parallel([
                    Animated.timing(bloom2, { toValue: 3.2, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                    Animated.sequence([
                        Animated.timing(bloom2Op, { toValue: 0.7, duration: 200, useNativeDriver: true }),
                        Animated.timing(bloom2Op, { toValue: 0, duration: 700, useNativeDriver: true }),
                    ]),
                ]),
            ]),
            Animated.sequence([
                Animated.delay(300),
                Animated.parallel([
                    Animated.timing(bloom3, { toValue: 4.0, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                    Animated.sequence([
                        Animated.timing(bloom3Op, { toValue: 0.5, duration: 200, useNativeDriver: true }),
                        Animated.timing(bloom3Op, { toValue: 0, duration: 700, useNativeDriver: true }),
                    ]),
                ]),
            ]),
            Animated.spring(capScale, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }),
            Animated.timing(capOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
            Animated.spring(capY, { toValue: 0, friction: 6, tension: 60, useNativeDriver: true }),
        ]).start(() => {
            Animated.parallel([
                ...confetti.map((c, i) =>
                    Animated.sequence([
                        Animated.delay(i * 18),
                        Animated.parallel([
                            Animated.timing(c.op, { toValue: 1, duration: 180, useNativeDriver: true }),
                            Animated.spring(c.sc, { toValue: 1, friction: 4, tension: 100, useNativeDriver: true }),
                            Animated.timing(c.x, { toValue: c.tx, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                            Animated.timing(c.y, { toValue: c.ty, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                            Animated.timing(c.rot, { toValue: 1, duration: 600, useNativeDriver: true }),
                        ]),
                        Animated.timing(c.op, { toValue: 0, duration: 350, useNativeDriver: true }),
                    ])
                ),
                Animated.sequence([
                    Animated.delay(200),
                    Animated.parallel([
                        Animated.spring(checkScale, { toValue: 1, friction: 3, tension: 120, useNativeDriver: true }),
                        Animated.timing(checkOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
                    ]),
                ]),
            ]).start(() => {
                Animated.timing(doneOpacity, { toValue: 1, duration: 450, useNativeDriver: true }).start();
                setTimeout(onDone, 1400);
            });
        });
    }, []);

    return (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#EEF5FF', zIndex: 3000, alignItems: 'center', justifyContent: 'center' }]}>
            <Animated.View style={{ position: 'absolute', width: 200, height: 200, borderRadius: 100, borderWidth: 3, borderColor: '#6B8FF550', transform: [{ scale: bloom1 }], opacity: bloom1Op }} />
            <Animated.View style={{ position: 'absolute', width: 200, height: 200, borderRadius: 100, borderWidth: 2, borderColor: '#74C0FC40', transform: [{ scale: bloom2 }], opacity: bloom2Op }} />
            <Animated.View style={{ position: 'absolute', width: 200, height: 200, borderRadius: 100, borderWidth: 1.5, borderColor: '#A5D8FF30', transform: [{ scale: bloom3 }], opacity: bloom3Op }} />
            <View style={{ position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: accent + '25' }} />
            <Animated.View style={{ transform: [{ scale: capScale }, { translateY: capY }], opacity: capOpacity }}>
                <Image source={{ uri: modelUri }} style={{ width: 220, height: 220 }} resizeMode="contain" />
                <Animated.View style={{ position: 'absolute', bottom: 18, right: '10%', width: 52, height: 52, borderRadius: 26, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', shadowColor: accent, shadowOpacity: 0.6, shadowRadius: 18, shadowOffset: { width: 0, height: 5 }, elevation: 12, opacity: checkOpacity, transform: [{ scale: checkScale }] }}>
                    <Ionicons name="checkmark" size={24} color="#fff" />
                </Animated.View>
            </Animated.View>
            {confetti.map((c, i) => {
                const rotDeg = c.rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${180 + i * 45}deg`] });
                return (
                    <Animated.View key={i} style={{ position: 'absolute', width: c.isRect ? c.size * 1.8 : c.size, height: c.size, borderRadius: c.isRect ? 2 : c.size / 2, backgroundColor: c.color, opacity: c.op, transform: [{ translateX: c.x }, { translateY: c.y }, { scale: c.sc }, { rotate: rotDeg }] }} />
                );
            })}
            <Animated.View style={{ position: 'absolute', bottom: '14%', alignItems: 'center', opacity: doneOpacity }}>
                <Text style={{ fontSize: 26, fontFamily: Fonts.bold, color: accent, letterSpacing: -0.5 }}>{t('create.capsule_created_msg')}</Text>
                <Text style={{ fontSize: 14, color: '#5A6F9B', fontFamily: Fonts.regular, marginTop: 6 }}>{t('create.capsule_instant')}</Text>
            </Animated.View>
        </View>
    );
}

// ─── Duration Slider ──────────────────────────────────────────────────────────
function DurationSlider({ days, onChange, accent, daysToLabel, setScrollEnabled }: any) {
    return (
        <View style={{ width: '100%' }}>
            <Slider
                minimumValue={MIN_DAYS}
                maximumValue={MAX_DAYS}
                step={1}
                value={days}
                onValueChange={v => onChange(Math.round(v))}
                onSlidingStart={() => setScrollEnabled(false)}
                onSlidingComplete={() => setScrollEnabled(true)}
                minimumTrackTintColor={accent}
                maximumTrackTintColor={L.border}
                thumbTintColor={accent}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                <Text style={{ fontSize: 10, color: L.textMuted, fontFamily: Fonts.regular }}>1 week</Text>
                <Text style={{ fontSize: 13, color: accent, fontFamily: Fonts.bold }}>{daysToLabel(days)}</Text>
                <Text style={{ fontSize: 10, color: L.textMuted, fontFamily: Fonts.regular }}>5 years</Text>
            </View>
        </View>
    );
}

// ─── Section Label ─────────────────────────────────────────────────────────────
function SectionLabel({ children, accent }: { children: string; accent: string }) {
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, marginTop: 6 }}>
            <View style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: accent }} />
            <Text style={{ fontSize: 10, fontFamily: Fonts.bold, color: accent, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.85 }}>{children}</Text>
        </View>
    );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CapsuleCreationScreen() {
    const { t, i18n } = useTranslation();
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const scrollRef = useRef<ScrollView>(null);
    const titleInputRef = useRef<TextInput>(null);
    const descInputRef = useRef<TextInput>(null);

    const [currentStep, setCurrentStep] = useState<Step>('mode');
    const [selectedMode, setSelectedMode] = useState<'closed' | 'open' | null>(null);
    const [selectedType, setSelectedType] = useState<CapsuleType>('instacap');
    const [selectedModel, setSelectedModel] = useState('basicred_kap');
    const [hasLegacyCap, setHasLegacyCap] = useState(false);
    const [activeInstaCapCount, setActiveInstaCapCount] = useState(0);
    const [loadingLimits, setLoadingLimits] = useState(true);
    const [allModels, setAllModels] = useState<any[]>([...(timerConfigManager.models.length > 0 ? timerConfigManager.models : CAPSULE_MODELS)]);
    const [drops, setDrops] = useState<any[]>([]);
    
    useEffect(() => {
        const unsubscribe = timerConfigManager.subscribe(() => {
            setAllModels([...timerConfigManager.models]);
            setDrops(timerConfigManager.getDrops());
        });
        return unsubscribe;
    }, []);
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

    const [isJoiningEvent, setIsJoiningEvent] = useState(false);
    const [useCapAngel, setUseCapAngel] = useState(false);
    const [selectedCapAngel, setSelectedCapAngel] = useState<any>(null);
    const [capAngelSearchQuery, setCapAngelSearchQuery] = useState('');
    const [capAngelSearchResults, setCapAngelSearchResults] = useState<any[]>([]);
    const [searchingCapAngel, setSearchingCapAngel] = useState(false);

    const [availableModels, setAvailableModels] = useState<any[]>(timerConfigManager.models);
    const [sealing, setSealing] = useState(false);
    const [showSealAnim, setShowSealAnim] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);

    const slideAnim = useRef(new Animated.Value(0)).current;
    const capScaleAnim = useRef(new Animated.Value(1)).current;
    const headerBorderAnim = useRef(new Animated.Value(0)).current;

    const steps = selectedMode === 'open' ? OPEN_STEPS : CLOSED_STEPS;
    const stepIndex = steps.indexOf(currentStep);
    const cfg = selectedType ? TYPE_CFG[selectedType as keyof typeof TYPE_CFG] : null;
    const accent = cfg?.accent ?? L.purple;

    const activeEvent = useMemo(() =>
        availableModels.find(m => m.is_event && isEventActive(m.event_start, m.event_end)),
        [availableModels]
    );

    const PRESETS = [
        { label: 'common.1_week', days: 7, emoji: '⚡' },
        { label: 'common.1_month', days: 30, emoji: '🌙' },
        { label: 'common.1_year', days: 365, emoji: '🔮' },
        { label: 'common.2_years', days: 365 * 2, emoji: '🕰️' },
        { label: 'common.5_years', days: 365 * 5, emoji: '⏳' },
        { label: 'common.custom', days: -1, emoji: '🎛️' },
    ];

    const daysToLabel = (d: number) => {
        if (d < 7) return `${d} ${t('common.days')}`;
        if (d === 7) return t('common.1_week');
        if (d === 14) return t('common.2_weeks');
        if (d === 30) return t('common.1_month');
        if (d === 90) return t('common.3_months');
        if (d === 180) return t('common.6_months');
        if (d === 365) return t('common.1_year');
        if (d > 365) {
            const years = Math.floor(d / 365);
            const extraDays = d % 365;
            if (extraDays === 0) return `${years} ${t(years > 1 ? 'common.years' : 'common.year')}`;
            return `${years} ${t(years > 1 ? 'common.years' : 'common.year')}, ${extraDays} ${t('common.days')}`;
        }
        return `${d} ${t('common.days')}`;
    };

    const activeModel = useMemo(() =>
        availableModels.find(m => m.id === selectedModel) ||
        CAPSULE_MODELS.find((m: any) => m.id === selectedModel) ||
        CAPSULE_MODELS[0],
        [selectedModel, availableModels]
    );

    const finalDays: number | null =
        showCustomSlider ? customDays : selectedPreset;

    useEffect(() => {
        if (selectedMode === 'open') {
            if (selectedType !== 'opencap') setSelectedType('opencap' as any);
        } else if (isJoiningEvent && activeEvent) {
            if (selectedType !== 'eventcap') setSelectedType('eventcap');
        } else if (finalDays && finalDays > 365) {
            if (selectedType !== 'legacycap') setSelectedType('legacycap');
        } else {
            if (selectedType !== 'instacap') setSelectedType('instacap');
        }
    }, [finalDays, selectedMode, isJoiningEvent, activeEvent]);

    const openingDate = useMemo(() => {
        if (selectedType === 'eventcap' && activeEvent) return activeEvent.event_end;
        if (selectedMode === 'open' || selectedType === 'opencap') return new Date().toISOString();
        if (finalDays) {
            const d = new Date(); d.setSeconds(0, 0);
            return new Date(d.getTime() + finalDays * 86400000).toISOString();
        }
        return new Date(Date.now() + 365 * 86400000).toISOString();
    }, [selectedType, selectedMode, activeEvent, finalDays]);

    const onDateChange = (event: any, date?: Date) => {
        if (Platform.OS === 'android') setShowDatePicker(false);
        if (date) {
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const diff = date.getTime() - today.getTime();
            const days = Math.round(diff / 86400000);
            const constrained = Math.max(MIN_DAYS, Math.min(MAX_DAYS, days));
            setCustomDays(constrained);
            setShowCustomSlider(true);
            setSelectedPreset(null);
        }
    };

    const displayDate = useMemo(() => {
        if (selectedType === 'opencap') return t('create.capsule_instant');
        return new Date(openingDate).toLocaleDateString(i18n.language === 'es' ? 'es-ES' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    }, [openingDate, selectedType, i18n.language]);

    const isNextEnabled = useMemo(() => {
        if (currentStep === 'mode') return !!selectedMode;
        if (currentStep === 'identity') return title.trim().length > 0 && description.trim().length > 0;
        if (currentStep === 'timing') {
            if (isJoiningEvent) return true; // Event handles timing
            if (useCapAngel && !selectedCapAngel) return false;
            return !!selectedPreset || showCustomSlider;
        }
        return true;
    }, [currentStep, title, description, selectedPreset, showCustomSlider, selectedMode, useCapAngel, selectedCapAngel, isJoiningEvent]);

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

    // ─── CapAngel search ──────────────────────────────────────────────────────
    useEffect(() => {
        let isCurrent = true;
        const query = capAngelSearchQuery.trim();
        if (query.length > 0) {
            const timeout = setTimeout(async () => {
                if (!isCurrent) return;
                setSearchingCapAngel(true);
                try {
                    const { data: { user } } = await supabase.auth.getUser();
                    let dbQuery = supabase.from('profiles').select('*')
                        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`).limit(5);
                    if (user) dbQuery = dbQuery.neq('id', user.id);
                    const { data } = await dbQuery;
                    if (isCurrent && data) setCapAngelSearchResults(data);
                } catch (e) { } finally { if (isCurrent) setSearchingCapAngel(false); }
            }, 300);
            return () => { isCurrent = false; clearTimeout(timeout); };
        } else {
            setCapAngelSearchResults([]);
            setSearchingCapAngel(false);
        }
    }, [capAngelSearchQuery]);

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
        if (selectedType === 'eventcap' && activeEvent) {
            setSelectedModel(activeEvent.id);
        } else if (selectedType !== 'eventcap' && activeModel?.is_event) {
            // Revert back to basic model if event is deselected
            setSelectedModel('basicred_kap');
        }
    }, [selectedType, activeEvent, activeModel?.is_event]);

    // ─── Navigation ───────────────────────────────────────────────────────────
    const goToStep = (next: Step, dir: number) => {
        Keyboard.dismiss();
        slideAnim.setValue(dir * width * 0.22);
        setCurrentStep(next);
        Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 11, useNativeDriver: true }).start();
        scrollRef.current?.scrollTo({ y: 0, animated: false });
    };

    const goNext = () => { if (!isNextEnabled) return; if (stepIndex < steps.length - 1) goToStep(steps[stepIndex + 1], 1); };
    const goBack = () => { if (stepIndex > 0) goToStep(steps[stepIndex - 1], -1); };

    // ─── Seal ─────────────────────────────────────────────────────────────────
    const sealCapsule = async () => {
        if (sealing) return;
        setSealing(true);
        setShowSealAnim(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user || !selectedType) {
                setSealing(false);
                setShowSealAnim(false);
                return;
            }

            if (!title.trim()) {
                Alert.alert('Missing Title', 'Please give your capsule a name');
                setSealing(false);
                setShowSealAnim(false);
                return;
            }

            if (selectedType === 'legacycap') {
                const { count } = await supabase.from('capsules').select('*', { count: 'exact', head: true }).eq('owner_id', user.id).eq('type', 'legacycap').eq('status', 'sealed');
                if (count && count >= 1) {
                    Alert.alert('Limit reached', 'You already have an active LegacyCap.');
                    setSealing(false);
                    setShowSealAnim(false);
                    return;
                }
            }
            if (selectedType === 'instacap') {
                const { count } = await supabase.from('capsules').select('*', { count: 'exact', head: true }).eq('owner_id', user.id).eq('type', 'instacap').eq('status', 'sealed');
                if (count && count >= 5) {
                    Alert.alert('Limit reached', 'You have 5 active InstaCaps. Open or delete one first.');
                    setSealing(false);
                    setShowSealAnim(false);
                    return;
                }
            }

            const dbType = selectedType === 'opencap' ? 'instacap' : selectedType;
            const opensAt = selectedType === 'opencap'
                ? new Date().toISOString()
                : (selectedType === 'eventcap' && activeEvent
                    ? activeEvent.event_end
                    : finalDays ? new Date(Date.now() + finalDays * 86400000).toISOString() : null);

            const { data: newCapsule, error } = await supabase.from('capsules').insert({
                owner_id: user.id,
                type: dbType,
                model: selectedModel,
                title: title || 'Untitled Capsule',
                description,
                is_shared: isShared,
                duration_days: selectedType === 'opencap' ? 0 : finalDays,
                opens_at: opensAt,
                is_public: selectedType === 'opencap' ? true : isPublic,
                status: selectedType === 'opencap' ? 'opened' : 'sealed',
                chain_id: selectedChainId || null,
                cap_angel: (selectedMode === 'closed' && useCapAngel && selectedCapAngel) ? true : false,
                cap_angel_handle: (selectedMode === 'closed' && useCapAngel && selectedCapAngel) ? selectedCapAngel.username : null,
            }).select().single();

            if (error) throw error;

            if (isShared && invitedUsers.length > 0 && newCapsule) {
                const inviteData = invitedUsers.map(u => ({ capsule_id: newCapsule.id, user_id: u.id, status: 'pending' }));
                await supabase.from('capsule_invites').insert(inviteData);
                
                // Add notifications for each invited user
                const notificationData = invitedUsers.map(u => ({
                    user_id: u.id,
                    sender_id: user.id,
                    type: 'capsule_invite',
                    capsule_id: newCapsule.id,
                    message: `invited you to collaborate on the capsule "${title || 'New Capsule'}"`,
                    is_read: false
                }));
                await supabase.from('notifications').insert(notificationData);
            }

            setTimeout(() => {
                setShowSealAnim(false);
                setSealing(false);
                navigation.reset({ index: 1, routes: [{ name: 'Main' }, { name: 'CapsuleDetail', params: { capsuleId: newCapsule.id } }] });
            }, 5800);
        } catch (e: any) {
            console.error('Create Capsule Error:', e);
            Alert.alert('Error', e.message ?? 'Could not create capsule');
            setSealing(false);
            setShowSealAnim(false);
        }
    };

    // ─── Render ───────────────────────────────────────────────────────────────
    const bgColors: [string, string, string] = cfg
        ? [cfg.light, '#FDFBFF', '#FFFFFF']
        : ['#F3EEFF', '#FDFBFF', '#FFFFFF'];

    return (
        <LinearGradient colors={bgColors} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }} style={s.root}>
            <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
            <AmbientOrbs accent={accent} />

            {showSealAnim && (
                selectedType === 'opencap' ? (
                    <OpenCapAnimation
                        accent={accent}
                        modelUri={activeModel?.image_open || activeModel?.image || ''}
                        onDone={() => { }}
                    />
                ) : (
                    <SealAnimation
                        accent={accent}
                        modelUri={activeModel?.image ?? ''}
                        modelOpenUri={activeModel?.image_open}
                        onDone={() => { }}
                    />
                )
            )}

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
                drops={drops}
            />

            {/* Header */}
            <View style={[s.header, { paddingTop: insets.top + 10, paddingBottom: 14 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Ionicons name="close" size={16} color={L.textSec} />
                </TouchableOpacity>

                <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                    <StepPills index={stepIndex} total={steps.length} accent={accent} />
                    <Text style={{ fontSize: 11, fontFamily: Fonts.semiBold, color: L.textMuted, letterSpacing: 0.5 }}>
                        {stepIndex + 1} / {steps.length}
                    </Text>
                </View>

                <View style={{ width: 34 }} />
            </View>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
            >
                {/* Scrollable content */}
                <Animated.ScrollView
                ref={scrollRef as any}
                style={[s.scroll, { transform: [{ translateX: slideAnim }] }]}
                scrollEnabled={scrollEnabled}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 120 }]}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="none"
            >

                {/* ═══ STEP 1: MODE ═══════════════════════════════════════ */}
                {currentStep === 'mode' && (
                    <View style={s.pageWrapper}>
                        <View style={{ alignItems: 'center', marginBottom: 32, marginTop: 8 }}>
                            <Text style={s.pageTitle}>{t('create.select_mode')}</Text>
                            <Text style={s.pageSub}>Choose how your capsule will work</Text>
                        </View>

                        {/* Sealed Cap */}
                        <TouchableOpacity
                            activeOpacity={0.92}
                            onPress={() => { setSelectedMode('closed'); setSelectedType('instacap'); goNext(); }}
                            style={[s.modeBigCard, selectedMode === 'closed' && s.modeBigCardActive]}
                        >
                            <LinearGradient
                                colors={['#7C5CBF', '#9B7FD4', '#C06090']}
                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                                style={s.modeCardGradient}
                            >
                                <View style={s.modeCardInner}>
                                    <View style={s.modeCardIconWrap}>
                                        <View style={s.modeIconCircle}>
                                            <Ionicons name="lock-closed" size={34} color="#fff" />
                                        </View>
                                    </View>
                                    <View style={s.modeCardTexts}>
                                        <Text style={s.modeCardTitle}>{t('create.sealed_cap')}</Text>
                                        <Text style={s.modeCardDesc}>Lock memories in time. Opens on a future date you choose.</Text>
                                        <View style={s.modeCardTag}>
                                            <Ionicons name="time-outline" size={11} color="rgba(255,255,255,0.8)" />
                                            <Text style={s.modeCardTagText}>Timer · Locked · Revealed later</Text>
                                        </View>
                                    </View>
                                    <View style={s.modeCardArrow}>
                                        <Ionicons name="arrow-forward" size={18} color="rgba(255,255,255,0.9)" />
                                    </View>
                                </View>
                            </LinearGradient>
                        </TouchableOpacity>

                        <View style={{ height: 14 }} />

                        {/* Open Cap */}
                        <TouchableOpacity
                            activeOpacity={0.92}
                            onPress={() => { setSelectedMode('open'); setSelectedType('opencap' as any); goNext(); }}
                            style={[s.modeBigCard, selectedMode === 'open' && s.modeBigCardActive]}
                        >
                            <LinearGradient
                                colors={['#4A6BE0', '#6B8FF5', '#9BB0FC']}
                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                                style={s.modeCardGradient}
                            >
                                <View style={s.modeCardInner}>
                                    <View style={s.modeCardIconWrap}>
                                        <View style={s.modeIconCircle}>
                                            <Ionicons name="book" size={34} color="#fff" />
                                        </View>
                                    </View>
                                    <View style={s.modeCardTexts}>
                                        <Text style={s.modeCardTitle}>{t('create.open_cap')}</Text>
                                        <Text style={s.modeCardDesc}>Public capsule. Instantly visible, no blur, no timer.</Text>
                                        <View style={s.modeCardTag}>
                                            <Ionicons name="globe-outline" size={11} color="rgba(255,255,255,0.8)" />
                                            <Text style={s.modeCardTagText}>Public · Instant · Unlimited</Text>
                                        </View>
                                    </View>
                                    <View style={s.modeCardArrow}>
                                        <Ionicons name="arrow-forward" size={18} color="rgba(255,255,255,0.9)" />
                                    </View>
                                </View>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                )}

                {/* ═══ STEP 2: DESIGN ══════════════════════════════════════ */}
                {currentStep === 'design' && (
                    <View style={s.pageWrapper}>
                        <View style={{ alignItems: 'center', marginBottom: 20, marginTop: 8 }}>
                            <Text style={s.pageTitle}>{t('create.customize') || 'Design'}</Text>
                            <Text style={s.pageSub}>Pick a capsule shell & style</Text>
                        </View>

                        {/* Event Selection - NOW IN STEP 2 */}
                        {selectedMode === 'closed' && activeEvent && (
                            <BlurView intensity={65} tint="light" style={[s.eventJoinCard, isJoiningEvent && { borderColor: TYPE_CFG.eventcap.accent, backgroundColor: TYPE_CFG.eventcap.light }]}>
                                <LinearGradient colors={[TYPE_CFG.eventcap.accent + '15', 'transparent']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 60, borderRadius: 24 }} />
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                                    <View style={[s.eventIconWrap, { backgroundColor: TYPE_CFG.eventcap.accent + '18' }]}>
                                        <Text style={{ fontSize: 28 }}>🎉</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[s.eventJoinTitle, { color: TYPE_CFG.eventcap.accent }]}>Join Live Event</Text>
                                        <Text style={s.eventJoinSub}>{activeEvent.label} is currently ongoing!</Text>
                                    </View>
                                    <Switch
                                        value={isJoiningEvent}
                                        onValueChange={(val) => {
                                            setIsJoiningEvent(val);
                                            if (val && activeEvent) {
                                                setSelectedModel(activeEvent.id);
                                            }
                                        }}
                                        trackColor={{ false: L.border, true: TYPE_CFG.eventcap.accent + '60' }}
                                        thumbColor={isJoiningEvent ? TYPE_CFG.eventcap.accent : '#fff'}
                                    />
                                </View>
                                {isJoiningEvent && (
                                    <View style={s.eventInfoRow}>
                                        <Ionicons name="sparkles" size={12} color={TYPE_CFG.eventcap.accent} />
                                        <Text style={[s.eventInfoText, { color: TYPE_CFG.eventcap.accent }]}>This capsule will use the exclusive {activeEvent.label} model and open globally when the event ends.</Text>
                                    </View>
                                )}
                            </BlurView>
                        )}

                        {/* Hero capsule preview */}
                        <BlurView intensity={60} tint="light" style={s.designHeroCard}>
                            <LinearGradient
                                colors={[accent + '14', accent + '06', 'transparent']}
                                style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 120, borderRadius: 28 }}
                            />
                            <View style={s.designHeroCapsule}>
                                <View style={[s.designGlowOrb, { backgroundColor: accent + '22' }]} />
                                <View style={[s.designGlowOrbSmall, { backgroundColor: L.rose + '18' }]} />
                                <Animated.View style={{ transform: [{ scale: capScaleAnim }] }}>
                                    <CapsuleWithTimer
                                        modelKey={selectedModel}
                                        source={activeModel?.image ? { uri: activeModel.image } : (MODEL_IMAGES as any)[selectedModel]}
                                        date={openingDate}
                                        chainId={selectedChainId}
                                        style={{ width: 190, height: 190 }}
                                        hideTimer
                                    />
                                </Animated.View>
                            </View>

                            <View style={s.designModelInfo}>
                                <Text style={[s.designModelName, { color: accent }]}>{activeModel?.label}</Text>
                                <TouchableOpacity
                                    onPress={() => !isJoiningEvent && setShowModelPicker(true)}
                                    activeOpacity={0.8}
                                    style={[
                                        s.changeModelBtn, 
                                        { borderColor: accent + '45', backgroundColor: accent + '0E' },
                                        isJoiningEvent && { opacity: 0.5, borderColor: L.border }
                                    ]}
                                    disabled={isJoiningEvent}
                                >
                                    <Ionicons name={isJoiningEvent ? "lock-closed" : "color-palette-outline"} size={14} color={isJoiningEvent ? L.textMuted : accent} />
                                    <Text style={[s.changeModelText, { color: isJoiningEvent ? L.textMuted : accent }]}>
                                        {isJoiningEvent ? "Model Locked by Event" : t('create.change_model')}
                                    </Text>
                                    {!isJoiningEvent && (
                                        <View style={[s.changeModelChevron, { backgroundColor: accent + '18' }]}>
                                            <Ionicons name="chevron-forward" size={11} color={accent} />
                                        </View>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </BlurView>

                        {/* Chain strip */}
                        <View style={{ marginTop: 20 }}>
                            <SectionLabel accent={accent}>Overlay / Chain</SectionLabel>
                            <ScrollView
                                horizontal showsHorizontalScrollIndicator={false}
                                contentContainerStyle={{ gap: 10, paddingBottom: 4 }}
                            >
                                <TouchableOpacity
                                    onPress={() => setSelectedChainId(null)}
                                    style={[s.chainCard, !selectedChainId && { borderColor: accent, backgroundColor: accent + '0C' }]}
                                >
                                    <View style={[s.chainIcon, !selectedChainId && { backgroundColor: accent + '18' }]}>
                                        <Ionicons name="close" size={15} color={selectedChainId ? L.textMuted : accent} />
                                    </View>
                                    <Text style={[s.chainLabel, !selectedChainId && { color: accent }]}>{t('common.none')}</Text>
                                </TouchableOpacity>
                                {timerConfigManager.getChainLibrary().filter((c: any) => c.is_active !== false).map((chain: any) => (
                                    <TouchableOpacity
                                        key={chain.id} onPress={() => setSelectedChainId(chain.id)}
                                        style={[s.chainCard, selectedChainId === chain.id && { borderColor: accent, backgroundColor: accent + '0C' }]}
                                    >
                                        <View style={s.chainIcon}>
                                            <Image source={{ uri: chain.thumbnail_url || chain.image_url }} style={{ width: '100%', height: '100%', borderRadius: 10 }} resizeMode="cover" />
                                        </View>
                                        <Text style={[s.chainLabel, selectedChainId === chain.id && { color: accent }]} numberOfLines={1}>{chain.name}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    </View>
                )}

                {/* ═══ STEP 3: IDENTITY ═══════════════════════════════════ */}
                {currentStep === 'identity' && (
                    <View style={s.pageWrapper}>
                        <View style={{ alignItems: 'center', marginBottom: 24, marginTop: 8 }}>
                            <Text style={s.pageTitle}>{t('create.identity') || 'Identity'}</Text>
                            <Text style={s.pageSub}>Name & describe your capsule</Text>
                        </View>

                        {/* Preview card */}
                        <BlurView intensity={55} tint="light" style={[s.previewCard, { borderColor: accent + '28' }]}>
                            <LinearGradient colors={[accent + '10', 'transparent']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 60, borderRadius: 20 }} />
                            <Image source={activeModel?.image ? { uri: activeModel.image } : (MODEL_IMAGES as any)[selectedModel]} style={{ width: 52, height: 52 }} resizeMode="contain" />
                            <View style={{ flex: 1, minWidth: 0, marginLeft: 8 }}>
                                <Text style={[s.previewTitle, { color: title ? L.text : L.textMuted }]} numberOfLines={1}>{title || t('create.your_title_here')}</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
                                    <View style={[s.previewTypeDot, { backgroundColor: accent }]} />
                                    <Text style={[s.previewMeta, { color: accent }]}>{cfg?.label}</Text>
                                    <Text style={{ color: L.textMuted, fontSize: 10 }}>·</Text>
                                    <Ionicons name="calendar-outline" size={10} color={L.textMuted} />
                                    <Text style={[s.previewMeta, { color: L.textSec }]}>{displayDate}</Text>
                                </View>
                            </View>
                        </BlurView>

                        {/* Title field */}
                        <View style={s.fieldGroup}>
                            <SectionLabel accent={accent}>Capsule Name</SectionLabel>
                            <View style={[s.fieldWrap, { borderColor: title ? accent + '60' : L.border }]}>
                                <View style={[s.fieldIconLeft, { backgroundColor: accent + '12' }]}>
                                    <Ionicons name="text" size={16} color={accent} />
                                </View>
                                <TextInput
                                    ref={titleInputRef}
                                    style={s.fieldInput}
                                    placeholder={t('create.name_placeholder')}
                                    placeholderTextColor={L.borderStrong}
                                    value={title}
                                    onChangeText={setTitle}
                                    maxLength={31}
                                    selectionColor={accent}
                                    returnKeyType="next"
                                    onSubmitEditing={() => descInputRef.current?.focus()}
                                    blurOnSubmit={false}
                                />
                                <Text style={[s.charCountInline, { color: title.length > 25 ? accent : L.textMuted }]}>{title.length}/31</Text>
                            </View>
                        </View>

                        {/* Description field */}
                        <View style={s.fieldGroup}>
                            <SectionLabel accent={accent}>Description</SectionLabel>
                            <View style={[s.fieldWrap, s.fieldWrapArea, { borderColor: description ? accent + '60' : L.border }]}>
                                <TextInput
                                    ref={descInputRef}
                                    style={[s.fieldInput, s.fieldTextArea]}
                                    placeholder={t('create.desc_placeholder')}
                                    placeholderTextColor={L.borderStrong}
                                    value={description}
                                    onChangeText={setDescription}
                                    multiline
                                    selectionColor={accent}
                                    textAlignVertical="top"
                                    scrollEnabled={false}
                                />
                            </View>
                        </View>

                        {/* Group capsule toggle (instacap & opencap) */}
                        {(selectedType === 'instacap' || selectedType === 'opencap') && (
                            <View style={{ marginTop: 4 }}>
                                <SectionLabel accent={accent}>Collaboration</SectionLabel>
                                <BlurView intensity={50} tint="light" style={[s.toggleRow, { borderColor: accent + '35' }]}>
                                    <LinearGradient colors={[accent + '12', 'transparent']} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 20 }} />
                                    <View style={[s.toggleIcon, { backgroundColor: accent + '18' }]}>
                                        <Ionicons name="people-outline" size={18} color={accent} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[s.toggleTitle, { color: accent }]}>{t('create.enable_group')}</Text>
                                        <Text style={s.toggleSub}>{t('create.enable_group_desc')}</Text>
                                    </View>
                                    <Switch
                                        value={isShared}
                                        onValueChange={setIsShared}
                                        trackColor={{ false: L.border, true: accent + '60' }}
                                        thumbColor={isShared ? accent : '#fff'}
                                        ios_backgroundColor={L.border}
                                    />
                                </BlurView>

                                {isShared && (
                                    <View style={{ gap: 10, marginTop: 12 }}>
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
                                        <View style={[s.searchRow, { borderColor: L.border }]}>
                                            <Ionicons name="search" size={15} color={L.textMuted} />
                                            <TextInput 
                                                style={s.searchInput} 
                                                placeholder={t('create.search_username')} 
                                                placeholderTextColor={L.textMuted} 
                                                value={userSearchQuery} 
                                                onChangeText={setUserSearchQuery} 
                                                autoCapitalize="none"
                                                autoCorrect={false}
                                                spellCheck={false}
                                            />
                                            {searchingUsers && <ActivityIndicator size="small" color={accent} />}
                                        </View>
                                        {userSearchResults.length > 0 && (
                                            <View style={[s.searchResults, { borderColor: L.border }]}>
                                                {userSearchResults.map(u => {
                                                    const isInvited = invitedUsers.some(iu => iu.id === u.id);
                                                    return (
                                                        <TouchableOpacity key={u.id} disabled={isInvited} onPress={() => { toggleInviteUser(u); setUserSearchQuery(''); setUserSearchResults([]); }} style={s.searchResultItem}>
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

                {/* ═══ STEP 4: TIMING ══════════════════════════════════════ */}
                {currentStep === 'timing' && (
                    <View style={s.pageWrapper}>
                        <View style={{ alignItems: 'center', marginBottom: 20, marginTop: 8 }}>
                            <Text style={s.pageTitle}>{t('create.timing') || 'Timing'}</Text>
                            <Text style={s.pageSub}>When should the capsule open?</Text>
                        </View>

                        {selectedType === 'legacycap' && (
                            <BlurView intensity={50} tint="light" style={[s.infoBox, { borderColor: accent + '40' }]}>
                                <View style={[s.infoBoxIcon, { backgroundColor: accent + '18' }]}>
                                    <Ionicons name="information-circle-outline" size={18} color={accent} />
                                </View>
                                <Text style={[s.infoText, { color: accent }]}>{t('create.legacy_alert')}</Text>
                            </BlurView>
                        )}

                        {!isJoiningEvent ? (
                            <>
                                <View style={s.presetGrid}>
                                    {PRESETS.map(p => {
                                        const isCustom = p.days === -1;
                                        const isActive = isCustom ? showCustomSlider : (!showCustomSlider && selectedPreset === p.days);
                                        return (
                                            <TouchableOpacity
                                                key={p.label}
                                                activeOpacity={0.82}
                                                onPress={() => {
                                                    if (isCustom) { setShowCustomSlider(true); setSelectedPreset(null); }
                                                    else { setShowCustomSlider(false); setSelectedPreset(p.days); }
                                                }}
                                                style={[s.presetCard, isActive && { borderColor: accent, backgroundColor: accent + '0C' }]}
                                            >
                                                {isActive && (
                                                    <LinearGradient
                                                        colors={[accent + '14', accent + '04']}
                                                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 20 }}
                                                    />
                                                )}
                                                <Text style={{ fontSize: 26, marginBottom: 5 }}>{p.emoji}</Text>
                                                <Text style={[s.presetLabel, isActive && { color: accent }]}>{t(p.label)}</Text>
                                                <Text style={[s.presetSub, isActive && { color: accent + '90' }]}>{p.days === -1 ? t('common.any_range') : daysToLabel(p.days)}</Text>
                                                {isActive && (
                                                    <LinearGradient colors={[accent, accent + 'CC']} style={s.presetCheck}>
                                                        <Ionicons name="checkmark" size={8} color="#fff" />
                                                    </LinearGradient>
                                                )}
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>

                                {showCustomSlider && (
                                    <BlurView intensity={60} tint="light" style={[s.sliderCard, { borderColor: accent + '40' }]}>
                                        <LinearGradient colors={[accent + '10', 'transparent']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 70, borderRadius: 20 }} />
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                                            <View style={[s.sliderIconWrap, { backgroundColor: accent + '18' }]}>
                                                <Ionicons name="timer-outline" size={17} color={accent} />
                                            </View>
                                            <Text style={[s.sliderTitle, { marginLeft: 10, flex: 1 }]}>{t('create.custom_duration')}</Text>
                                            <View style={[s.sliderValueChip, { backgroundColor: accent + '14', borderColor: accent + '40' }]}>
                                                <Text style={[s.sliderValueText, { color: accent }]}>{daysToLabel(customDays)}</Text>
                                            </View>
                                        </View>
                                        <DurationSlider
                                            days={customDays}
                                            onChange={setCustomDays}
                                            accent={accent}
                                            daysToLabel={daysToLabel}
                                            setScrollEnabled={setScrollEnabled}
                                        />
                                    </BlurView>
                                )}
                            </>
                        ) : (
                            <BlurView intensity={70} tint="light" style={[s.infoBox, { borderColor: TYPE_CFG.eventcap.accent, padding: 20 }]}>
                                <View style={[s.infoBoxIcon, { backgroundColor: TYPE_CFG.eventcap.accent + '18' }]}>
                                    <Ionicons name="calendar" size={24} color={TYPE_CFG.eventcap.accent} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[s.infoText, { fontSize: 16, color: TYPE_CFG.eventcap.accent, fontFamily: Fonts.bold }]}>Event Schedule Locked</Text>
                                    <Text style={[s.infoText, { color: L.textSec, marginTop: 4 }]}>
                                        This capsule will open automatically on {displayDate} when the event concludes.
                                    </Text>
                                </View>
                            </BlurView>
                        )}

                        {(selectedPreset || showCustomSlider) && (
                            <TouchableOpacity
                                activeOpacity={0.75}
                                onPress={() => setShowDatePicker(true)}
                                style={[s.openDateRow, { borderColor: accent + '40' }]}
                            >
                                <LinearGradient colors={[accent + '10', 'transparent']} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 18 }} />
                                <View style={[s.openDateIconWrap, { backgroundColor: accent + '18' }]}>
                                    <Ionicons name="calendar-outline" size={20} color={accent} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.openDateLbl}>{t('create.opening_date')}</Text>
                                    <Text style={[s.openDateVal, { color: accent }]}>{displayDate}</Text>
                                </View>
                                <View style={[s.openDateEditBtn, { backgroundColor: accent + '12', borderColor: accent + '28' }]}>
                                    <Ionicons name="pencil" size={13} color={accent} />
                                </View>
                            </TouchableOpacity>
                        )}

                        {showDatePicker && (
                            <DateTimePicker
                                value={new Date(openingDate)}
                                mode="date"
                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                minimumDate={new Date(Date.now() + MIN_DAYS * 86400000)}
                                maximumDate={new Date(Date.now() + MAX_DAYS * 86400000)}
                                onChange={onDateChange}
                            />
                        )}

                        {/* CapAngel selection logic */}
                        {selectedMode === 'closed' && (
                            <View style={{ marginTop: 24 }}>
                                <SectionLabel accent={accent}>{t('create.capangel_selection') || 'CapAngel'}</SectionLabel>
                                <BlurView intensity={50} tint="light" style={[s.toggleRow, { borderColor: accent + '35' }, useCapAngel && { backgroundColor: accent + '04' }]}>
                                    <View style={[s.toggleIcon, { backgroundColor: accent + '18' }]}>
                                        <Ionicons name="shield-checkmark-outline" size={18} color={accent} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[s.toggleTitle, { color: accent }]}>{t('create.enable_capangel') || 'Enable CapAngel'}</Text>
                                        <Text style={s.toggleSub}>{t('create.capangel_desc') || 'Assign someone to watch over your capsule'}</Text>
                                    </View>
                                    <Switch
                                        value={useCapAngel}
                                        onValueChange={setUseCapAngel}
                                        trackColor={{ false: L.border, true: accent + '60' }}
                                        thumbColor={useCapAngel ? accent : '#fff'}
                                    />
                                </BlurView>

                                {useCapAngel && (
                                    <View style={{ gap: 12, marginTop: 14 }}>
                                        {!selectedCapAngel ? (
                                            <>
                                                <View style={[s.searchRow, { borderColor: L.border }]}>
                                                    <Ionicons name="search" size={15} color={L.textMuted} />
                                                    <TextInput 
                                                        style={s.searchInput} 
                                                        placeholder={t('create.search_capangel') || 'Search for a CapAngel...'} 
                                                        placeholderTextColor={L.textMuted} 
                                                        value={capAngelSearchQuery} 
                                                        onChangeText={setCapAngelSearchQuery} 
                                                        autoCapitalize="none" 
                                                    />
                                                    {searchingCapAngel && <ActivityIndicator size="small" color={accent} />}
                                                </View>
                                                {capAngelSearchResults.length > 0 && (
                                                    <View style={[s.searchResults, { borderColor: L.border }]}>
                                                        {capAngelSearchResults.map(g => (
                                                            <TouchableOpacity key={g.id} onPress={() => { setSelectedCapAngel(g); setCapAngelSearchQuery(''); setCapAngelSearchResults([]); }} style={s.searchResultItem}>
                                                                <View style={s.capAngelAvatar}><Ionicons name="person" size={14} color={L.textMuted} /></View>
                                                                <View style={{ flex: 1 }}>
                                                                    <Text style={{ fontSize: 13, fontFamily: Fonts.bold, color: L.text }}>{g.display_name || g.username}</Text>
                                                                    <Text style={{ fontSize: 11, color: L.textMuted, fontFamily: Fonts.medium }}>@{g.username}</Text>
                                                                </View>
                                                                <Ionicons name="add-circle-outline" size={18} color={accent} />
                                                            </TouchableOpacity>
                                                        ))}
                                                    </View>
                                                )}
                                            </>
                                        ) : (
                                            <BlurView intensity={40} tint="light" style={s.selectedCapAngelCard}>
                                                <View style={s.capAngelAvatar}><Ionicons name="person" size={18} color={accent} /></View>
                                                <View style={{ flex: 1, marginLeft: 10 }}>
                                                    <Text style={s.capAngelName}>{selectedCapAngel.display_name || selectedCapAngel.username}</Text>
                                                    <Text style={s.capAngelUsername}>@{selectedCapAngel.username}</Text>
                                                </View>
                                                <TouchableOpacity onPress={() => setSelectedCapAngel(null)} style={s.capAngelRemoveBtn}>
                                                    <Ionicons name="close-circle" size={20} color={L.textMuted} />
                                                </TouchableOpacity>
                                            </BlurView>
                                        )}
                                        <View style={[s.infoBox, { backgroundColor: accent + '08', borderColor: accent + '20' }]}>
                                            <Ionicons name="sparkles" size={12} color={accent} />
                                            <Text style={s.infoText}>{t('create.capangel_helper')}</Text>
                                        </View>
                                    </View>
                                )}
                            </View>
                        )}
                    </View>
                )}

                {/* ═══ STEP 5: REVIEW ══════════════════════════════════════ */}
                {currentStep === 'review' && (
                    <View style={s.pageWrapper}>
                        <View style={{ alignItems: 'center', marginBottom: 10, marginTop: 8 }}>
                            <Text style={s.pageTitle}>{t('create.review') || 'Review'}</Text>
                            <Text style={s.pageSub}>Everything looks good?</Text>
                        </View>

                        {/* Review hero */}
                        <BlurView intensity={65} tint="light" style={s.reviewHeroCard}>
                            <LinearGradient
                                colors={[accent + '18', accent + '08', 'transparent']}
                                start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
                                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 28 }}
                            />
                            <View style={s.reviewGlowOrb1} pointerEvents="none">
                                <View style={[{ width: 160, height: 160, borderRadius: 80, backgroundColor: accent + '14' }]} />
                            </View>
                            <View style={s.reviewGlowOrb2} pointerEvents="none">
                                <View style={[{ width: 100, height: 100, borderRadius: 50, backgroundColor: L.rose + '10' }]} />
                            </View>
                            <CapsuleWithTimer
                                modelKey={selectedModel}
                                source={{ uri: activeModel?.image ?? '' }}
                                date={openingDate}
                                chainId={selectedChainId}
                                capsuleType={selectedType || undefined}
                                style={{ width: 175, height: 175 }}
                                hideTimer={selectedType === 'opencap'}
                            />
                            <View style={[s.reviewBadge, { backgroundColor: accent + '18', borderColor: accent + '40' }]}>
                                <Ionicons name={cfg?.icon as any} size={11} color={accent} />
                                <Text style={[s.reviewBadgeText, { color: accent }]}>
                                    {selectedType ? t(`create.${selectedType}_label`) : '—'}
                                </Text>
                            </View>
                            <Text style={s.reviewTitle}>{title || t('create.untitled_capsule')}</Text>
                            <Text style={s.reviewDate}>{selectedType === 'opencap' ? displayDate : t('create.opens_on', { date: displayDate })}</Text>
                        </BlurView>

                        {/* Summary grid */}
                        <View style={s.summaryGrid}>
                            {[
                                { icon: 'cube-outline', label: t('create.summary_type'), value: selectedType ? t(`create.${selectedType}_label`) : '—', ok: true },
                                { icon: 'text-outline', label: t('create.summary_title'), value: title || '—', ok: !!title },
                                { icon: 'time-outline', label: t('create.summary_duration'), value: selectedType === 'opencap' ? t('create.na_open') : (finalDays ? daysToLabel(finalDays) : '—'), ok: true },
                                { icon: 'color-palette-outline', label: t('create.summary_model'), value: activeModel?.label ?? '—', ok: true },
                                { icon: (isPublic || selectedType === 'opencap') ? 'globe-outline' : 'lock-closed-outline', label: t('create.summary_privacy'), value: (isPublic || selectedType === 'opencap') ? t('create.public') : t('create.private'), ok: true },
                                { icon: 'people-outline', label: t('create.summary_group'), value: cfg?.groupOk ? (isShared ? t('create.shared_capsule') : t('common.none')) : t('create.solo_only'), ok: !!cfg?.groupOk },
                                { icon: 'shield-checkmark-outline', label: 'CapAngel', value: useCapAngel ? (selectedCapAngel ? `@${selectedCapAngel.username}` : 'Selected') : 'Kapsely', ok: true },
                            ].map((item, i) => (
                                <BlurView key={i} intensity={40} tint="light" style={[s.summaryCard, { borderColor: item.ok ? accent + '30' : L.border }]}>
                                    <View style={[s.summaryIcon, { backgroundColor: item.ok ? accent + '14' : L.surfaceAlt }]}>
                                        <Ionicons name={item.icon as any} size={14} color={item.ok ? accent : L.textMuted} />
                                    </View>
                                    <Text style={s.summaryLabel}>{item.label}</Text>
                                    <Text style={[s.summaryValue, { color: item.ok ? L.text : L.textMuted }]} numberOfLines={1}>{item.value}</Text>
                                </BlurView>
                            ))}
                        </View>

                        {/* Warning */}
                        <BlurView intensity={40} tint="light" style={s.warningBox}>
                            <View style={[s.warningIcon, { backgroundColor: L.blue + '18' }]}>
                                <Ionicons name="information-circle-outline" size={16} color={L.blue} />
                            </View>
                            <Text style={s.warningText}>
                                {selectedType === 'opencap' ? t('create.capsule_description_open') : t('create.seal_warning')}
                            </Text>
                        </BlurView>

                        {/* Seal button */}
                        <TouchableOpacity
                            onPress={sealCapsule}
                            disabled={sealing}
                            activeOpacity={0.88}
                            style={[s.sealBtnWrap, { opacity: sealing ? 0.7 : 1 }]}
                        >
                            <LinearGradient
                                colors={cfg?.gradientFull || [accent, accent + 'CC', accent + 'AA']}
                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                                style={s.sealBtn}
                            >
                                {sealing ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <>
                                        <View style={s.sealBtnIconWrap}>
                                            <Ionicons name={selectedType === 'opencap' ? 'book' : 'lock-closed'} size={18} color="#fff" />
                                        </View>
                                        <Text style={s.sealBtnText}>
                                            {selectedType === 'opencap' ? t('create.create_capsule_btn') : t('create.seal_capsule')}
                                        </Text>
                                        <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.7)" />
                                    </>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={goBack} style={s.editLink} activeOpacity={0.7}>
                            <Ionicons name="chevron-back" size={13} color={L.textMuted} />
                            <Text style={s.editLinkText}>{t('create.edit_details')}</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </Animated.ScrollView>
            </KeyboardAvoidingView>

            {/* ─── Bottom Nav ───────────────────────────────────────────── */}
            {currentStep !== 'review' && (
                <BlurView intensity={80} tint="light" style={[s.bottomNav, { paddingBottom: Math.max(insets.bottom + 6, 18) }]}>
                    <View style={s.bottomNavBorder} />
                    {stepIndex > 0 && (
                        <TouchableOpacity onPress={goBack} style={s.backBtn} activeOpacity={0.75}>
                            <Ionicons name="chevron-back" size={20} color={L.textSec} />
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity
                        onPress={goNext}
                        disabled={!isNextEnabled}
                        activeOpacity={0.88}
                        style={[s.nextBtnWrap, { opacity: isNextEnabled ? 1 : 0.5 }]}
                    >
                        <LinearGradient
                            colors={isNextEnabled ? (cfg?.gradient || [L.purple, L.purpleMid]) : [L.borderStrong, L.border]}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={s.nextBtn}
                        >
                            <Text style={[s.nextBtnText, { color: isNextEnabled ? '#fff' : L.textMuted }]}>
                                {currentStep === 'timing' ? `${t('create.review')} →` : `${t('create.continue')} →`}
                            </Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </BlurView>
            )}
        </LinearGradient>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: L.bg },

    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingBottom: 12,
        backgroundColor: 'transparent', zIndex: 100,
    },
    closeBtn: {
        width: 34, height: 34, borderRadius: 17,
        backgroundColor: 'rgba(255,255,255,0.8)',
        borderWidth: 1, borderColor: L.border,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: L.shadow, shadowOpacity: 1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },

    scroll: { flex: 1 },
    scrollContent: { paddingTop: 4 },

    pageWrapper: { width, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 16 },

    pageTitle: {
        fontSize: 34, fontFamily: Fonts.bold, color: L.text,
        letterSpacing: -0.8, textAlign: 'center', marginBottom: 6,
    },
    pageSub: { fontSize: 14, color: L.textMuted, fontFamily: Fonts.regular, textAlign: 'center' },

    // ── Mode step ──
    modeBigCard: {
        borderRadius: 26, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent',
        shadowColor: '#000', shadowOpacity: 0.13, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 5,
    },
    modeBigCardActive: { shadowOpacity: 0.22, shadowRadius: 24 },
    modeCardGradient: { borderRadius: 24 },
    modeCardInner: { flexDirection: 'row', alignItems: 'center', padding: 22, gap: 16 },
    modeCardIconWrap: { flexShrink: 0 },
    modeIconCircle: {
        width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(255,255,255,0.18)',
        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center',
    },
    modeCardTexts: { flex: 1, gap: 4 },
    modeCardTitle: { fontSize: 22, fontFamily: Fonts.bold, color: '#fff', letterSpacing: -0.4 },
    modeCardDesc: { fontSize: 13, color: 'rgba(255,255,255,0.82)', fontFamily: Fonts.regular, lineHeight: 18 },
    modeCardTag: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
    modeCardTagText: { fontSize: 11, fontFamily: Fonts.semiBold, color: 'rgba(255,255,255,0.72)' },
    modeCardArrow: {
        width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)',
        alignItems: 'center', justifyContent: 'center',
    },

    // ── Design step ──
    designHeroCard: {
        borderRadius: 28, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)',
        overflow: 'hidden', paddingBottom: 22, paddingHorizontal: 20,
        shadowColor: L.shadowMd, shadowOpacity: 0.6, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 4,
    },
    designHeroCapsule: { alignItems: 'center', justifyContent: 'center', paddingVertical: 24, position: 'relative' },
    designGlowOrb: { position: 'absolute', width: 200, height: 200, borderRadius: 100, top: '5%', alignSelf: 'center' },
    designGlowOrbSmall: { position: 'absolute', width: 100, height: 100, borderRadius: 50, bottom: '5%', right: '10%' },
    designModelInfo: { alignItems: 'center', gap: 12 },
    designModelName: { fontSize: 16, fontFamily: Fonts.bold, letterSpacing: 0.2 },
    changeModelBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 22, borderWidth: 1.5 },
    changeModelText: { fontSize: 13, fontFamily: Fonts.semiBold, flex: 1 },
    changeModelChevron: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

    chainCard: { width: 70, alignItems: 'center', padding: 9, gap: 6, borderRadius: 18, borderWidth: 1.5, borderColor: L.border, backgroundColor: L.surface },
    chainIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: L.surfaceAlt, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    chainLabel: { fontSize: 10, fontFamily: Fonts.medium, color: L.textSec, textAlign: 'center' },

    // ── Identity step ──
    previewCard: {
        flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, borderWidth: 1.5, padding: 14,
        marginBottom: 22, overflow: 'hidden', shadowColor: L.shadow, shadowOpacity: 1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
    },
    previewTitle: { fontSize: 16, fontFamily: Fonts.bold, marginBottom: 4 },
    previewTypeDot: { width: 6, height: 6, borderRadius: 3 },
    previewMeta: { fontSize: 11, fontFamily: Fonts.semiBold },

    fieldGroup: { marginBottom: 16 },
    fieldWrap: {
        flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: L.surface, borderWidth: 1.5, borderRadius: 18,
        paddingHorizontal: 14, paddingVertical: 12, shadowColor: L.shadow, shadowOpacity: 1, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    fieldWrapArea: { alignItems: 'flex-start', paddingVertical: 14 },
    fieldIconLeft: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    fieldInput: { flex: 1, fontSize: 16, fontFamily: Fonts.semiBold, color: L.text, paddingVertical: 0 },
    fieldTextArea: { minHeight: 120, fontSize: 15, fontFamily: Fonts.regular, paddingTop: 2, lineHeight: 22 },
    charCountInline: { fontSize: 11, fontFamily: Fonts.medium, flexShrink: 0 },

    toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, borderWidth: 1.5, padding: 14, overflow: 'hidden' },
    toggleIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    toggleTitle: { fontSize: 14, fontFamily: Fonts.semiBold },
    toggleSub: { fontSize: 12, color: L.textSec, fontFamily: Fonts.regular, marginTop: 2 },

    searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: L.surface, borderRadius: 16, borderWidth: 1.5, paddingHorizontal: 16, height: 50 },
    searchInput: { flex: 1, fontSize: 14, fontFamily: Fonts.semiBold, color: L.text },
    searchResults: { backgroundColor: L.surface, borderRadius: 16, borderWidth: 1.5, maxHeight: 180, overflow: 'hidden', elevation: 2 },
    searchResultItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: L.border },

    // ── Timing step ──
    infoBox: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1.5, padding: 14, marginBottom: 16, overflow: 'hidden' },
    infoBoxIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    infoText: { fontSize: 12, fontFamily: Fonts.medium, flex: 1, lineHeight: 18 },

    presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
    presetCard: {
        width: (width - 36 - 20) / 3, backgroundColor: L.surface, borderRadius: 20, borderWidth: 1.5, borderColor: L.border,
        paddingVertical: 18, paddingHorizontal: 8, alignItems: 'center', position: 'relative',
        shadowColor: L.shadow, shadowOpacity: 1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1, overflow: 'hidden',
    },
    presetLabel: { fontSize: 13, fontFamily: Fonts.bold, color: L.text, textAlign: 'center', marginBottom: 2 },
    presetSub: { fontSize: 10, fontFamily: Fonts.regular, color: L.textMuted },
    presetCheck: { position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },

    sliderCard: { borderRadius: 20, borderWidth: 1.5, padding: 18, backgroundColor: 'rgba(255,255,255,0.7)', marginBottom: 14, overflow: 'hidden' },
    sliderIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    sliderTitle: { fontSize: 14, fontFamily: Fonts.semiBold, color: L.text },
    sliderValueChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, borderWidth: 1 },
    sliderValueText: { fontSize: 13, fontFamily: Fonts.bold },

    openDateRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, borderWidth: 1.5, padding: 14, marginBottom: 14, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.4)',
    },
    openDateIconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    openDateLbl: { fontSize: 11, fontFamily: Fonts.medium, color: L.textMuted, marginBottom: 1 },
    openDateVal: { fontSize: 15, fontFamily: Fonts.bold },
    openDateEditBtn: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },

    // ── Review step ──
    reviewHeroCard: {
        borderRadius: 28, borderWidth: 1.5, borderColor: L.border, overflow: 'hidden', padding: 24, paddingBottom: 28, alignItems: 'center', marginBottom: 20, backgroundColor: 'rgba(255,255,255,0.5)',
    },
    reviewGlowOrb1: { position: 'absolute', top: -40, left: -40, opacity: 0.6 },
    reviewGlowOrb2: { position: 'absolute', bottom: -20, right: -20, opacity: 0.4 },
    reviewBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, marginTop: 14, marginBottom: 12 },
    reviewBadgeText: { fontSize: 11, fontFamily: Fonts.bold, letterSpacing: 0.4 },
    reviewTitle: { fontSize: 22, fontFamily: Fonts.bold, color: L.text, textAlign: 'center', letterSpacing: -0.4 },
    reviewDate: { fontSize: 14, fontFamily: Fonts.medium, color: L.textSec, textAlign: 'center', marginTop: 4 },

    summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
    summaryCard: {
        width: (width - 36 - 10) / 2, flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: L.surface, borderRadius: 18, borderWidth: 1.5, borderColor: L.border,
        padding: 12, overflow: 'hidden',
    },
    summaryIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    summaryLabel: { fontSize: 11, color: L.textMuted, fontFamily: Fonts.medium },
    summaryValue: { fontSize: 13, fontFamily: Fonts.bold, color: L.text },

    warningBox: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1.5, padding: 14, marginBottom: 24, overflow: 'hidden' },
    warningIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    warningText: { fontSize: 12, fontFamily: Fonts.medium, flex: 1, lineHeight: 18, color: L.textSec },

    // ── Review / Seal step ──
    sealBtnWrap: {
        borderRadius: 22, shadowColor: L.shadowMd, shadowOpacity: 0.55, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 7, marginBottom: 10,
    },
    sealBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 22, paddingVertical: 18 },
    sealBtnIconWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    sealBtnText: { color: '#fff', fontSize: 17, fontFamily: Fonts.bold, letterSpacing: 0.2 },

    editLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8 },
    editLinkText: { fontSize: 13, color: L.textMuted, fontFamily: Fonts.medium },

    // ── Bottom nav ──
    bottomNav: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 14, overflow: 'hidden', position: 'relative' },
    bottomNavBorder: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.9)' },
    backBtn: {
        width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.8)', borderWidth: 1, borderColor: L.border,
        alignItems: 'center', justifyContent: 'center', shadowColor: L.shadow, shadowOpacity: 1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    nextBtnWrap: {
        flex: 1, borderRadius: 16, shadowColor: L.shadowMd, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4,
    },
    nextBtn: { flex: 1, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    nextBtnText: { fontSize: 15, fontFamily: Fonts.bold, letterSpacing: 0.3 },

    // ── Event join logic ──
    eventJoinCard: { borderRadius: 24, borderWidth: 1.5, borderColor: L.border, padding: 16, marginBottom: 20, overflow: 'hidden' },
    eventIconWrap: { width: 62, height: 62, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    eventJoinTitle: { fontSize: 17, fontFamily: Fonts.bold },
    eventJoinSub: { fontSize: 13, color: L.textSec, fontFamily: Fonts.regular, marginTop: 2 },
    eventInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingHorizontal: 4 },
    eventInfoText: { fontSize: 11, fontFamily: Fonts.medium, flex: 1, lineHeight: 16 },

    // ── CapAngel UI ──
    capAngelCard: { borderRadius: 22, borderWidth: 1.5, borderColor: L.border, padding: 16, overflow: 'hidden' },
    capAngelIconCircle: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    capAngelLabel: { fontSize: 15, fontFamily: Fonts.bold },
    capAngelSub: { fontSize: 12, fontFamily: Fonts.regular, color: L.textSec, marginTop: 1 },
    selectedCapAngelCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: L.surfaceAlt, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: L.border },
    capAngelAvatar: { width: 42, height: 42, borderRadius: 21 },
    capAngelName: { fontSize: 14, fontFamily: Fonts.bold, color: L.text },
    capAngelUsername: { fontSize: 12, fontFamily: Fonts.medium, color: L.textMuted },
    capAngelRemoveBtn: { padding: 6 },
    searchRowSmall: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, backgroundColor: L.surfaceAlt, borderRadius: 14, paddingHorizontal: 12 },
    searchInpSmall: { flex: 1, fontSize: 13, fontFamily: Fonts.medium, color: L.text },
    capAngelResults: { marginTop: 4, backgroundColor: L.surface, borderRadius: 14, borderWidth: 1, borderColor: L.border, overflow: 'hidden' },
    capAngelResultItem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderBottomWidth: 1, borderBottomColor: L.surfaceAlt },
    capAngelResultAvatar: { width: 28, height: 28, borderRadius: 14 },
    capAngelResultText: { fontSize: 13, fontFamily: Fonts.bold, color: L.text },
    capAngelInfoBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingHorizontal: 6 },
    capAngelInfoText: { fontSize: 11, fontFamily: Fonts.medium, color: L.textMuted, flex: 1 },
});