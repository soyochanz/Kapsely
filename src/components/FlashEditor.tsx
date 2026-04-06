import React, { useState, useRef, useEffect } from 'react';
import { 
    View, Text, StyleSheet, TouchableOpacity, 
    TextInput, Modal, ScrollView, Dimensions, Pressable,
    Platform, KeyboardAvoidingView, Keyboard
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Colors, Fonts, Shadow } from '../theme';
import { supabase, GOOGLE_MAPS_API_KEY } from '../lib/supabase';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { 
    useSharedValue, useAnimatedStyle, withSpring, 
    runOnJS 
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');
const CANVAS_WIDTH = width;
const CANVAS_HEIGHT = height; // Fullscreen like Instagram

const FONTS = [
    { id: 'classic', label: 'Classic', fontFamily: Fonts.bold },
    { id: 'modern', label: 'Modern', fontFamily: Fonts.regular },
    { id: 'serif', label: 'Serif', fontFamily: Platform.OS === 'ios' ? 'Times New Roman' : 'serif' },
    { id: 'mono', label: 'Mono', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
    { id: 'neon', label: 'Neon', fontFamily: Fonts.medium, neon: true },
];

const COLORS = ['#ffffff', '#000000', '#FF3B30', '#4CD964', '#007AFF', '#FFCC00', '#5856D6', '#FF9500', '#FF2D55'];

interface ElementData {
    id: string;
    type: 'text' | 'location' | 'gif' | 'sticker';
    data: any;
    x: number;
    y: number;
    scale: number;
    rotation: number;
}

// ─── Draggable Element Component ──────────────────────────────────────────────
const DraggableElement = ({ element, onUpdate, onDelete, isSelected, onSelect }: {
    element: ElementData;
    onUpdate: (id: string, updates: Partial<ElementData>) => void;
    onDelete: (id: string) => void;
    isSelected: boolean;
    onSelect: (id: string) => void;
}) => {
    const translationX = useSharedValue(element.x * CANVAS_WIDTH);
    const translationY = useSharedValue(element.y * CANVAS_HEIGHT);
    const scale = useSharedValue(element.scale || 1);
    const rotation = useSharedValue(element.rotation || 0);

    const savedX = useSharedValue(element.x * CANVAS_WIDTH);
    const savedY = useSharedValue(element.y * CANVAS_HEIGHT);
    const savedScale = useSharedValue(element.scale || 1);
    const savedRotation = useSharedValue(element.rotation || 0);

    const panGesture = Gesture.Pan()
        .onStart(() => {
            runOnJS(onSelect)(element.id);
        })
        .onUpdate((event) => {
            translationX.value = savedX.value + event.translationX;
            translationY.value = savedY.value + event.translationY;
        })
        .onEnd(() => {
            savedX.value = translationX.value;
            savedY.value = translationY.value;
            runOnJS(onUpdate)(element.id, { 
                x: translationX.value / CANVAS_WIDTH, 
                y: translationY.value / CANVAS_HEIGHT 
            });
            if (translationY.value > CANVAS_HEIGHT - 120) {
                runOnJS(onDelete)(element.id);
            }
        });

    const pinchGesture = Gesture.Pinch()
        .onUpdate((event) => {
            scale.value = savedScale.value * event.scale;
        })
        .onEnd(() => {
            savedScale.value = scale.value;
            runOnJS(onUpdate)(element.id, { scale: scale.value });
        });

    const rotationGesture = Gesture.Rotation()
        .onUpdate((event) => {
            rotation.value = savedRotation.value + event.rotation;
        })
        .onEnd(() => {
            savedRotation.value = rotation.value;
            runOnJS(onUpdate)(element.id, { rotation: rotation.value });
        });

    const gestures = Gesture.Simultaneous(panGesture, pinchGesture, rotationGesture);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: translationX.value },
            { translateY: translationY.value },
            { scale: scale.value },
            { rotate: `${rotation.value}rad` },
        ],
        position: 'absolute',
        zIndex: isSelected ? 1000 : 1,
    }));

    const renderContent = () => {
        const font = FONTS.find(f => f.id === element.data.fontId) || FONTS[0];
        switch (element.type) {
            case 'text':
                return (
                    <View style={[
                        st.textElement, 
                        element.data.hasBg && { backgroundColor: element.data.color === '#ffffff' ? 'rgba(0,0,0,0.5)' : element.data.color + '40', borderRadius: 12 },
                        font.neon && { textShadowColor: element.data.color, textShadowRadius: 10 }
                    ]}>
                        <Text style={[
                            st.elementText, 
                            { color: element.data.color, fontFamily: font.fontFamily, fontSize: element.data.fontSize || 24 }
                        ]}>
                            {element.data.text}
                        </Text>
                    </View>
                );
            case 'location':
                return (
                    <LinearGradient
                        colors={[Colors.primary, Colors.primaryDark]}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={st.locationPill}
                    >
                        <Ionicons name="location" size={16} color="#fff" />
                        <Text style={st.locationText}>{element.data.text}</Text>
                    </LinearGradient>
                );
            case 'gif':
                return (
                    <Image source={{ uri: element.data.url }} style={{ width: 140, height: 140 }} contentFit="contain" />
                );
            case 'sticker':
                return (
                    <View style={st.capsuleSticker}>
                        <Image source={{ uri: element.data.imageUrl }} style={st.stickerImage} contentFit="contain" />
                        <Text style={st.stickerTitle}>{element.data.title}</Text>
                    </View>
                );
            default:
                return null;
        }
    };

    return (
        <GestureDetector gesture={gestures}>
            <Animated.View style={animatedStyle}>
                {renderContent()}
            </Animated.View>
        </GestureDetector>
    );
};

