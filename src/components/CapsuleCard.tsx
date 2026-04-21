import React, { useState, useEffect, useMemo } from 'react';
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
import { MODEL_IMAGES, MODEL_IMAGES_OPEN } from '../constants/models';
import VerifiedBadge from './VerifiedBadge';
import { timerConfigManager } from '../utils/timerConfig';
import { Image } from 'expo-image';
import CapsuleWithTimer from './CapsuleWithTimer';

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

const formatOpenDate = (dateStr: string): string => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const CollageView = React.memo(({ items, isOpened, themeColor, s }: { items: any[], isOpened: boolean, themeColor: string, s: any }) => {
    if (items.length <= 1) return null;

    const displayItems = items.slice(0, 4);
    const hasMore = items.length > 4;

    const renderItem = (item: any, style: any, idx: number) => {
        const src = item.thumbnail_url || item.media_url;
        const isLast = idx === 3 && hasMore;

        return (
            <View key={item.id || idx} style={[s.collageItem, style, { height: '100%' }]}>
                <Image 
                    source={{ uri: src }}
                    style={StyleSheet.absoluteFill}
                    blurRadius={!isOpened ? (Platform.OS === 'ios' ? 50 : 20) : 0}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                />
                {!isOpened && (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: Platform.OS === 'ios' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.7)' }]} />
                )}
                {item.media_type === 'video' && !isLast && (
                    <View style={s.collagePlayBtn}>
                        <Ionicons name="play" size={12} color="#fff" />
                    </View>
                )}
                {isLast && (
                    <View style={s.collageMoreOverlay}>
                        <Text style={s.collageMoreText}>+{items.length - 3}</Text>
                    </View>
                )}
            </View>
        );
    };

    return (
        <View style={s.collageContainer}>
            {displayItems.length === 2 && (
                <View style={s.collageRow}>
                    {renderItem(displayItems[0], { flex: 1 }, 0)}
                    {renderItem(displayItems[1], { flex: 1, marginLeft: 2 }, 1)}
                </View>
            )}
            {displayItems.length === 3 && (
                <View style={s.collageRow}>
                    {renderItem(displayItems[0], { flex: 2 }, 0)}
                    <View style={{ flex: 1, marginLeft: 2, gap: 2 }}>
                        {renderItem(displayItems[1], { flex: 1 }, 1)}
                        {renderItem(displayItems[2], { flex: 1 }, 2)}
                    </View>
                </View>
            )}
            {displayItems.length >= 4 && (
                <View style={{ flex: 1, gap: 2 }}>
                    <View style={s.collageRow}>
                        {renderItem(displayItems[0], { flex: 1 }, 0)}
                        {renderItem(displayItems[1], { flex: 1, marginLeft: 2 }, 1)}
                    </View>
                    <View style={s.collageRow}>
                        {renderItem(displayItems[2], { flex: 1 }, 2)}
                        {renderItem(displayItems[3], { flex: 1, marginLeft: 2 }, 3)}
                    </View>
                </View>
            )}
        </View>
    );
});

