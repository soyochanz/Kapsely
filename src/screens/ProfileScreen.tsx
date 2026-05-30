import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    StatusBar, Dimensions, ActivityIndicator, Modal, RefreshControl,
    Linking, Alert, Pressable, Animated, Easing, Platform, Switch, TextInput,
    InteractionManager, DeviceEventEmitter
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlashList } from '@shopify/flash-list';

const AnyFlashList = FlashList as any;


import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { Colors, Fonts, Spacing, BorderRadius, Shadow } from '../theme';
import { getAuthSessionSnapshot, getAuthUserIdSnapshot, safeSignOut, supabase } from '../lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ProfileCapsuleCell } from '../components/profile/ProfileCapsuleCell';
import { ProfileHeader } from '../components/profile/ProfileHeader';
import { FollowSuggestions } from '../components/profile/FollowSuggestions';
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
import AccountHub from '../components/AccountHub';
import QuickLoginModal from '../components/QuickLoginModal';
import * as Localization from 'expo-localization';

const { width } = Dimensions.get('window');
const PROFILE_BOOT_CACHE_PREFIX = '@kapsely_profile_boot_v3';
const PROFILE_BOOT_CACHE_TTL = 5 * 60 * 1000;
const SIMPLE_FRONTEND_PROFILE = true;
const DISABLE_PROFILE_SUGGESTIONS_UNTIL_STABLE = true;
const SUPABASE_RELIEF_MODE = true;

const withTimeout = <T,>(promise: PromiseLike<T>, ms: number): Promise<T | null> =>
    new Promise(resolve => {
        const timer = setTimeout(() => resolve(null), ms);
        Promise.resolve(promise)
            .then(value => {
                clearTimeout(timer);
                resolve(value);
            })
            .catch(() => {
                clearTimeout(timer);
                resolve(null);
            });
    });

const isLockedSealedCapsule = (capsule: any) => {
    if (!capsule || capsule.status !== 'sealed') return false;
    if (capsule.is_opening) return true;
    if (!capsule.opens_at) return false;
    return new Date(capsule.opens_at).getTime() <= Date.now();
};

const canAddContentToCapsule = (capsule: any) => {
    if (!capsule) return false;
    const isBornOpen = capsule.status === 'opened' && Number(capsule.duration_days || 0) === 0;
    const isSealedAndNotReady = capsule.status === 'sealed' && !isLockedSealedCapsule(capsule);
    return isBornOpen || isSealedAndNotReady;
};

type ProfileTab = 'all' | 'opened' | 'sealed';

