import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Image, ActivityIndicator, Alert, Modal, Pressable, ScrollView, Dimensions, SafeAreaView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts, Spacing, Shadow, BorderRadius } from '../theme';
import { supabase } from '../lib/supabase';
import { useNavigation } from '@react-navigation/native';

const { width } = Dimensions.get('window');

const STICKER_POSITIONS = [
    { top: 40, left: 20, size: 70, rotation: '-15deg' },   // 1: Top Left
    { top: 25, left: width * 0.4, size: 90, rotation: '5deg' },  // 2: Top Center
    { top: 45, right: 30, size: 75, rotation: '12deg' },   // 3: Top Right
    { top: 120, left: 35, size: 65, rotation: '-8deg' },  // 4: Bottom Left
    { top: 115, right: 40, size: 85, rotation: '18deg' },  // 5: Bottom Right
];

export default function PersonalizeProfileScreen() {
    const navigation = useNavigation();
    const [loading, setLoading] = useState(true);
    const [userId, setUserId] = useState<string | null>(null);
    const [profileStickers, setProfileStickers] = useState<(any | null)[]>([null, null, null, null, null]);
    const [allStickers, setAllStickers] = useState<any[]>([]);
    const [unlockedStickerIds, setUnlockedStickerIds] = useState<Set<string>>(new Set());
    const [showPicker, setShowPicker] = useState(false);
    const [activeSlot, setActiveSlot] = useState<number | null>(null);
    const [userStats, setUserStats] = useState({ 
        maxLikes: 0, 
        totalComments: 0, 
        openedCount: 0,
        registrationDate: new Date()
    });

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setUserId(user.id);
            
            await loadData(user.id);
            setLoading(false);
        })();
    }, []);

    const loadData = async (uid: string) => {
        // Load current stickers
        const { data: current } = await supabase
            .from('profile_stickers')
            .select('*, stickers(*)')
            .eq('user_id', uid);
        
        const slots = [null, null, null, null, null];
        if (current) {
            current.forEach((ps: any) => {
                if (ps.position >= 1 && ps.position <= 5) {
                    slots[ps.position - 1] = ps.stickers;
                }
            });
        }
        setProfileStickers(slots);

        // Load unlocked stickers
        const { data: unlocked } = await supabase.from('user_stickers').select('sticker_id').eq('user_id', uid);
        const unlockedSet = new Set<string>(unlocked?.map(us => us.sticker_id) || []);
        setUnlockedStickerIds(unlockedSet);

        // Load user stats for achievement check
        const { data: profile } = await supabase.from('profiles').select('created_at').eq('id', uid).single();
        const regDate = profile?.created_at ? new Date(profile.created_at) : new Date();

        const { data: capsules } = await supabase.from('capsules').select('id, status').eq('owner_id', uid);
        const openedCount = capsules?.filter(c => c.status === 'opened').length || 0;

        const { data: likes } = await supabase.from('likes').select('capsule_id');
        const likesCountMap: any = {};
        likes?.forEach(l => {
            likesCountMap[l.capsule_id] = (likesCountMap[l.capsule_id] || 0) + 1;
        });
        const maxLikes = Math.max(0, ...Object.values(likesCountMap) as number[]);

        const { data: comments } = await supabase.from('comments').select('id').eq('user_id', uid);
        const totalComments = comments?.length || 0;
        
        setUserStats({ maxLikes, totalComments, openedCount, registrationDate: regDate });

        // Load available stickers
        const { data: stks } = await supabase.from('stickers').select('*').eq('is_active', true);
        if (stks) setAllStickers(stks);
    };

    const isUnlocked = (sticker: any) => {
        if (sticker.unlock_type === 'drop') return true;
        if (unlockedStickerIds.has(sticker.id)) return true;
        
        // Auto-unlock check
        if (sticker.unlock_type === 'likes' && userStats.maxLikes >= sticker.unlock_threshold) return true;
        if (sticker.unlock_type === 'comments' && userStats.totalComments >= sticker.unlock_threshold) return true;
        if (sticker.unlock_type === 'opened_count' && userStats.openedCount >= sticker.unlock_threshold) return true;
        
        if (sticker.unlock_type === 'pioneer') {
            const startDate = new Date('2026-03-01T00:00:00Z');
            const endDate = new Date('2026-06-01T00:00:00Z');
            return userStats.registrationDate >= startDate && userStats.registrationDate <= endDate;
        }
        
        return false;
    };

    const getUnlockMessage = (sticker: any) => {
        switch (sticker.unlock_type) {
            case 'likes': return `Get ${sticker.unlock_threshold} likes on a capsule`;
            case 'comments': return `Post ${sticker.unlock_threshold} comments`;
            case 'opened_count': return `Open ${sticker.unlock_threshold} capsules`;
            case 'pioneer': return 'Register between 01/03/26 - 01/06/26';
            case 'drop': return 'Drop Sticker';
            default: return 'Locked';
        }
    };

    const handleSelectSticker = async (sticker: any) => {
        if (activeSlot === null || !userId) return;
        
        try {
            const pos = activeSlot + 1;
            if (sticker === null) {
                await supabase.from('profile_stickers').delete().eq('user_id', userId).eq('position', pos);
            } else {
                if (!isUnlocked(sticker)) {
                    Alert.alert('Locked', getUnlockMessage(sticker));
                    return;
                }

                // If it's an achievement sticker not yet in user_stickers, add it
                if (sticker.unlock_type !== 'drop' && !unlockedStickerIds.has(sticker.id)) {
                    await supabase.from('user_stickers').insert({ user_id: userId, sticker_id: sticker.id });
                }

                await supabase.from('profile_stickers').upsert({
                    user_id: userId,
                    sticker_id: sticker.id,
                    position: pos,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id,position' });
            }
            
            await loadData(userId);
            setShowPicker(false);
        } catch (e: any) {
            Alert.alert('Error', e.message);
        }
    };

    if (loading) {
        return (
            <View style={styles.loadingCenter}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <SafeAreaView style={styles.headerArea}>
                <View style={styles.header}>
                    <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Personalize Profile</Text>
                    <View style={{ width: 40 }} />
                </View>
            </SafeAreaView>

            <ScrollView contentContainerStyle={styles.scroll}>
                <Text style={styles.sectionTitle}>Profile Banner</Text>
                <Text style={styles.sectionSub}>Tap a slot to add or change a sticker</Text>

                <View style={styles.bannerPreview}>
                    <LinearGradient 
                        colors={['#c59dff', '#a66eff', '#7938ff']} 
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} 
                        style={styles.bannerBackground}
                    />
                    
                    {STICKER_POSITIONS.map((pos, i) => {
                        const sticker = profileStickers[i];
                        return (
                            <TouchableOpacity 
                                key={i}
                                activeOpacity={0.8}
                                style={[
                                    styles.stickerSlot, 
                                    { 
                                        top: pos.top, 
                                        left: (pos as any).left, 
                                        right: (pos as any).right, 
                                        width: pos.size, 
                                        height: pos.size,
                                        transform: [{ rotate: pos.rotation }]
                                    },
                                    !sticker && styles.stickerSlotEmpty
                                ]}
                                onPress={() => {
                                    setActiveSlot(i);
                                    setShowPicker(true);
                                }}
                            >
                                {sticker ? (
                                    <Image source={{ uri: sticker.image_url }} style={styles.stickerImg} resizeMode="contain" />
                                ) : (
                                    <View style={styles.addCircle}>
                                        <Ionicons name="add" size={20} color="#fff" />
                                    </View>
                                )}
                            </TouchableOpacity>
                        )
                    })}
                </View>

                <View style={styles.tipsSection}>
                    <Ionicons name="information-circle-outline" size={20} color={Colors.textMuted} />
                    <Text style={styles.tipsText}>
                        Your stickers will be visible to everyone on your profile banner.
                    </Text>
                </View>
            </ScrollView>

            <Modal visible={showPicker} transparent animationType="slide" onRequestClose={() => setShowPicker(false)}>
                <Pressable style={styles.modalOverlay} onPress={() => setShowPicker(false)}>
                    <Pressable style={styles.modalSheet}>
                        <View style={styles.modalHandle} />
                        <View style={styles.modalHeaderRow}>
                            <Text style={styles.modalTitle}>Select a Sticker</Text>
                            <TouchableOpacity activeOpacity={0.7} onPress={() => setShowPicker(false)}>
                                <Ionicons name="close" size={24} color={Colors.textPrimary} />
                            </TouchableOpacity>
                        </View>
                        
                        <ScrollView contentContainerStyle={styles.stickerPickerGrid} showsVerticalScrollIndicator={false}>
                            <TouchableOpacity 
                                style={styles.stickerOption} 
                                activeOpacity={0.7}
                                onPress={() => handleSelectSticker(null)}
                            >
                                <View style={[styles.stickerOptionIcon, { backgroundColor: '#f5f5f5' }]}>
                                    <Ionicons name="trash-outline" size={26} color={Colors.error} />
                                </View>
                                <Text style={styles.stickerRemoveText}>Remove</Text>
                            </TouchableOpacity>

                            {allStickers.map(s => {
                                const unlocked = isUnlocked(s);
                                return (
                                    <TouchableOpacity 
                                        key={s.id} 
                                        style={[styles.stickerOption, !unlocked && styles.stickerOptionLocked]}
                                        onPress={() => handleSelectSticker(s)}
                                        activeOpacity={unlocked ? 0.7 : 1}
                                    >
                                        <View style={styles.stickerImgWrapper}>
                                            <Image 
                                                source={{ uri: s.image_url }} 
                                                style={[styles.stickerOptionImg, !unlocked && styles.grayscale]} 
                                                resizeMode="contain" 
                                            />
                                            {!unlocked && (
                                                <View style={styles.lockOverlay}>
                                                    <Ionicons name="lock-closed" size={20} color="#fff" />
                                                </View>
                                            )}
                                        </View>
                                        <Text style={styles.stickerOptionName}>{s.name}</Text>
                                        {!unlocked && (
                                            <Text style={styles.unlockHint}>{getUnlockMessage(s)}</Text>
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </Pressable>
                </Pressable>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    headerArea: { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 56 },
    backBtn: { width: 40, height: 40, justifyContent: 'center' },
    headerTitle: { fontSize: 18, fontFamily: Fonts.semiBold, color: Colors.textPrimary },
    scroll: { padding: 20 },
    sectionTitle: { fontSize: 20, fontFamily: Fonts.bold, color: Colors.textPrimary, marginBottom: 4 },
    sectionSub: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textMuted, marginBottom: 25 },
    bannerPreview: {
        width: '100%',
        height: 220,
        borderRadius: 24,
        overflow: 'hidden',
        backgroundColor: Colors.surface,
        ...Shadow.lg,
        position: 'relative',
    },
    bannerBackground: { ...StyleSheet.absoluteFillObject },
    stickerSlot: {
        position: 'absolute',
        zIndex: 5,
        justifyContent: 'center',
        alignItems: 'center',
    },
    stickerSlotEmpty: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 15,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.4)',
        borderStyle: 'dashed',
    },
    addCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.3)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    stickerImg: { width: '100%', height: '100%' },
    tipsSection: {
        flexDirection: 'row',
        marginTop: 30,
        backgroundColor: Colors.surface,
        padding: 16,
        borderRadius: 16,
        gap: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.border,
    },
    tipsText: { flex: 1, fontSize: 13, fontFamily: Fonts.medium, color: Colors.textSecondary, lineHeight: 18 },
    
    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    modalSheet: { 
        backgroundColor: Colors.surface, 
        borderTopLeftRadius: 30, borderTopRightRadius: 30, 
        padding: 24, maxHeight: '80%' 
    },
    modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 20 },
    modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 20, fontFamily: Fonts.bold, color: Colors.textPrimary },
    stickerPickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, paddingBottom: 40 },
    stickerOption: { width: (width - 80) / 3, alignItems: 'center', gap: 8, marginBottom: 12 },
    stickerOptionIcon: { width: 70, height: 70, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    stickerOptionImg: { width: 70, height: 70 },
    stickerOptionName: { fontSize: 13, fontFamily: Fonts.bold, color: Colors.textPrimary, textAlign: 'center' },
    stickerRemoveText: { fontSize: 12, fontFamily: Fonts.bold, color: Colors.error },
    stickerOptionLocked: { opacity: 0.8 },
    stickerImgWrapper: { position: 'relative', width: 70, height: 70 },
    lockOverlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    grayscale: { tintColor: 'rgba(0,0,0,0.5)', opacity: 0.6 },
    unlockHint: { fontSize: 10, fontFamily: Fonts.medium, color: Colors.textMuted, textAlign: 'center', marginTop: 2 },
});
