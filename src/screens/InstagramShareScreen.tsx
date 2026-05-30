import React, { useRef, useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Image,
    Dimensions, Platform, ScrollView, Alert, ActivityIndicator, Animated, Easing
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import QRCode from 'react-native-qrcode-svg';
import { Colors, Fonts, Spacing, Shadow } from '../theme';
import CapsuleWithTimer from '../components/CapsuleWithTimer';
import { useTranslation } from 'react-i18next';
import { MODEL_IMAGES, MODEL_IMAGES_OPEN } from '../constants/models';
import { timerConfigManager } from '../utils/timerConfig';
import { supabase } from '../lib/supabase';
import { BlurView } from 'expo-blur';
import { buildCapsuleShareUrl } from '../utils/deepLinks';

const { width } = Dimensions.get('window');
const CANVAS_WIDTH = 300;
const CANVAS_HEIGHT = CANVAS_WIDTH * (16 / 9);
const KAPSELY_LOGO = 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/website/Logomain.png';
const VIDEO_FRAME_COUNT = 36;
const VIDEO_FRAME_DELAY_MS = 120;
const VIDEO_FRAME_RATE = 12;

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const toFFmpegPath = (uri: string) => `"${uri.replace(/^file:\/\//, '').replace(/"/g, '\\"')}"`;

const getFFmpegKit = () => {
    try {
        const kit = require('ffmpeg-kit-react-native');
        if (kit?.FFmpegKit && kit?.ReturnCode) return kit;
    } catch {}
    return null;
};

// ── Dot grid decoration ───────────────────────────────────────────────────────
const DotGrid = ({ rows = 5, cols = 8, opacity = 0.12 }: { rows?: number; cols?: number; opacity?: number }) => (
    <View style={{ flexDirection: 'column', gap: 10, opacity }}>
        {Array.from({ length: rows }).map((_, r) => (
            <View key={r} style={{ flexDirection: 'row', gap: 10 }}>
                {Array.from({ length: cols }).map((_, c) => (
                    <View key={c} style={{ width: 2.5, height: 2.5, borderRadius: 1.5, backgroundColor: '#7C5CBF' }} />
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
    const pulse = useRef(new Animated.Value(0)).current;
    const float = useRef(new Animated.Value(0)).current;
    const shimmer = useRef(new Animated.Value(0)).current;
    const sparkle = useRef(new Animated.Value(0)).current;

    React.useEffect(() => {
        Animated.loop(Animated.sequence([
            Animated.timing(pulse, { toValue: 1, duration: 3600, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 0, duration: 3600, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        ])).start();
        Animated.loop(Animated.sequence([
            Animated.timing(float, { toValue: 1, duration: 5200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(float, { toValue: 0, duration: 5200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])).start();
        Animated.loop(Animated.timing(shimmer, { toValue: 1, duration: 7200, easing: Easing.inOut(Easing.sin), useNativeDriver: true })).start();
        Animated.loop(Animated.sequence([
            Animated.timing(sparkle, { toValue: 1, duration: 2100, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.timing(sparkle, { toValue: 0, duration: 2500, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        ])).start();
    }, [float, pulse, shimmer, sparkle]);

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

    const qrUrl = buildCapsuleShareUrl(String(capsule.id));
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

    const cleanDesc = capsule.description ? capsule.description.replace(/\[STYLE:(OPEN|CLOSED)\]/gi, '').trim() : '';
    const themeColor = timerConfigManager.getModelThemeColor(capsule.model, capsule.model_snapshot, '#7C5CBF');
    const secondaryColor = capsule.type === 'eventcap' ? '#F59E0B' : capsule.type === 'birthdaycap' ? '#FF6FB7' : '#22D3EE';
    const typeLabel = capsule.type === 'instacap'
        ? 'INSTACAP'
        : capsule.type === 'eventcap'
            ? 'EVENTCAP'
            : capsule.type === 'birthdaycap'
                ? 'BIRTHDAYCAP'
                : capsule.type === 'opencap'
                    ? 'OPENCAP'
                    : 'LEGACYCAP';
    const floatY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -7] });
    const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.045] });
    const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.24, 0.54] });
    const shimmerX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-CANVAS_WIDTH * 0.85, CANVAS_WIDTH * 0.85] });
    const sparkleScale = sparkle.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1.08] });
    const sparkleOpacity = sparkle.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.58] });

    const modelImg = isSealed
        ? timerConfigManager.getModelImage(capsule.model) || (MODEL_IMAGES as any)[capsule.model]
        : timerConfigManager.getModelImageOpen(capsule.model) || (MODEL_IMAGES_OPEN as any)[capsule.model] || (MODEL_IMAGES as any)[capsule.model];

    const captureFrame = async () => {
        try {
            if (viewShotRef.current?.capture) return await viewShotRef.current.capture();
            return null;
        } catch (error) {
            return null;
        }
    };

    const createStoryVideo = async () => {
        const ffmpeg = getFFmpegKit();
        if (!ffmpeg) {
            throw new Error('Video encoder unavailable');
        }

        const cacheDir = FileSystem.cacheDirectory;
        if (!cacheDir) throw new Error('Cache directory unavailable');

        const frameDir = `${cacheDir}kapsely-story-${capsule.id}-${Date.now()}/`;
        const outputUri = `${cacheDir}kapsely-story-${capsule.id}-${Date.now()}.mp4`;
        await FileSystem.makeDirectoryAsync(frameDir, { intermediates: true });

        try {
            for (let i = 0; i < VIDEO_FRAME_COUNT; i += 1) {
                const frameUri = await captureFrame();
                if (!frameUri) throw new Error('Frame capture failed');
                const framePath = `${frameDir}frame_${String(i).padStart(3, '0')}.jpg`;
                await FileSystem.moveAsync({ from: frameUri, to: framePath });
                await wait(VIDEO_FRAME_DELAY_MS);
            }

            const command = [
                '-y',
                '-framerate', String(VIDEO_FRAME_RATE),
                '-i', toFFmpegPath(`${frameDir}frame_%03d.jpg`),
                '-vf', '"scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x120A24,fps=30,format=yuv420p"',
                '-c:v', 'mpeg4',
                '-q:v', '3',
                '-movflags', '+faststart',
                toFFmpegPath(outputUri),
            ].join(' ');

            const session = await ffmpeg.FFmpegKit.execute(command);
            const returnCode = await session.getReturnCode();
            if (!returnCode || !ffmpeg.ReturnCode.isSuccess(returnCode)) {
                throw new Error('Video encoding failed');
            }

            return outputUri;
        } finally {
            await FileSystem.deleteAsync(frameDir, { idempotent: true }).catch(() => {});
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const perm = await MediaLibrary.requestPermissionsAsync();
            if (perm.status !== 'granted') {
                Alert.alert(t('detail.share.permission_denied'), t('detail.share.permission_hint'));
                return;
            }
            const uri = await createStoryVideo();
            await MediaLibrary.saveToLibraryAsync(uri);
            Alert.alert(t('detail.share.video_saved'), t('detail.share.video_saved_desc'));
        } catch (error: any) {
            const message = error?.message === 'Video encoder unavailable'
                ? t('detail.share.video_requires_dev_build')
                : t('detail.share.video_failed');
            Alert.alert(t('common.error'), message);
        } finally {
            setSaving(false);
        }
    };

    const handleShare = async () => {
        setSharing(true);
        try {
            const uri = await createStoryVideo();
            if (uri) {
                const isAvailable = await Sharing.isAvailableAsync();
                if (isAvailable) {
                    await Sharing.shareAsync(uri, { dialogTitle: t('detail.share.share'), mimeType: 'video/mp4', UTI: 'public.mpeg-4' });
                } else {
                    Alert.alert(t('common.error'), t('detail.share.device_error'));
                }
            }
        } catch (error: any) {
            const message = error?.message === 'Video encoder unavailable'
                ? t('detail.share.video_requires_dev_build')
                : t('detail.share.video_failed');
            Alert.alert(t('common.error'), message);
        } finally {
            setSharing(false);
        }
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
                    {/* Light background with purple touches */}
                    <LinearGradient
                        colors={['#120A24', '#24104B', themeColor, secondaryColor]}
                        style={StyleSheet.absoluteFill}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                    />

                    {/* Accent glow — top left */}
                    <Animated.View style={[s.auraBack, { backgroundColor: themeColor, opacity: pulseOpacity, transform: [{ scale: pulseScale }] }]} />
                    {/* Accent glow — bottom right */}
                    <Animated.View style={[s.auraFront, { backgroundColor: secondaryColor, opacity: pulseOpacity, transform: [{ scale: pulseScale }] }]} />
                    <Animated.View style={[s.shimmerBeam, { transform: [{ translateX: shimmerX }, { rotate: '-18deg' }] }]}>
                        <LinearGradient
                            colors={['transparent', 'rgba(255,255,255,0.28)', 'transparent']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={StyleSheet.absoluteFill}
                        />
                    </Animated.View>

                    {/* Dot grid — top right decoration */}
                    <View style={{ position: 'absolute', top: 18, right: 14 }}>
                        <DotGrid rows={4} cols={6} opacity={0.18} />
                    </View>
                    {/* Dot grid — bottom left */}
                    <View style={{ position: 'absolute', bottom: 54, left: 14 }}>
                        <DotGrid rows={3} cols={5} opacity={0.12} />
                    </View>

                    {[0, 1, 2, 3, 4, 5].map(i => (
                        <Animated.View
                            key={i}
                            style={[
                                s.sparkleDot,
                                {
                                    left: [24, 238, 52, 252, 36, 220][i],
                                    top: [86, 110, 360, 310, 232, 430][i],
                                    opacity: i % 2 ? pulseOpacity : sparkleOpacity,
                                    transform: [{ scale: i % 2 ? pulseScale : sparkleScale }],
                                },
                            ]}
                        />
                    ))}

                    {/* ── Top bar: branding ── */}
                    <View style={s.topBar}>
                        <Image
                            source={{ uri: KAPSELY_LOGO }}
                            style={s.logoImg}
                            resizeMode="contain"
                        />
                        <Text style={s.appName}>kapsely</Text>
                        <View style={s.topBarDivider} />
                        <Text style={s.topBarType}>
                            {typeLabel}
                        </Text>
                    </View>

                    {/* ── Capsule hero ── */}
                    <Animated.View style={[s.capsuleHero, { transform: [{ translateY: floatY }] }]}>
                        {/* Radial glow behind capsule */}
                        <Animated.View style={[s.capsuleGlow, { backgroundColor: themeColor + '55', opacity: pulseOpacity, transform: [{ scale: pulseScale }] }]} />
                        <View style={[s.orbitRing, { borderColor: secondaryColor + '55' }]} />
                        <View style={[s.orbitRingSmall, { borderColor: '#FFFFFF33' }]} />
                        <CapsuleWithTimer
                            modelKey={capsule.model}
                            source={modelImg ? { uri: modelImg } : undefined}
                            date={capsuleOpensAt}
                            modelLayout={capsule.model_snapshot}
                            chainId={capsule.chain_id}
                            capsuleType={capsule.type}
                            style={s.capsuleImg}
                            hideParticles={true}
                            isOpened={!isSealed}
                            hideTimer={!isSealed}
                            lightweight={true}
                        />
                    </Animated.View>

                    {/* ── Title block ── */}
                    <View style={s.titleBlock}>
                        {/* Thin accent line */}
                        <LinearGradient colors={[secondaryColor, '#FFFFFF']} style={s.accentLine} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
                        <Text style={s.capsuleTitle} numberOfLines={2}>{capsule.title}</Text>
                        {cleanDesc ? (
                            <Text style={s.capsuleDesc} numberOfLines={2}>{cleanDesc}</Text>
                        ) : null}
                    </View>

                    {/* ── Blurred photo strip ── */}
                    <View style={s.photoStrip}>
                        {(previewImages.length > 0 ? previewImages : [null, null, null, null]).map((uri, i) => (
                            <View key={i} style={s.photoCell}>
                                {uri ? (
                                    <Image source={{ uri }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
                                ) : (
                                    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.04)' }]} />
                                )}
                                {/* Blur overlay (only if sealed) */}
                                {isSealed && (
                                    <BlurView 
                                        intensity={Platform.OS === 'ios' ? 35 : 85} 
                                        tint="light" 
                                        style={StyleSheet.absoluteFill as any} 
                                    />
                                )}
                                {/* Lock icon (only if sealed) */}
                                {isSealed && (
                                    <View style={s.photoLock}>
                                        <Ionicons name="lock-closed" size={10} color="rgba(0,0,0,0.4)" />
                                    </View>
                                )}
                            </View>
                        ))}
                    </View>

                    {/* ── Bottom: QR + CTA ── */}
                    <View style={s.bottomRow}>
                        {/* QR */}
                        <View style={s.qrWrap}>
                            <View style={s.qrInner}>
                                <QRCode value={qrUrl} size={34} color="#111" backgroundColor="#fff" />
                            </View>
                            <Text style={s.qrLabel}>SCAN TO VIEW CONTENT</Text>
                        </View>

                        {/* CTA text */}
                        <View style={s.ctaBlock}>
                            <Text style={s.ctaHeadline}>{isSealed ? 'Unlock the' : 'Open the'}{'\n'}memory</Text>
                            <Text style={s.ctaSub}>Kapsely.com</Text>
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
                                <Text style={s.actionBtnSecondaryText}>{t('detail.share.save_story')}</Text>
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
                <Text style={s.hint}>El movimiento es intencionadamente suave para que la story respire mejor.</Text>
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

    auraBack: {
        position: 'absolute', top: 58, left: 24,
        width: 252, height: 252, borderRadius: 126,
    },
    auraFront: {
        position: 'absolute', bottom: -34, right: -34,
        width: 190, height: 190, borderRadius: 95,
    },
    shimmerBeam: {
        position: 'absolute',
        top: -40,
        bottom: -40,
        width: 86,
    },
    sparkleDot: {
        position: 'absolute',
        width: 7,
        height: 7,
        borderRadius: 4,
        backgroundColor: '#fff',
        shadowColor: '#fff',
        shadowOpacity: 0.9,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 0 },
    },

    // Top bar
    topBar: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingTop: 22, gap: 8,
    },
    logoImg: { width: 22, height: 22 },
    appName: {
        fontSize: 16, fontFamily: Fonts.bold, color: '#fff',
        letterSpacing: 0.5, opacity: 0.9,
    },
    topBarDivider: {
        width: 1, height: 12, backgroundColor: 'rgba(255,255,255,0.30)', marginHorizontal: 4,
    },
    topBarType: {
        fontSize: 10, fontFamily: Fonts.bold, color: 'rgba(255,255,255,0.72)',
        letterSpacing: 1.5,
    },

    // Capsule hero
    capsuleHero: {
        alignItems: 'center', justifyContent: 'center',
        marginTop: 12, flex: 1,
    },
    capsuleGlow: {
        position: 'absolute',
        width: 180, height: 180, borderRadius: 90,
        ...Platform.select({
            ios: { shadowColor: '#7C5CBF', shadowOpacity: 0.3, shadowRadius: 40, shadowOffset: { width: 0, height: 0 } },
        }),
    },
    orbitRing: {
        position: 'absolute',
        width: 210,
        height: 122,
        borderRadius: 100,
        borderWidth: 1,
        transform: [{ rotate: '-18deg' }],
    },
    orbitRingSmall: {
        position: 'absolute',
        width: 168,
        height: 96,
        borderRadius: 100,
        borderWidth: 1,
        transform: [{ rotate: '22deg' }],
    },
    capsuleImg: { width: 180, height: 180 },

    // Title block
    titleBlock: {
        paddingHorizontal: 18, marginTop: 14, gap: 6,
    },
    accentLine: {
        width: 32, height: 3, borderRadius: 1.5,
        backgroundColor: '#7C5CBF', marginBottom: 4,
    },
    capsuleTitle: {
        fontSize: 26, fontFamily: Fonts.bold, color: '#fff',
        letterSpacing: -0.5, lineHeight: 30,
        textShadowColor: 'rgba(0,0,0,0.20)',
        textShadowRadius: 10,
        textShadowOffset: { width: 0, height: 2 },
    },
    capsuleDesc: {
        fontSize: 13, fontFamily: Fonts.regular,
        color: 'rgba(255,255,255,0.76)', lineHeight: 18,
    },

    // Photo strip
    photoStrip: {
        flexDirection: 'row', gap: 6,
        paddingHorizontal: 16, marginTop: 16,
    },
    photoCell: {
        flex: 1, height: 56, borderRadius: 10,
        overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.10)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.22)',
    },
    photoLock: {
        width: 20, height: 20, borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.42)',
        alignItems: 'center', justifyContent: 'center',
    },

    // Bottom row
    bottomRow: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingBottom: 16,
        marginTop: 18, gap: 14,
    },
    qrWrap: { alignItems: 'center', gap: 5 },
    qrInner: {
        padding: 5, backgroundColor: '#fff', borderRadius: 10,
        borderWidth: 1, borderColor: 'rgba(124, 92, 191, 0.1)',
        ...Platform.select({ ios: { shadowColor: '#7C5CBF', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } } }),
    },
    qrLabel: {
        fontSize: 8, fontFamily: Fonts.bold,
        color: 'rgba(255,255,255,0.84)', letterSpacing: 1.2, marginTop: 2,
    },
    ctaBlock: { flex: 1, paddingLeft: 6 },
    ctaHeadline: {
        fontSize: 22, fontFamily: Fonts.bold, color: '#fff',
        lineHeight: 26, letterSpacing: -0.3,
    },
    ctaSub: {
        fontSize: 12, fontFamily: Fonts.semiBold,
        color: 'rgba(255,255,255,0.78)', marginTop: 4,
        letterSpacing: 0.5, textTransform: 'uppercase'
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
