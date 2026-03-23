import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Dimensions, Alert, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, BorderRadius, Spacing, Shadow } from '../theme';
import { useNavigation } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import LiveTimer from './LiveTimer';
import CapsuleWithTimer from './CapsuleWithTimer';
import { timerConfigManager } from '../utils/timerConfig';
import { MODEL_IMAGES, MODEL_IMAGES_OPEN } from '../constants/models';
import VerifiedBadge from './VerifiedBadge';

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
    audio:  'stats-chart',
    note:   'document-text',
    default:'attach',
};

const CollageView = ({ items, count, isSealed }: { items: any[], count: number, isSealed: boolean }) => {
    const displayItems = items.slice(0, 4);
    return (
        <View style={styles.collageContainer}>
            {isSealed && displayItems.length > 0 ? (
                <Image
                    source={{ uri: displayItems[0].thumbnail_url || displayItems[0].media_url }}
                    style={StyleSheet.absoluteFill}
                    blurRadius={Platform.OS === 'ios' ? 12 : 30}
                    resizeMode="cover"
                />
            ) : (
                <View style={styles.collageGrid}>
                    {displayItems.map((item, idx) => (
                        <Image
                            key={idx}
                            source={{ uri: item.thumbnail_url || item.media_url }}
                            style={[
                                styles.collageImage,
                                displayItems.length === 1 && styles.collageSingle,
                                displayItems.length === 2 && styles.collageDual,
                                displayItems.length === 3 && idx === 0 && styles.collageTripleLarge,
                            ]}
                            resizeMode="cover"
                        />
                    ))}
                </View>
            )}
            {isSealed && <BlurView intensity={45} tint="light" style={StyleSheet.absoluteFill} />}
            {/* Group count badge — bottom right, smaller & premium */}
            <View style={styles.groupCountBadge}>
                <Ionicons name="images" size={14} color="#fff" />
                <Text style={styles.groupCountText}>+{count}</Text>
            </View>
        </View>
    );
};

interface TimelineActivityProps {
    item: any;
}

const Waveform = ({ active = true }: { active?: boolean }) => {
    // Stable random-looking heights for the waveform
    const heights = [18, 32, 24, 38, 28, 35, 22, 16];
    return (
        <View style={styles.waveContainer}>
            {heights.map((h, i) => (
                <View 
                    key={i} 
                    style={[
                        styles.waveBar, 
                        { 
                            height: h,
                            opacity: active ? 1 : 0.5,
                            backgroundColor: '#fff'
                        }
                    ]} 
                />
            ))}
        </View>
    );
};

