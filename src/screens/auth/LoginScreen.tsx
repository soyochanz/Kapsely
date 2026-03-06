import React, { useState } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    KeyboardAvoidingView, Platform, ScrollView, StatusBar, Image, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Spacing, BorderRadius, Shadow, Gradients } from '../../theme';
import { signIn } from '../../lib/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
            // Save the persistence preference
            await AsyncStorage.setItem('keep_connected', JSON.stringify(keepConnected));
            
            await signIn(email.trim().toLowerCase(), password);
            // Persistence is handled by AsyncStorage in supabase.ts
        } catch (e: any) {
            setError(e.message ?? 'Login failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <StatusBar barStyle="light-content" />

            <LinearGradient
                colors={Gradients.dark as any}
                style={styles.header}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            >
                <TouchableOpacity onPress={onNavigateBack} style={styles.backBtn} activeOpacity={0.7}>
                    <Ionicons name="chevron-back" size={26} color="#fff" />
                </TouchableOpacity>

                <View style={styles.headerContent}>
                    <Image
                        source={{ uri: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/website/Logomain.png' }}
                        style={styles.headerLogo}
                        resizeMode="contain"
                    />
                    <Text style={styles.greeting}>Welcome Back</Text>
                    <Text style={styles.subGreeting}>Sign in to your account</Text>
                </View>

                {/* Subtle tech pattern */}
                <View style={styles.techLine} />
            </LinearGradient>

            <ScrollView
                contentContainerStyle={styles.scroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.formCard}>
                    {!!error && (
                        <View style={styles.errorBox}>
                            <Ionicons name="warning" size={18} color={Colors.error} />
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    )}

                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
                        <View style={styles.inputContainer}>
                            <Ionicons name="mail-outline" size={20} color={Colors.primary} style={styles.inputIcon} />
                            <TextInput
                                style={styles.input}
                                placeholder="name@example.com"
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
                        <Text style={styles.inputLabel}>PASSWORD</Text>
                        <View style={styles.inputContainer}>
                            <Ionicons name="lock-closed-outline" size={20} color={Colors.primary} style={styles.inputIcon} />
                            <TextInput
                                style={[styles.input, { paddingRight: 50 }]}
                                placeholder="Enter your password"
                                placeholderTextColor={Colors.textMuted}
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry={!showPass}
                                selectionColor={Colors.primary}
                            />
                            <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.eyeIcon}>
                                <Ionicons name={showPass ? 'eye-off' : 'eye'} size={20} color={Colors.textMuted} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <TouchableOpacity
                        style={styles.keepRow}
                        onPress={() => setKeepConnected(!keepConnected)}
                        activeOpacity={0.8}
                    >
                        <View style={[styles.checkbox, keepConnected && styles.checkboxActive]}>
                            {keepConnected && <Ionicons name="checkmark-sharp" size={14} color="#fff" />}
                        </View>
                        <Text style={styles.keepText}>Keep me logged in</Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={handleLogin} activeOpacity={0.9} disabled={loading} style={styles.loginBtnWrapper}>
                        <LinearGradient
                            colors={Gradients.primary as any}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={styles.loginBtn}
                        >
                            {loading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <View style={styles.btnContent}>
                                    <Text style={styles.loginBtnText}>LOG IN</Text>
                                    <Ionicons name="log-in-outline" size={20} color="#fff" />
                                </View>
                            )}
                        </LinearGradient>
                    </TouchableOpacity>

                    <View style={styles.footer}>
                        <View style={styles.divider} />
                        <TouchableOpacity style={styles.registerLink} onPress={onNavigateToRegister}>
                            <Text style={styles.footerText}>Don't have an account? </Text>
                            <Text style={styles.regText}>Sign Up</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    header: {
        height: 220,
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingHorizontal: Spacing.xl,
        overflow: 'hidden',
    },
    backBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Spacing.lg,
    },
    headerContent: {
        zIndex: 5,
    },
    greeting: {
        color: '#fff',
        fontSize: 32,
        fontFamily: Fonts.bold,
        letterSpacing: -1,
    },
    subGreeting: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 14,
        fontFamily: Fonts.medium,
        marginTop: 4,
    },
    techLine: {
        position: 'absolute',
        top: 80,
        right: -50,
        width: 200,
        height: 1,
        backgroundColor: '#fff',
        opacity: 0.15,
        transform: [{ rotate: '-45deg' }],
    },
    scroll: {
        paddingHorizontal: Spacing.lg,
        paddingBottom: 40,
    },
    formCard: {
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.xl,
        padding: Spacing.lg,
        paddingTop: Spacing.xl,
        ...Shadow.lg,
    },
    errorBox: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        backgroundColor: '#fff1f1',
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        borderColor: Colors.error + '22',
        marginBottom: Spacing.lg,
        gap: 10,
    },
    errorText: {
        color: Colors.error,
        fontSize: 13,
        fontFamily: Fonts.medium,
        flex: 1,
    },
    inputGroup: {
        marginBottom: Spacing.lg,
    },
    inputLabel: {
        fontSize: 10,
        fontFamily: Fonts.bold,
        color: Colors.textMuted,
        letterSpacing: 2,
        marginBottom: 8,
        marginLeft: 4,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.background,
        borderRadius: BorderRadius.lg,
        borderWidth: 1.5,
        borderColor: Colors.border,
        paddingHorizontal: 16,
    },
    inputIcon: {
        marginRight: 12,
    },
    input: {
        flex: 1,
        height: 56,
        color: Colors.textPrimary,
        fontSize: 16,
        fontFamily: Fonts.medium,
    },
    eyeIcon: {
        position: 'absolute',
        right: 16,
    },
    keepRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.xl,
        gap: 12,
    },
    checkbox: {
        width: 20,
        height: 20,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: Colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxActive: {
        backgroundColor: Colors.primary,
    },
    keepText: {
        fontSize: 14,
        fontFamily: Fonts.medium,
        color: Colors.textSecondary,
    },
    loginBtnWrapper: {
        ...Shadow.primary,
    },
    loginBtn: {
        height: 60,
        borderRadius: BorderRadius.xl,
        alignItems: 'center',
        justifyContent: 'center',
    },
    btnContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    loginBtnText: {
        color: '#fff',
        fontSize: 16,
        fontFamily: Fonts.bold,
        letterSpacing: 2,
    },
    btnDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#fff',
    },
    headerLogo: {
        width: 40,
        height: 40,
        marginBottom: 12,
    },
    footer: {
        marginTop: Spacing.xl,
        alignItems: 'center',
    },
    divider: {
        width: 40,
        height: 3,
        backgroundColor: Colors.border,
        borderRadius: 1.5,
        marginBottom: Spacing.xl,
    },
    registerLink: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    footerText: {
        color: Colors.textMuted,
        fontSize: 14,
        fontFamily: Fonts.medium,
    },
    regText: {
        color: Colors.primaryDark,
        fontSize: 14,
        fontFamily: Fonts.bold,
    },
});
