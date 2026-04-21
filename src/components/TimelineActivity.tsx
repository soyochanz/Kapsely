import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Alert, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';


import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, BorderRadius, Spacing, Shadow } from '../theme';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { MODEL_IMAGES, MODEL_IMAGES_OPEN } from '../constants/models';
import VerifiedBadge from './VerifiedBadge';
import { timerConfigManager } from '../utils/timerConfig';

const { width } = Dimensions.get('window');

// ─ Module-level constants: never recreated on render ─
const TYPE_COLORS: Record<string, string[]> = {
    instacap:  [Colors.instaCap,  '#9b59b6'],
    eventcap:  [Colors.eventCap,  '#e67e22'],
    legacycap: [Colors.legacyCap, '#2980b9'],
    default:   [Colors.primary,   Colors.primaryDark],
};

const MEDIA_ICONS: Record<string, string> = {
    image:  'image',
    video:  'videocam',
    audio:  'mic',
    note:   'document-text',
    default:'attach',
};

const MEDIA_LABELS: Record<string, string> = {
    image:  'feed.media_types.image',
    video:  'feed.media_types.video',
    audio:  'feed.media_types.audio',
    note:   'feed.media_types.note',
    default:'feed.media_types.content',
};

// ─── Collage View (for grouped activity) ─────────────────────────────────────
const CollageView = React.memo(({ items, count, isSealed }: { items: any[]; count: number; isSealed: boolean }) => {
    const displayItems = items.slice(0, 4);
    return (
        <View style={styles.collageContainer}>
            {isSealed && displayItems.length > 0 ? (
                <Image
                    source={{ uri: displayItems[0].thumbnail_url || displayItems[0].media_url }}
                    style={StyleSheet.absoluteFill}
                    blurRadius={Platform.OS === 'ios' ? 35 : 15}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={`collage-sealed-${displayItems[0].id}`}
                />
            ) : (
                <View style={styles.collageGrid}>
                    {displayItems.map((item, idx) => (
                        <Image
                            key={item.id || idx}
                            source={{ uri: item.thumbnail_url || item.media_url }}
                            style={[
                                styles.collageImage,
                                displayItems.length === 1 && styles.collageSingle,
                                displayItems.length === 2 && styles.collageDual,
                                displayItems.length === 3 && idx === 0 && styles.collageTripleLarge,
                            ]}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                            recyclingKey={`collage-${item.id || idx}`}
                        />
                    ))}
                </View>
            )}
            {isSealed && (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.5)' }]} />
            )}
            {/* Group count badge */}
            <View style={styles.groupCountBadge}>
                <Ionicons name="layers" size={12} color="#fff" />
                <Text style={styles.groupCountText}>{count}</Text>
            </View>
        </View>
    );
});

// ─── Waveform (for audio) ────────────────────────────────────────────────────
const Waveform = React.memo(() => {
    const heights = [14, 26, 18, 32, 22, 30, 16, 12];
    return (
        <View style={styles.waveContainer}>
            {heights.map((h, i) => (
                <View key={i} style={[styles.waveBar, { height: h }]} />
            ))}
        </View>
    );
});

// ─── Media Type Badge ────────────────────────────────────────────────────────
const MediaTypeBadge = React.memo(({ type, t }: { type: string, t: any }) => {
    const icon = MEDIA_ICONS[type] ?? MEDIA_ICONS.default;
    const labelKey = MEDIA_LABELS[type] ?? MEDIA_LABELS.default;
    const label = t(labelKey);
    const isVideo = type === 'video';
    return (
        <View style={[styles.mediaTypeBadge, isVideo && { backgroundColor: 'rgba(239,68,68,0.85)' }]}>
            <Ionicons name={icon as any} size={10} color="#fff" />
            <Text style={styles.mediaTypeBadgeText}>{label.toUpperCase()}</Text>
        </View>
    );
});

interface TimelineActivityProps {
    item: any;
    currentUserId?: string | null;
    isFollowed?: boolean;
    hasAccess?: boolean;
    onFollow?: (userId: string, isFollowed: boolean) => void;
    lightweight?: boolean;
    gridMode?: boolean;
}

