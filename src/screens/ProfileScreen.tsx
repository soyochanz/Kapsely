import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Image, StatusBar, Dimensions, ActivityIndicator, Modal, RefreshControl,
    Linking, Alert, Pressable, Animated, Easing, Platform, FlatList
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';
import { Colors, Fonts, Spacing, BorderRadius, Shadow } from '../theme';
import { supabase } from '../lib/supabase';
import EditProfileScreen from './EditProfileScreen';

const { width } = Dimensions.get('window');

import { MODEL_IMAGES, MODEL_TINTS, MODEL_IMAGES_OPEN } from '../constants/models';

import LiveTimer from '../components/LiveTimer';
import CapsuleWithTimer from '../components/CapsuleWithTimer';
import VerifiedBadge from '../components/VerifiedBadge';
import { timerConfigManager } from '../utils/timerConfig';
import StoryViewer from '../components/StoryViewer';


type ProfileTab = 'all' | 'opened' | 'sealed';

const TYPE_CONFIG = (t: any): Record<string, { icon: string; color: string; label: string }> => ({
    instacap: { icon: 'camera', color: Colors.instaCap, label: t('create.instacap_label') },
    eventcap: { icon: 'calendar', color: Colors.eventCap, label: t('create.eventcap_label') },
    legacycap: { icon: 'time', color: Colors.legacyCap, label: t('create.legacycap_label') },
});

const STICKER_POSITIONS = [
    { top: 40, left: 20, size: 70, rotation: '-15deg' },   // 1: Top Left
    { top: 25, left: width * 0.4, size: 90, rotation: '5deg' },  // 2: Top Center
    { top: 45, right: 30, size: 75, rotation: '12deg' },   // 3: Top Right
    { top: 120, left: 35, size: 65, rotation: '-8deg' },  // 4: Bottom Left
    { top: 115, right: 40, size: 85, rotation: '18deg' },  // 5: Bottom Right
];

// Extract capsule rendering to a memoized component for fluidity
const ProfileCapsuleCell = React.memo(({
    cap,
    navigation,
    isOwnProfile,
    isSealed,
    cfg,
    coverUrl,
    itemsCount,
    likesCount,
    commentsCount,
    setPickerCapsuleId,
    themeColor,
    capsuleMediaMap,
    t
}: any) => {
    const [modelImg, setModelImg] = useState(() => {
        return isSealed
            ? (timerConfigManager.getModelImage(cap.model) || MODEL_IMAGES[cap.model] || (MODEL_IMAGES as any).basicred_kap)
            : (timerConfigManager.getModelImageOpen(cap.model) || MODEL_IMAGES_OPEN[cap.model] || MODEL_IMAGES[cap.model] || (MODEL_IMAGES as any).basicred_kap);
    });

    useEffect(() => {
        const updateModel = () => {
            const nextImg = isSealed
                ? (timerConfigManager.getModelImage(cap.model) || MODEL_IMAGES[cap.model] || (MODEL_IMAGES as any).basicred_kap)
                : (timerConfigManager.getModelImageOpen(cap.model) || MODEL_IMAGES_OPEN[cap.model] || MODEL_IMAGES[cap.model] || (MODEL_IMAGES as any).basicred_kap);
            setModelImg(nextImg);
        };
        const unsubscribe = timerConfigManager.subscribe(updateModel);
        updateModel();
        return unsubscribe;
    }, [cap.model, isSealed]);

    return (
        <TouchableOpacity
            style={[styles.sealedCell, !cap.isAccessible && { opacity: 0.9 }]}
            onPress={() => {
                if (!cap.isAccessible) {
                    Alert.alert(t('profile.private_capsule'), t('profile.private_capsule_msg'));
                    return;
                }
                navigation.navigate('CapsuleDetail', { capsuleId: cap.id });
            }}
            onLongPress={() => cap.isAccessible && !isSealed && isOwnProfile && capsuleMediaMap[cap.id]?.length > 1 && setPickerCapsuleId(cap.id)}
            delayLongPress={400}
        >
            <View style={styles.sealedCellInner}>
                <View style={styles.modelContainer}>
                    {isSealed ? (
                        <CapsuleWithTimer
                            modelKey={cap.model}
                            source={{ uri: modelImg }}
                            date={cap.opens_at}
                            chainId={cap.chain_id}
                            capsuleType={cap.type}
                            style={styles.sealedImgLarge}
                            hideParticles
                        />
                    ) : (
                        <View style={styles.sealedImgLarge}>
                            {coverUrl ? (
                                <Image source={{ uri: coverUrl }} style={styles.gridImgFull} resizeMode="cover" />
                            ) : (
                                <CapsuleWithTimer
                                    modelKey={cap.model}
                                    source={{ uri: modelImg }}
                                    date={cap.opens_at}
                                    chainId={cap.chain_id}
                                    capsuleType={cap.type}
                                    style={styles.gridImg}
                                    hideTimer={true}
                                    hideParticles
                                />
                            )}
                        </View>
                    )}

                    <View style={[styles.cornerTypeIcon, { backgroundColor: cfg.color }]}>
                        <Ionicons name={cfg.icon as any} size={10} color="#fff" />
                    </View>

                    {cap.is_shared && (
                        <View style={styles.sharedBadge}>
                            <Ionicons name="people" size={10} color="#fff" />
                            <Text style={styles.sharedBadgeText}>{t('common.shared')}</Text>
                        </View>
                    )}

                    {isSealed && (
                        <View style={styles.sealedBadgeSmall}>
                            <Ionicons name="lock-closed" size={10} color="#fff" />
                        </View>
                    )}


                </View>

                {isSealed ? (
                    <LiveTimer date={cap.opens_at} modelId={cap.model} style={styles.sealedTimer} />
                ) : (
                    <Text style={[styles.sealedTimer, { color: Colors.textMuted }]}>{t('common.opened')}</Text>
                )}

                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.sealedTitle} numberOfLines={1}>{cap.title}</Text>
                    {!cap.isAccessible && (
                        <Ionicons name="lock-closed" size={14} color="#ff4757" style={{ marginLeft: 6 }} />
                    )}
                </View>

                <View style={[styles.membersList, !cap.is_shared && { opacity: 0, pointerEvents: 'none' }]}>
                    <View style={styles.avatarStack}>
                        {cap.owner_avatar_url ? (
                            <Image source={{ uri: cap.owner_avatar_url }} style={styles.stackAvatar} />
                        ) : (
                            <View style={[styles.stackAvatar, { backgroundColor: Colors.border, alignItems: 'center', justifyContent: 'center' }]}>
                                <Ionicons name="person" size={10} color={Colors.textMuted} />
                            </View>
                        )}
                    </View>
                    <Text style={styles.membersCountText}>
                        {cap.total_members || 1} {cap.total_members === 1 ? t('common.member') : t('common.members')}
                    </Text>
                </View>

                <View style={styles.sealedMetaRow}>
                    <View style={styles.sealedMetaItem}>
                        <Ionicons name="images-outline" size={12} color={Colors.textMuted} />
                        <Text style={styles.sealedMetaText}>{itemsCount}</Text>
                    </View>
                    <View style={styles.sealedMetaItem}>
                        <Ionicons name="heart-outline" size={12} color={Colors.textMuted} />
                        <Text style={styles.sealedMetaText}>{likesCount}</Text>
                    </View>
                    <View style={styles.sealedMetaItem}>
                        <Ionicons name="chatbubble-outline" size={12} color={Colors.textMuted} />
                        <Text style={styles.sealedMetaText}>{commentsCount}</Text>
                    </View>
                </View>
            </View>
        </TouchableOpacity>
    );
});

