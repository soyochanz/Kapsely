import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, TextInput, FlatList,
    Image, TouchableOpacity, ActivityIndicator, StatusBar
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { Colors, Fonts, Spacing, BorderRadius } from '../theme';

export default function SearchScreen() {
    const navigation = useNavigation();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [searching, setSearching] = useState(false);

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
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
            .limit(20);

        if (data) setResults(data);
        setSearching(false);
    };

    const renderUser = ({ item }: { item: any }) => (
        <TouchableOpacity
            style={styles.userCard}
            onPress={() => (navigation as any).navigate('UserProfile', { targetUserId: item.id })}
        >
            <Image
                source={{ uri: item.avatar_url || 'https://via.placeholder.com/150' }}
                style={styles.avatar}
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

            <View style={styles.header}>
                <Text style={styles.title}>Explore People</Text>
                <View style={styles.searchBar}>
                    <Ionicons name="search" size={20} color={Colors.textMuted} />
                    <TextInput
                        style={styles.input}
                        placeholder="Search by name or username..."
                        placeholderTextColor={Colors.textMuted}
                        value={query}
                        onChangeText={setQuery}
                        autoCapitalize="none"
                    />
                    {searching && <ActivityIndicator size="small" color={Colors.primary} />}
                    {query.length > 0 && !searching && (
                        <TouchableOpacity onPress={() => setQuery('')}>
                            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {query.length > 0 && results.length === 0 && !searching ? (
                <View style={styles.emptyContainer}>
                    <Ionicons name="search-outline" size={60} color={Colors.cardAlt} />
                    <Text style={styles.emptyText}>No users found for "{query}"</Text>
                </View>
            ) : (
                <FlatList
                    data={results}
                    renderItem={renderUser}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text style={styles.exploreHint}>Search for your friends to start following them.</Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    header: {
        paddingTop: 60,
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
    }
});
