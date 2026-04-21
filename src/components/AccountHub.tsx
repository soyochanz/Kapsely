import React from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Image, ScrollView,
    ActivityIndicator, Alert, Animated, Platform
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors, Fonts } from '../theme';
import { multiAccountService, SavedAccount } from '../utils/multiAccount';
import { supabase } from '../lib/supabase';

interface Props {
    accounts: SavedAccount[];
    currentUserId: string | null;
    onClose: () => void;
    onAddAccount: () => void;
    onSwitch: (accountId: string) => void;
}

export default function AccountHub({ accounts, currentUserId, onClose, onAddAccount, onSwitch }: Props) {
    const { t } = useTranslation();
    const [loadingId, setLoadingId] = React.useState<string | null>(null);

    const handleSwitch = async (id: string) => {
        setLoadingId(id);
        try {
            await onSwitch(id);
        } finally {
            setLoadingId(null);
        }
    };

    const handleRemoveAccount = async (acc: SavedAccount) => {
        if (acc.id === currentUserId) {
            Alert.alert(t('common.warning'), t('profile.logout_current_warning', 'Para cerrar esta sesión usa el botón de cerrar sesión en el menú principal.'));
            return;
        }

        Alert.alert(
            t('profile.logout_account', 'Cerrar sesión'),
            t('profile.remove_account_confirm', '¿Quieres quitar esta cuenta del dispositivo?'),
            [
                { text: t('common.cancel'), style: 'cancel' },
                { 
                    text: t('common.delete'), 
                    style: 'destructive',
                    onPress: async () => {
                        await multiAccountService.removeAccount(acc.id);
                        onClose();
                    }
                }
            ]
        );
    };

    return (
        <View style={s.container}>
            <View style={s.handle} />
            <View style={s.header}>
                <View style={s.titleRow}>
                    <Ionicons name="people-circle-outline" size={28} color={Colors.primary} />
                    <Text style={s.title}>{t('profile.account_hub', 'Account Hub')}</Text>
                </View>
                <Text style={s.subtitle}>{t('profile.manage_accounts', 'Gestiona tus sesiones activas')}</Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
                {accounts.map((acc) => {
                    const isCurrent = acc.id === currentUserId;
                    const isLoading = loadingId === acc.id;
                    
                    return (
                        <TouchableOpacity 
                            key={acc.id}
                            onPress={() => !isCurrent && !isLoading && handleSwitch(acc.id)}
                            activeOpacity={0.8}
                            style={[s.accountCard, isCurrent && s.activeCard]}
                        >
                            <View style={s.avatarContainer}>
                                <Image 
                                    source={{ uri: acc.avatar_url || 'https://via.placeholder.com/150' }} 
                                    style={s.avatar}
                                />
                                {isCurrent && (
                                    <View style={s.activeBadge}>
                                        <Ionicons name="checkmark" size={10} color="#fff" />
                                    </View>
                                )}
                            </View>

                            <View style={s.info}>
                                <View style={s.nameRow}>
                                    <Text style={[s.username, isCurrent && { color: Colors.primary }]} numberOfLines={1}>@{acc.username}</Text>
                                    {acc.session.user.user_metadata?.is_verified && (
                                        <Ionicons name="checkmark-circle" size={14} color={Colors.primary} style={{ marginLeft: 4 }} />
                                    )}
                                </View>
                                <Text style={s.email} numberOfLines={1}>{acc.email}</Text>
                                {isCurrent ? (
                                    <View style={s.statusTag}>
                                        <View style={s.pulseDot} />
                                        <Text style={s.sessionTag}>{t('profile.current_session', 'Sesión activa')}</Text>
                                    </View>
                                ) : (
                                    <Text style={s.switchLabel}>{t('profile.tap_to_switch', 'Pulsa para cambiar')}</Text>
                                )}
                            </View>

                            <View style={s.cardActions}>
                                {isLoading ? (
                                    <ActivityIndicator size="small" color={Colors.primary} />
                                ) : !isCurrent && (
                                    <TouchableOpacity 
                                        style={s.removeBtn}
                                        onPress={() => handleRemoveAccount(acc)}
                                    >
                                        <Ionicons name="close-circle-outline" size={24} color={Colors.textMuted} />
                                    </TouchableOpacity>
                                )}
                            </View>
                        </TouchableOpacity>
                    );
                })}

                <TouchableOpacity 
                    style={s.addBtn}
                    onPress={onAddAccount}
                    activeOpacity={0.8}
                >
                    <View style={s.addIconContainer}>
                        <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={s.addIconGrad}>
                            <Ionicons name="add" size={24} color="#fff" />
                        </LinearGradient>
                    </View>
                    <View style={s.addTextContainer}>
                        <Text style={s.addTitle}>{t('profile.add_account')}</Text>
                        <Text style={s.addSub}>{t('profile.add_account_sub', 'Límite de 3 cuentas (10 si eres verificado)')}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.primary} opacity={0.5} />
                </TouchableOpacity>
            </ScrollView>

            <TouchableOpacity style={s.closeBtn} onPress={onClose}>
                <Text style={s.closeBtnText}>{t('common.done')}</Text>
            </TouchableOpacity>
        </View>
    );
}

