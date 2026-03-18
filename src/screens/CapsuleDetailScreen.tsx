import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, Image, ScrollView, TouchableOpacity,
    TextInput, Dimensions, Animated, StatusBar, Alert, ActivityIndicator,
    Modal, FlatList, KeyboardAvoidingView, Platform, Pressable, Share, Linking, SectionList, Keyboard
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Colors, Fonts, Spacing, Shadow, BorderRadius } from '../theme';
import { supabase } from '../lib/supabase';
import { sendPushNotification } from '../utils/pushNotifications';

const { width, height } = Dimensions.get('window');
const GRID_COLS = 3;
const GRID_GAP = 4;
const SECTION_PAD = Spacing.md * 2;
const ITEM_SIZE = (width - SECTION_PAD - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
const ITEM_HEIGHT = (ITEM_SIZE * 16) / 9;

import { MODEL_IMAGES, MODEL_TINTS, MODEL_IMAGES_OPEN } from '../constants/models';

import LiveTimer from '../components/LiveTimer';
import CapsuleWithTimer from '../components/CapsuleWithTimer';
import LiveChat from '../components/LiveChat';
import VerifiedBadge from '../components/VerifiedBadge';
import { timerConfigManager } from '../utils/timerConfig';
import { safetyService, ReportType } from '../utils/safety';



// Sub-component for stable hooks
const AudioController = ({ uri, onFinish }: { uri: string | null, onFinish: () => void }) => {
    const player = useAudioPlayer(uri ? { uri } : null);
    const playStatus = useAudioPlayerStatus(player);

    useEffect(() => {
        if (uri && player) player.play();
        else if (!uri && player) player.pause();
    }, [uri, player]);

    useEffect(() => {
        if (playStatus.didJustFinish) onFinish();
    }, [playStatus.didJustFinish]);

    return null;
};

const VideoWithTrim = ({ item, isActive, style }: { item: any, isActive: boolean, style: any }) => {
    const contentParts = item.content ? item.content.split('|') : [];
    const trimData = contentParts[1] ? contentParts[1].split('-') : [];
    const trimStart = trimData[0] ? parseInt(trimData[0], 10) : 0;
    const trimEnd = trimData[1] ? parseInt(trimData[1], 10) : null;
    const videoRef = React.useRef<any>(null);

    const onPlaybackStatusUpdate = (status: any) => {
        if (trimEnd && status.positionMillis >= trimEnd) {
            videoRef.current?.pauseAsync();
            videoRef.current?.setPositionAsync(trimStart);
        }
    };

    return (
        <Video
            ref={videoRef}
            source={{ uri: item.media_url }}
            rate={1.0}
            volume={1.0}
            isMuted={false}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={isActive}
            useNativeControls
            style={style}
            positionMillis={trimStart}
            onPlaybackStatusUpdate={onPlaybackStatusUpdate}
        />
    );
};

export default function CapsuleDetailScreen() {
    const { t } = useTranslation();
    const navigation = useNavigation<any>();
    const route = useRoute();
    const { capsuleId }: any = route.params || {};

    const [capsule, setCapsule] = useState<any>(null);
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isOpening, setIsOpening] = useState(false);
    const [openingTimer, setOpeningTimer] = useState(10);
    const [flashAnim] = useState(new Animated.Value(0));
    const [modelTint, setModelTint] = useState<string | null>(null);

    // Social states
    const [comment, setComment] = useState('');
    const [comments, setComments] = useState<any[]>([]);
    const [likeCount, setLikeCount] = useState(0);
    const [isLiked, setIsLiked] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [invites, setInvites] = useState<any[]>([]);
    const [acceptedMembers, setAcceptedMembers] = useState<any[]>([]);

    // Media Viewer state
    const [viewerVisible, setViewerVisible] = useState(false);
    const [initialIndex, setInitialIndex] = useState(0);
    const [activeViewerIndex, setActiveViewerIndex] = useState(0);

    const [page, setPage] = useState(1);
    const [filterType, setFilterType] = useState('all');
    const [filterSort, setFilterSort] = useState('newest');

    const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);

    const [isFollowedOwner, setIsFollowedOwner] = useState(false);

    const [showOptions, setShowOptions] = useState(false);
    const [showQRModal, setShowQRModal] = useState(false);
    const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);

    const isSealed = capsule?.status === 'sealed';
    const [modelImg, setModelImg] = useState<string>(() => {
        if (!capsule) return (MODEL_IMAGES as any).basicred_kap;
        return isSealed
            ? (timerConfigManager.getModelImage(capsule.model) || MODEL_IMAGES[capsule.model as keyof typeof MODEL_IMAGES] || (MODEL_IMAGES as any).basicred_kap)
            : (timerConfigManager.getModelImageOpen(capsule.model) || MODEL_IMAGES_OPEN[capsule.model as keyof typeof MODEL_IMAGES_OPEN] || MODEL_IMAGES[capsule.model as keyof typeof MODEL_IMAGES] || (MODEL_IMAGES as any).basicred_kap);
    });

    useEffect(() => {
        if (!capsule) return;
        const updateModel = () => {
            const nextImg = isSealed
                ? (timerConfigManager.getModelImage(capsule.model) || MODEL_IMAGES[capsule.model as keyof typeof MODEL_IMAGES] || (MODEL_IMAGES as any).basicred_kap)
                : (timerConfigManager.getModelImageOpen(capsule.model) || MODEL_IMAGES_OPEN[capsule.model as keyof typeof MODEL_IMAGES_OPEN] || MODEL_IMAGES[capsule.model as keyof typeof MODEL_IMAGES] || (MODEL_IMAGES as any).basicred_kap);
            setModelImg(nextImg);
        };
        const unsubscribe = timerConfigManager.subscribe(updateModel);
        updateModel();
        return unsubscribe;
    }, [capsule?.model, isSealed]);

    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const insets = useSafeAreaInsets();
    const [playingAudio, setPlayingAudio] = useState<string | null>(null);

    const toggleAudio = (url: string) => {
        if (playingAudio === url) {
            setPlayingAudio(null);
            return;
        }
        setPlayingAudio(url);
    };

    const handleFollowToggle = async (targetId: string, isFollowed: boolean, setIsFollowed: (val: boolean) => void) => {
        if (!userId || userId === targetId) return;
        if (isFollowed) {
            await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', targetId);
            setIsFollowed(false);
        } else {
            await supabase.from('follows').insert({ follower_id: userId, following_id: targetId });
            setIsFollowed(true);
            await supabase.from('notifications').insert({
                user_id: targetId,
                sender_id: userId,
                type: 'follow',
                message: t('common.started_following_you'),
            });
        }
    };

    const filteredAndPaginatedData = useMemo(() => {
        let result = [...items];

        if (filterType !== 'all') {
            result = result.filter(item => item.media_type === filterType);
        }

        result.sort((a, b) => {
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();
            return filterSort === 'newest' ? dateB - dateA : dateA - dateB;
        });

        const pagesArray = [];
        for (let i = 0; i < result.length; i += 9) {
            pagesArray.push(result.slice(i, i + 9));
        }

        const startIndex = (page - 1) * 9;
        const sliced = result.slice(startIndex, startIndex + 9);
        
        return {
            pagedItems: pagesArray,
            paginatedItems: sliced,
            totalItems: result.length,
            totalPages: pagesArray.length || 1
        };
    }, [items, filterType, filterSort, page]);

    const displayGroups = useMemo(() => {
        const { paginatedItems } = filteredAndPaginatedData;
        return paginatedItems.reduce((acc: any, item: any) => {
            const date = new Date(item.created_at);
            const monthStr = date.toLocaleString('default', { month: 'long' });
            const key = `${monthStr} ${date.getFullYear()}`;
            if (!acc[key]) acc[key] = [];
            acc[key].push(item);
            return acc;
        }, {});
    }, [filteredAndPaginatedData]);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [capsuleId])
    );

    useEffect(() => {
        if (capsuleId) {
            loadData();

            // Listen to capsule changes
            const capChannel = supabase.channel(`capsule-${capsuleId}-detail`)
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'capsules', filter: `id=eq.${capsuleId}` }, payload => {
                    const updated = payload.new;
                    console.log('Realtime Capsule Update:', updated);

                    setCapsule((prev: any) => {
                        if (!prev) return { ...updated };
                        const merged = { ...prev, ...updated };

                        // IMPORTANT: Sync the opening animation for all users
                        if (updated.is_opening && updated.opening_at && !prev.is_opening && merged.status === 'sealed') {
                            startGlobalCountdown(updated.opening_at);
                        }

                        return merged;
                    });

                    if (updated.status === 'opened') {
                        setIsOpening(false);
                        if (timerRef.current) clearInterval(timerRef.current);
                    }
                })
                .subscribe();

            // Listen to invite changes
            const inviteChannel = supabase.channel(`capsule-${capsuleId}-invites`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'capsule_invites', filter: `capsule_id=eq.${capsuleId}` }, () => {
                    // Just reload everything when invites change
                    loadData();
                })
                .subscribe();

            return () => {
                supabase.removeChannel(capChannel);
                supabase.removeChannel(inviteChannel);
                if (timerRef.current) clearInterval(timerRef.current);
            };
        }
    }, [capsuleId]);

    const startGlobalCountdown = (openingAtStr: string) => {
        setIsOpening(true);
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
            const now = new Date().getTime();
            const target = new Date(openingAtStr).getTime();
            const diff = Math.max(0, Math.ceil((target - now) / 1000));
            setOpeningTimer(diff);

            // Epic visual feedback as timer gets closer
            if (diff <= 3 && diff > 0) {
                // Vibration or haptic could go here
            }

            if (diff <= 0) {
                if (timerRef.current) clearInterval(timerRef.current);
                triggerFlash();
            }
        }, 1000);
    };

    const formatTime = (dateStr: string) => {
        const now = new Date();
        const past = new Date(dateStr);
        const diff = now.getTime() - past.getTime();
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return t('common.just_now');
        if (minutes < 60) return t('common.m_ago', { count: minutes });
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return t('common.h_ago', { count: hours });
        const days = Math.floor(hours / 24);
        return t('common.d_ago', { count: days });
    };

    const loadData = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        setUserId(user?.id ?? null);
        
        let blocked: string[] = [];
        if (user) {
            const blocked = await safetyService.getAllSafetyUserIds(user.id);
            setBlockedUserIds(blocked);
        }

        const [capRes, itemsRes, likesRes, commentsRes, myLikeRes, invitesRes] = await Promise.all([
            supabase.from('capsules').select('*, profiles:owner_id(*)').eq('id', capsuleId).maybeSingle(),
            supabase.from('capsule_items').select('*, profiles:owner_id(avatar_url, id)').eq('capsule_id', capsuleId).order('created_at', { ascending: true }),
            supabase.from('likes').select('*', { count: 'exact', head: true }).eq('capsule_id', capsuleId),
            supabase.from('comments').select('*, profiles:user_id(*), comment_likes(user_id)').eq('capsule_id', capsuleId).order('created_at', { ascending: false }),
            user ? supabase.from('likes').select('*').eq('capsule_id', capsuleId).eq('user_id', user.id).maybeSingle() : { data: null },
            supabase.from('capsule_invites').select('*, profiles:user_id(*)').eq('capsule_id', capsuleId)
        ]);
        if (capRes.data) {
            setCapsule(capRes.data);
            const cfg = timerConfigManager.getConfig(capRes.data.model);
            setModelTint(cfg?.themeColor || MODEL_TINTS[capRes.data.model] || '#a269ff');

            const allMemberIds = [capRes.data.owner_id];
            const accepted = invitesRes.data?.filter((i: any) => i.status === 'accepted').map((i: any) => i.profiles) || [];
            accepted.forEach((m: any) => allMemberIds.push(m.id));

            let followedSet = new Set<string>();
            if (user) {
                const { data: followIds } = await supabase.from('follows')
                    .select('following_id')
                    .eq('follower_id', user.id)
                    .in('following_id', allMemberIds);
                
                followIds?.forEach(f => followedSet.add(f.following_id));
            }

            setIsFollowedOwner(followedSet.has(capRes.data.owner_id));
            setAcceptedMembers(accepted.map((m: any) => ({ ...m, isFollowed: followedSet.has(m.id) })));

            if (capRes.data.is_opening && capRes.data.status !== 'opened' && capRes.data.opening_at) {
                const target = new Date(capRes.data.opening_at).getTime();
                const now = new Date().getTime();
                if (target > now) {
                    startGlobalCountdown(capRes.data.opening_at);
                } else {
                    // It should already be open, fix status locally if needed or just wait for triggerFlash
                    setCapsule((prev: any) => ({ ...prev, status: 'opened', is_opening: false }));
                }
            }
        }
        if (itemsRes.data) {
            // Filter items from blocked users
            setItems(itemsRes.data.filter((i: any) => !blocked.includes(i.owner_id)));
        }
        setLikeCount(likesRes.count || 0);
        const processedComments = (commentsRes.data || [])
            .filter((c: any) => !blocked.includes(c.user_id)) // Filter comments from blocked users
            .map((c: any) => ({
                ...c,
                myLike: user ? c.comment_likes?.some((l: any) => l.user_id === user.id) : false,
                likeCount: c.comment_likes?.length || 0
            }));
        setComments(processedComments);
        setIsLiked(!!myLikeRes.data);
        if (invitesRes.data) {
            setInvites(invitesRes.data);
        }
        setLoading(false);
    };

    const handleReportCapsule = () => {
        if (!userId || !capsule) return;
        Alert.alert(
            t('detail.report_capsule'),
            t('detail.report_reason'),
            [
                { text: t('detail.report_types.inappropriate'), onPress: () => submitReport(capsuleId, 'capsule', 'inappropriate') },
                { text: t('detail.report_types.spam'), onPress: () => submitReport(capsuleId, 'capsule', 'spam') },
                { text: t('common.cancel'), style: 'cancel' }
            ]
        );
    };

    const handleReportItem = (itemId: string) => {
        if (!userId) return;
        Alert.alert(
            t('detail.report_content'),
            t('detail.report_reason'),
            [
                { text: t('detail.report_types.inappropriate'), onPress: () => submitReport(itemId, 'capsule_item', 'inappropriate') },
                { text: t('detail.report_types.spam'), onPress: () => submitReport(itemId, 'capsule_item', 'spam') },
                { text: t('common.cancel'), style: 'cancel' }
            ]
        );
    };

    const submitReport = async (targetId: string, targetType: ReportType, reason: string) => {
        if (!userId) return;
        await safetyService.report({
            reporterId: userId,
            targetId,
            targetType,
            reason
        });
        Alert.alert(t('common.ready'), t('detail.report_submitted'));
        setShowOptions(false);
    };

    const handleRequestOpen = async () => {
        if (!userId || !capsule) return;

        // Use RPC for atomic update to avoid race conditions in shared capsules
        const { data, error } = await supabase.rpc('request_capsule_open_v4', {
            target_capsule_id: capsuleId,
            requester_user_id: userId
        });

        if (error) {
            console.error('Error requesting open:', error);
            return;
        }

        if (data) {
            // Update local state immediately with DB truth
            setCapsule((prev: any) => ({
                ...prev,
                open_requests: data.open_requests,
                is_opening: data.is_opening,
                opening_at: data.opening_at
            }));

            if (data.is_opening && data.opening_at) {
                startGlobalCountdown(data.opening_at);

                // Notify others ONLY if the capsule wasn't already opening
                if (!capsule.is_opening) {
                    const acceptedInvites = invites?.filter(i => i.status === 'accepted') || [];
                    const members = [capsule.owner_id, ...acceptedInvites.map(i => i.user_id)];
                    for (const member of members) {
                        if (member !== userId) {
                            await supabase.from('notifications').insert({
                                user_id: member, sender_id: userId, type: 'capsule_opened', capsule_id: capsuleId,
                                message: t('detail.opening_now')
                            });
                        }
                    }
                }
            }
        }
    };

    const triggerFlash = async () => {
        setIsOpening(false);
        Animated.sequence([
            Animated.timing(flashAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
            Animated.timing(flashAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
        ]).start(async () => {
            setCapsule((prev: any) => ({ ...prev, status: 'opened', is_opening: false }));
            // Finalize in DB using RPC so any participant can do it
            await supabase.rpc('set_capsule_opened', { target_capsule_id: capsuleId });
        });
    };

    const handleLike = async () => {
        if (!userId) return;
        if (isLiked) {
            await supabase.from('likes').delete().eq('capsule_id', capsuleId).eq('user_id', userId);
            setLikeCount(prev => prev - 1);
            setIsLiked(false);
        } else {
            await supabase.from('likes').insert({ capsule_id: capsuleId, user_id: userId });
            setLikeCount(prev => prev + 1);
            setIsLiked(true);
            if (capsule.owner_id !== userId) {
                await supabase.from('notifications').insert({
                    user_id: capsule.owner_id, sender_id: userId, type: 'like', capsule_id: capsuleId, message: t('detail.liked_your_capsule')
                });
                sendPushNotification(capsule.owner_id, "❤️ ¡Nuevo Me Gusta!", `A alguien le ha gustado tu cápsula.`, { screen: 'CapsuleDetail', params: { capsuleId } });
            }
        }
    };

    const handleLikeComment = async (commentId: string) => {
        if (!userId) return;
        const commentToUpdate = comments.find(c => c.id === commentId);
        if (!commentToUpdate) return;
        if (commentToUpdate.myLike) {
            await supabase.from('comment_likes').delete().eq('comment_id', commentId).eq('user_id', userId);
            setComments(comments.map(c => c.id === commentId ? { ...c, myLike: false, likeCount: c.likeCount - 1 } : c));
        } else {
            await supabase.from('comment_likes').insert({ comment_id: commentId, user_id: userId });
            setComments(comments.map(c => c.id === commentId ? { ...c, myLike: true, likeCount: c.likeCount + 1 } : c));
        }
    };

    const handleSendComment = async () => {
        if (!comment.trim() || !userId) return;
        Keyboard.dismiss();
        const { data } = await supabase.from('comments').insert({
            capsule_id: capsuleId, user_id: userId, content: comment.trim()
        }).select('*, profiles:user_id(*)').maybeSingle();
        if (data) {
            setComments([{ ...data, myLike: false, likeCount: 0 }, ...comments]);
            setComment('');
            setHighlightedCommentId(data.id);
            setTimeout(() => setHighlightedCommentId(null), 1000);
            if (capsule.owner_id !== userId) {
                await supabase.from('notifications').insert({
                    user_id: capsule.owner_id, sender_id: userId, type: 'comment', capsule_id: capsuleId,
                    message: t('detail.commented', { text: `${comment.trim().substring(0, 30)}${comment.trim().length > 30 ? '...' : ''}` })
                });
                sendPushNotification(capsule.owner_id, "💬 Nuevo Comentario", `Han comentado en tu cápsula.`, { screen: 'CapsuleDetail', params: { capsuleId } });
            }
        }
    };

    const executeDelete = async () => {
        setShowOptions(false);
        setLoading(true);
        try {
            // 1. Fetch storage files to delete manually (not handled by CASCADE)
            const { data: itemsToDelete } = await supabase
                .from('capsule_items')
                .select('media_url, thumbnail_url')
                .eq('capsule_id', capsuleId);

            if (itemsToDelete && itemsToDelete.length > 0) {
                const filesToDelete: string[] = [];
                const baseUrl = "https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/capsule-media/";
                itemsToDelete.forEach(item => {
                    if (item.media_url?.startsWith(baseUrl)) {
                        filesToDelete.push(item.media_url.replace(baseUrl, "").split('?')[0]);
                    }
                    if (item.thumbnail_url?.startsWith(baseUrl)) {
                        filesToDelete.push(item.thumbnail_url.replace(baseUrl, "").split('?')[0]);
                    }
                });
                if (filesToDelete.length > 0) {
                    await supabase.storage.from('capsule-media').remove(filesToDelete);
                }
            }

            // 2. Delete the capsule — securely bypass cascading RLS failures
            const { error } = await supabase
                .rpc('delete_capsule', { p_capsule_id: capsuleId });

            if (!error) {
                navigation.goBack();
            } else {
                throw error;
            }
        } catch (err: any) {
            console.error('Error deleting capsule:', err);
            if (Platform.OS === 'web') {
                window.alert(t('detail.delete_error'));
            } else {
                Alert.alert(t('common.error'), t('detail.delete_error'));
            }
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteCapsule = () => {
        if (Platform.OS === 'web') {
            const confirmed = window.confirm(t('detail.delete_capsule_msg') || 'Are you sure?');
            if (confirmed) {
                executeDelete();
            }
        } else {
            Alert.alert(
                t('detail.delete_capsule_title'),
                t('detail.delete_capsule_msg'),
                [
                    { text: t('detail.keep_it'), style: "cancel" },
                    { text: t('common.delete'), style: "destructive", onPress: executeDelete }
                ]
            );
        }
    };

    const handleDeleteComment = (commentId: string) => {
        Alert.alert(
            t('detail.delete_comment_title'),
            t('detail.delete_comment_confirm'),
            [
                { text: t('common.cancel'), style: "cancel" },
                {
                    text: t('common.delete'),
                    style: "destructive",
                    onPress: async () => {
                        const { error } = await supabase.from('comments').delete().eq('id', commentId);
                        if (!error) {
                            setComments(comments.filter(c => c.id !== commentId));
                        } else {
                            Alert.alert('Error', 'Could not delete comment.');
                        }
                    }
                }
            ]
        );
    };

    const handleShareInstagram = () => {
        setShowOptions(false);
        navigation.navigate('InstagramShare' as any, { capsule });
    };



    const canBeOpened = capsule?.opens_at ? new Date(capsule.opens_at) <= new Date() : true;
    const activeModelTint = capsule ? ((MODEL_TINTS as any)[capsule.model] || '#a269ff') : '#a269ff';
    const tint = modelTint || activeModelTint;
    const isOwner = userId === capsule?.owner_id;

    const acceptedInvitesCount = invites?.filter(i => i.status === 'accepted').length || 0;
    const isLegacyAccepted = capsule?.invited_user_id && capsule?.invite_status === 'accepted';
    const totalMembers = 1 + acceptedInvitesCount + (isLegacyAccepted ? 1 : 0);
    const isMember = isOwner ||
        (invites?.some(i => i.user_id === userId && i.status === 'accepted')) ||
        (capsule?.invite_status === 'accepted' && capsule?.invited_user_id === userId);
    const waitingCount = invites?.filter(i => i.status === 'pending').length || 0;
    const hasWaiting = waitingCount > 0 && isOwner;
    const hasRequestedOpen = capsule?.open_requests?.includes(userId || '') || false;
    const reqCount = capsule?.open_requests?.length || 0;

    const now_val = new Date();
    const opensAt = capsule?.opens_at ? new Date(capsule.opens_at) : null;
    const chatStart = opensAt ? new Date(opensAt.getTime() - 24 * 60 * 60 * 1000) : null;
    const chatEnd = opensAt ? new Date(opensAt.getTime() + 5 * 60 * 60 * 1000) : null;
    const showChat = chatStart && chatEnd && now_val >= chatStart && now_val <= chatEnd;



    if (loading && !capsule) return (
        <View style={[styles.container, styles.centered]}>
            <ActivityIndicator color={Colors.primary} size="large" />
        </View>
    );

    if (!capsule) return (
        <View style={[styles.container, styles.centered]}>
            <TouchableOpacity 
                style={[styles.backBtn, { position: 'absolute', top: insets.top + 10, left: 15 }]} 
                activeOpacity={0.7}
                onPress={() => navigation.goBack()}
            >
                <Ionicons name="close" size={28} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Ionicons name="alert-circle-outline" size={48} color={Colors.textMuted} style={{ marginBottom: 15 }} />
            <Text style={{ color: Colors.textMuted, fontFamily: Fonts.medium, fontSize: 16 }}>{t('detail.not_found')}</Text>
            <Text style={{ color: Colors.textMuted, fontSize: 13, marginTop: 5, textAlign: 'center', paddingHorizontal: 40 }}>
                {t('detail.no_permission')}
            </Text>
        </View>
    );

    const openViewer = (index: number) => {
        setInitialIndex(index);
        setActiveViewerIndex(index);
        setViewerVisible(true);
    };

    return (
        <View style={styles.container}>
            <AudioController uri={playingAudio} onFinish={() => setPlayingAudio(null)} />
            <StatusBar barStyle="light-content" />
            <Animated.View style={[styles.flashOverlay, { opacity: flashAnim, pointerEvents: 'none' }]} />

            <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
                <BlurView intensity={Platform.OS === 'ios' ? 90 : 100} tint="default" style={StyleSheet.absoluteFill} />
                <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="close" size={26} color={Colors.textPrimary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.headerTitleContainer} activeOpacity={0.8} onPress={() => navigation.navigate('UserProfile', { targetUserId: capsule.owner_id })}>
                    <View style={styles.headerCreatorRow}>
                        <Image source={{ uri: capsule.profiles?.avatar_url || 'https://via.placeholder.com/150' }} style={styles.headerAvatarMini} />
                        <View>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={styles.headerCreatorName}>{capsule.profiles?.display_name || capsule.profiles?.username}</Text>
                                {capsule.profiles?.is_verified && <VerifiedBadge size={10} style={{ marginLeft: 2 }} />}
                            </View>
                            {userId !== capsule.owner_id && (
                                <Pressable 
                                    onPress={() => handleFollowToggle(capsule.owner_id, isFollowedOwner, setIsFollowedOwner)}
                                    style={({ pressed }) => [
                                        styles.headerFollowBtn,
                                        pressed && { opacity: 0.7 }
                                    ]}
                                >
                                    <Text style={[styles.headerFollowText, isFollowedOwner && styles.headerFollowingText]}>
                                        {isFollowedOwner ? t('common.following') : `+ ${t('common.follow')}`}
                                    </Text>
                                </Pressable>
                            )}
                        </View>
                    </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.backBtn} activeOpacity={0.7} onPress={() => setShowOptions(true)}>
                    <Ionicons name="ellipsis-horizontal" size={24} color={Colors.textPrimary} />
                </TouchableOpacity>
            </View>

            {/* Options Modal */}
            <Modal visible={showOptions} transparent animationType="fade">
                <Pressable style={styles.modalOverlay} android_ripple={{ color: 'transparent' }} onPress={() => setShowOptions(false)}>
                    <View style={styles.optionsContent}>
                        <View style={styles.modalBar} />
                        <Text style={styles.optionsTitle}>{t('detail.options')}</Text>

                        <TouchableOpacity style={styles.deleteOption} activeOpacity={0.7} onPress={() => { setShowOptions(false); setShowQRModal(true); }}>
                            <Ionicons name="qr-code-outline" size={22} color={Colors.textPrimary} />
                            <Text style={[styles.deleteOptionText, { color: Colors.textPrimary }]}>{t('detail.view_qr')}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.deleteOption} activeOpacity={0.7} onPress={handleShareInstagram}>
                            <Ionicons name="logo-instagram" size={22} color="#E1306C" />
                            <Text style={[styles.deleteOptionText, { color: '#E1306C' }]}>{t('detail.share_instagram')}</Text>
                        </TouchableOpacity>

                        {!isOwner && (
                            <TouchableOpacity style={styles.deleteOption} activeOpacity={0.7} onPress={handleReportCapsule}>
                                <Ionicons name="alert-circle-outline" size={22} color={Colors.textPrimary} />
                                <Text style={[styles.deleteOptionText, { color: Colors.textPrimary }]}>{t('detail.report_capsule')}</Text>
                            </TouchableOpacity>
                        )}

                        {isOwner && (
                            <TouchableOpacity style={styles.deleteOption} activeOpacity={0.7} onPress={handleDeleteCapsule}>
                                <Ionicons name="trash-outline" size={22} color={Colors.eventCap} />
                                <Text style={styles.deleteOptionText}>{t('detail.delete_perm')}</Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity style={styles.cancelOption} activeOpacity={0.7} onPress={() => setShowOptions(false)}>
                            <Text style={styles.cancelOptionText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>

            <Modal visible={showQRModal} transparent animationType="fade">
                <Pressable style={styles.qrRootOverlay} android_ripple={{ color: 'transparent' }} onPress={() => setShowQRModal(false)}>
                    <View style={styles.qrContentBox}>
                        <Text style={styles.qrTitle}>{t('detail.capsule_qr')}</Text>
                        <Image
                            source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=kapsely://capsule/${capsuleId}` }}
                            style={styles.qrImage}
                        />
                        <Text style={styles.qrSubtitle}>{t('detail.scan_qr_hint')}</Text>
                        <TouchableOpacity style={styles.qrCloseBtn} activeOpacity={0.8} onPress={() => setShowQRModal(false)}>
                            <Text style={styles.qrCloseBtnText}>{t('common.done')}</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
            >
                <SectionList
                    sections={[
                        { title: 'Hero', data: ['hero'] },
                        { title: 'Content', data: ['content'] },
                        { title: 'Chat', data: showChat ? ['chat'] : [] },
                        { title: 'Social', data: ['social'] },
                    ]}
                    keyExtractor={(item, index) => item + index}
                    renderItem={({ section, item }) => {
                        if (item === 'hero') return (
                            <View style={styles.heroSection}>
                                <View style={styles.heroVisualWrap}>
                                    <LinearGradient
                                        colors={[tint + '33', 'transparent']}
                                        style={styles.heroGlow}
                                    />
                                    <TouchableOpacity
                                        activeOpacity={0.9}
                                        onPress={() => {
                                            if (isMember && isSealed && !isOpening) {
                                                navigation.navigate('CreateSelection', { capsuleId: capsule.id });
                                            }
                                        }}
                                        disabled={!isMember || !isSealed || isOpening}
                                        style={styles.modelContainerDetail}
                                    >
                                        <CapsuleWithTimer
                                            modelKey={capsule.model}
                                            source={{ uri: modelImg }}
                                            date={capsule.opens_at}
                                            chainId={capsule.chain_id}
                                            capsuleType={capsule.type}
                                            style={styles.heroModel}
                                            isOpened={!isSealed}
                                        />
                                        {isMember && isSealed && !isOpening && (
                                            <View style={[styles.addContentHint, { backgroundColor: tint }]}>
                                                <Ionicons name="add" size={20} color="#fff" />
                                            </View>
                                        )}
                                        {isOpening && (
                                            <View style={styles.openingOverlayAesthetic}>
                                                <LinearGradient
                                                    colors={[tint, 'transparent', tint]}
                                                    style={StyleSheet.absoluteFillObject}
                                                    start={{ x: 0, y: 0 }}
                                                    end={{ x: 1, y: 1 }}
                                                />
                                                <View style={styles.openingOverlayAestheticInner}>
                                                    <View style={[styles.pulsingCircle, { backgroundColor: tint + '30' }]} />
                                                    <Text style={styles.openingTextAesthetic}>UNSEALING</Text>
                                                    <Text style={[styles.openingTimerAesthetic, { color: '#fff' }]}>{openingTimer}</Text>
                                                </View>
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                </View>

                                <Text style={styles.capsuleMetaTop}>
                                    Opens {new Date(capsule.opens_at).toLocaleDateString()}
                                </Text>
                                <Text style={styles.sealedTitle}>{capsule.title}</Text>
                                {capsule.description ? (
                                    <Text style={styles.description}>{capsule.description}</Text>
                                ) : null}

                                <View style={styles.statsCard}>
                                    <View style={styles.statItem}>
                                        <Text style={styles.statValue}>{items.length}</Text>
                                        <Text style={styles.statLabel}>Items</Text>
                                    </View>
                                    <View style={styles.statSeparator} />
                                    <View style={styles.statItem}>
                                        <Text style={styles.statValue}>{totalMembers}</Text>
                                        <Text style={styles.statLabel}>Members</Text>
                                    </View>
                                    <View style={styles.statSeparator} />
                                    <View style={styles.statItem}>
                                        <Text style={styles.statValue}>{isSealed ? 'Sealed' : 'Opened'}</Text>
                                        <Text style={styles.statLabel}>Status</Text>
                                    </View>
                                </View>

                                {capsule.is_shared && (
                                    <View style={[styles.participantSection, { backgroundColor: tint + '10', borderColor: tint + '22' }]}>
                                        <View style={styles.participantAvatars}>
                                            <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('UserProfile', { targetUserId: capsule.owner_id })}>
                                                <Image source={{ uri: capsule.profiles?.avatar_url }} style={styles.memberAvatarCircle} />
                                            </TouchableOpacity>
                                            {acceptedMembers.map((m: any, i: number) => (
                                                <TouchableOpacity 
                                                    key={i} 
                                                    activeOpacity={0.8}
                                                    onPress={() => handleFollowToggle(m.id, m.isFollowed, (val) => {
                                                        setAcceptedMembers(prev => prev.map(member => member.id === m.id ? { ...member, isFollowed: val } : member));
                                                    })}
                                                    onLongPress={() => navigation.navigate('UserProfile', { targetUserId: m.id })}
                                                >
                                                    <Image source={{ uri: m.avatar_url }} style={[styles.memberAvatarCircle, { marginLeft: -8 }, m.isFollowed && { borderColor: Colors.primary }]} />
                                                </TouchableOpacity>
                                            ))}
                                            {hasWaiting && (
                                                <View style={[styles.waitingCircle, { marginLeft: -8 }]}>
                                                    <Ionicons name="ellipsis-horizontal" size={10} color={Colors.textMuted} />
                                                </View>
                                            )}
                                        </View>
                                        <Text style={styles.participantText}>{t('common.members_count', { count: totalMembers })}</Text>
                                    </View>
                                )}
                                <View style={[styles.detailTypeBadge, { backgroundColor: tint + '15' }]}>
                                    <Ionicons name={(capsule.type === 'instacap' ? 'camera' : capsule.type === 'eventcap' ? 'calendar' : 'time') as any} size={14} color={tint} />
                                    <Text style={[styles.detailTypeLabel, { color: tint }]}>
                                        {capsule.type === 'instacap' ? 'Insta' : capsule.type === 'eventcap' ? 'Event' : 'Legacy'}
                                    </Text>
                                </View>

                                {!isOpening && isSealed ? (
                                    <View style={styles.sealedInfo}>
                                        {canBeOpened ? (
                                            <View style={{ alignItems: 'center' }}>
                                                <TouchableOpacity
                                                    style={[styles.openNowBtn, hasRequestedOpen && { opacity: 0.8 }, { shadowColor: tint }]}
                                                    activeOpacity={0.85}
                                                    onPress={handleRequestOpen}
                                                    disabled={hasRequestedOpen}
                                                >
                                                     <LinearGradient colors={[tint, tint + 'cc']} style={styles.openNowGrad}>
                                                         <Ionicons name="sparkles" size={16} color="#fff" style={{ marginRight: 8 }} />
                                                         <Text style={styles.openNowText}>
                                                             {hasRequestedOpen
                                                                 ? t('detail.awaiting_others', { current: reqCount, total: totalMembers })
                                                                 : t('detail.unseal_capsule')}
                                                         </Text>
                                                     </LinearGradient>
                                                 </TouchableOpacity>
                                                 {reqCount < totalMembers && (
                                                     <Text style={styles.requestStatusHint}>
                                                         {t('detail.approval_needed', { current: reqCount, total: totalMembers })}
                                                     </Text>
                                                 )}
                                                {isMember && (
                                                    <TouchableOpacity
                                                        style={[styles.addBtnSmall, { backgroundColor: tint + '15', marginTop: 15 }]}
                                                        activeOpacity={0.7}
                                                        onPress={() => navigation.navigate('CreateSelection', { capsuleId: capsule.id })}
                                                    >
                                                        <Ionicons name="add-circle" size={18} color={tint} />
                                                        <Text style={[styles.addBtnTextSmall, { color: tint }]}>Add Content</Text>
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                        ) : (
                                            <View style={styles.badgeRow}>
                                                <View style={styles.lockedBadge}>
                                                    <Ionicons name="lock-closed" size={14} color={Colors.textMuted} />
                                                    <LiveTimer date={capsule.opens_at} style={styles.lockedText} />
                                                </View>
                                                {isMember && (
                                                     <TouchableOpacity style={[styles.addBtnSmall, { backgroundColor: tint + '15' }]} activeOpacity={0.7} onPress={() => navigation.navigate('CreateSelection', { capsuleId: capsule.id })}>
                                                         <Ionicons name="add-circle" size={18} color={tint} />
                                                         <Text style={[styles.addBtnTextSmall, { color: tint }]}>{t('create.add_content')}</Text>
                                                     </TouchableOpacity>
                                                )}
                                            </View>
                                        )}
                                    </View>
                                ) : null}

                                {capsule?.type === 'eventcap' && (
                                    <View style={[styles.eventInfoBox, { borderColor: tint + '44', backgroundColor: tint + '11' }]}>
                                        <Ionicons name="earth" size={24} color={tint} style={{ marginBottom: 4 }} />
                                        <Text style={[styles.eventInfoTitle, { color: tint }]}>Pioneers Event</Text>
                                        <Text style={styles.eventInfoText}>
                                            This capsule is part of a global synchronized event. All participant capsules will unlock simultaneously worldwide.
                                        </Text>
                                    </View>
                                )}
                            </View>
                        );

                        if (item === 'content') return (
                            <View style={[styles.contentSection, !isSealed && { marginTop: 0 }]}>
                                {isSealed ? (
                                    <>
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
                                            {['all', 'image', 'video', 'note', 'audio'].map((type) => (
                                                <TouchableOpacity 
                                                    key={type} 
                                                    style={[styles.filterChip, filterType === type && styles.filterChipActive, filterType === type && { backgroundColor: tint, borderColor: tint }]}
                                                    onPress={() => { setFilterType(type); setPage(1); }}
                                                >
                                                    <Ionicons
                                                        name={
                                                            type === 'image' ? 'image-outline' :
                                                            type === 'video' ? 'videocam-outline' :
                                                            type === 'note' ? 'document-text-outline' :
                                                            type === 'audio' ? 'mic-outline' : 'apps-outline'
                                                        }
                                                        size={14}
                                                        color={filterType === type ? '#fff' : Colors.textPrimary}
                                                    />
                                                    <Text style={[styles.filterChipText, filterType === type && { color: '#fff' }]}>
                                                        {type.charAt(0).toUpperCase() + type.slice(1)}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                            <TouchableOpacity 
                                                style={styles.filterChip}
                                                onPress={() => { setFilterSort(filterSort === 'newest' ? 'oldest' : 'newest'); setPage(1); }}
                                            >
                                                <Ionicons name={filterSort === 'newest' ? "arrow-down" : "arrow-up"} size={14} color={Colors.textPrimary} />
                                                <Text style={styles.filterChipText}>{filterSort === 'newest' ? 'Newest' : 'Oldest'}</Text>
                                            </TouchableOpacity>
                                        </ScrollView>

                                        <FlatList
                                            horizontal
                                            pagingEnabled
                                            showsHorizontalScrollIndicator={false}
                                            data={filteredAndPaginatedData.pagedItems}
                                            keyExtractor={(_, index) => index.toString()}
                                            renderItem={({ item: pageItems }) => (
                                                <View style={{ width: width - SECTION_PAD }}>
                                                    <View style={[styles.grid, { paddingHorizontal: 0 }]}>
                                                        {pageItems.map(item => (
                                                            <View key={item.id} style={styles.gridItemContainer}>
                                                                <View style={styles.gridItemPlaceholder}>
                                                                    {item.media_type === 'note' ? (
                                                                        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#fffdf2', padding: 14, justifyContent: 'center', alignItems: 'center' }]}>
                                                                            <View style={{ position: 'absolute', left: 4, top: 0, bottom: 0, width: 2, borderLeftWidth: 1, borderColor: 'rgba(255,0,0,0.15)', borderStyle: 'dotted' }} />
                                                                            <Text style={{ fontSize: 22, color: '#000', opacity: 0.38, fontFamily: Fonts.bold, fontStyle: 'italic', letterSpacing: 0.5, lineHeight: 28, textAlign: 'center' }} numberOfLines={7}>
                                                                                Nota Secreta{"\n"}Guardada{"\n"}Para Siempre{"\n"}Memorias{"\n"}Del Pasado
                                                                            </Text>
                                                                        </View>
                                                                    ) : item.media_type === 'audio' ? (
                                                                        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#f9f5ff', justifyContent: 'center', alignItems: 'center' }]}>
                                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, opacity: 0.95 }}>
                                                                                {[22, 52, 36, 78, 45, 92, 32, 60, 26, 40].map((h, i) => (
                                                                                    <View key={i} style={{ width: 7, height: h, backgroundColor: '#a66eff', borderRadius: 3.5 }} />
                                                                                ))}
                                                                            </View>
                                                                        </View>
                                                                    ) : (item.media_url || item.thumbnail_url) ? (
                                                                        <Image source={{ uri: item.thumbnail_url || item.media_url }} style={StyleSheet.absoluteFill} blurRadius={25} />
                                                                    ) : null}

                                                                    <BlurView intensity={['note', 'audio'].includes(item.media_type) ? 28 : 40} tint="light" style={StyleSheet.absoluteFill} />
                                                                    
                                                                    {item.media_type === 'note' && (
                                                                        <View style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, backgroundColor: '#fff', padding: 5, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }}>
                                                                            <Ionicons name="document-text" size={13} color={tint} />
                                                                        </View>
                                                                    )}

                                                                    {item.media_type === 'audio' && (
                                                                        <View style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, backgroundColor: '#fff', padding: 5, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }}>
                                                                            <Ionicons name="mic" size={13} color={tint} />
                                                                        </View>
                                                                    )}
                                                                    
                                                                    {item.media_type === 'video' && (
                                                                        <View style={[styles.gridPlayIcon, { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
                                                                            <Ionicons name="play" size={16} color="rgba(255,255,255,0.9)" />
                                                                        </View>
                                                                    )}

                                                                    <View style={{ position: 'absolute', width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' }}>
                                                                        <Ionicons name="lock-closed-outline" size={20} color="rgba(0,0,0,0.5)" />
                                                                    </View>
                                                                </View>
                                                                {item.caption && item.caption.replace(/!!b:\w+/, '').trim().length > 0 && (
                                                                    <View style={{ height: 32, marginTop: 6, justifyContent: 'center' }}>
                                                                            <Text style={[styles.gridItemCaption, { marginTop: 0 }]} numberOfLines={2}>
                                                                                {item.caption.replace(/!!b:\w+/, '').trim()}
                                                                            </Text>
                                                                    </View>
                                                                )}
                                                            </View>
                                                        ))}
                                                    </View>
                                                </View>
                                            )}
                                        />
                                        
                                    </>
                                ) : filteredAndPaginatedData.totalItems === 0 ? (
                                    <View style={styles.emptyGridContainer}>
                                        <View style={styles.sectionHeader}>
                                            <Text style={styles.sectionTitle}>Your memories will live here</Text>
                                            <Text style={styles.itemCount}>0 items</Text>
                                        </View>
                                        <View style={styles.grid}>
                                            {[...Array(6)].map((_, i) => (
                                                <View key={i} style={[styles.gridItemPlaceholder, { backgroundColor: tint + '09', borderWidth: 1, borderColor: tint + '20', borderStyle: 'dashed' }]}>
                                                    <Ionicons name="add" size={22} color={tint + '55'} />
                                                </View>
                                            ))}
                                        </View>
                                        <Text style={{ textAlign: 'center', color: Colors.textMuted, fontSize: 12, fontFamily: Fonts.medium, marginTop: 12, marginBottom: 8 }}>
                                            Add your first memory to this capsule
                                        </Text>
                                    </View>
                                ) : (
                                    <View>
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
                                            {['all', 'image', 'video', 'note', 'audio'].map((type) => (
                                                <TouchableOpacity 
                                                    key={type} 
                                                    style={[styles.filterChip, filterType === type && styles.filterChipActive, filterType === type && { backgroundColor: tint }]}
                                                    onPress={() => { setFilterType(type); setPage(1); }}
                                                >
                                                    <Ionicons
                                                        name={
                                                            type === 'image' ? 'image-outline' :
                                                            type === 'video' ? 'videocam-outline' :
                                                            type === 'note' ? 'document-text-outline' :
                                                            type === 'audio' ? 'mic-outline' : 'apps-outline'
                                                        }
                                                        size={14}
                                                        color={filterType === type ? '#fff' : Colors.textPrimary}
                                                    />
                                                    <Text style={[styles.filterChipText, filterType === type && { color: '#fff' }]}>
                                                        {type.charAt(0).toUpperCase() + type.slice(1)}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                            <TouchableOpacity 
                                                style={styles.filterChip}
                                                onPress={() => { setFilterSort(filterSort === 'newest' ? 'oldest' : 'newest'); setPage(1); }}
                                            >
                                                <Ionicons name={filterSort === 'newest' ? "arrow-down" : "arrow-up"} size={14} color={Colors.textPrimary} />
                                                <Text style={styles.filterChipText}>{filterSort === 'newest' ? 'Newest' : 'Oldest'}</Text>
                                            </TouchableOpacity>
                                        </ScrollView>

                                        {Object.keys(displayGroups).map(month => (
                                            <View key={month} style={styles.monthSection}>
                                                <Text style={styles.monthTitle}>{month}</Text>
                                                <View style={styles.grid}>
                                                    {displayGroups[month].map((entry: any) => {
                                                        const isBatch = Array.isArray(entry);
                                                        const item = isBatch ? entry[0] : entry;
                                                        return (
                                                            <View key={item.id} style={styles.gridItemContainer}>
                                                                <TouchableOpacity
                                                                    style={styles.gridItem}
                                                                    activeOpacity={0.8}
                                                                    onPress={() => item.media_type === 'audio' ? toggleAudio(item.media_url) : openViewer(items.indexOf(item))}
                                                                    onLongPress={() => handleReportItem(item.id)}
                                                                >
                                                                    {item.media_type === 'audio' ? (
                                                                        <View style={[styles.gridAudioCell, { backgroundColor: '#f0e8ff' }]}>
                                                                            <View style={styles.audioGridIcon}>
                                                                                <Ionicons name="mic" size={14} color="#a66eff" />
                                                                            </View>
                                                                            <View style={styles.audioWaveRow}>
                                                                                {[14, 22, 18, 28, 20, 26, 15, 10, 24, 16].map((h, i) => (
                                                                                    <View key={i} style={{ width: 3.5, height: playingAudio === item.media_url ? h : h * 0.6, backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 2 }} />
                                                                                ))}
                                                                            </View>
                                                                            <View style={styles.audioDurationLabel}>
                                                                                <Text style={styles.audioDurationText}>{item.content || '--:--'}</Text>
                                                                            </View>
                                                                        </View>
                                                                    ) : item.media_type === 'note' ? (
                                                                        <View style={styles.gridNoteCell}>
                                                                            <View style={styles.noteIndicator}>
                                                                                <Ionicons name="document-text" size={14} color="rgba(0,0,0,0.4)" />
                                                                            </View>
                                                                            <Text style={styles.noteSnippet} numberOfLines={ITEM_HEIGHT > 120 ? 8 : 5}>
                                                                                {item.content}
                                                                            </Text>
                                                                            <BlurView intensity={Platform.OS === 'ios' ? 18 : 8} tint="light" style={[StyleSheet.absoluteFill, { borderRadius: 8 }]} />
                                                                            <View style={StyleSheet.absoluteFill} pointerEvents="none">
                                                                                <View style={styles.noteIndicator}>
                                                                                    <Ionicons name="document-text" size={14} color="rgba(0,0,0,0.35)" />
                                                                                </View>
                                                                            </View>
                                                                        </View>
                                                                    ) : (
                                                                        <>
                                                                            <Image source={{ uri: (item.media_type === 'video' ? (item.thumbnail_url || item.media_url) : item.media_url) || 'https://via.placeholder.com/150' }} style={styles.gridImage} />
                                                                            
                                                                            {isBatch && (
                                                                                <View style={styles.batchBadge}>
                                                                                    <Ionicons name="copy" size={12} color="#fff" />
                                                                                    <Text style={styles.batchCount}>{entry.length}</Text>
                                                                                </View>
                                                                            )}

                                                                            {item.media_type === 'video' && (
                                                                                <>
                                                                                    <View style={styles.gridPlayIcon}>
                                                                                        <Ionicons name="play" size={16} color="#fff" />
                                                                                    </View>
                                                                                    {item.content && (
                                                                                        <View style={styles.gridDurationBadge}>
                                                                                            <Text style={styles.gridDurationText}>{item.content}</Text>
                                                                                        </View>
                                                                                    )}
                                                                                </>
                                                                            )}
                                                                        </>
                                                                    )}
                                                                    {item.profiles?.avatar_url && (
                                                                        <Image source={{ uri: item.profiles.avatar_url }} style={styles.itemAvatar} />
                                                                    )}
                                                                </TouchableOpacity>
                                                                {item.caption && item.caption.replace(/!!b:\w+/, '').trim().length > 0 && (
                                                                    <View style={{ height: 32, marginTop: 6, justifyContent: 'center' }}>
                                                                        <Text style={[styles.gridItemCaption, { marginTop: 0 }]} numberOfLines={2}>
                                                                            {item.caption.replace(/!!b:\w+/, '').trim()}
                                                                        </Text>
                                                                    </View>
                                                                )}
                                                            </View>
                                                        );
                                                    })}
                                                </View>
                                            </View>
                                        ))}

                                        {filteredAndPaginatedData.totalPages > 1 && (
                                            <View style={styles.paginationRow}>
                                                <TouchableOpacity 
                                                    disabled={page === 1}
                                                    onPress={() => setPage(page - 1)}
                                                    style={[styles.pageBtn, page === 1 && { opacity: 0.3 }]}
                                                >
                                                    <Ionicons name="chevron-back" size={20} color={tint} />
                                                </TouchableOpacity>
                                                <Text style={styles.pageText}>{page} / {filteredAndPaginatedData.totalPages}</Text>
                                                <TouchableOpacity 
                                                    disabled={page === filteredAndPaginatedData.totalPages}
                                                    onPress={() => setPage(page + 1)}
                                                    style={[styles.pageBtn, page === filteredAndPaginatedData.totalPages && { opacity: 0.3 }]}
                                                >
                                                    <Ionicons name="chevron-forward" size={20} color={tint} />
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                    </View>
                                )}
                            </View>
                        );

                        if (item === 'chat' && showChat) return <LiveChat capsuleId={capsuleId} tint={tint} />;

                        if (item === 'social') return (
                            <View style={styles.socialSection}>
                                <View style={styles.interactionRow}>
                                    <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7} onPress={handleLike}>
                                        <Ionicons name={isLiked ? "heart" : "heart-outline"} size={26} color={isLiked ? "#ff4757" : Colors.textPrimary} />
                                        <Text style={styles.actionCount}>{likeCount}</Text>
                                    </TouchableOpacity>
                                    <View style={styles.actionBtn}>
                                        <Ionicons name="chatbubble-outline" size={24} color={Colors.textPrimary} />
                                        <Text style={styles.actionCount}>{comments.length}</Text>
                                    </View>
                                </View>
                                <View style={styles.commentsList}>
                                    {comments.map(c => (
                                        <View key={c.id} style={[styles.commentCard, highlightedCommentId === c.id && { borderColor: tint, borderLeftWidth: 3 }]}>
                                            <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.navigate('UserProfile', { targetUserId: c.user_id })}>
                                                <Image source={{ uri: c.profiles?.avatar_url || 'https://via.placeholder.com/150' }} style={styles.commentAvatar} />
                                            </TouchableOpacity>
                                            <View style={styles.commentBody}>
                                                <View style={styles.commentHeaderRow}>
                                                    <TouchableOpacity 
                                                        style={{ flexDirection: 'row', alignItems: 'center' }}
                                                        activeOpacity={0.7}
                                                        onPress={() => navigation.navigate('UserProfile', { targetUserId: c.user_id })}
                                                    >
                                                        <Text style={styles.commentUser}>{c.profiles?.display_name || c.profiles?.username}</Text>
                                                        {c.profiles?.is_verified && <VerifiedBadge size={10} style={{ marginLeft: 2 }} />}
                                                    </TouchableOpacity>
                                                    <Text style={styles.commentTime}>{formatTime(c.created_at)}</Text>
                                                </View>
                                                <Text style={styles.commentText}>{c.content}</Text>
                                            </View>
                                            <View style={styles.commentActions}>
                                                <TouchableOpacity activeOpacity={0.7} onPress={() => handleLikeComment(c.id)} style={styles.commentActionBtn}>
                                                    <Ionicons name={c.myLike ? "heart" : "heart-outline"} size={16} color={c.myLike ? "#ff4757" : Colors.textMuted} />
                                                    <Text style={[styles.commentActionCount, c.myLike && { color: "#ff4757" }]}>{c.likeCount || 0}</Text>
                                                </TouchableOpacity>
                                                {(c.user_id === userId || isOwner) && (
                                                    <TouchableOpacity activeOpacity={0.7} onPress={() => handleDeleteComment(c.id)} style={styles.deleteCommentBtn}>
                                                        <Ionicons name="trash-outline" size={16} color={Colors.textMuted} />
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        );

                        return null;
                    }}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                />

                {/* Comment Bar */}
                {showChat ? (
                    <View style={[styles.commentBar, { paddingBottom: insets.bottom + 10 }]}>
                        <Text style={styles.chatInfo}>Live chat is active above ↑</Text>
                    </View>
                ) : (
                    <View style={[styles.commentBar, { paddingBottom: insets.bottom + 10 }]}>
                        <TextInput
                            style={styles.commentInput}
                            placeholder="Add a comment..."
                            value={comment}
                            onChangeText={setComment}
                            multiline
                        />
                        <TouchableOpacity activeOpacity={0.7} onPress={handleSendComment} disabled={!comment.trim()} style={{ marginBottom: 10 }}>
                            <Text style={[styles.postBtn, !comment.trim() && { opacity: 0.5 }]}>Post</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </KeyboardAvoidingView>

            <Modal visible={viewerVisible} transparent animationType="fade">
                <View style={styles.viewerContainer}>
                    <TouchableOpacity style={styles.closeViewer} activeOpacity={0.7} onPress={() => setViewerVisible(false)}>
                        <Ionicons name="close" size={30} color="#fff" />
                    </TouchableOpacity>
                    <FlatList
                        data={items}
                        horizontal
                        pagingEnabled
                        initialScrollIndex={initialIndex}
                        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
                        onMomentumScrollEnd={(e) => {
                            const index = Math.round(e.nativeEvent.contentOffset.x / width);
                            setActiveViewerIndex(index);
                        }}
                        renderItem={({ item, index }) => (
                             <View style={styles.viewerSlide}>
                                 {item.media_type === 'note' ? (
                                     <View style={styles.viewerNoteContainer}>
                                         <View style={styles.viewerNotePaper}>
                                             <Ionicons name="document-text-outline" size={40} color="#8d6e63" style={{ marginBottom: 15, opacity: 0.5 }} />
                                             <Text style={styles.viewerNoteText}>{item.content}</Text>
                                         </View>
                                     </View>
                                 ) : item.media_type === 'audio' ? (
                                     <View style={[styles.viewerNoteContainer, { backgroundColor: modelTint || Colors.primary }]}>
                                         <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 60, marginBottom: 30 }}>
                                             {[10, 20, 30, 45, 60, 40, 25, 15, 30, 50, 25, 12, 5].map((h, i) => (
                                                 <View key={i} style={{ width: 6, height: playingAudio === item.media_url ? h : h * 0.4, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 3 }} />
                                             ))}
                                         </View>
                                          <TouchableOpacity activeOpacity={0.8} onPress={() => toggleAudio(item.media_url)} style={[styles.recordBtn, { backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' }]}>
                                             <Ionicons name={playingAudio === item.media_url ? "pause" : "play"} size={40} color="#fff" style={{ marginLeft: playingAudio === item.media_url ? 0 : 4 }} />
                                         </TouchableOpacity>
                                         <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 24, backgroundColor: 'rgba(0,0,0,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
                                             <Ionicons name="mic" size={14} color="#fff" />
                                             <Text style={{ color: '#fff', fontSize: 14, fontFamily: Fonts.bold }}>{item.content || 'Voice Note'}</Text>
                                         </View>
                                     </View>
                                  ) : item.media_type === 'video' ? (
                                      <VideoWithTrim item={item} isActive={activeViewerIndex === index && viewerVisible} style={styles.viewerImage} />
                                  ) : (
                                     <Image source={{ uri: item.media_url }} style={styles.viewerImage} resizeMode="contain" />
                                 )}
                                 {item.caption && (
                                     <Text style={styles.viewerCaption}>
                                         {item.caption.replace(/\s!!b:\w+/, '').trim() || ''}
                                     </Text>
                                 )}
                             </View>
                        )}
                        keyExtractor={item => item.id}
                    />
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, height: 110, paddingBottom: 10, backgroundColor: '#ffffff' },
    backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 5 },
    headerTitleContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    headerCapsuleTitle: { fontSize: 16, fontFamily: Fonts.bold, color: Colors.textPrimary },
    headerCreatorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    headerAvatarMini: { width: 32, height: 32, borderRadius: 16, marginRight: 2 },
    headerCreatorName: { fontSize: 13, fontFamily: Fonts.bold, color: Colors.textPrimary },
    headerFollowBtn: { marginTop: 1 },
    headerFollowText: { fontSize: 11, fontFamily: Fonts.bold, color: Colors.primary },
    headerFollowingText: { color: Colors.textMuted },

    scrollContent: { paddingBottom: 60 },
    flashOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#fff', zIndex: 999 },
    heroSection: { alignItems: 'center', paddingTop: 120, paddingBottom: Spacing.xl },
    heroVisualWrap: { width: 280, height: 280, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    heroGlow: { position: 'absolute', width: 240, height: 240, borderRadius: 120 },
    modelContainerDetail: { position: 'relative', width: 220, height: 220, alignItems: 'center', justifyContent: 'center' },
    heroModel: { width: 220, height: 220 },
    cornerTypeIconDetail: { position: 'absolute', top: 20, right: 20, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', ...Shadow.subtle },
    detailTypeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginTop: 10 },
    detailTypeLabel: { fontSize: 13, fontFamily: Fonts.bold },

    capsuleMetaTop: { fontSize: 12, color: Colors.textMuted, fontFamily: Fonts.semiBold, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8, marginTop: 15 },
    sealedTitle: { fontSize: 30, fontFamily: Fonts.bold, color: Colors.textPrimary, textAlign: 'center', maxWidth: '82%' },
    description: { fontSize: 15, fontFamily: Fonts.regular, color: Colors.textSecondary, textAlign: 'center', marginTop: 10, lineHeight: 22, maxWidth: '84%' },

    statsCard: { flexDirection: 'row', justifyContent: 'space-between', width: '90%', marginTop: 24, paddingHorizontal: 20, paddingVertical: 18, borderRadius: 24, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, ...Shadow.subtle },
    statItem: { alignItems: 'center', flex: 1 },
    statValue: { fontSize: 16, fontFamily: Fonts.bold, color: Colors.textPrimary },
    statLabel: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.textMuted, marginTop: 4 },
    statSeparator: { width: 1, height: '60%', backgroundColor: Colors.border, alignSelf: 'center' },

    participantSection: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, alignSelf: 'center', borderWidth: 1 },
    participantAvatars: { flexDirection: 'row', alignItems: 'center' },
    memberAvatarCircle: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: '#fff' },
    participantText: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textPrimary },

    openNowBtn: { marginTop: 24, width: '82%', ...Platform.select({ ios: { shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 15 }, android: { elevation: 10 } }) },
    openNowGrad: { paddingVertical: 15, borderRadius: 18, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
    openNowText: { color: '#fff', fontSize: 16, fontFamily: Fonts.bold },

    sealedVaultHeader: { marginBottom: 20, padding: 20, borderRadius: 22, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
    sealedVaultTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    sealedVaultTitle: { fontSize: 16, fontFamily: Fonts.bold },
    sealedVaultSubtitle: { fontSize: 13, color: Colors.textMuted, lineHeight: 18 },

    filterScroll: { marginBottom: 20 },
    filterChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, gap: 8, borderWidth: 1, borderColor: Colors.border },
    filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    filterChipText: { fontSize: 13, fontFamily: Fonts.bold, color: Colors.textPrimary },

    contentSection: { paddingHorizontal: Spacing.md, marginTop: 40 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
    gridItem: { width: ITEM_SIZE, height: ITEM_HEIGHT, borderRadius: 10, overflow: 'hidden', backgroundColor: Colors.cardAlt },
    gridItemContainer: { marginBottom: 18, width: ITEM_SIZE },
    monthSection: { marginBottom: 30 },
    monthTitle: { fontSize: 15, fontFamily: Fonts.bold, color: Colors.textMuted, marginBottom: 12 },

    socialSection: { paddingHorizontal: Spacing.md, marginTop: 40, paddingBottom: 60 },
    interactionRow: { flexDirection: 'row', alignItems: 'center', gap: 24, marginBottom: Spacing.xl },
    actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    actionCount: { fontSize: 16, fontFamily: Fonts.semiBold, color: Colors.textPrimary },
    
    commentsList: { gap: 16 },
    commentCard: { backgroundColor: Colors.surface, padding: 14, borderRadius: 18, flexDirection: 'row', gap: 12, borderWidth: 1, borderColor: Colors.border },
    commentAvatar: { width: 34, height: 34, borderRadius: 17 },
    commentBody: { flex: 1 },
    commentHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    commentUser: { fontSize: 13, fontFamily: Fonts.bold, color: Colors.textPrimary },
    commentTime: { fontSize: 11, color: Colors.textMuted },
    commentText: { fontSize: 14, color: Colors.textSecondary, lineHeight: 19 },
    commentActions: { alignItems: 'center', gap: 12 },
    commentActionBtn: { alignItems: 'center', gap: 2 },
    commentActionCount: { fontSize: 10, fontFamily: Fonts.bold, color: Colors.textMuted },
    deleteCommentBtn: { padding: 5 },

    commentBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: Spacing.md, paddingTop: 12, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border, gap: 12 },
    commentInput: { flex: 1, minHeight: 44, maxHeight: 120, paddingTop: 14, paddingBottom: 14, backgroundColor: Colors.background, borderRadius: 22, paddingHorizontal: 16, fontSize: 14, borderWidth: 1, borderColor: Colors.border },
    postBtn: { color: Colors.primary, fontFamily: Fonts.bold, fontSize: 15 },
    
    chatInfo: { flex: 1, textAlign: 'center', color: Colors.textMuted, fontSize: 13 },
    viewerContainer: { flex: 1, backgroundColor: '#000' },
    viewerSlide: { width, height, justifyContent: 'center', alignItems: 'center' },
    viewerImage: { width: '100%', height: '100%' },
    viewerCaption: { position: 'absolute', bottom: 100, color: '#fff', textAlign: 'center', width: '80%', backgroundColor: 'rgba(0,0,0,0.5)', padding: 10, borderRadius: 10 },
    closeViewer: { position: 'absolute', top: 50, right: 20, zIndex: 10 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    optionsContent: { backgroundColor: Colors.surface, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, paddingBottom: 60 },
    modalBar: { width: 40, height: 5, backgroundColor: '#eee', borderRadius: 3, alignSelf: 'center', marginBottom: 20 },
    optionsTitle: { fontSize: 18, fontFamily: Fonts.bold, textAlign: 'center', marginBottom: 25 },
    deleteOption: { flexDirection: 'row', alignItems: 'center', gap: 15, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    deleteOptionText: { color: Colors.eventCap, fontSize: 16, fontFamily: Fonts.semiBold },
    cancelOption: { alignItems: 'center', paddingVertical: 20 },
    cancelOptionText: { color: Colors.textMuted, fontSize: 15, fontFamily: Fonts.medium },
    openingOverlayAesthetic: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 30, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
    openingOverlayAestheticInner: { width: 160, height: 160, borderRadius: 80, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
    pulsingCircle: { position: 'absolute', width: '100%', height: '100%', borderRadius: 80 },
    openingTextAesthetic: { fontSize: 11, fontFamily: Fonts.bold, color: '#fff', letterSpacing: 2, marginBottom: 5 },
    openingTimerAesthetic: { fontSize: 50, fontWeight: 'bold' },
    qrRootOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
    qrContentBox: { width: '80%', backgroundColor: Colors.surface, borderRadius: 24, padding: 30, alignItems: 'center' },
    qrTitle: { fontSize: 22, fontFamily: Fonts.bold, color: Colors.textPrimary, marginBottom: 20 },
    qrImage: { width: 220, height: 220, marginBottom: 20 },
    qrSubtitle: { fontSize: 14, color: Colors.textSecondary, fontFamily: Fonts.medium, textAlign: 'center', marginBottom: 25 },
    qrCloseBtn: { width: '100%', paddingVertical: 14, backgroundColor: Colors.primary, borderRadius: 16, alignItems: 'center' },
    qrCloseBtnText: { color: '#fff', fontSize: 16, fontFamily: Fonts.bold },
    itemAvatar: { position: 'absolute', bottom: 4, right: 4, width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: '#fff' },
    requestStatusHint: { marginTop: 12, fontSize: 12, fontFamily: Fonts.medium, color: Colors.textMuted },
    addContentHint: { position: 'absolute', bottom: 25, left: -40, width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', ...Shadow.subtle, zIndex: 5, borderWidth: 2, borderColor: '#fff' },
    gridNoteCell: { width: ITEM_SIZE, height: ITEM_HEIGHT, borderRadius: 8, alignItems: 'center', justifyContent: 'center', padding: 12, backgroundColor: '#f5f0ff', overflow: 'hidden' },
    noteIndicator: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.75)', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
    noteSnippet: { fontSize: 15, fontFamily: Fonts.bold, color: '#1a1a1a', textAlign: 'center', lineHeight: 20, letterSpacing: 0.3 },
    audioGridIcon: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.8)', alignItems: 'center', justifyContent: 'center', zIndex: 5 },
    audioWaveRow: { flexDirection: 'row', alignItems: 'center', gap: 2.5, marginBottom: 8 },
    audioDurationLabel: { backgroundColor: 'rgba(162,105,255,0.3)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    audioDurationText: { fontSize: 10, fontFamily: Fonts.bold, color: '#6b3fa0' },
    viewerNoteContainer: { width: '90%', alignItems: 'center', justifyContent: 'center' },
    viewerNotePaper: { width: '100%', minHeight: 300, backgroundColor: '#fffde7', padding: 30, borderRadius: 2, shadowColor: '#000', shadowOffset: { width: 2, height: 8 }, shadowOpacity: 0.2, shadowRadius: 15, elevation: 10, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 15, borderLeftColor: '#fbc02d' },
    viewerNoteText: { color: '#5d4037', fontSize: 22, fontFamily: Fonts.medium, textAlign: 'center', lineHeight: 32, fontStyle: 'italic' },
    recordBtn: { width: 100, height: 100, borderRadius: 50, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
    gridPlayIcon: { position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
    gridDurationBadge: { position: 'absolute', bottom: 5, left: 5, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 },
    gridDurationText: { color: '#fff', fontSize: 9, fontFamily: Fonts.bold },
    batchBadge: { position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
    batchCount: { color: '#fff', fontSize: 11, fontFamily: Fonts.bold },
    waitingCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
    paginationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, marginTop: 24, marginBottom: 10 },
    pageText: { fontSize: 14, fontFamily: Fonts.bold, color: Colors.textPrimary },
    pageBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', ...Shadow.subtle, borderWidth: 1, borderColor: Colors.border },
    sealedInfo: { width: '100%', alignItems: 'center' },
    filterContent: { paddingRight: 40 },
    gridItemPlaceholder: { width: ITEM_SIZE, height: ITEM_HEIGHT, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.cardAlt, overflow: 'hidden' },
    gridItemCaption: { fontSize: 11, color: Colors.textSecondary, marginTop: 6, paddingHorizontal: 4, lineHeight: 14 },
    emptyGridContainer: { alignItems: 'center', paddingVertical: 40 },
    sectionHeader: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    sectionTitle: { fontSize: 18, fontFamily: Fonts.bold, color: Colors.textPrimary },
    itemCount: { fontSize: 13, color: Colors.textMuted, fontFamily: Fonts.medium },
    gridAudioCell: { width: ITEM_SIZE, height: ITEM_HEIGHT, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0e8ff', overflow: 'hidden' },
    badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20 },
    lockedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.surface, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
    lockedText: { fontSize: 13, fontFamily: Fonts.bold, color: Colors.textMuted },
    addBtnSmall: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
    addBtnTextSmall: { fontSize: 13, fontFamily: Fonts.bold },
    eventInfoBox: { width: '90%', marginTop: 24, padding: 20, borderRadius: 24, borderWidth: 1, alignItems: 'center' },
    eventInfoTitle: { fontSize: 16, fontFamily: Fonts.bold, marginBottom: 8 },
    eventInfoText: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
    gridImage: { width: '100%', height: '100%' },
});
