import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Image, StatusBar, Modal, Pressable, Platform, Alert,
    Dimensions, Animated, Easing, FlatList, ActivityIndicator
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';
import { Colors, Fonts, Spacing, BorderRadius, Shadow } from '../theme';
import CapsuleCard from '../components/CapsuleCard';
import CapsuleTypePill from '../components/CapsuleTypePill';
import CapsuleWithTimer from '../components/CapsuleWithTimer';

import TimelineActivity from '../components/TimelineActivity';
import LiveTimer from '../components/LiveTimer';
import { supabase } from '../lib/supabase';
import { MODEL_IMAGES } from '../constants/models';
import { timerConfigManager } from '../utils/timerConfig';
import InteractiveTour, { TutorialStep } from '../components/InteractiveTour';
import StoryViewer from '../components/StoryViewer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safetyService } from '../utils/safety';

type CapsuleType = 'instacap' | 'eventcap' | 'legacycap';
const { width, height } = Dimensions.get('window');

type FeedTab = 'following' | 'explore';
type FilterType = CapsuleType | 'all' | 'today';

export default function FeedScreen() {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const [activeTab, setActiveTab] = useState<FeedTab>('explore');
    const [activeFilter, setActiveFilter] = useState<FilterType>('all');
    const [capsules, setCapsules] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [stories, setStories] = useState<any[]>([]);
    const [myStory, setMyStory] = useState<any>(null);
    const [showCapsulePicker, setShowCapsulePicker] = useState(false);
    const [pickerStep, setPickerStep] = useState<'list' | 'select' | 'animation'>('list');
    const [userCapsules, setUserCapsules] = useState<any[]>([]);
    const [selectedPickerCapsule, setSelectedPickerCapsule] = useState<any>(null);
    const [pickerItems, setPickerItems] = useState<any[]>([]);
    const [randomPreviewItem, setRandomPreviewItem] = useState<any>(null);
    const [shuffling, setShuffling] = useState(false);
    const [totalFakeMinutes, setTotalFakeMinutes] = useState(1440); // 24 hours * 60 mins
    const [pulseAnim] = useState(new Animated.Value(1));
    const isFocused = useIsFocused();

    useEffect(() => {
        const interval = setInterval(() => {
            // Decrease 1 minute every 5 seconds as requested
            setTotalFakeMinutes(tm => (tm > 0 ? tm - 1 : 1440));
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (isFocused) {
            setTotalFakeMinutes(1440);
        }
    }, [isFocused]);

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.2, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
            ])
        ).start();
    }, []);
    const [feedCache, setFeedCache] = useState<Record<string, { data: any[]; ts: number }>>({});
    const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);

    const FEED_CACHE_TTL = 5 * 60 * 1000; // 5 minutes


    const [activeStory, setActiveStory] = useState<any>(null);
    const [activeStoryIndex, setActiveStoryIndex] = useState(0);
    const [hasUnread, setHasUnread] = useState(false);
    const [tutorialStep, setTutorialStep] = useState<TutorialStep>('IDLE');

    // Story Progress Logic
    const progress = useRef(new Animated.Value(0)).current;
    const shuffleAnim = useRef(new Animated.Value(0)).current;
    const unblurAnim = useRef(new Animated.Value(1)).current;
    const [isPaused, setIsPaused] = useState(false);
    const navigation = useNavigation<any>();

    const loadFeed = async (forceRefresh = false, tabOverride?: FeedTab) => {
        const tab = tabOverride ?? activeTab;
        const cacheKey = `${tab}_${activeFilter}`;

        // Use TTL-aware cache
        const cached = feedCache[cacheKey];
        if (!forceRefresh && cached && (Date.now() - cached.ts) < FEED_CACHE_TTL) {
            setCapsules(cached.data);
            setLoading(false);
            return;
        }

        if (!refreshing) setLoading(true);

        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) {
            setLoading(false);
            setRefreshing(false);
            return;
        }
        setCurrentUserId(user.id);

        const blocked = await safetyService.getAllSafetyUserIds(user.id);
        setBlockedUserIds(blocked);
        
        // Ensure stories load with the current user context immediately
        loadStories(user.id, blocked);

        const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', user.id);
        const followingIds = (follows || []).map(f => f.following_id);

        // 1. Fetch ranked capsule feeds using RPC
        const rpcName = tab === 'explore' ? 'get_explore_feed' : 'get_following_feed';
        const { data: rpcData, error: rpcError } = await supabase.rpc(rpcName, {
            req_user_id: user.id,
            req_filter: activeFilter,
            req_limit: 40
        });
        
        const capsData = (rpcData || []).map((c: any) => ({
            ...c,
            feedType: 'capsule'
        }));

        // 2. Fetch recent activity (capsule items)
        let itemsQuery = supabase.from('capsule_items')
            .select(`
                *,
                profiles:owner_id (username, display_name, avatar_url, is_verified),
                capsules:capsule_id!inner (title, is_public, type, status, opens_at, model, chain_id, owner_id)
            `)
            .in('media_type', ['image', 'video']);

        if (tab === 'explore') itemsQuery = itemsQuery.eq('capsules.is_public', true);

        if (tab === 'following') {
            if (followingIds.length > 0) itemsQuery = itemsQuery.in('owner_id', followingIds);
            else itemsQuery = itemsQuery.eq('owner_id', 'impossible-id');
        } else {
            itemsQuery = itemsQuery.neq('owner_id', user.id);
            if (followingIds.length > 0) itemsQuery = itemsQuery.not('owner_id', 'in', `(${followingIds.join(',')})`);
        }

        if (activeFilter !== 'all' && activeFilter !== 'today') itemsQuery = itemsQuery.eq('capsules.type', activeFilter);
        if (activeFilter === 'today') {
            const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
            itemsQuery = itemsQuery.gte('capsules.opens_at', startOfDay.toISOString()).lte('capsules.opens_at', endOfDay.toISOString());
        }

        const { data: itemsResponse } = await itemsQuery.order('created_at', { ascending: false }).limit(40);
        const activityData = itemsResponse || [];

        // Group activity items by capsule and time proximity
        const groupedActivity: any[] = [];
        const activityProcessed = new Set();

        activityData.forEach((item, idx) => {
            if (activityProcessed.has(item.id)) return;
            const group = [item];
            activityProcessed.add(item.id);
            const isVisualMedia = item.media_type === 'image' || item.media_type === 'video';
            const itemBatch = item.caption?.match(/!!b:(\w+)/)?.[1];

            if (isVisualMedia && itemBatch) {
                for (let j = idx + 1; j < activityData.length; j++) {
                    const nextItem = activityData[j];
                    const nextBatch = nextItem.caption?.match(/!!b:(\w+)/)?.[1];
                    if (nextItem.capsule_id === item.capsule_id && nextBatch === itemBatch && (nextItem.media_type === 'image' || nextItem.media_type === 'video')) {
                        group.push(nextItem);
                        activityProcessed.add(nextItem.id);
                    }
                }
            }

            // Assign a proxy score for activities based on recency to merge with ranked feed
            const recencyMs = new Date().getTime() - new Date(item.created_at).getTime();
            const hoursOld = Math.max(0, recencyMs / (1000 * 60 * 60));
            // Match the RPC's max score of ~80 for recency only
            const proxyTotalScore = Math.exp(-0.02 * hoursOld) * 80;

            if (group.length > 1) {
                groupedActivity.push({ ...item, feedType: 'activity_group', groupItems: group, count: group.length, total_score: proxyTotalScore });
            } else {
                groupedActivity.push({ ...item, feedType: 'activity', total_score: proxyTotalScore });
            }
        });

        // 3. Merge and enforce variety rule
        let merged = [
            ...capsData.filter((c: any) => !blocked.includes(c.owner_id)),
            ...groupedActivity.filter(a => !blocked.includes(a.owner_id))
        ];
        
        // Sort specifically by the RPC's total_score / proxy total_score, fallback to chronological
        merged.sort((a, b) => {
            const scoreA = a.total_score ?? (a.created_at ? new Date(a.created_at).getTime() / 1000000 : 0);
            const scoreB = b.total_score ?? (b.created_at ? new Date(b.created_at).getTime() / 1000000 : 0);
            return scoreB - scoreA;
        });

        // Deduplicate creation vs activity posts
        const finalMerged = merged.filter((item) => {
            if (item.feedType === 'capsule') {
                const activityExists = groupedActivity.some((act: any) => {
                    const actCapId = act.capsule_id?.toString();
                    const itemId = item.id?.toString();
                    return actCapId && itemId && actCapId === itemId;
                });

                return !activityExists;
            }
            return true;
        });

        // Apply Author Fatigue Limit (Max 2 posts in a row by same author)
        const diversifiedFeed: any[] = [];
        for (const item of finalMerged) {
            const authorId = item.owner_id;
            const last2 = diversifiedFeed.slice(-2);
            if (last2.length === 2 && last2[0].owner_id === authorId && last2[1].owner_id === authorId) {
                continue; // Drop 3rd consecutive post
            } else {
                diversifiedFeed.push(item);
            }
        }

        setCapsules(diversifiedFeed);
        setFeedCache(prev => ({ ...prev, [cacheKey]: { data: diversifiedFeed, ts: Date.now() } }));
        setLoading(false);
        setRefreshing(false);
        // Pass blocked directly to avoid stale-state timing issue
        // loadStories(blocked); // Removed this line and moved it up
    };

    const loadStories = async (userIdOverride?: string, blockedIds?: string[]) => {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;
        const targetUserId = userIdOverride || user.id;

        // Use passed-in blocked list to avoid stale state reads
        const blocked = blockedIds ?? blockedUserIds;

        const [storiesRes, readsRes] = await Promise.all([
            supabase.from('capsule_items')
                .select(`
                    *,
                    profiles:owner_id(username, display_name, avatar_url, id),
                    capsules:capsule_id(id, title, model)
                `)
                .eq('is_story', true)
                .gt('expires_at', new Date().toISOString())
                .order('created_at', { ascending: false }),
            supabase.from('story_reads').select('story_id').eq('user_id', user.id)
        ]);

        const data = storiesRes.data;
        const readIds = new Set((readsRes.data || []).map(r => r.story_id));
        // Use the explicitly passed blocked list — avoids duplicate safetyService call
        const blocked2 = blocked;

        if (data) {
            const usersWithStories: any[] = [];
            data.forEach(s => {
                if (blocked.includes(s.owner_id)) return;

                let userGroup = usersWithStories.find(u => u.owner_id === s.owner_id);
                const storyWithRead = { ...s, is_read: readIds.has(s.id) };
                if (!userGroup) {
                    userGroup = { ...s.profiles, owner_id: s.owner_id, stories: [] };
                    usersWithStories.push(userGroup);
                }
                userGroup.stories.push(storyWithRead);
            });

            // Evaluate if user has completely read ALL stories
            const processedUsers = usersWithStories.map(u => ({
                ...u,
                all_read: u.stories.every((s: any) => s.is_read)
            }));

            // Sort: My story first (if exists), then others (unread first), then read
            const sorted = processedUsers.sort((a, b) => {
                const isMineA = a.owner_id === targetUserId;
                const isMineB = b.owner_id === targetUserId;
                if (isMineA && !isMineB) return -1;
                if (!isMineA && isMineB) return 1;

                if (a.all_read !== b.all_read) return a.all_read ? 1 : -1;
                return 0;
            });

            setStories(sorted);
            const mine = sorted.find(u => u.owner_id === targetUserId);
            setMyStory(mine || null);
        }
    };





    const handleYourCapPress = useCallback(async () => {
        if (tutorialStep === 'POST_YOURCAP') {
            setTutorialStep('FINISHED');
            AsyncStorage.setItem('hasSeenTutorialV2', 'true');
        }

        if (myStory) {
            setActiveStory(myStory);
            setActiveStoryIndex(0);
        } else {
            if (!currentUserId) return;

            // Check if user is in cooldown
            const { data: profile } = await supabase.from('profiles').select('story_cooldown_until').eq('id', currentUserId).maybeSingle();
            if (profile?.story_cooldown_until) {
                const cooldownDate = new Date(profile.story_cooldown_until);
                if (cooldownDate > new Date()) {
                    Alert.alert(t('common.warning'), t('feed.story_cooldown_active'));
                    return;
                }
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

    const handleSelectCapsuleForPicker = async (capsule: any) => {
        setSelectedPickerCapsule(capsule);
        const { data: items } = await supabase.from('capsule_items')
            .select('*')
            .eq('capsule_id', capsule.id)
            .eq('media_type', 'image');

        if (!items || items.length === 0) {
            Alert.alert(t('common.warning'), t('create.no_media'));
            return;
        }

        setPickerItems(items);

        if (capsule.status === 'opened') {
            setPickerStep('select');
        } else {
            // Sealed logic: Animation
            setPickerStep('animation');
            setShuffling(true);

            // Shuffling animation
            Animated.loop(
                Animated.sequence([
                    Animated.timing(shuffleAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
                    Animated.timing(shuffleAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
                ])
            ).start();

            // Randomly pick one after 2.5 seconds animation
            setTimeout(() => {
                const random = items[Math.floor(Math.random() * items.length)];
                setRandomPreviewItem(random);
                setShuffling(false);
                shuffleAnim.stopAnimation();

                // Start un-pixelating (unblur) animation
                unblurAnim.setValue(1);
                Animated.timing(unblurAnim, {
                    toValue: 0,
                    duration: 3500,
                    useNativeDriver: true,
                    easing: Easing.out(Easing.cubic)
                }).start();
            }, 2500);
        }
    };

    const rejectRandomStory = async () => {
        const cooldownDate = new Date();
        cooldownDate.setHours(cooldownDate.getHours() + 48);
        const { error } = await supabase.from('profiles').update({ story_cooldown_until: cooldownDate.toISOString() }).eq('id', currentUserId);

        if (error) {
            console.error('Story cooldown error:', error);
            Alert.alert(t('common.error'), 'Could not activate cooldown. ' + error.message);
        }

        setPickerStep('list');
        setShowCapsulePicker(false);
        if (!error) {
            Alert.alert(t('common.warning'), t('feed.story_cooldown_active') || 'You declined to share this sealed memory. You cannot post a story for 48 hours.');
        }
    };

    const confirmStory = async (item: any) => {
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 168); // 1 Week

        // Check if capsule is sealed for Mystery effect
        const { data: cap } = await supabase.from('capsules').select('status').eq('id', item.capsule_id).single();
        const isMystery = cap?.status === 'sealed';


        const { error } = await supabase.from('capsule_items').insert({
            owner_id: currentUserId,
            capsule_id: item.capsule_id,
            media_url: item.media_url || `empty-story://${Date.now()}`,
            media_type: item.media_type || 'image',
            is_story: true,
            is_mystery: isMystery,
            expires_at: expiresAt.toISOString()
        });


        if (!error) {
            setShowCapsulePicker(false);
            loadStories();
        } else {
            Alert.alert(t('common.error'), t('feed.share_error') || 'Could not share story.');
        }
    };

    const markStoryRead = async (storyId: string) => {
        if (!currentUserId) return;
        await supabase.from('story_reads').upsert({ user_id: currentUserId, story_id: storyId }, { onConflict: 'user_id,story_id' });
        // Optimistic update locally
        setStories(prev => prev.map(u => ({
            ...u,
            stories: u.stories.map((s: any) => s.id === storyId ? { ...s, is_read: true } : s)
        })).map(u => ({
            ...u,
            all_read: u.stories.every((s: any) => s.is_read)
        })));

        // Also update myStory if it was mine
        if (myStory) {
            const updatedMyStories = myStory.stories.map((s: any) => s.id === storyId ? { ...s, is_read: true } : s);
            const allRead = updatedMyStories.every((s: any) => s.is_read);
            setMyStory({ ...myStory, stories: updatedMyStories, all_read: allRead });
        }
    };


    const isFirstMount = useRef(true);

    useEffect(() => {
        const initTab = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            const user = session?.user;
            if (user) {
                const { count } = await supabase
                    .from('follows')
                    .select('*', { count: 'exact', head: true })
                    .eq('follower_id', user.id);
                
                const correctTab: FeedTab = count && count > 0 ? 'following' : 'explore';
                
                setActiveTab(correctTab);
                setCurrentUserId(user.id);
                
                // Allow the dependency-based useEffect to fire now
                isFirstMount.current = false;
            }
        };
        initTab();
    }, []);

    useEffect(() => {
        if (!isFirstMount.current && currentUserId && isFocused) {
            loadFeed(false, activeTab);
            loadStories();
        }

        const checkTutorial = async () => {
            // Disabled temporarily per user request
            /*
            const hasSeen = await AsyncStorage.getItem('hasSeenTutorialV2');
            if (!hasSeen) {
                const savedStep = await AsyncStorage.getItem('tutorialStepV2');
                if (savedStep) {
                    setTutorialStep(savedStep as TutorialStep);
                } else if (tutorialStep === 'IDLE') {
                    setTutorialStep('WELCOME');
                }
            }
            */
        };
        if (isFocused) checkTutorial();
    }, [activeTab, activeFilter, currentUserId, isFocused]);

    useEffect(() => {
        if (tutorialStep !== 'IDLE') {
            AsyncStorage.setItem('tutorialStepV2', tutorialStep);
        }
    }, [tutorialStep]);

    useEffect(() => {
        const checkUnread = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            const user = session?.user;
            if (!user) return;

            const { data: myConvs } = await supabase
                .from('conversation_participants')
                .select('conversation_id')
                .eq('user_id', user.id);

            if (!myConvs || myConvs.length === 0) {
                setHasUnread(false);
                return;
            }

            // Load locally deleted chats so we skip them
            const deletedKey = `deleted_chats_${user.id}`;
            const existingDeleted = await AsyncStorage.getItem(deletedKey);
            const deletedList: string[] = existingDeleted ? JSON.parse(existingDeleted) : [];

            // Filter out deleted conversations before checking unread
            const activeConvs = myConvs.filter(c => !deletedList.includes(c.conversation_id));

            if (activeConvs.length === 0) {
                setHasUnread(false);
                return;
            }

            // Single batched query: get last message from others for ALL active conversations
            const convIds = activeConvs.map(c => c.conversation_id);
            const { data: lastMsgs } = await supabase
                .from('messages')
                .select('conversation_id, created_at, sender_id')
                .in('conversation_id', convIds)
                .neq('sender_id', user.id)
                .order('created_at', { ascending: false });

            if (!lastMsgs || lastMsgs.length === 0) {
                setHasUnread(false);
                return;
            }

            // Group by conversation_id: keep only the most recent message per conversation
            const latestPerConv: Record<string, any> = {};
            for (const msg of lastMsgs) {
                if (!latestPerConv[msg.conversation_id]) {
                    latestPerConv[msg.conversation_id] = msg;
                }
            }

            // Check visit timestamps in parallel
            let foundUnread = false;
            await Promise.all(
                Object.entries(latestPerConv).map(async ([convId, msg]) => {
                    if (foundUnread) return;
                    const lastVisited = await AsyncStorage.getItem(`chat_visited_${convId}`);
                    const msgTime = new Date(msg.created_at).getTime();
                    const visitTime = lastVisited ? new Date(lastVisited).getTime() : 0;
                    if (msgTime > visitTime + 2000) {
                        foundUnread = true;
                    }
                })
            );
            setHasUnread(foundUnread);
        };

        checkUnread();

        const channel = supabase.channel('chat_updates')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
                checkUnread();
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [isFocused]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        // Invalidate cache for current tab/filter so full reload happens
        const cacheKey = `${activeTab}_${activeFilter}`;
        setFeedCache(prev => { const n = { ...prev }; delete n[cacheKey]; return n; });
        loadFeed(true);
    }, [activeTab, activeFilter]);

    // ── Memoized FlatList helpers ──
    const keyExtractor = useCallback((item: any) => item.id, []);
    const renderItem = useCallback(({ item }: { item: any }) => (
        item.feed_type === 'capsule' || item.feedType === 'capsule'
            ? <CapsuleCard capsule={item} />
            : <TimelineActivity item={item} />
    ), []);

    const FeedListHeader = useMemo(() => (
        <>
            {/* ── STORIES ── */}
            <View style={styles.storiesSection}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storiesContent}>
                    {/* Your Cap */}
                    <TouchableOpacity key="your-cap" style={styles.storyItem} activeOpacity={0.85} onPress={handleYourCapPress}>
                        {myStory ? (
                            <LinearGradient 
                                colors={[Colors.primary, Colors.primaryDark, '#00f2ff']} 
                                style={styles.storyRing}
                                start={{ x: 0, y: 1 }}
                                end={{ x: 1, y: 0 }}
                            >
                                <View style={styles.storyAvatarWrap}>
                                    <Image source={{ uri: myStory.avatar_url || 'https://via.placeholder.com/150' }} style={styles.storyAvatar} />
                                </View>
                            </LinearGradient>
                        ) : (
                            <View style={styles.yourCapPlaceholder} pointerEvents="none">
                                {/* Multi-layered subtle glow - Adjusted for better centering and visibility */}
                                <LinearGradient
                                    colors={[Colors.primary + '25', 'transparent']}
                                    style={[styles.yourCapGlow, { width: 80, height: 80, borderRadius: 40 }]}
                                />
                                <LinearGradient
                                    colors={[Colors.accent + '15', 'transparent']}
                                    style={[styles.yourCapGlow, { width: 95, height: 95, borderRadius: 47.5, opacity: 0.5 }]}
                                />
                                <View style={styles.yourCapRing}>
                                    <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.addStoryBtn}>
                                        <Ionicons name="add" size={24} color="#fff" />
                                    </LinearGradient>
                                </View>
                            </View>
                        )}
                        <Text style={styles.yourCapLabel}>Flash</Text>
                    </TouchableOpacity>

                    {stories.filter(u => u.owner_id !== currentUserId).map((u) => (
                        <TouchableOpacity key={u.owner_id} style={styles.storyItem} activeOpacity={0.85} onPress={() => { setActiveStory(u); setActiveStoryIndex(0); }}>
                            {u.all_read ? (
                                <View style={[styles.storyRing, styles.storyRingRead]}>
                                    <View style={styles.storyAvatarWrap}>
                                        <Image source={{ uri: u.avatar_url || 'https://via.placeholder.com/150' }} style={styles.storyAvatar} />
                                    </View>
                                </View>
                            ) : (
                                <LinearGradient colors={[Colors.primary, Colors.primaryDark, '#00f2ff']} style={styles.storyRing} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }}>
                                    <View style={styles.storyAvatarWrap}>
                                        <Image source={{ uri: u.avatar_url || 'https://via.placeholder.com/150' }} style={styles.storyAvatar} />
                                    </View>
                                </LinearGradient>
                            )}
                            <Text style={[styles.storyLabel, u.all_read && { color: Colors.textMuted }]} numberOfLines={1}>{u.display_name || u.username || 'user'}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {/* ── FILTER BAR ── */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterBarContent}>
                {(['all', 'today', 'instacap', 'eventcap', 'legacycap'] as FilterType[]).map((key) => {
                    const isToday = key === 'today';
                    const isActive = activeFilter === key;
                    const label = key === 'all' ? t('feed.all') :
                                  key === 'today' ? t('feed.opens_today') :
                                  key === 'instacap' ? 'InstaCap' :
                                  key === 'eventcap' ? 'EventCap' : 'LegacyCap';
                    
                    const icon = key === 'all' ? 'apps-outline' :
                                 key === 'today' ? 'time-outline' :
                                 key === 'instacap' ? 'camera-outline' :
                                 key === 'eventcap' ? 'calendar-outline' : 'hourglass-outline';

                    return (
                        <TouchableOpacity
                            key={key}
                            style={[
                                styles.filterChip, 
                                isActive && styles.filterChipActive,
                                isToday && !isActive && { backgroundColor: '#FF416C10', borderColor: '#FF416C30' }
                            ]}
                            onPress={() => setActiveFilter(key)}
                            activeOpacity={0.8}
                        >
                            {isActive ? (
                                <LinearGradient
                                    colors={isToday ? ['#FF416C', '#FF4B2B'] : [Colors.primary, Colors.primaryDark]}
                                    style={StyleSheet.absoluteFill}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                />
                            ) : null}
                            
                            {isToday ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Ionicons 
                                        name={isActive ? "time" : "time-outline"} 
                                        size={14} 
                                        color={isActive ? '#fff' : '#FF416C'} 
                                    />
                                    <Text style={[
                                        styles.filterChipText, 
                                        isActive && styles.filterChipTextActive,
                                        !isActive && { color: '#FF416C' }
                                    ]}>
                                        {label}
                                    </Text>
                                    <View style={[
                                        styles.timerBadge,
                                        isActive && { backgroundColor: 'rgba(255,255,255,0.2)' }
                                    ]}>
                                        <Text style={[
                                            styles.timerBadgeText,
                                            isActive && { color: '#fff' }
                                        ]}>
                                            {`${Math.floor(totalFakeMinutes / 60) < 10 ? '0' : ''}${Math.floor(totalFakeMinutes / 60)}:${(totalFakeMinutes % 60) < 10 ? '0' : ''}${totalFakeMinutes % 60}`}
                                        </Text>
                                    </View>
                                    {isActive && <Animated.View style={[styles.liveIndicator, { transform: [{ scale: pulseAnim }] }]} />}
                                </View>
                            ) : (
                                <>
                                    <Ionicons name={icon as any} size={14} color={isActive ? '#fff' : Colors.textSecondary} />
                                    <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>{label}</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            {loading && !refreshing && (
                <View style={{ paddingTop: 20, alignItems: 'center' }}>
                    <ActivityIndicator color={Colors.primary} />
                </View>
            )}
        </>
        // eslint-disable-next-line react-hooks/exhaustive-deps
    ), [stories, myStory, currentUserId, activeFilter, loading, refreshing, totalFakeMinutes, handleYourCapPress]);

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

            {/* ── HEADER ── */}
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <BlurView intensity={Platform.OS === 'ios' ? 80 : 100} tint="light" style={StyleSheet.absoluteFill} />

                <View style={styles.headerContent}>
                    {/* Brand */}
                    <View style={styles.logoContainer}>
                        <Image
                            source={{ uri: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/website/Logomain.png' }}
                            style={styles.logo}
                            resizeMode="contain"
                        />
                        <Text style={styles.logoText}>kapsely</Text>
                    </View>

                    {/* Actions */}
                    <View style={styles.headerActions}>
                        <TouchableOpacity
                            style={styles.iconBtn}
                            activeOpacity={0.7}
                            onPress={() => {
                                if (tutorialStep === 'PRESS_PLUS') setTutorialStep('POST_YOURCAP');
                                navigation.navigate('CreateSelection', { isTutorial: tutorialStep === 'PRESS_PLUS' });
                            }}
                        >
                            <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.iconBtnGrad}>
                                <Ionicons name="add" size={20} color="#fff" />
                            </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7} onPress={() => navigation.navigate('Search')}>
                            <View style={styles.iconBtnPlain}>
                                <Ionicons name="search-outline" size={19} color={Colors.textPrimary} />
                            </View>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.iconBtn} activeOpacity={0.8} onPress={() => navigation.navigate('ChatList')}>
                            <View style={[styles.iconBtnPlain, hasUnread && styles.iconBtnUnread]}>
                                <Ionicons name="chatbubble-ellipses" size={17} color={hasUnread ? Colors.primary : Colors.textPrimary} />
                                {hasUnread && <View style={styles.notifBadge} />}
                            </View>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* ── Segmented Pill Tabs ── */}
                <View style={styles.tabPillContainer}>
                    <View style={styles.tabPill}>
                        {(['following', 'explore'] as FeedTab[]).map((t_key) => (
                            <TouchableOpacity
                                key={t_key}
                                style={[styles.tabPillItem, activeTab === t_key && styles.tabPillItemActive]}
                                onPress={() => setActiveTab(t_key)}
                                activeOpacity={0.7}
                            >
                                {activeTab === t_key && (
                                    <LinearGradient
                                        colors={[Colors.primary, Colors.primaryDark]}
                                        style={StyleSheet.absoluteFill}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                    />
                                )}
                                <Text style={[styles.tabPillText, activeTab === t_key && styles.tabPillTextActive]}>
                                    {t_key === 'following' ? t('feed.following') : t('feed.explore')}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            </View>

            <FlatList
                data={capsules}
                keyExtractor={keyExtractor}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                refreshing={refreshing}
                onRefresh={onRefresh}
                ListHeaderComponent={FeedListHeader}
                renderItem={renderItem}
                initialNumToRender={5}
                maxToRenderPerBatch={5}
                windowSize={7}
                removeClippedSubviews={Platform.OS === 'android'}
                ListEmptyComponent={() => !loading && (
                    <View style={styles.emptyState}>
                        <LinearGradient colors={[Colors.primary + '18', 'transparent']} style={styles.emptyGlow} />
                        <View style={styles.emptyIconWrap}>
                            <LinearGradient colors={[Colors.primary + '22', Colors.primaryLight + '11']} style={StyleSheet.absoluteFill} />
                            <Ionicons name="time-outline" size={44} color={Colors.primary} />
                        </View>
                        <Text style={styles.emptyTitle}>Nothing here yet</Text>
                        <Text style={styles.emptyText}>When people you follow add memories to their capsules, they'll appear here.</Text>
                        <TouchableOpacity
                            style={styles.emptyBtn}
                            activeOpacity={0.8}
                            onPress={() => setActiveTab('explore')}
                        >
                            <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.emptyBtnGrad}>
                                <Text style={styles.emptyBtnText}>Explore capsules</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                )}
            />

            {/* Capsule Picker Modal */}
            <Modal 
                visible={showCapsulePicker} 
                transparent 
                animationType="slide"
                onRequestClose={() => {
                    if (pickerStep === 'animation') {
                        rejectRandomStory();
                    } else {
                        setShowCapsulePicker(false);
                    }
                }}
            >
                <View style={styles.pickerOverlay}>
                    <View style={styles.pickerContent}>
                        <View style={styles.pickerHeader}>
                            {pickerStep !== 'list' && (
                                <TouchableOpacity 
                                    onPress={() => {
                                        if (pickerStep === 'animation') {
                                            rejectRandomStory();
                                        } else {
                                            setPickerStep('list');
                                        }
                                    }} 
                                    style={styles.pickerBack} 
                                    activeOpacity={0.7}
                                >
                                    <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
                                </TouchableOpacity>
                            )}
                            <Text style={styles.pickerTitle}>
                                {pickerStep === 'list' ? 'Share as Flash' :
                                    pickerStep === 'select' ? 'Choose Image' : 'Discovering...'}
                            </Text>
                            <TouchableOpacity 
                                onPress={() => {
                                    if (pickerStep === 'animation') {
                                        rejectRandomStory();
                                    } else {
                                        setShowCapsulePicker(false);
                                    }
                                }} 
                                activeOpacity={0.7}
                            >
                                <Ionicons name="close" size={24} color={Colors.textMuted} />
                            </TouchableOpacity>
                        </View>

                        {pickerStep === 'list' && (
                            <ScrollView>
                                {userCapsules.map(cap => (
                                    <TouchableOpacity key={cap.id} style={styles.pickerItem} activeOpacity={0.8} onPress={() => handleSelectCapsuleForPicker(cap)}>
                                        <View style={styles.pickerModelWrap}>
                                            <Image source={{ uri: timerConfigManager.getModelImage(cap.model) || MODEL_IMAGES[cap.model] || (MODEL_IMAGES as any).basicred_kap }} style={styles.pickerModelImg} resizeMode="contain" />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.pickerItemText}>{cap.title}</Text>
                                            <Text style={[styles.pickerStatusLabel, { color: cap.status === 'opened' ? Colors.success : Colors.primary }]}>
                                                {cap.status === 'opened' ? 'Opened' : 'Sealed'}
                                            </Text>
                                        </View>
                                        <Ionicons name="chevron-forward" size={20} color={Colors.border} />
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        )}

                        {pickerStep === 'select' && (
                            <FlatList
                                data={pickerItems}
                                numColumns={3}
                                keyExtractor={(item) => item.id}
                                renderItem={({ item }) => (
                                    <TouchableOpacity style={styles.pickerGridItem} activeOpacity={0.8} onPress={() => confirmStory(item)}>
                                        <Image source={{ uri: item.media_url }} style={styles.pickerGridImg} />
                                    </TouchableOpacity>
                                )}
                                contentContainerStyle={{ gap: 2 }}
                            />
                        )}

                        {pickerStep === 'animation' && (
                            <View style={styles.animationContainer}>
                                {shuffling ? (
                                    <View style={styles.shufflingWrap}>
                                        <Animated.View style={[styles.shufflingIcon, { transform: [{ scale: shuffleAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] }) }] }]}>
                                            <Ionicons name="rocket-outline" size={64} color={Colors.primary} />
                                        </Animated.View>
                                        <Text style={styles.luckyText}>{t('feed.lucky_msg')}</Text>
                                        <Text style={styles.shufflingText}>{t('feed.shuffling_msg')}</Text>
                                    </View>
                                ) : (
                                    <View style={styles.previewWrap}>
                                        <View style={styles.previewImgContainer}>
                                            <Image source={{ uri: randomPreviewItem?.media_url }} style={styles.previewImgReal} />
                                            <Animated.View style={[StyleSheet.absoluteFill, { opacity: unblurAnim }]}>
                                                <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
                                                <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
                                            </Animated.View>
                                        </View>
                                        <Text style={styles.luckyText}>A memory has surfaced!</Text>
                                        <View style={styles.previewActions}>
                                            <TouchableOpacity style={styles.cancelPreview} activeOpacity={0.7} onPress={rejectRandomStory}>
                                                <Text style={styles.cancelPreviewText}>Cancel</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity style={styles.confirmPreview} activeOpacity={0.8} onPress={() => confirmStory(randomPreviewItem)}>
                                                <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.confirmBtnGradient}>
                                                    <Text style={styles.confirmBtnText}>Add to Flash</Text>
                                                </LinearGradient>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                )}
                            </View>
                        )}
                    </View>
                </View>
            </Modal>

            <StoryViewer
                visible={!!activeStory}
                userGroup={activeStory}
                onClose={() => setActiveStory(null)}
                onNextUser={() => {
                    const currentIndex = stories.findIndex(u => u.owner_id === activeStory?.owner_id);
                    if (currentIndex < stories.length - 1) setActiveStory(stories[currentIndex + 1]);
                    else setActiveStory(null);
                }}
                onPrevUser={() => {
                    const currentIndex = stories.findIndex(u => u.owner_id === activeStory?.owner_id);
                    if (currentIndex > 0) setActiveStory(stories[currentIndex - 1]);
                }}
                onStoryRead={markStoryRead}
                currentUserId={currentUserId || undefined}
            />

            <InteractiveTour
                step={tutorialStep}
                onAction={(action) => {
                    if (action === 'START') setTutorialStep('PRESS_PLUS');
                }}
                onDismiss={async () => {
                    await AsyncStorage.setItem('hasSeenTutorialV2', 'true');
                    setTutorialStep('FINISHED');
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },

    // ── HEADER ──
    header: {
        position: 'relative',
        backgroundColor: 'transparent',
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
        overflow: 'hidden',
    },
    headerContent: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: Spacing.md, paddingVertical: 10,
    },
    logoContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    logo: { width: 30, height: 30 },
    logoText: { color: Colors.textPrimary, fontSize: 20, fontFamily: Fonts.bold, letterSpacing: -0.5 },
    headerActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    iconBtnGrad: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', ...Shadow.primary },
    iconBtnPlain: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.cardAlt, borderWidth: 1, borderColor: Colors.border },
    iconBtnUnread: { borderColor: Colors.primary, backgroundColor: Colors.primaryGlow },
    notifBadge: { position: 'absolute', top: -2, right: -2, width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.error, borderWidth: 2, borderColor: '#fff' },

    // ── SEGMENTED PILL TABS ──
    tabPillContainer: { paddingHorizontal: Spacing.md, paddingBottom: 12, paddingTop: 2 },
    tabPill: { flexDirection: 'row', backgroundColor: Colors.cardAlt, borderRadius: 999, padding: 3, borderWidth: 1, borderColor: Colors.border, alignSelf: 'flex-start' },
    tabPillItem: { paddingHorizontal: 22, paddingVertical: 8, borderRadius: 999, overflow: 'hidden' },
    tabPillItemActive: { ...Shadow.subtle },
    tabPillText: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.textMuted },
    tabPillTextActive: { color: '#fff', fontFamily: Fonts.bold },

    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 100 },

    // ── STORIES ──
    storiesSection: { paddingTop: 20, paddingBottom: 15 },
    storiesContent: { paddingHorizontal: Spacing.md, gap: Spacing.md, paddingRight: 30 },
    storyItem: { alignItems: 'center', gap: 6, width: 72 },
    storyRing: { width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center', padding: 2.5 },
    storyRingRead: { backgroundColor: Colors.border },
    storyAvatarWrap: { width: 65, height: 65, borderRadius: 32.5, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
    storyAvatar: { width: 62, height: 62, borderRadius: 31 },
    storyLabel: { color: Colors.textSecondary, fontSize: 11, fontFamily: Fonts.medium, textAlign: 'center', maxWidth: 70 },
    yourCapLabel: { color: Colors.primary, fontSize: 11, fontFamily: Fonts.bold, textAlign: 'center' },
    yourCapPlaceholder: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center' },
    yourCapGlow: { position: 'absolute', alignSelf: 'center' },
    yourCapRing: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: Colors.primary, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
    addStoryBtn: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', ...Shadow.primary },

    // ── FILTER BAR ──
    filterBar: { marginBottom: 4, marginTop: 12 },
    filterBarContent: { paddingHorizontal: Spacing.md, gap: 8, paddingBottom: 8 },
    filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, overflow: 'hidden' },
    filterChipActive: { borderColor: 'transparent', ...Shadow.subtle },
    filterChipText: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textSecondary },
    filterChipTextActive: { color: '#fff', fontFamily: Fonts.bold },
    liveIndicator: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#fff',
        shadowColor: '#fff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 4,
    },
    timerBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        backgroundColor: 'rgba(255, 65, 108, 0.12)',
    },
    timerBadgeText: {
        fontSize: 10,
        fontFamily: Fonts.bold,
        color: '#FF416C',
    },

    // ── EMPTY STATE ──
    emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40, paddingBottom: 40 },
    emptyGlow: { position: 'absolute', top: 0, left: '10%', right: '10%', height: 200, borderRadius: 100 },
    emptyIconWrap: { width: 100, height: 100, borderRadius: 50, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    emptyTitle: { fontSize: 22, fontFamily: Fonts.bold, color: Colors.textPrimary, marginBottom: 10 },
    emptyText: { color: Colors.textSecondary, fontSize: 14, fontFamily: Fonts.medium, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
    emptyBtn: { width: '100%', borderRadius: 16, overflow: 'hidden' },
    emptyBtnGrad: { paddingVertical: 14, alignItems: 'center' },
    emptyBtnText: { color: '#fff', fontFamily: Fonts.bold, fontSize: 15 },

    pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 15 },
    pickerContent: { backgroundColor: Colors.surface, borderRadius: 24, maxHeight: '85%', overflow: 'hidden' },
    pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.border },
    pickerTitle: { fontSize: 18, fontFamily: Fonts.bold, color: Colors.textPrimary },
    pickerBack: { marginRight: 10 },
    pickerItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderBottomWidth: 1, borderBottomColor: Colors.border },
    pickerModelWrap: { width: 50, height: 50, borderRadius: 10, backgroundColor: Colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
    pickerModelImg: { width: '80%', height: '80%' },
    pickerItemText: { fontSize: 16, fontFamily: Fonts.bold, color: Colors.textPrimary },
    pickerStatusLabel: { fontSize: 12, fontFamily: Fonts.medium, marginTop: 2 },
    pickerGridItem: { width: (width - 30) / 3, aspectRatio: 1, padding: 1 },
    pickerGridImg: { width: '100%', height: '100%' },

    animationContainer: { padding: 30, alignItems: 'center' },
    shufflingWrap: { padding: 40, alignItems: 'center' },
    shufflingIcon: { marginBottom: 20 },
    shufflingText: { color: Colors.textSecondary, fontFamily: Fonts.medium, textAlign: 'center' },
    luckyText: { color: Colors.textPrimary, fontFamily: Fonts.bold, marginBottom: 20 },
    previewWrap: { width: '100%', alignItems: 'center' },
    previewImgContainer: { width: '100%', height: 350, borderRadius: 20, overflow: 'hidden', marginBottom: 20 },
    previewImgReal: { width: '100%', height: '100%' },
    previewImg: { width: '100%', height: 350, borderRadius: 20, marginBottom: 20 },
    previewActions: { flexDirection: 'row', gap: 15, width: '100%' },
    cancelPreview: { flex: 1, height: 54, borderRadius: 15, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
    cancelPreviewText: { color: Colors.textSecondary, fontFamily: Fonts.bold },
    confirmPreview: { flex: 1, height: 54, borderRadius: 15, overflow: 'hidden' },
    confirmBtnGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    confirmBtnText: { color: '#fff', fontFamily: Fonts.bold },

    storyViewer: { flex: 1, backgroundColor: '#000' },
    storyBackground: { width: width, height: height },
    storySafeHeader: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
    progressBars: { flexDirection: 'row', paddingHorizontal: 10, paddingTop: 10, gap: 5 },
    progressBarBg: { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 1, overflow: 'hidden' },
    progressBarFill: { height: '100%', backgroundColor: '#fff' },
    storyHeader: { flexDirection: 'row', alignItems: 'center', padding: 15, gap: 12 },
    storyAvatarSmall: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#fff' },
    storyUser: { color: '#fff', fontSize: 14, fontFamily: Fonts.bold },
    storyTime: { color: 'rgba(255,255,255,0.8)', fontSize: 11 },
    gestureOverlay: { ...StyleSheet.absoluteFillObject, flexDirection: 'row' },
    gestureSide: { flex: 1 },
    floatingCapsule: { position: 'absolute', bottom: 100, alignSelf: 'center', borderRadius: 25, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
    blurCapsule: { paddingHorizontal: 20, paddingVertical: 10 },
    floatingCapsuleInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    floatingModelImg: { width: 28, height: 28 },
    floatingModelText: { color: '#fff', fontSize: 14, fontFamily: Fonts.bold },
});

