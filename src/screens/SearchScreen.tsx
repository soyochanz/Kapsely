import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, TextInput, FlatList,
    TouchableOpacity, ActivityIndicator, StatusBar
} from 'react-native';
import { Image } from 'expo-image';

import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { Colors, Fonts, Spacing, BorderRadius } from '../theme';
import { safetyService } from '../utils/safety';

export default function SearchScreen() {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation();
    const { t } = useTranslation();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [searching, setSearching] = useState(false);

    const [searchHistory, setSearchHistory] = useState<any[]>([]);

    useEffect(() => {
        loadHistory();
    }, []);

    const loadHistory = async () => {
        try {
            const stored = await AsyncStorage.getItem('@search_history');
            if (stored) setSearchHistory(JSON.parse(stored));
        } catch (e) {}
    };

    const saveSearch = async (user: any) => {
        try {
            const newHistory = [user, ...searchHistory.filter(h => h.id !== user.id)].slice(0, 15);
            setSearchHistory(newHistory);
            await AsyncStorage.setItem('@search_history', JSON.stringify(newHistory));
        } catch (e) {}
    };

    const clearHistory = async () => {
        setSearchHistory([]);
        await AsyncStorage.removeItem('@search_history');
    };

    useEffect(() => {
        if (query.trim().length > 1) {
            const delayDebounceFn = setTimeout(() => {
                handleSearch();
            }, 300);
            return () => clearTimeout(delayDebounceFn);
        } else {
            setResults([]);
            setSearching(false);
        }
    }, [query]);

    const handleSearch = async () => {
        setSearching(true);
        const { data: { user } } = await supabase.auth.getUser();
        
        let blocked: string[] = [];
        if (user) {
            blocked = await safetyService.getAllSafetyUserIds(user.id);
        }

        const { data, error } = await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url, favorite_color')
            .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
            .limit(20);

        if (data) {
            setResults(data.filter(p => !blocked.includes(p.id) && p.id !== user?.id));
        }
        setSearching(false);
    };

    const renderUser = ({ item }: { item: any }) => (
        <TouchableOpacity
            style={styles.userCard}
            activeOpacity={0.7}
            onPress={() => {
                saveSearch(item);
                (navigation as any).navigate('ExternalProfile', { targetUserId: item.id });
            }}
        >
            <Image
                source={{ uri: Colors.getAvatarUrl(item.avatar_url, item.display_name || item.username, item.favorite_color) }}
                style={styles.avatar}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={200}
            />

            <View style={styles.userInfo}>
                <Text style={styles.displayName}>{item.display_name}</Text>
                <Text style={styles.username}>@{item.username}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" />

            <View style={[styles.header, { paddingTop: insets.top + 15 }]}>
                <Text style={styles.title}>{t('search.explore_people')}</Text>
                <View style={styles.searchBar}>
                    <Ionicons name="search" size={20} color={Colors.textMuted} />
                    <TextInput
                        style={styles.input}
                        placeholder={t('search.search_placeholder')}
                        placeholderTextColor={Colors.textMuted}
                        value={query}
                        onChangeText={setQuery}
                        autoCapitalize="none"
                        autoCorrect={false}
                        spellCheck={false}
                    />
                    {searching && <ActivityIndicator size="small" color={Colors.primary} />}
                    {query.length > 0 && !searching && (
                        <TouchableOpacity activeOpacity={0.7} onPress={() => setQuery('')}>
                            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {query.length > 0 ? (
                results.length === 0 && !searching ? (
                    <View style={styles.emptyContainer}>
                        <Ionicons name="search-outline" size={60} color={Colors.cardAlt} />
                        <Text style={styles.emptyText}>{t('search.no_users_found', { query })}</Text>
                    </View>
                ) : (
                    <FlatList
                        data={results}
                        renderItem={renderUser}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                    />
                )
            ) : (
                <View style={{ flex: 1 }}>
                    {searchHistory.length > 0 && (
                        <View style={styles.historyHeader}>
                            <Text style={styles.historyTitle}>Recientes</Text>
                            <TouchableOpacity onPress={clearHistory}>
                                <Text style={styles.clearText}>Limpiar</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                    <FlatList
                        data={searchHistory}
                        renderItem={renderUser}
                        keyExtractor={(item) => 'history-' + item.id}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Text style={styles.exploreHint}>{t('search.search_hint')}</Text>
                            </View>
                        }
                    />
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    header: {
        paddingHorizontal: Spacing.md,
        paddingBottom: Spacing.md
    },
    title: {
        fontSize: 24,
        fontFamily: Fonts.bold,
        color: Colors.textPrimary,
        marginBottom: 15
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.cardAlt,
        borderRadius: BorderRadius.md,
        paddingHorizontal: 15,
        height: 50,
        gap: 10,
        borderWidth: 1,
        borderColor: Colors.border
    },
    input: {
        flex: 1,
        fontSize: 15,
        fontFamily: Fonts.regular,
        color: Colors.textPrimary
    },
    listContent: { padding: Spacing.md },
    userCard: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
        gap: 15
    },
    avatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: Colors.cardAlt
    },
    userInfo: { flex: 1 },
    displayName: {
        fontSize: 16,
        fontFamily: Fonts.bold,
        color: Colors.textPrimary
    },
    username: {
        fontSize: 13,
        fontFamily: Fonts.medium,
        color: Colors.textMuted,
        marginTop: 2
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 100,
        paddingHorizontal: 40
    },
    emptyText: {
        fontSize: 15,
        fontFamily: Fonts.medium,
        color: Colors.textMuted,
        marginTop: 20,
        textAlign: 'center'
    },
    exploreHint: {
        fontSize: 14,
        fontFamily: Fonts.regular,
        color: Colors.textMuted,
        textAlign: 'center',
        lineHeight: 20
    },
    historyHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        marginTop: 10,
        marginBottom: 5
    },
    historyTitle: {
        fontSize: 16,
        fontFamily: Fonts.bold,
        color: Colors.textPrimary
    },
    clearText: {
        fontSize: 14,
        fontFamily: Fonts.semiBold,
        color: Colors.primary
    }
});
