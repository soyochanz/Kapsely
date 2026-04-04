import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Image, ActivityIndicator, Alert, Modal, Pressable,
    ScrollView, Dimensions, PanResponder,
    Animated, Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts, Spacing, Shadow } from '../theme';
import { supabase } from '../lib/supabase';
import { useNavigation } from '@react-navigation/native';

const { width } = Dimensions.get('window');

// ─── Banner dimensions ────────────────────────────────────────────────────────
const BANNER_W = width - 40;
const BANNER_H = 200; // Matches ProfileScreen
const MAX_STICKERS = 5;
const DEFAULT_SIZE = 72;
const MIN_SIZE = 36;
const MAX_SIZE = 140;

// ─── Sticker state ────────────────────────────────────────────────────────────
interface StickerInstance {
    id: string;           // unique instance id
    stickerId: string;    // ref to sticker data
    x: number;            // center x in banner
    y: number;            // center y in banner
    size: number;
    rotation: number;     // degrees
    imageUrl: string;
    name: string;
    zIndex: number;
}

// ─── Single draggable sticker ─────────────────────────────────────────────────
interface DraggableStickerProps {
    sticker: StickerInstance;
    isSelected: boolean;
    onSelect: (id: string) => void;
    onUpdate: (id: string, patch: Partial<StickerInstance>) => void;
    onDelete: (id: string) => void;
    topZ: number;
    bumpZ: (id: string) => void;
    setIsDragging: (v: boolean) => void;
}

