import React, { useState, useEffect, useRef, useCallback } from 'react';
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

    const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);

    const [isFollowedOwner, setIsFollowedOwner] = useState(false);

    const [showOptions, setShowOptions] = useState(false);
    const [showQRModal, setShowQRModal] = useState(false);

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
    const player = useAudioPlayer(playingAudio ? { uri: playingAudio } : null);
    const playStatus = useAudioPlayerStatus(player);

    const toggleAudio = (url: string) => {
        if (playingAudio === url) {
            if (playStatus.playing) player.pause();
            else player.play();
            return;
        }
        setPlayingAudio(url);
    };

    useEffect(() => {
        if (playingAudio && player) player.play();
    }, [playingAudio, player]);

    useEffect(() => {
        if (playStatus.didJustFinish) setPlayingAudio(null);
    }, [playStatus.didJustFinish]);

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
        if (itemsRes.data) setItems(itemsRes.data);
        setLikeCount(likesRes.count || 0);
        const processedComments = (commentsRes.data || []).map((c: any) => ({
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
            }
        }
    };

    const handleDeleteCapsule = () => {
        Alert.alert(
            t('detail.delete_capsule_title'),
            t('detail.delete_capsule_msg'),
            [
                { text: t('detail.keep_it'), style: "cancel" },
                {
                    text: t('common.delete'),
                    style: "destructive",
                    onPress: async () => {
                        setShowOptions(false);
                        setLoading(true);
                        try {
                            // 1. Fetch all items to get their media and thumbnail URLs
                            const { data: itemsToDelete } = await supabase
                                .from('capsule_items')
                                .select('media_url, thumbnail_url')
                                .eq('capsule_id', capsuleId);

                            // 2. Delete media and thumbnails from storage if they exist
                            if (itemsToDelete && itemsToDelete.length > 0) {
                                const filesToDelete: string[] = [];
                                const baseUrl = "https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/capsule-media/";

                                itemsToDelete.forEach(item => {
                                    if (item.media_url && item.media_url.startsWith(baseUrl)) {
                                        filesToDelete.push(item.media_url.replace(baseUrl, "").split('?')[0]);
                                    }
                                    if (item.thumbnail_url && item.thumbnail_url.startsWith(baseUrl)) {
                                        filesToDelete.push(item.thumbnail_url.replace(baseUrl, "").split('?')[0]);
                                    }
                                });

                                if (filesToDelete.length > 0) {
                                    await supabase.storage.from('capsule-media').remove(filesToDelete);
                                }
                            }

                            // 3. Delete the capsule (cascades to capsule_items and other tables usually)
                            const { error } = await supabase.from('capsules').delete().eq('id', capsuleId);
                            if (!error) {
                                navigation.goBack();
                            } else {
                                throw error;
                            }
                        } catch (err: any) {
                            console.error('Error deleting capsule content:', err);
                            Alert.alert('Error', 'Could not delete capsule or its content.');
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
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
        // On iOS & Android you can use Linking to a custom scheme if configured. Or generic Share.
        // For story explicitly, it's specific intent. We will fallback to generic.
        Share.share({
            message: `Checkout my capsule! kapsely://capsule/${capsuleId}`,
            title: 'Kapsely Memory',
        });
    };

    if (loading && !capsule) return (
        <View style={[styles.container, styles.centered]}>
            <ActivityIndicator color={Colors.primary} size="large" />
        </View>
    );

    if (!capsule) return (
        <View style={[styles.container, styles.centered]}>
            <TouchableOpacity 
                style={[styles.backBtn, { position: 'absolute', top: insets.top + 10, left: 15 }]} 
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


    const canBeOpened = capsule.opens_at ? new Date(capsule.opens_at) <= new Date() : true;
    const activeModelTint = (MODEL_TINTS as any)[capsule.model] || '#a269ff';
    const tint = modelTint || activeModelTint;
    const isOwner = userId === capsule.owner_id;

    const now_val = new Date();
    const opensAt = capsule.opens_at ? new Date(capsule.opens_at) : null;
    const chatStart = opensAt ? new Date(opensAt.getTime() - 24 * 60 * 60 * 1000) : null;
    const chatEnd = opensAt ? new Date(opensAt.getTime() + 5 * 60 * 60 * 1000) : null;
    const showChat = chatStart && chatEnd && now_val >= chatStart && now_val <= chatEnd;

    const groupedItems = items.reduce((acc: any, item: any) => {
        const date = new Date(item.created_at);
        const month = date.toLocaleString('default', { month: 'long' });
        const year = date.getFullYear();
        const key = `${month} ${year}`;
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
    }, {});

    const openViewer = (index: number) => {
        setInitialIndex(index);
        setActiveViewerIndex(index);
        setViewerVisible(true);
    };

    const hasRequestedOpen = capsule.open_requests?.includes(userId);
    const reqCount = capsule.open_requests?.length || 0;

    const acceptedInvitesCount = invites?.filter(i => i.status === 'accepted').length || 0;
    const isLegacyAccepted = capsule.invited_user_id && capsule.invite_status === 'accepted';

    // Total members = Owner + unique accepted people from capsule_invites + legacy invited
    const totalMembers = 1 + acceptedInvitesCount + (isLegacyAccepted ? 1 : 0);

    const isMember = isOwner ||
        (invites?.some(i => i.user_id === userId && i.status === 'accepted')) ||
        (capsule.invite_status === 'accepted' && capsule.invited_user_id === userId);

    // Waiting count = people in capsule_invites who are still pending
    const waitingCount = invites.filter(i => i.status === 'pending').length;
    const hasWaiting = waitingCount > 0;

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <Animated.View style={[styles.flashOverlay, { opacity: flashAnim, pointerEvents: 'none' }]} />

            <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="close" size={26} color={Colors.textPrimary} />
                </TouchableOpacity>
                <View style={styles.headerCreatorContainer}>
                    <TouchableOpacity style={styles.headerCreator} onPress={() => navigation.navigate('UserProfile', { targetUserId: capsule.owner_id })}>
                        <Image source={{ uri: capsule.profiles?.avatar_url || 'https://via.placeholder.com/150' }} style={styles.headerAvatar} />
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={styles.headerUsername}>{capsule.profiles?.username}</Text>
                            {capsule.profiles?.is_verified && <VerifiedBadge size={12} style={{ marginLeft: 2 }} />}
                        </View>
                    </TouchableOpacity>
                    {userId !== capsule.owner_id && (
                        <TouchableOpacity 
                            style={[styles.headerFollowBtn, isFollowedOwner && styles.headerFollowBtnActive]} 
                            onPress={() => handleFollowToggle(capsule.owner_id, isFollowedOwner, setIsFollowedOwner)}
                        >
                            <Text style={[styles.headerFollowText, isFollowedOwner && styles.headerFollowTextActive]}>
                                {isFollowedOwner ? t('common.following') : t('common.follow')}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
                <TouchableOpacity style={styles.backBtn} onPress={() => setShowOptions(true)}>
                    <Ionicons name="ellipsis-horizontal" size={24} color={Colors.textPrimary} />
                </TouchableOpacity>
            </View>

            {/* Options Modal */}
            <Modal visible={showOptions} transparent animationType="fade">
                <Pressable style={styles.modalOverlay} onPress={() => setShowOptions(false)}>
                    <View style={styles.optionsContent}>
                        <View style={styles.modalBar} />
                        <Text style={styles.optionsTitle}>{t('detail.options')}</Text>

                        <TouchableOpacity style={styles.deleteOption} onPress={() => { setShowOptions(false); setShowQRModal(true); }}>
                            <Ionicons name="qr-code-outline" size={22} color={Colors.textPrimary} />
                            <Text style={[styles.deleteOptionText, { color: Colors.textPrimary }]}>{t('detail.view_qr')}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.deleteOption} onPress={handleShareInstagram}>
                            <Ionicons name="logo-instagram" size={22} color="#E1306C" />
                            <Text style={[styles.deleteOptionText, { color: '#E1306C' }]}>{t('detail.share_instagram')}</Text>
                        </TouchableOpacity>

                        {isOwner && (
                            <TouchableOpacity style={styles.deleteOption} onPress={handleDeleteCapsule}>
                                <Ionicons name="trash-outline" size={22} color={Colors.eventCap} />
                                <Text style={styles.deleteOptionText}>{t('detail.delete_perm')}</Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity style={styles.cancelOption} onPress={() => setShowOptions(false)}>
                            <Text style={styles.cancelOptionText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>

            <Modal visible={showQRModal} transparent animationType="fade">
                <Pressable style={styles.qrRootOverlay} onPress={() => setShowQRModal(false)}>
                    <View style={styles.qrContentBox}>
                        <Text style={styles.qrTitle}>{t('detail.capsule_qr')}</Text>
                        <Image
                            source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=kapsely://capsule/${capsuleId}` }}
                            style={styles.qrImage}
                        />
                        <Text style={styles.qrSubtitle}>{t('detail.scan_qr_hint')}</Text>
                        <TouchableOpacity style={styles.qrCloseBtn} onPress={() => setShowQRModal(false)}>
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
                                <Text style={[styles.sealedTitle, { fontSize: 28, marginBottom: 8, textAlign: 'center' }]}>{capsule.title}</Text>
                                {capsule.description ? (
                                    <Text style={[styles.description, { marginBottom: 20 }]}>{capsule.description}</Text>
                                ) : null}

                                {capsule.is_shared && (
                                    <View style={[styles.participantSection, { alignSelf: 'center', marginBottom: 20 }]}>
                                        <View style={styles.participantAvatars}>
                                            <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { targetUserId: capsule.owner_id })}>
                                                <Image source={{ uri: capsule.profiles?.avatar_url }} style={styles.memberAvatarCircle} />
                                            </TouchableOpacity>
                                            {acceptedMembers.map((m: any, i: number) => (
                                                <TouchableOpacity 
                                                    key={i} 
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
                                         <View>
                                             <Text style={styles.participantCount}>{t('common.members_count', { count: totalMembers })}</Text>
                                             {hasWaiting && (
                                                 <Text style={styles.waitingText}>{t('common.waiting_count', { count: waitingCount })}</Text>
                                             )}
                                         </View>
                                    </View>
                                )}

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
                                                    style={[styles.openNowBtn, hasRequestedOpen && { opacity: 0.8 }]}
                                                    onPress={handleRequestOpen}
                                                    disabled={hasRequestedOpen}
                                                >
                                                     <LinearGradient colors={[tint, tint + 'cc']} style={styles.openNowGrad}>
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
                                                     <TouchableOpacity style={[styles.addBtnSmall, { backgroundColor: tint + '15' }]} onPress={() => navigation.navigate('CreateSelection', { capsuleId: capsule.id })}>
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
                                    <View style={styles.blurredGridContainer}>
                                         <View style={styles.sectionHeader}>
                                             <Text style={styles.sectionTitle}>{t('detail.sealed_memories')}</Text>
                                             <Text style={styles.itemCount}>{t('profile.capsule_count', { count: items.length })}</Text>
                                         </View>
                                        <View style={styles.grid}>
                                            {items.map(item => (
                                                <View key={item.id} style={styles.gridItemPlaceholder}>
                                                    {item.media_type === 'note' ? (
                                                        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.85)', padding: 10, justifyContent: 'center' }]}>
                                                            <Text style={{ fontSize: 13, color: 'rgba(0,0,0,0.15)', lineHeight: 18, letterSpacing: 2, textAlign: 'center', fontFamily: Fonts.bold }} numberOfLines={5}>
                                                                {'∑ ∆ ∿ ⎈ ⌬ ⍟ ⚯ ⌘ Ω ✚ ✣ ✢ ✥ ✦ ✧ ✩ ✪ ✫ ✬ ✭ ✮ ✯ ✰ ✱ ✲ ✳ ✴ ✵ ✶ ✷ ✸ ✹ ✺ ✻ ✼ ✽ ✾ ✿ ❀ ❁ ❂ ❃ ❄ ❅ ❆ ❇ ❈ ❉ ❊ ❋'.split(' ').sort(() => 0.5 - Math.random()).join(' ')}
                                                            </Text>
                                                        </View>
                                                     ) : (item.media_url || item.thumbnail_url) ? (
                                                         <Image source={{ uri: item.thumbnail_url || item.media_url }} style={StyleSheet.absoluteFill} blurRadius={25} />
                                                     ) : null}

                                                     <BlurView intensity={item.media_type === 'note' ? 90 : 40} tint="light" style={StyleSheet.absoluteFill} />
                                                     
                                                     {/* Video specific overlays (blur keeps them slightly obscure but visible) */}
                                                     {item.media_type === 'video' && (
                                                         <>
                                                             <View style={[styles.gridPlayIcon, { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
                                                                 <Ionicons name="play" size={16} color="rgba(255,255,255,0.9)" />
                                                             </View>
                                                             {item.content && (
                                                                 <View style={[styles.gridDurationBadge, { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
                                                                     <Text style={[styles.gridDurationText, { color: '#000' }]}>{item.content}</Text>
                                                                 </View>
                                                             )}
                                                         </>
                                                     )}

                                                     {/* Lock Icon */}
                                                     <View style={{ position: 'absolute', width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' }}>
                                                         <Ionicons name="lock-closed-outline" size={20} color="rgba(0,0,0,0.5)" />
                                                     </View>

                                                    {item.profiles?.avatar_url && (
                                                        <Image source={{ uri: item.profiles.avatar_url }} style={styles.itemAvatar} />
                                                    )}
                                                </View>
                                            ))}
                                        </View>
                                    </View>
                                ) : items.length === 0 ? (
                                    <View style={styles.emptyGridContainer}>
                                        <View style={styles.sectionHeader}>
                                            <Text style={styles.sectionTitle}>Empty Capsule</Text>
                                            <Text style={styles.itemCount}>0 items</Text>
                                        </View>
                                        <View style={styles.grid}>
                                            {[...Array(6)].map((_, i) => (
                                                <View key={i} style={[styles.gridItemPlaceholder, { backgroundColor: Colors.border + '66' }]}>
                                                    <Ionicons name="image-outline" size={32} color={Colors.border} />
                                                </View>
                                            ))}
                                        </View>
                                    </View>
                                ) : (
                                    Object.keys(groupedItems).map(month => (
                                        <View key={month} style={styles.monthSection}>
                                            <Text style={styles.monthTitle}>{month}</Text>
                                            <View style={styles.grid}>
                                                {groupedItems[month].map((item: any) => (
                                                    <TouchableOpacity
                                                        key={item.id}
                                                        style={styles.gridItem}
                                                        onPress={() => item.media_type === 'audio' ? toggleAudio(item.media_url) : openViewer(items.indexOf(item))}
                                                    >
                                                        {item.media_type === 'audio' ? (
                                                            <View style={[styles.gridAudioCell, { backgroundColor: tint }]}>
                                                                {/* Mini Waveform */}
                                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, height: 24, marginBottom: 4 }}>
                                                                    {[12, 20, 16, 24, 18, 14].map((h, i) => (
                                                                        <View key={i} style={{ width: 3, height: playingAudio === item.media_url ? h : h * 0.5, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 2 }} />
                                                                    ))}
                                                                </View>
                                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 }}>
                                                                    <Ionicons name="mic" size={10} color="#fff" />
                                                                    <Text style={{ color: '#fff', fontSize: 10, fontFamily: Fonts.bold }}>{item.content || '--:--'}</Text>
                                                                </View>
                                                            </View>                                                        ) : item.media_type === 'note' ? (
                                                            <View style={[styles.gridNoteCell, { backgroundColor: '#f0f0f0' }]}>
                                                                <Ionicons name="document-text" size={32} color={tint} opacity={0.3} style={{ position: 'absolute' }} />
                                                                <Text style={[styles.noteSnippet, { color: '#000', fontSize: 12, fontFamily: Fonts.medium, textAlign: 'center' }]} numberOfLines={4}>
                                                                    {item.content}
                                                                </Text>
                                                            </View>
                                                        ) : (
                                                            <>
                                                                <Image source={{ uri: (item.media_type === 'video' ? (item.thumbnail_url || item.media_url) : item.media_url) || 'https://via.placeholder.com/150' }} style={styles.gridImage} />
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
                                                ))}
                                            </View>
                                        </View>
                                    ))
                                )}
                            </View>
                        );

                        if (item === 'chat' && showChat) return <LiveChat capsuleId={capsuleId} tint={tint} />;

                        if (item === 'social') return (
                            <View style={styles.socialSection}>
                                <View style={styles.interactionRow}>
                                    <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
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
                                        <View key={c.id} style={[styles.commentItem, highlightedCommentId === c.id && { backgroundColor: Colors.primary + '20', borderRadius: 8, padding: 4 }]}>
                                            <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { targetUserId: c.user_id })}>
                                                <Image source={{ uri: c.profiles?.avatar_url || 'https://via.placeholder.com/150' }} style={styles.commentAvatar} />
                                            </TouchableOpacity>
                                            <View style={styles.commentContent}>
                                                <TouchableOpacity 
                                                    style={{ flexDirection: 'row', alignItems: 'center' }}
                                                    onPress={() => navigation.navigate('UserProfile', { targetUserId: c.user_id })}
                                                >
                                                    <Text style={styles.commentUser}>{c.profiles?.username}</Text>
                                                    {c.profiles?.is_verified && <VerifiedBadge size={10} style={{ marginLeft: 2 }} />}
                                                </TouchableOpacity>
                                                <Text style={styles.commentText}>{c.content}</Text>
                                            </View>
                                            {(c.user_id === userId || isOwner) && (
                                                <TouchableOpacity onPress={() => handleDeleteComment(c.id)} style={styles.deleteCommentBtn}>
                                                    <Ionicons name="trash-outline" size={16} color={Colors.textMuted} />
                                                </TouchableOpacity>
                                            )}
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
                        <TouchableOpacity onPress={handleSendComment} disabled={!comment.trim()} style={{ marginBottom: 10 }}>
                            <Text style={[styles.postBtn, !comment.trim() && { opacity: 0.5 }]}>Post</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </KeyboardAvoidingView>

            <Modal visible={viewerVisible} transparent animationType="fade">
                <View style={styles.viewerContainer}>
                    <TouchableOpacity style={styles.closeViewer} onPress={() => setViewerVisible(false)}>
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
                                     <View style={[styles.viewerNoteContainer, { backgroundColor: '#f0f0f0' }]}>
                                         <Ionicons name="document-text" size={100} color={modelTint || Colors.primary} opacity={0.1} style={{ position: 'absolute' }} />
                                         <Text style={[styles.viewerNoteText, { color: '#000', fontSize: 24, paddingHorizontal: 30, textAlign: 'center', lineHeight: 34, fontFamily: Fonts.medium }]}>{item.content}</Text>
                                     </View>
                                 ) : item.media_type === 'audio' ? (
                                     <View style={[styles.viewerNoteContainer, { backgroundColor: modelTint || Colors.primary }]}>
                                         <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 60, marginBottom: 30 }}>
                                             {[10, 20, 30, 45, 60, 40, 25, 15, 30, 50, 25, 12, 5].map((h, i) => (
                                                 <View key={i} style={{ width: 6, height: playingAudio === item.media_url ? h : h * 0.4, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 3 }} />
                                             ))}
                                         </View>
                                         <TouchableOpacity onPress={() => toggleAudio(item.media_url)} style={[styles.recordBtn, { backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' }]}>
                                             <Ionicons name={playingAudio === item.media_url ? "pause" : "play"} size={40} color="#fff" style={{ marginLeft: playingAudio === item.media_url ? 0 : 4 }} />
                                         </TouchableOpacity>
                                         <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 24, backgroundColor: 'rgba(0,0,0,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
                                             <Ionicons name="mic" size={14} color="#fff" />
                                             <Text style={{ color: '#fff', fontSize: 14, fontFamily: Fonts.bold }}>{item.content || 'Voice Note'}</Text>
                                         </View>
                                     </View>
                                 ) : item.media_type === 'video' ? (
                                     <Video
                                         source={{ uri: item.media_url }}
                                         rate={1.0}
                                         volume={1.0}
                                         isMuted={false}
                                         resizeMode={ResizeMode.CONTAIN}
                                         shouldPlay={activeViewerIndex === index && viewerVisible}
                                         useNativeControls
                                         style={styles.viewerImage}
                                     />
                                 ) : (
                                     <Image source={{ uri: item.media_url }} style={styles.viewerImage} resizeMode="contain" />
                                 )}
                                 {item.caption && <Text style={styles.viewerCaption}>{item.caption}</Text>}
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
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 50, paddingHorizontal: Spacing.md, height: 100 },
    backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    headerCreator: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    headerAvatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: Colors.border },
    headerUsername: { fontSize: 13, fontFamily: Fonts.bold, color: Colors.textPrimary },
    headerFollowBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: Colors.primary + '15' },
    headerFollowBtnActive: { backgroundColor: Colors.borderLight },
    headerFollowText: { fontSize: 11, fontFamily: Fonts.bold, color: Colors.primary },
    headerFollowTextActive: { color: Colors.textMuted },
    headerCreatorContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
    scrollContent: { paddingBottom: 40 },
    flashOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#fff', zIndex: 999 },
    heroSection: { alignItems: 'center', paddingVertical: Spacing.xl },
    modelContainerDetail: { position: 'relative', width: 220, height: 220, alignItems: 'center', justifyContent: 'center' },
    heroModel: { width: 220, height: 220 },
    cornerTypeIconDetail: { position: 'absolute', top: 20, right: 20, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', ...Shadow.subtle },
    detailTypeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginTop: 10 },
    detailTypeLabel: { fontSize: 13, fontFamily: Fonts.bold },
    openingOverlay: { position: 'absolute', top: '40%', alignItems: 'center', justifyContent: 'center', padding: 30, borderRadius: 30, overflow: 'hidden' },
    openingText: { fontSize: 13, fontFamily: Fonts.bold, color: Colors.textMuted, letterSpacing: 2 },
    openingTimer: { fontSize: 64, fontWeight: 'bold' },
    sealedInfo: { alignItems: 'center', marginTop: 20 },
    openedInfo: { paddingHorizontal: Spacing.lg, marginTop: 10, alignItems: 'center' },
    sealedTitle: { fontSize: 24, fontFamily: Fonts.bold, color: Colors.textPrimary },
    description: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textSecondary, textAlign: 'center', marginTop: 8 },
    openNowBtn: { marginTop: 20, width: 200 },
    openNowGrad: { paddingVertical: 12, borderRadius: 25, alignItems: 'center' },
    openNowText: { color: '#fff', fontSize: 16, fontFamily: Fonts.bold },
    badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 15 },
    lockedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.surface, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: Colors.border },
    lockedText: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.primary },
    addBtnSmall: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
    addBtnTextSmall: { fontSize: 12, fontFamily: Fonts.bold },
    contentSection: { paddingHorizontal: Spacing.md, marginTop: Spacing.xl },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    sectionTitle: { fontSize: 18, fontFamily: Fonts.bold },
    itemCount: { fontSize: 14, color: Colors.textMuted },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
    gridItem: { width: ITEM_SIZE, height: ITEM_HEIGHT, borderRadius: 8, overflow: 'hidden', backgroundColor: Colors.cardAlt },
    gridImage: { width: '100%', height: '100%', resizeMode: 'cover' },
    gridAudioCell: { width: ITEM_SIZE, height: ITEM_HEIGHT, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    gridItemPlaceholder: { width: ITEM_SIZE, height: ITEM_HEIGHT, backgroundColor: Colors.cardAlt, alignItems: 'center', justifyContent: 'center', borderRadius: 8, overflow: 'hidden' },
    blurredGridContainer: { position: 'relative' },
    monthSection: { marginBottom: Spacing.xl },
    monthTitle: { fontSize: 14, fontFamily: Fonts.bold, color: Colors.textMuted, marginBottom: 10 },
    socialSection: { paddingHorizontal: Spacing.md, marginTop: Spacing.xl, paddingBottom: 20 },
    interactionRow: { flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: Spacing.md },
    actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    actionCount: { fontSize: 15, fontFamily: Fonts.semiBold },
    commentsList: { gap: 12 },
    commentItem: { flexDirection: 'row', gap: 10 },
    commentAvatar: { width: 32, height: 32, borderRadius: 16 },
    commentContent: { flex: 1 },
    commentUser: { fontSize: 13, fontFamily: Fonts.bold },
    commentText: { fontSize: 13, color: Colors.textSecondary },
    commentBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: Spacing.md, paddingTop: 10, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border, gap: 12 },
    commentInput: { flex: 1, minHeight: 40, maxHeight: 120, paddingTop: 12, paddingBottom: 12, backgroundColor: Colors.background, borderRadius: 24, paddingHorizontal: 16, fontSize: 14, borderWidth: 1, borderColor: Colors.border },
    postBtn: { color: Colors.primary, fontFamily: Fonts.bold },
    chatInfo: { flex: 1, textAlign: 'center', color: Colors.textMuted, fontSize: 13 },
    viewerContainer: { flex: 1, backgroundColor: '#000' },
    viewerSlide: { width, height, justifyContent: 'center', alignItems: 'center' },
    viewerImage: { width: '100%', height: '100%' },
    viewerCaption: { position: 'absolute', bottom: 100, color: '#fff', textAlign: 'center', width: '80%', backgroundColor: 'rgba(0,0,0,0.5)', padding: 10, borderRadius: 10 },
    closeViewer: { position: 'absolute', top: 50, right: 20, zIndex: 10 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    optionsContent: { backgroundColor: Colors.surface, borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 25, paddingBottom: 50 },
    modalBar: { width: 40, height: 5, backgroundColor: '#eee', borderRadius: 3, alignSelf: 'center', marginBottom: 20 },
    optionsTitle: { fontSize: 18, fontFamily: Fonts.bold, textAlign: 'center', marginBottom: 25 },
    deleteOption: { flexDirection: 'row', alignItems: 'center', gap: 15, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    deleteOptionText: { color: Colors.eventCap, fontSize: 16, fontFamily: Fonts.semiBold },
    cancelOption: { alignItems: 'center', paddingVertical: 20 },
    cancelOptionText: { color: Colors.textMuted, fontSize: 15, fontFamily: Fonts.medium },

    // Aesthetic opening timer
    openingOverlayAesthetic: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 30, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
    openingOverlayAestheticInner: { width: 160, height: 160, borderRadius: 80, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
    pulsingCircle: { position: 'absolute', width: '100%', height: '100%', borderRadius: 80 },
    openingTextAesthetic: { fontSize: 11, fontFamily: Fonts.bold, color: '#fff', letterSpacing: 2, marginBottom: 5 },
    openingTimerAesthetic: { fontSize: 50, fontWeight: 'bold' },

    // Delete Comment button
    deleteCommentBtn: { padding: 5 },

    // QR Modal styles
    qrRootOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
    qrContentBox: { width: '80%', backgroundColor: Colors.surface, borderRadius: 24, padding: 30, alignItems: 'center' },
    qrTitle: { fontSize: 22, fontFamily: Fonts.bold, color: Colors.textPrimary, marginBottom: 20 },
    qrImage: { width: 220, height: 220, marginBottom: 20 },
    qrSubtitle: { fontSize: 14, color: Colors.textSecondary, fontFamily: Fonts.medium, textAlign: 'center', marginBottom: 25 },
    qrCloseBtn: { width: '100%', paddingVertical: 14, backgroundColor: Colors.primary, borderRadius: 16, alignItems: 'center' },
    qrCloseBtnText: { color: '#fff', fontSize: 16, fontFamily: Fonts.bold },
    itemAvatar: { position: 'absolute', bottom: 4, right: 4, width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: '#fff' },
    requestStatusHint: { marginTop: 10, fontSize: 12, fontFamily: Fonts.medium, color: Colors.textMuted },

    addContentHint: {
        position: 'absolute',
        bottom: 25,
        left: -40,
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: Colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        ...Shadow.subtle,
        zIndex: 5,
        borderWidth: 2,
        borderColor: '#fff',
    },

    // Participants
    participantSection: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, backgroundColor: 'rgba(255,255,255,0.4)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: BorderRadius.full, alignSelf: 'flex-start' },
    participantAvatars: { flexDirection: 'row', alignItems: 'center' },
    memberAvatarCircle: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: '#fff' },
    waitingCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.cardAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#fff' },
    participantCount: { fontSize: 12, fontFamily: Fonts.bold, color: Colors.textPrimary },
    waitingText: { fontSize: 10, fontFamily: Fonts.medium, color: Colors.textMuted, marginTop: -2 },

    // Added elements
    eventInfoBox: { padding: 15, borderRadius: 12, borderWidth: 1, marginTop: 15, alignItems: 'center' },
    eventInfoTitle: { fontSize: 16, fontFamily: Fonts.bold, marginBottom: 5 },
    eventInfoText: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', fontFamily: Fonts.medium, lineHeight: 18 },
    emptyGridContainer: { marginTop: Spacing.md },
    viewerNoteContainer: { width: '85%', padding: 30, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    viewerNoteText: { color: '#fff', fontSize: 18, fontFamily: Fonts.regular, textAlign: 'center', lineHeight: 26 },
    recordBtn: { width: 100, height: 100, borderRadius: 50, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
    gridPlayIcon: { position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
    gridDurationBadge: { position: 'absolute', bottom: 5, left: 5, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 },
    gridDurationText: { color: '#fff', fontSize: 9, fontFamily: Fonts.bold },
    gridNoteCell: { width: ITEM_SIZE, height: ITEM_HEIGHT, borderRadius: 8, alignItems: 'center', justifyContent: 'center', padding: 12, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    noteSnippet: { fontSize: 11, fontFamily: Fonts.medium, color: Colors.textSecondary, textAlign: 'center', marginTop: 6, fontStyle: 'italic', opacity: 0.8 },
});
