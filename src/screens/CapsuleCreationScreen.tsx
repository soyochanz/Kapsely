import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    TextInput, StatusBar, Dimensions, Switch,
    Image, Pressable, PanResponder, Animated, Alert, ActivityIndicator, Easing, Modal,
    Platform, KeyboardAvoidingView, Keyboard,
} from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Colors, Fonts, Spacing, BorderRadius, Shadow } from '../theme';
import { CapsuleType } from '../data/mockCapsules';
import { supabase } from '../lib/supabase';

import { CAPSULE_MODELS, MODEL_CATEGORIES, MODEL_IMAGES, MODEL_IMAGES_OPEN } from '../constants/models';
import CapsuleWithTimer from '../components/CapsuleWithTimer';
import { timerConfigManager } from '../utils/timerConfig';

// ─── Duration helpers ─────────────────────────────────────────────────────────
// slider goes 0..1  →  14 days .. 365 days
const MIN_DAYS = 14;
const MAX_DAYS = 365;

// Duration label moved inside component to use translations

function addDays(days: number): Date {
    return new Date(Date.now() + days * 86400000);
}

// ─── Event Configuration Helpers ───────────────────────────────────────────
function isEventActive(eventStart?: string, eventEnd?: string): boolean {
    if (!eventStart || !eventEnd) return false;
    const now = new Date();
    return now >= new Date(eventStart) && now <= new Date(eventEnd);
}


// ─── Capsule types ────────────────────────────────────────────────────────────
const { width } = Dimensions.get('window');
type Step = 'identity' | 'format' | 'timing' | 'review';
const STEPS: Step[] = ['identity', 'format', 'timing', 'review'];

// ─── Custom duration slider ───────────────────────────────────────────────────
const DurationSlider = ({ days, onChange, color, t, daysToLabel, setScrollEnabled }: any) => {
    const [localVal, setLocalVal] = useState(days);

    useEffect(() => {
        setLocalVal(days);
    }, [days]);

    return (
        <View style={{ width: '100%', alignItems: 'center' }}>
            <Slider
                style={{ width: '100%', height: 40 }}
                minimumValue={MIN_DAYS}
                maximumValue={MAX_DAYS}
                step={1}
                value={days}
                onValueChange={(val) => {
                    const rounded = Math.round(val);
                    setLocalVal(rounded);
                    onChange(rounded); // Call parent onChange immediately for responsiveness
                }}
                onSlidingStart={() => setScrollEnabled(false)}
                onSlidingComplete={() => {
                    setScrollEnabled(true);
                }}
                minimumTrackTintColor={color}
                maximumTrackTintColor={Colors.border}
                thumbTintColor={color}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: -5 }}>
                <Text style={{ fontSize: 10, color: Colors.textMuted }}>{t('common.2_weeks')}</Text>
                <Text style={{ fontSize: 12, color, fontFamily: Fonts.bold }}>{daysToLabel(localVal)}</Text>
                <Text style={{ fontSize: 10, color: Colors.textMuted }}>{t('common.1_year')}</Text>
            </View>
        </View>
    );
};

// capsuleTypes will be defined inside the component to react to loaded models

