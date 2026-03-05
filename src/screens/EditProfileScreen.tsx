import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    TextInput, StatusBar, SafeAreaView, Image, ActivityIndicator,
    Alert, Modal, Pressable, Platform,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Colors, Fonts, Spacing, BorderRadius, Shadow } from '../theme';
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

    // ── Load current profile ──────────────────────────────────────────────────
    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setUserId(user.id);
            const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
            if (data) {
                setDisplayName(data.display_name ?? '');
                setBio(data.bio ?? '');
                setFavoriteColor(data.favorite_color ?? '#a269ff');
                setFavoriteMovie(data.favorite_movie ?? '');
                setFavoriteSong(data.favorite_song ?? '');
                setAvatarUri(data.avatar_url ?? null);
                setInitialAvatarUrl(data.avatar_url ?? null);
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
            aspect: [1, 1],
            quality: 0.85,
        });

        if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            // Resize to 400×400
            const manipulated = await ImageManipulator.manipulateAsync(
                asset.uri,
                [{ resize: { width: 400, height: 400 } }],
                { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG }
            );
            setAvatarUri(manipulated.uri);
        }
    };

    // ── Upload avatar to Supabase Storage ─────────────────────────────────────
    const uploadAvatar = async (uri: string, uid: string): Promise<string | null> => {
        setUploading(true);
        try {
            const fileName = `avatar_${uid}_${Date.now()}.jpg`;

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
                contentType: 'image/jpeg',
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

            const { error } = await supabase.from('profiles').update({
                display_name: displayName,
                bio,
                favorite_color: favoriteColor,
                favorite_movie: favoriteMovie,
                favorite_song: favoriteSong,
                avatar_url: finalAvatarUrl,
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
        Alert.alert('Cerrar sesión', '¿Estás seguro de que quieres cerrar sesión?', [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Cerrar sesión',
                style: 'destructive',
                onPress: async () => {
                    await supabase.auth.signOut();
                }
            }
        ]);
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
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => onClose ? onClose() : navigation.goBack()} style={styles.headerBtn}>
                        <Ionicons name="close" size={22} color={Colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Edit Profile</Text>
                    <TouchableOpacity onPress={handleSave} style={styles.saveBtn} disabled={saving}>
                        {saving || uploading
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <Text style={styles.saveBtnText}>Save</Text>}
                    </TouchableOpacity>
                </View>
            </SafeAreaView>

            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

                {/* Avatar */}
                <View style={styles.avatarSection}>
                    <TouchableOpacity onPress={pickAvatar} activeOpacity={0.8} style={styles.avatarWrapper}>
                        <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.avatarRing}>
                            {avatarUri
                                ? <Image source={{ uri: avatarUri }} style={styles.avatar} />
                                : <View style={[styles.avatar, styles.avatarPlaceholder]}>
                                    <Ionicons name="person" size={36} color={Colors.primary} />
                                </View>
                            }
                        </LinearGradient>
                        <View style={styles.avatarEditBadge}>
                            <Ionicons name="camera" size={14} color="#fff" />
                        </View>
                    </TouchableOpacity>
                    <Text style={styles.avatarHint}>Tap to change photo · Square crop applied</Text>
                </View>

                {/* Fields */}
                <View style={styles.section}>
                    <Text style={styles.sectionLabel}>Display Name</Text>
                    <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName}
                        placeholder="Your visible name" placeholderTextColor={Colors.textMuted} />

                    <Text style={styles.sectionLabel}>Bio</Text>
                    <TextInput style={[styles.input, styles.textArea]} value={bio} onChangeText={setBio}
                        placeholder="Write something about you..." placeholderTextColor={Colors.textMuted}
                        multiline numberOfLines={3} />
                </View>

                {/* Favorite Color */}
                <View style={styles.section}>
                    <Text style={styles.sectionLabel}>Favorite Color</Text>
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
                    <Text style={styles.sectionLabel}>🎬 Favorite Movie</Text>
                    <TextInput style={styles.input} value={favoriteMovie} onChangeText={setFavoriteMovie}
                        placeholder="e.g. Interstellar" placeholderTextColor={Colors.textMuted} />

                    <Text style={styles.sectionLabel}>🎵 Favorite Song</Text>
                    <TextInput style={styles.input} value={favoriteSong} onChangeText={setFavoriteSong}
                        placeholder="e.g. Bohemian Rhapsody – Queen" placeholderTextColor={Colors.textMuted} />
                </View>

                {/* Logout Button */}
                <View style={styles.logoutSection}>
                    <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
                        <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
                        <Text style={styles.logoutText}>Log Out</Text>
                    </TouchableOpacity>
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
                            onPress={() => setShowColorPicker(false)} activeOpacity={0.85}>
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
});
