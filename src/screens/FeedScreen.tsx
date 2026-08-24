import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    StatusBar, Modal, Platform, Alert,
    Dimensions, Animated, Easing, ActivityIndicator, InteractionManager,
    DeviceEventEmitter, AppState, RefreshControl
} from 'react-native';
import { Image } from 'expo-image';

import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';
import { Colors, Fonts, Shadow } from '../theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuthSessionSnapshot, getAuthUserIdSnapshot, supabase } from '../lib/supabase';
import { useInfiniteQuery, useMutation, useQueryClient, onlineManager } from '@tanstack/react-query';
import { safetyService } from '../utils/safety';
import { useWebDragScroll } from '../utils/useWebDragScroll';
import { feedScrollBus } from '../utils/feedScrollBus';
import { rankAndDiversifyFeed } from '../utils/feedRanking';
import InteractiveTour from '../components/InteractiveTour';
import { sendPushNotification } from '../utils/pushNotifications';
import { MODEL_IMAGES, MODEL_TINTS } from '../constants/models';
import { timerConfigManager } from '../utils/timerConfig';

type TutorialStep = 'IDLE' | 'WELCOME' | 'PRESS_PLUS' | 'SELECT_TYPE' | 'FINISHED';

let requestTrackingPermissionsAsync: any = async () => ({ status: 'granted' });
let getTrackingPermissionsAsync: any = async () => ({ status: 'granted' });
if (Platform.OS === 'ios') {
    try {
        const Tracking = require('expo-tracking-transparency');
        requestTrackingPermissionsAsync = Tracking.requestTrackingPermissionsAsync;
        getTrackingPermissionsAsync = Tracking.getTrackingPermissionsAsync;
    } catch (e) {
        console.warn('Tracking transparency not available');
    }
}

import { FilterChip } from '../components/feed/FilterChip';
import CapsuleCard from '../components/CapsuleCard';

type FeedTab = 'following' | 'explore';
type FilterType = 'all' | 'closed' | 'open';
type FeedCursor = {
    score: number;
    activityDate: string;
    id: string;
    page: number;
};

const { width, height } = Dimensions.get('window');

const FEED_CACHE_TTL = 5 * 60 * 1000;
const IMPRESSION_FLUSH_MS = 8000;
const PAGE_SIZE = 15;
const FEED_BOOT_CACHE_PREFIX = '@kapsely_feed_boot_v4';
const FEED_RPC_TIMEOUT_MS = 6500;
const SIMPLE_FRONTEND_FEED = true;
const DISABLE_FEED_IMPRESSIONS_UNTIL_STABLE = false;
const SUPABASE_RELIEF_MODE = true;
const SIMPLE_FEED_CANDIDATE_MULTIPLIER = 4;
const SIMPLE_FEED_REFRESH_CANDIDATE_MULTIPLIER = 6;
const SIMPLE_FEED_MAX_CANDIDATES = 90;
const FEED_SIGNAL_LIMIT = 320;
// Temporary performance switch: Flashes are removed from feed queries, UI and bundles.
const FLASHES_ENABLED = false;

const withTimeout = <T,>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> =>
    new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
        Promise.resolve(promise)
            .then(value => {
                clearTimeout(timer);
                resolve(value);
            })
            .catch(error => {
                clearTimeout(timer);
                reject(error);
            });
    });

const getSafeArray = (value: any) => Array.isArray(value) ? value : [];

const getNestedCapsuleOwnerId = (row: any) => {
    const capsule = Array.isArray(row?.capsules) ? row.capsules[0] : row?.capsules;
    return capsule?.owner_id || null;
};

const getTime = (value?: string | null) => {
    if (!value) return 0;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
};

const getAgeDays = (timeMs: number) => timeMs > 0 ? Math.max(0, (Date.now() - timeMs) / 86400000) : 999;

const getRecentSeenPenalty = (lastSeenMs: number, isRefresh: boolean) => {
    if (!lastSeenMs) return 0;
    const ageDays = getAgeDays(lastSeenMs);
    if (ageDays < 1 / 24) return isRefresh ? 320 : 240;
    if (ageDays < 1) return isRefresh ? 260 : 160;
    if (ageDays < 3) return isRefresh ? 175 : 95;
    if (ageDays < 7) return 70;
    return 22;
};

const stableLightBoost = (value: string) => {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
    }
    return Math.abs(hash % 1200) / 100;
};

const getUploadBatchKey = (item: any) => {
    if (item?.batch_id) return String(item.batch_id);
    const marker = String(item?.caption || '').match(/!!b:([^\s]+)/);
    return marker?.[1] || String(item?.id || Math.random());
};

const stripBatchMarker = (value?: string | null) => (value || '').replace(/!!b:[^\s]+/g, '').trim();

const FILTER_KEYS: FilterType[] = ['all', 'closed', 'open'];
const FILTER_META: Record<FilterType, { icon: string; label: (t: any) => string; iconColor?: string }> = {
    all: { icon: 'apps', label: t => t('feed.all') },
    closed: { icon: 'lock-closed', label: t => t('feed.closed'), iconColor: '#FF4D4D' }, // Electric Red
    open: { icon: 'lock-open', label: t => t('feed.open'), iconColor: '#10B981' },   // Emerald Green
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────
const SkeletonPulse = React.memo(({ style }: { style?: any }) => {
    const anim = useRef(new Animated.Value(0.4)).current;
    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(anim, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                Animated.timing(anim, { toValue: 0.4, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            ])
        ).start();
    }, []);
    return <Animated.View style={[style, { opacity: anim }]} />;
});

const FeedSkeleton = React.memo(() => (
    <>
        {[0, 1, 2].map(i => (
            <View key={i} style={sk.card}>
                <View style={sk.topRow}>
                    <SkeletonPulse style={sk.avatar} />
                    <View style={{ flex: 1, gap: 7 }}>
                        <SkeletonPulse style={[sk.line, { width: '48%' }]} />
                        <SkeletonPulse style={[sk.line, { width: '28%', opacity: 0.6 }]} />
                    </View>
                    <SkeletonPulse style={sk.capsuleThumb} />
                </View>
                <SkeletonPulse style={sk.media} />
                <View style={{ padding: 14, gap: 9 }}>
                    <SkeletonPulse style={[sk.line, { width: '65%' }]} />
                    <SkeletonPulse style={[sk.line, { width: '40%' }]} />
                </View>
            </View>
        ))}
    </>
));

const sk = StyleSheet.create({
    card: {
        marginHorizontal: 16,
        marginBottom: 16,
        borderRadius: 22,
        backgroundColor: Colors.cardAlt,
        overflow: 'hidden',
    },
    topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
    avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.border },
    capsuleThumb: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.border },
    media: { width: '100%', height: 230, backgroundColor: Colors.border },
    line: { height: 10, borderRadius: 5, backgroundColor: Colors.border },
});

// ─── Tab Pill ─────────────────────────────────────────────────────────────────
// Animated pill indicator that slides between tabs
const TabPill = React.memo(({ activeTab, onTabChange, t }: {
    activeTab: FeedTab;
    onTabChange: (tab: FeedTab) => void;
    t: any;
}) => {
    const slideAnim = useRef(new Animated.Value(activeTab === 'following' ? 0 : 1)).current;

    useEffect(() => {
        Animated.spring(slideAnim, {
            toValue: activeTab === 'following' ? 0 : 1,
            useNativeDriver: false,
            tension: 68,
            friction: 11,
        }).start();
    }, [activeTab]);

    const pillLeft = slideAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['2%', '50%'],
    });

    return (
        <View style={tabPillStyles.container}>
            <Animated.View style={[tabPillStyles.pill, { left: pillLeft }]} />
            {(['following', 'explore'] as FeedTab[]).map(tab => {
                const isActive = activeTab === tab;
                return (
                    <TouchableOpacity
                        key={tab}
                        style={tabPillStyles.tab}
                        onPress={() => onTabChange(tab)}
                        activeOpacity={0.75}
                    >
                        <Text style={[tabPillStyles.label, isActive && tabPillStyles.labelActive]}>
                            {tab === 'following' ? t('feed.following') : t('feed.explore')}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
});

const tabPillStyles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        marginHorizontal: 18,
        marginBottom: 12,
        marginTop: 4,
        height: 38,
        borderRadius: 19,
        backgroundColor: Colors.cardAlt,
        borderWidth: 1,
        borderColor: Colors.border,
        position: 'relative',
        overflow: 'hidden',
    },
    pill: {
        position: 'absolute',
        top: 3,
        bottom: 3,
        width: '48%',
        borderRadius: 16,
        backgroundColor: Colors.primary,
        // Soft shadow under pill
        ...Platform.select({
            ios: {
                shadowColor: Colors.primary,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.28,
                shadowRadius: 6,
            },
            android: { elevation: 3 },
        }),
    },
    tab: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
    },
    label: {
        fontSize: 13,
        fontFamily: Fonts.semiBold,
        color: Colors.textMuted,
        letterSpacing: 0.1,
    },
    labelActive: {
        color: '#fff',
        fontFamily: Fonts.bold,
    },
});