// ─── Custom duration slider ───────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    safeArea: { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border, overflow: 'hidden', zIndex: 10 },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: Spacing.md, paddingTop: 12, paddingBottom: 12,
    },
    headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { color: Colors.textPrimary, fontSize: 16, fontFamily: Fonts.semiBold },

    // ── Premium step progress bar ──
    stepProgressWrap: {
        paddingHorizontal: Spacing.lg, paddingBottom: 10, paddingTop: 6,
    },
    stepProgressTrack: {
        height: 3, backgroundColor: Colors.border, borderRadius: 2, position: 'relative', marginBottom: 8,
    },
    stepProgressFill: {
        position: 'absolute', left: 0, top: 0, height: 3, borderRadius: 2,
    },
    stepProgressLabels: {
        flexDirection: 'row', justifyContent: 'space-between',
    },
    stepProgressLabel: {
        fontSize: 10, fontFamily: Fonts.semiBold, letterSpacing: 0.4,
    },

    floatingBottomNav: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
        paddingHorizontal: Spacing.lg, paddingVertical: 14,
        backgroundColor: 'rgba(255,255,255,0.96)',
        borderTopWidth: 0,
    },
    floatingNavBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 15, borderRadius: 30,
    },
    floatingNavText: { fontFamily: Fonts.bold, fontSize: 13, letterSpacing: 0.5 },
    floatingNavTextNext: { fontFamily: Fonts.bold, fontSize: 13, letterSpacing: 0.5, color: '#fff' },

    heroContainer: {
        alignItems: 'center',
        paddingTop: 10,
        paddingBottom: 25,
        position: 'relative',
    },
    heroImageContainer: {
        width: 120,
        height: 120,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
    },
    heroImage: {
        width: 110,
        height: 110,
    },
    heroTypeIcon: {
        position: 'absolute',
        bottom: 5,
        right: 5,
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        ...Shadow.subtle,
        zIndex: 3,
    },
    heroTextContainer: {
        alignItems: 'center',
        marginTop: 5,
        paddingHorizontal: Spacing.xl,
        zIndex: 2,
    },
    heroTitle: {
        fontSize: 22,
        fontFamily: Fonts.bold,
        color: Colors.textPrimary,
        textAlign: 'center',
    },
    heroBadgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 6,
    },
    heroBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        borderColor: Colors.border,
        backgroundColor: Colors.cardAlt,
    },
    heroBadgeText: {
        fontSize: 10,
        fontFamily: Fonts.bold,
        letterSpacing: 0.5,
    },
    heroBadgeTextSmall: {
        fontSize: 10,
        fontFamily: Fonts.semiBold,
        color: Colors.textMuted,
    },
    heroPlaceholderText: {
        fontSize: 13,
        fontFamily: Fonts.regular,
        color: Colors.textMuted,
        fontStyle: 'italic',
    },

    scroll: { flex: 1, backgroundColor: Colors.background },
    scrollContent: { paddingBottom: 130, minHeight: Dimensions.get('window').height },
    step: { padding: Spacing.md },
    stepHeaderCenter: { alignItems: 'center', marginBottom: Spacing.lg },
    stepTitleCenter: { color: Colors.textPrimary, fontSize: 24, fontFamily: Fonts.bold, textAlign: 'center' },
    stepSubCenter: { color: Colors.textMuted, fontSize: 14, fontFamily: Fonts.regular, textAlign: 'center', marginTop: 4 },
    stepTitle: { color: Colors.textPrimary, fontSize: 22, fontFamily: Fonts.bold, marginBottom: 4 },
    stepSub: { color: Colors.textMuted, fontSize: 13, fontFamily: Fonts.regular, marginBottom: Spacing.lg },

    // Modern Type Grid
    typeGridContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 20,
    },
    modernTypeCard: {
        flex: 1,
        backgroundColor: Colors.surface,
        borderRadius: 12, // More rounded, diffused look
        borderWidth: 2,
        borderColor: Colors.border,
        padding: 15,
        alignItems: 'center',
        textAlign: 'center',
        ...Shadow.subtle,
        position: 'relative',
    },
    modernTypeIconBg: {
        width: 60,
        height: 60,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
        ...Shadow.subtle,
    },
    modernTypeTitle: {
        fontSize: 14,
        fontFamily: Fonts.bold,
        color: Colors.textPrimary,
        marginBottom: 4,
    },
    
    // REDESIGNED HERO
    heroCardContainer: {
        height: 320,
        backgroundColor: 'transparent',
        marginHorizontal: Spacing.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    heroImageWrapper: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 10,
        flexDirection: 'column',
        alignSelf: 'center',
        gap: 12,
    },
    heroModel: {
        width: 190,
        height: 190,
    },
    // Discrete 'Change design' chip — replaces the invasive badge
    changeDesignChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: BorderRadius.full,
        backgroundColor: Colors.cardAlt,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    changeDesignChipText: {
        fontSize: 12,
        fontFamily: Fonts.semiBold,
        color: Colors.textSecondary,
    },
    // legacy names kept for compat
    changeDesignBadge: { display: 'none' },
    changeDesignInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    changeDesignBadgeText: { fontSize: 10, fontFamily: Fonts.bold, color: '#fff' },
    changeDesignText: { fontSize: 11, fontFamily: Fonts.bold, color: '#fff', marginLeft: 6 },
    heroTextOverlay: {
        alignItems: 'center',
        marginTop: 0,
    },
    heroTextTitle: {
        fontSize: 20,
        fontFamily: Fonts.bold,
        color: Colors.textPrimary,
        textAlign: 'center',
        marginTop: 0,
    },
    heroTypeLabel: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(255,255,255,0.95)',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 20,
        marginTop: 4,
    },
    heroTypeText: {
        fontSize: 11,
        fontFamily: Fonts.semiBold,
        letterSpacing: 0.4,
    },

    // TYPE SELECTION — clean, unified
    modernTypeRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 16,
    },
    typeCardV: {
        flex: 1,
        backgroundColor: Colors.surface,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: Colors.border,
        padding: 14,
        alignItems: 'center',
        gap: 6,
    },
    typeIconContainerV: {
        width: 58,
        height: 58,
        alignItems: 'center',
        justifyContent: 'center',
    },
    typeImg: { width: 50, height: 50 },
    typeTitleV: {
        fontSize: 13,
        fontFamily: Fonts.bold,
        textAlign: 'center',
        color: Colors.textPrimary,
    },
    // One clean tagline under title
    typeTaglinePill: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: BorderRadius.full,
        backgroundColor: Colors.cardAlt,
    },
    typeTaglinePillText: {
        fontSize: 10,
        fontFamily: Fonts.medium,
        color: Colors.textMuted,
        textAlign: 'center',
    },
    // kept for compat but invisible
    typeDescV: { display: 'none' } as any,
    typeLimitContainer: { display: 'none' } as any,
    typeLimitText: { fontSize: 10, fontFamily: Fonts.bold } as any,
    typeBadgeLocked: {
        position: 'absolute',
        top: 8, right: 8,
        width: 22, height: 22,
        borderRadius: 11,
        backgroundColor: Colors.divider,
        alignItems: 'center', justifyContent: 'center',
    },
    typeBadgeText: { fontSize: 7, fontFamily: Fonts.bold, color: Colors.textMuted },

    // INFO MODAL
    infoModalContent: {
        backgroundColor: Colors.surface,
        width: '85%',
        borderRadius: 24,
        padding: 24,
        ...Shadow.lg,
    },
    infoModalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
    },
    infoIconCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
    infoModalTitle: {
        fontSize: 20,
        fontFamily: Fonts.bold,
        color: Colors.textPrimary,
        flex: 1,
    },
    infoModalBody: {
        maxHeight: 300,
        marginBottom: 20,
    },
    infoModalText: {
        fontSize: 15,
        fontFamily: Fonts.regular,
        color: Colors.textSecondary,
        lineHeight: 22,
    },
    infoModalCloseBtn: {
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: 'center',
    },
    infoModalCloseText: {
        color: '#fff',
        fontSize: 16,
        fontFamily: Fonts.bold,
    },
    modernTypeTagline: {
        fontSize: 10,
        fontFamily: Fonts.medium,
        color: Colors.textMuted,
        textAlign: 'center',
    },
    modernCheckDot: {
        position: 'absolute',
        top: 10,
        right: 10,
        width: 18,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
    },
    lockedOverlay: {
        position: 'absolute',
        top: 10,
        right: 10,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: Colors.divider,
        alignItems: 'center',
        justifyContent: 'center',
    },
    typeDetailsBox: {
        backgroundColor: Colors.cardAlt,
        borderRadius: 16,
        padding: 18,
        minHeight: 80,
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: Colors.border,
        marginBottom: 4,
    },
    typeDetailContent: {
        gap: 8,
    },
    typeDetailLabel: {
        fontSize: 12,
        fontFamily: Fonts.bold,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    typeDetailDesc: {
        fontSize: 14,
        fontFamily: Fonts.regular,
        color: Colors.textSecondary,
        lineHeight: 20,
    },
    compactRulesRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 10,
    },
    compactRulePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#fff',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    compactRuleText: {
        fontSize: 10,
        fontFamily: Fonts.medium,
        color: Colors.textSecondary,
        maxWidth: 100,
    },
    typeSelectionPrompt: {
        alignItems: 'center',
        gap: 12,
    },
    typePromptText: {
        fontSize: 14,
        fontFamily: Fonts.medium,
        color: Colors.textMuted,
    },

    // Model picker
    modelPickerTitle: { color: Colors.textPrimary, fontSize: 16, fontFamily: Fonts.bold, marginTop: Spacing.lg, marginBottom: 4 },
    modelPickerSub: { color: Colors.textMuted, fontSize: 12, fontFamily: Fonts.regular, marginBottom: Spacing.md },
    modelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    modelCard: {
        width: (width - Spacing.md * 2 - Spacing.sm * 2) / 3,
        backgroundColor: '#fff', borderRadius: BorderRadius.md,
        borderWidth: 1.5, borderColor: Colors.border,
        paddingTop: Spacing.sm, paddingBottom: Spacing.sm / 2, paddingHorizontal: Spacing.sm,
        alignItems: 'center', gap: 4,
        position: 'relative', ...Shadow.subtle,
    },

    modelImage: { width: 90, height: 120 },
    modelLabel: { color: Colors.textSecondary, fontSize: 11, fontFamily: Fonts.semiBold },
    modelCheck: {
        position: 'absolute', top: 6, right: 6,
        width: 16, height: 16, borderRadius: 8,
        alignItems: 'center', justifyContent: 'center',
    },

    modelSearchContainer: { marginBottom: Spacing.md },
    modelSearchInputWrapper: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: '#fff', borderRadius: BorderRadius.md,
        paddingHorizontal: 15, paddingVertical: 10,
        borderWidth: 1.5, borderColor: Colors.border,
        marginBottom: 10, ...Shadow.subtle
    },
    modelSearchInput: { flex: 1, color: Colors.textPrimary, fontSize: 14, height: 24, padding: 0 },
    catRow: { marginHorizontal: -Spacing.md },
    catContent: { paddingHorizontal: Spacing.md, gap: 8, paddingBottom: 5 },
    catPill: {
        paddingHorizontal: 15, paddingVertical: 7,
        borderRadius: BorderRadius.full, backgroundColor: Colors.cardAlt,
        borderWidth: 1, borderColor: Colors.border
    },
    catPillText: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textSecondary },
    emptyResults: { width: '100%', alignItems: 'center', paddingVertical: 40, gap: 10 },
    emptyResultsText: { fontSize: 14, color: Colors.textMuted, fontFamily: Fonts.medium },

    // Content
    infoBox: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 10,
        padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1, marginBottom: Spacing.md,
    },
    infoBoxTitle: { fontSize: 13, fontFamily: Fonts.semiBold, marginBottom: 3 },
    infoBoxText: { color: Colors.textSecondary, fontSize: 12, fontFamily: Fonts.regular, lineHeight: 16 },
    toggleRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: 16,
        borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md,
    },
    toggleInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    toggleLabel: { color: Colors.textPrimary, fontSize: 14, fontFamily: Fonts.semiBold },
    toggleSub: { color: Colors.textMuted, fontSize: 11, fontFamily: Fonts.regular, marginTop: 2 },
    inputGroup: { marginBottom: Spacing.md },
    inputLabel: { color: Colors.textSecondary, fontSize: 13, fontFamily: Fonts.medium, letterSpacing: 0.3, marginBottom: 8 },
    textInput: {
        backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
        borderRadius: 16, paddingHorizontal: Spacing.md, paddingVertical: 14,
        color: Colors.textPrimary, fontSize: 15, fontFamily: Fonts.regular,
    },
    textArea: { minHeight: 100, textAlignVertical: 'top' },
    helperText: { color: Colors.textMuted, fontSize: 11, fontFamily: Fonts.regular, marginTop: 5 },

    // Member selection
    typeIconSmall: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    memberTagsList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    memberTag: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: Colors.cardAlt, paddingHorizontal: 8, paddingVertical: 4,
        borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border
    },
    tagAvatar: { width: 18, height: 18, borderRadius: 9 },
    tagName: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textPrimary },
    searchBarWrapper: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border,
        borderRadius: BorderRadius.md, paddingHorizontal: 12, height: 48, ...Shadow.subtle
    },
    searchBarInput: { flex: 1, fontSize: 14, fontFamily: Fonts.regular, color: Colors.textPrimary },
    searchResults: {
        backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
        borderWidth: 1, borderColor: Colors.border, marginTop: 8,
        maxHeight: 200, overflow: 'hidden', ...Shadow.lg
    },
    searchResultItem: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.divider
    },
    resultAvatar: { width: 40, height: 40, borderRadius: 20 },
    resultName: { fontSize: 14, fontFamily: Fonts.bold, color: Colors.textPrimary },
    resultUsername: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.textMuted },

    // Schedule
    fixedDateCard: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
        padding: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1.5, marginBottom: Spacing.md,
    },
    fixedDateLabel: { fontSize: 14, fontFamily: Fonts.semiBold, marginBottom: 4 },
    fixedDateSub: { color: Colors.textSecondary, fontSize: 12, fontFamily: Fonts.regular, lineHeight: 16 },
    presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
    presetCard: {
        width: (width - Spacing.md * 2 - Spacing.sm * 2) / 3,
        backgroundColor: Colors.surface, borderRadius: 16,
        borderWidth: 1.5, borderColor: Colors.border,
        paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', gap: 4,
        position: 'relative',
    },
    presetEmoji: { fontSize: 22 },
    presetLabel: { color: Colors.textPrimary, fontSize: 13, fontFamily: Fonts.semiBold, textAlign: 'center' },
    presetCheck: {
        position: 'absolute', top: 6, right: 6, width: 18, height: 18,
        borderRadius: 9, alignItems: 'center', justifyContent: 'center',
    },
    customSliderCard: {
        borderRadius: 16, borderWidth: 1,
        backgroundColor: Colors.surface, padding: Spacing.md + 2,
        marginBottom: Spacing.md,
    },
    selectedDateCard: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
        padding: Spacing.md, borderRadius: 16, borderWidth: 1,
        backgroundColor: Colors.surface, marginBottom: Spacing.md,
    },
    selectedDateLabel: { color: Colors.textMuted, fontSize: 11, fontFamily: Fonts.regular },
    selectedDateValue: { fontSize: 15, fontFamily: Fonts.semiBold },

    // Slider
    sliderWrapper: { paddingHorizontal: 12, paddingTop: 4 },
    sliderTrack: {
        height: 6, backgroundColor: Colors.border, borderRadius: 3,
        position: 'relative', marginBottom: 14,
    },
    sliderFill: { position: 'absolute', left: 0, top: 0, height: 6, borderRadius: 3 },
    sliderThumb: {
        position: 'absolute', top: -7, width: 20, height: 20,
        borderRadius: 10, backgroundColor: Colors.surface,
        borderWidth: 2.5, ...Shadow.primary,
    },
    sliderLabels: { flexDirection: 'row', justifyContent: 'space-between' },
    sliderLabelText: { fontSize: 10, fontFamily: Fonts.regular, color: Colors.textMuted },

    // CapAngel
    capAngelHero: { borderRadius: BorderRadius.lg, padding: Spacing.lg, alignItems: 'center', gap: 8, marginBottom: Spacing.md },
    capAngelIconRing: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.primary + '18', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.primary + '33' },
    capAngelTitle: { color: Colors.textPrimary, fontSize: 18, fontFamily: Fonts.bold },
    capAngelSub: { color: Colors.textMuted, fontSize: 12, fontFamily: Fonts.medium },
    capAngelDesc: { color: Colors.textSecondary, fontSize: 13, fontFamily: Fonts.regular, lineHeight: 20, textAlign: 'center' },
    sectionHeaderText: { color: Colors.textSecondary, fontSize: 12, fontFamily: Fonts.semiBold, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
    howItWorksRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
    howItWorksIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    howItWorksText: { color: Colors.textSecondary, fontSize: 13, fontFamily: Fonts.regular, flex: 1, lineHeight: 18 },
    capAngelToggleCard: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: BorderRadius.md,
        borderWidth: 1, borderColor: Colors.border, marginTop: 4, marginBottom: Spacing.md, ...Shadow.subtle,
    },
    capAngelIconSm: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    skipNote: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 8,
        padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1, backgroundColor: Colors.cardAlt,
    },
    skipNoteText: { color: Colors.textMuted, fontSize: 12, fontFamily: Fonts.regular, flex: 1, lineHeight: 17 },

    // Review — more emotional
    reviewHero: { alignItems: 'center', marginTop: Spacing.sm, marginBottom: Spacing.lg + 4 },
    reviewHeroImg: { width: 200, height: 200 },
    reviewGlowWrap: {
        width: 280, height: 280, alignItems: 'center', justifyContent: 'center',
    },
    reviewGlowCircle: {
        position: 'absolute', width: 260, height: 260, borderRadius: 130,
    },
    modelContainerLarge: { position: 'relative', width: 230, height: 230, alignItems: 'center', justifyContent: 'center' },
    cornerTypeIconLarge: {
        position: 'absolute', top: 18, right: 18,
        width: 30, height: 30, borderRadius: 15,
        alignItems: 'center', justifyContent: 'center', zIndex: 10,
    },
    modelTimerOverlayLarge: { position: 'absolute', top: '53%', alignSelf: 'center' },
    modelTimerTextLarge: { color: '#fff', fontSize: 24, fontWeight: '800', fontFamily: 'monospace' },
    reviewTypeBadge: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: BorderRadius.full, borderWidth: 1 },
    reviewTypeBadgeText: { fontSize: 11, fontFamily: Fonts.semiBold },
    reviewTitle: { fontSize: 26, fontFamily: Fonts.bold, color: Colors.textPrimary, marginTop: 10, textAlign: 'center', letterSpacing: -0.3 },
    reviewSubTitle: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textMuted, textAlign: 'center', marginTop: 4 },
    reviewMeta: { color: Colors.textSecondary, fontSize: 12, fontFamily: Fonts.regular },
    reviewCardSection: {
        backgroundColor: Colors.surface, borderRadius: 20, borderWidth: 1,
        borderColor: Colors.border, marginBottom: 16, overflow: 'hidden',
    },
    reviewRow: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        paddingVertical: 13, paddingHorizontal: Spacing.md,
        borderBottomWidth: 1, borderBottomColor: Colors.divider,
    },
    reviewCheck: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    reviewRowLabel: { color: Colors.textSecondary, fontSize: 14, fontFamily: Fonts.regular, flex: 1 },
    reviewRowValue: { color: Colors.textPrimary, fontSize: 14, fontFamily: Fonts.semiBold },
    warningBox: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 10,
        padding: Spacing.md, borderRadius: 16, borderWidth: 1, marginTop: Spacing.md,
    },
    warningText: { fontSize: 13, fontFamily: Fonts.regular, flex: 1, lineHeight: 18 },

    // CTA
    ctaContainer: { padding: Spacing.md, paddingBottom: Spacing.xl, gap: 8 },
    ctaBtn: {
        borderRadius: BorderRadius.lg, paddingVertical: 16,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        overflow: 'hidden',
    },
    ctaText: { color: '#fff', fontSize: 16, fontFamily: Fonts.bold },
    skipBtn: { alignItems: 'center', paddingVertical: 4 },
    skipBtnText: { color: Colors.textMuted, fontSize: 13, fontFamily: Fonts.medium },

    // Chain picker
    chainList: { gap: 12, paddingBottom: 10, paddingHorizontal: Spacing.md, marginHorizontal: -Spacing.md },
    chainCard: { width: 80, alignItems: 'center', gap: 6, opacity: 0.6 },
    activeChainCard: { opacity: 1 },
    chainIconBg: {
        width: 64, height: 64, borderRadius: 16,
        backgroundColor: '#fff', borderWidth: 2, borderColor: Colors.border,
        alignItems: 'center', justifyContent: 'center', ...Shadow.subtle
    },
    chainImg: { width: '100%', height: '100%', borderRadius: 14 },
    chainLabel: { fontSize: 10, fontFamily: Fonts.bold, color: Colors.textSecondary, textAlign: 'center' },

    // Pioneers Event styles
    pioneersEventBanner: { marginTop: Spacing.md, borderRadius: BorderRadius.lg, overflow: 'hidden' },
    pioneersGradient: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: BorderRadius.lg },
    pioneersTitle: { color: '#fff', fontFamily: Fonts.bold, fontSize: 13 },
    pioneersSubtitle: { color: 'rgba(255,255,255,0.88)', fontFamily: Fonts.regular, fontSize: 11, marginTop: 2 },
    pioneersModelLock: { marginTop: Spacing.md },
    pioneersModelPreview: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginTop: Spacing.md, padding: Spacing.md, borderRadius: BorderRadius.lg, backgroundColor: 'rgba(245,166,35,0.08)', borderWidth: 1.5, borderColor: 'rgba(245,166,35,0.3)' },
    pioneersModelInfo: { flex: 1, gap: 6 },
    pioneersModelName: { fontSize: 18, fontFamily: Fonts.bold, color: Colors.textPrimary },
    pioneersModelDesc: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.textSecondary, lineHeight: 17 },
    exclusiveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(245,166,35,0.15)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
    exclusiveBadgeText: { fontSize: 9, fontFamily: Fonts.bold, color: '#f5a623', letterSpacing: 0.5 },

    // Hero Navigation
    heroNavRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        paddingHorizontal: Spacing.lg,
        zIndex: 5,
        marginBottom: 10,
    },
    heroNavBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        padding: 10,
        minWidth: 70,
    },
    heroNavText: {
        fontSize: 12,
        fontFamily: Fonts.bold,
        letterSpacing: 1,
    },

    stickyFooter: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        flexDirection: 'row', padding: Spacing.md, paddingBottom: 35,
        backgroundColor: 'rgba(255,255,255,0.97)',
        borderTopWidth: 0,
        alignItems: 'center', gap: 12, zIndex: 100,
    },
    footerBackBtn: {
        paddingHorizontal: 20, paddingVertical: 15,
        borderRadius: 30, backgroundColor: Colors.cardAlt,
        borderWidth: 1, borderColor: Colors.border,
        flexDirection: 'row', alignItems: 'center', gap: 6,
    },
    footerNextBtn: {
        flex: 1, paddingVertical: 15, borderRadius: 30,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    footerNextText: {
        color: '#fff', fontSize: 16, fontFamily: Fonts.bold, letterSpacing: 0.3,
    },
    footerBackText: {
        color: Colors.textPrimary, fontSize: 14, fontFamily: Fonts.semiBold,
    },

    // Autocomplete for CapAngel
    autocompleteWrapper: {
        position: 'relative',
        zIndex: 50,
    },
    autocompleteDropdown: {
        position: 'absolute',
        top: 52,
        left: 0,
        right: 0,
        backgroundColor: Colors.surface,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: Colors.border,
        maxHeight: 250,
        zIndex: 1000,
        ...Shadow.lg,
    },
    notificationBadge: {
        position: 'absolute',
        top: 60,
        left: '10%',
        right: '10%',
        backgroundColor: 'rgba(0,0,0,0.85)',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        flexDirection: 'row',
        ...Platform.select({
            web: { boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.3)' },
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 10,
            },
            android: {
                elevation: 10,
            }
        }),
    },
    notificationText: {
        color: '#fff',
        fontFamily: Fonts.bold,
        fontSize: 14,
    },

    // Interactive Hero
    addContentHint: {
        position: 'absolute',
        top: 25,
        left: -50,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: Colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        ...Shadow.primary,
        zIndex: 10,
        borderWidth: 2,
        borderColor: '#fff',
    },

    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    modalSheet: {
        backgroundColor: Colors.surface,
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        padding: Spacing.lg,
        paddingBottom: 40,
        maxHeight: '85%',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 20,
        fontFamily: Fonts.bold,
        color: Colors.textPrimary,
    },
    modalSub: {
        fontSize: 12,
        fontFamily: Fonts.regular,
        color: Colors.textMuted,
        marginTop: 2,
    },
    modalCloseBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: Colors.cardAlt,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalContent: {
        marginBottom: 20,
    },
    modalSectionLabel: {
        fontSize: 11,
        fontFamily: Fonts.bold,
        color: Colors.textMuted,
        letterSpacing: 1,
        marginBottom: 12,
        marginTop: 10,
    },
    modalModelCard: {
        width: (width - Spacing.lg * 2 - 24) / 3,
        alignItems: 'center',
        padding: 8,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: Colors.border,
        gap: 4,
    },
    modalModelImg: {
        width: 60,
        height: 80,
    },
    modalModelLabel: {
        fontSize: 11,
        fontFamily: Fonts.semiBold,
        color: Colors.textSecondary,
        textAlign: 'center',
    },
    chainGridCompact: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    modalChainCard: {
        width: (width - Spacing.lg * 2 - 32) / 4,
        alignItems: 'center',
        paddingVertical: 8, paddingHorizontal: 4,
        borderRadius: 14, borderWidth: 1.5,
        borderColor: Colors.border, gap: 4,
    },
    chainIconBgSmall: {
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: Colors.cardAlt,
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    chainImgSmall: { width: '100%', height: '100%' },
    modalChainLabel: {
        fontSize: 10, fontFamily: Fonts.medium,
        color: Colors.textMuted, textAlign: 'center',
    },
    modalConfirmBtn: {
        paddingVertical: 16, borderRadius: 30,
        alignItems: 'center', justifyContent: 'center',
    },
    modalConfirmText: { fontSize: 16, fontFamily: Fonts.bold, color: '#fff' },
});

