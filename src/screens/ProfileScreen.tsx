import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    StatusBar, Dimensions, ActivityIndicator, Modal, RefreshControl,
    Linking, Alert, Pressable, Animated, Easing, Platform, Switch, TextInput,
    InteractionManager, DeviceEventEmitter
} from 'react-native';
import { FlashList } from '@shopify/flash-list';


import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { Colors, Fonts, Spacing, BorderRadius, Shadow } from '../theme';
import { supabase } from '../lib/supabase';
import { ProfileCapsuleCell } from '../components/profile/ProfileCapsuleCell';
import { ProfileHeader } from '../components/profile/ProfileHeader';
import { Image } from 'expo-image';
import EditProfileScreen from './EditProfileScreen';
import { MODEL_IMAGES, MODEL_TINTS, MODEL_IMAGES_OPEN } from '../constants/models';

import LiveTimer from '../components/LiveTimer';
import CapsuleWithTimer from '../components/CapsuleWithTimer';
import VerifiedBadge from '../components/VerifiedBadge';
import SupportModal from '../components/SupportModal';
import { timerConfigManager } from '../utils/timerConfig';
import { sendPushNotification } from '../utils/pushNotifications';
import StoryViewer from '../components/StoryViewer';
import { safetyService } from '../utils/safety';
import { multiAccountService, SavedAccount } from '../utils/multiAccount';

const { width } = Dimensions.get('window');

type ProfileTab = 'all' | 'opened' | 'sealed';

const TYPE_CONFIG = (t: any): Record<string, { icon: string; color: string; label: string }> => ({
    instacap: { icon: 'camera', color: Colors.instaCap, label: t('create.instacap_label') },
    legacycap: { icon: 'time', color: Colors.legacyCap, label: t('create.legacycap_label') },
    eventcap: { icon: 'flash', color: Colors.eventCap, label: t('create.eventcap_label') || 'EventCap' },
    opencap: { icon: 'book', color: Colors.primary, label: t('create.opencap_label') || 'OpenCap' },
});

