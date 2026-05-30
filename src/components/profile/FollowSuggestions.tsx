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

const FOLLOW_SUGGESTIONS_CACHE_TTL_MS = 10 * 60 * 1000;
const NETWORK_SUGGESTIONS_DISABLED_UNTIL_STABLE = true;

const withTimeout = async <T,>(promise: PromiseLike<T>, ms: number, fallback: T): Promise<T> => {
    return await new Promise(resolve => {
        const timer = setTimeout(() => resolve(fallback), ms);
        Promise.resolve(promise)
            .then(value => {
                clearTimeout(timer);
                resolve(value);
            })
            .catch(() => {
                clearTimeout(timer);
                resolve(fallback);
            });
    });
};

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
            const dismissedKey = `dismissed_follow_suggestions_${currentUserId}`;
            const cacheKey = `follow_suggestions_cache_${currentUserId}`;
            const dismissedRaw = await AsyncStorage.getItem(dismissedKey);
            const dismissedIds = new Set<string>(dismissedRaw ? JSON.parse(dismissedRaw) : []);
            const cachedRaw = await AsyncStorage.getItem(cacheKey);

            if (cachedRaw && suggestions.length === 0) {
                try {
                    const cached = JSON.parse(cachedRaw);
                    if (Date.now() - (cached.savedAt || 0) < FOLLOW_SUGGESTIONS_CACHE_TTL_MS) {
                        const cachedData = (cached.data || []).filter((profile: any) => !dismissedIds.has(profile.id)).slice(0, 10);
                        if (cachedData.length > 0) {
                            setSuggestions(cachedData);
                        }
                    }
                } catch {}
            }

            if (NETWORK_SUGGESTIONS_DISABLED_UNTIL_STABLE) {
                setLoading(false);
                return;
            }

            const rpcResult = await withTimeout(
                supabase.rpc('get_follow_suggestions', {
                    p_limit: 14,
                    p_seed: refreshSeed,
                }),
                3200,
                null as any
            );

            const rpcData = Array.isArray(rpcResult?.data)
                ? rpcResult.data
                : Array.isArray(rpcResult)
                    ? rpcResult
                    : [];

            const nextSuggestions = rpcData
                .filter((profile: any) => profile?.id && !dismissedIds.has(profile.id))
                .slice(0, 10);

            if (nextSuggestions.length > 0) {
                setSuggestions(nextSuggestions);
                await AsyncStorage.setItem(cacheKey, JSON.stringify({
                    savedAt: Date.now(),
                    data: nextSuggestions,
                }));
            } else if (!cachedRaw) {
                setSuggestions([]);
            }

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
                                {user.reason === 'followed_capsule' && t('profile.followed_capsule', 'Sigues sus cÃ¡psulas')}
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