export default React.memo(function TimelineActivity({ 
    item, 
    currentUserId, 
    isFollowed: isFollowedProp = false,
    hasAccess: hasAccessProp = true,
    onFollow,
    lightweight,
    gridMode
}: TimelineActivityProps) {
    const { t } = useTranslation();
    const navigation = useNavigation<any>();
    const profile = item.profiles || { username: 'user', avatar_url: null };
    const capsule = Array.isArray(item.capsules) ? item.capsules[0] : (item.capsules || { title: 'Capsule', type: 'instacap', model: 'basicred_kap' });

    const isAudio = item.media_type === 'audio';
    const isNote  = item.media_type === 'note';
    const isVideo = item.media_type === 'video';
    const isGroup = item.feedType === 'activity_group';

    const typeColors = TYPE_COLORS[capsule.type] ?? TYPE_COLORS.default;
    const mediaIcon  = MEDIA_ICONS[item.media_type] ?? MEDIA_ICONS.default;

    const modelImageUri = useMemo(() => {
        if (capsule.status === 'opened') {
            return timerConfigManager.getModelImageOpen(capsule.model) || MODEL_IMAGES_OPEN[capsule.model as keyof typeof MODEL_IMAGES_OPEN] || (MODEL_IMAGES_OPEN as any).basicred_kap;
        }
        return timerConfigManager.getModelImage(capsule.model) || MODEL_IMAGES[capsule.model as keyof typeof MODEL_IMAGES] || (MODEL_IMAGES as any).basicred_kap;
    }, [capsule.model, capsule.status]);

    const handleFollow = () => {
        if (!currentUserId || currentUserId === item.owner_id) return;
        if (onFollow) onFollow(item.owner_id, isFollowedProp);
    };

    const handlePress = () => {
        if (!hasAccessProp) {
             Alert.alert(t('common.private_cap_title'), t('common.private_cap_msg'));
             return;
        }
        navigation.navigate('CapsuleDetail', { capsuleId: item.capsule_id });
    };

    const isToday = useMemo(() => {
        if (!capsule?.opens_at || capsule?.status === 'opened') return false;
        const d = new Date(capsule.opens_at);
        const now = new Date();
        return d.toDateString() === now.toDateString();
    }, [capsule?.opens_at, capsule?.status]);

    // ─── GRID MODE (Explore tab) ─────────────────────────────────────────────
    if (gridMode) {
        return (
            <TouchableOpacity
                activeOpacity={0.92}
                onPress={handlePress}
                style={[styles.gridCard, isToday && { borderWidth: 2, borderColor: '#A855F7' }]}
            >
                {/* Media area */}
                <View style={styles.gridMediaZone}>
                    {isGroup ? (
                        <CollageView items={item.groupItems} count={item.count} isSealed={capsule?.status === 'sealed'} />
                    ) : (item.media_url || item.thumbnail_url) && (item.media_type === 'image' || isVideo) ? (
                        <>
                            <Image
                                source={{ uri: item.thumbnail_url || item.media_url }}
                                style={StyleSheet.absoluteFill}
                                blurRadius={capsule?.status === 'sealed' ? (Platform.OS === 'ios' ? 45 : 22) : 0}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                                recyclingKey={`grid-${item.id}`}
                            />
                            {capsule?.status === 'sealed' && (
                                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.3)' }]} />
                            )}
                        </>
                    ) : isAudio ? (
                        <LinearGradient colors={[Colors.primaryLight, Colors.primary]} style={StyleSheet.absoluteFill} />
                    ) : isNote ? (
                        <LinearGradient colors={[Colors.cardAlt, Colors.background]} style={StyleSheet.absoluteFill} />
                    ) : (
                        <LinearGradient colors={[Colors.cardAlt, Colors.background]} style={StyleSheet.absoluteFill} />
                    )}

                    {/* Gradient overlay — lighter */}
                    <LinearGradient
                        colors={['transparent', 'rgba(0,0,0,0.25)']}
                        style={StyleSheet.absoluteFill}
                    />

                    {/* Media type badge */}
                    <MediaTypeBadge type={isGroup ? 'image' : item.media_type} t={t} />

                    {/* Video play icon */}
                    {isVideo && !isGroup && (
                        <View style={styles.gridPlayIcon}>
                            <Ionicons name="play" size={16} color="#fff" />
                        </View>
                    )}

                    {/* Audio center */}
                    {isAudio && (
                        <View style={styles.gridCenterContent}>
                            <Ionicons name="mic" size={24} color={Colors.primary} />
                        </View>
                    )}

                    {/* Note center */}
                    {isNote && capsule?.status !== 'sealed' && (
                        <View style={styles.gridCenterContent}>
                            <Text style={styles.gridNoteText} numberOfLines={3}>
                                {item.content}
                            </Text>
                        </View>
                    )}

                    {/* Sealed lock */}
                    {capsule?.status === 'sealed' && (
                        <View style={styles.gridSealedIcon}>
                            <Ionicons name="lock-closed" size={10} color={Colors.textMuted} />
                        </View>
                    )}

                    {/* Group count */}
                    {isGroup && (
                        <View style={styles.gridGroupBadge}>
                            <Ionicons name="layers" size={10} color="#fff" />
                            <Text style={styles.gridGroupText}>{item.count}</Text>
                        </View>
                    )}
                </View>

                {/* White bottom info */}
                <View style={styles.gridBottom}>
                    <View style={styles.gridAvatarRow}>
                        <Image source={{ uri: Colors.getAvatarUrl(profile.avatar_url, profile.display_name || profile.username) }} style={styles.gridAvatar} contentFit="cover" cachePolicy="memory-disk" />
                        <Text style={styles.gridUsername} numberOfLines={1}>
                            {profile.display_name || profile.username || 'user'}
                        </Text>
                        {profile.is_verified && <VerifiedBadge size={10} />}
                    </View>
                </View>
            </TouchableOpacity>
        );
    }

    // ─── CARD MODE (Following tab) ───────────────────────────────────────────
    return (
        <TouchableOpacity
            activeOpacity={0.95}
            onPress={handlePress}
            style={[styles.card, isToday && { borderWidth: 2, borderColor: '#A855F7' }]}
        >
            {/* ── Author Row ────────────────────────────────────────────── */}
            <View style={styles.authorRow}>
                <TouchableOpacity
                    style={styles.authorLeft}
                    activeOpacity={0.8}
                    onPress={() => navigation.navigate('UserProfile', { targetUserId: item.owner_id })}
                >
                    <Image source={{ uri: Colors.getAvatarUrl(profile.avatar_url, profile.display_name || profile.username) }} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" />
                    <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={styles.authorName} numberOfLines={1}>
                                {profile.display_name || profile.username || 'user'}
                            </Text>
                            {profile.is_verified && <VerifiedBadge size={13} style={{ marginLeft: 1 }} />}
                        </View>
                        <Text style={styles.activityMeta}>
                            {isGroup
                                ? t('feed.added_items', { count: item.count })
                                : t('feed.added_media', { type: t(MEDIA_LABELS[item.media_type] || MEDIA_LABELS.default).toLowerCase() })
                            }
                        </Text>
                    </View>
                </TouchableOpacity>

                {/* Follow button */}
                {currentUserId && currentUserId !== item.owner_id && (
                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={handleFollow}
                        style={[styles.followBtn, isFollowedProp && styles.followBtnActive]}
                    >
                        <Text style={[styles.followBtnText, isFollowedProp && styles.followBtnTextActive]}>
                            {isFollowedProp ? t('common.following') : t('common.follow')}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* ── Media Area ────────────────────────────────────────────── */}
            <View style={styles.mediaArea}>
                {isGroup ? (
                    <CollageView items={item.groupItems} count={item.count} isSealed={capsule?.status === 'sealed'} />
                ) : (item.media_url || item.thumbnail_url) && (item.media_type === 'image' || isVideo) ? (
                    <>
                        <Image
                            source={{ uri: item.thumbnail_url || item.media_url }}
                            style={styles.mediaImage}
                            blurRadius={capsule?.status === 'sealed' ? (Platform.OS === 'ios' ? 45 : 22) : 0}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                            recyclingKey={`card-${item.id}`}
                        />
                        {capsule?.status === 'sealed' && (
                            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.4)' }]} />
                        )}
                    </>
                ) : isAudio ? (
                    <LinearGradient colors={['#a269ff', '#7938ff']} style={styles.mediaGradient}>
                        <View style={styles.audioCenter}>
                            <View style={styles.audioCircle}>
                                <Ionicons name="mic-outline" size={28} color="#fff" />
                            </View>
                            <Waveform />
                        </View>
                    </LinearGradient>
                ) : isNote ? (
                    <LinearGradient colors={['#c59dff', '#a269ff']} style={styles.mediaGradient}>
                        {capsule?.status === 'sealed' ? (
                            <View style={styles.sealedNoteCenter}>
                                <Ionicons name="lock-closed-outline" size={24} color="rgba(255,255,255,0.6)" />
                                <Text style={styles.sealedNoteLabel}>{t('feed.encrypted_thought')}</Text>
                            </View>
                        ) : (
                            <View style={styles.noteCenter}>
                                <Ionicons name="document-text-outline" size={22} color="rgba(255,255,255,0.5)" style={{ marginBottom: 10 }} />
                                <Text style={styles.noteText} numberOfLines={5}>{item.content}</Text>
                            </View>
                        )}
                    </LinearGradient>
                ) : (
                    <LinearGradient colors={typeColors as any} style={styles.mediaGradient} />
                )}

                {/* Video play overlay */}
                {isVideo && !isGroup && (
                    <View style={styles.videoPlayOverlay}>
                        <View style={styles.playCircle}>
                            <Ionicons name="play" size={24} color="#fff" style={{ marginLeft: 2 }} />
                        </View>
                    </View>
                )}

                {/* Media type badge */}
                <MediaTypeBadge type={isGroup ? 'image' : item.media_type} t={t} />

                {/* Sealed lock */}
                {capsule?.status === 'sealed' && (
                    <View style={styles.sealedBadge}>
                        <Ionicons name="lock-closed" size={11} color="#fff" />
                    </View>
                )}
            </View>

            {/* ── Bottom Info Bar ───────────────────────────────────────── */}
            <View style={styles.bottomBar}>
                {/* Capsule info */}
                <View style={styles.capsuleRow}>
                    <Image
                        source={{ uri: modelImageUri }}
                        style={styles.capsuleMiniImg}
                        contentFit="contain"
                        cachePolicy="memory-disk"
                    />
                    <View style={{ flex: 1 }}>
                        <Text style={styles.capsuleTitle} numberOfLines={1}>{capsule.title}</Text>
                        <Text style={styles.capsuleType}>{capsule.type?.replace('cap', '') || 'capsule'}</Text>
                    </View>
                    {!hasAccessProp && (
                        <Ionicons name="lock-closed" size={12} color={Colors.error} style={{ marginLeft: 4 }} />
                    )}
                </View>
            </View>
        </TouchableOpacity>
    );
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const GRID_GAP = 2;
const GRID_COLS = 2;
const GRID_ITEM_WIDTH = (width - Spacing.md * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;

const styles = StyleSheet.create({
    // ── Card Mode (Following) ────────────────────────────────────────────────
    card: {
        marginHorizontal: Spacing.md,
        marginBottom: 14,
        borderRadius: 20,
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.border,
        overflow: 'hidden',
        ...Platform.select({
            ios: { shadowColor: 'rgba(0,0,0,0.06)', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 1, shadowRadius: 10 },
            android: { elevation: 2 },
        }),
    },

    authorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    authorLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flex: 1,
        minWidth: 0,
    },
    avatar: {
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: 1.5,
        borderColor: Colors.border,
    },
    avatarPlaceholder: {
        backgroundColor: Colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    authorName: {
        fontSize: 13,
        fontFamily: Fonts.bold,
        color: Colors.textPrimary,
    },
    activityMeta: {
        fontSize: 11,
        fontFamily: Fonts.medium,
        color: Colors.textMuted,
        marginTop: 1,
    },

    followBtn: {
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: Colors.primary,
        marginLeft: 8,
    },
    followBtnActive: {
        borderColor: Colors.border,
        backgroundColor: Colors.cardAlt,
    },
    followBtnText: {
        fontSize: 11,
        fontFamily: Fonts.bold,
        color: Colors.primary,
    },
    followBtnTextActive: {
        color: Colors.textMuted,
    },

    // Media Area
    mediaArea: {
        width: '100%',
        height: 300,
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: Colors.cardAlt,
    },
    mediaImage: {
        width: '100%',
        height: '100%',
    },
    mediaGradient: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Video
    videoPlayOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
    },
    playCircle: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: 'rgba(0,0,0,0.32)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.45)',
    },

    // Audio
    audioCenter: {
        alignItems: 'center',
        gap: 16,
    },
    audioCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    waveContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        height: 34,
    },
    waveBar: {
        width: 3.5,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.7)',
    },

    // Note
    noteCenter: {
        padding: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    noteText: {
        fontSize: 16,
        fontFamily: Fonts.medium,
        color: '#fff',
        lineHeight: 24,
        textAlign: 'center',
        fontStyle: 'italic',
    },
    sealedNoteCenter: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
    },
    sealedNoteLabel: {
        fontSize: 10,
        fontFamily: Fonts.bold,
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: 2.5,
    },

    // Media type badge
    mediaTypeBadge: {
        position: 'absolute',
        top: 10,
        left: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    mediaTypeBadgeText: {
        fontSize: 10,
        fontFamily: Fonts.bold,
        color: '#fff',
    },

    // Sealed badge
    sealedBadge: {
        position: 'absolute',
        top: 10,
        right: 10,
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: 'rgba(0,0,0,0.4)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },

    // Bottom bar
    bottomBar: {
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    capsuleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    capsuleMiniImg: {
        width: 32,
        height: 32,
    },
    capsuleTitle: {
        fontSize: 13,
        fontFamily: Fonts.bold,
        color: Colors.textPrimary,
    },
    capsuleType: {
        fontSize: 10,
        fontFamily: Fonts.medium,
        color: Colors.textMuted,
        textTransform: 'capitalize',
        marginTop: 1,
    },

    // ── Grid Mode (Explore) ──────────────────────────────────────────────────
    gridCard: {
        width: GRID_ITEM_WIDTH,
        borderRadius: 18,
        overflow: 'hidden',
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.border,
        ...Platform.select({
            ios: { shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 1, shadowRadius: 10 },
            android: { elevation: 3 },
        }),
    },

    gridMediaZone: {
        height: GRID_ITEM_WIDTH * 0.85,
        position: 'relative',
        overflow: 'hidden',
    },

    gridPlayIcon: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        marginTop: -16,
        marginLeft: -16,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(0,0,0,0.4)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.4)',
    },

    gridCenterContent: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 14,
    },

    gridNoteText: {
        fontSize: 11,
        fontFamily: Fonts.medium,
        color: Colors.textSecondary,
        textAlign: 'center',
        lineHeight: 16,
        fontStyle: 'italic',
    },

    gridSealedIcon: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: Colors.cardAlt,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: Colors.border,
    },

    gridGroupBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 12,
        backgroundColor: 'rgba(0,0,0,0.45)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    gridGroupText: {
        fontSize: 10,
        fontFamily: Fonts.bold,
        color: '#fff',
    },

    gridBottom: {
        paddingHorizontal: 10,
        paddingVertical: 8,
        backgroundColor: Colors.surface,
        borderTopWidth: 1,
        borderTopColor: Colors.borderLight,
    },
    gridAvatarRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    gridAvatar: {
        width: 16,
        height: 16,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    gridUsername: {
        fontSize: 10,
        fontFamily: Fonts.bold,
        color: Colors.textPrimary,
        flex: 1,
    },

    // ── Collage ──────────────────────────────────────────────────────────────
    collageContainer: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    collageGrid: {
        flex: 1,
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    collageImage: {
        width: '50%',
        height: '50%',
    },
    collageSingle: {
        width: '100%',
        height: '100%',
    },
    collageDual: {
        width: '50%',
        height: '100%',
    },
    collageTripleLarge: {
        width: '100%',
        height: '50%',
    },

    groupCountBadge: {
        position: 'absolute',
        bottom: 10,
        right: 10,
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingHorizontal: 9,
        paddingVertical: 5,
        borderRadius: 999,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    groupCountText: {
        color: '#fff',
        fontSize: 12,
        fontFamily: Fonts.bold,
    },
});
