import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions, Platform, ScrollView, Alert, ActivityIndicator } from 'react-native';
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

// aspect ratio 9:16 for stories
const STORY_WIDTH = width;
const STORY_HEIGHT = width * (16 / 9);

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
                        .map(i => i.media_url).slice(0, 3);
                    if (initial.length > 0) { setPreviewImages(initial); return; }
                }

                const { data } = await supabase
                    .from('capsule_items')
                    .select('media_url, media_type')
                    .eq('capsule_id', capsule.id)
                    .limit(8);
                
                if (data && data.length > 0) {
                    setPreviewImages(data
                        .filter(i => i.media_url && (i.media_type === 'image' || i.media_url.match(/\.(jpg|jpeg|png|webp|gif)/i)))
                        .map(i => i.media_url).slice(0, 3)
                    );
                }
            } catch (err) { }
        };
        fetchPreviewImages();
    }, [capsule?.id]);

    if (!capsule) {
        return (
            <View style={styles.container}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: insets.top + 20, marginLeft: 20 }}>
                    <Ionicons name="close" size={32} color={Colors.textPrimary} />
                </TouchableOpacity>
                <Text style={{ textAlign: 'center', marginTop: 50 }}>{t('detail.share.not_found')}</Text>
            </View>
        );
    }

    const qrUrl = `https://kapsely.com/capsules/${capsule.id}`;
    let openingDateText = '';
    const capsuleOpensAt = capsule.opens_at || capsule.target_date || new Date().toISOString();
    if (capsule.status === 'sealed') {
        openingDateText = new Intl.DateTimeFormat(undefined, { 
            day: '2-digit', month: 'short', year: 'numeric' 
        }).format(new Date(capsuleOpensAt)).replace('.', '');
    }

    const modelImg = capsule.status === 'opened' 
        ? (MODEL_IMAGES_OPEN as any)[capsule.model] || (MODEL_IMAGES as any)[capsule.model] 
        : timerConfigManager.getModelImage(capsule.model) || (MODEL_IMAGES as any)[capsule.model];

    const captureImage = async () => {
        try {
            if (viewShotRef.current?.capture) {
                const uri = await viewShotRef.current.capture();
                return uri;
            }
            return null;
        } catch (error) {
            console.error(error);
            Alert.alert(t('common.error'), 'No se pudo generar la imagen.');
            return null;
        }
    };

    const handleSave = async () => {
        setSaving(true);
        const hasPermission = await MediaLibrary.requestPermissionsAsync();
        if (hasPermission.status === 'granted') {
            const uri = await captureImage();
            if (uri) {
                try {
                    await MediaLibrary.saveToLibraryAsync(uri);
                    Alert.alert(t('detail.share.image_saved'), t('detail.share.image_saved_desc'));
                } catch (err) {
                    Alert.alert(t('common.error'), t('detail.share.save_failed'));
                }
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
                    await Sharing.shareAsync(uri, { 
                        dialogTitle: t('detail.share.share'),
                        mimeType: 'image/jpeg',
                        UTI: 'public.jpeg'
                    });
                } else {
                    Alert.alert(t('common.error'), t('detail.share.device_error'));
                }
            }
        } catch (error) {
            console.error(error);
        }
        setSharing(false);
    };

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 44 : 20) }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="close" size={28} color={Colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t('detail.share.instagram_story')}</Text>
                <View style={{ width: 44 }} />
            </View>

            <ScrollView contentContainerStyle={{ alignItems: 'center', paddingVertical: 20 }}>
                {/* The View we exactly want to capture */}
                <ViewShot 
                    ref={viewShotRef} 
                    options={{ format: 'jpg', quality: 1.0 }}
                    style={styles.storyCanvas}
                >
                    <LinearGradient
                        colors={['#0c0c14', '#1f1f33']}
                        style={styles.canvasGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                    >
                        {/* Top App Identity */}
                        <View style={styles.appBranding}>
                            <View style={styles.logoCircle}>
                                <Image 
                                    source={{ uri: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/website/Logomain.png' }} 
                                    style={{ width: 32, height: 32 }} 
                                    resizeMode="contain" 
                                />
                            </View>
                            <Text style={styles.appName}>Kapsely</Text>
                        </View>

                        {/* Title and Badge */}
                        <View style={styles.titleSection}>
                            <View style={styles.capsuleBadge}>
                                <Text style={styles.badgeText}>{capsule.type?.toUpperCase() || 'CAPSULE'}</Text>
                            </View>
                            <Text style={styles.capsuleTitle} numberOfLines={2}>
                                {capsule.title}
                            </Text>
                            {openingDateText ? (
                                <Text style={styles.openingText}>{t('detail.share.opens_on')} {openingDateText}</Text>
                            ) : null}
                        </View>

                        {/* Large 3D Capsule Model */}
                        <View style={styles.modelContainer}>
                            <CapsuleWithTimer
                                modelKey={capsule.model}
                                source={modelImg ? { uri: modelImg } : undefined}
                                date={capsuleOpensAt}
                                chainId={capsule.chain_id}
                                capsuleType={capsule.type}
                                style={styles.largeModelImg}
                                hideParticles={true}
                                isOpened={capsule.status === 'opened'}
                                hideTimer={true}
                            />
                        </View>

                        {/* Blurred Photos Grid */}
                        <View style={styles.photoGrid}>
                            {previewImages.length > 0 ? (
                                previewImages.map((uri, index) => (
                                    <View key={index} style={styles.gridItem}>
                                        <Image source={{ uri }} style={styles.gridImage} resizeMode="cover" />
                                        <BlurView intensity={15} tint="light" style={[StyleSheet.absoluteFillObject, { borderRadius: 16, overflow: 'hidden' }]} />
                                        <View style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}>
                                            <Ionicons name="lock-closed" size={18} color="rgba(255,255,255,0.9)" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2 }} />
                                        </View>
                                    </View>
                                ))
                            ) : (
                                [1, 2, 3].map((_, index) => (
                                    <View key={index} style={styles.gridItemPlaceholder}>
                                        <BlurView intensity={10} tint="light" style={[StyleSheet.absoluteFillObject, { borderRadius: 16, overflow: 'hidden' }]} />
                                        <Ionicons name="lock-closed" size={18} color="rgba(255,255,255,0.4)" />
                                    </View>
                                ))
                            )}
                        </View>

                        {/* Bottom Actions Area */}
                        <View style={styles.bottomAreaContainer}>
                            {/* Visual CTA Button for the image viewer */}
                            <View style={styles.fakeButton}>
                                <Ionicons name="download-outline" size={20} color="#fff" />
                                <Text style={styles.fakeButtonText}>{t('detail.share.create_hint')}</Text>
                            </View>
                            
                            <View style={styles.qrContainer}>
                                <View style={styles.qrBox}>
                                    <QRCode
                                        value={qrUrl}
                                        size={38}
                                        color="#1F1C2C"
                                        backgroundColor="#fff"
                                    />
                                </View>
                                <View style={styles.qrTextCol}>
                                    <Text style={styles.qrHintDesc}>{t('detail.share.scan_hint')}</Text>
                                </View>
                            </View>
                        </View>

                    </LinearGradient>
                </ViewShot>

                {/* Actions (not captured) */}
                <View style={styles.actionsRow}>
                    <TouchableOpacity 
                        style={[styles.actionBtn, { backgroundColor: Colors.surface }]}
                        activeOpacity={0.8}
                        onPress={handleSave}
                        disabled={saving}
                    >
                        {saving ? <ActivityIndicator size="small" color={Colors.primary} /> : (
                            <>
                                <Ionicons name="download" size={22} color={Colors.textPrimary} />
                                <Text style={[styles.actionBtnText, { color: Colors.textPrimary }]}>{t('detail.share.save_image')}</Text>
                            </>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity 
                        style={[styles.actionBtn, { backgroundColor: Colors.primary }]}
                        activeOpacity={0.8}
                        onPress={handleShare}
                        disabled={sharing}
                    >
                        {sharing ? <ActivityIndicator size="small" color="#fff" /> : (
                            <>
                                <Ionicons name="logo-instagram" size={22} color="#fff" />
                                <Text style={[styles.actionBtnText, { color: '#fff' }]}>{t('detail.share.share')}</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingBottom: 15,
        backgroundColor: Colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
        ...Shadow.light
    },
    backBtn: {
        width: 44,
        alignItems: 'flex-start',
    },
    headerTitle: {
        flex: 1,
        textAlign: 'center',
        fontSize: 18,
        fontFamily: Fonts.bold,
        color: Colors.textPrimary,
    },
    storyCanvas: {
        // We scale it down visually but capture it at high resolution
        width: 300,
        height: 300 * (16 / 9),
        borderRadius: 24,
        overflow: 'hidden',
        ...Shadow.primary,
        marginBottom: 30
    },
    canvasGradient: {
        flex: 1,
        padding: 25,
        justifyContent: 'space-between'
    },
    appBranding: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        alignSelf: 'center',
        marginTop: 10,
    },
    logoCircle: {
        alignItems: 'center',
        justifyContent: 'center'
    },
    appName: {
        color: '#fff',
        fontFamily: Fonts.bold,
        fontSize: 14,
        letterSpacing: 1
    },
    titleSection: {
        alignItems: 'center',
        marginTop: 20
    },
    capsuleBadge: {
        backgroundColor: 'rgba(255,255,255,0.15)',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 12,
        marginBottom: 10
    },
    badgeText: {
        color: '#fff',
        fontSize: 10,
        fontFamily: Fonts.bold,
        letterSpacing: 2
    },
    capsuleTitle: {
        color: '#fff',
        fontSize: 24,
        fontFamily: Fonts.bold,
        textAlign: 'center',
        textShadowColor: 'rgba(0,0,0,0.3)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
        marginBottom: 6
    },
    openingText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 14,
        fontFamily: Fonts.medium,
        textAlign: 'center'
    },
    modelContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: 5,
        width: '100%'
    },
    largeModelImg: {
        width: 180,
        height: 180,
    },
    bottomAreaContainer: {
        width: '100%',
        alignItems: 'center',
        gap: 20,
        marginBottom: 10
    },
    fakeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Colors.primary,
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 16,
        gap: 6,
        ...Shadow.primary
    },
    fakeButtonText: {
        color: '#fff',
        fontFamily: Fonts.bold,
        fontSize: 12,
        textAlign: 'center'
    },
    qrContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 14,
        padding: 8,
        width: '82%',
        gap: 10
    },
    qrBox: {
        padding: 3,
        backgroundColor: '#fff',
        borderRadius: 8
    },
    qrTextCol: {
        flex: 1,
        justifyContent: 'center'
    },
    qrHintDesc: {
        color: 'rgba(255,255,255,0.85)',
        fontFamily: Fonts.semiBold,
        fontSize: 11,
    },
    photoGrid: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 15,
        width: '100%',
        marginTop: 'auto',
        marginBottom: 12,
        paddingHorizontal: 15
    },
    gridItem: {
        width: 65,
        height: 65,
        borderRadius: 16,
        overflow: 'hidden',
    },
    gridImage: {
        width: '100%',
        height: '100%',
        borderRadius: 16,
    },
    gridItemPlaceholder: {
        width: 65,
        height: 65,
        borderRadius: 16,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.04)',
    },
    actionsRow: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        width: '100%',
        gap: 15
    },
    actionBtn: {
        flex: 1,
        height: 56,
        borderRadius: 28,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        ...Shadow.light,
        borderWidth: 1,
        borderColor: Colors.border
    },
    actionBtnText: {
        fontSize: 15,
        fontFamily: Fonts.bold
    }
});
