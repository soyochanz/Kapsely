import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../../theme';
import { MODEL_IMAGES, MODEL_IMAGES_OPEN } from '../../constants/models';
import CapsuleWithTimer from '../CapsuleWithTimer';
import { timerConfigManager } from '../../utils/timerConfig';

const { width } = Dimensions.get('window');
const GRID_GAP = 2;
const CELL_SIZE = Math.floor((width - GRID_GAP * 4) / 3);
const CELL_META_HEIGHT = 40;

interface ProfileCapsuleCellProps {
    cap: any;
    navigation: any;
    isOwnProfile: boolean;
    isSealed: boolean;
    cfg: any;
    coverUrl?: string;
    itemsCount: number;
    likesCount: number;
    commentsCount: number;
    setPickerCapsuleId: (id: string | null) => void;
    themeColor: string;
    capsuleMediaMap: Record<string, any[]>;
    t: any;
}

export const ProfileCapsuleCell = React.memo(({
    cap, navigation, isOwnProfile, isSealed, cfg,
    coverUrl, itemsCount, likesCount, commentsCount,
    setPickerCapsuleId, themeColor, capsuleMediaMap, t
}: ProfileCapsuleCellProps) => {
    const [modelImg, setModelImg] = useState(() =>
        isSealed
            ? (timerConfigManager.getModelImage(cap.model) || MODEL_IMAGES[cap.model] || (MODEL_IMAGES as any).basicred_kap)
            : (timerConfigManager.getModelImageOpen(cap.model) || MODEL_IMAGES_OPEN[cap.model] || MODEL_IMAGES[cap.model] || (MODEL_IMAGES as any).basicred_kap)
    );

    useEffect(() => {
        const update = () => {
            setModelImg(isSealed
                ? (timerConfigManager.getModelImage(cap.model) || MODEL_IMAGES[cap.model] || (MODEL_IMAGES as any).basicred_kap)
                : (timerConfigManager.getModelImageOpen(cap.model) || MODEL_IMAGES_OPEN[cap.model] || MODEL_IMAGES[cap.model] || (MODEL_IMAGES as any).basicred_kap)
            );
        };
        return timerConfigManager.subscribe(update);
    }, [cap.model, isSealed]);

    const isToday = React.useMemo(() => {
        if (!cap.opens_at || !isSealed) return false;
        const d = new Date(cap.opens_at);
        const now = new Date();
        return d.toDateString() === now.toDateString();
    }, [cap.opens_at, isSealed]);

    const modelThemeColor = React.useMemo(() => {
        return timerConfigManager.getConfig(cap.model)?.themeColor || cfg.color || Colors.primary;
    }, [cap.model, cfg.color]);

    return (
        <TouchableOpacity
            style={[s.capsuleCell, !cap.isAccessible && { opacity: 0.85 }, isToday && { borderWidth: 2, borderColor: '#A855F7' }]}
            activeOpacity={0.8}
            onLongPress={() => {
                if (isOwnProfile && !isSealed) {
                    setPickerCapsuleId(cap.id);
                }
            }}
            onPress={() => {
                if (!cap.isAccessible) {
                    Alert.alert(t('profile.private_capsule'), t('profile.private_capsule_msg'));
                    return;
                }
                navigation.navigate('CapsuleDetail', { capsuleId: cap.id });
            }}
        >
            <View style={s.capsuleVisual}>
                <LinearGradient
                    colors={[modelThemeColor + '25', modelThemeColor + '08', Colors.cardAlt]}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                />
                {isSealed ? (
                    <CapsuleWithTimer
                        modelKey={cap.model}
                        source={{ uri: modelImg }}
                        date={cap.opens_at}
                        modelLayout={cap.model_snapshot}
                        chainId={cap.chain_id}
                        isMinimal
                        style={{ width: '90%', height: '90%' }}
                    />
                ) : (() => {
                    const effectiveCover = coverUrl || cap.cover_url;
                    if (effectiveCover) {
                        return <Image source={{ uri: effectiveCover }} style={s.capsuleCoverImg} contentFit="cover" cachePolicy="memory-disk" transition={250} recyclingKey={`prof-cover-${cap.id}`} />;
                    }
                    
                    // Search for the first media item (image or video) across all potential sources
                    const findMedia = (itemList: any[]) => {
                        if (!itemList || !itemList.length) return null;
                        return itemList.find((item: any) => {
                            const url = item?.thumbnail_url || item?.media_url;
                            const type = item?.media_type;
                            const isMedia = (type === 'image' || type === 'video' || type === 'photo');
                            return url && !url.startsWith('text://') && !url.startsWith('handwriting://') && isMedia;
                        });
                    };

                    const firstMediaItem = 
                        findMedia(cap.collage_items) || 
                        findMedia(cap.latest_item ? [cap.latest_item] : []) || 
                        findMedia(capsuleMediaMap[cap.id]);

                    const mediaUrl = firstMediaItem?.thumbnail_url || firstMediaItem?.media_url;
                    if (mediaUrl) {
                        return <Image source={{ uri: mediaUrl }} style={s.capsuleCoverImg} contentFit="cover" cachePolicy="memory-disk" transition={250} recyclingKey={`prof-media-${cap.id}`} />;
                    }
                    return <Image source={{ uri: modelImg }} style={s.capsuleModelImg} contentFit="contain" cachePolicy="memory-disk" />;
                })()}
                
                {/* Status Badges */}
                <View style={s.badgeContainer}>
                    <View style={[s.miniBadge, { backgroundColor: cfg.color }]}>
                        <Ionicons name={cfg.icon} size={8} color="#fff" />
                    </View>
                    {(cap.is_shared || cap.participant_count > 0) && (
                        <View style={[s.miniBadge, { backgroundColor: Colors.primary }]}>
                            <Ionicons name="people" size={8} color="#fff" />
                        </View>
                    )}
                </View>

                {/* Lock Status - kept subtle on image */}
                <View style={[s.lockStatus, { backgroundColor: isSealed ? '#F87171' : '#4ADE80' }]}>
                    <Ionicons name={isSealed ? "lock-closed" : "lock-open"} size={10} color="#fff" />
                </View>
            </View>

            <View style={s.capsuleMeta}>
                <Text style={s.capsuleTitle} numberOfLines={1}>{cap.title || 'Untitled'}</Text>
                
                <View style={s.statsGroup}>
                    <View style={s.statItem}>
                        <Ionicons name="heart" size={10} color="#F43F5E" />
                        <Text style={[s.statText, { color: '#F43F5E' }]}>{likesCount}</Text>
                    </View>
                    <View style={s.statItem}>
                        <Ionicons name="chatbubble" size={10} color="#0EA5E9" />
                        <Text style={[s.statText, { color: '#0EA5E9' }]}>{commentsCount}</Text>
                    </View>
                    <View style={s.statItem}>
                        <Ionicons name="images" size={10} color="#A855F7" />
                        <Text style={[s.statText, { color: '#A855F7' }]}>{itemsCount}</Text>
                    </View>
                </View>

            </View>
        </TouchableOpacity>
    );
});

