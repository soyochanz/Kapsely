import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts } from '../../theme';
import { timerConfigManager } from '../../utils/timerConfig';
import { MODEL_IMAGES } from '../../constants/models';

const { width } = Dimensions.get('window');
const GRID_SIZE = width / 3 - 2;

interface CapsuleGridItemProps {
    item: any;
    onPress: (item: any) => void;
    coverUrl?: string;
    t: any;
}

export const CapsuleGridItem = React.memo(({ item, onPress, coverUrl, t }: CapsuleGridItemProps) => {
    const isSealed = item.status === 'sealed';
    const isLegacy = item.type === 'legacycap';
    const isMemory = item.type === 'memorycap';
    const isShared = item.is_shared || item.participant_count > 0;

    return (
        <TouchableOpacity 
            style={s.container} 
            activeOpacity={0.85} 
            onPress={() => onPress(item)}
        >
            <View style={s.card}>
                {coverUrl ? (
                    <Image 
                        source={{ uri: coverUrl }} 
                        style={s.cover} 
                        cachePolicy="memory-disk"
                        transition={200}
                    />
                ) : (
                    <View style={[s.placeholder, { backgroundColor: Colors.cardAlt }]}>
                        <Image 
                            source={{ uri: timerConfigManager.getModelImage(item.model) || MODEL_IMAGES[item.model] || (MODEL_IMAGES as any).basicred_kap }} 
                            style={s.modelImg}
                            contentFit="contain"
                        />
                    </View>
                )}

                <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.85)']}
                    style={s.overlay}
                />

                <View style={s.content}>
                    <Text style={s.title} numberOfLines={1}>{item.title}</Text>
                    <View style={s.metaRow}>
                        {isSealed ? (
                            <View style={s.badge}>
                                <Ionicons name="lock-closed" size={10} color="#fff" />
                                <Text style={s.badgeText}>{t('detail.sealed')}</Text>
                            </View>
                        ) : (
                            <View style={[s.badge, { backgroundColor: Colors.success + '40' }]}>
                                <Ionicons name="lock-open" size={10} color={Colors.success} />
                                <Text style={[s.badgeText, { color: Colors.success }]}>{t('detail.opened')}</Text>
                            </View>
                        )}
                        {isShared && (
                            <Ionicons name="people" size={12} color="#fff" style={{ opacity: 0.8 }} />
                        )}
                    </View>
                </View>

                {isLegacy && (
                    <View style={s.legacyBadge}>
                        <Ionicons name="star" size={10} color="#FFD700" />
                    </View>
                )}
            </View>
        </TouchableOpacity>
    );
});

const s = StyleSheet.create({
    container: {
        width: GRID_SIZE,
        height: GRID_SIZE * 1.3,
        margin: 1,
    },
    card: {
        flex: 1,
        borderRadius: 12,
        backgroundColor: Colors.card,
        overflow: 'hidden',
    },
    cover: {
        width: '100%',
        height: '100%',
    },
    placeholder: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modelImg: {
        width: '60%',
        height: '60%',
        opacity: 0.5,
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        top: '40%',
    },
    content: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 8,
    },
    title: {
        fontSize: 12,
        fontFamily: Fonts.bold,
        color: '#fff',
        marginBottom: 4,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 5,
        paddingVertical: 2,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.15)',
    },
    badgeText: {
        fontSize: 9,
        fontFamily: Fonts.bold,
        color: '#fff',
    },
    legacyBadge: {
        position: 'absolute',
        top: 6,
        right: 6,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