const SLIDER_W = width - Spacing.md * 2 - Spacing.md * 2; // account for step+card padding

// DurationSlider moved inside component to use daysToLabel and t

const MemoizedModelCard = React.memo(({ model, isActive, onSelect }: any) => {

    const getTierColor = (tier: string) => {
        switch (tier?.toLowerCase()) {
            case 'legendary': return '#F6E05E';
            case 'rare': return '#4299E1';
            case 'uncommon': return '#48BB78';
            default: return 'transparent';
        }
    };
    const tierColor = getTierColor(model.tier);

    return (
        <TouchableOpacity
            onPress={() => onSelect(model.id)}
            activeOpacity={0.8}
            style={[
                styles.modelCard,
                isActive && { borderColor: model.tint },
            ]}
        >
            <LinearGradient
                colors={['#FDFCFB', isActive ? model.tint + '22' : '#E2E2E244', '#FDFCFB']}
                style={[StyleSheet.absoluteFill, { borderRadius: BorderRadius.md }]}
            />
            <Image source={{ uri: model.image }} style={styles.modelImage} resizeMode="contain" />
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 4 }}>
                <Text style={[styles.modelLabel, isActive && { color: model.tint }, { marginTop: 0 }]} numberOfLines={1}>{model.label}</Text>
                {model.tier && model.tier !== 'common' && (
                    <View style={{ backgroundColor: tierColor, width: 6, height: 6, borderRadius: 3 }} />
                )}
            </View>
            {isActive && (
                <View style={[styles.modelCheck, { backgroundColor: model.tint }]}>
                    <Ionicons name="checkmark" size={9} color="#fff" />
                </View>
            )}
        </TouchableOpacity>
    );
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function CapsuleCreationScreen() {
    const { t } = useTranslation();
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const scrollRef = useRef<ScrollView>(null);
    const [currentStep, setCurrentStep] = useState<Step>('identity');
    const [selectedType, setSelectedType] = useState<CapsuleType | null>(null);
    const [selectedModel, setSelectedModel] = useState('basicred_kap');
    const [hasLegacyCap, setHasLegacyCap] = useState(false);
    const [activeInstaCapCount, setActiveInstaCapCount] = useState(0);
    const [loadingLimits, setLoadingLimits] = useState(true);

    const [modelSearch, setModelSearch] = useState('');
    const [modelCategory, setModelCategory] = useState('All');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [isShared, setIsShared] = useState(false);
    const [invitedUsers, setInvitedUsers] = useState<any[]>([]);
    const [userSearchQuery, setUserSearchQuery] = useState('');
    const [userSearchResults, setUserSearchResults] = useState<any[]>([]);
    const [searchingUsers, setSearchingUsers] = useState(false);
    const [capAngel, setCapAngel] = useState(false);
    const [capAngelHandle, setCapAngelHandle] = useState('');
    const [selectedCapAngel, setSelectedCapAngel] = useState<any | null>(null);
    const [capAngelSearchQuery, setCapAngelSearchQuery] = useState('');
    const [capAngelSearchResults, setCapAngelSearchResults] = useState<any[]>([]);
    const [searchingCapAngel, setSearchingCapAngel] = useState(false);
    const [eventCode, setEventCode] = useState('');
    const [isPublic, setIsPublic] = useState(true);
    const [keyboardVisible, setKeyboardVisible] = useState(false);
    const [scrollEnabled, setScrollEnabled] = useState(true);
    const [headerHeight, setHeaderHeight] = useState(0);

    const scrollY = useRef(new Animated.Value(0)).current;

    const heroHeight = scrollY.interpolate({
        inputRange: [0, 100, 200],
        outputRange: [330, 200, 0], // Increased to show Change Model button
        extrapolate: 'clamp'
    });

    const heroOpacity = scrollY.interpolate({
        inputRange: [0, 100, 180],
        outputRange: [1, 0.8, 0],
        extrapolate: 'clamp'
    });

    const DURATION_PRESETS = useMemo(() => [
        { label: t('common.2_weeks'), days: 14, emoji: '⚡' },
        { label: t('common.1_month'), days: 30, emoji: '📅' },
        { label: t('common.3_months'), days: 90, emoji: '🌙' },
        { label: t('common.6_months'), days: 180, emoji: '⭐' },
        { label: t('common.1_year'), days: 365, emoji: '🔮' },
        { label: t('common.custom'), days: -1, emoji: '🗓️' },
    ], [t]);

    const daysToLabel = (days: number): string => {
        if (days <= 14) return t('common.2_weeks');
        if (days <= 30) return t('common.1_month');
        if (days <= 90) return t('common.3_months');
        if (days <= 180) return t('common.6_months');
        if (days >= 365) return t('common.1_year');
        return `${days} ${t('common.days')}`;
    };

    const [sliderLocalVal, setSliderLocalVal] = useState(60);

    // DurationSlider moved outside to avoid re-renders

    useEffect(() => {
        const showSubscription = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
        const hideSubscription = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
        
        // Safety timeout for loading limits
        const timeout = setTimeout(() => {
            if (loadingLimits) setLoadingLimits(false);
        }, 5000);

        return () => {
            showSubscription.remove();
            hideSubscription.remove();
            clearTimeout(timeout);
        };
    }, [loadingLimits]);

    // Duration (InstaCap)
    const [selectedPreset, setSelectedPreset] = useState<number | null>(null); // days or null if custom is showing
    const [showCustomSlider, setShowCustomSlider] = useState(false);
    const [customDays, setCustomDays] = useState(60);

    const [selectedChainId, setSelectedChainId] = useState<string | null>(null);
    const [showModelModal, setShowModelModal] = useState(false);
    const [showCapAngelInfo, setShowCapAngelInfo] = useState(false);

    const [sealing, setSealing] = useState(false);
    const [loadingAssets, setLoadingAssets] = useState(false);
    const [isAnimatingSeal, setIsAnimatingSeal] = useState(false);
    const [sealStage, setSealStage] = useState<'open' | 'closed'>('open');
    const dropAnim = useRef(new Animated.Value(-300)).current;
    const capScaleAnim = useRef(new Animated.Value(1)).current;
    const flashAnim = useRef(new Animated.Value(0)).current;

    // Notification animation
    const notifAnim = useRef(new Animated.Value(-100)).current;

    // Media feed animations for sealing process
    const mediaAnims = useRef([
        new Animated.Value(-600),
        new Animated.Value(-700),
        new Animated.Value(-800)
    ]).current;

    const [availableModels, setAvailableModels] = useState<any[]>(timerConfigManager.models);
    const [availableCategories, setAvailableCategories] = useState<string[]>(['All', ...Array.from(new Set(timerConfigManager.models.map(m => m.category)))]);

    useEffect(() => {
        const updateModels = () => {
            setAvailableModels(timerConfigManager.models);
            setAvailableCategories(['All', ...Array.from(new Set(timerConfigManager.models.map(m => m.category)))]);
        };
        const unsubscribe = timerConfigManager.subscribe(updateModels);
        updateModels();
        return unsubscribe;
    }, []);

    const activeEvent = React.useMemo(() => {
        return availableModels.find(m => m.is_event && isEventActive(m.event_start, m.event_end));
    }, [availableModels]);

    const capsuleTypes = useMemo(() => {
        const types: {
            id: CapsuleType; title: string; tagline: string; description: string;
            color: string; bgColor: string; icon: string;
            rules: { icon: string; text: string }[]; limit: string;
            disabled?: boolean;
        }[] = [
                {
                    id: 'legacycap', title: 'LegacyCap', tagline: t('create.legacy.tagline'),
                    description: t('create.legacy.description'),
                    color: Colors.legacyCap, bgColor: Colors.legacyCapLight, icon: 'time', limit: '1 active',
                    rules: [
                        { icon: 'alert-circle-outline', text: t('create.legacy.rule1') },
                        { icon: 'lock-closed', text: t('create.legacy.rule2') },
                        { icon: 'ban', text: t('create.legacy.rule3') },
                        { icon: 'film', text: t('create.legacy.rule4') },
                        { icon: 'star', text: t('create.legacy.rule5') },
                    ],
                },
                {
                    id: 'instacap', title: 'InstaCap', tagline: t('create.insta.tagline'),
                    description: t('create.insta.description'),
                    color: Colors.instaCap, bgColor: Colors.instaCapLight, icon: 'camera', limit: 'Max 5',
                    rules: [
                        { icon: 'albums-outline', text: t('create.insta.rule1') },
                        { icon: 'calendar-outline', text: t('create.insta.rule2') },
                        { icon: 'people', text: t('create.insta.rule3') },
                        { icon: 'checkmark-circle', text: t('create.insta.rule4') },
                        { icon: 'hand-left-outline', text: t('create.insta.rule5') },
                    ],
                },
                {
                    id: 'eventcap', title: 'EventCap', tagline: activeEvent ? activeEvent.event_title : t('create.event.tagline'),
                    description: activeEvent ? activeEvent.event_description : t('create.event.description'),
                    color: Colors.eventCap, bgColor: Colors.eventCapLight, icon: 'calendar', limit: 'Per event',
                    rules: [
                        { icon: 'earth', text: t('create.event.rule1') },
                        { icon: 'sync', text: t('create.event.rule2') },
                        { icon: 'qr-code', text: t('create.event.rule3') },
                        { icon: 'shield-checkmark', text: t('create.event.rule4') },
                        { icon: 'timer-outline', text: t('create.event.rule5') },
                    ],
                    disabled: !activeEvent || loadingLimits,
                },
            ];
        return types;
    }, [activeEvent, hasLegacyCap, activeInstaCapCount, loadingLimits]);


    const activeCfg = useMemo(() => {
        return selectedType ? capsuleTypes.find((t: any) => t.id === selectedType) : null;
    }, [selectedType, capsuleTypes]);

    const stepIndex = STEPS.indexOf(currentStep);
    const activeModel = useMemo(() => {
        const model = availableModels.find((m: any) => m.id === selectedModel) || 
                      (CAPSULE_MODELS as any).find((m: any) => m.id === selectedModel);
        return model || CAPSULE_MODELS[0];
    }, [selectedModel, availableModels]);

    const [activeThemeColor, setActiveThemeColor] = useState(() => {
        const cfg = timerConfigManager.getConfig(selectedModel);
        return cfg?.themeColor || (activeCfg?.color ?? Colors.primary);
    });

    useEffect(() => {
        if (Platform.OS === 'android') {
            NavigationBar.setVisibilityAsync('hidden');
            NavigationBar.setBehaviorAsync('inset-touch');
        }

        // Hide bottom tab bar while creating a capsule
        navigation.setOptions({ tabBarStyle: { display: 'none' } });
        return () => {
            navigation.setOptions({ tabBarStyle: undefined });
        };
    }, [navigation]);

    useEffect(() => {
        const checkCapsuleLimits = async () => {
            setLoadingLimits(true);
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const user = session?.user;
                if (user) {
                    // Check LegacyCap
                    const { count: legacyCount } = await supabase
                        .from('capsules')
                        .select('*', { count: 'exact', head: true })
                        .eq('owner_id', user.id)
                        .eq('type', 'legacycap')
                        .eq('status', 'sealed');

                    if (legacyCount !== null) {
                        setHasLegacyCap(legacyCount > 0);
                    }

                    // Check InstaCap count
                    const { count: instaCount } = await supabase
                        .from('capsules')
                        .select('*', { count: 'exact', head: true })
                        .eq('owner_id', user.id)
                        .eq('type', 'instacap')
                        .eq('status', 'sealed');

                    if (instaCount !== null) {
                        setActiveInstaCapCount(instaCount);
                    }
                }
            } catch (err) {
                console.error('Error checking capsule limits:', err);
            } finally {
                setLoadingLimits(false);
            }
        };

        checkCapsuleLimits();
    }, []);

    useEffect(() => {
        if (Platform.OS === 'android') {
            NavigationBar.setVisibilityAsync('hidden');
            NavigationBar.setBehaviorAsync('inset-touch');
        }

        // Hide bottom tab bar while creating a capsule
        const parent = navigation.getParent();
        if (parent) {
            parent.setOptions({ tabBarStyle: { display: 'none' } });
        }
        return () => {
            if (parent) {
                parent.setOptions({ tabBarStyle: undefined });
            }
        };
    }, [navigation]);

    useEffect(() => {
        if (selectedType === 'eventcap' && activeEvent) {
            setSelectedModel(activeEvent.capsule_model || 'pioneers_cap');
        } else if (selectedType === 'instacap' || selectedType === 'legacycap') {
            setSelectedModel(prev => {
                const currentModel = availableModels.find((m: any) => m.id === prev) || 
                                     (CAPSULE_MODELS as any).find((m: any) => m.id === prev);
                if (currentModel?.is_event || prev === 'pioneers_cap') {
                    return 'basicred_kap';
                }
                return prev;
            });
        }
    }, [selectedType, activeEvent, availableModels]);

    useEffect(() => {
        const updateTheme = () => {
            const config = timerConfigManager.getConfig(selectedModel);
            if (config?.themeColor) {
                setActiveThemeColor(config.themeColor);
            } else if (activeCfg?.color) {
                setActiveThemeColor(activeCfg.color);
            }
        };

        const syncData = () => {
            updateTheme();
            setAvailableModels(timerConfigManager.models);
            setAvailableCategories(['All', ...Array.from(new Set(timerConfigManager.models.map(m => m.category)))]);
        };

        syncData();

        return timerConfigManager.subscribe(syncData);
    }, [selectedModel, activeCfg]);



    useEffect(() => {
        const query = userSearchQuery.trim();
        if (query.length > 0) {
            const delayDebounceFn = setTimeout(() => {
                searchUsers();
            }, 300);
            return () => clearTimeout(delayDebounceFn);
        } else {
            setUserSearchResults([]);
        }
    }, [userSearchQuery]);

    const searchUsers = async () => {
        const query = userSearchQuery.trim();
        if (!query) return;

        setSearchingUsers(true);
        const { data: { user } } = await supabase.auth.getUser();

        let dbQuery = supabase
            .from('profiles')
            .select('*')
            .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
            .limit(10);

        if (user) {
            dbQuery = dbQuery.neq('id', user.id);
        }

        const { data } = await dbQuery;
        if (data) setUserSearchResults(data);
        setSearchingUsers(false);
    };

    useEffect(() => {
        const query = capAngelSearchQuery.trim();
        if (query.length > 0) {
            const delayDebounceFn = setTimeout(() => {
                searchCapAngels();
            }, 300);
            return () => clearTimeout(delayDebounceFn);
        } else {
            setCapAngelSearchResults([]);
        }
    }, [capAngelSearchQuery]);

    const searchCapAngels = async () => {
        const query = capAngelSearchQuery.trim();
        if (!query) return;

        setSearchingCapAngel(true);
        const { data: { user } } = await supabase.auth.getUser();

        let dbQuery = supabase
            .from('profiles')
            .select('*')
            .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
            .limit(10);

        if (user) {
            dbQuery = dbQuery.neq('id', user.id);
        }

        const { data } = await dbQuery;
        if (data) setCapAngelSearchResults(data);
        setSearchingCapAngel(false);
    };

    const [showSuccessNotif, setShowSuccessNotif] = useState(false);

    const selectCapAngel = (user: any) => {
        setSelectedCapAngel(user);
        setCapAngelHandle(user.username);
        setCapAngelSearchQuery('');
        setCapAngelSearchResults([]);

        // Selection feedback animation
        setShowSuccessNotif(true);
        Animated.spring(notifAnim, {
            toValue: 20, // Slide down from top
            useNativeDriver: true,
            tension: 40,
            friction: 7
        }).start();

        setTimeout(() => {
            Animated.timing(notifAnim, {
                toValue: -120, // Slide back up
                duration: 500,
                useNativeDriver: true
            }).start(() => setShowSuccessNotif(false));
        }, 3000);
    };

    const toggleInviteUser = (user: any) => {
        if (invitedUsers.some(u => u.id === user.id)) {
            setInvitedUsers(invitedUsers.filter(u => u.id !== user.id));
        } else {
            if (invitedUsers.length >= 9) {
                Alert.alert(t('create.limit_reached'), t('create.limit_shared_users'));
                return;
            }
            setInvitedUsers([...invitedUsers, user]);
        }
        setUserSearchQuery('');
        setUserSearchResults([]);
    };

    const filteredModels = React.useMemo(() => {
        return availableModels.filter(m => {
            if (m.is_active === false) return false;
            // Hide pioneers model from general selection unless it's an eventcap
            if (m.is_event && selectedType !== 'eventcap') return false;

            const matchesSearch = m.label.toLowerCase().includes(modelSearch.toLowerCase());
            const matchesCategory = modelCategory === 'All' || m.category === modelCategory;
            return matchesSearch && matchesCategory;
        });
    }, [modelSearch, modelCategory, availableModels, selectedType]);

    const goNext = () => {
        if (currentStep === 'format' && !selectedType) {
            Alert.alert(t('create.selection_required'), t('create.select_format_first'));
            return;
        }
        if (currentStep === 'identity') {
            if (!title.trim() || !description.trim()) {
                Alert.alert(t('create.missing_info'), t('create.enter_title_message'));
                return;
            }
        }
        if (currentStep === 'timing') {
            if (selectedType === 'instacap' && !selectedPreset && !showCustomSlider) {
                Alert.alert(t('create.timeline_required'), t('create.select_opening_date'));
                return;
            }
        }
        if (stepIndex < STEPS.length - 1) {
            setCurrentStep(STEPS[stepIndex + 1]);
            scrollRef.current?.scrollTo({ y: 0, animated: true });
        }
    };
    const goBack = () => {
        if (stepIndex > 0) {
            setCurrentStep(STEPS[stepIndex - 1]);
            scrollRef.current?.scrollTo({ y: 0, animated: true });
        }
    };

    // const stepLabels = ['Type', 'Content', 'Schedule', 'Angel', 'Review']; // Removed as per instructions

    // ── Compute final opening date ──────────────────────────────────────────
    const finalDays: number | null =
        selectedType === 'legacycap' ? 365 * 5 :
            selectedType === 'eventcap' ? null :
                showCustomSlider ? customDays :
                    selectedPreset;

    const openingDate = useMemo(() => {
        if (selectedType === 'eventcap' && activeEvent) {
            return activeEvent.event_end;
        }
        if (finalDays) {
            // Use date at start of current minute to keep it stable enough for UI but accurate
            const today = new Date();
            today.setSeconds(0, 0);
            return new Date(today.getTime() + finalDays * 86400000).toISOString();
        }
        // Use a stable dummy date for preview if nothing is selected yet
        return new Date(Date.now() + 365 * 86400000).toISOString();
    }, [selectedType, activeEvent, finalDays]);

    const displayOpeningDate = useMemo(() => {
        return new Date(openingDate).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        });
    }, [openingDate]);

    // ── Seal capsule → save to Supabase ───────────────────────────────────────
    const sealCapsule = async () => {
        if (sealing) return;

        // Final validation
        if (!title.trim() || !description.trim()) {
            Alert.alert(t('create.title_required'), t('create.title_desc_required'));
            return;
        }

        if (selectedType === 'instacap' && !selectedPreset && !showCustomSlider) {
            Alert.alert(t('create.title_required'), t('create.date_required'));
            return;
        }

        setSealing(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                Alert.alert(t('common.error'), t('create.login_required'));
                setSealing(false);
                return;
            }
            if (!selectedType) {
                Alert.alert(t('common.error'), t('create.type_required'));
                setSealing(false);
                return;
            }

            // Check limits
            if (selectedType === 'legacycap') {
                const { count, error: countError } = await supabase
                    .from('capsules')
                    .select('*', { count: 'exact', head: true })
                    .eq('owner_id', user.id)
                    .eq('type', 'legacycap')
                    .eq('status', 'sealed');
                if (countError) throw countError;
                if (count && count >= 1) {
                    Alert.alert(t('create.legacy_limit_title'), t('create.legacy_limit_msg'));
                    setSealing(false);
                    return;
                }
            }
            if (selectedType === 'instacap') {
                const { count: instaCount, error: countError } = await supabase
                    .from('capsules')
                    .select('*', { count: 'exact', head: true })
                    .eq('owner_id', user.id)
                    .eq('type', 'instacap')
                    .eq('status', 'sealed');
                if (countError) throw countError;
                if (instaCount && instaCount >= 5) {
                    Alert.alert(t('create.instacap_limit_title'), t('create.instacap_limit_msg'));
                    setSealing(false);
                    return;
                }
            }

            const opensAt = selectedType === 'eventcap' && activeEvent
                ? activeEvent.event_end
                : finalDays ? new Date(Date.now() + finalDays * 86400000).toISOString() : null;

            const insertData: any = {
                owner_id: user.id,
                type: selectedType,
                model: selectedModel,
                title: title || 'Untitled Capsule',
                description,
                event_code: eventCode || null,
                is_shared: isShared,
                duration_days: finalDays,
                opens_at: opensAt,
                is_public: isPublic,
                status: 'sealed',
                chain_id: selectedChainId || null,
            };

            const { data: newCapsule, error } = await supabase
                .from('capsules')
                .insert(insertData)
                .select()
                .single();

            if (error) throw error;

            // Invites
            if (invitedUsers.length > 0 && newCapsule) {
                const inviteData = invitedUsers.map(u => ({
                    capsule_id: newCapsule.id,
                    user_id: u.id,
                    status: 'pending'
                }));
                await supabase.from('capsule_invites').insert(inviteData);
                const notifs = invitedUsers.map(u => ({
                    user_id: u.id,
                    sender_id: user.id,
                    type: 'capsule_invite',
                    capsule_id: newCapsule.id,
                    message: 'invited you to a shared capsule',
                }));
                await supabase.from('notifications').insert(notifs);
            }

            // CapAngel
            if (capAngel && selectedCapAngel && newCapsule) {
                await supabase.from('notifications').insert({
                    user_id: selectedCapAngel.id,
                    sender_id: user.id,
                    type: 'cap_angel_assigned',
                    capsule_id: newCapsule.id,
                    message: 'selected you as their CapAngel for a new capsule',
                });
            }

            // ── ANIMATION PHASE ──────────────────────────────────────────
            setLoadingAssets(true);
            const modelsToLoad = [];
            if (activeModel.image_open) modelsToLoad.push(Image.prefetch(activeModel.image_open));
            if (activeModel.image) modelsToLoad.push(Image.prefetch(activeModel.image));
            
            try {
                await Promise.all([...modelsToLoad, new Promise(resolve => setTimeout(resolve, 1500))]);
            } catch (e) {
                console.warn("Asset prefetch failing", e);
            }
            setLoadingAssets(false);

            setIsAnimatingSeal(true);
            setSealStage('open');
            flashAnim.setValue(0);
            capScaleAnim.setValue(1);
            
            // Start Epic Animation
            Animated.sequence([
                Animated.timing(capScaleAnim, {
                    toValue: 1.25,
                    duration: 1200,
                    easing: Easing.bezier(0.4, 0, 0.2, 1),
                    useNativeDriver: true
                }),
                Animated.stagger(180, mediaAnims.map(anim =>
                    Animated.timing(anim, {
                        toValue: 220,
                        duration: 1800,
                        easing: Easing.bezier(0.65, 0, 0.35, 1),
                        useNativeDriver: true
                    })
                )),
                Animated.delay(400),
                Animated.timing(flashAnim, { 
                    toValue: 1, 
                    duration: 600, 
                    easing: Easing.out(Easing.circle),
                    useNativeDriver: true 
                }),
            ]).start();

            // At peak of flash, swap and slam
            setTimeout(() => {
                setSealStage('closed');
                Animated.timing(flashAnim, { toValue: 0, duration: 1600, useNativeDriver: true }).start();
                
                Animated.sequence([
                    Animated.timing(capScaleAnim, { 
                        toValue: 1.7, 
                        duration: 250, 
                        easing: Easing.out(Easing.back(1.5)),
                        useNativeDriver: true 
                    }),
                    Animated.spring(capScaleAnim, {
                        toValue: 1,
                        friction: 4,
                        tension: 50,
                        useNativeDriver: true
                    })
                ]).start();
            }, 4000);

            // Final transition
            setTimeout(() => {
                setIsAnimatingSeal(false);
                setSealing(false);
                setCurrentStep('identity');
                setSelectedType(null);
                setTitle('');
                setDescription('');
                // Navigate to the newly sealed capsule's detail page
                navigation.reset({
                    index: 1,
                    routes: [
                        { name: 'MainTabs' },
                        { name: 'CapsuleDetail', params: { capsuleId: newCapsule.id } },
                    ],
                });
            }, 7000);


        } catch (e: any) {
            console.error('Sealing error:', e);
            Alert.alert(t('common.error'), e.message ?? t('create.create_error'));
            setSealing(false);
        }
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={Colors.surface} />

            {isAnimatingSeal && (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', zIndex: 1000, alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ fontSize: 24, fontFamily: Fonts.bold, color: activeThemeColor, marginBottom: 20, textAlign: 'center' }}>
                        {sealStage === 'open' ? 'Storing your memories...' : 'Sealed for the future'}
                    </Text>
                    
                    <View style={{ width: 280, height: 400, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        {/* Flying Media items */}
                        {sealStage === 'open' && mediaAnims.map((anim, i) => (
                            <Animated.View key={i} style={{
                                position: 'absolute',
                                top: -50,
                                transform: [
                                    { translateY: anim },
                                    { scale: anim.interpolate({ inputRange: [-600, 200], outputRange: [1, 0.4] }) }
                                ],
                                opacity: anim.interpolate({
                                    inputRange: [-600, -500, 180, 220],
                                    outputRange: [0, 1, 1, 0]
                                }),
                                zIndex: 5
                            }}>
                                <View style={{ backgroundColor: activeThemeColor + '20', padding: 15, borderRadius: 20, borderWidth: 1, borderColor: activeThemeColor + '40' }}>
                                    <Ionicons
                                        name={i === 0 ? "image" : i === 1 ? "videocam" : i === 2 ? "musical-notes" : "document-text"}
                                        size={32}
                                        color={activeThemeColor}
                                    />
                                </View>
                            </Animated.View>
                        ))}

                        {/* Flash / Shine effect */}
                        <Animated.View style={[StyleSheet.absoluteFill, { 
                            backgroundColor: '#fff', 
                            zIndex: 10,
                            opacity: flashAnim 
                        }]} pointerEvents="none" />

                        <Animated.View style={{ transform: [{ scale: capScaleAnim }], alignItems: 'center', justifyContent: 'center' }}>
                            <Image 
                                source={{ uri: sealStage === 'open' ? (activeModel.image_open || activeModel.image) : activeModel.image }} 
                                style={{ width: 220, height: 220 }} 
                                resizeMode="contain" 
                            />
                            {sealStage === 'closed' && (
                                <Animated.View style={{ position: 'absolute', opacity: capScaleAnim }}>
                                    <View style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: 15, borderRadius: 40 }}>
                                        <Ionicons name="lock-closed" size={40} color="#fff" />
                                    </View>
                                </Animated.View>
                            )}
                        </Animated.View>
                    </View>
                </View>
            )}
            <View 
                style={[styles.safeArea, keyboardVisible && { borderBottomWidth: 0 }, { paddingTop: insets.top + 10 }]}
                onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
            >
                {/* Header */}
                <View style={[styles.header, keyboardVisible && { paddingTop: 0, paddingBottom: 5 }, { paddingTop: 10 }]}>
                    <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.goBack()} style={styles.headerBtn}>
                        <Ionicons name="close" size={24} color={Colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{t('create.title')}</Text>
                    <View style={styles.headerBtn} />
                </View>

                {/* Step Progress Bar */}
                <View style={styles.stepProgressWrap}>
                    <View style={styles.stepProgressTrack}>
                        <LinearGradient
                            colors={[Colors.primary, Colors.primaryDark]}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={[styles.stepProgressFill, { width: `${((stepIndex + 1) / STEPS.length) * 100}%` as any }]}
                        />
                    </View>
                    <View style={styles.stepProgressLabels}>
                        {STEPS.map((s, i) => (
                            <Text
                                key={s}
                                style={[styles.stepProgressLabel, { color: stepIndex >= i ? Colors.primary : Colors.textMuted }]}
                            >
                                {t(`create.${s}`)}
                            </Text>
                        ))}
                    </View>
                </View>
            </View>

            {/* Persistent Hero Preview - Hidden in Review step or when keyboard is visible */}
            {currentStep !== 'review' && !keyboardVisible && headerHeight > 0 && (
                <Animated.View 
                    collapsable={false}
                    style={{ 
                        height: 320, 
                        paddingHorizontal: Spacing.md,
                        position: 'absolute',
                        top: headerHeight,
                        left: 0, right: 0,
                        zIndex: 5,
                        opacity: heroOpacity,
                        transform: [{
                            translateY: scrollY.interpolate({
                                inputRange: [0, 200],
                                outputRange: [0, -220],
                                extrapolate: 'clamp'
                            })
                        }]
                    }}
                >
                    <Animated.View style={[styles.heroCardContainer]}>
                        {/* Capsule — tappable to change model */}
                        <View style={styles.heroImageWrapper}>
                            <TouchableOpacity
                                activeOpacity={0.9}
                                onPress={() => setShowModelModal(true)}
                                style={{ alignItems: 'center', justifyContent: 'center' }}
                            >
                                <Animated.View style={{ transform: [{ scale: capScaleAnim }], alignItems: 'center' }}>
                                    <CapsuleWithTimer
                                        modelKey={selectedModel}
                                        source={activeModel.image ? { uri: activeModel.image } : (MODEL_IMAGES as any)[selectedModel] || (MODEL_IMAGES as any).basicred_kap}
                                        date={openingDate}
                                        chainId={selectedChainId}
                                        style={styles.heroModel}
                                        darkerShadow={true}
                                        hideTimer={true}
                                    />
                                </Animated.View>
                            </TouchableOpacity>

                            {/* Discrete chip below capsule */}
                            <TouchableOpacity
                                style={styles.changeDesignChip}
                                activeOpacity={0.8}
                                onPress={() => setShowModelModal(true)}
                            >
                                <Ionicons name="color-palette-outline" size={14} color={Colors.textSecondary} />
                                <Text style={styles.changeDesignChipText}>{t('common.change')}</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.heroTextOverlay}>
                            <Text style={styles.heroTextTitle} numberOfLines={1}>
                                {title || t('create.untitled_capsule')}
                            </Text>
                            {activeCfg && (
                                <View style={[styles.heroTypeLabel, { backgroundColor: activeThemeColor + '15' }]}>
                                    <Ionicons name={activeCfg.icon as any} size={12} color={activeThemeColor} />
                                    <Text style={[styles.heroTypeText, { color: activeThemeColor }]}>
                                        {activeCfg.title}
                                    </Text>
                                </View>
                            )}
                        </View>
                    </Animated.View>
                </Animated.View>
            )}


            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
            >
                <Animated.ScrollView
                    ref={scrollRef as any}
                    style={styles.scroll}
                    scrollEnabled={scrollEnabled}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={[
                        styles.scrollContent, 
                        currentStep !== 'review' && !keyboardVisible && { paddingTop: 310 }
                    ]}
                    keyboardShouldPersistTaps="handled"
                    automaticallyAdjustKeyboardInsets={true}
                    onScroll={Animated.event(
                        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                        { useNativeDriver: false }
                    )}
                    scrollEventThrottle={16}
                >

                    {/* ═══ STEP 1: IDENTITY ══════════════════════════════════════ */}
                    {currentStep === 'identity' && (
                        <View style={styles.step}>
                            <View style={styles.stepHeaderCenter}>
                                <Text style={styles.stepTitleCenter}>{t('create.step1_title')}</Text>
                                <Text style={styles.stepSubCenter}>{t('create.step1_sub')}</Text>
                            </View>

                            <View style={styles.inputGroup}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Text style={styles.inputLabel}>{t('create.capsule_title')}</Text>
                                    <Text style={[styles.inputLabel, { fontSize: 10, opacity: 0.5 }]}>{title.length}/31</Text>
                                </View>
                                <TextInput
                                    style={styles.textInput}
                                    placeholder={t('create.capsule_title_placeholder')}
                                    placeholderTextColor={Colors.textMuted}
                                    value={title}
                                    onChangeText={setTitle}
                                    maxLength={31}
                                    autoCorrect={false}
                                    spellCheck={false}
                                    onFocus={() => scrollRef.current?.scrollTo({ y: 220, animated: true })}
                                />
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>{t('create.message')}</Text>
                                <TextInput style={[styles.textInput, styles.textArea]}
                                    placeholder={t('create.message_placeholder')}
                                    placeholderTextColor={Colors.textMuted}
                                    value={description} onChangeText={setDescription}
                                    multiline numberOfLines={4}
                                    selectionColor={activeThemeColor}
                                    autoCorrect={false}
                                    spellCheck={false}
                                    onFocus={() => scrollRef.current?.scrollTo({ y: 220, animated: true })}
                                />
                            </View>

                            <TouchableOpacity
                                style={[styles.toggleRow, capAngel && { borderColor: activeCfg?.color ?? Colors.primary, backgroundColor: (activeCfg?.color ?? Colors.primary) + '08' }]}
                                activeOpacity={0.9}
                                onPress={() => setCapAngel(!capAngel)}
                            >
                                <View style={styles.toggleInfo}>
                                    <Ionicons name="sparkles-outline" size={24} color={capAngel ? activeThemeColor : Colors.textMuted} />
                                    <View>
                                        <Text style={styles.toggleLabel}>{t('create.enable_capangel')}</Text>
                                        <Text style={styles.toggleSub}>{t('create.guardian_spec')}</Text>
                                    </View>
                                </View>
                                <Switch
                                    value={capAngel}
                                    onValueChange={setCapAngel}
                                    trackColor={{ false: Colors.border, true: activeThemeColor + '66' }}
                                    thumbColor={capAngel ? activeThemeColor : Colors.textMuted}
                                />
                            </TouchableOpacity>

                            {capAngel && (
                                <View style={styles.inputGroup}>
                                    {selectedCapAngel && (
                                        <View style={styles.memberTagsList}>
                                            <View style={styles.memberTag}>
                                                <Image source={{ uri: selectedCapAngel.avatar_url }} style={styles.tagAvatar} />
                                                <Text style={styles.tagName}>{selectedCapAngel.username}</Text>
                                                <TouchableOpacity activeOpacity={0.7} onPress={() => { setSelectedCapAngel(null); setCapAngelHandle(''); }}>
                                                    <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    )}

                                    {!selectedCapAngel && (
                                        <View style={styles.autocompleteWrapper}>
                                            <View style={styles.searchBarWrapper}>
                                                <Ionicons name="search" size={20} color={Colors.textMuted} />
                                                <TextInput
                                                    style={styles.searchBarInput}
                                                    placeholder={t('create.search_guardian')}
                                                    placeholderTextColor={Colors.textMuted}
                                                    value={capAngelSearchQuery}
                                                    onChangeText={setCapAngelSearchQuery}
                                                    autoCapitalize="none"
                                                    onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
                                                />
                                                {searchingCapAngel && <ActivityIndicator size="small" color={activeThemeColor} />}
                                            </View>

                                            {capAngelSearchResults.length > 0 && (
                                                <View style={styles.autocompleteDropdown}>
                                                    <ScrollView keyboardShouldPersistTaps="handled">
                                                        {capAngelSearchResults.map(user => (
                                                            <TouchableOpacity
                                                                key={user.id}
                                                                style={styles.searchResultItem}
                                                                activeOpacity={0.7}
                                                                onPress={() => selectCapAngel(user)}
                                                            >
                                                                <Image source={{ uri: user.avatar_url }} style={styles.resultAvatar} />
                                                                <View style={{ flex: 1 }}>
                                                                    <Text style={styles.resultName}>{user.display_name}</Text>
                                                                    <Text style={styles.resultUsername}>@{user.username}</Text>
                                                                </View>
                                                                <Ionicons name="add-circle-outline" size={24} color={activeThemeColor} />
                                                            </TouchableOpacity>
                                                        ))}
                                                    </ScrollView>
                                                </View>
                                            )}
                                        </View>
                                    )}
                                </View>
                            )}
                        </View>
                    )}

                    {/* ═══ STEP 2: FORMAT ══════════════════════════════════════════ */}
                    {currentStep === 'format' && (
                        <View style={styles.step}>
                            <View style={styles.stepHeaderCenter}>
                                <Text style={styles.stepTitleCenter}>{t('create.step2_title')}</Text>
                                <Text style={styles.stepSubCenter}>{t('create.step2_sub')}</Text>
                            </View>

                            <View style={styles.modernTypeRow}>
                                {capsuleTypes.map((type) => {
                                    const isActive = selectedType === type.id;
                                    const isLocked = loadingLimits ||
                                        (type.id === 'legacycap' && hasLegacyCap) ||
                                        (type.id === 'instacap' && activeInstaCapCount >= 5) ||
                                        type.disabled;
                                    
                                    const isEvent = type.id === 'eventcap';
                                    let typeIcon;
                                    
                                    if (isEvent && activeEvent) {
                                        const eventModelKey = activeEvent.capsule_model || 'pioneers_cap';
                                        const eventImg = activeEvent.image_cover || activeEvent.image || activeModel.image;
                                        typeIcon = <CapsuleWithTimer modelKey={eventModelKey} source={{ uri: eventImg }} date={openingDate} style={{ width: 50, height: 50 }} hideTimer={true} hideParticles={true} />;
                                    } else {
                                        typeIcon = <CapsuleWithTimer modelKey={selectedModel} source={{ uri: activeModel.image }} date={openingDate} style={{ width: 50, height: 50 }} hideTimer={true} hideParticles={true} />;
                                    }

                                    return (
                                        <TouchableOpacity
                                            key={type.id}
                                            activeOpacity={0.8}
                                            onPress={() => {
                                                if (isLocked) {
                                                    const ruleKey = type.id === 'instacap' ? 'insta' : type.id === 'legacycap' ? 'legacy' : 'event';
                                                    Alert.alert(t('common.warning'), t(`create.${ruleKey}.rule1`));
                                                    return;
                                                }
                                                setSelectedType(type.id as any);
                                                if (type.id === 'eventcap' && activeEvent?.capsule_model) {
                                                    setSelectedModel(activeEvent.capsule_model);
                                                }
                                            }}
                                            style={[styles.typeCardV, isActive && { borderColor: type.color, backgroundColor: type.color + '0A' }, isLocked && { opacity: 0.45 }]}
                                        >
                                            <View style={styles.typeIconContainerV}>
                                                {typeIcon}
                                            </View>
                                            <Text style={[styles.typeTitleV, { color: isActive ? type.color : Colors.textPrimary }]}>{type.title}</Text>
                                            <View style={[styles.typeTaglinePill, isActive && { backgroundColor: type.color + '18' }]}>
                                                <Text style={[styles.typeTaglinePillText, isActive && { color: type.color }]}>
                                                    {type.tagline}
                                                </Text>
                                            </View>
                                            {isLocked && (
                                                <View style={styles.typeBadgeLocked}>
                                                    <Ionicons name="lock-closed" size={11} color={Colors.textMuted} />
                                                </View>
                                            )}
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            {selectedType === 'eventcap' && false && (
                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>Event Access Code</Text>
                                    <TextInput
                                        style={[styles.textInput, { borderColor: Colors.eventCap + '55' }]}
                                        placeholder="e.g. EVENT-2026-XXXX"
                                        placeholderTextColor={Colors.textMuted}
                                        value={eventCode} onChangeText={setEventCode}
                                        onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
                                    />
                                </View>
                            )}

                            {selectedType && (
                                <View style={styles.typeDetailsBox}>
                                    <View style={styles.typeDetailContent}>
                                        <Text style={[styles.typeDetailLabel, { color: activeThemeColor }]}>{activeCfg?.title} {t('create.strategy')}</Text>
                                        <Text style={styles.typeDetailDesc}>{activeCfg?.description}</Text>
                                    </View>
                                </View>
                            )}
                            
                            <View style={[styles.toggleRow, { marginTop: 20 }]}>
                                <View style={styles.toggleInfo}>
                                    <Ionicons name={isPublic ? 'globe-outline' : 'lock-closed-outline'} size={18} color={activeThemeColor} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.toggleLabel}>{isPublic ? t('common.public_capsule') : t('common.private_capsule')}</Text>
                                        <Text style={styles.toggleSub}>
                                            {isPublic ? t('create.public_desc') : t('create.private_desc')}
                                        </Text>
                                    </View>
                                </View>
                                <Switch value={isPublic} onValueChange={setIsPublic}
                                    trackColor={{ false: Colors.border, true: activeThemeColor + '66' }}
                                    thumbColor={isPublic ? activeThemeColor : Colors.textMuted} />
                            </View>
                        </View>
                    )}

                    {/* ═══ STEP 3: TIMING ══════════════════════════════════════ */}
                    {currentStep === 'timing' && (
                        <View style={styles.step}>
                            <View style={styles.stepHeaderCenter}>
                                <Text style={styles.stepTitleCenter}>{t('create.step3_title')}</Text>
                                <Text style={styles.stepSubCenter}>{t('create.step3_sub')}</Text>
                            </View>

                            {/* LegacyCap fixed */}
                            {selectedType === 'legacycap' && (
                                <View style={[styles.fixedDateCard, { borderColor: Colors.legacyCap + '44', backgroundColor: Colors.legacyCapLight }]}>
                                    <Image source={{ uri: activeModel.image }} style={{ width: 40, height: 54 }} resizeMode="contain" />
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.fixedDateLabel, { color: Colors.legacyCap }]}>{t('create.fixed_opening_5yr')}</Text>
                                        <Text style={styles.fixedDateSub}>
                                            {t('create.opens_on', { date: displayOpeningDate })}
                                        </Text>
                                    </View>
                                </View>
                            )}

                            {/* InstaCap duration presets */}
                            {selectedType === 'instacap' && (
                                <>
                                    <View style={styles.presetGrid}>
                                        {DURATION_PRESETS.map((p) => {
                                            const isCustom = p.days === -1;
                                            const isActive = isCustom ? showCustomSlider : (!showCustomSlider && selectedPreset === p.days);
                                            return (
                                                <TouchableOpacity
                                                    key={p.label}
                                                    activeOpacity={0.8}
                                                    onPress={() => {
                                                        if (isCustom) {
                                                            setShowCustomSlider(true);
                                                            setSelectedPreset(null);
                                                        } else {
                                                            setShowCustomSlider(false);
                                                            setSelectedPreset(p.days);
                                                        }
                                                    }}
                                                    style={[styles.presetCard, isActive && { borderColor: Colors.instaCap, backgroundColor: Colors.instaCapLight }]}
                                                >
                                                    <Text style={styles.presetEmoji}>{p.emoji}</Text>
                                                    <Text style={[styles.presetLabel, isActive && { color: Colors.instaCap }]}>{p.label}</Text>
                                                    {isActive && (
                                                        <View style={[styles.presetCheck, { backgroundColor: Colors.instaCap }]}>
                                                            <Ionicons name="checkmark" size={10} color="#fff" />
                                                        </View>
                                                    )}
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>

                                    {/* Custom slider */}
                                    {showCustomSlider && (
                                        <View style={[styles.customSliderCard, { borderColor: Colors.instaCap + '44' }]}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                                <Ionicons name="time-outline" size={18} color={Colors.instaCap} />
                                                <Text style={[styles.selectedDateLabel, { flex: 1 }]}>{t('create.custom_duration')}</Text>
                                                <Text style={[styles.selectedDateValue, { color: Colors.instaCap }]}>{daysToLabel(customDays)}</Text>
                                            </View>
                                             <DurationSlider 
                                                days={customDays} 
                                                onChange={setCustomDays} 
                                                color={Colors.instaCap} 
                                                t={t}
                                                daysToLabel={daysToLabel}
                                                setScrollEnabled={setScrollEnabled}
                                            />
                                        </View>
                                    )}

                                    {/* Selected date preview */}
                                    {(selectedPreset || showCustomSlider) && (
                                        <View style={[styles.selectedDateCard, { borderColor: Colors.instaCap + '44' }]}>
                                            <Ionicons name="calendar-outline" size={20} color={Colors.instaCap} />
                                            <View>
                                                <Text style={styles.selectedDateLabel}>{t('create.opening_date')}</Text>
                                                <Text style={[styles.selectedDateValue, { color: Colors.instaCap }]}>
                                                    {displayOpeningDate}
                                                </Text>
                                            </View>
                                        </View>
                                    )}
                                </>
                            )}

                            {/* EventCap instructions */}
                            {selectedType === 'eventcap' && (
                                <View style={[styles.fixedDateCard, { borderColor: Colors.eventCap + '44', backgroundColor: Colors.eventCapLight }]}>
                                    <View style={[styles.modernTypeIconBg, { backgroundColor: Colors.eventCap, marginBottom: 0 }]}>
                                        <Ionicons name="sync" size={24} color="#fff" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.fixedDateLabel, { color: Colors.eventCap }]}>{t('create.event_sync_opening')}</Text>
                                        <Text style={styles.fixedDateSub}>
                                            {t('create.event_sync_desc')}
                                        </Text>
                                    </View>
                                </View>
                            )}
                        </View>
                    )}






                    {/* ═══ STEP 5: REVIEW ══════════════════════════════════════ */}
                    {currentStep === 'review' && (
                        <View style={styles.step}>
                            <View style={styles.stepHeaderCenter}>
                                <Text style={styles.stepTitleCenter}>{t('create.step4_title')}</Text>
                                <Text style={styles.stepSubCenter}>{t('create.step4_sub')}</Text>
                            </View>

                            {/* Review Hero — emotional, clean */}
                            <View style={styles.reviewHero}>
                                {/* Radial glow behind capsule */}
                                <View style={styles.reviewGlowWrap}>
                                    <LinearGradient
                                        colors={[activeThemeColor + '28', activeThemeColor + '00']}
                                        style={[StyleSheet.absoluteFill, { borderRadius: 140 }]}
                                    />
                                    <View style={styles.modelContainerLarge}>
                                        <CapsuleWithTimer
                                            modelKey={selectedModel}
                                            source={{ uri: activeModel.image }}
                                            date={openingDate}
                                            chainId={selectedChainId}
                                            capsuleType={selectedType || undefined}
                                            style={styles.reviewHeroImg}
                                            hideParticles={false}
                                        />
                                        <View style={[styles.cornerTypeIconLarge, { backgroundColor: activeThemeColor }]}>
                                            <Ionicons name={activeCfg?.icon as any} size={14} color="#fff" />
                                        </View>
                                    </View>
                                </View>

                                <View style={[styles.reviewTypeBadge, { backgroundColor: activeThemeColor + '18', borderColor: activeThemeColor + '44', marginTop: 8 }]}>
                                    <Text style={[styles.reviewTypeBadgeText, { color: activeThemeColor }]}>{activeCfg?.title ?? t('create.capsule')}</Text>
                                </View>
                                <Text style={styles.reviewTitle}>{title || t('create.untitled_capsule')}</Text>
                                <Text style={styles.reviewSubTitle}>{t('create.step4_sub')}</Text>
                            </View>

                            {/* Summary card */}
                            <View style={styles.reviewCardSection}>
                            {[
                                { label: t('create.type'), value: activeCfg?.title ?? '—', done: !!selectedType },
                                { label: t('create.title'), value: title || t('create.not_set'), done: title.length > 0 },
                                { label: t('create.duration'), value: selectedType === 'legacycap' ? t('create.five_years') : selectedType === 'eventcap' ? t('create.event_sync') : finalDays ? daysToLabel(finalDays) : t('create.not_set'), done: !!finalDays || selectedType !== 'instacap' },
                                { label: t('create.model'), value: activeModel.label, done: true },
                                { label: t('create.capangel'), value: capAngel ? (capAngelHandle || t('create.set')) : t('create.skipped'), done: capAngel },
                            ].map((item, i, arr) => (
                                <View key={i} style={[styles.reviewRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                                    <View style={[styles.reviewCheck,
                                        item.done ? { backgroundColor: Colors.success + '18', borderColor: Colors.success + '44' } :
                                            { backgroundColor: Colors.cardAlt, borderColor: Colors.border }]}>
                                        <Ionicons name={item.done ? 'checkmark' : 'remove'} size={12} color={item.done ? Colors.success : Colors.textMuted} />
                                    </View>
                                    <Text style={styles.reviewRowLabel}>{item.label}</Text>
                                    <Text style={[styles.reviewRowValue, !item.done && { color: Colors.textMuted }]}>{item.value}</Text>
                                </View>
                            ))}
                            </View>

                            {selectedType === 'legacycap' && (
                                <View style={[styles.warningBox, { borderColor: Colors.legacyCap + '44', backgroundColor: Colors.legacyCapLight }]}>
                                    <Ionicons name="warning" size={18} color={Colors.legacyCap} />
                                    <Text style={[styles.warningText, { color: Colors.legacyCap + 'cc' }]}>
                                        <Text style={{ fontFamily: Fonts.semiBold, color: Colors.legacyCap }}>{t('create.legacy_caution_title')}</Text>
                                        {t('create.legacy_caution_desc')}
                                    </Text>
                                </View>
                            )}

                            <View style={{ marginTop: 30, gap: 12 }}>
                                <TouchableOpacity
                                    onPress={sealCapsule}
                                    disabled={sealing}
                                    activeOpacity={0.8}
                                    style={[
                                        styles.footerNextBtn,
                                        { backgroundColor: sealing ? activeThemeColor + '88' : activeThemeColor, height: 60, borderRadius: 30 }
                                    ]}
                                >
                                    {sealing ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                        <>
                                            <Text style={[styles.footerNextText, { fontSize: 18 }]}>{t('create.seal_capsule_btn')}</Text>
                                            <Ionicons name="lock-closed" size={20} color="#fff" />
                                        </>
                                    )}
                                </TouchableOpacity>

                                <TouchableOpacity onPress={goBack} style={[styles.footerBackBtn, { justifyContent: 'center', height: 50, borderRadius: 25 }]} activeOpacity={0.7}>
                                    <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
                                    <Text style={styles.footerBackText}>{t('create.go_back_btn')}</Text>
                                </TouchableOpacity>

                                <Text style={{ textAlign: 'center', color: Colors.textMuted, fontSize: 12, fontStyle: 'italic', marginTop: 10, marginBottom: 40 }}>
                                    {t('create.double_check')}
                                </Text>
                            </View>
                        </View>
                    )}
                </Animated.ScrollView>

                {/* Floating Bottom Nav */}
                {currentStep !== 'review' && (
                    <View style={[styles.floatingBottomNav, { paddingBottom: Math.max(insets.bottom, 15) }]}>
                        {stepIndex > 0 ? (
                            <>
                                <TouchableOpacity onPress={goBack} style={[styles.floatingNavBtn, { flex: 1, backgroundColor: Colors.surface, borderWidth: 1, borderColor: activeThemeColor + '44' }]} activeOpacity={0.7}>
                                    <Ionicons name="chevron-back" size={20} color={activeThemeColor} />
                                    <Text style={[styles.floatingNavText, { color: activeThemeColor }]}>{t('create.back').toUpperCase()}</Text>
                                </TouchableOpacity>
                                
                                <TouchableOpacity
                                    onPress={goNext}
                                    disabled={
                                        (currentStep === 'format' && !selectedType) ||
                                        (currentStep === 'identity' && (!title.trim() || !description.trim())) ||
                                        (currentStep === 'timing' && selectedType === 'instacap' && !selectedPreset && !showCustomSlider)
                                    }
                                    style={[
                                        styles.floatingNavBtn,
                                        { flex: 1, backgroundColor: activeThemeColor },
                                        ((currentStep === 'format' && !selectedType) ||
                                        (currentStep === 'identity' && (!title.trim() || !description.trim())) ||
                                        (currentStep === 'timing' && selectedType === 'instacap' && !selectedPreset && !showCustomSlider)) && { opacity: 0.3 }
                                    ]}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.floatingNavTextNext}>{t('create.next').toUpperCase()}</Text>
                                    <Ionicons name="chevron-forward" size={16} color="#fff" />
                                </TouchableOpacity>
                            </>
                        ) : (
                            <TouchableOpacity
                                onPress={goNext}
                                disabled={!title.trim() || !description.trim()}
                                style={[
                                    styles.floatingNavBtn,
                                    { flex: 1, backgroundColor: activeThemeColor, marginHorizontal: 10 },
                                    (!title.trim() || !description.trim()) && { opacity: 0.3 }
                                ]}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.floatingNavTextNext}>{t('create.next').toUpperCase()}</Text>
                                <Ionicons name="chevron-forward" size={16} color="#fff" />
                            </TouchableOpacity>
                        )}
                    </View>
                )}
            </KeyboardAvoidingView>


            {/* Change Model Modal */}
            <Modal
                visible={showModelModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowModelModal(false)}
            >
                <Pressable 
                    style={styles.modalOverlay} 
                    onPress={() => setShowModelModal(false)}
                    android_ripple={{ color: 'transparent' }}
                >
                    <AnimatableModalContent
                        availableModels={availableModels}
                        selectedModel={selectedModel}
                        onSelectModel={(id: string) => {
                            setSelectedModel(id);
                            // Brief feedback animation
                            Animated.sequence([
                                Animated.timing(capScaleAnim, { toValue: 1.1, duration: 150, useNativeDriver: true }),
                                Animated.timing(capScaleAnim, { toValue: 1, duration: 150, useNativeDriver: true })
                            ]).start();
                        }}
                        selectedChainId={selectedChainId}
                        onSelectChain={setSelectedChainId}
                        activeThemeColor={activeThemeColor}
                        selectedType={selectedType}
                        onClose={() => setShowModelModal(false)}
                    />
                </Pressable>
            </Modal>
        </View>
    );
}

