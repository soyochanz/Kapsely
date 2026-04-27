import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal, Alert,
    KeyboardAvoidingView, Platform, StatusBar, ActivityIndicator, Keyboard,
    ScrollView, Linking, Animated as RNAnimated
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Fonts, Spacing, BorderRadius, Shadow, PALETTE } from '../theme';
import * as ExpoLocation from 'expo-location';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { sendPushNotification } from '../utils/pushNotifications';
import * as ImagePicker from 'expo-image-picker';
import { Audio, Video } from 'expo-av';
import { optimizeImageForUpload } from '../utils/mediaOptimization';
import { MODEL_IMAGES, MODEL_TINTS, MODEL_IMAGES_OPEN } from '../constants/models';
import { timerConfigManager } from '../utils/timerConfig';
import SwipeableMessage from '../components/SwipeableMessage';
import { GestureHandlerRootView } from 'react-native-gesture-handler';


// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FAF8FE',   // very light lavender background
    },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: PALETTE.headerBg,
        borderBottomWidth: 1,
        borderBottomColor: PALETTE.headerBorder,
        // Soft shadow
        shadowColor: '#9B7FD4',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 3,
    },
    headerUserInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flex: 1,
        marginLeft: 4,
    },
    headerAvatar: {
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: 2,
        borderColor: PALETTE.myBubbleLight,
    },
    headerTitle: {
        fontSize: 16,
        fontFamily: Fonts.bold,
        color: '#2D2541',
        letterSpacing: -0.2,
    },
    headerSubtitle: {
        fontSize: 11,
        color: PALETTE.replyMuted,
        fontFamily: Fonts.regular,
        marginTop: 1,
    },
    backBtn: {
        width: 38,
        height: 38,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        backgroundColor: PALETTE.locationBg,
    },

    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    list: { paddingHorizontal: 14, paddingVertical: 10 },

    // Message wrappers
    msgWrapper: { marginBottom: 3, width: '100%' },
    msgWrapperSpaced: { marginBottom: 8 },      // extra gap when sender changes
    myMsg: { alignItems: 'flex-end' },
    theirMsg: { alignItems: 'flex-start' },

    // Bubbles
    bubble: {
        maxWidth: '78%',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 22,
    },
    myBubble: {
        backgroundColor: PALETTE.myBubble,
        borderBottomRightRadius: 6,
        // Colored shadow matching bubble
        shadowColor: PALETTE.myBubble,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
        elevation: 4,
    },
    theirBubble: {
        backgroundColor: PALETTE.theirBubble,
        borderBottomLeftRadius: 6,
        borderWidth: 1,
        borderColor: PALETTE.theirBorder,
        shadowColor: '#9B7FD4',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.07,
        shadowRadius: 4,
        elevation: 2,
    },
    deletedBubble: {
        backgroundColor: PALETTE.deletedBubble,
        borderWidth: 1,
        borderColor: PALETTE.deletedBorder,
        borderStyle: 'dashed',
    },

    // Text
    msgText: { fontSize: 15, fontFamily: Fonts.regular, lineHeight: 21 },
    myMsgText: { color: PALETTE.myText },
    theirMsgText: { color: PALETTE.theirText },
    deletedText: {
        fontStyle: 'italic',
        color: PALETTE.deletedText,
        fontSize: 13,
    },

    // Timestamps & ticks
    msgFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        marginTop: 4,
        gap: 3,
    },
    msgTime: { fontSize: 10, color: PALETTE.theirTimestamp },
    myMsgTime: { fontSize: 10, color: PALETTE.myTimestamp },

    // Avatars alongside bubbles
    bubbleAvatarSlot: {
        width: 30,
        alignItems: 'center',
        justifyContent: 'flex-end',
        marginBottom: 2,
    },
    bubbleAvatar: {
        width: 26,
        height: 26,
        borderRadius: 13,
        borderWidth: 1.5,
        borderColor: PALETTE.theirBorder,
    },
    bubbleAvatarSpacer: { width: 26, height: 26 },
    myBubbleAvatar: {
        borderColor: PALETTE.myBubbleLight,
    },

    // Input row
    inputRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 10,
        paddingVertical: 8,
        backgroundColor: PALETTE.headerBg,
        borderTopWidth: 1,
        borderTopColor: PALETTE.headerBorder,
        gap: 6,
    },
    toolbarBtn: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
    },
    inputWrap: {
        flex: 1,
        minHeight: 38,
        maxHeight: 120,
        backgroundColor: PALETTE.inputBg,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: PALETTE.inputBorder,
        paddingHorizontal: 14,
        paddingTop: 9,
        paddingBottom: 9,
        justifyContent: 'center',
    },
    input: {
        fontSize: 15,
        color: PALETTE.inputText,
        fontFamily: Fonts.regular,
        padding: 0,
        margin: 0,
    },
    sendBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: PALETTE.sendBtn,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: PALETTE.sendBtn,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.32,
        shadowRadius: 6,
        elevation: 4,
        marginBottom: 0,
    },
    sendBtnRecord: {
        backgroundColor: PALETTE.recordActive,
        shadowColor: PALETTE.recordActive,
    },

    // Recording indicator
    recordingWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#FFF0F0',
        borderRadius: 20,
        paddingHorizontal: 14,
        height: 38,
        flex: 1,
        borderWidth: 1.5,
        borderColor: '#FFCDD2',
    },
    recordingDot: {
        width: 7,
        height: 7,
        borderRadius: 4,
        backgroundColor: PALETTE.recordActive,
    },
    recordingText: {
        color: PALETTE.recordActive,
        fontSize: 14,
        fontFamily: Fonts.bold,
    },
    recordingCancel: {
        marginLeft: 'auto' as any,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        backgroundColor: 'rgba(229,115,115,0.12)',
    },
    recordingCancelText: {
        color: PALETTE.recordActive,
        fontSize: 12,
        fontFamily: Fonts.semiBold,
    },

    // Reply banner
    replyBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: PALETTE.replyBar,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: PALETTE.inputBorder,
    },
    replyContent: {
        flex: 1,
        borderLeftWidth: 3,
        borderLeftColor: PALETTE.replyAccent,
        paddingLeft: 10,
    },
    replyLabel: {
        fontSize: 11,
        fontFamily: Fonts.bold,
        color: PALETTE.replyAccent,
        marginBottom: 2,
    },
    replyPreview: {
        fontSize: 13,
        color: PALETTE.replyText,
        fontFamily: Fonts.regular,
    },

    // Reply-in-bubble
    replyInBubble: {
        borderRadius: 10,
        padding: 8,
        marginBottom: 7,
        borderLeftWidth: 3,
    },
    myReplyInBubble: {
        backgroundColor: 'rgba(255,255,255,0.18)',
        borderLeftColor: 'rgba(255,255,255,0.7)',
    },
    theirReplyInBubble: {
        backgroundColor: 'rgba(155,127,212,0.1)',
        borderLeftColor: PALETTE.replyAccent,
    },
});

