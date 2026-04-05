import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    TextInput, StatusBar, SafeAreaView, ActivityIndicator,
    Alert, Modal, Pressable, Platform, Dimensions,

} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

const { width } = Dimensions.get('window');
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useTranslation } from 'react-i18next';
import { Colors, Fonts, Spacing, BorderRadius, Shadow } from '../theme';
import { Image } from 'expo-image';
import { supabase, Profile } from '../lib/supabase';


// ── Color palette ─────────────────────────────────────────────────────────────
const COLOR_PALETTE = [
    ['#FF6B6B', '#FF8E53', '#FFA552', '#FFD166'],
    ['#06D6A0', '#1BB87B', '#118A57', '#4CAF50'],
    ['#118AB2', '#2196F3', '#0EA5E9', '#06B6D4'],
    ['#7B2FBE', '#a269ff', '#C084FC', '#E879F9'],
    ['#F72585', '#E91E63', '#FF4081', '#FF80AB'],
    ['#E8D5B7', '#C9A96E', '#A07850', '#6B4226'],
    ['#2D3047', '#43445B', '#5C5F77', '#8D8FA3'],
    ['#FFFFFF', '#E0E0E0', '#9E9E9E', '#424242'],
];

import { useNavigation } from '@react-navigation/native';

interface Props {
    onClose?: () => void;
}

