import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, Image, ScrollView, TouchableOpacity,
    TextInput, Dimensions, Animated, StatusBar, Alert, ActivityIndicator,
    Modal, FlatList, KeyboardAvoidingView, Platform, Pressable, Share, Linking
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Colors, Fonts, Spacing, Shadow, BorderRadius } from '../theme';
import { supabase } from '../lib/supabase';

const { width, height } = Dimensions.get('window');
const GRID_COLS = 3;
const GRID_GAP = 2;
const SECTION_PAD = Spacing.md * 2;
const ITEM_SIZE = (width - SECTION_PAD - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;

import { MODEL_IMAGES, MODEL_TINTS, MODEL_IMAGES_OPEN } from '../constants/models';

import LiveTimer from '../components/LiveTimer';
import CapsuleWithTimer from '../components/CapsuleWithTimer';
import LiveChat from '../components/LiveChat';
import VerifiedBadge from '../components/VerifiedBadge';
import { timerConfigManager } from '../utils/timerConfig';



export default function CapsuleDetailScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute();
    const { capsuleId }: any = route.params || {};

    const [capsule, setCapsule] = useState<any>(null);
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isOpening, setIsOpening] = useState(false);
    const [openingTimer, setOpeningTimer] = useState(10);
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
    const [now, setNow] = useState(new Date());

    const flashAnim = useRef(new Animated.Value(0)).current;
    const insets = useSafeAreaInsets();
    const timerRef = useRef<any>(null);

    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(interval);
    }, []);

    const [playingAudio, setPlayingAudio] = useState<string | null>(null);
    const soundRef = useRef<Audio.Sound | null>(null);
    const [showOptions, setShowOptions] = useState(false);
    const [showQRModal, setShowQRModal] = useState(false);

    // Audio cleanup
    useEffect(() => { return () => { soundRef.current?.unloadAsync(); }; }, []);

    const toggleAudio = async (url: string) => {
        if (playingAudio === url) {
            await soundRef.current?.pauseAsync();
            setPlayingAudio(null);
            return;
        }
        if (soundRef.current) {
            await soundRef.current.unloadAsync();
            soundRef.current = null;
        }
        try {
            await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
            const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true });
            soundRef.current = sound;
            setPlayingAudio(url);
            sound.setOnPlaybackStatusUpdate((s: any) => {
                if (s.isLoaded && s.didJustFinish) setPlayingAudio(null);
            });
        } catch { Alert.alert('Error', 'Could not play audio.'); }
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
                    setCapsule((prev: any) => ({ ...prev, ...updated }));
                    if (updated.is_opening && !updated.status.includes('opened') && updated.opening_at) {
                        startGlobalCountdown(updated.opening_at);
                    } else if (updated.status === 'opened') {
                        setIsOpening(false);
                    }
                })
                .subscribe();

            // Listen to like changes (Real-time synchronization)
            const likeChannel = supabase.channel(`capsule-${capsuleId}-likes`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'likes', filter: `capsule_id=eq.${capsuleId}` }, async () => {
                    // Update like count
                    const { count } = await supabase.from('likes').select('*', { count: 'exact', head: true }).eq('capsule_id', capsuleId);
                    setLikeCount(count || 0);

                    // Check if current user still likes it
                    const { data: { user } } = await supabase.auth.getUser();
                    if (user) {
                        const { data } = await supabase.from('likes').select('*').eq('capsule_id', capsuleId).eq('user_id', user.id).single();
                        setIsLiked(!!data);
                    }
                })
                .subscribe();

            // Listen to comment changes
            const commentChannel = supabase.channel(`capsule-${capsuleId}-comments`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `capsule_id=eq.${capsuleId}` }, async (payload: any) => {
                    if (payload.eventType === 'INSERT') {
                        const { data } = await supabase.from('comments').select('*, profiles:user_id(*)').eq('id', payload.new.id).single();
                        if (data) setComments(prev => [data, ...prev]);
                    } else if (payload.eventType === 'DELETE') {
                        setComments(prev => prev.filter(c => c.id !== payload.old.id));
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
                supabase.removeChannel(likeChannel);
                supabase.removeChannel(commentChannel);
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
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    };

    const loadData = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        setUserId(user?.id ?? null);
        const [capRes, itemsRes, likesRes, commentsRes, myLikeRes, invitesRes] = await Promise.all([
            supabase.from('capsules').select('*, profiles:owner_id(*)').eq('id', capsuleId).single(),
            supabase.from('capsule_items').select('*, profiles:owner_id(avatar_url, id)').eq('capsule_id', capsuleId).order('created_at', { ascending: true }),
            supabase.from('likes').select('*', { count: 'exact', head: true }).eq('capsule_id', capsuleId),
            supabase.from('comments').select('*, profiles:user_id(*), comment_likes(user_id)').eq('capsule_id', capsuleId).order('created_at', { ascending: false }),
            user ? supabase.from('likes').select('*').eq('capsule_id', capsuleId).eq('user_id', user.id).single() : { data: null },
            supabase.from('capsule_invites').select('*, profiles:user_id(*)').eq('capsule_id', capsuleId)
        ]);
        if (capRes.data) {
            setCapsule(capRes.data);
            const cfg = timerConfigManager.getConfig(capRes.data.model);
            setModelTint(cfg?.themeColor || MODEL_TINTS[capRes.data.model] || '#a269ff');
            if (capRes.data.is_opening && capRes.data.status !== 'opened' && capRes.data.opening_at) {
                startGlobalCountdown(capRes.data.opening_at);
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
            setAcceptedMembers(invitesRes.data.filter((i: any) => i.status === 'accepted').map((i: any) => i.profiles));
        }
        setLoading(false);
    };

    const handleRequestOpen = async () => {
        if (!userId || !capsule) return;
        const currentReqs = capsule.open_requests || [];
        if (currentReqs.includes(userId)) return;

        const acceptedInvites = invites?.filter(i => i.status === 'accepted') || [];
        const totalMembers = 1 + acceptedInvites.length;
        const newReqs = [...currentReqs, userId];

        setCapsule({ ...capsule, open_requests: newReqs }); // optimistic
        await supabase.from('capsules').update({ open_requests: newReqs }).eq('id', capsuleId);

        if (newReqs.length >= totalMembers) {
            const targetDate = new Date();
            targetDate.setSeconds(targetDate.getSeconds() + 10);
            await supabase.from('capsules').update({ is_opening: true, opening_at: targetDate.toISOString() }).eq('id', capsuleId);
            startGlobalCountdown(targetDate.toISOString());

            // Notify everyone
            const members = [capsule.owner_id, ...acceptedInvites.map(i => i.user_id)];
            for (const member of members) {
                if (member !== userId) {
                    await supabase.from('notifications').insert({
                        user_id: member, sender_id: userId, type: 'capsule_opened', capsule_id: capsuleId,
                        message: 'capsule is opening now!'
                    });
                }
            }
        }
    };

    const triggerFlash = async () => {
        setIsOpening(false);
        Animated.sequence([
            Animated.timing(flashAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
            Animated.timing(flashAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
        ]).start(() => {
            setCapsule((prev: any) => ({ ...prev, status: 'opened', is_opening: false }));
            if (capsule?.owner_id === userId) {
                supabase.from('capsules').update({ status: 'opened', is_opening: false }).eq('id', capsuleId).then();
            }
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
                    user_id: capsule.owner_id, sender_id: userId, type: 'like', capsule_id: capsuleId, message: 'liked your capsule'
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
        const { data } = await supabase.from('comments').insert({
            capsule_id: capsuleId, user_id: userId, content: comment.trim()
        }).select('*, profiles:user_id(*)').single();
        if (data) {
            setComments([{ ...data, myLike: false, likeCount: 0 }, ...comments]);
            setComment('');
            if (capsule.owner_id !== userId) {
                await supabase.from('notifications').insert({
                    user_id: capsule.owner_id, sender_id: userId, type: 'comment', capsule_id: capsuleId,
                    message: `commented: ${comment.trim().substring(0, 30)}${comment.trim().length > 30 ? '...' : ''}`
                });
            }
        }
    };

    const handleDeleteCapsule = () => {
        Alert.alert(
            "Delete Capsule",
            "Are you sure? This memory will be gone forever.",
            [
                { text: "Keep it", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        setShowOptions(false);
                        const { error } = await supabase.from('capsules').delete().eq('id', capsuleId);
                        if (!error) {
                            navigation.goBack();
                        } else {
                            Alert.alert('Error', 'Could not delete capsule.');
                        }
                    }
                }
            ]
        );
    };

    const handleDeleteComment = (commentId: string) => {
        Alert.alert(
            "Delete Comment",
            "Are you sure you want to delete this comment?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
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
            <Text style={{ color: Colors.textMuted }}>Capsule not found.</Text>
        </View>
    );

    const isSealed = capsule.status === 'sealed';
    const canBeOpened = capsule.opens_at ? new Date(capsule.opens_at) <= now : true;
    const modelImg = isSealed ? (MODEL_IMAGES[capsule.model] || MODEL_IMAGES.beach) : (MODEL_IMAGES_OPEN[capsule.model] || MODEL_IMAGES[capsule.model] || MODEL_IMAGES.beach);
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
        setViewerVisible(true);
    };

    const hasRequestedOpen = capsule.open_requests?.includes(userId);
    const reqCount = capsule.open_requests?.length || 0;

    const acceptedInvitesCount = invites?.filter(i => i.status === 'accepted').length || 0;

    // Total members = Owner + unique accepted people from capsule_invites
    // Note: We avoid double counting if someone is in both legacy and new system
    const totalMembers = 1 + acceptedInvitesCount;
    const isMember = isOwner ||
        (invites?.some(i => i.user_id === userId && i.status === 'accepted')) ||
        (capsule.invite_status === 'accepted' && capsule.invited_user_id === userId);

    // Waiting count = people in capsule_invites who are still pending
    const waitingCount = invites.filter(i => i.status === 'pending').length;
    const hasWaiting = waitingCount > 0;

    // Stabilize Header to avoid flickering
    const renderHeader = useCallback(() => {
        if (!capsule) return null;
        const isSealed = capsule.status === 'sealed';
        const canBeOpened = capsule.opens_at ? new Date(capsule.opens_at) <= now : true;
        const modelImg = isSealed ? (MODEL_IMAGES[capsule.model] || MODEL_IMAGES.beach) : (MODEL_IMAGES_OPEN[capsule.model] || MODEL_IMAGES[capsule.model] || MODEL_IMAGES.beach);
        const activeModelTint = (MODEL_TINTS as any)[capsule.model] || '#a269ff';
        const tint = modelTint || activeModelTint;

        return (
            <>
                {/* Hero */}
                <View style={styles.heroSection}>
                    <Text style={[styles.sealedTitle, { fontSize: 28, marginBottom: 8, textAlign: 'center' }]}>{capsule.title}</Text>
                    {capsule.description ? (
                        <Text style={[styles.description, { marginBottom: 20 }]}>{capsule.description}</Text>
                    ) : null}

                    {capsule.is_shared && (
                        <View style={[styles.participantSection, { alignSelf: 'center', marginBottom: 20 }]}>
                            <View style={styles.participantAvatars}>
                                <Image source={{ uri: capsule.profiles?.avatar_url }} style={styles.memberAvatarCircle} />
                                {acceptedMembers.map((m: any, i: number) => (
                                    <Image key={i} source={{ uri: m.avatar_url }} style={[styles.memberAvatarCircle, { marginLeft: -8 }]} />
                                ))}
                                {waitingCount > 0 && (
                                    <View style={[styles.waitingCircle, { marginLeft: -8 }]}>
                                        <Ionicons name="ellipsis-horizontal" size={10} color={Colors.textMuted} />
                                    </View>
                                )}
                            </View>
                            <View>
                                <Text style={styles.participantCount}>{totalMembers} members</Text>
                                {waitingCount > 0 && (
                                    <Text style={styles.waitingText}>{waitingCount} waiting</Text>
                                )}
                            </View>
                        </View>
                    )}

                    <View style={styles.modelContainerDetail}>
                        <CapsuleWithTimer
                            modelKey={capsule.model}
                            source={{ uri: modelImg }}
                            date={capsule.opens_at}
                            chainId={capsule.chain_id}
                            capsuleType={capsule.type}
                            style={styles.heroModel}
                        />
                    </View>
                    <View style={[styles.detailTypeBadge, { backgroundColor: tint + '15' }]}>
                        <Ionicons name={(capsule.type === 'instacap' ? 'camera' : capsule.type === 'eventcap' ? 'calendar' : 'time') as any} size={14} color={tint} />
                        <Text style={[styles.detailTypeLabel, { color: tint }]}>
                            {capsule.type === 'instacap' ? 'Insta' : capsule.type === 'eventcap' ? 'Event' : 'Legacy'}
                        </Text>
                    </View>

                    {isOpening ? (
                        <View style={styles.openingOverlayAesthetic}>
                            <LinearGradient colors={[tint, tint + '80', 'transparent']} style={StyleSheet.absoluteFillObject} />
                            <View style={styles.openingOverlayAestheticInner}>
                                <View style={[styles.pulsingCircle, { backgroundColor: tint + '40' }]} />
                                <Text style={styles.openingTextAesthetic}>UNSEALING MEMORIES</Text>
                                <Text style={[styles.openingTimerAesthetic, { color: '#fff' }]}>{openingTimer}</Text>
                            </View>
                        </View>
                    ) : isSealed ? (
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
                                                    ? `Requested Open (${reqCount}/${totalMembers})`
                                                    : `Unseal Now ✨`}
                                            </Text>
                                        </LinearGradient>
                                    </TouchableOpacity>
                                    {reqCount < totalMembers && (
                                        <Text style={styles.requestStatusHint}>
                                            Waiting for other members ({reqCount}/{totalMembers})
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
                                            <Text style={[styles.addBtnTextSmall, { color: tint }]}>Add Content</Text>
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

                {/* Content Section */}
                <View style={[styles.contentSection, !isSealed && { marginTop: 0 }]}>
                    {isSealed && (
                        <View style={styles.blurredGridContainer}>
                            <View style={styles.sectionHeader}>
                                <Text style={styles.sectionTitle}>Sealed Memories</Text>
                                <Text style={styles.itemCount}>{items.length} items</Text>
                            </View>
                            <View style={styles.grid}>
                                {items.map(item => (
                                    <View key={item.id} style={styles.gridItemPlaceholder}>
                                        {item.media_url && <Image source={{ uri: item.media_url }} style={StyleSheet.absoluteFill} blurRadius={20} />}
                                        <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
                                        <Ionicons name="lock-closed-outline" size={24} color="rgba(255,255,255,0.4)" />
                                        {capsule.invited_user_id && item.profiles?.avatar_url && (
                                            <Image source={{ uri: item.profiles.avatar_url }} style={styles.itemAvatar} />
                                        )}
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}

                    {!isSealed && items.length === 0 && (
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
                    )}
                </View>
            </>
        );
    }, [capsule, acceptedMembers, waitingCount, totalMembers, isOpening, openingTimer, now, hasRequestedOpen, reqCount, isMember, items, tint, modelImg, modelTint]);

    const renderFooter = useCallback(() => {
        if (!capsule) return null;
        const activeModelTint = (MODEL_TINTS as any)[capsule.model] || '#a269ff';
        const tint = modelTint || activeModelTint;

        return (
            <>
                {showChat && <LiveChat capsuleId={capsuleId} tint={tint} />}

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
                            <View key={c.id} style={styles.commentItem}>
                                <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { targetUserId: c.user_id })}>
                                    <Image source={{ uri: c.profiles?.avatar_url || 'https://via.placeholder.com/150' }} style={styles.commentAvatar} />
                                </TouchableOpacity>
                                <View style={styles.commentContent}>
                                    <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { targetUserId: c.user_id })}>
                                        <Text style={styles.commentUser}>{c.profiles?.username}</Text>
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
            </>
        );
    }, [capsule, showChat, tint, isLiked, likeCount, comments, userId, isOwner, modelTint]);

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <Animated.View style={[styles.flashOverlay, { opacity: flashAnim }]} pointerEvents="none" />

            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="close" size={26} color={Colors.textPrimary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.headerCreator} onPress={() => navigation.navigate('UserProfile', { targetUserId: capsule.owner_id })}>
                    <Image source={{ uri: capsule.profiles?.avatar_url || 'https://via.placeholder.com/150' }} style={styles.headerAvatar} />
                    <Text style={styles.headerUsername}>{capsule.profiles?.username}</Text>
                    {capsule.profiles?.is_verified && <VerifiedBadge size={14} style={{ marginLeft: 2 }} />}
                </TouchableOpacity>
                <TouchableOpacity style={styles.backBtn} onPress={() => setShowOptions(true)}>
                    <Ionicons name="ellipsis-horizontal" size={24} color={Colors.textPrimary} />
                </TouchableOpacity>
            </View>

            {/* Options Modal */}
            <Modal visible={showOptions} transparent animationType="fade">
                <Pressable style={styles.modalOverlay} onPress={() => setShowOptions(false)}>
                    <View style={styles.optionsContent}>
                        <View style={styles.modalBar} />
                        <Text style={styles.optionsTitle}>Capsule Options</Text>

                        <TouchableOpacity style={styles.deleteOption} onPress={() => { setShowOptions(false); setShowQRModal(true); }}>
                            <Ionicons name="qr-code-outline" size={22} color={Colors.textPrimary} />
                            <Text style={[styles.deleteOptionText, { color: Colors.textPrimary }]}>View QR Code</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.deleteOption} onPress={handleShareInstagram}>
                            <Ionicons name="logo-instagram" size={22} color="#E1306C" />
                            <Text style={[styles.deleteOptionText, { color: '#E1306C' }]}>Share to Instagram Story</Text>
                        </TouchableOpacity>

                        {isOwner && (
                            <TouchableOpacity style={styles.deleteOption} onPress={handleDeleteCapsule}>
                                <Ionicons name="trash-outline" size={22} color={Colors.eventCap} />
                                <Text style={styles.deleteOptionText}>Delete Capsule Permanently</Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity style={styles.cancelOption} onPress={() => setShowOptions(false)}>
                            <Text style={styles.cancelOptionText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>

            <Modal visible={showQRModal} transparent animationType="fade">
                <Pressable style={styles.qrRootOverlay} onPress={() => setShowQRModal(false)}>
                    <View style={styles.qrContentBox}>
                        <Text style={styles.qrTitle}>Capsule QR</Text>
                        <Image
                            source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=kapsely://capsule/${capsuleId}` }}
                            style={styles.qrImage}
                        />
                        <Text style={styles.qrSubtitle}>Scan this QR to open the capsule.</Text>
                        <TouchableOpacity style={styles.qrCloseBtn} onPress={() => setShowQRModal(false)}>
                            <Text style={styles.qrCloseBtnText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
            >
                <FlatList
                    data={isSealed ? [] : Object.keys(groupedItems)}
                    keyExtractor={(item) => item}
                    showsVerticalScrollIndicator={Platform.OS !== 'web'}
                    contentContainerStyle={[styles.scrollContent, Platform.OS === 'web' && { flexGrow: 1 }]}
                    keyboardShouldPersistTaps="handled"
                    ListHeaderComponent={renderHeader}
                    renderItem={({ item: month }) => (
                        <View style={styles.monthSection}>
                            <Text style={styles.monthTitle}>{month}</Text>
                            <View style={styles.grid}>
                                {groupedItems[month].map((item: any) => (
                                    <TouchableOpacity
                                        key={item.id}
                                        style={styles.gridItem}
                                        onPress={() => item.media_type === 'audio' ? toggleAudio(item.media_url) : openViewer(items.indexOf(item))}
                                    >
                                        {item.media_type === 'audio' ? (
                                            <View style={[styles.gridAudioCell, { backgroundColor: tint + '22' }]}>
                                                <Ionicons name={playingAudio === item.media_url ? "pause" : "musical-notes"} size={24} color={tint} />
                                            </View>
                                        ) : <Image source={{ uri: item.media_url }} style={styles.gridImage} />}
                                        {capsule.invited_user_id && item.profiles?.avatar_url && (
                                            <Image source={{ uri: item.profiles.avatar_url }} style={styles.itemAvatar} />
                                        )}
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    )}
                    ListFooterComponent={renderFooter}
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
                            onSubmitEditing={handleSendComment}
                        />
                        <TouchableOpacity onPress={handleSendComment} disabled={!comment.trim()}>
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
                        renderItem={({ item }) => (
                            <View style={styles.viewerSlide}>
                                <Image source={{ uri: item.media_url }} style={styles.viewerImage} resizeMode="contain" />
                                {item.caption && <Text style={styles.viewerCaption}>{item.caption}</Text>}
                            </View>
                        )}
                        keyExtractor={item => item.id}
                    />
                </View>
            </Modal>
        </View >
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 50, paddingHorizontal: Spacing.md, height: 100 },
    backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    headerCreator: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    headerAvatar: { width: 32, height: 32, borderRadius: 16 },
    headerUsername: { fontSize: 14, fontFamily: Fonts.bold, color: Colors.textPrimary },
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
    gridItem: { width: ITEM_SIZE, height: ITEM_SIZE, borderRadius: 4, overflow: 'hidden' },
    gridImage: { width: '100%', height: '100%', resizeMode: 'cover' },
    gridAudioCell: { width: ITEM_SIZE, height: ITEM_SIZE, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
    gridItemPlaceholder: { width: ITEM_SIZE, height: ITEM_SIZE, backgroundColor: Colors.cardAlt, alignItems: 'center', justifyContent: 'center', borderRadius: 4, overflow: 'hidden' },
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
    commentBar: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border, gap: 12 },
    commentInput: { flex: 1, height: 40, backgroundColor: Colors.background, borderRadius: 20, paddingHorizontal: 15, fontSize: 14, borderWidth: 1, borderColor: Colors.border },
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
    openingOverlayAesthetic: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 30, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    openingOverlayAestheticInner: { width: 160, height: 160, borderRadius: 80, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
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
});
