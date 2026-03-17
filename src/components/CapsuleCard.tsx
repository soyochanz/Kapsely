import React, { useState, useEffect } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Dimensions, Platform, Alert } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors, Fonts, BorderRadius, Spacing, Shadow } from '../theme';
import { supabase } from '../lib/supabase';
import LiveTimer from './LiveTimer';
import CapsuleWithTimer from './CapsuleWithTimer';
import VerifiedBadge from './VerifiedBadge';
import { timerConfigManager } from '../utils/timerConfig';

const { width } = Dimensions.get('window');

import { MODEL_IMAGES, MODEL_IMAGES_OPEN } from '../constants/models';



const typeConfig = {
    instacap: { label: 'InstaCap', color: Colors.instaCap, bgColor: Colors.instaCapLight, icon: 'camera-outline' },
    eventcap: { label: 'EventCap', color: Colors.eventCap, bgColor: Colors.eventCapLight, icon: 'calendar-outline' },
    legacycap: { label: 'LegacyCap', color: Colors.legacyCap, bgColor: Colors.legacyCapLight, icon: 'time-outline' },
};
const CapsuleCard = React.memo(({ capsule, isLocked: isLockedProp }: { capsule: any, isLocked?: boolean }) => {
    const navigation = useNavigation<any>();
    const { t } = useTranslation();
    const [isFollowed, setIsFollowed] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [likeCount, setLikeCount] = useState(0);
    const [isLiked, setIsLiked] = useState(false);
    const [commentCount, setCommentCount] = useState(0);
    const [postsCount, setPostsCount] = useState(0);
    const [mediaCollage, setMediaCollage] = useState<any[]>([]);
    const [latestItem, setLatestItem] = useState<any>(null);
    
    // Determine if locked
    const [isLocked, setIsLocked] = useState(isLockedProp || false);
    
    const cfg = typeConfig[capsule.type as keyof typeof typeConfig] || typeConfig.legacycap;
    const [themeColor, setThemeColor] = useState<string>(() => {
        const config = timerConfigManager.getConfig(capsule.model);
        return config?.themeColor || '#a269ff';
    });
    const [modelImages, setModelImages] = useState({
        closed: timerConfigManager.getModelImage(capsule.model) || MODEL_IMAGES[capsule.model] || (MODEL_IMAGES as any).basicred_kap,
        open: timerConfigManager.getModelImageOpen(capsule.model) || MODEL_IMAGES_OPEN[capsule.model] || MODEL_IMAGES[capsule.model] || (MODEL_IMAGES as any).basicred_kap
    });

    useEffect(() => {
        const unsubscribe = timerConfigManager.subscribe(() => {
            const config = timerConfigManager.getConfig(capsule.model);
            setThemeColor(config?.themeColor || '#a269ff');
            setModelImages({
                closed: timerConfigManager.getModelImage(capsule.model) || MODEL_IMAGES[capsule.model] || (MODEL_IMAGES as any).basicred_kap,
                open: timerConfigManager.getModelImageOpen(capsule.model) || MODEL_IMAGES_OPEN[capsule.model] || MODEL_IMAGES[capsule.model] || (MODEL_IMAGES as any).basicred_kap
            });
        });
        return unsubscribe;
    }, [capsule.model]);

    useEffect(() => {
        const init = async () => {
            // getSession() reads from local cache — no network round-trip needed
            const { data: { session } } = await supabase.auth.getSession();
            const user = session?.user;

            if (user) {
                setCurrentUserId(user.id);
                const hasAccess = capsule.is_public || capsule.owner_id === user.id || capsule.is_participant;
                if (isLockedProp === undefined) setIsLocked(!hasAccess);
            } else if (isLockedProp === undefined) {
                setIsLocked(!capsule.is_public);
            }

            // Check if we have pre-fetched data from Feed API (RPC)
            if (capsule.likes_count !== undefined) {
                setLikeCount(capsule.likes_count || 0);
                setCommentCount(capsule.comments_count || 0);
                setPostsCount(capsule.posts_count || 0);
                setIsLiked(!!capsule.is_liked);
                setIsFollowed(!!capsule.is_followed);
                
                // Only fetch aesthetic media queries
                const [latestRes, collageRes] = await Promise.all([
                    supabase.from('capsule_items').select('media_url, media_type, thumbnail_url, content, caption').eq('capsule_id', capsule.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
                    capsule.status === 'opened'
                        ? supabase.from('capsule_items').select('media_url, media_type').eq('capsule_id', capsule.id).in('media_type', ['image', 'video']).order('created_at', { ascending: true }).limit(4)
                        : Promise.resolve({ data: [] }),
                ]);
                
                if (latestRes?.data) setLatestItem(latestRes.data);
                if (collageRes?.data?.length) setMediaCollage(collageRes.data);

            } else {
                // Fallback for screens that don't pass pre-fetched data (like Search)
                const [likesRes, commentsRes, postsRes, latestRes, likeCheckRes, followRes, collageRes] = await Promise.all([
                    supabase.from('likes').select('*', { count: 'exact', head: true }).eq('capsule_id', capsule.id),
                    supabase.from('comments').select('*', { count: 'exact', head: true }).eq('capsule_id', capsule.id),
                    supabase.from('capsule_items').select('*', { count: 'exact', head: true }).eq('capsule_id', capsule.id),
                    supabase.from('capsule_items').select('media_url, media_type, thumbnail_url, content, caption').eq('capsule_id', capsule.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
                    user ? supabase.from('likes').select('id').eq('capsule_id', capsule.id).eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
                    (user && user.id !== capsule.owner_id)
                        ? supabase.from('follows').select('id').eq('follower_id', user.id).eq('following_id', capsule.owner_id).maybeSingle()
                        : Promise.resolve({ data: null }),
                    capsule.status === 'opened'
                        ? supabase.from('capsule_items').select('media_url, media_type').eq('capsule_id', capsule.id).in('media_type', ['image', 'video']).order('created_at', { ascending: true }).limit(4)
                        : Promise.resolve({ data: [] }),
                ]);

                setLikeCount(likesRes.count || 0);
                setCommentCount(commentsRes.count || 0);
                setPostsCount(postsRes.count || 0);
                if (latestRes?.data) setLatestItem(latestRes.data);
                setIsLiked(!!likeCheckRes?.data);
                setIsFollowed(!!followRes?.data);
                if (collageRes?.data?.length) setMediaCollage(collageRes.data);
            }
        };
        init();
    }, [capsule.id]);

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
        if (isLiked) {
            const { error } = await supabase.from('likes').delete().eq('capsule_id', capsule.id).eq('user_id', currentUserId);
            if (!error) {
                setIsLiked(false);
                setLikeCount(prev => prev - 1);
            }
        } else {
            const { error } = await supabase.from('likes').insert({ capsule_id: capsule.id, user_id: currentUserId });
            if (!error) {
                setIsLiked(true);
                setLikeCount(prev => prev + 1);
                // Notify
                if (currentUserId !== capsule.owner_id) {
                    await supabase.from('notifications').insert({
                        user_id: capsule.owner_id,
                        sender_id: currentUserId,
                        type: 'like',
                        capsule_id: capsule.id,
                        message: 'liked your capsule',
                    });
                }
            }
        }
    };

    const handlePress = () => {
        if (isLocked) {
            Alert.alert(t('profile.private_capsule'), t('profile.private_capsule_msg'));
            return;
        }
        navigation.navigate('CapsuleDetail', { capsuleId: capsule.id });
    };

    const profile = capsule.profiles || { username: 'user', avatar_url: null };

    return (
        <TouchableOpacity activeOpacity={0.9} onPress={handlePress} style={styles.cardContainer}>
            <View style={styles.cardHeader}>
                <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.navigate('UserProfile', { targetUserId: capsule.owner_id })}>
                    {profile.avatar_url
                        ? <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
                        : <View style={[styles.avatar, { backgroundColor: Colors.border, alignItems: 'center', justifyContent: 'center' }]}>
                            <Ionicons name="person" size={20} color={Colors.textMuted} />
                        </View>
                    }
                </TouchableOpacity>
                <View style={styles.creatorInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.navigate('UserProfile', { targetUserId: capsule.owner_id })} style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={styles.username}>{profile.display_name || profile.username}</Text>
                            {profile.is_verified && <VerifiedBadge size={14} style={{ marginLeft: 2 }} />}
                        </TouchableOpacity>
                        {currentUserId !== capsule.owner_id && (
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
                    <Text style={styles.infoText}>
                        {capsule.status === 'opened' ? (
                            <Text style={{ color: themeColor, fontFamily: Fonts.bold }}>
                                ✨ Opened this capsule •{' '}
                            </Text>
                        ) : (
                            t('feed.created') + ' '
                        )}
                        {new Date(capsule.status === 'opened' ? capsule.opens_at : capsule.created_at).toLocaleDateString()}
                    </Text>
                </View>
                <View style={[styles.typePill, { backgroundColor: cfg.bgColor + 'cc', borderColor: cfg.color + '30' }]}>
                    <Ionicons name={cfg.icon as any} size={10} color={cfg.color} />
                    <Text style={[styles.typeLabel, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
            </View>

            {/* ─ Capsule visual zone ─ */}
            <View style={[
                styles.capsuleVisualContainer,
                capsule.status === 'opened' && styles.openedVisualContainer,
                { backgroundColor: themeColor + '10' }
            ]}>
                {/* Shimmer radial gradient background */}
                {capsule.status !== 'opened' && (
                    <>
                        <LinearGradient
                            colors={['rgba(255,255,255,0.0)', 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0.0)']}
                            start={{ x: 0.2, y: 0 }}
                            end={{ x: 0.8, y: 1 }}
                            style={StyleSheet.absoluteFill}
                        />
                        <LinearGradient
                            colors={[themeColor + '00', themeColor + '18', themeColor + '00']}
                            start={{ x: 0, y: 0.3 }}
                            end={{ x: 1, y: 0.7 }}
                            style={StyleSheet.absoluteFill}
                        />
                    </>
                )}

                {capsule.status === 'sealed' && latestItem?.media_type === 'video' && latestItem?.thumbnail_url && (
                    <View style={StyleSheet.absoluteFill}>
                        <Image
                            source={{ uri: latestItem.thumbnail_url }}
                            style={styles.blurredBg}
                            blurRadius={Platform.OS === 'ios' ? 30 : 15}
                        />
                        <View style={styles.darkOverlay} />
                    </View>
                )}

                {capsule.status === 'opened' && mediaCollage.length > 0 ? (
                    <View style={styles.openedRow}>
                        <View style={styles.collageColumn}>
                            <View style={[styles.collageGrid, { gap: mediaCollage.length > 1 ? 2 : 0 }]}>
                                {mediaCollage.map((item, idx) => (
                                    <Image
                                        key={idx}
                                        source={{ uri: item.media_url }}
                                        style={[
                                            styles.collageItem,
                                            mediaCollage.length === 1 && styles.collageItemSingle,
                                            mediaCollage.length === 2 && styles.collageItemDual,
                                            mediaCollage.length === 3 && idx === 0 && styles.collageItemTripleLarge
                                        ]}
                                        resizeMode="cover"
                                    />
                                ))}
                            </View>
                            {/* Opened badge */}
                            <View style={[styles.openedBadgeOverlay, { backgroundColor: themeColor + 'cc', borderColor: themeColor }]}>
                                <Ionicons name="lock-open-outline" size={10} color="#fff" />
                                <Text style={styles.openedBadgeText}>Opened</Text>
                            </View>
                        </View>
                        <View style={styles.modelColumn}>
                            <View style={styles.modelShadowContainer}>
                                <CapsuleWithTimer
                                    modelKey={capsule.model}
                                    source={{ uri: modelImages.open }}
                                    date={capsule.opens_at}
                                    capsuleType={capsule.type}
                                    chainId={capsule.chain_id}
                                    hideTimer
                                    style={styles.capsuleSmall}
                                    isOpened={true}
                                />
                            </View>
                        </View>
                    </View>
                ) : (
                    <>
                        <CapsuleWithTimer
                            modelKey={capsule.model}
                            source={{ uri: capsule.status === 'opened' ? modelImages.open : modelImages.closed }}
                            date={capsule.opens_at}
                            chainId={capsule.chain_id}
                            capsuleType={capsule.type}
                            hideTimer={capsule.status === 'opened'}
                            style={styles.capsulePng}
                            isOpened={capsule.status === 'opened'}
                        />
                        {capsule.status === 'sealed' && latestItem?.media_type === 'video' && latestItem?.content && (
                            <View style={styles.durationBadge}>
                                <Ionicons name="play" size={12} color="#fff" />
                                <Text style={styles.durationText}>{latestItem.content}</Text>
                            </View>
                        )}
                        {capsule.status === 'sealed' && (
                            <View style={styles.sealedBadge}>
                                <Ionicons name="lock-closed" size={13} color="#fff" />
                            </View>
                        )}
                    </>
                )}
            </View>

            {/* ─ Footer ─ */}
            <View style={styles.cardFooter}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.capsuleTitle}>{capsule.title}</Text>
                    {isLocked && (
                        <Ionicons name="lock-closed" size={16} color="#ff4757" style={{ marginLeft: 6, marginBottom: 4 }} />
                    )}
                </View>

                {capsule.status === 'sealed' && latestItem?.media_type === 'video' ? (
                    <View style={styles.videoStatusRow}>
                        <View style={styles.videoIconCircle}>
                            <Ionicons name="videocam" size={13} color={Colors.primary} />
                        </View>
                        <Text style={styles.videoStatusText}>New video shared</Text>
                    </View>
                ) : (
                    <Text style={styles.description} numberOfLines={2}>{capsule.description}</Text>
                )}

                <View style={styles.actions}>
                    <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7} onPress={handleLike}>
                        <Ionicons name={isLiked ? "heart" : "heart-outline"} size={19} color={isLiked ? "#ff4757" : Colors.textMuted} />
                        <Text style={styles.actionCount}>{likeCount}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7} onPress={handlePress}>
                        <Ionicons name="chatbubble-outline" size={18} color={Colors.textMuted} />
                        <Text style={styles.actionCount}>{commentCount}</Text>
                    </TouchableOpacity>
                    <View style={styles.actionBtnRight}>
                        <Ionicons name="images-outline" size={17} color={Colors.textMuted} />
                        <Text style={styles.actionCount}>{postsCount}</Text>
                    </View>
                </View>
            </View>
        </TouchableOpacity >
    );
});

export default CapsuleCard;

const styles = StyleSheet.create({
    cardContainer: {
        marginHorizontal: Spacing.md,
        marginBottom: Spacing.md + 2,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.78)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.7)',
        padding: Spacing.md,
        ...Shadow.card,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
    avatar: { width: 38, height: 38, borderRadius: 19, marginRight: Spacing.sm, borderWidth: 1.5, borderColor: Colors.border },
    creatorInfo: { flex: 1 },
    username: { color: Colors.textPrimary, fontSize: 13, fontFamily: Fonts.semiBold },
    infoText: { color: Colors.textMuted, fontSize: 11, fontFamily: Fonts.regular, marginTop: 1 },

    // Follow pill
    followMiniBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: Colors.primary + '12' },
    followMiniBtnActive: { backgroundColor: Colors.border + '66' },
    followMiniText: { fontSize: 11, fontFamily: Fonts.bold, color: Colors.primary },
    followMiniTextActive: { color: Colors.textMuted },
    // keep legacy refs
    followBtnText: { fontSize: 11, fontFamily: Fonts.bold, color: Colors.primary },
    followedText: { color: Colors.textMuted },

    // Type pill
    typePill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, gap: 4, borderWidth: 1 },
    typeLabel: { fontSize: 10, fontFamily: Fonts.bold },

    // Visual container
    capsuleVisualContainer: {
        paddingVertical: Spacing.lg + 6,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        borderRadius: 24,
        marginVertical: Spacing.sm,
        overflow: 'hidden',
    },
    capsulePng: { width: 180, height: 180 },
    blurredBg: { ...StyleSheet.absoluteFillObject, opacity: 0.6 },
    darkOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)' },

    durationBadge: {
        position: 'absolute', top: 12, left: 12,
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    durationText: { color: '#fff', fontSize: 12, fontFamily: Fonts.bold },

    sealedBadge: {
        position: 'absolute', bottom: 12, right: 12,
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
        backgroundColor: 'rgba(0,0,0,0.55)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    },
    sealedBadgeText: { fontSize: 11, fontFamily: Fonts.bold, color: '#fff', letterSpacing: 0.4 },

    videoStatusRow: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        marginBottom: Spacing.sm,
        paddingHorizontal: 10, paddingVertical: 8,
        borderRadius: 12, backgroundColor: Colors.primary + '10',
        alignSelf: 'flex-start',
    },
    videoIconCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primary + '1A', alignItems: 'center', justifyContent: 'center' },
    videoStatusText: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.primary },

    cornerTypeIcon: { position: 'absolute', top: 0, right: 0, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', ...Shadow.subtle },
    timerBadge: { marginTop: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, backgroundColor: Colors.cardAlt },
    timerDot: { width: 6, height: 6, borderRadius: 3 },
    timerText: { fontSize: 12, fontFamily: Fonts.semiBold },

    // Footer
    cardFooter: { marginTop: Spacing.xs },
    metaLine: { fontSize: 10, fontFamily: Fonts.bold, color: Colors.textMuted, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.7 },
    capsuleTitle: { color: Colors.textPrimary, fontSize: 17, fontFamily: Fonts.bold, marginBottom: 6, letterSpacing: -0.2, flex: 1 },
    description: { color: Colors.textSecondary, fontSize: 13, fontFamily: Fonts.regular, lineHeight: 19, marginBottom: Spacing.md },

    // Actions
    actions: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 10, marginTop: 4,
        borderTopWidth: 1, borderTopColor: Colors.border + '88',
    },
    actionBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 10, paddingVertical: 8,
        borderRadius: 999, backgroundColor: Colors.cardAlt,
    },
    actionBtnRight: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 10, paddingVertical: 8,
        borderRadius: 999, backgroundColor: Colors.cardAlt,
    },
    actionCount: { color: Colors.textMuted, fontSize: 12, fontFamily: Fonts.semiBold },

    // Opened collage layout
    openedVisualContainer: { paddingVertical: 0, backgroundColor: 'transparent', marginTop: Spacing.sm },
    openedRow: { flexDirection: 'row', width: '100%', height: 228, alignItems: 'center' },
    collageColumn: { flex: 1.5, height: '100%', position: 'relative', borderRadius: 24, overflow: 'hidden' },
    modelColumn: { flex: 1, height: '100%', justifyContent: 'center', alignItems: 'center', marginLeft: -30, zIndex: 10 },
    modelShadowContainer: {
        ...Platform.select({
            web: { boxShadow: '0px 8px 30px rgba(0,0,0,0.4)' },
            ios: { shadowColor: 'rgba(0,0,0,0.4)', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 15 },
            android: { elevation: 10 }
        })
    },
    collageGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', borderRadius: 24, overflow: 'hidden' },
    collageItem: { width: '49.5%', height: '49.5%', backgroundColor: Colors.border },
    collageItemSingle: { width: '100%', height: '100%' },
    collageItemDual: { width: '49.5%', height: '100%' },
    collageItemTripleLarge: { width: '100%', height: '49.5%' },
    capsuleSmall: { width: 155, height: 155 },
    openedBadgeOverlay: {
        position: 'absolute', top: 12, left: 12,
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: 10, paddingVertical: 5,
        borderRadius: 999, zIndex: 5,
        borderWidth: 1,
        ...Shadow.subtle,
    },
    openedBadgeText: { fontSize: 11, fontFamily: Fonts.bold, color: '#fff' },
});

