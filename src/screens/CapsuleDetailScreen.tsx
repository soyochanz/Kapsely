import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    TextInput, Dimensions, Animated, Easing, StatusBar, Alert, ActivityIndicator,
    Modal, FlatList, KeyboardAvoidingView, Platform, Pressable, SectionList, Keyboard
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio, Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Colors, Fonts, Spacing, Shadow, BorderRadius } from '../theme';
import { supabase } from '../lib/supabase';
import { sendPushNotification } from '../utils/pushNotifications';
import { MODEL_IMAGES, MODEL_TINTS, MODEL_IMAGES_OPEN } from '../constants/models';
import LiveTimer from '../components/LiveTimer';
import CapsuleWithTimer from '../components/CapsuleWithTimer';
import LiveChat, { LiveChatRef } from '../components/LiveChat';
import VerifiedBadge from '../components/VerifiedBadge';
import { timerConfigManager } from '../utils/timerConfig';
import { safetyService, ReportType } from '../utils/safety';
import { useWebDragScroll } from '../utils/useWebDragScroll';
// ✅ FloatingEmojis is now a self-contained component that handles its own subscription
import FloatingEmojis from '../components/FloatingEmojis';

const { width, height } = Dimensions.get('window');
const GRID_COLS = 3;
const GRID_GAP = 5;
const SECTION_PAD = Spacing.md * 2;
const ITEM_SIZE = Math.floor((width - SECTION_PAD - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS);
const REACTION_EMOJIS = ['❤️', '😂', '🔥', '🎉', '💯', '😍', '😲', '👏'];

const D = {
    bg: '#FDFBFF',
    surface: '#FFFFFF',
    surfaceAlt: '#F5F3FB',
    glass: 'rgba(255,255,255,0.72)',
    border: '#EAE6F5',
    borderStrong: '#D4CEEC',
    text: '#1A1530',
    textSec: '#5C5778',
    textMuted: '#A09CC0',
    rose: '#C06090',
    purple: '#7C5CBF',
    purpleLight: '#F3EEFF',
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const ds = StyleSheet.create({
    root: { flex: 1, backgroundColor: D.bg },
    headerWrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 12, overflow: 'hidden' },
    headerAccentLine: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 1 },
    headerBackBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.8)', borderWidth: 1, borderColor: D.border, alignItems: 'center', justifyContent: 'center', marginRight: 10, ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }, android: { elevation: 1 } }) },
    headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
    headerAvatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5 },
    headerName: { fontSize: 13, fontFamily: Fonts.bold, color: D.text, letterSpacing: -0.2 },
    headerSub: { fontSize: 11, fontFamily: Fonts.regular, color: D.textMuted, marginTop: 1 },
    followPill: { marginLeft: 4, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
    followPillText: { fontSize: 11, fontFamily: Fonts.bold, color: '#fff', letterSpacing: 0.1 },
    headerOptionsBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.8)', borderWidth: 1, borderColor: D.border, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
    scrollContent: { paddingBottom: 80 },
    heroSection: { alignItems: 'center', paddingTop: 28, paddingBottom: 28, paddingHorizontal: 22 },
    capsuleStage: { alignItems: 'center', justifyContent: 'center', width: '100%', marginBottom: 8 },
    capsuleGlow: { position: 'absolute', width: 220, height: 220, borderRadius: 110 },
    capsuleGlowInner: { position: 'absolute', width: 160, height: 160, borderRadius: 80 },
    heroMeta: { width: '100%', alignItems: 'center', marginTop: 12 },
    statRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 16 },
    statPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 20, backgroundColor: D.surfaceAlt, borderWidth: 1, borderColor: D.border },
    statPillText: { fontSize: 11, fontFamily: Fonts.semiBold, color: D.textSec },
    title: { fontSize: 24, fontFamily: Fonts.bold, color: D.text, textAlign: 'center', marginBottom: 8 },
    desc: { fontSize: 14, fontFamily: Fonts.regular, color: D.textSec, textAlign: 'center', paddingHorizontal: 24, marginBottom: 16, lineHeight: 20 },
    capsuleFollowBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, borderWidth: 1.5 },
    capsuleFollowBtnText: { fontSize: 14, fontFamily: Fonts.bold },
    ctaBlock: { width: '100%', alignItems: 'center', gap: 12, marginTop: 6 },
    unsealBtnWrap: { width: '90%', borderRadius: 24, ...Platform.select({ ios: { shadowOpacity: 0.45, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } }, android: { elevation: 12 } }) },
    unsealBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 18, borderRadius: 24 },
    unsealBtnIconWrap: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
    unsealBtnText: { fontSize: 17, fontFamily: Fonts.bold, color: '#fff', letterSpacing: -0.2 },
    readyBadgeText: { fontSize: 10, fontFamily: Fonts.bold, color: '#fff', opacity: 0.9, marginTop: 1 },
    approvalHint: { fontSize: 12, fontFamily: Fonts.medium, color: D.textMuted },
    countdownCard: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 18, borderWidth: 1.5, padding: 14, width: '88%' },
    countdownIconWrap: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    countdownLabel: { fontSize: 11, fontFamily: Fonts.semiBold, marginBottom: 2, opacity: 0.8 },
    countdownTimer: { fontSize: 18, fontFamily: Fonts.bold },
    contentSection: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 20 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
    sectionHeaderBar: { width: 3, height: 16, borderRadius: 2 },
    sectionTitle: { fontSize: 17, fontFamily: Fonts.bold, color: D.text, flex: 1 },
    sectionCount: { fontSize: 12, fontFamily: Fonts.bold, color: D.textMuted, backgroundColor: D.surfaceAlt, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1, borderColor: D.border },
    filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: D.surface, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: D.border },
    filterChipText: { fontSize: 12, fontFamily: Fonts.semiBold, color: D.textSec },
    cellWrap: { width: (width - 44) / 2.4, height: (width - 44) / 2.4, borderRadius: 16, overflow: 'hidden', backgroundColor: D.surfaceAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: D.border },
    cellPlaceholder: { backgroundColor: '#F9FAFB', borderColor: '#F1F0F7', borderStyle: 'dashed' },
    cellSealed: { borderStyle: 'solid' },
    cellTypeTag: { position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, zIndex: 10 },
    cellCaption: {
        fontSize: 10, color: D.textMuted, marginTop: 6,
        fontFamily: Fonts.medium, lineHeight: 12, paddingHorizontal: 4,
        textAlign: 'center', height: 12
    },
    notePreview: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#FFF9E0',
        padding: 16,
        justifyContent: 'center',
        alignItems: 'center',
        borderLeftWidth: 6,
        borderLeftColor: '#F6E05E',
    },
    notePreviewIcon: {
        width: 32,
        height: 32,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.05)',
        marginBottom: 10,
    },
    notePreviewText: {
        fontSize: 13,
        color: '#5D4037',
        fontFamily: Fonts.medium,
        textAlign: 'center',
        lineHeight: 19,
        fontStyle: 'italic',
    },
    noteTape: {
        position: 'absolute',
        top: -6,
        width: 36,
        height: 14,
        backgroundColor: 'rgba(255,255,255,0.4)',
        borderRadius: 2,
        transform: [{ rotate: '-4deg' }],
        zIndex: 5,
    },
    audioWaveContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        height: 30,
        width: '60%',
        marginBottom: 12,
    },
    audioWaveBar: {
        width: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.45)',
    },
    audioPreviewFooter: {
        position: 'absolute',
        left: 8,
        right: 8,
        bottom: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(255,255,255,0.18)',
        borderRadius: 14,
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    audioPreviewLabel: {
        color: '#fff',
        fontSize: 10,
        fontFamily: Fonts.bold,
        letterSpacing: 0.3,
    },
    playBadge: { position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', zIndex: 11 },
    socialSection: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 40 },
    actionRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
    actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    actionIconWrap: { width: 38, height: 38, borderRadius: 12, backgroundColor: D.surfaceAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: D.border },
    actionCount: { fontSize: 15, fontFamily: Fonts.semiBold, color: D.text },
    commentCard: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: 'rgba(255,255,255,0.65)', borderRadius: 20, padding: 13, borderWidth: 1.5, overflow: 'hidden' },
    commentAvatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5 },
    commentName: { fontSize: 13, fontFamily: Fonts.bold, color: D.text },
    commentTime: { fontSize: 10, color: D.textMuted, fontFamily: Fonts.regular },
    commentText: { fontSize: 13, color: D.textSec, lineHeight: 19, fontFamily: Fonts.regular },
    commentLikeCount: { fontSize: 10, fontFamily: Fonts.bold, color: D.textMuted },
    commentBar: { paddingHorizontal: 18, paddingTop: 12, overflow: 'visible', position: 'relative' },
    emojiRow: { marginBottom: 10, height: 48 },
    emojiBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)' },
    commentBarBorderTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 1 },
    commentInput: { flex: 1, minHeight: 42, maxHeight: 120, backgroundColor: D.surface, borderRadius: 21, paddingHorizontal: 16, paddingVertical: 11, fontSize: 14, fontFamily: Fonts.regular, color: D.text, borderWidth: 1.5 },
    postBtnWrap: { marginBottom: 2 },
    postBtnGrad: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    overlay: { flex: 1, backgroundColor: 'rgba(15,10,30,0.52)', justifyContent: 'flex-end' },
    optionsSheet: { backgroundColor: D.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 40, ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 30, shadowOffset: { width: 0, height: -8 } }, android: { elevation: 20 } }) },
    sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: D.borderStrong, alignSelf: 'center', marginBottom: 18 },
    sheetTitle: { fontSize: 20, fontFamily: Fonts.bold, color: D.text, marginBottom: 16, letterSpacing: -0.3 },
    sheetItem: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: D.border },
    sheetItemIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    sheetItemText: { flex: 1, fontSize: 15, fontFamily: Fonts.medium },
    sheetCancelBtn: { paddingVertical: 14, alignItems: 'center', marginTop: 6 },
    sheetCancelText: { fontSize: 15, fontFamily: Fonts.semiBold, color: D.textMuted },
    qrCard: { width: '82%', backgroundColor: D.surface, borderRadius: 28, overflow: 'hidden', padding: 28, paddingTop: 18, alignItems: 'center', alignSelf: 'center', marginTop: 'auto', marginBottom: 'auto', ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 30, shadowOffset: { width: 0, height: 10 } }, android: { elevation: 16 } }) },
    qrAccentTop: { height: 4, width: '60%', borderRadius: 2, marginBottom: 18 },
    qrTitle: { fontSize: 20, fontFamily: Fonts.bold, color: D.text, marginBottom: 20 },
    qrImg: { width: 220, height: 220, marginBottom: 16 },
    qrSub: { fontSize: 13, color: D.textSec, textAlign: 'center', marginBottom: 22 },
    qrBtn: { width: 200, paddingVertical: 14, borderRadius: 18, alignItems: 'center' },
    qrBtnText: { color: '#fff', fontSize: 15, fontFamily: Fonts.bold },
    viewer: { flex: 1, backgroundColor: '#0A0812' },
    viewerClose: { position: 'absolute', top: 52, right: 18, zIndex: 10, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
    viewerNote: { width: '86%', minHeight: 260, backgroundColor: '#FFFEF5', borderRadius: 6, borderLeftWidth: 10, borderLeftColor: '#F0C040', padding: 26, alignItems: 'center', justifyContent: 'center' },
    viewerNoteText: { fontSize: 20, fontFamily: Fonts.medium, color: '#5D4037', textAlign: 'center', lineHeight: 32, fontStyle: 'italic' },
    viewerAudio: { width: 240, height: 240, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
    audioPlayBtn: { width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)' },
    viewerCaption: { position: 'absolute', bottom: 80, left: 20, right: 20, backgroundColor: 'rgba(0,0,0,0.55)', padding: 12, borderRadius: 14 },
    viewerCaptionText: { color: '#fff', fontSize: 14, fontFamily: Fonts.regular, textAlign: 'center' },
});