export default React.memo(function TimelineActivity({ item }: TimelineActivityProps) {
    const navigation = useNavigation<any>();
    const profile = item.profiles || { username: 'user', avatar_url: null };
    const capsule = Array.isArray(item.capsules) ? item.capsules[0] : (item.capsules || { title: 'Capsule', type: 'instacap', model: 'basicred_kap' });

    const isAudio = item.media_type === 'audio';
    const isNote  = item.media_type === 'note';

    // Simple map lookups — no function call, no recreated objects per render
    const typeColors = TYPE_COLORS[capsule.type] ?? TYPE_COLORS.default;
    const mediaIcon  = MEDIA_ICONS[item.media_type] ?? MEDIA_ICONS.default;

    // Determine access
    const [currentUserId, setCurrentUserId] = React.useState<string | null>(null);
    const [hasAccess, setHasAccess] = React.useState(true);
    const [isFollowed, setIsFollowed] = useState(false);

    React.useEffect(() => {
        const checkAccess = async () => {
             const { data: { user } } = await supabase.auth.getUser();
             if (user) {
                 setCurrentUserId(user.id);
                 const access = capsule.is_public || capsule.owner_id === user.id || item.owner_id === user.id || capsule.is_participant;
                 setHasAccess(!!access);
                 // Check follow status
                 if (user.id !== item.owner_id) {
                     const { data: followData } = await supabase.from('follows').select('id').eq('follower_id', user.id).eq('following_id', item.owner_id).maybeSingle();
                     setIsFollowed(!!followData);
                 }
             } else {
                 setHasAccess(!!capsule.is_public);
             }
        };
        checkAccess();
    }, [capsule.id, item.owner_id]);

    const handleFollow = async () => {
        if (!currentUserId || currentUserId === item.owner_id) return;
        if (isFollowed) {
            await supabase.from('follows').delete().eq('follower_id', currentUserId).eq('following_id', item.owner_id);
            setIsFollowed(false);
        } else {
            await supabase.from('follows').insert({ follower_id: currentUserId, following_id: item.owner_id });
            setIsFollowed(true);
        }
    };

    const handlePress = () => {
        if (!hasAccess) {
             Alert.alert("Private Capsule", "You haven't been invited to this capsule yet.");
             return;
        }
        navigation.navigate('CapsuleDetail', { capsuleId: item.capsule_id });
    };

    return (
        <TouchableOpacity
            activeOpacity={0.95}
            onPress={handlePress}
            style={styles.card}
        >
        {/* Background Layer */}
            <View style={styles.backgroundLayer}>
                {item.feedType === 'activity_group' ? (
                    <CollageView
                        items={item.groupItems}
                        count={item.count}
                        isSealed={capsule?.status === 'sealed'}
                    />
                ) : (item.media_url || item.thumbnail_url) && (item.media_type === 'image' || item.media_type === 'video') ? (
                    <>
                        <Image
                            source={{ uri: item.thumbnail_url || item.media_url }}
                            style={styles.backgroundImage}
                            blurRadius={capsule?.status === 'sealed' ? (Platform.OS === 'ios' ? 12 : 30) : 0}
                        />
                        {capsule?.status === 'sealed' && (
                            <BlurView intensity={Platform.OS === 'ios' ? 45 : 70} tint="light" style={StyleSheet.absoluteFill} />
                        )}
                    </>
                ) : isAudio ? (
                    <LinearGradient colors={['#a269ff', '#8050d0']} style={styles.backgroundGradient} />
                ) : isNote ? (
                    <LinearGradient colors={['#bd9aff', '#a269ff']} style={styles.backgroundGradient} />
                ) : (
                    <LinearGradient colors={typeColors as any} style={styles.backgroundGradient} />
                )}
                {/* Lighter, more elegant overlay gradient */}
                <LinearGradient
                    colors={['rgba(0,0,0,0.28)', 'rgba(0,0,0,0.06)', 'rgba(0,0,0,0.58)']}
                    style={StyleSheet.absoluteFill}
                />
            </View>

            {/* Top Info Bar */}
            <View style={styles.topBar}>
                {/* Unified glass pill: avatar + name + follow */}
                <TouchableOpacity
                    style={styles.userSection}
                    onPress={() => navigation.navigate('UserProfile', { targetUserId: item.owner_id })}
                >
                    {profile.avatar_url ? (
                        <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
                    ) : (
                        <View style={styles.avatarPlaceholder}>
                            <Ionicons name="person" size={12} color="#fff" />
                        </View>
                    )}
                    <View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <TouchableOpacity
                                style={{ flexDirection: 'row', alignItems: 'center' }}
                                onPress={() => navigation.navigate('UserProfile', { targetUserId: item.owner_id })}
                            >
                                <Text style={styles.username}>{profile.display_name || profile.username || 'user'}</Text>
                                {profile.is_verified && <VerifiedBadge size={13} style={{ marginLeft: 2 }} />}
                            </TouchableOpacity>
                            {currentUserId && currentUserId !== item.owner_id && (
                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={handleFollow}
                                    style={[styles.followMiniBtn, isFollowed && styles.followMiniBtnActive]}
                                >
                                    <Text style={[styles.followMiniText, isFollowed && styles.followMiniTextActive]}>
                                        {isFollowed ? 'Following' : 'Follow'}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>
                        <Text style={styles.activityType}>
                            {item.feedType === 'activity_group'
                                ? `Added ${item.count} memories`
                                : `Added ${item.media_type || 'content'}`
                            }
                        </Text>
                    </View>
                </TouchableOpacity>

                {/* Capsule mini — unified glass style */}
                {capsule && (
                    <TouchableOpacity
                        style={styles.capsuleCorner}
                        onPress={() => navigation.navigate('CapsuleDetail', { capsuleId: item.capsule_id })}
                    >
                        <CapsuleWithTimer
                            modelKey={capsule.model || 'basicred_kap'}
                            source={{ uri: capsule.status === 'opened' ? (timerConfigManager.getModelImageOpen(capsule.model) || MODEL_IMAGES_OPEN[capsule.model as keyof typeof MODEL_IMAGES_OPEN] || (MODEL_IMAGES_OPEN as any).basicred_kap) : (timerConfigManager.getModelImage(capsule.model) || MODEL_IMAGES[capsule.model as keyof typeof MODEL_IMAGES] || (MODEL_IMAGES as any).basicred_kap) }}
                            date={capsule.opens_at}
                            chainId={capsule.chain_id}
                            capsuleType={capsule.type}
                            hideTimer
                            isOpened={capsule.status === 'opened'}
                            style={styles.capsuleMini}
                            hideParticles
                        />
                    </TouchableOpacity>
                )}
            </View>            {/* Middle Content — simplified, consistent across types */}
            {(isAudio || isNote || item.media_type === 'video') && (
                <View style={styles.middleContent}>
                    {isAudio && (
                        <View style={styles.audioPreviewWrap}>
                            <LinearGradient colors={['rgba(255,255,255,0.2)', 'rgba(255,255,255,0.05)']} style={styles.audioMainCircle}>
                                <Ionicons name="mic-outline" size={32} color="#fff" />
                            </LinearGradient>
                            <Waveform />
                        </View>
                    )}
                    {item.media_type === 'video' && (
                        <View style={styles.videoPlayOverlay}>
                            <View style={styles.playIconCircle}>
                                <Ionicons name="play" size={28} color="#fff" style={{ marginLeft: 3 }} />
                            </View>
                        </View>
                    )}
                    {isNote && (
                        <View style={styles.noteContainer}>
                            {capsule?.status === 'sealed' ? (
                                <>
                                    {Platform.OS === 'ios' ? (
                                        <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} />
                                    ) : (
                                        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.88)' }]} />
                                    )}
                                    <View style={styles.sealedNoteOverlay}>
                                        <Ionicons name="lock-closed-outline" size={28} color="rgba(0,0,0,0.22)" />
                                        <Text style={styles.aestheticHintText}>ENCRYPTED THOUGHT</Text>
                                        <Text style={{ fontSize: 11, color: 'rgba(0,0,0,0.35)', fontFamily: Fonts.medium, marginTop: 6 }}>Note Memory</Text>
                                    </View>
                                </>
                            ) : (
                                <View style={{ width: '100%', padding: 32, alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                                    <Ionicons name="document-text-outline" size={28} color="rgba(255,255,255,0.55)" style={{ marginBottom: 16 }} />
                                    <Text style={styles.noteContentText} numberOfLines={7}>
                                        {item.content}
                                    </Text>
                                </View>
                            )}
                        </View>
                    )}
                </View>
            )}

            {/* Bottom Info Section */}
            {!isNote && (
                <View style={styles.bottomSection}>
                    {/* Sealed badge — floating top-right of the glass card */}
                    {capsule?.status === 'sealed' && (
                        <View style={styles.sealedBadge}>
                            <Ionicons name="lock-closed" size={11} color="#fff" />
                        </View>
                    )}
                    <BlurView intensity={30} tint="dark" style={styles.glassInfo}>
                        <View style={styles.capsuleInfo}>
                            <View style={[styles.typeIndicator, { backgroundColor: typeColors[0] as any }]} />
                            <Text style={styles.capsuleTitle} numberOfLines={1}>{capsule.title}</Text>
                            {!hasAccess && (
                                <Ionicons name="lock-closed" size={13} color="rgba(255,100,100,0.9)" style={{ marginLeft: 6 }} />
                            )}
                        </View>
                        <View style={styles.itemPreview}>
                            <View style={styles.iconContainer}>
                                <Ionicons name={mediaIcon as any} size={14} color="#fff" />
                            </View>
                            <Text style={styles.previewText} numberOfLines={1}>
                                {item.feedType === 'activity_group'
                                    ? `New collection · ${item.count} items`
                                    : isAudio ? `Voice Note · ${item.content || '--:--'}` : isNote ? 'Written Note' : ((item.caption?.replace(/!!b:\w+/, '').trim()) || (item.media_type === 'video' ? `Video · ${item.content || '--:--'}` : ''))
                                }
                            </Text>
                            {isAudio && (
                                <View style={styles.durationBadge}>
                                    <Ionicons name="mic" size={9} color="#fff" style={{ marginRight: 3 }} />
                                    <Text style={styles.durationText}>{item.content || '--:--'}</Text>
                                </View>
                            )}
                        </View>
                    </BlurView>
                </View>
            )}
        </TouchableOpacity>
    );
});

const styles = StyleSheet.create({
    card: {
        height: 350,
        marginHorizontal: Spacing.md,
        marginBottom: Spacing.lg,
        borderRadius: BorderRadius.xl,
        overflow: 'hidden',
        backgroundColor: Colors.cardAlt,
        ...Shadow.card
    },
    backgroundLayer: { ...StyleSheet.absoluteFillObject },
    backgroundImage: { width: '100%', height: '100%' },
    backgroundGradient: { flex: 1 },

    topBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: Spacing.md,
        zIndex: 5,
    },
    // Unified glass pill for user info
    userSection: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.14)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
    },
    avatar: {
        width: 28,
        height: 28,
        borderRadius: 14,
        marginRight: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.4)',
    },
    avatarPlaceholder: {
        width: 28,
        height: 28,
        borderRadius: 14,
        marginRight: 8,
        backgroundColor: Colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    username: { fontSize: 12, fontFamily: Fonts.bold, color: '#fff' },
    activityType: { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 1, fontFamily: Fonts.medium },

    // Follow pill
    followMiniBtn: { marginLeft: 6, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
    followMiniBtnActive: { backgroundColor: 'rgba(255,255,255,0.1)' },
    followMiniText: { fontSize: 10, fontFamily: Fonts.bold, color: '#fff' },
    followMiniTextActive: { color: 'rgba(255,255,255,0.6)' },

    // Capsule corner — unified glass style
    capsuleCorner: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.14)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
        overflow: 'hidden',
    },
    topRightContainer: { alignItems: 'center' },
    miniTimerContainer: { marginTop: 4, backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
    miniTimerText: { fontSize: 10, color: '#fff', fontFamily: Fonts.bold },
    capsuleMini: { width: 42, height: 42 },

    // Middle content
    middleContent: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 40, zIndex: 2 },
    videoPlayOverlay: { alignItems: 'center', justifyContent: 'center' },
    playIconCircle: {
        width: 58,
        height: 58,
        borderRadius: 29,
        backgroundColor: 'rgba(0,0,0,0.35)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.5)',
    },
    audioPreviewWrap: { alignItems: 'center', gap: 20 },
    audioMainCircle: {
        width: 76,
        height: 76,
        borderRadius: 38,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.35)',
    },
    waveContainer: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 40 },
    waveBar: { width: 4, borderRadius: 2 },

    // Note container — simplified
    noteContainer: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
    sealedNoteOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 10, gap: 8 },
    aestheticHintText: { fontFamily: Fonts.bold, fontSize: 11, color: 'rgba(0,0,0,0.35)', letterSpacing: 3, textTransform: 'uppercase' },
    noteContentText: { fontSize: 17, fontFamily: Fonts.medium, color: '#fff', lineHeight: 26, textAlign: 'center', fontStyle: 'italic' },

    // Unused but kept for reference
    noteTextSkeletonWrap: { width: '100%', padding: 30, gap: 14 },
    scrambledText: { fontSize: 16, color: 'rgba(0,0,0,0.25)', lineHeight: 28, letterSpacing: 4, textAlign: 'center' },
    notePaper: { width: '100%', height: '100%', backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center' },
    sparkle: { position: 'absolute', borderRadius: 2 },
    skeletonLine: { height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, width: '100%' },
    aestheticIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },

    timerChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow: 'hidden' },
    timerText: { fontSize: 10, color: '#fff', fontFamily: Fonts.bold },

    // Bottom section
    bottomSection: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: Spacing.md,
    },
    glassInfo: {
        borderRadius: 20,
        paddingVertical: 14,
        paddingHorizontal: 14,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    capsuleInfo: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    typeIndicator: { width: 7, height: 7, borderRadius: 3.5, marginRight: 8 },
    capsuleTitle: { fontSize: 15, fontFamily: Fonts.bold, color: '#fff', flex: 1 },
    itemPreview: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    iconContainer: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.18)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    previewText: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.88)', lineHeight: 18, fontFamily: Fonts.medium },
    durationBadge: { backgroundColor: 'rgba(0,0,0,0.36)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
    durationText: { fontSize: 11, fontFamily: Fonts.bold, color: '#fff' },

    // Sealed badge — small floating circle top-right
    sealedBadge: {
        position: 'absolute',
        top: -12,
        right: Spacing.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.52)',
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },

    // Collage
    collageContainer: { flex: 1, width: '100%', height: '100%' },
    collageGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap' },
    collageImage: { width: '50%', height: '50%' },
    collageSingle: { width: '100%', height: '100%' },
    collageDual: { width: '50%', height: '100%' },
    collageTripleLarge: { width: '100%', height: '50%' },

    // Group count badge — bottom right, premium
    groupCountBadge: {
        position: 'absolute',
        bottom: 14,
        right: 14,
        backgroundColor: 'rgba(0,0,0,0.52)',
        paddingHorizontal: 11,
        paddingVertical: 7,
        borderRadius: 999,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
    },
    groupCountText: { color: '#fff', fontSize: 13, fontFamily: Fonts.bold },
});

