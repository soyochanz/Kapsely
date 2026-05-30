import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    KeyboardAvoidingView, Platform, ScrollView, StatusBar, Image, ActivityIndicator,
    Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Spacing, BorderRadius, Shadow, Gradients } from '../../theme';
import { signIn } from '../../lib/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { multiAccountService } from '../../utils/multiAccount';
import { safeLocalSignOut } from '../../lib/supabase';

interface Props {
    onNavigateToRegister: () => void;
    onNavigateBack: () => void;
}

export default function LoginScreen({ onNavigateToRegister, onNavigateBack }: Props) {
    const insets = useSafeAreaInsets();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [loading, setLoading] = useState(false);
    const [focusedInput, setFocusedInput] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [keepConnected, setKeepConnected] = useState(true);

    const fadeAnim = React.useRef(new Animated.Value(0)).current;
    const slideAnim = React.useRef(new Animated.Value(30)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
            Animated.spring(slideAnim, { toValue: 0, tension: 20, friction: 7, useNativeDriver: true })
        ]).start();
    }, []);

    const handleLogin = async () => {
        if (!email.trim() || !password) {
            setError('Please fill in all fields.');
            return;
        }
        setError('');
        setLoading(true);
        try {
            await AsyncStorage.setItem('keep_connected', JSON.stringify(keepConnected));
            const authData = await signIn(email.trim().toLowerCase(), password, { resetLocalStateOnRetryable: Platform.OS === 'web' });
            
            // After successful sign in, try to save to multi-account list to check limits
            try {
                await multiAccountService.saveCurrentAccount(authData.session ?? null);
            } catch (limitErr: any) {
                // If limit reached, log out and show error
                await safeLocalSignOut();
                setError(limitErr.message);
            }
        } catch (e: any) {
            setError(e.message ?? 'Login failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
            
            {/* Light Premium Background */}
            <LinearGradient
                colors={['#ffffff', '#f8f9ff', '#f0f4ff']}
                style={StyleSheet.absoluteFillObject}
            />
            
            <View style={styles.glowOrb1} />
            <View style={styles.glowOrb2} />

            <KeyboardAvoidingView 
                style={{ flex: 1 }} 
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView
                    contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 10 }]}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                        <TouchableOpacity 
                            onPress={onNavigateBack} 
                            style={styles.backBtn}
                            activeOpacity={0.7}
                        >
                            <View style={styles.backBtnInner}>
                                <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
                            </View>
                        </TouchableOpacity>

                        <View style={styles.headerHero}>
                            <Image
                                source={{ uri: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/website/Logomain.png' }}
                                style={styles.logo}
                                resizeMode="contain"
                            />
                            <Text style={styles.greeting}>Welcome Back</Text>
                            <Text style={styles.subGreeting}>Sign in to your account</Text>
                        </View>

                        <View style={styles.formCard}>
                            {!!error && (
                                <View style={styles.errorBox}>
                                    <View style={styles.errorIndicator} />
                                    <Text style={styles.errorText}>{error}</Text>
                                </View>
                            )}

                            <View style={styles.inputSection}>
                                <Text style={styles.label}>EMAIL ADDRESS</Text>
                                <View style={[
                                    styles.inputContainer,
                                    focusedInput === 'email' && styles.inputFocused
                                ]}>
                                    <Ionicons 
                                        name="mail-outline" 
                                        size={20} 
                                        color={focusedInput === 'email' ? Colors.primary : Colors.textMuted} 
                                    />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="name@example.com"
                                        placeholderTextColor={Colors.textMuted}
                                        value={email}
                                        onChangeText={setEmail}
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        spellCheck={false}
                                        onFocus={() => setFocusedInput('email')}
                                        onBlur={() => setFocusedInput(null)}
                                        selectionColor={Colors.primary}
                                    />
                                </View>
                            </View>

                            <View style={styles.inputSection}>
                                <Text style={styles.label}>PASSWORD</Text>
                                <View style={[
                                    styles.inputContainer,
                                    focusedInput === 'password' && styles.inputFocused
                                ]}>
                                    <Ionicons 
                                        name="lock-closed-outline" 
                                        size={20} 
                                        color={focusedInput === 'password' ? Colors.primary : Colors.textMuted} 
                                    />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Enter your password"
                                        placeholderTextColor={Colors.textMuted}
                                        value={password}
                                        onChangeText={setPassword}
                                        secureTextEntry={!showPass}
                                        autoCorrect={false}
                                        spellCheck={false}
                                        onFocus={() => setFocusedInput('password')}
                                        onBlur={() => setFocusedInput(null)}
                                        selectionColor={Colors.primary}
                                    />
                                    <TouchableOpacity 
                                        onPress={() => setShowPass(!showPass)} 
                                        hitSlop={{top:10, bottom:10, left:10, right:10}}
                                    >
                                        <Ionicons 
                                            name={showPass ? 'eye-off-outline' : 'eye-outline'} 
                                            size={20} 
                                            color={Colors.textMuted} 
                                        />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <View style={styles.optionsRow}>
                                <TouchableOpacity 
                                    style={styles.checkbox} 
                                    onPress={() => setKeepConnected(!keepConnected)}
                                    activeOpacity={0.8}
                                >
                                    <View style={[styles.check, keepConnected && styles.checkActive]}>
                                        {keepConnected && <Ionicons name="checkmark" size={12} color="#fff" />}
                                    </View>
                                    <Text style={styles.checkLabel}>Keep me logged in</Text>
                                </TouchableOpacity>
                                
                                <TouchableOpacity>
                                    <Text style={styles.forgotText}>Forgot Password?</Text>
                                </TouchableOpacity>
                            </View>

                            <TouchableOpacity 
                                activeOpacity={0.9} 
                                onPress={handleLogin} 
                                disabled={loading}
                                style={styles.btnWrapper}
                            >
                                <LinearGradient
                                    colors={Gradients.primary as any}
                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                    style={styles.mainBtn}
                                >
                                    {loading ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <View style={styles.btnContent}>
                                            <Text style={styles.btnText}>LOG IN</Text>
                                            <Ionicons name="log-in-outline" size={20} color="#fff" />
                                        </View>
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>

                            <TouchableOpacity 
                                style={styles.registerLink} 
                                onPress={onNavigateToRegister}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.footerText}>Don't have an account? </Text>
                                <Text style={styles.registerText}>Sign Up</Text>
                            </TouchableOpacity>
                        </View>
                        
                        <Text style={styles.legal}>© 2026 KAPSELY INC. // SECURED ENCRYPTION</Text>
                    </Animated.View>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#ffffff',
    },
    scroll: {
        flexGrow: 1,
        paddingHorizontal: Spacing.xl,
        paddingTop: 10,
        paddingBottom: 40,
    },
    content: {
        flex: 1,
    },
    backBtn: {
        width: 48,
        height: 48,
        borderRadius: 24,
        overflow: 'hidden',
        marginBottom: Spacing.xl,
    },
    backBtnInner: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.06)',
        borderRadius: 24,
    },
    headerHero: {
        alignItems: 'center',
        marginBottom: Spacing.xxl,
    },
    logo: {
        width: 64,
        height: 64,
        marginBottom: 20,
    },
    greeting: {
        fontSize: 34,
        fontFamily: Fonts.bold,
        color: Colors.textPrimary,
        letterSpacing: -1,
    },
    subGreeting: {
        fontSize: 15,
        fontFamily: Fonts.medium,
        color: Colors.textSecondary,
        marginTop: 6,
    },
    formCard: {
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.xl,
        padding: Spacing.lg,
        ...Shadow.lg,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    errorBox: {
        backgroundColor: '#fff1f1',
        padding: 16,
        borderRadius: BorderRadius.lg,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
        borderWidth: 1,
        borderColor: Colors.error + '22',
    },
    errorIndicator: {
        width: 4,
        height: 20,
        backgroundColor: Colors.error,
        borderRadius: 2,
        marginRight: 12,
    },
    errorText: {
        color: Colors.error,
        fontSize: 13,
        fontFamily: Fonts.semiBold,
        flex: 1,
    },
    inputSection: {
        marginBottom: 20,
    },
    label: {
        fontSize: 10,
        fontFamily: Fonts.bold,
        color: Colors.textMuted,
        letterSpacing: 1.5,
        marginBottom: 10,
        marginLeft: 4,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f9f9ff',
        borderRadius: BorderRadius.lg,
        borderWidth: 1.5,
        borderColor: Colors.border,
        paddingHorizontal: 16,
        height: 60,
    },
    inputFocused: {
        borderColor: Colors.primary,
        backgroundColor: '#fbfaff',
    },
    input: {
        flex: 1,
        color: Colors.textPrimary,
        fontSize: 16,
        fontFamily: Fonts.medium,
        marginLeft: 12,
    },
    optionsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 4,
        marginBottom: 28,
    },
    checkbox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    check: {
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: Colors.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkActive: {
        backgroundColor: Colors.primary,
        borderColor: Colors.primary,
    },
    checkLabel: {
        color: Colors.textSecondary,
        fontSize: 14,
        fontFamily: Fonts.medium,
    },
    forgotText: {
        color: Colors.primary,
        fontSize: 13,
        fontFamily: Fonts.semiBold,
    },
    btnWrapper: {
        ...Shadow.primary,
    },
    mainBtn: {
        height: 64,
        borderRadius: BorderRadius.xl,
        alignItems: 'center',
        justifyContent: 'center',
    },
    btnContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
    },
    btnText: {
        color: '#fff',
        fontSize: 16,
        fontFamily: Fonts.bold,
        letterSpacing: 1,
    },
    registerLink: {
        marginTop: 24,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 10,
    },
    footerText: {
        color: Colors.textMuted,
        fontSize: 14,
        fontFamily: Fonts.medium,
    },
    registerText: {
        color: Colors.primary,
        fontSize: 14,
        fontFamily: Fonts.bold,
    },
    legal: {
        textAlign: 'center',
        marginTop: 40,
        fontSize: 9,
        fontFamily: Fonts.medium,
        color: Colors.textMuted,
        letterSpacing: 1,
        opacity: 0.6,
    },
    glowOrb1: {
        position: 'absolute',
        top: -100,
        left: -100,
        width: 300,
        height: 300,
        borderRadius: 150,
        backgroundColor: 'rgba(121, 56, 255, 0.05)',
    },
    glowOrb2: {
        position: 'absolute',
        bottom: 50,
        right: -150,
        width: 400,
        height: 400,
        borderRadius:200,
        backgroundColor: 'rgba(0, 242, 255, 0.03)',
    },
});
