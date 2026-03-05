import React, { useState } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    KeyboardAvoidingView, Platform, ScrollView, StatusBar, Image, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Spacing, BorderRadius, Shadow } from '../../theme';
import { signIn } from '../../lib/auth';

interface Props {
    onNavigateToRegister: () => void;
    onNavigateBack: () => void;
}

export default function LoginScreen({ onNavigateToRegister, onNavigateBack }: Props) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [keepConnected, setKeepConnected] = useState(true);

    const handleLogin = async () => {
        if (!email.trim() || !password) {
            setError('Please fill in all fields.');
            return;
        }
        setError('');
        setLoading(true);
        try {
            await signIn(email.trim().toLowerCase(), password);
            // Auth state change in App.tsx handles navigation automatically
        } catch (e: any) {
            setError(e.message ?? 'Login failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

            {/* Top purple splash — compact */}
            <LinearGradient colors={[Colors.primaryDark, Colors.primary]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.topSplash}>
                <TouchableOpacity onPress={onNavigateBack} style={styles.backBtn} activeOpacity={0.7}>
                    <Ionicons name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                <View style={styles.logoRow}>
                    <Image
                        source={{ uri: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/website/Logomain.png' }}
                        style={styles.headerLogo}
                        resizeMode="contain"
                    />
                    <Text style={styles.logoText}>kapsely</Text>
                </View>
                <Text style={styles.splashTagline}>Seal today. Open the future.</Text>
                <View style={styles.circle1} />
            </LinearGradient>

            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}>
                <View style={styles.card}>
                    <Text style={styles.title}>Welcome back</Text>
                    <Text style={styles.subtitle}>Sign in to your capsules</Text>

                    {!!error && (
                        <View style={styles.errorBox}>
                            <Ionicons name="alert-circle-outline" size={16} color={Colors.eventCap} />
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    )}

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Email</Text>
                        <View style={styles.inputWrapper}>
                            <Ionicons name="mail-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                            <TextInput
                                style={styles.input}
                                placeholder="your@email.com"
                                placeholderTextColor={Colors.textMuted}
                                value={email}
                                onChangeText={setEmail}
                                keyboardType="email-address"
                                autoCapitalize="none"
                                selectionColor={Colors.primary}
                            />
                        </View>
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Password</Text>
                        <View style={styles.inputWrapper}>
                            <Ionicons name="lock-closed-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                            <TextInput
                                style={[styles.input, { flex: 1 }]}
                                placeholder="••••••••"
                                placeholderTextColor={Colors.textMuted}
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry={!showPass}
                                selectionColor={Colors.primary}
                            />
                            <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.eyeBtn}>
                                <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textMuted} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <TouchableOpacity
                        style={styles.keepRow}
                        onPress={() => setKeepConnected(!keepConnected)}
                        activeOpacity={0.7}
                    >
                        <View style={[styles.checkbox, keepConnected && styles.checkboxActive]}>
                            {keepConnected && <Ionicons name="checkmark" size={14} color="#fff" />}
                        </View>
                        <Text style={styles.keepText}>Keep me connected</Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={handleLogin} activeOpacity={0.85} disabled={loading}>
                        <LinearGradient colors={[Colors.primary, Colors.primaryDark]}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btn}>
                            {loading
                                ? <ActivityIndicator color="#fff" />
                                : <Text style={styles.btnText}>Sign In</Text>
                            }
                        </LinearGradient>
                    </TouchableOpacity>

                    <View style={styles.dividerRow}>
                        <View style={styles.dividerLine} />
                        <Text style={styles.dividerText}>or</Text>
                        <View style={styles.dividerLine} />
                    </View>

                    <TouchableOpacity style={styles.registerBtn} onPress={onNavigateToRegister} activeOpacity={0.7}>
                        <Text style={styles.registerBtnText}>Create an account</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    topSplash: { height: 140, justifyContent: 'flex-end', paddingHorizontal: Spacing.lg, paddingBottom: 14, overflow: 'hidden' },
    backBtn: { position: 'absolute', top: 50, left: 16, zIndex: 10, padding: 8 },
    logoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    headerLogo: { width: 22, height: 22, tintColor: '#fff' },
    logoText: { color: '#fff', fontSize: 22, fontFamily: Fonts.bold, letterSpacing: -0.5 },
    splashTagline: { color: 'rgba(255,255,255,0.78)', fontSize: 11, fontFamily: Fonts.light, marginTop: 2, marginBottom: 6 },
    circle1: {
        position: 'absolute', top: -20, right: -20, width: 110, height: 110,
        borderRadius: 55, backgroundColor: 'rgba(255,255,255,0.08)',
    },
    scroll: { paddingHorizontal: Spacing.md, paddingBottom: 40 },
    card: {
        backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
        padding: Spacing.lg, marginTop: -18,
        ...Shadow.primary,
    },
    title: { color: Colors.textPrimary, fontSize: 24, fontFamily: Fonts.bold, marginBottom: 4 },
    subtitle: { color: Colors.textMuted, fontSize: 14, fontFamily: Fonts.regular, marginBottom: Spacing.lg },
    errorBox: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: Colors.eventCapLight, borderRadius: BorderRadius.md,
        borderWidth: 1, borderColor: Colors.eventCap + '44',
        padding: 12, marginBottom: Spacing.md,
    },
    errorText: { color: Colors.eventCap, fontSize: 13, fontFamily: Fonts.medium, flex: 1 },
    inputGroup: { marginBottom: Spacing.md },
    label: { color: Colors.textSecondary, fontSize: 12, fontFamily: Fonts.semiBold, letterSpacing: 0.5, marginBottom: 7 },
    inputWrapper: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: Colors.cardAlt, borderRadius: BorderRadius.md,
        borderWidth: 1.5, borderColor: Colors.border,
        paddingHorizontal: 14, ...Shadow.subtle,
    },
    inputIcon: { marginRight: 8 },
    input: {
        flex: 1, height: 50, color: Colors.textPrimary,
        fontSize: 15, fontFamily: Fonts.regular,
    },
    eyeBtn: { padding: 4 },
    btn: {
        borderRadius: BorderRadius.lg, paddingVertical: 16,
        alignItems: 'center', justifyContent: 'center', marginTop: Spacing.sm,
    },
    btnText: { color: '#fff', fontSize: 16, fontFamily: Fonts.bold },
    dividerRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        marginVertical: Spacing.md,
    },
    dividerLine: { flex: 1, height: 1, backgroundColor: Colors.divider },
    dividerText: { color: Colors.textMuted, fontSize: 12, fontFamily: Fonts.medium },
    keepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: Spacing.lg, paddingLeft: 2 },
    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
    checkboxActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    keepText: { color: Colors.textSecondary, fontSize: 14, fontFamily: Fonts.medium },
    registerBtn: {
        borderRadius: BorderRadius.lg, paddingVertical: 15,
        borderWidth: 1.5, borderColor: Colors.primary,
        alignItems: 'center', backgroundColor: Colors.instaCapLight,
    },
    registerBtnText: { color: Colors.primary, fontSize: 16, fontFamily: Fonts.semiBold },
});