const STICKER_POSITIONS = [
    { top: 40, left: 20, size: 70, rotation: '-15deg' },
    { top: 25, left: width * 0.4, size: 90, rotation: '5deg' },
    { top: 45, right: 30, size: 75, rotation: '12deg' },
    { top: 120, left: 35, size: 65, rotation: '-8deg' },
    { top: 115, right: 40, size: 85, rotation: '18deg' },
];

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ProfileScreen() {
    const insets = useSafeAreaInsets();
    const { t, i18n } = useTranslation();
    const navigation = useNavigation<any>();
    const route = useRoute();
    const targetUserId = (route.params as any)?.targetUserId;

    const [profileId, setProfileId] = useState<string | null>(targetUserId || null);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [isOwnProfile, setIsOwnProfileState] = useState(true);
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
    const [showPushSettings, setShowPushSettings] = useState(false);
    const [showSupportModal, setShowSupportModal] = useState(false);
    const [showAccountPanel, setShowAccountPanel] = useState(false);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [isDeletingAccount, setIsDeletingAccount] = useState(false);
    const [deleteConfirmPass, setDeleteConfirmPass] = useState('');
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [oldPassword, setOldPassword] = useState('');
    const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);

    useEffect(() => {
        if (showAccountPanel) {
            multiAccountService.getAccounts().then(setSavedAccounts);
        }
    }, [showAccountPanel]);

    const handleSwitchAccount = async (accountId: string) => {
        try {
            await multiAccountService.saveCurrentAccount();
            await multiAccountService.switchAccount(accountId);
            setShowAccountPanel(false);
            onRefresh();
        } catch (e: any) {
            Alert.alert('Error switching', e.message);
        }
    };

    const handleDeleteAccount = async () => {
        if (!deleteConfirmPass) return;
        setIsDeletingAccount(true);
        try {
            const { error: authErr } = await supabase.auth.signInWithPassword({
                email: profile?.email || '',
                password: deleteConfirmPass,
            });
            if (authErr) throw new Error(t('profile.wrong_password'));

            const { error: delErr } = await supabase.rpc('delete_user_permanently', { user_id_to_delete: currentUserId });
            
            if (delErr) {
               await supabase.from('capsules').delete().eq('owner_id', currentUserId);
               await supabase.from('profiles').delete().eq('id', currentUserId);
            }

            await multiAccountService.logoutCurrentAndRemove();
            setShowDeleteModal(false);
            Alert.alert(t('common.ready'), t('profile.account_deleted_success'));
        } catch (e: any) {
            Alert.alert('Error', e.message);
        } finally {
            setIsDeletingAccount(false);
        }
    };

    const handleChangePassword = async () => {
        if (!oldPassword) {
            Alert.alert('Error', 'Por favor, introduce tu contraseña actual');
            return;
        }
        if (newPassword !== confirmNewPassword) {
            Alert.alert('Error', 'Las contraseñas no coinciden');
            return;
        }
        if (newPassword.length < 6) {
            Alert.alert('Error', 'La contraseña debe tener al menos 6 caracteres');
            return;
        }

        try {
            // Verify old password
            const { error: authErr } = await supabase.auth.signInWithPassword({
                email: profile?.email || '',
                password: oldPassword,
            });
            if (authErr) throw new Error(t('profile.wrong_password'));

            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;
            Alert.alert('Éxito', 'Contraseña actualizada correctamente');
            setShowPasswordChangeModal(false);
            setNewPassword('');
            setConfirmNewPassword('');
            setOldPassword('');
        } catch (e: any) {
            Alert.alert('Error', e.message);
        }
    };

    const [pushEnabled, setPushEnabled] = useState(true);
    const [pushComments, setPushComments] = useState(true);

    const [pushInvites, setPushInvites] = useState(true);

    const [followersCount, setFollowersCount] = useState(0);
    const [followingCount, setFollowingCount] = useState(0);
    const [isFollowing, setIsFollowing] = useState(false);
    const [capsuleMediaMap, setCapsuleMediaMap] = useState<Record<string, any[]>>({});
    const [coverMap, setCoverMap] = useState<Record<string, string>>({});
    const [pickerCapsuleId, setPickerCapsuleId] = useState<string | null>(null);
    const [showVerificationFeedback, setShowVerificationFeedback] = useState(false);
    const feedbackAnim = useRef(new Animated.Value(0)).current;
    const [profileStickers, setProfileStickers] = useState<any[]>([]);
    const [userStories, setUserStories] = useState<any>(null);
    const [activeStoryViewer, setActiveStoryViewer] = useState(false);
    const [isBlocked, setIsBlocked] = useState(false);
    const [showUserOptions, setShowUserOptions] = useState(false);

    useEffect(() => {
        const checkOwn = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user?.id) {
                setCurrentUserId(session.user.id);
                if (targetUserId) {
                    setIsOwnProfileState(targetUserId === session.user.id);
                    safetyService.isBlocked(session.user.id, targetUserId).then(setIsBlocked);
                } else setIsOwnProfileState(true);
            }
        };
        checkOwn();
    }, [targetUserId]);

    useEffect(() => {
        if (profile) {
            setPushEnabled(profile.push_notifications_enabled ?? true);
            setPushComments(profile.push_notif_comments ?? true);

            setPushInvites(profile.push_notif_invites ?? true);
        }
    }, [profile]);

    const handleTogglePushSetting = async (key: string, currentValue: boolean) => {
        const v = !currentValue;
        if (key === 'push_notifications_enabled') setPushEnabled(v);
        else if (key === 'push_notif_comments') setPushComments(v);

        else if (key === 'push_notif_invites') setPushInvites(v);
        if (!currentUserId) return;
        const { error } = await supabase.from('profiles').update({ [key]: v }).eq('id', currentUserId);
        if (error) Alert.alert('Error', error.message);
    };

    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    const loadData = async (isNewPage = false) => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const user = session?.user;
            if (!user) {
                setLoading(false);
                return;
            }
            const myId = user.id;
            setCurrentUserId(myId);
            const idToLoad = targetUserId || myId;
            setProfileId(idToLoad);
            const own = idToLoad === myId;
            setIsOwnProfileState(own);

        const PAGE_SIZE = 12;
        const currentPage = isNewPage ? page + 1 : 0;
        const rangeStart = currentPage * PAGE_SIZE;
        const rangeEnd = (currentPage + 1) * PAGE_SIZE - 1;

        if (isNewPage) setLoadingMore(true);
        else if (!refreshing) setLoading(true);

        const [profileRes, followCheckRes, capsRes, storiesRes, readsRes, myInvitesRes, collabCapsRes] = await Promise.all([
            // Consolidate Profile Info with counts
            supabase.from('profiles').select('*, followers:follows!following_id(count), following:follows!follower_id(count)').eq('id', idToLoad).maybeSingle(),
            // Follow check for current user
            myId !== idToLoad 
              ? supabase.from('follows').select('id').eq('follower_id', myId).eq('following_id', idToLoad).maybeSingle()
              : Promise.resolve({ data: null, error: null }),

            supabase.rpc('get_user_capsules_v2', { target_user_id: idToLoad }).range(rangeStart, rangeEnd),

            supabase.from('capsule_items').select(`
                id, media_url, media_type, content, expires_at, created_at, capsule_id, 
                capsules:capsule_id(id, title, model)
            `).eq('owner_id', idToLoad).eq('is_story', true).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }),

            supabase.from('story_reads').select('story_id').eq('user_id', myId),
            supabase.from('capsule_invites').select('capsule_id').eq('user_id', myId).eq('status', 'accepted'),
            
            // Add fetch for capsules where user is collaborator (accepted invite)
            supabase.from('capsule_invites')
                .select('capsule_id, capsules(*)')
                .eq('user_id', idToLoad)
                .eq('status', 'accepted')
                .range(rangeStart, rangeEnd)
        ]);

        if (profileRes.data) {
            const p = profileRes.data as any;
            setProfile(p);
            setFollowersCount(p.followers?.[0]?.count || 0);
            setFollowingCount(p.following?.[0]?.count || 0);
        }
        setIsFollowing(!!followCheckRes?.data);

        const storiesData = storiesRes.data || [];
        const readIds = new Set((readsRes.data || []).map(r => r.story_id));
        if (storiesData.length > 0) {
            const sw = storiesData.map(s => ({ ...s, is_read: readIds.has(s.id) }));
            setUserStories({ owner_id: idToLoad, username: profileRes.data?.username, avatar_url: profileRes.data?.avatar_url, stories: sw, all_read: sw.every(s => s.is_read) });
        } else setUserStories(null);

        const myAcceptedCaps = new Set((myInvitesRes.data || []).map((i: any) => i.capsule_id));

        if (capsRes.data || collabCapsRes.data) {
            const owned = capsRes.data || [];
            const collaborated = (collabCapsRes.data || []).map((inv: any) => inv.capsules).filter(Boolean);
            
            // Merge and deduplicate
            const combined = [...owned];
            collaborated.forEach((c: any) => {
                if (!combined.some(o => o.id === c.id)) combined.push(c);
            });

            const viewable = combined.map((c: any) => ({
                ...c,
                is_shared: c.is_shared || combined.some(o => o.id === c.id && collaborated.some(col => col.id === c.id)),
                isAccessible: own || c.is_public || c.owner_id === user.id || myAcceptedCaps.has(c.id) || (c.invited_user_id === myId && c.invite_status === 'accepted')
            }));
            
            // Initialize coverMap with existing cover_url values
            const initialCovers: Record<string, string> = {};
            viewable.forEach((c: any) => { if (c.cover_url) initialCovers[c.id] = c.cover_url; });
            setCoverMap(prev => ({ ...prev, ...initialCovers }));

            const filtered = viewable;
            let opened = filtered.filter((c: any) => c.status === 'opened');
            const sealed = filtered.filter((c: any) => c.status === 'sealed');
            
            if (own) {
                const nowMs = Date.now();
                const toDelete = opened.filter((c: any) => {
                    const itemCount = c.capsule_items_count_val !== undefined ? c.capsule_items_count_val : (c.capsule_items_count || 0);
                    const isActuallyOpenCap = c.type === 'opencap' || (c.status === 'opened' && c.duration_days === 0);
                    // Only auto-delete caps if I OWN them
                    return c.owner_id === user.id && itemCount === 0 && !isActuallyOpenCap && (nowMs - new Date(c.opens_at).getTime()) > 86400000;
                });
                if (toDelete.length > 0) {
                    opened = opened.filter((c: any) => !toDelete.includes(c));
                    await Promise.all(toDelete.map(async (c: any) => {
                        await supabase.from('capsules').delete().eq('id', c.id);
                        await supabase.from('notifications').insert({ user_id: user.id, type: 'system', title: t('profile.delete_capsule_notif'), message: t('profile.delete_capsule_msg', { title: c.title }), metadata: { capsule_id: c.id } });
                    }));
                }
            }
            setOpenedCaps(prev => isNewPage ? [...prev, ...opened] : opened);
            setSealedCaps(prev => isNewPage ? [...prev, ...sealed] : sealed);
            setHasMore((capsRes.data?.length || 0) >= PAGE_SIZE || (collabCapsRes.data?.length || 0) >= PAGE_SIZE);
            if (isNewPage) setPage(currentPage);
            else setPage(0);

            if (opened.length > 0) {
                const { data: mediaItems } = await supabase.from('capsule_items').select('id, capsule_id, media_url, media_type, created_at').in('capsule_id', opened.map((c: any) => c.id)).in('media_type', ['image', 'video']).order('created_at', { ascending: true });
                const mediaMap: Record<string, any[]> = {};
                (mediaItems || []).forEach((item: any) => {
                    if (!mediaMap[item.capsule_id]) mediaMap[item.capsule_id] = [];
                    mediaMap[item.capsule_id].push(item);
                });
                setCapsuleMediaMap(prev => isNewPage ? { ...prev, ...mediaMap } : mediaMap);
                const defaultCovers: Record<string, string> = {};
                Object.entries(mediaMap).forEach(([capId, items]) => { 
                    // Only set as default if no cover_url was already set in initialCovers
                    if (!initialCovers[capId] && (items as any[])[0]?.media_url) {
                        defaultCovers[capId] = (items as any[])[0].media_url; 
                    }
                });
                setCoverMap(prev => ({ ...prev, ...defaultCovers }));
            }
        }

            const { data: stks } = await supabase.from('profile_stickers').select('*, stickers(*)').eq('user_id', idToLoad);
            if (stks) setProfileStickers(stks);
        } catch (error) {
            console.error('[ProfileScreen] Error loading data:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
            setLoadingMore(false);
        }
    };

    useEffect(() => {
        const sub = DeviceEventEmitter.addListener('CAPSULE_UPDATED', (payload: any) => {
            if (payload.id && payload.cover_url) {
                setCoverMap(prev => ({ ...prev, [payload.id]: payload.cover_url }));
            }
            if (payload.id) {
                const updateFn = (prev: any[]) => prev.map(c => 
                    c.id === payload.id ? { ...c, ...payload } : c
                );
                setOpenedCaps(updateFn);
                setSealedCaps(updateFn);
            }
            loadData();
        });
        return () => sub.remove();
    }, [targetUserId, currentUserId]);

    useEffect(() => {
        const idToLoad = targetUserId || currentUserId;
        if (!idToLoad) return;

        const channel = supabase.channel(`profile-${idToLoad}`)
            .on('postgres_changes', 
                { event: 'UPDATE', schema: 'public', table: 'capsules', filter: `owner_id=eq.${idToLoad}` }, 
                () => loadData()
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [targetUserId, currentUserId]);

    useFocusEffect(useCallback(() => {
        if (Platform.OS === 'web') {
            loadData();
        } else {
            const task = InteractionManager.runAfterInteractions(() => {
                loadData();
            });
            return () => task.cancel();
        }
    }, [targetUserId, currentUserId]));

    const onRefresh = () => { setRefreshing(true); loadData(); };

    const handleLogout = async () => {
        if (Platform.OS === 'web') {
            if (window.confirm('Are you sure you want to log out?')) { setShowSettings(false); await supabase.auth.signOut(); }
            return;
        }
        Alert.alert(t('profile.logout'), t('profile.logout_confirm'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('profile.logout'), style: 'destructive', onPress: async () => { setShowSettings(false); await supabase.auth.signOut(); } }
        ]);
    };

    const handleBlockToggle = async () => {
        if (!currentUserId || !targetUserId) return;
        if (isBlocked) {
            await safetyService.unblockUser(currentUserId, targetUserId);
            setIsBlocked(false);
            Alert.alert(t('common.ready'), t('detail.unblocked_success'));
        } else {
            Alert.alert(t('detail.block_user'), t('detail.block_confirm'), [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('detail.block_user'), style: 'destructive', onPress: async () => { await safetyService.blockUser(currentUserId, targetUserId); setIsBlocked(true); Alert.alert(t('common.ready'), t('detail.blocked_success')); setShowUserOptions(false); } }
            ]);
        }
    };

    const handleReportUser = () => {
        if (!currentUserId || !targetUserId) return;
        Alert.alert(t('detail.report_user'), t('detail.report_reason'), [
            { text: t('detail.report_types.inappropriate'), onPress: () => submitReport('inappropriate') },
            { text: t('detail.report_types.spam'), onPress: () => submitReport('spam') },
            { text: t('detail.report_types.harassment'), onPress: () => submitReport('harassment') },
            { text: t('common.cancel'), style: 'cancel' }
        ]);
    };

    const submitReport = async (reason: string) => {
        if (!currentUserId || !targetUserId) return;
        await safetyService.report({ reporterId: currentUserId, targetId: targetUserId, targetType: 'user', reason });
        Alert.alert(t('common.ready'), t('detail.report_submitted'));
        setShowUserOptions(false);
    };

    const handleFollowToggle = async () => {
        if (!currentUserId || !targetUserId) return;
        if (isFollowing) {
            await supabase.from('follows').delete().eq('follower_id', currentUserId).eq('following_id', targetUserId);
            setFollowersCount(p => p - 1);
            setIsFollowing(false);
        } else {
            try {
                await supabase.from('follows').insert({ follower_id: currentUserId, following_id: targetUserId });
                setFollowersCount(p => p + 1);
                setIsFollowing(true);
                
                // Notification with anti-spam check
                const { data: existing } = await supabase.from('notifications')
                    .select('id').eq('user_id', targetUserId).eq('sender_id', currentUserId).eq('type', 'follow').maybeSingle();
                
                if (existing) {
                    await supabase.from('notifications').update({ created_at: new Date().toISOString(), is_read: false }).eq('id', existing.id);
                } else {
                    await supabase.from('notifications').insert({ user_id: targetUserId, sender_id: currentUserId, type: 'follow', message: t('common.started_following_you') });
                    sendPushNotification(targetUserId, t('notifications.new_follower_title'), t('notifications.new_follower_msg'), { screen: 'UserProfile', params: { targetUserId: currentUserId } });
                }
            } catch (err: any) {
                if (err?.code === '23505') {
                    setIsFollowing(true);
                    return;
                }
                console.error('Follow error:', err);
            }
        }
    };


    const handleRequestVerification = async () => {
        if (!currentUserId || profile?.verification_status === 'pending' || profile?.is_verified) return;
        setShowVerificationFeedback(true);
        Animated.sequence([
            Animated.timing(feedbackAnim, { toValue: 1, duration: 600, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
            Animated.delay(2000),
            Animated.timing(feedbackAnim, { toValue: 0, duration: 400, useNativeDriver: true })
        ]).start(() => setShowVerificationFeedback(false));
        const { data: admins } = await supabase.from('profiles').select('id').eq('is_admin', true).limit(1);
        const adminId = admins?.[0]?.id;
        if (adminId) await supabase.from('notifications').insert({ user_id: adminId, sender_id: currentUserId, type: 'system', message: `@${profile?.username || 'User'} requested verification.` });
        await supabase.from('profiles').update({ verification_status: 'pending' }).eq('id', currentUserId);
        setProfile({ ...profile, verification_status: 'pending' });
    };

    const navigateToConversation = async () => {
        if (!currentUserId || !targetUserId) return;
        const { data: myConvos } = await supabase.from('conversation_participants').select('conversation_id').eq('user_id', currentUserId);
        const myConvoIds = myConvos?.map(c => c.conversation_id) || [];
        let conversationId = null;
        if (myConvoIds.length > 0) {
            const { data: shared } = await supabase.from('conversation_participants').select('conversation_id').eq('user_id', targetUserId).in('conversation_id', myConvoIds);
            if (shared?.length) conversationId = shared[0].conversation_id;
        }
        if (!conversationId) {
            const { data: newConvo } = await supabase.from('conversations').insert({}).select().single();
            if (newConvo) {
                conversationId = newConvo.id;
                await supabase.from('conversation_participants').insert([{ conversation_id: newConvo.id, user_id: currentUserId }, { conversation_id: newConvo.id, user_id: targetUserId }]);
            }
        }
        if (conversationId) navigation.navigate('ChatDetail', { conversationId });
    };


    const accentColor = profile?.favorite_color || Colors.primary;
    const joinYear = profile?.created_at ? new Date(profile.created_at).getFullYear() : '—';
    const tabData = activeTab === 'all'
        ? [...openedCaps, ...sealedCaps].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        : activeTab === 'sealed' ? sealedCaps : openedCaps;

    const sortedTabData = [...tabData].sort((a, b) => {
        if (a.type === 'legacycap' && b.type !== 'legacycap') return -1;
        if (b.type === 'legacycap' && a.type !== 'legacycap') return 1;
        return 0;
    });
    const renderHeader = useCallback(() => (
        <ProfileHeader
            profile={profile}
            accentColor={accentColor}
            profileStickers={profileStickers}
            userStories={userStories}
            followersCount={followersCount}
            followingCount={followingCount}
            capsulesCount={openedCaps.length + sealedCaps.length}
            isOwnProfile={isOwnProfile}
            isFollowing={isFollowing}
            onFollowToggle={handleFollowToggle}
            onNavigateToConversation={navigateToConversation}
            onShowEdit={() => setShowEdit(true)}
            onShowSettings={() => setShowSettings(true)}
            onShowUserOptions={() => setShowUserOptions(true)}
            onShowStories={() => setActiveStoryViewer(true)}
            onBack={() => navigation.goBack()}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            insets={insets}
            t={t}
            i18n={i18n}
            joinYear={joinYear}
            profileId={profileId || ''}
            navigation={navigation}
        />
    ), [
        profile, accentColor, profileStickers, userStories, followersCount, followingCount,
        openedCaps.length, sealedCaps.length, isOwnProfile, isFollowing, activeTab, insets, t, i18n, joinYear, profileId, navigation
    ]);

    if (loading) {
        return (
            <View style={[s.root, s.centered]}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />

            {/* Verification feedback */}
            {showVerificationFeedback && (
                <Animated.View style={[s.feedbackOverlay, { opacity: feedbackAnim, transform: [{ scale: feedbackAnim }] }]}>
                    <View style={s.feedbackCard}>
                        <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={s.feedbackIconWrap}>
                            <Ionicons name="checkmark-circle" size={38} color="#fff" />
                        </LinearGradient>
                        <Text style={s.feedbackTitle}>{t('profile.request_sent')}</Text>
                        <Text style={s.feedbackSub}>{t('profile.reviewing_profile')}</Text>
                    </View>
                </Animated.View>
            )}

            {/* Edit Modal */}
            <Modal visible={showEdit} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowEdit(false)}>
                <EditProfileScreen 
                    onClose={() => { setShowEdit(false); loadData(); }} 
                    initialData={profile}
                />
            </Modal>

            <FlashList
                data={sortedTabData}
                keyExtractor={item => item.id}
                numColumns={3}
                // @ts-ignore
                estimatedItemSize={160}
                contentContainerStyle={[s.gridContent, { paddingBottom: 100 }]}
                ListHeaderComponent={renderHeader}
                renderItem={({ item }) => (
                    <View style={s.gridCell}>
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
                            themeColor={accentColor}
                            capsuleMediaMap={capsuleMediaMap}
                            t={t}
                        />
                    </View>
                )}
                ListEmptyComponent={
                    <View style={s.emptyState}>
                        <View style={s.emptyIconWrap}>
                            <Ionicons name="cube-outline" size={28} color={Colors.textMuted} />
                        </View>
                        <Text style={s.emptyTitle}>{t('profile.noCapsulesFound')}</Text>
                        <Text style={s.emptySub}>
                            {activeTab === 'sealed' ? t('profile.noSealedYet') : t('profile.noOpenedYet')}
                        </Text>
                    </View>
                }
                onEndReached={() => { if (!loadingMore && hasMore) loadData(true); }}
                onEndReachedThreshold={0.5}
                ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color={accentColor} style={{ padding: 20 }} /> : null}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
            />

            {/* ── MODALS ───────────────────────────────────────────────── */}

            {/* User Options (report/block) */}
            <Modal visible={showUserOptions} transparent animationType="fade">
                <Pressable style={s.overlay} onPress={() => setShowUserOptions(false)}>
                    <View style={s.sheet}>
                        <View style={s.sheetHandle} />
                        <Text style={s.sheetTitle}>{profile?.username || 'User'}</Text>
                        <TouchableOpacity style={s.sheetItem} activeOpacity={0.7} onPress={handleReportUser}>
                            <View style={[s.sheetItemIcon, { backgroundColor: Colors.error + '10' }]}>
                                <Ionicons name="alert-circle-outline" size={18} color={Colors.error} />
                            </View>
                            <Text style={s.sheetItemText}>{t('detail.report_user')}</Text>
                            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                        </TouchableOpacity>
                        <TouchableOpacity style={s.sheetItem} activeOpacity={0.7} onPress={handleBlockToggle}>
                            <View style={[s.sheetItemIcon, { backgroundColor: Colors.eventCap + '12' }]}>
                                <Ionicons name="hand-left-outline" size={18} color={Colors.eventCap} />
                            </View>
                            <Text style={s.sheetItemText}>{isBlocked ? t('detail.unblock_user') : t('detail.block_user')}</Text>
                            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                        </TouchableOpacity>
                        <TouchableOpacity style={s.cancelBtn} activeOpacity={0.7} onPress={() => setShowUserOptions(false)}>
                            <Text style={s.cancelBtnText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>

            {/* Cover picker */}
            <Modal visible={pickerCapsuleId !== null} transparent animationType="slide" onRequestClose={() => setPickerCapsuleId(null)}>
                <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setPickerCapsuleId(null)}>
                    <View style={s.pickerSheet}>
                        <View style={s.sheetHandle} />
                        <Text style={s.sheetTitle}>{t('profile.chooseCoverPhoto')}</Text>
                        <Text style={s.pickerSub}>{t('profile.longPressToSetCover')}</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pickerRow}>
                            {(pickerCapsuleId ? (capsuleMediaMap[pickerCapsuleId] || []) : []).map((item) => {
                                const isSel = coverMap[pickerCapsuleId!] === item.media_url;
                                return (
                                    <TouchableOpacity
                                        key={item.id}
                                        style={[s.pickerThumb, isSel && { borderColor: accentColor }]}
                                        activeOpacity={0.7}
                                        onPress={async () => { 
                                            const mediaUrl = item.media_url;
                                            setCoverMap(p => ({ ...p, [pickerCapsuleId!]: mediaUrl })); 
                                            setPickerCapsuleId(null); 
                                            
                                            // Persist to DB
                                            try {
                                                const { error } = await supabase.from('capsules').update({ cover_url: mediaUrl }).eq('id', pickerCapsuleId);
                                                if (error) throw error;
                                                DeviceEventEmitter.emit('CAPSULE_UPDATED', { id: pickerCapsuleId, cover_url: mediaUrl });
                                                Alert.alert(t('common.ready'), t('profile.cover_updated'));
                                            } catch (err: any) {
                                                Alert.alert('Error', err.message);
                                            }
                                        }}
                                    >
                                        <Image source={{ uri: item.media_url }} style={s.pickerThumbImg} contentFit="cover" transition={200} />

                                        {isSel && <View style={s.pickerCheck}><Ionicons name="checkmark-circle" size={26} color="#fff" /></View>}
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* Settings */}
            <Modal
                visible={showSettings}
                transparent={Platform.OS === 'android'}
                animationType="slide"
                presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'overFullScreen'}
                onRequestClose={() => setShowSettings(false)}
            >
                <Pressable
                    style={[s.overlay, Platform.OS === 'ios' && { backgroundColor: Colors.surface }]}
                    onPress={() => setShowSettings(false)}
                >
                    <Pressable style={[s.sheet, Platform.OS === 'ios' && { borderTopLeftRadius: 0, borderTopRightRadius: 0, paddingTop: 20 }]}>
                        <View style={s.sheetHandle} />
                        <Text style={s.sheetTitle}>{t('profile.settings')}</Text>

                        {[
                            { icon: 'person-circle-outline', color: Colors.primary, label: 'Panel de cuenta', onPress: () => { setShowSettings(false); setShowAccountPanel(true); } },
                            { icon: 'sparkles-outline', color: Colors.primary, label: t('profile.personalizeProfile'), onPress: () => { setShowSettings(false); navigation.navigate('PersonalizeProfile'); } },
                            { icon: 'language-outline', color: Colors.textSecondary, label: t('profile.language'), value: i18n.language === 'es' ? 'Español' : 'English', onPress: () => { setShowSettings(false); setShowLanguageSettings(true); } },
                            { icon: 'notifications-outline', color: Colors.textSecondary, label: t('profile.push_notifications', 'Notificaciones Push'), onPress: () => { setShowSettings(false); setShowPushSettings(true); } },
                            { icon: 'help-buoy-outline', color: Colors.textSecondary, label: t('profile.support', 'Ayuda y Soporte'), onPress: () => { setShowSettings(false); setShowSupportModal(true); } },
                            { icon: 'shield-checkmark-outline', color: Colors.textSecondary, label: t('profile.privacyPolicy'), onPress: () => { setShowSettings(false); setShowPrivacy(true); } },
                            { icon: 'document-text-outline', color: Colors.textSecondary, label: t('profile.termsOfUse'), onPress: () => { setShowSettings(false); setShowTerms(true); } },
                            ...(profile?.is_admin ? [{ icon: 'construct-outline', color: Colors.eventCap, label: 'Admin: Calibration Tool', onPress: () => { setShowSettings(false); navigation.navigate('AdminCalibration'); } }] : []),
                        ].map((item, i) => (
                            <TouchableOpacity
                                key={i}
                                style={[s.sheetItem, (item as any).disabled && { opacity: 0.45 }]}
                                activeOpacity={0.7}
                                onPress={item.onPress}
                                disabled={(item as any).disabled}
                            >
                                <View style={[s.sheetItemIcon, { backgroundColor: (item.color || Colors.textSecondary) + '12' }]}>
                                    <Ionicons name={item.icon as any} size={17} color={item.color || Colors.textSecondary} />
                                </View>
                                <Text style={s.sheetItemText}>{item.label}</Text>
                                {(item as any).value && <Text style={s.sheetItemValue}>{(item as any).value}</Text>}
                                <Ionicons name="chevron-forward" size={15} color={Colors.textMuted} />
                            </TouchableOpacity>
                        ))}

                        <TouchableOpacity style={[s.sheetItem, { marginTop: 8, borderTopWidth: 1, borderTopColor: Colors.divider }]} activeOpacity={0.7} onPress={handleLogout}>
                            <View style={[s.sheetItemIcon, { backgroundColor: Colors.error + '12' }]}>
                                <Ionicons name="log-out-outline" size={17} color={Colors.error} />
                            </View>
                            <Text style={[s.sheetItemText, { color: Colors.error, fontFamily: Fonts.bold }]}>{t('profile.logout')}</Text>
                        </TouchableOpacity>

                        <Text style={s.appVersion}>kapsely v{Constants.expoConfig?.version || '1.0.0'}</Text>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Account Panel Modal */}
            <Modal
                visible={showAccountPanel}
                transparent
                animationType="slide"
            >
                <View style={s.overlay}>
                    <TouchableOpacity 
                        style={StyleSheet.absoluteFill} 
                        activeOpacity={1} 
                        onPress={() => setShowAccountPanel(false)}
                    >
                        <BlurView intensity={20} style={StyleSheet.absoluteFill} />
                    </TouchableOpacity>

                    <Animated.View style={[s.sheet, { backgroundColor: Colors.surface + 'F0', borderRadius: 30, paddingHorizontal: 20 }]}>
                        <View style={s.sheetHandle} />
                        <View style={s.sheetNav}>
                            <TouchableOpacity onPress={() => setShowAccountPanel(false)} style={s.sheetNavBack}>
                                <Ionicons name="close" size={24} color={Colors.textPrimary} />
                            </TouchableOpacity>
                            <Text style={[s.sheetNavTitle, { fontWeight: '700' }]}>{t('profile.account_panel')}</Text>
                        </View>
                        
                        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                            <Text style={[s.pushSectionLabel, { marginBottom: 15, fontSize: 13, opacity: 0.6 }]}>{t('profile.profiles')}</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 25 }}>
                                {savedAccounts.map(acc => (
                                    <TouchableOpacity 
                                        key={acc.id} 
                                        onPress={() => {
                                            setShowAccountPanel(false);
                                            handleSwitchAccount(acc.id);
                                        }}
                                        style={{ alignItems: 'center', marginRight: 20 }}
                                    >
                                        <View style={[
                                            { width: 70, height: 70, borderRadius: 35, padding: 3, backgroundColor: Colors.surface, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
                                            acc.id === currentUserId && { backgroundColor: Colors.primary }
                                        ]}>
                                            <Image 
                                                source={{ uri: acc.avatar_url || 'https://via.placeholder.com/150' }} 
                                                style={{ width: '100%', height: '100%', borderRadius: 32, borderWidth: 2, borderColor: '#fff' }} 
                                            />
                                            {acc.id === currentUserId && (
                                                <View style={{ position: 'absolute', bottom: 0, right: 0, backgroundColor: Colors.success, borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' }}>
                                                    <Ionicons name="checkmark" size={12} color="#fff" />
                                                </View>
                                            )}
                                        </View>
                                        <Text style={[s.accUsername, { marginTop: 8, fontWeight: acc.id === currentUserId ? '700' : '400' }]} numberOfLines={1}>@{acc.username}</Text>
                                    </TouchableOpacity>
                                ))}
                                <TouchableOpacity 
                                    onPress={async () => { 
                                        await multiAccountService.saveCurrentAccount();
                                        await supabase.auth.signOut();
                                        setShowAccountPanel(false); 
                                    }}
                                    style={{ alignItems: 'center' }}
                                >
                                    <View style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: Colors.primary + '15', alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', borderWidth: 1, borderColor: Colors.primary }}>
                                        <Ionicons name="add" size={30} color={Colors.primary} />
                                    </View>
                                    <Text style={[s.accUsername, { marginTop: 8, color: Colors.primary }]}>{t('profile.add_account')}</Text>
                                </TouchableOpacity>
                            </ScrollView>

                            <Text style={[s.pushSectionLabel, { marginBottom: 10, fontSize: 13, opacity: 0.6 }]}>{t('profile.security_and_account')}</Text>
                            
                            <View style={{ backgroundColor: Colors.surface, borderRadius: 20, overflow: 'hidden', padding: 5 }}>
                                <TouchableOpacity 
                                    style={s.sheetItem} 
                                    activeOpacity={0.7} 
                                    onPress={() => {
                                        setShowAccountPanel(false);
                                        setTimeout(() => setShowPasswordChangeModal(true), 300);
                                    }}
                                >
                                    <View style={[s.sheetItemIcon, { backgroundColor: Colors.primary + '15' }]}>
                                        <Ionicons name="finger-print" size={18} color={Colors.primary} />
                                    </View>
                                    <Text style={s.sheetItemText}>{t('profile.change_password')}</Text>
                                    <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                                </TouchableOpacity>

                                <View style={{ height: 1, backgroundColor: Colors.border, marginHorizontal: 50, opacity: 0.3 }} />

                                <TouchableOpacity 
                                    style={s.sheetItem} 
                                    activeOpacity={0.7} 
                                    onPress={() => {
                                        setShowAccountPanel(false);
                                        setTimeout(() => setShowDeleteModal(true), 300);
                                    }}
                                >
                                    <View style={[s.sheetItemIcon, { backgroundColor: Colors.error + '15' }]}>
                                        <Ionicons name="trash" size={18} color={Colors.error} />
                                    </View>
                                    <Text style={[s.sheetItemText, { color: Colors.error }]}>{t('profile.delete_account_final_btn')}</Text>
                                    <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </Animated.View>
                </View>
            </Modal>

            {/* Password Change Modal */}
            <Modal visible={showPasswordChangeModal} transparent animationType="fade">
                <View style={s.overlay}>
                    <View style={[s.sheet, { paddingBottom: 20 }]}>
                        <Text style={s.sheetTitle}>{t('profile.change_password')}</Text>
                        <TextInput
                            secureTextEntry
                            placeholder={t('profile.old_password', 'Contraseña actual')}
                            style={[s.sheetItem, { borderBottomWidth: 1, paddingHorizontal: 10 }]}
                            value={oldPassword}
                            onChangeText={setOldPassword}
                        />
                        <TextInput
                            secureTextEntry
                            placeholder={t('profile.new_password')}
                            style={[s.sheetItem, { borderBottomWidth: 1, paddingHorizontal: 10, marginTop: 10 }]}
                            value={newPassword}
                            onChangeText={setNewPassword}
                        />
                        <TextInput
                            secureTextEntry
                            placeholder={t('profile.confirm_new_password')}
                            style={[s.sheetItem, { borderBottomWidth: 1, paddingHorizontal: 10, marginTop: 10 }]}
                            value={confirmNewPassword}
                            onChangeText={setConfirmNewPassword}
                        />
                        <TouchableOpacity style={[s.primaryBtn, { backgroundColor: Colors.primary, marginTop: 20 }]} onPress={handleChangePassword}>
                            <Text style={s.primaryBtnText}>{t('profile.update_password')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.cancelBtn} onPress={() => setShowPasswordChangeModal(false)}>
                            <Text style={s.cancelBtnText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Account Deletion Modal */}
            <Modal visible={showDeleteModal} transparent animationType="fade">
                <View style={s.overlay}>
                    <View style={[s.sheet, { paddingBottom: 20 }]}>
                        <Text style={[s.sheetTitle, { color: Colors.error }]}>{t('profile.deleteAccount')}</Text>
                        <Text style={{ fontSize: 14, color: Colors.textSecondary, marginBottom: 20 }}>
                            {t('profile.delete_account_desc')}
                        </Text>
                        <TextInput
                            secureTextEntry
                            placeholder={t('profile.confirm_new_password')}
                            style={[s.sheetItem, { borderBottomWidth: 1, paddingHorizontal: 10 }]}
                            value={deleteConfirmPass}
                            onChangeText={setDeleteConfirmPass}
                        />
                        <TouchableOpacity 
                            style={[s.primaryBtn, { backgroundColor: Colors.error, marginTop: 20 }]} 
                            onPress={handleDeleteAccount}
                            disabled={isDeletingAccount || !deleteConfirmPass}
                        >
                            {isDeletingAccount ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>{t('profile.delete_account_final_btn')}</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity style={s.cancelBtn} onPress={() => setShowDeleteModal(false)}>
                            <Text style={s.cancelBtnText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Support Ticket Modal */}
            <SupportModal visible={showSupportModal} onClose={() => setShowSupportModal(false)} userId={currentUserId!} />

            {/* Language */}
            <Modal
                visible={showLanguageSettings}
                transparent={Platform.OS === 'android'}
                animationType="slide"
                presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'overFullScreen'}
                onRequestClose={() => setShowLanguageSettings(false)}
            >
                <Pressable
                    style={[s.overlay, Platform.OS === 'ios' && { backgroundColor: Colors.surface }]}
                    onPress={() => setShowLanguageSettings(false)}
                >
                    <Pressable style={[s.sheet, Platform.OS === 'ios' && { borderTopLeftRadius: 0, borderTopRightRadius: 0, paddingTop: 20 }]}>
                        <View style={s.sheetHandle} />
                        <View style={s.sheetNav}>
                            <TouchableOpacity onPress={() => { setShowLanguageSettings(false); setShowSettings(true); }} style={s.sheetNavBack}>
                                <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
                            </TouchableOpacity>
                            <Text style={s.sheetNavTitle}>{t('profile.language')}</Text>
                            <View style={{ width: 34 }} />
                        </View>
                        {[{ code: 'en', label: 'English' }, { code: 'es', label: 'Español' }].map(lang => (
                            <TouchableOpacity key={lang.code} style={s.sheetItem} activeOpacity={0.7}
                                onPress={() => { i18n.changeLanguage(lang.code); setShowLanguageSettings(false); setShowSettings(true); }}>
                                <Text style={s.sheetItemText}>{lang.label}</Text>
                                {i18n.language === lang.code && <Ionicons name="checkmark-circle" size={19} color={Colors.primary} />}
                            </TouchableOpacity>
                        ))}
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Push Notifications */}
            <Modal visible={showPushSettings} transparent animationType="slide" onRequestClose={() => setShowPushSettings(false)}>
                <Pressable style={s.overlay} onPress={() => setShowPushSettings(false)}>
                    <Pressable style={s.sheet}>
                        <View style={s.sheetHandle} />
                        <View style={s.sheetNav}>
                            <TouchableOpacity onPress={() => { setShowPushSettings(false); setShowSettings(true); }} style={s.sheetNavBack}>
                                <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
                            </TouchableOpacity>
                            <Text style={s.sheetNavTitle}>{t('profile.push_notifications', 'Notificaciones Push')}</Text>
                            <View style={{ width: 34 }} />
                        </View>
                        <View style={{ paddingHorizontal: 4 }}>
                            <View style={s.pushRow}>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.pushLabel}>{t('profile.enable_all', 'Habilitar Notificaciones')}</Text>
                                </View>
                                <Switch value={pushEnabled} onValueChange={() => handleTogglePushSetting('push_notifications_enabled', pushEnabled)} trackColor={{ false: '#ddd', true: Colors.primary }} />
                            </View>
                            {pushEnabled && (<>
                                <Text style={s.pushSectionLabel}>{t('profile.personalize', 'Personalizar')}</Text>
                                {[
                                    { label: t('profile.notif_comments', 'Comentarios'), value: pushComments, key: 'push_notif_comments' },

                                    { label: t('profile.notif_invites', 'Invitaciones'), value: pushInvites, key: 'push_notif_invites' },
                                ].map(item => (
                                    <View key={item.key} style={s.pushRow}>
                                        <Text style={[s.pushLabel, { flex: 1 }]}>{item.label}</Text>
                                        <Switch value={item.value} onValueChange={() => handleTogglePushSetting(item.key, item.value)} trackColor={{ false: '#ddd', true: Colors.primary }} />
                                    </View>
                                ))}
                            </>)}
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Privacy */}
            <Modal visible={showPrivacy} transparent animationType="slide" onRequestClose={() => setShowPrivacy(false)}>
                <Pressable style={s.overlay} onPress={() => setShowPrivacy(false)}>
                    <Pressable style={[s.sheet, { maxHeight: '80%' }]}>
                        <View style={s.sheetHandle} />
                        <View style={s.sheetNav}>
                            <TouchableOpacity onPress={() => { setShowPrivacy(false); setShowSettings(true); }} style={s.sheetNavBack}>
                                <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
                            </TouchableOpacity>
                            <Text style={s.sheetNavTitle}>{t('profile.privacyPolicy')}</Text>
                            <View style={{ width: 34 }} />
                        </View>
                        <ScrollView contentContainerStyle={{ padding: 20 }}>
                            <Text style={s.legalText}>{t('detail.privacy_content')}</Text>
                        </ScrollView>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Terms */}
            <Modal visible={showTerms} transparent animationType="slide" onRequestClose={() => setShowTerms(false)}>
                <Pressable style={s.overlay} onPress={() => setShowTerms(false)}>
                    <Pressable style={[s.sheet, { maxHeight: '80%' }]}>
                        <View style={s.sheetHandle} />
                        <View style={s.sheetNav}>
                            <TouchableOpacity onPress={() => { setShowTerms(false); setShowSettings(true); }} style={s.sheetNavBack}>
                                <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
                            </TouchableOpacity>
                            <Text style={s.sheetNavTitle}>{t('profile.termsOfUse')}</Text>
                            <View style={{ width: 34 }} />
                        </View>
                        <ScrollView contentContainerStyle={{ padding: 20 }}>
                            <Text style={s.legalText}>{t('detail.terms_content')}</Text>
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
                    if (userStories) {
                        const updated = userStories.stories.map((s: any) => s.id === storyId ? { ...s, is_read: true } : s);
                        setUserStories({ ...userStories, stories: updated, all_read: updated.every((s: any) => s.is_read) });
                    }
                }}
            />
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.background },
    centered: { justifyContent: 'center', alignItems: 'center' },
    scrollContent: { paddingBottom: 100 },

    // Banner
    bannerWrap: { height: 200, position: 'relative', overflow: 'hidden' },
    banner: { ...StyleSheet.absoluteFillObject },
    orb: { position: 'absolute', borderRadius: 999 },
    orb1: { width: 200, height: 200, top: -60, right: -40 },
    orb2: { width: 140, height: 140, bottom: -30, left: 30 },
    bannerSticker: { position: 'absolute', zIndex: 5 },
    bannerBtns: {
        position: 'absolute', top: 0, left: 0, right: 0,
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16,
    },
    glassBtn: {
        width: 38, height: 38, borderRadius: 19,
        backgroundColor: 'rgba(0,0,0,0.22)',
        alignItems: 'center', justifyContent: 'center',
    },

    // Header Card — sits over the banner
    headerCard: {
        marginHorizontal: 16,
        marginTop: -28,
        backgroundColor: Colors.surface,
        borderRadius: 24,
        padding: 18,
        borderWidth: 1,
        borderColor: Colors.divider,
        shadowColor: 'rgba(0,0,0,0.08)',
        shadowOpacity: 1, shadowRadius: 16, shadowOffset: { width: 0, height: 4 },
        elevation: 4,
        marginBottom: 12,
    },

    // Avatar row
    avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 14 },
    avatarWrap: { flexShrink: 0 },
    storyRing: {
        width: 80, height: 80, borderRadius: 40,
        padding: 2.5, borderWidth: 2.5, borderColor: Colors.divider,
        alignItems: 'center', justifyContent: 'center',
    },
    avatar: { width: 70, height: 70, borderRadius: 35, backgroundColor: Colors.cardAlt },
    avatarFallback: { width: 70, height: 70, borderRadius: 35, backgroundColor: Colors.cardAlt, alignItems: 'center', justifyContent: 'center' },

    // Stats
    statsRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
    stat: { alignItems: 'center', gap: 2 },
    statValue: { fontSize: 20, fontFamily: Fonts.bold, color: Colors.textPrimary, letterSpacing: -0.5 },
    statLabel: { fontSize: 10, fontFamily: Fonts.semiBold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },

    // Name section
    nameSection: { marginBottom: 14 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
    displayName: { fontSize: 22, fontFamily: Fonts.bold, color: Colors.textPrimary, letterSpacing: -0.3 },
    username: { fontSize: 13, fontFamily: Fonts.medium, color: Colors.textMuted },
    bio: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textSecondary, lineHeight: 20, marginTop: 8 },
    metaRow: { flexDirection: 'row', marginTop: 10 },
    metaChip: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: 10, paddingVertical: 4,
        backgroundColor: Colors.cardAlt, borderRadius: 20,
        borderWidth: 1, borderColor: Colors.divider,
    },
    metaChipText: { fontSize: 11, fontFamily: Fonts.medium, color: Colors.textSecondary },

    // Favorites
    favRow: { gap: 10, marginBottom: 16 },
    favChip: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        padding: 14, backgroundColor: Colors.surface,
        borderRadius: 16, borderWidth: 1, borderColor: Colors.divider,
    },
    favLabel: { fontSize: 10, fontFamily: Fonts.bold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
    favValue: { fontSize: 14, fontFamily: Fonts.medium, color: Colors.textPrimary, lineHeight: 20 },

    // Actions
    actionsRow: { flexDirection: 'row', gap: 10 },
    primaryBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 7, height: 44, borderRadius: 22,
        shadowColor: 'rgba(0,0,0,0.12)', shadowOpacity: 1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
        elevation: 2,
    },
    primaryBtnText: { color: '#fff', fontSize: 14, fontFamily: Fonts.bold },
    iconBtn: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: Colors.cardAlt,
        borderWidth: 1, borderColor: Colors.divider,
        alignItems: 'center', justifyContent: 'center',
    },



    // Tab bar — minimal underline style
    tabBarWrap: {
        flexDirection: 'row',
        marginHorizontal: 16, marginBottom: 4,
        borderBottomWidth: 1, borderBottomColor: Colors.divider,
    },
    tabItem: {
        flex: 1, paddingVertical: 12, alignItems: 'center',
        borderBottomWidth: 2, borderBottomColor: 'transparent',
    },
    tabText: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.textMuted },

    // Grid
    gridWrap: { paddingHorizontal: 12, paddingTop: 12 },
    gridContent: { gap: 12 },
    gridRow: { gap: 12 },
    gridCell: { width: (width - 48) / 3 },

    // Capsule cell — clean card
    capsuleCell: {
        borderRadius: 20, backgroundColor: Colors.surface,
        borderWidth: 1, borderColor: Colors.divider,
        overflow: 'hidden',
        shadowColor: 'rgba(0,0,0,0.06)', shadowOpacity: 1,
        shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
    },
    capsuleVisual: {
        aspectRatio: 1, backgroundColor: Colors.cardAlt,
        alignItems: 'center', justifyContent: 'center',
        position: 'relative',
    },
    capsuleModelImg: { width: '95%', height: '95%' },

    capsuleCoverImg: { width: '100%', height: '100%', resizeMode: 'cover' },

    capsuleTypeDot: {
        position: 'absolute', top: 8, left: 8,
        width: 18, height: 18, borderRadius: 9,
        alignItems: 'center', justifyContent: 'center',
    },
    capsuleSharedDot: {
        position: 'absolute', top: 8, left: 30,
        width: 18, height: 18, borderRadius: 9,
        backgroundColor: Colors.primary,
        alignItems: 'center', justifyContent: 'center',
    },
    capsuleLockOverlay: {
        position: 'absolute', bottom: 8, right: 8,
        width: 20, height: 20, borderRadius: 10,
        backgroundColor: 'rgba(0,0,0,0.38)',
        alignItems: 'center', justifyContent: 'center',
    },
    capsuleMeta: { padding: 9, paddingTop: 7 },
    capsuleTitle: { fontSize: 11, fontFamily: Fonts.bold, color: Colors.textPrimary, marginBottom: 2 },
    capsuleTimer: { fontSize: 8.5, fontFamily: Fonts.semiBold, color: Colors.primary },
    capsuleOpenedTag: { fontSize: 8.5, fontFamily: Fonts.bold, color: Colors.textMuted, letterSpacing: 0.5 },
    accUsername: { fontSize: 14, fontFamily: Fonts.medium, color: Colors.textMuted },


    // Empty state
    emptyState: { paddingVertical: 60, alignItems: 'center', width: '100%' },
    emptyIconWrap: { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.cardAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
    emptyTitle: { fontSize: 15, fontFamily: Fonts.bold, color: Colors.textPrimary, marginBottom: 4 },
    emptySub: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.textMuted, textAlign: 'center' },

    // Feedback overlay
    feedbackOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
    feedbackCard: { width: width * 0.8, backgroundColor: Colors.surface, borderRadius: 28, padding: 28, alignItems: 'center' },
    feedbackIconWrap: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    feedbackTitle: { fontSize: 20, fontFamily: Fonts.bold, color: Colors.textPrimary, marginBottom: 8 },
    feedbackSub: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },

    // Shared sheet styles
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: {
        backgroundColor: Colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
        paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40,
    },
    sheetHandle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.divider, marginBottom: 18 },
    sheetTitle: { fontSize: 18, fontFamily: Fonts.bold, color: Colors.textPrimary, marginBottom: 16 },
    sheetNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    sheetNavBack: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
    sheetNavTitle: { fontSize: 17, fontFamily: Fonts.bold, color: Colors.textPrimary },
    sheetItem: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: Colors.divider,
    },
    sheetItemIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    sheetItemText: { flex: 1, fontSize: 15, fontFamily: Fonts.medium, color: Colors.textPrimary },
    sheetItemValue: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.textMuted, marginRight: 4 },
    cancelBtn: { marginTop: 14, paddingVertical: 14, alignItems: 'center' },
    cancelBtnText: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.textMuted },
    appVersion: { fontSize: 11, fontFamily: Fonts.medium, color: Colors.textMuted, textAlign: 'center', marginTop: 28 },

    // Picker sheet
    pickerSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingBottom: 40 },
    pickerSub: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.textMuted, paddingHorizontal: 20, marginBottom: 14 },
    pickerRow: { paddingHorizontal: 16, gap: 10 },
    pickerThumb: { width: 96, height: 96, borderRadius: 14, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
    pickerThumbImg: { width: '100%', height: '100%' },
    pickerCheck: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.32)', alignItems: 'center', justifyContent: 'center' },

    // Push settings
    pushRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: Colors.divider,
    },
    pushLabel: { fontSize: 14, fontFamily: Fonts.medium, color: Colors.textPrimary },
    pushSectionLabel: { fontSize: 11, fontFamily: Fonts.bold, color: Colors.primary, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 18, marginBottom: 4 },

    legalText: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textSecondary, lineHeight: 22 },
});