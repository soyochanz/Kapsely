import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
    KeyboardAvoidingView, Platform, StatusBar, ActivityIndicator, Alert, Modal
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts, Spacing, BorderRadius, Shadow } from '../theme';
import { supabase } from '../lib/supabase';
import { sendPushNotification } from '../utils/pushNotifications';

export default function InboxScreen() {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation();
    const route = useRoute<any>();
    const { profileId } = route.params || {};

    const [loading, setLoading] = useState(true);
    const [questions, setQuestions] = useState<any[]>([]);
    const [newQuestion, setNewQuestion] = useState('');
    const [answeringQuestion, setAnsweringQuestion] = useState<any>(null);
    const [newAnswer, setNewAnswer] = useState('');
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [isOwner, setIsOwner] = useState(false);

    const dayOfWeek = new Date().getDay();
    const isMonday = dayOfWeek === 1; // 1 = Monday
    const isTuesday = dayOfWeek === 2; // 2 = Tuesday (cycle restart)

    const loadData = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        setCurrentUserId(user?.id || null);
        setIsOwner(user?.id === profileId);

        let query = supabase.from('kaps_box_questions').select('*').eq('profile_id', profileId);

        if (user?.id === profileId) {
            // Owner sees all un-archived questions
            query = query.eq('is_archived', false).order('created_at', { ascending: false });
        } else {
            if (isMonday) {
                // Public sees only revealed ones on Monday
                query = query.eq('is_revealed', true).order('created_at', { ascending: false });
            } else {
                // Other days visitors can only ask, maybe see nothing listed
                setQuestions([]);
                setLoading(false);
                return;
            }
        }

        const { data, error } = await query;
        if (data) setQuestions(data);
        setLoading(false);
    };

    useEffect(() => { loadData(); }, [profileId]);

    const handleSendQuestion = async () => {
        if (!newQuestion.trim()) return;
        setLoading(true);
        const { error } = await supabase.from('kaps_box_questions').insert({
            profile_id: profileId,
            sender_id: currentUserId, // Optional, still anonymized in output selects
            question: newQuestion.trim(),
        });

        if (error) Alert.alert('Error', error.message);
        else {
            Alert.alert('Success', 'Question sent anonymously!');
            setNewQuestion('');
            // Trigger Push Notification to Profile Owner
            sendPushNotification(profileId, "📮 Inbox", "¡Tienes una nueva pregunta anónima!", { screen: 'Inbox', params: { profileId: profileId } });
        }
        setLoading(false);
    };

    const handleSaveAnswer = async () => {
        if (!newAnswer.trim() || !answeringQuestion) return;
        const { error } = await supabase.from('kaps_box_questions')
            .update({ answer: newAnswer.trim(), answered_at: new Date().toISOString() })
            .eq('id', answeringQuestion.id);

        if (error) Alert.alert('Error', error.message);
        else {
            setQuestions(prev => prev.map(q => q.id === answeringQuestion.id ? { ...q, answer: newAnswer.trim() } : q));
            setAnsweringQuestion(null);
            setNewAnswer('');
        }
    };

    const handleToggleReveal = async (qId: string, currentState: boolean) => {
        const { error } = await supabase.from('kaps_box_questions')
            .update({ is_revealed: !currentState })
            .eq('id', qId);
        
        if (error) Alert.alert('Error', error.message);
        else setQuestions(prev => prev.map(q => q.id === qId ? { ...q, is_revealed: !currentState } : q));
    };

    const handleArchiveAll = async () => {
        const { error } = await supabase.from('kaps_box_questions')
            .update({ is_archived: true })
            .eq('profile_id', profileId)
            .eq('is_archived', false);
        
        if (error) Alert.alert('Error', error.message);
        else {
            setQuestions([]);
            Alert.alert('Cycle Reset', 'All previous questions have been archived for the new cycle!');
        }
    };

    const renderItem = ({ item }: { item: any }) => (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <Ionicons name="help-circle" size={18} color={Colors.primary} />
                <Text style={styles.anonymousBadge}>Anonymous Question</Text>
                {isOwner && (
                    <View style={[styles.statusBadge, { backgroundColor: item.is_revealed ? Colors.success + '20' : '#ffa50220' }]}>
                        <Text style={[styles.statusText, { color: item.is_revealed ? Colors.success : '#ffa502' }]}>
                            {item.is_revealed ? 'Revealed' : 'Hidden'}
                        </Text>
                    </View>
                )}
            </View>
            <Text style={styles.questionText}>{item.question}</Text>
            
            {item.answer ? (
                <View style={styles.answerSection}>
                    <Text style={styles.answerLabel}>Response:</Text>
                    <Text style={styles.answerText}>{item.answer}</Text>
                </View>
            ) : isOwner && (
                <TouchableOpacity style={styles.answerBtn} onPress={() => { setAnsweringQuestion(item); setNewAnswer(''); }}>
                    <Ionicons name="chatbubble-ellipses" size={16} color="#fff" />
                    <Text style={styles.answerBtnText}>Answer</Text>
                </TouchableOpacity>
            )}

            {isOwner && (
                <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.actionMiniBtn} onPress={() => handleToggleReveal(item.id, item.is_revealed)}>
                        <Ionicons name={item.is_revealed ? "eye-off" : "eye"} size={14} color={Colors.textSecondary} />
                        <Text style={styles.actionMiniText}>{item.is_revealed ? 'Hide' : 'Reveal'}</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );

    return (
        <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === 'ios' ? 10 : 20) }]}>
            <StatusBar barStyle="dark-content" />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>📮 Inbox</Text>
                {isOwner && !isMonday && (
                    <TouchableOpacity style={styles.archiveBtn} onPress={handleArchiveAll}>
                        <Ionicons name="archive" size={16} color={'#ff4757'} />
                        <Text style={styles.archiveBtnText}>Archive All</Text>
                    </TouchableOpacity>
                )}
            </View>

            {loading ? (
                <View style={styles.centered}><ActivityIndicator color={Colors.primary} /></View>
            ) : (
                <FlatList
                    data={questions}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={styles.list}
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <Ionicons name={isOwner ? "mail" : "help-buoy"} size={48} color={Colors.textMuted} />
                            <Text style={styles.emptyTitle}>{isOwner ? 'No questions yet!' : (isMonday ? 'No answers revealed today.' : 'Ask me anything below!')}</Text>
                        </View>
                    }
                    ListHeaderComponent={
                        !isOwner && !isMonday ? (
                            <View style={styles.askSection}>
                                <Text style={styles.askTitle}>Ask an anonymous question 🤫</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Type your question..."
                                    value={newQuestion}
                                    onChangeText={setNewQuestion}
                                    multiline
                                    maxLength={200}
                                    placeholderTextColor={Colors.textMuted}
                                />
                                <TouchableOpacity style={styles.sendBtn} onPress={handleSendQuestion} disabled={!newQuestion.trim()}>
                                    <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.sendGradient}>
                                        <Text style={styles.sendText}>Send Anonymously</Text>
                                    </LinearGradient>
                                </TouchableOpacity>
                            </View>
                        ) : null
                    }
                />
            )}

            {/* Answer Modal */}
            <Modal visible={!!answeringQuestion} transparent animationType="slide">
                <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Answering Question</Text>
                        <Text style={styles.modalQuestion}>{answeringQuestion?.question}</Text>
                        <TextInput
                            style={styles.modalInput}
                            placeholder="Type your response..."
                            value={newAnswer}
                            onChangeText={setNewAnswer}
                            multiline
                            placeholderTextColor={Colors.textMuted}
                        />
                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.modalCancel} onPress={() => setAnsweringQuestion(null)}>
                                <Text style={styles.modalCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.modalSave} onPress={handleSaveAnswer}>
                                <Text style={styles.modalSaveText}>Save Answer</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: Colors.border },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 18, fontFamily: Fonts.bold, color: Colors.textPrimary },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    list: { padding: Spacing.md, paddingBottom: 100 },
    emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
    emptyTitle: { fontSize: 15, fontFamily: Fonts.medium, color: Colors.textMuted },
    card: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border, ...Shadow.card },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    anonymousBadge: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.textSecondary, flex: 1 },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
    statusText: { fontSize: 10, fontFamily: Fonts.bold },
    questionText: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.textPrimary },
    answerSection: { marginTop: 12, padding: 12, backgroundColor: Colors.cardAlt, borderRadius: 8, borderWidth: 1, borderColor: Colors.border },
    answerLabel: { fontSize: 11, fontFamily: Fonts.bold, color: Colors.primary, marginBottom: 4 },
    answerText: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textPrimary },
    answerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, marginTop: 12, alignSelf: 'flex-start' },
    answerBtnText: { color: '#fff', fontSize: 12, fontFamily: Fonts.bold },
    actionRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10, gap: 12 },
    actionMiniBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
    actionMiniText: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.textSecondary },
    archiveBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#ff4757' + '10' },
    archiveBtnText: { color: '#ff4757', fontSize: 12, fontFamily: Fonts.medium },
    
    askSection: { marginBottom: 20, padding: Spacing.md, backgroundColor: Colors.primary + '08', borderRadius: 16, borderWidth: 1, borderColor: Colors.primary + '15' },
    askTitle: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.primary, marginBottom: 12 },
    input: { minHeight: 80, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 12, fontSize: 14, color: Colors.textPrimary, textAlignVertical: 'top' },
    sendBtn: { marginTop: 12, borderRadius: 24, overflow: 'hidden' },
    sendGradient: { paddingVertical: 12, alignItems: 'center' },
    sendText: { color: '#fff', fontSize: 14, fontFamily: Fonts.bold },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.md, paddingBottom: 50 },
    modalTitle: { fontSize: 16, fontFamily: Fonts.bold, color: Colors.textPrimary, marginBottom: 8 },
    modalQuestion: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textSecondary, marginBottom: 16, fontStyle: 'italic' },
    modalInput: { minHeight: 100, backgroundColor: Colors.background, borderRadius: 12, padding: 12, fontSize: 14, color: Colors.textPrimary, textAlignVertical: 'top', marginBottom: 20 },
    modalActions: { flexDirection: 'row', gap: 12 },
    modalCancel: { flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 12, backgroundColor: Colors.cardAlt },
    modalCancelText: { color: Colors.textSecondary, fontFamily: Fonts.bold },
    modalSave: { flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 12, backgroundColor: Colors.primary },
    modalSaveText: { color: '#fff', fontFamily: Fonts.bold }
});
