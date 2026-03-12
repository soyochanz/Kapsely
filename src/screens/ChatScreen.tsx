import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    TextInput, Image, StatusBar, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts, Spacing, BorderRadius, Shadow } from '../theme';
import ChatRow from '../components/ChatRow';
import { MOCK_CONVERSATIONS, MOCK_CHAT_MESSAGES } from '../data/mockChats';

type ChatView = 'list' | 'detail';

export default function ChatScreen() {
    const [view, setView] = useState<ChatView>('list');
    const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
    const [message, setMessage] = useState('');
    const insets = useSafeAreaInsets();

    const selectedConv = MOCK_CONVERSATIONS.find((c) => c.id === selectedConvId);

    if (view === 'detail' && selectedConv) {
        return (
            <View style={styles.container}>
                <StatusBar barStyle="dark-content" />
                <View style={[styles.detailHeader, { paddingTop: insets.top + 10 }]}>
                    <TouchableOpacity onPress={() => setView('list')} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
                    </TouchableOpacity>
                    <Image source={{ uri: selectedConv.user.avatar }} style={styles.detailAvatar} />
                    <View style={styles.detailHeaderInfo}>
                        <Text style={styles.detailUsername}>{selectedConv.user.username}</Text>
                        <Text style={[styles.detailStatus, { color: selectedConv.user.isOnline ? Colors.success : Colors.textMuted }]}>
                            {selectedConv.user.isOnline ? '● Online' : 'Offline'}
                        </Text>
                    </View>
                    <TouchableOpacity style={styles.detailAction}>
                        <Ionicons name="lock-closed-outline" size={18} color={Colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.detailAction}>
                        <Ionicons name="ellipsis-vertical" size={18} color={Colors.textSecondary} />
                    </TouchableOpacity>
                </View>

                <ScrollView
                    style={styles.messagesScroll}
                    contentContainerStyle={styles.messagesContent}
                    showsVerticalScrollIndicator={false}
                >
                    {MOCK_CHAT_MESSAGES.map((msg) => (
                        <View key={msg.id}>
                            {msg.type === 'capsule_share' ? (
                                <View style={[styles.capsuleShareMsg, msg.isOwn ? styles.ownAlign : styles.otherAlign]}>
                                    <View style={[styles.sharedCapsuleCard, { borderColor: Colors.instaCap + '33' }]}>
                                        <View style={[styles.sharedCapsuleIcon, { backgroundColor: Colors.instaCapLight }]}>
                                            <Ionicons name="lock-closed" size={18} color={Colors.instaCap} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.sharedCapsuleLabel}>Shared Capsule</Text>
                                            <Text style={styles.sharedCapsuleTitle} numberOfLines={1}>{msg.capsuleTitle}</Text>
                                        </View>
                                        <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
                                    </View>
                                </View>
                            ) : (
                                <View style={[styles.bubble, msg.isOwn ? styles.ownAlign : styles.otherAlign]}>
                                    {msg.isOwn ? (
                                        <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.ownBubbleGrad}>
                                            <Text style={styles.bubbleTextOwn}>{msg.text}</Text>
                                        </LinearGradient>
                                    ) : (
                                        <View style={styles.otherBubbleInner}>
                                            <Text style={styles.bubbleTextOther}>{msg.text}</Text>
                                        </View>
                                    )}
                                    <Text style={[styles.bubbleTime, msg.isOwn ? styles.bubbleTimeOwn : {}]}>{msg.time}</Text>
                                </View>
                            )}
                        </View>
                    ))}
                </ScrollView>

                <KeyboardAvoidingView 
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
                    <TouchableOpacity style={styles.inputAction}>
                        <Ionicons name="add-circle" size={26} color={Colors.primary} />
                    </TouchableOpacity>
                    <TextInput
                        style={styles.messageInput}
                        placeholder="Message..."
                        placeholderTextColor={Colors.textMuted}
                        value={message}
                        onChangeText={setMessage}
                        selectionColor={Colors.primary}
                    />
                    <TouchableOpacity style={styles.inputAction}>
                        <Ionicons name="lock-closed-outline" size={20} color={Colors.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity>
                        <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.sendBtnGrad}>
                            <Ionicons name="send" size={16} color="#fff" />
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
                </KeyboardAvoidingView>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
            <View style={{ paddingTop: insets.top + 10 }}>
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Messages</Text>
                    <TouchableOpacity style={styles.newChatBtn}>
                        <Ionicons name="create-outline" size={22} color={Colors.primary} />
                    </TouchableOpacity>
                </View>
                <View style={styles.searchContainer}>
                    <Ionicons name="search" size={16} color={Colors.textMuted} style={{ marginRight: 8 }} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search conversations..."
                        placeholderTextColor={Colors.textMuted}
                        selectionColor={Colors.primary}
                    />
                </View>
            </View>

            <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                <Text style={styles.sectionLabel}>Shared Capsules</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sharedCapsuleRow}>
                    {MOCK_CONVERSATIONS.filter((c) => c.isSharedCapsule).map((c) => {
                        const ringColors: [string, string] = c.capsuleType === 'legacycap'
                            ? [Colors.legacyCap, '#b7860b'] : [Colors.instaCap, Colors.primaryDark];
                        return (
                            <TouchableOpacity key={c.id} style={styles.sharedCapsuleItem}>
                                <LinearGradient colors={ringColors} style={styles.sharedCapsuleRing}>
                                    <Image source={{ uri: c.user.avatar }} style={styles.sharedCapsuleAvatar} />
                                </LinearGradient>
                                <Text style={styles.sharedCapsuleUser} numberOfLines={1}>{c.user.username.split(' ')[0]}</Text>
                                <View style={[styles.sharedCapsuleDot, { backgroundColor: c.capsuleType === 'legacycap' ? Colors.legacyCap : Colors.instaCap }]} />
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>

                <View style={styles.divider} />
                <Text style={styles.sectionLabel}>Conversations</Text>
                {MOCK_CONVERSATIONS.map((conv) => (
                    <ChatRow key={conv.id} conversation={conv} onPress={() => { setSelectedConvId(conv.id); setView('detail'); }} />
                ))}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
        backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
    },
    headerTitle: { color: Colors.textPrimary, fontSize: 22, fontFamily: Fonts.bold },
    newChatBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    searchContainer: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: Colors.cardAlt, borderRadius: BorderRadius.md,
        marginHorizontal: Spacing.md, marginVertical: Spacing.sm,
        paddingHorizontal: Spacing.md, paddingVertical: 10,
        borderWidth: 1, borderColor: Colors.border,
    },
    searchInput: { flex: 1, color: Colors.textPrimary, fontSize: 14, fontFamily: Fonts.regular },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 100 },
    sectionLabel: {
        color: Colors.textMuted, fontSize: 11, fontFamily: Fonts.semiBold,
        letterSpacing: 1.5, textTransform: 'uppercase',
        paddingHorizontal: Spacing.md, marginBottom: 8, marginTop: Spacing.md,
    },
    sharedCapsuleRow: { paddingHorizontal: Spacing.md, gap: Spacing.md },
    sharedCapsuleItem: { alignItems: 'center', gap: 4 },
    sharedCapsuleRing: { width: 60, height: 60, borderRadius: 30, padding: 2.5, alignItems: 'center', justifyContent: 'center' },
    sharedCapsuleAvatar: { width: 53, height: 53, borderRadius: 26.5, borderWidth: 2, borderColor: Colors.surface },
    sharedCapsuleUser: { color: Colors.textSecondary, fontSize: 10, fontFamily: Fonts.medium, maxWidth: 60, textAlign: 'center' },
    sharedCapsuleDot: { width: 6, height: 6, borderRadius: 3 },
    divider: { height: 1, backgroundColor: Colors.divider, marginHorizontal: Spacing.md, marginTop: Spacing.sm },
    // Detail view
    detailHeader: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: Spacing.md, paddingBottom: 12,
        backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing.sm,
    },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    detailAvatar: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: Colors.primary + '55' },
    detailHeaderInfo: { flex: 1 },
    detailUsername: { color: Colors.textPrimary, fontSize: 15, fontFamily: Fonts.semiBold },
    detailStatus: { fontSize: 11, fontFamily: Fonts.regular },
    detailAction: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    messagesScroll: { flex: 1 },
    messagesContent: { padding: Spacing.md, gap: 12 },
    bubble: { maxWidth: '80%' },
    ownAlign: { alignSelf: 'flex-end' },
    otherAlign: { alignSelf: 'flex-start' },
    ownBubbleGrad: { borderRadius: 18, borderBottomRightRadius: 4, padding: 12 },
    otherBubbleInner: {
        borderRadius: 18, borderBottomLeftRadius: 4,
        backgroundColor: Colors.surface, padding: 12,
        borderWidth: 1, borderColor: Colors.border, ...Shadow.subtle,
    },
    bubbleTextOwn: { color: '#fff', fontSize: 14, fontFamily: Fonts.regular },
    bubbleTextOther: { color: Colors.textPrimary, fontSize: 14, fontFamily: Fonts.regular },
    bubbleTime: { fontSize: 10, fontFamily: Fonts.regular, marginTop: 3, color: Colors.textMuted },
    bubbleTimeOwn: { textAlign: 'right' },
    capsuleShareMsg: { maxWidth: '80%' },
    sharedCapsuleCard: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
        borderWidth: 1, padding: Spacing.sm, ...Shadow.subtle,
    },
    sharedCapsuleIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    sharedCapsuleLabel: { color: Colors.textMuted, fontSize: 10, fontFamily: Fonts.medium },
    sharedCapsuleTitle: { color: Colors.textPrimary, fontSize: 13, fontFamily: Fonts.semiBold },
    inputBar: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: Spacing.md, paddingVertical: 10,
        borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.surface,
    },
    inputAction: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    messageInput: {
        flex: 1, backgroundColor: Colors.cardAlt, borderWidth: 1, borderColor: Colors.border,
        borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md, paddingVertical: 10,
        color: Colors.textPrimary, fontSize: 14, fontFamily: Fonts.regular,
    },
    sendBtnGrad: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