// ─── Modal Content Sub-component ──────────────────────────────────────────────
function AnimatableModalContent({
    availableModels, selectedModel, onSelectModel,
    selectedChainId, onSelectChain, activeThemeColor,
    selectedType, onClose
}: any) {
    const { t } = useTranslation();
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(50)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 400, easing: Easing.out(Easing.back(1)), useNativeDriver: true })
        ]).start();
    }, []);

    return (
        <Animated.View
            style={[
                styles.modalSheet,
                { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
            ]}
        >
            <View style={styles.modalHeader}>
                <View>
                    <Text style={styles.modalTitle}>{t('create.customize')}</Text>
                    <Text style={styles.modalSub}>{t('create.select_style')}</Text>
                </View>
                <TouchableOpacity activeOpacity={0.7} onPress={onClose} style={styles.modalCloseBtn}>
                    <Ionicons name="close" size={24} color={Colors.textPrimary} />
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
                <Text style={styles.modalSectionLabel}>{t('create.models')}</Text>
                <View style={[styles.modelGrid, { paddingBottom: 20 }]}>
                    {availableModels.filter((m: any) => {
                        if (m.is_active === false) return false;
                        if (selectedType === 'eventcap') return m.is_event;
                        return !m.is_event;
                    }).map((model: any) => (
                        <TouchableOpacity
                            key={model.id}
                            onPress={() => onSelectModel(model.id)}
                            activeOpacity={0.8}
                            style={[
                                styles.modalModelCard,
                                selectedModel === model.id && { borderColor: activeThemeColor, backgroundColor: activeThemeColor + '10' }
                            ]}
                        >
                            <Image source={{ uri: model.image_cover || model.image }} style={styles.modalModelImg} resizeMode="contain" />
                            <Text style={[styles.modalModelLabel, selectedModel === model.id && { color: activeThemeColor }]} numberOfLines={1}>{model.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <Text style={styles.modalSectionLabel}>{t('create.chains')}</Text>
                <View style={styles.chainGridCompact}>
                    <TouchableOpacity
                        style={[styles.modalChainCard, !selectedChainId && { borderColor: activeThemeColor, backgroundColor: activeThemeColor + '10' }]}
                        activeOpacity={0.8}
                        onPress={() => onSelectChain(null)}
                    >
                        <View style={styles.chainIconBgSmall}>
                            <Ionicons name="close" size={20} color={Colors.textMuted} />
                        </View>
                        <Text style={[styles.modalChainLabel, !selectedChainId && { color: activeThemeColor }]}>{t('common.cancel')}</Text>
                    </TouchableOpacity>
                    {timerConfigManager.getChainLibrary().filter(c => c.is_active !== false).map(chain => (
                        <TouchableOpacity
                            key={chain.id}
                            style={[styles.modalChainCard, selectedChainId === chain.id && { borderColor: activeThemeColor, backgroundColor: activeThemeColor + '10' }]}
                            activeOpacity={0.8}
                            onPress={() => onSelectChain(chain.id)}
                        >
                            <View style={styles.chainIconBgSmall}>
                                <Image source={{ uri: chain.thumbnail_url || chain.image_url }} style={styles.chainImgSmall} resizeMode="cover" />
                            </View>
                            <Text style={[styles.modalChainLabel, selectedChainId === chain.id && { color: activeThemeColor }]} numberOfLines={1}>{chain.name}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </ScrollView>

            <TouchableOpacity
                style={[styles.modalConfirmBtn, { backgroundColor: activeThemeColor }]}
                activeOpacity={0.8}
                onPress={onClose}
            >
                <Text style={styles.modalConfirmText}>{t('common.done')}</Text>
            </TouchableOpacity>
        </Animated.View>
    );
}