import { LinearGradient } from 'expo-linear-gradient';

const Shadows = {
    md: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
        elevation: 8,
    },
    subtle: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    }
};

const s = StyleSheet.create({
    container: {
        backgroundColor: Colors.surface,
        borderTopLeftRadius: 36,
        borderTopRightRadius: 36,
        paddingTop: 12,
        paddingHorizontal: 20,
        paddingBottom: Platform.OS === 'ios' ? 40 : 20,
        maxHeight: '90%',
        ...Shadows.md,
    },
    handle: {
        width: 36,
        height: 5,
        backgroundColor: Colors.divider,
        borderRadius: 2.5,
        alignSelf: 'center',
        marginBottom: 20,
    },
    header: {
        marginBottom: 26,
        alignItems: 'center',
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    title: {
        fontSize: 24,
        fontFamily: Fonts.bold,
        color: Colors.textPrimary,
        letterSpacing: -0.6,
    },
    subtitle: {
        fontSize: 14,
        fontFamily: Fonts.medium,
        color: Colors.textMuted,
        marginTop: 4,
    },
    scrollContent: {
        paddingBottom: 20,
    },
    accountCard: {
        backgroundColor: Colors.cardAlt,
        borderRadius: 28,
        marginBottom: 14,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderWidth: 1.5,
        borderColor: 'transparent',
    },
    activeCard: {
        backgroundColor: '#fff',
        borderColor: Colors.primary,
        ...Shadows.md,
    },
    avatarContainer: {
        position: 'relative',
    },
    avatar: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: Colors.divider,
        borderWidth: 2,
        borderColor: '#fff',
    },
    activeBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: Colors.primary,
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#fff',
    },
    info: {
        flex: 1,
        marginLeft: 18,
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    username: {
        fontSize: 17,
        fontFamily: Fonts.bold,
        color: Colors.textPrimary,
        letterSpacing: -0.3,
    },
    email: {
        fontSize: 13,
        fontFamily: Fonts.medium,
        color: Colors.textMuted,
        marginTop: 1,
    },
    statusTag: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 6,
        gap: 6,
    },
    pulseDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#10B981',
    },
    sessionTag: {
        fontSize: 11,
        fontFamily: Fonts.bold,
        color: '#10B981',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    switchLabel: {
        fontSize: 12,
        fontFamily: Fonts.medium,
        color: Colors.primary,
        marginTop: 6,
        opacity: 0.8,
    },
    cardActions: {
        width: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    removeBtn: {
        padding: 4,
    },
    addBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 18,
        backgroundColor: Colors.primary + '08',
        borderRadius: 28,
        marginTop: 10,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: Colors.primary + '30',
    },
    addIconContainer: {
        width: 50,
        height: 50,
        borderRadius: 25,
        overflow: 'hidden',
    },
    addIconGrad: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    addTextContainer: {
        flex: 1,
        marginLeft: 16,
    },
    addTitle: {
        fontSize: 17,
        fontFamily: Fonts.bold,
        color: Colors.primary,
    },
    addSub: {
        fontSize: 12,
        fontFamily: Fonts.medium,
        color: Colors.textMuted,
        marginTop: 2,
    },
    closeBtn: {
        marginTop: 20,
        height: 58,
        backgroundColor: Colors.cardAlt,
        borderRadius: 29,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: Colors.divider,
    },
    closeBtnText: {
        fontSize: 16,
        fontFamily: Fonts.bold,
        color: Colors.textPrimary,
    },
});

