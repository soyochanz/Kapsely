import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    View, Text, StyleSheet, Dimensions, Animated,
    PanResponder, ActivityIndicator, TouchableOpacity,
    StatusBar, Platform
} from 'react-native';
import { supabase } from '../lib/supabase';
import { Colors, Fonts, Shadow } from '../theme';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { timerConfigManager } from '../utils/timerConfig';
import { MODEL_IMAGES, MODEL_TINTS } from '../constants/models';
import { Image } from 'expo-image';
import CapsuleWithTimer from '../components/CapsuleWithTimer';

const { width, height } = Dimensions.get('window');
const SWIPE_THRESHOLD = 0.25 * width;

export default function ConnectScreen() {
    const { t } = useTranslation();
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();

    const [capsules, setCapsules] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [userId, setUserId] = useState<string | null>(null);

    const position = useRef(new Animated.ValueXY()).current;
    const rotate = position.x.interpolate({
        inputRange: [-width / 2, 0, width / 2],
        outputRange: ['-10deg', '0deg', '10deg'],
        extrapolate: 'clamp'
    });

    const nextCardOpacity = position.x.interpolate({
        inputRange: [-width / 2, 0, width / 2],
        outputRange: [1, 1, 1], // Always keep next card opaque to avoid seeing through
        extrapolate: 'clamp'
    });

    const nextCardScale = position.x.interpolate({
        inputRange: [-width / 2, 0, width / 2],
        outputRange: [1, 0.95, 1],
        extrapolate: 'clamp'
    });


    const currentIndexRef = useRef(0);
    const capsulesRef = useRef<any[]>([]);
    const userIdRef = useRef<string | null>(null);

    useEffect(() => {
        currentIndexRef.current = currentIndex;
    }, [currentIndex]);

    useEffect(() => {
        capsulesRef.current = capsules;
    }, [capsules]);

    useEffect(() => {
        userIdRef.current = userId;
    }, [userId]);

    const panResponder = useMemo(() => 
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (evt, gestureState) => {
                return Math.abs(gestureState.dx) > 10;
            },
            onPanResponderMove: (evt, gestureState) => {
                position.setValue({ x: gestureState.dx, y: gestureState.dy });
            },
            onPanResponderRelease: (evt, gestureState) => {
                if (gestureState.dx > SWIPE_THRESHOLD) {
                    forceSwipe('right');
                } else if (gestureState.dx < -SWIPE_THRESHOLD) {
                    forceSwipe('left');
                } else {
                    resetPosition();
                }
            },
            onPanResponderTerminate: () => {
                resetPosition();
            }
        }), []);

    const forceSwipe = (direction: 'right' | 'left') => {
        const x = direction === 'right' ? width + 100 : -width - 100;
        Animated.timing(position, {
            toValue: { x, y: 0 },
            duration: 200,
            useNativeDriver: true
        }).start(() => onSwipeComplete(direction));
    };

    const onSwipeComplete = (direction: 'right' | 'left') => {
        const index = currentIndexRef.current;
        const item = capsulesRef.current[index];
        if (direction === 'right' && item) {
            handleFollow(item.id);
        }
        
        // Reset position securely BEFORE updating the index to ensure the next card starts at 0
        position.setValue({ x: 0, y: 0 });
        setCurrentIndex(prev => prev + 1);
    };

    // Remove the useEffect that caused the flicker by resetting position too late

    const handleFollow = async (capsuleId: string) => {
        const uid = userIdRef.current;
        if (!uid) return;
        try {
            await supabase.from('capsule_followers').insert({
                capsule_id: capsuleId,
                user_id: uid
            });
            // Optional: send notification
            const cap = capsulesRef.current.find(c => c.id === capsuleId);
            if (cap && cap.owner_id !== uid) {
                await supabase.from('notifications').insert({
                    user_id: cap.owner_id,
                    sender_id: uid,
                    type: 'capsule_follow',
                    capsule_id: capsuleId,
                    message: `Started following your capsule "${cap.title}"`
                });
            }
        } catch (e) {
            console.error('Follow failed:', e);
        }
    };

    const resetPosition = () => {
        Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            friction: 4,
            useNativeDriver: true
        }).start();
    };

    useEffect(() => {
        loadCapsules();
    }, []);

    const loadCapsules = async () => {
        setLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) return;
            const uid = session.user.id;
            setUserId(uid);
            currentIndexRef.current = 0; // Reset ref
            setCurrentIndex(0); // Reset state

            const { data: rawCapsules, error: capError } = await supabase
                .from('capsules')
                .select(`
                    *,
                    profiles:owner_id(id, username, display_name, avatar_url, is_verified)
                `)
                .eq('is_public', true)
                .limit(40);

            if (capError) throw capError;
            if (!rawCapsules) {
                setCapsules([]);
                return;
            }

            const capIds = rawCapsules.map(c => c.id);
            const [followersRes, itemsRes, likesRes] = await Promise.all([
                supabase.from('capsule_followers').select('capsule_id, user_id').in('capsule_id', capIds),
                supabase.from('capsule_items').select('capsule_id').in('capsule_id', capIds),
                supabase.from('likes').select('capsule_id').in('capsule_id', capIds)
            ]);

            const followedByMe = new Set((followersRes.data || [])
                .filter(f => f.user_id === uid)
                .map(f => f.capsule_id));

            const followerMap: Record<string, number> = {};
            (followersRes.data || []).forEach(f => {
                followerMap[f.capsule_id] = (followerMap[f.capsule_id] || 0) + 1;
            });

            const itemMap: Record<string, number> = {};
            (itemsRes.data || []).forEach(i => {
                itemMap[i.capsule_id] = (itemMap[i.capsule_id] || 0) + 1;
            });

            const likeMap: Record<string, number> = {};
            (likesRes.data || []).forEach(l => {
                likeMap[l.capsule_id] = (likeMap[l.capsule_id] || 0) + 1;
            });

            const enriched = rawCapsules
                .filter(c => !followedByMe.has(c.id))
                .map(c => ({
                    ...c,
                    follower_count: followerMap[c.id] || 0,
                    item_count: itemMap[c.id] || 0,
                    like_count: likeMap[c.id] || 0
                }))
                .sort(() => Math.random() - 0.5);

            setCapsules(enriched);
            setCurrentIndex(0);
        } catch (error) {
            console.error('Connect: Load failed:', error);
        } finally {
            setLoading(false);
        }
    };

    const renderCard = (item: any, index: number) => {
        if (index < currentIndex) return null;
        if (index > currentIndex + 10) return null; // Increase pre-render stack for smoother fast swiping

        const isCurrent = index === currentIndex;
        
        let cardStyle: any = {};
        if (isCurrent) {
            cardStyle = {
                transform: [...position.getTranslateTransform(), { rotate }],
                opacity: 1
            };
        } else {
            const stackIndex = index - currentIndex;
            if (stackIndex === 1) {
                cardStyle = {
                    opacity: nextCardOpacity,
                    transform: [{ scale: nextCardScale }, { translateY: position.x.interpolate({
                        inputRange: [-width / 2, 0, width / 2],
                        outputRange: [0, 10, 0],
                        extrapolate: 'clamp'
                    }) }]
                };
            } else if (stackIndex === 2) {
                cardStyle = {
                    opacity: 1,
                    transform: [{ scale: 0.9 }, { translateY: 20 }]
                };
            }
        }

        const modelImg = (timerConfigManager.getModelImage(item.model) || MODEL_IMAGES[item.model] || (MODEL_IMAGES as any)[item.model + '_kap'] || (MODEL_IMAGES as any).basicred_kap);

        const themeColor = timerConfigManager.getConfig(item.model)?.themeColor || (MODEL_TINTS as any)[item.model] || '#7C5CBF';

        return (
            <Animated.View
                key={item.id}
                style={[s.card, cardStyle, { zIndex: capsules.length - index }]}
                pointerEvents={isCurrent ? 'auto' : 'none'}
                {...(isCurrent ? panResponder.panHandlers : {})}
            >
                <BlurView intensity={10} tint="light" style={StyleSheet.absoluteFill} />
                <LinearGradient 
                    colors={['#ffffff', '#f8f9fa']} 
                    style={StyleSheet.absoluteFill}
                />

                <View style={[s.cardDecoration, { backgroundColor: themeColor + '12' }]} />

                <TouchableOpacity 
                    activeOpacity={1}
                    onPress={() => navigation.navigate('CapsuleDetail', { capsuleId: item.id })}
                    style={s.cardBody}
                >
                    <View style={s.modelContainer}>
                         <View style={[s.modelGlow, { backgroundColor: themeColor + '20' }]} />
                        <CapsuleWithTimer
                            modelKey={item.model}
                            source={{ uri: modelImg }}
                            date={item.opens_at}
                            chainId={item.chain_id}
                            capsuleType={item.type}
                            isOpened={item.status === 'opened'}
                            style={s.modelImg}
                        />
                    </View>

                    <View style={s.infoRow}>
                         <View style={s.ownerInfo}>
                            <Image 
                                source={{ uri: item.profiles?.avatar_url || 'https://via.placeholder.com/100' }} 
                                style={s.ownerAvatar}
                            />
                            <View>
                                <Text style={s.ownerLabel}>Created by</Text>
                                <Text style={s.ownerName}>{item.profiles?.display_name || item.profiles?.username}</Text>
                            </View>
                        </View>
                        <View style={s.tagPill}>
                            <Ionicons name="sparkles" size={12} color={Colors.primary} />
                            <Text style={s.tagText}>Public</Text>
                        </View>
                    </View>

                    <Text style={s.cardTitle}>{item.title}</Text>
                    <Text style={s.cardDesc} numberOfLines={2}>
                        {item.description || "No description provided for this capsule."}
                    </Text>

                    <View style={s.statsRow}>
                        <View style={s.statItem}>
                            <Ionicons name="heart-outline" size={16} color={Colors.textSecondary} />
                            <Text style={s.statValue}>{item.like_count}</Text>
                            <Text style={s.statLabel}>Likes</Text>
                        </View>
                        <View style={s.statDivider} />
                        <View style={s.statItem}>
                            <Ionicons name="people-outline" size={16} color={Colors.textSecondary} />
                            <Text style={s.statValue}>{item.follower_count}</Text>
                            <Text style={s.statLabel}>Syncs</Text>
                        </View>
                        <View style={s.statDivider} />
                        <View style={s.statItem}>
                            <Ionicons name="images-outline" size={16} color={Colors.textSecondary} />
                            <Text style={s.statValue}>{item.item_count}</Text>
                            <Text style={s.statLabel}>Content</Text>
                        </View>
                    </View>
                </TouchableOpacity>

                {isCurrent && (
                    <>
                        <Animated.View style={[s.indicator, s.indicatorRight, { opacity: position.x.interpolate({ inputRange: [0, 80], outputRange: [0, 1], extrapolate: 'clamp' }) }]}>
                             <LinearGradient colors={['#00C9FF', '#92FE9D']} style={s.indicatorGrad}>
                                <Ionicons name="sync" size={32} color="#fff" />
                                <Text style={s.indicatorText}>SYNC</Text>
                             </LinearGradient>
                        </Animated.View>
                        <Animated.View style={[s.indicator, s.indicatorLeft, { opacity: position.x.interpolate({ inputRange: [-80, 0], outputRange: [1, 0], extrapolate: 'clamp' }) }]}>
                            <View style={[s.indicatorGrad, { backgroundColor: '#FF416C' }]}>
                                <Ionicons name="close" size={32} color="#fff" />
                                <Text style={s.indicatorText}>SKIP</Text>
                            </View>
                        </Animated.View>
                    </>
                )}
            </Animated.View>
        );
    };

    return (
        <View style={s.container}>
            <StatusBar barStyle="dark-content" />
            <LinearGradient colors={[Colors.background, '#f8f9fa']} style={StyleSheet.absoluteFill} />
            
            <View style={[s.header, { paddingTop: insets.top + 10, paddingHorizontal: 15 }]}>
                <TouchableOpacity style={s.headerIcon} onPress={() => navigation.goBack()}>
                    <Ionicons name="close" size={24} color={Colors.textPrimary} />
                </TouchableOpacity>
                <View style={{ flex: 1, marginLeft: 15 }}>
                    <Text style={s.headerTitle}>Connect</Text>
                    <Text style={s.headerSub}>Discover your next memory</Text>
                </View>
                <TouchableOpacity style={s.headerIcon} onPress={loadCapsules}>
                    <Ionicons name="refresh" size={20} color={Colors.primary} />
                </TouchableOpacity>
            </View>

            <View style={s.feedContainer}>
                {loading ? (
                    <View style={s.center}>
                        <ActivityIndicator size="large" color={Colors.primary} />
                    </View>
                ) : capsules.length === 0 || currentIndex >= capsules.length ? (
                    <View style={s.emptyContainer}>
                        <View style={s.emptyIconWrap}>
                            <Ionicons name="planet-outline" size={40} color={Colors.textMuted} />
                        </View>
                        <Text style={s.emptyTitle}>Nothing else found</Text>
                        <Text style={s.emptySub}>You've seen all public capsules for now. Check back later!</Text>
                        <TouchableOpacity style={s.refreshBtn} onPress={loadCapsules}>
                            <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={s.refreshBtnGrad}>
                                <Text style={s.refreshBtnText}>Refresh Feed</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={s.cardStack}>
                        {capsules.map((item, index) => renderCard(item, index)).reverse()}
                    </View>
                )}
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        paddingHorizontal: 20, 
        paddingBottom: 15,
        zIndex: 10,
    },
    headerTitle: { fontSize: 26, fontFamily: Fonts.bold, color: Colors.textPrimary },
    headerSub: { fontSize: 13, fontFamily: Fonts.medium, color: Colors.textSecondary, marginTop: -2 },
    headerIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border, ...Shadow.subtle },
    feedContainer: { flex: 1, padding: 16 },
    cardStack: { flex: 1, position: 'relative' },
    card: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        borderRadius: 32,
        backgroundColor: '#ffffff',
        ...Shadow.medium,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)',
    },
    cardDecoration: {
        position: 'absolute',
        top: -80,
        right: -80,
        width: 260,
        height: 260,
        borderRadius: 130,
        zIndex: 0,
    },
    cardBody: { flex: 1, padding: 22, zIndex: 1, justifyContent: 'space-between' },
    modelContainer: { 
        height: height * 0.3, 
        alignItems: 'center', 
        justifyContent: 'center',
        marginTop: 10,
    },
    modelGlow: {
        position: 'absolute',
        width: 160,
        height: 160,
        borderRadius: 80,
        opacity: 0.6,
    },
    modelImg: { width: '100%', height: '100%' },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    ownerInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    ownerAvatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: Colors.border },
    ownerLabel: { fontSize: 10, fontFamily: Fonts.medium, color: Colors.textMuted, textTransform: 'uppercase' },
    ownerName: { fontSize: 13, fontFamily: Fonts.bold, color: Colors.textPrimary },
    tagPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primary + '10', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
    tagText: { fontSize: 11, fontFamily: Fonts.bold, color: Colors.primary },
    cardTitle: { fontSize: 26, fontFamily: Fonts.bold, color: Colors.textPrimary, marginBottom: 6 },
    cardDesc: { fontSize: 15, fontFamily: Fonts.regular, color: Colors.textSecondary, lineHeight: 22, height: 44 },
    statsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.cardAlt, padding: 12, borderRadius: 20, borderWidth: 1, borderColor: Colors.border },
    statItem: { flex: 1, alignItems: 'center' },
    statDivider: { width: 1, height: 20, backgroundColor: Colors.border },
    statValue: { fontSize: 15, fontFamily: Fonts.bold, color: Colors.textPrimary },
    statLabel: { fontSize: 9, fontFamily: Fonts.medium, color: Colors.textMuted, textTransform: 'uppercase' },
    
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 40 },
    emptyIconWrap: { width: 70, height: 70, borderRadius: 35, backgroundColor: Colors.primary + '10', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    emptyTitle: { fontSize: 20, fontFamily: Fonts.bold, color: Colors.textPrimary, marginBottom: 8 },
    emptySub: { fontSize: 14, fontFamily: Fonts.medium, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 40, marginBottom: 24 },
    refreshBtn: { width: 200, height: 48, borderRadius: 24, ...Shadow.subtle },
    refreshBtnGrad: { flex: 1, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
    refreshBtnText: { color: '#fff', fontSize: 15, fontFamily: Fonts.bold },

    indicator: { position: 'absolute', top: 30, zIndex: 100, borderRadius: 16, overflow: 'hidden', ...Shadow.medium },
    indicatorRight: { right: 15, transform: [{ rotate: '12deg' }] },
    indicatorLeft: { left: 15, transform: [{ rotate: '-12deg' }] },
    indicatorGrad: { paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center', minWidth: 90 },
    indicatorText: { color: '#fff', fontSize: 18, fontFamily: Fonts.bold },
});
