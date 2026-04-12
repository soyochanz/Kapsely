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
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    card: {
        backgroundColor: Colors.surface,
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        padding: 24,
        maxHeight: '80%',
    },
    handle: {
        width: 40,
        height: 4,
        backgroundColor: '#E0E0E0',
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 20,
    },
    title: {
        fontSize: 22,
        fontWeight: '800',
        color: Colors.textPrimary,
        marginBottom: 24,
        textAlign: 'center',
    },
    label: {
        fontSize: 10,
        fontWeight: '700',
        color: Colors.textMuted,
        letterSpacing: 1,
        marginBottom: 8,
        marginLeft: 4,
    },
    inputGroup: {
        marginBottom: 20,
    },
    inputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F5F7FF',
        borderRadius: 15,
        borderWidth: 1,
        borderColor: Colors.border,
        paddingHorizontal: 16,
        height: 56,
    },
    input: {
        flex: 1,
        marginLeft: 12,
        fontSize: 15,
        color: Colors.textPrimary,
    },
    btn: {
        marginTop: 10,
        borderRadius: 18,
        overflow: 'hidden',
        height: 56,
    },
    btnGradient: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    btnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    errorBox: {
        backgroundColor: '#FFF1F1',
        padding: 12,
        borderRadius: 12,
        marginBottom: 20,
    },
    errorText: {
        color: Colors.error,
        fontSize: 13,
        textAlign: 'center',
    }
});
