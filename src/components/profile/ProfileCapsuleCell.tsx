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

                <View style={[s.capsuleTypeDot, { backgroundColor: cfg.color }]}>
                    <Ionicons name={cfg.icon} size={10} color="#fff" />
                </View>

                {(cap.is_shared || cap.participant_count > 0) && (
                    <View style={s.capsuleSharedDot}>
                        <Ionicons name="people" size={10} color="#fff" />
                    </View>
                )}

                {!isSealed && isOwnProfile && (
                    <TouchableOpacity
                        style={s.capsuleLockOverlay}
                        activeOpacity={0.7}
                        onPress={() => setPickerCapsuleId(cap.id)}
                    >
                        <Ionicons name="image" size={12} color="#fff" />
                    </TouchableOpacity>
                )}
            </View>

            <View style={s.capsuleMeta}>
                <Text style={s.capsuleTitle} numberOfLines={1}>{cap.title || 'Untitled'}</Text>
                {isSealed ? (
                    <Text style={[s.capsuleTimer, { color: themeColor }]}>{t('detail.sealed')}</Text>
                ) : (
                    <Text style={s.capsuleOpenedTag}>{t('detail.opened')}</Text>
                )}
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
    capsuleModelImg: { width: '95%', height: '95%' },
    capsuleCoverImg: { width: '100%', height: '100%' },
    capsuleTypeDot: {
        position: 'absolute', top: 8, left: 8,
        width: 18, height: 18, borderRadius: 9,
        alignItems: 'center', justifyContent: 'center',
    },
    capsuleSharedDot: {
        position: 'absolute', top: 8, left: 30,
        width: 18, height: 18, borderRadius: 9,
        backgroundColor: Colors.primary,
        alignItems: 'center', justifyContent: 'center',
    },
    capsuleLockOverlay: {
        position: 'absolute', bottom: 8, right: 8,
        width: 20, height: 20, borderRadius: 10,
        backgroundColor: 'rgba(0,0,0,0.38)',
        alignItems: 'center', justifyContent: 'center',
    },
    capsuleMeta: { padding: 9, paddingTop: 7 },
    capsuleTitle: { fontSize: 11, fontFamily: Fonts.bold, color: Colors.textPrimary, marginBottom: 2 },
    capsuleTimer: { fontSize: 8.5, fontFamily: Fonts.semiBold, color: Colors.primary },
    capsuleOpenedTag: { fontSize: 8.5, fontFamily: Fonts.bold, color: Colors.textMuted, letterSpacing: 0.5 },
});
