import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Image, StatusBar, Dimensions, ActivityIndicator, Modal, RefreshControl,
    Linking, Alert, Pressable, Animated, Easing, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Fonts, Spacing, BorderRadius, Shadow } from '../theme';
import { supabase } from '../lib/supabase';
import EditProfileScreen from './EditProfileScreen';

const { width } = Dimensions.get('window');

import { MODEL_IMAGES, MODEL_TINTS, MODEL_IMAGES_OPEN } from '../constants/models';

import LiveTimer from '../components/LiveTimer';
import CapsuleWithTimer from '../components/CapsuleWithTimer';
import VerifiedBadge from '../components/VerifiedBadge';

type ProfileTab = 'all' | 'opened' | 'sealed';

const TYPE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
    instacap: { icon: 'camera', color: Colors.instaCap, label: 'Insta' },
    eventcap: { icon: 'calendar', color: Colors.eventCap, label: 'Event' },
    legacycap: { icon: 'time', color: Colors.legacyCap, label: 'Legacy' },
};

export default function ProfileScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute();
    // Target user ID from route params (if navigating to another profile)
    // We check both params and the route name to be sure
    const targetUserId = (route.params as any)?.targetUserId;
    const isOwnProfile = !targetUserId;

    // We'll use a local ID for the profile we want to load
    const [profileId, setProfileId] = useState<string | null>(targetUserId || null);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    const [activeTab, setActiveTab] = useState<ProfileTab>('all');
    const [profile, setProfile] = useState<any>(null);
    const [openedCaps, setOpenedCaps] = useState<any[]>([]);
    const [sealedCaps, setSealedCaps] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [showEdit, setShowEdit] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showLanguageSettings, setShowLanguageSettings] = useState(false);

    const [followersCount, setFollowersCount] = useState(0);
    const [followingCount, setFollowingCount] = useState(0);
    const [isFollowing, setIsFollowing] = useState(false);

    // Media covers for opened capsules
    const [capsuleMediaMap, setCapsuleMediaMap] = useState<Record<string, any[]>>({});
    const [coverMap, setCoverMap] = useState<Record<string, string>>({});
    const [pickerCapsuleId, setPickerCapsuleId] = useState<string | null>(null);

    const [showVerificationFeedback, setShowVerificationFeedback] = useState(false);
    const feedbackAnim = useRef(new Animated.Value(0)).current;

    const loadData = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setCurrentUserId(user.id);

        // If no target provided, we are on our own profile (tab)
        const idToLoad = targetUserId || user.id;
        setProfileId(idToLoad);

        console.log('ProfileScreen: loading profile for', idToLoad, 'targetUserId was:', targetUserId);

        const [profileRes, capsRes, sharedRes, followersRes, followingRes, followCheck] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', idToLoad).single(),
            supabase.from('capsules')
                .select(`
                    *,
                    capsule_items(count),
                    likes(count),
                    comments(count),
                    owner:profiles!capsules_owner_id_fkey(username, avatar_url),
                    invited:profiles!capsules_invited_user_id_fkey(username, avatar_url)
                `)
                .or(`owner_id.eq.${idToLoad},and(invited_user_id.eq.${idToLoad},invite_status.eq.accepted)`)
                .order('created_at', { ascending: false }),
            supabase.from('capsule_invites')
                .select(`
                    capsule_id,
                    capsules:capsule_id(
                        *,
                        capsule_items(count),
                        likes(count),
                        comments(count),
                        owner:profiles!capsules_owner_id_fkey(username, avatar_url),
                        invited:profiles!capsules_invited_user_id_fkey(username, avatar_url)
                    )
                `)
                .eq('user_id', idToLoad)
                .eq('status', 'accepted'),
            supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', idToLoad),
            supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', idToLoad),
            targetUserId ? supabase.from('follows').select('*').eq('follower_id', user.id).eq('following_id', targetUserId).single() : { data: null }
        ]);

        if (profileRes.data) setProfile(profileRes.data);
        if (capsRes.data) {
            const ownAndOldShared = capsRes.data || [];
            const newShared = (sharedRes.data || []).map((s: any) => s.capsules).filter(Boolean);

            // Merge uniquely
            const all = [...ownAndOldShared];
            newShared.forEach(ns => {
                if (!all.some(c => c.id === ns.id)) {
                    all.push(ns);
                }
            });

            const viewable = isOwnProfile ? all : all.filter(c => c.is_public || c.invited_user_id === user.id || (sharedRes.data || []).some((s: any) => s.capsule_id === c.id));
            let opened = viewable.filter((c: any) => c.status === 'opened');
            const sealed = viewable.filter((c: any) => c.status === 'sealed');

            // Auto-delete empty opened capsules after 24h
            if (isOwnProfile) {
                const nowMs = Date.now();
                const toDelete = opened.filter((c: any) => {
                    const itemCount = c.capsule_items?.[0]?.count || 0;
                    if (itemCount === 0) {
                        const openedSinceMs = nowMs - new Date(c.opens_at).getTime();
                        if (openedSinceMs > 24 * 3600 * 1000) {
                            return true;
                        }
                    }
                    return false;
                });

                if (toDelete.length > 0) {
                    opened = opened.filter(c => !toDelete.includes(c));
                    for (const c of toDelete) {
                        await supabase.from('capsules').delete().eq('id', c.id);
                        await supabase.from('notifications').insert({
                            user_id: user.id,
                            type: 'system',
                            title: 'Capsule Deleted',
                            message: `Your capsule "${c.title}" was deleted because it was opened while empty.`,
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
    };

    useEffect(() => {
        loadData();
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
            'Logout',
            'Are you sure you want to log out?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Logout',
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
                        <Text style={styles.feedbackTitle}>Request Sent!</Text>
                        <Text style={styles.feedbackSubtitle}>Our team is reviewing your profile. We'll notify you soon.</Text>
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
                    <View style={styles.bannerActions}>
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

                <View style={styles.avatarSection}>
                    <View style={styles.avatarRow}>
                        <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.avatarRing}>
                            {profile?.avatar_url
                                ? <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
                                : <View style={[styles.avatar, styles.avatarPlaceholder]}>
                                    <Ionicons name="person" size={30} color={Colors.primary} />
                                </View>
                            }
                        </LinearGradient>
                        <View style={styles.statsRow}>
                            {[
                                { label: 'Opened', value: String(openedCaps.length) },
                                { label: 'Sealed', value: String(sealedCaps.length) },
                                { label: 'Followers', value: String(followersCount) },
                                { label: 'Following', value: String(followingCount) },
                            ].map((s) => (
                                <TouchableOpacity
                                    key={s.label}
                                    style={styles.stat}
                                    onPress={() => {
                                        if (s.label === 'Followers' || s.label === 'Following') {
                                            navigation.push('UserList', {
                                                userId: profileId,
                                                type: s.label.toLowerCase()
                                            });
                                        }
                                    }}
                                >
                                    <Text style={styles.statValue}>{s.value}</Text>
                                    <Text style={styles.statLabel}>{s.label}</Text>
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
                            <Text style={styles.lofiText}>{openedCaps.length} opened | {sealedCaps.length} sealed</Text>
                            <View style={styles.lofiDivider} />
                            <Text style={[styles.lofiText, { color: Colors.textMuted }]}>member since {joinYear}</Text>
                        </View>
                    </View>

                    <View style={styles.actionButtons}>
                        {isOwnProfile ? (
                            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                                <TouchableOpacity style={styles.pillActionBtn} onPress={() => setShowEdit(true)} activeOpacity={0.8}>
                                    <LinearGradient colors={[Colors.primary, Colors.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.pillGradient}>
                                        <Ionicons name="create-outline" size={16} color="#fff" />
                                        <Text style={styles.pillBtnText}>Edit Profile</Text>
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
                                        <Text style={[styles.pillBtnText, isFollowing && { color: Colors.textPrimary }]}>{isFollowing ? 'Following' : 'Follow'}</Text>
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
                </View>

                <View style={styles.tabs}>
                    {(['all', 'opened', 'sealed'] as ProfileTab[]).map((tab) => (
                        <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
                            <Ionicons name={tab === 'all' ? 'albums-outline' : tab === 'opened' ? 'lock-open-outline' : 'lock-closed-outline'} size={15} color={activeTab === tab ? Colors.primary : Colors.textMuted} />
                            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab === 'all' ? 'All' : tab === 'opened' ? 'Opened' : 'Sealed'}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <View style={{ flex: 1 }}>
                    <View style={styles.sealedGrid}>
                        {(activeTab === 'all'
                            ? [...openedCaps, ...sealedCaps].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                            : activeTab === 'opened' ? openedCaps : sealedCaps
                        ).map((cap) => {
                            const isSealed = cap.status === 'sealed';
                            const cfg = TYPE_CONFIG[cap.type as keyof typeof TYPE_CONFIG] || TYPE_CONFIG.legacycap;
                            const coverUrl = coverMap[cap.id];

                            // Get counts from nested objects
                            const itemsCount = cap.capsule_items?.[0]?.count || 0;
                            const likesCount = cap.likes?.[0]?.count || 0;
                            const commentsCount = cap.comments?.[0]?.count || 0;

                            return (
                                <TouchableOpacity
                                    key={cap.id}
                                    style={styles.sealedCell}
                                    onPress={() => navigation.navigate('CapsuleDetail', { capsuleId: cap.id })}
                                    onLongPress={() => !isSealed && isOwnProfile && capsuleMediaMap[cap.id]?.length > 1 && setPickerCapsuleId(cap.id)}
                                    delayLongPress={400}
                                >
                                    <View style={styles.sealedCellInner}>
                                        <View style={styles.modelContainer}>
                                            {isSealed ? (
                                                <CapsuleWithTimer
                                                    modelKey={cap.model}
                                                    source={{ uri: MODEL_IMAGES[cap.model] }}
                                                    date={cap.opens_at}
                                                    chainId={cap.chain_id}
                                                    capsuleType={cap.type}
                                                    style={styles.sealedImgLarge}
                                                />
                                            ) : (
                                                <View style={styles.sealedImgLarge}>
                                                    {coverUrl ? (
                                                        <Image source={{ uri: coverUrl }} style={styles.gridImgFull} resizeMode="cover" />
                                                    ) : (
                                                        <CapsuleWithTimer
                                                            modelKey={cap.model}
                                                            source={{ uri: MODEL_IMAGES_OPEN[cap.model] || MODEL_IMAGES[cap.model] }}
                                                            date={cap.opens_at}
                                                            chainId={cap.chain_id}
                                                            capsuleType={cap.type}
                                                            style={styles.gridImg}
                                                            hideTimer={true}
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
                                                    <Text style={styles.sharedBadgeText}>Shared</Text>
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
                                            <Text style={[styles.sealedTimer, { color: Colors.textMuted }]}>Opened</Text>
                                        )}

                                        <Text style={styles.sealedTitle} numberOfLines={1}>{cap.title}</Text>

                                        <View style={[styles.membersList, !cap.is_shared && { opacity: 0 }]} pointerEvents={!cap.is_shared ? "none" : "auto"}>
                                            <View style={styles.avatarStack}>
                                                {cap.owner?.avatar_url ? (
                                                    <Image source={{ uri: cap.owner.avatar_url }} style={styles.stackAvatar} />
                                                ) : (
                                                    <View style={[styles.stackAvatar, { backgroundColor: Colors.border, alignItems: 'center', justifyContent: 'center' }]}>
                                                        <Ionicons name="person" size={10} color={Colors.textMuted} />
                                                    </View>
                                                )}
                                                {cap.invited?.avatar_url ? (
                                                    <Image source={{ uri: cap.invited.avatar_url }} style={[styles.stackAvatar, { marginLeft: -8, borderWidth: 2, borderColor: Colors.surface }]} />
                                                ) : cap.invited?.username ? (
                                                    <View style={[styles.stackAvatar, { backgroundColor: Colors.border, alignItems: 'center', justifyContent: 'center', marginLeft: -8, borderWidth: 2, borderColor: Colors.surface }]}>
                                                        <Ionicons name="person" size={10} color={Colors.textMuted} />
                                                    </View>
                                                ) : null}
                                            </View>
                                            <Text style={styles.membersCountText}>
                                                {cap.invited ? `2 members` : `1 member`}
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
                        })}
                        {((activeTab === 'opened' && openedCaps.length === 0) || (activeTab === 'sealed' && sealedCaps.length === 0)) && (
                            <View style={styles.emptyState}>
                                <Text style={styles.emptyTitle}>No capsules found</Text>
                            </View>
                        )}
                    </View>
                </View>
            </ScrollView>

            <Modal visible={pickerCapsuleId !== null} transparent animationType="slide" onRequestClose={() => setPickerCapsuleId(null)}>
                <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setPickerCapsuleId(null)}>
                    <View style={styles.pickerSheet}>
                        <View style={styles.pickerHandle} />
                        <Text style={styles.pickerTitle}>Choose cover photo</Text>
                        <Text style={styles.pickerSub}>Long-press a photo to set it as the capsule cover</Text>
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
                        <Text style={styles.modalTitle}>Settings</Text>
                        <TouchableOpacity style={styles.settingsItem} onPress={() => { setShowSettings(false); setShowEdit(true); }}>
                            <View style={styles.settingsItemIcon}><Ionicons name="person-outline" size={18} color={Colors.textPrimary} /></View>
                            <Text style={styles.settingsItemText}>Edit Profile</Text>
                            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.settingsItem} onPress={() => { setShowSettings(false); setShowLanguageSettings(true); }}>
                            <View style={styles.settingsItemIcon}><Ionicons name="language-outline" size={18} color={Colors.textPrimary} /></View>
                            <Text style={styles.settingsItemText}>Language</Text>
                            <Text style={styles.settingsItemValue}>English</Text>
                            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.settingsItem} onPress={() => Alert.alert('Security', 'Security settings coming soon.')}>
                            <View style={styles.settingsItemIcon}><Ionicons name="lock-closed-outline" size={18} color={Colors.textPrimary} /></View>
                            <Text style={styles.settingsItemText}>Security</Text>
                            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.settingsItem, (profile?.verification_status === 'pending' || profile?.verification_status === 'verified') && { opacity: 0.5 }]} onPress={handleRequestVerification} disabled={profile?.verification_status === 'pending' || profile?.verification_status === 'verified'}>
                            <View style={styles.settingsItemIcon}><Ionicons name="checkmark-circle-outline" size={18} color={Colors.primary} /></View>
                            <Text style={styles.settingsItemText}>{profile?.verification_status === 'pending' ? 'Verification Pending' : profile?.verification_status === 'verified' ? 'Verified Account' : 'Request Verification'}</Text>
                            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.settingsItem} onPress={() => Linking.openURL('https://kapsely.com/privacy')}>
                            <View style={styles.settingsItemIcon}><Ionicons name="shield-checkmark-outline" size={18} color={Colors.textPrimary} /></View>
                            <Text style={styles.settingsItemText}>Privacy Policy</Text>
                            <Ionicons name="open-outline" size={18} color={Colors.textMuted} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.settingsItem} onPress={() => Linking.openURL('https://kapsely.com/terms')}>
                            <View style={styles.settingsItemIcon}><Ionicons name="document-text-outline" size={18} color={Colors.textPrimary} /></View>
                            <Text style={styles.settingsItemText}>Terms of Use</Text>
                            <Ionicons name="open-outline" size={18} color={Colors.textMuted} />
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.settingsItem, { borderBottomWidth: 0 }]} onPress={handleLogout}>
                            <View style={[styles.settingsItemIcon, { backgroundColor: Colors.error + '10' }]}><Ionicons name="log-out-outline" size={18} color={Colors.error} /></View>
                            <Text style={[styles.settingsItemText, { color: Colors.error, fontFamily: Fonts.bold }]}>Logout</Text>
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
                            <TouchableOpacity onPress={() => { setShowLanguageSettings(false); setShowSettings(true); }} style={styles.backButton}><Ionicons name="arrow-back" size={20} color={Colors.textPrimary} /></TouchableOpacity>
                            <Text style={styles.modalTitleInline}>Language</Text>
                            <View style={{ width: 20 }} />
                        </View>
                        {['English', 'Español', 'Português', 'Русский'].map((lang) => (
                            <TouchableOpacity key={lang} style={[styles.langItem, lang !== 'English' && { opacity: 0.5 }]} disabled={lang !== 'English'}>
                                <Text style={styles.settingsItemText}>{lang}</Text>
                                {lang === 'English' && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />}
                            </TouchableOpacity>
                        ))}
                    </Pressable>
                </Pressable>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    centered: { justifyContent: 'center', alignItems: 'center' },
    scrollContent: { paddingBottom: 100 },
    banner: { height: 160 },
    bannerCircle1: { position: 'absolute', top: -30, right: -20, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.08)' },
    bannerCircle2: { position: 'absolute', bottom: -10, left: 30, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.05)' },
    bannerActions: { paddingTop: 50, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' },
    backBtn: { width: 40, height: 40, justifyContent: 'center' },
    settingsBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-end' },
    avatarSection: { paddingHorizontal: 20, paddingBottom: 20 },
    avatarRow: { flexDirection: 'row', marginTop: -40, gap: 20, alignItems: 'flex-end' },
    avatarRing: { width: 90, height: 90, borderRadius: 45, padding: 3, ...Shadow.card },
    avatar: { width: 84, height: 84, borderRadius: 42, borderWidth: 3, borderColor: Colors.background },
    avatarPlaceholder: { backgroundColor: Colors.cardAlt, justifyContent: 'center', alignItems: 'center' },
    statsRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', paddingBottom: 5 },
    stat: { alignItems: 'center' },
    statValue: { fontSize: 18, fontFamily: Fonts.bold, color: Colors.textPrimary },
    statLabel: { fontSize: 11, fontFamily: Fonts.regular, color: Colors.textMuted },
    userInfo: { marginTop: 15 },
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
    actionButtons: { flexDirection: 'row', marginTop: 22, gap: 10, paddingHorizontal: 2 },
    pillActionBtn: { flex: 4, borderRadius: 12, height: 44, overflow: 'hidden' },
    pillGradient: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    pillBtnText: { color: '#fff', fontSize: 13, fontFamily: Fonts.semiBold, letterSpacing: 0.2 },
    pillIconBtn: { flex: 1, height: 44, borderRadius: 12, backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, ...Shadow.subtle },
    tabs: { flexDirection: 'row', marginTop: 25, borderBottomWidth: 1, borderBottomColor: Colors.border },
    tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderBottomWidth: 2.5, borderBottomColor: 'transparent' },
    tabActive: { borderBottomColor: Colors.primary },
    tabText: { fontSize: 14, fontFamily: Fonts.medium, color: Colors.textMuted },
    tabTextActive: { color: Colors.primary, fontFamily: Fonts.bold },
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
    sealedGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 12 },
    sealedCell: { width: (width - 36) / 2 },
    sealedCellInner: { alignItems: 'center', backgroundColor: Colors.surface, padding: 12, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, ...Shadow.subtle },
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
    sharedBadgeText: { fontSize: 9, fontFamily: Fonts.bold, color: '#fff' },
    membersList: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 6,
        backgroundColor: Colors.cardAlt,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    avatarStack: { flexDirection: 'row', alignItems: 'center' },
    stackAvatar: { width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.background },
    membersCountText: { fontSize: 10, fontFamily: Fonts.medium, color: Colors.textSecondary },
});
