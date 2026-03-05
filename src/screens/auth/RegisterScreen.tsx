import React, { useState } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    KeyboardAvoidingView, Platform, ScrollView, StatusBar, ActivityIndicator, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Spacing, BorderRadius, Shadow } from '../../theme';
import { signUp } from '../../lib/auth';

interface Props {
    onNavigateToLogin: () => void;
    onNavigateBack: () => void;
}

export default function RegisterScreen({ onNavigateToLogin, onNavigateBack }: Props) {
    const [email, setEmail] = useState('');
    const [username, setUsername] = useState('');
    const [displayName, setDisplayName] = useState('');
    // Date of birth stored as YYYY-MM-DD string
    const [birthdateYear, setBirthdateYear] = useState('');
    const [birthdateMonth, setBirthdateMonth] = useState('');
    const [birthdateDay, setBirthdateDay] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const validate = (): string | null => {
        if (!email.trim() || !email.includes('@')) return 'Please enter a valid email.';
        if (!username.trim()) return 'Username is required.';
        if (username.includes(' ')) return 'Username cannot contain spaces.';
        if (username.length < 3) return 'Username must be at least 3 characters.';
        if (!displayName.trim()) return 'Display name is required.';
        const y = parseInt(birthdateYear), m = parseInt(birthdateMonth), d = parseInt(birthdateDay);
        if (!birthdateYear || !birthdateMonth || !birthdateDay || isNaN(y) || isNaN(m) || isNaN(d)) return 'Please enter your full date of birth.';
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
    const strengthColors = ['transparent', Colors.eventCap, Colors.legacyCap, Colors.success];
    const strengthLabels = ['', 'Weak', 'Good', 'Strong'];

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

            <LinearGradient colors={[Colors.primaryDark, Colors.primary]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
                <View style={styles.headerRow}>
                    <TouchableOpacity onPress={onNavigateBack} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={20} color="#fff" />
                    </TouchableOpacity>
                    <Image
                        source={{ uri: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/website/Logomain.png' }}
                        style={styles.headerLogo}
                        resizeMode="contain"
                    />
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerTitle}>Create Account</Text>
                        <Text style={styles.headerSub}>Join the memory revolution</Text>
                    </View>
                </View>
                <View style={styles.circleDecor} />
            </LinearGradient>

            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}>
                <View style={styles.card}>

                    {!!error && (
                        <View style={styles.errorBox}>
                            <Ionicons name="alert-circle-outline" size={16} color={Colors.eventCap} />
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    )}

                    {/* Email */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Email</Text>
                        <View style={styles.inputWrapper}>
                            <Ionicons name="mail-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                            <TextInput style={styles.input} placeholder="your@email.com"
                                placeholderTextColor={Colors.textMuted} value={email} onChangeText={setEmail}
                                keyboardType="email-address" autoCapitalize="none" selectionColor={Colors.primary} />
                        </View>
                    </View>

                    {/* Username */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Username</Text>
                        <View style={styles.inputWrapper}>
                            <Ionicons name="at-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                            <TextInput style={styles.input} placeholder="yourusername"
                                placeholderTextColor={Colors.textMuted}
                                value={username} onChangeText={(v) => setUsername(v.replace(/\s/g, '').toLowerCase())}
                                autoCapitalize="none" selectionColor={Colors.primary} />
                        </View>
                        <Text style={styles.helperText}>Only lowercase letters, numbers and underscores</Text>
                    </View>

                    {/* Display Name */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Display Name</Text>
                        <View style={styles.inputWrapper}>
                            <Ionicons name="person-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                            <TextInput style={styles.input} placeholder="Alex Veyra"
                                placeholderTextColor={Colors.textMuted} value={displayName} onChangeText={setDisplayName}
                                selectionColor={Colors.primary} />
                        </View>
                    </View>

                    {/* Date of birth */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Date of Birth</Text>
                        <View style={styles.dateRow}>
                            <View style={[styles.inputWrapper, { flex: 1 }]}>
                                <TextInput style={styles.input} placeholder="DD"
                                    placeholderTextColor={Colors.textMuted} value={birthdateDay}
                                    onChangeText={(v) => setBirthdateDay(v.replace(/\D/g, '').slice(0, 2))}
                                    keyboardType="numeric" maxLength={2} textAlign="center"
                                    selectionColor={Colors.primary} />
                            </View>
                            <View style={[styles.inputWrapper, { flex: 1 }]}>
                                <TextInput style={styles.input} placeholder="MM"
                                    placeholderTextColor={Colors.textMuted} value={birthdateMonth}
                                    onChangeText={(v) => setBirthdateMonth(v.replace(/\D/g, '').slice(0, 2))}
                                    keyboardType="numeric" maxLength={2} textAlign="center"
                                    selectionColor={Colors.primary} />
                            </View>
                            <View style={[styles.inputWrapper, { flex: 2 }]}>
                                <TextInput style={styles.input} placeholder="YYYY"
                                    placeholderTextColor={Colors.textMuted} value={birthdateYear}
                                    onChangeText={(v) => setBirthdateYear(v.replace(/\D/g, '').slice(0, 4))}
                                    keyboardType="numeric" maxLength={4} textAlign="center"
                                    selectionColor={Colors.primary} />
                            </View>
                        </View>
                        <Text style={styles.helperText}>You must be at least 13 years old</Text>
                    </View>

                    {/* Password */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Password</Text>
                        <View style={styles.inputWrapper}>
                            <Ionicons name="lock-closed-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Min. 6 characters"
                                placeholderTextColor={Colors.textMuted} value={password} onChangeText={setPassword}
                                secureTextEntry={!showPass} selectionColor={Colors.primary} />
                            <TouchableOpacity onPress={() => setShowPass((p) => !p)} style={styles.eyeBtn}>
                                <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textMuted} />
                            </TouchableOpacity>
                        </View>
                        {password.length > 0 && (
                            <View style={styles.strengthRow}>
                                {[1, 2, 3].map((i) => (
                                    <View key={i} style={[styles.strengthBar,
                                    { backgroundColor: passStrength >= i ? strengthColors[passStrength] : Colors.border }
                                    ]} />
                                ))}
                                <Text style={[styles.strengthLabel, { color: strengthColors[passStrength] }]}>
                                    {strengthLabels[passStrength]}
                                </Text>
                            </View>
                        )}
                    </View>

                    <TouchableOpacity onPress={handleRegister} activeOpacity={0.85} disabled={loading}>
                        <LinearGradient colors={[Colors.primary, Colors.primaryDark]}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btn}>
                            {loading
                                ? <ActivityIndicator color="#fff" />
                                : <><Ionicons name="lock-closed" size={16} color="#fff" /><Text style={styles.btnText}>Create Account</Text></>
                            }
                        </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.loginLink} onPress={onNavigateToLogin}>
                        <Text style={styles.loginLinkText}>
                            Already have an account?{' '}
                            <Text style={{ color: Colors.primary, fontFamily: Fonts.semiBold }}>Sign In</Text>
                        </Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    header: { paddingTop: 46, paddingBottom: 14, paddingHorizontal: Spacing.lg, overflow: 'hidden' },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    headerLogo: { width: 28, height: 28, tintColor: '#fff' },
    headerTitle: { color: '#fff', fontSize: 19, fontFamily: Fonts.bold },
    headerSub: { color: 'rgba(255,255,255,0.78)', fontSize: 11, fontFamily: Fonts.light, marginTop: 2 },
    circleDecor: {
        position: 'absolute', top: -20, right: -20, width: 110, height: 110,
        borderRadius: 55, backgroundColor: 'rgba(255,255,255,0.07)',
    },
    scroll: { paddingHorizontal: Spacing.md, paddingBottom: 60 },
    card: { backgroundColor: Colors.surface, borderRadius: BorderRadius.xl, padding: Spacing.lg, marginTop: -16, ...Shadow.primary },
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
        borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: 14, ...Shadow.subtle,
    },
    inputIcon: { marginRight: 10 },
    input: { height: 50, color: Colors.textPrimary, fontSize: 15, fontFamily: Fonts.regular, flex: 1 },
    helperText: { color: Colors.textMuted, fontSize: 11, fontFamily: Fonts.regular, marginTop: 5 },
    dateRow: { flexDirection: 'row', gap: Spacing.sm },
    eyeBtn: { padding: 4 },
    strengthRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
    strengthBar: { height: 3, flex: 1, borderRadius: 2 },
    strengthLabel: { fontSize: 11, fontFamily: Fonts.semiBold, minWidth: 40 },
    btn: {
        borderRadius: BorderRadius.lg, paddingVertical: 16,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4,
    },
    btnText: { color: '#fff', fontSize: 16, fontFamily: Fonts.bold },
    loginLink: { alignItems: 'center', paddingVertical: Spacing.md },
    loginLinkText: { color: Colors.textMuted, fontSize: 13, fontFamily: Fonts.regular },
});
