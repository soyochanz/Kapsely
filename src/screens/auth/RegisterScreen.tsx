import React, { useState } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    KeyboardAvoidingView, Platform, ScrollView, StatusBar, ActivityIndicator, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Spacing, BorderRadius, Shadow, Gradients } from '../../theme';
import { signUp } from '../../lib/auth';

interface Props {
    onNavigateToLogin: () => void;
    onNavigateBack: () => void;
}

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

    const validate = (): string | null => {
        if (!email.trim() || !email.includes('@')) return 'Identity relay requires a valid email.';
        if (!username.trim()) return 'Unique moniker is required.';
        if (username.includes(' ')) return 'Monikers cannot contain space-time gaps.';
        if (username.length < 3) return 'Moniker must be at least 3 chars.';
        if (!displayName.trim()) return 'Public name is required.';
        const y = parseInt(birthdateYear), m = parseInt(birthdateMonth), d = parseInt(birthdateDay);
        if (!birthdateYear || !birthdateMonth || !birthdateDay || isNaN(y) || isNaN(m) || isNaN(d)) return 'Temporal origin required.';
        if (y < 1900 || y > 2013 || m < 1 || m > 12 || d < 1 || d > 31) return 'Temporal origin is invalid.';
        if (password.length < 6) return 'Passkey must be 6+ characters.';
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
            setError(e.message ?? 'Synthesis failed. Try again.');
            setLoading(false);
        }
    };

    const passStrength = password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : 3;
    const strengthColors = ['transparent', Colors.eventCap, Colors.warning, Colors.success];

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
                    <Text style={styles.greeting}>Join Kapsely</Text>
                    <Text style={styles.subGreeting}>Create an account to start sharing</Text>
                </View>

                {/* Subtle tech pattern */}
                <View style={[styles.techLine, { right: -60, top: 40, transform: [{ rotate: '15deg' }] }]} />
            </LinearGradient>

            <ScrollView
                contentContainerStyle={styles.scroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.formCard}>
                    {!!error && (
                        <View style={styles.errorBox}>
                            <Ionicons name="alert-circle" size={18} color={Colors.error} />
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    )}

                    {/* Email */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
                        <View style={styles.inputContainer}>
                            <Ionicons name="mail-outline" size={18} color={Colors.primary} style={styles.inputIcon} />
                            <TextInput
                                style={styles.input} placeholder="name@example.com"
                                placeholderTextColor={Colors.textMuted} value={email} onChangeText={setEmail}
                                keyboardType="email-address" autoCapitalize="none" selectionColor={Colors.primary} />
                        </View>
                    </View>

                    {/* Username */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>USERNAME</Text>
                        <View style={styles.inputContainer}>
                            <Ionicons name="at-outline" size={18} color={Colors.primary} style={styles.inputIcon} />
                            <TextInput
                                style={styles.input} placeholder="alex_88"
                                placeholderTextColor={Colors.textMuted}
                                value={username} onChangeText={(v) => setUsername(v.replace(/\s/g, '').toLowerCase())}
                                autoCapitalize="none" selectionColor={Colors.primary} />
                        </View>
                        <Text style={styles.helperText}>Used for your unique profile link</Text>
                    </View>

                    {/* Display Name */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>FULL NAME</Text>
                        <View style={styles.inputContainer}>
                            <Ionicons name="person-outline" size={18} color={Colors.primary} style={styles.inputIcon} />
                            <TextInput
                                style={styles.input} placeholder="Alex Smith"
                                placeholderTextColor={Colors.textMuted} value={displayName} onChangeText={setDisplayName}
                                selectionColor={Colors.primary} />
                        </View>
                    </View>

                    {/* Date of birth */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>DATE OF BIRTH</Text>
                        <View style={styles.dateRow}>
                            <View style={[styles.inputContainer, { flex: 1, paddingHorizontal: 0 }]}>
                                <TextInput style={styles.input} placeholder="DD"
                                    placeholderTextColor={Colors.textMuted} value={birthdateDay}
                                    onChangeText={(v) => setBirthdateDay(v.replace(/\D/g, '').slice(0, 2))}
                                    keyboardType="numeric" maxLength={2} textAlign="center"
                                    selectionColor={Colors.primary} />
                            </View>
                            <View style={[styles.inputContainer, { flex: 1, paddingHorizontal: 0 }]}>
                                <TextInput style={styles.input} placeholder="MM"
                                    placeholderTextColor={Colors.textMuted} value={birthdateMonth}
                                    onChangeText={(v) => setBirthdateMonth(v.replace(/\D/g, '').slice(0, 2))}
                                    keyboardType="numeric" maxLength={2} textAlign="center"
                                    selectionColor={Colors.primary} />
                            </View>
                            <View style={[styles.inputContainer, { flex: 1.5, paddingHorizontal: 0 }]}>
                                <TextInput style={styles.input} placeholder="YYYY"
                                    placeholderTextColor={Colors.textMuted} value={birthdateYear}
                                    onChangeText={(v) => setBirthdateYear(v.replace(/\D/g, '').slice(0, 4))}
                                    keyboardType="numeric" maxLength={4} textAlign="center"
                                    selectionColor={Colors.primary} />
                            </View>
                        </View>
                        <Text style={styles.helperText}>Required to verify age eligibility</Text>
                    </View>

                    {/* Password */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>PASSWORD</Text>
                        <View style={styles.inputContainer}>
                            <Ionicons name="shield-checkmark-outline" size={18} color={Colors.primary} style={styles.inputIcon} />
                            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Create a strong password"
                                placeholderTextColor={Colors.textMuted} value={password} onChangeText={setPassword}
                                secureTextEntry={!showPass} selectionColor={Colors.primary} />
                            <TouchableOpacity onPress={() => setShowPass((p) => !p)} style={styles.eyeBtn}>
                                <Ionicons name={showPass ? 'eye-off' : 'eye'} size={18} color={Colors.textMuted} />
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

                    <TouchableOpacity onPress={handleRegister} activeOpacity={0.9} disabled={loading} style={styles.regBtnWrapper}>
                        <LinearGradient
                            colors={Gradients.primary as any}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={styles.regBtn}
                        >
                            {loading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <View style={styles.btnContent}>
                                    <Text style={styles.regBtnText}>SIGN UP</Text>
                                    <Ionicons name="arrow-forward" size={18} color="#fff" />
                                </View>
                            )}
                        </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.loginLink} onPress={onNavigateToLogin} activeOpacity={0.7}>
                        <Text style={styles.loginLinkText}>
                            Already have an account?{' '}
                            <Text style={{ color: Colors.primaryDark, fontFamily: Fonts.bold }}>LOG IN</Text>
                        </Text>
                    </TouchableOpacity>
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
        height: 200,
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
        marginBottom: Spacing.md,
    },
    headerContent: {
        zIndex: 5,
    },
    greeting: {
        color: '#fff',
        fontSize: 30,
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
        width: 300,
        height: 1,
        backgroundColor: '#fff',
        opacity: 0.1,
    },
    scroll: {
        paddingHorizontal: Spacing.lg,
        paddingBottom: 60,
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
        fontSize: 9,
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
        marginRight: 10,
    },
    input: {
        flex: 1,
        height: 52,
        color: Colors.textPrimary,
        fontSize: 15,
        fontFamily: Fonts.medium,
    },
    helperText: {
        color: Colors.textMuted,
        fontSize: 10,
        fontFamily: Fonts.regular,
        marginTop: 6,
        marginLeft: 4,
        opacity: 0.8,
    },
    dateRow: {
        flexDirection: 'row',
        gap: Spacing.sm,
    },
    eyeBtn: {
        padding: 4,
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
    regBtnWrapper: {
        ...Shadow.primary,
        marginTop: 10,
    },
    regBtn: {
        height: 58,
        borderRadius: BorderRadius.xl,
        alignItems: 'center',
        justifyContent: 'center',
    },
    btnContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    regBtnText: {
        color: '#fff',
        fontSize: 15,
        fontFamily: Fonts.bold,
        letterSpacing: 1.5,
    },
    btnDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#fff',
    },
    loginLink: {
        alignItems: 'center',
        marginTop: Spacing.xl,
        paddingVertical: 10,
    },
    loginLinkText: {
        color: Colors.textMuted,
        fontSize: 13,
        fontFamily: Fonts.medium,
    },
    headerLogo: {
        width: 44,
        height: 44,
        marginBottom: 12,
    },
});