const AnyFlashList = FlashList as any;

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function FeedScreen() {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const isFocused = useIsFocused();

    const [showCapsulePicker, setShowCapsulePicker] = useState(false);
    const [myStory, setMyStory] = useState<any>(null);
    const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
    const [activeStory, setActiveStory] = useState<any>(null);
    const [hasUnread, setHasUnread] = useState(false);
    const [tutorialStep, setTutorialStep] = useState<TutorialStep>('IDLE');
    const [showATTModal, setShowATTModal] = useState(false);

    const [likedCapsules, setLikedCapsules] = useState<Set<string>>(new Set());
    const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
    const [participantCapsules, setParticipantCapsules] = useState<Set<string>>(new Set());
    const [followedCapsules, setFollowedCapsules] = useState<Set<string>>(new Set());

    const [activeTab, setActiveTab] = useState<FeedTab>('following');
    const [activeFilter, setActiveFilter] = useState<FilterType>('all');
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [stories, setStories] = useState<any[]>([]);
    const [shuffleSeed, setShuffleSeed] = useState(Date.now());
    const [isOffline, setIsOffline] = useState(false);
    const [isPullRefreshing, setIsPullRefreshing] = useState(false);
    const [cachedFeedData, setCachedFeedData] = useState<any | null>(null);
    const [cachedFeedKey, setCachedFeedKey] = useState<string | null>(null);
    const [feedLoadTimedOut, setFeedLoadTimedOut] = useState(false);

    const queryClient = useQueryClient();
    const feedCacheKey = `${FEED_BOOT_CACHE_PREFIX}_${activeTab}_${activeFilter}`;
    const feedSessionId = useRef(`feed-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
    const refreshModeRef = useRef<'initial_load' | 'pull_to_refresh'>('initial_load');
    const feedRpcPreferenceRef = useRef<'unknown' | 'v2' | 'v1'>('unknown');
    const getSafeEmptyFeed = useCallback(() => ({
        feed: [],
        stories: [],
        following_ids: [],
        liked_ids: [],
        blocked_ids: [],
        participant_ids: [],
        followed_capsule_ids: [],
    }), []);

    const runQueryOrDefault = useCallback(async <T,>(promise: PromiseLike<T>, ms: number, fallback: T): Promise<T> => {
        try {
            return await withTimeout(promise, ms, 'feed query');
        } catch {
            return fallback;
        }
    }, []);

    useEffect(() => {
        let alive = true;
        const bootstrapAuth = async () => {
            const id = getAuthUserIdSnapshot();
            if (alive && id) setCurrentUserId(prev => prev || id);
        };

        bootstrapAuth();

        const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!alive) return;
            const nextId = session?.user?.id ?? null;
            setCurrentUserId(prev => (prev === nextId ? prev : nextId));
        });

        return () => {
            alive = false;
            listener.subscription.unsubscribe();
        };
    }, []);

    const fetchFeedFallback = async (myId: string) => {
        const fallbackBoot = cachedFeedKey === feedCacheKey ? cachedFeedData?.pages?.[0] : null;

        let bootstrap: any[] | null = null;
        try {
            bootstrap = await withTimeout(
                Promise.all([
                    supabase.from('follows').select('following_id').eq('follower_id', myId),
                    supabase.from('capsule_invites').select('capsule_id').eq('user_id', myId).eq('status', 'accepted'),
                    withTimeout(
                        safetyService.getAllSafetyUserIds(myId).catch(() => []),
                        1200,
                        'feed fallback blocked ids'
                    ).catch(() => []),
                ]),
                3500,
                'feed fallback bootstrap'
            );
        } catch (error) {
            console.warn('[Feed] Fallback bootstrap timed out', error);
            return fallbackBoot || getSafeEmptyFeed();
        }

        if (!bootstrap) {
            return fallbackBoot || getSafeEmptyFeed();
        }

        const [followingRes, participantRes, blockedIds] = bootstrap;

        const followingIds = (followingRes.data || []).map((f: any) => f.following_id);
        const participantIds = (participantRes.data || []).map((p: any) => p.capsule_id);
        const ownerIds = activeTab === 'following'
            ? Array.from(new Set([myId, ...followingIds]))
            : [];

        if (activeTab === 'following' && ownerIds.length === 0) {
            return {
                ...getSafeEmptyFeed(),
                blocked_ids: blockedIds || [],
                participant_ids: participantIds,
                following_ids: followingIds,
            };
        }

        let capsulesQuery = supabase
            .from('capsules')
            .select('*, profiles:owner_id(id, username, display_name, avatar_url, favorite_color, is_verified)')
            .order('created_at', { ascending: false })
            .limit(PAGE_SIZE);

        if (activeTab === 'following') {
            capsulesQuery = capsulesQuery.in('owner_id', ownerIds);
        } else {
            capsulesQuery = capsulesQuery.eq('is_public', true);
        }

        if (activeFilter === 'open') capsulesQuery = capsulesQuery.eq('status', 'opened');
        if (activeFilter === 'closed') capsulesQuery = capsulesQuery.eq('status', 'sealed');
        if (blockedIds.length > 0) capsulesQuery = capsulesQuery.not('owner_id', 'in', `(${blockedIds.join(',')})`);

        let capsulesData: any[] = [];
        let capsulesError: any = null;
        try {
            const capsulesRes = await withTimeout(capsulesQuery, 4200, 'feed fallback capsules');
            capsulesData = capsulesRes.data || [];
            capsulesError = capsulesRes.error;
        } catch (error) {
            console.warn('[Feed] Fallback capsules timed out', error);
            return fallbackBoot || getSafeEmptyFeed();
        }
        if (capsulesError) throw capsulesError;

        const capsuleIds = (capsulesData || []).map((c: any) => c.id);
        let mediaData: any[] = [];
        if (capsuleIds.length) {
            try {
                const mediaRes = await withTimeout(
                    supabase
                        .from('capsule_items')
                        .select('id, capsule_id, owner_id, media_url, media_type, thumbnail_url, content, caption, batch_id, created_at, profiles:owner_id(id, username, display_name, avatar_url, favorite_color, is_verified)')
                        .in('capsule_id', capsuleIds)
                        .eq('is_story', false)
                        .neq('moderation_status', 'rejected')
                        .in('media_type', ['image', 'video'])
                        .order('created_at', { ascending: false })
                        .limit(Math.min(360, Math.max(80, capsuleIds.length * 4))),
                    3000,
                    'feed fallback media'
                );
                mediaData = mediaRes.data || [];
            } catch (error) {
                console.warn('[Feed] Fallback media timed out', error);
            }
        }

        const mediaByCapsule = new Map<string, any[]>();
        (mediaData || []).forEach((item: any) => {
            const list = mediaByCapsule.get(item.capsule_id) || [];
            if (list.length < 4) list.push(item);
            mediaByCapsule.set(item.capsule_id, list);
        });

        let membersData: any[] = [];
        if (capsuleIds.length) {
            try {
                const membersRes = await withTimeout(
                    supabase
                        .from('capsule_invites')
                        .select('capsule_id, user_id, profiles:user_id(id, username, display_name, avatar_url, favorite_color, is_verified)')
                        .in('capsule_id', capsuleIds)
                        .eq('status', 'accepted'),
                    2500,
                    'feed fallback members'
                );
                membersData = membersRes.data || [];
            } catch (error) {
                console.warn('[Feed] Fallback members timed out', error);
            }
        }

        const membersByCapsule = new Map<string, any[]>();
        (capsulesData || []).forEach((capsule: any) => {
            if (capsule?.id && capsule.profiles) {
                membersByCapsule.set(capsule.id, [{ ...capsule.profiles, id: capsule.owner_id }]);
            }
        });
        (membersData || []).forEach((member: any) => {
            if (!member?.capsule_id || !member?.profiles) return;
            const list = membersByCapsule.get(member.capsule_id) || [];
            if (!list.some((profile: any) => profile.id === member.user_id)) {
                list.push({ ...member.profiles, id: member.user_id });
            }
            membersByCapsule.set(member.capsule_id, list);
        });

        return {
            feed: (capsulesData || []).map((capsule: any) => {
                const media = mediaByCapsule.get(capsule.id) || [];
                return {
                    ...capsule,
                    feed_type: 'capsule',
                    feed_item_key: capsule.id,
                    capsule_id: capsule.id,
                    latest_item: media[0] || null,
                    collage_items: media,
                    shared_members: membersByCapsule.get(capsule.id) || [],
                    posts_count: media.length,
                    likes_count: capsule.likes_count || 0,
                    comments_count: capsule.comments_count || 0,
                    is_participant: participantIds.includes(capsule.id),
                };
            }),
            stories: [],
            following_ids: followingIds,
            liked_ids: [],
            blocked_ids: blockedIds,
            participant_ids: participantIds,
        };
    };

    const fetchFeedSimpleFrontend = async (myId: string, pageParam: FeedCursor | null) => {
        const page = pageParam?.page ?? 0;
        const offset = page * PAGE_SIZE;
        const isRefreshPage = !pageParam && refreshModeRef.current === 'pull_to_refresh';
        const candidateLimit = Math.min(
            PAGE_SIZE * (isRefreshPage ? SIMPLE_FEED_REFRESH_CANDIDATE_MULTIPLIER : SIMPLE_FEED_CANDIDATE_MULTIPLIER),
            SIMPLE_FEED_MAX_CANDIDATES
        );

        const [
            followingRes,
            participantRes,
            capsuleFollowRes,
            myLikesRes,
            recentImpressionsRes,
            blockedIds,
        ] = await Promise.all([
            runQueryOrDefault(
                supabase.from('follows').select('following_id').eq('follower_id', myId),
                1400,
                { data: [], error: null } as any
            ),
            runQueryOrDefault(
                supabase.from('capsule_invites').select('capsule_id').eq('user_id', myId).eq('status', 'accepted'),
                1400,
                { data: [], error: null } as any
            ),
            runQueryOrDefault(
                supabase.from('capsule_followers').select('capsule_id').eq('user_id', myId),
                1400,
                { data: [], error: null } as any
            ),
            runQueryOrDefault(
                supabase
                    .from('likes')
                    .select('capsule_id')
                    .eq('user_id', myId)
                    .limit(FEED_SIGNAL_LIMIT),
                1400,
                { data: [], error: null } as any
            ),
            runQueryOrDefault(
                supabase
                    .from('feed_impressions')
                    .select('capsule_id, feed_event_id, feed_item_key, clicked, opened, watched_seconds, shown_at, created_at')
                    .eq('user_id', myId)
                    .order('shown_at', { ascending: false })
                    .limit(FEED_SIGNAL_LIMIT),
                1400,
                { data: [], error: null } as any
            ),
            runQueryOrDefault(
                safetyService.getAllSafetyUserIds(myId).catch(() => []),
                800,
                [] as string[]
            ),
        ]);

        const followingIds = getSafeArray(followingRes.data).map((f: any) => f.following_id).filter(Boolean);
        const participantIds = getSafeArray(participantRes.data).map((p: any) => p.capsule_id).filter(Boolean);
        const followedCapsuleIds = getSafeArray(capsuleFollowRes.data).map((c: any) => c.capsule_id).filter(Boolean);
        const likedHistoryIds = getSafeArray(myLikesRes.data).map((like: any) => like.capsule_id).filter(Boolean);
        const ownerIds = Array.from(new Set([myId, ...followingIds]));
        const blockedSet = new Set(blockedIds || []);
        const followedCapsuleSet = new Set(followedCapsuleIds);
        const likedHistorySet = new Set(likedHistoryIds);
        const participantSet = new Set(participantIds);
        const followingSetLocal = new Set(followingIds);

        const mutualByOwner = new Map<string, number>();
        if (activeTab === 'explore' && followingIds.length > 0) {
            const mutualRes = await runQueryOrDefault(
                supabase
                    .from('follows')
                    .select('follower_id, following_id')
                    .in('follower_id', followingIds.slice(0, 120))
                    .neq('following_id', myId)
                    .limit(900),
                1500,
                { data: [], error: null } as any
            );

            getSafeArray(mutualRes.data).forEach((row: any) => {
                if (!row?.following_id || followingSetLocal.has(row.following_id) || blockedSet.has(row.following_id)) return;
                mutualByOwner.set(row.following_id, (mutualByOwner.get(row.following_id) || 0) + 1);
            });
        }

        const statusFilter = activeFilter === 'open'
            ? 'opened'
            : activeFilter === 'closed'
                ? 'sealed'
                : null;

        const buildCapsuleQuery = (rangeOffset = offset, limit = candidateLimit) => {
            let query = supabase
                .from('capsules')
                .select('*, profiles:owner_id(id, username, display_name, avatar_url, favorite_color, is_verified)')
                .order('updated_at', { ascending: false })
                .range(rangeOffset, rangeOffset + Math.max(1, limit) - 1);

            if (statusFilter) query = query.eq('status', statusFilter);
            return query;
        };

        const capsuleSources: any[] = [];
        const addCapsuleSource = (query: any, timeout = 2500) => {
            capsuleSources.push(runQueryOrDefault(query, timeout, { data: [], error: null } as any));
        };

        if (activeTab === 'following') {
            if (ownerIds.length > 0) {
                addCapsuleSource(buildCapsuleQuery().in('owner_id', ownerIds));
            }
            if (followedCapsuleIds.length > 0) {
                addCapsuleSource(buildCapsuleQuery(0, Math.min(candidateLimit, followedCapsuleIds.length)).in('id', followedCapsuleIds.slice(0, 120)));
            }
        } else {
            addCapsuleSource(buildCapsuleQuery().eq('is_public', true).neq('owner_id', myId));

            const friendOfFriendOwners = Array.from(mutualByOwner.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([ownerId]) => ownerId)
                .slice(0, 80);
            if (friendOfFriendOwners.length > 0) {
                addCapsuleSource(buildCapsuleQuery(0, candidateLimit).eq('is_public', true).in('owner_id', friendOfFriendOwners));
            }

            const directlyRelevantCapsules = Array.from(new Set([...followedCapsuleIds, ...likedHistoryIds, ...participantIds])).slice(0, 120);
            if (directlyRelevantCapsules.length > 0) {
                addCapsuleSource(buildCapsuleQuery(0, Math.min(candidateLimit, directlyRelevantCapsules.length)).in('id', directlyRelevantCapsules));
            }
        }

        const capsuleResults = capsuleSources.length > 0
            ? await Promise.all(capsuleSources)
            : [{ data: [], error: null }];

        const rawCapsules = capsuleResults.flatMap((res: any) => res.data || []);
        const dedupedCapsules = Array.from(
            new Map(
                rawCapsules
                    .filter((capsule: any) => {
                        if (!capsule?.id || blockedSet.has(capsule.owner_id)) return false;

                        const directCapsuleAffinity =
                            followedCapsuleSet.has(capsule.id)
                            || likedHistorySet.has(capsule.id)
                            || participantSet.has(capsule.id);

                        if (activeTab === 'explore') {
                            if (capsule.owner_id === myId) return false;
                            return directCapsuleAffinity || (capsule.is_public === true && !followingSetLocal.has(capsule.owner_id));
                        }

                        return ownerIds.includes(capsule.owner_id) || directCapsuleAffinity;
                    })
                    .map((capsule: any) => [capsule.id, capsule])
            ).values()
        );

        const capsuleIds = dedupedCapsules.map((c: any) => c.id);
        const ownerByCapsuleId = new Map<string, string>();
        dedupedCapsules.forEach((capsule: any) => {
            if (capsule?.id && capsule?.owner_id) ownerByCapsuleId.set(capsule.id, capsule.owner_id);
        });

        const [
            mediaRes,
            likesRes,
            commentsRes,
            followersRes,
            membersRes,
        ] = capsuleIds.length
            ? await Promise.all([
                runQueryOrDefault(
                    supabase
                        .from('capsule_items')
                        .select('id, capsule_id, owner_id, media_url, media_type, thumbnail_url, content, caption, batch_id, created_at, profiles:owner_id(id, username, display_name, avatar_url, favorite_color, is_verified)')
                        .in('capsule_id', capsuleIds)
                        .eq('is_story', false)
                        .neq('moderation_status', 'rejected')
                        .in('media_type', ['image', 'video'])
                        .order('created_at', { ascending: false })
                        .limit(Math.min(360, Math.max(80, capsuleIds.length * 4))),
                    2500,
                    { data: [], error: null } as any
                ),
                runQueryOrDefault(
                    supabase
                        .from('likes')
                        .select('capsule_id, user_id')
                        .in('capsule_id', capsuleIds),
                    1800,
                    { data: [], error: null } as any
                ),
                runQueryOrDefault(
                    supabase
                        .from('comments')
                        .select('capsule_id, user_id, created_at')
                        .in('capsule_id', capsuleIds),
                    1800,
                    { data: [], error: null } as any
                ),
                runQueryOrDefault(
                    supabase
                        .from('capsule_followers')
                        .select('capsule_id')
                        .in('capsule_id', capsuleIds),
                    1800,
                    { data: [], error: null } as any
                ),
                runQueryOrDefault(
                    supabase
                        .from('capsule_invites')
                        .select('capsule_id, user_id, profiles:user_id(id, username, display_name, avatar_url, favorite_color, is_verified)')
                        .in('capsule_id', capsuleIds)
                        .eq('status', 'accepted'),
                    1800,
                    { data: [], error: null } as any
                ),
            ])
            : [
                { data: [] as any[] },
                { data: [] as any[] },
                { data: [] as any[] },
                { data: [] as any[] },
                { data: [] as any[] },
            ];

        const mediaByCapsule = new Map<string, any[]>();
        const mediaBatchesByCapsule = new Map<string, any[]>();

        getSafeArray(mediaRes.data).forEach((item: any) => {
            if (!item?.capsule_id) return;

            const latestList = mediaByCapsule.get(item.capsule_id) || [];
            if (latestList.length < 4) latestList.push(item);
            mediaByCapsule.set(item.capsule_id, latestList);

            const batchKey = getUploadBatchKey(item);
            const batches = mediaBatchesByCapsule.get(item.capsule_id) || [];
            let batch = batches.find((entry: any) => entry.batchKey === batchKey);
            if (!batch) {
                batch = {
                    batchKey,
                    capsuleId: item.capsule_id,
                    ownerId: item.owner_id,
                    items: [],
                    groupCount: 0,
                    activityAt: 0,
                };
                batches.push(batch);
            }

            batch.groupCount += 1;
            batch.activityAt = Math.max(batch.activityAt, getTime(item.created_at));
            if (batch.items.length < 4) batch.items.push(item);
            mediaBatchesByCapsule.set(item.capsule_id, batches);
        });

        mediaBatchesByCapsule.forEach((batches) => {
            batches.sort((a: any, b: any) => b.activityAt - a.activityAt);
            batches.forEach((batch: any) => {
                batch.items.sort((a: any, b: any) => getTime(b.created_at) - getTime(a.created_at));
            });
        });

        const countByCapsule = (rows: any[]) => {
            const counts = new Map<string, number>();
            rows.forEach((row: any) => {
                if (!row?.capsule_id) return;
                counts.set(row.capsule_id, (counts.get(row.capsule_id) || 0) + 1);
            });
            return counts;
        };

        const likesByCapsule = countByCapsule(likesRes.data || []);
        const commentsByCapsule = countByCapsule(commentsRes.data || []);
        const followersByCapsule = countByCapsule(followersRes.data || []);
        const userLikedCapsules = new Set<string>([
            ...likedHistoryIds,
            ...getSafeArray(likesRes.data)
                .filter((like: any) => like.user_id === myId)
                .map((like: any) => like.capsule_id)
                .filter(Boolean),
        ]);
        const userCommentedCapsules = new Set<string>(
            getSafeArray(commentsRes.data)
                .filter((comment: any) => comment.user_id === myId)
                .map((comment: any) => comment.capsule_id)
                .filter(Boolean)
        );

        const addOwnerCount = (target: Map<string, number>, ownerId: string | null | undefined, amount = 1) => {
            if (!ownerId) return;
            target.set(ownerId, (target.get(ownerId) || 0) + amount);
        };

        const ownerLikeCounts = new Map<string, number>();
        userLikedCapsules.forEach(capsuleId => addOwnerCount(ownerLikeCounts, ownerByCapsuleId.get(capsuleId)));

        const ownerCommentCounts = new Map<string, number>();
        userCommentedCapsules.forEach(capsuleId => addOwnerCount(ownerCommentCounts, ownerByCapsuleId.get(capsuleId)));

        const ownerCapsuleFollowCounts = new Map<string, number>();
        followedCapsuleIds.forEach(capsuleId => addOwnerCount(ownerCapsuleFollowCounts, ownerByCapsuleId.get(capsuleId)));

        const lastSeenByKey = new Map<string, number>();
        const lastSeenByCapsule = new Map<string, number>();
        const ownerViewStats = new Map<string, { views: number; active: number; passive: number; watched: number }>();

        getSafeArray(recentImpressionsRes.data).forEach((row: any) => {
            const shownAt = getTime(row?.shown_at || row?.created_at);
            if (!shownAt) return;

            const key = row.feed_item_key || row.feed_event_id;
            if (key) lastSeenByKey.set(key, Math.max(lastSeenByKey.get(key) || 0, shownAt));
            if (row.capsule_id) lastSeenByCapsule.set(row.capsule_id, Math.max(lastSeenByCapsule.get(row.capsule_id) || 0, shownAt));

            const ownerId = ownerByCapsuleId.get(row.capsule_id) || getNestedCapsuleOwnerId(row);
            if (!ownerId) return;
            const stats = ownerViewStats.get(ownerId) || { views: 0, active: 0, passive: 0, watched: 0 };
            const watchedSeconds = Number(row.watched_seconds || 0);
            const isActive = !!row.clicked || !!row.opened || watchedSeconds >= 3;
            stats.views += 1;
            stats.watched += Math.max(0, watchedSeconds);
            if (isActive) stats.active += 1;
            else stats.passive += 1;
            ownerViewStats.set(ownerId, stats);
        });

        const membersByCapsule = new Map<string, any[]>();
        dedupedCapsules.forEach((capsule: any) => {
            if (capsule?.id && capsule.profiles) {
                membersByCapsule.set(capsule.id, [{ ...capsule.profiles, id: capsule.owner_id }]);
            }
        });
        (membersRes.data || []).forEach((member: any) => {
            if (!member?.capsule_id || !member?.profiles) return;
            const list = membersByCapsule.get(member.capsule_id) || [];
            if (!list.some((profile: any) => profile.id === member.user_id)) {
                list.push({ ...member.profiles, id: member.user_id });
            }
            membersByCapsule.set(member.capsule_id, list);
        });
        const likedIds = Array.from(userLikedCapsules);

        const scoreFeedActivity = (capsule: any, batch?: any) => {
            const media = batch?.items || mediaByCapsule.get(capsule.id) || [];
            const feedKey = batch
                ? `batch:${capsule.id}:${batch.batchKey}`
                : `capsule:${capsule.id}`;
            const exactSeenAt = lastSeenByKey.get(feedKey) || 0;
            const capsuleSeenAt = lastSeenByCapsule.get(capsule.id) || 0;
            const latestMediaAt = batch?.activityAt || getTime(media[0]?.created_at);
            const activityAt = Math.max(
                latestMediaAt,
                getTime(capsule.updated_at),
                getTime(capsule.created_at),
                getTime(capsule.opens_at)
            );
            const hasSeen = exactSeenAt > 0;
            const ageDays = getAgeDays(activityAt);
            const opensAt = getTime(capsule.opens_at);
            const hoursUntilOpen = opensAt > Date.now() ? (opensAt - Date.now()) / 3600000 : 9999;
            const likesCount = likesByCapsule.get(capsule.id) ?? Number(capsule.likes_count || 0);
            const commentsCount = commentsByCapsule.get(capsule.id) ?? Number(capsule.comments_count || 0);
            const followersCount = followersByCapsule.get(capsule.id) || 0;
            const ownerStats = ownerViewStats.get(capsule.owner_id) || { views: 0, active: 0, passive: 0, watched: 0 };
            const mutualCount = mutualByOwner.get(capsule.owner_id) || 0;
            const isFollowedAuthor = followingSetLocal.has(capsule.owner_id);
            const isFollowedCapsule = followedCapsuleSet.has(capsule.id);
            const isLiked = userLikedCapsules.has(capsule.id);
            const hasCommented = userCommentedCapsules.has(capsule.id);
            const isParticipant = participantSet.has(capsule.id);

            let score = stableLightBoost(`${shuffleSeed}:${feedSessionId.current}:${feedKey}`);

            if (capsule.owner_id === myId) score += activeTab === 'following' ? 35 : -120;
            if (isFollowedAuthor) score += activeTab === 'following' ? 75 : -20;
            if (isFollowedCapsule) score += activeTab === 'explore' && !isFollowedAuthor ? 130 : 110;
            if (isParticipant) score += 85;
            if (isLiked) score += activeTab === 'explore' && !isFollowedAuthor ? 82 : 54;
            if (hasCommented) score += 96;
            score += Math.min(72, (ownerLikeCounts.get(capsule.owner_id) || 0) * 16);
            score += Math.min(92, (ownerCommentCounts.get(capsule.owner_id) || 0) * 26);
            score += Math.min(90, (ownerCapsuleFollowCounts.get(capsule.owner_id) || 0) * 24);
            score += Math.min(70, ownerStats.views * 10);
            score += Math.min(86, ownerStats.active * 24);

            if (activeTab === 'explore') {
                if (mutualCount > 0) score += 74 + Math.min(42, mutualCount * 8);
                if (!isFollowedAuthor && (isFollowedCapsule || isLiked || hasCommented)) score += 48;
                if (capsule.is_public) score += 12;
            }

            if (capsule.status === 'opened') {
                score += media.length > 0 || capsule.cover_url ? 82 : 46;
            } else {
                score += 16;
                if (hoursUntilOpen <= 12) score += 88;
                else if (hoursUntilOpen <= 36) score += 58;
                else if (hoursUntilOpen <= 168) score += 28;
            }

            if (media.length > 0) score += Math.min(media.length * 7, 28);
            if (capsule.cover_url) score += 10;
            score += ageDays < 0.25 ? 82 : ageDays < 1 ? 60 : ageDays < 3 ? 35 : ageDays < 7 ? 18 : 5;
            score += Math.min(88, Math.log1p(likesCount) * 9 + Math.log1p(commentsCount) * 16 + Math.log1p(followersCount) * 12);

            if (followersCount <= 2 && likesCount <= 3) score += 18;
            if (isRefreshPage && !hasSeen) score += 46;
            if (hasSeen) score -= getRecentSeenPenalty(exactSeenAt, isRefreshPage);
            else if (batch && capsuleSeenAt > 0) score -= isRefreshPage ? 70 : 38;
            if (ownerStats.passive >= 6 && ownerStats.active === 0 && !isFollowedCapsule && !isLiked) score -= 52;

            const eventType = batch
                ? 'item_batch_added'
                : capsule.status === 'opened'
                    ? 'capsule_opened'
                    : hoursUntilOpen <= 168
                        ? 'opening_soon'
                        : 'capsule_created';

            const relationshipReason = isFollowedCapsule
                ? 'followed_capsule'
                : isLiked
                    ? 'liked_capsule'
                    : hasCommented
                        ? 'commented_capsule'
                        : mutualCount > 0
                            ? 'friend_of_friend'
                            : isFollowedAuthor
                                ? 'following_author'
                                : 'fresh_public';

            return {
                score,
                activityAt,
                hasSeen,
                lastSeenAt: exactSeenAt,
                seenPenalty: getRecentSeenPenalty(exactSeenAt, isRefreshPage),
                likesCount,
                commentsCount,
                followersCount,
                eventType,
                relationshipReason,
                isFollowedAuthor,
                isFollowedCapsule,
                isLiked,
                hasCommented,
                isParticipant,
                mutualCount,
                ownerStats,
                hasNewActivity: activityAt > Math.max(exactSeenAt, capsuleSeenAt),
            };
        };

        const feedActivities = dedupedCapsules.flatMap((capsule: any) => {
            const batches = mediaBatchesByCapsule.get(capsule.id) || [];
            if (batches.length > 0) {
                return batches.slice(0, 4).map((batch: any) => ({ capsule, batch }));
            }
            return [{ capsule, batch: null }];
        });

        const ranked = feedActivities
            .map(({ capsule, batch }: any) => {
                const media = batch?.items || mediaByCapsule.get(capsule.id) || [];
                const latestItem = media[0] || null;
                const scored = scoreFeedActivity(capsule, batch);
                const feedKey = batch
                    ? `batch:${capsule.id}:${batch.batchKey}`
                    : `capsule:${capsule.id}`;
                return {
                    ...capsule,
                    id: feedKey,
                    feed_item_key: feedKey,
                    feed_event_id: feedKey,
                    feed_type: batch ? 'item' : 'capsule',
                    event_type: scored.eventType,
                    upload_batch_key: batch?.batchKey || null,
                    capsule_id: capsule.id,
                    latest_item: latestItem ? {
                        ...latestItem,
                        caption: stripBatchMarker(latestItem.caption),
                        group_count: batch?.groupCount || media.length,
                    } : null,
                    collage_items: media,
                    shared_members: membersByCapsule.get(capsule.id) || [],
                    posts_count: batch?.groupCount || media.length,
                    likes_count: scored.likesCount,
                    comments_count: scored.commentsCount,
                    capsule_followers_count: scored.followersCount,
                    is_liked: scored.isLiked,
                    is_followed_author: scored.isFollowedAuthor,
                    is_followed_capsule: scored.isFollowedCapsule,
                    is_participant: scored.isParticipant,
                    has_commented: scored.hasCommented,
                    has_seen: scored.hasSeen,
                    has_new_activity: scored.hasNewActivity,
                    recent_seen_penalty: scored.seenPenalty,
                    relationship_reason: scored.relationshipReason,
                    is_friend_of_friend: scored.mutualCount > 0,
                    mutual_friend_count: scored.mutualCount,
                    viewer_author_views: scored.ownerStats.views,
                    viewer_author_opens: scored.ownerStats.active,
                    viewer_author_passive_views: scored.ownerStats.passive,
                    viewer_author_likes: ownerLikeCounts.get(capsule.owner_id) || 0,
                    viewer_author_comments: ownerCommentCounts.get(capsule.owner_id) || 0,
                    viewer_author_capsule_follows: ownerCapsuleFollowCounts.get(capsule.owner_id) || 0,
                    final_score: scored.score,
                    cursor_score: scored.score,
                    cursor_activity_date: new Date(scored.activityAt || Date.now()).toISOString(),
                    cursor_id: feedKey,
                };
            })
            .sort((a: any, b: any) => {
                if (b.final_score !== a.final_score) return b.final_score - a.final_score;
                return new Date(b.cursor_activity_date).getTime() - new Date(a.cursor_activity_date).getTime();
            });

        const pagedFeed = ranked.slice(0, PAGE_SIZE);

        const result = {
            feed: pagedFeed,
            stories: [],
            following_ids: followingIds,
            liked_ids: likedIds,
            blocked_ids: Array.from(blockedSet),
            participant_ids: participantIds,
            followed_capsule_ids: followedCapsuleIds,
        };

        if (!pageParam) refreshModeRef.current = 'initial_load';
        return result;
    };

    // ─── Fetch Function ──────────────────────────────────────────────────────
    const fetchFeed = async ({ pageParam = null }: { pageParam?: FeedCursor | null }) => {
        const myId = currentUserId || getAuthUserIdSnapshot() || getAuthSessionSnapshot()?.user?.id || null;
        if (myId && !currentUserId) setCurrentUserId(myId);

        if (!myId) {
            const fallbackBoot = cachedFeedKey === feedCacheKey ? cachedFeedData?.pages?.[0] : null;
            return fallbackBoot || getSafeEmptyFeed();
        }

        if (SIMPLE_FRONTEND_FEED) {
            if (!pageParam) {
                setFeedLoadTimedOut(false);
            }
            return fetchFeedSimpleFrontend(myId, pageParam);
        }

        const isInfiniteScroll = !!pageParam;
        const refreshMode = isInfiniteScroll ? 'infinite_scroll' : refreshModeRef.current;
        const params = {
            p_tab: activeTab,
            p_filter: activeFilter,
            p_limit: PAGE_SIZE,
            p_offset: 0,
            p_seed: shuffleSeed,
            p_refresh_mode: refreshMode,
            p_session_id: feedSessionId.current,
            p_cursor_score: pageParam?.score ?? null,
            p_cursor_activity_date: pageParam?.activityDate ?? null,
            p_cursor_id: pageParam?.id ?? null,
        };

        const callFeedRpcV1 = async () => {
            let rpcData: any = null;
            let rpcError: any = null;

            const result = await withTimeout(
                supabase.rpc('get_combined_feed_data', params),
                FEED_RPC_TIMEOUT_MS,
                'get_combined_feed_data'
            );
            rpcData = result.data;
            rpcError = result.error;

            if (rpcError?.message?.includes('p_refresh_mode') || rpcError?.message?.includes('p_session_id') || rpcError?.message?.includes('p_cursor_score')) {
                const { p_refresh_mode, p_session_id, p_cursor_score, p_cursor_activity_date, p_cursor_id, ...legacyParams } = params;
                legacyParams.p_offset = isInfiniteScroll ? (pageParam?.page ?? 1) * PAGE_SIZE : 0;
                const fallback = await withTimeout(
                    supabase.rpc('get_combined_feed_data', legacyParams),
                    FEED_RPC_TIMEOUT_MS,
                    'get_combined_feed_data legacy'
                );
                rpcData = fallback.data;
                rpcError = fallback.error;
            }

            if (rpcError?.message?.includes('p_seed')) {
                const { p_seed, p_refresh_mode, p_session_id, p_cursor_score, p_cursor_activity_date, p_cursor_id, ...legacyParams } = params;
                legacyParams.p_offset = isInfiniteScroll ? (pageParam?.page ?? 1) * PAGE_SIZE : 0;
                const fallback = await withTimeout(
                    supabase.rpc('get_combined_feed_data', legacyParams),
                    FEED_RPC_TIMEOUT_MS,
                    'get_combined_feed_data seed legacy'
                );
                rpcData = fallback.data;
                rpcError = fallback.error;
            }

            return { data: rpcData, error: rpcError };
        };

        let data: any = null;
        let error: any = null;
        let v2FailedWith: any = null;

        if (feedRpcPreferenceRef.current !== 'v1') {
            try {
                const result = await withTimeout(
                    supabase.rpc('get_combined_feed_data_v2', params),
                    Math.min(FEED_RPC_TIMEOUT_MS, 4200),
                    'get_combined_feed_data_v2'
                );
                data = result.data;
                error = result.error;

                const missingV2 =
                    typeof error?.message === 'string' &&
                    error.message.includes('get_combined_feed_data_v2') &&
                    (
                        error.message.includes('Could not find the function') ||
                        error.message.includes('does not exist') ||
                        error.message.includes('schema cache')
                    );

                if (!error) {
                    feedRpcPreferenceRef.current = 'v2';
                } else if (missingV2) {
                    feedRpcPreferenceRef.current = 'v1';
                } else {
                    v2FailedWith = error;
                }
            } catch (rpcError) {
                v2FailedWith = rpcError;
            }
        }

        if (!data || error) {
            try {
                const fallback = await callFeedRpcV1();
                data = fallback.data;
                error = fallback.error;
            } catch (rpcError) {
                console.warn('[Feed] Ranked RPC failed, using direct fallback', v2FailedWith || rpcError);
                if (myId) return fetchFeedFallback(myId);
                throw rpcError;
            }
        }
        if (!isInfiniteScroll) refreshModeRef.current = 'initial_load';

        if (error) {
            console.warn('[Feed] RPC returned error, using direct fallback', error, v2FailedWith);
            if (myId) return fetchFeedFallback(myId);
            throw error;
        }
        if (v2FailedWith && feedRpcPreferenceRef.current !== 'v1') {
            console.warn('[Feed] Falling back to legacy RPC for this request', v2FailedWith);
        }
        return data;
    };

    useEffect(() => {
        let alive = true;
        setCachedFeedData(null);
        setCachedFeedKey(null);
        AsyncStorage.getItem(feedCacheKey)
            .then(raw => {
                if (!alive || !raw) return;
                const parsed = JSON.parse(raw);
                if (Date.now() - (parsed.savedAt || 0) < FEED_CACHE_TTL) {
                    setCachedFeedData(parsed.data);
                    setCachedFeedKey(feedCacheKey);
                }
            })
            .catch(() => {});
        return () => { alive = false; };
    }, [feedCacheKey]);

    // ─── useInfiniteQuery ────────────────────────────────────────────────────
    const {
        data: queryData,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isRefetching,
        status,
        refetch,
    } = useInfiniteQuery({
        queryKey: ['feed', currentUserId || 'anon', activeTab, activeFilter, shuffleSeed],
        queryFn: fetchFeed,
        enabled: !!currentUserId,
        getNextPageParam: (lastPage, allPages) => {
            const feed = lastPage.feed || [];
            if (feed.length < PAGE_SIZE) return undefined;
            const last = feed[feed.length - 1];
            return {
                score: Number(last.cursor_score ?? last.final_score ?? 0),
                activityDate: last.cursor_activity_date ?? last.activity_date ?? last.created_at ?? new Date(0).toISOString(),
                id: last.cursor_id ?? last.feed_item_key ?? last.id,
                page: allPages.length,
            } satisfies FeedCursor;
        },
        initialPageParam: null,
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
    });

    const trackedImpressions = useRef<Set<string>>(new Set());
    const seenCapsuleIdsRef = useRef<Set<string>>(new Set());
    const impressionBufferRef = useRef<Map<string, { capsuleId: string | null; eventType: string; position: number | null }>>(new Map());

    const rawCapsules = useMemo(() => {
        const pages = queryData?.pages || (cachedFeedKey === feedCacheKey ? cachedFeedData?.pages : null);
        if (!pages) return [];
        return pages.flatMap((page: any) => page.feed || []);
    }, [queryData, cachedFeedData, cachedFeedKey, feedCacheKey]);

    const capsules = useMemo(() => {
        return rankAndDiversifyFeed(rawCapsules, {
            tab: activeTab,
            followingOwnerIds: followingSet,
            participantCapsuleIds: participantCapsules,
            followedCapsuleIds: followedCapsules,
            likedCapsuleIds: likedCapsules,
            sessionSeenKeys: trackedImpressions.current,
            sessionSeenCapsuleIds: seenCapsuleIdsRef.current,
        });
    }, [rawCapsules, activeTab, followingSet, participantCapsules, followedCapsules, likedCapsules]);

    useEffect(() => {
        if (!queryData?.pages?.[0]) return;
        AsyncStorage.setItem(feedCacheKey, JSON.stringify({
            savedAt: Date.now(),
            data: { pages: [queryData.pages[0]] },
        })).catch(() => {});
    }, [queryData, feedCacheKey]);

    // Update auxiliary states when data changes
    useEffect(() => {
        const firstPage = queryData?.pages?.[0] || (cachedFeedKey === feedCacheKey ? cachedFeedData?.pages?.[0] : null);
        if (firstPage) {
            const { stories: storiesData, following_ids, liked_ids, blocked_ids, participant_ids, followed_capsule_ids } = firstPage;
            
            setBlockedUserIds(blocked_ids || []);
            setFollowingSet(new Set(following_ids || []));
            setLikedCapsules(new Set(liked_ids || []));
            setParticipantCapsules(new Set(participant_ids || []));
            setFollowedCapsules(new Set(followed_capsule_ids || []));

            if (FLASHES_ENABLED && currentUserId) {
                processStoriesData(storiesData || [], currentUserId, blocked_ids || []);
            } else {
                setStories([]);
                setMyStory(null);
            }
        }
    }, [queryData, cachedFeedData, cachedFeedKey, feedCacheKey, currentUserId]);

    const hasBootData = rawCapsules.length > 0;
    const isLoading = status === 'pending' && !hasBootData;
    const isRefreshing = isPullRefreshing || (isRefetching && !isFetchingNextPage && hasBootData);
    const isError = status === 'error';

    useEffect(() => {
        if (!isLoading) {
            setFeedLoadTimedOut(false);
            return;
        }
        const timer = setTimeout(() => setFeedLoadTimedOut(true), 9000);
        return () => clearTimeout(timer);
    }, [isLoading]);

    const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: any[] }) => {
        if (!currentUserId) return;
        viewableItems
            .filter(v => v.isViewable && v.item?.id && !trackedImpressions.current.has(v.item.id))
            .forEach(v => {
                trackedImpressions.current.add(v.item.id);
                const capsuleId = v.item.capsule_id || v.item.id || null;
                if (capsuleId) {
                    seenCapsuleIdsRef.current.add(capsuleId);
                }
                impressionBufferRef.current.set(v.item.id, {
                    capsuleId,
                    eventType: v.item.event_type || v.item.feed_type || 'unknown',
                    position: typeof v.index === 'number' ? v.index : null,
                });
            });
    }, [currentUserId, activeTab]);

    const pulseAnim = useRef(new Animated.Value(1)).current;
    const headerOpacity = useRef(new Animated.Value(0)).current;
    const headerSlide = useRef(new Animated.Value(-10)).current;
    const logoScale = useRef(new Animated.Value(0.88)).current;
    const refreshPulse = useRef(new Animated.Value(0)).current;
    const refreshSpin = useRef(new Animated.Value(0)).current;
    const refreshShimmer = useRef(new Animated.Value(0)).current;
    const isFirstMount = useRef(true);
    const feedRequestId = useRef(0);

    const flatListRef = useRef<any>(null);
    const impressionFlushRef = useRef<NodeJS.Timeout | null>(null);
    const storiesScrollRef = useRef<ScrollView>(null);
    const filterScrollRef = useRef<ScrollView>(null);
    const pinTopAfterRefreshRef = useRef(false);

    const keyExtractor = useCallback((item: any) => item.feed_item_key || item.feed_event_id || item.id, []);

    const pinFeedToTop = useCallback((animated = false) => {
        flatListRef.current?.scrollToOffset?.({ offset: 0, animated });
        requestAnimationFrame(() => {
            flatListRef.current?.scrollToOffset?.({ offset: 0, animated: false });
        });
    }, []);

    useWebDragScroll(flatListRef);
    useWebDragScroll(storiesScrollRef);
    useWebDragScroll(filterScrollRef);

    useEffect(() => {
        if (!isRefreshing) {
            refreshPulse.setValue(0);
            refreshSpin.setValue(0);
            refreshShimmer.setValue(0);
            return;
        }

        refreshPulse.setValue(0);
        refreshSpin.setValue(0);
        refreshShimmer.setValue(0);

        const intro = Animated.timing(refreshPulse, {
            toValue: 1,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        });
        const spinLoop = Animated.loop(
            Animated.timing(refreshSpin, {
                toValue: 1,
                duration: 900,
                easing: Easing.linear,
                useNativeDriver: true,
            })
        );
        const shimmerLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(refreshShimmer, {
                    toValue: 1,
                    duration: 1050,
                    easing: Easing.inOut(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.timing(refreshShimmer, {
                    toValue: 0,
                    duration: 0,
                    useNativeDriver: true,
                }),
            ])
        );

        intro.start();
        spinLoop.start();
        shimmerLoop.start();

        return () => {
            spinLoop.stop();
            shimmerLoop.stop();
        };
    }, [isRefreshing, refreshPulse, refreshSpin, refreshShimmer]);

    // ─── ATT ──────────────────────────────────────────────────────────────────
    useEffect(() => {
        const checkATT = async () => {
            if (Platform.OS !== 'ios') return;
            await new Promise(resolve => setTimeout(resolve, 2000));
            const alreadyAsked = await AsyncStorage.getItem('att_asked');
            if (alreadyAsked) return;
            const { status } = await getTrackingPermissionsAsync();
            if (status === 'undetermined') setShowATTModal(true);
        };
        checkATT();
    }, []);

    const handleATTContinue = async () => {
        setShowATTModal(false);
        await requestTrackingPermissionsAsync();
        await AsyncStorage.setItem('att_asked', 'true');
    };

    // ─── Connectivity ─────────────────────────────────────────────────────────
    useEffect(() => {
        let checkInterval: NodeJS.Timeout;
        let appStateSub: any;

        const checkConnectivity = async () => {
            if (Platform.OS === 'web') return;
            if (AppState.currentState !== 'active') return;
            
            try {
                const { error } = await supabase.from('profiles').select('id').limit(1);
                const isOnline = !error;
                setIsOffline(!isOnline);
                onlineManager.setOnline(isOnline);
            } catch (e) {
                setIsOffline(true);
                onlineManager.setOnline(false);
            }
        };

        if (Platform.OS === 'web') {
            const handleOnline = () => { setIsOffline(false); onlineManager.setOnline(true); };
            const handleOffline = () => { setIsOffline(true); onlineManager.setOnline(false); };
            window.addEventListener('online', handleOnline);
            window.addEventListener('offline', handleOffline);
            setIsOffline(!navigator.onLine);
            onlineManager.setOnline(navigator.onLine);
            return () => {
                window.removeEventListener('online', handleOnline);
                window.removeEventListener('offline', handleOffline);
            };
        } else {
            appStateSub = AppState.addEventListener('change', (nextState) => {
                if (nextState === 'active') {
                    // Small delay after wake up to let system re-connect
                    setTimeout(checkConnectivity, 1500);
                }
            });
            const firstCheck = setTimeout(checkConnectivity, 2500);
            checkInterval = setInterval(checkConnectivity, 20000);
            return () => {
                clearTimeout(firstCheck);
                clearInterval(checkInterval);
                appStateSub.remove();
            };
        }
    }, []);

    // ─── Entrance animations ──────────────────────────────────────────────────
    useEffect(() => {
        Animated.parallel([
            Animated.timing(headerOpacity, {
                toValue: 1,
                duration: 420,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.timing(headerSlide, {
                toValue: 0,
                duration: 420,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.spring(logoScale, {
                toValue: 1,
                useNativeDriver: true,
                tension: 72,
                friction: 9,
            }),
        ]).start();
    }, []);

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.22, duration: 750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            ])
        ).start();
    }, []);

    useEffect(() => {
        const unsubScroll = feedScrollBus.subscribeScroll(() => {
            flatListRef.current?.scrollToOffset?.({ offset: 0, animated: true });
            storiesScrollRef.current?.scrollTo?.({ x: 0, y: 0, animated: true });
            filterScrollRef.current?.scrollTo?.({ x: 0, y: 0, animated: true });
        });
        const unsubRefresh = feedScrollBus.subscribeRefresh(() => {
            setActiveTab('following');
            queryClient.invalidateQueries({ queryKey: ['feed'] });
        });
        return () => { unsubScroll(); unsubRefresh(); };
    }, [queryClient]);

    // ─── Impression flush ─────────────────────────────────────────────────────
    useEffect(() => {
        if (DISABLE_FEED_IMPRESSIONS_UNTIL_STABLE) return;
        const flushImpressions = async () => {
            if (!currentUserId || impressionBufferRef.current.size === 0) return;
            const entries = Array.from(impressionBufferRef.current.entries());
            impressionBufferRef.current.clear();
            try {
                await supabase.rpc('record_feed_impressions', {
                    p_user_id: currentUserId,
                    p_feed_event_ids: entries.map(([eventId]) => eventId),
                    p_capsule_ids: entries.map(([, meta]) => meta.capsuleId),
                    p_event_types: entries.map(([, meta]) => meta.eventType),
                    p_feed_type: activeTab,
                    p_session_id: feedSessionId.current,
                    p_positions: entries.map(([, meta]) => meta.position),
                });
            } catch (e) { /* best-effort */ }
        };
        impressionFlushRef.current = setInterval(flushImpressions, IMPRESSION_FLUSH_MS) as any;
        return () => {
            if (impressionFlushRef.current) clearInterval(impressionFlushRef.current);
            flushImpressions();
        };
    }, [currentUserId]);

    // ─── Capsule real-time sync ───────────────────────────────────────────────
    useEffect(() => {
        if (SUPABASE_RELIEF_MODE) return;
        const subDel = DeviceEventEmitter.addListener('capsule_deleted', () => refetch());
        const subNew = DeviceEventEmitter.addListener('capsule_created', () => refetch());
        return () => { subDel.remove(); subNew.remove(); };
    }, [refetch]);

    // SWR: refetch when screen regains focus (max once per 30s)
    const lastFocusFetchRef = useRef(0);
    useEffect(() => {
        if (SUPABASE_RELIEF_MODE) return;
        if (!isFocused) return;
        const now = Date.now();
        if (now - lastFocusFetchRef.current > 30_000) {
            lastFocusFetchRef.current = now;
            refetch();
        }
    }, [isFocused, refetch]);

    // ─── Stories ──────────────────────────────────────────────────────────────
    const processStoriesData = (data: any[], currentId: string, blocked: string[]) => {
        const usersWithStories: any[] = [];
        data.forEach((s: any) => {
            if (blocked.includes(s.owner_id)) return;
            let group = usersWithStories.find(u => u.owner_id === s.owner_id);
            if (!group) {
                group = { ...s.profiles, owner_id: s.owner_id, stories: [] };
                usersWithStories.push(group);
            }
            group.stories.push(s);
        });

        const processed = usersWithStories
            .map(u => ({ ...u, all_read: u.stories.every((s: any) => s.is_read) }))
            .sort((a, b) => {
                if (a.owner_id === currentId) return -1;
                if (b.owner_id === currentId) return 1;
                if (a.all_read !== b.all_read) return a.all_read ? 1 : -1;
                return 0;
            });

        setStories(processed);
        setMyStory(processed.find(u => u.owner_id === currentId) || null);
    };

    const markStoryRead = useCallback(async (storyId: string) => {
        if (!currentUserId) return;
        await supabase.from('story_reads').upsert(
            { user_id: currentUserId, story_id: storyId },
            { onConflict: 'user_id,story_id' }
        );
        // Optimistic local update
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

    // ─── Handlers ─────────────────────────────────────────────────────────────
    useEffect(() => {
        const init = async () => {
            if (!currentUserId) return;
            const followsResult = await withTimeout(
                supabase.from('follows')
                    .select('*', { count: 'exact', head: true })
                    .eq('follower_id', currentUserId),
                1500,
                'feed init follows count'
            ).catch(() => null);
            const count = followsResult?.count;
            setActiveTab(count && count > 0 ? 'following' : 'explore');
        };
        init();
    }, [currentUserId]);

    // ─── Realtime updates ─────────────────────────────────────────────────────
    useEffect(() => {
        const sub = DeviceEventEmitter.addListener('CAPSULE_UPDATED', (payload: any) => {
            if (payload.id) {
                // Invalidate query to refetch fresh data
                queryClient.invalidateQueries({ queryKey: ['feed'] });
                
                // 2. Local fallback update for immediate UI response
                if (payload.is_liked !== undefined) {
                    setLikedCapsules(prev => {
                        const n = new Set(prev);
                        if (payload.is_liked) n.add(payload.id);
                        else n.delete(payload.id);
                        return n;
                    });
                }
            }
        });
        return () => sub.remove();
    }, [queryClient]);

    useEffect(() => {
        if (SUPABASE_RELIEF_MODE) {
            setHasUnread(false);
            return;
        }
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
                } catch (e) { }
            }

            const convIds = myConvs.map(c => c.conversation_id);
            if (!convIds.length) { setHasUnread(false); return; }

            const [convsRes, lastMsgsRes] = await Promise.all([
                supabase.from('conversations').select('id, last_message_at').in('id', convIds),
                supabase.from('messages').select('conversation_id, created_at, sender_id, is_read')
                    .in('conversation_id', convIds).order('created_at', { ascending: false }),
            ]);

            if (!lastMsgsRes.data?.length) { setHasUnread(false); return; }

            const latestMsgMap: Record<string, any> = {};
            (lastMsgsRes.data || []).forEach(m => { if (!latestMsgMap[m.conversation_id]) latestMsgMap[m.conversation_id] = m; });
            const convsMap: Record<string, any> = {};
            (convsRes.data || []).forEach(c => convsMap[c.id] = c);

            let foundUnread = false;
            for (const cId of convIds) {
                const lastMsg = latestMsgMap[cId];
                const lastMsgAt = convsMap[cId]?.last_message_at;
                const delTime = deletedStamps[cId];
                if (delTime && (!lastMsgAt || new Date(lastMsgAt).getTime() <= new Date(delTime).getTime())) continue;
                if (lastMsg && lastMsg.sender_id !== user.id && !lastMsg.is_read) {
                    foundUnread = true;
                    break;
                }
            }
            setHasUnread(foundUnread);
        };
        const unreadTask = InteractionManager.runAfterInteractions(checkUnread);
        const ch = supabase.channel('chat_updates')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, checkUnread)
            .subscribe();
        return () => {
            unreadTask.cancel?.();
            supabase.removeChannel(ch);
        };
    }, [isFocused]);

    const flushImpressionsNow = useCallback(async () => {
        if (DISABLE_FEED_IMPRESSIONS_UNTIL_STABLE) return;
        if (!currentUserId || impressionBufferRef.current.size === 0) return;
        const entries = Array.from(impressionBufferRef.current.entries());
        impressionBufferRef.current.clear();
        try {
            await supabase.rpc('record_feed_impressions', {
                p_user_id: currentUserId,
                p_feed_event_ids: entries.map(([eventId]) => eventId),
                p_capsule_ids: entries.map(([, meta]) => meta.capsuleId),
                p_event_types: entries.map(([, meta]) => meta.eventType),
                p_feed_type: activeTab,
                p_session_id: feedSessionId.current,
                p_positions: entries.map(([, meta]) => meta.position),
            });
        } catch (e) { /* silent fail */ }
    }, [currentUserId, activeTab]);

    const recordFeedOpen = useCallback((item: any) => {
        if (DISABLE_FEED_IMPRESSIONS_UNTIL_STABLE) return;
        if (!currentUserId || !item?.id) return;
        impressionBufferRef.current.delete(item.id);
        (async () => {
            try {
                await supabase.rpc('record_feed_click', {
                    p_user_id: currentUserId,
                    p_capsule_id: item.capsule_id || item.id,
                    p_feed_event_id: item.id,
                });
            } catch {
                impressionBufferRef.current.set(item.id, {
                    capsuleId: item.capsule_id || null,
                    eventType: item.event_type || item.feed_type || 'unknown',
                    position: null,
                });
            }
        })();
    }, [currentUserId]);

    const onRefresh = useCallback(async () => {
        setIsPullRefreshing(true);
        setFeedLoadTimedOut(false);
        pinTopAfterRefreshRef.current = true;
        pinFeedToTop(false);
        refreshModeRef.current = 'pull_to_refresh';
        try {
            await flushImpressionsNow();
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['feed'] }),
                new Promise(resolve => setTimeout(resolve, 850)),
            ]);
        } finally {
            setIsPullRefreshing(false);
        }
    }, [queryClient, flushImpressionsNow, pinFeedToTop]);

    useEffect(() => {
        if (!pinTopAfterRefreshRef.current || !queryData?.pages?.[0]) return;
        pinTopAfterRefreshRef.current = false;
        pinFeedToTop(false);
    }, [queryData, pinFeedToTop]);

    const handleLoadMore = useCallback(() => {
        if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
        }
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    const handleTabChange = useCallback((tab: FeedTab) => {
        if (tab === activeTab) return;
        setActiveTab(tab);
    }, [activeTab]);

    const handleFilterChange = useCallback((filter: FilterType) => {
        if (filter === activeFilter) return;
        setActiveFilter(filter);
    }, [activeFilter]);

    const handleGlobalFollow = useCallback(async (ownerId: string, isFollowed: boolean) => {
        if (!currentUserId) return;
        if (isFollowed) {
            await supabase.from('follows').delete().eq('follower_id', currentUserId).eq('following_id', ownerId);
            setFollowingSet(prev => { const n = new Set(prev); n.delete(ownerId); return n; });
        } else {
            await supabase.from('follows').insert({ follower_id: currentUserId, following_id: ownerId });
            setFollowingSet(prev => { const n = new Set(prev); n.add(ownerId); return n; });
            const { data: existing } = await supabase.from('notifications')
                .select('id').eq('user_id', ownerId).eq('sender_id', currentUserId).eq('type', 'follow').maybeSingle();
            if (existing) {
                await supabase.from('notifications').update({ created_at: new Date().toISOString(), is_read: false }).eq('id', existing.id);
            } else {
                await supabase.from('notifications').insert({ user_id: ownerId, sender_id: currentUserId, type: 'follow', message: 'started following you' });
            }
        }
    }, [currentUserId]);

    // ─── Mutations ───────────────────────────────────────────────────────────
    const likeMutation = useMutation({
        mutationFn: async ({ activityId, wasLiked }: { activityId: string, wasLiked: boolean }) => {
            if (!currentUserId) return;
            const activity = capsules.find((c: any) => c.id === activityId);
            const targetCapsuleId = activity?.capsule_id || activityId;
            
            if (wasLiked) {
                const { error } = await supabase.from('likes').delete().eq('capsule_id', targetCapsuleId).eq('user_id', currentUserId);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('likes').insert({ capsule_id: targetCapsuleId, user_id: currentUserId });
                if (error && error.code !== '23505') throw error;
                
                // Track notification
                if (activity && activity.owner_id !== currentUserId) {
                    const { data: existing } = await supabase.from('notifications')
                        .select('id').eq('user_id', activity.owner_id).eq('sender_id', currentUserId).eq('type', 'like').eq('capsule_id', targetCapsuleId).maybeSingle();
                    
                    if (existing) {
                        await supabase.from('notifications').update({ created_at: new Date().toISOString(), is_read: false }).eq('id', existing.id);
                    } else {
                        await supabase.from('notifications').insert({ user_id: activity.owner_id, sender_id: currentUserId, type: 'like', capsule_id: targetCapsuleId, message: 'liked your capsule' });
                    }
                }
            }
        },
        onMutate: async ({ activityId, wasLiked }) => {
            await queryClient.cancelQueries({ queryKey: ['feed'] });
            const previousFeeds = queryClient.getQueriesData({ queryKey: ['feed'] });
            const previousLiked = likedCapsules;

            queryClient.setQueriesData({ queryKey: ['feed'] }, (old: any) => {
                if (!old) return old;
                return {
                    ...old,
                    pages: old.pages.map((page: any) => ({
                        ...page,
                        feed: page.feed.map((item: any) => {
                            const targetCapsuleId = item.capsule_id || item.id;
                            if (item.id === activityId || item.feed_item_key === activityId || targetCapsuleId === activityId) {
                                return {
                                    ...item,
                                    is_liked: !wasLiked,
                                    likes_count: (item.likes_count || 0) + (wasLiked ? -1 : 1)
                                };
                            }
                            return item;
                        })
                    }))
                };
            });

            setLikedCapsules(prev => {
                const activity = capsules.find((c: any) => c.id === activityId || c.feed_item_key === activityId || c.capsule_id === activityId);
                const targetCapsuleId = activity?.capsule_id || activityId;
                const next = new Set(prev);
                if (wasLiked) next.delete(targetCapsuleId);
                else next.add(targetCapsuleId);
                return next;
            });

            return { previousFeeds, previousLiked };
        },
        onSuccess: (_data, { activityId, wasLiked }) => {
            const activity = capsules.find((c: any) => c.id === activityId || c.feed_item_key === activityId || c.capsule_id === activityId);
            const targetCapsuleId = activity?.capsule_id || activityId;
            setLikedCapsules(prev => {
                const next = new Set(prev);
                if (wasLiked) next.delete(targetCapsuleId);
                else next.add(targetCapsuleId);
                return next;
            });
        },
        onError: (err, variables, context) => {
            if (context?.previousFeeds) {
                context.previousFeeds.forEach(([queryKey, data]: any) => {
                    queryClient.setQueryData(queryKey, data);
                });
            }
            if (context?.previousLiked) {
                setLikedCapsules(context.previousLiked);
            }
            Alert.alert('Error', 'Could not update like. Please try again.');
        }
    });

    const handleGlobalLike = useCallback((activityId: string, is_liked: boolean) => {
        likeMutation.mutate({ activityId, wasLiked: is_liked });
    }, [likeMutation]);


    // ─── renderItem ────────────────────────────────────────────────────────────
    const renderItem = useCallback(({ item }: { item: any }) => {
        if (item.feed_type === 'birthday') {
            const birthdayProfile = item.profiles || item;
            return (
                <TouchableOpacity
                    activeOpacity={0.9}
                    style={s.birthdayPost}
                    onPress={() => navigation.navigate('UserProfile', { targetUserId: item.owner_id })}
                >
                    <LinearGradient colors={['#FFF1F8', '#F5F3FF', '#ECFEFF']} style={StyleSheet.absoluteFill} />
                    <View style={s.birthdayPostAvatarWrap}>
                        <Image source={{ uri: Colors.getAvatarUrl(birthdayProfile.avatar_url, birthdayProfile.display_name || birthdayProfile.username, birthdayProfile.favorite_color) }} style={s.birthdayPostAvatar} contentFit="cover" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={s.birthdayPostTitle}>Hoy es el cumple de {birthdayProfile.display_name || birthdayProfile.username}</Text>
                        <Text style={s.birthdayPostSub}>Pásate por su perfil y déjale un regalo.</Text>
                    </View>
                    <Text style={s.birthdayPostEmoji}>{'\uD83C\uDF82'}</Text>
                </TouchableOpacity>
            );
        }
        const isFollowed = followingSet.has(item.owner_id);
        const isLiked = !!item.is_liked || likedCapsules.has(item.id) || likedCapsules.has(item.feed_item_key) || likedCapsules.has(item.capsule_id);
        const hasAccess = item.is_public
            || item.owner_id === currentUserId
            || participantCapsules.has(item.id)
            || followedCapsules.has(item.id)
            || (item.capsule_id && (participantCapsules.has(item.capsule_id) || followedCapsules.has(item.capsule_id)));

        return (
            <CapsuleCard
                capsule={item}
                userId={currentUserId}
                isFollowed={isFollowed}
                isLiked={isLiked}
                likeCount={item.likes_count || 0}
                commentCount={item.comments_count || 0}
                postsCount={item.posts_count || 0}
                isLocked={!hasAccess}
                onFollow={handleGlobalFollow}
                onLike={handleGlobalLike}
                onOpen={recordFeedOpen}
                lightweight
                hideParticles
            />
        );
    }, [currentUserId, followingSet, likedCapsules, participantCapsules, followedCapsules, handleGlobalFollow, handleGlobalLike, recordFeedOpen, navigation]);

    // ─── List Header ───────────────────────────────────────────────────────────
    const ListHeader = useMemo(() => (
        <>
            {/* Filter chips */}
            <ScrollView
                ref={filterScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={s.filterBar}
                contentContainerStyle={s.filterBarContent}
            >
                {FILTER_KEYS.map(key => {
                    const meta = FILTER_META[key as FilterType];
                    return (
                        <FilterChip
                            key={key}
                            filterKey={key}
                            isActive={activeFilter === key}
                            onPress={(k) => handleFilterChange(k as FilterType)}
                            t={t}
                            icon={meta.icon}
                            label={meta.label(t)}
                            iconColor={meta.iconColor}
                        />
                    );
                })}
            </ScrollView>

            {/* Feed section label */}
            <View style={s.feedLabelRow}>
                <View style={s.feedLabelDot} />
                <Text style={s.feedLabelText}>
                    {activeFilter === 'all' ? t('feed.all') : activeFilter === 'open' ? 'Open Capsules' : 'Closed Capsules'}
                </Text>
            </View>
        </>
    ), [activeFilter, handleFilterChange]);

    // ─── Header component ──────────────────────────────────────────────────────
    const headerPaddingTop = insets.top + 8;
    const refreshSpinRotate = refreshSpin.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });
    const refreshCueScale = refreshPulse.interpolate({
        inputRange: [0, 1],
        outputRange: [0.92, 1],
    });
    const refreshCueOpacity = refreshPulse.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
    });
    const refreshShimmerX = refreshShimmer.interpolate({
        inputRange: [0, 1],
        outputRange: [-120, 140],
    });

    return (
        <View style={s.root}>
            <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
            
            {isOffline && (
                <View 
                    style={[s.offlineBanner, { paddingTop: insets.top + 5 }]}
                >
                    <Ionicons name="cloud-offline-outline" size={14} color="#fff" />
                    <Text style={s.offlineText}>No internet connection. Some content may not load.</Text>
                </View>
            )}

            {/* ── Header ── */}
            {isRefreshing && (
                <Animated.View
                    pointerEvents="none"
                    style={[
                        s.refreshCue,
                        {
                            top: headerPaddingTop + 104,
                            opacity: refreshCueOpacity,
                            transform: [{ scale: refreshCueScale }],
                        },
                    ]}
                >
                    <LinearGradient
                        colors={[Colors.primary, '#10B981']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={s.refreshCueGradient}
                    >
                        <Animated.View style={[s.refreshIconRing, { transform: [{ rotate: refreshSpinRotate }] }]}>
                            <Ionicons name="sparkles" size={15} color="#fff" />
                        </Animated.View>
                        <Text style={s.refreshCueText}>Actualizando feed</Text>
                        <Animated.View
                            style={[
                                s.refreshShimmer,
                                { transform: [{ translateX: refreshShimmerX }, { rotate: '18deg' }] },
                            ]}
                        />
                    </LinearGradient>
                </Animated.View>
            )}

            <Animated.View
                style={[
                    s.header,
                    { paddingTop: headerPaddingTop },
                    { opacity: headerOpacity, transform: [{ translateY: headerSlide }] },
                ]}
            >
                {Platform.OS === 'ios' ? (
                    <BlurView intensity={90} tint="light" style={StyleSheet.absoluteFill} />
                ) : (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.94)' }]} />
                )}

                {/* Logo row */}
                <View style={s.headerRow}>
                    <Animated.View style={[s.logoRow, { transform: [{ scale: logoScale }] }]}>
                        <Image
                            source={{ uri: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/website/Logomain.png' }}
                            style={s.logoImg}
                            contentFit="contain"
                            cachePolicy="memory-disk"
                        />
                        <View style={s.logoTextWrap}>
                            <Text style={s.logoText}>kapsely</Text>
                            <Text style={s.logoTagline}>Memories Forever</Text>
                        </View>
                    </Animated.View>

                    <View style={s.headerActions}>
                        <TouchableOpacity
                            style={s.actionBtn}
                            activeOpacity={0.72}
                            onPress={() => navigation.navigate('ChatList')}
                        >
                            <Ionicons
                                name="paper-plane-outline"
                                size={24}
                                color={Colors.textPrimary}
                            />
                            {hasUnread && (
                                <Animated.View style={[s.unreadDot, { transform: [{ scale: pulseAnim }] }]} />
                            )}
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Tab pill switcher */}
                <TabPill activeTab={activeTab} onTabChange={handleTabChange} t={t} />
            </Animated.View>

            {/* ── Feed List ── */}
            <AnyFlashList
                estimatedItemSize={450}
                key={`feed-${activeTab}`}
                ref={flatListRef}
                data={isLoading ? [] : capsules}
                keyExtractor={keyExtractor}
                numColumns={1}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + 96 }]}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={onRefresh}
                        tintColor={Colors.primary}
                        colors={[Colors.primary, '#10B981']}
                        progressBackgroundColor={Colors.surface}
                        title="Actualizando feed"
                        titleColor={Colors.textMuted}
                    />
                }
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.2}
                ListHeaderComponent={ListHeader}
                renderItem={renderItem}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={{ itemVisiblePercentThreshold: 50, minimumViewTime: 800 }}
                extraData={[likedCapsules, followingSet, participantCapsules, followedCapsules, currentUserId]}
                drawDistance={height}
                ListFooterComponent={() =>
                    isFetchingNextPage ? (
                        <View style={s.loadMoreWrap}>
                            <ActivityIndicator color={Colors.primary} size="small" />
                        </View>
                    ) : null
                }
                ListEmptyComponent={() =>
                    isLoading && !feedLoadTimedOut ? (
                        <FeedSkeleton />
                    ) : feedLoadTimedOut ? (
                        <View style={s.emptyState}>
                            <LinearGradient
                                colors={[Colors.error + '14', Colors.error + '06']}
                                style={s.emptyIconWrap}
                            >
                                <Ionicons name="cloud-offline-outline" size={38} color={Colors.error} />
                            </LinearGradient>
                            <Text style={s.emptyTitle}>No se pudo cargar el feed</Text>
                            <Text style={s.emptySub}>La app ha dejado de esperar para que no se quede bloqueada. Vamos a reintentarlo.</Text>
                            <TouchableOpacity
                                activeOpacity={0.85}
                                onPress={() => {
                                    setFeedLoadTimedOut(false);
                                    refreshModeRef.current = 'initial_load';
                                    queryClient.invalidateQueries({ queryKey: ['feed'] });
                                }}
                                style={s.emptyBtn}
                            >
                                <LinearGradient
                                    colors={[Colors.primary, Colors.primaryDark]}
                                    style={s.emptyBtnGrad}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                >
                                    <Ionicons name="refresh" size={16} color="#fff" />
                                    <Text style={s.emptyBtnText}>Reintentar</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={s.emptyState}>
                            <LinearGradient
                                colors={[Colors.primary + '18', Colors.primary + '06']}
                                style={s.emptyIconWrap}
                            >
                                <Ionicons name="time-outline" size={38} color={Colors.primary} />
                            </LinearGradient>
                            <Text style={s.emptyTitle}>{t('feed.nothing_here')}</Text>
                            <Text style={s.emptySub}>{t('feed.nothing_here_sub')}</Text>
                            <TouchableOpacity
                                activeOpacity={0.85}
                                onPress={() => handleTabChange('explore')}
                                style={s.emptyBtn}
                            >
                                <LinearGradient
                                    colors={[Colors.primary, Colors.primaryDark]}
                                    style={s.emptyBtnGrad}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                >
                                    <Ionicons name="compass-outline" size={16} color="#fff" />
                                    <Text style={s.emptyBtnText}>{t('feed.explore_capsules')}</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    )
                }
            />

            {/* ── Modals & Overlays ── */}
            <InteractiveTour
                step={tutorialStep}
                onAction={(action: string) => { if (action === 'START') setTutorialStep('PRESS_PLUS'); }}
                onDismiss={async () => {
                    await AsyncStorage.setItem('hasSeenTutorialV2', 'true');
                    setTutorialStep('FINISHED');
                }}
            />

            {/* ATT Modal */}
            <Modal visible={showATTModal} transparent animationType="fade">
                <View style={attStyles.overlay}>
                    <View style={attStyles.sheet}>
                        <LinearGradient
                            colors={[Colors.primary + '20', Colors.primary + '08']}
                            style={attStyles.iconRing}
                        >
                            <Ionicons name="shield-checkmark-outline" size={30} color={Colors.primary} />
                        </LinearGradient>
                        <Text style={attStyles.title}>Privacy Matters</Text>
                        <Text style={attStyles.desc}>
                            We use your data to show relevant content and improve the app experience. Your choices help us keep Kapsely free and personalized.
                        </Text>
                        <TouchableOpacity style={attStyles.btn} activeOpacity={0.8} onPress={handleATTContinue}>
                            <LinearGradient
                                colors={[Colors.primary, Colors.primaryDark]}
                                style={attStyles.btnGrad}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                            >
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
    root: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    refreshCue: {
        position: 'absolute',
        alignSelf: 'center',
        zIndex: 30,
        borderRadius: 24,
        overflow: 'hidden',
        ...Platform.select({
            ios: {
                shadowColor: Colors.primary,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.22,
                shadowRadius: 14,
            },
            android: { elevation: 8 },
            web: { boxShadow: '0px 10px 24px rgba(0,0,0,0.16)' },
        }),
    },
    refreshCueGradient: {
        minWidth: 188,
        height: 42,
        borderRadius: 24,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        overflow: 'hidden',
    },
    refreshIconRing: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.5)',
        backgroundColor: 'rgba(255,255,255,0.16)',
    },
    refreshCueText: {
        color: '#fff',
        fontSize: 12,
        fontFamily: Fonts.bold,
        letterSpacing: 0.2,
    },
    refreshShimmer: {
        position: 'absolute',
        top: -8,
        bottom: -8,
        width: 34,
        backgroundColor: 'rgba(255,255,255,0.22)',
    },

    // ── Header ──
    header: {
        backgroundColor: 'transparent',
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
        overflow: 'hidden',
        zIndex: 10,
        // Subtle bottom shadow
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.06,
                shadowRadius: 8,
            },
            android: { elevation: 4 },
        }),
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 18,
        paddingVertical: 10,
    },

    // ── Logo ──
    logoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    logoImg: {
        width: 44,
        height: 44,
    },
    logoTextWrap: {
        gap: 1,
    },
    logoText: {
        fontSize: 22,
        fontFamily: Fonts.bold,
        color: Colors.textPrimary,
        letterSpacing: -0.7,
        lineHeight: 24,
    },
    logoTagline: {
        fontSize: 10,
        fontFamily: Fonts.medium,
        color: Colors.primary,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        opacity: 0.8,
    },

    // ── Header actions ──
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    actionBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    unreadDot: {
        position: 'absolute',
        top: 7,
        right: 7,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: Colors.error,
        borderWidth: 1.5,
        borderColor: Colors.background,
    },

    // ── Stories ──
    storiesSection: {
        paddingTop: 20,
        paddingBottom: 16,
    },
    storiesContent: {
        paddingHorizontal: 16,
        gap: 4,
    },
    storyDividerWrap: {
        paddingHorizontal: 0,
        marginBottom: 2,
    },
    storyDivider: {
        height: 1,
        width: '100%',
    },

    // ── Filter bar ──
    filterBar: {
        marginTop: 10,
        marginBottom: 2,
    },
    filterBarContent: {
        paddingHorizontal: 16,
        gap: 8,
        paddingBottom: 10,
    },

    // ── Feed section label ──
    feedLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 18,
        paddingVertical: 10,
        gap: 6,
    },
    feedLabelDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: Colors.primary,
        opacity: 0.7,
    },
    feedLabelText: {
        fontSize: 11,
        fontFamily: Fonts.semiBold,
        color: Colors.textMuted,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
    },

    // ── List ──
    listContent: {
        paddingTop: 0,
    },
    loadMoreWrap: {
        paddingVertical: 24,
        alignItems: 'center',
    },

    // ── Empty state ──
    emptyState: {
        alignItems: 'center',
        paddingTop: 64,
        paddingHorizontal: 40,
        paddingBottom: 40,
    },
    emptyIconWrap: {
        width: 88,
        height: 88,
        borderRadius: 44,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 22,
    },
    emptyTitle: {
        fontSize: 20,
        fontFamily: Fonts.bold,
        color: Colors.textPrimary,
        marginBottom: 10,
        letterSpacing: -0.3,
        textAlign: 'center',
    },
    emptySub: {
        color: Colors.textSecondary,
        fontSize: 14,
        fontFamily: Fonts.regular,
        textAlign: 'center',
        lineHeight: 21,
        marginBottom: 30,
    },
    emptyBtn: {
        width: '100%',
        borderRadius: 16,
        overflow: 'hidden',
    },
    emptyBtnGrad: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 15,
    },
    emptyBtnText: {
        color: '#fff',
        fontFamily: Fonts.bold,
        fontSize: 14,
    },
    offlineBanner: {
        backgroundColor: '#FF4D4D',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingBottom: 8,
        zIndex: 100,
    },
    offlineText: {
        color: '#fff',
        fontSize: 12,
        fontFamily: Fonts.medium,
    },
    birthdayPost: {
        marginHorizontal: 8,
        marginBottom: 10,
        borderRadius: 16,
        overflow: 'hidden',
        minHeight: 86,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#F9B8D8',
    },
    birthdayPostAvatarWrap: { width: 54, height: 54, borderRadius: 27, padding: 2, backgroundColor: '#fff' },
    birthdayPostAvatar: { width: 50, height: 50, borderRadius: 25 },
    birthdayPostTitle: { fontSize: 15, fontFamily: Fonts.bold, color: Colors.textPrimary },
    birthdayPostSub: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.textSecondary, marginTop: 2 },
    birthdayPostEmoji: { fontSize: 28 },
});

const attStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.50)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    sheet: {
        backgroundColor: Colors.surface,
        borderRadius: 28,
        padding: 26,
        alignItems: 'center',
        width: '100%',
        maxWidth: 340,
        ...Shadow.primary,
    },
    iconRing: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    title: {
        fontSize: 21,
        fontFamily: Fonts.bold,
        color: Colors.textPrimary,
        marginBottom: 12,
        textAlign: 'center',
        letterSpacing: -0.3,
    },
    desc: {
        fontSize: 14,
        fontFamily: Fonts.regular,
        color: Colors.textSecondary,
        textAlign: 'center',
        lineHeight: 21,
        marginBottom: 28,
    },
    btn: {
        width: '100%',
        borderRadius: 16,
        overflow: 'hidden',
    },
    btnGrad: {
        paddingVertical: 15,
        alignItems: 'center',
    },
    btnText: {
        color: '#fff',
        fontSize: 15,
        fontFamily: Fonts.bold,
        letterSpacing: 0.2,
    },
});
