import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ActivityIndicator, Alert, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors, Fonts, BorderRadius, Spacing } from '../theme';
import { supabase } from '../lib/supabase';

interface SupportModalProps {
    visible: boolean;
    onClose: () => void;
    userId: string;
}

export default function SupportModal({ visible, onClose, userId }: SupportModalProps) {
    const { t } = useTranslation();
    const [subject, setSubject] = useState('');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (!subject.trim() || !description.trim()) {
            Alert.alert(t('common.error', 'Error'), t('support.empty_fields', 'Please fill in all fields.'));
            return;
        }

        setLoading(true);
        const { error } = await supabase.from('support_tickets').insert({
            user_id: userId,
            subject: subject.trim(),
            description: description.trim()
        });
        setLoading(false);

        if (error) {
            Alert.alert(t('common.error', 'Error'), error.message);
        } else {
            Alert.alert(t('common.success', 'Success'), t('support.ticket_created', 'Your support ticket has been sent. We will review it shortly.'));
            setSubject('');
            setDescription('');
            onClose();
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={s.overlay} onPress={onClose}>
                <Pressable style={s.sheet}>
                    <View style={s.sheetHandle} />
                    
                    <View style={s.header}>
                        <TouchableOpacity onPress={onClose} style={s.backBtn}>
                            <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
                        </TouchableOpacity>
                        <Text style={s.title}>{t('support.title', 'Help & Support')}</Text>
                        <View style={{ width: 40 }} />
                    </View>

                    <Text style={s.subtitle}>
                        {t('support.subtitle', 'What can we help you with? Create a ticket and our team will check it.')}
                    </Text>

                    <View style={s.inputGroup}>
                        <Text style={s.label}>{t('support.subject', 'Subject')}</Text>
                        <TextInput
                            style={s.input}
                            placeholder={t('support.subject_placeholder', 'E.g., Bug report, Account issue...')}
                            placeholderTextColor={Colors.textMuted}
                            value={subject}
                            onChangeText={setSubject}
                            maxLength={80}
                        />
                    </View>

                    <View style={s.inputGroup}>
                        <Text style={s.label}>{t('support.description', 'Description')}</Text>
                        <TextInput
                            style={[s.input, s.textArea]}
                            placeholder={t('support.description_placeholder', 'Please provide details about your issue...')!}
                            placeholderTextColor={Colors.textMuted}
                            value={description}
                            onChangeText={setDescription}
                            multiline
                            textAlignVertical="top"
                            autoCorrect={false}
                        />
                    </View>

                    <TouchableOpacity 
                        style={[s.submitBtn, (!subject.trim() || !description.trim()) && s.submitDisabled]} 
                        activeOpacity={0.8}
                        onPress={handleSubmit}
                        disabled={loading || !subject.trim() || !description.trim()}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={s.submitText}>{t('support.submit', 'Send Ticket')}</Text>
                        )}
                    </TouchableOpacity>

                </Pressable>
            </Pressable>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: Colors.background,
        borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl,
        paddingBottom: Platform.OS === 'ios' ? 40 : 20,
        maxHeight: '85%',
    },
    sheetHandle: {
        width: 40, height: 4, borderRadius: 2,
        backgroundColor: Colors.border,
        alignSelf: 'center', marginVertical: 12,
    },
    header: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingBottom: Spacing.sm,
        borderBottomWidth: 1, borderBottomColor: Colors.divider,
    },
    backBtn: { width: 40, alignItems: 'flex-start' },
    title: { flex: 1, textAlign: 'center', fontSize: 17, fontFamily: Fonts.bold, color: Colors.textPrimary },
    subtitle: {
        fontSize: 14, fontFamily: Fonts.regular, color: Colors.textSecondary,
        textAlign: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    },
    inputGroup: {
        paddingHorizontal: Spacing.lg, marginBottom: Spacing.md,
    },
    label: {
        fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.textPrimary,
        marginBottom: 6,
    },
    input: {
        backgroundColor: Colors.cardAlt,
        borderWidth: 1, borderColor: Colors.border,
        borderRadius: BorderRadius.md,
        paddingHorizontal: 16, paddingVertical: 14,
        fontSize: 15, fontFamily: Fonts.regular, color: Colors.textPrimary,
    },
    textArea: {
        height: 120, paddingTop: 14,
    },
    submitBtn: {
        backgroundColor: Colors.primary,
        borderRadius: BorderRadius.full,
        marginHorizontal: Spacing.lg,
        marginTop: Spacing.sm,
        height: 50, alignItems: 'center', justifyContent: 'center',
    },
    submitDisabled: { opacity: 0.5 },
    submitText: {
        fontSize: 16, fontFamily: Fonts.bold, color: '#FFFFFF',
    },
});
