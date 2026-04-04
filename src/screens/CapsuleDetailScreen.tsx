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
const GRID_GAP = 5;
const SECTION_PAD = Spacing.md * 2;
const ITEM_SIZE = Math.floor((width - SECTION_PAD - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS);
const ITEM_HEIGHT = (ITEM_SIZE * 4) / 3;

// ─── Design tokens (matches creation screen palette) ─────────────────────────
const D = {
    bg: '#FDFBFF',
    surface: '#FFFFFF',
    surfaceAlt: '#F5F3FB',
    glass: 'rgba(255,255,255,0.72)',
    border: '#EAE6F5',
    borderStrong: '#D4CEEC',
    text: '#1A1530',
    textSec: '#5C5778',
    textMuted: '#A09CC0',
    rose: '#C06090',
    purple: '#7C5CBF',
    purpleLight: '#F3EEFF',
};

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

// ─── Ambient orbs background ──────────────────────────────────────────────────
function AmbientOrbs({ accent }: { accent: string }) {
    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <View style={{ position: 'absolute', top: -60, right: -50, width: 240, height: 240, borderRadius: 120, backgroundColor: accent + '09' }} />
            <View style={{ position: 'absolute', top: 200, left: -70, width: 200, height: 200, borderRadius: 100, backgroundColor: accent + '06' }} />
            <View style={{ position: 'absolute', bottom: 200, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: D.rose + '08' }} />
        </View>
    );
}

