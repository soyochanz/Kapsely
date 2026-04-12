import React, { useState, useEffect } from 'react';
import { 
    View, Text, StyleSheet, TextInput, FlatList, 
    TouchableOpacity, ActivityIndicator, Dimensions,
    KeyboardAvoidingView, Platform
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../theme';
import { BlurView } from 'expo-blur';

const { width } = Dimensions.get('window');
const GIPHY_API_KEY = 'rUjPxxgp4F5RuRBfbaT1dq3ThbaHpjfS';

interface GiphyPickerProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (giphy: any) => void;
}

export default function GiphyPicker({ visible, onClose, onSelect }: GiphyPickerProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'stickers' | 'gifs'>('stickers');

    useEffect(() => {
        if (visible) {
            fetchTrending();
        }
    }, [visible, activeTab]);

    const fetchTrending = async () => {
        setLoading(true);
        try {
            const endpoint = activeTab === 'stickers' ? 'stickers/trending' : 'gifs/trending';
            const response = await fetch(`https://api.giphy.com/v1/${endpoint}?api_key=${GIPHY_API_KEY}&limit=20&rating=g`);
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
            const endpoint = activeTab === 'stickers' ? 'stickers/search' : 'gifs/search';
            const response = await fetch(`https://api.giphy.com/v1/${endpoint}?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(text)}&limit=20&rating=g`);
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
        <View style={StyleSheet.absoluteFill}>
            <BlurView intensity={90} tint="dark" style={s.container}>
                <View style={s.header}>
                    <TouchableOpacity onPress={onClose} style={s.closeBtn}>
                        <Ionicons name="close" size={24} color="#fff" />
                    </TouchableOpacity>
                    <View style={s.searchBar}>
                        <Ionicons name="search" size={18} color="rgba(255,255,255,0.5)" />
                        <TextInput
                            autoFocus
                            placeholder="Search Giphy..."
                            placeholderTextColor="rgba(255,255,255,0.4)"
                            style={s.input}
                            value={query}
                            onChangeText={handleSearch}
                        />
                    </View>
                </View>

                <View style={s.tabs}>
                    <TouchableOpacity 
                        style={[s.tab, activeTab === 'stickers' && s.tabActive]} 
                        onPress={() => setActiveTab('stickers')}
                    >
                        <Text style={[s.tabText, activeTab === 'stickers' && s.tabTextActive]}>Stickers</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        style={[s.tab, activeTab === 'gifs' && s.tabActive]} 
                        onPress={() => setActiveTab('gifs')}
                    >
                        <Text style={[s.tabText, activeTab === 'gifs' && s.tabTextActive]}>GIFs</Text>
                    </TouchableOpacity>
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
                        renderItem={({ item }) => (
                            <TouchableOpacity 
                                style={s.giphyItem} 
                                onPress={() => onSelect(item)}
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
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, paddingTop: Platform.OS === 'ios' ? 60 : 40 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12, marginBottom: 16 },
    closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    searchBar: {
        flex: 1, height: 44, backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 22, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 10
    },
    input: { flex: 1, color: '#fff', fontSize: 16, fontFamily: Fonts.regular },
    tabs: { flexDirection: 'row', paddingHorizontal: 20, gap: 20, marginBottom: 16 },
    tab: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20 },
    tabActive: { backgroundColor: Colors.primary },
    tabText: { color: 'rgba(255,255,255,0.6)', fontFamily: Fonts.bold, fontSize: 14 },
    tabTextActive: { color: '#fff' },
    list: { padding: 10 },
    giphyItem: { width: (width - 40) / 3, height: (width - 40) / 3, margin: 5, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)', overflow: 'hidden' },
    giphyImg: { width: '100%', height: '100%' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' }
});
