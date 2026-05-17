import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Modal, Platform, Alert, Dimensions, Animated, Easing
} from 'react-native';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { Colors, Fonts, Spacing } from '../theme';
import { MODEL_IMAGES } from '../constants/models';
import { timerConfigManager } from '../utils/timerConfig';
import StoryEditor from './StoryEditor';

const AnyFlashList = FlashList as any;

const { width, height } = Dimensions.get('window');
const ITEM_SIZE = width / 3;

interface FlashPickerProps {
    visible: boolean;
    onClose: () => void;
    currentUserId: string | null;
    participantCapsules: Set<string>;
    onStoryPublished: () => void;
}

export const FlashPicker = React.memo(({
    visible,
    onClose,
    currentUserId,
    participantCapsules,
    onStoryPublished
}: FlashPickerProps) => {
    const { t } = useTranslation();
    const [pickerStep, setPickerStep] = useState<'source' | 'list' | 'select' | 'animation' | 'edit'>('source');
    const [capsuleMode, setCapsuleMode] = useState<'opened' | 'sealed' | null>(null);
    const [userCapsules, setUserCapsules] = useState<any[]>([]);
    const [selectedPickerCapsule, setSelectedPickerCapsule] = useState<any>(null);
    const [pickerItems, setPickerItems] = useState<any[]>([]);
    const [randomPreviewItem, setRandomPreviewItem] = useState<any>(null);
    const [searching, setSearching] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null);

    const searchingAnim = useRef(new Animated.Value(0)).current;
    const unblurAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (visible && currentUserId) {
            loadUserCapsules();
        }
    }, [visible, currentUserId]);

    const loadUserCapsules = async () => {
        if (!currentUserId) return;
        
        const participantIds = Array.from(participantCapsules);
        const conditions = [`owner_id.eq.${currentUserId}`];
        if (participantIds.length > 0) conditions.push(`id.in.(${participantIds.join(',')})`);
        
        const { data } = await supabase.from('capsules')
            .select('*, profiles:owner_id(username, display_name, avatar_url)')
            .or(conditions.join(','))
            .order('created_at', { ascending: false });
            
        const filtered = (data || []).filter(cap => cap.status === 'sealed' || cap.status === 'opened');
        setUserCapsules(filtered);
        setPickerStep('source');
    };

    const openOpenedCapsules = useCallback(() => {
        if (!userCapsules.some(cap => cap.status === 'opened')) {
            Alert.alert(t('common.warning'), t('feed.no_capsules_yet') || 'No tienes capsulas abiertas disponibles.');
            return;
        }
        setCapsuleMode('opened');
        setPickerStep('list');
    }, [userCapsules, t]);

    const openSealedCapsules = useCallback(async () => {
        if (!currentUserId) return;
        const lockKey = `@flash_sealed_lock_${currentUserId}`;
        const saved = await AsyncStorage.getItem(lockKey);
        if (saved && Number(saved) > Date.now()) {
            Alert.alert(t('common.warning'), t('feed.story_cooldown_active') || 'Ya has usado el flash de cápsulas cerradas. Vuelve en 48h.');
            return;
        }
        const sealedCapsules = userCapsules.filter(cap => cap.status === 'sealed');
        if (!sealedCapsules.length) {
            Alert.alert(t('common.warning'), t('feed.no_capsules_yet') || 'No tienes cápsulas cerradas disponibles.');
            return;
        }
        const ids = sealedCapsules.map(c => c.id);
        const { data: items } = await supabase
            .from('capsule_items')
            .select('*, capsules:capsule_id(*)')
            .in('capsule_id', ids)
            .eq('media_type', 'image');
        if (!items?.length) {
            Alert.alert(t('common.warning'), t('create.no_media'));
            return;
        }
        await AsyncStorage.setItem(lockKey, String(Date.now() + 48 * 60 * 60 * 1000));
        const random = items[Math.floor(Math.random() * items.length)];
        setSelectedPickerCapsule(random.capsules || sealedCapsules.find(c => c.id === random.capsule_id));
        setRandomPreviewItem(random);
        setSearching(false);
        unblurAnim.setValue(1);
        setPickerStep('animation');
        Animated.timing(unblurAnim, { toValue: 0, duration: 1600, useNativeDriver: true, easing: Easing.out(Easing.cubic) }).start();
    }, [currentUserId, userCapsules, t, unblurAnim]);

    const pickInstantMedia = useCallback(async (source: 'library' | 'camera') => {
        const permission = source === 'camera'
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permission.status !== 'granted') return;
        const result = source === 'camera'
            ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], quality: 0.9 })
            : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.9 });
        if (!result.canceled && result.assets?.[0]) {
            const asset = result.assets[0];
            setSelectedPickerCapsule(null);
            setEditingItem({
                id: `instant-${Date.now()}`,
                capsule_id: null,
                media_url: asset.uri,
                media_type: asset.type === 'video' ? 'video' : 'image',
                isInstantFlash: true,
            });
            setPickerStep('edit');
        }
    }, []);

    const ensureInstantFlashCapsule = useCallback(async () => {
        if (!currentUserId) return null;

        const marker = '[SYSTEM:INSTANT_FLASH]';
        const { data: existing } = await supabase
            .from('capsules')
            .select('id, status')
            .eq('owner_id', currentUserId)
            .eq('description', marker)
            .eq('status', 'opened')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (existing?.id) return existing.id;

        const { data, error } = await supabase
            .from('capsules')
            .insert({
                owner_id: currentUserId,
                type: 'instacap',
                model: 'basicred_kap',
                title: 'Flash',
                description: marker,
                duration_days: 0,
                opens_at: new Date().toISOString(),
                status: 'opened',
                is_public: false,
                is_shared: false,
            })
            .select('id')
            .single();

        if (error) throw error;
        return data?.id ?? null;
    }, [currentUserId]);

    const handleSelectCapsuleForPicker = useCallback(async (capsule: any) => {
        setSelectedPickerCapsule(capsule);
        const { data: items } = await supabase.from('capsule_items')
            .select('*').eq('capsule_id', capsule.id).eq('media_type', 'image');
            
        if (!items || items.length === 0) {
            Alert.alert(t('common.warning'), t('create.no_media'));
            return;
        }
        
        setPickerItems(items);
        if (capsule.status === 'opened') {
            setPickerStep('select');
            return;
        }
        
        setPickerStep('select');
    }, [t, currentUserId]);

    const rejectRandomStory = useCallback(async () => {
        setPickerStep('source');
    }, [currentUserId]);

    const confirmStory = useCallback(async (item: any, metadata: any = {}) => {
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 48);

        let capsuleId = item.capsule_id || null;
        if (!capsuleId && item.isInstantFlash) {
            try {
                capsuleId = await ensureInstantFlashCapsule();
            } catch (e) {
                Alert.alert(t('common.error'), t('feed.share_error'));
                return;
            }
        }

        const { data: cap } = capsuleId
            ? await supabase.from('capsules').select('status').eq('id', capsuleId).single()
            : { data: null } as any;
        const { error } = await supabase.from('capsule_items').insert({
            owner_id: currentUserId,
            capsule_id: capsuleId,
            media_url: item.media_url || `empty-story://${Date.now()}`,
            media_type: item.media_type || 'image',
            is_story: true,
            is_mystery: cap?.status === 'sealed',
            expires_at: expiresAt.toISOString(),
            metadata,
        });
        
        if (!error) {
            try {
                if (capsuleId) await AsyncStorage.removeItem(`@flash_selection_${currentUserId}_${capsuleId}`);
            } catch (e) { }
            onClose();
            setEditingItem(null);
            setPickerStep('list');
            onStoryPublished();
        } else {
            Alert.alert(t('common.error'), t('feed.share_error'));
        }
    }, [currentUserId, t, onStoryPublished, onClose, ensureInstantFlashCapsule]);

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={s.pickerOverlay}>
                <View style={[
                    s.pickerSheet, 
            (pickerStep === 'edit' || pickerStep === 'animation' || pickerStep === 'select' || pickerStep === 'list' || pickerStep === 'source') && { height: height * (pickerStep === 'edit' ? 1 : 0.85) },
                    pickerStep === 'edit' && { borderTopLeftRadius: 0, borderTopRightRadius: 0 }
                ]}>
                    {pickerStep !== 'edit' && <View style={s.pickerHandle} />}
                    {pickerStep !== 'edit' && (
                        <View style={s.pickerHeader}>
                            {pickerStep !== 'source' && (
                                <TouchableOpacity onPress={() => pickerStep === 'animation' ? setPickerStep('source') : setPickerStep(capsuleMode ? 'list' : 'source')} style={s.pickerNavBtn} activeOpacity={0.7}>
                                    <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
                                </TouchableOpacity>
                            )}
                            <Text style={s.pickerTitle}>
                                {pickerStep === 'source' ? t('feed.share_flash') : pickerStep === 'list' ? t('feed.choose_capsule') || 'Elegir cápsula' : pickerStep === 'select' ? t('feed.choose_image') : t('feed.discovering')}
                            </Text>
                            <TouchableOpacity onPress={onClose} style={s.pickerNavBtn} activeOpacity={0.7}>
                                <Ionicons name="close" size={22} color={Colors.textMuted} />
                            </TouchableOpacity>
                        </View>
                    )}

                    {pickerStep === 'source' && (
                        <View style={s.sourceGrid}>
                            {[
                                { key: 'opened', label: 'Cápsulas abiertas', icon: 'lock-open-outline', onPress: openOpenedCapsules },
                                { key: 'sealed', label: 'Cápsulas cerradas', icon: 'lock-closed-outline', onPress: openSealedCapsules },
                                { key: 'library', label: 'Library', icon: 'images-outline', onPress: () => pickInstantMedia('library') },
                                { key: 'camera', label: 'Cámara', icon: 'camera-outline', onPress: () => pickInstantMedia('camera') },
                            ].map(option => (
                                <TouchableOpacity key={option.key} style={s.sourceCard} activeOpacity={0.82} onPress={option.onPress as any}>
                                    <LinearGradient colors={[Colors.primary + '18', Colors.primary + '06']} style={s.sourceIcon}>
                                        <Ionicons name={option.icon as any} size={26} color={Colors.primary} />
                                    </LinearGradient>
                                    <Text style={s.sourceLabel}>{option.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    {pickerStep === 'list' && (
                        <ScrollView style={{ flex: 1 }}>
                            {userCapsules.filter(cap => capsuleMode === 'opened' ? cap.status === 'opened' : cap.status === 'sealed').map(cap => (
                                <TouchableOpacity key={cap.id} style={s.pickerItem} activeOpacity={0.8} onPress={() => handleSelectCapsuleForPicker(cap)}>
                                    <View style={s.pickerModelWrap}>
                                        <Image source={{ uri: timerConfigManager.getModelImage(cap.model) || MODEL_IMAGES[cap.model] || (MODEL_IMAGES as any).basicred_kap }} style={s.pickerModelImg} contentFit="contain" cachePolicy="memory-disk" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.pickerItemTitle}>{cap.title}</Text>
                                        <Text style={[s.pickerItemStatus, { color: cap.status === 'opened' ? Colors.success : Colors.primary }]}>
                                            {cap.status === 'opened' ? t('detail.opened') : t('detail.sealed')}
                                        </Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={18} color={Colors.border} />
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    )}

                    {pickerStep === 'select' && (
                        <View style={{ flex: 1 }}>
                            <AnyFlashList
                                data={pickerItems}
                                numColumns={3}
                                keyExtractor={(i: any) => i.id}
                                estimatedItemSize={ITEM_SIZE}
                                renderItem={({ item }: any) => (
                                    <TouchableOpacity style={s.pickerGridCell} activeOpacity={0.8} onPress={() => { setEditingItem({ ...item, capsule: selectedPickerCapsule }); setPickerStep('edit'); }}>
                                        <Image source={{ uri: item.media_url }} style={s.pickerGridImg} cachePolicy="memory-disk" transition={200} />
                                    </TouchableOpacity>
                                )}
                                contentContainerStyle={{ gap: 2 }}
                            />
                        </View>
                    )}

                    {pickerStep === 'animation' && (
                        <View style={s.animWrap}>
                            {searching ? (
                                <View style={s.searchingWrap}>
                                    <Animated.View style={[s.searchDeck, { transform: [{ scale: searchingAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }] }]}>
                                        {[0, 1, 2].map((idx) => (
                                            <Animated.View
                                                key={idx}
                                                style={[
                                                    s.searchCard,
                                                    {
                                                        transform: [
                                                            { translateX: searchingAnim.interpolate({ inputRange: [0, 1], outputRange: [idx * 8 - 8, idx * -8 + 8] }) },
                                                            { rotate: `${idx * 5 - 5}deg` },
                                                        ],
                                                        opacity: 1 - idx * 0.22,
                                                    }
                                                ]}
                                            >
                                                <LinearGradient colors={[Colors.primary + '55', Colors.primaryDark + '88']} style={StyleSheet.absoluteFill} />
                                                <Ionicons name={idx === 0 ? 'sparkles' : 'image'} size={28} color="#fff" />
                                            </Animated.View>
                                        ))}
                                    </Animated.View>
                                    <Text style={s.animTitle}>{t('feed.reveal_msg')}</Text>
                                    <Text style={s.animSub}>{t('feed.opening_msg')}</Text>
                                </View>
                            ) : (
                                <View style={{ width: '100%', alignItems: 'center' }}>
                                    <View style={s.previewImgWrap}>
                                        <Image source={{ uri: randomPreviewItem?.media_url }} style={s.previewImg} cachePolicy="memory-disk" transition={300} />
                                        <Animated.View style={[StyleSheet.absoluteFill, { opacity: unblurAnim }]}>
                                            {Platform.OS === 'ios' ? (
                                                <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
                                            ) : (
                                                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }]} />
                                            )}
                                        </Animated.View>
                                    </View>
                                    <Text style={s.animTitle}>{t('feed.memory_surfaced')}</Text>
                                    <View style={s.previewActions}>
                                        <TouchableOpacity style={s.previewCancelBtn} activeOpacity={0.7} onPress={rejectRandomStory}>
                                            <Text style={s.previewCancelText}>{t('feed.choose_another')}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={s.previewConfirmBtn} activeOpacity={0.85} onPress={() => { setEditingItem({ ...randomPreviewItem, capsule: selectedPickerCapsule }); setPickerStep('edit'); }}>
                                            <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={s.previewConfirmGrad}>
                                                <Text style={s.previewConfirmText}>{t('feed.add_to_flash')}</Text>
                                            </LinearGradient>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}
                        </View>
                    )}

                    {pickerStep === 'edit' && editingItem && (
                        <StoryEditor
                            item={editingItem}
                            onCancel={() => setPickerStep(selectedPickerCapsule?.status === 'opened' ? 'select' : 'animation')}
                            onConfirm={meta => confirmStory(editingItem, meta)}
                        />
                    )}
                </View>
            </View>
        </Modal>
    );
});

const s = StyleSheet.create({
    pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
    pickerSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '88%', overflow: 'hidden' },
    pickerHandle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.divider, marginTop: 12, marginBottom: 4 },
    pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
    pickerTitle: { fontSize: 17, fontFamily: Fonts.bold, color: Colors.textPrimary },
    pickerNavBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
    sourceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 20 },
    sourceCard: {
        width: (width - 52) / 2,
        minHeight: 138,
        borderRadius: 20,
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        gap: 12,
    },
    sourceIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    sourceLabel: { fontSize: 14, fontFamily: Fonts.bold, color: Colors.textPrimary, textAlign: 'center' },
    pickerItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
    pickerModelWrap: { width: 48, height: 48, borderRadius: 12, backgroundColor: Colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
    pickerModelImg: { width: '80%', height: '80%' },
    pickerItemTitle: { fontSize: 15, fontFamily: Fonts.bold, color: Colors.textPrimary },
    pickerItemStatus: { fontSize: 12, fontFamily: Fonts.medium, marginTop: 2 },
    pickerGridCell: { width: width / 3, aspectRatio: 1, padding: 1 },
    pickerGridImg: { width: '100%', height: '100%' },
    animWrap: { padding: 28, alignItems: 'center' },
    searchingWrap: { alignItems: 'center', gap: 14, paddingVertical: 20 },
    searchDeck: { width: 150, height: 170, alignItems: 'center', justifyContent: 'center' },
    searchCard: {
        position: 'absolute',
        width: 118,
        height: 150,
        borderRadius: 22,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.45)',
    },
    animTitle: { fontSize: 17, fontFamily: Fonts.bold, color: Colors.textPrimary, textAlign: 'center' },
    animSub: { fontSize: 13, color: Colors.textSecondary, fontFamily: Fonts.medium, textAlign: 'center' },
    previewImgWrap: { width: '100%', height: 320, borderRadius: 20, overflow: 'hidden', marginBottom: 20 },
    previewImg: { width: '100%', height: '100%' },
    previewActions: { flexDirection: 'row', gap: 12, width: '100%' },
    previewCancelBtn: { flex: 1, height: 52, borderRadius: 16, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
    previewCancelText: { color: Colors.textSecondary, fontFamily: Fonts.semiBold, fontSize: 14 },
    previewConfirmBtn: { flex: 1, height: 52, borderRadius: 16, overflow: 'hidden' },
    previewConfirmGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    previewConfirmText: { color: '#fff', fontFamily: Fonts.bold, fontSize: 14 },
});
