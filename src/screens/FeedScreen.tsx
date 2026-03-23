import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Image, StatusBar, Modal, Pressable, Platform, Alert,
    Dimensions, Animated, Easing, ActivityIndicator
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';
import { Colors, Fonts, Spacing, BorderRadius, Shadow } from '../theme';
import { requestTrackingPermissionsAsync, getTrackingPermissionsAsync } from 'expo-tracking-transparency';
import CapsuleCard from '../components/CapsuleCard';
import CapsuleWithTimer from '../components/CapsuleWithTimer';
import LiveTimer from '../components/LiveTimer';
import { supabase } from '../lib/supabase';
import { MODEL_IMAGES } from '../constants/models';
import { timerConfigManager } from '../utils/timerConfig';
import InteractiveTour, { TutorialStep } from '../components/InteractiveTour';
import StoryViewer from '../components/StoryViewer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import StoryEditor from '../components/StoryEditor';
import { safetyService } from '../utils/safety';
import { useWebDragScroll } from '../utils/useWebDragScroll';
import TimelineActivity from '../components/TimelineActivity';

type CapsuleType = 'instacap' | 'eventcap' | 'legacycap';
type FeedTab = 'following' | 'explore';
type FilterType = CapsuleType | 'all' | 'today';

const { width, height } = Dimensions.get('window');

// Cache de 5 minutos
const FEED_CACHE_TTL = 5 * 60 * 1000;
// Impression batch: report seen capsules to DB every N seconds
const IMPRESSION_FLUSH_MS = 8000;

// ─── Filter config ────────────────────────────────────────────────────────────
const FILTER_KEYS: FilterType[] = ['all', 'today', 'instacap', 'eventcap', 'legacycap'];

const FILTER_META: Record<FilterType, { icon: string; label: (t: any) => string; color?: string }> = {
    all: { icon: 'apps-outline', label: t => t('feed.all') },
    today: { icon: 'time-outline', label: t => t('feed.opens_today'), color: '#FF416C' },
    instacap: { icon: 'camera-outline', label: () => 'InstaCap' },
    eventcap: { icon: 'calendar-outline', label: () => 'EventCap' },
    legacycap: { icon: 'hourglass-outline', label: () => 'LegacyCap' },
};

// ─── Story bubble ─────────────────────────────────────────────────────────────
const StoryBubble = React.memo(({ user, isOwn, onPress }: {
    user: any; isOwn?: boolean; onPress: () => void;
}) => {
    const scaleAnim = useRef(new Animated.Value(1)).current;

    const handlePress = () => {
        Animated.sequence([
            Animated.timing(scaleAnim, { toValue: 0.92, duration: 70, useNativeDriver: true }),
            Animated.spring(scaleAnim, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
        ]).start();
        onPress();
    };

    const avatarUri = user?.avatar_url || 'https://via.placeholder.com/150';
    const label = isOwn ? 'Flash' : (user?.display_name || user?.username || 'user');
    const hasUnread = !user?.all_read;

    return (
        <Animated.View style={[st.wrap, { transform: [{ scale: scaleAnim }] }]}>
            <TouchableOpacity activeOpacity={1} onPress={handlePress} style={st.inner}>
                {isOwn && !user ? (
                    <View style={st.addWrap}>
                        <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={st.addRing}>
                            <Ionicons name="add" size={22} color="#fff" />
                        </LinearGradient>
                    </View>
                ) : (
                    hasUnread && !isOwn ? (
                        <LinearGradient
                            colors={[Colors.primary, Colors.primaryDark, '#00f2ff']}
                            style={st.ring}
                            start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }}
                        >
                            <View style={st.avatarWrap}>
                                <Image source={{ uri: avatarUri }} style={st.avatar} />
                            </View>
                        </LinearGradient>
                    ) : (
                        <View style={[st.ring, st.ringRead, isOwn && { borderColor: Colors.primary + '80', borderStyle: 'dashed' }]}>
                            <View style={st.avatarWrap}>
                                <Image source={{ uri: avatarUri }} style={st.avatar} />
                            </View>
                        </View>
                    )
                )}
                <Text
                    style={[st.label, isOwn && { color: Colors.primary, fontFamily: Fonts.bold }, !hasUnread && !isOwn && { color: Colors.textMuted }]}
                    numberOfLines={1}
                >
                    {label}
                </Text>
            </TouchableOpacity>
        </Animated.View>
    );
});

