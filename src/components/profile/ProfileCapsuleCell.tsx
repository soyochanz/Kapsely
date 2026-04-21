import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../../theme';
import { MODEL_IMAGES, MODEL_IMAGES_OPEN } from '../../constants/models';
import CapsuleWithTimer from '../CapsuleWithTimer';
import { timerConfigManager } from '../../utils/timerConfig';

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

    return (
        <TouchableOpacity
            style={[s.capsuleCell, !cap.isAccessible && { opacity: 0.85 }, isToday && { borderWidth: 2, borderColor: '#A855F7' }]}
            activeOpacity={0.8}
            onPress={() => {
                if (!cap.isAccessible) {
                    Alert.alert(t('profile.private_capsule'), t('profile.private_capsule_msg'));
                    return;
                }
                navigation.navigate('CapsuleDetail', { capsuleId: cap.id });
            }}
        >
            <View style={s.capsuleVisual}>
                {isSealed ? (
                    <CapsuleWithTimer
                        modelKey={cap.model}
                        source={{ uri: modelImg }}
                        date={cap.opens_at}
                        chainId={cap.chain_id}
                        isMinimal
                        style={{ width: '90%', height: '90%' }}
                    />
                ) : coverUrl ? (
                    <Image source={{ uri: coverUrl }} style={s.capsuleCoverImg} contentFit="cover" cachePolicy="memory-disk" transition={250} />
                ) : (
                    <Image source={{ uri: modelImg }} style={s.capsuleModelImg} contentFit="contain" cachePolicy="memory-disk" />
                )}

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

                {/* Lock Status */}
                <View style={[s.lockStatus, { backgroundColor: isSealed ? '#F87171' : '#4ADE80' }]}>
                    <Ionicons name={isSealed ? "lock-closed" : "lock-open"} size={10} color="#fff" />
                </View>
            </View>

            <View style={s.capsuleMeta}>
                <Text style={s.capsuleTitle} numberOfLines={1}>{cap.title || 'Untitled'}</Text>
                
                <View style={s.statsRow}>
                    <View style={s.statItem}>
                        <Ionicons name="heart" size={10} color={Colors.textMuted} />
                        <Text style={s.statText}>{likesCount}</Text>
                    </View>
                    <View style={s.statItem}>
                        <Ionicons name="chatbubble" size={10} color={Colors.textMuted} />
                        <Text style={s.statText}>{commentsCount}</Text>
                    </View>
                    <View style={s.statItem}>
                        <Ionicons name="images" size={10} color={Colors.textMuted} />
                        <Text style={s.statText}>{itemsCount}</Text>
                    </View>
                </View>

                <View style={s.timeRow}>
                    <Ionicons name="time-outline" size={10} color={Colors.textMuted} />
                    <Text style={s.timeText} numberOfLines={1}>
                        {isSealed ? (cap.opens_at ? new Date(cap.opens_at).toLocaleDateString() : t('detail.sealed')) : t('detail.opened')}
                    </Text>
                </View>
            </View>
        </TouchableOpacity>
    );
});

const s = StyleSheet.create({
    capsuleCell: {
        borderRadius: 20, backgroundColor: Colors.surface,
        borderWidth: 1, borderColor: Colors.divider,
        overflow: 'hidden',
        shadowColor: 'rgba(0,0,0,0.06)', shadowOpacity: 1,
        shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
    },
    capsuleVisual: {
        aspectRatio: 1, backgroundColor: Colors.cardAlt,
        alignItems: 'center', justifyContent: 'center',
        position: 'relative',
    },
    capsuleModelImg: { width: '90%', height: '90%' },
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

    capsuleMeta: { padding: 8, gap: 2 },
    capsuleTitle: { fontSize: 10, fontFamily: Fonts.bold, color: Colors.textPrimary },
    
    statsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 2 },
    statItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    statText: { fontSize: 9, fontFamily: Fonts.medium, color: Colors.textMuted },
    
    timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    timeText: { fontSize: 9, fontFamily: Fonts.regular, color: Colors.textMuted },
});
