import React, { useState, useRef } from 'react';
import { 
    View, Text, StyleSheet, Image, TouchableOpacity, 
    TextInput, Modal, ScrollView, Dimensions, Pressable,
    PanResponder, Animated, Platform
} from 'react-native';
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
    const [selectedFilter, setSelectedFilter] = useState('none');
    const [texts, setTexts] = useState<any[]>([]);
    const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
    
    const [textModalVisible, setTextModalVisible] = useState(false);
    const [currentText, setCurrentText] = useState('');
    const [textColor, setTextColor] = useState('#ffffff');
    const [textBg, setTextBg] = useState('rgba(0,0,0,0.5)');
    const [fontSize, setFontSize] = useState(24);
    
    const [imgContainerLayout, setImgContainerLayout] = useState({ width, height: height * 0.7 });

    const handleAddText = () => {
        if (!currentText.trim()) return;
        
        if (selectedTextId) {
            // Update existing
            setTexts(texts.map(t => t.id === selectedTextId ? {
                ...t,
                text: currentText.trim(),
                color: textColor,
                bg: textBg,
                fontSize
            } : t));
        } else {
            // Add new
            const id = Date.now().toString();
            setTexts([...texts, {
                id,
                text: currentText.trim(),
                x: width * 0.5,
                y: imgContainerLayout.height * 0.4,
                color: textColor,
                bg: textBg,
                fontSize,
                translateX: new Animated.Value(0),
                translateY: new Animated.Value(0),
            }]);
        }
        
        setCurrentText('');
        setSelectedTextId(null);
        setTextModalVisible(false);
    };

    const deleteText = (id: string) => {
        setTexts(texts.filter(t => t.id !== id));
        setSelectedTextId(null);
    };

    const handleConfirm = () => {
        // Flatten Animated values for metadata
        const metadata = {
            filter: selectedFilter,
            texts: texts.map(t => ({
                id: t.id,
                text: t.text,
                color: t.color,
                bg: t.bg,
                fontSize: t.fontSize,
                x: t.x + ((t.translateX as any)._value || 0),
                y: t.y + ((t.translateY as any)._value || 0),
            }))
        };
        onConfirm(metadata);
    };

    const activeFilterConfig = FILTERS.find(f => f.id === selectedFilter);

    // Draggable Component
    const DraggableText = ({ item }: { item: any }) => {
        const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
        const lastOffset = useRef({ x: 0, y: 0 });

        const panResponder = useRef(
            PanResponder.create({
                onStartShouldSetPanResponder: () => true,
                onPanResponderGrant: () => {
                    pan.setOffset({ x: lastOffset.current.x, y: lastOffset.current.y });
                    pan.setValue({ x: 0, y: 0 });
                },
                onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
                onPanResponderRelease: (e, gesture) => {
                    pan.flattenOffset();
                    lastOffset.current = { x: (pan.x as any)._value, y: (pan.y as any)._value };
                    // Sink internal values to the main state if needed, but for rendering Animated is fine
                    item.translateX.setValue((pan.x as any)._value);
                    item.translateY.setValue((pan.y as any)._value);
                },
            })
        ).current;

        const isSelected = selectedTextId === item.id;

        return (
            <Animated.View
                {...panResponder.panHandlers}
                style={[
                    styles.draggableTextRoot,
                    {
                        top: item.y,
                        left: item.x,
                        transform: [
                            { translateX: pan.x },
                            { translateY: pan.y }
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
                        setFontSize(item.fontSize || 24);
                        setTextModalVisible(true);
                    }}
                    onPress={() => setSelectedTextId(isSelected ? null : item.id)}
                    style={[
                        styles.overlayTextWrap, 
                        { backgroundColor: item.bg, borderColor: isSelected ? Colors.primary : 'transparent', borderWidth: isSelected ? 2 : 0 }
                    ]}
                >
                    <Text style={[styles.overlayText, { color: item.color, fontSize: item.fontSize || 24 }]}>{item.text}</Text>
                    
                    {isSelected && (
                        <TouchableOpacity 
                            style={styles.deleteBadge} 
                            onPress={() => deleteText(item.id)}
                        >
                            <Ionicons name="close" size={14} color="#fff" />
                        </TouchableOpacity>
                    )}
                </TouchableOpacity>
            </Animated.View>
        );
    };

    return (
        <View style={styles.container}>
            <View 
                style={styles.imageContainer}
                onLayout={(e) => setImgContainerLayout({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
            >
                <Image source={{ uri: item.media_url }} style={styles.image} resizeMode="contain" />
                
                {/* Filter Overlay */}
                {activeFilterConfig && activeFilterConfig.color !== 'transparent' && (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: activeFilterConfig.color }]} pointerEvents="none" />
                )}

                {/* Overlays (Texts) */}
                {texts.map((t) => (
                    <DraggableText key={t.id} item={t} />
                ))}
            </View>

            {/* Toolbar */}
            <View style={styles.toolbar}>
                <TouchableOpacity 
                    style={styles.toolBtn} 
                    onPress={() => {
                        setSelectedTextId(null);
                        setCurrentText('');
                        setFontSize(24);
                        setTextModalVisible(true);
                    }}
                >
                    <Ionicons name="text" size={24} color="#fff" />
                    <Text style={styles.toolText}>Add Text</Text>
                </TouchableOpacity>

                <View style={styles.instrBox}>
                    <Text style={styles.instrText}>Drag to move • Long press to edit</Text>
                </View>
            </View>

            {/* Filters Slider */}
            <View style={styles.filterBar}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 20 }}>
                    {FILTERS.map((f) => (
                        <TouchableOpacity 
                            key={f.id} 
                            style={[styles.filterChip, selectedFilter === f.id && styles.filterChipActive]}
                            onPress={() => setSelectedFilter(f.id)}
                        >
                            <Text style={[styles.filterChipText, selectedFilter === f.id && { color: '#fff' }]}>{f.label}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {/* Footer Actions */}
            <View style={styles.footer}>
                <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
                    <Text style={{ color: Colors.textSecondary, fontFamily: Fonts.bold }}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
                    <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.confirmGrad}>
                        <Text style={{ color: '#fff', fontFamily: Fonts.bold }}>Next</Text>
                    </LinearGradient>
                </TouchableOpacity>
            </View>

            {/* Text Entry Modal */}
            <Modal visible={textModalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
                    <View style={styles.modalHeader}>
                        <TouchableOpacity onPress={() => setTextModalVisible(false)}>
                            <Text style={styles.modalActionText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleAddText}>
                            <Text style={[styles.modalActionText, { color: Colors.primary }]}>Done</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.modalBody}>
                        <TextInput
                            style={[styles.input, { color: textColor, backgroundColor: textBg, fontSize }]}
                            placeholder="Add text..."
                            placeholderTextColor="rgba(255,255,255,0.4)"
                            value={currentText}
                            onChangeText={(t) => setCurrentText(t.replace(/(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g, ''))}
                            autoFocus
                            multiline
                            textAlign="center"
                        />
                        
                        <View style={styles.editorControls}>
                            {/* Color Selector */}
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colorRow}>
                                {['#ffffff', '#000000', '#ff3b30', '#ffcc00','#4cd964','#5ac8fa','#007aff','#5856d6','#ff2d55','#af52de'].map((c) => (
                                    <TouchableOpacity 
                                        key={c} 
                                        style={[styles.colorDot, { backgroundColor: c }, textColor === c && styles.colorDotActive]} 
                                        onPress={() => setTextColor(c)}
                                    />
                                ))}
                            </ScrollView>

                            {/* Font Size Selector */}
                            <View style={styles.sizeSection}>
                                <Text style={styles.controlLabel}>Size: {fontSize}</Text>
                                <View style={styles.sizeSliderRow}>
                                    {[16, 20, 24, 32, 40, 48].map(s => (
                                        <TouchableOpacity 
                                            key={s} 
                                            onPress={() => setFontSize(s)}
                                            style={[styles.sizeOption, fontSize === s && styles.sizeOptionActive]}
                                        >
                                            <Text style={[styles.sizeOptionText, fontSize === s && { color: '#fff' }]}>{s}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>

                            {/* Background toggle */}
                            <TouchableOpacity 
                                style={styles.bgToggle} 
                                onPress={() => setTextBg(textBg === 'transparent' ? 'rgba(0,0,0,0.6)' : 'transparent')}
                            >
                                <Ionicons name="square" size={20} color={textBg === 'transparent' ? '#666' : '#fff'} />
                                <Text style={{ color: '#fff', fontSize: 12 }}>Transparent BG</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}



const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    imageContainer: { width: '100%', flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: '#000' },
    image: { width: '100%', height: '100%' },
    
    // Draggable
    draggableTextRoot: {
        position: 'absolute',
        zIndex: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    overlayTextWrap: { 
        paddingHorizontal: 15, 
        paddingVertical: 8, 
        borderRadius: 12,
        maxWidth: width * 0.8,
        position: 'relative'
    },
    overlayText: { fontFamily: Fonts.bold, textAlign: 'center' },
    deleteBadge: {
        position: 'absolute',
        top: -10,
        right: -10,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#ff3b30',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: '#fff'
    },

    toolbar: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        padding: 15, 
        backgroundColor: '#111', 
        borderTopWidth: 1, 
        borderTopColor: '#222' 
    },
    toolBtn: { alignItems: 'center', gap: 6 },
    toolText: { color: '#fff', fontSize: 13, fontFamily: Fonts.bold },
    instrBox: { flex: 1, alignItems: 'flex-end' },
    instrText: { color: '#888', fontSize: 11, fontFamily: Fonts.medium },

    filterBar: { paddingVertical: 12, backgroundColor: '#111' },
    filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#222' },
    filterChipActive: { backgroundColor: Colors.primary },
    filterChipText: { color: '#777', fontSize: 12, fontFamily: Fonts.semiBold },

    footer: { flexDirection: 'row', padding: 15, gap: 15, backgroundColor: '#000', paddingBottom: Platform.OS === 'ios' ? 30 : 15 },
    cancelBtn: { flex: 1, height: 50, borderRadius: 25, borderWidth: 1, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
    confirmBtn: { flex: 1, height: 50, borderRadius: 25, overflow: 'hidden' },
    confirmGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
    modalHeader: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        paddingHorizontal: 20, 
        paddingTop: Platform.OS === 'ios' ? 50 : 20,
        zIndex: 10
    },
    modalActionText: { color: '#fff', fontSize: 16, fontFamily: Fonts.bold },
    modalBody: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
    input: { 
        width: '100%', 
        fontFamily: Fonts.bold, 
        padding: 15, 
        borderRadius: 16, 
        minHeight: 100, 
        textAlign: 'center', 
        marginBottom: 30 
    },
    editorControls: { width: '100%', alignItems: 'center' },
    colorRow: { gap: 12, paddingHorizontal: 20, paddingBottom: 20 },
    colorDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: 'transparent' },
    colorDotActive: { borderColor: '#fff', transform: [{ scale: 1.2 }] },
    
    sizeSection: { width: '100%', marginBottom: 20 },
    controlLabel: { color: '#888', fontSize: 11, fontFamily: Fonts.bold, marginBottom: 8, textAlign: 'center' },
    sizeSliderRow: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
    sizeOption: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' },
    sizeOptionActive: { backgroundColor: Colors.primary },
    sizeOptionText: { color: '#888', fontSize: 12, fontFamily: Fonts.bold },
    
    bgToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 20, backgroundColor: '#333' }
});