// Epic opening styles (separate object to keep ds clean)
const eo = StyleSheet.create({
    container: { ...StyleSheet.absoluteFillObject },
    center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingTop: 60 },
    glowRing: {
        position: 'absolute', width: 320, height: 320, borderRadius: 160,
        borderWidth: 1.5, alignSelf: 'center',
        top: height / 2 - 160,
    },
    glowRing2: {
        position: 'absolute', width: 460, height: 460, borderRadius: 230,
        borderWidth: 1, alignSelf: 'center',
        top: height / 2 - 230,
        opacity: 0.35,
    },
    lockWrap: { width: 88, height: 88, borderRadius: 28, overflow: 'hidden', marginBottom: 24 },
    lockGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    capsuleTitle: {
        fontSize: 28, fontFamily: Fonts.bold, color: '#fff', textAlign: 'center',
        marginBottom: 6, letterSpacing: -0.5,
        textShadowColor: 'rgba(0,0,0,0.6)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 10,
    },
    openingLabel: {
        fontSize: 11, fontFamily: Fonts.bold, color: 'rgba(255,255,255,0.5)',
        letterSpacing: 3.5, textTransform: 'uppercase', marginBottom: 36,
    },
    countCircle: {
        width: 148, height: 148, borderRadius: 74,
        borderWidth: 3, alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(124,92,191,0.12)',
    },
    countRingFill: {
        position: 'absolute', width: 140, height: 140, borderRadius: 70,
        borderWidth: 3,
    },
    countNumber: { fontSize: 72, fontFamily: Fonts.bold, lineHeight: 80 },
    sparkleCircle: { width: 130, height: 130, borderRadius: 65, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    openNowText: {
        fontSize: 38, fontFamily: Fonts.bold, letterSpacing: 4,
        textShadowColor: 'rgba(0,0,0,0.4)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 10,
    },
    hintText: {
        fontSize: 13, color: 'rgba(255,255,255,0.35)', textAlign: 'center',
        marginTop: 28, fontFamily: Fonts.medium, lineHeight: 20,
    },
});


// ─── Audio controller (memoized to avoid re-mount on parent re-renders) ───────
const AudioController = React.memo(({ uri, onFinish }: { uri: string | null; onFinish: () => void }) => {
    const soundRef = useRef<Audio.Sound | null>(null);

    useEffect(() => {
        const loadAndPlay = async () => {
            if (soundRef.current) {
                await soundRef.current.unloadAsync();
                soundRef.current = null;
            }
            if (uri) {
                const { sound } = await Audio.Sound.createAsync(
                    { uri },
                    { shouldPlay: true },
                    (status: any) => {
                        if (status.didJustFinish) onFinish();
                    }
                );
                soundRef.current = sound;
            }
        };
        loadAndPlay();
        return () => {
            if (soundRef.current) {
                soundRef.current.unloadAsync();
            }
        };
    }, [uri]);

    return null;
});

// ─── Video with trim ──────────────────────────────────────────────────────────
const VideoWithTrim = React.memo(({ item, isActive, style }: { item: any; isActive: boolean; style: any }) => {
    const parts = item.content ? item.content.split('|') : [];
    const trim = parts[1] ? parts[1].split('-') : [];
    const trimStart = trim[0] ? parseInt(trim[0], 10) : 0;
    const trimEnd = trim[1] ? parseInt(trim[1], 10) : null;
    const ref = useRef<any>(null);
    const onStatus = (s: any) => {
        if (trimEnd && s.positionMillis >= trimEnd) { ref.current?.pauseAsync(); ref.current?.setPositionAsync(trimStart); }
    };
    return (
        <Video ref={ref} source={{ uri: item.media_url }} rate={1} volume={1} isMuted={false}
            resizeMode={ResizeMode.CONTAIN} shouldPlay={isActive} useNativeControls style={style}
            positionMillis={trimStart} progressUpdateIntervalMillis={500} onPlaybackStatusUpdate={onStatus}
        />
    );
});

// ─── Ambient orbs (memoized - only re-renders if accent changes) ──────────────
const AmbientOrbs = React.memo(({ accent }: { accent: string }) => (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={{ position: 'absolute', top: -60, right: -50, width: 240, height: 240, borderRadius: 120, backgroundColor: accent + '09' }} />
        <View style={{ position: 'absolute', top: 200, left: -70, width: 200, height: 200, borderRadius: 100, backgroundColor: accent + '06' }} />
        <View style={{ position: 'absolute', bottom: 200, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: D.rose + '08' }} />
    </View>
));

const StatPill = React.memo(({ icon, label, color, bg }: { icon: any; label: string; color?: string; bg?: string }) => (
    <View style={[ds.statPill, bg ? { backgroundColor: bg } : {}]}>
        <Ionicons name={icon} size={13} color={color || D.textMuted} />
        <Text style={[ds.statPillText, color ? { color } : {}]}>{label}</Text>
    </View>
));

// ═════════════════════════════════════════════════════════════════════════════
// ── EPIC OPENING ANIMATION ────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════
interface EpicOpeningProps {
    tint: string;
    capsuleTitle: string;
    imageUrls: string[];
    countdown: number;     // 10 → 0
    onComplete: () => void;
}