const s = StyleSheet.create({
    capsuleCell: {
        width: CELL_SIZE,
        height: CELL_SIZE + CELL_META_HEIGHT,
        borderRadius: 8,
        backgroundColor: Colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: Colors.borderLight || Colors.divider,
        overflow: 'hidden',
        shadowColor: 'rgba(0,0,0,0.035)',
        shadowOpacity: 1,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
    },
    capsuleVisual: {
        height: CELL_SIZE,
        alignItems: 'center', justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
    },
    capsuleModelImg: { width: '84%', height: '84%' },
    capsuleCoverImg: { width: '100%', height: '100%' },
    
    badgeContainer: {
        position: 'absolute', top: 6, left: 6,
        flexDirection: 'row', gap: 4,
    },
    miniBadge: {
        width: 16, height: 16, borderRadius: 8,
        alignItems: 'center', justifyContent: 'center',
    },
    lockStatus: {
        position: 'absolute', top: 6, right: 6,
        width: 18, height: 18, borderRadius: 9,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: Colors.surface,
    },

    capsuleMeta: {
        height: CELL_META_HEIGHT,
        paddingHorizontal: 7,
        paddingTop: 5,
        paddingBottom: 5,
        gap: 3,
        backgroundColor: Colors.surface,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: Colors.borderLight || Colors.divider,
    },
    capsuleTitle: { fontSize: 11, fontFamily: Fonts.bold, color: Colors.textPrimary, letterSpacing: -0.2 },
    
    statsGroup: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 0 },
    statItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    statText: { fontSize: 10, fontFamily: Fonts.bold, opacity: 0.9 },

});