const TYPE_CONFIG = (t: any): Record<string, { icon: string; color: string; label: string; emoji?: string }> => ({
    instacap: { icon: 'camera', color: Colors.instaCap, label: t('create.instacap_label') },
    legacycap: { icon: 'time', color: Colors.legacyCap, label: t('create.legacycap_label') },
    eventcap: { icon: 'flash', color: Colors.eventCap, label: t('create.eventcap_label') || 'EventCap' },
    opencap: { icon: 'book', color: Colors.primary, label: t('create.opencap_label') || 'OpenCap' },
    birthdaycap: { icon: 'gift', color: '#FF6FB7', label: t('create.birthdaycap_label') || 'BirthdayCap', emoji: '\uD83C\uDF82' },
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
    
    // Auxiliary states
    const [showEdit, setShowEdit] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showLanguageSettings, setShowLanguageSettings] = useState(false);
    const [showPrivacy, setShowPrivacy] = useState(false);
    const [showTerms, setShowTerms] = useState(false);
    const [showPushSettings, setShowPushSettings] = useState(false);
    const [showSupportModal, setShowSupportModal] = useState(false);
    const [showAccountPanel, setShowAccountPanel] = useState(false);
    const [accounts, setAccounts] = useState<SavedAccount[]>([]);
    const [showAddAccount, setShowAddAccount] = useState(false);
    const [isDeletingAccount, setIsDeletingAccount] = useState(false);
    const [deleteConfirmPass, setDeleteConfirmPass] = useState('');
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [oldPassword, setOldPassword] = useState('');
    const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
    const [cachedProfileData, setCachedProfileData] = useState<any | null>(null);
    const [showFollowSuggestions, setShowFollowSuggestions] = useState(false);
    const [deletedCapsuleIds, setDeletedCapsuleIds] = useState<string[]>([]);

    const queryClient = useQueryClient();
    const effectiveProfileId = targetUserId || currentUserId;
    const profileCacheKey = effectiveProfileId ? `${PROFILE_BOOT_CACHE_PREFIX}_${effectiveProfileId}` : null;

    // ─── Fetch Function ──────────────────────────────────────────────────────
    const fetchProfile = async () => {
        const myId = currentUserId || getAuthUserIdSnapshot() || getAuthSessionSnapshot()?.user?.id || null;
        if (myId && !currentUserId) setCurrentUserId(myId);

        const idToLoad = targetUserId || myId;
        if (!idToLoad) throw new Error('No user ID to load');

        if (SIMPLE_FRONTEND_PROFILE) {
            return fetchProfileFallback(idToLoad, myId || null);
        }

        const rpcResult = await withTimeout(supabase.rpc('get_profile_data_unified', {
            p_target_id: idToLoad
        }), 6500);

        const data = rpcResult?.data;
        const error = rpcResult?.error;

        if (error || !data?.profile) {
            console.warn('[Profile] Unified RPC unavailable, using direct fallback', error);
            return fetchProfileFallback(idToLoad, myId || null);
        }


        return data;
    };

    const fetchProfileFallback = async (idToLoad: string, myId: string | null) => {
        const [
            profileRes,
            followersRes,
            followingRes,
            followRes,
            capsulesRes,
            memberInvitesRes,
            storiesRes,
            viewerInvitesRes,
            stickersRes,
        ] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', idToLoad).single(),
            supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', idToLoad),
            supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', idToLoad),
            myId ? supabase.from('follows').select('following_id').eq('follower_id', myId).eq('following_id', idToLoad).maybeSingle() : Promise.resolve({ data: null } as any),
            supabase.from('capsules').select('*').eq('owner_id', idToLoad).order('created_at', { ascending: false }),
            supabase
                .from('capsule_invites')
                .select('capsule_id, cover_url, capsules:capsule_id(*)')
                .eq('user_id', idToLoad)
                .eq('status', 'accepted'),
            supabase
                .from('capsule_items')
                .select('*, capsules:capsule_id(id, title, type, model)')
                .eq('owner_id', idToLoad)
                .eq('is_story', true)
                .gt('expires_at', new Date().toISOString())
                .order('created_at', { ascending: false }),
            myId ? supabase.from('capsule_invites').select('capsule_id').eq('user_id', myId).eq('status', 'accepted') : Promise.resolve({ data: [] } as any),
            supabase.from('profile_stickers').select('*, stickers(*)').eq('user_id', idToLoad),
        ]);

        if (profileRes.error) throw profileRes.error;

        const ownerCapsules = capsulesRes.data || [];
        const memberCapsules = (memberInvitesRes.data || [])
            .map((invite: any) => ({
                ...(Array.isArray(invite.capsules) ? invite.capsules[0] : invite.capsules),
                member_cover_url: invite.cover_url,
                is_member_capsule: true,
                participant_count: 1,
            }))
            .filter((capsule: any) => capsule?.id && capsule.owner_id !== idToLoad);
        const combinedCapsules = Array.from(
            new Map([...ownerCapsules, ...memberCapsules].map((capsule: any) => [capsule.id, capsule])).values()
        ).sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

        const capsuleIds = combinedCapsules.map((c: any) => c.id);
        const [mediaRes, likesRes, commentsRes] = capsuleIds.length
            ? await Promise.all([
                supabase
                    .from('capsule_items')
                    .select('id, capsule_id, media_url, media_type, thumbnail_url, created_at')
                    .in('capsule_id', capsuleIds)
                    .eq('is_story', false)
                    .neq('moderation_status', 'rejected')
                    .in('media_type', ['image', 'video'])
                    .order('created_at', { ascending: false }),
                supabase.from('likes').select('capsule_id').in('capsule_id', capsuleIds),
                supabase.from('comments').select('capsule_id').in('capsule_id', capsuleIds),
            ])
            : [{ data: [] }, { data: [] }, { data: [] }] as any;

        const mediaByCapsule = new Map<string, any[]>();
        (mediaRes.data || []).forEach((item: any) => {
            const list = mediaByCapsule.get(item.capsule_id) || [];
            if (list.length < 4) list.push(item);
            mediaByCapsule.set(item.capsule_id, list);
        });

        const countByCapsule = (rows: any[] = []) => rows.reduce((acc: Record<string, number>, row: any) => {
            acc[row.capsule_id] = (acc[row.capsule_id] || 0) + 1;
            return acc;
        }, {});

        const likeCounts = countByCapsule(likesRes.data || []);
        const commentCounts = countByCapsule(commentsRes.data || []);

        return {
            profile: {
                ...profileRes.data,
                followers_count: followersRes.count || 0,
                following_count: followingRes.count || 0,
            },
            is_following: !!followRes.data,
            stories: storiesRes.data || [],
            capsules: combinedCapsules.map((capsule: any) => {
                const media = mediaByCapsule.get(capsule.id) || [];
                return {
                    ...capsule,
                    effective_cover_url: capsule.member_cover_url || capsule.cover_url || media[0]?.thumbnail_url || media[0]?.media_url,
                    fallback_media: media,
                    likes_count: likeCounts[capsule.id] || 0,
                    comments_count: commentCounts[capsule.id] || 0,
                    posts_count: media.length,
                };
            }),
            my_reads: [],
            my_accepted_invites: (viewerInvitesRes.data || []).map((invite: any) => invite.capsule_id),
            stickers: stickersRes.data || [],
        };
    };

    // ─── useQuery ────────────────────────────────────────────────────────────
    const {
        data: profileDataUnified,
        isLoading,
        isRefetching,
        refetch,
        status
    } = useQuery({
        queryKey: ['profile', targetUserId || currentUserId],
        queryFn: fetchProfile,
        enabled: !!(targetUserId || currentUserId),
        staleTime: 3 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
    });

    const displayProfileData = profileDataUnified || cachedProfileData;
    const profile = displayProfileData?.profile;
    const isFollowingValue = displayProfileData?.is_following || false;
    const capsulesData = (displayProfileData?.capsules || []).filter((capsule: any) => !deletedCapsuleIds.includes(capsule.id));
    const storiesData = displayProfileData?.stories || [];
    const stickersData = displayProfileData?.stickers || [];
    const readIds = new Set(displayProfileData?.my_reads || []);
    const myAcceptedCaps = new Set(displayProfileData?.my_accepted_invites || []);

    useEffect(() => {
        let alive = true;
        if (!profileCacheKey) return () => { alive = false; };
        AsyncStorage.getItem(profileCacheKey)
            .then(raw => {
                if (!alive || !raw) return;
                const parsed = JSON.parse(raw);
                if (Date.now() - (parsed.savedAt || 0) < PROFILE_BOOT_CACHE_TTL) {
                    setCachedProfileData(parsed.data);
                }
            })
            .catch(() => {});
        return () => { alive = false; };
    }, [profileCacheKey]);

    useEffect(() => {
        setDeletedCapsuleIds([]);
    }, [targetUserId, currentUserId]);

    useEffect(() => {
        if (!profileDataUnified || !profileCacheKey) return;
        AsyncStorage.setItem(profileCacheKey, JSON.stringify({
            savedAt: Date.now(),
            data: profileDataUnified,
        })).catch(() => {});
    }, [profileDataUnified, profileCacheKey]);

    useEffect(() => {
        if (displayProfileData) {
            setFollowersCount(displayProfileData.profile?.followers_count || 0);
            setFollowingCount(displayProfileData.profile?.following_count || 0);
            setIsFollowing(displayProfileData.is_following || false);
            setProfileStickers(displayProfileData.stickers || []);

            // Populate cover and media maps from RPC results to avoid secondary fetches
            const newCoverMap: Record<string, string> = {};
            const newMediaMap: Record<string, any[]> = {};
            
            (displayProfileData.capsules || []).forEach((c: any) => {
                if (c.effective_cover_url) newCoverMap[c.id] = c.effective_cover_url;
                if (c.fallback_media) newMediaMap[c.id] = c.fallback_media;
            });
            
            setCoverMap(prev => ({ ...prev, ...newCoverMap }));
            setCapsuleMediaMap(prev => ({ ...prev, ...newMediaMap }));

            if (displayProfileData.stories?.length > 0) {
                const prof = displayProfileData.profile;
                setUserStories({ ...prof, owner_id: prof.id, stories: displayProfileData.stories });
            } else {
                setUserStories(null);
            }
        }
    }, [displayProfileData]);

    useEffect(() => {
        if (showAccountPanel) {
            multiAccountService.getAccounts().then(setAccounts);
        }
    }, [showAccountPanel]);

    useEffect(() => {
        const removeCapsuleFromProfileCaches = (capsuleId?: string | null) => {
            if (!capsuleId) return;
            setDeletedCapsuleIds(prev => prev.includes(capsuleId) ? prev : [...prev, capsuleId]);
            const queryKey = ['profile', targetUserId || currentUserId];
            queryClient.setQueryData(queryKey, (prev: any) => {
                if (!prev?.capsules) return prev;
                return {
                    ...prev,
                    capsules: prev.capsules.filter((capsule: any) => capsule.id !== capsuleId),
                };
            });
            setCachedProfileData((prev: any) => {
                if (!prev?.capsules) return prev;
                return {
                    ...prev,
                    capsules: prev.capsules.filter((capsule: any) => capsule.id !== capsuleId),
                };
            });
        };

        const subDel = DeviceEventEmitter.addListener('capsule_deleted', (payload?: { capsuleId?: string }) => {
            removeCapsuleFromProfileCaches(payload?.capsuleId || null);
            if (!SUPABASE_RELIEF_MODE) refetch();
        });
        const subNew = DeviceEventEmitter.addListener('capsule_created', () => {
            if (!SUPABASE_RELIEF_MODE) refetch();
        });
        return () => { subDel.remove(); subNew.remove(); };
    }, [refetch, queryClient, targetUserId, currentUserId]);

    const lastFocusFetchRef = useRef(0);
    useFocusEffect(
        useCallback(() => {
            if (SUPABASE_RELIEF_MODE) return;
            const now = Date.now();
            if (now - lastFocusFetchRef.current > 30_000) {
                lastFocusFetchRef.current = now;
                refetch();
            }
        }, [refetch])
    );

    const handleSwitchAccount = async (accountId: string) => {
        try {
            await multiAccountService.saveCurrentAccount();
            await multiAccountService.switchAccount(accountId);
            setShowAccountPanel(false);
        } catch (e: any) {
            Alert.alert(t('common.error'), e.message);
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

            const { error: delErr } = await supabase.rpc('request_account_deletion');
            if (delErr) throw delErr;

            await multiAccountService.logoutCurrentAndRemove();
            setShowDeleteModal(false);
            Alert.alert(t('common.ready'), t('profile.account_deletion_scheduled'));
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
    const [showCapsuleOptions, setShowCapsuleOptions] = useState(false);
    const [selectedCapsuleOptions, setSelectedCapsuleOptions] = useState<any | null>(null);
    const [birthdayCongratsCount, setBirthdayCongratsCount] = useState(0);
    const [hasSentBirthdayCongrats, setHasSentBirthdayCongrats] = useState(false);
    const [birthdayGiftCounts, setBirthdayGiftCounts] = useState<Record<string, number>>({});

    useEffect(() => {
        const checkOwn = async () => {
            const myId = getAuthUserIdSnapshot() || getAuthSessionSnapshot()?.user?.id || null;
            if (myId) {
                setCurrentUserId(myId);
                if (targetUserId) {
                    setIsOwnProfileState(targetUserId === myId);
                    safetyService.isBlocked(myId, targetUserId).then(setIsBlocked);
                } else setIsOwnProfileState(true);
            }
        };
        checkOwn();
    }, [targetUserId]);

    useEffect(() => {
        if (DISABLE_PROFILE_SUGGESTIONS_UNTIL_STABLE) {
            setShowFollowSuggestions(false);
            return;
        }
        setShowFollowSuggestions(false);
        const task = InteractionManager.runAfterInteractions(() => {
            const timer = setTimeout(() => setShowFollowSuggestions(true), 500);
            return () => clearTimeout(timer);
        });
        return () => task.cancel?.();
    }, [currentUserId, isOwnProfile]);

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

    const openedCaps = useMemo(() => capsulesData.filter((c: any) => c.status === 'opened').map((c: any) => ({
        ...c,
        isAccessible: isOwnProfile || c.is_public || c.owner_id === currentUserId || myAcceptedCaps.has(c.id) || (c.invited_user_id === currentUserId && c.invite_status === 'accepted')
    })), [capsulesData, isOwnProfile, currentUserId, myAcceptedCaps]);

    const sealedCaps = useMemo(() => capsulesData.filter((c: any) => c.status === 'sealed').map((c: any) => ({
        ...c,
        isAccessible: isOwnProfile || c.is_public || c.owner_id === currentUserId || myAcceptedCaps.has(c.id) || (c.invited_user_id === currentUserId && c.invite_status === 'accepted')
    })), [capsulesData, isOwnProfile, currentUserId, myAcceptedCaps]);

    const handleProfileCapsuleLongPress = useCallback((cap: any) => {
        setSelectedCapsuleOptions(cap);
        setShowCapsuleOptions(true);
    }, [isOwnProfile, currentUserId, myAcceptedCaps, t, navigation]);

    const canManageProfileCapsule = useCallback((cap: any) => {
        return !!cap && (
            isOwnProfile ||
            cap.owner_id === currentUserId ||
            myAcceptedCaps.has(cap.id) ||
            (cap.invited_user_id === currentUserId && cap.invite_status === 'accepted')
        );
    }, [isOwnProfile, currentUserId, myAcceptedCaps]);

    const handleDeleteCapsuleFromSheet = useCallback((cap: any) => {
        setShowCapsuleOptions(false);
        const execDelete = async () => {
            try {
                if (cap?.is_shared) {
                    const { data, error } = await supabase.rpc('vote_delete_capsule', { p_capsule_id: cap.id });
                    if (error) throw error;
                    if (data?.status === 'deleted') {
                        DeviceEventEmitter.emit('capsule_deleted', { capsuleId: cap.id });
                    } else {
                        Alert.alert('Kapsely', t('detail.delete_vote_registered'));
                    }
                } else {
                    const { error } = await supabase.rpc('delete_capsule', { p_capsule_id: cap.id });
                    if (error) throw error;
                    DeviceEventEmitter.emit('capsule_deleted', { capsuleId: cap.id });
                }
            } catch (error: any) {
                Alert.alert(t('common.error'), error?.message || t('detail.delete_error'));
            }
        };

        Alert.alert(t('detail.delete_capsule_title'), t('detail.delete_capsule_msg'), [
            { text: t('detail.keep_it'), style: 'cancel' },
            { text: t('common.delete'), style: 'destructive', onPress: execDelete },
        ]);
    }, [t]);

    useEffect(() => {
        const sub = DeviceEventEmitter.addListener('CAPSULE_UPDATED', () => {
            queryClient.invalidateQueries({ queryKey: ['profile', targetUserId || currentUserId] });
        });
        return () => sub.remove();
    }, [targetUserId, currentUserId, queryClient]);

    // Redundant batch-fetch removed (now handled by RPC)

    useEffect(() => {
        const idToLoad = targetUserId || currentUserId;
        if (!idToLoad || SUPABASE_RELIEF_MODE) return;

        const channel = supabase.channel(`profile-${idToLoad}`)
            .on('postgres_changes', 
                { event: 'UPDATE', schema: 'public', table: 'capsules', filter: `owner_id=eq.${idToLoad}` }, 
                () => queryClient.invalidateQueries({ queryKey: ['profile', idToLoad] })
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [targetUserId, currentUserId]);

    const onRefresh = () => {
        refetch();
    };

    const birthdayYear = new Date().getFullYear();
    const isBirthdayToday = useMemo(() => {
        if (!profile?.birthdate) return false;
        const [year, month, day] = String(profile.birthdate).split('-').map(Number);
        if (!year || !month || !day) return false;
        const now = new Date();
        return month === now.getMonth() + 1 && day === now.getDate();
    }, [profile?.birthdate]);

    useEffect(() => {
        const loadBirthdayCongrats = async () => {
            if (!profile?.id || !currentUserId || !isBirthdayToday) {
                setBirthdayCongratsCount(0);
                setHasSentBirthdayCongrats(false);
                setBirthdayGiftCounts({});
                return;
            }

            const [giftRes, sentRes] = await Promise.all([
                supabase
                    .from('birthday_congratulations')
                    .select('gift_type')
                    .eq('profile_id', profile.id)
                    .eq('birthday_year', birthdayYear),
                supabase
                    .from('birthday_congratulations')
                    .select('profile_id')
                    .eq('profile_id', profile.id)
                    .eq('sender_id', currentUserId)
                    .eq('birthday_year', birthdayYear)
                    .maybeSingle()
            ]);

            const counts = (giftRes.data || []).reduce((acc: Record<string, number>, row: any) => {
                const gift = row.gift_type || 'cake';
                acc[gift] = (acc[gift] || 0) + 1;
                return acc;
            }, {});
            setBirthdayGiftCounts(counts);
            setBirthdayCongratsCount((giftRes.data || []).length);
            setHasSentBirthdayCongrats(!!sentRes.data);
        };

        loadBirthdayCongrats();
    }, [profile?.id, currentUserId, isBirthdayToday, birthdayYear]);

    const handleBirthdayCongrats = useCallback(async (giftType = 'cake') => {
        if (!profile?.id || !currentUserId || hasSentBirthdayCongrats) return false;

        const { error } = await supabase.from('birthday_congratulations').insert({
            profile_id: profile.id,
            sender_id: currentUserId,
            birthday_year: birthdayYear,
            gift_type: giftType,
        });

        if (error && error.code !== '23505') {
            Alert.alert(t('common.error'), error.message);
            return false;
        }

        if (!hasSentBirthdayCongrats) {
            setBirthdayCongratsCount(count => count + 1);
            setBirthdayGiftCounts(counts => ({ ...counts, [giftType]: (counts[giftType] || 0) + 1 }));
        }
        setHasSentBirthdayCongrats(true);
        return true;
    }, [profile?.id, currentUserId, hasSentBirthdayCongrats, birthdayYear, t]);

    const handleLogout = async () => {
        if (Platform.OS === 'web') {
            if (window.confirm('Are you sure you want to log out?')) { setShowSettings(false); await safeSignOut(); }
            return;
        }
        Alert.alert(t('profile.logout'), t('profile.logout_confirm'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('profile.logout'), style: 'destructive', onPress: async () => { setShowSettings(false); await safeSignOut(); } }
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
        queryClient.invalidateQueries({ queryKey: ['profile', currentUserId] });
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

    // Extracted so FlashList header always gets the latest closure (not a stale cached version)
    const handleShowStories = useCallback(async () => {
        if (!userStories) return;
        try {
            const ownerId = userStories.owner_id;
            const { data: fullStories } = await supabase
                .from('capsule_items')
                .select('*, capsules:capsule_id(id, title, type, model)')
                .eq('owner_id', ownerId)
                .eq('is_story', true)
                .gt('expires_at', new Date().toISOString())
                .order('created_at', { ascending: true });
            if (fullStories?.length) {
                setUserStories((prev: any) => prev ? { ...prev, stories: fullStories } : prev);
            }
        } catch (_) {}
        setActiveStoryViewer(true);
    }, [userStories]);
    const tabData = activeTab === 'all'
        ? [...openedCaps, ...sealedCaps].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        : activeTab === 'sealed' ? sealedCaps : openedCaps;

    const sortedTabData = [...tabData].sort((a, b) => {
        if (a.type === 'legacycap' && b.type !== 'legacycap') return -1;
        if (b.type === 'legacycap' && a.type !== 'legacycap') return 1;
        return 0;
    });
    const renderHeader = useCallback(() => (
        <View>
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
                onShowStories={handleShowStories}
                onBack={() => navigation.goBack()}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                insets={insets}
                t={t}
                i18n={i18n}
                joinYear={joinYear}
                profileId={profileId || targetUserId || currentUserId || ''}
                navigation={navigation}
                isBirthdayToday={isBirthdayToday}
                birthdayCongratsCount={birthdayCongratsCount}
                birthdayGiftCounts={birthdayGiftCounts}
                hasSentBirthdayCongrats={hasSentBirthdayCongrats}
                onBirthdayCongrats={handleBirthdayCongrats}
            />
            {isOwnProfile && currentUserId && showFollowSuggestions && (
                <FollowSuggestions 
                    currentUserId={currentUserId} 
                    onFollowUpdate={() => {
                        // Optionally refetch or update state
                        setFollowingCount(p => p + 1);
                    }}
                />
            )}
        </View>
    ), [
        profile, accentColor, profileStickers, userStories, followersCount, followingCount,
        openedCaps.length, sealedCaps.length, isOwnProfile, isFollowing, activeTab, insets, t, i18n, joinYear, profileId, navigation,
        handleShowStories, currentUserId, showFollowSuggestions, isBirthdayToday, birthdayCongratsCount, birthdayGiftCounts, hasSentBirthdayCongrats, handleBirthdayCongrats
    ]);

    if (isLoading && !displayProfileData) {
        return (
            <View style={s.root}>
                <StatusBar barStyle="light-content" />
                <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                    <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={{ height: 250, paddingTop: insets.top + 18, paddingHorizontal: 20 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.22)' }} />
                            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.22)' }} />
                        </View>
                    </LinearGradient>
                    <View style={{ marginTop: -68, alignItems: 'center', paddingHorizontal: 18 }}>
                        <View style={{ width: 124, height: 124, borderRadius: 62, backgroundColor: Colors.surface, borderWidth: 4, borderColor: Colors.background }} />
                        <View style={{ width: 170, height: 24, borderRadius: 12, backgroundColor: Colors.border, marginTop: 14 }} />
                        <View style={{ width: 118, height: 16, borderRadius: 8, backgroundColor: Colors.border, marginTop: 8 }} />
                        <View style={{ flexDirection: 'row', gap: 12, marginTop: 18 }}>
                            {[0, 1, 2].map(i => <View key={i} style={{ width: 88, height: 52, borderRadius: 16, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border }} />)}
                        </View>
                        <View style={{ width: '100%', height: 44, borderRadius: 22, backgroundColor: Colors.border, marginTop: 20 }} />
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 14, marginTop: 28 }}>
                        {Array.from({ length: 6 }).map((_, i) => <View key={i} style={{ width: (width - 36) / 2, height: 220, borderRadius: 18, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border }} />)}
                    </View>
                </ScrollView>
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
                    onClose={() => { setShowEdit(false); refetch(); }} 
                    initialData={profile}
                />
            </Modal>

            <AnyFlashList
                data={sortedTabData}
                keyExtractor={(item: any) => item.id}
                numColumns={3}
                estimatedItemSize={190}
                contentContainerStyle={[s.gridContent, { paddingBottom: 100 }]}
                ListHeaderComponent={renderHeader}
                renderItem={({ item }: { item: any }) => (
                    <View style={s.gridCell}>
                        <ProfileCapsuleCell
                            cap={item}
                            navigation={navigation}
                            isOwnProfile={isOwnProfile}
                            canManage={canManageProfileCapsule(item)}
                            isSealed={item.status === 'sealed'}
                            cfg={TYPE_CONFIG(t)[item.type] || TYPE_CONFIG(t).instacap}
                            coverUrl={coverMap[item.id]}
                            itemsCount={item.posts_count ?? item.capsule_items_count ?? 0}
                            likesCount={item.likes_count ?? 0}
                            commentsCount={item.comments_count ?? 0}
                            setPickerCapsuleId={setPickerCapsuleId}
                            themeColor={accentColor}
                            capsuleMediaMap={capsuleMediaMap}
                            t={t}
                            onLongPressCapsule={handleProfileCapsuleLongPress}
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
                onEndReachedThreshold={0.5}
                refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={Colors.primary} />}
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

            <Modal visible={showCapsuleOptions} transparent animationType="fade">
                <Pressable
                    style={s.overlay}
                    onPress={() => {
                        setShowCapsuleOptions(false);
                        setSelectedCapsuleOptions(null);
                    }}
                >
                    <View style={s.sheet}>
                        <View style={s.sheetHandle} />
                        <Text style={s.sheetTitle}>{selectedCapsuleOptions?.title || 'Kapsely'}</Text>
                        {!!selectedCapsuleOptions?.status && (
                            <Text style={s.capsuleSheetSub}>
                                {selectedCapsuleOptions.status === 'opened' ? t('detail.opened') : t('detail.sealed')}
                            </Text>
                        )}

                        <TouchableOpacity
                            style={s.sheetItem}
                            activeOpacity={0.7}
                            onPress={() => {
                                const cap = selectedCapsuleOptions;
                                setShowCapsuleOptions(false);
                                setSelectedCapsuleOptions(null);
                                if (cap) navigation.navigate('InstagramShare', { capsule: cap });
                            }}
                        >
                            <View style={[s.sheetItemIcon, { backgroundColor: '#E1306C12' }]}>
                                <Ionicons name="logo-instagram" size={18} color="#E1306C" />
                            </View>
                            <Text style={s.sheetItemText}>{t('detail.share_instagram') || 'Compartir en Historia de Instagram'}</Text>
                            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                        </TouchableOpacity>

                        {!!selectedCapsuleOptions && canManageProfileCapsule(selectedCapsuleOptions) && (
                            <>
                                {canAddContentToCapsule(selectedCapsuleOptions) && (
                                    <TouchableOpacity
                                        style={s.sheetItem}
                                        activeOpacity={0.7}
                                        onPress={() => {
                                            const cap = selectedCapsuleOptions;
                                            setShowCapsuleOptions(false);
                                            setSelectedCapsuleOptions(null);
                                            if (cap) navigation.navigate('CreateSelection', { capsuleId: cap.id });
                                        }}
                                    >
                                        <View style={[s.sheetItemIcon, { backgroundColor: Colors.primary + '12' }]}>
                                            <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
                                        </View>
                                        <Text style={s.sheetItemText}>{t('detail.add_content') || 'Agregar contenido'}</Text>
                                        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                                    </TouchableOpacity>
                                )}

                                {selectedCapsuleOptions.status === 'opened' && (capsuleMediaMap[selectedCapsuleOptions.id] || []).length > 0 && (
                                    <TouchableOpacity
                                        style={s.sheetItem}
                                        activeOpacity={0.7}
                                        onPress={() => {
                                            const cap = selectedCapsuleOptions;
                                            setShowCapsuleOptions(false);
                                            setSelectedCapsuleOptions(null);
                                            if (cap) setPickerCapsuleId(cap.id);
                                        }}
                                    >
                                        <View style={[s.sheetItemIcon, { backgroundColor: Colors.primary + '12' }]}>
                                            <Ionicons name="image-outline" size={18} color={Colors.primary} />
                                        </View>
                                        <Text style={s.sheetItemText}>{t('profile.setAsCover')}</Text>
                                        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                                    </TouchableOpacity>
                                )}

                                <TouchableOpacity
                                    style={s.sheetItem}
                                    activeOpacity={0.7}
                                    onPress={() => {
                                        if (selectedCapsuleOptions) handleDeleteCapsuleFromSheet(selectedCapsuleOptions);
                                        setSelectedCapsuleOptions(null);
                                    }}
                                >
                                    <View style={[s.sheetItemIcon, { backgroundColor: Colors.error + '12' }]}>
                                        <Ionicons name="trash-outline" size={18} color={Colors.error} />
                                    </View>
                                    <Text style={[s.sheetItemText, { color: Colors.error, fontFamily: Fonts.bold }]}>{t('common.delete')}</Text>
                                    <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                                </TouchableOpacity>
                            </>
                        )}

                        <TouchableOpacity
                            style={s.cancelBtn}
                            activeOpacity={0.7}
                            onPress={() => {
                                setShowCapsuleOptions(false);
                                setSelectedCapsuleOptions(null);
                            }}
                        >
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
                                            setCoverMap((p: Record<string, string>) => ({ ...p, [pickerCapsuleId!]: mediaUrl })); 
                                            setPickerCapsuleId(null); 
                                            
                                            // Persist to DB
                                            try {
                                                const cap = capsulesData.find((c: any) => c.id === pickerCapsuleId);
                                                const isOwner = cap?.owner_id === currentUserId;
                                                let error;
                                                if (isOwner) {
                                                    const res = await supabase.from('capsules').update({ cover_url: mediaUrl }).eq('id', pickerCapsuleId);
                                                    error = res.error;
                                                } else {
                                                    const res = await supabase.from('capsule_invites').update({ cover_url: mediaUrl }).eq('capsule_id', pickerCapsuleId).eq('user_id', currentUserId);
                                                    error = res.error;
                                                }
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
                            { icon: 'person-circle-outline', color: Colors.primary, label: t('profile.account_panel'), onPress: () => { setShowSettings(false); setShowAccountPanel(true); } },
                            { icon: 'sparkles-outline', color: Colors.primary, label: t('profile.personalizeProfile'), onPress: () => { setShowSettings(false); navigation.navigate('PersonalizeProfile'); } },
                            { icon: 'language-outline', color: Colors.textSecondary, label: t('profile.language'), value: i18n.language === 'es' ? 'Español' : 'English', onPress: () => { setShowSettings(false); setShowLanguageSettings(true); } },
                            { icon: 'notifications-outline', color: Colors.textSecondary, label: t('profile.push_notifications', 'Notificaciones Push'), onPress: () => { setShowSettings(false); Linking.openSettings(); } },
                            { icon: 'help-buoy-outline', color: Colors.textSecondary, label: t('profile.support'), onPress: () => { setShowSettings(false); setShowSupportModal(true); } },
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
            {/* Account Hub Modal */}
            <Modal 
                visible={showAccountPanel} 
                transparent 
                animationType="slide"
                onRequestClose={() => setShowAccountPanel(false)}
            >
                <View style={s.overlay}>
                    <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowAccountPanel(false)} />
                    <AccountHub 
                        accounts={accounts}
                        currentUserId={currentUserId}
                        onClose={() => setShowAccountPanel(false)}
                        onAddAccount={() => {
                            setShowAccountPanel(false);
                            setTimeout(() => setShowAddAccount(true), 300);
                        }}
                        onSwitch={handleSwitchAccount}
                    />
                </View>
            </Modal>

            <QuickLoginModal 
                visible={showAddAccount}
                onClose={() => setShowAddAccount(false)}
                onSuccess={async () => {
                    setShowAddAccount(false);
                    const accs = await multiAccountService.getAccounts();
                    setAccounts(accs);
                }}
            />

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

            {/* Modern Language Selector */}
            <Modal
                visible={showLanguageSettings}
                transparent
                animationType="fade"
                onRequestClose={() => setShowLanguageSettings(false)}
            >
                <View style={s.overlay}>
                    <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowLanguageSettings(false)}>
                        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                    </TouchableOpacity>
                    
                    <View style={[s.sheet, { borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingBottom: Platform.OS === 'ios' ? 40 : 20 }]}>
                        <View style={s.sheetHandle} />
                        <Text style={[s.sheetTitle, { textAlign: 'center', marginBottom: 24 }]}>{t('profile.language')}</Text>
                        
                        <View style={{ gap: 12 }}>
                            {[
                                { code: 'en', label: 'English', flag: '🇺🇸' }, 
                                { code: 'es', label: 'Español', flag: '🇪🇸' }
                            ].map(lang => {
                                const isSelected = i18n.language === lang.code || (i18n.language.startsWith(lang.code));
                                return (
                                    <TouchableOpacity 
                                        key={lang.code} 
                                        style={[
                                            s.sheetItem, 
                                            { 
                                                borderRadius: 20, 
                                                borderWidth: 1.5, 
                                                borderColor: isSelected ? Colors.primary : 'rgba(0,0,0,0.05)',
                                                backgroundColor: isSelected ? Colors.primary + '08' : Colors.cardAlt,
                                                paddingHorizontal: 20,
                                                paddingVertical: 18,
                                                borderBottomWidth: 1.5,
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                gap: 16
                                            }
                                        ]} 
                                        activeOpacity={0.7}
                                        onPress={async () => { 
                                            await i18n.changeLanguage(lang.code); 
                                            await AsyncStorage.setItem('@user_language', lang.code);
                                            setShowLanguageSettings(false); 
                                        }}
                                    >
                                        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...Shadow.subtle }}>
                                            <Text style={{ fontSize: 24 }}>{lang.flag}</Text>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[s.sheetItemText, { fontSize: 16, fontFamily: isSelected ? Fonts.bold : Fonts.medium, color: isSelected ? Colors.primary : Colors.textPrimary }]}>
                                                {lang.label}
                                            </Text>
                                            <Text style={{ fontSize: 11, color: Colors.textMuted }}>{lang.code === 'es' ? 'Predeterminado' : 'Switch to English'}</Text>
                                        </View>
                                        {isSelected && (
                                            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                                                <Ionicons name="checkmark" size={16} color="#fff" />
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <TouchableOpacity style={s.cancelBtn} onPress={() => setShowLanguageSettings(false)}>
                            <Text style={s.cancelBtnText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
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
                currentUserId={currentUserId || undefined}
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
    gridContent: { gap: 2, paddingHorizontal: 2 },
    gridRow: { gap: 2 },
    gridCell: { width: (width - 8) / 3, height: Math.floor((width - 8) / 3) + 48, marginBottom: 8 },

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
    capsuleSheetSub: { marginTop: -8, marginBottom: 12, fontSize: 13, fontFamily: Fonts.medium, color: Colors.textMuted, textAlign: 'center' },
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
