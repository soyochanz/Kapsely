import React, { useState, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    TextInput, Image, StatusBar, KeyboardAvoidingView, Platform,
    Animated, Pressable, FlatList, Dimensions, Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Fonts, Spacing, BorderRadius, Shadow } from '../theme';
import ChatRow from '../components/ChatRow';
import { MOCK_CONVERSATIONS, MOCK_CHAT_MESSAGES } from '../data/mockChats';

const { width } = Dimensions.get('window');

type ChatView = 'list' | 'detail';

// ─── Emoji panel ──────────────────────────────────────────────────────────────
const EMOJI_ROWS = [
    ['😀', '😂', '🥰', '😍', '🤩', '😎', '🥺', '😭'],
    ['🔥', '✨', '💫', '⚡', '🎉', '🎊', '💥', '🌟'],
    ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍'],
    ['👍', '👏', '🙌', '🤝', '💪', '🫶', '🤗', '😘'],
    ['⏳', '📦', '🔒', '🗓️', '💌', '🎁', '🌙', '🌸'],
];

function EmojiPanel({ onSelect, visible }: { onSelect: (e: string) => void; visible: boolean }) {
    const slideAnim = useRef(new Animated.Value(0)).current;

    React.useEffect(() => {
        Animated.spring(slideAnim, {
            toValue: visible ? 1 : 0,
            tension: 60, friction: 12, useNativeDriver: true,
        }).start();
    }, [visible]);

    if (!visible) return null;

    return (
        <Animated.View style={[
            ep.panel,
            { opacity: slideAnim, transform: [{ translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }
        ]}>
            {EMOJI_ROWS.map((row, i) => (
                <View key={i} style={ep.row}>
                    {row.map(em => (
                        <TouchableOpacity key={em} onPress={() => onSelect(em)} style={ep.emojiBtn} activeOpacity={0.6}>
                            <Text style={ep.emoji}>{em}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            ))}
        </Animated.View>
    );
}

const ep = StyleSheet.create({
    panel: {
        backgroundColor: Colors.surface,
        borderTopWidth: 1, borderTopColor: Colors.border,
        paddingHorizontal: 12, paddingVertical: 10, gap: 4,
    },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    emojiBtn: {
        width: (width - 48) / 8,
        height: (width - 48) / 8,
        alignItems: 'center', justifyContent: 'center',
        borderRadius: 10,
    },
    emoji: { fontSize: 24 },
});

// ─── Media attachment bar ─────────────────────────────────────────────────────
function AttachBar({ onCamera, onGallery, onCapsule, visible }: {
    onCamera: () => void; onGallery: () => void; onCapsule: () => void; visible: boolean;
}) {
    if (!visible) return null;
    const items = [
        { icon: 'camera' as const, label: 'Camera', color: '#0EA5E9', onPress: onCamera },
        { icon: 'images' as const, label: 'Gallery', color: '#8B5CF6', onPress: onGallery },
        { icon: 'lock-closed' as const, label: 'Capsule', color: Colors.primary, onPress: onCapsule },
    ];
    return (
        <View style={ab.bar}>
            {items.map(item => (
                <TouchableOpacity key={item.label} style={ab.item} onPress={item.onPress} activeOpacity={0.75}>
                    <View style={[ab.iconWrap, { backgroundColor: item.color + '18' }]}>
                        <Ionicons name={item.icon} size={22} color={item.color} />
                    </View>
                    <Text style={ab.label}>{item.label}</Text>
                </TouchableOpacity>
            ))}
        </View>
    );
}

const ab = StyleSheet.create({
    bar: {
        flexDirection: 'row',
        backgroundColor: Colors.surface,
        borderTopWidth: 1, borderTopColor: Colors.border,
        paddingHorizontal: 20, paddingVertical: 14, gap: 0,
    },
    item: { flex: 1, alignItems: 'center', gap: 6 },
    iconWrap: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    label: { fontSize: 11, fontFamily: Fonts.medium, color: Colors.textSecondary },
});

// ─── Message bubble ───────────────────────────────────────────────────────────
function Bubble({ msg, prevMsg, convUser }: { msg: any; prevMsg?: any; convUser: any }) {
    const isOwn = msg.isOwn;
    // Show avatar only for first in a run from the same sender
    const showAvatar = !isOwn && (!prevMsg || prevMsg.isOwn !== msg.isOwn || prevMsg.type !== msg.type);
    // Show timestamp if first message or >5 min gap
    const showTime = !prevMsg || (new Date(msg.timestamp || Date.now()).getTime() - new Date(prevMsg.timestamp || 0).getTime()) > 300000;

    const formatTime = (ts?: string) => {
        if (!ts) return '';
        const d = new Date(ts);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatDate = (ts?: string) => {
        if (!ts) return 'Today';
        const d = new Date(ts);
        const today = new Date();
        if (d.toDateString() === today.toDateString()) return 'Today';
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
        return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    };

    return (
        <View>
            {/* Date divider */}
            {showTime && (
                <View style={bs.timeDivider}>
                    <View style={bs.timeDividerLine} />
                    <Text style={bs.timeDividerText}>
                        {formatDate(msg.timestamp)} · {formatTime(msg.timestamp)}
                    </Text>
                    <View style={bs.timeDividerLine} />
                </View>
            )}

            <View style={[bs.row, isOwn ? bs.rowOwn : bs.rowOther]}>
                {/* Avatar — other side only */}
                {!isOwn && (
                    <View style={bs.avatarSlot}>
                        {showAvatar ? (
                            <Image source={{ uri: convUser?.avatar }} style={bs.avatar} />
                        ) : (
                            <View style={bs.avatarSpacer} />
                        )}
                    </View>
                )}

                <View style={[bs.bubbleWrap, isOwn ? bs.bubbleWrapOwn : bs.bubbleWrapOther]}>
                    {msg.type === 'capsule_share' ? (
                        <View style={[bs.capsuleCard, isOwn && { borderColor: Colors.primary + '44' }]}>
                            <View style={[bs.capsuleIcon, { backgroundColor: Colors.instaCapLight }]}>
                                <Ionicons name="lock-closed" size={16} color={Colors.instaCap} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={bs.capsuleLabel}>Shared Capsule</Text>
                                <Text style={bs.capsuleTitle} numberOfLines={1}>{msg.capsuleTitle}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={13} color={Colors.textMuted} />
                        </View>
                    ) : msg.mediaUrl ? (
                        <View style={bs.mediaWrap}>
                            <Image source={{ uri: msg.mediaUrl }} style={bs.mediaImg} resizeMode="cover" />
                            {msg.text ? <Text style={[bs.bubbleText, isOwn ? bs.textOwn : bs.textOther, { marginTop: 6 }]}>{msg.text}</Text> : null}
                        </View>
                    ) : (
                        <>
                            {isOwn ? (
                                <LinearGradient
                                    colors={[Colors.primary, Colors.primaryDark]}
                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                                    style={[bs.bubble, bs.bubbleOwn]}
                                >
                                    <Text style={[bs.bubbleText, bs.textOwn]}>{msg.text}</Text>
                                </LinearGradient>
                            ) : (
                                <View style={[bs.bubble, bs.bubbleOther]}>
                                    <Text style={[bs.bubbleText, bs.textOther]}>{msg.text}</Text>
                                </View>
                            )}
                        </>
                    )}

                    {/* Read receipt for own messages */}
                    {isOwn && (
                        <Text style={bs.receipt}>✓✓</Text>
                    )}
                </View>

                {/* Own avatar */}
                {isOwn && (
                    <View style={bs.avatarSlotOwn}>
                        {showAvatar ? (
                            <Image source={{ uri: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop' }} style={bs.avatar} />
                        ) : (
                            <View style={bs.avatarSpacer} />
                        )}
                    </View>
                )}
            </View>
        </View>
    );
}

const bs = StyleSheet.create({
    timeDivider: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        marginVertical: 14, paddingHorizontal: 16,
    },
    timeDividerLine: { flex: 1, height: 1, backgroundColor: Colors.divider },
    timeDividerText: {
        fontSize: 10, fontFamily: Fonts.medium,
        color: Colors.textMuted, letterSpacing: 0.3,
    },
    row: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 2, paddingHorizontal: 12 },
    rowOwn: { justifyContent: 'flex-end' },
    rowOther: { justifyContent: 'flex-start' },

    avatarSlot: { width: 30, marginRight: 8, alignItems: 'center', justifyContent: 'flex-end' },
    avatarSlotOwn: { width: 30, marginLeft: 8, alignItems: 'center', justifyContent: 'flex-end' },
    avatar: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.border },
    avatarSpacer: { width: 28, height: 28 },

    bubbleWrap: { maxWidth: '75%' },
    bubbleWrapOwn: { alignItems: 'flex-end' },
    bubbleWrapOther: { alignItems: 'flex-start' },

    bubble: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
    bubbleOwn: { borderBottomRightRadius: 5 },
    bubbleOther: {
        backgroundColor: Colors.surface,
        borderBottomLeftRadius: 5,
        borderWidth: 1, borderColor: Colors.border,
        ...Platform.select({
            ios: { shadowColor: 'rgba(0,0,0,0.04)', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 1, shadowRadius: 4 },
            android: { elevation: 1 },
        }),
    },

    bubbleText: { fontSize: 14, fontFamily: Fonts.regular, lineHeight: 20 },
    textOwn: { color: '#fff' },
    textOther: { color: Colors.textPrimary },

    receipt: { fontSize: 10, color: Colors.primary, marginTop: 3, textAlign: 'right' },

    mediaWrap: {
        borderRadius: 18, overflow: 'hidden',
        borderWidth: 1, borderColor: Colors.border,
        padding: 4,
        backgroundColor: Colors.surface,
    },
    mediaImg: { width: 220, height: 160, borderRadius: 14 },

    capsuleCard: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: Colors.surface,
        borderRadius: 16, borderWidth: 1, borderColor: Colors.border,
        padding: 12, minWidth: 220,
    },
    capsuleIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    capsuleLabel: { fontSize: 10, fontFamily: Fonts.medium, color: Colors.textMuted },
    capsuleTitle: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.textPrimary, marginTop: 1 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ChatScreen() {
    const [view, setView] = useState<ChatView>('list');
    const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
    const [message, setMessage] = useState('');
    const [showEmoji, setShowEmoji] = useState(false);
    const [showAttach, setShowAttach] = useState(false);
    const [pendingMedia, setPendingMedia] = useState<string | null>(null);
    const [isKeyboardVisible, setKeyboardVisible] = useState(false);
    const [isRecordingAudio, setIsRecordingAudio] = useState(false);
    
    const insets = useSafeAreaInsets();
    const scrollRef = useRef<ScrollView>(null);

    React.useEffect(() => {
        const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
        const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
        return () => { showSub.remove(); hideSub.remove(); };
    }, []);

    const selectedConv = MOCK_CONVERSATIONS.find(c => c.id === selectedConvId);

    const handleEmojiSelect = (em: string) => setMessage(prev => prev + em);

    const handleCamera = async () => {
        setShowAttach(false);
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') return;
        const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 0.85 });
        if (!result.canceled && result.assets[0]) setPendingMedia(result.assets[0].uri);
    };

    const handleGallery = async () => {
        setShowAttach(false);
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') return;
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 0.85 });
        if (!result.canceled && result.assets[0]) setPendingMedia(result.assets[0].uri);
    };

    const handleSend = () => {
        // In real app: send message + media to backend
        setMessage('');
        setPendingMedia(null);
        setShowEmoji(false);
        setShowAttach(false);
    };

    const toggleEmoji = () => {
        setShowAttach(false);
        setShowEmoji(v => !v);
    };

    const toggleAttach = () => {
        setShowEmoji(false);
        setShowAttach(v => !v);
    };

    // ── DETAIL VIEW ───────────────────────────────────────────────────────────
    if (view === 'detail' && selectedConv) {
        return (
            <KeyboardAvoidingView 
                style={s.root} 
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
            >
                <StatusBar barStyle="dark-content" />

                {/* Header */}
                <View style={[s.detailHeader, { paddingTop: insets.top + 6 }]}>
                    <TouchableOpacity onPress={() => setView('list')} style={s.headerBtn} activeOpacity={0.7}>
                        <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
                    </TouchableOpacity>

                    <TouchableOpacity style={s.detailUser} activeOpacity={0.8}>
                        <View style={s.detailAvatarWrap}>
                            <Image source={{ uri: selectedConv.user.avatar }} style={s.detailAvatar} />
                            {selectedConv.user.isOnline && <View style={s.onlineDot} />}
                        </View>
                        <View>
                            <Text style={s.detailName}>{selectedConv.user.username}</Text>
                            <Text style={[s.detailStatus, { color: selectedConv.user.isOnline ? Colors.success : Colors.textMuted }]}>
                                {selectedConv.user.isOnline ? 'Active now' : 'Offline'}
                            </Text>
                        </View>
                    </TouchableOpacity>

                    <View style={s.headerActions}>
                        <TouchableOpacity style={s.headerBtn} activeOpacity={0.7}>
                            <Ionicons name="lock-closed-outline" size={19} color={Colors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity style={s.headerBtn} activeOpacity={0.7}>
                            <Ionicons name="ellipsis-horizontal" size={19} color={Colors.textSecondary} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Messages */}
                <ScrollView
                    ref={scrollRef}
                    style={s.messageScroll}
                    contentContainerStyle={[s.messageContent, { paddingBottom: 12 }]}
                    showsVerticalScrollIndicator={false}
                    onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
                    keyboardShouldPersistTaps="handled"
                >
                    {MOCK_CHAT_MESSAGES.map((msg, i) => (
                        <Bubble
                            key={msg.id}
                            msg={msg}
                            prevMsg={i > 0 ? MOCK_CHAT_MESSAGES[i - 1] : undefined}
                            convUser={selectedConv.user}
                        />
                    ))}
                </ScrollView>

                {/* Pending media preview */}
                {pendingMedia && (
                    <View style={s.mediaPreview}>
                        <Image source={{ uri: pendingMedia }} style={s.mediaPreviewImg} resizeMode="cover" />
                        <TouchableOpacity style={s.mediaPreviewRemove} onPress={() => setPendingMedia(null)}>
                            <Ionicons name="close" size={14} color="#fff" />
                        </TouchableOpacity>
                    </View>
                )}

                {/* Emoji panel */}
                <EmojiPanel onSelect={handleEmojiSelect} visible={showEmoji} />

                {/* Attach bar */}
                <AttachBar
                    onCamera={handleCamera}
                    onGallery={handleGallery}
                    onCapsule={() => setShowAttach(false)}
                    visible={showAttach}
                />

                {/* Input bar */}
                <View style={[s.inputBar, { paddingBottom: isKeyboardVisible ? 10 : Math.max(insets.bottom, 10) }]}>

                    {/* Attach */}
                    {!isRecordingAudio && (
                        <TouchableOpacity onPress={toggleAttach} style={s.inputIconBtn} activeOpacity={0.7}>
                            <Ionicons
                                name={showAttach ? 'close-circle' : 'add-circle'}
                                size={28}
                                color={showAttach ? Colors.textMuted : Colors.primary}
                            />
                        </TouchableOpacity>
                    )}

                    {/* Text input / Recording wrap */}
                    <View style={s.inputWrap}>
                        {isRecordingAudio ? (
                            <View style={s.recordingWrap}>
                                <Ionicons name="mic" size={18} color={Colors.error} />
                                <Text style={s.recordingText}>Recording local audio...</Text>
                            </View>
                        ) : (
                            <TextInput
                                style={s.textInput}
                                placeholder="Message..."
                                placeholderTextColor={Colors.textMuted}
                                value={message}
                                onChangeText={setMessage}
                                selectionColor={Colors.primary}
                                multiline
                                maxLength={1000}
                                onFocus={() => { setShowEmoji(false); setShowAttach(false); }}
                            />
                        )}
                        {!isRecordingAudio && (
                            <TouchableOpacity onPress={toggleEmoji} style={s.emojiToggle} activeOpacity={0.7}>
                                <Text style={{ fontSize: 20 }}>{showEmoji ? '⌨️' : '😊'}</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Send / Mic */}
                    {message.trim() || pendingMedia ? (
                        <TouchableOpacity
                            onPress={handleSend}
                            activeOpacity={0.85}
                            style={s.sendBtn}
                        >
                            <LinearGradient
                                colors={[Colors.primary, Colors.primaryDark]}
                                style={s.sendBtnGrad}
                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                            >
                                <Ionicons name="send" size={16} color="#fff" />
                            </LinearGradient>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            onLongPress={() => setIsRecordingAudio(true)}
                            onPressOut={() => { if (isRecordingAudio) { setIsRecordingAudio(false); handleSend(); } }}
                            delayLongPress={150}
                            style={s.sendBtn}
                            activeOpacity={0.8}
                        >
                            <LinearGradient
                                colors={isRecordingAudio ? [Colors.error, '#d32f2f'] : [Colors.primary, Colors.primaryDark]}
                                style={s.sendBtnGrad}
                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                            >
                                <Ionicons name={isRecordingAudio ? "stop" : "mic"} size={20} color="#fff" />
                            </LinearGradient>
                        </TouchableOpacity>
                    )}
                </View>
            </KeyboardAvoidingView>
        );
    }

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
                        onPress={() => { setSelectedConvId(conv.id); setView('detail'); }}
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