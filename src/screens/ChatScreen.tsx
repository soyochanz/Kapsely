import React, { useState, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    TextInput, Image, StatusBar, KeyboardAvoidingView, Platform,
    Animated, Pressable, FlatList, Dimensions, Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Fonts, Spacing, BorderRadius, Shadow } from '../theme';
import ChatRow from '../components/ChatRow';
import { MOCK_CONVERSATIONS, MOCK_CHAT_MESSAGES } from '../data/mockChats';

const { width } = Dimensions.get('window');



// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ChatScreen() {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation();

    // ── LIST VIEW ─────────────────────────────────────────────────────────────
    return (
        <View style={s.root}>
            <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

            <View style={{ paddingTop: insets.top + 8 }}>
                {/* Header */}
                <View style={s.listHeader}>
                    <Text style={s.listTitle}>Messages</Text>
                    <TouchableOpacity style={s.headerBtn} activeOpacity={0.7}>
                        <Ionicons name="create-outline" size={22} color={Colors.primary} />
                    </TouchableOpacity>
                </View>

                {/* Search */}
                <View style={s.searchBar}>
                    <Ionicons name="search" size={15} color={Colors.textMuted} />
                    <TextInput
                        style={s.searchInput}
                        placeholder="Search conversations..."
                        placeholderTextColor={Colors.textMuted}
                        selectionColor={Colors.primary}
                    />
                </View>
            </View>

            <ScrollView
                style={s.scroll}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 100 }}
            >
                {/* Shared capsules row */}
                <Text style={s.sectionLabel}>Shared Capsules</Text>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }}
                >
                    {MOCK_CONVERSATIONS.filter(c => c.isSharedCapsule).map(c => {
                        const colors: [string, string] = c.capsuleType === 'legacycap'
                            ? [Colors.legacyCap, '#b7860b']
                            : [Colors.instaCap, Colors.primaryDark];
                        return (
                            <TouchableOpacity key={c.id} style={s.capsuleStory} activeOpacity={0.8}>
                                <LinearGradient colors={colors} style={s.capsuleStoryRing}>
                                    <Image source={{ uri: c.user.avatar }} style={s.capsuleStoryAvatar} />
                                </LinearGradient>
                                <Text style={s.capsuleStoryName} numberOfLines={1}>{c.user.username.split(' ')[0]}</Text>
                                <View style={[s.capsuleStoryDot, {
                                    backgroundColor: c.capsuleType === 'legacycap' ? Colors.legacyCap : Colors.instaCap
                                }]} />
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>

                <View style={s.divider} />
                <Text style={s.sectionLabel}>All Conversations</Text>

                {MOCK_CONVERSATIONS.map(conv => (
                    <ChatRow
                        key={conv.id}
                        conversation={conv}
                        onPress={() => (navigation as any).navigate('ChatDetail', { conversationId: conv.id })}
                    />
                ))}
            </ScrollView>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.background },

    // ── List ──────────────────────────────────────────────────────────────────
    listHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingBottom: 12,
        backgroundColor: Colors.surface,
        borderBottomWidth: 1, borderBottomColor: Colors.border,
    },
    listTitle: { fontSize: 26, fontFamily: Fonts.bold, color: Colors.textPrimary, letterSpacing: -0.4 },
    searchBar: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        marginHorizontal: 16, marginVertical: 10,
        paddingHorizontal: 14, paddingVertical: 10,
        backgroundColor: Colors.cardAlt,
        borderRadius: 16, borderWidth: 1, borderColor: Colors.border,
    },
    searchInput: { flex: 1, fontSize: 14, fontFamily: Fonts.regular, color: Colors.textPrimary },

    scroll: { flex: 1 },
    sectionLabel: {
        fontSize: 10, fontFamily: Fonts.bold, color: Colors.textMuted,
        letterSpacing: 1.5, textTransform: 'uppercase',
        paddingHorizontal: 20, marginBottom: 10, marginTop: 16,
    },
    capsuleStory: { alignItems: 'center', gap: 5, width: 62 },
    capsuleStoryRing: { width: 60, height: 60, borderRadius: 30, padding: 2.5, alignItems: 'center', justifyContent: 'center' },
    capsuleStoryAvatar: { width: 53, height: 53, borderRadius: 26.5, borderWidth: 2, borderColor: Colors.surface },
    capsuleStoryName: { fontSize: 10, fontFamily: Fonts.medium, color: Colors.textSecondary, textAlign: 'center', maxWidth: 60 },
    capsuleStoryDot: { width: 6, height: 6, borderRadius: 3 },
    divider: { height: 1, backgroundColor: Colors.divider, marginHorizontal: 16, marginTop: 8 },

    // ── Detail header ──────────────────────────────────────────────────────────
    detailHeader: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 8, paddingBottom: 10,
        backgroundColor: Colors.surface,
        borderBottomWidth: 1, borderBottomColor: Colors.border,
        gap: 4,
    },
    headerBtn: {
        width: 38, height: 38, borderRadius: 19,
        alignItems: 'center', justifyContent: 'center',
    },
    headerActions: { flexDirection: 'row', gap: 0 },
    detailUser: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    detailAvatarWrap: { position: 'relative' },
    detailAvatar: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: Colors.border },
    onlineDot: {
        position: 'absolute', bottom: 0, right: 0,
        width: 10, height: 10, borderRadius: 5,
        backgroundColor: Colors.success,
        borderWidth: 2, borderColor: Colors.surface,
    },
    detailName: { fontSize: 15, fontFamily: Fonts.bold, color: Colors.textPrimary },
    detailStatus: { fontSize: 11, fontFamily: Fonts.regular, marginTop: 1 },

    // ── Messages ──────────────────────────────────────────────────────────────
    messageScroll: { flex: 1, backgroundColor: Colors.background },
    messageContent: { paddingTop: 8 },

    // ── Media preview ─────────────────────────────────────────────────────────
    mediaPreview: {
        marginHorizontal: 14, marginBottom: 6,
        width: 80, height: 80, borderRadius: 12,
        overflow: 'hidden', position: 'relative',
        borderWidth: 1, borderColor: Colors.border,
    },
    mediaPreviewImg: { width: '100%', height: '100%' },
    mediaPreviewRemove: {
        position: 'absolute', top: 4, right: 4,
        width: 20, height: 20, borderRadius: 10,
        backgroundColor: 'rgba(0,0,0,0.6)',
        alignItems: 'center', justifyContent: 'center',
    },

    // ── Input bar ─────────────────────────────────────────────────────────────
    inputBar: {
        flexDirection: 'row', alignItems: 'flex-end', gap: 8,
        paddingHorizontal: 12, paddingTop: 10,
        backgroundColor: Colors.surface,
        borderTopWidth: 1, borderTopColor: Colors.border,
    },
    inputIconBtn: { paddingBottom: 6 },
    inputWrap: {
        flex: 1, flexDirection: 'row', alignItems: 'flex-end',
        backgroundColor: Colors.cardAlt,
        borderRadius: 22, borderWidth: 1, borderColor: Colors.border,
        paddingHorizontal: 14, paddingVertical: 8, gap: 6,
        minHeight: 42,
    },
    textInput: {
        flex: 1, color: Colors.textPrimary, fontSize: 15,
        fontFamily: Fonts.regular, maxHeight: 100,
        paddingTop: 0, paddingBottom: 0,
    },
    emojiToggle: { paddingBottom: 2 },
    sendBtn: { paddingBottom: 4 },
    sendBtnDisabled: { opacity: 0.5 },
    sendBtnGrad: {
        width: 38, height: 38, borderRadius: 19,
        alignItems: 'center', justifyContent: 'center',
    },
    recordingWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
    recordingText: { color: Colors.error, fontSize: 13, fontFamily: Fonts.medium },
});