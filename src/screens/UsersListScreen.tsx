import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, StatusBar, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Colors, Fonts, Spacing, BorderRadius } from '../theme';
import { supabase } from '../lib/supabase';
import VerifiedBadge from '../components/VerifiedBadge';

export default function UserListScreen() {
    const navigation = useNavigation<any>();
    const { t } = useTranslation();
    const route = useRoute<any>();
    const { userId, type } = route.params; // type is 'followers' or 'following'

    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        try {
            if (type === 'followers') {
                const { data, error } = await supabase
                    .from('follows')
                    .select('profile:follower_id(*)')
                    .eq('following_id', userId);
                
                if (error) throw error;
                if (data) {
                    setUsers(data.map((i: any) => i.profile).filter(Boolean));
                }
            } else {
                const { data, error } = await supabase
                    .from('follows')
                    .select('profile:following_id(*)')
                    .eq('follower_id', userId);

                if (error) throw error;
                if (data) {
                    setUsers(data.map((i: any) => i.profile).filter(Boolean));
                }
            }
        } catch (error) {
            console.error('Error loading users:', error);
        } finally {
            setLoading(false);
        }
    };

    const renderUser = ({ item }: { item: any }) => (
        <TouchableOpacity
            style={styles.userItem}
            activeOpacity={0.7}
            onPress={() => navigation.push('UserProfile', { targetUserId: item.id })}
        >
            <Image 
                source={{ uri: Colors.getAvatarUrl(item.avatar_url, item.display_name || item.username, item.favorite_color) }} 
                style={styles.avatar} 
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={200}
            />
            <View style={styles.userInfo}>
                <View style={styles.nameRow}>
                    <Text style={styles.displayName}>{item.display_name || 'user'}</Text>
                    {item.is_verified && <VerifiedBadge size={14} style={{ marginLeft: 2 }} />}
                </View>
                <Text style={styles.username}>@{item.username}</Text>
            </View>
            <TouchableOpacity style={styles.viewBtn} activeOpacity={0.7}>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <View style={styles.header}>
                <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{type === 'followers' ? t('common.followers') : t('common.following')}</Text>
                <View style={{ width: 40 }} />
            </View>

            {loading ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={users}
                    keyExtractor={(item) => item.id}
                    renderItem={renderUser}
                    contentContainerStyle={styles.list}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
                            <Text style={styles.emptyText}>{t('search.no_users_found', { query: '' }).replace('""', '')}</Text>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border,
        backgroundColor: Colors.surface
    },
    headerTitle: { fontSize: 17, fontFamily: Fonts.bold, color: Colors.textPrimary, textTransform: 'capitalize' },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    list: { padding: Spacing.md },
    userItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 0.5,
        borderBottomColor: Colors.border
    },
    avatar: { width: 50, height: 50, borderRadius: 25 },
    placeholder: { backgroundColor: Colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
    userInfo: { flex: 1, marginLeft: 15 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    displayName: { fontSize: 15, fontFamily: Fonts.bold, color: Colors.textPrimary },
    username: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.textMuted, marginTop: 2 },
    viewBtn: { padding: 5 },
    empty: { alignItems: 'center', marginTop: 100 },
    emptyText: { marginTop: 15, fontSize: 16, fontFamily: Fonts.medium, color: Colors.textMuted },
    verifiedBadge: {
        backgroundColor: '#7B2FBE',
        width: 14,
        height: 14,
        borderRadius: 7,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#fff',
    },
});
