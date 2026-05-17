import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Spacing, BorderRadius } from '../../theme';
import { supabase } from '../../lib/supabase';
import VerifiedBadge from '../VerifiedBadge';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface FollowSuggestionsProps {
    currentUserId: string;
    onFollowUpdate?: () => void;
}

export const FollowSuggestions: React.FC<FollowSuggestionsProps> = ({ currentUserId, onFollowUpdate }) => {
    const { t } = useTranslation();
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshSeed, setRefreshSeed] = useState(Date.now());

    useEffect(() => {
        fetchSuggestions();
    }, [currentUserId, refreshSeed]);

    const fetchSuggestions = async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const dismissedKey = `dismissed_follow_suggestions_${currentUserId}`;
            const dismissedRaw = await AsyncStorage.getItem(dismissedKey);
            const dismissedIds = new Set<string>(dismissedRaw ? JSON.parse(dismissedRaw) : []);

            const { data: myFollowing } = await supabase
                .from('follows')
                .select('following_id')
                .eq('follower_id', currentUserId);
            
            const followingIds = new Set(myFollowing?.map(f => f.following_id) || []);
            followingIds.add(currentUserId);
            dismissedIds.forEach(id => followingIds.add(id));
            const peopleIFollow = (myFollowing?.map(f => f.following_id) || []).slice(0, 80);

            const { data: myFollowers } = await supabase
                .from('follows')
                .select('follower_id')
                .eq('following_id', currentUserId);
            
            const followerIds = new Set(myFollowers?.map(f => f.follower_id) || []);

            const [
                myRecentItemsRes,
                likedOwnersRes,
                commentedOwnersRes,
                viewedOwnersRes,
                mutualCandidatesRes,
                followerProfilesRes,
            ] = await Promise.all([
                supabase
                    .from('capsule_items')
                    .select('location_name')
                    .eq('owner_id', currentUserId)
                    .not('location_name', 'is', null)
                    .order('created_at', { ascending: false })
                    .limit(10),
                supabase
                    .from('likes')
                    .select('capsules!inner(owner_id, profiles!owner_id(*))')
                    .eq('user_id', currentUserId)
                    .order('created_at', { ascending: false })
                    .limit(60),
                supabase
                    .from('comments')
                    .select('capsules!inner(owner_id, profiles!owner_id(*))')
                    .eq('user_id', currentUserId)
                    .order('created_at', { ascending: false })
                    .limit(60),
                supabase
                    .from('feed_impressions')
                    .select('capsules!inner(owner_id, profiles!owner_id(*))')
                    .eq('user_id', currentUserId)
                    .limit(80),
                peopleIFollow.length
                    ? supabase
                        .from('follows')
                        .select('following_id, profiles!following_id(*)')
                        .in('follower_id', peopleIFollow)
                        .limit(160)
                    : Promise.resolve({ data: [] as any[] }),
                followerIds.size
                    ? supabase
                        .from('profiles')
                        .select('*')
                        .in('id', Array.from(followerIds).slice(0, 80))
                    : Promise.resolve({ data: [] as any[] }),
            ]);
            
            const myLocations = new Set(myRecentItemsRes.data?.map(i => i.location_name) || []);
            let locationCandidates: any[] = [];
            if (myLocations.size > 0) {
                const { data: locData } = await supabase
                    .from('capsule_items')
                    .select('owner_id, profiles:owner_id(*)')
                    .in('location_name', Array.from(myLocations))
                    .neq('owner_id', currentUserId)
                    .limit(50);
                locationCandidates = locData || [];
            }

            const userScores: Record<string, { profile: any; score: number; reasons: string[] }> = {};

            const processCandidate = (profile: any, points: number, reason: string) => {
                if (!profile || followingIds.has(profile.id)) return;
                if (!userScores[profile.id]) {
                    userScores[profile.id] = { profile, score: 0, reasons: [] };
                }
                userScores[profile.id].score += points;
                if (!userScores[profile.id].reasons.includes(reason)) {
                    userScores[profile.id].reasons.push(reason);
                }
            };

            followerProfilesRes.data?.forEach(p => processCandidate(p, 55, 'follows_you'));
            mutualCandidatesRes.data?.forEach(f => {
                const p = Array.isArray(f.profiles) ? f.profiles[0] : f.profiles;
                processCandidate(p, 45, 'mutual_friends');
            });
            likedOwnersRes.data?.forEach((row: any) => {
                const c = Array.isArray(row.capsules) ? row.capsules[0] : row.capsules;
                const p = Array.isArray(c?.profiles) ? c.profiles[0] : c?.profiles;
                processCandidate(p, 40, 'liked_content');
            });
            commentedOwnersRes.data?.forEach((row: any) => {
                const c = Array.isArray(row.capsules) ? row.capsules[0] : row.capsules;
                const p = Array.isArray(c?.profiles) ? c.profiles[0] : c?.profiles;
                processCandidate(p, 50, 'commented_content');
            });
            viewedOwnersRes.data?.forEach((row: any) => {
                const c = Array.isArray(row.capsules) ? row.capsules[0] : row.capsules;
                const p = Array.isArray(c?.profiles) ? c.profiles[0] : c?.profiles;
                processCandidate(p, 18, 'seen_content');
            });
            locationCandidates?.forEach(l => {
                const p = Array.isArray(l.profiles) ? l.profiles[0] : l.profiles;
                processCandidate(p, 16, 'same_location');
            });

            Object.values(userScores).forEach(entry => {
                if (entry.profile.is_verified) entry.score += 8;
                entry.score += Math.sin(refreshSeed + entry.profile.id.split('').reduce((a: number, ch: string) => a + ch.charCodeAt(0), 0)) * 12;
            });

            const sortedSuggestions = Object.values(userScores)
                .sort((a, b) => b.score - a.score)
                .slice(0, 10)
                .map(entry => ({
                    ...entry.profile,
                    reason: entry.reasons[0] || 'popular',
                    score: entry.score
                }));

            setSuggestions(sortedSuggestions);

        } catch (error) {
            console.error('Error fetching suggestions:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleFollow = async (userId: string) => {
        try {
            const { error } = await supabase.from('follows').insert({ follower_id: currentUserId, following_id: userId });
            if (error) throw error;
            
            setSuggestions(prev => prev.filter(s => s.id !== userId));
            if (onFollowUpdate) onFollowUpdate();
        } catch (error) {
            console.error('Error following user:', error);
        }
    };

    const handleDismiss = async (userId: string) => {
        const dismissedKey = `dismissed_follow_suggestions_${currentUserId}`;
        const dismissedRaw = await AsyncStorage.getItem(dismissedKey);
        const dismissed = new Set<string>(dismissedRaw ? JSON.parse(dismissedRaw) : []);
        dismissed.add(userId);
        await AsyncStorage.setItem(dismissedKey, JSON.stringify(Array.from(dismissed)));
        setSuggestions(prev => prev.filter(s => s.id !== userId));
    };

    if (loading && suggestions.length === 0) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <View style={styles.skeletonTitle} />
                    <View style={styles.skeletonIcon} />
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
                    {Array.from({ length: 4 }).map((_, i) => (
                        <View key={i} style={styles.card}>
                            <View style={styles.skeletonAvatar} />
                            <View style={styles.skeletonLine} />
                            <View style={[styles.skeletonLine, { width: 72, height: 8 }]} />
                            <View style={styles.skeletonButton} />
                        </View>
                    ))}
                </ScrollView>
            </View>
        );
    }
    if (suggestions.length === 0) return null;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Sugerencias para ti</Text>
                <TouchableOpacity onPress={() => setRefreshSeed(Date.now())} disabled={loading}>
                    {loading ? <ActivityIndicator size="small" color={Colors.textMuted} /> : <Ionicons name="refresh" size={14} color={Colors.textMuted} />}
                </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
                {suggestions.map((user) => (
                    <View key={user.id} style={styles.card}>
                        <Image 
                            source={{ uri: Colors.getAvatarUrl(user.avatar_url, user.display_name || user.username, user.favorite_color) }} 
                            style={styles.avatar} 
                        />
                        <View style={styles.info}>
                            <View style={styles.nameRow}>
                                <Text style={styles.name} numberOfLines={1}>{user.display_name || user.username}</Text>
                                {user.is_verified && <VerifiedBadge size={10} />}
                            </View>
                            <Text style={styles.reason} numberOfLines={1}>
                                {user.reason === 'follows_you' && t('profile.follows_you', 'Te sigue')}
                                {user.reason === 'mutual_friends' && t('profile.mutual_friends', 'Amigos en común')}
                                {user.reason === 'same_location' && t('profile.near_you', 'Cerca de ti')}
                                {user.reason === 'liked_content' && t('profile.liked_content', 'Te gustó su contenido')}
                                {user.reason === 'commented_content' && t('profile.commented_content', 'Comentaste su contenido')}
                                {user.reason === 'seen_content' && t('profile.seen_content', 'Has visto su contenido')}
                                {user.reason === 'popular' && t('profile.popular', 'Popular en Kapsely')}
                            </Text>
                        </View>
                        <TouchableOpacity style={styles.followBtn} onPress={() => handleFollow(user.id)}>
                            <Text style={styles.followBtnText}>Seguir</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.closeBtn} onPress={() => handleDismiss(user.id)}>
                            <Ionicons name="close" size={14} color={Colors.textMuted} />
                        </TouchableOpacity>
                    </View>
                ))}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginVertical: 15,
        paddingLeft: 14,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingRight: 14,
        marginBottom: 10,
    },
    title: {
        fontSize: 14,
        fontFamily: Fonts.bold,
        color: Colors.textPrimary,
    },
    scroll: {
        paddingRight: 14,
        gap: 12,
    },
    card: {
        width: 140,
        backgroundColor: Colors.surface,
        borderRadius: 16,
        padding: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.border,
        position: 'relative',
    },
    avatar: {
        width: 60,
        height: 60,
        borderRadius: 30,
        marginBottom: 8,
    },
    info: {
        alignItems: 'center',
        marginBottom: 10,
        width: '100%',
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    name: {
        fontSize: 13,
        fontFamily: Fonts.bold,
        color: Colors.textPrimary,
    },
    reason: {
        fontSize: 10,
        fontFamily: Fonts.regular,
        color: Colors.textMuted,
        marginTop: 2,
    },
    followBtn: {
        backgroundColor: Colors.primary,
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 20,
        width: '100%',
        alignItems: 'center',
    },
    followBtnText: {
        color: '#fff',
        fontSize: 12,
        fontFamily: Fonts.bold,
    },
    closeBtn: {
        position: 'absolute',
        top: 6,
        right: 6,
        padding: 4,
    },
    skeletonTitle: { width: 128, height: 16, borderRadius: 8, backgroundColor: Colors.border },
    skeletonIcon: { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.border },
    skeletonAvatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.border, marginBottom: 10 },
    skeletonLine: { width: 96, height: 10, borderRadius: 5, backgroundColor: Colors.border, marginBottom: 7 },
    skeletonButton: { width: '100%', height: 30, borderRadius: 15, backgroundColor: Colors.border, marginTop: 8 },
});
