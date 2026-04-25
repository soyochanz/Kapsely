import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    TextInput, Modal, ScrollView, Dimensions, Pressable,
    PanResponder, Animated, Platform
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts } from '../theme';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GiphyPicker from './GiphyPicker';
import { locationService } from '../utils/location';

const { width, height } = Dimensions.get('window');

// ── Zona de borrado ────────────────────────────────────────────────────────────
// Tamaño del área de impacto para detectar si el item está "sobre" la X
const TRASH_HIT_SIZE = 70;
// Posición fija desde el fondo del canvas (px desde abajo)
const TRASH_BOTTOM_OFFSET = 60;

const FILTERS = [
    { id: 'none', label: 'flashes.original', color: 'transparent' },
    { id: 'vintage', label: 'flashes.vintage', color: 'rgba(230,190,120,0.25)' },
    { id: 'warm', label: 'flashes.warm', color: 'rgba(255,150,50,0.18)' },
    { id: 'cool', label: 'flashes.cool', color: 'rgba(0,150,255,0.18)' },
    { id: 'dark', label: 'flashes.dark', color: 'rgba(0,0,0,0.4)' },
    { id: 'noir', label: 'flashes.noir', color: 'rgba(0,0,0,0.3)', grayscale: true },
];

// ── Fuentes con nombres originales ────────────────────────────────────────────
// "fontFamily" apunta a las familias que tengas cargadas en tu proyecto.
// Ajusta los valores de fontFamily a los que uses; los "label" son los
// nombres creativos que verá el usuario.
const TEXT_STYLES = [
    { id: 'neon', label: '⚡ Spark', fontFamily: Fonts.bold, italic: false },
    { id: 'ghost', label: '👻 Ghost', fontFamily: Fonts.regular, italic: true },
    { id: 'titan', label: '🗿 Titan', fontFamily: Fonts.bold, italic: false },
    { id: 'velvet', label: '🌹 Velvet', fontFamily: Fonts.medium, italic: true },
    { id: 'pixel', label: '🕹 Pixel', fontFamily: Fonts.semiBold, italic: false },
    { id: 'aurora', label: '🌌 Aurora', fontFamily: Fonts.light ?? Fonts.regular, italic: true },
    { id: 'brute', label: '🔩 Brute', fontFamily: Fonts.bold, italic: false },
];