export default function EditProfileScreen({ onClose }: Props) {
    const { t } = useTranslation();
    const navigation = useNavigation();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [displayName, setDisplayName] = useState('');
    const [bio, setBio] = useState('');
    const [favoriteColor, setFavoriteColor] = useState('#a269ff');
    const [favoriteMovie, setFavoriteMovie] = useState('');
    const favoriteSongInit = '';
    const [favoriteSong, setFavoriteSong] = useState(favoriteSongInit);
    const [avatarUri, setAvatarUri] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);

    const [showColorPicker, setShowColorPicker] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [initialAvatarUrl, setInitialAvatarUrl] = useState<string | null>(null);
    const [initialDisplayName, setInitialDisplayName] = useState('');
    const [displayNameHistory, setDisplayNameHistory] = useState<string[]>([]);



    // ── Load current profile ──────────────────────────────────────────────────
    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setUserId(user.id);
            const { data } = await supabase
                .from('profiles')
                .select('username, display_name, avatar_url, bio, favorite_color, favorite_movie, favorite_song, birthdate, display_name_history')

                .eq('id', user.id)
                .single();

            if (data) {
                setDisplayName(data.display_name ?? '');
                setBio(data.bio ?? '');
                setFavoriteColor(data.favorite_color ?? '#a269ff');
                setFavoriteMovie(data.favorite_movie ?? '');
                setFavoriteSong(data.favorite_song ?? '');
                setAvatarUri(data.avatar_url ?? null);
                setInitialAvatarUrl(data.avatar_url ?? null);
                setInitialDisplayName(data.display_name ?? '');
                setDisplayNameHistory(data.display_name_history ?? []);
            }
            setLoading(false);
            

        })();
    }, []);



    // ── Avatar pick + crop ────────────────────────────────────────────────────
    const pickAvatar = async () => {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { Alert.alert('Permission required', 'Allow photo access to set an avatar.'); return; }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,   // built-in crop/adjust
            quality: 0.85,
        });

        if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            // Resize to a more optimized size (300px is plenty for avatars)
            const manipulated = await ImageManipulator.manipulateAsync(
                asset.uri,
                [{ resize: { width: 300 } }],
                { compress: 0.7, format: ImageManipulator.SaveFormat.WEBP }
            );

            setAvatarUri(manipulated.uri);
        }
    };

    // ── Upload avatar to Supabase Storage ─────────────────────────────────────
    const uploadAvatar = async (uri: string, uid: string): Promise<string | null> => {
        setUploading(true);
        try {
            const fileName = `avatar_${uid}_${Date.now()}.webp`;


            let body: any;
            if (Platform.OS === 'web') {
                const res = await fetch(uri);
                body = await res.blob();
            } else {
                // For mobile, we use base64 to avoid fetch(file://) issues
                const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as any });
                body = decode(base64);
            }

            const { error } = await supabase.storage.from('avatars').upload(fileName, body, {
                contentType: 'image/webp',
                upsert: true,
            });


            if (error) throw error;

            const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
            return data.publicUrl;
        } catch (e: any) {
            console.error('Upload error:', e);
            Alert.alert('Upload Error', e.message || 'Could not upload image');
            return null;
        } finally {
            setUploading(false);
        }
    };

    // ── Save ──────────────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!userId) return;
        setSaving(true);
        try {
            let finalAvatarUrl: string | null = avatarUri;

            // Upload new avatar if it's a local/temporary file (not already a Supabase URL)
            if (avatarUri && !avatarUri.startsWith('http')) {
                // Delete old avatar if it exists to save space
                if (initialAvatarUrl) {
                    try {
                        const baseUrl = "https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/avatars/";
                        if (initialAvatarUrl.startsWith(baseUrl)) {
                            const oldFileName = initialAvatarUrl.replace(baseUrl, "").split('?')[0];
                            if (oldFileName) {
                                await supabase.storage.from('avatars').remove([oldFileName]);
                            }
                        }
                    } catch (e) {
                        console.error('Error deleting old avatar:', e);
                    }
                }

                const uploaded = await uploadAvatar(avatarUri, userId);
                if (uploaded) {
                    finalAvatarUrl = uploaded;
                } else {
                    // CRITICAL: If upload failed, revert to initial to avoid saving local file:/// path
                    finalAvatarUrl = initialAvatarUrl;
                    Alert.alert('⚠️ Upload Failed', 'Could not upload avatar. Keeping existing one.');
                }
            }

            const nameChanged = displayName.trim() !== initialDisplayName.trim();
            let newHistory = [...displayNameHistory];

            if (nameChanged) {
                const fifteenDaysAgo = new Date();
                fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

                const recentChanges = displayNameHistory.filter(ts => new Date(ts) > fifteenDaysAgo);
                
                if (recentChanges.length >= 2) {
                    Alert.alert(
                        'Limit Reached', 
                        'You can only change your display name twice every 15 days. Please try again later.'
                    );
                    setSaving(false);
                    return;
                }
                newHistory.push(new Date().toISOString());
            }

            const { error } = await supabase.from('profiles').update({
                display_name: displayName.trim(),
                bio,
                favorite_color: favoriteColor,
                favorite_movie: favoriteMovie.trim() || null,
                favorite_song: favoriteSong.trim() || null,
                avatar_url: finalAvatarUrl,
                display_name_history: newHistory,
                updated_at: new Date().toISOString(),
            }).eq('id', userId);

            if (error) throw error;
            Alert.alert('✅ Saved', 'Profile updated successfully.');
            if (onClose) onClose();
            else navigation.goBack();
        } catch (e: any) {
            Alert.alert('Error', e.message ?? 'Could not save profile.');
        } finally {
            setSaving(false);
        }
    };

    // ── Logout ────────────────────────────────────────────────────────────────
    const handleLogout = async () => {
        Alert.alert(t('common.logout') || 'Log Out', t('common.logoutConfirm') || 'Are you sure you want to log out?', [
            { text: t('common.cancel'), style: 'cancel' },
            {
                text: t('common.logout') || 'Log Out',
                style: 'destructive',
                onPress: async () => {
                    await supabase.auth.signOut();
                }
            }
        ]);
    };

    const handleDeleteAccount = async () => {
        if (!userId) return;
        
        // IMPORTANT: For true permanent deletion from Supabase Auth, 
        // the user MUST add this function in their Supabase SQL Editor:
        /*
        CREATE OR REPLACE FUNCTION delete_user_permanently()
        RETURNS void AS $$
        BEGIN
          DELETE FROM auth.users WHERE id = auth.uid();
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;
        */

        Alert.alert(
            t('profile.deleteAccount'),
            t('profile.deleteAccountConfirm'),
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('profile.deleteAccount'),
                    style: 'destructive',
                    onPress: () => {
                        Alert.alert(
                            t('common.warning') || 'Warning',
                            t('profile.deleteAccountWarning'),
                            [
                                { text: t('common.cancel'), style: 'cancel' },
                                {
                                    text: t('profile.deleteAccountFinal'),
                                    style: 'destructive',
                                    onPress: async () => {
                                        setSaving(true);
                                        try {
                                            if (!userId) throw new Error('User info not loaded');

                                            // 1. Full data wipe (Activity, Content, Capsules)
                                            await supabase.from('likes').delete().eq('user_id', userId);
                                            await supabase.from('comments').delete().eq('user_id', userId);
                                            await supabase.from('story_reads').delete().eq('user_id', userId);
                                            await supabase.from('notifications').delete().or(`user_id.eq.${userId},sender_id.eq.${userId}`);
                                            await supabase.from('capsule_invites').delete().eq('user_id', userId);
                                            await supabase.from('capsule_items').delete().eq('owner_id', userId);
                                            await supabase.from('capsules').delete().eq('owner_id', userId);
                                            await supabase.from('follows').delete().or(`follower_id.eq.${userId},following_id.eq.${userId}`);
                                            await supabase.from('profiles').delete().eq('id', userId);

                                            // 2. Auth deletion (Requires SQL function)
                                            const { error: rpcError } = await supabase.rpc('delete_user_permanently');
                                            await supabase.auth.signOut();
                                            
                                            if (rpcError) {
                                                Alert.alert('✅ Wiped', 'Your data was deleted. Note: Login remains active unless backend function is installed.');
                                            } else {
                                                Alert.alert('✅ Terminated', 'Account and data permanently destroyed.');
                                            }
                                        } catch (e: any) {
                                            console.error('Delete flow failure:', e);
                                            Alert.alert('Error', e.message || 'Deletion failed. Please contact support.');
                                        } finally {
                                            setSaving(false);
                                        }
                                    }
                                }
                            ]
                        );
                    }
                }
            ]
        );
    };

    if (loading) {
        return (
            <View style={styles.loadingCenter}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={Colors.surface} />
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.header}>
                    <TouchableOpacity activeOpacity={0.7} onPress={() => onClose ? onClose() : navigation.goBack()} style={styles.headerBtn}>
                        <Ionicons name="close" size={26} color={Colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{t('profile.editProfile')}</Text>
                    <TouchableOpacity activeOpacity={0.8} onPress={handleSave} disabled={saving} style={styles.saveBtn}>
                        {saving ? <ActivityIndicator size="small" color={Colors.primary} /> : <Text style={styles.saveBtnText}>{t('common.save')}</Text>}
                    </TouchableOpacity>
                </View>
            </SafeAreaView>

            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

                {/* Avatar */}
                <View style={styles.avatarSection}>
                    <TouchableOpacity onPress={pickAvatar} activeOpacity={0.8} style={styles.avatarWrapper}>
                        <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.avatarRing}>
                        {avatarUri
                                ? <Image 
                                    source={{ uri: avatarUri }} 
                                    style={styles.avatar} 
                                    contentFit="cover" 
                                    cachePolicy="memory-disk"
                                    transition={200} 
                                />
                                : <View style={[styles.avatar, styles.avatarPlaceholder]}>
                                    <Ionicons name="person" size={36} color={Colors.primary} />
                                </View>
                        }


                        </LinearGradient>
                        <View style={styles.avatarEditBadge}>
                            <Ionicons name="camera" size={14} color="#fff" />
                        </View>
                    </TouchableOpacity>
                    <Text style={styles.avatarHint}>{t('profile.tapToChangePhoto')}</Text>
                </View>

                {/* Fields */}
                <View style={styles.section}>
                    <Text style={styles.sectionLabel}>{t('profile.displayName')}</Text>
                    <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName}
                        placeholder={t('profile.yourVisibleName')} placeholderTextColor={Colors.textMuted} />

                    <Text style={styles.sectionLabel}>{t('profile.bio')}</Text>
                    <TextInput style={[styles.input, styles.textArea]} value={bio} onChangeText={setBio}
                        placeholder={t('profile.writeSomethingAboutYou')} placeholderTextColor={Colors.textMuted}
                        multiline numberOfLines={3} />
                </View>

                {/* Favorite Color */}
                <View style={styles.section}>
                    <Text style={styles.sectionLabel}>{t('profile.favoriteColor')}</Text>
                    <TouchableOpacity
                        style={styles.colorRow}
                        onPress={() => setShowColorPicker(true)}
                        activeOpacity={0.8}
                    >
                        <View style={[styles.colorSwatch, { backgroundColor: favoriteColor }]} />
                        <Text style={styles.colorHex}>{favoriteColor.toUpperCase()}</Text>
                        <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
                    </TouchableOpacity>
                </View>

                {/* Favorites */}
                <View style={styles.section}>
                    <Text style={styles.sectionLabel}>{t('profile.favoriteMovieSeries')}</Text>
                    <TextInput style={styles.input} value={favoriteMovie} onChangeText={setFavoriteMovie}
                        placeholder={t('profile.moviePlaceholder')} placeholderTextColor={Colors.textMuted} 
                        maxLength={30} />
                    <Text style={styles.charLimit}>{favoriteMovie.length}/30</Text>

                    <Text style={styles.sectionLabel}>{t('profile.favoriteSong')}</Text>
                    <TextInput style={styles.input} value={favoriteSong} onChangeText={setFavoriteSong}
                        placeholder={t('profile.songPlaceholder')} placeholderTextColor={Colors.textMuted}
                        maxLength={30} />
                    <Text style={styles.charLimit}>{favoriteSong.length}/30</Text>
                </View>





                {/* Danger Zone */}
                <View style={styles.logoutSection}>
                    <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
                        <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
                        <Text style={styles.logoutText}>{t('common.logout') || 'Log Out'}</Text>
                    </TouchableOpacity>

                    <View style={styles.dangerZone}>
                        <Text style={styles.dangerZoneTitle}>{t('profile.dangerZone') || 'Danger Zone'}</Text>
                        <TouchableOpacity 
                            style={styles.deleteBtn} 
                            onPress={handleDeleteAccount} 
                            activeOpacity={0.7}
                        >
                            <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                            <Text style={styles.deleteBtnText}>{t('profile.deleteAccount')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>

            </ScrollView>

            {/* Color Picker Modal */}
            <Modal visible={showColorPicker} transparent animationType="slide" onRequestClose={() => setShowColorPicker(false)}>
                <Pressable style={styles.modalOverlay} onPress={() => setShowColorPicker(false)}>
                    <Pressable style={styles.modalSheet} onPress={() => { }}>
                        <View style={styles.modalHandle} />
                        <Text style={styles.modalTitle}>Pick Your Color</Text>
                        <Text style={styles.modalSub}>This will appear on your profile</Text>

                        {/* Preview swatch */}
                        <View style={styles.previewRow}>
                            <LinearGradient colors={[favoriteColor, favoriteColor + 'aa']} style={styles.previewSwatch} />
                            <View>
                                <Text style={styles.previewLabel}>Selected</Text>
                                <Text style={[styles.previewHex, { color: favoriteColor }]}>{favoriteColor.toUpperCase()}</Text>
                            </View>
                        </View>

                        {/* Palette grid */}
                        {COLOR_PALETTE.map((row, ri) => (
                            <View key={ri} style={styles.paletteRow}>
                                {row.map((hex) => (
                                    <TouchableOpacity
                                        key={hex}
                                        onPress={() => { setFavoriteColor(hex); }}
                                        style={[
                                            styles.paletteCell,
                                            { backgroundColor: hex },
                                            favoriteColor === hex && styles.paletteCellActive,
                                        ]}
                                        activeOpacity={0.8}
                                    >
                                        {favoriteColor === hex && <Ionicons name="checkmark" size={16} color={hex === '#FFFFFF' ? '#000' : '#fff'} />}
                                    </TouchableOpacity>
                                ))}
                            </View>
                        ))}

                        <TouchableOpacity style={[styles.modalConfirmBtn, { backgroundColor: favoriteColor }]}
                            onPress={() => setShowColorPicker(false)} activeOpacity={0.8}>
                            <Text style={styles.modalConfirmText}>Confirm Color</Text>
                        </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
    safeArea: { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: Spacing.md, paddingTop: 50, paddingBottom: 14,
    },
    headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { color: Colors.textPrimary, fontSize: 16, fontFamily: Fonts.semiBold },
    saveBtn: {
        backgroundColor: Colors.primary, paddingHorizontal: 18, paddingVertical: 8,
        borderRadius: 20, minWidth: 60, alignItems: 'center', justifyContent: 'center',
    },
    saveBtnText: { color: '#fff', fontSize: 14, fontFamily: Fonts.semiBold },

    scrollContent: { paddingBottom: 120 },

    // Avatar
    avatarSection: { alignItems: 'center', paddingTop: Spacing.xl, paddingBottom: Spacing.md },
    avatarWrapper: { position: 'relative' },
    avatarRing: { width: 100, height: 100, borderRadius: 50, padding: 3, ...Shadow.primary },
    avatar: { width: 94, height: 94, borderRadius: 47, borderWidth: 3, borderColor: Colors.surface },
    avatarPlaceholder: {
        backgroundColor: Colors.instaCapLight,
        alignItems: 'center', justifyContent: 'center',
    },
    avatarEditBadge: {
        position: 'absolute', bottom: 2, right: 2,
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
        borderWidth: 2, borderColor: Colors.surface,
    },
    avatarHint: { color: Colors.textMuted, fontSize: 11, fontFamily: Fonts.regular, marginTop: 8 },

    // Fields
    section: {
        backgroundColor: Colors.surface, marginHorizontal: Spacing.md, marginBottom: Spacing.md,
        borderRadius: BorderRadius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
        ...Shadow.subtle,
    },
    sectionLabel: {
        color: Colors.textMuted, fontSize: 11, fontFamily: Fonts.semiBold,
        letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8, marginTop: Spacing.sm,
    },
    input: {
        backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border,
        borderRadius: BorderRadius.md, padding: 12,
        color: Colors.textPrimary, fontSize: 14, fontFamily: Fonts.regular,
        marginBottom: 4,
    },
    charLimit: {
        fontSize: 10,
        color: Colors.textMuted,
        textAlign: 'right',
        marginTop: -2,
        marginBottom: 8,
        fontFamily: Fonts.regular
    },
    textArea: { minHeight: 80, textAlignVertical: 'top' },

    // Color
    colorRow: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border,
        borderRadius: BorderRadius.md, padding: 12,
    },
    colorSwatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
    colorHex: { flex: 1, color: Colors.textPrimary, fontSize: 14, fontFamily: Fonts.semiBold },

    // Logout
    logoutSection: {
        marginTop: Spacing.lg,
        paddingHorizontal: Spacing.md,
        alignItems: 'center',
    },
    logoutBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 24,
        backgroundColor: '#FFE5E5',
        borderRadius: BorderRadius.full,
        gap: 8,
    },
    logoutText: {
        color: '#FF3B30',
        fontSize: 15,
        fontFamily: Fonts.semiBold,
    },

    // Danger Zone
    dangerZone: {
        marginTop: 40,
        width: '100%',
        padding: Spacing.md,
        backgroundColor: '#FFF5F5',
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        borderColor: '#FFE5E5',
    },
    dangerZoneTitle: {
        fontSize: 12,
        fontFamily: Fonts.bold,
        color: '#FF3B30',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 12,
    },
    deleteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
        backgroundColor: '#fff',
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        borderColor: '#FF3B30',
        gap: 8,
        alignSelf: 'flex-start',
    },
    deleteBtnText: {
        color: '#FF3B30',
        fontSize: 13,
        fontFamily: Fonts.semiBold,
    },

    // Modal
    modalOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'flex-end',
    },
    modalSheet: {
        backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: Spacing.lg, paddingBottom: 40,
    },
    modalHandle: {
        width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border,
        alignSelf: 'center', marginBottom: Spacing.md,
    },
    modalTitle: { color: Colors.textPrimary, fontSize: 18, fontFamily: Fonts.bold, textAlign: 'center' },
    modalSub: { color: Colors.textMuted, fontSize: 12, fontFamily: Fonts.regular, textAlign: 'center', marginBottom: Spacing.md },
    previewRow: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
        backgroundColor: Colors.background, borderRadius: BorderRadius.md, padding: 12,
        marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border,
    },
    previewSwatch: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
    previewLabel: { color: Colors.textMuted, fontSize: 11, fontFamily: Fonts.regular },
    previewHex: { fontSize: 16, fontFamily: Fonts.bold },
    paletteRow: { flexDirection: 'row', gap: 10, marginBottom: 10, justifyContent: 'center' },
    paletteCell: {
        width: 52, height: 52, borderRadius: 26,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 2, borderColor: 'transparent',
        ...Shadow.subtle,
    },
    paletteCellActive: {
        borderColor: Colors.primary,
        transform: [{ scale: 1.12 }],
    },
    modalConfirmBtn: {
        borderRadius: BorderRadius.lg, paddingVertical: 14,
        alignItems: 'center', marginTop: Spacing.md,
    },
    modalConfirmText: { color: '#fff', fontSize: 15, fontFamily: Fonts.bold },
    verifiedBadge: {
        backgroundColor: '#7B2FBE',
        width: 18,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 6,
        borderWidth: 1.5,
        borderColor: '#fff',
    },
    sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
    sectionHint: { fontSize: 12, color: Colors.textMuted, marginBottom: 15, fontFamily: Fonts.regular },
    stickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
    stickerSlot: { 
        width: (width - 100) / 3, 
        height: 80, 
        backgroundColor: Colors.background, 
        borderRadius: 15, 
        borderWidth: 1.5, 
        borderColor: Colors.border,
        borderStyle: 'dashed',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative'
    },
    slotStickerImg: { width: '80%', height: '80%' },
    slotNumber: { 
        position: 'absolute', top: -5, left: -5, 
        width: 18, height: 18, borderRadius: 9, 
        backgroundColor: Colors.border, alignItems: 'center', justifyContent: 'center' 
    },
    slotNumberText: { fontSize: 9, fontFamily: Fonts.bold, color: Colors.textSecondary },
    stickerPickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 15, paddingVertical: 20 },
    stickerOption: { width: (width - 80) / 3, alignItems: 'center', gap: 8, marginBottom: 10 },
    stickerOptionIcon: { width: 60, height: 60, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    stickerOptionImg: { width: 60, height: 60 },
    stickerOptionName: { fontSize: 11, fontFamily: Fonts.medium, color: Colors.textPrimary, textAlign: 'center' },
    modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    dateDoneBtn: {
        alignItems: 'center',
        paddingVertical: 10,
        backgroundColor: Colors.primary + '15',
        borderRadius: BorderRadius.md,
        marginTop: 5,
    },
    dateDoneText: {
        color: Colors.primary,
        fontFamily: Fonts.bold,
        fontSize: 14,
    },
});