// ─── Main FlashEditor ────────────────────────────────────────────────────────
export default function FlashEditor({ item, capsule, onCancel, onConfirm }: { 
    item: any; 
    capsule?: any; 
    onCancel: () => void; 
    onConfirm: (metadata: any) => void;
}) {
    const [elements, setElements] = useState<ElementData[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    
    const [isEditingText, setIsEditingText] = useState(false);
    const [currentText, setCurrentText] = useState('');
    const [currentFontId, setCurrentFontId] = useState('classic');
    const [currentColor, setCurrentColor] = useState('#ffffff');
    const [hasBg, setHasBg] = useState(true);

    const [modalMode, setModalMode] = useState<'none' | 'location' | 'gif' | 'sticker'>('none');
    const [searchQuery, setSearchQuery] = useState('');
    const [gifResults, setGifResults] = useState<any[]>([]);
    const [locationResults, setLocationResults] = useState<string[]>([]);

    useEffect(() => {
        if (modalMode === 'gif' && searchQuery.length > 2) {
            const mocks = [
                'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHYyeHI0eW54eXN4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHgmZXA9djFfaW50ZXJuYWxfZ2lmX2J5X2lkJmN0PWc/3o7TKVUn7iM8FMEU24/giphy.gif'
            ];
            setGifResults(mocks);
        }
        if (modalMode === 'location' && searchQuery.length > 2) {
            const fetchPlaces = async () => {
                try {
                    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(searchQuery)}&key=${GOOGLE_MAPS_API_KEY}&types=geocode`;
                    const res = await fetch(url);
                    const data = await res.json();
                    if (data.status === 'OK') {
                        setLocationResults(data.predictions.map((p: any) => p.description));
                    }
                } catch (e) {
                    console.error('Places API error', e);
                }
            };
            const timer = setTimeout(fetchPlaces, 300);
            return () => clearTimeout(timer);
        }
    }, [searchQuery, modalMode]);

    const addText = () => {
        setIsEditingText(true);
        setCurrentText('');
        setSelectedId(null);
    };

    const confirmText = () => {
        if (!currentText.trim()) {
            setIsEditingText(false);
            return;
        }
        const id = selectedId || Date.now().toString();
        const elementData = {
            text: currentText,
            color: currentColor,
            fontId: currentFontId,
            hasBg,
            bgColor: currentColor === '#ffffff' ? 'rgba(0,0,0,0.5)' : currentColor + '40',
            fontSize: 28,
        };

        if (selectedId) {
            setElements(prev => prev.map((e) => e.id === id ? { ...e, data: elementData } : e));
        } else {
            setElements(prev => [...prev, {
                id,
                type: 'text',
                data: elementData,
                x: 0.5,
                y: 0.4,
                scale: 1,
                rotation: 0
            }]);
        }
        setIsEditingText(false);
        setSelectedId(null);
    };

    const addLocation = (loc: string) => {
        setElements(prev => [...prev, {
            id: Date.now().toString(),
            type: 'location',
            data: { text: loc },
            x: 0.5,
            y: 0.3,
            scale: 1,
            rotation: 0
        }]);
        setModalMode('none');
        setSearchQuery('');
    };

    const addGif = (url: string) => {
        setElements(prev => [...prev, {
            id: Date.now().toString(),
            type: 'gif',
            data: { url },
            x: 0.5,
            y: 0.5,
            scale: 1,
            rotation: 0
        }]);
        setModalMode('none');
        setSearchQuery('');
    };

    const addCapsuleSticker = () => {
        if (!capsule) return;
        setElements(prev => [...prev, {
            id: Date.now().toString(),
            type: 'sticker',
            data: { 
                title: capsule.title, 
                imageUrl: capsule.thumbnail_url || capsule.media_url,
                id: capsule.id
            },
            x: 0.5,
            y: 0.6,
            scale: 1,
            rotation: 0
        }]);
        setModalMode('none');
    };

    const updateElement = (id: string, updates: Partial<ElementData>) => {
        setElements(prev => prev.map(e => e.id === id ? { ...e, ...updates } as ElementData : e));
    };

    const deleteElement = (id: string) => {
        setElements(prev => prev.filter(e => e.id !== id));
    };

    const handleConfirm = () => {
        onConfirm({ elements });
    };

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <View style={st.container}>
                <View style={st.canvas}>
                    <Image source={{ uri: item.media_url }} style={st.preview} contentFit="contain" />
                    
                    {elements.map(e => (
                        <DraggableElement 
                            key={e.id} 
                            element={e} 
                            isSelected={selectedId === e.id}
                            onUpdate={updateElement}
                            onDelete={deleteElement}
                            onSelect={setSelectedId}
                        />
                    ))}

                    <View style={st.trashZone}>
                        <Ionicons name="trash-outline" size={24} color="#fff" />
                    </View>
                </View>

                <View style={st.topActions}>
                    <TouchableOpacity onPress={onCancel} style={st.circleBtn}>
                        <Ionicons name="close" size={24} color="#fff" />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity onPress={() => setModalMode('sticker')} style={st.circleBtn}>
                        <MaterialCommunityIcons name="sticker-emoji" size={24} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setModalMode('gif')} style={st.circleBtn}>
                        <MaterialCommunityIcons name="file-gif-box" size={24} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={addText} style={st.circleBtn}>
                        <Ionicons name="text" size={24} color="#fff" />
                    </TouchableOpacity>
                </View>

                <View style={st.bottomActions}>
                    <TouchableOpacity style={st.locationBtn} onPress={() => setModalMode('location')}>
                        <Ionicons name="location" size={18} color="#fff" />
                        <Text style={st.locationBtnText}>Location</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={st.shareBtn} onPress={handleConfirm}>
                        <LinearGradient colors={Gradients.cosmic} style={st.shareGrad}>
                            <Text style={st.shareText}>Share Flash</Text>
                            <Ionicons name="arrow-forward" size={18} color="#fff" />
                        </LinearGradient>
                    </TouchableOpacity>
                </View>

                <Modal visible={isEditingText} transparent animationType="fade">
                    <BlurView intensity={90} tint="dark" style={st.textModalRoot}>
                        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                            <View style={st.textModalHeader}>
                                <TouchableOpacity onPress={() => setHasBg(!hasBg)} style={st.textToolBtn}>
                                    <Ionicons name="color-filter" size={24} color={hasBg ? Colors.primary : "#fff"} />
                                </TouchableOpacity>
                                <View style={{ flex: 1 }} />
                                <TouchableOpacity onPress={confirmText}>
                                    <Text style={st.doneBtnText}>Done</Text>
                                </TouchableOpacity>
                            </View>

                            <View style={st.inputContainer}>
                                <TextInput
                                    autoFocus
                                    multiline
                                    style={[
                                        st.textInput, 
                                        { color: currentColor, fontFamily: FONTS.find(f => f.id === currentFontId)?.fontFamily },
                                        hasBg && { backgroundColor: currentColor === '#ffffff' ? 'rgba(0,0,0,0.5)' : currentColor + '40', borderRadius: 12, padding: 10 }
                                    ]}
                                    value={currentText}
                                    onChangeText={setCurrentText}
                                    selectionColor={currentColor}
                                />
                            </View>

                            <View style={st.textModalFooter}>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.fontScroller}>
                                    {FONTS.map(f => (
                                        <TouchableOpacity 
                                            key={f.id} 
                                            onPress={() => setCurrentFontId(f.id)}
                                            style={[st.fontBtn, currentFontId === f.id && st.fontBtnActive]}
                                        >
                                            <Text style={[st.fontBtnText, { fontFamily: f.fontFamily }]}>{f.label}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                                <View style={st.colorPalette}>
                                    {COLORS.map(c => (
                                        <TouchableOpacity 
                                            key={c} 
                                            onPress={() => setCurrentColor(c)}
                                            style={[st.colorCircle, { backgroundColor: c }, currentColor === c && st.colorCircleActive]}
                                        />
                                    ))}
                                </View>
                            </View>
                        </KeyboardAvoidingView>
                    </BlurView>
                </Modal>

                <Modal visible={modalMode !== 'none'} transparent animationType="slide">
                    <BlurView intensity={100} tint="dark" style={st.utilityModal}>
                        <Pressable style={st.modalHandle} onPress={() => setModalMode('none')} />
                        <View style={st.modalHeader}>
                            <Text style={st.modalTitle}>{modalMode.toUpperCase()}</Text>
                            <TouchableOpacity onPress={() => setModalMode('none')}>
                                <Ionicons name="close" size={24} color="#fff" />
                            </TouchableOpacity>
                        </View>

                        {modalMode === 'location' && (
                            <View style={{ flex: 1, padding: 20 }}>
                                <TextInput 
                                    style={st.searchBar} 
                                    placeholder="Search location..." 
                                    placeholderTextColor="rgba(255,255,255,0.4)" 
                                    value={searchQuery}
                                    autoFocus
                                    onChangeText={setSearchQuery}
                                    onSubmitEditing={() => addLocation(searchQuery)}
                                />
                                <ScrollView>
                                    {locationResults.map((loc, i) => (
                                        <TouchableOpacity key={i} style={st.locResult} onPress={() => addLocation(loc)}>
                                            <Ionicons name="navigate" size={18} color={Colors.primary} />
                                            <Text style={st.locResultText}>{loc}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        )}

                        {modalMode === 'gif' && (
                            <View style={{ flex: 1, padding: 20 }}>
                                <TextInput 
                                    style={st.searchBar} 
                                    placeholder="Search GIPHY..." 
                                    placeholderTextColor="rgba(255,255,255,0.4)" 
                                    value={searchQuery}
                                    autoFocus
                                    onChangeText={setSearchQuery}
                                />
                                <ScrollView contentContainerStyle={st.gifGrid}>
                                    {gifResults.map((url, i) => (
                                        <TouchableOpacity key={i} onPress={() => addGif(url)}>
                                            <Image source={{ uri: url }} style={st.gifThumbnail} />
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        )}

                        {modalMode === 'sticker' && (
                            <View style={{ flex: 1, padding: 20, alignItems: 'center' }}>
                                <Text style={st.stickerLabel}>Your Capsule Sticker</Text>
                                <TouchableOpacity style={st.capsuleStickerPreview} onPress={addCapsuleSticker}>
                                    <BlurView intensity={30} style={st.stickerBlur}>
                                        <Image source={{ uri: capsule?.thumbnail_url || capsule?.media_url }} style={{ width: 80, height: 80 }} contentFit="contain" />
                                        <Text style={st.stickerName}>{capsule?.title}</Text>
                                    </BlurView>
                                </TouchableOpacity>
                            </View>
                        )}
                    </BlurView>
                </Modal>
            </View>
        </GestureHandlerRootView>
    );
}

const Gradients = {
    cosmic: ['#a66eff', '#7938ff', '#00f2ff'] as const,
};

const st = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    canvas: { flex: 1, overflow: 'hidden' },
    preview: { width: '100%', height: '100%' },
    
    // Elements
    textElement: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
    elementText: { textAlign: 'center' },
    locationPill: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 14, paddingVertical: 10, borderRadius: 25,
        ...Shadow.lg
    },
    locationText: { color: '#fff', fontFamily: Fonts.bold, fontSize: 15 },
    capsuleSticker: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', padding: 10, borderRadius: 20 },
    stickerImage: { width: 100, height: 100 },
    stickerTitle: { color: '#fff', fontFamily: Fonts.bold, marginTop: 5 },

    trashZone: { position: 'absolute', bottom: 120, alignSelf: 'center', width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,59,48,0.5)', alignItems: 'center', justifyContent: 'center' },

    // Actions
    topActions: { position: 'absolute', top: 60, left: 15, right: 15, flexDirection: 'row', gap: 12, zIndex: 200 },
    circleBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
    
    bottomActions: { position: 'absolute', bottom: 40, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 200 },
    locationBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 16, height: 44, borderRadius: 22 },
    locationBtnText: { color: '#fff', fontFamily: Fonts.semiBold },
    shareBtn: { borderRadius: 25, overflow: 'hidden', height: 50, paddingHorizontal: 25 },
    shareGrad: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' },
    shareText: { color: '#fff', fontFamily: Fonts.bold, fontSize: 16 },

    // Text Modal
    textModalRoot: { flex: 1, padding: 20 },
    textModalHeader: { flexDirection: 'row', paddingTop: 40, height: 100, alignItems: 'center' },
    textToolBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    doneBtnText: { color: '#fff', fontSize: 18, fontFamily: Fonts.bold },
    inputContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    textInput: { textAlign: 'center', fontSize: 32, minWidth: 200, maxWidth: '90%' },
    textModalFooter: { paddingBottom: 40, gap: 20 },
    fontScroller: { maxHeight: 50 },
    fontBtn: { paddingHorizontal: 15, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', marginRight: 10 },
    fontBtnActive: { backgroundColor: Colors.primary },
    fontBtnText: { color: '#fff' },
    colorPalette: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
    colorCircle: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
    colorCircleActive: { borderColor: '#fff' },

    // Utility Modal
    utilityModal: { flex: 1, borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: 'hidden', marginTop: 100 },
    modalHandle: { width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.3)', alignSelf: 'center', marginTop: 12, borderRadius: 2 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
    modalTitle: { color: '#fff', fontSize: 16, fontFamily: Fonts.bold, letterSpacing: 1 },
    searchBar: { height: 50, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingHorizontal: 15, color: '#fff', marginBottom: 20 },
    locResult: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    locResultText: { color: '#fff', fontFamily: Fonts.medium },
    gifGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    gifThumbnail: { width: (width - 60) / 3, height: (width - 60) / 3, borderRadius: 10 },
    stickerLabel: { color: Colors.textMuted, marginBottom: 20 },
    capsuleStickerPreview: { width: 140, height: 180, borderRadius: 20, overflow: 'hidden' },
    stickerBlur: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
    stickerName: { color: '#fff', fontFamily: Fonts.bold, textAlign: 'center', paddingHorizontal: 10 }
});