export default function ProfileScreen() {
    const insets = useSafeAreaInsets();
    const { t, i18n } = useTranslation();
    const navigation = useNavigation<any>();
    const route = useRoute();
    // Target user ID from route params (if navigating to another profile)
    // We check both params and the route name to be sure
    const targetUserId = (route.params as any)?.targetUserId;
    // We'll use a local ID for the profile we want to load
    const [profileId, setProfileId] = useState<string | null>(targetUserId || null);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [isOwnProfile, setIsOwnProfileState] = useState(true); // Default to true, re-evaluate in loadData

    const [activeTab, setActiveTab] = useState<ProfileTab>('all');
    const [profile, setProfile] = useState<any>(null);
    const [openedCaps, setOpenedCaps] = useState<any[]>([]);
    const [sealedCaps, setSealedCaps] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [showEdit, setShowEdit] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showLanguageSettings, setShowLanguageSettings] = useState(false);
    const [showPrivacy, setShowPrivacy] = useState(false);
    const [showTerms, setShowTerms] = useState(false);

    const [followersCount, setFollowersCount] = useState(0);
    const [followingCount, setFollowingCount] = useState(0);
    const [isFollowing, setIsFollowing] = useState(false);

    // Media covers for opened capsules
    const [capsuleMediaMap, setCapsuleMediaMap] = useState<Record<string, any[]>>({});
    const [coverMap, setCoverMap] = useState<Record<string, string>>({});
    const [pickerCapsuleId, setPickerCapsuleId] = useState<string | null>(null);

    const [showVerificationFeedback, setShowVerificationFeedback] = useState(false);
    const feedbackAnim = useRef(new Animated.Value(0)).current;

    const [profileStickers, setProfileStickers] = useState<any[]>([]);

    const [userStories, setUserStories] = useState<any>(null);
    const [activeStoryViewer, setActiveStoryViewer] = useState(false);


    useEffect(() => {
        // Quick check for own profile based on session
        const checkOwn = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user?.id) {
                setCurrentUserId(session.user.id);
                if (targetUserId) {
                    setIsOwnProfileState(targetUserId === session.user.id);
                } else {
                    setIsOwnProfileState(true);
                }
            }
        };
        checkOwn();
    }, [targetUserId]);

    const loadData = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const myId = user.id;
        setCurrentUserId(myId);

        // If no target provided or it is my own ID, we are on our own profile
        const idToLoad = targetUserId || myId;
        setProfileId(idToLoad);
        const own = idToLoad === myId;
        setIsOwnProfileState(own);

        console.log('ProfileScreen: loading profile for', idToLoad, 'isOwn:', own);

        const [profileRes, capsRes, followersRes, followingRes, followCheck, storiesRes, readsRes, myInvitesRes] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', idToLoad).maybeSingle(),
            // Query capsules where target user is owner or participant
            supabase.rpc('get_user_capsules_v2', { target_user_id: idToLoad }),
            supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', idToLoad),
            supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', idToLoad),
            targetUserId ? supabase.from('follows').select('*').eq('follower_id', user.id).eq('following_id', targetUserId).maybeSingle() : { data: null },
            supabase.from('capsule_items')
                .select(`
                    *,
                    capsules:capsule_id(id, title, model)
                `)
                .eq('owner_id', idToLoad)
                .eq('is_story', true)
                .gt('expires_at', new Date().toISOString())
                .order('created_at', { ascending: false }),
            supabase.from('story_reads').select('story_id').eq('user_id', myId),
            supabase.from('capsule_invites').select('capsule_id').eq('user_id', myId).eq('status', 'accepted')
        ]);
        
        const storiesData = storiesRes.data || [];
        const readIds = new Set((readsRes.data || []).map(r => r.story_id));

        
        if (storiesData.length > 0) {
            const storiesWithRead = storiesData.map(s => ({ ...s, is_read: readIds.has(s.id) }));
            const allRead = storiesWithRead.every(s => s.is_read);
            setUserStories({
                owner_id: idToLoad,
                username: profileRes.data?.username,
                avatar_url: profileRes.data?.avatar_url,
                stories: storiesWithRead,
                all_read: allRead
            });
        } else {
            setUserStories(null);
        }

        const myAcceptedCaps = new Set((myInvitesRes.data || []).map(i => i.capsule_id));


        if (profileRes.data) setProfile(profileRes.data);
        if (capsRes.data) {
            const all = capsRes.data || [];

            // Do not filter capsules, but tag them with access info
            const viewable = all.map((c: any) => ({
                ...c,
                isAccessible: own || c.is_public || c.owner_id === user.id || myAcceptedCaps.has(c.id) || (c.invited_user_id === myId && c.invite_status === 'accepted')
            }));

            let opened = viewable.filter((c: any) => c.status === 'opened');
            const sealed = viewable.filter((c: any) => c.status === 'sealed');

            // Auto-delete empty opened capsules after 24h
            if (own) {
                const nowMs = Date.now();
                const toDelete = opened.filter((c: any) => {
                    // Corrected: use capsule_items_count_val from RPC result
                    const itemCount = c.capsule_items_count_val !== undefined ? c.capsule_items_count_val : (c.capsule_items_count || 0);
                    if (itemCount === 0) {
                        const openedSinceMs = nowMs - new Date(c.opens_at).getTime();
                        if (openedSinceMs > 24 * 3600 * 1000) {
                            return true;
                        }
                    }
                    return false;
                });

                if (toDelete.length > 0) {
                    opened = opened.filter((c: any) => !toDelete.includes(c));
                    for (const c of toDelete) {
                        await supabase.from('capsules').delete().eq('id', c.id);
                        await supabase.from('notifications').insert({
                            user_id: user.id,
                            type: 'system',
                            title: t('profile.delete_capsule_notif'),
                            message: t('profile.delete_capsule_msg', { title: c.title }),
                            metadata: { capsule_id: c.id }
                        });
                    }
                }
            }

            setOpenedCaps(opened);
            setSealedCaps(sealed);

            if (opened.length > 0) {
                const { data: mediaItems } = await supabase
                    .from('capsule_items')
                    .select('id, capsule_id, media_url, media_type, created_at')
                    .in('capsule_id', opened.map((c: any) => c.id))
                    .in('media_type', ['image', 'video'])
                    .order('created_at', { ascending: true });

                const mediaMap: Record<string, any[]> = {};
                (mediaItems || []).forEach((item: any) => {
                    if (!mediaMap[item.capsule_id]) mediaMap[item.capsule_id] = [];
                    mediaMap[item.capsule_id].push(item);
                });
                setCapsuleMediaMap(mediaMap);

                const defaultCovers: Record<string, string> = {};
                Object.entries(mediaMap).forEach(([capId, items]) => {
                    if (items[0]?.media_url) defaultCovers[capId] = items[0].media_url;
                });
                setCoverMap(prev => ({ ...defaultCovers, ...prev }));
            }
        }
        setFollowersCount(followersRes.count ?? 0);
        setFollowingCount(followingRes.count ?? 0);
        setIsFollowing(!!followCheck.data);
        setLoading(false);
        setRefreshing(false);
        
        // Load stickers
        const { data: stks } = await supabase
            .from('profile_stickers')
            .select('*, stickers(*)')
            .eq('user_id', idToLoad);
        if (stks) setProfileStickers(stks);
    };

    useEffect(() => {
        loadData();

        // Listen for capsule status changes (unsealing)
        const channel = supabase
            .channel('profile_capsules')
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'capsules'
            }, () => {
                loadData();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [targetUserId, route.params]);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [targetUserId])
    );

    const onRefresh = () => { setRefreshing(true); loadData(); };

    const handleLogout = async () => {
        if (Platform.OS === 'web') {
            const confirmed = window.confirm('Are you sure you want to log out?');
            if (confirmed) {
                setShowSettings(false);
                await supabase.auth.signOut();
            }
            return;
        }

        Alert.alert(
            t('profile.logout'),
            t('profile.logout_confirm'),
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('profile.logout'),
                    style: 'destructive',
                    onPress: async () => {
                        setShowSettings(false);
                        await supabase.auth.signOut();
                    }
                }
            ]
        );
    };

    const handleFollowToggle = async () => {
        if (!currentUserId || !targetUserId) return;
        if (isFollowing) {
            await supabase.from('follows').delete().eq('follower_id', currentUserId).eq('following_id', targetUserId);
            setFollowersCount(prev => prev - 1);
            setIsFollowing(false);
        } else {
            await supabase.from('follows').insert({ follower_id: currentUserId, following_id: targetUserId });
            setFollowersCount(prev => prev + 1);
            setIsFollowing(true);
            
            // Notify the user being followed
            await supabase.from('notifications').insert({
                user_id: targetUserId,
                sender_id: currentUserId,
                type: 'follow',
                message: t('common.started_following_you'),
            });
        }
    };

    const handleRequestVerification = async () => {
        if (!currentUserId || profile?.verification_status === 'pending' || profile?.verification_status === 'verified') return;

        // Optimistic UI + Animation
        setShowVerificationFeedback(true);
        Animated.sequence([
            Animated.timing(feedbackAnim, { toValue: 1, duration: 600, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
            Animated.delay(2000),
            Animated.timing(feedbackAnim, { toValue: 0, duration: 400, useNativeDriver: true })
        ]).start(() => setShowVerificationFeedback(false));

        const { data: admins } = await supabase.from('profiles').select('id').eq('is_admin', true).limit(1);
        const adminId = admins?.[0]?.id;
        if (adminId) {
            await supabase.from('notifications').insert({
                user_id: adminId,
                sender_id: currentUserId,
                type: 'system',
                message: `@${profile?.username || 'User'} requested verification.`
            });
        }
        await supabase.from('profiles').update({ verification_status: 'pending' }).eq('id', currentUserId);
        setProfile({ ...profile, verification_status: 'pending' });
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.centered]}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    const joinYear = profile?.created_at ? new Date(profile.created_at).getFullYear() : '—';

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />

            {/* Verification Success Animation Overlay */}
            {showVerificationFeedback && (
                <Animated.View style={[styles.feedbackOverlay, { opacity: feedbackAnim, transform: [{ scale: feedbackAnim }] }]}>
                    <View style={styles.feedbackCard}>
                        <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.feedbackIcon}>
                            <Ionicons name="checkmark-circle" size={40} color="#fff" />
                        </LinearGradient>
                        <Text style={styles.feedbackTitle}>{t('profile.request_sent')}</Text>
                        <Text style={styles.feedbackSubtitle}>{t('profile.reviewing_profile')}</Text>
                    </View>
                </Animated.View>
            )}

            {/* Edit Profile Modal */}
            <Modal visible={showEdit} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowEdit(false)}>
                <EditProfileScreen onClose={() => { setShowEdit(false); loadData(); }} />
            </Modal>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
            >
                <LinearGradient
                    colors={[
                        profile?.favorite_color ? `${profile.favorite_color}cc` : Colors.primaryDark,
                        profile?.favorite_color || Colors.primary,
                        profile?.favorite_color ? `${profile.favorite_color}88` : Colors.primaryLight
                    ]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={styles.banner}
                >
                    <View style={styles.bannerCircle1} />
                    <View style={styles.bannerCircle2} />
                        {/* Stickers Overlay */}
                        <View style={[StyleSheet.absoluteFill, { overflow: 'visible', pointerEvents: 'none' }]}>
                            {profileStickers.map((ps: any) => {
                                const posConfig = STICKER_POSITIONS[ps.position - 1] || STICKER_POSITIONS[0];
                                const { size, rotation, ...pos } = posConfig;
                                return ( ps.stickers?.image_url && (
                                    <Image 
                                        key={ps.id}
                                        source={{ uri: ps.stickers.image_url }}
                                        style={[
                                            styles.bannerSticker, 
                                            pos, 
                                            { width: size, height: size, transform: [{ rotate: rotation }] }
                                        ]}
                                        resizeMode="contain"
                                    />
                                ));
                            })}
                        </View>

                        <View style={[styles.bannerActions, { paddingTop: insets.top + 20 }]}>
                            {targetUserId && (
                                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                                    <Ionicons name="chevron-back" size={24} color="#fff" />
                                </TouchableOpacity>
                            )}
                            
                            <View style={{ flex: 1 }} />
                            {isOwnProfile && (
                                <TouchableOpacity style={styles.settingsBtn} onPress={() => setShowSettings(true)}>
                                    <Ionicons name="settings-outline" size={22} color="#fff" />
                                </TouchableOpacity>
                            )}
                        </View>
                </LinearGradient>

                <View style={styles.avatarStatsRow}>
                    <TouchableOpacity 
                        style={styles.avatarRing} 
                        disabled={!userStories}
                        onPress={() => setActiveStoryViewer(true)}
                    >
                        {userStories ? (
                            userStories.all_read ? (
                                <View style={[styles.avatarRingInner, { backgroundColor: profile?.favorite_color || '#a180fb', padding: 1.5 }]}>
                                    {profile?.avatar_url
                                        ? <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
                                        : <View style={[styles.avatar, styles.avatarPlaceholder]}>
                                            <Ionicons name="person" size={30} color={Colors.primary} />
                                        </View>
                                    }
                                </View>
                            ) : (
                                <LinearGradient colors={[Colors.accent, profile?.favorite_color || '#a180fb']} style={styles.avatarRingInner}>
                                    {profile?.avatar_url
                                        ? <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
                                        : <View style={[styles.avatar, styles.avatarPlaceholder]}>
                                            <Ionicons name="person" size={30} color={Colors.primary} />
                                        </View>
                                    }
                                </LinearGradient>
                            )
                        ) : (
                            <View style={[styles.avatarRingInner, { backgroundColor: profile?.favorite_color || '#a180fb', padding: 1.5 }]}>
                                {profile?.avatar_url
                                    ? <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
                                    : <View style={[styles.avatar, styles.avatarPlaceholder]}>
                                        <Ionicons name="person" size={30} color={Colors.primary} />
                                    </View>
                                }
                            </View>
                        )}
                    </TouchableOpacity>

                    <View style={styles.statsRow}>
                        {[
                            { label: t('profile.followersCount'), value: String(followersCount) },
                            { label: t('profile.followingCount'), value: String(followingCount) },
                            { label: t('profile.openedCapsules'), value: String(openedCaps.length) },
                            { label: t('profile.sealedCapsules'), value: String(sealedCaps.length) },
                        ].map((s) => (
                            <TouchableOpacity
                                key={s.label}
                                style={styles.stat}
                                onPress={() => {
                                    if (s.label === t('profile.followersCount') || s.label === t('profile.followingCount')) {
                                        navigation.push('UserList', {
                                            userId: profileId,
                                            type: s.label === t('profile.followersCount') ? 'followers' : 'following'
                                        });
                                    }
                                }}
                            >
                                <View style={styles.statContent}>
                                    <Text style={styles.statValue}>{s.value}</Text>
                                    <Text style={styles.statLabel}>{s.label}</Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                <View style={styles.userInfo}>
                    <View style={styles.nameRow}>
                        <Text style={styles.displayName}>{profile?.display_name ?? '—'}</Text>
                        {profile?.is_verified && <VerifiedBadge size={18} style={{ marginLeft: 2 }} />}
                    </View>
                    <Text style={styles.handle}>@{profile?.username ?? '—'}</Text>
                    {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

                    <View style={styles.lofiBar}>
                        <Ionicons name="gift-outline" size={14} color={Colors.primary} />
                        <View style={styles.lofiDivider} />
                        {profile?.birthdate ? (
                            <Text style={[styles.lofiText, { color: Colors.textMuted }]}>
                                {new Date(profile.birthdate).toLocaleDateString(i18n.language === 'es' ? 'es-ES' : 'en-US', { day: 'numeric', month: 'long' })}
                            </Text>
                        ) : (
                            <Text style={[styles.lofiText, { color: Colors.textMuted }]}>{t('profile.since')} {joinYear}</Text>
                        )}
                    </View>

                    {/* Favorites Section */}
                    {(profile?.favorite_movie || profile?.favorite_song) && (
                        <View style={styles.favoritesCard}>
                            {profile?.favorite_movie && (
                                <View style={styles.favoriteItem}>
                                    <View style={[styles.favIconBox, { backgroundColor: '#FFEDF6' }]}>
                                        <Ionicons name="film" size={14} color="#F72585" />
                                    </View>
                                    <View>
                                        <Text style={styles.favLabel}>{t('profile.favoriteMovie')}</Text>
                                        <Text style={styles.favValue}>{profile.favorite_movie}</Text>
                                    </View>
                                </View>
                            )}
                            {profile?.favorite_song && (
                                <View style={[styles.favoriteItem, profile?.favorite_movie && { marginTop: 12 }]}>
                                    <View style={[styles.favIconBox, { backgroundColor: '#E0F2FE' }]}>
                                        <Ionicons name="musical-notes" size={14} color="#0EA5E9" />
                                    </View>
                                    <View>
                                        <Text style={styles.favLabel}>{t('profile.favoriteSong')}</Text>
                                        <Text style={styles.favValue}>{profile.favorite_song}</Text>
                                    </View>
                                </View>
                            )}
                        </View>
                    )}
                </View>

                <View style={styles.actionButtons}>
                    {isOwnProfile ? (
                        <View style={{ flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                            <TouchableOpacity style={styles.pillActionBtn} onPress={() => setShowEdit(true)} activeOpacity={0.8}>
                                <LinearGradient colors={[Colors.primary, Colors.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.pillGradient}>
                                    <Ionicons name="create-outline" size={16} color="#fff" />
                                    <Text style={styles.pillBtnText}>{t('profile.editProfile')}</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                            {profile?.is_admin && (
                                <TouchableOpacity style={styles.pillIconBtn} activeOpacity={0.7} onPress={() => navigation.navigate('TimerConfig')}>
                                    <Ionicons name="options-outline" size={18} color={Colors.textSecondary} />
                                </TouchableOpacity>
                            )}
                        </View>
                    ) : (
                        <>
                            <TouchableOpacity style={styles.pillActionBtn} onPress={handleFollowToggle} activeOpacity={0.8}>
                                <LinearGradient
                                    colors={isFollowing ? ['#f8f9fa', '#e9ecef'] : [Colors.primary, Colors.primaryDark]}
                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                                    style={[styles.pillGradient, isFollowing && { borderWidth: 1, borderColor: Colors.border }]}
                                >
                                    <Ionicons name={isFollowing ? "person-remove-outline" : "person-add-outline"} size={16} color={isFollowing ? Colors.textPrimary : "#fff"} />
                                    <Text style={[styles.pillBtnText, isFollowing && { color: Colors.textPrimary }]}>{isFollowing ? t('profile.followingBtn') : t('profile.followBtn')}</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.pillIconBtn}
                                activeOpacity={0.7}
                                onPress={async () => {
                                    if (!currentUserId || !targetUserId) return;
                                    const { data: myConvos } = await supabase.from('conversation_participants').select('conversation_id').eq('user_id', currentUserId);
                                    const myConvoIds = myConvos?.map(c => c.conversation_id) || [];
                                    let conversationIdToUse = null;
                                    if (myConvoIds.length > 0) {
                                        const { data: sharedConvos } = await supabase.from('conversation_participants').select('conversation_id').eq('user_id', targetUserId).in('conversation_id', myConvoIds);
                                        if (sharedConvos && sharedConvos.length > 0) conversationIdToUse = sharedConvos[0].conversation_id;
                                    }
                                    if (!conversationIdToUse) {
                                        const { data: newConvo } = await supabase.from('conversations').insert({}).select().single();
                                        if (newConvo) {
                                            conversationIdToUse = newConvo.id;
                                            await supabase.from('conversation_participants').insert([{ conversation_id: newConvo.id, user_id: currentUserId }, { conversation_id: newConvo.id, user_id: targetUserId }]);
                                        }
                                    }
                                    if (conversationIdToUse) navigation.navigate('ChatDetail', { conversationId: conversationIdToUse });
                                }}
                            >
                                <Ionicons name="paper-plane-outline" size={18} color={Colors.textSecondary} />
                            </TouchableOpacity>
                        </>
                    )}
                </View>

                <View style={styles.tabsContainer}>
                    <View style={styles.tabsBackground}>
                        {(['all', 'opened', 'sealed'] as ProfileTab[]).map((tab) => {
                            const isActive = activeTab === tab;
                            return (
                                <TouchableOpacity 
                                    key={tab} 
                                    style={[styles.tab, isActive && styles.tabActive]} 
                                    onPress={() => setActiveTab(tab)}
                                    activeOpacity={0.7}
                                >
                                    {isActive && (
                                        <LinearGradient 
                                            colors={[Colors.primary, Colors.primaryDark]} 
                                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                            style={StyleSheet.absoluteFill}
                                        />
                                    )}
                                    <Ionicons 
                                        name={tab === 'all' ? 'albums' : tab === 'opened' ? 'lock-open' : 'lock-closed'} 
                                        size={14} 
                                        color={isActive ? "#fff" : Colors.textMuted} 
                                    />
                                    <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                                        {tab === 'all' ? t('profile.allCapsules') : tab === 'opened' ? t('profile.openedCapsules') : t('profile.sealedCapsules')}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

                <View style={{ flex: 1 }}>
                    <View style={styles.sealedGrid}>
                        <FlatList
                            data={
                                (activeTab === 'all'
                                    ? [...openedCaps, ...sealedCaps].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                                    : activeTab === 'sealed' ? sealedCaps : openedCaps
                                ).sort((a, b) => {
                                    if (a.type === 'legacycap' && b.type !== 'legacycap') return -1;
                                    if (b.type === 'legacycap' && a.type !== 'legacycap') return 1;
                                    return 0;
                                })
                            }
                            keyExtractor={(item) => item.id}
                            numColumns={2}
                            columnWrapperStyle={{ gap: 12 }}
                            contentContainerStyle={{ padding: 12, gap: 12, alignItems: 'flex-start' }}
                            renderItem={({ item }) => (
                                <View style={{ width: (width - 36) / 2 }}>
                                    <ProfileCapsuleCell
                                        cap={item}
                                        navigation={navigation}
                                        isOwnProfile={isOwnProfile}
                                        isSealed={item.status === 'sealed'}
                                        cfg={TYPE_CONFIG(t)[item.type] || TYPE_CONFIG(t).instacap}
                                        coverUrl={coverMap[item.id]}
                                        itemsCount={item.capsule_items_count_val ?? (item.capsule_items_count || 0)}
                                        likesCount={item.likes_count_val ?? (item.likes_count || 0)}
                                        commentsCount={item.comments_count_val ?? (item.comments_count || 0)}
                                        setPickerCapsuleId={setPickerCapsuleId}
                                        themeColor={profile?.favorite_color || Colors.primary}
                                        capsuleMediaMap={capsuleMediaMap}
                                        t={t}
                                    />
                                </View>
                            )}
                        />
                        {((activeTab === 'opened' && openedCaps.length === 0) || (activeTab === 'sealed' && sealedCaps.length === 0)) && (
                            <View style={styles.emptyState}>
                                <Text style={styles.emptyTitle}>{t('profile.noCapsulesFound')}</Text>
                            </View>
                        )}
                    </View>
                </View>
            </ScrollView>

            <Modal visible={pickerCapsuleId !== null} transparent animationType="slide" onRequestClose={() => setPickerCapsuleId(null)}>
                <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setPickerCapsuleId(null)}>
                    <View style={styles.pickerSheet}>
                        <View style={styles.pickerHandle} />
                        <Text style={styles.pickerTitle}>{t('profile.chooseCoverPhoto')}</Text>
                        <Text style={styles.pickerSub}>{t('profile.longPressToSetCover')}</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerRow}>
                            {(pickerCapsuleId ? (capsuleMediaMap[pickerCapsuleId] || []) : []).map((item) => {
                                const isSelected = coverMap[pickerCapsuleId!] === item.media_url;
                                return (
                                    <TouchableOpacity
                                        key={item.id}
                                        style={[styles.pickerThumb, isSelected && styles.pickerThumbSelected]}
                                        onPress={() => {
                                            setCoverMap(prev => ({ ...prev, [pickerCapsuleId!]: item.media_url }));
                                            setPickerCapsuleId(null);
                                        }}
                                    >
                                        <Image source={{ uri: item.media_url }} style={styles.pickerThumbImg} resizeMode="cover" />
                                        {isSelected && <View style={styles.pickerCheckOverlay}><Ionicons name="checkmark-circle" size={28} color="#fff" /></View>}
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>
                </TouchableOpacity>
            </Modal>

            <Modal visible={showSettings} transparent animationType="slide" onRequestClose={() => setShowSettings(false)}>
                <Pressable style={styles.modalOverlay} onPress={() => setShowSettings(false)}>
                    <Pressable style={styles.modalSheet}>
                        <View style={styles.pickerHandle} />
                        <Text style={styles.modalTitle}>{t('profile.settings')}</Text>
                        <TouchableOpacity style={styles.settingsItem} onPress={() => { setShowSettings(false); navigation.navigate('PersonalizeProfile'); }}>
                            <View style={styles.settingsItemIcon}><Ionicons name="sparkles-outline" size={18} color={Colors.primary} /></View>
                            <Text style={styles.settingsItemText}>{t('profile.personalizeProfile')}</Text>
                            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.settingsItem} onPress={() => { setShowSettings(false); setShowEdit(true); }}>
                            <View style={styles.settingsItemIcon}><Ionicons name="person-outline" size={18} color={Colors.textPrimary} /></View>
                            <Text style={styles.settingsItemText}>{t('profile.editProfile')}</Text>
                            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.settingsItem} onPress={() => { setShowSettings(false); setShowLanguageSettings(true); }}>
                            <View style={styles.settingsItemIcon}><Ionicons name="language-outline" size={18} color={Colors.textPrimary} /></View>
                            <Text style={styles.settingsItemText}>{t('profile.language')}</Text>
                            <Text style={styles.settingsItemValue}>{i18n.language === 'es' ? 'Español' : 'English'}</Text>
                            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.settingsItem} onPress={() => Alert.alert(t('profile.security'), t('profile.securityComingSoon'))}>
                            <View style={styles.settingsItemIcon}><Ionicons name="lock-closed-outline" size={18} color={Colors.textPrimary} /></View>
                            <Text style={styles.settingsItemText}>{t('profile.security')}</Text>
                            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.settingsItem, (profile?.verification_status === 'pending' || profile?.verification_status === 'verified') && { opacity: 0.5 }]} onPress={handleRequestVerification} disabled={profile?.verification_status === 'pending' || profile?.verification_status === 'verified'}>
                            <View style={styles.settingsItemIcon}><Ionicons name="checkmark-circle-outline" size={18} color={Colors.primary} /></View>
                            <Text style={styles.settingsItemText}>{profile?.verification_status === 'pending' ? t('profile.verificationPending') : profile?.verification_status === 'verified' ? t('profile.verifiedAccount') : t('profile.requestVerification')}</Text>
                            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.settingsItem} onPress={() => { setShowSettings(false); setShowPrivacy(true); }}>
                            <View style={styles.settingsItemIcon}><Ionicons name="shield-checkmark-outline" size={18} color={Colors.textPrimary} /></View>
                            <Text style={styles.settingsItemText}>{t('profile.privacyPolicy')}</Text>
                            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.settingsItem} onPress={() => { setShowSettings(false); setShowTerms(true); }}>
                            <View style={styles.settingsItemIcon}><Ionicons name="document-text-outline" size={18} color={Colors.textPrimary} /></View>
                            <Text style={styles.settingsItemText}>{t('profile.termsOfUse')}</Text>
                            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.settingsItem, { borderBottomWidth: 0 }]} onPress={handleLogout}>
                            <View style={[styles.settingsItemIcon, { backgroundColor: Colors.error + '10' }]}><Ionicons name="log-out-outline" size={18} color={Colors.error} /></View>
                            <Text style={[styles.settingsItemText, { color: Colors.error, fontFamily: Fonts.bold }]}>{t('profile.logout')}</Text>
                        </TouchableOpacity>
                        <View style={styles.appVersionContainer}><Text style={styles.appVersionText}>kapsely v1.0.1</Text></View>
                    </Pressable>
                </Pressable>
            </Modal>

            <Modal visible={showLanguageSettings} transparent animationType="slide" onRequestClose={() => setShowLanguageSettings(false)}>
                <Pressable style={styles.modalOverlay} onPress={() => setShowLanguageSettings(false)}>
                    <Pressable style={styles.modalSheet}>
                        <View style={styles.pickerHandle} />
                        <View style={styles.modalHeaderRow}>
                            <TouchableOpacity onPress={() => { setShowLanguageSettings(false); setShowSettings(true); }} style={styles.backButton}>
                                <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
                            </TouchableOpacity>
                            <Text style={styles.modalTitleInline}>{t('profile.language')}</Text>
                            <View style={{ width: 20 }} />
                        </View>
                        {[
                            { code: 'en', label: 'English' },
                            { code: 'es', label: 'Español' }
                        ].map((lang) => (
                            <TouchableOpacity 
                                key={lang.code} 
                                style={styles.langItem} 
                                onPress={() => {
                                    i18n.changeLanguage(lang.code);
                                    setShowLanguageSettings(false);
                                    setShowSettings(true);
                                }}
                            >
                                <Text style={styles.settingsItemText}>{lang.label}</Text>
                                {i18n.language === lang.code && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />}
                            </TouchableOpacity>
                        ))}
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Privacy Policy Modal */}
            <Modal visible={showPrivacy} transparent animationType="slide" onRequestClose={() => setShowPrivacy(false)}>
                <Pressable style={styles.modalOverlay} onPress={() => setShowPrivacy(false)}>
                    <Pressable style={[styles.modalSheet, { maxHeight: '80%' }]}>
                        <View style={styles.pickerHandle} />
                        <View style={styles.modalHeaderRow}>
                            <TouchableOpacity onPress={() => { setShowPrivacy(false); setShowSettings(true); }} style={styles.backButton}>
                                <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
                            </TouchableOpacity>
                            <Text style={styles.modalTitleInline}>{t('profile.privacyPolicy')}</Text>
                            <View style={{ width: 20 }} />
                        </View>
                        <ScrollView contentContainerStyle={{ padding: 20 }}>
                            <Text style={styles.legalText}>{t('detail.privacy_content')}</Text>
                        </ScrollView>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Terms of Use Modal */}
            <Modal visible={showTerms} transparent animationType="slide" onRequestClose={() => setShowTerms(false)}>
                <Pressable style={styles.modalOverlay} onPress={() => setShowTerms(false)}>
                    <Pressable style={[styles.modalSheet, { maxHeight: '80%' }]}>
                        <View style={styles.pickerHandle} />
                        <View style={styles.modalHeaderRow}>
                            <TouchableOpacity onPress={() => { setShowTerms(false); setShowSettings(true); }} style={styles.backButton}>
                                <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
                            </TouchableOpacity>
                            <Text style={styles.modalTitleInline}>{t('profile.termsOfUse')}</Text>
                            <View style={{ width: 20 }} />
                        </View>
                        <ScrollView contentContainerStyle={{ padding: 20 }}>
                            <Text style={styles.legalText}>{t('detail.terms_content')}</Text>
                        </ScrollView>
                    </Pressable>
                </Pressable>
            </Modal>

            <StoryViewer 
                visible={activeStoryViewer}
                userGroup={userStories}
                onClose={() => setActiveStoryViewer(false)}
                onStoryRead={async (storyId) => {
                    if (!currentUserId) return;
                    await supabase.from('story_reads').upsert({ user_id: currentUserId, story_id: storyId }, { onConflict: 'user_id,story_id' });
                    // Optimistic update
                    if (userStories) {
                        const updated = userStories.stories.map((s: any) => s.id === storyId ? { ...s, is_read: true } : s);
                        setUserStories({ ...userStories, stories: updated, all_read: updated.every((s: any) => s.is_read) });
                    }
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    centered: { justifyContent: 'center', alignItems: 'center' },
    scrollContent: { paddingBottom: 100 },
    banner: { height: 185 },
    bannerCircle1: { position: 'absolute', top: -30, right: -20, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.12)' },
    bannerCircle2: { position: 'absolute', bottom: -10, left: 30, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.08)' },
    bannerSticker: {
        position: 'absolute',
        width: 44,
        height: 44,
        zIndex: 5,
        ...Shadow.subtle
    },
    avatarSection: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        gap: 20,
        marginTop: -50,
    },
    avatarStatsRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 20,
        gap: 16,
        marginTop: -45,
        paddingBottom: 8,
    },
    avatarRing: {
        width: 90,
        height: 90,
        borderRadius: 45,
        justifyContent: 'center',
        alignItems: 'center',
        ...Shadow.subtle
    },
    avatarRingInner: {
        width: 86,
        height: 86,
        borderRadius: 43,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 2
    },
    avatar: { width: 80, height: 80, borderRadius: 40 },
    avatarPlaceholder: { backgroundColor: Colors.cardAlt, justifyContent: 'center', alignItems: 'center' },
    bannerActions: { paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' },
    backBtn: { width: 40, height: 40, justifyContent: 'center' },
    settingsBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-end' },
    statsRow: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'flex-end',
        paddingBottom: 4,
    },
    stat: { alignItems: 'center', flex: 1 },
    statContent: { alignItems: 'center' },
    statValue: { fontSize: 15, fontFamily: Fonts.bold, color: Colors.textPrimary },
    statLabel: { fontSize: 8, fontFamily: Fonts.medium, color: Colors.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },
    userInfo: { marginTop: 15, paddingHorizontal: 20 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    displayName: { fontSize: 22, fontFamily: Fonts.bold, color: Colors.textPrimary },
    handle: { fontSize: 14, fontFamily: Fonts.medium, color: Colors.textMuted, marginTop: 2 },
    bio: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textSecondary, marginTop: 10, lineHeight: 20 },
    lofiBar: { flexDirection: 'row', alignItems: 'center', marginTop: 15, paddingVertical: 8 },
    lofiDivider: { width: 1, height: 12, backgroundColor: Colors.border, marginHorizontal: 8 },
    lofiText: { fontSize: 11, fontFamily: Fonts.medium, color: Colors.textSecondary },
    pendingBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: Colors.primary + '15',
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        borderColor: Colors.primary + '30',
    },
    pendingText: {
        fontSize: 12,
        fontFamily: Fonts.bold,
        color: Colors.primary,
    },
    feedbackOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.6)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999,
    },
    feedbackCard: {
        width: width * 0.82,
        backgroundColor: Colors.surface,
        borderRadius: 28,
        padding: 24,
        alignItems: 'center',
        ...Shadow.primary,
    },
    feedbackIcon: {
        width: 76,
        height: 76,
        borderRadius: 38,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    feedbackTitle: {
        fontSize: 22,
        fontFamily: Fonts.bold,
        color: Colors.textPrimary,
        marginBottom: 10,
    },
    feedbackSubtitle: {
        fontSize: 15,
        fontFamily: Fonts.medium,
        color: Colors.textSecondary,
        textAlign: 'center',
        lineHeight: 22,
    },
    favoritesCard: {
        marginTop: 20,
        padding: 16,
        backgroundColor: Colors.cardAlt,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    favoriteItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    favIconBox: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    favLabel: { fontSize: 10, fontFamily: Fonts.bold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    favValue: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.textPrimary, marginTop: 1 },
    actionButtons: { flexDirection: 'row', marginTop: 22, gap: 10, paddingHorizontal: 18 },
    pillActionBtn: { flex: 4, borderRadius: 12, height: 44, overflow: 'hidden' },
    pillGradient: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    pillBtnText: { color: 'white', fontSize: 13, fontFamily: Fonts.semiBold, letterSpacing: 0.2 },
    pillIconBtn: { flex: 1, height: 44, borderRadius: 12, backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, ...Shadow.subtle },
    tabsContainer: {
        paddingHorizontal: Spacing.md,
        marginVertical: Spacing.md,
    },
    tabsBackground: {
        flexDirection: 'row',
        backgroundColor: 'rgba(162, 105, 255, 0.08)',
        borderRadius: 25,
        padding: 4,
        gap: 4,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: 22,
        gap: 8,
        overflow: 'hidden',
    },
    tabActive: {
        ...Shadow.primary,
    },
    tabText: {
        fontSize: 13,
        fontFamily: Fonts.medium,
        color: Colors.textMuted,
    },
    tabTextActive: {
        color: '#fff',
        fontFamily: Fonts.bold,
    },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, padding: 2 },
    gridCell: { width: (width - 6) / 3, aspectRatio: 1 },
    gridCellInner: { flex: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 4, overflow: 'hidden', backgroundColor: 'transparent' },
    gridImg: { width: '80%', height: '80%' },
    gridImgFull: { width: '100%', height: '100%' },
    sealedBadgeSmall: { position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 10, padding: 4 },
    pickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    pickerSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingBottom: 40 },
    pickerHandle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, marginBottom: 16 },
    pickerTitle: { fontSize: 16, fontFamily: Fonts.bold, color: Colors.textPrimary, paddingHorizontal: 20, marginBottom: 4 },
    pickerSub: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.textMuted, paddingHorizontal: 20, marginBottom: 16 },
    pickerRow: { paddingHorizontal: 16, gap: 10 },
    pickerThumb: { width: 100, height: 100, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
    pickerThumbSelected: { borderColor: Colors.primary },
    pickerThumbImg: { width: '100%', height: '100%' },
    pickerCheckOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
    sealedGrid: { flex: 1 },
    sealedCell: { flex: 1, height: '100%' },
    sealedCellInner: { flex: 1, alignItems: 'center', backgroundColor: Colors.surface, padding: 12, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, ...Shadow.subtle },
    sealedImgLarge: { width: 120, height: 120, justifyContent: 'center', alignItems: 'center', borderRadius: 12, overflow: 'hidden' },
    sealedTimer: { fontSize: 16, fontFamily: Fonts.bold, color: Colors.primary, marginTop: 12 },
    sealedTitle: { fontSize: 15, fontFamily: Fonts.bold, color: Colors.textPrimary, marginTop: 4, width: '100%', textAlign: 'center' },
    sealedMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 10, width: '100%' },
    sealedMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    sealedMetaText: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.textMuted },
    cornerTypeIconSmall: { position: 'absolute', top: 4, right: 4, width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center', ...Shadow.subtle },
    modelContainer: { position: 'relative', alignItems: 'center', width: '100%' },
    cornerTypeIcon: { position: 'absolute', top: 5, right: 10, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', ...Shadow.subtle },
    emptyState: { padding: 50, alignItems: 'center' },
    emptyTitle: { fontSize: 15, fontFamily: Fonts.medium, color: Colors.textMuted },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
    modalTitle: { fontSize: 18, fontFamily: Fonts.bold, color: Colors.textPrimary, marginBottom: 20 },
    modalHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
    modalTitleInline: { fontSize: 18, fontFamily: Fonts.bold, color: Colors.textPrimary },
    backButton: { padding: 4 },
    settingsItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
    settingsItemIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.cardAlt, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    settingsItemText: { flex: 1, fontSize: 15, fontFamily: Fonts.medium, color: Colors.textPrimary },
    settingsItemValue: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.textMuted, marginRight: 8 },
    appVersionContainer: { alignItems: 'center', marginTop: 30 },
    appVersionText: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.textMuted },
    langItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
    sharedBadge: {
        position: 'absolute',
        top: 6,
        right: 32,
        backgroundColor: Colors.primary,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 10,
        ...Shadow.subtle,
    },
    sharedBadgeText: { fontSize: 9, fontFamily: Fonts.bold, color: "#fff" },
    membersList: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 6,
        backgroundColor: Colors.cardAlt,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        ...Shadow.subtle,
    },
    avatarStack: { flexDirection: 'row', alignItems: 'center' },
    stackAvatar: { width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.background },
    membersCountText: { fontSize: 10, fontFamily: Fonts.medium, color: Colors.textSecondary },
    legalText: {
        fontSize: 14,
        fontFamily: Fonts.regular,
        color: Colors.textSecondary,
        lineHeight: 22,
    },
});