// ─── AudioMessageBubble ───────────────────────────────────────────────────────
const AudioMessageBubble = memo(({ uri, isMe }: { uri: string; isMe: boolean }) => {
    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const [isPlaying, setPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [position, setPosition] = useState(0);
    const [rate, setRate] = useState(1);

    useEffect(() => () => { sound?.stopAsync(); sound?.unloadAsync(); }, [sound]);

    const playAudio = useCallback(async () => {
        if (sound) {
            if (isPlaying) { await sound.pauseAsync(); setPlaying(false); }
            else { await sound.playAsync(); setPlaying(true); }
            return;
        }
        try {
            await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true, playThroughEarpieceAndroid: false });
            const { sound: s } = await Audio.Sound.createAsync(
                { uri },
                { shouldPlay: true, rate },
                (st: any) => {
                    if (!st.isLoaded) return;
                    setPosition(st.positionMillis ?? 0);
                    setDuration(st.durationMillis ?? 0);
                    setPlaying(st.isPlaying);
                    if (st.didJustFinish) { setPlaying(false); setPosition(0); }
                }
            );
            setSound(s);
            setPlaying(true);
        } catch (e) { console.error('Audio play error:', e); }
    }, [sound, isPlaying, rate, uri]);

    const toggleRate = useCallback(async () => {
        const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
        setRate(next);
        if (sound) await sound.setRateAsync(next, true);
    }, [rate, sound]);

    const fmt = (ms: number) => {
        const s = Math.floor(ms / 1000);
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };

    const progress = position / (duration || 1);

    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 2, width: 215 }}>
            <TouchableOpacity
                onPress={playAudio}
                activeOpacity={0.8}
                style={{
                    width: 38, height: 38, borderRadius: 19,
                    backgroundColor: isMe ? 'rgba(255,255,255,0.25)' : PALETTE.myBubble,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: isMe ? 1.5 : 0,
                    borderColor: 'rgba(255,255,255,0.5)',
                }}
            >
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={16} color='#fff' />
            </TouchableOpacity>

            <View style={{ flex: 1 }}>
                {/* Waveform-style bar */}
                <View style={{ height: 3, backgroundColor: isMe ? 'rgba(255,255,255,0.25)' : '#DDD6F0', borderRadius: 2 }}>
                    <View style={{
                        width: `${progress * 100}%`,
                        height: '100%',
                        backgroundColor: isMe ? 'rgba(255,255,255,0.85)' : PALETTE.myBubble,
                        borderRadius: 2,
                    }} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 }}>
                    <Text style={{ fontSize: 10, color: isMe ? PALETTE.myTimestamp : PALETTE.theirTimestamp }}>{fmt(position)}</Text>
                    <Text style={{ fontSize: 10, color: isMe ? PALETTE.myTimestamp : PALETTE.theirTimestamp }}>{fmt(duration)}</Text>
                </View>
            </View>

            <TouchableOpacity
                onPress={toggleRate}
                style={{
                    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7,
                    backgroundColor: isMe ? 'rgba(255,255,255,0.2)' : 'rgba(155,127,212,0.12)',
                }}
            >
                <Text style={{ fontSize: 10, color: isMe ? '#fff' : PALETTE.myBubble, fontFamily: Fonts.bold }}>{rate}x</Text>
            </TouchableOpacity>
        </View>
    );
});

