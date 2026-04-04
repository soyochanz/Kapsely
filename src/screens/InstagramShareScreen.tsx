import React, { useRef, useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Image,
    Dimensions, Platform, ScrollView, Alert, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import QRCode from 'react-native-qrcode-svg';
import { Colors, Fonts, Spacing, Shadow } from '../theme';
import CapsuleWithTimer from '../components/CapsuleWithTimer';
import { useTranslation } from 'react-i18next';
import { MODEL_IMAGES, MODEL_IMAGES_OPEN } from '../constants/models';
import { timerConfigManager } from '../utils/timerConfig';
import { supabase } from '../lib/supabase';
import { BlurView } from 'expo-blur';

const { width } = Dimensions.get('window');
const CANVAS_WIDTH = 300;
const CANVAS_HEIGHT = CANVAS_WIDTH * (16 / 9);

// ── Dot grid decoration ───────────────────────────────────────────────────────
const DotGrid = ({ rows = 5, cols = 8, opacity = 0.12 }: { rows?: number; cols?: number; opacity?: number }) => (
    <View style={{ flexDirection: 'column', gap: 10, opacity }}>
        {Array.from({ length: rows }).map((_, r) => (
            <View key={r} style={{ flexDirection: 'row', gap: 10 }}>
                {Array.from({ length: cols }).map((_, c) => (
                    <View key={c} style={{ width: 2.5, height: 2.5, borderRadius: 1.5, backgroundColor: '#fff' }} />
                ))}
            </View>
        ))}
    </View>
);

export default function InstagramShareScreen() {
    const navigation = useNavigation();
    const route = useRoute<any>();
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const viewShotRef = useRef<ViewShot>(null);
    const [saving, setSaving] = useState(false);
    const [sharing, setSharing] = useState(false);
    const { capsule } = route.params || {};
    const [previewImages, setPreviewImages] = useState<string[]>([]);

    React.useEffect(() => {
        if (!capsule?.id) return;
        const fetchPreviewImages = async () => {
            try {
                if (capsule?.items) {
                    const initial = (capsule.items as any[])
                        .filter(i => i.media_url && (i.media_type === 'image' || i.media_url.match(/\.(jpg|jpeg|png|webp|gif)/i)))
                        .map(i => i.media_url).slice(0, 4);
                    if (initial.length > 0) { setPreviewImages(initial); return; }
                }
                const { data } = await supabase
                    .from('capsule_items')
                    .select('media_url, media_type')
                    .eq('capsule_id', capsule.id)
                    .limit(10);
                if (data && data.length > 0) {
                    setPreviewImages(data
                        .filter(i => i.media_url && (i.media_type === 'image' || i.media_url.match(/\.(jpg|jpeg|png|webp|gif)/i)))
                        .map(i => i.media_url).slice(0, 4));
                }
            } catch (err) { }
        };
        fetchPreviewImages();
    }, [capsule?.id]);

    if (!capsule) {
        return (
            <View style={s.container}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: insets.top + 20, marginLeft: 20 }}>
                    <Ionicons name="close" size={32} color={Colors.textPrimary} />
                </TouchableOpacity>
                <Text style={{ textAlign: 'center', marginTop: 50 }}>{t('detail.share.not_found')}</Text>
            </View>
        );
    }

    const qrUrl = `https://kapsely.com/capsules/${capsule.id}`;
    const capsuleOpensAt = capsule.opens_at || capsule.target_date || new Date().toISOString();
    const isSealed = capsule.status === 'sealed';

    let openingDateText = '';
    if (isSealed) {
        const d = new Date(capsuleOpensAt);
        const day = d.getDate().toString().padStart(2, '0');
        const month = d.toLocaleString('default', { month: 'short' }).toUpperCase();
        const year = d.getFullYear();
        openingDateText = `${day} ${month} ${year}`;
    }

    const daysUntil = isSealed
        ? Math.max(0, Math.ceil((new Date(capsuleOpensAt).getTime() - Date.now()) / 86400000))
        : 0;

    const modelImg = isSealed
        ? timerConfigManager.getModelImage(capsule.model) || (MODEL_IMAGES as any)[capsule.model]
        : (MODEL_IMAGES_OPEN as any)[capsule.model] || (MODEL_IMAGES as any)[capsule.model];

    const captureImage = async () => {
        try {
            if (viewShotRef.current?.capture) return await viewShotRef.current.capture();
            return null;
        } catch (error) {
            Alert.alert(t('common.error'), 'No se pudo generar la imagen.');
            return null;
        }
    };

    const handleSave = async () => {
        setSaving(true);
        const perm = await MediaLibrary.requestPermissionsAsync();
        if (perm.status === 'granted') {
            const uri = await captureImage();
            if (uri) {
                try {
                    await MediaLibrary.saveToLibraryAsync(uri);
                    Alert.alert(t('detail.share.image_saved'), t('detail.share.image_saved_desc'));
                } catch { Alert.alert(t('common.error'), t('detail.share.save_failed')); }
            }
        } else {
            Alert.alert(t('detail.share.permission_denied'), t('detail.share.permission_hint'));
        }
        setSaving(false);
    };

    const handleShare = async () => {
        setSharing(true);
        try {
            const uri = await captureImage();
            if (uri) {
                const isAvailable = await Sharing.isAvailableAsync();
                if (isAvailable) {
                    await Sharing.shareAsync(uri, { dialogTitle: t('detail.share.share'), mimeType: 'image/jpeg', UTI: 'public.jpeg' });
                } else {
                    Alert.alert(t('common.error'), t('detail.share.device_error'));
                }
            }
        } catch { }
        setSharing(false);
    };

    return (
        <View style={s.container}>
            {/* ── Header ── */}
            <View style={[s.header, { paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 44 : 20) }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                    <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
                </TouchableOpacity>
                <Text style={s.headerTitle}>{t('detail.share.instagram_story')}</Text>
                <View style={{ width: 44 }} />
            </View>

            <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

                {/* ── Story Canvas ── */}
                <ViewShot
                    ref={viewShotRef}
                    options={{ format: 'jpg', quality: 1.0 }}
                    style={s.canvas}
                >
                    {/* Deep dark background */}
                    <LinearGradient
                        colors={['#09090f', '#111122', '#0d0d1a']}
                        style={StyleSheet.absoluteFill}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                    />

                    {/* Accent glow — top left */}
                    <View style={s.glowTopLeft} />
                    {/* Accent glow — bottom right */}
                    <View style={s.glowBottomRight} />

                    {/* Dot grid — top right decoration */}
                    <View style={{ position: 'absolute', top: 18, right: 14 }}>
                        <DotGrid rows={4} cols={6} opacity={0.10} />
                    </View>
                    {/* Dot grid — bottom left */}
                    <View style={{ position: 'absolute', bottom: 54, left: 14 }}>
                        <DotGrid rows={3} cols={5} opacity={0.08} />
                    </View>

                    {/* ── Top bar: branding ── */}
                    <View style={s.topBar}>
                        <Image
                            source={{ uri: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/website/Logomain.png' }}
                            style={s.logoImg}
                            resizeMode="contain"
                        />
                        <Text style={s.appName}>kapsely</Text>
                        <View style={s.topBarDivider} />
                        <Text style={s.topBarType}>
                            {capsule.type === 'instacap' ? 'INSTACAP' : capsule.type === 'eventcap' ? 'EVENTCAP' : 'LEGACYCAP'}
                        </Text>
                    </View>

                    {/* ── Capsule hero ── */}
                    <View style={s.capsuleHero}>
                        {/* Radial glow behind capsule */}
                        <View style={s.capsuleGlow} />
                        <CapsuleWithTimer
                            modelKey={capsule.model}
                            source={modelImg ? { uri: modelImg } : undefined}
                            date={capsuleOpensAt}
                            chainId={capsule.chain_id}
                            capsuleType={capsule.type}
                            style={s.capsuleImg}
                            hideParticles={true}
                            isOpened={!isSealed}
                            hideTimer={true}
                        />
                    </View>

                    {/* ── Title block ── */}
                    <View style={s.titleBlock}>
                        {/* Thin accent line */}
                        <View style={s.accentLine} />
                        <Text style={s.capsuleTitle} numberOfLines={2}>{capsule.title}</Text>
                        {capsule.description ? (
                            <Text style={s.capsuleDesc} numberOfLines={2}>{capsule.description}</Text>
                        ) : null}
                    </View>

                    {/* ── Countdown / status pill ── */}
                    {isSealed && daysUntil > 0 ? (
                        <View style={s.countdownPill}>
                            <View style={s.countdownDot} />
                            <Text style={s.countdownLabel}>OPENS IN</Text>
                            <Text style={s.countdownDays}>{daysUntil}</Text>
                            <Text style={s.countdownUnit}>DAYS</Text>
                        </View>
                    ) : !isSealed ? (
                        <View style={[s.countdownPill, s.openPill]}>
                            <View style={[s.countdownDot, { backgroundColor: '#4ade80' }]} />
                            <Text style={[s.countdownLabel, { color: '#4ade80' }]}>NOW OPEN</Text>
                        </View>
                    ) : null}

                    {/* ── Blurred photo strip ── */}
                    <View style={s.photoStrip}>
                        {(previewImages.length > 0 ? previewImages : [null, null, null, null]).map((uri, i) => (
                            <View key={i} style={s.photoCell}>
                                {uri ? (
                                    <Image source={{ uri }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
                                ) : (
                                    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.04)' }]} />
                                )}
                                {/* Blur overlay */}
                                {Platform.OS === 'ios' ? (
                                    <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill as any} />
                                ) : (
                                    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }]} />
                                )}
                                {/* Lock icon */}
                                <View style={s.photoLock}>
                                    <Ionicons name="lock-closed" size={10} color="rgba(255,255,255,0.7)" />
                                </View>
                            </View>
                        ))}
                    </View>

                    {/* ── Bottom: QR + CTA ── */}
                    <View style={s.bottomRow}>
                        {/* QR */}
                        <View style={s.qrWrap}>
                            <View style={s.qrInner}>
                                <QRCode value={qrUrl} size={34} color="#0d0d1a" backgroundColor="#fff" />
                            </View>
                            <Text style={s.qrLabel}>SCAN TO OPEN</Text>
                        </View>

                        {/* CTA text */}
                        <View style={s.ctaBlock}>
                            <Text style={s.ctaHeadline}>What's{'\n'}inside? 🔒</Text>
                            <Text style={s.ctaSub}>kapsely.com</Text>
                        </View>
                    </View>

                </ViewShot>

                {/* ── Action buttons ── */}
                <View style={s.actionsRow}>
                    <TouchableOpacity style={s.actionBtnSecondary} activeOpacity={0.8} onPress={handleSave} disabled={saving}>
                        {saving
                            ? <ActivityIndicator size="small" color={Colors.textPrimary} />
                            : <>
                                <Ionicons name="download-outline" size={20} color={Colors.textPrimary} />
                                <Text style={s.actionBtnSecondaryText}>{t('detail.share.save_image')}</Text>
                            </>
                        }
                    </TouchableOpacity>

                    <TouchableOpacity style={s.actionBtnPrimary} activeOpacity={0.8} onPress={handleShare} disabled={sharing}>
                        {sharing
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <>
                                <Ionicons name="logo-instagram" size={20} color="#fff" />
                                <Text style={s.actionBtnPrimaryText}>{t('detail.share.share')}</Text>
                            </>
                        }
                    </TouchableOpacity>
                </View>

                {/* Hint */}
                <Text style={s.hint}>Share to Instagram Stories and tag @kapsely</Text>
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },

    // Header
    header: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingBottom: 14,
        backgroundColor: Colors.surface,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
    },
    backBtn: { width: 44, alignItems: 'flex-start' },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontFamily: Fonts.bold, color: Colors.textPrimary },

    scroll: { alignItems: 'center', paddingVertical: 28, paddingBottom: 48 },

    // Canvas
    canvas: {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 28,
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 28, shadowOffset: { width: 0, height: 12 } },
            android: { elevation: 16 },
        }),
    },

    // Glows
    glowTopLeft: {
        position: 'absolute', top: -60, left: -60,
        width: 200, height: 200, borderRadius: 100,
        backgroundColor: 'rgba(120, 80, 255, 0.18)',
    },
    glowBottomRight: {
        position: 'absolute', bottom: -40, right: -40,
        width: 160, height: 160, borderRadius: 80,
        backgroundColor: 'rgba(255, 100, 150, 0.12)',
    },

    // Top bar
    topBar: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingTop: 18, gap: 6,
    },
    logoImg: { width: 18, height: 18 },
    appName: {
        fontSize: 13, fontFamily: Fonts.bold, color: '#fff',
        letterSpacing: 0.5, opacity: 0.9,
    },
    topBarDivider: {
        width: 1, height: 10, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 2,
    },
    topBarType: {
        fontSize: 9, fontFamily: Fonts.bold, color: 'rgba(255,255,255,0.4)',
        letterSpacing: 1.5,
    },

    // Capsule hero
    capsuleHero: {
        alignItems: 'center', justifyContent: 'center',
        marginTop: 8, flex: 1,
    },
    capsuleGlow: {
        position: 'absolute',
        width: 160, height: 160, borderRadius: 80,
        backgroundColor: 'rgba(150, 100, 255, 0.15)',
        ...Platform.select({
            ios: { shadowColor: '#9966ff', shadowOpacity: 0.6, shadowRadius: 50, shadowOffset: { width: 0, height: 0 } },
        }),
    },
    capsuleImg: { width: 160, height: 160 },

    // Title block
    titleBlock: {
        paddingHorizontal: 18, marginTop: 10, gap: 5,
    },
    accentLine: {
        width: 28, height: 2, borderRadius: 1,
        backgroundColor: 'rgba(255,255,255,0.3)', marginBottom: 4,
    },
    capsuleTitle: {
        fontSize: 22, fontFamily: Fonts.bold, color: '#fff',
        letterSpacing: -0.5, lineHeight: 27,
    },
    capsuleDesc: {
        fontSize: 11, fontFamily: Fonts.regular,
        color: 'rgba(255,255,255,0.45)', lineHeight: 16,
    },

    // Countdown pill
    countdownPill: {
        flexDirection: 'row', alignItems: 'center',
        alignSelf: 'flex-start', gap: 6,
        marginHorizontal: 18, marginTop: 10,
        backgroundColor: 'rgba(255,255,255,0.07)',
        paddingHorizontal: 12, paddingVertical: 6,
        borderRadius: 20,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    openPill: { backgroundColor: 'rgba(74, 222, 128, 0.08)' },
    countdownDot: {
        width: 5, height: 5, borderRadius: 2.5,
        backgroundColor: '#c084fc',
    },
    countdownLabel: {
        fontSize: 8, fontFamily: Fonts.bold,
        color: 'rgba(255,255,255,0.45)', letterSpacing: 1.2,
    },
    countdownDays: {
        fontSize: 14, fontFamily: Fonts.bold, color: '#fff',
        marginLeft: 2,
    },
    countdownUnit: {
        fontSize: 8, fontFamily: Fonts.bold,
        color: 'rgba(255,255,255,0.4)', letterSpacing: 1,
        marginTop: 2,
    },

    // Photo strip
    photoStrip: {
        flexDirection: 'row', gap: 6,
        paddingHorizontal: 16, marginTop: 14,
    },
    photoCell: {
        flex: 1, height: 54, borderRadius: 10,
        overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    photoLock: {
        width: 20, height: 20, borderRadius: 10,
        backgroundColor: 'rgba(0,0,0,0.35)',
        alignItems: 'center', justifyContent: 'center',
    },

    // Bottom row
    bottomRow: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingBottom: 16,
        marginTop: 14, gap: 12,
    },
    qrWrap: { alignItems: 'center', gap: 5 },
    qrInner: {
        padding: 5, backgroundColor: '#fff', borderRadius: 10,
        ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } } }),
    },
    qrLabel: {
        fontSize: 7, fontFamily: Fonts.bold,
        color: 'rgba(255,255,255,0.3)', letterSpacing: 1.2,
    },
    ctaBlock: { flex: 1 },
    ctaHeadline: {
        fontSize: 18, fontFamily: Fonts.bold, color: '#fff',
        lineHeight: 22, letterSpacing: -0.3,
    },
    ctaSub: {
        fontSize: 10, fontFamily: Fonts.regular,
        color: 'rgba(255,255,255,0.35)', marginTop: 4,
        letterSpacing: 0.3,
    },

    // Action buttons
    actionsRow: {
        flexDirection: 'row', width: CANVAS_WIDTH, gap: 12,
    },
    actionBtnSecondary: {
        flex: 1, height: 50, borderRadius: 25,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
        backgroundColor: Colors.surface,
        borderWidth: 1, borderColor: Colors.border,
        ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } } }),
    },
    actionBtnSecondaryText: { fontSize: 14, fontFamily: Fonts.bold, color: Colors.textPrimary },
    actionBtnPrimary: {
        flex: 1, height: 50, borderRadius: 25,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
        backgroundColor: '#E1306C',
        ...Platform.select({ ios: { shadowColor: '#E1306C', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } } }),
    },
    actionBtnPrimaryText: { fontSize: 14, fontFamily: Fonts.bold, color: '#fff' },

    hint: {
        marginTop: 14, fontSize: 11, fontFamily: Fonts.regular,
        color: Colors.textMuted, textAlign: 'center',
    },
});