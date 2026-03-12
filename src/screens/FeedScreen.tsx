import React, { useState, useEffect, useRef } from 'react';
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
import { supabase } from '../lib/supabase';
import { MODEL_IMAGES } from '../constants/models';
import { timerConfigManager } from '../utils/timerConfig';
import InteractiveTour, { TutorialStep } from '../components/InteractiveTour';
import StoryViewer from '../components/StoryViewer';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
    const [feedCache, setFeedCache] = useState<Record<string, any[]>>({});

    const [activeStory, setActiveStory] = useState<any>(null);
    const [activeStoryIndex, setActiveStoryIndex] = useState(0);
    const [hasUnread, setHasUnread] = useState(false);
    const [tutorialStep, setTutorialStep] = useState<TutorialStep>('IDLE');
    const isFocused = useIsFocused();

    // Story Progress Logic
    const progress = useRef(new Animated.Value(0)).current;
    const shuffleAnim = useRef(new Animated.Value(0)).current;
    const unblurAnim = useRef(new Animated.Value(1)).current;
    const [isPaused, setIsPaused] = useState(false);
    const navigation = useNavigation<any>();

    const loadFeed = async (forceRefresh = false, tabOverride?: FeedTab) => {
        const tab = tabOverride ?? activeTab;
        const cacheKey = `${tab}_${activeFilter}`;

        // Use cache if available and not forcing refresh
        if (!forceRefresh && feedCache[cacheKey]) {
            setCapsules(feedCache[cacheKey]);
            setLoading(false);
            return;
        }

        if (!refreshing) setLoading(true);

        // Use cached session (no extra network round-trip)
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) {
            setLoading(false);
            setRefreshing(false);
            return;
        }
        setCurrentUserId(user.id);

        const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', user.id);
        const followingIds = (follows || []).map(f => f.following_id);

        // 1. Prepare Capsule Query
        let capsQuery = supabase.from('capsules').select(`
            *,
            profiles:owner_id (username, display_name, avatar_url)
        `).neq('owner_id', user.id);

        if (tab === 'explore') {
            capsQuery = capsQuery.eq('is_public', true);
        }

        if (activeFilter !== 'all' && activeFilter !== 'today') {
            capsQuery = capsQuery.eq('type', activeFilter);
        }

        if (activeFilter === 'today') {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date();
            endOfDay.setHours(23, 59, 59, 999);
            capsQuery = capsQuery.gte('opens_at', startOfDay.toISOString()).lte('opens_at', endOfDay.toISOString());
        }

        if (tab === 'following') {
            if (followingIds.length > 0) {
                capsQuery = capsQuery.in('owner_id', followingIds);
            } else {
                setCapsules([]);
                setLoading(false);
                setRefreshing(false);
                return;
            }
        } else if (tab === 'explore' && followingIds.length > 0) {
            capsQuery = capsQuery.not('owner_id', 'in', `(${followingIds.join(',')})`);
        }

        // 2. Prepare Activity Query
        let itemsQuery = supabase.from('capsule_items')
            .select(`
                *,
                profiles:owner_id (username, display_name, avatar_url),
                capsules:capsule_id!inner (title, is_public, type, status, opens_at, model, chain_id)
            `)
            .in('media_type', ['image', 'video']);

        if (tab === 'explore') {
            itemsQuery = itemsQuery.eq('capsules.is_public', true);
        }

        if (tab === 'following') {
            itemsQuery = itemsQuery.in('owner_id', followingIds);
        } else {
            itemsQuery = itemsQuery.neq('owner_id', user.id);
            if (followingIds.length > 0) {
                itemsQuery = itemsQuery.not('owner_id', 'in', `(${followingIds.join(',')})`);
            }
        }

        if (activeFilter !== 'all' && activeFilter !== 'today') {
            itemsQuery = itemsQuery.eq('capsules.type', activeFilter);
        }

        if (activeFilter === 'today') {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date();
            endOfDay.setHours(23, 59, 59, 999);
            itemsQuery = itemsQuery.gte('capsules.opens_at', startOfDay.toISOString()).lte('capsules.opens_at', endOfDay.toISOString());
        }

        // 3. Run queries in parallel
        const [capsResponse, itemsResponse] = await Promise.all([
            capsQuery.order('created_at', { ascending: false }).limit(40),
            itemsQuery.order('created_at', { ascending: false }).limit(40)
        ]);

        const capsData = capsResponse.data || [];
        const activityData = itemsResponse.data || [];

        // Group activity items by capsule and time proximity (1 hour for deduplication)
        const groupedActivity: any[] = [];
        const activityProcessed = new Set();
        const THRESHOLD = 60 * 60 * 1000; // 1 hour threshold for grouping/dedup

        activityData.forEach((item, idx) => {
            if (activityProcessed.has(item.id)) return;

            const group = [item];
            activityProcessed.add(item.id);

            const isVisualMedia = item.media_type === 'image' || item.media_type === 'video';

            // Look ahead for similar items
            if (isVisualMedia) {
                for (let j = idx + 1; j < activityData.length; j++) {
                    const nextItem = activityData[j];
                    const timeDiff = Math.abs(new Date(item.created_at).getTime() - new Date(nextItem.created_at).getTime());

                    if (nextItem.capsule_id === item.capsule_id &&
                        timeDiff < THRESHOLD &&
                        (nextItem.media_type === 'image' || nextItem.media_type === 'video')) {
                        group.push(nextItem);
                        activityProcessed.add(nextItem.id);
                    }
                }
            }

            if (group.length > 1) {
                groupedActivity.push({
                    ...item,
                    feedType: 'activity_group',
                    groupItems: group,
                    count: group.length
                });
            } else {
                groupedActivity.push({ ...item, feedType: 'activity' });
            }
        });

        const merged = [
            ...capsData.map(c => ({ ...c, feedType: 'capsule' })),
            ...groupedActivity
        ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        // Deduplicate: If an activity item exists for a capsule, REMOVE the generic "New Capsule" post
        // We do this by checking if any item in groupedActivity references the capsule.id
        const finalMerged = merged.filter((item) => {
            if (item.feedType === 'capsule') {
                const activityExists = groupedActivity.some(act => {
                    const actCapId = act.capsule_id?.toString();
                    const itemId = item.id?.toString();
                    return actCapId && itemId && actCapId === itemId;
                });

                // If there's an activity post for this capsule, we hide the generic creation post.
                // This is unless the capsule is very old or has no media (but groupedActivity only has media)
                return !activityExists;
            }
            return true;
        });

        setCapsules(finalMerged);
        setFeedCache(prev => ({ ...prev, [cacheKey]: finalMerged }));
        setLoading(false);
        setRefreshing(false);
    };

    const loadStories = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const [storiesRes, readsRes] = await Promise.all([
            supabase.from('capsule_items')
                .select(`
                    *,
                    profiles:owner_id(username, avatar_url, id),
                    capsules:capsule_id(id, title, model)
                `)
                .eq('is_story', true)
                .gt('expires_at', new Date().toISOString())
                .order('created_at', { ascending: false }),
            supabase.from('story_reads').select('story_id').eq('user_id', user.id)
        ]);

        const data = storiesRes.data;
        const readIds = new Set((readsRes.data || []).map(r => r.story_id));

        if (data) {
            // Group stories by user (like Instagram)
            const usersWithStories: any[] = [];
            data.forEach(s => {
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
                const isMineA = a.owner_id === user.id;
                const isMineB = b.owner_id === user.id;
                if (isMineA && !isMineB) return -1;
                if (!isMineA && isMineB) return 1;

                if (a.all_read !== b.all_read) return a.all_read ? 1 : -1;
                return 0;
            });

            setStories(sorted);
            const mine = sorted.find(u => u.owner_id === user.id);
            setMyStory(mine || null);
        }
    };





    const handleYourCapPress = async () => {
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
                    Alert.alert('Cooldown', 'You recently rejected a sealed story. You must wait 48 hours before posting another one.');
                    return;
                }
            }

            const { data } = await supabase.from('capsules').select('*').eq('owner_id', currentUserId);
            if (data && data.length > 0) {
                setUserCapsules(data);
                setPickerStep('list');
                setShowCapsulePicker(true);
            } else {
                Alert.alert("No Capsules", "You need to create a capsule with photos first!");
            }
        }
    };

    const handleSelectCapsuleForPicker = async (capsule: any) => {
        setSelectedPickerCapsule(capsule);
        const { data: items } = await supabase.from('capsule_items')
            .select('*')
            .eq('capsule_id', capsule.id)
            .eq('media_type', 'image');

        if (!items || items.length === 0) {
            Alert.alert('Empty Capsule', 'Please choose a capsule that has at least one photo.');
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
        await supabase.from('profiles').update({ story_cooldown_until: cooldownDate.toISOString() }).eq('id', currentUserId);

        setPickerStep('list');
        setShowCapsulePicker(false);
        Alert.alert('Story Cooldown Active', 'You declined to share this sealed memory. You cannot post a story for 48 hours.');
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
            content_type: item.content_type || 'image',
            is_story: true,
            is_mystery: isMystery,
            expires_at: expiresAt.toISOString()
        });


        if (!error) {
            setShowCapsulePicker(false);
            loadStories();
        } else {
            Alert.alert('Error', 'Could not share story.');
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


    useEffect(() => {
        const initTab = async () => {
            // Use cached session (fast, no network) instead of slow getUser()
            const { data: { session } } = await supabase.auth.getSession();
            const user = session?.user;
            if (user) {
                setCurrentUserId(user.id);
                const { count } = await supabase
                    .from('follows')
                    .select('*', { count: 'exact', head: true })
                    .eq('follower_id', user.id);
                // Determine correct tab
                const correctTab: FeedTab = count && count > 0 ? 'following' : 'explore';
                setActiveTab(correctTab);
                // Load with the correct tab immediately (no race condition)
                loadFeed(false, correctTab);
                loadStories();
            }
        };
        initTab();
    }, []);

    useEffect(() => {
        // Only re-load when user manually changes tab/filter (not on init, which is handled above)
        if (currentUserId) {
            loadFeed();
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

            // Check each conversation: is there a message from others after our last visit?
            let foundUnread = false;
            for (const conv of myConvs) {
                const lastVisited = await AsyncStorage.getItem(`chat_visited_${conv.conversation_id}`);
                const { data: lastMsg } = await supabase
                    .from('messages')
                    .select('created_at, sender_id')
                    .eq('conversation_id', conv.conversation_id)
                    .neq('sender_id', user.id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (lastMsg) {
                    if (!lastVisited || new Date(lastMsg.created_at) > new Date(lastVisited)) {
                        foundUnread = true;
                        break;
                    }
                }
            }
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

    const onRefresh = () => {
        setRefreshing(true);
        loadFeed(true);
        loadStories();
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

            <View style={[styles.header, { paddingTop: insets.top + 15 }]}>
                <View style={styles.headerContent}>
                    <View style={styles.logoContainer}>
                        <Image
                            source={{ uri: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/website/Logomain.png' }}
                            style={styles.logo}
                            resizeMode="contain"
                        />
                        <Text style={styles.logoText}>kapsely</Text>
                    </View>
                    <View style={styles.headerActions}>
                        <TouchableOpacity
                            style={styles.iconBtn}
                            onPress={() => {
                                if (tutorialStep === 'PRESS_PLUS') {
                                    setTutorialStep('POST_YOURCAP');
                                }
                                navigation.navigate('CreateSelection', { isTutorial: tutorialStep === 'PRESS_PLUS' });
                            }}
                        >
                            <Ionicons name="add-circle-outline" size={26} color={Colors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Search')}>
                            <Ionicons name="search-outline" size={22} color={Colors.textPrimary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => navigation.navigate('ChatList')}
                            activeOpacity={0.8}
                        >
                            <LinearGradient
                                colors={[Colors.primary, Colors.primaryDark]}
                                style={[styles.notifIcon, hasUnread && styles.notifIconUnread]}
                            >
                                <Ionicons name="chatbubble-ellipses" size={16} color="#fff" />
                                {hasUnread && <View style={styles.notifBadge} />}
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.tabRow}>
                    {(['following', 'explore'] as FeedTab[]).map((t_key) => (
                        <TouchableOpacity key={t_key} style={styles.tabItem} onPress={() => setActiveTab(t_key)} activeOpacity={0.7}>
                            <Text style={[styles.tabText, activeTab === t_key && styles.tabTextActive]}>
                                {t_key === 'following' ? t('feed.following') : t('feed.explore')}
                            </Text>
                            {activeTab === t_key && <View style={styles.tabUnderline} />}
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            <FlatList
                data={capsules}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                refreshing={refreshing}
                onRefresh={onRefresh}
                ListHeaderComponent={() => (
                    <>
                        <View style={styles.filterSection}>
                            <TouchableOpacity
                                onPress={() => setActiveFilter(activeFilter === 'today' ? 'all' : 'today')}
                                activeOpacity={0.8}
                                style={styles.todayBtnWrap}
                            >
                                <LinearGradient
                                    colors={activeFilter === 'today' ? ['#FF416C', '#FF4B2B'] : [Colors.surface, Colors.surface]}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={[styles.todayPill, activeFilter !== 'today' && styles.todayPillInactive]}
                                >
                                    <Ionicons name="time" size={16} color={activeFilter === 'today' ? '#fff' : '#FF416C'} />
                                    <View>
                                        <Text style={[styles.todayLabel, activeFilter === 'today' && { color: '#fff' }]}>{t('feed.opens_today')}</Text>
                                        {activeFilter === 'today' && <View style={styles.todayActiveDot} />}
                                    </View>
                                </LinearGradient>
                            </TouchableOpacity>

                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsRow} contentContainerStyle={styles.pillsContent}>
                                <CapsuleTypePill type="all" label={t('feed.all')} isActive={activeFilter === 'all'} onPress={() => setActiveFilter('all')} />
                                <CapsuleTypePill type="instacap" label="InstaCap" isActive={activeFilter === 'instacap'} onPress={() => setActiveFilter('instacap')} />
                                <CapsuleTypePill type="eventcap" label="EventCap" isActive={activeFilter === 'eventcap'} onPress={() => setActiveFilter('eventcap')} />
                                <CapsuleTypePill type="legacycap" label="LegacyCap" isActive={activeFilter === 'legacycap'} onPress={() => setActiveFilter('legacycap')} />
                            </ScrollView>
                        </View>

                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.storiesRow} contentContainerStyle={styles.storiesContent}>
                            <TouchableOpacity style={styles.storyItem} onPress={handleYourCapPress}>
                                {myStory ? (
                                    <LinearGradient colors={['#8E2DE2', '#4A00E0']} style={styles.storyRing}>
                                        <View style={styles.storyAvatarWrap}>
                                            <Image source={{ uri: myStory.avatar_url || 'https://via.placeholder.com/150' }} style={styles.storyAvatar} />
                                        </View>
                                    </LinearGradient>
                                ) : (
                                    <View style={styles.addStoryPlaceholder}>
                                        <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.addStoryBtn}>
                                            <Ionicons name="add" size={24} color="#fff" />
                                        </LinearGradient>
                                    </View>
                                )}
                                <Text style={styles.storyLabel}>Your Cap</Text>
                            </TouchableOpacity>

                            {stories.filter(u => u.owner_id !== currentUserId).map((u) => (
                                <TouchableOpacity key={u.owner_id} style={styles.storyItem} onPress={() => { setActiveStory(u); setActiveStoryIndex(0); }}>
                                    {u.all_read ? (
                                        <View style={[styles.storyRing, { backgroundColor: Colors.border, padding: 2 }]}>
                                            <View style={styles.storyAvatarWrap}>
                                                <Image source={{ uri: u.avatar_url || 'https://via.placeholder.com/150' }} style={styles.storyAvatar} />
                                            </View>
                                        </View>
                                    ) : (
                                        <LinearGradient colors={['#f09433', '#e6683c', '#dc2743', '#cc2366', '#bc1888']} style={styles.storyRing}>
                                            <View style={styles.storyAvatarWrap}>
                                                <Image source={{ uri: u.avatar_url || 'https://via.placeholder.com/150' }} style={styles.storyAvatar} />
                                            </View>
                                        </LinearGradient>
                                    )}
                                    <Text style={[styles.storyLabel, u.all_read && { color: Colors.textMuted }]} numberOfLines={1}>{u.username ?? 'user'}</Text>
                                </TouchableOpacity>
                            ))}

                        </ScrollView>

                        {loading && !refreshing && (
                            <View style={{ paddingTop: insets.top + 15 }}>
                                <ActivityIndicator color={Colors.primary} />
                            </View>
                        )}
                    </>
                )}
                renderItem={({ item }) => (
                    item.feedType === 'capsule'
                        ? <CapsuleCard capsule={item} />
                        : <TimelineActivity item={item} />
                )}
                ListEmptyComponent={() => !loading && (
                    <View style={styles.emptyState}>
                        <Ionicons name="lock-closed-outline" size={48} color={Colors.textMuted} />
                        <Text style={styles.emptyText}>{t('feed.no_capsules_yet')}</Text>
                    </View>
                )}
            />

            {/* Capsule Picker Modal */}
            <Modal visible={showCapsulePicker} transparent animationType="slide">
                <View style={styles.pickerOverlay}>
                    <View style={styles.pickerContent}>
                        <View style={styles.pickerHeader}>
                            {pickerStep !== 'list' && (
                                <TouchableOpacity onPress={() => setPickerStep('list')} style={styles.pickerBack}>
                                    <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
                                </TouchableOpacity>
                            )}
                            <Text style={styles.pickerTitle}>
                                {pickerStep === 'list' ? 'Share to Your Cap' :
                                    pickerStep === 'select' ? 'Choose Image' : 'Discovering...'}
                            </Text>
                            <TouchableOpacity onPress={() => setShowCapsulePicker(false)}>
                                <Ionicons name="close" size={24} color={Colors.textMuted} />
                            </TouchableOpacity>
                        </View>

                        {pickerStep === 'list' && (
                            <ScrollView>
                                {userCapsules.map(cap => (
                                    <TouchableOpacity key={cap.id} style={styles.pickerItem} onPress={() => handleSelectCapsuleForPicker(cap)}>
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
                                    <TouchableOpacity style={styles.pickerGridItem} onPress={() => confirmStory(item)}>
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
                                            <TouchableOpacity style={styles.cancelPreview} onPress={rejectRandomStory}>
                                                <Text style={styles.cancelPreviewText}>Cancel</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity style={styles.confirmPreview} onPress={() => confirmStory(randomPreviewItem)}>
                                                <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.confirmBtnGradient}>
                                                    <Text style={styles.confirmBtnText}>Add to Story</Text>
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
    header: {
        backgroundColor: Colors.surface,
        borderBottomWidth: 1, borderBottomColor: Colors.border,
        ...Shadow.card,
    },
    headerContent: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: Spacing.md, paddingVertical: 12,
    },
    logoContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    logo: { width: 32, height: 32 },
    logoText: { color: Colors.textPrimary, fontSize: 20, fontFamily: Fonts.bold, letterSpacing: -0.5 },
    headerActions: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
    iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    notifIcon: {
        width: 36,
        height: 36,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        ...Shadow.subtle,
    },
    notifIconUnread: {
        transform: [{ scale: 1.05 }],
    },
    notifBadge: {
        position: 'absolute',
        top: -2,
        right: -2,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: Colors.error,
        borderWidth: 2,
        borderColor: Colors.surface,
        ...Shadow.primary,
    },
    tabRow: { flexDirection: 'row', paddingHorizontal: Spacing.lg },
    tabItem: { marginRight: Spacing.xl, paddingBottom: 10, position: 'relative' },
    tabText: { color: Colors.textMuted, fontSize: 14, fontFamily: Fonts.semiBold },
    tabTextActive: { color: Colors.textPrimary },
    tabUnderline: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: Colors.primary, borderRadius: 1 },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 100 },
    filterSection: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm },
    todayBtnWrap: { marginLeft: Spacing.md, borderRadius: 20, ...Shadow.subtle },
    todayPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, gap: 6 },
    todayPillInactive: { borderWidth: 1.5, borderColor: Colors.border },
    todayLabel: { fontSize: 13, fontFamily: Fonts.bold, color: '#FF416C' },
    todayActiveDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#fff', marginTop: 2, alignSelf: 'center' },
    pillsRow: { flex: 1, marginVertical: 0 },
    pillsContent: { paddingHorizontal: Spacing.sm },
    storiesRow: { marginBottom: Spacing.md },
    storiesContent: { paddingHorizontal: Spacing.md, gap: Spacing.md },
    storyItem: { alignItems: 'center', gap: 5, marginRight: Spacing.sm, width: 70 },
    addStoryPlaceholder: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
    addStoryBtn: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', ...Shadow.primary },
    storyRing: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', padding: 2 },
    storyAvatarWrap: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
    storyAvatar: { width: 56, height: 56, borderRadius: 28 },
    storyLabel: { color: Colors.textMuted, fontSize: 10, fontFamily: Fonts.medium, marginTop: 4, width: '100%', textAlign: 'center' },
    emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: Spacing.sm },
    emptyText: { color: Colors.textSecondary, fontSize: 16, fontFamily: Fonts.semiBold },

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

    floatingCapsule: {
        position: 'absolute', bottom: 100, alignSelf: 'center',
        borderRadius: 25, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    },
    blurCapsule: { paddingHorizontal: 20, paddingVertical: 10 },
    floatingCapsuleInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    floatingModelImg: { width: 28, height: 28 },
    floatingModelText: { color: '#fff', fontSize: 14, fontFamily: Fonts.bold },
});

