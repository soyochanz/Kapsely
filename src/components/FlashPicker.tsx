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
import { supabase } from '../lib/supabase';
import { Colors, Fonts, Spacing } from '../theme';
import { MODEL_IMAGES } from '../constants/models';
import { timerConfigManager } from '../utils/timerConfig';
import StoryEditor from './StoryEditor';

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
    const [pickerStep, setPickerStep] = useState<'list' | 'select' | 'animation' | 'edit'>('list');
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
        
        try {
            const globalPickKey = `@flash_global_pick_${currentUserId}`;
            const saved = await AsyncStorage.getItem(globalPickKey);
            if (saved) {
                const { capsule: savedCap, item: savedItem } = JSON.parse(saved);
                setSelectedPickerCapsule(savedCap);
                setRandomPreviewItem(savedItem);
                setSearching(false);
                setPickerStep('animation');
                return;
            }
        } catch (e) { }

        const participantIds = Array.from(participantCapsules);
        const conditions = [`owner_id.eq.${currentUserId}`];
        if (participantIds.length > 0) conditions.push(`id.in.(${participantIds.join(',')})`);
        
        const { data } = await supabase.from('capsules')
            .select('*, profiles:owner_id(username, display_name, avatar_url)')
            .or(conditions.join(','))
            .order('created_at', { ascending: false });
            
        if (data && data.length > 0) {
            const filtered = data.filter(cap => 
                cap.status === 'sealed' || (cap.status === 'opened' && cap.duration_days === 0)
            );
            
            if (filtered.length > 0) {
                setUserCapsules(filtered);
                setPickerStep('list');
            } else {
                Alert.alert(t('common.warning'), t('feed.no_capsules_yet') || 'No capsules available for sharing.');
                onClose();
            }
        } else {
            Alert.alert(t('common.warning'), t('feed.no_capsules_yet'));
            onClose();
        }
    };

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
        
        setPickerStep('animation');
        const storageKey = `@flash_selection_${currentUserId}_${capsule.id}`;
        const savedId = await AsyncStorage.getItem(storageKey);
        const savedItem = items.find(i => i.id === savedId);
        
        if (savedItem) {
            setSearching(false);
            setRandomPreviewItem(savedItem);
            unblurAnim.setValue(0);
            try {
                const globalPickKey = `@flash_global_pick_${currentUserId}`;
                await AsyncStorage.setItem(globalPickKey, JSON.stringify({ capsule, item: savedItem }));
            } catch (e) { }
        } else {
            setSearching(true);
            Animated.loop(Animated.sequence([
                Animated.timing(searchingAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
                Animated.timing(searchingAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
            ])).start();
            
            setTimeout(async () => {
                const random = items[Math.floor(Math.random() * items.length)];
                setRandomPreviewItem(random);
                try {
                    await AsyncStorage.setItem(storageKey, random.id);
                    const globalPickKey = `@flash_global_pick_${currentUserId}`;
                    await AsyncStorage.setItem(globalPickKey, JSON.stringify({ capsule, item: random }));
                } catch (e) { }
                setSearching(false);
                searchingAnim.stopAnimation();
                unblurAnim.setValue(1);
                Animated.timing(unblurAnim, { toValue: 0, duration: 3500, useNativeDriver: true, easing: Easing.out(Easing.cubic) }).start();
            }, 2500);
        }
    }, [t, currentUserId]);

    const rejectRandomStory = useCallback(async () => {
        try {
            await AsyncStorage.removeItem(`@flash_global_pick_${currentUserId}`);
        } catch (e) { }
        setPickerStep('list');
    }, [currentUserId]);

    const confirmStory = useCallback(async (item: any, metadata: any = {}) => {
        try {
            await AsyncStorage.removeItem(`@flash_global_pick_${currentUserId}`);
        } catch (e) { }
        
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 48);
        
        const { data: cap } = await supabase.from('capsules').select('status').eq('id', item.capsule_id).single();
        const { error } = await supabase.from('capsule_items').insert({
            owner_id: currentUserId,
            capsule_id: item.capsule_id,
            media_url: item.media_url || `empty-story://${Date.now()}`,
            media_type: item.media_type || 'image',
            is_story: true,
            is_mystery: cap?.status === 'sealed',
            expires_at: expiresAt.toISOString(),
            metadata,
        });
        
        if (!error) {
            try {
                await AsyncStorage.removeItem(`@flash_selection_${currentUserId}_${item.capsule_id}`);
            } catch (e) { }
            onClose();
            setEditingItem(null);
            setPickerStep('list');
            onStoryPublished();
        } else {
            Alert.alert(t('common.error'), t('feed.share_error'));
        }
    }, [currentUserId, t, onStoryPublished, onClose]);

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={s.pickerOverlay}>
                <View style={[
                    s.pickerSheet, 
                    (pickerStep === 'edit' || pickerStep === 'animation' || pickerStep === 'select' || pickerStep === 'list') && { height: height * (pickerStep === 'edit' ? 1 : 0.85) },
                    pickerStep === 'edit' && { borderTopLeftRadius: 0, borderTopRightRadius: 0 }
                ]}>
                    {pickerStep !== 'edit' && <View style={s.pickerHandle} />}
                    {pickerStep !== 'edit' && (
                        <View style={s.pickerHeader}>
                            {pickerStep !== 'list' && (
                                <TouchableOpacity onPress={() => pickerStep === 'animation' ? rejectRandomStory() : setPickerStep('list')} style={s.pickerNavBtn} activeOpacity={0.7}>
                                    <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
                                </TouchableOpacity>
                            )}
                            <Text style={s.pickerTitle}>
                                {pickerStep === 'list' ? t('feed.share_flash') : pickerStep === 'select' ? t('feed.choose_image') : t('feed.discovering')}
                            </Text>
                            <TouchableOpacity onPress={() => pickerStep === 'animation' ? rejectRandomStory() : onClose()} style={s.pickerNavBtn} activeOpacity={0.7}>
                                <Ionicons name="close" size={22} color={Colors.textMuted} />
                            </TouchableOpacity>
                        </View>
                    )}

                    {pickerStep === 'list' && (
                        <ScrollView style={{ flex: 1 }}>
                            {userCapsules.map(cap => (
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
                            <FlashList
                                data={pickerItems}
                                numColumns={3}
                                keyExtractor={i => i.id}
                                estimatedItemSize={ITEM_SIZE}
                                renderItem={({ item }) => (
                                    <TouchableOpacity style={s.pickerGridCell} activeOpacity={0.8} onPress={() => { setEditingItem(item); setPickerStep('edit'); }}>
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
                                    <Animated.View style={{ transform: [{ scale: searchingAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] }) }] }}>
                                        <Ionicons name="rocket-outline" size={60} color={Colors.primary} />
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
                                        <TouchableOpacity style={s.previewConfirmBtn} activeOpacity={0.85} onPress={() => { setEditingItem(randomPreviewItem); setPickerStep('edit'); }}>
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
    pickerItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
    pickerModelWrap: { width: 48, height: 48, borderRadius: 12, backgroundColor: Colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
    pickerModelImg: { width: '80%', height: '80%' },
    pickerItemTitle: { fontSize: 15, fontFamily: Fonts.bold, color: Colors.textPrimary },
    pickerItemStatus: { fontSize: 12, fontFamily: Fonts.medium, marginTop: 2 },
    pickerGridCell: { width: width / 3, aspectRatio: 1, padding: 1 },
    pickerGridImg: { width: '100%', height: '100%' },
    animWrap: { padding: 28, alignItems: 'center' },
    searchingWrap: { alignItems: 'center', gap: 14, paddingVertical: 20 },
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
