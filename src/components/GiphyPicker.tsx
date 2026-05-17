import React, { useState, useEffect } from 'react';
import { 
    View, Text, StyleSheet, TextInput, FlatList, 
    TouchableOpacity, ActivityIndicator, Dimensions,
    KeyboardAvoidingView, Platform, Modal
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../theme';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';

const { width } = Dimensions.get('window');
const GIPHY_API_KEY = 'rUjPxxgp4F5RuRBfbaT1dq3ThbaHpjfS';

interface GiphyPickerProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (giphy: any) => void;
}

export default function GiphyPicker({ visible, onClose, onSelect }: GiphyPickerProps) {
    const { t } = useTranslation();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (visible) {
            fetchTrending();
        }
    }, [visible]);

    const fetchTrending = async () => {
        setLoading(true);
        try {
            const response = await fetch(`https://api.giphy.com/v1/stickers/trending?api_key=${GIPHY_API_KEY}&limit=30&rating=g`);
            const json = await response.json();
            setResults(json.data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async (text: string) => {
        setQuery(text);
        if (!text.trim()) {
            fetchTrending();
            return;
        }
        setLoading(true);
        try {
            const response = await fetch(`https://api.giphy.com/v1/stickers/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(text)}&limit=30&rating=g`);
            const json = await response.json();
            setResults(json.data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    if (!visible) return null;

    return (
        <Modal visible={visible} transparent animationType="slide">
            <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
            >
                <BlurView intensity={95} tint="dark" style={s.container}>
                    <View style={s.header}>
                        <TouchableOpacity onPress={onClose} style={s.closeBtn}>
                            <Ionicons name="close" size={28} color="#fff" />
                        </TouchableOpacity>
                        <View style={s.searchBar}>
                            <Ionicons name="search" size={18} color="rgba(255,255,255,0.5)" />
                            <TextInput
                                autoFocus
                                placeholder={t('flashes.search_stickers')}
                                placeholderTextColor="rgba(255,255,255,0.4)"
                                style={s.input}
                                value={query}
                                onChangeText={handleSearch}
                                returnKeyType="search"
                            />
                        </View>
                    </View>

                    <View style={s.tabHeader}>
                        <Text style={s.tabTitle}>Stickers</Text>
                    </View>

                    {loading && results.length === 0 ? (
                        <View style={s.centered}>
                            <ActivityIndicator color={Colors.primary} size="large" />
                        </View>
                    ) : (
                        <FlatList
                            data={results}
                            numColumns={3}
                            keyExtractor={item => item.id}
                            contentContainerStyle={s.list}
                            keyboardShouldPersistTaps="handled"
                            renderItem={({ item }) => (
                                <TouchableOpacity 
                                    style={s.giphyItem} 
                                    onPress={() => onSelect(item)}
                                    activeOpacity={0.7}
                                >
                                    <Image
                                        source={{ uri: item.images.fixed_width.url }}
                                        style={s.giphyImg}
                                        contentFit="contain"
                                    />
                                </TouchableOpacity>
                            )}
                        />
                    )}
                </BlurView>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, paddingTop: Platform.OS === 'ios' ? 60 : 40 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12, marginBottom: 16 },
    closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    searchBar: {
        flex: 1, height: 48, backgroundColor: 'rgba(255,255,255,0.12)',
        borderRadius: 24, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 10
    },
    input: { flex: 1, color: '#fff', fontSize: 16, fontFamily: Fonts.regular },
    tabHeader: { paddingHorizontal: 20, marginBottom: 12 },
    tabTitle: { color: '#fff', fontSize: 20, fontFamily: Fonts.bold },
    list: { padding: 10, paddingBottom: 40 },
    giphyItem: { width: (width - 40) / 3, height: (width - 40) / 3, margin: 5, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', overflow: 'hidden', padding: 8 },
    giphyImg: { width: '100%', height: '100%' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' }
});
