import React, { useState } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    Modal, ActivityIndicator, KeyboardAvoidingView, Platform,
    ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Gradients } from '../theme';
import { LinearGradient } from 'expo-linear-gradient';
import { signIn } from '../lib/auth';
import { multiAccountService } from '../utils/multiAccount';

interface Props {
    visible: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function QuickLoginModal({ visible, onClose, onSuccess }: Props) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPass, setShowPass] = useState(false);

    const handleLogin = async () => {
        if (!email.trim() || !password) {
            setError('Campos incompletos');
            return;
        }
        setLoading(true);
        setError('');
        try {
            // 1. Save current before switching
            await multiAccountService.saveCurrentAccount();
            
            // 2. Perform login
            await signIn(email.trim().toLowerCase(), password);
            
            // 3. Save the NEW account specifically (this is usually handled by listeners but helper to be sure)
            await multiAccountService.saveCurrentAccount();
            
            onSuccess();
        } catch (e: any) {
            setError(e.message || 'Error al iniciar sesión');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <View style={s.overlay}>
                    <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
                    <View style={s.card}>
                        <View style={s.handle} />
                        <Text style={s.title}>Añadir Cuenta</Text>
                        
                        <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
                            {!!error && (
                                <View style={s.errorBox}>
                                    <Text style={s.errorText}>{error}</Text>
                                </View>
                            )}

                            <View style={s.inputGroup}>
                                <Text style={s.label}>EMAIL</Text>
                                <View style={s.inputWrap}>
                                    <Ionicons name="mail-outline" size={18} color={Colors.textMuted} />
                                    <TextInput
                                        style={s.input}
                                        value={email}
                                        onChangeText={setEmail}
                                        placeholder="ejemplo@kaps.com"
                                        autoCapitalize="none"
                                        keyboardType="email-address"
                                    />
                                </View>
                            </View>

                            <View style={s.inputGroup}>
                                <Text style={s.label}>CONTRASEÑA</Text>
                                <View style={s.inputWrap}>
                                    <Ionicons name="lock-closed-outline" size={18} color={Colors.textMuted} />
                                    <TextInput
                                        style={s.input}
                                        value={password}
                                        onChangeText={setPassword}
                                        placeholder="••••••••"
                                        secureTextEntry={!showPass}
                                    />
                                    <TouchableOpacity onPress={() => setShowPass(!showPass)}>
                                        <Ionicons name={showPass ? "eye-off" : "eye"} size={18} color={Colors.textMuted} />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <TouchableOpacity disabled={loading} onPress={handleLogin} style={s.btn}>
                                <LinearGradient
                                    colors={Gradients.primary as any}
                                    style={s.btnGradient}
                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                >
                                    {loading ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <Text style={s.btnText}>Iniciar Sesión</Text>
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    card: {
        backgroundColor: Colors.surface,
        borderTopLeftRadius: 36,
        borderTopRightRadius: 36,
        padding: 24,
        maxHeight: '85%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 20,
    },
    handle: {
        width: 36,
        height: 5,
        backgroundColor: Colors.divider,
        borderRadius: 2.5,
        alignSelf: 'center',
        marginBottom: 24,
    },
    title: {
        fontSize: 24,
        fontFamily: Fonts.bold,
        color: Colors.textPrimary,
        marginBottom: 28,
        textAlign: 'center',
        letterSpacing: -0.6,
    },
    label: {
        fontSize: 11,
        fontFamily: Fonts.bold,
        color: Colors.textMuted,
        letterSpacing: 0.8,
        marginBottom: 10,
        marginLeft: 4,
        textTransform: 'uppercase',
    },
    inputGroup: {
        marginBottom: 24,
    },
    inputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.cardAlt,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: 'transparent',
        paddingHorizontal: 18,
        height: 60,
    },
    input: {
        flex: 1,
        marginLeft: 14,
        fontSize: 16,
        fontFamily: Fonts.medium,
        color: Colors.textPrimary,
    },
    btn: {
        marginTop: 12,
        borderRadius: 30,
        overflow: 'hidden',
        height: 60,
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
        elevation: 8,
    },
    btnGradient: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    btnText: {
        color: '#fff',
        fontSize: 16,
        fontFamily: Fonts.bold,
    },
    errorBox: {
        backgroundColor: Colors.error + '10',
        padding: 16,
        borderRadius: 16,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: Colors.error + '20',
    },
    errorText: {
        color: Colors.error,
        fontSize: 14,
        fontFamily: Fonts.medium,
        textAlign: 'center',
    }
});