const st = StyleSheet.create({
    wrap: { alignItems: 'center', marginRight: 14 },
    inner: { alignItems: 'center', gap: 5 },
    ring: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center', padding: 2.5 },
    ringRead: { borderWidth: 2, borderColor: Colors.border, backgroundColor: 'transparent' },
    avatarWrap: { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    avatar: { width: 58, height: 58, borderRadius: 29 },
    addWrap: { width: 66, height: 66, alignItems: 'center', justifyContent: 'center' },
    addRing: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', shadowColor: Colors.primary, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
    label: { fontSize: 11, fontFamily: Fonts.medium, color: Colors.textSecondary, textAlign: 'center', maxWidth: 66 },
});

// ─── Filter chip ──────────────────────────────────────────────────────────────
const FilterChip = React.memo(({ filterKey, isActive, onPress, t, pulseAnim }: any) => {
    const meta = FILTER_META[filterKey as FilterType];
    const isToday = filterKey === 'today';
    const accentColor = meta.color || Colors.primary;
    const [localMinutes, setLocalMinutes] = useState(1440);

    useEffect(() => {
        if (!isToday || !isActive) return;
        const interval = setInterval(() => setLocalMinutes(m => m > 0 ? m - 1 : 1440), 60000); // UI tick per minute
        return () => clearInterval(interval);
    }, [isToday, isActive]);

    const fmtTimer = (mins: number) => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`;
    };

    return (
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => onPress(filterKey)}
            style={[fc.chip, isActive && fc.chipActive, !isActive && isToday && { backgroundColor: '#FF416C08', borderColor: '#FF416C30' }]}
        >
            {isActive && (
                <LinearGradient
                    colors={isToday ? ['#FF416C', '#FF4B2B'] : [Colors.primary, Colors.primaryDark]}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                />
            )}
            <Ionicons
                name={(isActive ? meta.icon.replace('-outline', '') : meta.icon) as any}
                size={13}
                color={isActive ? '#fff' : isToday ? accentColor : Colors.textSecondary}
            />
            <Text style={[fc.label, isActive && fc.labelActive, !isActive && isToday && { color: accentColor }]}>
                {meta.label(t)}
            </Text>
            {isToday && (
                <View style={[fc.timerBadge, isActive && { backgroundColor: 'rgba(255,255,255,0.22)' }]}>
                    <Text style={[fc.timerText, isActive && { color: '#fff' }]}>{fmtTimer(localMinutes)}</Text>
                </View>
            )}
            {isToday && isActive && (
                <Animated.View style={[fc.liveDot, { transform: [{ scale: pulseAnim }] }]} />
            )}
        </TouchableOpacity>
    );
});

const fc = StyleSheet.create({
    chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 30, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, overflow: 'hidden' },
    chipActive: { borderColor: 'transparent' },
    label: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textSecondary },
    labelActive: { color: '#fff', fontFamily: Fonts.bold },
    timerBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: 'rgba(255,65,108,0.12)' },
    timerText: { fontSize: 10, fontFamily: Fonts.bold, color: '#FF416C' },
    liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#fff', shadowColor: '#fff', shadowOpacity: 0.8, shadowRadius: 4 },
});

// ─── Skeleton placeholder mientras carga ─────────────────────────────────────
const FeedSkeleton = React.memo(() => {
    return (
        <>
            {[0, 1, 2].map(i => (
                <View key={i} style={[sk.card, { opacity: 0.6 }]}>
                    <View style={sk.topRow}>
                        <View style={sk.avatar} />
                        <View style={{ flex: 1, gap: 6 }}>
                            <View style={[sk.line, { width: '50%' }]} />
                            <View style={[sk.line, { width: '30%', opacity: 0.5 }]} />
                        </View>
                        <View style={sk.capsuleThumb} />
                    </View>
                    <View style={sk.media} />
                    <View style={{ padding: 12, gap: 8 }}>
                        <View style={[sk.line, { width: '70%' }]} />
                        <View style={[sk.line, { width: '45%', opacity: 0.5 }]} />
                    </View>
                </View>
            ))}
        </>
    );
});

const sk = StyleSheet.create({
    card: { marginHorizontal: 16, marginBottom: 16, borderRadius: 20, backgroundColor: Colors.cardAlt, overflow: 'hidden' },
    topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
    avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.border },
    capsuleThumb: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.border },
    media: { width: '100%', height: 220, backgroundColor: Colors.border },
    line: { height: 10, borderRadius: 5, backgroundColor: Colors.border },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function FeedScreen() {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const isFocused = useIsFocused();

    const [activeTab, setActiveTab] = useState<FeedTab>('explore');
    const [activeFilter, setActiveFilter] = useState<FilterType>('all');
    const [capsules, setCapsules] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [stories, setStories] = useState<any[]>([]);
    const [myStory, setMyStory] = useState<any>(null);
    const [showCapsulePicker, setShowCapsulePicker] = useState(false);
    const [pickerStep, setPickerStep] = useState<'list' | 'select' | 'animation' | 'edit'>('list');
    const [editingItem, setEditingItem] = useState<any>(null);
    const [userCapsules, setUserCapsules] = useState<any[]>([]);
    const [selectedPickerCapsule, setSelectedPickerCapsule] = useState<any>(null);
    const [pickerItems, setPickerItems] = useState<any[]>([]);
    const [randomPreviewItem, setRandomPreviewItem] = useState<any>(null);
    const [searching, setSearching] = useState(false);
    const [feedCache, setFeedCache] = useState<Record<string, { data: any[]; ts: number }>>({});
    const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
    const [activeStory, setActiveStory] = useState<any>(null);
    const [hasUnread, setHasUnread] = useState(false);
    const [tutorialStep, setTutorialStep] = useState<TutorialStep>('IDLE');

    const pulseAnim = useRef(new Animated.Value(1)).current;
    const searchingAnim = useRef(new Animated.Value(0)).current;
    const unblurAnim = useRef(new Animated.Value(1)).current;
    const headerOpacity = useRef(new Animated.Value(0)).current;
    const headerSlide = useRef(new Animated.Value(-8)).current;
    const isFirstMount = useRef(true);
    const [showATTModal, setShowATTModal] = useState(false);

    useEffect(() => {
        const checkATT = async () => {
            if (Platform.OS !== 'ios') return;
            
            // Wait 2 seconds as requested
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Check if already asked
            const alreadyAsked = await AsyncStorage.getItem('att_asked');
            if (alreadyAsked) return;

            const { status } = await getTrackingPermissionsAsync();
            if (status === 'undetermined') {
                setShowATTModal(true);
            }
        };
        checkATT();
    }, []);

    const handleATTContinue = async () => {
        setShowATTModal(false);
        const { status } = await requestTrackingPermissionsAsync();
        await AsyncStorage.setItem('att_asked', 'true');
        console.log('Tracking permission status:', status);
    };

    const flatListRef = useRef<any>(null);
    const storiesScrollRef = useRef<ScrollView>(null);
    const filterScrollRef = useRef<ScrollView>(null);

    // Impression tracking: buffer seen capsule IDs, flush to DB periodically
    const impressionBufferRef = useRef<Set<string>>(new Set());
    const impressionFlushRef  = useRef<NodeJS.Timeout | null>(null);

    useWebDragScroll(flatListRef);
    useWebDragScroll(storiesScrollRef);
    useWebDragScroll(filterScrollRef);

    // ─── Animations ───────────────────────────────────────────────────────────
    useEffect(() => {
        Animated.parallel([
            Animated.timing(headerOpacity, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.timing(headerSlide, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]).start();
    }, []);

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.25, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            ])
        ).start();
    }, []);

    // ─── Data loading ──────────────────────────────────────────────────────────
    const loadFeed = useCallback(async (forceRefresh = false, tabOverride?: FeedTab) => {
        const tab = tabOverride ?? activeTab;
        const cacheKey = `${tab}_${activeFilter}`;
        const cached = feedCache[cacheKey];

        // Stale-While-Revalidate (SWR): instantly show cache if we have it
        const hasStaleData = cached && cached.data.length > 0;
        if (hasStaleData) {
            setCapsules(cached.data);
            setLoading(false);
            // If cache is fresh (less than 1 min old) and we didn't swipe to refresh, don't fetch again
            if (!forceRefresh && (Date.now() - cached.ts) < 60000) {
                return;
            }
        }

        // Only show skeleton if we have literally nothing to show
        if (!hasStaleData && !refreshing) setLoading(true);

        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) { setLoading(false); setRefreshing(false); return; }
        setCurrentUserId(user.id);

        // Bloqueos y follows en paralelo
        const [blocked, followsResult] = await Promise.all([
            safetyService.getAllSafetyUserIds(user.id),
            supabase.from('follows').select('following_id').eq('follower_id', user.id),
        ]);
        setBlockedUserIds(blocked);
        loadStories(user.id, blocked);

        const followingIds = (followsResult.data || []).map((f: any) => f.following_id);

        // Si es following y no sigues a nadie → vacío inmediato
        if (tab === 'following' && followingIds.length === 0) {
            setCapsules([]);
            setLoading(false);
            setRefreshing(false);
            return;
        }
        // ── Construir query de items ──────────────────────────────────────────
        let itemsQuery = supabase
            .from('capsule_items')
            .select(`
                *,
                profiles:owner_id(username, display_name, avatar_url, is_verified),
                capsules:capsule_id!inner(
                    id, title, is_public, type, status, opens_at,
                    created_at, model, description, chain_id, owner_id,
                    profiles:owner_id(username, display_name, avatar_url, is_verified)
                )
            `)
            .in('media_type', ['image', 'video', 'audio', 'note'])
            .eq('is_story', false); // Nunca mezclar flashes con el feed principal

        if (tab === 'following') {
            itemsQuery = itemsQuery.in('owner_id', followingIds);
        } else {
            itemsQuery = itemsQuery
                .eq('capsules.is_public', true)
                .neq('owner_id', user.id);
            if (followingIds.length > 0) {
                itemsQuery = itemsQuery.not('owner_id', 'in', `(${followingIds.join(',')})`);
            }
        }

        if (activeFilter !== 'all' && activeFilter !== 'today') {
            itemsQuery = itemsQuery.eq('capsules.type', activeFilter);
        }
        if (activeFilter === 'today') {
            const start = new Date(); start.setHours(0, 0, 0, 0);
            const end = new Date(); end.setHours(23, 59, 59, 999);
            itemsQuery = itemsQuery
                .gte('capsules.opens_at', start.toISOString())
                .lte('capsules.opens_at', end.toISOString());
        }

        // ── RPC + items en paralelo ───────────────────────────────────────────
        const rpcName = tab === 'explore' ? 'get_explore_feed' : 'get_following_feed';
        // Fetch more than needed so client-side diversification has room
        const rpcLimit = tab === 'following' ? 60 : 80;
        const [rpcResult, itemsResult] = await Promise.all([
            supabase.rpc(rpcName, { req_user_id: user.id, req_filter: activeFilter, req_limit: rpcLimit }),
            itemsQuery.order('created_at', { ascending: false }).limit(80),
        ]);

        const capsData = ((rpcResult.data || []) as any[])
            .filter((c: any) => !blocked.includes(c.owner_id))
            .map((c: any) => ({ ...c, feedType: 'capsule' }));

        const activityData = (itemsResult.data || []) as any[];

        // ── Agrupar items por batch ───────────────────────────────────────────
        const groupedActivity: any[] = [];
        const activityProcessed = new Set<string>();

        activityData.forEach((item: any, idx: number) => {
            if (activityProcessed.has(item.id)) return;
            if (blocked.includes(item.owner_id)) return;

            const group = [item];
            activityProcessed.add(item.id);
            const batch = item.caption?.match(/!!b:(\w+)/)?.[1];

            if (batch) {
                for (let j = idx + 1; j < activityData.length; j++) {
                    const next = activityData[j];
                    if (activityProcessed.has(next.id)) continue;
                    const nextBatch = next.caption?.match(/!!b:(\w+)/)?.[1];
                    if (
                        next.capsule_id === item.capsule_id &&
                        nextBatch === batch &&
                        ['image', 'video', 'audio', 'note'].includes(next.media_type)
                    ) {
                        group.push(next);
                        activityProcessed.add(next.id);
                    }
                }
            }

            const hoursOld = Math.max(0, (Date.now() - new Date(item.created_at).getTime()) / 3600000);
            // Client-side score: recency + group bonus + media richness
            const mediaBonus = item.media_type === 'video' ? 15
                             : item.media_type === 'audio' ? 10
                             : item.media_type === 'note'  ? 3
                             : 5; // image
            const groupBonus  = group.length >= 3 ? 12 : group.length === 2 ? 6 : 0;
            const recencyRaw  = Math.exp(-0.039 * hoursOld) * 100; // same decay as following
            const score = recencyRaw * (tab === 'following' ? 0.8 : 0.5) + mediaBonus + groupBonus;

            groupedActivity.push(
                group.length > 1
                    ? { ...item, feedType: 'activity_group', groupItems: group, count: group.length, total_score: score }
                    : { ...item, feedType: 'activity', total_score: score }
            );
        });

        // ── Merge capsule cards + activity items (ambos se muestran siempre) ─
        let merged = [...capsData, ...groupedActivity].sort((a, b) => {
            const sa = a.total_score ?? 0;
            const sb = b.total_score ?? 0;
            return sb - sa;
        });

        // ── Author diversity: track counts separately per feed type ─────────
        // - Capsule cards (feedType='capsule'): max 2 per author
        // - Activity items (feedType='activity'|'activity_group'): max 2 per author
        // - No more than 2 CONSECUTIVE items from the same author
        const capsuleAuthorCount: Record<string, number> = {};
        const activityAuthorCount: Record<string, number> = {};
        const diversified: any[] = [];

        for (const item of merged) {
            const oid = item.owner_id;
            const isCapsuleCard = item.feedType === 'capsule';

            if (isCapsuleCard) {
                const count = capsuleAuthorCount[oid] ?? 0;
                if (count >= 2) continue;
                capsuleAuthorCount[oid] = count + 1;
            } else {
                const count = activityAuthorCount[oid] ?? 0;
                if (count >= 2) continue;
                activityAuthorCount[oid] = count + 1;
            }

            // Also prevent 3+ consecutive from the same author
            const last2 = diversified.slice(-2);
            if (
                last2.length === 2 &&
                last2[0].owner_id === oid &&
                last2[1].owner_id === oid
            ) continue;

            diversified.push(item);
        }

        // ── Record capsule IDs into impression buffer (DB flush later) ────────
        const capsuleIds = diversified
            .filter(i => i.feedType === 'capsule' && i.id)
            .map(i => i.id as string);
        if (capsuleIds.length && user.id) {
            capsuleIds.forEach(id => impressionBufferRef.current.add(id));
        }

        setCapsules(diversified);
        setFeedCache(prev => ({ ...prev, [cacheKey]: { data: diversified, ts: Date.now() } }));
        setLoading(false);
        setRefreshing(false);
    }, [activeTab, activeFilter, refreshing, feedCache]);

    // ─── Stories ───────────────────────────────────────────────────────────────
    const loadStories = useCallback(async (userIdOverride?: string, blockedIds?: string[]) => {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;
        const targetUserId = userIdOverride || user.id;
        const blocked = blockedIds ?? blockedUserIds;

        const [storiesRes, readsRes] = await Promise.all([
            supabase.from('capsule_items')
                .select('*, profiles:owner_id(username, display_name, avatar_url, id), capsules:capsule_id(id, title, model)')
                .eq('is_story', true)
                .gt('expires_at', new Date().toISOString())
                .order('created_at', { ascending: false }),
            supabase.from('story_reads').select('story_id').eq('user_id', user.id),
        ]);

        const data = storiesRes.data;
        const readIds = new Set((readsRes.data || []).map((r: any) => r.story_id));
        if (!data) return;

        const usersWithStories: any[] = [];
        data.forEach((s: any) => {
            if (blocked.includes(s.owner_id)) return;
            let group = usersWithStories.find(u => u.owner_id === s.owner_id);
            if (!group) { group = { ...s.profiles, owner_id: s.owner_id, stories: [] }; usersWithStories.push(group); }
            group.stories.push({ ...s, is_read: readIds.has(s.id) });
        });

        const processed = usersWithStories
            .map(u => ({ ...u, all_read: u.stories.every((s: any) => s.is_read) }))
            .sort((a, b) => {
                if (a.owner_id === targetUserId) return -1;
                if (b.owner_id === targetUserId) return 1;
                if (a.all_read !== b.all_read) return a.all_read ? 1 : -1;
                return 0;
            });

        setStories(processed);
        setMyStory(processed.find(u => u.owner_id === targetUserId) || null);
    }, [blockedUserIds]);

    const markStoryRead = useCallback(async (storyId: string) => {
        if (!currentUserId) return;
        await supabase.from('story_reads').upsert(
            { user_id: currentUserId, story_id: storyId },
            { onConflict: 'user_id,story_id' }
        );
        setStories(prev =>
            prev.map(u => ({
                ...u,
                stories: u.stories.map((s: any) => s.id === storyId ? { ...s, is_read: true } : s),
            })).map(u => ({ ...u, all_read: u.stories.every((s: any) => s.is_read) }))
        );
        if (myStory) {
            const updated = myStory.stories.map((s: any) => s.id === storyId ? { ...s, is_read: true } : s);
            setMyStory({ ...myStory, stories: updated, all_read: updated.every((s: any) => s.is_read) });
        }
    }, [currentUserId, myStory]);

    // ─── Flash picker ──────────────────────────────────────────────────────────
    const handleYourCapPress = useCallback(async () => {
        if (tutorialStep === 'POST_YOURCAP') {
            setTutorialStep('FINISHED');
            AsyncStorage.setItem('hasSeenTutorialV2', 'true');
        }
        if (myStory) {
            setActiveStory(myStory);
        } else {
            if (!currentUserId) return;
            const { data: profile } = await supabase.from('profiles')
                .select('story_cooldown_until').eq('id', currentUserId).maybeSingle();
            if (profile?.story_cooldown_until && new Date(profile.story_cooldown_until) > new Date()) {
                Alert.alert(t('common.warning'), t('feed.story_cooldown_active'));
                return;
            }
            const { data } = await supabase.from('capsules').select('*').eq('owner_id', currentUserId);
            if (data && data.length > 0) {
                setUserCapsules(data);
                setPickerStep('list');
                setShowCapsulePicker(true);
            } else {
                Alert.alert(t('common.warning'), t('feed.no_capsules_yet'));
            }
        }
    }, [myStory, currentUserId, tutorialStep, t]);

    const handleSelectCapsuleForPicker = useCallback(async (capsule: any) => {
        setSelectedPickerCapsule(capsule);
        const { data: items } = await supabase.from('capsule_items')
            .select('*').eq('capsule_id', capsule.id).eq('media_type', 'image');
        if (!items || items.length === 0) {
            Alert.alert(t('common.warning'), t('create.no_media'));
            return;
        }

        setPickerItems(items);

        if (capsule.status === 'opened') {
            setPickerStep('select');
        } else {
            setPickerStep('animation');
            
            // Check if there is a previously generated flash item for this user/capsule
            const storageKey = `@flash_selection_${currentUserId}_${capsule.id}`;
            const savedId = await AsyncStorage.getItem(storageKey);
            const savedItem = items.find(i => i.id === savedId);

            if (savedItem) {
                // Return preserved item directly
                setSearching(false);
                setRandomPreviewItem(savedItem);
                unblurAnim.setValue(0);
            } else {
                setSearching(true);
                Animated.loop(Animated.sequence([
                    Animated.timing(searchingAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
                    Animated.timing(searchingAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
                ])).start();
                
                setTimeout(async () => {
                    const random = items[Math.floor(Math.random() * items.length)];
                    setRandomPreviewItem(random);
                    
                    // Persist selection
                    try {
                        await AsyncStorage.setItem(storageKey, random.id);
                    } catch (e) {}

                    setSearching(false);
                    searchingAnim.stopAnimation();
                    unblurAnim.setValue(1);
                    Animated.timing(unblurAnim, { toValue: 0, duration: 3500, useNativeDriver: true, easing: Easing.out(Easing.cubic) }).start();
                }, 2500);
            }
        }
    }, [t, currentUserId]);

    const rejectRandomStory = useCallback(async () => {
        const cd = new Date(); cd.setHours(cd.getHours() + 48);
        const { error } = await supabase.from('profiles')
            .update({ story_cooldown_until: cd.toISOString() }).eq('id', currentUserId);
        setPickerStep('list');
        setShowCapsulePicker(false);
        if (!error) Alert.alert(t('common.warning'), t('feed.story_cooldown_active'));
    }, [currentUserId, t]);

    const confirmStory = useCallback(async (item: any, metadata: any = {}) => {
        const expiresAt = new Date(); expiresAt.setHours(expiresAt.getHours() + 48); // Flashes last 48h
        const { data: cap } = await supabase.from('capsules')
            .select('status').eq('id', item.capsule_id).single();
        const { error } = await supabase.from('capsule_items').insert({
            owner_id: currentUserId,
            capsule_id: item.capsule_id,
            media_url: item.media_url || `empty-story://${Date.now()}`,
            media_type: item.media_type || 'image',
            is_story: true,
            is_mystery: cap?.status === 'sealed',
            expires_at: expiresAt.toISOString(),
            metadata,
        });
        if (!error) {
            // Success shared story - clear persisted selection if it existed
            try {
                const storageKey = `@flash_selection_${currentUserId}_${item.capsule_id}`;
                await AsyncStorage.removeItem(storageKey);
            } catch (e) {}

            setShowCapsulePicker(false);
            setEditingItem(null);
            setPickerStep('list');
            loadStories();
        } else {
            Alert.alert(t('common.error'), t('feed.share_error'));
        }
    }, [currentUserId, t, loadStories]);

    // ─── Init & effects ────────────────────────────────────────────────────────
    useEffect(() => {
        const init = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            const user = session?.user;
            if (user) {
                const { count } = await supabase.from('follows')
                    .select('*', { count: 'exact', head: true })
                    .eq('follower_id', user.id);
                const tab: FeedTab = count && count > 0 ? 'following' : 'explore';
                setActiveTab(tab);
                setCurrentUserId(user.id);
                isFirstMount.current = false;
            }
        };
        init();
    }, []);

    // Flush impression buffer to DB periodically
    useEffect(() => {
        const flushImpressions = async () => {
            if (!currentUserId || impressionBufferRef.current.size === 0) return;
            const ids = Array.from(impressionBufferRef.current) as string[];
            impressionBufferRef.current.clear();
            try {
                await supabase.rpc('record_feed_impressions', {
                    p_user_id: currentUserId,
                    p_capsule_ids: ids,
                });
            } catch (e) { /* best-effort */ }
        };
        impressionFlushRef.current = setInterval(flushImpressions, IMPRESSION_FLUSH_MS) as any;
        return () => {
            if (impressionFlushRef.current) clearInterval(impressionFlushRef.current);
            // Flush on unmount too
            flushImpressions();
        };
    }, [currentUserId]);

    useEffect(() => {
        if (!isFirstMount.current && currentUserId && isFocused) {
            loadFeed(false, activeTab);
            loadStories();
        }
    }, [activeTab, activeFilter, currentUserId, isFocused]);

    // Mensajes no leídos
    useEffect(() => {
        const checkUnread = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            const user = session?.user;
            if (!user) return;
            const { data: myConvs } = await supabase.from('conversation_participants')
                .select('conversation_id').eq('user_id', user.id);
            if (!myConvs?.length) { setHasUnread(false); return; }

            const deletedKey = `deleted_chats_${user.id}`;
            const existingDeleted = await AsyncStorage.getItem(deletedKey);
            let deletedStamps: Record<string, string> = {};
            if (existingDeleted) {
                try {
                    const parsed = JSON.parse(existingDeleted);
                    if (Array.isArray(parsed)) parsed.forEach((id: string) => { deletedStamps[id] = new Date(0).toISOString(); });
                    else deletedStamps = parsed;
                } catch (e) {}
            }

            const convIds = myConvs.map(c => c.conversation_id);
            if (!convIds.length) { setHasUnread(false); return; }

            const [convsRes, lastMsgsRes] = await Promise.all([
                supabase.from('conversations').select('id, last_message_at').in('id', convIds),
                supabase.from('messages').select('conversation_id, created_at, sender_id, is_read')
                    .in('conversation_id', convIds)
                    .order('created_at', { ascending: false })
            ]);

            if (!lastMsgsRes.data?.length) { setHasUnread(false); return; }

            const latestMsgMap: Record<string, any> = {};
            (lastMsgsRes.data || []).forEach(m => { if (!latestMsgMap[m.conversation_id]) latestMsgMap[m.conversation_id] = m; });

            const convsMap: Record<string, any> = {};
            (convsRes.data || []).forEach(c => convsMap[c.id] = c);

            let foundUnread = false;
            for (const cId of convIds) {
                const conv = convsMap[cId];
                const lastMsg = latestMsgMap[cId];
                const lastMsgAt = conv?.last_message_at;
                const delTime = deletedStamps[cId];

                // Ignore if it was deleted after or at the exact time of the last message
                if (delTime && (!lastMsgAt || new Date(lastMsgAt).getTime() <= new Date(delTime).getTime())) continue;

                if (lastMsg && lastMsg.sender_id !== user.id && !lastMsg.is_read) {
                    foundUnread = true;
                    break;
                }
            }
            setHasUnread(foundUnread);
        };
        checkUnread();
        const ch = supabase.channel('chat_updates')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, checkUnread)
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, [isFocused]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        const cacheKey = `${activeTab}_${activeFilter}`;
        setFeedCache(prev => { const n = { ...prev }; delete n[cacheKey]; return n; });
        loadFeed(true);
    }, [activeTab, activeFilter, loadFeed]);

    const keyExtractor = useCallback((item: any) => item.id, []);

    // ─── renderItem ────────────────────────────────────────────────────────────
    const renderItem = useCallback(({ item }: { item: any }) => {
        // Posts de actividad (fotos/videos/audios/notas añadidas a cápsulas)
        if (item.feedType === 'activity' || item.feedType === 'activity_group') {
            return <TimelineActivity item={item} />;
        }
        // Tarjetas de cápsula (creación de cápsula)
        const capsule = item.feedType === 'capsule'
            ? item
            : (Array.isArray(item.capsules) ? item.capsules[0] : item.capsules);
        if (!capsule) return null;
        return <CapsuleCard capsule={capsule} />;
    }, []);

    // ─── List Header ───────────────────────────────────────────────────────────
    const ListHeader = useMemo(() => (
        <>
            <View style={s.storiesSection}>
                <ScrollView
                    ref={storiesScrollRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={s.storiesContent}
                >
                    <StoryBubble
                        key="your-cap"
                        user={myStory || null}
                        isOwn
                        onPress={handleYourCapPress}
                    />
                    {stories
                        .filter(u => u.owner_id !== currentUserId)
                        .map(u => (
                            <StoryBubble
                                key={u.owner_id}
                                user={u}
                                onPress={() => setActiveStory(u)}
                            />
                        ))}
                </ScrollView>
            </View>

            <ScrollView
                ref={filterScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={s.filterBar}
                contentContainerStyle={s.filterBarContent}
            >
                {FILTER_KEYS.map(key => (
                    <FilterChip
                        key={key}
                        filterKey={key}
                        isActive={activeFilter === key}
                        onPress={setActiveFilter}
                        t={t}
                        pulseAnim={pulseAnim}
                    />
                ))}
            </ScrollView>

            <View style={s.feedDivider} />
        </>
    ), [stories, myStory, currentUserId, activeFilter, handleYourCapPress]);

    // ─── Render ────────────────────────────────────────────────────────────────
    return (
        <View style={s.root}>
            <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

            {/* ── HEADER ──────────────────────────────────────────────── */}
            <Animated.View
                style={[
                    s.header,
                    { paddingTop: insets.top + 6 },
                    { opacity: headerOpacity, transform: [{ translateY: headerSlide }] },
                ]}
            >
                <BlurView intensity={Platform.OS === 'ios' ? 85 : 100} tint="light" style={StyleSheet.absoluteFill} />

                <View style={s.headerRow}>
                    <View style={s.logoRow}>
                        <Image
                            source={{ uri: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/website/Logomain.png' }}
                            style={s.logoImg}
                            resizeMode="contain"
                        />
                        <Text style={s.logoText}>kapsely</Text>
                    </View>

                    <View style={s.headerActions}>
                        <TouchableOpacity
                            style={[s.actionBtnSecondary, hasUnread && s.actionBtnUnread, { width: 44, height: 44, borderRadius: 14 }]}
                            activeOpacity={0.7}
                            onPress={() => navigation.navigate('ChatList')}
                        >
                            <Ionicons
                                name="chatbubble-ellipses"
                                size={21}
                                color={hasUnread ? Colors.primary : Colors.textPrimary}
                            />
                            {hasUnread && <View style={s.unreadDot} />}
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={s.tabRow}>
                    {(['following', 'explore'] as FeedTab[]).map(tab => {
                        const isActive = activeTab === tab;
                        return (
                            <TouchableOpacity
                                key={tab}
                                style={[s.tab, isActive && s.tabActive]}
                                onPress={() => setActiveTab(tab)}
                                activeOpacity={0.7}
                            >
                                <Text style={[s.tabText, isActive && s.tabTextActive]}>
                                    {tab === 'following' ? t('feed.following') : t('feed.explore')}
                                </Text>
                                {isActive && (
                                    <LinearGradient
                                        colors={[Colors.primary, Colors.primaryDark]}
                                        style={s.tabUnderline}
                                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                    />
                                )}
                            </TouchableOpacity>
                        );
                    })}
                    <View style={s.tabBarLine} />
                </View>
            </Animated.View>

            {/* ── FEED ──────────────────────────────────────────────────── */}
            <FlashList
                ref={flatListRef}
                data={capsules}
                keyExtractor={keyExtractor}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + 90 }]}
                refreshing={refreshing}
                onRefresh={onRefresh}
                ListHeaderComponent={ListHeader}
                renderItem={renderItem}
                // @ts-ignore - FlashList typing mismatch in this specific setup
                estimatedItemSize={280}
                ListEmptyComponent={() =>
                    loading ? (
                        <FeedSkeleton />
                    ) : (
                        <View style={s.emptyState}>
                            <View style={[s.emptyIconWrap, { backgroundColor: Colors.primary + '10' }]}>
                                <Ionicons name="time-outline" size={40} color={Colors.primary} />
                            </View>
                            <Text style={s.emptyTitle}>Nothing here yet</Text>
                            <Text style={s.emptySub}>
                                When people you follow add memories to their capsules, they'll appear here.
                            </Text>
                            <TouchableOpacity
                                activeOpacity={0.85}
                                onPress={() => setActiveTab('explore')}
                                style={s.emptyBtn}
                            >
                                <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={s.emptyBtnGrad}>
                                    <Ionicons name="compass-outline" size={16} color="#fff" />
                                    <Text style={s.emptyBtnText}>Explore capsules</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    )
                }
            />

            {/* ── CAPSULE PICKER MODAL ──────────────────────────────────── */}
            <Modal
                visible={showCapsulePicker}
                transparent
                animationType="slide"
                onRequestClose={() => { pickerStep === 'animation' ? rejectRandomStory() : setShowCapsulePicker(false); }}
            >
                <View style={s.pickerOverlay}>
                    <View style={[
                        s.pickerSheet, 
                        (pickerStep === 'edit' || pickerStep === 'animation' || pickerStep === 'select') && { height: height * 0.85 }
                    ]}>
                        <View style={s.pickerHandle} />

                        <View style={s.pickerHeader}>
                            {pickerStep !== 'list' && (
                                <TouchableOpacity
                                    onPress={() => { pickerStep === 'animation' ? rejectRandomStory() : setPickerStep('list'); }}
                                    style={s.pickerNavBtn} activeOpacity={0.7}
                                >
                                    <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
                                </TouchableOpacity>
                            )}
                            <Text style={s.pickerTitle}>
                                {pickerStep === 'list' ? 'Share as Flash' :
                                    pickerStep === 'select' ? 'Choose Image' :
                                        pickerStep === 'edit' ? 'Edit Flash' : 'Discovering...'}
                            </Text>
                            <TouchableOpacity
                                onPress={() => { pickerStep === 'animation' ? rejectRandomStory() : setShowCapsulePicker(false); }}
                                style={s.pickerNavBtn} activeOpacity={0.7}
                            >
                                <Ionicons name="close" size={22} color={Colors.textMuted} />
                            </TouchableOpacity>
                        </View>

                        {pickerStep === 'list' && (
                            <ScrollView>
                                {userCapsules.map(cap => (
                                    <TouchableOpacity
                                        key={cap.id} style={s.pickerItem}
                                        activeOpacity={0.8}
                                        onPress={() => handleSelectCapsuleForPicker(cap)}
                                    >
                                        <View style={s.pickerModelWrap}>
                                            <Image
                                                source={{ uri: timerConfigManager.getModelImage(cap.model) || MODEL_IMAGES[cap.model] || (MODEL_IMAGES as any).basicred_kap }}
                                                style={s.pickerModelImg}
                                                resizeMode="contain"
                                            />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.pickerItemTitle}>{cap.title}</Text>
                                            <Text style={[s.pickerItemStatus, { color: cap.status === 'opened' ? Colors.success : Colors.primary }]}>
                                                {cap.status === 'opened' ? 'Opened' : 'Sealed'}
                                            </Text>
                                        </View>
                                        <Ionicons name="chevron-forward" size={18} color={Colors.border} />
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        )}

                        {pickerStep === 'select' && (
                            <FlashList
                                data={pickerItems}
                                numColumns={3}
                                keyExtractor={i => i.id}
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        style={s.pickerGridCell}
                                        activeOpacity={0.8}
                                        onPress={() => { setEditingItem(item); setPickerStep('edit'); }}
                                    >
                                        <Image source={{ uri: item.media_url }} style={s.pickerGridImg} />
                                    </TouchableOpacity>
                                )}
                                // @ts-ignore
                                estimatedItemSize={80}
                                contentContainerStyle={{ gap: 2 }}
                            />
                        )}

                        {pickerStep === 'animation' && (
                            <View style={s.animWrap}>
                                {searching ? (
                                    <View style={s.searchingWrap}>
                                        <Animated.View style={{ transform: [{ scale: searchingAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] }) }] }}>
                                            <Ionicons name="rocket-outline" size={60} color={Colors.primary} />
                                        </Animated.View>
                                        <Text style={s.animTitle}>{t('feed.reveal_msg')}</Text>
                                        <Text style={s.animSub}>{t('feed.opening_msg')}</Text>
                                    </View>
                                ) : (
                                    <View style={{ width: '100%', alignItems: 'center' }}>
                                        <View style={s.previewImgWrap}>
                                            <Image source={{ uri: randomPreviewItem?.media_url }} style={s.previewImg} />
                                            <Animated.View style={[StyleSheet.absoluteFill, { opacity: unblurAnim }]}>
                                                <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
                                                <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
                                            </Animated.View>
                                        </View>
                                        <Text style={s.animTitle}>A memory has surfaced!</Text>
                                        <View style={s.previewActions}>
                                            <TouchableOpacity style={s.previewCancelBtn} activeOpacity={0.7} onPress={rejectRandomStory}>
                                                <Text style={s.previewCancelText}>Cancel</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={s.previewConfirmBtn}
                                                activeOpacity={0.85}
                                                onPress={() => { setEditingItem(randomPreviewItem); setPickerStep('edit'); }}
                                            >
                                                <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={s.previewConfirmGrad}>
                                                    <Text style={s.previewConfirmText}>Add to Flash</Text>
                                                </LinearGradient>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                )}
                            </View>
                        )}

                        {pickerStep === 'edit' && editingItem && (
                            <StoryEditor
                                item={editingItem}
                                onCancel={() => setPickerStep(selectedPickerCapsule?.status === 'opened' ? 'select' : 'animation')}
                                onConfirm={meta => confirmStory(editingItem, meta)}
                            />
                        )}
                    </View>
                </View>
            </Modal>

            {/* Story viewer */}
            <StoryViewer
                visible={!!activeStory}
                userGroup={activeStory}
                onClose={() => setActiveStory(null)}
                onNextUser={() => {
                    const idx = stories.findIndex(u => u.owner_id === activeStory?.owner_id);
                    setActiveStory(idx < stories.length - 1 ? stories[idx + 1] : null);
                }}
                onPrevUser={() => {
                    const idx = stories.findIndex(u => u.owner_id === activeStory?.owner_id);
                    if (idx > 0) setActiveStory(stories[idx - 1]);
                }}
                onStoryRead={markStoryRead}
                currentUserId={currentUserId || undefined}
            />

            <InteractiveTour
                step={tutorialStep}
                onAction={action => { if (action === 'START') setTutorialStep('PRESS_PLUS'); }}
                onDismiss={async () => {
                    await AsyncStorage.setItem('hasSeenTutorialV2', 'true');
                    setTutorialStep('FINISHED');
                }}
            />

            {/* ATT Modal */}
            <Modal visible={showATTModal} transparent animationType="fade">
                <View style={attStyles.overlay}>
                    <View style={attStyles.sheet}>
                        <View style={attStyles.iconRing}>
                            <Ionicons name="shield-checkmark-outline" size={32} color={Colors.primary} />
                        </View>
                        <Text style={attStyles.title}>Privacy Matters</Text>
                        <Text style={attStyles.desc}>
                            We use your data to show relevant ads and improve the app experience. Your choices here help us keep Kapsely free and personalized.
                        </Text>
                        <TouchableOpacity style={attStyles.btn} activeOpacity={0.8} onPress={handleATTContinue}>
                            <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={attStyles.btnGrad}>
                                <Text style={attStyles.btnText}>Continue</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.background },

    header: {
        backgroundColor: 'transparent',
        borderBottomWidth: 1, borderBottomColor: Colors.border,
        overflow: 'hidden', zIndex: 10,
    },
    headerRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 18, paddingVertical: 10,
    },
    logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    logoImg: { width: 28, height: 28 },
    logoText: { fontSize: 20, fontFamily: Fonts.bold, color: Colors.textPrimary, letterSpacing: -0.5 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    actionBtnPrimary: {
        width: 34, height: 34, borderRadius: 11,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: Colors.primary, shadowOpacity: 0.28,
        shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4,
    },
    actionBtnSecondary: {
        width: 38, height: 38, borderRadius: 12,
        backgroundColor: Colors.cardAlt,
        borderWidth: 1, borderColor: Colors.border,
        alignItems: 'center', justifyContent: 'center',
        position: 'relative',
    },
    actionBtnUnread: { borderColor: Colors.primary + '55', backgroundColor: Colors.primary + '08' },
    unreadDot: {
        position: 'absolute', top: -1, right: -1,
        width: 8, height: 8, borderRadius: 4,
        backgroundColor: Colors.error, borderWidth: 1.5, borderColor: Colors.background,
    },

    tabRow: { flexDirection: 'row', paddingHorizontal: 18, position: 'relative' },
    tabBarLine: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, backgroundColor: Colors.border },
    tab: { paddingVertical: 10, marginRight: 22, position: 'relative' },
    tabActive: {},
    tabText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.textMuted },
    tabTextActive: { color: Colors.textPrimary, fontFamily: Fonts.bold },
    tabUnderline: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, borderRadius: 1 },

    storiesSection: { paddingTop: 18, paddingBottom: 14 },
    storiesContent: { paddingHorizontal: 18 },

    filterBar: { marginBottom: 2 },
    filterBarContent: { paddingHorizontal: 18, gap: 8, paddingBottom: 10 },

    feedDivider: { height: 1, backgroundColor: Colors.divider, marginBottom: 4 },

    listContent: { paddingTop: 0 },

    emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40, paddingBottom: 40 },
    emptyIconWrap: { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    emptyTitle: { fontSize: 21, fontFamily: Fonts.bold, color: Colors.textPrimary, marginBottom: 10, letterSpacing: -0.3 },
    emptySub: { color: Colors.textSecondary, fontSize: 14, fontFamily: Fonts.regular, textAlign: 'center', lineHeight: 21, marginBottom: 28 },
    emptyBtn: { width: '100%', borderRadius: 16, overflow: 'hidden' },
    emptyBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
    emptyBtnText: { color: '#fff', fontFamily: Fonts.bold, fontSize: 14 },

    pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
    pickerSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '88%', overflow: 'hidden' },
    pickerHandle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.divider, marginTop: 12, marginBottom: 4 },
    pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
    pickerTitle: { fontSize: 17, fontFamily: Fonts.bold, color: Colors.textPrimary },
    pickerNavBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
    pickerItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
    pickerModelWrap: { width: 48, height: 48, borderRadius: 12, backgroundColor: Colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
    pickerModelImg: { width: '80%', height: '80%' },
    pickerItemTitle: { fontSize: 15, fontFamily: Fonts.bold, color: Colors.textPrimary },
    pickerItemStatus: { fontSize: 12, fontFamily: Fonts.medium, marginTop: 2 },
    pickerGridCell: { width: width / 3, aspectRatio: 1, padding: 1 },
    pickerGridImg: { width: '100%', height: '100%' },

    animWrap: { padding: 28, alignItems: 'center' },
    searchingWrap: { alignItems: 'center', gap: 14, paddingVertical: 20 },
    animTitle: { fontSize: 17, fontFamily: Fonts.bold, color: Colors.textPrimary, textAlign: 'center' },
    animSub: { fontSize: 13, color: Colors.textSecondary, fontFamily: Fonts.medium, textAlign: 'center' },
    previewImgWrap: { width: '100%', height: 320, borderRadius: 20, overflow: 'hidden', marginBottom: 20 },
    previewImg: { width: '100%', height: '100%' },
    previewActions: { flexDirection: 'row', gap: 12, width: '100%' },
    previewCancelBtn: { flex: 1, height: 52, borderRadius: 16, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
    previewCancelText: { color: Colors.textSecondary, fontFamily: Fonts.semiBold, fontSize: 14 },
    previewConfirmBtn: { flex: 1, height: 52, borderRadius: 16, overflow: 'hidden' },
    previewConfirmGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    previewConfirmText: { color: '#fff', fontFamily: Fonts.bold, fontSize: 14 },
});

const attStyles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 25 },
    sheet: { backgroundColor: Colors.surface, borderRadius: 28, padding: 25, alignItems: 'center', width: '100%', maxWidth: 340, ...Shadow.primary },
    iconRing: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.primary + '10', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    title: { fontSize: 22, fontFamily: Fonts.bold, color: Colors.textPrimary, marginBottom: 12, textAlign: 'center' },
    desc: { fontSize: 15, fontFamily: Fonts.regular, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 30 },
    btn: { width: '100%', borderRadius: 18, overflow: 'hidden' },
    btnGrad: { paddingVertical: 15, alignItems: 'center' },
    btnText: { color: '#fff', fontSize: 16, fontFamily: Fonts.bold },
});