// ─── ChatCapsuleCard ──────────────────────────────────────────────────────────
const ChatCapsuleCard = memo(({ capsuleId, isMe }: { capsuleId: string; isMe: boolean }) => {
    const [capsule, setCapsule] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ likes: 0, comments: 0, count: 0 });
    const navigation = useNavigation<any>();
    const { t } = useTranslation();

    useEffect(() => {
        (async () => {
            const { data } = await supabase
                .from('capsules')
                .select('*, profiles:owner_id(display_name, username, avatar_url)')
                .eq('id', capsuleId)
                .single();

            if (data) {
                const { count: itemsCount, data: collage } = await supabase
                    .from('capsule_items')
                    .select('*', { count: 'exact' })
                    .eq('capsule_id', capsuleId)
                    .order('created_at', { ascending: false })
                    .limit(4);

                setCapsule({ ...data, collage_items: collage || [] });
                setStats({ likes: 0, comments: 0, count: itemsCount || 0 }); // Stats removed for speed
            }
            setLoading(false);
        })();
    }, [capsuleId]);

    if (loading) return <ActivityIndicator size="small" color={isMe ? 'rgba(255,255,255,0.7)' : PALETTE.myBubble} style={{ padding: 20 }} />;
    if (!capsule) return <Text style={{ color: PALETTE.deletedText, fontSize: 12, padding: 10 }}>Cápsula no encontrada</Text>;

    const collage = capsule.collage_items || [];
    const tint = (MODEL_TINTS as any)[capsule.model] || PALETTE.myBubble;
    const modelImg = (MODEL_IMAGES as any)[capsule.model] || (MODEL_IMAGES as any).basicred_kap;

    const isSealed = capsule.status === 'sealed';
    const blurAmt = Platform.OS === 'ios' ? 50 : 20;
    const sealedOverlay = isSealed ? (
        <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: Platform.OS === 'ios' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.65)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="lock-closed" size={22} color="rgba(0,0,0,0.35)" />
        </View>
    ) : null;

    const renderCollage = () => {
        if (collage.length === 0) {
            return (
                <View style={{ flex: 1, backgroundColor: isMe ? 'rgba(255,255,255,0.1)' : '#F3EEFF', alignItems: 'center', justifyContent: 'center' }}>
                    <Image source={{ uri: modelImg }} style={{ width: 100, height: 100 }} />
                </View>
            );
        }
        if (collage.length === 1) {
            return (
                <View style={{ flex: 1 }}>
                    <Image source={{ uri: collage[0].thumbnail_url || collage[0].media_url }} style={{ flex: 1 }} blurRadius={isSealed ? blurAmt : 0} contentFit="cover" />
                    {sealedOverlay}
                </View>
            );
        }
        if (collage.length === 2) {
            return (
                <View style={{ flex: 1, flexDirection: 'row', gap: 2 }}>
                    <Image source={{ uri: collage[0].thumbnail_url || collage[0].media_url }} style={{ flex: 1 }} blurRadius={isSealed ? blurAmt : 0} contentFit="cover" />
                    <Image source={{ uri: collage[1].thumbnail_url || collage[1].media_url }} style={{ flex: 1 }} blurRadius={isSealed ? blurAmt : 0} contentFit="cover" />
                    {sealedOverlay}
                </View>
            );
        }
        return (
            <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 2, padding: 2 }}>
                {collage.map((item: any, i: number) => (
                    <Image key={item.id ?? i} source={{ uri: item.thumbnail_url || item.media_url }} style={{ width: '49%', height: '48.5%', borderRadius: 4 }} blurRadius={isSealed ? blurAmt : 0} contentFit="cover" />
                ))}
                {sealedOverlay}
            </View>
        );
    };

    const cardBg = isMe ? 'rgba(255,255,255,0.15)' : '#FFFFFF';
    const cardBorder = isMe ? 'rgba(255,255,255,0.25)' : PALETTE.theirBorder;
    const titleCol = isMe ? '#fff' : '#2D2541';
    const metaCol = isMe ? 'rgba(255,255,255,0.7)' : PALETTE.theirTimestamp;

    return (
        <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => navigation.navigate('CapsuleDetail', { capsuleId: capsule.id })}
            style={{
                width: 255,
                backgroundColor: cardBg,
                borderRadius: 20,
                overflow: 'hidden',
                marginBottom: 4,
                borderWidth: 1,
                borderColor: cardBorder,
            }}
        >
            <View style={{ height: 150, backgroundColor: isMe ? 'rgba(255,255,255,0.05)' : '#f9f9f9' }}>
                {renderCollage()}
                <View style={{ position: 'absolute', top: 10, right: 10, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 }}>
                    <Image source={{ uri: modelImg }} style={{ width: 24, height: 24 }} />
                </View>
            </View>
            <View style={{ padding: 12 }}>
                <Text style={{ fontSize: 15, fontFamily: Fonts.bold, color: titleCol }} numberOfLines={1}>{capsule.title}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                    <Text style={{ fontSize: 11, color: metaCol, fontFamily: Fonts.medium }}>@{capsule.profiles?.username}</Text>
                    <View style={{ backgroundColor: isMe ? 'rgba(255,255,255,0.2)' : tint + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                        <Text style={{ fontSize: 10, fontFamily: Fonts.bold, color: isMe ? '#fff' : tint }}>{capsule.type.toUpperCase()}</Text>
                    </View>
                </View>
            </View>
        </TouchableOpacity>
    );
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function ChatDetailScreen() {
    const [loading, setLoading] = useState(true);
    const [messages, setMessages] = useState<any[]>([]);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const PAGE_SIZE = 30;
    const [newMessage, setNewMessage] = useState('');
    const [isInputFocused, setIsInputFocused] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [otherUser, setOtherUser] = useState<any>(null);
    const insets = useSafeAreaInsets();
    const navigation = useNavigation();
    const route = useRoute<any>();
    const { conversationId } = route.params;
    const [isKeyboardVisible, setKeyboardVisible] = useState(false);
    const inputAnimation = useRef(new RNAnimated.Value(0)).current; // 0: buttons visible, 1: expanded

    useEffect(() => {
        RNAnimated.timing(inputAnimation, {
            toValue: (newMessage.trim() || isInputFocused) ? 1 : 0,
            duration: 250,
            useNativeDriver: false,
        }).start();
    }, [newMessage, isInputFocused, inputAnimation]);

    const [isRecordingAudio, setIsRecordingAudio] = useState(false);
    const [myUserProfile, setMyUserProfile] = useState<any>(null);
    const [pendingMedia, setPendingMedia] = useState<string | null>(null);
    const { t } = useTranslation();
    const [isUploading, setIsUploading] = useState(false);
    const [recording, setRecording] = useState<Audio.Recording | null>(null);
    const [viewerVisible, setViewerVisible] = useState(false);
    const [viewerUrl, setViewerUrl] = useState('');
    const [conversation, setConversation] = useState<any>(null);
    const [groupSettingsVisible, setGroupSettingsVisible] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [groupParticipants, setGroupParticipants] = useState<any[]>([]);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const recordingInterval = useRef<any>(null);
    const isCancelled = useRef(false);
    const [replyingTo, setReplyingTo] = useState<any>(null);
    const currentUserIdRef = useRef<string | null>(null);
    const deletedIdsRef = useRef<string[]>([]);
    const latestMessageAtRef = useRef<string | null>(null);
    const chatDeletionTimeRef = useRef<string | null>(null);
    const [capsuleSelectorVisible, setCapsuleSelectorVisible] = useState(false);
    const [capsuleSearchQuery, setCapsuleSearchQuery] = useState('');
    const [capsuleSearchResults, setCapsuleSearchResults] = useState<any[]>([]);
    const [capsuleSearching, setCapsuleSearching] = useState(false);
    const [selectedCapsuleUser, setSelectedCapsuleUser] = useState<any>(null);
    const [userCapsules, setUserCapsules] = useState<any[]>([]);
    const [loadingCapsules, setLoadingCapsules] = useState(false);
    const isFocused = useIsFocused();
    const isSubscribedRef = useRef(true);

    useEffect(() => {
        isSubscribedRef.current = true;
        const updateActiveStatus = async (id: string | null) => {
            if (!currentUserId) return;
            try {
                await supabase.from('profiles').update({ active_conversation_id: id }).eq('id', currentUserId);
            } catch (e) { /* ignore if column doesn't exist yet */ }
        };

        if (isFocused && conversationId && conversationId !== 'new') {
            updateActiveStatus(conversationId);
        } else {
            updateActiveStatus(null);
        }

        return () => {
            isSubscribedRef.current = false;
            updateActiveStatus(null);
        };
    }, [isFocused, conversationId, currentUserId]);

    // Keyboard listeners
    useEffect(() => {
        const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
        const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
        return () => { show.remove(); hide.remove(); };
    }, []);

    // ── Data loading ──────────────────────────────────────────────────────────
    const loadData = useCallback(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;
        setCurrentUserId(user.id);
        currentUserIdRef.current = user.id;

        const { data: myProf } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (myProf) setMyUserProfile(myProf);

        if (conversationId === 'new') {
            if (route.params.otherUser) setOtherUser(route.params.otherUser);
            setLoading(false);
            return;
        }

        const { data: convData } = await supabase.from('conversations').select('*').eq('id', conversationId).maybeSingle();
        if (convData) setConversation(convData);

        const { data: allParts } = await supabase
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', conversationId)
            .neq('user_id', user.id);

        if (convData?.is_group) {
            if (allParts?.length) {
                const { data: profs } = await supabase.from('profiles').select('id, username, display_name, avatar_url, favorite_color').in('id', allParts.map((p: any) => p.user_id));
                if (profs) setGroupParticipants(profs);
            }
        } else {
            if (allParts?.[0]) {
                const { data: profile } = await supabase.from('profiles').select('*').eq('id', allParts[0].user_id).single();
                if (profile) setOtherUser(profile);
            }
        }

        const deletedKey = `deleted_chats_${user.id}`;
        const existing = await AsyncStorage.getItem(deletedKey);
        let deletionTime: string | null = null;
        if (existing) {
            try { const p = JSON.parse(existing); if (p[conversationId]) deletionTime = p[conversationId]; } catch { }
        }
        chatDeletionTimeRef.current = deletionTime;

        let query = supabase.from('messages').select('*').eq('conversation_id', conversationId);
        if (deletionTime) query = query.gt('created_at', deletionTime);

        const { data: msgs } = await query.order('created_at', { ascending: false }).limit(PAGE_SIZE);

        if (msgs) {
            const stored = await AsyncStorage.getItem(`deletedMsgs_${conversationId}`);
            const deletedIds = stored ? JSON.parse(stored) : [];
            deletedIdsRef.current = deletedIds;
            const filtered = msgs.filter((m: any) => !deletedIds.includes(m.id));
            setMessages(filtered);
            latestMessageAtRef.current = filtered.reduce((acc: string | null, curr: any) =>
                !acc ? curr.created_at : new Date(curr.created_at) > new Date(acc) ? curr.created_at : acc, null);
            if (msgs.length < PAGE_SIZE) setHasMore(false);
        }
        setLoading(false);

        const now = new Date();
        now.setSeconds(now.getSeconds() + 5);
        await AsyncStorage.setItem(`chat_visited_${conversationId}`, now.toISOString());

        try {
            await Promise.all([
                supabase.rpc('mark_messages_read', { p_conversation_id: conversationId }),
                supabase.from('notifications').update({ is_read: true }).eq('conversation_id', conversationId).eq('user_id', user.id),
            ]);
        } catch (e) { console.warn('mark_messages_read failed:', e); }
    }, [conversationId]);

    const loadMoreMessages = useCallback(async () => {
        if (!hasMore || loadingMore || conversationId === 'new') return;
        setLoadingMore(true);
        const nextPage = page + 1;
        try {
            let q = supabase.from('messages').select('*').eq('conversation_id', conversationId);
            if (chatDeletionTimeRef.current) q = q.gt('created_at', chatDeletionTimeRef.current);
            const { data: msgs } = await q.order('created_at', { ascending: false }).range(nextPage * PAGE_SIZE, (nextPage + 1) * PAGE_SIZE - 1);
            if (msgs?.length) {
                const stored = await AsyncStorage.getItem(`deletedMsgs_${conversationId}`);
                const dels = stored ? JSON.parse(stored) : [];
                setMessages(prev => {
                    const seen = new Set(prev.map(m => m.id));
                    const extras = msgs.filter((m: any) => !seen.has(m.id) && !dels.includes(m.id));
                    return [...prev, ...extras];
                });
                setPage(nextPage);
                if (msgs.length < PAGE_SIZE) setHasMore(false);
            } else { setHasMore(false); }
        } finally { setLoadingMore(false); }
    }, [hasMore, loadingMore, conversationId, page]);

    useEffect(() => {
        loadData();
        if (!conversationId || conversationId === 'new') return;

        const setupRealtime = async () => {
            const stored = await AsyncStorage.getItem(`deletedMsgs_${conversationId}`);
            deletedIdsRef.current = stored ? JSON.parse(stored) : [];

            const sub = supabase
                .channel(`chat_detail_${conversationId}`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
                    const newMsg = payload.new as any;
                    const oldMsg = payload.old as any;
                    const myId = currentUserIdRef.current;

                    if (payload.eventType === 'INSERT') {
                        if (newMsg.sender_id === myId) return;
                        if (deletedIdsRef.current.includes(newMsg.id)) return;
                        if (chatDeletionTimeRef.current && new Date(newMsg.created_at) <= new Date(chatDeletionTimeRef.current)) return;
                        setMessages(prev => prev.some(m => m.id === newMsg.id) ? prev : [newMsg, ...prev]);
                        if (!latestMessageAtRef.current || new Date(newMsg.created_at) > new Date(latestMessageAtRef.current))
                            latestMessageAtRef.current = newMsg.created_at;
                        supabase.rpc('mark_messages_read', { p_conversation_id: conversationId }).then();
                    } else if (payload.eventType === 'UPDATE') {
                        setMessages(prev => prev.map(m => m.id === newMsg.id ? { ...m, ...newMsg } : m));
                    } else if (payload.eventType === 'DELETE') {
                        setMessages(prev => prev.filter(m => m.id !== oldMsg.id));
                    }
                })
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `id=eq.${conversationId}` }, (payload) => {
                    const u = payload.new as any;
                    setConversation((prev: any) => prev ? { ...prev, name: u.name } : u);
                })
                .subscribe();
            return sub;
        };

        let activeSub: any = null;
        setupRealtime().then(s => activeSub = s);

        return () => {
            const now = new Date();
            now.setSeconds(now.getSeconds() + 5);
            AsyncStorage.setItem(`chat_visited_${conversationId}`, now.toISOString());
            if (activeSub) supabase.removeChannel(activeSub);
        };
    }, [conversationId, loadData]);



    const uploadFile = useCallback(async (uri: string, type: string, userId: string) => {
        const normalized = type === 'image' ? await optimizeImageForUpload(uri) : uri;
        const lastDot = normalized.lastIndexOf('.');
        const ext = lastDot !== -1 ? normalized.substring(lastDot + 1).split('?')[0] : (type === 'video' ? 'mp4' : type === 'audio' ? 'm4a' : 'jpg');
        const filePath = `chat/${userId}/${Date.now()}_${Math.random().toString(36).slice(7)}.${ext}`;
        const formData = new FormData();
        formData.append('file', {
            uri: Platform.OS === 'android' ? normalized : normalized.replace('file://', ''),
            name: `file.${ext}`,
            type: type === 'audio' ? 'audio/x-m4a' : type === 'video' ? 'video/mp4' : 'image/webp',
        } as any);
        const { error } = await supabase.storage.from('capsule-media').upload(filePath, formData, { contentType: 'multipart/form-data', upsert: true });
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from('capsule-media').getPublicUrl(filePath);
        return publicUrl;
    }, []);

    // ── Send ──────────────────────────────────────────────────────────────────
    const sendMessage = useCallback(async (overrideContent?: string, mediaUriOverride?: string, mediaTypeOverride?: string) => {
        const msg = overrideContent ?? newMessage.trim();
        const mediaToUpload = mediaUriOverride ?? pendingMedia;
        const mediaType = mediaTypeOverride ?? (pendingMedia ? 'image' : null);
        if (!msg && !mediaToUpload) return;

        const mediaSave = mediaToUpload;
        setNewMessage('');
        setPendingMedia(null);

        let activeConvId = conversationId;
        if (activeConvId === 'new') {
            const { data: newId, error } = await supabase.rpc('get_or_create_conversation', { user_a: currentUserId, user_b: otherUser?.id });
            if (error || !newId) { console.error('create conversation error:', error); return; }
            activeConvId = newId;
            (navigation as any).setParams({ conversationId: newId });
        }

        const tempId = `temp_${Date.now()}`;
        const tempMsg = { id: tempId, conversation_id: activeConvId, sender_id: currentUserId, content: msg, mediaUrl: mediaSave, media_url: mediaToUpload ? 'local://' : null, media_type: mediaType, created_at: new Date().toISOString(), is_read: false };
        setMessages(prev => [tempMsg, ...prev]);
        setIsUploading(true);

        try {
            const uploadedMediaUrl = mediaToUpload ? await uploadFile(mediaToUpload, mediaType || 'image', currentUserId!) : null;
            const { data, error } = await supabase.from('messages').insert({
                conversation_id: activeConvId,
                sender_id: currentUserId,
                content: msg,
                media_url: uploadedMediaUrl,
                media_type: mediaType,
                replying_to_id: replyingTo?.id ?? null,
            }).select().single();

            setReplyingTo(null);

            if (data) {
                setMessages(prev => prev.map(m => m.id === tempId ? { ...data, mediaUrl: mediaSave } : m));
                supabase.from('conversations').update({ last_message_at: new Date() }).eq('id', activeConvId).then();
                if (otherUser?.id) sendPushNotification(otherUser.id, '💬 Mensaje nuevo', msg, { screen: 'ChatDetail', params: { conversationId: activeConvId } });
            } else {
                setMessages(prev => prev.filter(m => m.id !== tempId));
                if (error) console.warn('Send error:', error.message);
            }
        } catch (e) {
            console.error('Upload/Insert failed:', e);
            setMessages(prev => prev.filter(m => m.id !== tempId));
        } finally { setIsUploading(false); }
    }, [newMessage, pendingMedia, conversationId, currentUserId, otherUser, replyingTo, uploadFile, navigation]);

    // ── Media handlers ────────────────────────────────────────────────────────
    const handleCamera = useCallback(async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') return;
        const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 0.85, videoMaxDuration: 600 });
        if (!result.canceled && result.assets[0]) {
            await sendMessage('', result.assets[0].uri, result.assets[0].type === 'video' ? 'video' : 'image');
        }
    }, []);

    const handleGallery = useCallback(async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') return;
        try {
            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 0.85, videoMaxDuration: 600 });
            if (!result.canceled && result.assets[0]) {
                await sendMessage('', result.assets[0].uri, result.assets[0].type === 'video' ? 'video' : 'image');
            }
        } catch (e) { console.error('Pick error:', e); }
    }, []);

    const handleLocation = useCallback(() => {
        Alert.alert('Compartir Ubicación', '¿Deseas enviar tu ubicación actual?', [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Enviar',
                onPress: async () => {
                    const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
                    if (status !== 'granted') { Alert.alert('Permiso denegado'); return; }
                    const loc = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced });
                    await sendMessage(`${loc.coords.latitude},${loc.coords.longitude}`, undefined, 'location');
                },
            },
        ]);
    }, [sendMessage]);


    // ── Recording ─────────────────────────────────────────────────────────────
    const startRecording = useCallback(async () => {
        try {
            isCancelled.current = false;
            const permission = await Audio.requestPermissionsAsync();
            if (permission.status !== 'granted') return;
            await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, playThroughEarpieceAndroid: false });
            const { recording: rec } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
            setRecording(rec);
            setIsRecordingAudio(true);
            setRecordingDuration(0);
            recordingInterval.current = setInterval(() => setRecordingDuration(p => p + 1), 1000);
        } catch (e) { console.error('startRecording error:', e); }
    }, []);

    const cancelRecording = useCallback(async () => {
        isCancelled.current = true;
        setIsRecordingAudio(false);
        clearInterval(recordingInterval.current);
        if (!recording) return;
        try { await recording.stopAndUnloadAsync(); } catch { }
        setRecording(null);
        setRecordingDuration(0);
    }, [recording]);

    const stopRecording = useCallback(async () => {
        if (isCancelled.current) { isCancelled.current = false; return; }
        if (!recording) { setIsRecordingAudio(false); clearInterval(recordingInterval.current); return; }
        try {
            const status = await recording.getStatusAsync();
            if (!status.canRecord) { setIsRecordingAudio(false); clearInterval(recordingInterval.current); return; }
            setIsRecordingAudio(false);
            clearInterval(recordingInterval.current);
            await recording.stopAndUnloadAsync();
            const uri = recording.getURI();
            setRecording(null);
            setRecordingDuration(0);
            if (uri) sendMessage('', uri, 'audio');
        } catch (e) {
            console.warn('stopRecording error:', e);
            setIsRecordingAudio(false);
            clearInterval(recordingInterval.current);
            setRecording(null);
        }
    }, [recording, sendMessage]);


    // ── Group actions ─────────────────────────────────────────────────────────
    const renameGroup = useCallback(async () => {
        if (!newGroupName.trim()) return;
        const { error } = await supabase.from('conversations').update({ name: newGroupName.trim().substring(0, 100) }).eq('id', conversationId);
        if (!error) { setConversation((p: any) => ({ ...p, name: newGroupName.trim() })); setGroupSettingsVisible(false); }
        else Alert.alert('Error', 'No se pudo renombrar el grupo');
    }, [newGroupName, conversationId]);

    const leaveGroup = useCallback(() => {
        Alert.alert('Abandonar Grupo', '¿Estás seguro?', [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Abandonar', style: 'destructive', onPress: async () => {
                    await supabase.from('conversation_participants').delete().eq('conversation_id', conversationId).eq('user_id', currentUserId);
                    navigation.goBack();
                }
            },
        ]);
    }, [conversationId, currentUserId, navigation]);

    const changeGroupAvatar = useCallback(async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') return;
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images' as any, quality: 0.8, allowsEditing: true, aspect: [1, 1] });
        if (result.canceled || !result.assets[0]) return;
        const uri = result.assets[0].uri;
        const ext = uri.split('.').pop() || 'jpg';
        const filePath = `group_avatars/${conversationId}.${ext}`;
        const formData = new FormData();
        formData.append('file', { uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''), name: `avatar.${ext}`, type: 'image/jpeg' } as any);
        const { error } = await supabase.storage.from('capsule-media').upload(filePath, formData, { contentType: 'multipart/form-data', upsert: true });
        if (error) { Alert.alert('Error', 'No se pudo cambiar el avatar'); return; }
        const { data: { publicUrl } } = supabase.storage.from('capsule-media').getPublicUrl(filePath);
        await supabase.from('conversations').update({ avatar_url: publicUrl }).eq('id', conversationId);
        setConversation((p: any) => ({ ...p, avatar_url: publicUrl }));
    }, [conversationId]);

    // ── Delete ────────────────────────────────────────────────────────────────
    const deleteMessageForMe = useCallback(async (msgId: string) => {
        setMessages(prev => prev.filter(m => m.id !== msgId));
        const stored = await AsyncStorage.getItem(`deletedMsgs_${conversationId}`);
        const list = stored ? JSON.parse(stored) : [];
        if (!list.includes(msgId)) {
            list.push(msgId);
            await AsyncStorage.setItem(`deletedMsgs_${conversationId}`, JSON.stringify(list));
            deletedIdsRef.current = list;
        }
    }, [conversationId]);

    const deleteMessageEveryone = useCallback(async (msgId: string) => {
        const { error } = await supabase.from('messages').update({ content: '!!DELETED_FOR_ALL!!', is_deleted: true }).eq('id', msgId);
        if (error) { Alert.alert('Error', 'No se pudo eliminar el mensaje.'); return; }
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: '!!DELETED_FOR_ALL!!', is_deleted: true } : m));
    }, []);

    // ── Capsule search ────────────────────────────────────────────────────────
    const searchCapsuleUsers = useCallback(async (query: string) => {
        setCapsuleSearchQuery(query);
        if (query.length < 2) { setCapsuleSearchResults([]); return; }
        setCapsuleSearching(true);
        const { data } = await supabase.from('profiles').select('id, username, display_name, avatar_url, favorite_color').ilike('username', `%${query}%`).limit(5);
        setCapsuleSearchResults(data || []);
        setCapsuleSearching(false);
    }, []);

    const loadUserCapsules = useCallback(async (user: any) => {
        setSelectedCapsuleUser(user);
        setLoadingCapsules(true);
        const { data } = await supabase.from('capsules').select('*').eq('owner_id', user.id).eq('is_public', true).order('created_at', { ascending: false });
        setUserCapsules(data || []);
        setLoadingCapsules(false);
    }, []);

    const sendCapsule = useCallback(async (capsule: any) => {
        setCapsuleSelectorVisible(false);
        setSelectedCapsuleUser(null);
        setCapsuleSearchQuery('');
        setCapsuleSearchResults([]);
        await sendMessage(capsule.id, undefined, 'capsule');
    }, [sendMessage]);

    // ── Long press menu ───────────────────────────────────────────────────────


    const formatMessageTime = useCallback((dateStr: string) => {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            const now = new Date();
            const isToday = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
            const hh = date.getHours().toString().padStart(2, '0');
            const mm = date.getMinutes().toString().padStart(2, '0');
            return isToday ? `${hh}:${mm}` : `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')} ${hh}:${mm}`;
        } catch { return ''; }
    }, []);

    // ── Render message ────────────────────────────────────────────────────────
    const handleSwipeDelete = useCallback((item: any) => {
        const isMe = item.sender_id === currentUserId;
        if (isMe) {
            Alert.alert('Eliminar mensaje', '¿Para quién?', [
                { text: 'Para todos', style: 'destructive', onPress: () => deleteMessageEveryone(item.id) },
                { text: 'Solo para mí', style: 'destructive', onPress: () => deleteMessageForMe(item.id) },
                { text: 'Cancelar', style: 'cancel' },
            ]);
        } else {
            deleteMessageForMe(item.id);
        }
    }, [currentUserId, deleteMessageEveryone, deleteMessageForMe]);

    const renderMessage = useCallback(({ item, index }: any) => {
        const isMe = item.sender_id === currentUserId;
        const prevMsg = index < messages.length - 1 ? messages[index + 1] : null;
        const nextMsg = index > 0 ? messages[index - 1] : null;
        const senderChanged = !prevMsg || prevMsg.sender_id !== item.sender_id;
        const nextDiff = !nextMsg || nextMsg.sender_id !== item.sender_id;
        const isDeleted = item.is_deleted || item.content === '!!DELETED_FOR_ALL!!';
        const repliedMsg = item.replying_to_id ? messages.find(m => m.id === item.replying_to_id) : null;

        if (deletedIdsRef.current.includes(item.id)) return null;

        return (
            <SwipeableMessage
                isMe={isMe}
                isDeleted={isDeleted}
                onReply={() => setReplyingTo(item)}
                onDelete={() => handleSwipeDelete(item)}
            >
                <View style={[
                    styles.msgWrapper,
                    senderChanged && styles.msgWrapperSpaced,
                    isMe ? styles.myMsg : styles.theirMsg,
                ]}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
                        {/* Their avatar */}
                        {!isMe && (
                            <View style={styles.bubbleAvatarSlot}>
                                {nextDiff ? (
                                    <Image
                                        source={{ uri: Colors.getAvatarUrl(otherUser?.avatar_url, otherUser?.display_name || otherUser?.username, otherUser?.favorite_color) }}
                                        style={styles.bubbleAvatar}
                                    />
                                ) : <View style={styles.bubbleAvatarSpacer} />}
                            </View>
                        )}

                        {/* Bubble */}
                        <TouchableOpacity
                            activeOpacity={0.88}
                            style={[
                                styles.bubble,
                                isMe ? styles.myBubble : styles.theirBubble,
                                isDeleted && styles.deletedBubble,
                                {
                                    shadowColor: isMe ? PALETTE.myBubble : '#000',
                                    shadowOffset: { width: 0, height: 2 },
                                    shadowOpacity: isMe ? 0.2 : 0.05,
                                    shadowRadius: 4,
                                    elevation: 2,
                                }
                            ]}
                        >
                            {isDeleted ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Ionicons name="ban-outline" size={13} color={PALETTE.deletedText} />
                                    <Text style={styles.deletedText}>Mensaje eliminado</Text>
                                </View>
                            ) : (
                                <>
                                    {/* Reply preview */}
                                    {repliedMsg && (
                                        <View style={[styles.replyInBubble, isMe ? styles.myReplyInBubble : styles.theirReplyInBubble]}>
                                            <Text style={{ fontSize: 11, fontFamily: Fonts.bold, color: isMe ? 'rgba(255,255,255,0.9)' : PALETTE.myBubble, marginBottom: 2 }}>
                                                {repliedMsg.sender_id === currentUserId ? 'Tú' : (otherUser?.display_name || 'User')}
                                            </Text>
                                            <Text style={{ fontSize: 12, color: isMe ? 'rgba(255,255,255,0.8)' : PALETTE.theirText }} numberOfLines={2}>
                                                {repliedMsg.content}
                                            </Text>
                                        </View>
                                    )}

                                    {/* Image */}
                                    {item.media_type === 'image' && (item.mediaUrl || item.media_url) && (
                                        <TouchableOpacity activeOpacity={0.9} onPress={() => { setViewerUrl(item.mediaUrl || item.media_url); setViewerVisible(true); }}>
                                            <Image source={{ uri: item.mediaUrl || item.media_url }} style={{ width: 215, height: 215, borderRadius: 14, marginBottom: 4 }} resizeMode="cover" />
                                        </TouchableOpacity>
                                    )}

                                    {/* Video */}
                                    {item.media_type === 'video' && (item.mediaUrl || item.media_url) && (
                                        <View style={{ width: 215, height: 215, borderRadius: 14, marginBottom: 4, overflow: 'hidden' }}>
                                            <Video source={{ uri: item.mediaUrl || item.media_url }} style={{ width: '100%', height: '100%' }} useNativeControls isLooping resizeMode={"cover" as any} />
                                        </View>
                                    )}

                                    {/* Audio */}
                                    {item.media_type === 'audio' && (item.mediaUrl || item.media_url) && (
                                        <AudioMessageBubble uri={item.mediaUrl || item.media_url} isMe={isMe} />
                                    )}

                                    {/* Location */}
                                    {item.media_type === 'location' && item.content && (() => {
                                        const [lat, lng] = item.content.split(',');
                                        const mapUrl = `https://static-maps.yandex.ru/1.x/?ll=${lng},${lat}&z=14&l=map&size=450,250&pt=${lng},${lat},pm2rdm`;
                                        return (
                                            <TouchableOpacity 
                                                activeOpacity={0.88}
                                                onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`)}
                                                style={{
                                                    width: 235,
                                                    borderRadius: 20,
                                                    overflow: 'hidden',
                                                    backgroundColor: isMe ? 'rgba(255,255,255,0.15)' : '#FFFFFF',
                                                    borderWidth: 1,
                                                    borderColor: isMe ? 'rgba(255,255,255,0.25)' : PALETTE.theirBorder,
                                                }}
                                            >
                                                <View style={{ height: 120, backgroundColor: isMe ? 'rgba(255,255,255,0.05)' : '#F0F0F0' }}>
                                                    <Image source={{ uri: mapUrl }} style={{ flex: 1 }} />
                                                    <View style={{ position: 'absolute', top: 10, right: 10, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 }}>
                                                        <Ionicons name="location" size={18} color="#9B7FD4" />
                                                    </View>
                                                </View>
                                                <View style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={{ fontSize: 14, fontFamily: Fonts.bold, color: isMe ? '#fff' : '#2D2541' }}>Ubicación Compartida</Text>
                                                        <Text style={{ fontSize: 11, color: isMe ? 'rgba(255,255,255,0.7)' : PALETTE.theirTimestamp, marginTop: 1 }}>Ver en Google Maps</Text>
                                                    </View>
                                                    <Ionicons name="chevron-forward" size={15} color={isMe ? 'rgba(255,255,255,0.6)' : '#9B7FD4'} />
                                                </View>
                                            </TouchableOpacity>
                                        );
                                    })()}

                                    {/* Capsule */}
                                    {item.media_type === 'capsule' && item.content && (
                                        <ChatCapsuleCard capsuleId={item.content} isMe={isMe} />
                                    )}

                                    {/* Text */}
                                    {(!item.media_type || item.media_type === 'text' || (item.content?.trim() && !['capsule', 'location'].includes(item.media_type))) && (
                                        <Text style={[styles.msgText, isMe ? styles.myMsgText : styles.theirMsgText]}>{item.content}</Text>
                                    )}
                                </>
                            )}

                            {/* Footer */}
                            <View style={styles.msgFooter}>
                                <Text style={[isMe ? styles.myMsgTime : styles.msgTime]}>{formatMessageTime(item.created_at)}</Text>
                                {isMe && !isDeleted && (
                                    <Ionicons
                                        name={item.is_read ? 'checkmark-done' : 'checkmark'}
                                        size={13}
                                        color={item.is_read ? PALETTE.myCheckmarkRead : PALETTE.myCheckmark}
                                    />
                                )}
                            </View>
                        </TouchableOpacity>

                        {/* My avatar */}
                        {isMe && (
                            <View style={styles.bubbleAvatarSlot}>
                                {nextDiff ? (
                                    <Image
                                        source={{ uri: Colors.getAvatarUrl(myUserProfile?.avatar_url, myUserProfile?.display_name || myUserProfile?.username, myUserProfile?.favorite_color) }}
                                        style={[styles.bubbleAvatar, styles.myBubbleAvatar]}
                                    />
                                ) : <View style={styles.bubbleAvatarSpacer} />}
                            </View>
                        )}
                    </View>
                </View>
            </SwipeableMessage>
        );

    }, [currentUserId, messages, otherUser, myUserProfile, formatMessageTime, handleSwipeDelete]);

    const keyExtractor = useCallback((item: any) => item.id, []);

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={20} color="#2D2541" />
                </TouchableOpacity>

                <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                        if (conversation?.is_group) { setNewGroupName(conversation.name || ''); setGroupSettingsVisible(true); }
                        else if (otherUser) (navigation as any).navigate('UserProfile', { targetUserId: otherUser.id });
                    }}
                    style={styles.headerUserInfo}
                >
                    {conversation?.is_group ? (
                        conversation?.avatar_url
                            ? <Image source={{ uri: conversation.avatar_url }} style={styles.headerAvatar} />
                            : <View style={[styles.headerAvatar, { backgroundColor: PALETTE.locationBg, alignItems: 'center', justifyContent: 'center' }]}>
                                <Ionicons name="people-outline" size={16} color={PALETTE.myBubble} />
                            </View>
                    ) : (
                        <Image source={{ uri: Colors.getAvatarUrl(otherUser?.avatar_url, otherUser?.display_name || otherUser?.username, otherUser?.favorite_color) }} style={styles.headerAvatar} />
                    )}
                    <View>
                        <Text style={styles.headerTitle}>
                            {conversation?.is_group ? (conversation.name || 'Chat Grupal') : (otherUser?.display_name || otherUser?.username || 'Mensajes')}
                        </Text>
                        {conversation?.is_group && (
                            <Text style={styles.headerSubtitle}>{groupParticipants.length + 1} participantes · Toca para editar</Text>
                        )}
                    </View>
                </TouchableOpacity>

                <View style={{ width: 38 }} />
            </View>

            {/* Content */}
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>

                {/* Reply banner */}
                {replyingTo && (
                    <View style={styles.replyBanner}>
                        <View style={styles.replyContent}>
                            <Text style={styles.replyLabel}>
                                Respondiendo a {replyingTo.sender_id === currentUserId ? 'ti mismo' : (otherUser?.display_name || 'User')}
                            </Text>
                            <Text style={styles.replyPreview} numberOfLines={1}>{replyingTo.content}</Text>
                        </View>
                        <TouchableOpacity onPress={() => setReplyingTo(null)} style={{ padding: 4 }}>
                            <Ionicons name="close-circle-outline" size={20} color={PALETTE.replyMuted} />
                        </TouchableOpacity>
                    </View>
                )}

                {loading ? (
                    <View style={styles.centered}><ActivityIndicator color={PALETTE.myBubble} /></View>
                ) : (
                    <FlatList
                        data={messages}
                        keyExtractor={keyExtractor}
                        renderItem={renderMessage}
                        contentContainerStyle={styles.list}
                        showsVerticalScrollIndicator={false}
                        removeClippedSubviews
                        inverted
                        onEndReached={loadMoreMessages}
                        onEndReachedThreshold={0.5}
                        ListFooterComponent={loadingMore
                            ? <ActivityIndicator color={PALETTE.myBubble} style={{ marginVertical: 12 }} />
                            : null}
                    />
                )}

                {/* Input row */}
                <View style={[styles.inputRow, { paddingBottom: isKeyboardVisible ? 6 : Math.max(insets.bottom || 16, Spacing.md) }]}>
                    {/* Toolbar Buttons */}
                    <RNAnimated.View style={{ 
                        flexDirection: 'row', 
                        overflow: 'hidden',
                        width: inputAnimation.interpolate({
                            inputRange: [0, 1],
                            outputRange: [160, 0] // 4 buttons * ~40px
                        }),
                        opacity: inputAnimation.interpolate({
                            inputRange: [0, 0.5, 1],
                            outputRange: [1, 0, 0]
                        })
                    }}>
                        <TouchableOpacity style={styles.toolbarBtn} onPress={handleCamera} activeOpacity={0.7}>
                            <Ionicons name="camera-outline" size={22} color={PALETTE.toolbarIcon} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.toolbarBtn} onPress={handleGallery} activeOpacity={0.7}>
                            <Ionicons name="image-outline" size={22} color={PALETTE.toolbarIcon} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.toolbarBtn} onPress={handleLocation} activeOpacity={0.7}>
                            <Ionicons name="location-outline" size={22} color={PALETTE.toolbarIcon} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.toolbarBtn} onPress={() => setCapsuleSelectorVisible(true)} activeOpacity={0.7}>
                            <Ionicons name="layers-outline" size={22} color={PALETTE.toolbarIconActive} />
                        </TouchableOpacity>
                    </RNAnimated.View>

                    {/* Expandable spacer if buttons are hidden */}
                    {newMessage.trim() === '' && (
                        <TouchableOpacity 
                            style={{ paddingHorizontal: 12 }} 
                            onPress={() => {}}
                        >
                        </TouchableOpacity>
                    )}

                    {/* Text input / recording indicator */}
                    <View style={{ flex: 1 }}>
                        {isRecordingAudio ? (
                            <View style={styles.recordingWrap}>
                                <View style={styles.recordingDot} />
                                <Text style={styles.recordingText}>
                                    {Math.floor(recordingDuration / 60)}:{String(recordingDuration % 60).padStart(2, '0')}
                                </Text>
                                <TouchableOpacity style={styles.recordingCancel} onPress={cancelRecording}>
                                    <Text style={styles.recordingCancelText}>Cancelar</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={styles.inputWrap}>
                                <TextInput
                                    style={styles.input}
                                    value={newMessage}
                                    onChangeText={setNewMessage}
                                    placeholder="Escribe un mensaje..."
                                    placeholderTextColor={PALETTE.inputPlaceholder}
                                    multiline
                                    onFocus={() => setIsInputFocused(true)}
                                    onBlur={() => setIsInputFocused(false)}
                                />
                            </View>
                        )}
                    </View>

                    {/* Send / Mic */}
                    {newMessage.trim() ? (
                        <TouchableOpacity style={styles.sendBtn} activeOpacity={0.82} onPress={() => sendMessage()}>
                            <Ionicons name="send" size={16} color="#fff" />
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            style={[styles.sendBtn, isRecordingAudio && styles.sendBtnRecord]}
                            activeOpacity={0.82}
                            onPress={() => isRecordingAudio ? stopRecording() : startRecording()}
                            onLongPress={startRecording}
                            onPressOut={() => { if (isRecordingAudio && !isCancelled.current) stopRecording(); }}
                            {...({
                                onStartShouldSetResponder: () => true,
                                onResponderMove: (e: any) => {
                                    if (isRecordingAudio && e.nativeEvent.locationX < -60) cancelRecording();
                                },
                            } as any)}
                        >
                            <Ionicons name={isRecordingAudio ? 'stop' : 'mic-outline'} size={18} color="#fff" />
                        </TouchableOpacity>
                    )}
                </View>
            </KeyboardAvoidingView>

            {/* ── Capsule Selector Modal ── */}
            <Modal visible={capsuleSelectorVisible} transparent animationType="slide">
                <View style={{ flex: 1, backgroundColor: 'rgba(45,37,65,0.45)', justifyContent: 'flex-end' }}>
                    <View style={{ backgroundColor: Colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, height: '80%', padding: 20 }}>
                        <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#E0D9F0', alignSelf: 'center', marginBottom: 18 }} />
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                            <Text style={{ fontSize: 17, fontFamily: Fonts.bold, color: '#2D2541' }}>Compartir Cápsula</Text>
                            <TouchableOpacity onPress={() => { setCapsuleSelectorVisible(false); setSelectedCapsuleUser(null); }} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: PALETTE.locationBg, alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="close" size={18} color="#2D2541" />
                            </TouchableOpacity>
                        </View>

                        {selectedCapsuleUser ? (
                            <View style={{ flex: 1 }}>
                                <TouchableOpacity onPress={() => setSelectedCapsuleUser(null)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, padding: 8, borderRadius: 10, backgroundColor: PALETTE.locationBg, alignSelf: 'flex-start' }}>
                                    <Ionicons name="arrow-back" size={16} color={PALETTE.myBubble} />
                                    <Text style={{ fontFamily: Fonts.bold, color: PALETTE.myBubble, fontSize: 13 }}>Cápsulas de {selectedCapsuleUser?.display_name || selectedCapsuleUser?.username}</Text>
                                </TouchableOpacity>
                                {loadingCapsules ? <ActivityIndicator color={PALETTE.myBubble} /> : (
                                    <FlatList
                                        data={userCapsules}
                                        keyExtractor={c => c.id}
                                        renderItem={({ item }) => (
                                            <TouchableOpacity onPress={() => sendCapsule(item)} style={{ flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: PALETTE.locationBg, borderRadius: 14, marginBottom: 8, gap: 12 }}>
                                                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: PALETTE.myBubble + '22', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Ionicons name="layers-outline" size={20} color={PALETTE.myBubble} />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ fontFamily: Fonts.bold, color: '#2D2541' }}>{item.title}</Text>
                                                    <Text style={{ fontSize: 12, color: PALETTE.theirTimestamp, marginTop: 2 }}>{item.status === 'opened' ? 'Abierta' : 'Sellada'}</Text>
                                                </View>
                                                <Ionicons name="send-outline" size={16} color={PALETTE.myBubble} />
                                            </TouchableOpacity>
                                        )}
                                        ListEmptyComponent={<Text style={{ textAlign: 'center', color: PALETTE.theirTimestamp, marginTop: 24 }}>Sin cápsulas públicas disponibles.</Text>}
                                    />
                                )}
                            </View>
                        ) : (
                            <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: PALETTE.locationBg, paddingHorizontal: 12, borderRadius: 14, marginBottom: 16, borderWidth: 1, borderColor: PALETTE.inputBorder }}>
                                    <Ionicons name="search-outline" size={16} color={PALETTE.theirTimestamp} />
                                    <TextInput style={{ flex: 1, padding: 11, fontFamily: Fonts.regular, color: '#2D2541' }} placeholder="Buscar usuario..." placeholderTextColor={PALETTE.inputPlaceholder} value={capsuleSearchQuery} onChangeText={searchCapsuleUsers} />
                                </View>
                                <FlatList
                                    data={capsuleSearchResults}
                                    keyExtractor={u => u.id}
                                    renderItem={({ item }) => (
                                        <TouchableOpacity onPress={() => loadUserCapsules(item)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: PALETTE.theirBorder }}>
                                            <Image source={{ uri: Colors.getAvatarUrl(item.avatar_url, item.display_name || item.username) }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                                            <View>
                                                <Text style={{ fontFamily: Fonts.bold, color: '#2D2541' }}>{item.display_name || item.username}</Text>
                                                <Text style={{ fontSize: 12, color: PALETTE.theirTimestamp }}>@{item.username}</Text>
                                            </View>
                                        </TouchableOpacity>
                                    )}
                                    ListEmptyComponent={
                                        capsuleSearchQuery.length < 2 ? (
                                            <TouchableOpacity
                                                onPress={async () => {
                                                    const { data: { user } } = await supabase.auth.getUser();
                                                    if (user) { const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single(); if (p) loadUserCapsules(p); }
                                                }}
                                                style={{ alignItems: 'center', padding: 22, backgroundColor: PALETTE.locationBg, borderRadius: 18, borderWidth: 1, borderColor: PALETTE.theirBorder, borderStyle: 'dashed' }}
                                            >
                                                <Ionicons name="person-circle-outline" size={26} color={PALETTE.myBubble} />
                                                <Text style={{ color: PALETTE.myBubble, fontFamily: Fonts.bold, marginTop: 8, fontSize: 14 }}>Mis Cápsulas</Text>
                                            </TouchableOpacity>
                                        ) : null
                                    }
                                />
                            </View>
                        )}
                    </View>
                </View>
            </Modal>

            {/* ── Fullscreen image viewer ── */}
            <Modal visible={viewerVisible} transparent animationType="fade" onRequestClose={() => setViewerVisible(false)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(20,15,35,0.95)', alignItems: 'center', justifyContent: 'center' }}>
                    <TouchableOpacity style={{ position: 'absolute', top: 52, right: 20, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }} onPress={() => setViewerVisible(false)}>
                        <Ionicons name="close" size={22} color="#fff" />
                    </TouchableOpacity>
                    <Image source={{ uri: viewerUrl }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                </View>
            </Modal>

            {/* ── Group Settings Modal ── */}
            <Modal visible={groupSettingsVisible} transparent animationType="slide" onRequestClose={() => setGroupSettingsVisible(false)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(45,37,65,0.45)', justifyContent: 'flex-end' }}>
                    <View style={{ backgroundColor: Colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 36 }}>
                        <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#E0D9F0', alignSelf: 'center', marginTop: 14, marginBottom: 20 }} />

                        {/* Group avatar */}
                        <TouchableOpacity onPress={changeGroupAvatar} activeOpacity={0.7} style={{ alignItems: 'center', marginBottom: 18 }}>
                            {conversation?.avatar_url
                                ? <Image source={{ uri: conversation.avatar_url }} style={{ width: 74, height: 74, borderRadius: 37, borderWidth: 3, borderColor: PALETTE.theirBorder }} />
                                : <View style={{ width: 74, height: 74, borderRadius: 37, backgroundColor: PALETTE.locationBg, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: PALETTE.theirBorder }}>
                                    <Ionicons name="people-outline" size={28} color={PALETTE.myBubble} />
                                </View>
                            }
                            <Text style={{ fontSize: 12, color: PALETTE.myBubble, fontFamily: Fonts.medium, marginTop: 7 }}>Cambiar foto</Text>
                        </TouchableOpacity>

                        {/* Group name */}
                        <View style={{ paddingHorizontal: 20, marginBottom: 18 }}>
                            <Text style={{ fontSize: 11, fontFamily: Fonts.semiBold, color: PALETTE.theirTimestamp, letterSpacing: 0.8, marginBottom: 8 }}>NOMBRE DEL GRUPO</Text>
                            <TextInput
                                style={{ backgroundColor: PALETTE.locationBg, padding: 13, borderRadius: 14, color: '#2D2541', fontSize: 15, borderWidth: 1.5, borderColor: PALETTE.inputBorder, fontFamily: Fonts.regular }}
                                placeholder="Nombre del grupo..."
                                placeholderTextColor={PALETTE.inputPlaceholder}
                                value={newGroupName}
                                onChangeText={setNewGroupName}
                            />
                        </View>

                        {/* Participants */}
                        <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
                            <Text style={{ fontSize: 11, fontFamily: Fonts.semiBold, color: PALETTE.theirTimestamp, letterSpacing: 0.8, marginBottom: 10 }}>PARTICIPANTES ({groupParticipants.length + 1})</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                {groupParticipants.map(p => (
                                    <View key={p.id} style={{ alignItems: 'center', marginRight: 14 }}>
                                        {p.avatar_url
                                            ? <Image source={{ uri: p.avatar_url }} style={{ width: 42, height: 42, borderRadius: 21, borderWidth: 2, borderColor: PALETTE.theirBorder }} />
                                            : <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: PALETTE.locationBg, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="person-outline" size={18} color={PALETTE.myBubble} /></View>
                                        }
                                        <Text style={{ fontSize: 10, color: PALETTE.replyMuted, marginTop: 4, maxWidth: 50 }} numberOfLines={1}>{p.display_name || p.username}</Text>
                                    </View>
                                ))}
                            </ScrollView>
                        </View>

                        {/* Actions */}
                        <View style={{ paddingHorizontal: 20, gap: 10 }}>
                            <TouchableOpacity style={{ padding: 14, borderRadius: 16, backgroundColor: PALETTE.myBubble, alignItems: 'center', shadowColor: PALETTE.myBubble, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.28, shadowRadius: 6, elevation: 4 }} onPress={renameGroup}>
                                <Text style={{ fontFamily: Fonts.bold, color: '#fff', fontSize: 15 }}>Guardar nombre</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={{ padding: 14, borderRadius: 16, backgroundColor: '#FFF0F0', alignItems: 'center', borderWidth: 1, borderColor: '#FFCDD2' }} onPress={() => { setGroupSettingsVisible(false); leaveGroup(); }}>
                                <Text style={{ fontFamily: Fonts.bold, color: '#E57373', fontSize: 15 }}>Abandonar grupo</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={{ padding: 14, borderRadius: 16, backgroundColor: PALETTE.locationBg, alignItems: 'center' }} onPress={() => setGroupSettingsVisible(false)}>
                                <Text style={{ fontFamily: Fonts.bold, color: '#2D2541', fontSize: 15 }}>Cancelar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    </GestureHandlerRootView>
    );
}