function DraggableSticker({
    sticker, isSelected, onSelect, onUpdate, onDelete, topZ, bumpZ, setIsDragging
}: DraggableStickerProps) {
    const posX = useRef(new Animated.Value(sticker.x)).current;
    const posY = useRef(new Animated.Value(sticker.y)).current;
    const scale = useRef(new Animated.Value(1)).current;

    // Keep animated values in sync when sticker state changes externally
    useEffect(() => { posX.setValue(sticker.x); }, [sticker.x]);
    useEffect(() => { posY.setValue(sticker.y); }, [sticker.y]);

    // Track frame delta for drag
    const lastDx = useRef(0);
    const lastDy = useRef(0);
    const pinchStart = useRef<{ dist: number; size: number } | null>(null);
    const rotStart = useRef<{ angle: number; rotation: number } | null>(null);

    const panResponder = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 1 || Math.abs(g.dy) > 1,
        onPanResponderGrant: () => {
            bumpZ(sticker.id);
            onSelect(sticker.id);
            setIsDragging(true);
            lastDx.current = 0;
            lastDy.current = 0;
            Animated.sequence([
                Animated.timing(scale, { toValue: 1.12, duration: 80, useNativeDriver: false }),
                Animated.timing(scale, { toValue: 1, duration: 80, useNativeDriver: false }),
            ]).start();
        },
        onPanResponderMove: (_, g) => {
            if (g.numberActiveTouches === 2) {
                // ── Pinch to resize + rotation ──
                const t = (g as any).stateID !== undefined ? (g as any) : g;
                const touches = (t as any)._targetTouches || [];
                if (touches.length === 2) {
                    const dx = touches[1].pageX - touches[0].pageX;
                    const dy = touches[1].pageY - touches[0].pageY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

                    if (!pinchStart.current) {
                        pinchStart.current = { dist, size: sticker.size };
                        rotStart.current = { angle, rotation: sticker.rotation };
                    } else {
                        const newSize = Math.max(MIN_SIZE, Math.min(MAX_SIZE,
                            pinchStart.current.size * (dist / pinchStart.current.dist)
                        ));
                        const newRot = rotStart.current!.rotation + (angle - rotStart.current!.angle);
                        onUpdate(sticker.id, { size: newSize, rotation: newRot });
                    }
                }
            } else {
                // ── Drag with Delta ──
                pinchStart.current = null;
                rotStart.current = null;

                const deltaX = g.dx - lastDx.current;
                const deltaY = g.dy - lastDy.current;

                const currentX = ((posX as any)._value || sticker.x) + deltaX;
                const currentY = ((posY as any)._value || sticker.y) + deltaY;

                const halfS = sticker.size / 2;
                const clampedX = Math.max(halfS, Math.min(BANNER_W - halfS, currentX));
                const clampedY = Math.max(halfS, Math.min(BANNER_H - halfS, currentY));

                posX.setValue(clampedX);
                posY.setValue(clampedY);

                lastDx.current = g.dx;
                lastDy.current = g.dy;
            }
        },
        onPanResponderRelease: () => {
            pinchStart.current = null;
            rotStart.current = null;
            setIsDragging(false);
            // Commit final position to state
            onUpdate(sticker.id, { x: (posX as any)._value, y: (posY as any)._value });
        },
        onPanResponderTerminate: () => {
            pinchStart.current = null;
            rotStart.current = null;
            setIsDragging(false);
        },
    });

    return (
        <Animated.View
            {...panResponder.panHandlers}
            style={[
                stickerS.root,
                {
                    width: sticker.size,
                    height: sticker.size,
                    left: posX,
                    top: posY,
                    marginLeft: -(sticker.size / 2),
                    marginTop: -(sticker.size / 2),
                    transform: [{ rotate: `${sticker.rotation}deg` }, { scale }],
                    zIndex: sticker.zIndex,
                },
            ]}
        >
            <Image source={{ uri: sticker.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="contain" />

            {/* Selection ring */}
            {isSelected && (
                <View style={stickerS.selectionRing} />
            )}

            {/* Delete button — only when selected */}
            {isSelected && (
                <TouchableOpacity
                    style={stickerS.deleteBtn}
                    onPress={() => onDelete(sticker.id)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <Ionicons name="close" size={11} color="#fff" />
                </TouchableOpacity>
            )}

            {/* Resize handle — bottom right */}
            {isSelected && (
                <View style={stickerS.resizeHandle}>
                    <Ionicons name="resize" size={10} color="#fff" />
                </View>
            )}
        </Animated.View>
    );
}

const stickerS = StyleSheet.create({
    root: {
        position: 'absolute',
    },
    selectionRing: {
        ...StyleSheet.absoluteFillObject,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.9)',
        borderRadius: 12,
        borderStyle: 'dashed',
    },
    deleteBtn: {
        position: 'absolute', top: -8, left: -8,
        width: 22, height: 22, borderRadius: 11,
        backgroundColor: 'rgba(0,0,0,0.7)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: '#fff',
        zIndex: 20,
    },
    resizeHandle: {
        position: 'absolute', bottom: -8, right: -8,
        width: 20, height: 20, borderRadius: 10,
        backgroundColor: 'rgba(0,0,0,0.6)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: '#fff',
        zIndex: 20,
    },
});

// ─── Rotation controls (for selected sticker) ─────────────────────────────────
function RotationControls({ sticker, onUpdate }: { sticker: StickerInstance; onUpdate: (id: string, patch: Partial<StickerInstance>) => void }) {
    return (
        <View style={rc.row}>
            <TouchableOpacity style={rc.btn} onPress={() => onUpdate(sticker.id, { rotation: sticker.rotation - 15 })}>
                <Ionicons name="refresh-outline" size={16} color={Colors.textSecondary} style={{ transform: [{ scaleX: -1 }] }} />
            </TouchableOpacity>
            <Text style={rc.label}>{Math.round(sticker.rotation)}°</Text>
            <TouchableOpacity style={rc.btn} onPress={() => onUpdate(sticker.id, { rotation: sticker.rotation + 15 })}>
                <Ionicons name="refresh-outline" size={16} color={Colors.textSecondary} />
            </TouchableOpacity>
            <View style={rc.sep} />
            <TouchableOpacity style={rc.btn} onPress={() => onUpdate(sticker.id, { size: Math.max(MIN_SIZE, sticker.size - 12) })}>
                <Ionicons name="remove" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
            <Text style={rc.label}>{Math.round(sticker.size)}px</Text>
            <TouchableOpacity style={rc.btn} onPress={() => onUpdate(sticker.id, { size: Math.min(MAX_SIZE, sticker.size + 12) })}>
                <Ionicons name="add" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
        </View>
    );
}

const rc = StyleSheet.create({
    row: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: Colors.surface,
        borderRadius: 20, padding: 6,
        borderWidth: 1, borderColor: Colors.border,
        gap: 2, alignSelf: 'center',
        marginTop: 14,
    },
    btn: {
        width: 34, height: 34, borderRadius: 17,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: Colors.cardAlt,
    },
    label: {
        fontSize: 12, fontFamily: Fonts.semiBold,
        color: Colors.textSecondary, minWidth: 36, textAlign: 'center',
    },
    sep: { width: 1, height: 20, backgroundColor: Colors.border, marginHorizontal: 4 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function PersonalizeProfileScreen() {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);

    const [stickers, setStickers] = useState<StickerInstance[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [topZIndex, setTopZIndex] = useState(10);

    const [allStickers, setAllStickers] = useState<any[]>([]);
    const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());
    const [showPicker, setShowPicker] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [userStats, setUserStats] = useState({
        maxLikes: 0, totalComments: 0, openedCount: 0, registrationDate: new Date(),
    });

    const bannerRef = useRef<View>(null);

    // Deselect when tapping empty banner area
    const bannerPan = PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: () => false,
    });

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setUserId(user.id);
            await loadData(user.id);
            setLoading(false);
        })();
    }, []);

    const loadData = async (uid: string) => {
        // Load saved stickers
        const { data: current } = await supabase
            .from('profile_stickers')
            .select('*, stickers(*)')
            .eq('user_id', uid);

        if (current) {
            const loaded: StickerInstance[] = current.map((ps: any, i: number) => ({
                id: `existing_${i}`,
                stickerId: ps.sticker_id,
                x: ps.x ?? BANNER_W / 2,
                y: ps.y ?? BANNER_H / 2,
                size: ps.size ?? DEFAULT_SIZE,
                rotation: ps.rotation ?? 0,
                imageUrl: ps.stickers?.image_url || '',
                name: ps.stickers?.name || '',
                zIndex: 10 + i,
            }));
            setStickers(loaded);
            setTopZIndex(10 + current.length);
        }

        // Unlocked stickers
        const { data: unlocked } = await supabase.from('user_stickers').select('sticker_id').eq('user_id', uid);
        setUnlockedIds(new Set(unlocked?.map(u => u.sticker_id) || []));

        // User stats
        const { data: profile } = await supabase.from('profiles').select('created_at').eq('id', uid).single();
        const regDate = profile?.created_at ? new Date(profile.created_at) : new Date();
        const { data: capsules } = await supabase.from('capsules').select('id, status').eq('owner_id', uid);
        const openedCount = capsules?.filter(c => c.status === 'opened').length || 0;
        const { data: likes } = await supabase.from('likes').select('capsule_id');
        const likeMap: Record<string, number> = {};
        likes?.forEach((l: any) => { likeMap[l.capsule_id] = (likeMap[l.capsule_id] || 0) + 1; });
        const maxLikes = Math.max(0, ...Object.values(likeMap));
        const { data: comments } = await supabase.from('comments').select('id').eq('user_id', uid);
        setUserStats({ maxLikes, totalComments: comments?.length || 0, openedCount, registrationDate: regDate });

        // All stickers
        const { data: stks } = await supabase.from('stickers').select('*').eq('is_active', true);
        if (stks) setAllStickers(stks);
    };

    const isUnlocked = (s: any) => {
        if (s.unlock_type === 'drop') return true;
        if (unlockedIds.has(s.id)) return true;
        if (s.unlock_type === 'likes' && userStats.maxLikes >= s.unlock_threshold) return true;
        if (s.unlock_type === 'comments' && userStats.totalComments >= s.unlock_threshold) return true;
        if (s.unlock_type === 'opened_count' && userStats.openedCount >= s.unlock_threshold) return true;
        if (s.unlock_type === 'pioneer') {
            return userStats.registrationDate >= new Date('2026-03-01') && userStats.registrationDate <= new Date('2026-06-01');
        }
        return false;
    };

    const getUnlockHint = (s: any) => {
        switch (s.unlock_type) {
            case 'likes': return `${s.unlock_threshold} likes on a capsule`;
            case 'comments': return `Post ${s.unlock_threshold} comments`;
            case 'opened_count': return `Open ${s.unlock_threshold} capsules`;
            case 'pioneer': return 'Pioneer: Mar–Jun 2026';
            default: return 'Locked';
        }
    };

    const handleAddSticker = (stickerData: any) => {
        if (stickers.length >= MAX_STICKERS) {
            Alert.alert('Limit reached', 'You can have up to 5 stickers on your banner.');
            return;
        }
        if (!isUnlocked(stickerData)) {
            Alert.alert('Locked 🔒', getUnlockHint(stickerData));
            return;
        }
        const newZ = topZIndex + 1;
        setTopZIndex(newZ);
        const newSticker: StickerInstance = {
            id: `sticker_${Date.now()}`,
            stickerId: stickerData.id,
            x: BANNER_W / 2 + (Math.random() - 0.5) * 60,
            y: BANNER_H / 2 + (Math.random() - 0.5) * 40,
            size: DEFAULT_SIZE,
            rotation: (Math.random() - 0.5) * 30,
            imageUrl: stickerData.image_url,
            name: stickerData.name,
            zIndex: newZ,
        };
        setStickers(prev => [...prev, newSticker]);
        setSelectedId(newSticker.id);
        setShowPicker(false);
    };

    const handleUpdate = useCallback((id: string, patch: Partial<StickerInstance>) => {
        setStickers(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
    }, []);

    const handleDelete = useCallback((id: string) => {
        setStickers(prev => prev.filter(s => s.id !== id));
        setSelectedId(null);
    }, []);

    const bumpZ = useCallback((id: string) => {
        const newZ = topZIndex + 1;
        setTopZIndex(newZ);
        setStickers(prev => prev.map(s => s.id === id ? { ...s, zIndex: newZ } : s));
    }, [topZIndex]);

    const handleSave = async () => {
        if (!userId) return;
        setSaving(true);
        try {
            const { error: delError } = await supabase.from('profile_stickers').delete().eq('user_id', userId);
            if (delError) throw delError;

            // Insert new
            if (stickers.length > 0) {
                const rows = stickers.map((s, i) => ({
                    user_id: userId,
                    sticker_id: s.stickerId,
                    position: i + 1,     // kept for backwards compat
                    x: Math.round(s.x),
                    y: Math.round(s.y),
                    size: Math.round(s.size),
                    rotation: Math.round(s.rotation),
                    updated_at: new Date().toISOString(),
                }));
                const { error: insError } = await supabase.from('profile_stickers').insert(rows);
                if (insError) throw insError;
            }
            navigation.goBack();
        } catch (e: any) {
            Alert.alert('Error', e.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    const selectedSticker = stickers.find(st => st.id === selectedId) || null;

    return (
        <View style={s.root}>
            <View style={[s.headerWrap, { paddingTop: Math.max(insets.top, Platform.OS === 'android' ? 14 : 0) }]}>
                <View style={s.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={s.headerBtn} activeOpacity={0.7}>
                        <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={s.headerTitle}>Personalize Banner</Text>
                    <TouchableOpacity
                        onPress={handleSave}
                        style={[s.saveBtn, saving && { opacity: 0.6 }]}
                        disabled={saving}
                        activeOpacity={0.8}
                    >
                        {saving
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <Text style={s.saveBtnText}>Save</Text>
                        }
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" scrollEnabled={!isDragging}>

                {/* Instructions */}
                <Text style={s.pageTitle}>Banner Stickers</Text>
                <Text style={s.pageSub}>Drag, pinch, and rotate stickers freely on your banner</Text>

                {/* ── BANNER CANVAS ── */}
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => setSelectedId(null)}
                    style={s.bannerOuter}
                >
                    <View
                        ref={bannerRef}
                        style={s.banner}
                    >
                        <LinearGradient
                            colors={['#c59dff', '#a66eff', '#7938ff']}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFill}
                        />

                        {/* Stickers */}
                        {stickers.map(sticker => (
                            <DraggableSticker
                                key={sticker.id}
                                sticker={sticker}
                                isSelected={selectedId === sticker.id}
                                onSelect={setSelectedId}
                                onUpdate={handleUpdate}
                                onDelete={handleDelete}
                                topZ={topZIndex}
                                bumpZ={bumpZ}
                                setIsDragging={setIsDragging}
                            />
                        ))}

                        {/* ── PLACEHOLDERS ─────────────────────────────────── */}
                        {/* Settings Button ghost */}
                        <View style={s.ghostSettingsBtn}>
                            <Ionicons name="settings-outline" size={16} color="rgba(255,255,255,0.45)" />
                        </View>

                        {/* Bottom Header Card overlap ghost */}
                        <View style={s.ghostCard}>
                            <View style={s.ghostAvatar}>
                                <Ionicons name="person" size={22} color="rgba(255,255,255,0.4)" />
                            </View>
                            <View style={s.ghostStats}>
                                <View style={s.ghostStatLine} />
                                <View style={[s.ghostStatLine, { width: 40, marginTop: 4 }]} />
                            </View>
                        </View>

                        {/* Tap-to-add hint when empty */}
                        {stickers.length === 0 && (
                            <View style={s.emptyHint}>
                                <Ionicons name="happy-outline" size={28} color="rgba(255,255,255,0.6)" />
                                <Text style={s.emptyHintText}>Add stickers below</Text>
                            </View>
                        )}
                    </View>
                </TouchableOpacity>

                {/* ── CONTROLS for selected sticker ── */}
                {selectedSticker && (
                    <RotationControls sticker={selectedSticker} onUpdate={handleUpdate} />
                )}

                {/* ── ADD STICKER BUTTON ── */}
                <View style={s.addRow}>
                    <Text style={s.addRowLabel}>
                        {stickers.length}/{MAX_STICKERS} stickers
                    </Text>
                    {stickers.length < MAX_STICKERS && (
                        <TouchableOpacity
                            style={s.addBtn}
                            activeOpacity={0.85}
                            onPress={() => setShowPicker(true)}
                        >
                            <Ionicons name="add" size={18} color="#fff" />
                            <Text style={s.addBtnText}>Add sticker</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* ── STICKER LIST (horizontal scroll, no modal) ── */}
                <View style={s.stickerRail}>
                    {stickers.length >= MAX_STICKERS ? (
                        <View style={s.railLimit}>
                            <Ionicons name="alert-circle-outline" size={16} color={Colors.textMuted} />
                            <Text style={s.railLimitText}>Remove a sticker to add another</Text>
                        </View>
                    ) : (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.railContent}>
                            {allStickers.map(st => {
                                const unlocked = isUnlocked(st);
                                return (
                                    <TouchableOpacity
                                        key={st.id}
                                        style={[s.railItem, !unlocked && s.railItemLocked]}
                                        activeOpacity={0.8}
                                        onPress={() => handleAddSticker(st)}
                                    >
                                        <Image
                                            source={{ uri: st.image_url }}
                                            style={[s.railImg, !unlocked && { opacity: 0.4 }]}
                                            resizeMode="contain"
                                        />
                                        {!unlocked && (
                                            <View style={s.railLock}>
                                                <Ionicons name="lock-closed" size={11} color="#fff" />
                                            </View>
                                        )}
                                        <Text style={[s.railName, !unlocked && { color: Colors.textMuted }]} numberOfLines={1}>{st.name}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    )}
                </View>

                {/* Hint */}
                <View style={s.hint}>
                    <Ionicons name="information-circle-outline" size={16} color={Colors.textMuted} />
                    <Text style={s.hintText}>
                        Tap a sticker to select it, then drag to move. Use the controls to rotate or resize. Pinch with two fingers to resize.
                    </Text>
                </View>
            </ScrollView>

            {/* ── STICKER PICKER MODAL ── */}
            <Modal visible={showPicker} transparent animationType="slide" onRequestClose={() => setShowPicker(false)}>
                <Pressable style={s.overlay} onPress={() => setShowPicker(false)}>
                    <Pressable style={s.sheet}>
                        <View style={s.sheetHandle} />
                        <View style={s.sheetHeader}>
                            <Text style={s.sheetTitle}>Choose a Sticker</Text>
                            <TouchableOpacity onPress={() => setShowPicker(false)}>
                                <Ionicons name="close" size={22} color={Colors.textPrimary} />
                            </TouchableOpacity>
                        </View>
                        <ScrollView contentContainerStyle={s.pickerGrid} showsVerticalScrollIndicator={false}>
                            {allStickers.map(st => {
                                const unlocked = isUnlocked(st);
                                return (
                                    <TouchableOpacity
                                        key={st.id}
                                        style={s.pickerItem}
                                        onPress={() => handleAddSticker(st)}
                                        activeOpacity={0.8}
                                    >
                                        <View style={[s.pickerImgWrap, !unlocked && s.pickerImgLocked]}>
                                            <Image
                                                source={{ uri: st.image_url }}
                                                style={[s.pickerImg, !unlocked && { opacity: 0.35 }]}
                                                resizeMode="contain"
                                            />
                                            {!unlocked && (
                                                <View style={s.pickerLockOverlay}>
                                                    <Ionicons name="lock-closed" size={18} color="#fff" />
                                                </View>
                                            )}
                                        </View>
                                        <Text style={s.pickerName}>{st.name}</Text>
                                        {!unlocked && (
                                            <Text style={s.pickerHint}>{getUnlockHint(st)}</Text>
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </Pressable>
                </Pressable>
            </Modal>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.background },

    headerWrap: { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 56 },
    headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 17, fontFamily: Fonts.semiBold, color: Colors.textPrimary },
    saveBtn: {
        paddingHorizontal: 18, paddingVertical: 8,
        borderRadius: 20, backgroundColor: Colors.primary,
        alignItems: 'center', justifyContent: 'center',
        minWidth: 60,
    },
    saveBtnText: { fontSize: 14, fontFamily: Fonts.bold, color: '#fff' },

    scroll: { padding: 20, paddingBottom: 60 },

    pageTitle: { fontSize: 22, fontFamily: Fonts.bold, color: Colors.textPrimary, marginBottom: 4 },
    pageSub: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.textMuted, marginBottom: 20 },

    // Banner canvas
    bannerOuter: { marginBottom: 4 },
    banner: {
        width: BANNER_W,
        height: BANNER_H,
        borderRadius: 22,
        overflow: 'hidden',
        position: 'relative',
        ...Platform.select({
            ios: { shadowColor: 'rgba(0,0,0,0.2)', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 1, shadowRadius: 16 },
            android: { elevation: 6 },
            web: { boxShadow: '0 6px 24px rgba(0,0,0,0.18)' },
        }),
    },
    emptyHint: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
    emptyHintText: { fontSize: 14, fontFamily: Fonts.medium, color: 'rgba(255,255,255,0.6)' },

    // Add row
    addRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 16, marginBottom: 12,
    },
    addRowLabel: { fontSize: 13, fontFamily: Fonts.medium, color: Colors.textMuted },
    addBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 14, paddingVertical: 8,
        borderRadius: 20, backgroundColor: Colors.primary,
    },
    addBtnText: { fontSize: 13, fontFamily: Fonts.bold, color: '#fff' },

    // Sticker rail (inline, no modal)
    stickerRail: {
        backgroundColor: Colors.surface,
        borderRadius: 18, borderWidth: 1, borderColor: Colors.border,
        overflow: 'hidden', marginBottom: 16,
        minHeight: 110,
    },
    railContent: { paddingHorizontal: 12, paddingVertical: 12, gap: 10 },
    railItem: {
        width: 72, alignItems: 'center', gap: 5, position: 'relative',
    },
    railItemLocked: { opacity: 0.7 },
    railImg: { width: 56, height: 56 },
    railName: { fontSize: 10, fontFamily: Fonts.medium, color: Colors.textSecondary, textAlign: 'center', maxWidth: 70 },
    railLock: {
        position: 'absolute', top: 0, right: 6,
        width: 18, height: 18, borderRadius: 9,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center', justifyContent: 'center',
    },
    railLimit: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        padding: 16,
    },
    railLimitText: { fontSize: 13, fontFamily: Fonts.medium, color: Colors.textMuted },

    // Hint
    hint: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 10,
        padding: 14, borderRadius: 16,
        backgroundColor: Colors.surface,
        borderWidth: 1, borderColor: Colors.border,
    },
    hintText: { flex: 1, fontSize: 12, fontFamily: Fonts.regular, color: Colors.textSecondary, lineHeight: 17 },

    // Modal
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, maxHeight: '80%' },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 16 },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
    sheetTitle: { fontSize: 18, fontFamily: Fonts.bold, color: Colors.textPrimary },
    pickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingBottom: 40 },
    pickerItem: { width: (width - 80) / 3, alignItems: 'center', gap: 6 },
    pickerImgWrap: { width: 72, height: 72, position: 'relative' },
    pickerImgLocked: {},
    pickerImg: { width: 72, height: 72 },
    pickerLockOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.4)',
        borderRadius: 16,
        alignItems: 'center', justifyContent: 'center',
    },
    pickerName: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textPrimary, textAlign: 'center' },
    pickerHint: { fontSize: 10, fontFamily: Fonts.regular, color: Colors.textMuted, textAlign: 'center' },

    // Placeholders
    ghostSettingsBtn: {
        position: 'absolute',
        top: 14, right: 14,
        width: 34, height: 34, borderRadius: 17,
        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)',
        backgroundColor: 'rgba(0,0,0,0.15)',
        alignItems: 'center', justifyContent: 'center',
        borderStyle: 'dashed',
        zIndex: 999, pointerEvents: 'none',
    },
    ghostCard: {
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        height: 32,
        backgroundColor: 'rgba(255,255,255,0.12)',
        borderTopWidth: 1.5, borderTopColor: 'rgba(255,255,255,0.4)',
        borderStyle: 'dashed',
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
        zIndex: 999, pointerEvents: 'none',
    },
    ghostAvatar: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.18)',
        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)',
        borderStyle: 'dashed',
        position: 'absolute',
        top: -18, left: 18,
        alignItems: 'center', justifyContent: 'center',
    },
    ghostStats: {
        marginLeft: 70, gap: 2,
    },
    ghostStatLine: {
        width: 60, height: 6, borderRadius: 3,
        backgroundColor: 'rgba(255,255,255,0.25)',
    },
});