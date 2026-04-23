import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    TextInput, Dimensions, Animated, Easing, StatusBar, Alert, ActivityIndicator,
    Modal, FlatList, KeyboardAvoidingView, Platform, Pressable, SectionList, Keyboard, InteractionManager,
    DeviceEventEmitter, Vibration
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
import FloatingEmojis from '../components/FloatingEmojis';
import AestheticLocation from '../components/AestheticLocation';
import { EpicOpening } from '../components/detail/EpicOpening';
import { CapsuleHero } from '../components/detail/CapsuleHero';

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
    readyBadgeText: { fontSize: 13, fontFamily: Fonts.bold, color: '#fff', opacity: 0.9 },
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
    itemDateTag: { position: 'absolute', bottom: 6, left: 6, backgroundColor: 'rgba(255,255,255,0.85)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8, zIndex: 12 },
    itemDateText: { fontSize: 8, fontFamily: Fonts.bold, color: D.textSec },

    // Collaborators
    collabBar: { flexDirection: 'row', alignItems: 'center', gap: -8, marginBottom: 12 },
    collabAvatar: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: D.bg },
    collabMore: { width: 30, height: 30, borderRadius: 15, backgroundColor: D.surfaceAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: D.bg },
    collabMoreText: { fontSize: 10, fontFamily: Fonts.bold, color: D.textSec },
    collabNameCard: { backgroundColor: 'rgba(26, 21, 48, 0.85)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, position: 'absolute', top: -35, alignSelf: 'center', zIndex: 100 },
    collabNameText: { color: '#fff', fontSize: 11, fontFamily: Fonts.bold },

    // Item Author Overlay
    itemAuthorOverlay: { position: 'absolute', top: 6, left: 6, width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#fff', zIndex: 15, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },

    // Modern Search
    searchContainer: { marginBottom: 20, paddingHorizontal: 4 },
    searchInputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: D.surfaceAlt,
        borderRadius: 24,
        paddingHorizontal: 16,
        paddingVertical: Platform.OS === 'ios' ? 12 : 6,
        borderWidth: 1.5,
        borderColor: D.border,
    },
    modernSearchInput: {
        flex: 1,
        fontSize: 15,
        fontFamily: Fonts.medium,
        color: D.text,
        height: 40,
    },

    // Modern User Result Card
    modernUserCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: D.surface,
        padding: 12,
        borderRadius: 20,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: D.border,
        gap: 12,
    },
    modernUserAvatarWrap: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 2,
        borderColor: D.border,
        padding: 2,
    },
    modernUserAvatar: {
        flex: 1,
        borderRadius: 20,
    },
    modernUserName: {
        fontSize: 15,
        fontFamily: Fonts.bold,
        color: D.text,
    },
    modernUserTag: {
        fontSize: 12,
        fontFamily: Fonts.regular,
        color: D.textMuted,
    },
    modernInviteBtn: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 14,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
    },
    modernInviteBtnText: {
        color: '#fff',
        fontSize: 13,
        fontFamily: Fonts.bold,
    },
});

