import React, { useState, useRef, useEffect } from 'react';
import { 
    View, Text, StyleSheet, TouchableOpacity, 
    TextInput, Modal, ScrollView, Dimensions, Pressable,
    PanResponder, Animated, Platform
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts } from '../theme';
import { BlurView } from 'expo-blur';

const { width, height } = Dimensions.get('window');

const FILTERS = [
    { id: 'none', label: 'Original', color: 'transparent' },
    { id: 'vintage', label: 'Vintage', color: 'rgba(230, 190, 120, 0.25)' },
    { id: 'warm', label: 'Warm', color: 'rgba(255, 150, 50, 0.18)' },
    { id: 'cool', label: 'Cool', color: 'rgba(0, 150, 255, 0.18)' },
    { id: 'dark', label: 'Dark', color: 'rgba(0, 0, 0, 0.4)' },
    { id: 'noir', label: 'B&W', color: 'rgba(0, 0, 0, 0.3)', grayscale: true },
];

export default function StoryEditor({ item, onCancel, onConfirm }: { item: any, onCancel: () => void, onConfirm: (metadata: any) => void }) {
    const [filter, setFilter] = useState('none');
    const [texts, setTexts] = useState<any[]>([]);
    const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
    const [currentText, setCurrentText] = useState('');
    const [textColor, setTextColor] = useState('#ffffff');
    const [textBg, setTextBg] = useState('rgba(0,0,0,0.5)');
    const [fontSize, setFontSize] = useState(24);

    const [location, setLocation] = useState<any>(null);
    const [locationModalVisible, setLocationModalVisible] = useState(false);
    const [tempLocation, setTempLocation] = useState('');

    const [imgContainerLayout, setImgContainerLayout] = useState({ width: 0, height: 0 });

    const handleAddText = () => {
        const id = Date.now().toString();
        const newText = {
            id,
            text: 'Tap to edit',
            x: 0.5,
            y: 0.4,
            color: '#ffffff',
            bg: 'rgba(0,0,0,0.5)',
            fontSize: 24,
            pan: new Animated.ValueXY({ x: 0, y: 0 })
        };
        setTexts([...texts, newText]);
        setSelectedTextId(id);
        setCurrentText('Tap to edit');
    };

    const handleConfirmText = () => {
        if (!currentText.trim()) {
            setTexts(texts.filter(t => t.id !== selectedTextId));
        } else {
            setTexts(texts.map(t => t.id === selectedTextId ? {
                ...t,
                text: currentText.trim(),
                color: textColor,
                bg: textBg,
                fontSize
            } : t));
        }
        setSelectedTextId(null);
        setCurrentText('');
    };

    const handleConfirmLocation = () => {
        if (tempLocation.trim()) {
            setLocation({
                text: tempLocation.trim(),
                x: 0.5,
                y: 0.2,
                pan: new Animated.ValueXY({ x: 0, y: 0 })
            });
        } else {
            setLocation(null);
        }
        setLocationModalVisible(false);
    };

    const handleConfirm = () => {
        const metadata = {
            filter,
            texts: texts.map(t => {
                const panX = (t.pan.x as any)._value || 0;
                const panY = (t.pan.y as any)._value || 0;
                return {
                    id: t.id,
                    text: t.text,
                    color: t.color,
                    bg: t.bg,
                    fontSize: t.fontSize,
                    x: t.x + (panX / imgContainerLayout.width),
                    y: t.y + (panY / imgContainerLayout.height)
                };
            }),
            location: location ? {
                text: location.text,
                x: location.x + ((location.pan.x as any)._value / imgContainerLayout.width),
                y: location.y + ((location.pan.y as any)._value / imgContainerLayout.height)
            } : null
        };
        onConfirm(metadata);
    };

    // ─── Sub-components ────────────────────────────────────────────────────────
    
    const DraggableText = ({ item }: { item: any }) => {
        const lastOffset = useRef({ x: 0, y: 0 });
        const panResponder = useRef(
            PanResponder.create({
                onStartShouldSetPanResponder: () => true,
                onMoveShouldSetPanResponder: () => true,
                onPanResponderGrant: () => {
                    item.pan.setOffset({ x: lastOffset.current.x, y: lastOffset.current.y });
                    item.pan.setValue({ x: 0, y: 0 });
                },
                onPanResponderMove: Animated.event([null, { dx: item.pan.x, dy: item.pan.y }], { useNativeDriver: false }),
                onPanResponderRelease: () => {
                    item.pan.flattenOffset();
                    lastOffset.current = { x: (item.pan.x as any)._value, y: (item.pan.y as any)._value };
                },
            })
        ).current;

        return (
            <Animated.View
                {...panResponder.panHandlers}
                style={[
                    st.draggable,
                    {
                        top: item.y * imgContainerLayout.height,
                        left: item.x * imgContainerLayout.width,
                        transform: [
                            { translateX: item.pan.x },
                            { translateY: item.pan.y },
                            { translateX: -50 } 
                        ]
                    }
                ]}
            >
                <TouchableOpacity 
                    activeOpacity={0.9} 
                    onLongPress={() => {
                        setSelectedTextId(item.id);
                        setCurrentText(item.text);
                        setTextColor(item.color);
                        setTextBg(item.bg);
                        setFontSize(item.fontSize);
                    }}
                >
                    <View style={[st.textBubble, { backgroundColor: item.bg }]}>
                        <Text style={[st.draggableText, { color: item.color, fontSize: item.fontSize }]}>
                            {item.text}
                        </Text>
                    </View>
                </TouchableOpacity>
            </Animated.View>
        );
    };

    const DraggableLocation = ({ item }: { item: any }) => {
        const lastOffset = useRef({ x: 0, y: 0 });
        const panResponder = useRef(
            PanResponder.create({
                onStartShouldSetPanResponder: () => true,
                onMoveShouldSetPanResponder: () => true,
                onPanResponderGrant: () => {
                    item.pan.setOffset({ x: lastOffset.current.x, y: lastOffset.current.y });
                    item.pan.setValue({ x: 0, y: 0 });
                },
                onPanResponderMove: Animated.event([null, { dx: item.pan.x, dy: item.pan.y }], { useNativeDriver: false }),
                onPanResponderRelease: () => {
                    item.pan.flattenOffset();
                    lastOffset.current = { x: (item.pan.x as any)._value, y: (item.pan.y as any)._value };
                },
            })
        ).current;

        return (
            <Animated.View
                {...panResponder.panHandlers}
                style={[
                    st.draggable,
                    {
                        top: item.y * imgContainerLayout.height,
                        left: item.x * imgContainerLayout.width,
                        transform: [
                            { translateX: item.pan.x },
                            { translateY: item.pan.y },
                            { translateX: -60 }
                        ]
                    }
                ]}
            >
                <TouchableOpacity 
                    activeOpacity={0.9} 
                    onLongPress={() => {
                        setTempLocation(item.text);
                        setLocationModalVisible(true);
                    }}
                >
                    <LinearGradient
                        colors={[Colors.primary, Colors.primaryDark]}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={st.locationPill}
                    >
                        <Ionicons name="location" size={14} color="#fff" />
                        <Text style={st.locationText}>{item.text}</Text>
                    </LinearGradient>
                </TouchableOpacity>
            </Animated.View>
        );
    };

    return (
        <View style={st.container}>
            <View 
                style={st.canvas} 
                onLayout={e => setImgContainerLayout({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
            >
                <Image
                    source={{ uri: item.media_url }}
                    style={st.preview}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                />

                {/* Filter overlays */}
                {filter !== 'none' && (
                    <View style={[StyleSheet.absoluteFill, {
                        backgroundColor: 
                            filter === 'vintage' ? 'rgba(230,190,120,0.25)' :
                            filter === 'warm' ? 'rgba(255,150,50,0.18)' :
                            filter === 'cool' ? 'rgba(0,150,255,0.18)' :
                            filter === 'dark' ? 'rgba(0,0,0,0.4)' : 'transparent',
                        pointerEvents: 'none'
                    } as any]} />
                )}

                {/* Stickers / Overlays */}
                {texts.map(t => <DraggableText key={t.id} item={t} />)}
                {location && <DraggableLocation item={location} />}
            </View>

            {/* Toolbar */}
            <View style={st.toolbar}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.toolsContent}>
                    <TouchableOpacity style={st.toolBtn} onPress={() => setFilter(prev => {
                        const idx = FILTERS.findIndex(f => f.id === prev);
                        return FILTERS[(idx + 1) % FILTERS.length].id;
                    })}>
                        <Ionicons name="color-filter-outline" size={20} color="#fff" />
                        <Text style={st.toolLabel}>Filter</Text>
                        <Text style={st.toolValue}>{filter}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={st.toolBtn} onPress={handleAddText}>
                        <Ionicons name="text-outline" size={20} color="#fff" />
                        <Text style={st.toolLabel}>Text</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={st.toolBtn} onPress={() => { setTempLocation(location?.text || ''); setLocationModalVisible(true); }}>
                        <Ionicons name="location-outline" size={20} color="#fff" />
                        <Text style={st.toolLabel}>Location</Text>
                    </TouchableOpacity>
                </ScrollView>

                <View style={st.actions}>
                    <TouchableOpacity style={st.cancelBtn} onPress={onCancel}>
                        <Text style={st.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={st.confirmBtn} onPress={handleConfirm}>
                        <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={st.confirmGrad}>
                            <Text style={st.confirmText}>Share Now</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Text Editor Modal */}
            <Modal visible={!!selectedTextId} transparent animationType="fade">
                <BlurView intensity={90} tint="dark" style={st.modalRoot}>
                    <View style={st.modalHeader}>
                        <View style={{ flex: 1 }} />
                        <TouchableOpacity onPress={handleConfirmText}>
                            <Text style={st.modalDone}>Done</Text>
                        </TouchableOpacity>
                    </View>
                    
                    <TextInput
                        autoFocus
                        multiline
                        style={[st.mainInput, { color: textColor, fontSize }]}
                        value={currentText}
                        onChangeText={setCurrentText}
                    />

                    <View style={st.modalTools}>
                        <View style={st.colorRow}>
                            {['#ffffff', '#000000', '#FF3B30', '#4CD964', '#007AFF', '#FFCC00', '#5856D6'].map(c => (
                                <TouchableOpacity
                                    key={c}
                                    style={[st.colorDot, { backgroundColor: c }, textColor === c && st.colorActive]}
                                    onPress={() => setTextColor(c)}
                                />
                            ))}
                        </View>
                        <View style={st.bgRow}>
                            {[
                                'transparent',
                                'rgba(0,0,0,0.5)',
                                'rgba(255,255,255,0.8)',
                                Colors.primary
                            ].map(b => (
                                <TouchableOpacity
                                    key={b}
                                    style={[st.bgOption, { backgroundColor: b === 'transparent' ? 'rgba(255,255,255,0.1)' : b }, textBg === b && st.bgActive]}
                                    onPress={() => setTextBg(b)}
                                >
                                    {b === 'transparent' && <Ionicons name="close" size={14} color="#fff" />}
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </BlurView>
            </Modal>

            {/* Location Modal */}
            <Modal visible={locationModalVisible} transparent animationType="fade">
                <BlurView intensity={90} tint="dark" style={st.modalRoot}>
                    <View style={st.modalHeader}>
                        <TouchableOpacity onPress={() => setLocationModalVisible(false)} style={st.modalNav}>
                            <Ionicons name="close" size={24} color="#fff" />
                        </TouchableOpacity>
                        <Text style={st.modalTitle}>Add Location</Text>
                        <TouchableOpacity onPress={handleConfirmLocation}>
                            <Text style={st.modalDone}>Done</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={st.locationInputWrap}>
                        <View style={st.locationIconBox}>
                            <Ionicons name="location" size={24} color={Colors.primary} />
                        </View>
                        <TextInput
                            autoFocus
                            placeholder="Where was this taken?"
                            placeholderTextColor="rgba(255,255,255,0.4)"
                            style={st.locationInput}
                            value={tempLocation}
                            onChangeText={setTempLocation}
                            onSubmitEditing={handleConfirmLocation}
                        />
                    </View>

                    <View style={st.locationHint}>
                        <Ionicons name="information-circle-outline" size={14} color="rgba(255,255,255,0.5)" />
                        <Text style={st.locationHintText}>Type a city, landmark or venue name</Text>
                    </View>
                </BlurView>
            </Modal>
        </View>
    );
}

const st = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    canvas: { flex: 1, position: 'relative', overflow: 'hidden' },
    preview: { width: '100%', height: '100%' },
    
    draggable: { position: 'absolute', minWidth: 100, alignItems: 'center' },
    textBubble: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
    draggableText: { fontFamily: Fonts.bold, textAlign: 'center' },

    locationPill: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 14, paddingVertical: 10, borderRadius: 25,
        shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
        elevation: 6
    },
    locationText: { color: '#fff', fontFamily: Fonts.bold, fontSize: 15 },

    toolbar: { backgroundColor: 'rgba(0,0,0,0.85)', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 10 },
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

    modalRoot: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalHeader: {
        position: 'absolute', top: 60, width: '100%',
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20
    },
    modalNav: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    modalTitle: { color: '#fff', fontSize: 18, fontFamily: Fonts.bold },
    modalDone: { color: Colors.primary, fontSize: 17, fontFamily: Fonts.bold },
    
    mainInput: { width: '100%', textAlign: 'center', fontFamily: Fonts.bold, minHeight: 100 },
    modalTools: { position: 'absolute', bottom: 60, width: '100%', alignItems: 'center', gap: 20 },
    colorRow: { flexDirection: 'row', gap: 12 },
    colorDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
    colorActive: { borderColor: '#fff', transform: [{ scale: 1.2 }] },
    bgRow: { flexDirection: 'row', gap: 15 },
    bgOption: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
    bgActive: { borderColor: '#fff', borderWidth: 2 },

    locationInputWrap: {
        width: '100%', flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20,
        paddingHorizontal: 18, height: 64, gap: 14
    },
    locationIconBox: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
    locationInput: { flex: 1, color: '#fff', fontSize: 18, fontFamily: Fonts.semiBold },
    locationHint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 15 },
    locationHintText: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontFamily: Fonts.regular },
});
