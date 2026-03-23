import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, Modal, Image,
    TouchableOpacity, Animated, Easing,
    StyleSheet as RNStyleSheet,
    Dimensions, Pressable, StatusBar, TextInput, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Fonts } from '../theme';
import { timerConfigManager } from '../utils/timerConfig';
import { MODEL_IMAGES } from '../constants/models';
import { supabase } from '../lib/supabase';

const { width, height } = Dimensions.get('window');
const STORY_DURATION = 8000; // 8 seconds per story

// ─── Expiry countdown hook ──────────────────────────────────────────────────────
function useExpiryCountdown(expiresAt?: string | null): string | null {
    const [label, setLabel] = useState<string | null>(null);

    useEffect(() => {
        if (!expiresAt) { setLabel(null); return; }

        const compute = () => {
            const diffMs = new Date(expiresAt).getTime() - Date.now();
            if (diffMs <= 0) { setLabel('Expired'); return; }
            const totalSecs = Math.floor(diffMs / 1000);
            const days  = Math.floor(totalSecs / 86400);
            const hours = Math.floor((totalSecs % 86400) / 3600);
            const mins  = Math.floor((totalSecs % 3600) / 60);
            if (days > 0)  setLabel(`${days}d ${hours}h left`);
            else if (hours > 0) setLabel(`${hours}h ${mins}m left`);
            else           setLabel(`${mins}m left`);
        };

        compute();
        const iv = setInterval(compute, 60_000);
        return () => clearInterval(iv);
    }, [expiresAt]);

    return label;
}