const CapsuleCard = React.memo(({ 
    capsule, 
    userId: currentUserId, 
    isLocked: isLockedProp,
    isLiked: isLikedProp,
    likeCount: likeCountProp,
    commentCount: commentCountProp,
    postsCount: postsCountProp,
    isFollowed: isFollowedProp,
    latestItem: latestItemProp,
    mediaCollage: mediaCollageProp,
    onLike,
    onFollow,
    lightweight,
    hideParticles,
    gridMode,
    onViewable,
}: { 
    capsule: any; 
    userId?: string | null;
    isLocked?: boolean; 
    isLiked?: boolean;
    likeCount?: number;
    commentCount?: number;
    postsCount?: number;
    isFollowed?: boolean;
    latestItem?: any;
    mediaCollage?: any[];
    onLike?: (capsuleId: string, isLiked: boolean) => void;
    onFollow?: (ownerId: string, isFollowed: boolean) => void;
    lightweight?: boolean;
    hideParticles?: boolean;
    gridMode?: boolean;
    onViewable?: () => void;
}) => {
    const navigation = useNavigation<any>();
    const { t } = useTranslation();

    const [isFollowed, setIsFollowed] = useState(isFollowedProp ?? !!capsule.is_followed);
    const [likeCount, setLikeCount] = useState(likeCountProp ?? capsule.likes_count ?? 0);
    const [isLiked, setIsLiked] = useState(isLikedProp ?? !!capsule.is_liked);
    const [commentCount, setCommentCount] = useState(commentCountProp ?? capsule.comments_count ?? 0);
    const [postsCount, setPostsCount] = useState(postsCountProp ?? capsule.posts_count ?? 0);
    const [mediaCollage, setMediaCollage] = useState<any[]>(mediaCollageProp ?? capsule.collage_items ?? []);
    const [latestItem, setLatestItem] = useState<any>(latestItemProp ?? capsule.latest_item ?? null);
    const [latestItemLoaded, setLatestItemLoaded] = useState(!!(latestItemProp || capsule.latest_item));
    
    const isLocked = isLockedProp ?? !(capsule.is_public || capsule.owner_id === currentUserId || capsule.is_participant);
    const cfg = typeConfig[capsule.type as keyof typeof typeConfig] || typeConfig.legacycap;

    const modelImages = useMemo(() => ({
        closed: timerConfigManager.getModelThumbnail(capsule.model) || MODEL_IMAGES[capsule.model as keyof typeof MODEL_IMAGES] || (MODEL_IMAGES as any).basicred_kap,
        open: timerConfigManager.getModelThumbnail(capsule.model) || MODEL_IMAGES_OPEN[capsule.model as keyof typeof MODEL_IMAGES_OPEN] || (MODEL_IMAGES as any).basicred_kap,
    }), [capsule.model]);

    const themeColor = useMemo(() => {
        return timerConfigManager.getConfig(capsule.model)?.themeColor || '#a269ff';
    }, [capsule.model]);

    const heartScale = React.useRef(new Animated.Value(1)).current;
    const bounceHeart = () => {
        Animated.sequence([
            Animated.timing(heartScale, { toValue: 1.35, duration: 90, useNativeDriver: true }),
            Animated.spring(heartScale, { toValue: 1, friction: 4, tension: 130, useNativeDriver: true }),
        ]).start();
    };

    useEffect(() => {
        setIsFollowed(isFollowedProp ?? !!capsule.is_followed);
        setLikeCount(likeCountProp ?? capsule.likes_count ?? 0);
        setIsLiked(isLikedProp ?? !!capsule.is_liked);
        setCommentCount(commentCountProp ?? capsule.comments_count ?? 0);
        setPostsCount(postsCountProp ?? capsule.posts_count ?? 0);
        setMediaCollage(mediaCollageProp ?? capsule.collage_items ?? []);
        setLatestItem(latestItemProp ?? capsule.latest_item ?? null);
        setLatestItemLoaded(!!(latestItemProp || capsule.latest_item));
    }, [isFollowedProp, likeCountProp, isLikedProp, commentCountProp, postsCountProp, mediaCollageProp, latestItemProp, capsule]);

    useEffect(() => {
        if (onViewable) {
            onViewable();
        }
    }, []);

    const handleFollow = async () => {
        if (!currentUserId || currentUserId === capsule.owner_id) return;
        if (onFollow) {
             onFollow(capsule.owner_id, isFollowed);
        } else {
            if (isFollowed) {
                await supabase.from('follows').delete().eq('follower_id', currentUserId).eq('following_id', capsule.owner_id);
                setIsFollowed(false);
            } else {
                await supabase.from('follows').insert({ follower_id: currentUserId, following_id: capsule.owner_id });
                setIsFollowed(true);
            }
        }
    };

    const handleLike = async () => {
        if (!currentUserId) return;
        bounceHeart();
        
        const wasLiked = isLiked;
        const newIsLiked = !wasLiked;
        const newCount = wasLiked ? likeCount - 1 : likeCount + 1;

        // Instant visual feedback
        setIsLiked(newIsLiked);
        setLikeCount(newCount);

        if (onLike) {
            onLike(capsule.id, wasLiked);
        } else {
            try {
                if (wasLiked) {
                    const { error } = await supabase.from('likes').delete().eq('capsule_id', capsule.id).eq('user_id', currentUserId);
                    if (error) throw error;
                } else {
                    const { error } = await supabase.from('likes').insert({ capsule_id: capsule.id, user_id: currentUserId });
                    if (error) throw error;
                    
                    if (currentUserId !== capsule.owner_id) {
                        const { data: existing } = await supabase.from('notifications')
                            .select('id').eq('user_id', capsule.owner_id).eq('sender_id', currentUserId).eq('type', 'like').eq('capsule_id', capsule.id).maybeSingle();
                        
                        if (existing) {
                            await supabase.from('notifications').update({ created_at: new Date().toISOString(), is_read: false }).eq('id', existing.id);
                        } else {
                            await supabase.from('notifications').insert({
                                user_id: capsule.owner_id, sender_id: currentUserId,
                                type: 'like', capsule_id: capsule.id, message: 'liked your capsule',
                            });
                        }
                    }
                }
            } catch (err) {
                // Revert on error
                setIsLiked(wasLiked);
                setLikeCount(wasLiked ? newCount + 1 : newCount - 1);
                console.error('Like error in Card:', err);
            }
        }
    };

    const handlePress = () => {
        if (isLocked) { Alert.alert(t('profile.private_capsule'), t('profile.private_capsule_msg')); return; }
        // Navigation should use capsule_id for item events, falling back to id for capsule events
        const cid = (capsule as any).capsule_id || capsule.id;
        navigation.navigate('CapsuleDetail', { capsuleId: cid });
    };

    const profile = capsule.profiles || { username: 'user', avatar_url: null };
    const isOpened = capsule.status === 'opened';
    const isSealed = capsule.status === 'sealed';
    // A media post is shown if it's an item event from the feed, OR if it's a sealed capsule with content (legacy behavior/profile)
    const isMediaPost = (capsule.feed_type === 'item' || (isSealed && !capsule.feed_type)) && 
                        latestItemLoaded && (latestItem?.media_type === 'video' || latestItem?.media_type === 'image');

    const isToday = useMemo(() => {
        if (!capsule.opens_at || isOpened) return false;
        const d = new Date(capsule.opens_at);
        const now = new Date();
        return d.toDateString() === now.toDateString();
    }, [capsule.opens_at, isOpened]);

    // ─── GRID MODE (Explore tab) ─────────────────────────────────────────────
    if (gridMode) {
        const previewItems = mediaCollage.slice(0, 4);
        const hasPreview = previewItems.length > 0;

        return (
            <TouchableOpacity activeOpacity={0.92} onPress={handlePress} style={[s.gridCard, isToday && { borderWidth: 2, borderColor: '#A855F7' }]}>

                {/* ── Top: Capsule model zone ── */}
                <View style={s.gridTopZone}>
                    <LinearGradient
                        colors={[Colors.cardAlt, Colors.background]}
                        style={StyleSheet.absoluteFill}
                    />
                    {/* Subtle radial glow */}
                    <View style={[s.gridGlow, { backgroundColor: themeColor + '12' }]} />

                    <CapsuleWithTimer
                        modelKey={capsule.model}
                        source={{ uri: isOpened ? modelImages.open : modelImages.closed }}
                        date={capsule.opens_at}
                        chainId={capsule.chain_id}
                        capsuleType={capsule.type}
                        hideTimer={isOpened}
                        isOpened={isOpened}
                        style={s.gridCapsuleImg}
                        hideParticles={true}
                        lightweight={true}
                        disableAnimations={true}
                    />

                    {/* Type badge */}
                    <View style={[s.gridTypeBadge, { backgroundColor: cfg.color }]}>
                        <Ionicons name={cfg.icon} size={8} color="#fff" />
                        <Text style={s.gridTypeBadgeText}>{cfg.label}</Text>
                    </View>

                    {/* Status badge */}
                    <View style={[s.gridStatusBadge, { backgroundColor: isOpened ? '#4ADE80' : '#F87171' }]}>
                        <Ionicons name={isOpened ? "lock-open" : "lock-closed"} size={10} color="#fff" />
                    </View>

                </View>

                {/* ── Middle: 3-column post preview ── */}
                <View style={s.gridPreviewRow}>
                    {postsCount > 0 ? (
                        previewItems.slice(0, 3).map((pi: any, idx: number) => {
                            const src = pi.thumbnail_url || (pi.media_url && !pi.media_url.startsWith('text://') ? pi.media_url : null);
                            return (
                                <View key={pi.id || idx} style={s.gridPreviewItem}>
                                    {src ? (
                                        <Image
                                            source={{ uri: src }}
                                            style={StyleSheet.absoluteFill}
                                            blurRadius={!isOpened ? (Platform.OS === 'ios' ? 35 : 15) : 0}
                                            contentFit="cover"
                                            cachePolicy="memory-disk"
                                            recyclingKey={`gp-${capsule.id}-${idx}`}
                                        />
                                    ) : (
                                        <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.cardAlt, alignItems: 'center', justifyContent: 'center' }]}>
                                            <Ionicons name="document-text-outline" size={12} color={Colors.textMuted} opacity={0.5} />
                                        </View>
                                    )}
                                    {!isOpened && (
                                        <View style={[StyleSheet.absoluteFill, { backgroundColor: Platform.OS === 'ios' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.7)' }]} />
                                    )}
                                </View>
                            );
                        })
                    ) : (
                        /* 3 Placeholders if 0 items */
                        [0, 1, 2].map((i) => (
                            <View key={i} style={s.gridPreviewItem}>
                                <View style={s.gridPlaceholderInner}>
                                    <View style={[s.gridPlaceholderDot, { backgroundColor: themeColor + '20' }]} />
                                </View>
                            </View>
                        ))
                    )}
                </View>

                <View style={s.gridBottom}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={s.gridTitle} numberOfLines={1}>{capsule.title}</Text>
                    </View>
                    <View style={s.gridAuthorRow}>
                        <Image source={{ uri: Colors.getAvatarUrl(profile.avatar_url, profile.display_name || profile.username) }} style={s.gridAvatar} contentFit="cover" cachePolicy="memory-disk" />
                        <Text style={s.gridAuthorName} numberOfLines={1}>
                            {profile.display_name || profile.username}
                        </Text>
                        {profile.is_verified && <VerifiedBadge size={9} />}
                    </View>
                </View>
            </TouchableOpacity>
        );
    }

    // ─── CARD MODE (Following tab) ───────────────────────────────────────────
    return (
        <TouchableOpacity activeOpacity={0.95} onPress={handlePress} style={[s.card, isToday && { borderWidth: 2, borderColor: '#A855F7' }]}>

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

                {/* Blurred bg for media post — using blurRadius on Image (no BlurView) */}
                {isMediaPost && (latestItem?.thumbnail_url || latestItem?.media_url) && mediaCollage.length <= 1 && (
                    <View style={StyleSheet.absoluteFill}>
                        <Image 
                            source={{ uri: latestItem.thumbnail_url || latestItem.media_url }} 
                            style={[s.blurBg, isOpened && { opacity: 1 }]} 
                            blurRadius={!isOpened ? (Platform.OS === 'ios' ? 50 : 20) : 0} 
                            contentFit="cover" 
                            cachePolicy="memory-disk"
                            recyclingKey={`card-vid-${capsule.id}`}
                        />
                        <View style={[StyleSheet.absoluteFill, { backgroundColor: !isOpened ? (Platform.OS === 'ios' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.7)') : 'transparent' }]} />
                    </View>
                )}

                {/* Collage View for Multiple Items */}
                {isMediaPost && mediaCollage.length > 1 && (
                    <CollageView items={mediaCollage} isOpened={isOpened} themeColor={themeColor} s={s} />
                )}

                {/* ── Opened: cover_url OR collage + model (Only if NOT a specific media post event) ── */}
                {isOpened && capsule.feed_type !== 'item' && (capsule.cover_url || mediaCollage.length > 0) ? (
                    <View style={s.openedRow}>
                        {capsule.cover_url ? (
                            <Image
                                source={{ uri: capsule.cover_url }}
                                style={StyleSheet.absoluteFill}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                                recyclingKey={`cap-cover-${capsule.id}`}
                            />
                        ) : (
                            <View style={s.collageWrap}>
                                <View style={s.collageGrid}>
                                {mediaCollage.slice(0, 4).map((item, i) => (
                                    <Image
                                        key={item.id || i}
                                        source={{ uri: (item.media_url && !item.media_url.startsWith('text://')) ? item.media_url : '' }}
                                        style={[
                                            s.collageItem,
                                            mediaCollage.length === 1 && s.collageSingle,
                                            mediaCollage.length === 2 && s.collageDual,
                                            mediaCollage.slice(0, 4).length === 3 && i === 0 && s.collageTripleLarge,
                                        ]}
                                        contentFit="cover"
                                        cachePolicy="memory-disk"
                                        recyclingKey={`cap-collage-${item.id || i}`}
                                    />
                                ))}
                                </View>
                                <LinearGradient
                                    colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.9)']}
                                    start={{ x: 0.5, y: 0 }} end={{ x: 1, y: 0 }}
                                    style={[StyleSheet.absoluteFill, { pointerEvents: 'none' } as any]}
                                />
                            </View>
                        )}
                        <View style={s.modelOverlap}>
                            <CapsuleWithTimer
                                modelKey={capsule.model}
                                source={{ uri: modelImages.open }}
                                date={capsule.opens_at}
                                chainId={capsule.chain_id}
                                capsuleType={capsule.type}
                                hideTimer
                                isOpened
                                style={s.capsuleSmall}
                                hideParticles={true}
                                lightweight={true}
                                disableAnimations={true}
                            />
                        </View>
                    </View>

                ) : isMediaPost ? (
                    <View style={s.videoWrap}>
                        {latestItem?.media_type === 'video' && mediaCollage.length <= 1 && (
                            <View style={s.videoPlayBtn}>
                                <Ionicons name="play" size={24} color="#fff" style={{ marginLeft: 2 }} />
                            </View>
                        )}
                        <View style={s.modelCorner}>
                            <Image 
                                source={{ uri: modelImages.closed }} 
                                style={s.capsuleCornerImg} 
                                contentFit="contain" 
                                cachePolicy="memory-disk"
                            />
                        </View>
                    </View>

                ) : (
                    <View style={s.sealedWrap}>
                        <CapsuleWithTimer
                            modelKey={capsule.model}
                            source={{ uri: isOpened ? modelImages.open : modelImages.closed }}
                            date={capsule.opens_at}
                            chainId={capsule.chain_id}
                            capsuleType={capsule.type}
                            hideTimer={isOpened}
                            isOpened={isOpened}
                            style={s.capsuleLarge}
                            hideParticles={hideParticles || lightweight || gridMode}
                            lightweight={lightweight}
                            disableAnimations={gridMode || lightweight}
                            isMinimal={lightweight || gridMode}
                        />
                    </View>
                )}

                {/* ── Badges ── */}
                <View style={[s.typeBadge, { backgroundColor: cfg.color }]}>
                    <Ionicons name={cfg.icon} size={9} color="#fff" />
                    <Text style={s.typeBadgeText}>{cfg.label}</Text>
                </View>

                {isMediaPost && latestItem?.content && (
                    <View style={s.durationBadge}>
                        <Text style={s.durationText}>{latestItem.content.split('|')[0]}</Text>
                    </View>
                )}



                {/* Lock Status Badge */}
                <View style={[s.lockBadge, { backgroundColor: isOpened ? '#4ADE80' : '#F87171' }]}>
                    <Ionicons name={isOpened ? "lock-open" : "lock-closed"} size={10} color="#fff" />
                </View>
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
                        <Image 
                            source={{ uri: Colors.getAvatarUrl(profile.avatar_url, profile.display_name || profile.username) }} 
                            style={s.avatar} 
                            contentFit="cover" 
                            cachePolicy="memory-disk"
                        />

                        <View style={{ flex: 1, minWidth: 0 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                <Text style={s.authorName} numberOfLines={1}>{profile.display_name || profile.username}</Text>
                                {profile.is_verified && <VerifiedBadge size={13} />}
                            </View>
                            <Text style={s.authorTime}>
                                {timeAgo(isOpened ? capsule.opens_at : capsule.created_at)}
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                    <Text style={s.title} numberOfLines={1}>
                        {capsule.title}
                    </Text>
                </View>

                {/* Desc or media label */}
                {isMediaPost ? (
                    <View style={{ marginBottom: 9 }}>
                        {latestItem?.caption ? (
                            <Text style={[s.desc, { marginBottom: 4, fontFamily: Fonts.semiBold, color: Colors.primary }]} numberOfLines={1}>
                                {latestItem.caption.replace(/!!b:[a-z0-9]+/g, '').trim()}
                            </Text>
                        ) : null}
                        <View style={s.videoRow}>
                            <Ionicons name={mediaCollage.length > 1 ? "images" : (latestItem?.media_type === 'video' ? "videocam" : "image")} size={11} color={Colors.primary} />
                            <Text style={s.videoLabel}>
                                {mediaCollage.length > 1 
                                    ? t('feed.shared_items', { count: latestItem?.group_count || mediaCollage.length })
                                    : t(`feed.shared_${latestItem?.media_type === 'video' ? "video" : "photo"}`)
                                 }
                            </Text>
                        </View>
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

                    {capsule.opens_at && (
                        <View style={s.dateChip}>
                            <Ionicons
                                name={isOpened ? 'lock-open' : 'lock-closed'}
                                size={10}
                                color={isOpened ? '#4ADE80' : '#F87171'}
                            />
                            <Text style={[s.dateText, isOpened && { color: '#4ADE80', fontFamily: Fonts.bold }]}>
                                {isOpened ? 'Unlocked ' : 'Unlocks '}{formatOpenDate(capsule.opens_at)}
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
const GRID_GAP = 2;
const GRID_COLS = 2;
const GRID_ITEM_WIDTH = (width - Spacing.md * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;

const s = StyleSheet.create({
    // ── Card Mode ────────────────────────────────────────────────────────────
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
        height: 200,
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

    // Badges
    typeBadge: {
        position: 'absolute', top: 10, left: 10,
        flexDirection: 'row', alignItems: 'center', gap: 3,
        paddingHorizontal: 7, paddingVertical: 3,
        borderRadius: 30,
    },
    typeBadgeText: { fontSize: 9, fontFamily: Fonts.bold, color: '#fff', letterSpacing: 0.2 },

    durationBadge: {
        position: 'absolute', top: 10, right: 10,
        flexDirection: 'row', alignItems: 'center', gap: 3,
        paddingHorizontal: 7, paddingVertical: 3,
        borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.52)',
    },
    durationText: { fontSize: 10, fontFamily: Fonts.bold, color: '#fff' },

    openedBadge: {
        position: 'absolute', top: 10, right: 10,
        flexDirection: 'row', alignItems: 'center', gap: 3,
        paddingHorizontal: 7, paddingVertical: 3,
        borderRadius: 30,
    },
    openedBadgeText: { fontSize: 9, fontFamily: Fonts.bold, color: '#fff' },

    lockBadge: {
        position: 'absolute', bottom: 8, right: 10,
        width: 22, height: 22, borderRadius: 11,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 2, borderColor: Colors.surface,
    },

    // Body
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

    // Collage
    collageContainer: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
    collageRow: { flex: 1, flexDirection: 'row' },
    collagePlayBtn: {
        position: 'absolute',
        top: 6,
        right: 6,
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: 'rgba(0,0,0,0.4)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    collageMoreOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    collageMoreText: {
        color: '#fff',
        fontSize: 18,
        fontFamily: Fonts.bold,
    },

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

    dateChip: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 8, paddingVertical: 4,
        borderRadius: 18, backgroundColor: Colors.cardAlt,
    },
    dateText: { fontSize: 10, fontFamily: Fonts.medium, color: Colors.textMuted },

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

    // Top zone with capsule model
    gridTopZone: {
        height: GRID_ITEM_WIDTH * 0.7,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
    },
    gridGlow: {
        position: 'absolute',
        width: 120,
        height: 120,
        borderRadius: 60,
        top: '50%',
        left: '50%',
        marginTop: -60,
        marginLeft: -60,
        opacity: 0.6,
    },
    gridCapsuleImg: {
        width: 88,
        height: 88,
    },

    gridTypeBadge: {
        position: 'absolute',
        top: 8,
        left: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 20,
    },
    gridTypeBadgeText: {
        fontSize: 8,
        fontFamily: Fonts.bold,
        color: '#fff',
        letterSpacing: 0.3,
    },

    gridStatusBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 18,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: Colors.surface,
    },

    // 2×2 post preview
    gridPreviewRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        height: GRID_ITEM_WIDTH * 0.35,
        borderTopWidth: 1,
        borderTopColor: Colors.borderLight,
    },
    gridPreviewItem: {
        width: '33.33%',
        height: '100%',
        backgroundColor: Colors.cardAlt,
        borderRightWidth: 1,
        borderRightColor: Colors.borderLight,
    },
    gridPlaceholderInner: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Colors.cardAlt,
    },
    gridPlaceholderDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    gridPreviewEmpty: {
        height: GRID_ITEM_WIDTH * 0.35,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Colors.cardAlt,
        borderTopWidth: 1,
        borderTopColor: Colors.borderLight,
        gap: 4,
    },
    gridPreviewEmptyText: {
        fontSize: 10,
        fontFamily: Fonts.medium,
        color: Colors.textMuted,
    },

    // White bottom bar
    gridBottom: {
        paddingHorizontal: 10,
        paddingVertical: 8,
        backgroundColor: Colors.surface,
        borderTopWidth: 1,
        borderTopColor: Colors.borderLight,
    },
    gridTitle: {
        fontSize: 12,
        fontFamily: Fonts.bold,
        color: Colors.textPrimary,
        marginBottom: 4,
        letterSpacing: -0.2,
    },
    gridAuthorRow: {
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
    gridAuthorName: {
        fontSize: 10,
        fontFamily: Fonts.medium,
        color: Colors.textMuted,
        flex: 1,
    },
});