// ── Collaborators Component ──────────────────────────────────────────────────
const CollaboratorsBar = React.memo(({ owner, members, invites, tint, isMember, onInvite, t }: any) => {
    const [activeUser, setActiveUser] = useState<any>(null);
    const timeoutRef = useRef<any>(null);
    const navigation = useNavigation<any>();

    const allMembers = useMemo(() => {
        if (!owner) return [];
        const ownerProfile = { ...owner, isOwner: true };
        const accepted = (members || []).map((m: any) => ({ ...m, isAccepted: true }));
        const acceptedInvites = (invites || [])
            .filter((i: any) => i.status === 'accepted' && i.profiles)
            .map((i: any) => ({ ...i.profiles, isAccepted: true }));
        const pending = (invites || [])
            .filter((i: any) => i.status === 'pending' && i.profiles)
            .map((i: any) => ({ ...i.profiles, isPending: true }));
        
        const combined = [ownerProfile, ...accepted, ...acceptedInvites, ...pending];
        const unique = Array.from(new Map(combined.map(m => [m.id, m])).values());
        return unique;
    }, [owner, members, invites]);

    const acceptedMembersCount = useMemo(() => {
        return allMembers.filter((m: any) => m.isOwner || m.isAccepted).length;
    }, [allMembers]);

    const handlePress = (m: any) => {
        if (m.isPending) return;
        if (activeUser && activeUser.id === m.id) {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            setActiveUser(null);
            navigation.navigate('UserProfile', { targetUserId: m.id });
        } else {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            setActiveUser(m);
            timeoutRef.current = setTimeout(() => setActiveUser(null), 2500);
        }
    };

    if (!owner) return null;

    return (
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
            {activeUser && (
                <View style={ds.collabNameCard}>
                    <Text style={ds.collabNameText}>{activeUser.display_name || activeUser.username}</Text>
                </View>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 }}>
                <Ionicons name="people" size={14} color={D.textMuted} />
                <Text style={{ fontSize: 13, fontFamily: Fonts.semiBold, color: D.textSec }}>
                    {acceptedMembersCount} {t('common.members')}
                </Text>
            </View>

            <View style={[ds.collabBar, { gap: -10 }]}>
                {allMembers.slice(0, 6).map((m, i) => {
                    const size = m.isPending ? 36 : 32;
                    return (
                        <TouchableOpacity 
                            key={m.id || i} 
                            activeOpacity={m.isPending ? 1 : 0.8} 
                            onPress={() => handlePress(m)}
                            style={{ 
                                zIndex: 10 - i, 
                                marginLeft: i === 0 ? 0 : -14,
                            }}
                        >
                            <View style={{ 
                                width: size, 
                                height: size, 
                                borderRadius: size / 2, 
                                borderWidth: 2, 
                                borderColor: i === 0 ? tint + '60' : '#fff',
                                backgroundColor: '#E5E7EB',
                                overflow: 'hidden',
                                justifyContent: 'center',
                                alignItems: 'center'
                            }}>
                                <Image 
                                    source={{ uri: Colors.getAvatarUrl(m.avatar_url, m.display_name || m.username, m.favorite_color) }} 
                                    style={{ 
                                        width: '100%', 
                                        height: '100%',
                                        opacity: m.isPending ? 0.3 : 1
                                    }}
                                    contentFit="contain"
                                    recyclingKey={`collab-${m.id}`}
                                />
                                {m.isPending && (
                                    <View style={{ 
                                        ...StyleSheet.absoluteFillObject, 
                                        justifyContent: 'center',
                                        alignItems: 'center'
                                    }}>
                                         <ActivityIndicator size="small" color={D.textMuted} />
                                    </View>
                                )}
                            </View>
                        </TouchableOpacity>
                    );
                })}
                {allMembers.length > 6 && (
                    <View style={[ds.collabMore, { marginLeft: -14, width: 32, height: 32, borderRadius: 16 }]}>
                        <Text style={ds.collabMoreText}>+{allMembers.length - 6}</Text>
                    </View>
                )}
                {isMember && (
                    <TouchableOpacity 
                        style={[ds.collabMore, { backgroundColor: tint + '10', marginLeft: 8, borderColor: tint + '20', borderWidth: 1, width: 32, height: 32, borderRadius: 16 }]}
                        onPress={onInvite}
                    >
                        <Ionicons name="add" size={18} color={tint} />
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
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
                try {
                    await Audio.setAudioModeAsync({
                        allowsRecordingIOS: false,
                        playsInSilentModeIOS: true,
                        playThroughEarpieceAndroid: false,
                        staysActiveInBackground: false,
                    });
                    const { sound } = await Audio.Sound.createAsync(
                        { uri },
                        { shouldPlay: true, volume: 1.0 },
                        (status: any) => { if (status.didJustFinish) onFinish(); }
                    );
                    soundRef.current = sound;
                } catch (e) {
                    console.error("Playback error", e);
                }
            }
        };
        loadAndPlay();
        return () => { if (soundRef.current) soundRef.current.unloadAsync(); };
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

// ─── Ambient orbs ─────────────────────────────────────────────────────────────
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

// ─── Interaction Bar component (isolated) ──────────────────────────────────
const InteractionBar = React.memo(({ 
    showChat, setShowChat, isChatAvailable, comment, setComment, tint, 
    handleSendComment, liveChatRef, scrollToChat, localEmojiTriggerRef 
}: any) => {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    
    return (
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
                                    localEmojiTriggerRef.current?.(emoji);
                                }}
                            >
                                <Text style={{ fontSize: 20 }}>{emoji}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            )}

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 }}>
                {isChatAvailable && (
                    <TouchableOpacity style={{ marginRight: 2 }} activeOpacity={0.7} onPress={() => { setShowChat(!showChat); if (!showChat) scrollToChat(); }}>
                        <View style={[ds.actionIconWrap, { width: 40, height: 40, borderRadius: 20, backgroundColor: showChat ? tint : D.surfaceAlt, borderColor: showChat ? tint : D.border }]}>
                            <Ionicons name={showChat ? "images" : "chatbubbles"} size={18} color={showChat ? "#fff" : D.textMuted} />
                        </View>
                    </TouchableOpacity>
                )}

                <TextInput
                    style={[ds.commentInput, { borderColor: comment ? tint + '50' : D.border }]}
                    placeholder={showChat ? t('detail.live_chat_placeholder') : t('detail.add_comment_placeholder')}
                    placeholderTextColor={D.textMuted}
                    value={comment}
                    onChangeText={setComment}
                    multiline={!showChat}
                    selectionColor={tint}
                    onSubmitEditing={() => { 
                        if (showChat && comment.trim()) { 
                            liveChatRef.current?.sendMessage(comment.trim()); 
                            setComment(''); 
                        } 
                    }}
                />
                
                <TouchableOpacity
                    onPress={() => {
                        if (showChat) {
                            if (comment.trim()) {
                                liveChatRef.current?.sendMessage(comment.trim());
                                setComment('');
                            }
                        } else {
                            handleSendComment();
                        }
                    }}
                    disabled={!comment.trim()}
                    style={[ds.postBtnWrap, { opacity: comment.trim() ? 1 : 0.4 }]}
                >
                    <LinearGradient colors={[tint, tint + 'CC']} style={ds.postBtnGrad}>
                        <Ionicons name={showChat ? "send" : "arrow-up"} size={showChat ? 14 : 16} color="#fff" />
                    </LinearGradient>
                </TouchableOpacity>
            </View>
        </BlurView>
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

    // ── Images + model for the epic opening animation ──────────────────────
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

    useEffect(() => {
        const updateActiveStatus = async (id: string | null) => {
            if (!userId) return;
            try {
                // Using maybeSingle() or catching error to be safe
                await supabase.from('profiles').update({ active_conversation_id: id }).eq('id', userId);
            } catch (e) { /* ignore */ }
        };

        if (capsuleId) {
            updateActiveStatus(capsuleId);
        }

        return () => {
            updateActiveStatus(null);
        };
    }, [capsuleId, userId]);

    const [viewerVisible, setViewerVisible] = useState(false);
    const [initialIndex, setInitialIndex] = useState(0);
    const [activeViewerIndex, setActiveViewerIndex] = useState(0);

    const [filterType, setFilterType] = useState('all');
    const [filterSort, setFilterSort] = useState<'newest' | 'oldest'>('oldest');

    const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
    const [isFollowedOwner, setIsFollowedOwner] = useState(false);
    const [isFollowedCapsule, setIsFollowedCapsule] = useState(false);
    const [followerCount, setFollowerCount] = useState(0);
    const [capsuleFollowerCount, setCapsuleFollowerCount] = useState(0);
    const [showOptions, setShowOptions] = useState(false);
    const [showQRModal, setShowQRModal] = useState(false);
    const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
    const [playingAudio, setPlayingAudio] = useState<string | null>(null);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [scrollEnabled, setScrollEnabled] = useState(true);
    const [showBigHeart, setShowBigHeart] = useState(false);
    const [invitedUsers, setInvitedUsers] = useState<any[]>([]);
    const bigHeartScale = useRef(new Animated.Value(0)).current;
    const bigHeartOpacity = useRef(new Animated.Value(0)).current;

    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const insets = useSafeAreaInsets();

    const isSealed = capsule?.status === 'sealed';
    const [modelImg, setModelImg] = useState<string>(() => (MODEL_IMAGES as any).basicred_kap);
    const sectionListRef = useRef<SectionList>(null);
    useWebDragScroll(sectionListRef);

    const [openDesign, setOpenDesign] = useState<'open' | 'closed'>('open');

    useEffect(() => {
        if (!capsule) return;
        const desc = capsule.description || '';
        if (desc.includes('[STYLE:CLOSED]')) setOpenDesign('closed');
        else setOpenDesign('open');

        const update = () => {
            const currentDesc = capsule.description || '';
            const isClosed = currentDesc.includes('[STYLE:CLOSED]');
            setModelImg(isSealed
                ? (timerConfigManager.getModelImage(capsule.model) || MODEL_IMAGES[capsule.model] || (MODEL_IMAGES as any).basicred_kap)
                : (isClosed 
                    ? (timerConfigManager.getModelImage(capsule.model) || MODEL_IMAGES[capsule.model] || (MODEL_IMAGES as any).basicred_kap)
                    : (timerConfigManager.getModelImageOpen(capsule.model) || MODEL_IMAGES_OPEN[capsule.model] || MODEL_IMAGES[capsule.model] || (MODEL_IMAGES as any).basicred_kap))
            );
        };
        const unsub = timerConfigManager.subscribe(update);
        update();
        return unsub;
    }, [capsule?.model, isSealed, capsule?.description]);

    const handleToggleDesign = async () => {
        if (!capsule) return;
        const newDesign = openDesign === 'open' ? 'closed' : 'open';
        let newDesc = capsule.description || '';
        // Clean existing tags
        newDesc = newDesc.replace(/\[STYLE:OPEN\]|\[STYLE:CLOSED\]/g, '').trim();
        if (newDesign === 'closed') {
            newDesc = (newDesc + ' [STYLE:CLOSED]').trim();
        }
        
        setOpenDesign(newDesign);
        setCapsule({ ...capsule, description: newDesc });
        
        try {
            await supabase.from('capsules').update({ description: newDesc }).eq('id', capsuleId);
        } catch (err) {
            console.error('Error updating design:', err);
        }
    };

    const activeModelTint = capsule ? ((MODEL_TINTS as any)[capsule.model] || '#7C5CBF') : '#7C5CBF';
    const tint = modelTint || activeModelTint;
    const isOwner = !!(userId && capsule?.owner_id && userId === capsule.owner_id);
    const acceptedInvitesCount = invites?.filter(i => i.status === 'accepted').length || 0;
    const isLegacyAccepted = capsule?.invited_user_id && capsule?.invite_status === 'accepted';
    const totalMembers = 1 + acceptedInvitesCount + (isLegacyAccepted ? 1 : 0);
    const isMember = isOwner ||
        invites?.some(i => i.user_id === userId && i.status === 'accepted') ||
        (capsule?.invite_status === 'accepted' && capsule?.invited_user_id === userId);
    const hasRequestedOpen = capsule?.open_requests?.includes(userId || '') || false;
    const reqCount = capsule?.open_requests?.length || 0;
    const isSharedCapsule = capsule?.is_shared === true || totalMembers > 1 || (invites && invites.length > 0);
    // Ensure visibility for public shared capsules regardless of membership
    const showCollaborators = isSharedCapsule;
    const [canBeOpened, setCanBeOpened] = useState(false);
    useEffect(() => {
        const checkReady = () => setCanBeOpened(capsule?.opens_at ? new Date(capsule.opens_at) <= new Date() : true);
        checkReady();
        const t = setInterval(checkReady, 1000);
        return () => clearInterval(t);
    }, [capsule?.opens_at]);

    const opensAt = capsule?.opens_at ? new Date(capsule.opens_at) : null;
    const createdAt = capsule?.created_at ? new Date(capsule.created_at) : null;
    const isBornOpen = !!(opensAt && createdAt && Math.abs(opensAt.getTime() - createdAt.getTime()) < 10000);
    const now_val = new Date();
    const chatStart = opensAt ? new Date(opensAt.getTime() - 86400000) : null;
    const chatEnd = opensAt ? new Date(opensAt.getTime() + 18000000) : null;
    const isChatAvailable = !!(!isBornOpen && chatStart && chatEnd && now_val >= chatStart && now_val <= chatEnd);
    const [isChatView, setIsChatView] = useState(false);

    // Toggle chat view based on availability
    useEffect(() => {
        if (isChatAvailable) setIsChatView(true);
        else setIsChatView(false);
    }, [isChatAvailable]);

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

    useFocusEffect(useCallback(() => {
        const controller = new AbortController();
        const task = InteractionManager.runAfterInteractions(() => {
            loadData(controller.signal);
        });
        return () => {
            task.cancel();
            controller.abort();
        };
    }, [capsuleId]));

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

    const handleEpicComplete = useCallback(async () => {
        setShowEpicOpening(false);
        setCapsule((prev: any) => ({ ...prev, status: 'opened', is_opening: false }));
        try {
            await supabase.from('capsules').update({ status: 'opened', is_opening: false }).eq('id', capsuleId);
            DeviceEventEmitter.emit('CAPSULE_UPDATED', { id: capsuleId, status: 'opened' });
        } catch (err) {
            console.error('Error persisting capsule open status:', err);
        }
    }, [capsuleId]);

    useEffect(() => {
        return () => { if (epicIntervalRef.current) clearInterval(epicIntervalRef.current); };
    }, []);

    useEffect(() => {
        if (!capsuleId) return;

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
            .on('postgres_changes', { event: '*', schema: 'public', table: 'capsule_invites', filter: `capsule_id=eq.${capsuleId}` }, () => loadData())
            .subscribe();

        const likesCh = supabase.channel(`capsule-${capsuleId}-likes`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'likes', filter: `capsule_id=eq.${capsuleId}` }, async () => {
                // Fetch fresh count from DB to be 100% accurate
                const { count } = await supabase.from('likes').select('*', { count: 'exact', head: true }).eq('capsule_id', capsuleId);
                setLikeCount(count || 0);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(capCh);
            supabase.removeChannel(invCh);
            supabase.removeChannel(likesCh);
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

    const loadData = async (signal?: AbortSignal) => {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (signal?.aborted) return;
        const myId = user?.id ?? null;
        setUserId(myId);

        let blocked: string[] = [];
        if (myId) { 
            blocked = await safetyService.getAllSafetyUserIds(myId); 
            setBlockedUserIds(blocked); 
        }
        if (signal?.aborted) return;

        // NEW: Single RPC call replacing 11 requests
        const { data, error } = await (signal
            ? supabase.rpc('get_capsule_detail_unified', { 
                p_capsule_id: capsuleId, 
                p_user_id: myId 
              }).abortSignal(signal)
            : supabase.rpc('get_capsule_detail_unified', { 
                p_capsule_id: capsuleId, 
                p_user_id: myId 
              })
        );

        if (error || !data) {
            if (error?.message?.includes('Abort') || error?.name === 'AbortError') return;
            setLoading(false);
            if (!data && !error) {
                Alert.alert(t('common.error'), t('detail.not_found') || 'Capsule not found or you don\'t have access.');
                if (navigation.canGoBack()) navigation.goBack();
            } else {
                console.warn('RPC Error (handled):', error);
            }
            return;
        }

        if (signal?.aborted) return;

        const { capsule: capsuleData, items: itemsData, likes_count, is_liked, invites: invitesData, owner_followers_count, is_followed_owner, capsule_followers_count } = data;


        if (!capsuleData) {
            setLoading(false);
            return;
        }

        setCapsule(capsuleData);

        const cfg = timerConfigManager.getConfig(capsuleData.model);
        setModelTint(cfg?.themeColor || MODEL_TINTS[capsuleData.model] || '#7C5CBF');

        // Set Followers/Follow status
        setFollowerCount(owner_followers_count || 0);
        setIsFollowedOwner(is_followed_owner);
        setIsFollowedCapsule(!!data.is_followed_capsule);
        setCapsuleFollowerCount(capsule_followers_count || 0);

        // Enrich items with profiles if missing (from owner or collaborators)
        const profileMap: Record<string, any> = {};
        if (capsuleData.profiles) profileMap[capsuleData.owner_id] = capsuleData.profiles;
        if (invitesData) {
            invitesData.forEach((inv: any) => {
                if (inv.status === 'accepted' && inv.profiles) {
                    profileMap[inv.user_id] = inv.profiles;
                }
            });
        }

        // Filter blocked content and attach profiles
        if (invitesData) {
            setInvites(invitesData);
            const accepted = invitesData
                .filter((i: any) => i.status === 'accepted' && i.profiles)
                .map((i: any) => i.profiles);
            setAcceptedMembers(accepted);
        }

        if (itemsData) {
            const enriched = itemsData.map((item: any) => ({
                ...item,
                profiles: item.profiles || profileMap[item.owner_id]
            })).filter((i: any) => !blocked.includes(i.owner_id));
            setItems(enriched);
        }

        setLikeCount(likes_count || 0);
        setIsLiked(is_liked);

        if (invitesData) {
            setInvites(invitesData);
            setAcceptedMembers(invitesData.filter((i: any) => i.status === 'accepted').map((i: any) => i.profiles));
        }

        // Handle epic opening state
        if (capsuleData.is_opening && capsuleData.status !== 'opened' && capsuleData.opening_at) {
            const target = new Date(capsuleData.opening_at).getTime();
            if (target > Date.now()) startEpicOpening(capsuleData.opening_at);
            else setCapsule((p: any) => ({ ...p, status: 'opened', is_opening: false }));
        }

        // Load comments separately (or we could add them to RPC later)
        const { data: commentsData } = await (signal
            ? supabase.from('comments').select(`
                id, capsule_id, user_id, content, created_at,
                profiles:user_id(id, display_name, username, avatar_url, is_verified, favorite_color),
                comment_likes(user_id)
              `).eq('capsule_id', capsuleId).order('created_at', { ascending: false }).limit(50).abortSignal(signal)
            : supabase.from('comments').select(`
                id, capsule_id, user_id, content, created_at,
                profiles:user_id(id, display_name, username, avatar_url, is_verified, favorite_color),
                comment_likes(user_id)
              `).eq('capsule_id', capsuleId).order('created_at', { ascending: false }).limit(50)
        );

        if (commentsData) {
            setComments(commentsData.filter((c: any) => !blocked.includes(c.user_id)).map((c: any) => ({
                ...c,
                myLike: myId ? c.comment_likes?.some((l: any) => l.user_id === myId) : false,
                likeCount: c.comment_likes?.length || 0,
            })));
        }

        setLoading(false);
    };

    const handleFollowToggle = useCallback(async (targetId: string, isFollowed: boolean, setIsFollowed: (v: boolean) => void) => {
        if (!userId || userId === targetId) return;
        const newStatus = !isFollowed;
        setIsFollowed(newStatus);
        if (targetId === capsule?.owner_id) {
            setIsFollowedCapsule(newStatus);
            setFollowerCount(prev => newStatus ? prev + 1 : Math.max(0, prev - 1));
        }
        if (isFollowed) {
            await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', targetId);
        } else {
            await supabase.from('follows').insert({ follower_id: userId, following_id: targetId });
            const { data: existing } = await supabase.from('notifications').select('id').eq('user_id', targetId).eq('sender_id', userId).eq('type', 'follow').maybeSingle();
            if (existing) {
                await supabase.from('notifications').update({ created_at: new Date().toISOString(), is_read: false }).eq('id', existing.id);
            } else {
                await supabase.from('notifications').insert({ user_id: targetId, sender_id: userId, type: 'follow', message: t('common.started_following_you') });
            }
        }
    }, [userId, capsule?.owner_id, t]);

    const handleCapsuleFollowToggle = useCallback(async () => {
        if (!userId || !capsuleId) return;
        
        const wasFollowed = isFollowedCapsule;
        const newStatus = !wasFollowed;
        
        // Optimistic update
        setIsFollowedCapsule(newStatus);
        setCapsuleFollowerCount(prev => newStatus ? prev + 1 : Math.max(0, prev - 1));
        
        try {
            if (wasFollowed) {
                const { error } = await supabase.from('capsule_followers').delete().eq('user_id', userId).eq('capsule_id', capsuleId);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('capsule_followers').insert({ user_id: userId, capsule_id: capsuleId });
                if (error) throw error;
                
                // Optional: Notify owner that someone followed their capsule
                if (capsule?.owner_id && capsule.owner_id !== userId) {
                    try {
                        await supabase.from('notifications').insert({
                            user_id: capsule.owner_id,
                            sender_id: userId,
                            type: 'follow',
                            capsule_id: capsuleId,
                            message: t('detail.followed_your_capsule') || 'followed your capsule'
                        });
                    } catch (e) {}
                }
            }
        } catch (err: any) {
            if (err?.code === '23505') return;
            console.error('Capsule follow toggle error:', err);
            setIsFollowedCapsule(wasFollowed);
            setCapsuleFollowerCount(prev => wasFollowed ? prev + 1 : Math.max(0, prev - 1));
            Alert.alert(t('common.error'), t('detail.follow_error') || 'Could not update follow status.');
        }
    }, [userId, capsuleId, capsule?.owner_id, isFollowedCapsule, t]);

    const handleSetCover = async (mediaUrl: string) => {
        if (!capsule) return;
        try {
            const { error } = await supabase.from('capsules').update({ cover_url: mediaUrl }).eq('id', capsuleId);
            if (error) throw error;
            setCapsule((p: any) => ({ ...p, cover_url: mediaUrl }));
            DeviceEventEmitter.emit('CAPSULE_UPDATED', { id: capsuleId, cover_url: mediaUrl });
            Alert.alert(t('common.ready') || '¡Listo!', t('profile.cover_updated') || 'La portada de tu cápsula ha sido actualizada.');
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

    const handleSearchUsers = async (q: string) => {
        setSearchQuery(q);
        if (q.length < 2) { setSearchResults([]); return; }
        setIsSearching(true);
        try {
            const { data } = await supabase.from('profiles').select('id, username, display_name, avatar_url, favorite_color')
                .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`).limit(10);
            
            const filtered = (data || []).filter(u => 
                u.id !== userId && 
                !acceptedMembers.some(m => m.id === u.id) &&
                !invites.some(i => i.user_id === u.id) &&
                !invitedUsers.some(iu => iu.id === u.id)
            );
            setSearchResults(filtered);
        } catch (err) { console.error('Search error:', err); }
        finally { setIsSearching(false); }
    };

    const toggleInviteUser = (u: any) => {
        if (invitedUsers.some(iu => iu.id === u.id)) {
            setInvitedUsers(prev => prev.filter(iu => iu.id !== u.id));
        } else {
            setInvitedUsers(prev => [...prev, u]);
            setSearchQuery('');
            setSearchResults([]);
        }
    };

    const handleSendInvitations = async () => {
        if (!invitedUsers.length || !userId) return;
        setLoading(true);
        setShowInviteModal(false);
        try {
            const invitesToInsert = invitedUsers.map(u => ({
                capsule_id: capsuleId,
                user_id: u.id,
                status: 'pending'
            }));

            const { error } = await supabase.from('capsule_invites').insert(invitesToInsert);
            if (error) throw error;

            for (const u of invitedUsers) {
                await supabase.from('notifications').insert({
                    user_id: u.id,
                    sender_id: userId,
                    type: 'capsule_invite',
                    capsule_id: capsuleId,
                    message: t('detail.invited_you_to_capsule') || 'Invited you to a capsule'
                });
                try {
                    sendPushNotification(u.id, t('notifications.new_invite') || 'New Invitation!', `@${capsule.owner_profile?.username || 'Someone'} invited you to join a capsule.`, { screen: 'CapsuleDetail', params: { capsuleId } });
                } catch (e) {}
            }

            setInvitedUsers([]);
            Alert.alert(t('common.success'), t('detail.invites_sent') || 'Invitations sent successfully!');
            loadData();
        } catch (err: any) {
            console.error('Invite error:', err);
            Alert.alert(t('common.error'), err.message || t('detail.invite_error'));
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteCapsule = () => {
        const exec = async () => {
            setShowOptions(false); setLoading(true);
            try {
                if (capsule?.is_shared) {
                    const { data, error } = await supabase.rpc('vote_delete_capsule', { p_capsule_id: capsuleId });
                    if (error) throw error;
                    
                    if (data?.status === 'deleted') {
                        navigation.goBack();
                    } else if (data?.status === 'voted' || data?.status === 'already_voted') {
                        setCapsule((prev: any) => ({ ...prev, delete_requests: data.delete_requests }));
                        Alert.alert('Kapsely', t('detail.delete_vote_registered') || 'Tu voto para eliminar la cápsula ha sido registrado.');
                    }
                } else {
                    const { data: toDelete } = await supabase.from('capsule_items').select('media_url, thumbnail_url').eq('capsule_id', capsuleId);
                    if (toDelete?.length) {
                        const base = 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/capsule-media/';
                        const files = toDelete.flatMap(i => [i.media_url, i.thumbnail_url].filter(u => u?.startsWith(base)).map(u => u!.replace(base, '').split('?')[0]));
                        if (files.length) await supabase.storage.from('capsule-media').remove(files);
                    }
                    const { error } = await supabase.rpc('delete_capsule', { p_capsule_id: capsuleId });
                    if (!error) navigation.goBack(); else throw error;
                }
            } catch (err) { 
                console.error(err);
                Alert.alert(t('common.error'), t('detail.delete_error')); 
            }
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
        const optionsTitle = t('common.options');
        const setCoverText = t('profile.setAsCover');
        const reportText = t('common.report');
        const cancelText = t('common.cancel');
        Alert.alert(optionsTitle, '', [
            { text: setCoverText, onPress: () => handleSetCover(item.media_url) },
            { text: reportText, onPress: () => handleReportItem(item.id) },
            { text: cancelText, style: 'cancel' },
        ]);
    };

    const handleRequestOpen = useCallback(async () => {
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
    }, [userId, capsule, capsuleId, startEpicOpening, invites, t]);

    const triggerBigHeart = () => {
        setShowBigHeart(true);
        bigHeartScale.setValue(0);
        bigHeartOpacity.setValue(0);

        Animated.parallel([
            Animated.spring(bigHeartScale, {
                toValue: 1,
                friction: 3,
                tension: 40,
                useNativeDriver: true,
            }),
            Animated.sequence([
                Animated.timing(bigHeartOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
                Animated.timing(bigHeartOpacity, { toValue: 0, duration: 500, delay: 600, useNativeDriver: true }),
            ]),
        ]).start(() => setShowBigHeart(false));
    };

    const handleLike = async () => {
        if (!userId) return;
        
        const wasLiked = isLiked;
        const previousCount = likeCount;

        // UI Optimista
        setIsLiked(!wasLiked);
        setLikeCount(prev => wasLiked ? prev - 1 : prev + 1);
        
        if (!wasLiked) {
            triggerBigHeart();
            if (Platform.OS !== 'web') Vibration.vibrate(15);
        }

        // Emitir evento para actualizar el Feed de forma instantánea
        DeviceEventEmitter.emit('CAPSULE_UPDATED', { 
            id: capsuleId, 
            is_liked: !wasLiked, 
            likes_count: wasLiked ? Math.max(0, (likeCount || 1) - 1) : (likeCount || 0) + 1 
        });

        try {
            if (wasLiked) {
                const { error } = await supabase.from('likes').delete().eq('capsule_id', capsuleId).eq('user_id', userId);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('likes').insert({ capsule_id: capsuleId, user_id: userId });
                
                // Si ya estaba likeado en la DB, sincronizamos el estado y no lanzamos error
                if (error) {
                    if (error.code === '23505') {
                        setIsLiked(true);
                        // No sumamos doble, la UI ya sumó una vez optimísticamente
                        return;
                    }
                    throw error;
                }
                
                if (capsule.owner_id !== userId) {
                    const { data: existing } = await supabase.from('notifications')
                        .select('id').eq('user_id', capsule.owner_id)
                        .eq('sender_id', userId).eq('type', 'like')
                        .eq('capsule_id', capsuleId).maybeSingle();
                    
                    if (existing) {
                        await supabase.from('notifications').update({ created_at: new Date().toISOString(), is_read: false }).eq('id', existing.id);
                    } else {
                        await supabase.from('notifications').insert({ user_id: capsule.owner_id, sender_id: userId, type: 'like', capsule_id: capsuleId, message: t('detail.liked_your_capsule') });
                        try { sendPushNotification(capsule.owner_id, '❤️ Nuevo Me Gusta!', 'A alguien le ha gustado tu cápsula.', { screen: 'CapsuleDetail', params: { capsuleId } }); } catch { }
                    }
                }
            }
        } catch (err) {
            // Revertir si falla
            setIsLiked(wasLiked);
            setLikeCount(previousCount);
            console.error('Like error:', err);
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

    const handleReportComment = (cid: string) => {
        if (!userId) return;
        Alert.alert(t('detail.report_comment'), t('detail.report_reason'), [
            { text: t('detail.report_types.inappropriate'), onPress: () => submitReport(cid, 'comment', 'inappropriate') },
            { text: t('detail.report_types.spam'), onPress: () => submitReport(cid, 'comment', 'spam') },
            { text: t('detail.report_types.harassment'), onPress: () => submitReport(cid, 'comment', 'harassment') },
            { text: t('common.cancel'), style: 'cancel' },
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

    const scrollToChat = useCallback(() => {
        sectionListRef.current?.scrollToLocation({
            sectionIndex: 1, // 'chat' section
            itemIndex: 0,
            animated: true,
            viewOffset: 100
        });
    }, []);

    const renderItem = useCallback(({ item }: any) => {
        if (item === 'content') {
            return (
                <View style={ds.contentSection}>
                    <View style={ds.sectionHeader}>
                        <View style={[ds.sectionHeaderBar, { backgroundColor: tint }]} />
                        <Text style={ds.sectionTitle}>{t('detail.contents')}</Text>
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
                                                    disabled={!(isMember && (isBornOpen || (isSealed && !canBeOpened && !isOpening)))}
                                                    onPress={() => {
                                                        if (!isSealed && !isBornOpen) return;
                                                        navigation.navigate('CreateSelection', { capsuleId: capsule.id });
                                                    }}
                                                >
                                                    {isMember && (isBornOpen || (isSealed && !canBeOpened && !isOpening)) ? (
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
                                                                <Ionicons name="reader-outline" size={((width - 44) / 2.4) * 0.5} color="#000" />
                                                            </View>
                                                            <View style={[ds.noteTape, { top: 4, transform: [{ rotate: '-6deg' }], width: '40%', opacity: 0.3 }]} />
                                                        </View>
                                                    ) : (pi.media_url || pi.thumbnail_url) && (pi.media_type === 'image' || pi.media_type === 'video') && (
                                                        <Image
                                                            source={{ uri: pi.thumbnail_url || pi.media_url }}
                                                            style={StyleSheet.absoluteFill}
                                                            blurRadius={Platform.OS === 'ios' ? 12 : 4}
                                                            cachePolicy="memory-disk"
                                                        />
                                                    )}
                                                    {Platform.OS === 'ios' ? (
                                                        (pi.media_type === 'image' || pi.media_type === 'video') && (
                                                            <BlurView intensity={32} tint="extraLight" style={StyleSheet.absoluteFill} />
                                                        )
                                                    ) : (
                                                        (pi.media_type === 'image' || pi.media_type === 'video') && (
                                                            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.7)' }]} />
                                                        )
                                                    )}
                                                    {(pi.media_type === 'image' || pi.media_type === 'video') && (
                                                        <View style={[ds.cellTypeTag, { backgroundColor: tint + '18', borderColor: tint + '30' }]}>
                                                            <Ionicons name={pi.media_type === 'video' ? 'videocam' : 'image'} size={11} color={tint} />
                                                        </View>
                                                    )}
                                                    {pi.profiles && isSharedCapsule && (
                                                        <Image 
                                                            source={{ uri: Colors.getAvatarUrl(pi.profiles.avatar_url, pi.profiles.display_name || pi.profiles.username) }} 
                                                            style={[ds.itemAuthorOverlay as any, { borderColor: tint + '40' }]} 
                                                            recyclingKey={`item-avatar-${pi.profiles.id}`}
                                                        />
                                                    )}
                                                    <Ionicons name="lock-closed" size={20} color={tint + '50'} />
                                                    <View style={ds.itemDateTag}>
                                                        <Text style={ds.itemDateText}>{new Date(pi.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })}</Text>
                                                    </View>
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
                                                                <Text style={ds.audioPreviewLabel}>{playingAudio === pi.media_url ? t('detail.playing') : ''}</Text>
                                                                <Ionicons name="pulse" size={14} color="#fff" />
                                                            </View>
                                                        </LinearGradient>
                                                    ) : pi.media_type === 'note' ? (
                                                        <View style={ds.notePreview}>
                                                            <View style={ds.noteTape} />
                                                            <View style={ds.notePreviewIcon}>
                                                                <Ionicons name="create-outline" size={16} color="#B49D4F" />
                                                            </View>
                                                            <Text style={ds.notePreviewText} numberOfLines={4}>{pi.content}</Text>
                                                        </View>
                                                    ) : (
                                                        <Image source={{ uri: pi.thumbnail_url || pi.media_url }} style={ds.cellWrap as any} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                                                    )}
                                                    {pi.media_type === 'video' && (
                                                        <View style={ds.playBadge}><Ionicons name="play" size={10} color="#fff" /></View>
                                                    )}
                                                    <View style={ds.itemDateTag}>
                                                        <Text style={ds.itemDateText}>{new Date(pi.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })}</Text>
                                                    </View>
                                                    {pi.profiles && isSharedCapsule && (
                                                        <Image 
                                                            source={{ uri: Colors.getAvatarUrl(pi.profiles.avatar_url, pi.profiles.display_name || pi.profiles.username, pi.profiles.favorite_color) }} 
                                                            style={[ds.itemAuthorOverlay as any, { borderColor: '#fff' }]} 
                                                            recyclingKey={`item-avatar-v-${pi.profiles.id}`}
                                                        />
                                                    )}
                                                    {pi.location_name && (
                                                        <View style={{ position: 'absolute', bottom: 6, right: 6 }}>
                                                            <AestheticLocation name={pi.location_name} compact dark />
                                                        </View>
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

        if (item === 'chat' && isChatAvailable && isChatView) {
            return (
                <LiveChat
                    ref={liveChatRef}
                    capsuleId={capsuleId}
                    tint={tint}
                    hideInput
                    isOwner={isOwner}
                    isNested
                    onInteractionStart={() => setScrollEnabled(false)}
                    onInteractionEnd={() => setScrollEnabled(true)}
                />
            );
        }

        if (item === 'social_header') {
            return (
                <View style={ds.socialSection}>
                    <View style={ds.sectionHeader}>
                        <View style={[ds.sectionHeaderBar, { backgroundColor: tint }]} />
                        <Text style={ds.sectionTitle}>{t('detail.reactions')}</Text>
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
                </View>
            );
        }

        if (typeof item === 'object' && item.id) {
            const c = item;
            return (
                <TouchableOpacity 
                    activeOpacity={0.8}
                    onLongPress={() => handleReportComment(c.id)}
                    style={{ paddingHorizontal: 22 }}
                >
                    <BlurView intensity={25} tint="extraLight" style={[ds.commentCard, { borderColor: highlightedCommentId === c.id ? tint + '60' : D.border, marginBottom: 10 }, highlightedCommentId === c.id && { borderLeftWidth: 3, borderLeftColor: tint }]}>
                        <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { targetUserId: c.user_id })}>
                            <Image 
                                source={{ uri: Colors.getAvatarUrl(c.profiles?.avatar_url, c.profiles?.display_name || c.profiles?.username, c.profiles?.favorite_color) }} 
                                style={[ds.commentAvatar as any, { borderColor: D.border }]} 
                                cachePolicy="memory-disk" 
                                contentFit="cover" 
                                recyclingKey={`comment-avatar-${c.profiles?.id}`}
                            />
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
                </TouchableOpacity>
            );
        }
        return null;
    }, [tint, t, filteredData, isChatAvailable, isChatView, isOwner, userId, comments, highlightedCommentId, playingAudio, isMember, isBornOpen, isSealed, canBeOpened, isOpening, totalMembers, isLiked, likeCount]);

    const FilterBar = useCallback(() => {
        const filterScrollRef = useRef<ScrollView>(null);
        useWebDragScroll(filterScrollRef);
        return (
            <ScrollView ref={filterScrollRef} horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ paddingRight: 20, gap: 8 }}>
                {(['all', 'image', 'video', 'note', 'audio'] as const).map(type => {
                    const icons = { all: 'apps-outline', image: 'image-outline', video: 'videocam-outline', note: 'reader-outline', audio: 'mic-outline' } as const;
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
                    <Text style={[ds.filterChipText, { color: D.textMuted }]}>{filterSort === 'newest' ? t('detail.newest') : t('detail.oldest')}</Text>
                </TouchableOpacity>
            </ScrollView>
        );
    }, [filterType, filterSort, tint, t]);

    const renderHero = useCallback(() => (
        <View>
            <CapsuleHero
                capsule={capsule} tint={tint} isMember={isMember}
                isSealed={isSealed} isOpening={isOpening} modelImg={modelImg}
                totalMembers={totalMembers} likeCount={likeCount} followerCount={capsuleFollowerCount}
                isFollowedCapsule={isFollowedCapsule} handleCapsuleFollowToggle={handleCapsuleFollowToggle}
                isOwner={isOwner} canBeOpened={canBeOpened} hasRequestedOpen={hasRequestedOpen}
                handleRequestOpen={handleRequestOpen} reqCount={reqCount} isBornOpen={isBornOpen} userId={userId}
                setCapsule={setCapsule} t={t}
                onAddContent={() => navigation.navigate('CreateSelection', { capsuleId: capsule.id })}
                collaborators={showCollaborators ? (
                    <CollaboratorsBar 
                        owner={capsule.profiles} 
                        members={acceptedMembers} 
                        invites={invites}
                        tint={tint} 
                        isMember={isMember}
                        onInvite={() => setShowInviteModal(true)}
                        t={t}
                    />
                ) : null}
            />
            {isSharedCapsule && capsule?.delete_requests?.length > 0 && (
                <View style={[ds.countdownCard, { borderColor: '#F8717130', backgroundColor: '#F8717110', alignSelf: 'center', marginTop: 10 }]}>
                    <View style={[ds.countdownIconWrap, { backgroundColor: '#F8717120' }]}>
                        <Ionicons name="trash" size={22} color="#F87171" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[ds.countdownLabel, { color: '#F87171' }]}>
                            {t('detail.voting_to_delete') || 'Voting to Delete'}: {capsule.delete_requests.length}/{totalMembers}
                        </Text>
                        {!capsule.delete_requests.includes(userId) && (
                            <TouchableOpacity onPress={handleDeleteCapsule}>
                                <Text style={{ fontSize: 13, fontFamily: Fonts.bold, color: '#F87171' }}>{t('detail.agree_to_delete') || 'Agree to Delete'}</Text>
                            </TouchableOpacity>
                        )}
                        {capsule.delete_requests.includes(userId) && (
                            <Text style={{ fontSize: 12, fontFamily: Fonts.medium, color: '#F87171', opacity: 0.8 }}>{t('detail.you_voted_to_delete') || 'You voted to delete'}</Text>
                        )}
                    </View>
                </View>
            )}
        </View>
    ), [
        capsule, tint, isMember, isSealed, isOpening, modelImg,
        totalMembers, likeCount, followerCount, isFollowedCapsule,
        handleCapsuleFollowToggle, isOwner, canBeOpened, hasRequestedOpen,
        handleRequestOpen, reqCount, isBornOpen, userId, t, acceptedMembers, invites
    ]);

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
                {totalMembers <= 1 ? (
                    <TouchableOpacity style={ds.headerCenter} activeOpacity={0.78} onPress={() => navigation.navigate('UserProfile', { targetUserId: capsule.owner_id })}>
                        <Image 
                            source={{ uri: Colors.getAvatarUrl(capsule.profiles?.avatar_url, capsule.profiles?.display_name || capsule.profiles?.username, capsule.profiles?.favorite_color) }} 
                            style={[ds.headerAvatar as any, { borderColor: tint + '40' }]} 
                            cachePolicy="memory-disk" 
                            contentFit="cover" 
                            transition={200} 
                            recyclingKey={`header-avatar-${capsule.profiles?.id}`}
                        />
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
                ) : (
                    <View style={ds.headerCenter} />
                )}
                <TouchableOpacity style={ds.headerOptionsBtn} activeOpacity={0.65} onPress={() => setShowOptions(true)}>
                    <Ionicons name="ellipsis-horizontal" size={17} color={D.textSec} />
                </TouchableOpacity>
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={0}>
                <SectionList
                    ref={sectionListRef}
                    sections={[
                        { title: 'content', data: ['content'] },
                        { title: 'chat', data: (isChatAvailable && isChatView) ? ['chat'] : [] },
                        { title: 'social_header', data: ['social_header'] },
                        { title: 'comments', data: comments },
                    ]}
                    nestedScrollEnabled
                    scrollEnabled={scrollEnabled}
                    keyExtractor={(item, i) => (typeof item === 'string' ? item : item.id) + i}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={[ds.scrollContent, { paddingTop: 72 + insets.top, paddingBottom: 20 }]}
                    keyboardShouldPersistTaps="handled"
                    stickySectionHeadersEnabled={false}
                    renderSectionHeader={() => null}
                    ListHeaderComponent={renderHero}
                    renderItem={renderItem}
                    extraData={{ likeCount, isLiked, comments, tint, playingAudio }}
                />

                {!showEpicOpening && (
                    <InteractionBar
                        showChat={isChatView}
                        setShowChat={setIsChatView}
                        isChatAvailable={isChatAvailable}
                        comment={comment}
                        setComment={setComment}
                        tint={tint}
                        handleSendComment={handleSendComment}
                        liveChatRef={liveChatRef}
                        scrollToChat={scrollToChat}
                        localEmojiTriggerRef={localEmojiTriggerRef}
                    />
                )}
            </KeyboardAvoidingView>

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
                            ...(!isSealed && (isOwner || totalMembers > 1) ? [{ 
                                icon: openDesign === 'open' ? 'cube-outline' : 'cube', 
                                color: tint, 
                                label: t('detail.capsule_design') + ': ' + (openDesign === 'open' ? t('detail.opened') : t('detail.sealed')), 
                                onPress: () => { setShowOptions(false); handleToggleDesign(); } 
                            }] : []),
                            ...(isMember && isSharedCapsule ? [{ 
                                icon: 'person-add-outline', 
                                color: tint, 
                                label: t('detail.invite_members') || 'Invite members', 
                                onPress: () => { setShowOptions(false); setShowInviteModal(true); } 
                            }] : []),
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

            {/* Invite Modal */}
            <Modal visible={showInviteModal} transparent animationType="slide">
                <View style={ds.overlay}>
                    <BlurView intensity={90} tint="light" style={[ds.optionsSheet, { height: '80%', paddingBottom: 20 }]}>
                        <View style={ds.sheetHandle} />
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 }}>
                            <Text style={ds.sheetTitle}>{t('detail.invite_members')}</Text>
                            <TouchableOpacity onPress={() => { setShowInviteModal(false); setSearchQuery(''); setSearchResults([]); }}>
                                <Ionicons name="close-circle" size={24} color={D.textMuted} />
                            </TouchableOpacity>
                        </View>

                        <View style={ds.searchContainer}>
                            {invitedUsers.length > 0 && (
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 }}>
                                    {invitedUsers.map(u => (
                                        <View key={u.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: tint + '14', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: tint + '40' }}>
                                            <Text style={{ fontSize: 12, fontFamily: Fonts.bold, color: tint }}>@{u.username}</Text>
                                            <TouchableOpacity onPress={() => toggleInviteUser(u)}>
                                                <Ionicons name="close-circle" size={14} color={tint} />
                                            </TouchableOpacity>
                                        </View>
                                    ))}
                                </View>
                            )}
                            <View style={ds.searchInputWrapper}>
                                <Ionicons name="search" size={18} color={tint} style={{ opacity: 0.6 }} />
                                <TextInput 
                                    style={ds.modernSearchInput}
                                    placeholder={t('common.search_users') || "Search users..."}
                                    placeholderTextColor={D.textMuted}
                                    value={searchQuery}
                                    onChangeText={handleSearchUsers}
                                    autoFocus
                                    autoCorrect={false}
                                    autoCapitalize="none"
                                    spellCheck={false}
                                />
                                {isSearching && <ActivityIndicator size="small" color={tint} />}
                                {searchQuery.length > 0 && !isSearching && (
                                    <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); }}>
                                        <Ionicons name="close-circle" size={18} color={D.textMuted} />
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>

                        <FlatList 
                            data={searchResults}
                            keyExtractor={i => i.id}
                            showsVerticalScrollIndicator={false}
                            keyboardDismissMode="on-drag"
                            contentContainerStyle={{ paddingBottom: 20 }}
                            renderItem={({ item: u }) => {
                                const isRejected = invites?.some(i => i.user_id === u.id && i.status === 'rejected');
                                const isPending = invites?.some(i => i.user_id === u.id && i.status === 'pending');
                                const isAccepted = invites?.some(i => i.user_id === u.id && i.status === 'accepted');
                                const isMember = capsule?.owner_id === u.id || isAccepted;
                                
                                const statusText = isRejected ? (t('common.rejected') || 'Rechazado') 
                                                : isMember ? (t('common.member') || 'Miembro')
                                                : isPending ? (t('common.pending') || 'Pendiente')
                                                : null;

                                return (
                                <TouchableOpacity 
                                    style={[ds.modernUserCard, { opacity: statusText ? 0.6 : 1 }]} 
                                    activeOpacity={0.7} 
                                    onPress={() => { if (!statusText) toggleInviteUser(u); }}
                                >
                                    <View style={ds.modernUserAvatarWrap}>
                                        <Image 
                                            source={{ uri: Colors.getAvatarUrl(u.avatar_url, u.display_name || u.username, u.favorite_color) }} 
                                            style={ds.modernUserAvatar as any} 
                                            recyclingKey={`search-user-${u.id}`}
                                        />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={ds.modernUserName} numberOfLines={1}>{u.display_name || u.username}</Text>
                                        <Text style={ds.modernUserTag} numberOfLines={1}>@{u.username}</Text>
                                    </View>
                                    {statusText ? (
                                        <View style={[ds.modernInviteBtn, { backgroundColor: isRejected ? '#EF444415' : D.surface, borderWidth: 1, borderColor: isRejected ? '#EF444430' : D.border, paddingHorizontal: 8, width: 'auto' }]}>
                                            <Text style={{ fontSize: 10, fontFamily: Fonts.bold, color: isRejected ? '#EF4444' : D.textSec, textTransform: 'uppercase' }}>{statusText}</Text>
                                        </View>
                                    ) : (
                                        <View style={[ds.modernInviteBtn, { backgroundColor: tint + '15', borderWidth: 1, borderColor: tint + '30' }]}>
                                            <Ionicons name="add" size={16} color={tint} />
                                        </View>
                                    )}
                                </TouchableOpacity>
                                )
                            }}
                            ListEmptyComponent={() => (
                                <View style={{ alignItems: 'center', marginTop: 40 }}>
                                    {searchQuery.length < 2 && invitedUsers.length === 0 ? (
                                        <Text style={{ color: D.textMuted, textAlign: 'center' }}>{t('detail.search_hint') || "Type at least 2 characters to search"}</Text>
                                    ) : !isSearching && searchQuery.length >= 2 && searchResults.length === 0 ? (
                                        <Text style={{ color: D.textMuted }}>{t('common.no_results')}</Text>
                                    ) : null}
                                </View>
                            )}
                        />

                        {invitedUsers.length > 0 && (
                            <TouchableOpacity onPress={handleSendInvitations} style={{ marginTop: 10 }}>
                                <LinearGradient colors={[tint, tint + 'CC']} style={{ paddingVertical: 14, borderRadius: 18, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                                    <Ionicons name="send" size={16} color="#fff" />
                                    <Text style={{ color: '#fff', fontSize: 16, fontFamily: Fonts.bold }}>
                                        {t('detail.send_invites') || 'Send Invitations'} ({invitedUsers.length})
                                    </Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        )}
                    </BlurView>
                </View>
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
                                {vi.profiles && isSharedCapsule && (
                                    <Image 
                                        source={{ uri: Colors.getAvatarUrl(vi.profiles.avatar_url, vi.profiles.display_name || vi.profiles.username, vi.profiles.favorite_color) }} 
                                        style={[ds.itemAuthorOverlay as any, { top: insets.top + 50, left: 20, width: 32, height: 32, borderRadius: 16, borderColor: '#fff', borderWidth: 2 }]} 
                                        recyclingKey={`viewer-avatar-${vi.profiles.id}`}
                                    />
                                )}
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
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 4, gap: 10, opacity: 0.9 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                            <Ionicons name="calendar-outline" size={10} color="#fff" />
                                            <Text style={[ds.viewerCaptionText, { fontSize: 10, fontFamily: Fonts.bold }]}>{formatDetailedDate(vi.created_at)}</Text>
                                        </View>
                                        {vi.location_name && (
                                            <AestheticLocation name={vi.location_name} compact dark />
                                        )}
                                    </View>
                                </View>
                            </View>
                        )}
                    />
                </View>
            </Modal>

            {/* ══════════════════════════════════════════════════════════
                EPIC OPENING — covers everything, blocks all interaction.
                Now passes epicImageUrls (flashback photos) and modelImg
                (open capsule design) to the cinematic animation.
            ══════════════════════════════════════════════════════════ */}
            {showEpicOpening && (
                <View style={[StyleSheet.absoluteFill, { zIndex: 9999 }]} pointerEvents="box-only">
                    <EpicOpening
                        tint={tint}
                        capsuleTitle={capsule?.title || ''}
                        countdown={10}
                        onComplete={handleEpicComplete}
                        epicImageUrls={epicImageUrls}
                        modelKey={capsule?.model || 'basicred_kap'}
                        modelImg={timerConfigManager.getModelImageOpen(capsule?.model) || (MODEL_IMAGES_OPEN as any).basicred_kap}
                        closedModelImg={timerConfigManager.getModelImage(capsule?.model) || (MODEL_IMAGES as any).basicred_kap}
                    />
                </View>
            )}
            {/* Big Heart Animation Overlay */}
            {showBigHeart && (
                <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', zIndex: 2000 }]} pointerEvents="none">
                    <Animated.View style={{
                        transform: [{ scale: bigHeartScale }],
                        opacity: bigHeartOpacity,
                    }}>
                        <Ionicons name="heart" size={120} color="#F43F5E" />
                    </Animated.View>
                </View>
            )}
        </View>
    );
}

export default CapsuleDetailScreen;