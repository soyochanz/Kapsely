import React, { useState } from 'react';
import { 
    View, Text, StyleSheet, Image, TouchableOpacity, 
    TextInput, Modal, ScrollView, Dimensions, Pressable
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts } from '../theme';

const { width, height } = Dimensions.get('window');

const FILTERS = [
    { id: 'none', label: 'Original', color: 'transparent' },
    { id: 'vintage', label: 'Vintage', color: 'rgba(230, 190, 120, 0.25)' },
    { id: 'warm', label: 'Warm', color: 'rgba(255, 150, 50, 0.18)' },
    { id: 'cool', label: 'Cool', color: 'rgba(0, 150, 255, 0.18)' },
    { id: 'dark', label: 'Dark', color: 'rgba(0, 0, 0, 0.4)' },
    { id: 'noir', label: 'B&W', color: 'rgba(0, 0, 0, 0.3)', grayscale: true }, // simulation
];

const EMOJIS = ['🔥', '😂', '😍', '❤️', '👀', '🤯', '🙌', '✨', '🍿', '💡', '💯', '🥵'];

export default function StoryEditor({ item, onCancel, onConfirm }: { item: any, onCancel: () => void, onConfirm: (metadata: any) => void }) {
    const [selectedFilter, setSelectedFilter] = useState('none');
    const [texts, setTexts] = useState<any[]>([]);
    const [emojis, setEmojis] = useState<any[]>([]);
    
    const [textModalVisible, setTextModalVisible] = useState(false);
    const [currentText, setCurrentText] = useState('');
    const [textColor, setTextColor] = useState('#ffffff');
    const [textBg, setTextBg] = useState('rgba(0,0,0,0.5)');

    const handleAddText = () => {
        if (!currentText.trim()) return;
        setTexts([...texts, {
            id: Date.now().toString(),
            text: currentText.trim(),
            x: 0.5,
            y: 0.4,
            color: textColor,
            bg: textBg
        }]);
        setCurrentText('');
        setTextModalVisible(false);
    };

    const handleAddEmoji = (emoji: string) => {
        setEmojis([...emojis, {
            id: Date.now().toString() + emoji,
            emoji,
            x: Math.random() * 0.6 + 0.2,
            y: Math.random() * 0.4 + 0.3
        }]);
    };

    const handleConfirm = () => {
        const metadata = {
            filter: selectedFilter,
            texts,
            emojis
        };
        onConfirm(metadata);
    };

    const activeFilterConfig = FILTERS.find(f => f.id === selectedFilter);

    return (
        <View style={styles.container}>
            <View style={styles.imageContainer}>
                <Image source={{ uri: item.media_url }} style={styles.image} resizeMode="cover" />
                
                {/* Filter Overlay */}
                {activeFilterConfig && activeFilterConfig.color !== 'transparent' && (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: activeFilterConfig.color }]} pointerEvents="none" />
                )}

                {/* Simulated B&W or filters if needed (grayscale isn't trivial on normal Image, keeping pure bg cover simulation for simplicity) */}

                {/* Overlays (Texts) */}
                {texts.map((t) => (
                    <View 
                        key={t.id} 
                        style={[styles.overlayTextContainer, { top: t.y * (height * 0.65), left: t.x * width - 50 }]}
                    >
                        <View style={[styles.overlayTextWrap, { backgroundColor: t.bg }]}>
                            <Text style={[styles.overlayText, { color: t.color }]}>{t.text}</Text>
                        </View>
                    </View>
                ))}

                {/* Overlays (Emojis) */}
                {emojis.map((e) => (
                    <Text 
                        key={e.id} 
                        style={[styles.overlayEmoji, { top: e.y * (height * 0.65), left: e.x * width }]}
                    >
                        {e.emoji}
                    </Text>
                ))}
            </View>

            {/* Toolbar */}
            <View style={styles.toolbar}>
                <TouchableOpacity style={styles.toolBtn} onPress={() => setTextModalVisible(true)}>
                    <Ionicons name="text" size={20} color="#fff" />
                    <Text style={styles.toolText}>Text</Text>
                </TouchableOpacity>

                <View style={styles.emojiRow}>
                    {EMOJIS.slice(0, 5).map((e) => (
                        <TouchableOpacity key={e} style={styles.emojiBtn} onPress={() => handleAddEmoji(e)}>
                            <Text style={{ fontSize: 24 }}>{e}</Text>
                        </TouchableOpacity>
                    ))}
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
            <Modal visible={textModalVisible} transparent animationType="fade">
                <Pressable style={styles.modalOverlay} onPress={() => setTextModalVisible(false)}>
                    <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
                        <TextInput
                            style={[styles.input, { color: textColor, backgroundColor: textBg }]}
                            placeholder="Add text..."
                            placeholderTextColor="#999"
                            value={currentText}
                            onChangeText={setCurrentText}
                            autoFocus
                            multiline
                        />
                        <View style={styles.colorRow}>
                            {['#ffffff', '#000000', '#ff3b30', '#ffcc00', '#4cd964', '#5856d6'].map((c) => (
                                <TouchableOpacity 
                                    key={c} 
                                    style={[styles.colorDot, { backgroundColor: c }, textColor === c && { borderWidth: 2, borderColor: '#fff' }]} 
                                    onPress={() => setTextColor(c)}
                                />
                            ))}
                        </View>
                        <TouchableOpacity style={styles.saveBtn} onPress={handleAddText}>
                            <Text style={{ color: '#fff', fontFamily: Fonts.bold }}>Save</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#111' },
    imageContainer: { width: '100%', height: '65%', position: 'relative', overflow: 'hidden', backgroundColor: '#000' },
    image: { width: '100%', height: '100%' },
    overlayTextContainer: { position: 'absolute', zIndex: 10 },
    overlayTextWrap: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
    overlayText: { fontSize: 18, fontFamily: Fonts.bold },
    overlayEmoji: { position: 'absolute', fontSize: 32, zIndex: 10 },
    toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 15, backgroundColor: '#222', borderTopWidth: 1, borderTopColor: '#333' },
    toolBtn: { alignItems: 'center', gap: 4 },
    toolText: { color: '#fff', fontSize: 11, fontFamily: Fonts.medium },
    emojiRow: { flexDirection: 'row', gap: 12 },
    emojiBtn: { padding: 4 },
    filterBar: { paddingVertical: 12, backgroundColor: '#1a1a1a' },
    filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#333' },
    filterChipActive: { backgroundColor: Colors.primary },
    filterChipText: { color: '#ccc', fontSize: 12, fontFamily: Fonts.semiBold },
    footer: { flexDirection: 'row', padding: 15, gap: 15, backgroundColor: '#111' },
    cancelBtn: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
    confirmBtn: { flex: 1, height: 48, borderRadius: 12, overflow: 'hidden' },
    confirmGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { width: '85%', padding: 20, borderRadius: 16, backgroundColor: '#222', alignItems: 'center' },
    input: { width: '100%', fontSize: 20, fontFamily: Fonts.bold, padding: 15, borderRadius: 12, minHeight: 60, textAlign: 'center', marginBottom: 20 },
    colorRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    colorDot: { width: 24, height: 24, borderRadius: 12 },
    saveBtn: { paddingHorizontal: 30, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.primary },
});