const TEXT_BG_OPTIONS = [
    { id: 'none', label: 'flashes.bg_none', value: 'transparent' },
    { id: 'dark', label: 'flashes.bg_dark', value: 'rgba(0,0,0,0.55)' },
    { id: 'white', label: 'flashes.bg_white', value: 'rgba(255,255,255,0.75)' },
    { id: 'blur', label: 'flashes.bg_blur', value: 'rgba(30,20,60,0.6)' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Calcula si las coordenadas absolutas de pantalla (moveX, moveY) están
// sobre la zona de borrado, dado el layout del canvas.
// ─────────────────────────────────────────────────────────────────────────────
function isOverTrashZone(
    moveX: number, moveY: number,
    canvasLayout: { x: number; y: number; width: number; height: number }
) {
    // Centro horizontal de pantalla
    const trashCX = canvasLayout.x + canvasLayout.width / 2;
    // Fondo del canvas menos el offset
    const trashCY = canvasLayout.y + canvasLayout.height - TRASH_BOTTOM_OFFSET - TRASH_HIT_SIZE / 2;

    return (
        Math.abs(moveX - trashCX) < TRASH_HIT_SIZE &&
        Math.abs(moveY - trashCY) < TRASH_HIT_SIZE
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// DraggableItem — usa las coordenadas absolutas de moveX/moveY para comparar
// contra la zona de borrado, eliminando el offset acumulado del layout.
// ─────────────────────────────────────────────────────────────────────────────
const DraggableItem = ({
    item, onDelete, onDragStateChange,
    initialX = 0, initialY = 0,
    imgContainerLayout, children
}: any) => {
    const pan = useRef(new Animated.ValueXY()).current;
    const [isDragging, setIsDragging] = useState(false);
    const initialDist = useRef(0);
    const initialScale = useRef(1);
    const initialAngle = useRef(0);
    const initialRot = useRef(0);
    const lastProps = useRef({ initialX, initialY });

    useEffect(() => {
        if (initialX !== lastProps.current.initialX || initialY !== lastProps.current.initialY) {
            pan.setValue({ x: 0, y: 0 });
            pan.setOffset({ x: 0, y: 0 });
            lastProps.current = { initialX, initialY };
        }
    }, [initialX, initialY]);

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,

            onPanResponderGrant: () => {
                pan.setOffset({ x: (pan.x as any)._value, y: (pan.y as any)._value });
                pan.setValue({ x: 0, y: 0 });
            },

            onPanResponderMove: (e, gestureState) => {
                const touches = e.nativeEvent.touches;

                if (touches.length === 2) {
                    // ── Pinch + rotate ──────────────────────────────────────
                    const dist = Math.sqrt(
                        Math.pow(touches[1].pageX - touches[0].pageX, 2) +
                        Math.pow(touches[1].pageY - touches[0].pageY, 2)
                    );
                    const angle = Math.atan2(
                        touches[1].pageY - touches[0].pageY,
                        touches[1].pageX - touches[0].pageX
                    ) * 180 / Math.PI;

                    if (!initialDist.current) {
                        initialDist.current = dist;
                        initialScale.current = (item.scale as any)?._value ?? 1;
                        initialAngle.current = angle;
                        initialRot.current = (item.rotation as any)?._value ?? 0;
                    } else {
                        item.scale.setValue(
                            Math.max(0.3, Math.min(initialScale.current * (dist / initialDist.current), 5))
                        );
                        item.rotation.setValue(initialRot.current + (angle - initialAngle.current));
                    }
                } else {
                    // ── Drag ────────────────────────────────────────────────
                    pan.x.setValue(gestureState.dx);
                    pan.y.setValue(gestureState.dy);

                    if (!isDragging) setIsDragging(true);

                    // ✅ Pasamos moveX/moveY absolutos; el cálculo se hace
                    //    en isOverTrashZone con el layout del canvas
                    onDragStateChange?.(true, {
                        x: gestureState.moveX,
                        y: gestureState.moveY,
                    });
                }
            },

            onPanResponderRelease: (e, gestureState) => {
                setIsDragging(false);
                initialDist.current = 0;
                initialAngle.current = 0;

                // ✅ Usamos las coordenadas absolutas finales del dedo
                const over = isOverTrashZone(
                    gestureState.moveX,
                    gestureState.moveY,
                    imgContainerLayout
                );

                onDragStateChange?.(false, { x: 0, y: 0 });

                if (over) {
                    onDelete?.(item.id);
                } else {
                    pan.flattenOffset();
                    // ✅ Actualizamos el estado formalmente a través de un callback
                    const newX = (initialX + (pan.x as any)._value) / width;
                    const newY = (initialY + (pan.y as any)._value) / height;
                    item.onUpdatePosition?.(item.id, newX, newY);
                }
            },

            onPanResponderTerminate: () => {
                setIsDragging(false);
                initialDist.current = 0;
                onDragStateChange?.(false, { x: 0, y: 0 });
                pan.flattenOffset();
            },
        })
    ).current;

    return (
        <Animated.View
            {...panResponder.panHandlers}
            style={[
                st.draggable,
                {
                    left: initialX,
                    top: initialY,
                    transform: [
                        { translateX: pan.x },
                        { translateY: pan.y },
                        { scale: item.scale || 1 },
                        {
                            rotate: (item.rotation || new Animated.Value(0)).interpolate({
                                inputRange: [-360, 360],
                                outputRange: ['-360deg', '360deg'],
                            }),
                        },
                    ],
                    opacity: isDragging ? 0.75 : 1,
                    zIndex: isDragging ? 999 : 1,
                },
            ]}
        >
            {children}
        </Animated.View>
    );
};

// ═════════════════════════════════════════════════════════════════════════════
export default function StoryEditor({
    item, onCancel, onConfirm
}: {
    item: any;
    onCancel: () => void;
    onConfirm: (metadata: any) => void;
}) {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();

    const [filter, setFilter] = useState('none');
    const [texts, setTexts] = useState<any[]>([]);
    const [stickers, setStickers] = useState<any[]>([]);

    const [draggingAny, setDraggingAny] = useState(false);
    const [isOverTrash, setIsOverTrash] = useState(false);

    const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
    const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);

    const [currentText, setCurrentText] = useState('');
    const [textColor, setTextColor] = useState('#ffffff');
    const [textBgId, setTextBgId] = useState('dark');
    const [fontSize, setFontSize] = useState(26);
    const [textStyleId, setTextStyleId] = useState('titan');

    const [location, setLocation] = useState<any>(null);
    const [locationModalVisible, setLocationModalVisible] = useState(false);
    const [tempLocation, setTempLocation] = useState('');
    const [giphyVisible, setGiphyVisible] = useState(false);

    // ✅ Usamos siempre el height total de la pantalla para coordenadas 1:1 con el visor
    const canvasLayout = { x: 0, y: 0, width, height };

    const handleDragStateChange = (isDragging: boolean, coords: { x: number; y: number }) => {
        setDraggingAny(isDragging);
        if (isDragging) {
            setIsOverTrash(isOverTrashZone(coords.x, coords.y, canvasLayout));
        } else {
            setIsOverTrash(false);
        }
    };

    // ── Text ──────────────────────────────────────────────────────────────────
    const handleAddText = () => {
        const id = Date.now().toString();
        const newText = {
            id,
            text: t('flashes.write_something'),
            x: 0.5, y: 0.4,
            color: '#ffffff',
            bgId: 'dark',
            fontSize: 26,
            styleId: 'titan',
            scale: new Animated.Value(1),
            rotation: new Animated.Value(0),
            onUpdatePosition: (id: string, x: number, y: number) => {
                setTexts(prev => prev.map(tx => tx.id === id ? { ...tx, x, y } : tx));
            }
        };
        setTexts(prev => [...prev, newText]);
        setSelectedTextId(id);
        setSelectedStickerId(null);
        setCurrentText(newText.text);
        setTextColor(newText.color);
        setTextBgId(newText.bgId);
        setTextStyleId(newText.styleId);
        setFontSize(newText.fontSize);
    };

    const handleConfirmText = () => {
        if (!currentText.trim()) {
            setTexts(prev => prev.filter(t => t.id !== selectedTextId));
        } else {
            setTexts(prev => prev.map(t =>
                t.id === selectedTextId
                    ? { ...t, text: currentText.trim(), color: textColor, bgId: textBgId, fontSize, styleId: textStyleId }
                    : t
            ));
        }
        setSelectedTextId(null);
        setCurrentText('');
    };

    const openTextEdit = (t: any) => {
        setSelectedTextId(t.id);
        setSelectedStickerId(null);
        setCurrentText(t.text);
        setTextColor(t.color);
        setTextBgId(t.bgId ?? 'dark');
        setTextStyleId(t.styleId ?? 'titan');
        setFontSize(t.fontSize ?? 26);
    };

    // ── Stickers ──────────────────────────────────────────────────────────────
    const handleAddSticker = (giphy: any) => {
        const id = Date.now().toString();
        setStickers(prev => [...prev, {
            id, url: giphy.images.fixed_width.url,
            x: 0.5, y: 0.5,
            scale: new Animated.Value(1),
            rotation: new Animated.Value(0),
            onUpdatePosition: (id: string, x: number, y: number) => {
                setStickers(prev => prev.map(st => st.id === id ? { ...st, x, y } : st));
            }
        }]);
        setGiphyVisible(false);
    };

    // ── Location ──────────────────────────────────────────────────────────────
    const handleConfirmLocation = () => {
        if (tempLocation.trim()) {
            setLocation({
                id: 'loc',
                text: tempLocation.trim(),
                x: 0.5, y: 0.2,
                scale: new Animated.Value(1),
                rotation: new Animated.Value(0),
                onUpdatePosition: (_id: string, x: number, y: number) => {
                    setLocation((prev: any) => prev ? { ...prev, x, y } : null);
                }
            });
        } else {
            setLocation(null);
        }
        setLocationModalVisible(false);
    };

    // ── Confirm ───────────────────────────────────────────────────────────────
    const handleConfirm = () => {
        const metadata = {
            filter,
            texts: texts.map(t => ({
                id: t.id, text: t.text, color: t.color, bgId: t.bgId,
                fontSize: t.fontSize, styleId: t.styleId,
                scale: t.scale?._value ?? 1, rotation: t.rotation?._value ?? 0,
                x: t.x || 0.5, y: t.y || 0.4,
            })),
            stickers: stickers.map(s => ({
                id: s.id, url: s.url,
                scale: s.scale?._value ?? 1, rotation: s.rotation?._value ?? 0,
                x: s.x || 0.5, y: s.y || 0.5,
            })),
            location: location ? {
                text: location.text,
                scale: location.scale?._value ?? 1, rotation: location.rotation?._value ?? 0,
                x: location.x || 0.5, y: location.y || 0.2,
            } : null,
        };
        onConfirm(metadata);
    };

    const currentFilter = FILTERS.find(f => f.id === filter);
    const currentBg = TEXT_BG_OPTIONS.find(b => b.id === textBgId)?.value ?? 'rgba(0,0,0,0.55)';
    const currentFontDef = TEXT_STYLES.find(s => s.id === textStyleId);

    return (
        <View style={st.container}>
            <View style={st.canvas}>
                <Image
                    source={{ uri: item.media_url }}
                    style={st.preview}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                />

                {/* Filter overlay */}
                {filter !== 'none' && currentFilter && (
                    <View
                        style={[StyleSheet.absoluteFill, {
                            backgroundColor: currentFilter.color,
                        } as any]}
                        pointerEvents="none"
                    />
                )}

                {/* Texts */}
                {texts.map(t => {
                    const fd = TEXT_STYLES.find(s => s.id === t.styleId);
                    const bgVal = TEXT_BG_OPTIONS.find(b => b.id === t.bgId)?.value ?? 'rgba(0,0,0,0.55)';
                    return (
                        <DraggableItem
                            key={t.id}
                            item={t}
                            imgContainerLayout={canvasLayout}
                            onDragStateChange={handleDragStateChange}
                            onDelete={(id: string) => setTexts(prev => prev.filter(x => x.id !== id))}
                            initialX={(t.x || 0.5) * width}
                            initialY={(t.y || 0.4) * height}
                        >
                            <TouchableOpacity activeOpacity={0.9} onPress={() => openTextEdit(t)}>
                                <View style={[
                                    st.textBubble,
                                    bgVal !== 'transparent' && { backgroundColor: bgVal },
                                ]}>
                                    <Text style={[
                                        st.draggableText,
                                        {
                                            color: t.color,
                                            fontSize: t.fontSize,
                                            fontFamily: fd?.fontFamily || Fonts.bold,
                                            fontStyle: fd?.italic ? 'italic' : 'normal',
                                        },
                                    ]}>
                                        {t.text}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        </DraggableItem>
                    );
                })}

                {/* Stickers */}
                {stickers.map(s => (
                    <DraggableItem
                        key={s.id}
                        item={s}
                        imgContainerLayout={canvasLayout}
                        onDragStateChange={handleDragStateChange}
                        onDelete={(id: string) => setStickers(prev => prev.filter(x => x.id !== id))}
                        initialX={(s.x || 0.5) * width}
                        initialY={(s.y || 0.5) * height}
                    >
                        <View pointerEvents="none">
                            <Image source={{ uri: s.url }} style={{ width: 140, height: 140 }} contentFit="contain" />
                        </View>
                    </DraggableItem>
                ))}

                {/* Location */}
                {location && (
                    <DraggableItem
                        item={location}
                        imgContainerLayout={canvasLayout}
                        onDragStateChange={handleDragStateChange}
                        onDelete={() => setLocation(null)}
                        initialX={(location.x || 0.5) * width}
                        initialY={(location.y || 0.2) * height}
                    >
                        <TouchableOpacity
                            activeOpacity={0.9}
                            onPress={() => { setTempLocation(location.text); setLocationModalVisible(true); }}
                        >
                            <LinearGradient
                                colors={[Colors.primary, Colors.primaryDark]}
                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                style={st.locationPill}
                            >
                                <Ionicons name="location" size={14} color="#fff" />
                                <Text style={st.locationText}>{location.text}</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </DraggableItem>
                )}

                {/* ✅ Delete zone — posición fija, tamaño generoso */}
                {draggingAny && (
                    <View style={[
                        st.deleteZone,
                        isOverTrash && st.deleteZoneActive,
                        { bottom: TRASH_BOTTOM_OFFSET },
                    ]}>
                        <LinearGradient
                            colors={isOverTrash ? ['#ff4b2b', '#ff416c'] : ['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.75)']}
                            style={st.deleteGrad}
                        >
                            <Ionicons name="close" size={isOverTrash ? 44 : 34} color="#fff" />
                        </LinearGradient>
                    </View>
                )}
            </View>

            {/* ── Toolbar ─────────────────────────────────────────────────── */}
            <View style={st.toolbar}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.toolsContent}>
                    <TouchableOpacity style={st.toolBtn} onPress={() => {
                        const idx = FILTERS.findIndex(f => f.id === filter);
                        setFilter(FILTERS[(idx + 1) % FILTERS.length].id);
                    }}>
                        <Ionicons name="color-filter-outline" size={20} color="#fff" />
                        <Text style={st.toolLabel}>{t('flashes.filter')}</Text>
                        <Text style={st.toolValue}>{t(FILTERS.find(f => f.id === filter)?.label || 'flashes.original')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={st.toolBtn} onPress={handleAddText}>
                        <Ionicons name="text-outline" size={20} color="#fff" />
                        <Text style={st.toolLabel}>{t('flashes.text')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={st.toolBtn} onPress={() => setGiphyVisible(true)}>
                        <Ionicons name="happy-outline" size={20} color="#fff" />
                        <Text style={st.toolLabel}>{t('flashes.stickers')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={st.toolBtn} onPress={() => {
                        setTempLocation(location?.text || '');
                        setLocationModalVisible(true);
                    }}>
                        <Ionicons name="location-outline" size={20} color="#fff" />
                        <Text style={st.toolLabel}>{t('flashes.location')}</Text>
                    </TouchableOpacity>
                </ScrollView>

                <View style={st.actions}>
                    <TouchableOpacity style={st.cancelBtn} onPress={onCancel}>
                        <Text style={st.cancelText}>{t('flashes.cancel')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={st.confirmBtn} onPress={handleConfirm}>
                        <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={st.confirmGrad}>
                            <Text style={st.confirmText}>{t('flashes.share_now')}</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </View>

            {/* ── Text Edit Modal ──────────────────────────────────────────── */}
            <Modal visible={!!selectedTextId} animationType="fade" transparent>
                <BlurView intensity={80} style={st.modalRoot} tint="dark">

                    {/* Top controls */}
                    <View style={[st.topTools, { top: insets.top + 12 }]}>
                        {/* Header row */}
                        <View style={st.modalHeader}>
                            <TouchableOpacity onPress={handleConfirmText} style={st.modalNav}>
                                <Ionicons name="close" size={28} color="#fff" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleConfirmText} style={[st.modalNav, { width: 60 }]}>
                                <Text style={st.modalDone}>{t('flashes.done')}</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Color picker */}
                        <View style={st.sectionRow}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 20 }}>
                                {['#ffffff', '#000000', '#ff4d4d', '#ffb300', '#00f2ff', '#a66eff', '#10b981', '#f472b6', '#fb923c'].map(c => (
                                    <TouchableOpacity
                                        key={c}
                                        style={[st.colorCircle, { backgroundColor: c }, textColor === c && st.colorCircleActive]}
                                        onPress={() => setTextColor(c)}
                                    />
                                ))}
                            </ScrollView>
                        </View>

                        {/* Background picker */}
                        <View style={st.sectionRow}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 20 }}>
                                {TEXT_BG_OPTIONS.map(b => (
                                    <TouchableOpacity
                                        key={b.id}
                                        style={[st.bgPill, { backgroundColor: b.value === 'transparent' ? 'rgba(255,255,255,0.08)' : b.value }, textBgId === b.id && st.bgPillActive]}
                                        onPress={() => setTextBgId(b.id)}
                                    >
                                        <Text style={[st.bgPillText, textBgId === b.id && { color: '#fff' }]}>{t(b.label)}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>

                        {/* Font / style picker — nombres originales */}
                        <View style={st.sectionRow}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 20 }}>
                                {TEXT_STYLES.map(s => (
                                    <TouchableOpacity
                                        key={s.id}
                                        onPress={() => setTextStyleId(s.id)}
                                        style={[st.stylePill, textStyleId === s.id && st.stylePillActive]}
                                    >
                                        <Text style={[
                                            st.stylePillText,
                                            {
                                                fontFamily: s.fontFamily,
                                                fontStyle: s.italic ? 'italic' : 'normal',
                                            },
                                            textStyleId === s.id && st.stylePillTextActive,
                                        ]}>
                                            {s.label}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>

                        {/* Font size row */}
                        <View style={[st.sectionRow, { paddingHorizontal: 20, alignItems: 'center', gap: 12 }]}>
                            <TouchableOpacity onPress={() => setFontSize(p => Math.max(14, p - 2))} style={st.sizeBtn}>
                                <Ionicons name="remove" size={18} color="#fff" />
                            </TouchableOpacity>
                            <Text style={st.sizeLabel}>{fontSize}px</Text>
                            <TouchableOpacity onPress={() => setFontSize(p => Math.min(64, p + 2))} style={st.sizeBtn}>
                                <Ionicons name="add" size={18} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Live preview while typing */}
                    <View style={st.previewWrap} pointerEvents="none">
                        <View style={[
                            st.textBubble,
                            currentBg !== 'transparent' && { backgroundColor: currentBg },
                        ]}>
                            <Text style={{
                                color: textColor,
                                fontSize: fontSize,
                                fontFamily: currentFontDef?.fontFamily || Fonts.bold,
                                fontStyle: currentFontDef?.italic ? 'italic' : 'normal',
                                textAlign: 'center',
                            }}>
                                {currentText || ' '}
                            </Text>
                        </View>
                    </View>

                    <TextInput
                        autoFocus
                        multiline
                        style={[st.mainInput, { color: textColor, fontSize, fontFamily: currentFontDef?.fontFamily || Fonts.bold }]}
                        value={currentText}
                        onChangeText={setCurrentText}
                        selectionColor={textColor}
                    />
                </BlurView>
            </Modal>

            {/* ── Location Modal ───────────────────────────────────────────── */}
            <Modal visible={locationModalVisible} transparent animationType="fade">
                <BlurView intensity={90} tint="dark" style={st.modalRoot}>
                    <View style={st.modalHeader}>
                        <TouchableOpacity onPress={() => setLocationModalVisible(false)} style={st.modalNav}>
                            <Ionicons name="close" size={24} color="#fff" />
                        </TouchableOpacity>
                        <Text style={st.modalTitle}>{t('flashes.add_location')}</Text>
                        <TouchableOpacity onPress={handleConfirmLocation}>
                            <Text style={st.modalDone}>{t('flashes.done')}</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={st.locationInputWrap}>
                        <View style={st.locationIconBox}>
                            <Ionicons name="location" size={24} color={Colors.primary} />
                        </View>
                        <TextInput
                            autoFocus
                            placeholder={t('flashes.city_prompt')}
                            placeholderTextColor="rgba(255,255,255,0.4)"
                            style={st.locationInput}
                            value={tempLocation}
                            onChangeText={setTempLocation}
                            onSubmitEditing={handleConfirmLocation}
                        />
                    </View>

                    <TouchableOpacity
                        style={st.currentLocBtn}
                        onPress={async () => {
                            const loc = await locationService.getCurrentLocation();
                            if (loc) {
                                setLocation({
                                    id: 'loc',
                                    text: loc.locationName,
                                    x: 0.5, y: 0.2,
                                    scale: new Animated.Value(1),
                                    rotation: new Animated.Value(0),
                                });
                                setLocationModalVisible(false);
                            }
                        }}
                    >
                        <Ionicons name="navigate" size={18} color="#fff" />
                        <Text style={st.currentLocText}>{t('flashes.current_location')}</Text>
                    </TouchableOpacity>
                </BlurView>
            </Modal>

            <GiphyPicker
                visible={giphyVisible}
                onClose={() => setGiphyVisible(false)}
                onSelect={handleAddSticker}
            />
        </View>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    canvas: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
    preview: { width: '100%', height: '100%' },

    draggable: { position: 'absolute', alignItems: 'center' },

    textBubble: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 14,
    },
    draggableText: { textAlign: 'center' },

    locationPill: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 14, paddingVertical: 10, borderRadius: 25,
        shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 }, elevation: 6,
    },
    locationText: { color: '#fff', fontFamily: Fonts.bold, fontSize: 15 },

    // ── Delete zone ────────────────────────────────────────────────────────
    deleteZone: {
        position: 'absolute',
        alignSelf: 'center',
        width: TRASH_HIT_SIZE * 1.4,
        height: TRASH_HIT_SIZE * 1.4,
        borderRadius: TRASH_HIT_SIZE * 0.7,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.25)',
    },
    deleteZoneActive: {
        borderColor: '#fff',
        transform: [{ scale: 1.25 }],
    },
    deleteGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    // ── Toolbar ────────────────────────────────────────────────────────────
    toolbar: { 
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: 'rgba(0,0,0,0.7)', 
        borderTopLeftRadius: 24, borderTopRightRadius: 24, 
        paddingBottom: 10 
    },
    toolsContent: { padding: 20, gap: 15 },
    toolBtn: { alignItems: 'center', gap: 4, width: 70 },
    toolLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontFamily: Fonts.medium },
    toolValue: { color: Colors.primary, fontSize: 10, fontFamily: Fonts.bold, textTransform: 'capitalize' },

    actions: { flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 20, gap: 12 },
    cancelBtn: { flex: 1, height: 50, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    cancelText: { color: '#fff', fontFamily: Fonts.semiBold },
    confirmBtn: { flex: 1.5, height: 50, borderRadius: 15, overflow: 'hidden' },
    confirmGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    confirmText: { color: '#fff', fontFamily: Fonts.bold, fontSize: 15 },

    // ── Modal ──────────────────────────────────────────────────────────────
    modalRoot: { flex: 1, padding: 20, justifyContent: 'center' },
    topTools: { position: 'absolute', left: 0, right: 0, gap: 14 },
    sectionRow: { flexDirection: 'row' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20 },
    modalNav: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    modalTitle: { color: '#fff', fontSize: 18, fontFamily: Fonts.bold },
    modalDone: { color: Colors.primary, fontSize: 17, fontFamily: Fonts.bold },

    colorCircle: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)' },
    colorCircleActive: { borderColor: '#fff', transform: [{ scale: 1.15 }] },

    bgPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
    bgPillActive: { borderColor: '#fff' },
    bgPillText: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontFamily: Fonts.semiBold },

    stylePill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    stylePillActive: { backgroundColor: '#fff', borderColor: '#fff' },
    stylePillText: { color: '#fff', fontSize: 13 },
    stylePillTextActive: { color: '#000' },

    sizeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
    sizeLabel: { color: '#fff', fontSize: 13, fontFamily: Fonts.semiBold, minWidth: 48, textAlign: 'center' },

    previewWrap: { alignItems: 'center', marginTop: 20 },
    mainInput: { width: '100%', textAlign: 'center', paddingHorizontal: 20, opacity: 0 },

    // ── Location ───────────────────────────────────────────────────────────
    locationInputWrap: {
        width: '100%', flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20,
        paddingHorizontal: 18, height: 64, gap: 14,
    },
    locationIconBox: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
    locationInput: { flex: 1, color: '#fff', fontSize: 18, fontFamily: Fonts.semiBold },
    currentLocBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 20, alignSelf: 'center', marginTop: 20 },
    currentLocText: { color: '#fff', fontFamily: Fonts.bold, fontSize: 14 },
});