// ─── Heart burst animation ────────────────────────────────────────────────────
function HeartBurst({ trigger }: { trigger: number }) {
    const particles = useRef(
        Array.from({ length: 6 }, () => ({
            x: new Animated.Value(0),
            y: new Animated.Value(0),
            opacity: new Animated.Value(0),
            scale: new Animated.Value(0),
        }))
    ).current;

    useEffect(() => {
        if (trigger === 0) return;
        const angles = [0, 60, 120, 180, 240, 300];
        const anims = particles.map((p, i) => {
            const angle = (angles[i] * Math.PI) / 180;
            const dist = 32 + Math.random() * 20;
            p.x.setValue(0); p.y.setValue(0); p.opacity.setValue(0); p.scale.setValue(0);
            return Animated.parallel([
                Animated.timing(p.opacity, { toValue: 1, duration: 120, useNativeDriver: true }),
                Animated.spring(p.scale, { toValue: 0.8, friction: 4, tension: 100, useNativeDriver: true }),
                Animated.timing(p.x, { toValue: Math.cos(angle) * dist, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                Animated.timing(p.y, { toValue: Math.sin(angle) * dist, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                Animated.sequence([
                    Animated.delay(250),
                    Animated.timing(p.opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
                ]),
            ]);
        });
        Animated.parallel(anims).start();
    }, [trigger]);

    return (
        <View style={{ position: 'absolute', width: 0, height: 0, alignItems: 'center', justifyContent: 'center' }}>
            {particles.map((p, i) => (
                <Animated.Text
                    key={i}
                    style={{
                        position: 'absolute',
                        fontSize: 14,
                        opacity: p.opacity,
                        transform: [{ translateX: p.x }, { translateY: p.y }, { scale: p.scale }],
                    }}
                >
                    ❤️
                </Animated.Text>
            ))}
        </View>
    );
}

// ─── Like button ──────────────────────────────────────────────────────────────
function LikeButton({ hasLiked, count, onPress, isOwner }: {
    hasLiked: boolean; count: number; onPress: () => void; isOwner: boolean;
}) {
    const scale = useRef(new Animated.Value(1)).current;
    const rotation = useRef(new Animated.Value(0)).current;
    const [burstTrigger, setBurstTrigger] = useState(0);

    const handlePress = () => {
        if (!hasLiked && !isOwner) {
            setBurstTrigger(t => t + 1);
            Animated.sequence([
                Animated.parallel([
                    Animated.spring(scale, { toValue: 1.5, friction: 3, tension: 100, useNativeDriver: true }),
                    Animated.timing(rotation, { toValue: 1, duration: 200, useNativeDriver: true }),
                ]),
                Animated.spring(scale, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }),
                Animated.timing(rotation, { toValue: 0, duration: 150, useNativeDriver: true }),
            ]).start();
        } else {
            Animated.sequence([
                Animated.timing(scale, { toValue: 0.85, duration: 80, useNativeDriver: true }),
                Animated.spring(scale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
            ]).start();
        }
        onPress();
    };

    const rotateDeg = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-20deg'] });

    return (
        <TouchableOpacity onPress={handlePress} activeOpacity={0.9} style={lb.wrap}>
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                <HeartBurst trigger={burstTrigger} />
                <Animated.View style={{ transform: [{ scale }, { rotate: rotateDeg }] }}>
                    <View style={[lb.iconWrap, hasLiked && lb.iconWrapLiked]}>
                        <Ionicons
                            name={hasLiked ? 'heart' : 'heart-outline'}
                            size={22}
                            color={hasLiked ? '#FF3B30' : '#fff'}
                        />
                    </View>
                </Animated.View>
            </View>
            {count > 0 && <Text style={lb.count}>{count}</Text>}
        </TouchableOpacity>
    );
}

const lb = StyleSheet.create({
    wrap: { alignItems: 'center', gap: 5 },
    iconWrap: {
        width: 46, height: 46, borderRadius: 23,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)',
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
            android: { elevation: 4 },
        }),
    },
    iconWrapLiked: {
        backgroundColor: 'rgba(255,59,48,0.2)',
        borderColor: 'rgba(255,59,48,0.5)',
    },
    count: {
        color: '#fff', fontSize: 12, fontFamily: Fonts.bold,
        textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
    },
});

// ─── Likers bottom sheet ──────────────────────────────────────────────────────
function LikersSheet({ visible, onClose, storyId }: { visible: boolean; onClose: () => void; storyId: string }) {
    const insets = useSafeAreaInsets();
    const [likers, setLikers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const slideAnim = useRef(new Animated.Value(300)).current;

    useEffect(() => {
        if (!visible) return;
        setLoading(true);
        Animated.spring(slideAnim, { toValue: 0, friction: 9, tension: 50, useNativeDriver: true }).start();
        supabase.from('story_likes')
            .select('user_id, profiles:user_id(id, username, display_name, avatar_url)')
            .eq('story_id', storyId)
            .order('created_at', { ascending: false })
            .then(({ data }) => { if (data) setLikers(data.map((d: any) => d.profiles)); setLoading(false); });
    }, [visible, storyId]);

    if (!visible) return null;

    return (
        <Modal visible={visible} transparent animationType="fade">
            <Pressable style={ls.overlay} onPress={onClose}>
                <Animated.View style={[ls.sheet, { paddingBottom: Math.max(insets.bottom, 20), transform: [{ translateY: slideAnim }] }]}>
                    <View style={ls.handle} />
                    <Text style={ls.title}>Likes</Text>

                    {loading ? (
                        <Text style={ls.emptyText}>Loading...</Text>
                    ) : likers.length === 0 ? (
                        <View style={ls.emptyWrap}>
                            <Ionicons name="heart-outline" size={32} color={Colors.textMuted} />
                            <Text style={ls.emptyText}>No likes yet</Text>
                        </View>
                    ) : (
                        likers.map((u, i) => (
                            <View key={i} style={ls.row}>
                                <Image source={{ uri: u.avatar_url || 'https://via.placeholder.com/150' }} style={ls.avatar} />
                                <View style={{ flex: 1 }}>
                                    <Text style={ls.name}>{u.display_name || u.username}</Text>
                                    <Text style={ls.handleText}>@{u.username}</Text>
                                </View>
                                <Ionicons name="heart" size={16} color="#FF3B30" />
                            </View>
                        ))
                    )}
                </Animated.View>
            </Pressable>
        </Modal>
    );
}

const ls = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: {
        backgroundColor: Colors.surface,
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        padding: 20, minHeight: 280,
    },
    handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 18 },
    title: { fontSize: 18, fontFamily: Fonts.bold, color: Colors.textPrimary, marginBottom: 16 },
    emptyWrap: { alignItems: 'center', paddingVertical: 30, gap: 10 },
    emptyText: { color: Colors.textMuted, fontSize: 14, fontFamily: Fonts.medium, textAlign: 'center', marginTop: 10 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.border },
    name: { fontSize: 14, fontFamily: Fonts.bold, color: Colors.textPrimary },
    handleText: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.textMuted, marginTop: 1 },
});