const EpicOpening = React.memo(({ tint, capsuleTitle, countdown, onComplete }: EpicOpeningProps) => {
    const { t } = useTranslation();
    // Core anims
    const bgAnim = useRef(new Animated.Value(0)).current;
    const flashAnim = useRef(new Animated.Value(0)).current;
    const titleAnim = useRef(new Animated.Value(0)).current;
    const countAnim = useRef(new Animated.Value(1)).current;
    const revealAnim = useRef(new Animated.Value(0)).current;
    const ring1Anim = useRef(new Animated.Value(0.6)).current;
    const ring2Anim = useRef(new Animated.Value(0.3)).current;

    // Particles
    const particles = useRef(
        Array.from({ length: 32 }, (_, i) => ({
            anim: new Animated.Value(0),
            angle: (i / 32) * Math.PI * 2,
            dist: width * 0.6 + Math.random() * 100,
        }))
    ).current;

    // Entrance
    useEffect(() => {
        Animated.parallel([
            Animated.timing(bgAnim, { toValue: 1, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(titleAnim, { toValue: 1, duration: 700, delay: 150, easing: Easing.out(Easing.back(1.3)), useNativeDriver: true }),
        ]).start();

        // Pulsing rings
        Animated.loop(
            Animated.sequence([
                Animated.timing(ring1Anim, { toValue: 1, duration: 1400, useNativeDriver: true }),
                Animated.timing(ring1Anim, { toValue: 0.6, duration: 1400, useNativeDriver: true }),
            ])
        ).start();
        Animated.loop(
            Animated.sequence([
                Animated.timing(ring2Anim, { toValue: 0.7, duration: 1800, useNativeDriver: true }),
                Animated.timing(ring2Anim, { toValue: 0.3, duration: 1800, useNativeDriver: true }),
            ])
        ).start();
    }, []);

    // Countdown pulse
    useEffect(() => {
        Animated.sequence([
            Animated.timing(countAnim, { toValue: 1.3, duration: 100, useNativeDriver: true }),
            Animated.timing(countAnim, { toValue: 1, duration: 300, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
        ]).start();

        // At 0 → trigger explosion + reveal
        if (countdown === 0) {
            const pAnims = particles.map(p =>
                Animated.timing(p.anim, { toValue: 1, duration: 1000, easing: Easing.out(Easing.quad), useNativeDriver: true })
            );
            Animated.parallel([
                ...pAnims,
                Animated.sequence([
                    Animated.timing(flashAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
                    Animated.timing(flashAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
                ]),
                Animated.timing(revealAnim, { toValue: 1, duration: 1500, delay: 400, useNativeDriver: true }),
            ]).start(() => {
                setTimeout(onComplete, 500);
            });
        }
    }, [countdown]);

    const backdropOpacity = bgAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
    const purpleRose = ['#7C5CBF', '#C06090'] as const;

    return (
        <View style={eo.container}>
            {/* ── Deep purple backdrop ── */}
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdropOpacity }]}>
                <LinearGradient
                    colors={['#0A0618', '#0E0A1A', '#13081E']}
                    style={StyleSheet.absoluteFill}
                />
            </Animated.View>

            {/* ── Ambient purple radial glow ── */}
            <View style={[eo.glowRing, { borderColor: tint + '50' }]} />
            <View style={[eo.glowRing2, { borderColor: D.rose + '30' }]} />

            {/* ── Soft purple orbs ── */}
            <Animated.View pointerEvents="none" style={[
                StyleSheet.absoluteFill,
                { opacity: ring1Anim },
            ]}>
                <View style={{ position: 'absolute', top: height * 0.12, left: -80, width: 250, height: 250, borderRadius: 125, backgroundColor: tint + '18' }} />
                <View style={{ position: 'absolute', bottom: height * 0.15, right: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: D.rose + '15' }} />
            </Animated.View>

            {/* ── Center content ── */}
            <View style={eo.center} pointerEvents="none">
                {/* Lock icon */}
                <Animated.View style={[eo.lockWrap, {
                    opacity: titleAnim,
                    transform: [{ scale: titleAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }]
                }]}>
                    <LinearGradient colors={[tint, D.rose]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={eo.lockGrad}>
                        <Ionicons name={countdown === 0 ? 'lock-open' : 'lock-closed'} size={40} color="#fff" />
                    </LinearGradient>
                </Animated.View>

                {/* Title */}
                <Animated.Text style={[eo.capsuleTitle, {
                    opacity: titleAnim,
                    transform: [{ translateY: titleAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
                }]} numberOfLines={2}>
                    {capsuleTitle}
                </Animated.Text>

                <Animated.Text style={[eo.openingLabel, { opacity: titleAnim }]}>
                    {countdown > 0 ? t('detail.epic_opening_in') : t('detail.epic_revealing')}
                </Animated.Text>

                {/* Countdown */}
                {countdown > 0 ? (
                    <Animated.View style={[eo.countCircle, { borderColor: tint + '70' }]}>
                        <View style={[eo.countRingFill, { borderColor: tint + '55', borderTopColor: D.rose + '80' }]} />
                        <Animated.Text style={[eo.countNumber, { color: '#FFFFFF', transform: [{ scale: countAnim }] }]}>
                            {countdown}
                        </Animated.Text>
                    </Animated.View>
                ) : (
                    <Animated.View style={{ opacity: Animated.subtract(new Animated.Value(1), flashAnim), alignItems: 'center' }}>
                        <LinearGradient colors={[tint + '44', D.rose + '33']} style={eo.sparkleCircle}>
                            <Ionicons name="sparkles" size={56} color={tint} />
                        </LinearGradient>
                        <Text style={[eo.openNowText, { color: '#FFFFFF' }]}>{t('detail.epic_opened')}</Text>
                    </Animated.View>
                )}

                {/* Hint */}
                {countdown > 0 && (
                    <Animated.Text style={[eo.hintText, { opacity: titleAnim }]}>
                        {t('detail.epic_hint')}
                    </Animated.Text>
                )}
            </View>

            {/* ── Particle burst ── */}
            {particles.map((p, i) => {
                const tx = p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(p.angle) * p.dist] });
                const ty = p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(p.angle) * p.dist] });
                const sc = p.anim.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0.2, 2.5, 1.2] });
                const op = p.anim.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 1, 0] });
                const palette = [tint, '#fff', D.rose, '#FCD34D', '#A78BFA', '#F472B6'];
                return (
                    <Animated.View
                        key={i}
                        pointerEvents="none"
                        style={{
                            position: 'absolute', left: width / 2 - 5, top: height / 2 - 5,
                            width: 8 + (i % 3) * 4, height: 8 + (i % 3) * 4, borderRadius: 6,
                            backgroundColor: palette[i % palette.length],
                            transform: [{ translateX: tx }, { translateY: ty }, { scale: sc }],
                            opacity: op,
                        }}
                    />
                );
            })}

            {/* ── Flash overlay ── */}
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', opacity: flashAnim }]} pointerEvents="none" />

            {/* ── Final reveal (fade to app bg) ── */}
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: D.bg, opacity: revealAnim }]} pointerEvents="none" />
        </View>
    );
});

