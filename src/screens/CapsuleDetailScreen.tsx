import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, Image, ScrollView, TouchableOpacity,
    TextInput, Dimensions, Animated, StatusBar, Alert, ActivityIndicator,
    Modal, FlatList, KeyboardAvoidingView, Platform, Pressable, SectionList, Keyboard
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
import { MODEL_IMAGES, MODEL_TINTS, MODEL_IMAGES_OPEN } from '../constants/models';
import LiveTimer from '../components/LiveTimer';
import CapsuleWithTimer from '../components/CapsuleWithTimer';
import LiveChat from '../components/LiveChat';
import VerifiedBadge from '../components/VerifiedBadge';
import { timerConfigManager } from '../utils/timerConfig';
import { safetyService, ReportType } from '../utils/safety';
import { useWebDragScroll } from '../utils/useWebDragScroll';


const { width, height } = Dimensions.get('window');
const GRID_COLS = 3;
const GRID_GAP = 3;
const SECTION_PAD = Spacing.md * 2;
const ITEM_SIZE = (width - SECTION_PAD - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
const ITEM_HEIGHT = (ITEM_SIZE * 4) / 3;

// ─── Waveform heights for audio grid cells ────────────────────────────────────
const WAVEFORM_BARS = [5, 10, 18, 28, 38, 44, 36, 26, 40, 32, 22, 30, 20, 13, 6];

// ─── Audio controller ─────────────────────────────────────────────────────────
const AudioController = ({ uri, onFinish }: { uri: string | null; onFinish: () => void }) => {
    const player = useAudioPlayer(uri ? { uri } : null);
    const status = useAudioPlayerStatus(player);
    useEffect(() => { if (uri && player) player.play(); else if (!uri && player) player.pause(); }, [uri, player]);
    useEffect(() => { if (status.didJustFinish) onFinish(); }, [status.didJustFinish]);
    return null;
};

// ─── Video with trim ──────────────────────────────────────────────────────────
const VideoWithTrim = ({ item, isActive, style }: { item: any; isActive: boolean; style: any }) => {
    const parts = item.content ? item.content.split('|') : [];
    const trim = parts[1] ? parts[1].split('-') : [];
    const trimStart = trim[0] ? parseInt(trim[0], 10) : 0;
    const trimEnd = trim[1] ? parseInt(trim[1], 10) : null;
    const ref = useRef<any>(null);
    const onStatus = (s: any) => {
        if (trimEnd && s.positionMillis >= trimEnd) { ref.current?.pauseAsync(); ref.current?.setPositionAsync(trimStart); }
    };
    return <Video ref={ref} source={{ uri: item.media_url }} rate={1} volume={1} isMuted={false} resizeMode={ResizeMode.CONTAIN} shouldPlay={isActive} useNativeControls style={style} positionMillis={trimStart} progressUpdateIntervalMillis={500} onPlaybackStatusUpdate={onStatus} />;
};

// ─── Main screen ──────────────────────────────────────────────────────────────
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

    const [comment, setComment] = useState('');
    const [comments, setComments] = useState<any[]>([]);
    const [likeCount, setLikeCount] = useState(0);
    const [isLiked, setIsLiked] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [invites, setInvites] = useState<any[]>([]);
    const [acceptedMembers, setAcceptedMembers] = useState<any[]>([]);

    const [viewerVisible, setViewerVisible] = useState(false);
    const [initialIndex, setInitialIndex] = useState(0);
    const [activeViewerIndex, setActiveViewerIndex] = useState(0);

    const [filterType, setFilterType] = useState('all');
    const [filterSort, setFilterSort] = useState('newest');
    const [page, setPage] = useState(1);

    const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
    const [isFollowedOwner, setIsFollowedOwner] = useState(false);
    const [showOptions, setShowOptions] = useState(false);
    const [showQRModal, setShowQRModal] = useState(false);
    const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
    const [playingAudio, setPlayingAudio] = useState<string | null>(null);

    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const insets = useSafeAreaInsets();

    const isSealed = capsule?.status === 'sealed';
    const [modelImg, setModelImg] = useState<string>(() => (MODEL_IMAGES as any).basicred_kap);

    const sectionListRef = useRef<SectionList>(null);
    useWebDragScroll(sectionListRef);

    useEffect(() => {
        if (!capsule) return;
        const update = () => {
            setModelImg(isSealed
                ? (timerConfigManager.getModelImage(capsule.model) || MODEL_IMAGES[capsule.model] || (MODEL_IMAGES as any).basicred_kap)
                : (timerConfigManager.getModelImageOpen(capsule.model) || MODEL_IMAGES_OPEN[capsule.model] || MODEL_IMAGES[capsule.model] || (MODEL_IMAGES as any).basicred_kap)
            );
        };
        const unsub = timerConfigManager.subscribe(update);
        update();
        return unsub;
    }, [capsule?.model, isSealed]);

    // ── Derived values ────────────────────────────────────────────────────────
    const activeModelTint = capsule ? ((MODEL_TINTS as any)[capsule.model] || '#a269ff') : '#a269ff';
    const tint = modelTint || activeModelTint;
    const isOwner = userId === capsule?.owner_id;
    const acceptedInvitesCount = invites?.filter(i => i.status === 'accepted').length || 0;
    const isLegacyAccepted = capsule?.invited_user_id && capsule?.invite_status === 'accepted';
    const totalMembers = 1 + acceptedInvitesCount + (isLegacyAccepted ? 1 : 0);
    const isMember = isOwner ||
        invites?.some(i => i.user_id === userId && i.status === 'accepted') ||
        (capsule?.invite_status === 'accepted' && capsule?.invited_user_id === userId);
    const hasWaiting = (invites?.filter(i => i.status === 'pending').length || 0) > 0 && isOwner;
    const hasRequestedOpen = capsule?.open_requests?.includes(userId || '') || false;
    const reqCount = capsule?.open_requests?.length || 0;
    const canBeOpened = capsule?.opens_at ? new Date(capsule.opens_at) <= new Date() : true;

    const now_val = new Date();
    const opensAt = capsule?.opens_at ? new Date(capsule.opens_at) : null;
    const chatStart = opensAt ? new Date(opensAt.getTime() - 86400000) : null;
    const chatEnd = opensAt ? new Date(opensAt.getTime() + 18000000) : null;
    const showChat = chatStart && chatEnd && now_val >= chatStart && now_val <= chatEnd;

    // ── Filtered / paginated data ─────────────────────────────────────────────
    const filteredData = useMemo(() => {
        let result = [...items];
        if (filterType !== 'all') result = result.filter(i => i.media_type === filterType);
        result.sort((a, b) => {
            const da = new Date(a.created_at).getTime(), db = new Date(b.created_at).getTime();
            return filterSort === 'newest' ? db - da : da - db;
        });
        const perPage = 9;
        const totalPages = Math.max(1, Math.ceil(result.length / perPage));
        const paged = result.slice((page - 1) * perPage, page * perPage);
        const pagedAll: any[][] = [];
        for (let i = 0; i < result.length; i += perPage) pagedAll.push(result.slice(i, i + perPage));
        return { paged, pagedAll, totalPages, total: result.length };
    }, [items, filterType, filterSort, page]);

    // Group by month for opened view
    const displayGroups = useMemo(() =>
        filteredData.paged.reduce((acc: any, item: any) => {
            const d = new Date(item.created_at);
            const key = `${d.toLocaleString('default', { month: 'long' })} ${d.getFullYear()}`;
            if (!acc[key]) acc[key] = [];
            acc[key].push(item);
            return acc;
        }, {}),
        [filteredData.paged]
    );

    // ── Data loading ──────────────────────────────────────────────────────────
    useFocusEffect(useCallback(() => { loadData(); }, [capsuleId]));

    useEffect(() => {
        if (!capsuleId) return;
        loadData();
        const capCh = supabase.channel(`capsule-${capsuleId}-detail`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'capsules', filter: `id=eq.${capsuleId}` }, payload => {
                const updated = payload.new;
                setCapsule((prev: any) => {
                    if (!prev) return { ...updated };
                    const merged = { ...prev, ...updated };
                    if (updated.is_opening && updated.opening_at && !prev.is_opening && merged.status === 'sealed') startGlobalCountdown(updated.opening_at);
                    return merged;
                });
                if (updated.status === 'opened') { setIsOpening(false); if (timerRef.current) clearInterval(timerRef.current); }
            })
            .subscribe();
        const invCh = supabase.channel(`capsule-${capsuleId}-invites`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'capsule_invites', filter: `capsule_id=eq.${capsuleId}` }, loadData)
            .subscribe();
        return () => { supabase.removeChannel(capCh); supabase.removeChannel(invCh); if (timerRef.current) clearInterval(timerRef.current); };
    }, [capsuleId]);

    const startGlobalCountdown = (openingAtStr: string) => {
        setIsOpening(true);
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
            const diff = Math.max(0, Math.ceil((new Date(openingAtStr).getTime() - Date.now()) / 1000));
            setOpeningTimer(diff);
            if (diff <= 0) { if (timerRef.current) clearInterval(timerRef.current); triggerFlash(); }
        }, 1000);
    };

    const formatTime = (dateStr: string) => {
        const diff = Date.now() - new Date(dateStr).getTime();
        const m = Math.floor(diff / 60000);
        if (m < 1) return t('common.just_now');
        if (m < 60) return t('common.m_ago', { count: m });
        const h = Math.floor(m / 60);
        if (h < 24) return t('common.h_ago', { count: h });
        return t('common.d_ago', { count: Math.floor(h / 24) });
    };

    const loadData = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        setUserId(user?.id ?? null);
        let blocked: string[] = [];
        if (user) { blocked = await safetyService.getAllSafetyUserIds(user.id); setBlockedUserIds(blocked); }

        const [capRes, itemsRes, likesRes, commentsRes, myLikeRes, invitesRes] = await Promise.all([
            supabase.from('capsules').select('*, profiles:owner_id(*)').eq('id', capsuleId).maybeSingle(),
            supabase.from('capsule_items').select('*, profiles:owner_id(avatar_url, id)').eq('capsule_id', capsuleId).order('created_at', { ascending: true }),
            supabase.from('likes').select('*', { count: 'exact', head: true }).eq('capsule_id', capsuleId),
            supabase.from('comments').select('*, profiles:user_id(*), comment_likes(user_id)').eq('capsule_id', capsuleId).order('created_at', { ascending: false }),
            user ? supabase.from('likes').select('*').eq('capsule_id', capsuleId).eq('user_id', user.id).maybeSingle() : { data: null },
            supabase.from('capsule_invites').select('*, profiles:user_id(*)').eq('capsule_id', capsuleId),
        ]);

        if (capRes.data) {
            setCapsule(capRes.data);
            const cfg = timerConfigManager.getConfig(capRes.data.model);
            setModelTint(cfg?.themeColor || MODEL_TINTS[capRes.data.model] || '#a269ff');

            const allMemberIds = [capRes.data.owner_id, ...(invitesRes.data?.filter((i: any) => i.status === 'accepted').map((i: any) => i.profiles?.id) || [])];
            let followed = new Set<string>();
            if (user) {
                const { data: fids } = await supabase.from('follows').select('following_id').eq('follower_id', user.id).in('following_id', allMemberIds);
                fids?.forEach(f => followed.add(f.following_id));
            }
            setIsFollowedOwner(followed.has(capRes.data.owner_id));
            setAcceptedMembers((invitesRes.data?.filter((i: any) => i.status === 'accepted').map((i: any) => ({ ...i.profiles, isFollowed: followed.has(i.profiles?.id) }))) || []);

            if (capRes.data.is_opening && capRes.data.status !== 'opened' && capRes.data.opening_at) {
                const target = new Date(capRes.data.opening_at).getTime();
                if (target > Date.now()) startGlobalCountdown(capRes.data.opening_at);
                else setCapsule((p: any) => ({ ...p, status: 'opened', is_opening: false }));
            }
        }
        if (itemsRes.data) setItems(itemsRes.data.filter((i: any) => !blocked.includes(i.owner_id)));
        setLikeCount(likesRes.count || 0);
        setComments((commentsRes.data || []).filter((c: any) => !blocked.includes(c.user_id)).map((c: any) => ({ ...c, myLike: user ? c.comment_likes?.some((l: any) => l.user_id === user.id) : false, likeCount: c.comment_likes?.length || 0 })));
        setIsLiked(!!myLikeRes.data);
        if (invitesRes.data) setInvites(invitesRes.data);
        setLoading(false);
    };

    // ── Actions ───────────────────────────────────────────────────────────────
    const handleFollowToggle = async (targetId: string, isFollowed: boolean, setIsFollowed: (v: boolean) => void) => {
        if (!userId || userId === targetId) return;
        if (isFollowed) {
            await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', targetId);
            setIsFollowed(false);
        } else {
            await supabase.from('follows').insert({ follower_id: userId, following_id: targetId });
            setIsFollowed(true);
            await supabase.from('notifications').insert({ user_id: targetId, sender_id: userId, type: 'follow', message: t('common.started_following_you') });
        }
    };

    const handleRequestOpen = async () => {
        if (!userId || !capsule) return;
        const { data, error } = await supabase.rpc('request_capsule_open_v4', { target_capsule_id: capsuleId, requester_user_id: userId });
        if (error) { console.error(error); return; }
        if (data) {
            setCapsule((p: any) => ({ ...p, open_requests: data.open_requests, is_opening: data.is_opening, opening_at: data.opening_at }));
            if (data.is_opening && data.opening_at) {
                startGlobalCountdown(data.opening_at);
                if (!capsule.is_opening) {
                    const members = [capsule.owner_id, ...(invites?.filter(i => i.status === 'accepted').map(i => i.user_id) || [])];
                    for (const m of members) { if (m !== userId) await supabase.from('notifications').insert({ user_id: m, sender_id: userId, type: 'capsule_opened', capsule_id: capsuleId, message: t('detail.opening_now') }); }
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
            setCapsule((p: any) => ({ ...p, status: 'opened', is_opening: false }));
            await supabase.rpc('set_capsule_opened', { target_capsule_id: capsuleId });
        });
    };

    const handleLike = async () => {
        if (!userId) return;
        if (isLiked) {
            await supabase.from('likes').delete().eq('capsule_id', capsuleId).eq('user_id', userId);
            setLikeCount(p => p - 1); setIsLiked(false);
        } else {
            await supabase.from('likes').insert({ capsule_id: capsuleId, user_id: userId });
            setLikeCount(p => p + 1); setIsLiked(true);
            if (capsule.owner_id !== userId) {
                await supabase.from('notifications').insert({ user_id: capsule.owner_id, sender_id: userId, type: 'like', capsule_id: capsuleId, message: t('detail.liked_your_capsule') });
                sendPushNotification(capsule.owner_id, "❤️ Nuevo Me Gusta!", 'A alguien le ha gustado tu cápsula.', { screen: 'CapsuleDetail', params: { capsuleId } });
            }
        }
    };

    const handleLikeComment = async (cid: string) => {
        if (!userId) return;
        const c = comments.find(x => x.id === cid);
        if (!c) return;
        if (c.myLike) {
            await supabase.from('comment_likes').delete().eq('comment_id', cid).eq('user_id', userId);
            setComments(cs => cs.map(x => x.id === cid ? { ...x, myLike: false, likeCount: x.likeCount - 1 } : x));
        } else {
            await supabase.from('comment_likes').insert({ comment_id: cid, user_id: userId });
            setComments(cs => cs.map(x => x.id === cid ? { ...x, myLike: true, likeCount: x.likeCount + 1 } : x));
        }
    };

    const handleSendComment = async () => {
        if (!comment.trim() || !userId) return;
        Keyboard.dismiss();
        const { data } = await supabase.from('comments').insert({ capsule_id: capsuleId, user_id: userId, content: comment.trim() }).select('*, profiles:user_id(*)').maybeSingle();
        if (data) {
            setComments([{ ...data, myLike: false, likeCount: 0 }, ...comments]);
            setComment('');
            setHighlightedCommentId(data.id);
            setTimeout(() => setHighlightedCommentId(null), 1200);
            if (capsule.owner_id !== userId) {
                await supabase.from('notifications').insert({ user_id: capsule.owner_id, sender_id: userId, type: 'comment', capsule_id: capsuleId, message: t('detail.commented', { text: comment.trim().substring(0, 30) }) });
                sendPushNotification(capsule.owner_id, "💬 Nuevo Comentario", 'Han comentado en tu cápsula.', { screen: 'CapsuleDetail', params: { capsuleId } });
            }
        }
    };

    const handleDeleteComment = (cid: string) => {
        Alert.alert(t('detail.delete_comment_title'), t('detail.delete_comment_confirm'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('common.delete'), style: 'destructive', onPress: async () => { const { error } = await supabase.from('comments').delete().eq('id', cid); if (!error) setComments(cs => cs.filter(c => c.id !== cid)); } }
        ]);
    };

    const handleDeleteCapsule = () => {
        const exec = async () => {
            setShowOptions(false); setLoading(true);
            try {
                const { data: toDelete } = await supabase.from('capsule_items').select('media_url, thumbnail_url').eq('capsule_id', capsuleId);
                if (toDelete?.length) {
                    const base = 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/capsule-media/';
                    const files = toDelete.flatMap(i => [i.media_url, i.thumbnail_url].filter(u => u?.startsWith(base)).map(u => u!.replace(base, '').split('?')[0]));
                    if (files.length) await supabase.storage.from('capsule-media').remove(files);
                }
                const { error } = await supabase.rpc('delete_capsule', { p_capsule_id: capsuleId });
                if (!error) navigation.goBack(); else throw error;
            } catch (err: any) { Alert.alert(t('common.error'), t('detail.delete_error')); }
            finally { setLoading(false); }
        };
        Alert.alert(t('detail.delete_capsule_title'), t('detail.delete_capsule_msg'), [
            { text: t('detail.keep_it'), style: 'cancel' },
            { text: t('common.delete'), style: 'destructive', onPress: exec }
        ]);
    };

    const handleReportCapsule = () => {
        if (!userId) return;
        Alert.alert(t('detail.report_capsule'), t('detail.report_reason'), [
            { text: t('detail.report_types.inappropriate'), onPress: () => submitReport(capsuleId, 'capsule', 'inappropriate') },
            { text: t('detail.report_types.spam'), onPress: () => submitReport(capsuleId, 'capsule', 'spam') },
            { text: t('common.cancel'), style: 'cancel' },
        ]);
    };

    const handleReportItem = (itemId: string) => {
        if (!userId) return;
        Alert.alert(t('detail.report_content'), t('detail.report_reason'), [
            { text: t('detail.report_types.inappropriate'), onPress: () => submitReport(itemId, 'capsule_item', 'inappropriate') },
            { text: t('detail.report_types.spam'), onPress: () => submitReport(itemId, 'capsule_item', 'spam') },
            { text: t('common.cancel'), style: 'cancel' },
        ]);
    };

    const submitReport = async (targetId: string, targetType: ReportType, reason: string) => {
        if (!userId) return;
        await safetyService.report({ reporterId: userId, targetId, targetType, reason });
        Alert.alert(t('common.ready'), t('detail.report_submitted'));
        setShowOptions(false);
    };

    const openViewer = (index: number) => { setInitialIndex(index); setActiveViewerIndex(index); setViewerVisible(true); };
    const toggleAudio = (url: string) => setPlayingAudio(p => p === url ? null : url);

    // ── Filter chips (shared) ─────────────────────────────────────────────────
    const FilterBar = () => {
        const filterScrollRef = useRef<ScrollView>(null);
        useWebDragScroll(filterScrollRef);

        return (
            <ScrollView ref={filterScrollRef} horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll} contentContainerStyle={s.filterContent}>
                {(['all', 'image', 'video', 'note', 'audio'] as const).map(type => {
                    const icons = { all: 'apps-outline', image: 'image-outline', video: 'videocam-outline', note: 'document-text-outline', audio: 'mic-outline' } as const;
                    const isActive = filterType === type;
                    return (
                        <TouchableOpacity
                            key={type}
                            style={[s.filterChip, isActive && { backgroundColor: tint, borderColor: tint }]}
                            onPress={() => { setFilterType(type); setPage(1); }}
                        >
                            <Ionicons name={icons[type]} size={13} color={isActive ? '#fff' : Colors.textSecondary} />
                            <Text style={[s.filterChipText, isActive && { color: '#fff' }]}>
                                {type.charAt(0).toUpperCase() + type.slice(1)}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
                <TouchableOpacity style={s.filterChip} onPress={() => { setFilterSort(p => p === 'newest' ? 'oldest' : 'newest'); setPage(1); }}>
                    <Ionicons name={filterSort === 'newest' ? 'arrow-down' : 'arrow-up'} size={13} color={Colors.textSecondary} />
                    <Text style={s.filterChipText}>{filterSort === 'newest' ? 'Newest' : 'Oldest'}</Text>
                </TouchableOpacity>
            </ScrollView>
        );
    };


    // ── Loading / not found ───────────────────────────────────────────────────
    if (loading && !capsule) return <View style={[s.root, s.centered]}><ActivityIndicator color={Colors.primary} size="large" /></View>;
    if (!capsule) return (
        <View style={[s.root, s.centered]}>
            <TouchableOpacity style={[s.iconBtn, { position: 'absolute', top: insets.top + 10, left: 15 }]} onPress={() => navigation.goBack()}>
                <Ionicons name="close" size={26} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Ionicons name="alert-circle-outline" size={44} color={Colors.textMuted} style={{ marginBottom: 12 }} />
            <Text style={s.notFoundText}>{t('detail.not_found')}</Text>
            <Text style={s.notFoundSub}>{t('detail.no_permission')}</Text>
        </View>
    );

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <View style={s.root}>
            <AudioController uri={playingAudio} onFinish={() => setPlayingAudio(null)} />
            <StatusBar barStyle="dark-content" />
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', zIndex: 999, opacity: flashAnim }]} pointerEvents="none" />

            {/* ── Header ────────────────────────────────────────────────── */}
            <View style={[s.headerWrap, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
                <BlurView intensity={72} tint="light" style={StyleSheet.absoluteFill} />
                <View style={s.headerBorderBottom} />

                {/* Botón volver */}
                <TouchableOpacity style={s.headerBackBtn} activeOpacity={0.6} onPress={() => navigation.goBack()}>
                    <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
                </TouchableOpacity>

                {/* Centro — avatar + nombre + subtítulo + follow pill */}
                <TouchableOpacity
                    style={s.headerCenter}
                    activeOpacity={0.75}
                    onPress={() => navigation.navigate('UserProfile', { targetUserId: capsule.owner_id })}
                >
                    <Image
                        source={{ uri: capsule.profiles?.avatar_url || 'https://via.placeholder.com/150' }}
                        style={s.headerAvatar}
                    />
                    <View style={{ flexShrink: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={s.headerName} numberOfLines={1}>
                                {capsule.profiles?.display_name || capsule.profiles?.username}
                            </Text>
                            {capsule.profiles?.is_verified && <VerifiedBadge size={10} />}
                        </View>
                        <Text style={s.headerSub} numberOfLines={1}>{capsule.title}</Text>
                    </View>
                    {userId !== capsule.owner_id && (
                        <Pressable
                            onPress={(e) => {
                                e.stopPropagation?.();
                                handleFollowToggle(capsule.owner_id, isFollowedOwner, setIsFollowedOwner);
                            }}
                            style={[s.headerFollowPill, isFollowedOwner && s.headerFollowPillActive]}
                        >
                            <Text style={[s.headerFollowPillText, isFollowedOwner && s.headerFollowPillTextActive]}>
                                {isFollowedOwner ? t('common.following') : t('common.follow')}
                            </Text>
                        </Pressable>
                    )}
                </TouchableOpacity>

                {/* Opciones */}
                <TouchableOpacity style={s.headerOptionsBtn} activeOpacity={0.6} onPress={() => setShowOptions(true)}>
                    <Ionicons name="ellipsis-horizontal" size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
            </View>

            {/* ── Main scroll ───────────────────────────────────────────── */}
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
                <SectionList
                    ref={sectionListRef}
                    sections={[
                        { title: 'hero', data: ['hero'] },
                        { title: 'content', data: ['content'] },
                        { title: 'chat', data: showChat ? ['chat'] : [] },
                        { title: 'social', data: ['social'] },
                    ]}
                    keyExtractor={(item, i) => item + i}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={[s.scrollContent, { paddingTop: 80 + insets.top }]}
                    keyboardShouldPersistTaps="handled"
                    stickySectionHeadersEnabled={false}
                    renderSectionHeader={() => null}
                    renderItem={({ item }) => {

                        // ── HERO SECTION ─────────────────────────────────
                        if (item === 'hero') return (
                            <View style={s.heroSection}>

                                {/* ── Fondo blanco limpio — igual que el resto de la página ── */}
                                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                                    <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: Colors.background }} />
                                </View>

                                {/* ── Cápsula flotante sobre fondo etéreo ── */}
                                <View style={{ alignItems: 'center', width: '100%' }}>
                                    {/* Cápsula */}
                                    <TouchableOpacity
                                        activeOpacity={0.9}
                                        style={{ zIndex: 2 }}
                                        onPress={() => { if (isMember && isSealed && !isOpening) navigation.navigate('CreateSelection', { capsuleId: capsule.id }); }}
                                        disabled={!isMember || !isSealed || isOpening}
                                    >
                                        <CapsuleWithTimer
                                            modelKey={capsule.model}
                                            source={{ uri: modelImg }}
                                            date={capsule.opens_at}
                                            chainId={capsule.chain_id}
                                            capsuleType={capsule.type}
                                            style={s.heroModel}
                                            isOpened={!isSealed}
                                        />
                                        {isMember && isSealed && !isOpening && (
                                            <View style={[s.addHint, { backgroundColor: tint }]}>
                                                <Ionicons name="add" size={18} color="#fff" />
                                            </View>
                                        )}
                                        {isOpening && (
                                            <View style={s.openingOverlay}>
                                                <LinearGradient colors={[tint + 'BB', tint + '55']} style={StyleSheet.absoluteFill} />
                                                <Text style={s.openingLabel}>UNSEALING</Text>
                                                <Text style={s.openingTimer}>{openingTimer}</Text>
                                            </View>
                                        )}
                                    </TouchableOpacity>

                                    {/* Sombra suave debajo — proyección etérea */}
                                    <View style={{
                                        width: 120, height: 10, borderRadius: 60,
                                        backgroundColor: tint + '20',
                                        marginTop: -6,
                                        ...Platform.select({
                                            ios: { shadowColor: tint, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
                                        }),
                                    }} />
                                </View>

                                {/* Title & meta */}
                                <View style={s.heroMeta}>
                                    {/* Type badge — minimalista, dot + texto uppercase */}
                                    <View style={s.typeBadgeRow}>
                                        <View style={[s.typeDot, { backgroundColor: tint }]} />
                                        <Text style={[s.typeBadgeLabel, { color: Colors.textMuted }]}>
                                            {capsule.type === 'instacap' ? 'INSTACAP' : capsule.type === 'eventcap' ? 'EVENTCAP' : 'LEGACYCAP'}
                                        </Text>
                                        <View style={[s.typeDot, { backgroundColor: Colors.border }]} />
                                        <Text style={s.typeBadgeLabel}>
                                            {isSealed ? 'SEALED' : 'OPEN'}
                                        </Text>
                                    </View>

                                    <Text style={s.heroTitle}>{capsule.title}</Text>
                                    {capsule.description ? <Text style={s.heroDesc}>{capsule.description}</Text> : null}

                                    {/* Stat chips */}
                                    <View style={s.statRow}>
                                        <View style={s.statChip}>
                                            <Ionicons name="images-outline" size={14} color={Colors.textMuted} />
                                            <Text style={s.statChipText}>{items.length} items</Text>
                                        </View>
                                        <View style={s.statChip}>
                                            <Ionicons name="people-outline" size={14} color={Colors.textMuted} />
                                            <Text style={s.statChipText}>{totalMembers} {totalMembers === 1 ? 'member' : 'members'}</Text>
                                        </View>
                                        <View style={[s.statChip, { backgroundColor: isSealed ? Colors.cardAlt : tint + '15' }]}>
                                            <Ionicons name={isSealed ? 'lock-closed-outline' : 'lock-open-outline'} size={14} color={isSealed ? Colors.textMuted : tint} />
                                            <Text style={[s.statChipText, !isSealed && { color: tint }]}>{isSealed ? 'Sealed' : 'Opened'}</Text>
                                        </View>
                                    </View>
                                </View>

                                {/* Members strip (shared capsules) */}
                                {capsule.is_shared && (
                                    <View style={[s.membersStrip, { borderColor: tint + '22', backgroundColor: tint + '08' }]}>
                                        <View style={s.membersAvatars}>
                                            <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { targetUserId: capsule.owner_id })}>
                                                <Image source={{ uri: capsule.profiles?.avatar_url }} style={s.memberAvatar} />
                                            </TouchableOpacity>
                                            {acceptedMembers.map((m: any, i: number) => (
                                                <TouchableOpacity key={i} style={{ marginLeft: -8 }}
                                                    onPress={() => handleFollowToggle(m.id, m.isFollowed, v => setAcceptedMembers(p => p.map(x => x.id === m.id ? { ...x, isFollowed: v } : x)))}
                                                    onLongPress={() => navigation.navigate('UserProfile', { targetUserId: m.id })}
                                                >
                                                    <Image source={{ uri: m.avatar_url }} style={[s.memberAvatar, m.isFollowed && { borderColor: Colors.primary }]} />
                                                </TouchableOpacity>
                                            ))}
                                            {hasWaiting && (
                                                <View style={[s.memberAvatar, { marginLeft: -8, backgroundColor: Colors.cardAlt, alignItems: 'center', justifyContent: 'center' }]}>
                                                    <Ionicons name="ellipsis-horizontal" size={10} color={Colors.textMuted} />
                                                </View>
                                            )}
                                        </View>
                                        <Text style={s.membersText}>{t('common.members_count', { count: totalMembers })}</Text>
                                    </View>
                                )}

                                {/* EventCap info */}
                                {capsule?.type === 'eventcap' && (
                                    <View style={[s.eventBox, { borderColor: tint + '44', backgroundColor: tint + '0C' }]}>
                                        <Ionicons name="earth" size={20} color={tint} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={[s.eventTitle, { color: tint }]}>Pioneers Event</Text>
                                            <Text style={s.eventDesc}>All capsules open simultaneously worldwide when the event ends.</Text>
                                        </View>
                                    </View>
                                )}

                                {/* CTA: open / countdown */}
                                {!isOpening && isSealed && (
                                    <View style={s.ctaSection}>
                                        {canBeOpened ? (
                                            <View style={{ alignItems: 'center', width: '100%' }}>
                                                <TouchableOpacity
                                                    style={[s.openBtn, { shadowColor: tint }]}
                                                    activeOpacity={0.85}
                                                    onPress={handleRequestOpen}
                                                    disabled={hasRequestedOpen}
                                                >
                                                    <LinearGradient colors={[tint, tint + 'CC']} style={s.openBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                                                        <Ionicons name="sparkles" size={15} color="#fff" />
                                                        <Text style={s.openBtnText}>
                                                            {hasRequestedOpen ? t('detail.awaiting_others', { current: reqCount, total: totalMembers }) : t('detail.unseal_capsule')}
                                                        </Text>
                                                    </LinearGradient>
                                                </TouchableOpacity>
                                                {reqCount < totalMembers && <Text style={s.approvalHint}>{t('detail.approval_needed', { current: reqCount, total: totalMembers })}</Text>}
                                            </View>
                                        ) : (
                                            /* ── Countdown — minimalista, sin borde, solo texto + icono ── */
                                            <View style={s.countdownRow}>
                                                <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
                                                <LiveTimer date={capsule.opens_at} style={s.countdownText} />
                                            </View>
                                        )}
                                        {/* Add content */}
                                        {isMember && (
                                            <TouchableOpacity
                                                style={s.addContentBtn}
                                                activeOpacity={0.75}
                                                onPress={() => navigation.navigate('CreateSelection', { capsuleId: capsule.id })}
                                            >
                                                <LinearGradient
                                                    colors={[tint + 'FF', tint + 'DD']}
                                                    style={s.addContentGrad}
                                                    start={{ x: 0, y: 0 }}
                                                    end={{ x: 1, y: 1 }}
                                                >
                                                    <Ionicons name="add" size={15} color="#fff" />
                                                    <Text style={s.addContentText}>{t('create.add_content')}</Text>
                                                </LinearGradient>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                )}
                            </View>
                        );

                        // ── CONTENT SECTION ───────────────────────────────
                        if (item === 'content') return (
                            <View style={s.contentSection}>
                                <FilterBar />

                                {/* Sealed vault preview */}
                                {isSealed && filteredData.total > 0 && (
                                    <>
                                        <FlatList
                                            horizontal pagingEnabled showsHorizontalScrollIndicator={false}
                                            data={filteredData.pagedAll}
                                            keyExtractor={(_, i) => i.toString()}
                                            renderItem={({ item: pageItems }) => (
                                                <View style={{ width: width - SECTION_PAD }}>
                                                    <View style={s.grid}>
                                                        {pageItems.map((pi: any) => (
                                                            <View key={pi.id} style={s.gridCell}>
                                                                <View style={s.gridCellInner}>
                                                                    {/* Blurred preview */}
                                                                    {(pi.media_url || pi.thumbnail_url) && (
                                                                        <Image source={{ uri: pi.thumbnail_url || pi.media_url }} style={StyleSheet.absoluteFill} blurRadius={28} />
                                                                    )}
                                                                    <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
                                                                    {/* Type icon */}
                                                                    <View style={s.cellTypeIcon}>
                                                                        <Ionicons name={pi.media_type === 'video' ? 'videocam' : pi.media_type === 'note' ? 'document-text' : pi.media_type === 'audio' ? 'mic' : 'image'} size={13} color={tint} />
                                                                    </View>
                                                                    <Ionicons name="lock-closed-outline" size={20} color="rgba(0,0,0,0.4)" />
                                                                </View>
                                                                {pi.caption && pi.caption.replace(/!!b:\w+/, '').trim() ? (
                                                                    <Text style={s.cellCaption} numberOfLines={2}>{pi.caption.replace(/!!b:\w+/, '').trim()}</Text>
                                                                ) : null}
                                                            </View>
                                                        ))}
                                                    </View>
                                                </View>
                                            )}
                                        />
                                    </>
                                )}

                                {/* Empty sealed state */}
                                {isSealed && filteredData.total === 0 && (
                                    <View style={s.emptyState}>
                                        <View style={s.grid}>
                                            {[...Array(6)].map((_, i) => (
                                                <View key={i} style={[s.gridCellInner, { borderWidth: 1.5, borderColor: tint + '28', borderStyle: 'dashed', backgroundColor: tint + '06' }]}>
                                                    <Ionicons name="add" size={20} color={tint + '50'} />
                                                </View>
                                            ))}
                                        </View>
                                        <Text style={s.emptyText}>Your memories will live here</Text>
                                    </View>
                                )}

                                {/* Opened: grouped by month */}
                                {!isSealed && filteredData.total === 0 && (
                                    <View style={s.emptyState}>
                                        <Ionicons name="images-outline" size={36} color={Colors.textMuted} style={{ marginBottom: 8 }} />
                                        <Text style={s.emptyText}>No items yet</Text>
                                    </View>
                                )}

                                {!isSealed && filteredData.total > 0 && Object.keys(displayGroups).map(month => (
                                    <View key={month} style={s.monthGroup}>
                                        <Text style={s.monthLabel}>{month}</Text>
                                        <View style={s.grid}>
                                            {displayGroups[month].map((entry: any) => {
                                                const isBatch = Array.isArray(entry);
                                                const pi = isBatch ? entry[0] : entry;
                                                return (
                                                    <View key={pi.id} style={s.gridCell}>
                                                        <TouchableOpacity
                                                            style={s.gridCellInner}
                                                            activeOpacity={0.8}
                                                            onPress={() => pi.media_type === 'audio' ? toggleAudio(pi.media_url) : openViewer(items.indexOf(pi))}
                                                            onLongPress={() => handleReportItem(pi.id)}
                                                        >
                                                            {/* ── AUDIO GRID CELL (mejorado) ── */}
                                                            {pi.media_type === 'audio' ? (
                                                                <View style={[StyleSheet.absoluteFill, { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }]}>
                                                                    {/* Fondo con gradiente del tint */}
                                                                    <LinearGradient
                                                                        colors={[tint + 'FF', tint + 'BB']}
                                                                        style={StyleSheet.absoluteFill}
                                                                        start={{ x: 0, y: 0 }}
                                                                        end={{ x: 1, y: 1 }}
                                                                    />
                                                                    {/* Círculo decorativo de fondo */}
                                                                    <View style={{
                                                                        position: 'absolute',
                                                                        width: ITEM_SIZE * 1.5,
                                                                        height: ITEM_SIZE * 1.5,
                                                                        borderRadius: ITEM_SIZE * 0.75,
                                                                        backgroundColor: 'rgba(255,255,255,0.07)',
                                                                        top: -ITEM_SIZE * 0.3,
                                                                        left: -ITEM_SIZE * 0.25,
                                                                    }} />
                                                                    {/* Onda de audio estilo sinusoide moderno */}
                                                                    <View style={{
                                                                        flexDirection: 'row',
                                                                        alignItems: 'center',
                                                                        gap: 2.5,
                                                                        paddingHorizontal: 10,
                                                                        zIndex: 2,
                                                                    }}>
                                                                        {WAVEFORM_BARS.map((h, i) => (
                                                                            <View key={i} style={{
                                                                                width: 2.5,
                                                                                height: playingAudio === pi.media_url ? h : Math.max(h * 0.28, 3),
                                                                                borderRadius: 2,
                                                                                backgroundColor: 'rgba(255,255,255,0.92)',
                                                                            }} />
                                                                        ))}
                                                                    </View>
                                                                    {/* Blur oscuro encima (fallback en Android para rendimiento) */}
                                                                    {Platform.OS === 'ios' ? (
                                                                        <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
                                                                    ) : (
                                                                        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
                                                                    )}
                                                                    {/* Icono de micrófono centrado, encima del blur */}
                                                                    <View style={{
                                                                        position: 'absolute',
                                                                        width: 30, height: 30, borderRadius: 15,
                                                                        backgroundColor: 'rgba(255,255,255,0.18)',
                                                                        alignItems: 'center', justifyContent: 'center',
                                                                        borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
                                                                        zIndex: 3,
                                                                    }}>
                                                                        <Ionicons
                                                                            name={playingAudio === pi.media_url ? 'pause' : 'mic'}
                                                                            size={13}
                                                                            color="#fff"
                                                                        />
                                                                    </View>
                                                                </View>

                                                                /* ── NOTE GRID CELL (mejorado) ── */
                                                            ) : pi.media_type === 'note' ? (
                                                                <View style={[StyleSheet.absoluteFill, {
                                                                    backgroundColor: '#f8f7f4',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    overflow: 'hidden',
                                                                }]}>
                                                                    {/* Hoja blanca con sombra — capa base */}
                                                                    <View style={{
                                                                        position: 'absolute',
                                                                        top: 7, left: 7, right: 7, bottom: 7,
                                                                        backgroundColor: '#ffffff',
                                                                        borderRadius: 7,
                                                                    }} />
                                                                    {/* Líneas de cuaderno — debajo del blur */}
                                                                    {[0.3, 0.46, 0.62, 0.78].map((pos, idx) => (
                                                                        <View key={idx} style={{
                                                                            position: 'absolute',
                                                                            left: 16, right: 16,
                                                                            top: `${pos * 100}%` as any,
                                                                            height: 0.8,
                                                                            backgroundColor: '#ddd8cf',
                                                                        }} />
                                                                    ))}
                                                                    {/* TEXTO FANTASMA — debajo del blur para que se vea difuminado */}
                                                                    <Text
                                                                        style={{
                                                                            position: 'absolute',
                                                                            fontSize: 22,
                                                                            fontFamily: Fonts.bold,
                                                                            color: '#111111',
                                                                            textAlign: 'center',
                                                                            paddingHorizontal: 12,
                                                                            lineHeight: 28,
                                                                            letterSpacing: -0.3,
                                                                        }}
                                                                        numberOfLines={4}
                                                                    >
                                                                        {pi.content}
                                                                    </Text>
                                                                    {/* BlurView ENCIMA del texto — lo desenfoca */}
                                                                    {Platform.OS === 'ios' ? (
                                                                        <BlurView intensity={16} tint="light" style={StyleSheet.absoluteFill} />
                                                                    ) : (
                                                                        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.7)' }]} />
                                                                    )}
                                                                    {/* Icono encima del blur */}
                                                                    <View style={{
                                                                        position: 'absolute',
                                                                        bottom: 8, right: 9,
                                                                        zIndex: 2,
                                                                    }}>
                                                                        <Ionicons name="document-text-outline" size={12} color={tint} style={{ opacity: 0.7 }} />
                                                                    </View>
                                                                </View>

                                                            ) : (
                                                                <Image source={{ uri: pi.thumbnail_url || pi.media_url || 'https://via.placeholder.com/150' }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                                                            )}

                                                            {/* Overlays comunes */}
                                                            {pi.media_type === 'video' && <View style={s.playOverlay}><Ionicons name="play" size={15} color="#fff" /></View>}
                                                            {isBatch && <View style={s.batchBadge}><Ionicons name="copy" size={10} color="#fff" /><Text style={s.batchCount}>{entry.length}</Text></View>}
                                                            {pi.profiles?.avatar_url && <Image source={{ uri: pi.profiles.avatar_url }} style={s.itemAvatar} />}
                                                        </TouchableOpacity>
                                                        {pi.caption && pi.caption.replace(/!!b:\w+/, '').trim() ? (
                                                            <Text style={s.cellCaption} numberOfLines={2}>{pi.caption.replace(/!!b:\w+/, '').trim()}</Text>
                                                        ) : null}
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    </View>
                                ))}

                                {/* Pagination */}
                                {filteredData.totalPages > 1 && (
                                    <View style={s.pagination}>
                                        <TouchableOpacity style={[s.pageBtn, page === 1 && { opacity: 0.3 }]} onPress={() => setPage(p => p - 1)} disabled={page === 1}>
                                            <Ionicons name="chevron-back" size={18} color={tint} />
                                        </TouchableOpacity>
                                        <Text style={s.pageLabel}>{page} / {filteredData.totalPages}</Text>
                                        <TouchableOpacity style={[s.pageBtn, page === filteredData.totalPages && { opacity: 0.3 }]} onPress={() => setPage(p => p + 1)} disabled={page === filteredData.totalPages}>
                                            <Ionicons name="chevron-forward" size={18} color={tint} />
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        );

                        // ── LIVE CHAT ─────────────────────────────────────
                        if (item === 'chat' && showChat) return <LiveChat capsuleId={capsuleId} tint={tint} />;

                        // ── SOCIAL SECTION ────────────────────────────────
                        if (item === 'social') return (
                            <View style={s.socialSection}>
                                {/* Like + comment counts */}
                                <View style={s.actionRow}>
                                    <TouchableOpacity style={s.actionBtn} activeOpacity={0.7} onPress={handleLike}>
                                        <Animated.View>
                                            <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={24} color={isLiked ? '#F43F5E' : Colors.textPrimary} />
                                        </Animated.View>
                                        <Text style={[s.actionCount, isLiked && { color: '#F43F5E' }]}>{likeCount}</Text>
                                    </TouchableOpacity>
                                    <View style={s.actionBtn}>
                                        <Ionicons name="chatbubble-outline" size={22} color={Colors.textPrimary} />
                                        <Text style={s.actionCount}>{comments.length}</Text>
                                    </View>
                                </View>

                                {/* Comments */}
                                <View style={s.commentList}>
                                    {comments.map(c => (
                                        <View
                                            key={c.id}
                                            style={[
                                                s.commentCard,
                                                highlightedCommentId === c.id && { borderLeftWidth: 3, borderLeftColor: tint },
                                            ]}
                                        >
                                            <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { targetUserId: c.user_id })}>
                                                <Image source={{ uri: c.profiles?.avatar_url || 'https://via.placeholder.com/150' }} style={s.commentAvatar} />
                                            </TouchableOpacity>
                                            <View style={s.commentBody}>
                                                <View style={s.commentHeader}>
                                                    <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} onPress={() => navigation.navigate('UserProfile', { targetUserId: c.user_id })}>
                                                        <Text style={s.commentName}>{c.profiles?.display_name || c.profiles?.username}</Text>
                                                        {c.profiles?.is_verified && <VerifiedBadge size={10} />}
                                                    </TouchableOpacity>
                                                    <Text style={s.commentTime}>{formatTime(c.created_at)}</Text>
                                                </View>
                                                <Text style={s.commentText}>{c.content}</Text>
                                            </View>
                                            <View style={s.commentRight}>
                                                <TouchableOpacity onPress={() => handleLikeComment(c.id)} style={s.commentLikeBtn}>
                                                    <Ionicons name={c.myLike ? 'heart' : 'heart-outline'} size={14} color={c.myLike ? '#F43F5E' : Colors.textMuted} />
                                                    {c.likeCount > 0 && <Text style={[s.commentLikeCount, c.myLike && { color: '#F43F5E' }]}>{c.likeCount}</Text>}
                                                </TouchableOpacity>
                                                {(c.user_id === userId || isOwner) && (
                                                    <TouchableOpacity onPress={() => handleDeleteComment(c.id)} style={{ padding: 4 }}>
                                                        <Ionicons name="trash-outline" size={13} color={Colors.textMuted} />
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
                />

                {/* ── Comment input bar ──────────────────────────────────── */}
                <View style={[s.commentBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                    {showChat ? (
                        <Text style={s.chatBanner}>Live chat active above ↑</Text>
                    ) : (<>
                        <TextInput
                            style={s.commentInput}
                            placeholder={t('detail.add_comment_placeholder') || 'Add a comment...'}
                            placeholderTextColor={Colors.textMuted}
                            value={comment}
                            onChangeText={setComment}
                            multiline
                            selectionColor={tint}
                        />
                        <TouchableOpacity onPress={handleSendComment} disabled={!comment.trim()} style={{ marginBottom: 2 }}>
                            <Text style={[s.postBtn, { color: tint }, !comment.trim() && { opacity: 0.4 }]}>Post</Text>
                        </TouchableOpacity>
                    </>)}
                </View>
            </KeyboardAvoidingView>

            {/* ── Options modal ──────────────────────────────────────────── */}
            <Modal visible={showOptions} transparent animationType="fade">
                <Pressable style={s.overlay} onPress={() => setShowOptions(false)}>
                    <View style={s.sheet}>
                        <View style={s.sheetHandle} />
                        <Text style={s.sheetTitle}>{t('detail.options')}</Text>

                        {[
                            { icon: 'qr-code-outline', color: Colors.textPrimary, label: t('detail.view_qr'), onPress: () => { setShowOptions(false); setShowQRModal(true); } },
                            { icon: 'logo-instagram', color: '#E1306C', label: t('detail.share_instagram'), onPress: () => { setShowOptions(false); navigation.navigate('InstagramShare', { capsule }); } },
                            ...(!isOwner ? [{ icon: 'alert-circle-outline', color: Colors.textPrimary, label: t('detail.report_capsule'), onPress: handleReportCapsule }] : []),
                            ...(isOwner ? [{ icon: 'trash-outline', color: Colors.error, label: t('detail.delete_perm'), onPress: handleDeleteCapsule }] : []),
                        ].map((opt, i) => (
                            <TouchableOpacity key={i} style={s.sheetItem} onPress={opt.onPress} activeOpacity={0.7}>
                                <View style={[s.sheetItemIcon, { backgroundColor: (opt.color as string) + '12' }]}>
                                    <Ionicons name={opt.icon as any} size={18} color={opt.color as string} />
                                </View>
                                <Text style={[s.sheetItemText, { color: opt.color as string }]}>{opt.label}</Text>
                                <Ionicons name="chevron-forward" size={15} color={Colors.textMuted} />
                            </TouchableOpacity>
                        ))}

                        <TouchableOpacity style={s.cancelBtn} onPress={() => setShowOptions(false)}>
                            <Text style={s.cancelBtnText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>

            {/* ── QR modal ───────────────────────────────────────────────── */}
            <Modal visible={showQRModal} transparent animationType="fade">
                <Pressable style={s.overlay} onPress={() => setShowQRModal(false)}>
                    <View style={s.qrBox}>
                        <Text style={s.qrTitle}>{t('detail.capsule_qr')}</Text>
                        <Image source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=kapsely://capsule/${capsuleId}` }} style={s.qrImg} />
                        <Text style={s.qrSub}>{t('detail.scan_qr_hint')}</Text>
                        <TouchableOpacity style={[s.qrBtn, { backgroundColor: tint }]} onPress={() => setShowQRModal(false)}>
                            <Text style={s.qrBtnText}>{t('common.done')}</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>

            {/* ── Media viewer ───────────────────────────────────────────── */}
            <Modal visible={viewerVisible} transparent animationType="fade">
                <View style={s.viewer}>
                    <TouchableOpacity style={s.viewerClose} onPress={() => setViewerVisible(false)}>
                        <Ionicons name="close" size={28} color="#fff" />
                    </TouchableOpacity>
                    <FlatList
                        data={items}
                        horizontal pagingEnabled
                        initialScrollIndex={initialIndex}
                        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
                        onMomentumScrollEnd={e => setActiveViewerIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
                        keyExtractor={i => i.id}
                        renderItem={({ item: vi, index }) => (
                            <View style={s.viewerSlide}>
                                {vi.media_type === 'note' ? (
                                    <View style={s.viewerNote}>
                                        <Text style={s.viewerNoteText}>{vi.content}</Text>
                                    </View>
                                ) : vi.media_type === 'audio' ? (
                                    <View style={[s.viewerNote, { backgroundColor: tint }]}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 24 }}>
                                            {[10, 20, 30, 45, 60, 40, 25, 15, 30, 50].map((h, i) => (
                                                <View key={i} style={{ width: 5, height: playingAudio === vi.media_url ? h : h * 0.4, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 3 }} />
                                            ))}
                                        </View>
                                        <TouchableOpacity style={s.audioPlayBtn} onPress={() => toggleAudio(vi.media_url)}>
                                            <Ionicons name={playingAudio === vi.media_url ? 'pause' : 'play'} size={36} color="#fff" style={{ marginLeft: playingAudio === vi.media_url ? 0 : 3 }} />
                                        </TouchableOpacity>
                                    </View>
                                ) : vi.media_type === 'video' ? (
                                    <VideoWithTrim item={vi} isActive={activeViewerIndex === index && viewerVisible} style={s.viewerMedia} />
                                ) : (
                                    <Image source={{ uri: vi.media_url }} style={s.viewerMedia} resizeMode="contain" />
                                )}
                                {vi.caption && (
                                    <View style={s.viewerCaption}>
                                        <Text style={s.viewerCaptionText}>{vi.caption.replace(/\s!!b:\w+/, '').trim()}</Text>
                                    </View>
                                )}
                            </View>
                        )}
                    />
                </View>
            </Modal>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    notFoundText: { fontSize: 16, fontFamily: Fonts.semiBold, color: Colors.textMuted, marginBottom: 4 },
    notFoundSub: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 40 },

    // Header — flotante, blur, minimalista
    headerWrap: {
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100,
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 12, paddingBottom: 12,
        overflow: 'hidden',
    },
    headerBorderBottom: {
        position: 'absolute', bottom: 0, left: 16, right: 16,
        height: 0, // eliminado — sin línea
        backgroundColor: 'transparent',
    },
    headerBackBtn: {
        width: 36, height: 36, borderRadius: 18,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.05)',
        marginRight: 8,
    },
    headerCenter: {
        flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9,
    },
    headerAvatar: {
        width: 32, height: 32, borderRadius: 16,
        borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.08)',
    },
    headerName: {
        fontSize: 13, fontFamily: Fonts.bold,
        color: Colors.textPrimary, letterSpacing: -0.2,
    },
    headerSub: {
        fontSize: 11, fontFamily: Fonts.regular,
        color: Colors.textMuted, marginTop: 1,
        letterSpacing: 0,
    },
    headerFollowPill: {
        marginLeft: 4,
        paddingHorizontal: 11, paddingVertical: 4,
        borderRadius: 20,
        backgroundColor: Colors.textPrimary,
    },
    headerFollowPillActive: {
        backgroundColor: 'transparent',
        borderWidth: 1, borderColor: Colors.border,
    },
    headerFollowPillText: {
        fontSize: 11, fontFamily: Fonts.bold,
        color: Colors.surface, letterSpacing: 0.1,
    },
    headerFollowPillTextActive: {
        color: Colors.textMuted,
    },
    headerOptionsBtn: {
        width: 36, height: 36, borderRadius: 18,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.05)',
        marginLeft: 6,
    },
    iconBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21 },
    headerFollowBtn: { fontSize: 11, fontFamily: Fonts.bold, color: Colors.primary, marginTop: 2 },

    scrollContent: { paddingBottom: 80 },

    // Hero
    heroSection: { alignItems: 'center', paddingTop: 36, paddingBottom: 32, paddingHorizontal: 20, overflow: 'hidden' },
    heroVisual: { width: 280, height: 280, alignItems: 'center', justifyContent: 'center', marginBottom: 6, position: 'relative' },
    heroGlow: { position: 'absolute', width: 220, height: 220, borderRadius: 110 },
    heroModel: { width: 210, height: 210 },
    addHint: {
        position: 'absolute', bottom: 20, left: -28,
        width: 34, height: 34, borderRadius: 17,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 2, borderColor: '#fff',
        ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } }, android: { elevation: 4 } }),
    },
    openingOverlay: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 26, overflow: 'hidden',
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    openingLabel: { fontSize: 11, fontFamily: Fonts.bold, color: '#fff', letterSpacing: 2.5, marginBottom: 6 },
    openingTimer: { fontSize: 52, fontFamily: Fonts.bold, color: '#fff', lineHeight: 56 },

    heroMeta: { alignItems: 'center', width: '100%', gap: 8 },
    typeBadgeRow: {
        flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2,
    },
    typeDot: {
        width: 5, height: 5, borderRadius: 2.5,
    },
    typeBadgeLabel: {
        fontSize: 10, fontFamily: Fonts.bold,
        color: Colors.textMuted, letterSpacing: 1.4,
    },
    typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
    typeBadgeText: { fontSize: 12, fontFamily: Fonts.bold },
    heroTitle: { fontSize: 26, fontFamily: Fonts.bold, color: Colors.textPrimary, textAlign: 'center', letterSpacing: -0.4, marginTop: 2 },
    heroDesc: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textSecondary, textAlign: 'center', lineHeight: 21, maxWidth: '88%' },

    statRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
    statChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: Colors.cardAlt, borderWidth: 1, borderColor: Colors.border },
    statChipText: { fontSize: 11, fontFamily: Fonts.semiBold, color: Colors.textSecondary },

    membersStrip: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 30, borderWidth: 1, alignSelf: 'center' },
    membersAvatars: { flexDirection: 'row', alignItems: 'center' },
    memberAvatar: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: Colors.surface },
    membersText: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textPrimary },

    eventBox: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, padding: 14, borderRadius: 18, borderWidth: 1, width: '100%' },
    eventTitle: { fontSize: 13, fontFamily: Fonts.bold, marginBottom: 2 },
    eventDesc: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.textSecondary, lineHeight: 17 },

    ctaSection: { width: '100%', alignItems: 'center', marginTop: 20, gap: 12 },
    openBtn: {
        width: '85%',
        ...Platform.select({ ios: { shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } }, android: { elevation: 8 } }),
    },
    openBtnGrad: { paddingVertical: 15, borderRadius: 20, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
    openBtnText: { color: '#fff', fontSize: 16, fontFamily: Fonts.bold },
    approvalHint: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.textMuted },
    countdownRow: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
    },
    countdownText: {
        fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.textMuted, letterSpacing: 0.2,
    },
    addContentBtn: {
        borderRadius: 22, overflow: 'hidden',
        ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.10, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }, android: { elevation: 3 } }),
    },
    addContentGrad: {
        flexDirection: 'row', alignItems: 'center', gap: 7,
        paddingHorizontal: 20, paddingVertical: 11,
        borderRadius: 22,
    },
    addContentText: { fontSize: 13, fontFamily: Fonts.bold, color: '#fff' },

    // Content section
    contentSection: { paddingHorizontal: Spacing.md, paddingTop: 8, paddingBottom: 20 },
    filterScroll: { marginBottom: 14 },
    filterContent: { paddingRight: 20, gap: 8 },
    filterChip: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: Colors.surface, paddingHorizontal: 12, paddingVertical: 8,
        borderRadius: 20, borderWidth: 1, borderColor: Colors.border,
    },
    filterChipText: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textSecondary },

    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
    gridCell: { width: ITEM_SIZE, marginBottom: 10 },
    gridCellInner: {
        width: ITEM_SIZE, height: ITEM_HEIGHT, borderRadius: 10,
        overflow: 'hidden', backgroundColor: Colors.cardAlt,
        alignItems: 'center', justifyContent: 'center',
    },
    cellTypeIcon: {
        position: 'absolute', top: 6, right: 6,
        width: 24, height: 24, borderRadius: 12,
        backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
        ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } }, android: { elevation: 1 } }),
    },
    cellCaption: { fontSize: 11, color: Colors.textSecondary, marginTop: 5, paddingHorizontal: 2, lineHeight: 15 },
    playOverlay: {
        position: 'absolute', top: 5, right: 5,
        width: 24, height: 24, borderRadius: 12,
        backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
    },
    batchBadge: { position: 'absolute', top: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 8 },
    batchCount: { color: '#fff', fontSize: 10, fontFamily: Fonts.bold },
    itemAvatar: { position: 'absolute', bottom: 4, right: 4, width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: '#fff' },

    emptyState: { alignItems: 'center', paddingVertical: 20, gap: 12 },
    emptyText: { fontSize: 13, fontFamily: Fonts.medium, color: Colors.textMuted, textAlign: 'center' },

    monthGroup: { marginBottom: 24 },
    monthLabel: { fontSize: 13, fontFamily: Fonts.bold, color: Colors.textMuted, marginBottom: 10, letterSpacing: 0.3 },

    pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 20 },
    pageBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
    pageLabel: { fontSize: 13, fontFamily: Fonts.bold, color: Colors.textPrimary },

    // Social
    socialSection: { paddingHorizontal: Spacing.md, paddingTop: 12, paddingBottom: 40 },
    actionRow: { flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 20 },
    actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    actionCount: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.textPrimary },

    commentList: { gap: 12 },
    commentCard: {
        flexDirection: 'row', gap: 10, alignItems: 'flex-start',
        backgroundColor: Colors.surface, borderRadius: 18,
        padding: 12, borderWidth: 1, borderColor: Colors.border,
    },
    commentAvatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: Colors.border },
    commentBody: { flex: 1 },
    commentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
    commentName: { fontSize: 13, fontFamily: Fonts.bold, color: Colors.textPrimary },
    commentTime: { fontSize: 10, color: Colors.textMuted },
    commentText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
    commentRight: { alignItems: 'center', gap: 8 },
    commentLikeBtn: { alignItems: 'center', gap: 2 },
    commentLikeCount: { fontSize: 10, fontFamily: Fonts.bold, color: Colors.textMuted },

    commentBar: {
        flexDirection: 'row', alignItems: 'flex-end', gap: 10,
        paddingHorizontal: Spacing.md, paddingTop: 10,
        backgroundColor: Colors.surface,
        borderTopWidth: 1, borderTopColor: Colors.border,
    },
    chatBanner: { flex: 1, textAlign: 'center', fontSize: 13, fontFamily: Fonts.medium, color: Colors.textMuted, paddingVertical: 10 },
    commentInput: {
        flex: 1, minHeight: 42, maxHeight: 120,
        backgroundColor: Colors.cardAlt, borderRadius: 21,
        paddingHorizontal: 16, paddingVertical: 11,
        fontSize: 14, fontFamily: Fonts.regular, color: Colors.textPrimary,
        borderWidth: 1, borderColor: Colors.border,
    },
    postBtn: { fontSize: 14, fontFamily: Fonts.bold, paddingBottom: 2 },

    // Options sheet
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.divider, alignSelf: 'center', marginBottom: 16 },
    sheetTitle: { fontSize: 18, fontFamily: Fonts.bold, color: Colors.textPrimary, marginBottom: 14 },
    sheetItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: Colors.divider },
    sheetItemIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    sheetItemText: { flex: 1, fontSize: 15, fontFamily: Fonts.medium },
    cancelBtn: { paddingVertical: 14, alignItems: 'center', marginTop: 8 },
    cancelBtnText: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.textMuted },

    // QR
    qrBox: { width: '82%', backgroundColor: Colors.surface, borderRadius: 24, padding: 28, alignItems: 'center', alignSelf: 'center', marginTop: 'auto', marginBottom: 'auto' },
    qrTitle: { fontSize: 20, fontFamily: Fonts.bold, color: Colors.textPrimary, marginBottom: 20 },
    qrImg: { width: 220, height: 220, marginBottom: 16 },
    qrSub: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginBottom: 22 },
    qrBtn: { width: '100%', paddingVertical: 14, borderRadius: 16, alignItems: 'center' },
    qrBtnText: { color: '#fff', fontSize: 15, fontFamily: Fonts.bold },

    // Viewer
    viewer: { flex: 1, backgroundColor: '#000' },
    viewerClose: { position: 'absolute', top: 52, right: 18, zIndex: 10, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
    viewerSlide: { width, height, alignItems: 'center', justifyContent: 'center' },
    viewerMedia: { width, height },
    viewerNote: { width: '85%', minHeight: 260, backgroundColor: '#fffde7', borderRadius: 4, borderLeftWidth: 12, borderLeftColor: '#fbc02d', padding: 24, alignItems: 'center', justifyContent: 'center' },
    viewerNoteText: { fontSize: 20, fontFamily: Fonts.medium, color: '#5d4037', textAlign: 'center', lineHeight: 30, fontStyle: 'italic' },
    audioPlayBtn: { width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)' },
    viewerCaption: { position: 'absolute', bottom: 80, left: 20, right: 20, backgroundColor: 'rgba(0,0,0,0.5)', padding: 10, borderRadius: 12 },
    viewerCaptionText: { color: '#fff', fontSize: 14, fontFamily: Fonts.regular, textAlign: 'center' },
});