// ─── Main StoryViewer ─────────────────────────────────────────────────────────
interface StoryViewerProps {
    visible: boolean;
    userGroup: any;
    onClose: () => void;
    onNextUser?: () => void;
    onPrevUser?: () => void;
    currentUserId?: string;
    onStoryRead?: (storyId: string) => void;
}

export default function StoryViewer({ visible, userGroup, onClose, onNextUser, onPrevUser, currentUserId, onStoryRead }: StoryViewerProps) {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();

    const [activeIndex, setActiveIndex] = useState(0);
    const [progress] = useState(new Animated.Value(0));
    const [isPaused, setIsPaused] = useState(false);

    const [likesData, setLikesData] = useState<Record<string, { count: number; hasLiked: boolean }>>({});
    const [showLikersId, setShowLikersId] = useState<string | null>(null);

    const [storyComments, setStoryComments] = useState<any[]>([]);
    const [activeComment, setActiveComment] = useState<any>(null);
    const [currentComment, setCurrentComment] = useState('');
    const [inputFocused, setInputFocused] = useState(false);
    const commentFadeAnim = useRef(new Animated.Value(0)).current;
    const progressRef = useRef(0);
    const lastGroupRef = useRef<any>(null);

    const ownerId = userGroup?.owner_id || userGroup?.id;
    const isOwner = ownerId === currentUserId;

    // Expiry countdown for the current story
    const currentStoryForHook = userGroup?.stories?.[activeIndex];
    const expiryLabel = useExpiryCountdown(currentStoryForHook?.expires_at);

    // Track progress value
    useEffect(() => {
        const sub = progress.addListener(({ value }) => { progressRef.current = value; });
        return () => progress.removeListener(sub);
    }, [progress]);

    // On story change
    useEffect(() => {
        if (!visible || !userGroup) return;
        if (lastGroupRef.current !== userGroup) {
            lastGroupRef.current = userGroup;
            const firstUnread = userGroup.stories.findIndex((s: any) => !s.is_read);
            if (firstUnread > 0) { setActiveIndex(firstUnread); return; }
        }
        progress.stopAnimation(); progress.setValue(0); progressRef.current = 0;
        const story = userGroup.stories[activeIndex];
        if (story) {
            if (!likesData[story.id]) fetchLikes(story.id);
            fetchComments(story.id);
        }
    }, [activeIndex, userGroup, visible]);

    useEffect(() => { if (!visible) lastGroupRef.current = null; }, [visible]);

    // Progress timer
    useEffect(() => {
        if (!visible || !userGroup || isPaused || !!showLikersId || inputFocused) {
            progress.stopAnimation(); return;
        }
        const remaining = STORY_DURATION * (1 - progressRef.current);
        const anim = Animated.timing(progress, { toValue: 1, duration: remaining, easing: Easing.linear, useNativeDriver: false });
        anim.start(({ finished }) => { if (finished) nextStory(); });
        const story = userGroup.stories[activeIndex];
        if (story && !story.is_read && onStoryRead) onStoryRead(story.id);
        return () => anim.stop();
    }, [visible, userGroup, activeIndex, isPaused, showLikersId, inputFocused]);

    // Rotate comments
    useEffect(() => {
        if (!storyComments.length) { setActiveComment(null); return; }
        let idx = 0;
        setActiveComment(storyComments[0]);
        commentFadeAnim.setValue(0);
        Animated.timing(commentFadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
        const iv = setInterval(() => {
            Animated.timing(commentFadeAnim, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => {
                idx = (idx + 1) % storyComments.length;
                setActiveComment(storyComments[idx]);
                Animated.timing(commentFadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
            });
        }, 3500);
        return () => clearInterval(iv);
    }, [storyComments]);

    const fetchLikes = async (sid: string) => {
        const { count } = await supabase.from('story_likes').select('*', { count: 'exact', head: true }).eq('story_id', sid);
        let hasLiked = false;
        if (currentUserId) {
            const { data } = await supabase.from('story_likes').select('id').eq('story_id', sid).eq('user_id', currentUserId).maybeSingle();
            hasLiked = !!data;
        }
        setLikesData(p => ({ ...p, [sid]: { count: count || 0, hasLiked } }));
    };

    const fetchComments = async (sid: string) => {
        const { data } = await supabase.from('story_comments')
            .select('*, profiles:user_id(id, username, display_name, avatar_url)')
            .eq('story_id', sid).order('created_at', { ascending: true });
        if (data) setStoryComments(data);
    };

    const handleToggleLike = async (sid: string) => {
        if (!currentUserId) return;
        const cur = likesData[sid] || { count: 0, hasLiked: false };
        setLikesData(p => ({ ...p, [sid]: { count: cur.hasLiked ? Math.max(0, cur.count - 1) : cur.count + 1, hasLiked: !cur.hasLiked } }));
        if (cur.hasLiked) {
            await supabase.from('story_likes').delete().eq('story_id', sid).eq('user_id', currentUserId);
        } else {
            await supabase.from('story_likes').insert({ story_id: sid, user_id: currentUserId });
            if (ownerId && ownerId !== currentUserId) {
                await supabase.from('notifications').insert({ user_id: ownerId, sender_id: currentUserId, type: 'story_like', message: 'ha dado like a tu Flash', is_read: false });
            }
        }
    };

    const handleSendComment = async () => {
        if (!currentComment.trim() || !currentUserId) return;
        const story = userGroup.stories[activeIndex];
        if (!story) return;
        const { data } = await supabase.from('story_comments')
            .insert({ story_id: story.id, user_id: currentUserId, content: currentComment.trim() })
            .select('*, profiles:user_id(id, username, display_name, avatar_url)')
            .single();
        if (data) { setStoryComments(p => [...p, data]); setCurrentComment(''); }
    };

    const nextStory = () => {
        if (activeIndex < userGroup.stories.length - 1) { setActiveIndex(p => p + 1); }
        else { onNextUser ? (onNextUser(), setActiveIndex(0)) : onClose(); }
    };

    const prevStory = () => {
        if (activeIndex > 0) setActiveIndex(p => p - 1);
        else if (onPrevUser) onPrevUser();
    };

    if (!visible || !userGroup) return null;
    const story = userGroup.stories[activeIndex];
    if (!story) return null;

    const capsuleId = story.capsule_id || story.capsules?.id;

    return (
        <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
            <View style={s.root}>
                <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

                {/* Background image */}
                <Image source={{ uri: story.media_url }} style={StyleSheet.absoluteFill} resizeMode="contain" />

                {/* Gradient overlays */}
                <LinearGradient
                    colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.5)']}
                    locations={[0, 0.2, 0.7, 1]}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                />

                {/* Filter overlay */}
                {story.metadata?.filter && story.metadata.filter !== 'none' && (
                    <View style={[StyleSheet.absoluteFill, {
                        backgroundColor: story.metadata.filter === 'vintage' ? 'rgba(230,190,120,0.25)' :
                            story.metadata.filter === 'warm' ? 'rgba(255,150,50,0.18)' :
                                story.metadata.filter === 'cool' ? 'rgba(0,150,255,0.18)' :
                                    story.metadata.filter === 'dark' ? 'rgba(0,0,0,0.4)' : 'transparent'
                    }]} pointerEvents="none" />
                )}

                {/* Text overlays */}
                {story.metadata?.texts?.map((t: any) => (
                    <View key={t.id} style={{ position: 'absolute', top: t.y * height, left: t.x * width - 50 }} pointerEvents="none">
                        <View style={{ backgroundColor: t.bg || 'rgba(0,0,0,0.5)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }}>
                            <Text style={{ color: t.color || '#fff', fontSize: 18, fontFamily: Fonts.bold }}>{t.text}</Text>
                        </View>
                    </View>
                ))}
                {story.metadata?.emojis?.map((e: any) => (
                    <Text key={e.id} style={{ position: 'absolute', top: e.y * height, left: e.x * width, fontSize: 32 }} pointerEvents="none">{e.emoji}</Text>
                ))}

                {/* ── HEADER ── */}
                <View style={[s.header, { paddingTop: insets.top + 10 }]}>
                    {/* Progress bars */}
                    <View style={s.progressRow}>
                        {userGroup.stories.map((st: any, i: number) => (
                            <View key={st.id} style={s.progressBg}>
                                <Animated.View style={[s.progressFill, {
                                    width: i < activeIndex ? '100%' :
                                        i === activeIndex ? progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) : '0%'
                                }]} />
                            </View>
                        ))}
                    </View>

                    {/* User info row */}
                    <View style={s.userRow}>
                        <TouchableOpacity
                            style={s.userInfo}
                            activeOpacity={0.85}
                            onPress={() => { progress.stopAnimation(); onClose(); navigation.navigate('UserProfile', { targetUserId: ownerId }); }}
                        >
                            <View style={s.avatarRing}>
                                <Image source={{ uri: userGroup.avatar_url || 'https://via.placeholder.com/150' }} style={s.avatar} />
                            </View>
                            <View>
                                <Text style={s.username}>{userGroup.display_name || userGroup.username}</Text>
                                <Text style={s.capsuleRef}>{story.capsules?.title}</Text>
                            </View>
                        </TouchableOpacity>

                        <View style={{ flex: 1 }} />

                        {/* Expiry badge — shows time left before flash disappears */}
                        {expiryLabel && (
                            <View style={s.expiryBadge}>
                                <Ionicons name="time-outline" size={10} color="rgba(255,255,255,0.85)" />
                                <Text style={s.expiryText}>{expiryLabel}</Text>
                            </View>
                        )}
                        <TouchableOpacity onPress={() => { setIsPaused(true); }} style={s.pauseArea} />
                        <TouchableOpacity onPress={onClose} style={s.closeBtn} activeOpacity={0.8}>
                            <Ionicons name="close" size={22} color="#fff" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* ── TAP GESTURE ZONES ── */}
                <View style={s.gestureLayer} pointerEvents="box-none">
                    <Pressable
                        style={s.gestureSide}
                        onPress={prevStory}
                        onPressIn={() => setIsPaused(true)}
                        onPressOut={() => setIsPaused(false)}
                    />
                    <Pressable
                        style={s.gestureMiddle}
                        onPressIn={() => setIsPaused(true)}
                        onPressOut={() => setIsPaused(false)}
                    />
                    <Pressable
                        style={s.gestureSide}
                        onPress={nextStory}
                        onPressIn={() => setIsPaused(true)}
                        onPressOut={() => setIsPaused(false)}
                    />
                </View>

                {/* ── BOTTOM AREA ── */}
                <View style={[s.bottomArea, { paddingBottom: Math.max(insets.bottom + 10, 24) }]}>

                    {/* Capsule chip — bottom left, always visible */}
                    {capsuleId && (
                        <TouchableOpacity
                            style={s.capsuleChip}
                            activeOpacity={0.9}
                            onPress={() => { progress.stopAnimation(); onClose(); navigation.navigate('CapsuleDetail', { capsuleId }); }}
                        >
                            <BlurView intensity={40} tint="dark" style={s.capsuleChipBlur}>
                                <Image
                                    source={{ uri: timerConfigManager.getModelImage(story.capsules?.model) || MODEL_IMAGES[story.capsules?.model] }}
                                    style={s.capsuleModel}
                                    resizeMode="contain"
                                />
                                <View style={s.capsuleChipText}>
                                    <Text style={s.capsuleChipLabel} numberOfLines={1}>{story.capsules?.title || 'View Capsule'}</Text>
                                    <Text style={s.capsuleChipSub}>Tap to open ↗</Text>
                                </View>
                            </BlurView>
                        </TouchableOpacity>
                    )}

                    {/* Live comment bubble — above input */}
                    {activeComment && (
                        <Animated.View style={[s.commentBubble, { opacity: commentFadeAnim }]}>
                            <Image source={{ uri: activeComment.profiles?.avatar_url || 'https://via.placeholder.com/150' }} style={s.commentBubbleAvatar} />
                            <View style={s.commentBubbleBody}>
                                <Text style={s.commentBubbleUser}>@{activeComment.profiles?.username}</Text>
                                <Text style={s.commentBubbleText} numberOfLines={2}>{activeComment.content}</Text>
                            </View>
                        </Animated.View>
                    )}

                    {/* Bottom row: input + like button */}
                    <View style={s.actionRow}>
                        {!isOwner ? (
                            <View style={s.inputWrap}>
                                <TextInput
                                    style={s.input}
                                    placeholder="Reply to this Flash..."
                                    placeholderTextColor="rgba(255,255,255,0.5)"
                                    value={currentComment}
                                    onChangeText={setCurrentComment}
                                    onFocus={() => { setIsPaused(true); setInputFocused(true); }}
                                    onBlur={() => { setIsPaused(false); setInputFocused(false); }}
                                    returnKeyType="send"
                                    onSubmitEditing={handleSendComment}
                                    selectionColor="rgba(255,255,255,0.8)"
                                />
                                {currentComment.trim().length > 0 && (
                                    <TouchableOpacity style={s.sendBtn} onPress={handleSendComment} activeOpacity={0.8}>
                                        <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={s.sendBtnGrad}>
                                            <Ionicons name="send" size={15} color="#fff" />
                                        </LinearGradient>
                                    </TouchableOpacity>
                                )}
                            </View>
                        ) : (
                            // Owner sees viewer count area
                            <View style={s.ownerInfo}>
                                <Ionicons name="eye-outline" size={16} color="rgba(255,255,255,0.7)" />
                                <Text style={s.ownerInfoText}>{storyComments.length} replies</Text>
                            </View>
                        )}

                        {/* Like button */}
                        <LikeButton
                            hasLiked={likesData[story.id]?.hasLiked || false}
                            count={likesData[story.id]?.count || 0}
                            isOwner={isOwner}
                            onPress={() => {
                                if (isOwner) { setShowLikersId(story.id); setIsPaused(true); }
                                else handleToggleLike(story.id);
                            }}
                        />
                    </View>
                </View>
            </View>

            {/* Likers sheet */}
            <LikersSheet
                visible={!!showLikersId}
                onClose={() => { setShowLikersId(null); setIsPaused(false); }}
                storyId={showLikersId || ''}
            />
        </Modal>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000' },

    // Header
    header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, paddingHorizontal: 14 },
    progressRow: { flexDirection: 'row', gap: 3, marginBottom: 12 },
    progressBg: { flex: 1, height: 2.5, backgroundColor: 'rgba(255,255,255,0.28)', borderRadius: 2, overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 2 },

    userRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    userInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatarRing: {
        width: 38, height: 38, borderRadius: 19,
        borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)',
        overflow: 'hidden',
    },
    avatar: { width: '100%', height: '100%' },
    username: { color: '#fff', fontSize: 13, fontFamily: Fonts.bold, letterSpacing: 0.1 },
    capsuleRef: { color: 'rgba(255,255,255,0.65)', fontSize: 11, fontFamily: Fonts.medium, marginTop: 1 },
    pauseArea: { flex: 1, height: 44 },
    closeBtn: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: 'rgba(0,0,0,0.25)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    },

    // Gesture zones
    gestureLayer: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', zIndex: 10 },
    gestureSide: { width: '28%', height: '100%' },
    gestureMiddle: { flex: 1, height: '100%' },

    // Bottom area
    bottomArea: {
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
        paddingHorizontal: 14, gap: 10,
    },

    // Capsule chip — compact, bottom-left anchored
    capsuleChip: {
        alignSelf: 'flex-start',
        borderRadius: 22, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
        maxWidth: '65%',
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
            android: { elevation: 6 },
        }),
    },
    capsuleChipBlur: {
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: 8, paddingHorizontal: 12, gap: 10,
    },
    capsuleModel: { width: 34, height: 34 },
    capsuleChipText: { flex: 1 },
    capsuleChipLabel: { color: '#fff', fontSize: 13, fontFamily: Fonts.bold, letterSpacing: -0.1 },
    capsuleChipSub: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontFamily: Fonts.medium, marginTop: 1 },

    // Live comment bubble
    commentBubble: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 8,
        backgroundColor: 'rgba(0,0,0,0.45)',
        paddingHorizontal: 12, paddingVertical: 9,
        borderRadius: 18, marginRight: 56,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
            android: { elevation: 3 },
        }),
    },
    commentBubbleAvatar: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', marginTop: 1 },
    commentBubbleBody: { flex: 1 },
    commentBubbleUser: { color: 'rgba(255,255,255,0.75)', fontSize: 10, fontFamily: Fonts.bold, marginBottom: 2 },
    commentBubbleText: { color: '#fff', fontSize: 13, fontFamily: Fonts.regular, lineHeight: 18 },

    // Action row: input + like
    actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    inputWrap: {
        flex: 1, flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.14)',
        borderRadius: 25, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)',
        paddingHorizontal: 16, paddingVertical: 2, height: 46,
    },
    input: { flex: 1, color: '#fff', fontSize: 14, fontFamily: Fonts.regular },
    sendBtn: { marginLeft: 8 },
    sendBtnGrad: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

    ownerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4 },
    ownerInfoText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontFamily: Fonts.medium },

    // Expiry countdown badge
    expiryBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: 'rgba(0,0,0,0.38)',
        borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    },
    expiryText: {
        color: 'rgba(255,255,255,0.88)', fontSize: 10,
        fontFamily: Fonts.semiBold, letterSpacing: 0.2,
    },
});