// ═════════════════════════════════════════════════════════════════════════════
// ── MAIN SCREEN ───────────────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════
function CapsuleDetailScreen() {
    const { t } = useTranslation();
    const navigation = useNavigation<any>();
    const route = useRoute();
    const { capsuleId }: any = route.params || {};

    const [capsule, setCapsule] = useState<any>(null);
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isOpening, setIsOpening] = useState(false);
    const liveChatRef = useRef<LiveChatRef>(null);
    const localEmojiTriggerRef = useRef<((emoji: string) => void) | null>(null);

    // ── Epic opening state ──────────────────────────────────────────────────
    const [showEpicOpening, setShowEpicOpening] = useState(false);
    const [epicCountdown, setEpicCountdown] = useState(10);
    const epicIntervalRef = useRef<NodeJS.Timeout | null>(null);
    // Images to show during opening (pulled from capsule items)
    const epicImageUrls = useMemo(() => {
        return items
            .filter(i => (i.media_type === 'image' || i.media_type === 'video') && (i.thumbnail_url || i.media_url))
            .map(i => i.thumbnail_url || i.media_url)
            .slice(0, 8);
    }, [items]);

    const [modelTint, setModelTint] = useState<string | null>(null);
    const [comment, setComment] = useState('');
    const [comments, setComments] = useState<any[]>([]);
    const [likeCount, setLikeCount] = useState(0);
    const [isLiked, setIsLiked] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [invites, setInvites] = useState<any[]>([]);
    const [acceptedMembers, setAcceptedMembers] = useState<any[]>([]);

    const [viewerVisible, setViewerVisible] = useState(false);
    const [initialIndex, setInitialIndex] = useState(0);
    const [activeViewerIndex, setActiveViewerIndex] = useState(0);

    const [filterType, setFilterType] = useState('all');
    const [filterSort, setFilterSort] = useState<'newest' | 'oldest'>('oldest');

    const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
    const [isFollowedOwner, setIsFollowedOwner] = useState(false);
    const [isFollowedCapsule, setIsFollowedCapsule] = useState(false);
    const [followerCount, setFollowerCount] = useState(0);
    const [showOptions, setShowOptions] = useState(false);
    const [showQRModal, setShowQRModal] = useState(false);
    const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
    const [playingAudio, setPlayingAudio] = useState<string | null>(null);
    const [scrollEnabled, setScrollEnabled] = useState(true);


    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const insets = useSafeAreaInsets();

    const isSealed = capsule?.status === 'sealed';
    const [modelImg, setModelImg] = useState<string>(() => (MODEL_IMAGES as any).basicred_kap);
    const sectionListRef = useRef<SectionList>(null);
    useWebDragScroll(sectionListRef);

    useEffect(() => {
        if (!capsule) return;
        const update = () => {
            setModelImg(isSealed
                ? (timerConfigManager.getModelImage(capsule.model) || MODEL_IMAGES[capsule.model] || (MODEL_IMAGES as any).basicred_kap)
                : (timerConfigManager.getModelImageOpen(capsule.model) || MODEL_IMAGES_OPEN[capsule.model] || MODEL_IMAGES[capsule.model] || (MODEL_IMAGES as any).basicred_kap)
            );
        };
        const unsub = timerConfigManager.subscribe(update);
        update();
        return unsub;
    }, [capsule?.model, isSealed]);

    const activeModelTint = capsule ? ((MODEL_TINTS as any)[capsule.model] || '#7C5CBF') : '#7C5CBF';
    const tint = modelTint || activeModelTint;
    const isOwner = userId === capsule?.owner_id;
    const acceptedInvitesCount = invites?.filter(i => i.status === 'accepted').length || 0;
    const isLegacyAccepted = capsule?.invited_user_id && capsule?.invite_status === 'accepted';
    const totalMembers = 1 + acceptedInvitesCount + (isLegacyAccepted ? 1 : 0);
    const isMember = isOwner ||
        invites?.some(i => i.user_id === userId && i.status === 'accepted') ||
        (capsule?.invite_status === 'accepted' && capsule?.invited_user_id === userId);
    const hasRequestedOpen = capsule?.open_requests?.includes(userId || '') || false;
    const reqCount = capsule?.open_requests?.length || 0;
    const [canBeOpened, setCanBeOpened] = useState(false);
    useEffect(() => {
        const checkReady = () => setCanBeOpened(capsule?.opens_at ? new Date(capsule.opens_at) <= new Date() : true);
        checkReady();
        const t = setInterval(checkReady, 1000);
        return () => clearInterval(t);
    }, [capsule?.opens_at]);

    const opensAt = capsule?.opens_at ? new Date(capsule.opens_at) : null;
    const createdAt = capsule?.created_at ? new Date(capsule.created_at) : null;
    const isBornOpen = opensAt && createdAt && Math.abs(opensAt.getTime() - createdAt.getTime()) < 10000;
    const now_val = new Date();
    const chatStart = opensAt ? new Date(opensAt.getTime() - 86400000) : null;
    const chatEnd = opensAt ? new Date(opensAt.getTime() + 18000000) : null;
    const showChat = !isBornOpen && chatStart && chatEnd && now_val >= chatStart && now_val <= chatEnd;

    const filteredData = useMemo(() => {
        let result = [...items];
        if (filterType !== 'all') result = result.filter(i => i.media_type === filterType);
        result.sort((a, b) => {
            const da = new Date(a.created_at).getTime(), db = new Date(b.created_at).getTime();
            return filterSort === 'newest' ? db - da : da - db;
        });
        const sortedItems = [...result];
        const realCount = result.length;
        if (result.length < 9) {
            const needed = 9 - result.length;
            for (let i = 0; i < needed; i++) result.push({ id: `placeholder-${i}`, isPlaceholder: true });
        }
        const itemsPerCol = 3;
        const columns: any[][] = [];
        for (let i = 0; i < result.length; i += itemsPerCol) columns.push(result.slice(i, i + itemsPerCol));
        return { items: sortedItems, columns, total: realCount };
    }, [items, filterType, filterSort]);

    useFocusEffect(useCallback(() => { loadData(); }, [capsuleId]));

    const formatDetailedDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString(undefined, {
            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        }).toUpperCase();
    };

    // ── Epic opening countdown ──────────────────────────────────────────────
    const startEpicOpening = useCallback((targetDate: string) => {
        if (epicIntervalRef.current) clearInterval(epicIntervalRef.current);
        const targetMs = new Date(targetDate).getTime();

        const tick = () => {
            const remaining = Math.max(0, Math.ceil((targetMs - Date.now()) / 1000));
            setEpicCountdown(remaining);
            if (remaining <= 0) {
                clearInterval(epicIntervalRef.current!);
                epicIntervalRef.current = null;
            }
        };

        setEpicCountdown(10);
        setShowEpicOpening(true);
        tick();
        epicIntervalRef.current = setInterval(tick, 1000);
    }, []);

    const handleEpicComplete = useCallback(() => {
        setShowEpicOpening(false);
        setCapsule((prev: any) => ({ ...prev, status: 'opened', is_opening: false }));
    }, []);

    useEffect(() => {
        return () => { if (epicIntervalRef.current) clearInterval(epicIntervalRef.current); };
    }, []);

    useEffect(() => {
        if (!capsuleId) return;
        loadData();
        
        // Ensure data is refreshed when screen comes into focus (fixes sync state issues)
        const unsubFocus = navigation.addListener('focus', loadData);

        const capCh = supabase.channel(`capsule-${capsuleId}-detail`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'capsules', filter: `id=eq.${capsuleId}` }, payload => {
                const updated = payload.new;
                setCapsule((prev: any) => {
                    if (!prev) return { ...updated };
                    const merged = { ...prev, ...updated };
                    if (updated.is_opening && updated.opening_at && !prev.is_opening && merged.status === 'sealed') {
                        startEpicOpening(updated.opening_at);
                    }
                    return merged;
                });
                if (updated.status === 'opened') {
                    setIsOpening(false);
                    if (timerRef.current) clearInterval(timerRef.current);
                }
            })
            .subscribe();
        const invCh = supabase.channel(`capsule-${capsuleId}-invites`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'capsule_invites', filter: `capsule_id=eq.${capsuleId}` }, loadData)
            .subscribe();

        return () => {
            unsubFocus();
            supabase.removeChannel(capCh);
            supabase.removeChannel(invCh);
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [capsuleId, navigation]);

    const formatTime = (dateStr: string) => {
        const diff = Date.now() - new Date(dateStr).getTime();
        const m = Math.floor(diff / 60000);
        if (m < 1) return t('common.just_now');
        if (m < 60) return t('common.m_ago', { count: m });
        const h = Math.floor(m / 60);
        if (h < 24) return t('common.h_ago', { count: h });
        return t('common.d_ago', { count: Math.floor(h / 24) });
    };

    const loadData = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        setUserId(user?.id ?? null);
        let blocked: string[] = [];
        if (user) { blocked = await safetyService.getAllSafetyUserIds(user.id); setBlockedUserIds(blocked); }

        const { data: capsuleData, error: capError } = await supabase.from('capsules').select(`
                id, title, description, created_at, opens_at, status, model, type, owner_id, chain_id, duration_days, is_shared, is_opening, opening_at, open_requests,
                profiles:owner_id(id, username, display_name, avatar_url, is_verified)
            `).eq('id', capsuleId).maybeSingle();

        if (capError || !capsuleData) {
            setLoading(false);
            return;
        }

        const [itemsRes, likesRes, commentsRes, myLikeRes, invitesRes, fCountRes, myFollowRes] = await Promise.all([
            supabase.from('capsule_items').select(`
                id, capsule_id, owner_id, media_url, thumbnail_url, media_type, content, caption, created_at,
                profiles:owner_id(avatar_url, id, display_name, username)
            `).eq('capsule_id', capsuleId).order('created_at', { ascending: true }),
            supabase.from('likes').select('id', { count: 'exact', head: true }).eq('capsule_id', capsuleId),
            supabase.from('comments').select(`
                id, capsule_id, user_id, content, created_at,
                profiles:user_id(id, display_name, username, avatar_url, is_verified),
                comment_likes(user_id)
            `).eq('capsule_id', capsuleId).order('created_at', { ascending: false }),
            user ? supabase.from('likes').select('id').eq('capsule_id', capsuleId).eq('user_id', user.id).maybeSingle() : { data: null },
            supabase.from('capsule_invites').select('id, capsule_id, user_id, status, profiles:user_id(id, username, display_name, avatar_url)').eq('capsule_id', capsuleId),
            supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', capsuleData.owner_id),
            user ? supabase.from('follows').select('id').eq('follower_id', user.id).eq('following_id', capsuleData.owner_id).maybeSingle() : { data: null },
        ]);

        const capRes = { data: capsuleData };

        const isActuallyOpenCap = capRes.data?.type === 'opencap' || (capRes.data?.status === 'opened' && capRes.data?.duration_days === 0);
        if (capRes.data?.status === 'opened' && !isActuallyOpenCap && (!itemsRes.data || itemsRes.data.length === 0)) {
            await supabase.rpc('delete_capsule', { p_capsule_id: capsuleId });
            Alert.alert('Kapsely', t('detail.deleted_empty') || 'Capsule was empty and has been deleted.');
            if (navigation.canGoBack()) navigation.goBack();
            return;
        }

        if (capRes.data) {
            setCapsule(capRes.data);
            const cfg = timerConfigManager.getConfig(capRes.data.model);
            setModelTint(cfg?.themeColor || MODEL_TINTS[capRes.data.model] || '#7C5CBF');
            const allMemberIds = [capRes.data.owner_id, ...(invitesRes.data?.filter((i: any) => i.status === 'accepted').map((i: any) => i.profiles?.id) || [])];
            let followed = new Set<string>();
            if (user) {
                const { data: fids } = await supabase.from('follows').select('following_id').eq('follower_id', user.id).in('following_id', allMemberIds);
                fids?.forEach(f => followed.add(f.following_id));
            }
            setIsFollowedOwner(followed.has(capRes.data.owner_id));
            setAcceptedMembers((invitesRes.data?.filter((i: any) => i.status === 'accepted').map((i: any) => ({ ...i.profiles, isFollowed: followed.has(i.profiles?.id) }))) || []);
            if (capRes.data.is_opening && capRes.data.status !== 'opened' && capRes.data.opening_at) {
                const target = new Date(capRes.data.opening_at).getTime();
                if (target > Date.now()) startEpicOpening(capRes.data.opening_at);
                else setCapsule((p: any) => ({ ...p, status: 'opened', is_opening: false }));
            }
        }
        if (itemsRes.data) setItems(itemsRes.data.filter((i: any) => !blocked.includes(i.owner_id)));
        setLikeCount(likesRes.count || 0);
        setComments((commentsRes.data || []).filter((c: any) => !blocked.includes(c.user_id)).map((c: any) => ({
            ...c,
            myLike: user ? c.comment_likes?.some((l: any) => l.user_id === user.id) : false,
            likeCount: c.comment_likes?.length || 0,
        })));
        setIsLiked(!!myLikeRes.data);
        if (invitesRes.data) setInvites(invitesRes.data);
        setFollowerCount(fCountRes?.count || 0);
        setIsFollowedCapsule(!!myFollowRes?.data);
        setLoading(false);
    };

    const handleFollowToggle = async (targetId: string, isFollowed: boolean, setIsFollowed: (v: boolean) => void) => {
        if (!userId || userId === targetId) return;
        if (isFollowed) {
            await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', targetId);
            setIsFollowed(false);
        } else {
            await supabase.from('follows').insert({ follower_id: userId, following_id: targetId });
            setIsFollowed(true);
            const { data: existing } = await supabase.from('notifications').select('id').eq('user_id', targetId).eq('sender_id', userId).eq('type', 'follow').maybeSingle();
            if (existing) {
                await supabase.from('notifications').update({ created_at: new Date().toISOString(), is_read: false }).eq('id', existing.id);
            } else {
                await supabase.from('notifications').insert({ user_id: targetId, sender_id: userId, type: 'follow', message: t('common.started_following_you') });
            }
        }
    };

    const handleCapsuleFollowToggle = async () => {
        if (!userId || !capsule?.owner_id) return;

        const wasFollowed = isFollowedCapsule;
        const newStatus = !wasFollowed;

        // Optimistic UI update
        setIsFollowedCapsule(newStatus);
        setFollowerCount(prev => newStatus ? prev + 1 : Math.max(0, prev - 1));

        try {
            if (wasFollowed) {
                const { error } = await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', capsule.owner_id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('follows').insert({ follower_id: userId, following_id: capsule.owner_id });
                if (error) throw error;

                // Optional: Send notification to the owner about the new follower
                try {
                    await supabase.from('notifications').insert({
                        user_id: capsule.owner_id,
                        sender_id: userId,
                        type: 'follow',
                        message: 'started following you'
                    });
                } catch (notifErr) {
                    console.warn('Failed to send follow notification', notifErr);
                }
            }
        } catch (err) {
            console.error('Follow toggle error:', err);
            // Rollback optimistic update
            setIsFollowedCapsule(wasFollowed);
            setFollowerCount(prev => wasFollowed ? prev + 1 : Math.max(0, prev - 1));
            Alert.alert(t('common.error'), t('detail.follow_error') || 'Could not sync capsule. Please try again.');
        }
    };

    const handleSetCover = async (mediaUrl: string) => {
        if (!capsule) return;
        try {
            await supabase.from('capsules').update({ cover_url: mediaUrl }).eq('id', capsuleId);
            setCapsule((p: any) => ({ ...p, cover_url: mediaUrl }));
            Alert.alert(t('common.ready'), t('profile.cover_updated') || 'Portada actualizada!');
        } catch (err: any) { Alert.alert('Error', err.message); }
    };

    const handleSendComment = async () => {
        if (!comment.trim() || !userId) return;
        Keyboard.dismiss();
        const { data } = await supabase.from('comments').insert({ capsule_id: capsuleId, user_id: userId, content: comment.trim() }).select('*, profiles:user_id(*)').maybeSingle();
        if (data) {
            setComments([{ ...data, myLike: false, likeCount: 0 }, ...comments]);
            setComment('');
            setHighlightedCommentId(data.id);
            setTimeout(() => setHighlightedCommentId(null), 1200);
            if (capsule.owner_id !== userId) {
                await supabase.from('notifications').insert({ user_id: capsule.owner_id, sender_id: userId, type: 'comment', capsule_id: capsuleId, message: t('detail.commented', { text: comment.trim().substring(0, 30) }) });
                sendPushNotification(capsule.owner_id, '💬 Nuevo Comentario', 'Han comentado en tu cápsula.', { screen: 'CapsuleDetail', params: { capsuleId } });
            }
        }
    };

    const handleDeleteCapsule = () => {
        const exec = async () => {
            setShowOptions(false); setLoading(true);
            try {
                const { data: toDelete } = await supabase.from('capsule_items').select('media_url, thumbnail_url').eq('capsule_id', capsuleId);
                if (toDelete?.length) {
                    const base = 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/capsule-media/';
                    const files = toDelete.flatMap(i => [i.media_url, i.thumbnail_url].filter(u => u?.startsWith(base)).map(u => u!.replace(base, '').split('?')[0]));
                    if (files.length) await supabase.storage.from('capsule-media').remove(files);
                }
                const { error } = await supabase.rpc('delete_capsule', { p_capsule_id: capsuleId });
                if (!error) navigation.goBack(); else throw error;
            } catch { Alert.alert(t('common.error'), t('detail.delete_error')); }
            finally { setLoading(false); }
        };
        Alert.alert(t('detail.delete_capsule_title'), t('detail.delete_capsule_msg'), [
            { text: t('detail.keep_it'), style: 'cancel' },
            { text: t('common.delete'), style: 'destructive', onPress: exec },
        ]);
    };

    const handleReportCapsule = () => {
        if (!userId) return;
        Alert.alert(t('detail.report_capsule'), t('detail.report_reason'), [
            { text: t('detail.report_types.inappropriate'), onPress: () => submitReport(capsuleId, 'capsule', 'inappropriate') },
            { text: t('detail.report_types.spam'), onPress: () => submitReport(capsuleId, 'capsule', 'spam') },
            { text: t('common.cancel'), style: 'cancel' },
        ]);
    };

    const handleItemLongPress = (item: any) => {
        if (capsule?.status !== 'opened') { handleReportItem(item.id); return; }
        Alert.alert(t('common.options') || 'Opciones', '', [
            { text: t('profile.setAsCover') || 'Usar de portada', onPress: () => handleSetCover(item.media_url) },
            { text: t('common.report') || 'Reportar', onPress: () => handleReportItem(item.id) },
            { text: t('common.cancel'), style: 'cancel' },
        ]);
    };

    const handleRequestOpen = async () => {
        if (!userId || !capsule) return;
        const { data, error } = await supabase.rpc('request_capsule_open_v4', { target_capsule_id: capsuleId, requester_user_id: userId });
        if (error) { console.error(error); return; }
        if (data) {
            setCapsule((p: any) => ({ ...p, open_requests: data.open_requests, is_opening: data.is_opening, opening_at: data.opening_at }));
            if (data.is_opening && data.opening_at) {
                startEpicOpening(data.opening_at);
                if (!capsule.is_opening) {
                    const members = [capsule.owner_id, ...(invites?.filter(i => i.status === 'accepted').map(i => i.user_id) || [])];
                    for (const m of members) {
                        if (m !== userId) await supabase.from('notifications').insert({ user_id: m, sender_id: userId, type: 'capsule_opened', capsule_id: capsuleId, message: t('detail.opening_now') });
                    }
                }
            }
        }
    };

    const handleLike = async () => {
        if (!userId) return;
        if (isLiked) {
            await supabase.from('likes').delete().eq('capsule_id', capsuleId).eq('user_id', userId);
            setLikeCount(p => p - 1); setIsLiked(false);
        } else {
            await supabase.from('likes').insert({ capsule_id: capsuleId, user_id: userId });
            setLikeCount(p => p + 1); setIsLiked(true);
            if (capsule.owner_id !== userId) {
                const { data: existing } = await supabase.from('notifications').select('id').eq('user_id', capsule.owner_id).eq('sender_id', userId).eq('type', 'like').eq('capsule_id', capsuleId).maybeSingle();
                if (existing) {
                    await supabase.from('notifications').update({ created_at: new Date().toISOString(), is_read: false }).eq('id', existing.id);
                } else {
                    await supabase.from('notifications').insert({ user_id: capsule.owner_id, sender_id: userId, type: 'like', capsule_id: capsuleId, message: t('detail.liked_your_capsule') });
                    try { sendPushNotification(capsule.owner_id, '❤️ Nuevo Me Gusta!', 'A alguien le ha gustado tu cápsula.', { screen: 'CapsuleDetail', params: { capsuleId } }); } catch { }
                }
            }
        }
    };

    const handleLikeComment = async (cid: string) => {
        if (!userId) return;
        const c = comments.find(x => x.id === cid);
        if (!c) return;
        if (c.myLike) {
            await supabase.from('comment_likes').delete().eq('comment_id', cid).eq('user_id', userId);
            setComments(cs => cs.map(x => x.id === cid ? { ...x, myLike: false, likeCount: x.likeCount - 1 } : x));
        } else {
            await supabase.from('comment_likes').insert({ comment_id: cid, user_id: userId });
            setComments(cs => cs.map(x => x.id === cid ? { ...x, myLike: true, likeCount: x.likeCount + 1 } : x));
        }
    };

    const handleDeleteComment = (cid: string) => {
        Alert.alert(t('detail.delete_comment_title'), t('detail.delete_comment_confirm'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('common.delete'), style: 'destructive', onPress: async () => { const { error } = await supabase.from('comments').delete().eq('id', cid); if (!error) setComments(cs => cs.filter(c => c.id !== cid)); } },
        ]);
    };

    const handleReportItem = (itemId: string) => {
        if (!userId) return;
        Alert.alert(t('detail.report_content'), t('detail.report_reason'), [
            { text: t('detail.report_types.inappropriate'), onPress: () => submitReport(itemId, 'capsule_item', 'inappropriate') },
            { text: t('detail.report_types.spam'), onPress: () => submitReport(itemId, 'capsule_item', 'spam') },
            { text: t('common.cancel'), style: 'cancel' },
        ]);
    };

    const submitReport = async (targetId: string, targetType: ReportType, reason: string) => {
        if (!userId) return;
        await safetyService.report({ reporterId: userId, targetId, targetType, reason });
        Alert.alert(t('common.ready'), t('detail.report_submitted'));
        setShowOptions(false);
    };

    const openViewer = (index: number) => { setInitialIndex(index); setActiveViewerIndex(index); setViewerVisible(true); };
    const toggleAudio = (url: string) => setPlayingAudio(p => p === url ? null : url);

    const FilterBar = useCallback(() => {
        const filterScrollRef = useRef<ScrollView>(null);
        useWebDragScroll(filterScrollRef);
        return (
            <ScrollView ref={filterScrollRef} horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ paddingRight: 20, gap: 8 }}>
                {(['all', 'image', 'video', 'note', 'audio'] as const).map(type => {
                    const icons = { all: 'apps-outline', image: 'image-outline', video: 'videocam-outline', note: 'document-text-outline', audio: 'mic-outline' } as const;
                    const isActive = filterType === type;
                    return (
                        <TouchableOpacity key={type} style={[ds.filterChip, isActive && { backgroundColor: tint, borderColor: tint }]} onPress={() => setFilterType(type)}>
                            <Ionicons name={icons[type]} size={12} color={isActive ? '#fff' : D.textMuted} />
                            <Text style={[ds.filterChipText, isActive && { color: '#fff' }]}>{t('detail.' + type)}</Text>
                        </TouchableOpacity>
                    );
                })}
                <TouchableOpacity style={[ds.filterChip, { marginLeft: 8 }]} onPress={() => setFilterSort(p => p === 'newest' ? 'oldest' : 'newest')}>
                    <Ionicons name={filterSort === 'newest' ? 'arrow-down' : 'arrow-up'} size={12} color={D.textMuted} />
                    <Text style={ds.filterChipText}>{filterSort === 'newest' ? t('detail.newest') : t('detail.oldest')}</Text>
                </TouchableOpacity>
            </ScrollView>
        );
    }, [filterType, filterSort, tint]);

    if (loading && !capsule) return (
        <View style={[ds.root, { alignItems: 'center', justifyContent: 'center' }]}>
            <ActivityIndicator color={D.purple} size="large" />
        </View>
    );
    if (!capsule) return (
        <View style={[ds.root, { alignItems: 'center', justifyContent: 'center' }]}>
            <TouchableOpacity style={{ position: 'absolute', top: insets.top + 10, left: 15, width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }} onPress={() => navigation.goBack()}>
                <Ionicons name="close" size={26} color={D.text} />
            </TouchableOpacity>
            <Ionicons name="alert-circle-outline" size={44} color={D.textMuted} style={{ marginBottom: 12 }} />
            <Text style={{ fontSize: 16, fontFamily: Fonts.semiBold, color: D.textMuted }}>{t('detail.not_found')}</Text>
        </View>
    );

    return (
        <View style={ds.root}>
            {/* ✅ AudioController is memoized — won't cause tree re-renders */}
            <AudioController uri={playingAudio} onFinish={() => setPlayingAudio(null)} />
            <AmbientOrbs accent={tint} />
            <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

            {/* Header */}
            <View style={[ds.headerWrap, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
                <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: D.border }]} />
                <View style={[ds.headerAccentLine, { backgroundColor: tint + '30' }]} />
                <TouchableOpacity style={ds.headerBackBtn} activeOpacity={0.65} onPress={() => navigation.goBack()}>
                    <Ionicons name="chevron-back" size={20} color={D.text} />
                </TouchableOpacity>
                <TouchableOpacity style={ds.headerCenter} activeOpacity={0.78} onPress={() => navigation.navigate('UserProfile', { targetUserId: capsule.owner_id })}>
                    <Image source={{ uri: capsule.profiles?.avatar_url || 'https://via.placeholder.com/150' }} style={[ds.headerAvatar as any, { borderColor: tint + '40' }]} cachePolicy="memory-disk" contentFit="cover" transition={200} />
                    <View style={{ flexShrink: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={ds.headerName} numberOfLines={1}>{capsule.profiles?.display_name || capsule.profiles?.username}</Text>
                            {capsule.profiles?.is_verified && <VerifiedBadge size={10} />}
                        </View>
                        <Text style={ds.headerSub} numberOfLines={1}>{capsule.title}</Text>
                    </View>
                    {userId !== capsule.owner_id && (
                        <Pressable
                            onPress={e => { e.stopPropagation?.(); handleFollowToggle(capsule.owner_id, isFollowedOwner, setIsFollowedOwner); }}
                            style={[ds.followPill, isFollowedOwner ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: D.border } : { backgroundColor: tint }]}
                        >
                            <Text style={[ds.followPillText, isFollowedOwner && { color: D.textMuted }]}>
                                {isFollowedOwner ? t('common.following') : t('common.follow')}
                            </Text>
                        </Pressable>
                    )}
                </TouchableOpacity>
                <TouchableOpacity style={ds.headerOptionsBtn} activeOpacity={0.65} onPress={() => setShowOptions(true)}>
                    <Ionicons name="ellipsis-horizontal" size={17} color={D.textSec} />
                </TouchableOpacity>
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={0}>
                <SectionList
                    ref={sectionListRef}
                    sections={[
                        { title: 'content', data: ['content'] },
                        { title: 'chat', data: showChat ? ['chat'] : [] },
                        { title: 'social', data: ['social'] },
                    ]}
                    nestedScrollEnabled
                    scrollEnabled={scrollEnabled}

                    keyExtractor={(item, i) => item + i}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={[ds.scrollContent, { paddingTop: 72 + insets.top, paddingBottom: 20 }]}
                    keyboardShouldPersistTaps="handled"
                    stickySectionHeadersEnabled={false}
                    renderSectionHeader={() => null}
                    ListHeaderComponent={() => (
                        <CapsuleHero
                            capsule={capsule} tint={tint} isMember={isMember}
                            isSealed={isSealed} isOpening={isOpening} modelImg={modelImg}
                            totalMembers={totalMembers} likeCount={likeCount} followerCount={followerCount}
                            isFollowedCapsule={isFollowedCapsule} handleCapsuleFollowToggle={handleCapsuleFollowToggle}
                            isOwner={isOwner} canBeOpened={canBeOpened} hasRequestedOpen={hasRequestedOpen}
                            handleRequestOpen={handleRequestOpen} reqCount={reqCount} isBornOpen={isBornOpen} userId={userId}
                            setCapsule={setCapsule}

                        />
                    )}
                    renderItem={({ item }) => {
                        if (item === 'content') {
                            return (
                                <View style={ds.contentSection}>
                                    <View style={ds.sectionHeader}>
                                        <View style={[ds.sectionHeaderBar, { backgroundColor: tint }]} />
                                        <Text style={ds.sectionTitle}>Contents</Text>
                                        <Text style={ds.sectionCount}>{filteredData.total}</Text>
                                    </View>
                                    <FilterBar />
                                    {filteredData.columns.length > 0 ? (
                                        <FlatList
                                            horizontal
                                            showsHorizontalScrollIndicator={false}
                                            data={filteredData.columns}
                                            keyExtractor={(_, i) => i.toString()}
                                            scrollEventThrottle={16}
                                            decelerationRate="fast"
                                            snapToInterval={((width - 44) / 2.4) + 10}
                                            contentContainerStyle={{ paddingHorizontal: 2, gap: 10 }}
                                            initialNumToRender={3}
                                            windowSize={2.5}
                                            maxToRenderPerBatch={2}
                                            removeClippedSubviews={true}
                                            renderItem={({ item: colItems }) => (
                                                <View style={{ width: (width - 44) / 2.4, gap: 12 }}>
                                                    {colItems.map((pi: any) => (
                                                        <View key={pi.id} style={{ height: ((width - 44) / 2.4) + 22 }}>
                                                            {pi.isPlaceholder ? (
                                                                <TouchableOpacity
                                                                    style={[ds.cellWrap, ds.cellPlaceholder]}
                                                                    activeOpacity={0.7}
                                                                    disabled={!(isMember && isSealed && !isOpening)}
                                                                    onPress={() => {
                                                                        if (!isSealed) return;
                                                                        navigation.navigate('CreateSelection', { capsuleId: capsule.id });
                                                                    }}
                                                                >
                                                                    {isMember && isSealed && !isOpening ? (
                                                                        <Ionicons name="add" size={24} color={tint + '25'} />
                                                                    ) : (
                                                                        <Ionicons name="cube-outline" size={22} color={D.textMuted + '15'} />
                                                                    )}
                                                                </TouchableOpacity>
                                                            ) : isSealed ? (
                                                                <View style={[ds.cellWrap, ds.cellSealed]}>
                                                                    {pi.media_type === 'audio' ? (
                                                                        <LinearGradient colors={[tint, tint + 'CC', D.rose + 'AA']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                                                                            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', opacity: 0.15 }}>
                                                                                <Ionicons name="mic" size={((width - 44) / 2.4) * 0.6} color="#fff" />
                                                                            </View>
                                                                        </LinearGradient>
                                                                    ) : pi.media_type === 'note' ? (
                                                                        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFF9E0' }]}>
                                                                            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', opacity: 0.1 }}>
                                                                                <Ionicons name="document-text" size={((width - 44) / 2.4) * 0.5} color="#000" />
                                                                            </View>
                                                                            <View style={[ds.noteTape, { top: 4, transform: [{ rotate: '-6deg' }], width: '40%', opacity: 0.3 }]} />
                                                                        </View>
                                                                    ) : (pi.media_url || pi.thumbnail_url) && (pi.media_type === 'image' || pi.media_type === 'video') && (
                                                                        <Image 
                                                                            source={{ uri: pi.thumbnail_url || pi.media_url }} 
                                                                            style={StyleSheet.absoluteFill} 
                                                                            blurRadius={15} 
                                                                            cachePolicy="memory-disk"
                                                                        />
                                                                    )}
                                                                    {Platform.OS === 'ios' ? (
                                                                        (pi.media_type === 'image' || pi.media_type === 'video') && (
                                                                            <BlurView 
                                                                                intensity={32} 
                                                                                tint="extraLight" 
                                                                                style={StyleSheet.absoluteFill} 
                                                                            />
                                                                        )
                                                                    ) : (
                                                                        (pi.media_type === 'image' || pi.media_type === 'video') && (
                                                                            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.65)' }]} />
                                                                        )
                                                                    )}

                                                                    {(pi.media_type === 'image' || pi.media_type === 'video') && (
                                                                        <View style={[ds.cellTypeTag, { backgroundColor: tint + '18', borderColor: tint + '30' }]}>
                                                                            <Ionicons name={pi.media_type === 'video' ? 'videocam' : 'image'} size={11} color={tint} />
                                                                        </View>
                                                                    )}
                                                                    <Ionicons name="lock-closed" size={20} color={tint + '50'} />
                                                                </View>
                                                            ) : (
                                                                <TouchableOpacity
                                                                    style={ds.cellWrap} activeOpacity={0.82}
                                                                    onPress={() => {
                                                                        if (pi.media_type === 'audio') toggleAudio(pi.media_url);
                                                                        else openViewer(filteredData.items.indexOf(pi));
                                                                    }}
                                                                    onLongPress={() => !pi.isPlaceholder && handleItemLongPress(pi)}
                                                                >
                                                                    {pi.media_type === 'audio' ? (
                                                                        <LinearGradient colors={[tint, tint + 'CC', D.rose + 'AA']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                                                                            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                                                                                <View style={ds.audioWaveContainer}>
                                                                                    {[12, 22, 16, 28, 20, 14, 18].map((h, i) => (
                                                                                        <View key={i} style={[ds.audioWaveBar, { height: h }]} />
                                                                                    ))}
                                                                                </View>
                                                                                <Ionicons name={playingAudio === pi.media_url ? 'pause-circle' : 'mic-circle'} size={38} color="#fff" />
                                                                            </View>
                                                                            <View style={ds.audioPreviewFooter}>
                                                                                <Text style={ds.audioPreviewLabel}>{playingAudio === pi.media_url ? (t('detail.playing') || 'Playing') : (t('detail.voice_note') || 'Voice note')}</Text>
                                                                                <Ionicons name="pulse" size={14} color="#fff" />
                                                                            </View>
                                                                        </LinearGradient>
                                                                    ) : pi.media_type === 'note' ? (
                                                                        <View style={ds.notePreview}>
                                                                            <View style={ds.noteTape} />
                                                                            <View style={ds.notePreviewIcon}>
                                                                                <Ionicons name="document-text" size={16} color="#B49D4F" />
                                                                            </View>
                                                                            <Text style={ds.notePreviewText} numberOfLines={4}>{pi.content}</Text>
                                                                        </View>
                                                                    ) : (
                                                                        <Image source={{ uri: pi.thumbnail_url || pi.media_url }} style={ds.cellWrap as any} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                                                                    )}
                                                                    {pi.media_type === 'video' && (
                                                                        <View style={ds.playBadge}><Ionicons name="play" size={10} color="#fff" /></View>
                                                                    )}
                                                                </TouchableOpacity>
                                                            )}
                                                            {!pi.isPlaceholder && (
                                                                <Text style={ds.cellCaption} numberOfLines={1}>
                                                                    {pi.caption && pi.caption.replace(/!!b:[^\s]+/g, '').trim() ? pi.caption.replace(/!!b:[^\s]+/g, '').trim() : ' '}
                                                                </Text>
                                                            )}
                                                        </View>
                                                    ))}
                                                </View>
                                            )}
                                        />
                                    ) : null}
                                </View>
                            );
                        }
                        if (item === 'chat' && showChat) {
                            return (
                                <LiveChat
                                    ref={liveChatRef}
                                    capsuleId={capsuleId}
                                    tint={tint}
                                    hideInput
                                    isOwner={isOwner}
                                    isNested
                                />
                            );
                        }
                        if (item === 'social') {
                            return (
                                <View style={ds.socialSection}>
                                    <View style={ds.sectionHeader}>
                                        <View style={[ds.sectionHeaderBar, { backgroundColor: tint }]} />
                                        <Text style={ds.sectionTitle}>Reactions</Text>
                                    </View>
                                    <View style={ds.actionRow}>
                                        <TouchableOpacity style={ds.actionBtn} activeOpacity={0.72} onPress={handleLike}>
                                            <View style={[ds.actionIconWrap, isLiked && { backgroundColor: '#FFF0F3' }]}>
                                                <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={20} color={isLiked ? '#F43F5E' : D.textSec} />
                                            </View>
                                            <Text style={[ds.actionCount, isLiked && { color: '#F43F5E' }]}>{likeCount}</Text>
                                        </TouchableOpacity>
                                        <View style={ds.actionBtn}>
                                            <View style={ds.actionIconWrap}>
                                                <Ionicons name="chatbubble-outline" size={19} color={D.textSec} />
                                            </View>
                                            <Text style={ds.actionCount}>{comments.length}</Text>
                                        </View>
                                    </View>
                                    <View style={{ gap: 10 }}>
                                        {comments.map(c => (
                                            <BlurView key={c.id} intensity={25} tint="extraLight" style={[ds.commentCard, { borderColor: highlightedCommentId === c.id ? tint + '60' : D.border }, highlightedCommentId === c.id && { borderLeftWidth: 3, borderLeftColor: tint }]}>
                                                <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { targetUserId: c.user_id })}>
                                                    <Image source={{ uri: c.profiles?.avatar_url || 'https://via.placeholder.com/150' }} style={[ds.commentAvatar as any, { borderColor: D.border }]} cachePolicy="memory-disk" contentFit="cover" />
                                                </TouchableOpacity>
                                                <View style={{ flex: 1 }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                                                        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} onPress={() => navigation.navigate('UserProfile', { targetUserId: c.user_id })}>
                                                            <Text style={ds.commentName}>{c.profiles?.display_name || c.profiles?.username}</Text>
                                                            {c.profiles?.is_verified && <VerifiedBadge size={9} />}
                                                        </TouchableOpacity>
                                                        <Text style={ds.commentTime}>{formatTime(c.created_at)}</Text>
                                                    </View>
                                                    <Text style={ds.commentText}>{c.content}</Text>
                                                </View>
                                                <View style={{ alignItems: 'center', gap: 8, paddingLeft: 6 }}>
                                                    <TouchableOpacity onPress={() => handleLikeComment(c.id)} style={{ alignItems: 'center', gap: 2 }}>
                                                        <Ionicons name={c.myLike ? 'heart' : 'heart-outline'} size={13} color={c.myLike ? '#F43F5E' : D.textMuted} />
                                                        {c.likeCount > 0 && <Text style={[ds.commentLikeCount, c.myLike && { color: '#F43F5E' }]}>{c.likeCount}</Text>}
                                                    </TouchableOpacity>
                                                    {(c.user_id === userId || isOwner) && (
                                                        <TouchableOpacity onPress={() => handleDeleteComment(c.id)} style={{ padding: 2 }}>
                                                            <Ionicons name="trash-outline" size={12} color={D.textMuted} />
                                                        </TouchableOpacity>
                                                    )}
                                                </View>
                                            </BlurView>
                                        ))}
                                    </View>
                                </View>
                            );
                        }
                        return null;
                    }}
                />

                {/* Comment / chat input bar */}
                <BlurView intensity={70} tint="extraLight" style={[ds.commentBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
                    <View style={[ds.commentBarBorderTop, { backgroundColor: tint + '20' }]} />
                    {showChat && (
                        <View style={ds.emojiRow}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 10 }}>
                                {REACTION_EMOJIS.map(emoji => (
                                    <TouchableOpacity
                                        key={emoji}
                                        style={[ds.emojiBtn, { backgroundColor: tint + '15' }]}
                                        onPress={() => {
                                            liveChatRef.current?.sendReaction(emoji);
                                            // Also show locally for sender immediately
                                            localEmojiTriggerRef.current?.(emoji);
                                        }}
                                    >
                                        <Text style={{ fontSize: 20 }}>{emoji}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    )}
                    {showChat ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 }}>
                            <TextInput
                                style={[ds.commentInput, { borderColor: comment ? tint + '50' : D.border }]}
                                placeholder="Escribe en el chat en vivo..."
                                placeholderTextColor={D.textMuted}
                                value={comment}
                                onChangeText={setComment}
                                multiline={false}
                                selectionColor={tint}
                                onSubmitEditing={() => { if (comment.trim()) { liveChatRef.current?.sendMessage(comment.trim()); setComment(''); } }}
                            />
                            <TouchableOpacity
                                onPress={() => { if (comment.trim()) { liveChatRef.current?.sendMessage(comment.trim()); setComment(''); } }}
                                disabled={!comment.trim()}
                                style={[ds.postBtnWrap, { opacity: comment.trim() ? 1 : 0.4 }]}
                            >
                                <LinearGradient colors={[tint, tint + 'CC']} style={ds.postBtnGrad}>
                                    <Ionicons name="send" size={14} color="#fff" />
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 }}>
                            <TextInput
                                style={[ds.commentInput, { borderColor: comment ? tint + '50' : D.border }]}
                                placeholder={t('detail.add_comment_placeholder') || 'Añade un comentario...'}
                                placeholderTextColor={D.textMuted}
                                value={comment}
                                onChangeText={setComment}
                                multiline
                                selectionColor={tint}
                            />
                            <TouchableOpacity
                                onPress={handleSendComment}
                                disabled={!comment.trim()}
                                style={[ds.postBtnWrap, { opacity: comment.trim() ? 1 : 0.4 }]}
                            >
                                <LinearGradient colors={[tint, tint + 'CC']} style={ds.postBtnGrad}>
                                    <Ionicons name="arrow-up" size={16} color="#fff" />
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    )}
                </BlurView>
            </KeyboardAvoidingView>

            {/* ✅ FloatingEmojis: self-contained channel subscriber + local trigger for sender */}
            <FloatingEmojis
                capsuleId={capsuleId}
                onLocalEmoji={(triggerFn) => { localEmojiTriggerRef.current = triggerFn; }}
            />

            {/* Options sheet */}
            <Modal visible={showOptions} transparent animationType="fade">
                <Pressable style={ds.overlay} onPress={() => setShowOptions(false)}>
                    <View style={ds.optionsSheet}>
                        <View style={ds.sheetHandle} />
                        <Text style={ds.sheetTitle}>{t('detail.options')}</Text>
                        {[
                            { icon: 'qr-code-outline', color: D.text, label: t('detail.view_qr'), onPress: () => { setShowOptions(false); setShowQRModal(true); } },
                            { icon: 'logo-instagram', color: '#E1306C', label: t('detail.share_instagram'), onPress: () => { setShowOptions(false); navigation.navigate('InstagramShare', { capsule }); } },
                            ...(!isOwner ? [{ icon: 'alert-circle-outline', color: D.textSec, label: t('detail.report_capsule'), onPress: handleReportCapsule }] : []),
                            ...(isOwner ? [{ icon: 'trash-outline', color: '#EF4444', label: t('detail.delete_perm'), onPress: handleDeleteCapsule }] : []),
                        ].map((opt, i) => (
                            <TouchableOpacity key={i} style={ds.sheetItem} onPress={opt.onPress} activeOpacity={0.72}>
                                <View style={[ds.sheetItemIcon, { backgroundColor: (opt.color as string) + '14' }]}>
                                    <Ionicons name={opt.icon as any} size={17} color={opt.color as string} />
                                </View>
                                <Text style={[ds.sheetItemText, { color: opt.color as string }]}>{opt.label}</Text>
                                <Ionicons name="chevron-forward" size={14} color={D.textMuted} />
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity style={ds.sheetCancelBtn} onPress={() => setShowOptions(false)}>
                            <Text style={ds.sheetCancelText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>

            {/* QR modal */}
            <Modal visible={showQRModal} transparent animationType="fade">
                <Pressable style={ds.overlay} onPress={() => setShowQRModal(false)}>
                    <View style={ds.qrCard}>
                        <View style={[ds.qrAccentTop, { backgroundColor: tint }]} />
                        <Text style={ds.qrTitle}>{t('detail.capsule_qr')}</Text>
                        <Image source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=kapsely://capsule/${capsuleId}` }} style={ds.qrImg as any} cachePolicy="memory-disk" />
                        <Text style={ds.qrSub}>{t('detail.scan_qr_hint')}</Text>
                        <TouchableOpacity onPress={() => setShowQRModal(false)}>
                            <LinearGradient colors={[tint, tint + 'CC']} style={ds.qrBtn}><Text style={ds.qrBtnText}>{t('common.done')}</Text></LinearGradient>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>

            {/* Media viewer */}
            <Modal visible={viewerVisible} transparent animationType="fade">
                <View style={ds.viewer}>
                    <TouchableOpacity style={ds.viewerClose} onPress={() => setViewerVisible(false)}>
                        <Ionicons name="close" size={24} color="#fff" />
                    </TouchableOpacity>
                    <FlatList
                        data={filteredData.items}
                        horizontal pagingEnabled
                        initialScrollIndex={initialIndex}
                        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
                        onMomentumScrollEnd={e => setActiveViewerIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
                        keyExtractor={i => i.id}
                        renderItem={({ item: vi, index }) => (
                            <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
                                {vi.media_type === 'note' ? (
                                    <View style={ds.viewerNote}><Text style={ds.viewerNoteText}>{vi.content}</Text></View>
                                ) : vi.media_type === 'audio' ? (
                                    <View style={[ds.viewerAudio, { backgroundColor: tint }]}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 28 }}>
                                            {[10, 20, 30, 45, 60, 40, 25, 15, 30, 50].map((h, i) => (
                                                <View key={i} style={{ width: 5, height: playingAudio === vi.media_url ? h : h * 0.4, backgroundColor: 'rgba(255,255,255,0.75)', borderRadius: 3 }} />
                                            ))}
                                        </View>
                                        <TouchableOpacity style={ds.audioPlayBtn} onPress={() => toggleAudio(vi.media_url)}>
                                            <Ionicons name={playingAudio === vi.media_url ? 'pause' : 'play'} size={36} color="#fff" style={{ marginLeft: playingAudio === vi.media_url ? 0 : 3 }} />
                                        </TouchableOpacity>
                                    </View>
                                ) : vi.media_type === 'video' ? (
                                    <VideoWithTrim item={vi} isActive={activeViewerIndex === index && viewerVisible} style={{ width, height }} />
                                ) : (
                                    <Image source={{ uri: vi.media_url }} style={{ width, height }} contentFit="contain" cachePolicy="memory-disk" transition={300} />
                                )}
                                <View style={ds.viewerCaption}>
                                    {vi.caption && vi.caption.replace(/!!b:[^\s]+/g, '').trim() ? (
                                        <Text style={ds.viewerCaptionText}>{vi.caption.replace(/!!b:[^\s]+/g, '').trim()}</Text>
                                    ) : null}
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 4, gap: 4, opacity: 0.7 }}>
                                        <Ionicons name="calendar-outline" size={10} color="#fff" />
                                        <Text style={[ds.viewerCaptionText, { fontSize: 10, fontFamily: Fonts.bold }]}>{formatDetailedDate(vi.created_at)}</Text>
                                    </View>
                                </View>
                            </View>
                        )}
                    />
                </View>
            </Modal>

            {/* ══════════════════════════════════════════════════════════
                ✅ EPIC OPENING — covers everything, blocks all interaction
                Triggered by realtime DB update (is_opening = true)
                All members on this screen see it simultaneously
            ══════════════════════════════════════════════════════════ */}
            {showEpicOpening && (
                <View style={[StyleSheet.absoluteFill, { zIndex: 9999 }]} pointerEvents="box-only">
                    <EpicOpening
                        tint={tint}
                        capsuleTitle={capsule?.title || ''}
                        imageUrls={epicImageUrls}
                        countdown={epicCountdown}
                        onComplete={handleEpicComplete}
                    />
                </View>
            )}

        </View>

    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
const CapsuleHero = React.memo(({
    capsule, tint, isMember, isSealed, isOpening, modelImg, totalMembers,
    likeCount, followerCount, isFollowedCapsule, handleCapsuleFollowToggle,
    isOwner, canBeOpened, hasRequestedOpen, handleRequestOpen, reqCount, isBornOpen, userId, setCapsule
}: any) => {
    const { t } = useTranslation();
    const navigation = useNavigation<any>();
    return (
        <View style={ds.heroSection}>
            <View style={ds.capsuleStage}>
                <View style={[ds.capsuleGlow, { backgroundColor: tint + '20' }]} />
                <View style={[ds.capsuleGlowInner, { backgroundColor: tint + '10' }]} />
                <TouchableOpacity
                    activeOpacity={0.92}
                    onPress={() => { if (isMember && isSealed && !isOpening) navigation.navigate('CreateSelection', { capsuleId: capsule.id }); }}
                    disabled={!isMember || !isSealed || isOpening}
                    style={{ zIndex: 2 }}
                >
                    <CapsuleWithTimer modelKey={capsule.model} source={{ uri: modelImg }} date={capsule.opens_at} chainId={capsule.chain_id} capsuleType={capsule.type || undefined} style={{ width: 220, height: 220 }} />
                </TouchableOpacity>
            </View>
            <View style={ds.heroMeta}>
                <View style={ds.statRow}>
                    <StatPill icon="people-outline" label={t('detail.members', { count: totalMembers })} />
                    {isSealed ? <StatPill icon="lock-closed-outline" label={t('detail.sealed')} color={tint} bg={tint + '12'} /> : <StatPill icon="book-outline" label={t('detail.opened')} color={D.purple} bg={D.purple + '12'} />}
                    <StatPill icon="flash-outline" label={totalMembers > 1 ? t('detail.shared') : t('detail.solo')} />
                    <StatPill icon="heart-outline" label={`${likeCount}`} color={D.rose} bg={D.rose + '10'} />
                    <StatPill icon="eye-outline" label={`${followerCount}`} color={D.purple} bg={D.purple + '10'} />
                </View>
                <Text style={ds.title}>{capsule.title}</Text>
                {capsule.description && <Text style={ds.desc}>{capsule.description}</Text>}
                {userId !== capsule.owner_id && (
                    <TouchableOpacity
                        onPress={handleCapsuleFollowToggle}
                        style={[ds.capsuleFollowBtn, { backgroundColor: isFollowedCapsule ? D.surfaceAlt : tint, borderColor: isFollowedCapsule ? D.border : tint }]}
                        activeOpacity={0.8}
                    >
                        <Ionicons name={isFollowedCapsule ? 'checkmark-circle' : 'add-circle'} size={18} color={isFollowedCapsule ? tint : '#fff'} />
                        <Text style={[ds.capsuleFollowBtnText, { color: isFollowedCapsule ? D.text : '#fff' }]}>
                            {isFollowedCapsule ? (t('common.synced') || 'Synced') : (t('common.follow_capsule') || 'Sync')}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>
            {((!isOpening && isSealed) || (isBornOpen && isSealed)) && (
                <View style={ds.ctaBlock}>
                    {isOwner && canBeOpened ? (
                        <View style={{ alignItems: 'center', width: '100%', gap: 8 }}>
                            <TouchableOpacity style={[ds.unsealBtnWrap, { shadowColor: tint }]} activeOpacity={0.86} onPress={handleRequestOpen} disabled={hasRequestedOpen}>
                                <LinearGradient colors={[tint, tint + 'CC', D.rose + 'AA']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={ds.unsealBtnGrad}>
                                    <View style={ds.unsealBtnIconWrap}><Ionicons name="sparkles" size={20} color="#fff" /></View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={ds.unsealBtnText}>{hasRequestedOpen ? t('detail.awaiting_others', { current: reqCount, total: totalMembers }) : t('detail.unseal_capsule')}</Text>
                                        <Text style={ds.readyBadgeText}>READY! ✨</Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.8)" style={{ marginRight: 4 }} />
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={[ds.countdownCard, { backgroundColor: tint + '08', borderColor: tint + '20' }]}>
                            <View style={[ds.countdownIconWrap, { backgroundColor: tint + '15' }]}>
                                <Ionicons name="time" size={20} color={tint} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[ds.countdownLabel, { color: tint }]}>
                                    {isOpening 
                                        ? t('detail.opening_in') 
                                        : (canBeOpened ? (t('detail.unsealing_soon') || 'Abriendo pronto...') : (t('detail.unseals_in') || 'Se abre en'))}
                                </Text>

                                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                                    {!canBeOpened || isOpening ? (
                                        <LiveTimer 
                                            date={isOpening ? capsule.opening_at : capsule.opens_at} 
                                            style={[ds.countdownTimer, { color: D.text, minWidth: 80 }]} 
                                        />
                                    ) : (
                                        <Text style={[ds.countdownTimer, { color: tint }]}>READY! ✨</Text>
                                    )}
                                </View>
                            </View>
                        </View>
                    )}
                </View>
            )}
        </View>
    );
});

export default CapsuleDetailScreen;
