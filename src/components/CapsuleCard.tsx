import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
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

export default function CapsuleCard({ capsule }: { capsule: any }) {
    const navigation = useNavigation<any>();
    const [isFollowed, setIsFollowed] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [likeCount, setLikeCount] = useState(0);
    const [isLiked, setIsLiked] = useState(false);
    const [commentCount, setCommentCount] = useState(0);
    const [postsCount, setPostsCount] = useState(0);
    const [firstMediaUrl, setFirstMediaUrl] = useState<string | null>(null);
    const cfg = typeConfig[capsule.type as keyof typeof typeConfig] || typeConfig.legacycap;
    const [themeColor, setThemeColor] = useState<string>(() => {
        const config = timerConfigManager.getConfig(capsule.model);
        return config?.themeColor || '#a269ff';
    });

    useEffect(() => {
        const unsubscribe = timerConfigManager.subscribe(() => {
            const config = timerConfigManager.getConfig(capsule.model);
            setThemeColor(config?.themeColor || '#a269ff');
        });
        return unsubscribe;
    }, [capsule.model]);

    useEffect(() => {
        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setCurrentUserId(user.id);
                // Check if liked
                const { data: likeData } = await supabase.from('likes')
                    .select('*')
                    .eq('capsule_id', capsule.id)
                    .eq('user_id', user.id)
                    .single();
                setIsLiked(!!likeData);
                checkFollow(user.id);
            }
            // Fetch like count
            const { count: countLikes } = await supabase.from('likes')
                .select('*', { count: 'exact', head: true })
                .eq('capsule_id', capsule.id);
            setLikeCount(countLikes || 0);

            // Fetch comments count
            const { count: countComments } = await supabase.from('comments')
                .select('*', { count: 'exact', head: true })
                .eq('capsule_id', capsule.id);
            setCommentCount(countComments || 0);

            // Fetch posts count
            const { count: countPosts } = await supabase.from('capsule_items')
                .select('*', { count: 'exact', head: true })
                .eq('capsule_id', capsule.id);
            setPostsCount(countPosts || 0);

            // For opened capsules, fetch first media item to use as thumbnail
            if (capsule.status === 'opened') {
                const { data: firstItem } = await supabase
                    .from('capsule_items')
                    .select('media_url, media_type')
                    .eq('capsule_id', capsule.id)
                    .in('media_type', ['image', 'video'])
                    .order('created_at', { ascending: true })
                    .limit(1)
                    .single();
                if (firstItem?.media_url) setFirstMediaUrl(firstItem.media_url);
            }
        };
        init();
    }, [capsule.id]);

    const checkFollow = async (uid: string) => {
        if (uid === capsule.owner_id) return;
        const { data } = await supabase.from('follows')
            .select('*')
            .eq('follower_id', uid)
            .eq('following_id', capsule.owner_id)
            .single();
        setIsFollowed(!!data);
    };

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
        navigation.navigate('CapsuleDetail', { capsuleId: capsule.id });
    };

    const profile = capsule.profiles || { username: 'user', avatar_url: null };

    return (
        <TouchableOpacity activeOpacity={0.9} onPress={handlePress} style={styles.cardContainer}>
            <View style={styles.cardHeader}>
                <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { targetUserId: capsule.owner_id })}>
                    {profile.avatar_url
                        ? <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
                        : <View style={[styles.avatar, { backgroundColor: Colors.border, alignItems: 'center', justifyContent: 'center' }]}>
                            <Ionicons name="person" size={20} color={Colors.textMuted} />
                        </View>
                    }
                </TouchableOpacity>
                <View style={styles.creatorInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { targetUserId: capsule.owner_id })} style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={styles.username}>{profile.username}</Text>
                            {profile.is_verified && <VerifiedBadge size={14} style={{ marginLeft: 2 }} />}
                        </TouchableOpacity>
                        {currentUserId !== capsule.owner_id && (
                            <TouchableOpacity onPress={handleFollow}>
                                <Text style={[styles.followBtnText, isFollowed && styles.followedText]}>
                                    • {isFollowed ? 'Following' : 'Follow'}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    <Text style={styles.infoText}>Created {new Date(capsule.created_at).toLocaleDateString()}</Text>
                </View>
                <View style={[styles.typePill, { backgroundColor: cfg.bgColor }]}>
                    <Ionicons name={cfg.icon as any} size={10} color={cfg.color} />
                    <Text style={[styles.typeLabel, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
            </View>

            <View style={styles.capsuleVisualContainer}>
                {capsule.status === 'opened' && firstMediaUrl ? (
                    // Opened: show first photo as a square thumbnail
                    <View style={styles.openedThumbnailWrapper}>
                        <Image
                            source={{ uri: firstMediaUrl }}
                            style={styles.openedThumbnail}
                            resizeMode="cover"
                        />
                        {/* Opened badge */}
                        <View style={[styles.openedBadge, { backgroundColor: themeColor }]}>
                            <Ionicons name="lock-open-outline" size={10} color="#fff" />
                            <Text style={styles.openedBadgeText}>Opened</Text>
                        </View>
                    </View>
                ) : (
                    <CapsuleWithTimer
                        modelKey={capsule.model}
                        source={{
                            uri: capsule.status === 'opened'
                                ? (MODEL_IMAGES_OPEN[capsule.model as keyof typeof MODEL_IMAGES_OPEN] || MODEL_IMAGES[capsule.model as keyof typeof MODEL_IMAGES] || MODEL_IMAGES.beach)
                                : (MODEL_IMAGES[capsule.model as keyof typeof MODEL_IMAGES] || MODEL_IMAGES.beach)
                        }}
                        date={capsule.opens_at}
                        chainId={capsule.chain_id}
                        capsuleType={capsule.type}
                        hideTimer={capsule.status === 'opened'}
                        style={styles.capsulePng}
                    />
                )}
            </View>

            <View style={styles.cardFooter}>
                <Text style={styles.capsuleTitle}>{capsule.title}</Text>
                <Text style={styles.description} numberOfLines={2}>{capsule.description}</Text>
                <View style={styles.actions}>
                    <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
                        <Ionicons name={isLiked ? "heart" : "heart-outline"} size={22} color={isLiked ? "#ff4757" : Colors.textMuted} />
                        <Text style={styles.actionCount}>{likeCount}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={handlePress}>
                        <Ionicons name="chatbubble-outline" size={20} color={Colors.textMuted} />
                        <Text style={styles.actionCount}>{commentCount}</Text>
                    </TouchableOpacity>
                    <View style={styles.actionBtn}>
                        <Ionicons name="images-outline" size={20} color={Colors.textMuted} />
                        <Text style={styles.actionCount}>{postsCount} posts</Text>
                    </View>
                </View>
            </View>
        </TouchableOpacity >
    );
}

const styles = StyleSheet.create({
    cardContainer: {
        marginHorizontal: Spacing.md,
        marginBottom: Spacing.md,
        borderRadius: BorderRadius.lg,
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.border,
        padding: Spacing.md,
        ...Shadow.card,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
    avatar: { width: 36, height: 36, borderRadius: 18, marginRight: Spacing.sm, borderWidth: 1.5, borderColor: Colors.border },
    creatorInfo: { flex: 1 },
    username: { color: Colors.textPrimary, fontSize: 13, fontFamily: Fonts.semiBold },
    infoText: { color: Colors.textMuted, fontSize: 11, fontFamily: Fonts.regular, marginTop: 1 },
    followBtnText: { fontSize: 13, fontFamily: Fonts.bold, color: Colors.primary },
    followedText: { color: Colors.textMuted },
    typePill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, gap: 4 },
    typeLabel: { fontSize: 10, fontFamily: Fonts.semiBold },
    capsuleVisualContainer: {
        paddingVertical: Spacing.lg,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        borderRadius: 20,
        marginVertical: Spacing.sm,
        backgroundColor: 'rgba(162, 105, 255, 0.08)', // Subtle brand purple
        overflow: 'hidden',
    },
    capsulePng: { width: 180, height: 180 },

    cornerTypeIcon: { position: 'absolute', top: 0, right: 0, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', ...Shadow.subtle },
    timerBadge: { marginTop: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, backgroundColor: Colors.cardAlt },
    timerDot: { width: 6, height: 6, borderRadius: 3 },
    timerText: { fontSize: 12, fontFamily: Fonts.semiBold },
    cardFooter: { marginTop: Spacing.xs },
    capsuleTitle: { color: Colors.textPrimary, fontSize: 16, fontFamily: Fonts.bold, marginBottom: 4 },
    description: { color: Colors.textSecondary, fontSize: 13, fontFamily: Fonts.regular, lineHeight: 18, marginBottom: Spacing.md },
    actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
    actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    actionCount: { color: Colors.textMuted, fontSize: 13, fontFamily: Fonts.medium },

    openedThumbnailWrapper: {
        width: 180, height: 180, borderRadius: 16, overflow: 'hidden', position: 'relative',
    },
    openedThumbnail: { width: 180, height: 180, borderRadius: 16 },
    openedBadge: {
        position: 'absolute', bottom: 8, left: 8,
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10,
    },
    openedBadgeText: { fontSize: 10, fontFamily: Fonts.bold, color: '#fff' },
});
