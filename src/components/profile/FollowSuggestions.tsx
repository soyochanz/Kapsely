import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Spacing, BorderRadius } from '../../theme';
import { supabase } from '../../lib/supabase';
import VerifiedBadge from '../VerifiedBadge';
import { useTranslation } from 'react-i18next';

interface FollowSuggestionsProps {
    currentUserId: string;
    onFollowUpdate?: () => void;
}

export const FollowSuggestions: React.FC<FollowSuggestionsProps> = ({ currentUserId, onFollowUpdate }) => {
    const { t } = useTranslation();
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchSuggestions();
    }, [currentUserId]);

    const fetchSuggestions = async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // 1. Get people I follow
            const { data: myFollowing } = await supabase
                .from('follows')
                .select('following_id')
                .eq('follower_id', currentUserId);
            
            const followingIds = new Set(myFollowing?.map(f => f.following_id) || []);
            followingIds.add(currentUserId); // Don't suggest myself

            // 2. Get people who follow me
            const { data: myFollowers } = await supabase
                .from('follows')
                .select('follower_id')
                .eq('following_id', currentUserId);
            
            const followerIds = new Set(myFollowers?.map(f => f.follower_id) || []);

            // 3. Get my recent locations (from capsules/items)
            const { data: myRecentItems } = await supabase
                .from('capsule_items')
                .select('location_name')
                .eq('owner_id', currentUserId)
                .not('location_name', 'is', null)
                .order('created_at', { ascending: false })
                .limit(10);
            
            const myLocations = new Set(myRecentItems?.map(i => i.location_name) || []);

            // 4. Candidates from "Followed by people I follow" (Mutuals)
            // We'll get a sample of people I follow, and see who they follow
            const { data: mutualCandidates } = await supabase
                .from('follows')
                .select('following_id, profiles!following_id(*)')
                .in('follower_id', Array.from(followingIds).slice(0, 50))
                .limit(100);

            // 5. Candidates from "People who follow me"
            const { data: followerProfiles } = await supabase
                .from('profiles')
                .select('*')
                .in('id', Array.from(followerIds).slice(0, 50));

            // 6. Candidates from "Same location"
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

            // Combine and Score
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

            // Score Followers
            followerProfiles?.forEach(p => processCandidate(p, 50, 'follows_you'));

            // Score Mutuals
            mutualCandidates?.forEach(f => {
                const p = Array.isArray(f.profiles) ? f.profiles[0] : f.profiles;
                processCandidate(p, 30, 'mutual_friends');
            });

            // Score Location
            locationCandidates?.forEach(l => {
                const p = Array.isArray(l.profiles) ? l.profiles[0] : l.profiles;
                processCandidate(p, 20, 'same_location');
            });

            // Final Polish: Add Verified Bonus
            Object.values(userScores).forEach(entry => {
                if (entry.profile.is_verified) {
                    entry.score += 10;
                }
            });

            // Sort and Take Top 10
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

    if (loading) return null;
    if (suggestions.length === 0) return null;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Sugerencias para ti</Text>
                <TouchableOpacity onPress={fetchSuggestions}>
                    <Ionicons name="refresh" size={14} color={Colors.textMuted} />
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
                                {user.reason === 'popular' && t('profile.popular', 'Popular en Kapsely')}
                            </Text>
                        </View>
                        <TouchableOpacity style={styles.followBtn} onPress={() => handleFollow(user.id)}>
                            <Text style={styles.followBtnText}>Seguir</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.closeBtn} onPress={() => setSuggestions(prev => prev.filter(s => s.id !== user.id))}>
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
    }
});
