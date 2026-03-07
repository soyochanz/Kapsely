import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    KeyboardAvoidingView, Platform, ScrollView, StatusBar, ActivityIndicator, Image,
    Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Spacing, BorderRadius, Shadow, Gradients } from '../../theme';
import { signUp } from '../../lib/auth';
interface Props {
    onNavigateToLogin: () => void;
    onNavigateBack: () => void;
}

const InputWrapper = ({ label, icon, children, focusedInput, id }: any) => (
    <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{label.toUpperCase()}</Text>
        <View style={[
            styles.inputContainer,
            focusedInput === id && styles.inputFocused
        ]}>
            <Ionicons 
                name={icon} 
                size={20} 
                color={focusedInput === id ? Colors.primary : Colors.textMuted} 
                style={styles.inputIcon} 
            />
            {children}
        </View>
    </View>
);

export default function RegisterScreen({ onNavigateToLogin, onNavigateBack }: Props) {
    const [email, setEmail] = useState('');
    const [username, setUsername] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [birthdateYear, setBirthdateYear] = useState('');
    const [birthdateMonth, setBirthdateMonth] = useState('');
    const [birthdateDay, setBirthdateDay] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [focusedInput, setFocusedInput] = useState<string | null>(null);

    const fadeAnim = React.useRef(new Animated.Value(0)).current;
    const slideAnim = React.useRef(new Animated.Value(30)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
            Animated.spring(slideAnim, { toValue: 0, tension: 20, friction: 7, useNativeDriver: true })
        ]).start();
    }, []);

    const validate = (): string | null => {
        if (!email.trim() || !email.includes('@')) return 'Please enter a valid email address.';
        if (!username.trim()) return 'Username is required.';
        if (username.includes(' ')) return 'Usernames cannot contain spaces.';
        if (username.length < 3) return 'Username must be at least 3 characters.';
        if (!displayName.trim()) return 'Public name is required.';
        const y = parseInt(birthdateYear), m = parseInt(birthdateMonth), d = parseInt(birthdateDay);
        if (!birthdateYear || !birthdateMonth || !birthdateDay || isNaN(y) || isNaN(m) || isNaN(d)) return 'Date of birth is required.';
        if (y < 1900 || y > 2013 || m < 1 || m > 12 || d < 1 || d > 31) return 'Please enter a valid date of birth.';
        if (password.length < 6) return 'Password must be at least 6 characters.';
        return null;
    };

    const handleRegister = async () => {
        const err = validate();
        if (err) { setError(err); return; }
        setError('');
        setLoading(true);
        const isoDate = `${birthdateYear.padStart(4, '0')}-${birthdateMonth.padStart(2, '0')}-${birthdateDay.padStart(2, '0')}`;
        try {
            await signUp({
                email: email.trim().toLowerCase(),
                password,
                username: username.trim().toLowerCase(),
                displayName: displayName.trim(),
                birthdate: isoDate,
            });
        } catch (e: any) {
            setError(e.message ?? 'Registration failed. Please try again.');
            setLoading(false);
        }
    };

    const passStrength = password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : 3;
    const strengthColors = ['transparent', Colors.eventCap, Colors.warning, Colors.success];

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
            
            <LinearGradient
                colors={['#ffffff', '#f8f9ff', '#f0f4ff']}
                style={StyleSheet.absoluteFillObject}
            />

            <KeyboardAvoidingView 
                style={{ flex: 1 }} 
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView
                    contentContainerStyle={styles.scroll}
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
                            <Text style={styles.greeting}>Create Account</Text>
                            <Text style={styles.subGreeting}>Join our community of time travelers</Text>
                        </View>

                        <View style={styles.formCard}>
                            {!!error && (
                                <View style={styles.errorBox}>
                                    <View style={styles.errorIndicator} />
                                    <Text style={styles.errorText}>{error}</Text>
                                </View>
                            )}

                            <InputWrapper label="Email Address" icon="mail-outline" id="email" focusedInput={focusedInput}>
                                <TextInput
                                    style={styles.input} placeholder="name@example.com"
                                    placeholderTextColor={Colors.textMuted} value={email} onChangeText={setEmail}
                                    keyboardType="email-address" autoCapitalize="none" 
                                    autoCorrect={false} spellCheck={false}
                                    selectionColor={Colors.primary} 
                                    onFocus={() => setFocusedInput('email')} onBlur={() => setFocusedInput(null)}
                                />
                            </InputWrapper>

                            <InputWrapper label="Username" icon="at-outline" id="username" focusedInput={focusedInput}>
                                <TextInput
                                    style={styles.input} placeholder="alex_88"
                                    placeholderTextColor={Colors.textMuted}
                                    value={username} onChangeText={(v) => setUsername(v.replace(/\s/g, '').toLowerCase())}
                                    autoCapitalize="none" autoCorrect={false} spellCheck={false}
                                    selectionColor={Colors.primary}
                                    onFocus={() => setFocusedInput('username')} onBlur={() => setFocusedInput(null)}
                                />
                            </InputWrapper>

                            <InputWrapper label="Public Name" icon="person-outline" id="displayName" focusedInput={focusedInput}>
                                <TextInput
                                    style={styles.input} placeholder="Alex Smith"
                                    placeholderTextColor={Colors.textMuted} value={displayName} onChangeText={setDisplayName}
                                    selectionColor={Colors.primary} autoCorrect={false} spellCheck={false}
                                    onFocus={() => setFocusedInput('displayName')} onBlur={() => setFocusedInput(null)}
                                />
                            </InputWrapper>

                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>DATE OF BIRTH</Text>
                                <View style={styles.dateRow}>
                                    <View style={[styles.dateInput, focusedInput === 'day' && styles.dateInputFocused]}>
                                        <TextInput style={styles.input} placeholder="DD"
                                            placeholderTextColor={Colors.textMuted} value={birthdateDay}
                                            onChangeText={(v) => setBirthdateDay(v.replace(/\D/g, '').slice(0, 2))}
                                            keyboardType="numeric" maxLength={2} textAlign="center"
                                            selectionColor={Colors.primary} onFocus={() => setFocusedInput('day')} onBlur={() => setFocusedInput(null)}
                                        />
                                    </View>
                                    <View style={[styles.dateInput, focusedInput === 'month' && styles.dateInputFocused]}>
                                        <TextInput style={styles.input} placeholder="MM"
                                            placeholderTextColor={Colors.textMuted} value={birthdateMonth}
                                            onChangeText={(v) => setBirthdateMonth(v.replace(/\D/g, '').slice(0, 2))}
                                            keyboardType="numeric" maxLength={2} textAlign="center"
                                            selectionColor={Colors.primary} onFocus={() => setFocusedInput('month')} onBlur={() => setFocusedInput(null)}
                                        />
                                    </View>
                                    <View style={[styles.dateInput, { flex: 1.5 }, focusedInput === 'year' && styles.dateInputFocused]}>
                                        <TextInput style={styles.input} placeholder="YYYY"
                                            placeholderTextColor={Colors.textMuted} value={birthdateYear}
                                            onChangeText={(v) => setBirthdateYear(v.replace(/\D/g, '').slice(0, 4))}
                                            keyboardType="numeric" maxLength={4} textAlign="center"
                                            selectionColor={Colors.primary} onFocus={() => setFocusedInput('year')} onBlur={() => setFocusedInput(null)}
                                        />
                                    </View>
                                </View>
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>PASSWORD</Text>
                                <View style={[styles.inputContainer, focusedInput === 'password' && styles.inputFocused]}>
                                    <Ionicons name="lock-closed-outline" size={20} color={focusedInput === 'password' ? Colors.primary : Colors.textMuted} style={styles.inputIcon} />
                                    <TextInput style={styles.input} placeholder="Create a strong password"
                                        placeholderTextColor={Colors.textMuted} value={password} onChangeText={setPassword}
                                        secureTextEntry={!showPass} selectionColor={Colors.primary} 
                                        onFocus={() => setFocusedInput('password')} onBlur={() => setFocusedInput(null)}
                                    />
                                    <TouchableOpacity onPress={() => setShowPass((p) => !p)} hitSlop={{top:10, bottom:10, left:10, right:10}}>
                                        <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.textMuted} />
                                    </TouchableOpacity>
                                </View>
                                {password.length > 0 && (
                                    <View style={styles.strengthRow}>
                                        {[1, 2, 3].map((i) => (
                                            <View key={i} style={[styles.strengthBar,
                                            { backgroundColor: passStrength >= i ? strengthColors[passStrength] : Colors.border }
                                            ]} />
                                        ))}
                                    </View>
                                )}
                            </View>

                            <TouchableOpacity onPress={handleRegister} activeOpacity={0.9} disabled={loading} style={styles.btnWrapper}>
                                <LinearGradient
                                    colors={Gradients.primary as any}
                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                    style={styles.mainBtn}
                                >
                                    {loading ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <View style={styles.btnContent}>
                                            <Text style={styles.btnText}>SIGN UP</Text>
                                            <Ionicons name="sparkles-outline" size={20} color="#fff" />
                                        </View>
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.loginLink} onPress={onNavigateToLogin} activeOpacity={0.7}>
                                <Text style={styles.loginLinkText}>
                                    Already have an account?{' '}
                                    <Text style={{ color: Colors.primary, fontFamily: Fonts.bold }}>LOG IN</Text>
                                </Text>
                            </TouchableOpacity>
                        </View>
                        
                        <Text style={styles.legal}>By signing up, you agree to our Terms and Privacy Policy.</Text>
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
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
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
        marginBottom: Spacing.xl,
    },
    logo: {
        width: 54,
        height: 54,
        marginBottom: 16,
    },
    greeting: {
        fontSize: 32,
        fontFamily: Fonts.bold,
        color: Colors.textPrimary,
        letterSpacing: -1,
    },
    subGreeting: {
        fontSize: 14,
        fontFamily: Fonts.medium,
        color: Colors.textSecondary,
        marginTop: 4,
    },
    formCard: {
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.xl,
        padding: Spacing.lg,
        ...Shadow.lg,
        borderWidth: 1,
        borderColor: Colors.border,
        marginBottom: 20,
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
    inputGroup: {
        marginBottom: 18,
    },
    inputLabel: {
        fontSize: 10,
        fontFamily: Fonts.bold,
        color: Colors.textMuted,
        letterSpacing: 1.5,
        marginBottom: 8,
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
        height: 56,
    },
    inputFocused: {
        borderColor: Colors.primary,
        backgroundColor: '#fbfaff',
    },
    inputIcon: {
        marginRight: 12,
    },
    input: {
        flex: 1,
        color: Colors.textPrimary,
        fontSize: 15,
        fontFamily: Fonts.medium,
    },
    dateRow: {
        flexDirection: 'row',
        gap: 12,
    },
    dateInput: {
        flex: 1,
        backgroundColor: '#f9f9ff',
        borderRadius: BorderRadius.lg,
        borderWidth: 1.5,
        borderColor: Colors.border,
        height: 56,
        justifyContent: 'center',
    },
    dateInputFocused: {
        borderColor: Colors.primary,
        backgroundColor: '#fbfaff',
    },
    strengthRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 10,
        paddingHorizontal: 4,
    },
    strengthBar: {
        height: 3,
        flex: 1,
        borderRadius: 2,
    },
    btnWrapper: {
        ...Shadow.primary,
        marginTop: 10,
    },
    mainBtn: {
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
    btnText: {
        color: '#fff',
        fontSize: 16,
        fontFamily: Fonts.bold,
        letterSpacing: 1.2,
    },
    loginLink: {
        alignItems: 'center',
        marginTop: 20,
        paddingVertical: 10,
    },
    loginLinkText: {
        color: Colors.textMuted,
        fontSize: 14,
        fontFamily: Fonts.medium,
    },
    legal: {
        textAlign: 'center',
        fontSize: 12,
        fontFamily: Fonts.regular,
        color: Colors.textMuted,
        lineHeight: 18,
        marginBottom: 20,
        paddingHorizontal: 20,
    },
});