// ─── Stat pill ────────────────────────────────────────────────────────────────
function StatPill({ icon, label, color, bg }: { icon: any; label: string; color?: string; bg?: string }) {
    return (
        <View style={[ds.statPill, bg ? { backgroundColor: bg } : {}]}>
            <Ionicons name={icon} size={13} color={color || D.textMuted} />
            <Text style={[ds.statPillText, color ? { color } : {}]}>{label}</Text>
        </View>
    );
}

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

    const activeModelTint = capsule ? ((MODEL_TINTS as any)[capsule.model] || '#7C5CBF') : '#7C5CBF';
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

    const opensAt = capsule?.opens_at ? new Date(capsule.opens_at) : null;
    const createdAt = capsule?.created_at ? new Date(capsule.created_at) : null;
    const isBornOpen = opensAt && createdAt && Math.abs(opensAt.getTime() - createdAt.getTime()) < 10000;
    const now_val = new Date();
    const chatStart = opensAt ? new Date(opensAt.getTime() - 86400000) : null;
    const chatEnd = opensAt ? new Date(opensAt.getTime() + 18000000) : null;
    const showChat = !isBornOpen && chatStart && chatEnd && now_val >= chatStart && now_val <= chatEnd;

    const filteredData = useMemo(() => {
        let result = [...items];
        if (filterType !== 'all') result = result.filter(i => i.media_type === filterType);
        result.sort((a, b) => {
            const da = new Date(a.created_at).getTime(), db = new Date(b.created_at).getTime();
            return filterSort === 'newest' ? db - da : da - db;
        });
        const itemsPerCol = 3;
        const columns: any[][] = [];
        for (let i = 0; i < result.length; i += itemsPerCol) columns.push(result.slice(i, i + itemsPerCol));
        return { columns, total: result.length };
    }, [items, filterType, filterSort]);

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

        const isActuallyOpenCap = capRes.data?.type === 'opencap' || (capRes.data?.status === 'opened' && capRes.data?.duration_days === 0);
        if (capRes.data?.status === 'opened' && !isActuallyOpenCap && (!itemsRes.data || itemsRes.data.length === 0)) {
            await supabase.rpc('delete_capsule', { p_capsule_id: capsuleId });
            Alert.alert('Kapsely', t('detail.deleted_empty') || 'Capsule was empty and has been deleted.');
            if (navigation.canGoBack()) navigation.goBack();
            return;
        }

        if (capRes.data) {
            setCapsule(capRes.data);
            const cfg = timerConfigManager.getConfig(capRes.data.model);
            setModelTint(cfg?.themeColor || MODEL_TINTS[capRes.data.model] || '#7C5CBF');

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
            const isActuallyOpenCap = capsule.type === 'opencap' || (capsule.status === 'opened' && capsule.duration_days === 0);
            if (items.length === 0 && !isActuallyOpenCap) {
                await supabase.rpc('delete_capsule', { p_capsule_id: capsuleId });
                Alert.alert('Kapsely', t('detail.deleted_empty') || 'Capsule was empty and has been deleted.');
                if (navigation.canGoBack()) navigation.goBack();
                return;
            }
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

    const typeLabel = capsule?.type === 'instacap' ? 'INSTACAP'
        : capsule?.type === 'eventcap' ? 'EVENTCAP'
            : capsule?.type === 'opencap' ? 'OPENCAP'
                : 'LEGACYCAP';

    // ── Filter chips ──────────────────────────────────────────────────────────
    const FilterBar = () => {
        const filterScrollRef = useRef<ScrollView>(null);
        useWebDragScroll(filterScrollRef);
        return (
            <ScrollView ref={filterScrollRef} horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ paddingRight: 20, gap: 8 }}>
                {(['all', 'image', 'video', 'note', 'audio'] as const).map(type => {
                    const icons = { all: 'apps-outline', image: 'image-outline', video: 'videocam-outline', note: 'document-text-outline', audio: 'mic-outline' } as const;
                    const isActive = filterType === type;
                    return (
                        <TouchableOpacity
                            key={type}
                            style={[ds.filterChip, isActive && { backgroundColor: tint, borderColor: tint }]}
                            onPress={() => setFilterType(type)}
                        >
                            <Ionicons name={icons[type]} size={12} color={isActive ? '#fff' : D.textMuted} />
                            <Text style={[ds.filterChipText, isActive && { color: '#fff' }]}>
                                {type.charAt(0).toUpperCase() + type.slice(1)}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
                <TouchableOpacity
                    style={ds.filterChip}
                    onPress={() => setFilterSort(p => p === 'newest' ? 'oldest' : 'newest')}
                >
                    <Ionicons name={filterSort === 'newest' ? 'arrow-down' : 'arrow-up'} size={12} color={D.textMuted} />
                    <Text style={ds.filterChipText}>{filterSort === 'newest' ? 'Newest' : 'Oldest'}</Text>
                </TouchableOpacity>
            </ScrollView>
        );
    };

    if (loading && !capsule) return (
        <View style={[ds.root, { alignItems: 'center', justifyContent: 'center' }]}>
            <ActivityIndicator color={D.purple} size="large" />
        </View>
    );
    if (!capsule) return (
        <View style={[ds.root, { alignItems: 'center', justifyContent: 'center' }]}>
            <TouchableOpacity style={{ position: 'absolute', top: insets.top + 10, left: 15, width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }} onPress={() => navigation.goBack()}>
                <Ionicons name="close" size={26} color={D.text} />
            </TouchableOpacity>
            <Ionicons name="alert-circle-outline" size={44} color={D.textMuted} style={{ marginBottom: 12 }} />
            <Text style={{ fontSize: 16, fontFamily: Fonts.semiBold, color: D.textMuted }}>{t('detail.not_found')}</Text>
            <Text style={{ fontSize: 13, color: D.textMuted, textAlign: 'center', paddingHorizontal: 40, marginTop: 4 }}>{t('detail.no_permission')}</Text>
        </View>
    );

    return (
        <View style={ds.root}>
            <AudioController uri={playingAudio} onFinish={() => setPlayingAudio(null)} />
            <AmbientOrbs accent={tint} />
            <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', zIndex: 999, opacity: flashAnim }]} pointerEvents="none" />

            {/* ── Floating header ────────────────────────────────────────── */}
            <View style={[ds.headerWrap, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
                {Platform.OS === 'ios'
                    ? <BlurView intensity={75} tint="light" style={StyleSheet.absoluteFill} />
                    : <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(253,251,255,0.92)' }]} />
                }
                {/* Thin accent line at the very bottom of header */}
                <View style={[ds.headerAccentLine, { backgroundColor: tint + '30' }]} />

                <TouchableOpacity style={ds.headerBackBtn} activeOpacity={0.65} onPress={() => navigation.goBack()}>
                    <Ionicons name="chevron-back" size={20} color={D.text} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={ds.headerCenter}
                    activeOpacity={0.78}
                    onPress={() => navigation.navigate('UserProfile', { targetUserId: capsule.owner_id })}
                >
                    <Image
                        source={{ uri: capsule.profiles?.avatar_url || 'https://via.placeholder.com/150' }}
                        style={[ds.headerAvatar, { borderColor: tint + '40' }]}
                    />
                    <View style={{ flexShrink: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={ds.headerName} numberOfLines={1}>
                                {capsule.profiles?.display_name || capsule.profiles?.username}
                            </Text>
                            {capsule.profiles?.is_verified && <VerifiedBadge size={10} />}
                        </View>
                        <Text style={ds.headerSub} numberOfLines={1}>{capsule.title}</Text>
                    </View>
                    {userId !== capsule.owner_id && (
                        <Pressable
                            onPress={(e) => {
                                e.stopPropagation?.();
                                handleFollowToggle(capsule.owner_id, isFollowedOwner, setIsFollowedOwner);
                            }}
                            style={[
                                ds.followPill,
                                isFollowedOwner
                                    ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: D.border }
                                    : { backgroundColor: tint },
                            ]}
                        >
                            <Text style={[ds.followPillText, isFollowedOwner && { color: D.textMuted }]}>
                                {isFollowedOwner ? t('common.following') : t('common.follow')}
                            </Text>
                        </Pressable>
                    )}
                </TouchableOpacity>

                <TouchableOpacity style={ds.headerOptionsBtn} activeOpacity={0.65} onPress={() => setShowOptions(true)}>
                    <Ionicons name="ellipsis-horizontal" size={17} color={D.textSec} />
                </TouchableOpacity>
            </View>

            {/* ── Main scroll ───────────────────────────────────────────── */}
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={0}>
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
                    contentContainerStyle={[ds.scrollContent, { paddingTop: 72 + insets.top, paddingBottom: 20 }]}
                    keyboardShouldPersistTaps="handled"
                    stickySectionHeadersEnabled={false}
                    renderSectionHeader={() => null}
                    renderItem={({ item }) => {

                        // ── HERO ─────────────────────────────────────────
                        if (item === 'hero') return (
                            <View style={ds.heroSection}>

                                {/* Capsule floating stage */}
                                <View style={ds.capsuleStage}>
                                    {/* Radial glow behind capsule */}
                                    <View style={[ds.capsuleGlow, { backgroundColor: tint + '20' }]} />
                                    <View style={[ds.capsuleGlowInner, { backgroundColor: tint + '10' }]} />

                                    <TouchableOpacity
                                        activeOpacity={0.92}
                                        onPress={() => { if (isMember && isSealed && !isOpening) navigation.navigate('CreateSelection', { capsuleId: capsule.id }); }}
                                        disabled={!isMember || !isSealed || isOpening}
                                        style={{ zIndex: 2 }}
                                    >
                                        <CapsuleWithTimer
                                            modelKey={capsule.model}
                                            source={{ uri: modelImg }}
                                            date={capsule.opens_at}
                                            chainId={capsule.chain_id}
                                            capsuleType={capsule.type}
                                            style={ds.heroModel}
                                            isOpened={!isSealed}
                                        />
                                        {isMember && isSealed && !isOpening && (
                                            <View style={[ds.addHintBubble, { backgroundColor: tint }]}>
                                                <Ionicons name="add" size={16} color="#fff" />
                                            </View>
                                        )}
                                        {isOpening && (
                                            <View style={ds.openingOverlay}>
                                                <LinearGradient colors={[tint + 'CC', tint + '77']} style={StyleSheet.absoluteFill} />
                                                <Text style={ds.openingLabel}>UNSEALING</Text>
                                                <Text style={ds.openingTimer}>{openingTimer}</Text>
                                            </View>
                                        )}
                                    </TouchableOpacity>

                                    {/* Subtle ground shadow */}
                                    <View style={[ds.capsuleShadow, { backgroundColor: tint + '18' }]} />
                                </View>

                                {/* Type + status breadcrumb */}
                                <View style={ds.breadcrumbRow}>
                                    <View style={[ds.breadcrumbDot, { backgroundColor: tint }]} />
                                    <Text style={[ds.breadcrumbText, { color: tint }]}>{typeLabel}</Text>
                                    <View style={ds.breadcrumbSep} />
                                    <View style={[ds.breadcrumbDot, { backgroundColor: isSealed ? D.textMuted : '#22C55E' }]} />
                                    <Text style={[ds.breadcrumbText, { color: isSealed ? D.textMuted : '#22C55E' }]}>
                                        {isSealed ? 'SEALED' : 'OPEN'}
                                    </Text>
                                </View>

                                {/* Title */}
                                <Text style={ds.heroTitle}>{capsule.title}</Text>
                                {capsule.description ? (
                                    <Text style={ds.heroDesc}>{capsule.description}</Text>
                                ) : null}

                                {/* Stat pills */}
                                <View style={ds.statRow}>
                                    <StatPill icon="images-outline" label={`${items.length} items`} />
                                    <StatPill icon="people-outline" label={`${totalMembers} ${totalMembers === 1 ? 'member' : 'members'}`} />
                                    <StatPill
                                        icon={isSealed ? 'lock-closed-outline' : 'lock-open-outline'}
                                        label={isSealed ? 'Sealed' : 'Opened'}
                                        color={isSealed ? D.textMuted : tint}
                                        bg={isSealed ? D.surfaceAlt : tint + '12'}
                                    />
                                </View>

                                {/* Members strip */}
                                {capsule.is_shared && (
                                    <View style={[ds.membersStrip, { borderColor: tint + '25', backgroundColor: tint + '07' }]}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { targetUserId: capsule.owner_id })}>
                                                <Image source={{ uri: capsule.profiles?.avatar_url }} style={[ds.memberAvatar, { borderColor: tint + '50' }]} />
                                            </TouchableOpacity>
                                            {acceptedMembers.map((m: any, i: number) => (
                                                <TouchableOpacity key={i} style={{ marginLeft: -10 }}
                                                    onPress={() => handleFollowToggle(m.id, m.isFollowed, v => setAcceptedMembers(p => p.map(x => x.id === m.id ? { ...x, isFollowed: v } : x)))}
                                                    onLongPress={() => navigation.navigate('UserProfile', { targetUserId: m.id })}
                                                >
                                                    <Image source={{ uri: m.avatar_url }} style={[ds.memberAvatar, m.isFollowed && { borderColor: tint }]} />
                                                </TouchableOpacity>
                                            ))}
                                            {hasWaiting && (
                                                <View style={[ds.memberAvatar, { marginLeft: -10, backgroundColor: D.surfaceAlt, alignItems: 'center', justifyContent: 'center' }]}>
                                                    <Ionicons name="ellipsis-horizontal" size={10} color={D.textMuted} />
                                                </View>
                                            )}
                                        </View>
                                        <Text style={ds.membersText}>{t('common.members_count', { count: totalMembers })}</Text>
                                    </View>
                                )}

                                {/* EventCap banner */}
                                {capsule?.type === 'eventcap' && (
                                    <View style={[ds.eventBanner, { borderColor: tint + '40', backgroundColor: tint + '0C' }]}>
                                        <View style={[ds.eventBannerIcon, { backgroundColor: tint + '18' }]}>
                                            <Ionicons name="earth" size={18} color={tint} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[ds.eventBannerTitle, { color: tint }]}>Pioneers Event</Text>
                                            <Text style={ds.eventBannerDesc}>All capsules open simultaneously worldwide.</Text>
                                        </View>
                                    </View>
                                )}

                                {/* CTAs */}
                                {((!isOpening && isSealed) || isBornOpen) && (
                                    <View style={ds.ctaBlock}>
                                        {!isBornOpen && (
                                            canBeOpened ? (
                                                <View style={{ alignItems: 'center', width: '100%', gap: 8 }}>
                                                    <TouchableOpacity
                                                        style={[ds.unsealBtnWrap, { shadowColor: tint }]}
                                                        activeOpacity={0.86}
                                                        onPress={handleRequestOpen}
                                                        disabled={hasRequestedOpen}
                                                    >
                                                        <LinearGradient
                                                            colors={[tint, tint + 'CC', D.rose + 'AA']}
                                                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                                                            style={ds.unsealBtnGrad}
                                                        >
                                                            <View style={ds.unsealBtnIconWrap}>
                                                                <Ionicons name="sparkles" size={16} color="#fff" />
                                                            </View>
                                                            <Text style={ds.unsealBtnText}>
                                                                {hasRequestedOpen
                                                                    ? t('detail.awaiting_others', { current: reqCount, total: totalMembers })
                                                                    : t('detail.unseal_capsule')}
                                                            </Text>
                                                        </LinearGradient>
                                                    </TouchableOpacity>
                                                    {reqCount < totalMembers && (
                                                        <Text style={ds.approvalHint}>
                                                            {t('detail.approval_needed', { current: reqCount, total: totalMembers })}
                                                        </Text>
                                                    )}
                                                </View>
                                            ) : (
                                                <View style={[ds.countdownCard, { borderColor: tint + '30', backgroundColor: tint + '07' }]}>
                                                    <View style={[ds.countdownIconWrap, { backgroundColor: tint + '18' }]}>
                                                        <Ionicons name="time-outline" size={18} color={tint} />
                                                    </View>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={[ds.countdownLabel, { color: tint }]}>Opens in</Text>
                                                        <LiveTimer date={capsule.opens_at} style={[ds.countdownTimer, { color: tint }]} />
                                                    </View>
                                                </View>
                                            )
                                        )}
                                        {isMember && (
                                            <TouchableOpacity
                                                style={ds.addContentBtnWrap}
                                                activeOpacity={0.78}
                                                onPress={() => navigation.navigate('CreateSelection', { capsuleId: capsule.id })}
                                            >
                                                <View style={[ds.addContentBtn, { borderColor: tint + '50', backgroundColor: tint + '0C' }]}>
                                                    <Ionicons name="add-circle-outline" size={15} color={tint} />
                                                    <Text style={[ds.addContentText, { color: tint }]}>{t('create.add_content')}</Text>
                                                </View>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                )}
                            </View>
                        );

                        // ── CONTENT SECTION ───────────────────────────────
                        if (item === 'content') return (
                            <View style={ds.contentSection}>
                                {/* Section header */}
                                <View style={ds.sectionHeader}>
                                    <View style={[ds.sectionHeaderBar, { backgroundColor: tint }]} />
                                    <Text style={ds.sectionTitle}>Contents</Text>
                                    <Text style={ds.sectionCount}>{filteredData.total}</Text>
                                </View>

                                <FilterBar />

                                {filteredData.total > 0 ? (
                                    <FlatList
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                        data={filteredData.columns}
                                        keyExtractor={(_, i) => i.toString()}
                                        scrollEventThrottle={16}
                                        decelerationRate="fast"
                                        contentContainerStyle={{ paddingHorizontal: 2, gap: 10 }}
                                        renderItem={({ item: colItems }) => (
                                            <View style={{ width: (width - 44) / 2.4, gap: 10 }}>
                                                {colItems.map((pi: any) => (
                                                    <View key={pi.id}>
                                                        {isSealed ? (
                                                            /* Sealed cell — frosted glass */
                                                            <View style={[ds.cellWrap, ds.cellSealed]}>
                                                                {(pi.media_url || pi.thumbnail_url) && (pi.media_type === 'image' || pi.media_type === 'video') && (
                                                                    <Image source={{ uri: pi.thumbnail_url || pi.media_url }} style={StyleSheet.absoluteFill} blurRadius={24} />
                                                                )}
                                                                {Platform.OS === 'ios'
                                                                    ? <BlurView intensity={45} tint="light" style={StyleSheet.absoluteFill} />
                                                                    : <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.65)' }]} />
                                                                }
                                                                <View style={[ds.cellTypeTag, { backgroundColor: tint + '18', borderColor: tint + '30' }]}>
                                                                    <Ionicons name={pi.media_type === 'video' ? 'videocam' : pi.media_type === 'note' ? 'document-text' : pi.media_type === 'audio' ? 'mic' : 'image'} size={11} color={tint} />
                                                                </View>
                                                                <Ionicons name="lock-closed" size={18} color={tint + '40'} />
                                                            </View>
                                                        ) : (
                                                            /* Opened cell */
                                                            <TouchableOpacity
                                                                style={ds.cellWrap}
                                                                activeOpacity={0.82}
                                                                onPress={() => pi.media_type === 'audio' ? toggleAudio(pi.media_url) : openViewer(items.indexOf(pi))}
                                                                onLongPress={() => handleReportItem(pi.id)}
                                                            >
                                                                {pi.media_type === 'audio' ? (
                                                                    <LinearGradient colors={[tint, tint + 'CC', D.rose + 'AA']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                                                                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                                                                            <Ionicons name={playingAudio === pi.media_url ? 'pause-circle' : 'mic-circle'} size={36} color="rgba(255,255,255,0.9)" />
                                                                        </View>
                                                                    </LinearGradient>
                                                                ) : pi.media_type === 'note' ? (
                                                                    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFEF5', padding: 12, alignItems: 'center', justifyContent: 'center' }]}>
                                                                        <Text style={{ fontSize: 12, color: '#4A4530', fontFamily: Fonts.medium, textAlign: 'center', lineHeight: 18 }} numberOfLines={4}>{pi.content}</Text>
                                                                    </View>
                                                                ) : (
                                                                    <Image source={{ uri: pi.thumbnail_url || pi.media_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                                                                )}
                                                                {pi.media_type === 'video' && (
                                                                    <View style={ds.playBadge}>
                                                                        <Ionicons name="play" size={10} color="#fff" />
                                                                    </View>
                                                                )}
                                                            </TouchableOpacity>
                                                        )}
                                                        {pi.caption && pi.caption.replace(/!!b:\w+/, '').trim() ? (
                                                            <Text style={ds.cellCaption} numberOfLines={1}>{pi.caption.replace(/!!b:\w+/, '').trim()}</Text>
                                                        ) : null}
                                                    </View>
                                                ))}
                                            </View>
                                        )}
                                    />
                                ) : (
                                    <View style={ds.emptyState}>
                                        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                                            {[...Array(3)].map((_, i) => (
                                                <View key={i} style={[ds.emptyCell, { borderColor: tint + '30', backgroundColor: tint + '06' }]}>
                                                    <Ionicons name="add" size={18} color={tint + '40'} />
                                                </View>
                                            ))}
                                        </View>
                                        <Text style={ds.emptyText}>{isSealed ? t('detail.sealed_message') : t('detail.no_items')}</Text>
                                    </View>
                                )}
                            </View>
                        );

                        // ── LIVE CHAT ─────────────────────────────────────
                        if (item === 'chat' && showChat) return <LiveChat capsuleId={capsuleId} tint={tint} />;

                        // ── SOCIAL SECTION ────────────────────────────────
                        if (item === 'social') return (
                            <View style={ds.socialSection}>
                                {/* Section header */}
                                <View style={ds.sectionHeader}>
                                    <View style={[ds.sectionHeaderBar, { backgroundColor: tint }]} />
                                    <Text style={ds.sectionTitle}>Reactions</Text>
                                </View>

                                {/* Like + comment row */}
                                <View style={ds.actionRow}>
                                    <TouchableOpacity style={ds.actionBtn} activeOpacity={0.72} onPress={handleLike}>
                                        <View style={[ds.actionIconWrap, isLiked && { backgroundColor: '#FFF0F3' }]}>
                                            <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={20} color={isLiked ? '#F43F5E' : D.textSec} />
                                        </View>
                                        <Text style={[ds.actionCount, isLiked && { color: '#F43F5E' }]}>{likeCount}</Text>
                                    </TouchableOpacity>
                                    <View style={ds.actionBtn}>
                                        <View style={ds.actionIconWrap}>
                                            <Ionicons name="chatbubble-outline" size={19} color={D.textSec} />
                                        </View>
                                        <Text style={ds.actionCount}>{comments.length}</Text>
                                    </View>
                                </View>

                                {/* Comments */}
                                <View style={{ gap: 10 }}>
                                    {comments.map(c => (
                                        <BlurView
                                            key={c.id}
                                            intensity={40}
                                            tint="light"
                                            style={[
                                                ds.commentCard,
                                                { borderColor: highlightedCommentId === c.id ? tint + '60' : D.border },
                                                highlightedCommentId === c.id && { borderLeftWidth: 3, borderLeftColor: tint },
                                            ]}
                                        >
                                            <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { targetUserId: c.user_id })}>
                                                <Image source={{ uri: c.profiles?.avatar_url || 'https://via.placeholder.com/150' }} style={[ds.commentAvatar, { borderColor: D.border }]} />
                                            </TouchableOpacity>
                                            <View style={{ flex: 1 }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                                                    <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} onPress={() => navigation.navigate('UserProfile', { targetUserId: c.user_id })}>
                                                        <Text style={ds.commentName}>{c.profiles?.display_name || c.profiles?.username}</Text>
                                                        {c.profiles?.is_verified && <VerifiedBadge size={9} />}
                                                    </TouchableOpacity>
                                                    <Text style={ds.commentTime}>{formatTime(c.created_at)}</Text>
                                                </View>
                                                <Text style={ds.commentText}>{c.content}</Text>
                                            </View>
                                            <View style={{ alignItems: 'center', gap: 8, paddingLeft: 6 }}>
                                                <TouchableOpacity onPress={() => handleLikeComment(c.id)} style={{ alignItems: 'center', gap: 2 }}>
                                                    <Ionicons name={c.myLike ? 'heart' : 'heart-outline'} size={13} color={c.myLike ? '#F43F5E' : D.textMuted} />
                                                    {c.likeCount > 0 && <Text style={[ds.commentLikeCount, c.myLike && { color: '#F43F5E' }]}>{c.likeCount}</Text>}
                                                </TouchableOpacity>
                                                {(c.user_id === userId || isOwner) && (
                                                    <TouchableOpacity onPress={() => handleDeleteComment(c.id)} style={{ padding: 2 }}>
                                                        <Ionicons name="trash-outline" size={12} color={D.textMuted} />
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                        </BlurView>
                                    ))}
                                </View>
                            </View>
                        );

                        return null;
                    }}
                />

                {/* ── Comment input bar ──────────────────────────────────── */}
                <BlurView
                    intensity={80}
                    tint="light"
                    style={[ds.commentBar, { paddingBottom: Math.max(insets.bottom, 14) }]}
                >
                    <View style={[ds.commentBarBorderTop, { backgroundColor: tint + '20' }]} />
                    {showChat ? (
                        <Text style={ds.chatBanner}>Live chat active above ↑</Text>
                    ) : (
                        <>
                            <TextInput
                                style={[ds.commentInput, { borderColor: comment ? tint + '50' : D.border }]}
                                placeholder={t('detail.add_comment_placeholder') || 'Add a comment...'}
                                placeholderTextColor={D.textMuted}
                                value={comment}
                                onChangeText={setComment}
                                multiline
                                selectionColor={tint}
                            />
                            <TouchableOpacity
                                onPress={handleSendComment}
                                disabled={!comment.trim()}
                                style={[ds.postBtnWrap, { opacity: comment.trim() ? 1 : 0.4 }]}
                            >
                                <LinearGradient colors={[tint, tint + 'CC']} style={ds.postBtnGrad}>
                                    <Ionicons name="arrow-up" size={16} color="#fff" />
                                </LinearGradient>
                            </TouchableOpacity>
                        </>
                    )}
                </BlurView>
            </KeyboardAvoidingView>

            {/* ── Options bottom sheet ────────────────────────────────────── */}
            <Modal visible={showOptions} transparent animationType="fade">
                <Pressable style={ds.overlay} onPress={() => setShowOptions(false)}>
                    <View style={ds.optionsSheet}>
                        <View style={ds.sheetHandle} />
                        <Text style={ds.sheetTitle}>{t('detail.options')}</Text>
                        {[
                            { icon: 'qr-code-outline', color: D.text, label: t('detail.view_qr'), onPress: () => { setShowOptions(false); setShowQRModal(true); } },
                            { icon: 'logo-instagram', color: '#E1306C', label: t('detail.share_instagram'), onPress: () => { setShowOptions(false); navigation.navigate('InstagramShare', { capsule }); } },
                            ...(!isOwner ? [{ icon: 'alert-circle-outline', color: D.textSec, label: t('detail.report_capsule'), onPress: handleReportCapsule }] : []),
                            ...(isOwner ? [{ icon: 'trash-outline', color: '#EF4444', label: t('detail.delete_perm'), onPress: handleDeleteCapsule }] : []),
                        ].map((opt, i) => (
                            <TouchableOpacity key={i} style={ds.sheetItem} onPress={opt.onPress} activeOpacity={0.72}>
                                <View style={[ds.sheetItemIcon, { backgroundColor: (opt.color as string) + '14' }]}>
                                    <Ionicons name={opt.icon as any} size={17} color={opt.color as string} />
                                </View>
                                <Text style={[ds.sheetItemText, { color: opt.color as string }]}>{opt.label}</Text>
                                <Ionicons name="chevron-forward" size={14} color={D.textMuted} />
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity style={ds.sheetCancelBtn} onPress={() => setShowOptions(false)}>
                            <Text style={ds.sheetCancelText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>

            {/* ── QR modal ───────────────────────────────────────────────── */}
            <Modal visible={showQRModal} transparent animationType="fade">
                <Pressable style={ds.overlay} onPress={() => setShowQRModal(false)}>
                    <View style={ds.qrCard}>
                        <View style={[ds.qrAccentTop, { backgroundColor: tint }]} />
                        <Text style={ds.qrTitle}>{t('detail.capsule_qr')}</Text>
                        <Image source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=kapsely://capsule/${capsuleId}` }} style={ds.qrImg} />
                        <Text style={ds.qrSub}>{t('detail.scan_qr_hint')}</Text>
                        <TouchableOpacity onPress={() => setShowQRModal(false)}>
                            <LinearGradient colors={[tint, tint + 'CC']} style={ds.qrBtn}>
                                <Text style={ds.qrBtnText}>{t('common.done')}</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>

            {/* ── Media viewer ───────────────────────────────────────────── */}
            <Modal visible={viewerVisible} transparent animationType="fade">
                <View style={ds.viewer}>
                    <TouchableOpacity style={ds.viewerClose} onPress={() => setViewerVisible(false)}>
                        <Ionicons name="close" size={24} color="#fff" />
                    </TouchableOpacity>
                    <FlatList
                        data={items}
                        horizontal pagingEnabled
                        initialScrollIndex={initialIndex}
                        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
                        onMomentumScrollEnd={e => setActiveViewerIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
                        keyExtractor={i => i.id}
                        renderItem={({ item: vi, index }) => (
                            <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
                                {vi.media_type === 'note' ? (
                                    <View style={ds.viewerNote}>
                                        <Text style={ds.viewerNoteText}>{vi.content}</Text>
                                    </View>
                                ) : vi.media_type === 'audio' ? (
                                    <View style={[ds.viewerAudio, { backgroundColor: tint }]}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 28 }}>
                                            {[10, 20, 30, 45, 60, 40, 25, 15, 30, 50].map((h, i) => (
                                                <View key={i} style={{ width: 5, height: playingAudio === vi.media_url ? h : h * 0.4, backgroundColor: 'rgba(255,255,255,0.75)', borderRadius: 3 }} />
                                            ))}
                                        </View>
                                        <TouchableOpacity style={ds.audioPlayBtn} onPress={() => toggleAudio(vi.media_url)}>
                                            <Ionicons name={playingAudio === vi.media_url ? 'pause' : 'play'} size={36} color="#fff" style={{ marginLeft: playingAudio === vi.media_url ? 0 : 3 }} />
                                        </TouchableOpacity>
                                    </View>
                                ) : vi.media_type === 'video' ? (
                                    <VideoWithTrim item={vi} isActive={activeViewerIndex === index && viewerVisible} style={{ width, height }} />
                                ) : (
                                    <Image source={{ uri: vi.media_url }} style={{ width, height }} resizeMode="contain" />
                                )}
                                {vi.caption && (
                                    <View style={ds.viewerCaption}>
                                        <Text style={ds.viewerCaptionText}>{vi.caption.replace(/\s!!b:\w+/, '').trim()}</Text>
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
const ds = StyleSheet.create({
    root: { flex: 1, backgroundColor: D.bg },

    // ── Header ──────────────────────────────────────────────────────────────
    headerWrap: {
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100,
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 14, paddingBottom: 12,
        overflow: 'hidden',
    },
    headerAccentLine: {
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 1,
    },
    headerBackBtn: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.8)',
        borderWidth: 1, borderColor: D.border,
        alignItems: 'center', justifyContent: 'center',
        marginRight: 10,
        ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }, android: { elevation: 1 } }),
    },
    headerCenter: {
        flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9,
    },
    headerAvatar: {
        width: 32, height: 32, borderRadius: 16,
        borderWidth: 1.5,
    },
    headerName: {
        fontSize: 13, fontFamily: Fonts.bold, color: D.text, letterSpacing: -0.2,
    },
    headerSub: {
        fontSize: 11, fontFamily: Fonts.regular, color: D.textMuted, marginTop: 1,
    },
    followPill: {
        marginLeft: 4, paddingHorizontal: 12, paddingVertical: 5,
        borderRadius: 20,
    },
    followPillText: {
        fontSize: 11, fontFamily: Fonts.bold, color: '#fff', letterSpacing: 0.1,
    },
    headerOptionsBtn: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.8)',
        borderWidth: 1, borderColor: D.border,
        alignItems: 'center', justifyContent: 'center',
        marginLeft: 8,
    },

    scrollContent: { paddingBottom: 80 },

    // ── Hero ────────────────────────────────────────────────────────────────
    heroSection: {
        alignItems: 'center', paddingTop: 28, paddingBottom: 28, paddingHorizontal: 22,
    },
    capsuleStage: {
        alignItems: 'center', justifyContent: 'center',
        width: '100%', marginBottom: 8,
    },
    capsuleGlow: {
        position: 'absolute',
        width: 220, height: 220, borderRadius: 110,
    },
    capsuleGlowInner: {
        position: 'absolute',
        width: 160, height: 160, borderRadius: 80,
    },
    heroModel: { width: 215, height: 215, zIndex: 2 },
    capsuleShadow: {
        width: 110, height: 12, borderRadius: 60,
        marginTop: -6, zIndex: 1,
        ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } } }),
    },
    addHintBubble: {
        position: 'absolute', bottom: 24, left: -20,
        width: 32, height: 32, borderRadius: 16,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 2, borderColor: '#fff',
        ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } }, android: { elevation: 4 } }),
    },
    openingOverlay: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 28, overflow: 'hidden',
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.35)',
    },
    openingLabel: { fontSize: 10, fontFamily: Fonts.bold, color: '#fff', letterSpacing: 3, marginBottom: 8 },
    openingTimer: { fontSize: 56, fontFamily: Fonts.bold, color: '#fff', lineHeight: 60 },

    breadcrumbRow: {
        flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, marginTop: 4,
    },
    breadcrumbDot: { width: 5, height: 5, borderRadius: 2.5 },
    breadcrumbText: { fontSize: 10, fontFamily: Fonts.bold, letterSpacing: 1.5 },
    breadcrumbSep: { width: 12, height: 1, backgroundColor: D.border, marginHorizontal: 2 },

    heroTitle: {
        fontSize: 27, fontFamily: Fonts.bold, color: D.text,
        textAlign: 'center', letterSpacing: -0.5, marginBottom: 8,
    },
    heroDesc: {
        fontSize: 14, fontFamily: Fonts.regular, color: D.textSec,
        textAlign: 'center', lineHeight: 21, maxWidth: '88%', marginBottom: 12,
    },

    statRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 16 },
    statPill: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: 11, paddingVertical: 6,
        borderRadius: 20, backgroundColor: D.surfaceAlt,
        borderWidth: 1, borderColor: D.border,
    },
    statPillText: { fontSize: 11, fontFamily: Fonts.semiBold, color: D.textSec },

    membersStrip: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 16, paddingVertical: 10,
        borderRadius: 28, borderWidth: 1, alignSelf: 'center', marginBottom: 14,
    },
    memberAvatar: {
        width: 28, height: 28, borderRadius: 14,
        borderWidth: 2, borderColor: D.surface,
    },
    membersText: { fontSize: 12, fontFamily: Fonts.semiBold, color: D.text },

    eventBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        borderRadius: 20, borderWidth: 1.5, padding: 14,
        width: '100%', marginBottom: 14,
    },
    eventBannerIcon: {
        width: 40, height: 40, borderRadius: 12,
        alignItems: 'center', justifyContent: 'center',
    },
    eventBannerTitle: { fontSize: 13, fontFamily: Fonts.bold, marginBottom: 2 },
    eventBannerDesc: { fontSize: 12, fontFamily: Fonts.regular, color: D.textSec, lineHeight: 17 },

    ctaBlock: { width: '100%', alignItems: 'center', gap: 12, marginTop: 6 },

    unsealBtnWrap: {
        width: '88%', borderRadius: 22,
        ...Platform.select({ ios: { shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } }, android: { elevation: 8 } }),
    },
    unsealBtnGrad: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 10, paddingVertical: 17, borderRadius: 22,
    },
    unsealBtnIconWrap: {
        width: 30, height: 30, borderRadius: 15,
        backgroundColor: 'rgba(255,255,255,0.22)',
        alignItems: 'center', justifyContent: 'center',
    },
    unsealBtnText: { fontSize: 16, fontFamily: Fonts.bold, color: '#fff', letterSpacing: 0.2 },
    approvalHint: { fontSize: 12, fontFamily: Fonts.medium, color: D.textMuted },

    countdownCard: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        borderRadius: 18, borderWidth: 1.5, padding: 14,
        width: '88%',
    },
    countdownIconWrap: {
        width: 42, height: 42, borderRadius: 13,
        alignItems: 'center', justifyContent: 'center',
    },
    countdownLabel: { fontSize: 11, fontFamily: Fonts.semiBold, marginBottom: 2, opacity: 0.8 },
    countdownTimer: { fontSize: 18, fontFamily: Fonts.bold },

    addContentBtnWrap: { alignSelf: 'center' },
    addContentBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 7,
        paddingHorizontal: 20, paddingVertical: 11,
        borderRadius: 22, borderWidth: 1.5,
    },
    addContentText: { fontSize: 13, fontFamily: Fonts.bold },

    // ── Content section ──────────────────────────────────────────────────────
    contentSection: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 20 },

    sectionHeader: {
        flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14,
    },
    sectionHeaderBar: { width: 3, height: 16, borderRadius: 2 },
    sectionTitle: { fontSize: 17, fontFamily: Fonts.bold, color: D.text, flex: 1 },
    sectionCount: {
        fontSize: 12, fontFamily: Fonts.bold, color: D.textMuted,
        backgroundColor: D.surfaceAlt, paddingHorizontal: 8, paddingVertical: 3,
        borderRadius: 10, borderWidth: 1, borderColor: D.border,
    },

    filterChip: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: D.surface, paddingHorizontal: 12, paddingVertical: 8,
        borderRadius: 20, borderWidth: 1.5, borderColor: D.border,
    },
    filterChipText: { fontSize: 12, fontFamily: Fonts.semiBold, color: D.textSec },

    cellWrap: {
        width: (width - 44) / 2.4,
        height: ((width - 44) / 2.4) * 1.28,
        borderRadius: 16, overflow: 'hidden',
        backgroundColor: D.surfaceAlt,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: D.border,
    },
    cellSealed: { borderStyle: 'solid' },
    cellTypeTag: {
        position: 'absolute', top: 8, right: 8,
        width: 26, height: 26, borderRadius: 8,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1,
    },
    cellCaption: {
        fontSize: 11, color: D.textSec, marginTop: 6,
        fontFamily: Fonts.medium, lineHeight: 15, paddingHorizontal: 2,
    },
    playBadge: {
        position: 'absolute', top: 8, right: 8,
        width: 24, height: 24, borderRadius: 8,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center', justifyContent: 'center',
    },

    emptyState: { alignItems: 'center', paddingVertical: 24 },
    emptyCell: {
        width: 76, height: 76, borderRadius: 16,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderStyle: 'dashed',
    },
    emptyText: { fontSize: 13, fontFamily: Fonts.medium, color: D.textMuted, textAlign: 'center' },

    // ── Social section ───────────────────────────────────────────────────────
    socialSection: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 40 },

    actionRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
    actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    actionIconWrap: {
        width: 38, height: 38, borderRadius: 12,
        backgroundColor: D.surfaceAlt, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: D.border,
    },
    actionCount: { fontSize: 15, fontFamily: Fonts.semiBold, color: D.text },

    commentCard: {
        flexDirection: 'row', gap: 10, alignItems: 'flex-start',
        backgroundColor: 'rgba(255,255,255,0.65)',
        borderRadius: 20, padding: 13,
        borderWidth: 1.5, overflow: 'hidden',
    },
    commentAvatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5 },
    commentName: { fontSize: 13, fontFamily: Fonts.bold, color: D.text },
    commentTime: { fontSize: 10, color: D.textMuted, fontFamily: Fonts.regular },
    commentText: { fontSize: 13, color: D.textSec, lineHeight: 19, fontFamily: Fonts.regular },
    commentLikeCount: { fontSize: 10, fontFamily: Fonts.bold, color: D.textMuted },

    // ── Comment bar ──────────────────────────────────────────────────────────
    commentBar: {
        flexDirection: 'row', alignItems: 'flex-end', gap: 10,
        paddingHorizontal: 18, paddingTop: 12,
        overflow: 'hidden', position: 'relative',
    },
    commentBarBorderTop: {
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
    },
    chatBanner: {
        flex: 1, textAlign: 'center', fontSize: 13,
        fontFamily: Fonts.medium, color: D.textMuted, paddingVertical: 10,
    },
    commentInput: {
        flex: 1, minHeight: 42, maxHeight: 120,
        backgroundColor: D.surface, borderRadius: 21,
        paddingHorizontal: 16, paddingVertical: 11,
        fontSize: 14, fontFamily: Fonts.regular, color: D.text,
        borderWidth: 1.5,
    },
    postBtnWrap: { marginBottom: 2 },
    postBtnGrad: {
        width: 40, height: 40, borderRadius: 20,
        alignItems: 'center', justifyContent: 'center',
    },

    // ── Options sheet ────────────────────────────────────────────────────────
    overlay: { flex: 1, backgroundColor: 'rgba(15,10,30,0.52)', justifyContent: 'flex-end' },
    optionsSheet: {
        backgroundColor: D.surface,
        borderTopLeftRadius: 32, borderTopRightRadius: 32,
        paddingHorizontal: 22, paddingTop: 12, paddingBottom: 40,
        ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 30, shadowOffset: { width: 0, height: -8 } }, android: { elevation: 20 } }),
    },
    sheetHandle: {
        width: 38, height: 4, borderRadius: 2,
        backgroundColor: D.borderStrong, alignSelf: 'center', marginBottom: 18,
    },
    sheetTitle: { fontSize: 20, fontFamily: Fonts.bold, color: D.text, marginBottom: 16, letterSpacing: -0.3 },
    sheetItem: {
        flexDirection: 'row', alignItems: 'center', gap: 13,
        paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: D.border,
    },
    sheetItemIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    sheetItemText: { flex: 1, fontSize: 15, fontFamily: Fonts.medium },
    sheetCancelBtn: { paddingVertical: 14, alignItems: 'center', marginTop: 6 },
    sheetCancelText: { fontSize: 15, fontFamily: Fonts.semiBold, color: D.textMuted },

    // ── QR ───────────────────────────────────────────────────────────────────
    qrCard: {
        width: '82%', backgroundColor: D.surface,
        borderRadius: 28, overflow: 'hidden',
        padding: 28, paddingTop: 18,
        alignItems: 'center', alignSelf: 'center',
        marginTop: 'auto', marginBottom: 'auto',
        ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 30, shadowOffset: { width: 0, height: 10 } }, android: { elevation: 16 } }),
    },
    qrAccentTop: { height: 4, width: '60%', borderRadius: 2, marginBottom: 18 },
    qrTitle: { fontSize: 20, fontFamily: Fonts.bold, color: D.text, marginBottom: 20 },
    qrImg: { width: 220, height: 220, marginBottom: 16 },
    qrSub: { fontSize: 13, color: D.textSec, textAlign: 'center', marginBottom: 22 },
    qrBtn: { width: 200, paddingVertical: 14, borderRadius: 18, alignItems: 'center' },
    qrBtnText: { color: '#fff', fontSize: 15, fontFamily: Fonts.bold },

    // ── Viewer ───────────────────────────────────────────────────────────────
    viewer: { flex: 1, backgroundColor: '#0A0812' },
    viewerClose: {
        position: 'absolute', top: 52, right: 18, zIndex: 10,
        width: 38, height: 38, borderRadius: 19,
        backgroundColor: 'rgba(255,255,255,0.12)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    },
    viewerNote: {
        width: '86%', minHeight: 260,
        backgroundColor: '#FFFEF5', borderRadius: 6,
        borderLeftWidth: 10, borderLeftColor: '#F0C040',
        padding: 26, alignItems: 'center', justifyContent: 'center',
    },
    viewerNoteText: {
        fontSize: 20, fontFamily: Fonts.medium, color: '#5D4037',
        textAlign: 'center', lineHeight: 32, fontStyle: 'italic',
    },
    viewerAudio: {
        width: 240, height: 240, borderRadius: 32,
        alignItems: 'center', justifyContent: 'center',
    },
    audioPlayBtn: {
        width: 88, height: 88, borderRadius: 44,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)',
    },
    viewerCaption: {
        position: 'absolute', bottom: 80, left: 20, right: 20,
        backgroundColor: 'rgba(0,0,0,0.55)', padding: 12, borderRadius: 14,
    },
    viewerCaptionText: { color: '#fff', fontSize: 14, fontFamily: Fonts.regular, textAlign: 'center' },
});