import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    StatusBar, Modal, Platform, Alert,
    Dimensions, Animated, Easing, ActivityIndicator, InteractionManager,
    DeviceEventEmitter
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
import { supabase } from '../lib/supabase';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { safetyService } from '../utils/safety';
import { useWebDragScroll } from '../utils/useWebDragScroll';
import { feedScrollBus } from '../utils/feedScrollBus';
import StoryViewer from '../components/StoryViewer';
import InteractiveTour from '../components/InteractiveTour';
import { sendPushNotification } from '../utils/pushNotifications';
import { MODEL_IMAGES, MODEL_TINTS } from '../constants/models';
import { timerConfigManager } from '../utils/timerConfig';

type TutorialStep = 'IDLE' | 'WELCOME' | 'PRESS_PLUS' | 'SELECT_TYPE' | 'POST_YOURCAP' | 'FINISHED';

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

import { FlashPicker } from '../components/FlashPicker';
import { StoryBubble } from '../components/feed/StoryBubble';
import { FilterChip } from '../components/feed/FilterChip';
import CapsuleCard from '../components/CapsuleCard';

type FeedTab = 'following' | 'explore';
type FilterType = 'all' | 'closed' | 'open';

const { width, height } = Dimensions.get('window');

const FEED_CACHE_TTL = 5 * 60 * 1000;
const IMPRESSION_FLUSH_MS = 8000;
const PAGE_SIZE = 15;

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

    const [activeTab, setActiveTab] = useState<FeedTab>('following');
    const [activeFilter, setActiveFilter] = useState<FilterType>('all');
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [stories, setStories] = useState<any[]>([]);

    const queryClient = useQueryClient();

    // ─── Fetch Function ──────────────────────────────────────────────────────
    const fetchFeed = async ({ pageParam = 0 }) => {
        const { data: { session } } = await supabase.auth.getSession();
        const myId = session?.user?.id;
        if (myId && !currentUserId) setCurrentUserId(myId);

        const { data, error } = await supabase.rpc('get_combined_feed_data', {
            p_tab: activeTab,
            p_filter: activeFilter,
            p_limit: PAGE_SIZE,
            p_offset: pageParam * PAGE_SIZE
        });

        if (error) throw error;
        return data;
    };

    // ─── useInfiniteQuery ────────────────────────────────────────────────────
    const {
        data: queryData,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        status,
        refetch,
    } = useInfiniteQuery({
        queryKey: ['feed', activeTab, activeFilter],
        queryFn: fetchFeed,
        getNextPageParam: (lastPage, allPages) => {
            return lastPage.feed?.length >= PAGE_SIZE ? allPages.length : undefined;
        },
        initialPageParam: 0,
    });

    const capsules = useMemo(() => {
        return queryData?.pages.flatMap(page => page.feed || []) || [];
    }, [queryData]);

    // Update auxiliary states when data changes
    useEffect(() => {
        if (queryData?.pages[0]) {
            const { stories: storiesData, following_ids, liked_ids, blocked_ids, participant_ids } = queryData.pages[0];
            
            setBlockedUserIds(blocked_ids || []);
            setFollowingSet(new Set(following_ids || []));
            setLikedCapsules(new Set(liked_ids || []));
            setParticipantCapsules(new Set(participant_ids || []));

            if (currentUserId) {
                processStoriesData(storiesData || [], currentUserId, blocked_ids || []);
            }
        }
    }, [queryData, currentUserId]);

    const isLoading = status === 'pending' && !queryData;
    const isRefreshing = status === 'pending' && !!queryData;
    const isError = status === 'error';

    const trackedImpressions = useRef<Set<string>>(new Set());

    const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: any[] }) => {
        if (!currentUserId) return;
        
        const newImpressions = viewableItems
            .filter(v => v.isViewable && v.item?.id && !trackedImpressions.current.has(v.item.id))
            .map(v => ({ activityId: v.item.id, capsuleId: v.item.capsule_id || v.item.id }));
            
        if (newImpressions.length > 0) {
            newImpressions.forEach(i => trackedImpressions.current.add(i.activityId));
            
            const insertPayload = newImpressions.map(i => ({
                user_id: currentUserId,
                capsule_id: i.capsuleId,
                viewed_at: new Date().toISOString()
            }));

            // Fire and forget, ignore 23505 (unique violation)
            supabase.from('feed_impressions').insert(insertPayload).then(({error}) => {
                if (error && error.code !== '23505') console.log('Impression error:', error.message);
            });
        }
    }, [currentUserId]);

    const pulseAnim = useRef(new Animated.Value(1)).current;
    const headerOpacity = useRef(new Animated.Value(0)).current;
    const headerSlide = useRef(new Animated.Value(-10)).current;
    const logoScale = useRef(new Animated.Value(0.88)).current;
    const isFirstMount = useRef(true);
    const feedRequestId = useRef(0);

    const flatListRef = useRef<any>(null);
    const impressionBufferRef = useRef<Set<string>>(new Set());
    const impressionFlushRef = useRef<NodeJS.Timeout | null>(null);
    const storiesScrollRef = useRef<ScrollView>(null);
    const filterScrollRef = useRef<ScrollView>(null);

    const keyExtractor = useCallback((item: any) => item.id, []);

    useWebDragScroll(flatListRef);
    useWebDragScroll(storiesScrollRef);
    useWebDragScroll(filterScrollRef);

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
            flushImpressions();
        };
    }, [currentUserId]);

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
    const handleYourCapPress = useCallback(async () => {
        if (tutorialStep === 'POST_YOURCAP') {
            setTutorialStep('FINISHED');
            AsyncStorage.setItem('hasSeenTutorialV2', 'true');
        }
        if (myStory) {
            setActiveStory(myStory);
            return;
        }
        setShowCapsulePicker(true);
    }, [myStory, tutorialStep]);

    useEffect(() => {
        const init = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const user = session?.user;
                if (user) {
                    const { count } = await supabase.from('follows')
                        .select('*', { count: 'exact', head: true })
                        .eq('follower_id', user.id);
                    setActiveTab(count && count > 0 ? 'following' : 'explore');
                    setCurrentUserId(user.id);
                }
            } catch (e) { console.error('[Feed] init error:', e); }
        };
        init();
    }, []);

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
        checkUnread();
        const ch = supabase.channel('chat_updates')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, checkUnread)
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, [isFocused]);

    const onRefresh = useCallback(() => {
        refetch();
    }, [refetch]);

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
            const activity = capsules.find(c => c.id === activityId);
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
            const previousFeed = queryClient.getQueryData(['feed']);

            queryClient.setQueryData(['feed'], (old: any) => {
                if (!old) return old;
                return {
                    ...old,
                    pages: old.pages.map((page: any) => ({
                        ...page,
                        feed: page.feed.map((item: any) => {
                            if (item.id === activityId || item.capsule_id === activityId) {
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

            return { previousFeed };
        },
        onError: (err, variables, context) => {
            if (context?.previousFeed) {
                queryClient.setQueryData(['feed'], context.previousFeed);
            }
            Alert.alert('Error', 'Could not update like. Please try again.');
        }
    });

    const handleGlobalLike = useCallback((activityId: string, is_liked: boolean) => {
        likeMutation.mutate({ activityId, wasLiked: is_liked });
    }, [likeMutation]);


    // ─── renderItem ────────────────────────────────────────────────────────────
    const renderItem = useCallback(({ item }: { item: any }) => {
        const isFollowed = followingSet.has(item.owner_id);
        const isLiked = likedCapsules.has(item.id) || likedCapsules.has(item.capsule_id);
        const hasAccess = item.is_public
            || item.owner_id === currentUserId
            || participantCapsules.has(item.id)
            || (item.capsule_id && participantCapsules.has(item.capsule_id));

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
                lightweight
                hideParticles
                onViewable={() => {
                    impressionBufferRef.current.add(item.id);
                }}
            />
        );
    }, [currentUserId, followingSet, likedCapsules, participantCapsules, handleGlobalFollow, handleGlobalLike, capsules]);

    // ─── List Header ───────────────────────────────────────────────────────────
    const ListHeader = useMemo(() => (
        <>
            {/* Stories strip */}
            <View style={s.storiesSection}>
                <ScrollView
                    ref={storiesScrollRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={s.storiesContent}
                >
                    <StoryBubble key="your-cap" user={myStory || null} isOwn onPress={handleYourCapPress} />
                    {stories
                        .filter(u => u.owner_id !== currentUserId)
                        .map(u => (
                            <StoryBubble key={u.owner_id} user={u} onPress={() => setActiveStory(u)} />
                        ))}
                </ScrollView>
            </View>

            {/* Divider with subtle fade */}
            <View style={s.storyDividerWrap}>
                <LinearGradient
                    colors={['transparent', Colors.border, 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={s.storyDivider}
                />
            </View>

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
    ), [stories, myStory, currentUserId, activeFilter, handleYourCapPress, handleFilterChange]);

    // ─── Header component ──────────────────────────────────────────────────────
    const headerPaddingTop = insets.top + 8;

    return (
        <View style={s.root}>
            <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

            {/* ── Header ── */}
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
                            style={[s.actionBtn, hasUnread && s.actionBtnUnread]}
                            activeOpacity={0.72}
                            onPress={() => navigation.navigate('ChatList')}
                        >
                            <Ionicons
                                name="chatbubble-ellipses"
                                size={20}
                                color={hasUnread ? Colors.primary : Colors.textPrimary}
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
                refreshing={isRefreshing}
                onRefresh={onRefresh}
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.5}
                ListHeaderComponent={ListHeader}
                renderItem={renderItem}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={{ itemVisiblePercentThreshold: 50, minimumViewTime: 800 }}
                extraData={[likedCapsules, capsules, followingSet]}
                drawDistance={height}
                ListFooterComponent={() =>
                    isFetchingNextPage ? (
                        <View style={s.loadMoreWrap}>
                            <ActivityIndicator color={Colors.primary} size="small" />
                        </View>
                    ) : null
                }
                ListEmptyComponent={() =>
                    isLoading ? (
                        <FeedSkeleton />
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
            <FlashPicker
                visible={showCapsulePicker}
                onClose={() => setShowCapsulePicker(false)}
                currentUserId={currentUserId}
                participantCapsules={participantCapsules}
                onStoryPublished={() => queryClient.invalidateQueries({ queryKey: ['feed'] })}
            />

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
        width: 42,
        height: 42,
        borderRadius: 14,
        backgroundColor: Colors.cardAlt,
        borderWidth: 1,
        borderColor: Colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    actionBtnUnread: {
        borderColor: Colors.primary + '50',
        backgroundColor: Colors.primary + '0C',
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