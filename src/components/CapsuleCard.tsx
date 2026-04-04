import React, { useState, useEffect } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    Dimensions, Platform, Alert, Animated

} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors, Fonts, BorderRadius, Spacing, Shadow } from '../theme';
import { supabase } from '../lib/supabase';
import { MODEL_IMAGES } from '../constants/models';
import CapsuleWithTimer from './CapsuleWithTimer';
import VerifiedBadge from './VerifiedBadge';
import { timerConfigManager } from '../utils/timerConfig';
import { Image } from 'expo-image';
import { cardMediaCache } from '../utils/mediaCache';


const { width } = Dimensions.get('window');

const typeConfig = {
    instacap: { label: 'InstaCap', color: Colors.instaCap, icon: 'camera-outline' as const },
    eventcap: { label: 'EventCap', color: Colors.eventCap, icon: 'calendar-outline' as const },
    legacycap: { label: 'LegacyCap', color: Colors.legacyCap, icon: 'time-outline' as const },
};

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
}

function formatOpenDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const CapsuleCard = React.memo(({ capsule, isLocked: isLockedProp, userId: passedUserId }: { capsule: any; isLocked?: boolean; userId?: string | null }) => {
    const navigation = useNavigation<any>();
    const { t } = useTranslation();

    const [isFollowed, setIsFollowed] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(passedUserId || null);
    const [likeCount, setLikeCount] = useState(0);
    const [isLiked, setIsLiked] = useState(false);
    const [commentCount, setCommentCount] = useState(0);
    const [postsCount, setPostsCount] = useState(0);
    const [mediaCollage, setMediaCollage] = useState<any[]>([]);
    const [latestItem, setLatestItem] = useState<any>(null);
    const [latestItemLoaded, setLatestItemLoaded] = useState(false);
    const [isLocked, setIsLocked] = useState(isLockedProp || false);

    const cfg = typeConfig[capsule.type as keyof typeof typeConfig] || typeConfig.legacycap;

    const [themeColor, setThemeColor] = useState<string>(() =>
        timerConfigManager.getConfig(capsule.model)?.themeColor || '#a269ff'
    );
    const [modelImages, setModelImages] = useState({
        closed: timerConfigManager.getModelImage(capsule.model) || MODEL_IMAGES[capsule.model as keyof typeof MODEL_IMAGES] || (MODEL_IMAGES as any).basicred_kap,
        open: timerConfigManager.getModelImageOpen(capsule.model) || (MODEL_IMAGES as any).basicred_kap,
    });

    const heartScale = React.useRef(new Animated.Value(1)).current;
    const bounceHeart = () => {
        Animated.sequence([
            Animated.timing(heartScale, { toValue: 1.35, duration: 90, useNativeDriver: true }),
            Animated.spring(heartScale, { toValue: 1, friction: 4, tension: 130, useNativeDriver: true }),
        ]).start();
    };

    useEffect(() => {
        // Initial sync of images/theme when model changes (important for FlashList recycling)
        const config = timerConfigManager.getConfig(capsule.model);
        setThemeColor(config?.themeColor || '#a269ff');
        setModelImages({
            closed: timerConfigManager.getModelImage(capsule.model) || MODEL_IMAGES[capsule.model as keyof typeof MODEL_IMAGES] || (MODEL_IMAGES as any).basicred_kap,
            open: timerConfigManager.getModelImageOpen(capsule.model) || (MODEL_IMAGES as any).basicred_kap,
        });

        return timerConfigManager.subscribe(() => {
            const upConfig = timerConfigManager.getConfig(capsule.model);
            setThemeColor(upConfig?.themeColor || '#a269ff');
            setModelImages({
                closed: timerConfigManager.getModelImage(capsule.model) || MODEL_IMAGES[capsule.model as keyof typeof MODEL_IMAGES] || (MODEL_IMAGES as any).basicred_kap,
                open: timerConfigManager.getModelImageOpen(capsule.model) || (MODEL_IMAGES as any).basicred_kap,
            });
        });
    }, [capsule.model]);

    useEffect(() => {
        let isMounted = true;
        const init = async () => {
            if (passedUserId) {
                setCurrentUserId(passedUserId);
                const hasAccess = capsule.is_public || capsule.owner_id === passedUserId || capsule.is_participant;
                if (isLockedProp === undefined && isMounted) setIsLocked(!hasAccess);
            } else {
                const { data: { session } } = await supabase.auth.getSession();
                const user = session?.user;
                if (user) {
                    if (isMounted) setCurrentUserId(user.id);
                    const hasAccess = capsule.is_public || capsule.owner_id === user.id || capsule.is_participant;
                    if (isLockedProp === undefined && isMounted) setIsLocked(!hasAccess);
                } else if (isLockedProp === undefined && isMounted) {
                    setIsLocked(!capsule.is_public);
                }
            }

            if (capsule.likes_count !== undefined && isMounted) {
                setLikeCount(capsule.likes_count || 0);
                setCommentCount(capsule.comments_count || 0);
                setPostsCount(capsule.posts_count || 0);
                setIsLiked(!!capsule.is_liked);
                setIsFollowed(!!capsule.is_followed);

                // Fetch media from cache if available to save network calls
                const cached = cardMediaCache.get(capsule.id);
                if (cached) {
                    setLatestItem(cached.latestItem);
                    setMediaCollage(cached.collage);
                    setLatestItemLoaded(true);
                } else {
                    const [latestRes, collageRes] = await Promise.all([
                        supabase.from('capsule_items').select('media_url, media_type, thumbnail_url, content, caption').eq('capsule_id', capsule.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
                        capsule.status === 'opened'
                            ? supabase.from('capsule_items').select('media_url, media_type').eq('capsule_id', capsule.id).in('media_type', ['image', 'video']).order('created_at', { ascending: true }).limit(4)
                            : Promise.resolve({ data: [] }),
                    ]);

                    const fetchedLatest = latestRes?.data ? (Array.isArray(latestRes.data) ? latestRes.data[0] : latestRes.data) : null;
                    const fetchedCollage = collageRes?.data?.length ? collageRes.data : [];

                    cardMediaCache.set(capsule.id, { latestItem: fetchedLatest, collage: fetchedCollage });

                    if (isMounted) {
                        setLatestItem(fetchedLatest);
                        setMediaCollage(fetchedCollage);
                        setLatestItemLoaded(true);
                    }
                }
            }
        };
        init();
        return () => { isMounted = false; };
    }, [capsule.id, capsule.likes_count, capsule.is_public, capsule.owner_id, capsule.status]);

    const handleFollow = async () => {
        if (!currentUserId || currentUserId === capsule.owner_id) return;
        if (isFollowed) {
            await supabase.from('follows').delete().eq('follower_id', currentUserId).eq('following_id', capsule.owner_id);
            setIsFollowed(false);
        } else {
            await supabase.from('follows').insert({ follower_id: currentUserId, following_id: capsule.owner_id });
            setIsFollowed(true);
        }
    };

    const handleLike = async () => {
        if (!currentUserId) return;
        bounceHeart();
        if (isLiked) {
            const { error } = await supabase.from('likes').delete().eq('capsule_id', capsule.id).eq('user_id', currentUserId);
            if (!error) { setIsLiked(false); setLikeCount(p => p - 1); }
        } else {
            const { error } = await supabase.from('likes').insert({ capsule_id: capsule.id, user_id: currentUserId });
            if (!error) {
                setIsLiked(true);
                setLikeCount(p => p + 1);
                if (currentUserId !== capsule.owner_id) {
                    await supabase.from('notifications').insert({
                        user_id: capsule.owner_id, sender_id: currentUserId,
                        type: 'like', capsule_id: capsule.id, message: 'liked your capsule',
                    });
                }
            }
        }
    };

    const handlePress = () => {
        if (isLocked) { Alert.alert(t('profile.private_capsule'), t('profile.private_capsule_msg')); return; }
        navigation.navigate('CapsuleDetail', { capsuleId: capsule.id });
    };

    const profile = capsule.profiles || { username: 'user', avatar_url: null };
    const isOpened = capsule.status === 'opened';
    const isSealed = capsule.status === 'sealed';
    // Only consider it a video post once we've confirmed the latest item (avoids capsule→video flicker)
    const isVideoPost = isSealed && latestItemLoaded && latestItem?.media_type === 'video';

    return (
        <TouchableOpacity activeOpacity={0.95} onPress={handlePress} style={s.card}>

            {/* ── VISUAL ZONE ──────────────────────────────────────────── */}
            <View style={s.visual}>
                {/* Tinted bg */}
                <View style={[StyleSheet.absoluteFill, { backgroundColor: themeColor + '10' }]} />

                {isSealed && (
                    <LinearGradient
                        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']}
                        start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}
                        style={StyleSheet.absoluteFill}
                    />
                )}

                {/* Blurred bg for video */}
                {isVideoPost && latestItem?.thumbnail_url && (
                    <View style={StyleSheet.absoluteFill}>
                        <Image source={{ uri: latestItem.thumbnail_url }} style={s.blurBg} blurRadius={Platform.OS === 'ios' ? 28 : 12} contentFit="cover" transition={300} />
                        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.3)' }]} />
                    </View>
                )}


                {/* ── Opened: collage + model ── */}
                {isOpened && mediaCollage.length > 0 ? (
                    <View style={s.openedRow}>
                        <View style={s.collageWrap}>
                            <View style={s.collageGrid}>
                                {mediaCollage.map((item, i) => (
                                    <Image
                                        key={i}
                                        source={{ uri: (item.media_url && !item.media_url.startsWith('text://')) ? item.media_url : '' }}
                                        style={[
                                            s.collageItem,
                                            mediaCollage.length === 1 && s.collageSingle,
                                            mediaCollage.length === 2 && s.collageDual,
                                            mediaCollage.length === 3 && i === 0 && s.collageTripleLarge,
                                        ]}
                                        contentFit="cover"
                                        transition={200}
                                    />

                                ))}
                            </View>
                            <LinearGradient
                                colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.9)']}
                                start={{ x: 0.5, y: 0 }} end={{ x: 1, y: 0 }}
                                style={[StyleSheet.absoluteFill, { pointerEvents: 'none' } as any]}
                            />
                        </View>
                        <View style={s.modelOverlap}>
                            <CapsuleWithTimer
                                modelKey={capsule.model}
                                source={{ uri: modelImages.open }}
                                date={capsule.opens_at}
                                capsuleType={capsule.type}
                                chainId={capsule.chain_id}
                                hideTimer
                                style={s.capsuleSmall}
                                isOpened
                            />
                        </View>
                    </View>

                ) : isVideoPost ? (
                    // Video sealed: blurred bg + play + small model in corner
                    <View style={s.videoWrap}>
                        <View style={s.videoPlayBtn}>
                            <Ionicons name="play" size={24} color="#fff" style={{ marginLeft: 2 }} />
                        </View>
                        <View style={s.modelCorner}>
                            <Image source={{ uri: modelImages.closed }} style={s.capsuleCornerImg} contentFit="contain" transition={200} />
                        </View>

                    </View>

                ) : (
                    // Default sealed
                    <View style={s.sealedWrap}>
                        <CapsuleWithTimer
                            modelKey={capsule.model}
                            source={{ uri: isOpened ? modelImages.open : modelImages.closed }}
                            date={capsule.opens_at}
                            chainId={capsule.chain_id}
                            capsuleType={capsule.type}
                            hideTimer={isOpened}
                            style={s.capsuleLarge}
                            isOpened={isOpened}
                        />
                    </View>
                )}

                {/* ── Badges — no overlaps ── */}

                {/* Type — TOP LEFT always */}
                <View style={[s.typeBadge, { backgroundColor: cfg.color }]}>
                    <Ionicons name={cfg.icon} size={9} color="#fff" />
                    <Text style={s.typeBadgeText}>{cfg.label}</Text>
                </View>

                {/* Duration — TOP RIGHT, only on video (no opened badge on video) */}
                {isVideoPost && latestItem?.content && (
                    <View style={s.durationBadge}>
                        <Ionicons name="play" size={10} color="#fff" />
                        <Text style={s.durationText}>{latestItem.content}</Text>
                    </View>
                )}

                {/* Opened — TOP RIGHT, only when opened */}
                {isOpened && (
                    <View style={[s.openedBadge, { backgroundColor: themeColor }]}>
                        <Ionicons name="lock-open-outline" size={10} color="#fff" />
                        <Text style={s.openedBadgeText}>Opened</Text>
                    </View>
                )}

                {/* Lock — BOTTOM RIGHT */}
                {isSealed && (
                    <View style={s.lockBadge}>
                        <Ionicons name="lock-closed" size={11} color="rgba(255,255,255,0.9)" />
                    </View>
                )}

                {/* Multi-media — BOTTOM RIGHT, beside lock */}
                {isSealed && postsCount > 1 && (
                    <View style={[s.lockBadge, { right: 46 }]}>
                        <Ionicons name="images" size={11} color="rgba(255,255,255,0.9)" />
                    </View>
                )}
            </View>

            {/* ── BODY ─────────────────────────────────────────────────── */}
            <View style={s.body}>

                {/* Author row */}
                <View style={s.authorRow}>
                    <TouchableOpacity
                        activeOpacity={0.8}
                        style={s.authorLeft}
                        onPress={() => navigation.navigate('UserProfile', { targetUserId: capsule.owner_id })}
                    >
                        {profile.avatar_url
                            ? <Image source={{ uri: profile.avatar_url }} style={s.avatar} contentFit="cover" transition={200} />
                            : <View style={[s.avatar, s.avatarFallback]}>
                                <Ionicons name="person" size={14} color={Colors.textMuted} />
                            </View>
                        }

                        <View style={{ flex: 1, minWidth: 0 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                <Text style={s.authorName} numberOfLines={1}>{profile.display_name || profile.username}</Text>
                                {profile.is_verified && <VerifiedBadge size={13} />}
                            </View>
                            <Text style={s.authorTime}>
                                {isOpened ? '✨ Opened · ' : ''}{timeAgo(isOpened ? capsule.opens_at : capsule.created_at)}
                            </Text>
                        </View>
                    </TouchableOpacity>

                    {currentUserId !== capsule.owner_id && (
                        <TouchableOpacity
                            onPress={handleFollow}
                            activeOpacity={0.8}
                            style={[s.followBtn, isFollowed && s.followBtnActive]}
                        >
                            <Text style={[s.followBtnText, isFollowed && s.followBtnTextActive]}>
                                {isFollowed ? 'Following' : '+ Follow'}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Title */}
                <Text style={s.title} numberOfLines={1}>
                    {capsule.title}{isLocked ? ' 🔒' : ''}
                </Text>

                {/* Desc or video label */}
                {isVideoPost ? (
                    <View style={s.videoRow}>
                        <Ionicons name="videocam" size={11} color={Colors.primary} />
                        <Text style={s.videoLabel}>New video shared</Text>
                    </View>
                ) : (
                    <Text style={s.desc} numberOfLines={2}>{capsule.description}</Text>
                )}

                {/* ── Actions ── */}
                <View style={s.actions}>
                    <TouchableOpacity style={s.actionBtn} activeOpacity={0.7} onPress={handleLike}>
                        <Animated.View style={{ transform: [{ scale: heartScale }] }}>
                            <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={15} color={isLiked ? '#F43F5E' : Colors.textMuted} />
                        </Animated.View>
                        <Text style={[s.actionNum, isLiked && { color: '#F43F5E' }]}>{likeCount}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={s.actionBtn} activeOpacity={0.7} onPress={handlePress}>
                        <Ionicons name="chatbubble-outline" size={14} color={Colors.textMuted} />
                        <Text style={s.actionNum}>{commentCount}</Text>
                    </TouchableOpacity>

                    <View style={s.actionBtn}>
                        <Ionicons name="images-outline" size={14} color={Colors.textMuted} />
                        <Text style={s.actionNum}>{postsCount}</Text>
                    </View>

                    <View style={{ flex: 1 }} />

                    {/* Opening date — always grey */}
                    {capsule.opens_at && (
                        <View style={s.dateChip}>
                            <Ionicons
                                name={isOpened ? 'lock-open-outline' : 'calendar-outline'}
                                size={10}
                                color={Colors.textMuted}
                            />
                            <Text style={s.dateText}>
                                {isOpened ? 'Opened ' : 'Opens '}{formatOpenDate(capsule.opens_at)}
                            </Text>
                        </View>
                    )}
                </View>
            </View>
        </TouchableOpacity>
    );
});

export default CapsuleCard;

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    card: {
        marginHorizontal: 14,
        marginBottom: 12,
        borderRadius: 20,
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.border,
        overflow: 'hidden',
        ...Platform.select({
            ios: { shadowColor: 'rgba(0,0,0,0.07)', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 1, shadowRadius: 12 },
            android: { elevation: 2 },
            web: { boxShadow: '0 3px 14px rgba(0,0,0,0.06)' },
        }),
    },

    visual: {
        width: '100%',
        height: 180,
        overflow: 'hidden',
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
    },
    blurBg: { ...StyleSheet.absoluteFillObject, opacity: 0.55 },

    sealedWrap: { alignItems: 'center', justifyContent: 'center', flex: 1 },
    capsuleLarge: { width: 148, height: 148 },

    // Video
    videoWrap: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
    videoPlayBtn: {
        width: 54, height: 54, borderRadius: 27,
        backgroundColor: 'rgba(0,0,0,0.38)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)',
    },
    // Capsule model mini in bottom-right of video post
    modelCorner: {
        position: 'absolute', bottom: 8, right: 10,
        width: 50, height: 50,
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.22, shadowRadius: 6 },
            android: { elevation: 4 },
            web: { boxShadow: '0px 2px 6px rgba(0,0,0,0.22)' }
        }),
    },
    capsuleCornerImg: { width: 50, height: 50 },

    // Opened collage
    openedRow: { flexDirection: 'row', width: '100%', height: '100%' },
    collageWrap: { flex: 1.65, height: '100%', position: 'relative' },
    collageGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap' },
    collageItem: { width: '49.8%', height: '49.8%', backgroundColor: Colors.border },
    collageSingle: { width: '100%', height: '100%' },
    collageDual: { width: '49.8%', height: '100%' },
    collageTripleLarge: { width: '100%', height: '49.8%' },
    modelOverlap: {
        position: 'absolute', right: 0, top: 0, bottom: 0,
        width: 148, alignItems: 'center', justifyContent: 'center', zIndex: 10,
        ...Platform.select({
            ios: { shadowColor: 'rgba(0,0,0,0.28)', shadowOffset: { width: -3, height: 6 }, shadowOpacity: 1, shadowRadius: 12 },
            android: { elevation: 5 },
            web: { boxShadow: '-3px 6px 12px rgba(0,0,0,0.28)' }
        }),
    },
    capsuleSmall: { width: 128, height: 128 },

    // ── Badges ───────────────────────────────────────────────────────────────

    // TOP LEFT — type
    typeBadge: {
        position: 'absolute', top: 10, left: 10,
        flexDirection: 'row', alignItems: 'center', gap: 3,
        paddingHorizontal: 7, paddingVertical: 3,
        borderRadius: 30,
    },
    typeBadgeText: { fontSize: 9, fontFamily: Fonts.bold, color: '#fff', letterSpacing: 0.2 },

    // TOP RIGHT — duration (video only, mutually exclusive with openedBadge)
    durationBadge: {
        position: 'absolute', top: 10, right: 10,
        flexDirection: 'row', alignItems: 'center', gap: 3,
        paddingHorizontal: 7, paddingVertical: 3,
        borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.52)',
    },
    durationText: { fontSize: 10, fontFamily: Fonts.bold, color: '#fff' },

    // TOP RIGHT — opened (mutually exclusive with durationBadge)
    openedBadge: {
        position: 'absolute', top: 10, right: 10,
        flexDirection: 'row', alignItems: 'center', gap: 3,
        paddingHorizontal: 7, paddingVertical: 3,
        borderRadius: 30,
    },
    openedBadgeText: { fontSize: 9, fontFamily: Fonts.bold, color: '#fff' },

    // BOTTOM RIGHT — lock
    lockBadge: {
        position: 'absolute', bottom: 8, right: 10,
        width: 26, height: 26, borderRadius: 13,
        backgroundColor: 'rgba(0,0,0,0.36)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    },

    // ── Body ─────────────────────────────────────────────────────────────────
    body: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10 },

    authorRow: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between', marginBottom: 7,
    },
    authorLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
    avatar: {
        width: 30, height: 30, borderRadius: 15,
        borderWidth: 1.5, borderColor: Colors.border, flexShrink: 0,
    },
    avatarFallback: { backgroundColor: Colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
    authorName: { fontSize: 12, fontFamily: Fonts.bold, color: Colors.textPrimary },
    authorTime: { fontSize: 10, fontFamily: Fonts.regular, color: Colors.textMuted, marginTop: 1 },

    followBtn: {
        paddingHorizontal: 10, paddingVertical: 4,
        borderRadius: 20, borderWidth: 1.5,
        borderColor: Colors.primary, flexShrink: 0,
    },
    followBtnActive: { borderColor: Colors.border, backgroundColor: Colors.cardAlt },
    followBtnText: { fontSize: 10, fontFamily: Fonts.bold, color: Colors.primary },
    followBtnTextActive: { color: Colors.textMuted },

    title: {
        fontSize: 15, fontFamily: Fonts.bold,
        color: Colors.textPrimary, letterSpacing: -0.2, marginBottom: 3,
    },
    desc: {
        fontSize: 12, fontFamily: Fonts.regular,
        color: Colors.textSecondary, lineHeight: 17, marginBottom: 9,
    },
    videoRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 9 },
    videoLabel: { fontSize: 11, fontFamily: Fonts.semiBold, color: Colors.primary },

    actions: {
        flexDirection: 'row', alignItems: 'center',
        paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.border, gap: 4,
    },
    actionBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 8, paddingVertical: 5,
        borderRadius: 18, backgroundColor: Colors.cardAlt,
    },
    actionNum: { fontSize: 11, fontFamily: Fonts.semiBold, color: Colors.textMuted },

    // Grey date chip — always neutral
    dateChip: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 8, paddingVertical: 4,
        borderRadius: 18, backgroundColor: Colors.cardAlt,
    },
    dateText: { fontSize: 10, fontFamily: Fonts.medium, color: Colors.textMuted },
});