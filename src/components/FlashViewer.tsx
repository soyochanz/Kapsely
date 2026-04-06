import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, Modal,
    TouchableOpacity, Animated, Easing,
    Dimensions, Pressable, StatusBar, TextInput, Platform
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Fonts } from '../theme';
import { supabase } from '../lib/supabase';

const { width, height } = Dimensions.get('window');
const FLASH_DURATION = 8000; 

const FONTS: any = {
    classic: Fonts.bold,
    modern: Fonts.regular,
    serif: Platform.OS === 'ios' ? 'Times New Roman' : 'serif',
    mono: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    neon: Fonts.medium,
};

// ─── Main FlashViewer ─────────────────────────────────────────────────────────
export default function FlashViewer({ visible, userGroup, onClose, onNextUser, onPrevUser, currentUserId, onFlashRead }: any) {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();

    const [activeIndex, setActiveIndex] = useState(0);
    const [progress] = useState(new Animated.Value(0));
    const [isPaused, setIsPaused] = useState(false);

    const [likesData, setLikesData] = useState<Record<string, { count: number; hasLiked: boolean }>>({});
    const pressStartTime = useRef<number>(0);
    const progressRef = useRef(0);
    const lastGroupRef = useRef<any>(null);

    const ownerId = userGroup?.owner_id || userGroup?.id;
    const isOwner = ownerId === currentUserId;

    // On flash change
    useEffect(() => {
        if (!visible || !userGroup) return;
        if (lastGroupRef.current !== userGroup) {
            lastGroupRef.current = userGroup;
            const firstUnread = userGroup.flashes?.findIndex((s: any) => !s.is_read) || 0;
            setActiveIndex(firstUnread >= 0 ? firstUnread : 0);
        }
        progress.stopAnimation(); progress.setValue(0); progressRef.current = 0;
        const flash = userGroup.flashes?.[activeIndex];
        if (flash && !likesData[flash.id]) fetchLikes(flash.id);
    }, [activeIndex, userGroup, visible]);

    useEffect(() => { if (!visible) lastGroupRef.current = null; }, [visible]);

    // Progress timer
    useEffect(() => {
        if (!visible || !userGroup || isPaused) {
            progress.stopAnimation(); return;
        }
        const remaining = FLASH_DURATION * (1 - progressRef.current);
        const anim = Animated.timing(progress, { toValue: 1, duration: remaining, easing: Easing.linear, useNativeDriver: false });
        anim.start(({ finished }) => { if (finished) nextFlash(); });
        const flash = userGroup.flashes?.[activeIndex];
        if (flash && !flash.is_read && onFlashRead) onFlashRead(flash.id);
        return () => anim.stop();
    }, [visible, userGroup, activeIndex, isPaused]);

    const fetchLikes = async (sid: string) => {
        const { count } = await supabase.from('story_likes').select('*', { count: 'exact', head: true }).eq('story_id', sid);
        let hasLiked = false;
        if (currentUserId) {
            const { data } = await supabase.from('story_likes').select('id').eq('story_id', sid).eq('user_id', currentUserId).maybeSingle();
            hasLiked = !!data;
        }
        setLikesData(p => ({ ...p, [sid]: { count: count || 0, hasLiked } }));
    };

    const handleToggleLike = async (sid: string) => {
        if (!currentUserId) return;
        const cur = likesData[sid] || { count: 0, hasLiked: false };
        setLikesData(p => ({ ...p, [sid]: { count: cur.hasLiked ? Math.max(0, cur.count - 1) : cur.count + 1, hasLiked: !cur.hasLiked } }));
        if (cur.hasLiked) {
            await supabase.from('story_likes').delete().eq('story_id', sid).eq('user_id', currentUserId);
        } else {
            await supabase.from('story_likes').insert({ story_id: sid, user_id: currentUserId });
        }
    };

    const nextFlash = () => {
        if (activeIndex < (userGroup.flashes?.length || 0) - 1) { setActiveIndex(p => p + 1); }
        else { onNextUser ? (onNextUser(), setActiveIndex(0)) : onClose(); }
    };

    const prevFlash = () => {
        if (activeIndex > 0) setActiveIndex(p => p - 1);
        else if (onPrevUser) onPrevUser();
    };

    if (!visible || !userGroup) return null;
    const flash = userGroup.flashes?.[activeIndex];
    if (!flash) return null;

    const metadata = flash.metadata || {};
    const elements = metadata.elements || []; 
    const capsuleId = flash.capsule_id || flash.capsules?.id;

    return (
        <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
            <View style={s.root}>
                <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

                <Image source={{ uri: flash.media_url }} style={StyleSheet.absoluteFill} contentFit="contain" />

                {/* Overlays / Elements */}
                {elements.map((el: any) => {
                    const style: any = {
                        position: 'absolute',
                        top: el.y * height,
                        left: el.x * width,
                        transform: [
                            { scale: el.scale || 1 },
                            { rotate: `${el.rotation || 0}rad` },
                            { translateX: -((el.type === 'gif' || el.type === 'sticker') ? 70 : 50) }
                        ],
                        pointerEvents: 'none'
                    };

                    if (el.type === 'text') {
                        return (
                            <View key={el.id} style={style}>
                                <View style={[
                                    s.textBubble, 
                                    el.data.hasBg && { backgroundColor: el.data.bgColor || 'rgba(0,0,0,0.5)' }
                                ]}>
                                    <Text style={[
                                        { 
                                            color: el.data.color, 
                                            fontFamily: FONTS[el.data.fontId] || Fonts.bold,
                                            fontSize: el.data.fontSize || 24,
                                            textAlign: 'center'
                                        },
                                        el.data.fontId === 'neon' && { textShadowColor: el.data.color, textShadowRadius: 10 }
                                    ]}>
                                        {el.data.text}
                                    </Text>
                                </View>
                            </View>
                        );
                    }
                    if (el.type === 'location') {
                        return (
                            <View key={el.id} style={style}>
                                <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={s.locationPill}>
                                    <Ionicons name="location" size={14} color="#fff" />
                                    <Text style={s.locationText}>{el.data.text}</Text>
                                </LinearGradient>
                            </View>
                        );
                    }
                    if (el.type === 'gif') {
                        return (
                            <View key={el.id} style={style}>
                                <Image source={{ uri: el.data.url }} style={{ width: 140, height: 140 }} />
                            </View>
                        );
                    }
                    if (el.type === 'sticker') {
                        return (
                            <View key={el.id} style={style}>
                                <View style={s.stickerBox}>
                                    <Image source={{ uri: el.data.imageUrl }} style={{ width: 80, height: 80 }} contentFit="contain" />
                                    <Text style={s.stickerTitle}>{el.data.title}</Text>
                                </View>
                            </View>
                        );
                    }
                    return null;
                })}

                {/* header */}
                <View style={[s.header, { paddingTop: insets.top + 10 }]}>
                    <View style={s.progressRow}>
                        {userGroup.flashes?.map((st: any, i: number) => (
                            <View key={st.id} style={s.progressBg}>
                                <Animated.View style={[s.progressFill, {
                                    width: i < activeIndex ? '100%' :
                                        i === activeIndex ? progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) : '0%'
                                }]} />
                            </View>
                        ))}
                    </View>

                    <View style={s.userRow}>
                        <TouchableOpacity 
                            style={s.userInfo} 
                            activeOpacity={0.85} 
                            onPress={() => { onClose(); navigation.navigate('UserProfile', { targetUserId: ownerId }); }}
                        >
                            <Image source={{ uri: userGroup.avatar_url }} style={s.avatar} />
                            <View>
                                <Text style={s.username}>{userGroup.display_name || userGroup.username}</Text>
                                <Text style={s.label}>Flash</Text>
                            </View>
                        </TouchableOpacity>

                        <View style={{ flex: 1 }} />

                        {/* CAPSULE NAVIGATION (requested at top) */}
                        {capsuleId && (
                            <TouchableOpacity 
                                style={s.capsuleLink} 
                                onPress={() => { onClose(); navigation.navigate('CapsuleDetail', { capsuleId }); }}
                            >
                                <Text style={s.capsuleTitle} numberOfLines={1}>{userGroup.flashes?.[activeIndex]?.capsules?.title || 'View Capsule'}</Text>
                                <Ionicons name="arrow-forward" size={14} color="#fff" />
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity onPress={onClose} style={s.closeBtn}>
                            <Ionicons name="close" size={24} color="#fff" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Tap zones */}
                <View style={s.gestureLayer}>
                    <Pressable style={s.gestureSide} onPress={() => prevFlash()} />
                    <Pressable style={s.gestureMiddle} onPressIn={() => setIsPaused(true)} onPressOut={() => setIsPaused(false)} />
                    <Pressable style={s.gestureSide} onPress={() => nextFlash()} />
                </View>

                {/* Bottom area */}
                <View style={[s.bottomArea, { paddingBottom: insets.bottom + 20 }]}>
                    <View style={s.row}>
                        <View style={s.replyBox}>
                            <Text style={s.replyText}>Reply to this Flash...</Text>
                        </View>
                        <TouchableOpacity onPress={() => handleToggleLike(flash.id)}>
                            <Ionicons 
                                name={likesData[flash.id]?.hasLiked ? 'heart' : 'heart-outline'} 
                                size={30} 
                                color={likesData[flash.id]?.hasLiked ? '#FF3B30' : '#fff'} 
                            />
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000' },
    header: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 15, zIndex: 100 },
    progressRow: { flexDirection: 'row', gap: 4, marginBottom: 15 },
    progressBg: { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2 },
    progressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 2 },
    userRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    userInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#fff' },
    username: { color: '#fff', fontFamily: Fonts.bold, fontSize: 14 },
    label: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontFamily: Fonts.medium },
    closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    
    capsuleLink: { 
        flexDirection: 'row', alignItems: 'center', gap: 6, 
        backgroundColor: 'rgba(255,255,255,0.2)', 
        paddingHorizontal: 15, height: 36, borderRadius: 18,
        maxWidth: 150
    },
    capsuleTitle: { color: '#fff', fontFamily: Fonts.bold, fontSize: 13 },

    gestureLayer: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', zIndex: 50 },
    gestureSide: { width: '30%', height: '100%' },
    gestureMiddle: { flex: 1, height: '100%' },

    bottomArea: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 15 },
    replyBox: { flex: 1, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', paddingHorizontal: 20 },
    replyText: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },

    // Element styles
    textBubble: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
    locationPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
    locationText: { color: '#fff', fontFamily: Fonts.bold, fontSize: 14 },
    stickerBox: { alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.2)', padding: 10, borderRadius: 15 },
    stickerTitle: { color: '#fff', fontFamily: Fonts.bold, fontSize: 12 },
});
