import React, { useState, useEffect, useRef } from 'react';
import { 
    View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal, Alert,
    KeyboardAvoidingView, Platform, StatusBar, ActivityIndicator, Image, Keyboard, ScrollView
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Fonts, Spacing, BorderRadius } from '../theme';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sendPushNotification } from '../utils/pushNotifications';
import * as ImagePicker from 'expo-image-picker';
import { Audio, Video } from 'expo-av';

const AudioMessageBubble = ({ uri, isMe }: { uri: string, isMe: boolean }) => {
    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [position, setPosition] = useState(0);
    const [rate, setRate] = useState(1);

    useEffect(() => {
        return () => { if (sound) { sound.stopAsync(); sound.unloadAsync(); } };
    }, [sound]);

    const playAudio = async () => {
        if (sound) {
            if (isPlaying) { await sound.pauseAsync(); setIsPlaying(false); }
            else { await sound.playAsync(); setIsPlaying(true); }
            return;
        }
        try {
            await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true, playThroughEarpieceAndroid: false });
            const { sound: newSound } = await Audio.Sound.createAsync(
                { uri },
                { shouldPlay: true, rate },
                (status: any) => {
                    if (status.isLoaded) {
                        setPosition(status.positionMillis || 0);
                        setDuration(status.durationMillis || 0);
                        setIsPlaying(status.isPlaying);
                        if (status.didJustFinish) { setIsPlaying(false); setPosition(0); }
                    }
                }
            );
            setSound(newSound);
            setIsPlaying(true);
        } catch (e) { console.error('Audio play error:', e); }
    };

    const toggleRate = async () => {
        const nextRate = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
        setRate(nextRate);
        if (sound) await sound.setRateAsync(nextRate, true);
    };

    const formatTime = (millis: number) => {
        const total = Math.floor(millis / 1000);
        const mins = Math.floor(total / 60);
        const secs = total % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 4, width: 210 }}>
             <TouchableOpacity onPress={playAudio} activeOpacity={0.8} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: isMe ? '#fff' : Colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={isPlaying ? "pause" : "play"} size={14} color={isMe ? Colors.primary : "#fff"} />
             </TouchableOpacity>
             <View style={{ flex: 1, height: 4, backgroundColor: isMe ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.1)', borderRadius: 2 }}>
                  <View style={{ width: `${(position / (duration || 1)) * 100}%`, height: '100%', backgroundColor: isMe ? '#fff' : Colors.primary, borderRadius: 2 }} />
             </View>
             <Text style={{ color: isMe ? '#fff' : Colors.textPrimary, fontSize: 11, minWidth: 28 }}>{formatTime(position || duration)}</Text>
             <TouchableOpacity onPress={toggleRate} style={{ paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, backgroundColor: isMe ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.05)' }}>
                  <Text style={{ fontSize: 10, color: isMe ? '#fff' : Colors.textPrimary, fontFamily: Fonts.bold }}>{rate}x</Text>
             </TouchableOpacity>
        </View>
    );
};

export default function ChatDetailScreen() {
    const [loading, setLoading] = useState(true);
    const [messages, setMessages] = useState<any[]>([]);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const PAGE_SIZE = 30;
    const [newMessage, setNewMessage] = useState('');
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [otherUser, setOtherUser] = useState<any>(null);
    const insets = useSafeAreaInsets();
    const navigation = useNavigation();
    const route = useRoute<any>();
    const { conversationId } = route.params;
    const [isKeyboardVisible, setKeyboardVisible] = useState(false);
    const [isRecordingAudio, setIsRecordingAudio] = useState(false);
    const [myUserProfile, setMyUserProfile] = useState<any>(null);
    const [pendingMedia, setPendingMedia] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [recording, setRecording] = useState<Audio.Recording | null>(null);
    const [viewerVisible, setViewerVisible] = useState(false);
    const [viewerUrl, setViewerUrl] = useState('');
    const [conversation, setConversation] = useState<any>(null);
    const [groupSettingsVisible, setGroupSettingsVisible] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [groupParticipants, setGroupParticipants] = useState<any[]>([]);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const recordingInterval = useRef<any>(null);
    const isCancelled = useRef(false);
    const [replyingTo, setReplyingTo] = useState<any>(null);
    const currentUserIdRef = useRef<string | null>(null);
    const deletedIdsRef = useRef<string[]>([]);
    const latestMessageAtRef = useRef<string | null>(null);
    const isFocused = useIsFocused();

    useEffect(() => {
        const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
        const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
        return () => { showSub.remove(); hideSub.remove(); };
    }, []);

    const loadData = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;
        setCurrentUserId(user.id);
        currentUserIdRef.current = user.id;

        // Fetch my profile for avatar
        const { data: myProf } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
        if (myProf) setMyUserProfile(myProf);

        if (conversationId === 'new') {
            if (route.params.otherUser) {
                setOtherUser(route.params.otherUser);
            }
            setLoading(false);
            return;
        }

        // Fetch conversation metadata
        const { data: convData } = await supabase
            .from('conversations')
            .select('*')
            .eq('id', conversationId)
            .maybeSingle();

        if (convData) setConversation(convData);

        // Fetch participants (works for both private and group chats)
        const { data: allParts } = await supabase
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', conversationId)
            .neq('user_id', user.id);

        if (convData?.is_group) {
            // For groups, load all other participant profiles
            if (allParts && allParts.length > 0) {
                const otherIds = allParts.map((p: any) => p.user_id);
                const { data: profs } = await supabase
                    .from('profiles')
                    .select('id, username, display_name, avatar_url')
                    .in('id', otherIds);
                if (profs) setGroupParticipants(profs);
            }
        } else {
            // For private chats, load the single other participant
            const partData = allParts?.[0];
            if (partData) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', partData.user_id)
                    .single();
                if (profile) setOtherUser(profile);
            }
        }

        const { data: msgs } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false })
            .limit(PAGE_SIZE);

        if (msgs) {
            const stored = await AsyncStorage.getItem(`deletedMsgs_${conversationId}`);
            const deletedIds = stored ? JSON.parse(stored) : [];
            deletedIdsRef.current = deletedIds;
            const filtered = msgs.filter((m: any) => !deletedIds.includes(m.id));
            setMessages(filtered);
            latestMessageAtRef.current = filtered.length > 0
                ? filtered.reduce((acc: string | null, curr: any) => {
                    if (!acc) return curr.created_at;
                    return new Date(curr.created_at).getTime() > new Date(acc).getTime() ? curr.created_at : acc;
                }, null)
                : null;
            if (msgs.length < PAGE_SIZE) setHasMore(false);
        }
        setLoading(false);

        // Mark chat as visited (used by ChatListScreen to determine unread status)
        const now = new Date();
        // Add a 5 second buffer to compensate for possible clock drift between client and DB
        now.setSeconds(now.getSeconds() + 5);
        await AsyncStorage.setItem(`chat_visited_${conversationId}`, now.toISOString());

        // Also mark received messages as read in DB (best effort)
        try {
            await Promise.all([
                supabase.rpc('mark_messages_read', { p_conversation_id: conversationId }),
                supabase
                    .from('notifications')
                    .update({ is_read: true })
                    .eq('conversation_id', conversationId)
                    .eq('user_id', user.id)
            ]);
        } catch (e) {
            console.warn('Could not mark messages as read:', e);
        }
    };

    const loadMoreMessages = async () => {
        if (!hasMore || loadingMore || conversationId === 'new') return;
        setLoadingMore(true);
        const nextPage = page + 1;
        
        try {
            const { data: msgs } = await supabase
                .from('messages')
                .select('*')
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: false })
                .range(nextPage * PAGE_SIZE, (nextPage + 1) * PAGE_SIZE - 1);

            if (msgs && msgs.length > 0) {
                const stored = await AsyncStorage.getItem(`deletedMsgs_${conversationId}`);
                const deletedIds = stored ? JSON.parse(stored) : [];
                setMessages(prev => {
                    const newMsgs = msgs.filter(m => !prev.some(p => p.id === m.id) && !deletedIds.includes(m.id));
                    return [...prev, ...newMsgs];
                });
                setPage(nextPage);
                if (msgs.length < PAGE_SIZE) setHasMore(false);
            } else {
                setHasMore(false);
            }
        } finally {
            setLoadingMore(false);
        }
    };

    useEffect(() => {
        loadData();
        if (!conversationId || conversationId === 'new') return;

        const setupRealtime = async () => {
            const storedDeletions = await AsyncStorage.getItem(`deletedMsgs_${conversationId}`);
            deletedIdsRef.current = storedDeletions ? JSON.parse(storedDeletions) : [];

            const sub = supabase
                .channel(`chat_detail_${conversationId}`)
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
                    (payload) => {
                        const newMsg = payload.new as any;
                        const oldMsg = payload.old as any;
                        const myId = currentUserIdRef.current;

                        if (payload.eventType === 'INSERT') {
                            if (newMsg.sender_id === myId) return;
                            if (deletedIdsRef.current.includes(newMsg.id)) return;

                            setMessages(prev => {
                                if (prev.some(m => m.id === newMsg.id)) return prev;
                                return [newMsg, ...prev];
                            });
                            if (!latestMessageAtRef.current || new Date(newMsg.created_at).getTime() > new Date(latestMessageAtRef.current).getTime()) {
                                latestMessageAtRef.current = newMsg.created_at;
                            }
                            supabase.rpc('mark_messages_read', { p_conversation_id: conversationId }).then();
                        } else if (payload.eventType === 'UPDATE') {
                            setMessages(prev => prev.map(m => m.id === newMsg.id ? { ...m, ...newMsg } : m));
                        } else if (payload.eventType === 'DELETE') {
                            setMessages(prev => prev.filter(m => m.id !== oldMsg.id));
                        }
                    }
                )
                .on(
                    'postgres_changes',
                    { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `id=eq.${conversationId}` },
                    (payload) => {
                        const updatedConv = payload.new as any;
                        setConversation((prev: any) => prev ? { ...prev, name: updatedConv.name } : updatedConv);
                    }
                )
                .subscribe();

            return sub;
        };

        let activeSub: any = null;
        setupRealtime().then(s => activeSub = s);

        return () => {
            const now = new Date();
            now.setSeconds(now.getSeconds() + 5);
            AsyncStorage.setItem(`chat_visited_${conversationId}`, now.toISOString());
            if (activeSub) supabase.removeChannel(activeSub);
        };
    }, [conversationId]);

    // Fallback polling: if realtime misses an event, keep the open chat in sync.
    useEffect(() => {
        if (!isFocused || !conversationId || conversationId === 'new') return;

        const pollLatest = async () => {
            const since = latestMessageAtRef.current;
            let q = supabase
                .from('messages')
                .select('*')
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: false })
                .limit(25);

            if (since) q = q.gt('created_at', since);

            const { data } = await q;
            if (!data?.length) return;

            const newMsgs = data.filter((m: any) => !deletedIdsRef.current.includes(m.id));
            if (!newMsgs.length) return;

            setMessages(prev => {
                const seen = new Set(prev.map(m => m.id));
                const merged = [...newMsgs.filter(m => !seen.has(m.id)), ...prev];
                return merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            });

            const newest = newMsgs[0]?.created_at;
            if (newest && (!latestMessageAtRef.current || new Date(newest).getTime() > new Date(latestMessageAtRef.current).getTime())) {
                latestMessageAtRef.current = newest;
            }
        };

        const timer = setInterval(pollLatest, 2500);
        pollLatest();
        return () => clearInterval(timer);
    }, [conversationId, isFocused]);

    const handleCamera = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') return;
        const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 0.85, videoMaxDuration: 600 });
        if (!result.canceled && result.assets[0]) {
            setPendingMedia(result.assets[0].uri);
            await sendMessage(
                '', 
                result.assets[0].uri, 
                result.assets[0].type === 'video' ? 'video' : 'image'
            );
        }
    };

    const handleGallery = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') return;
        try {
            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 0.85, videoMaxDuration: 600 });
            if (!result.canceled && result.assets[0]) {
                setPendingMedia(result.assets[0].uri);
                await sendMessage(
                    '', 
                    result.assets[0].uri, 
                    result.assets[0].type === 'video' ? 'video' : 'image'
                );
            }
        } catch (e) {
            console.error('Pick error:', e);
        }
    };

    const uploadFile = async (uri: string, type: string, userId: string) => {
        let ext = 'jpg';
        const lastDot = uri.lastIndexOf('.');
        if (lastDot !== -1 && lastDot > uri.lastIndexOf('/')) {
            ext = uri.substring(lastDot + 1).split('?')[0];
        } else {
            ext = type === 'video' ? 'mp4' : type === 'audio' ? 'm4a' : 'jpg';
        }

        const fileName = `${userId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
        const filePath = `chat/${fileName}`;

        const formData = new FormData();
        formData.append('file', {
            uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
            name: `file.${ext}`,
            type: type === 'audio' ? 'audio/x-m4a' : type === 'video' ? 'video/mp4' : 'image/jpeg'
        } as any);

        const { data, error } = await supabase.storage
            .from('capsule-media')
            .upload(filePath, formData, {
                contentType: 'multipart/form-data',
                upsert: true
            });

        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from('capsule-media').getPublicUrl(filePath);
        return publicUrl;
    };

    const startRecording = async () => {
        try {
            isCancelled.current = false;
            const permission = await Audio.requestPermissionsAsync();
            if (permission.status !== 'granted') return;
            await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, playThroughEarpieceAndroid: false });
            const { recording: rec } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
            setRecording(rec);
            setIsRecordingAudio(true);
            setRecordingDuration(0);
            recordingInterval.current = setInterval(() => {
                setRecordingDuration(prev => prev + 1);
            }, 1000);
        } catch (err) { console.error('Failed to start recording', err); }
    };

    const cancelRecording = async () => {
        isCancelled.current = true;
        setIsRecordingAudio(false);
        if (recordingInterval.current) clearInterval(recordingInterval.current);
        if (!recording) return;
        try {
            await recording.stopAndUnloadAsync();
            setRecording(null);
            setRecordingDuration(0);
        } catch (err) { console.error('Failed to cancel recording', err); }
    };

    const stopRecording = async () => {
        if (isCancelled.current) {
            isCancelled.current = false;
            return;
        }
        setIsRecordingAudio(false);
        if (recordingInterval.current) clearInterval(recordingInterval.current);
        if (!recording) return;
        try {
            await recording.stopAndUnloadAsync();
            const uri = recording.getURI();
            setRecording(null);
            setRecordingDuration(0);
            if (uri) sendMessage('', uri, 'audio');
        } catch (err) { console.error('Failed to stop recording', err); }
    };

    const sendMessage = async (overrideContent?: string, mediaUriOverride?: string, mediaTypeOverride?: string) => {
        const msg = overrideContent || newMessage.trim();
        const mediaToUpload = mediaUriOverride || pendingMedia;
        const mediaType = mediaTypeOverride || (pendingMedia ? 'image' : null);

        if (!msg && !mediaToUpload) return;
        const pendingMedia_temp = mediaToUpload;
        setNewMessage('');
        setPendingMedia(null);

        let activeConvId = conversationId;

        if (activeConvId === 'new') {
            const { data: newId, error: createError } = await supabase.rpc('get_or_create_conversation', {
                user_a: currentUserId,
                user_b: otherUser?.id
            });
            if (createError || !newId) {
                console.error('Failed to create chat:', createError);
                return;
            }
            activeConvId = newId;
            (navigation as any).setParams({ conversationId: newId });
        }

        // Optimistic local add
        const tempId = `temp_${Date.now()}`;
        const tempMsg = {
            id: tempId,
            conversation_id: activeConvId,
            sender_id: currentUserId,
            content: msg,
            mediaUrl: pendingMedia_temp,
            media_url: mediaToUpload ? 'local://' : null,
            created_at: new Date().toISOString(),
            is_read: false,
        };
        setMessages(prev => [tempMsg, ...prev]);
        setIsUploading(true);

        try {
            let uploadedMediaUrl = null;
            if (mediaToUpload) {
                uploadedMediaUrl = await uploadFile(mediaToUpload, mediaType || 'image', currentUserId!);
            }

            const { data, error } = await supabase.from('messages').insert({
                conversation_id: activeConvId,
                sender_id: currentUserId,
                content: msg,
                media_url: uploadedMediaUrl,
                media_type: mediaType,
                replying_to_id: replyingTo ? replyingTo.id : null
            }).select().single();

            setReplyingTo(null); // Clear reply on send

            if (data) {
                setMessages(prev => prev.map(m => m.id === tempId ? { ...data, mediaUrl: pendingMedia_temp } : m));
                try {
                    await supabase.from('conversations').update({ last_message_at: new Date() }).eq('id', activeConvId);
                    if (otherUser?.id) {
                        sendPushNotification(otherUser.id, `💬 Mensaje nuevo`, msg, { screen: 'ChatDetail', params: { conversationId: activeConvId } });
                    }
                } catch (e) { console.warn('Could not update last_message_at:', e); }
            } else {
                setMessages(prev => prev.filter(m => m.id !== tempId));
                if (error) console.warn('Send error:', error.message);
            }
        } catch (uploadError) {
            console.error('Upload or Insert failed:', uploadError);
            setMessages(prev => prev.filter(m => m.id !== tempId));
        } finally {
            setIsUploading(false);
        }
    };

    const renameGroup = async () => {
        if (!newGroupName.trim()) return;
        try {
            const { error } = await supabase
                .from('conversations')
                .update({ name: newGroupName.trim().substring(0, 100) })
                .eq('id', conversationId);
            if (!error) {
                setConversation((prev: any) => ({ ...prev, name: newGroupName.trim() }));
                setGroupSettingsVisible(false);
            } else {
                Alert.alert('Error', 'No se pudo renombrar el grupo');
            }
        } catch (e) {}
    };

    const leaveGroup = async () => {
        Alert.alert('Abandonar Grupo', '¿Estás seguro que deseas abandonar este grupo?', [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Abandonar', style: 'destructive', onPress: async () => {
                    try {
                        await supabase
                            .from('conversation_participants')
                            .delete()
                            .eq('conversation_id', conversationId)
                            .eq('user_id', currentUserId);
                        navigation.goBack();
                    } catch (e) {
                        Alert.alert('Error', 'No se pudo abandonar el grupo.');
                    }
                }
            }
        ]);
    };

    const changeGroupAvatar = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') return;
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, allowsEditing: true, aspect: [1, 1] });
        if (result.canceled || !result.assets[0]) return;
        try {
            const uri = result.assets[0].uri;
            const ext = uri.split('.').pop() || 'jpg';
            const filePath = `group_avatars/${conversationId}.${ext}`;
            const formData = new FormData();
            formData.append('file', { uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''), name: `avatar.${ext}`, type: 'image/jpeg' } as any);
            const { error: upErr } = await supabase.storage.from('capsule-media').upload(filePath, formData, { contentType: 'multipart/form-data', upsert: true });
            if (upErr) throw upErr;
            const { data: { publicUrl } } = supabase.storage.from('capsule-media').getPublicUrl(filePath);
            await supabase.from('conversations').update({ avatar_url: publicUrl }).eq('id', conversationId);
            setConversation((prev: any) => ({ ...prev, avatar_url: publicUrl }));
        } catch (e) {
            Alert.alert('Error', 'No se pudo cambiar el avatar del grupo.');
        }
    };

    const deleteMessageForMe = async (msgId: string) => {
        setMessages(prev => prev.filter(m => m.id !== msgId));
        try {
            const stored = await AsyncStorage.getItem(`deletedMsgs_${conversationId}`);
            const list = stored ? JSON.parse(stored) : [];
            if (!list.includes(msgId)) {
                list.push(msgId);
                await AsyncStorage.setItem(`deletedMsgs_${conversationId}`, JSON.stringify(list));
                deletedIdsRef.current = list;
            }
            setMessages(prev => prev.filter(m => m.id !== msgId));
        } catch (e) {
            console.error('Delete for me error:', e);
        }
    };

    const deleteMessageEveryone = async (msgId: string) => {
        try {
            const { error } = await supabase.from('messages').update({ 
                is_deleted: true, 
                content: 'Este mensaje fue eliminado',
                media_url: null,
                media_type: 'text'
            }).eq('id', msgId);
            
            if (error) throw error;
            setMessages(prev => prev.map(m => m.id === msgId ? { ...m, is_deleted: true, content: 'Este mensaje fue eliminado', media_url: null, media_type: 'text' } : m));
        } catch (e) {
            console.error('Delete everyone error:', e);
            Alert.alert('Error', 'No se pudo eliminar el mensaje para todos.');
        }
    };

    const handleLongPressMessage = (item: any) => {
        const isMe = item.sender_id === currentUserId;
        if (item.is_deleted) return;

        Alert.alert('Opciones de Mensaje', '¿Qué deseas hacer?', [
            { text: 'Responder 💬', onPress: () => setReplyingTo(item) },
            { 
                text: 'Eliminar 🗑️', 
                style: 'destructive', 
                onPress: () => {
                    if (isMe) {
                        Alert.alert('Eliminar', '¿Eliminar para quién?', [
                            { text: 'Para todos', style: 'destructive', onPress: () => deleteMessageEveryone(item.id) },
                            { text: 'Para mí', style: 'destructive', onPress: () => deleteMessageForMe(item.id) },
                            { text: 'Cancelar', style: 'cancel' }
                        ]);
                    } else {
                        deleteMessageForMe(item.id);
                    }
                } 
            },
            { text: 'Cancelar', style: 'cancel' }
        ]);
    };

    const formatMessageTime = (dateStr: string) => {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            const now = new Date();
            const isToday = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');
            const timeStr = `${hours}:${minutes}`;
            return isToday ? timeStr : `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')} ${timeStr}`;
        } catch (e) { return ''; }
    };

    const renderMessage = ({ item, index }: any) => {
        const isMe = item.sender_id === currentUserId;
        const prevMsg = index < messages.length - 1 ? messages[index + 1] : null;
        const showAvatar = !prevMsg || prevMsg.sender_id !== item.sender_id;
        const repliedMsg = item.replying_to_id ? messages.find(m => m.id === item.replying_to_id) : null;
        const defaultAvatar = 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';

        return (
            <View style={[styles.msgWrapper, isMe ? styles.myMsg : styles.theirMsg]}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
                    {!isMe && (
                        <View style={styles.bubbleAvatarSlot}>
                            {showAvatar ? (
                                <Image source={{ uri: otherUser?.avatar_url || defaultAvatar }} style={styles.bubbleAvatar} />
                            ) : (
                                <View style={styles.bubbleAvatarSpacer} />
                            )}
                        </View>
                    )}

                    <TouchableOpacity 
                        activeOpacity={0.9} 
                        style={[styles.bubble, isMe ? styles.myBubble : styles.theirBubble, item.is_deleted && { backgroundColor: Colors.cardAlt, borderWidth: 1, borderColor: Colors.border }]}
                        onLongPress={() => handleLongPressMessage(item)}
                    >
                        {item.is_deleted ? (
                            <Text style={[styles.msgText, { fontStyle: 'italic', color: Colors.textMuted }]}>Este mensaje fue eliminado</Text>
                        ) : (
                            <>
                                {repliedMsg && (
                                    <View style={{ backgroundColor: isMe ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.05)', padding: 8, borderRadius: 8, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: isMe ? '#fff' : Colors.primary }}>
                                        <Text style={{ fontSize: 11, fontFamily: Fonts.bold, color: isMe ? '#fff' : Colors.primary }}>{repliedMsg.sender_id === currentUserId ? 'Tú' : (otherUser?.display_name || 'User')}</Text>
                                        <Text style={{ fontSize: 13, color: isMe ? 'rgba(255,255,255,0.9)' : Colors.textPrimary }} numberOfLines={2}>{repliedMsg.content}</Text>
                                    </View>
                                )}
                                
                                {(item.mediaUrl || (item.media_type === 'image' && item.media_url)) && (
                                    <TouchableOpacity activeOpacity={0.9} onPress={() => { setViewerUrl(item.mediaUrl || item.media_url); setViewerVisible(true); }}>
                                        <Image source={{ uri: item.mediaUrl || item.media_url }} style={{ width: 180, height: 180, borderRadius: 12, marginBottom: 6 }} resizeMode="cover" />
                                    </TouchableOpacity>
                                )}
                                {item.media_type === 'video' && (item.mediaUrl || item.media_url) && (
                                    <View style={{ width: 180, height: 180, borderRadius: 12, marginBottom: 6, position: 'relative' }}>
                                        <Video 
                                            source={{ uri: item.mediaUrl || item.media_url }} 
                                            style={{ width: '100%', height: '100%', borderRadius: 12 }} 
                                            useNativeControls 
                                            isLooping 
                                            resizeMode={"cover" as any} 
                                        />
                                        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 12 }}>
                                            <Ionicons name="play" size={38} color="#fff" style={{ opacity: 0.9, backgroundColor: 'rgba(0,0,0,0.4)', padding: 10, borderRadius: 30 }} />
                                        </View>
                                    </View>
                                )}
                                {item.media_type === 'audio' && (item.mediaUrl || item.media_url) && (
                                    <AudioMessageBubble uri={item.mediaUrl || item.media_url} isMe={isMe} />
                                )}
                                {(!item.media_type || item.media_type === 'text' || item.content?.trim()) && (
                                    <Text style={[styles.msgText, isMe && styles.myMsgText]}>{item.content}</Text>
                                )}
                            </>
                        )}
                        <Text style={[styles.msgTime, isMe && styles.myMsgTime, item.is_deleted && { color: Colors.textMuted }]}>{formatMessageTime(item.created_at)}</Text>
                    </TouchableOpacity>

                    {isMe && (
                        <View style={styles.bubbleAvatarSlotOwn}>
                            {showAvatar ? (
                                <Image source={{ uri: myUserProfile?.avatar_url || defaultAvatar }} style={styles.bubbleAvatar} />
                            ) : (
                                <View style={styles.bubbleAvatarSpacer} />
                            )}
                        </View>
                    )}
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
                <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
                </TouchableOpacity>
                <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                        if (conversation?.is_group) {
                            setNewGroupName(conversation.name || '');
                            setGroupSettingsVisible(true);
                        } else if (otherUser) {
                            (navigation as any).navigate('UserProfile', { targetUserId: otherUser.id });
                        }
                    }}
                    style={styles.headerUserInfo}
                >
                    {conversation?.is_group ? (
                        conversation?.avatar_url ? (
                            <Image source={{ uri: conversation.avatar_url }} style={styles.headerAvatar} />
                        ) : (
                            <View style={[styles.headerAvatar, { backgroundColor: Colors.cardAlt, alignItems: 'center', justifyContent: 'center' }]}>
                                <Ionicons name="people" size={16} color={Colors.textPrimary} />
                            </View>
                        )
                    ) : (
                        <Image source={{ uri: otherUser?.avatar_url || 'https://via.placeholder.com/150' }} style={styles.headerAvatar} />
                    )}
                    <View>
                        <Text style={styles.headerTitle}>{conversation?.is_group ? (conversation.name || 'Chat Grupal') : (otherUser?.display_name || otherUser?.username || 'Mensajes')}</Text>
                        {conversation?.is_group && <Text style={{ fontSize: 11, color: Colors.textSecondary, fontFamily: Fonts.regular }}>{groupParticipants.length + 1} participantes · Toca para editar</Text>}
                    </View>
                </TouchableOpacity>
                <View style={{ width: 40 }} />
            </View>

            <KeyboardAvoidingView 
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            >
                {/* Replying indicator */}
                {replyingTo && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.cardAlt, padding: 10, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                        <View style={{ flex: 1, borderLeftWidth: 4, borderLeftColor: Colors.primary, paddingLeft: 10 }}>
                            <Text style={{ fontSize: 12, fontFamily: Fonts.bold, color: Colors.primary }}>Respondiendo a @{replyingTo.sender_id === currentUserId ? 'mí' : (otherUser?.display_name || 'User')}</Text>
                            <Text style={{ fontSize: 13, color: Colors.textPrimary }} numberOfLines={1}>{replyingTo.content}</Text>
                        </View>
                        <TouchableOpacity onPress={() => setReplyingTo(null)}>
                            <Ionicons name="close-circle" size={22} color={Colors.textSecondary} />
                        </TouchableOpacity>
                    </View>
                )}

                {loading ? (
                    <View style={styles.centered}><ActivityIndicator color={Colors.primary} /></View>
                ) : (
                    <FlatList
                        data={messages}
                        keyExtractor={(item) => item.id}
                        renderItem={renderMessage}
                        contentContainerStyle={styles.list}
                        showsVerticalScrollIndicator={false}
                        removeClippedSubviews={false}
                        inverted
                        onEndReached={loadMoreMessages}
                        onEndReachedThreshold={0.5}
                        ListFooterComponent={loadingMore ? <ActivityIndicator color={Colors.primary} style={{ marginVertical: 10 }} /> : null}
                    />
                )}

                <View style={[styles.inputRow, { paddingBottom: isKeyboardVisible ? 6 : Math.max(insets.bottom || 16, Spacing.md), alignItems: 'center' }]}>
                    {!isRecordingAudio && (
                        <TouchableOpacity style={{ marginRight: 8, padding: 4 }} activeOpacity={0.7} onPress={handleGallery}>
                            <Ionicons name="image-outline" size={22} color={Colors.textSecondary} />
                        </TouchableOpacity>
                    )}
                    {!isRecordingAudio && (
                        <TouchableOpacity style={{ marginRight: 12, padding: 4 }} activeOpacity={0.7} onPress={handleCamera}>
                            <Ionicons name="camera-outline" size={22} color={Colors.textSecondary} />
                        </TouchableOpacity>
                    )}

                    <View style={{ flex: 1 }}>
                        {isRecordingAudio ? (
                            <View style={styles.recordingWrap}>
                                <Ionicons name="mic" size={16} color={Colors.error} />
                                <Text style={styles.recordingText}>
                                    Grabando... {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                                </Text>
                                <Text style={{ fontSize: 11, color: Colors.textMuted, marginLeft: 'auto' }}>
                                    ← Desliza para cancelar
                                </Text>
                            </View>
                        ) : (
                            <TextInput
                                style={styles.input}
                                value={newMessage}
                                onChangeText={setNewMessage}
                                placeholder="Say something..."
                                placeholderTextColor={Colors.textMuted}
                                multiline
                            />
                        )}
                    </View>
                    
                    {newMessage.trim() ? (
                        <TouchableOpacity style={styles.sendBtn} activeOpacity={0.8} onPress={() => sendMessage()}>
                            <Ionicons name="send" size={17} color="#fff" />
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity 
                            style={[styles.sendBtn, isRecordingAudio && { backgroundColor: Colors.error }]} 
                            activeOpacity={0.8}
                            onLongPress={startRecording}
                            onPressOut={stopRecording}
                            {...({
                                onTouchMove: (e: any) => {
                                    if (isRecordingAudio && e.nativeEvent.locationX < -20) {
                                        cancelRecording();
                                    }
                                }
                            } as any)}
                        >
                            <Ionicons name={isRecordingAudio ? "stop" : "mic"} size={18} color="#fff" />
                        </TouchableOpacity>
                    )}
                </View>
            </KeyboardAvoidingView>

            {/* Fullscreen View */}
            <Modal visible={viewerVisible} transparent animationType="fade" onRequestClose={() => setViewerVisible(false)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.93)', alignItems: 'center', justifyContent: 'center' }}>
                    <TouchableOpacity style={{ position: 'absolute', top: 50, right: 20, zIndex: 10 }} onPress={() => setViewerVisible(false)}>
                        <Ionicons name="close-circle" size={38} color="#fff" />
                    </TouchableOpacity>
                    <Image source={{ uri: viewerUrl }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                </View>
            </Modal>

            {/* Group Settings Modal */}
            <Modal visible={groupSettingsVisible} transparent animationType="slide" onRequestClose={() => setGroupSettingsVisible(false)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                    <View style={{ backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32 }}>
                        {/* Drag handle */}
                        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginTop: 12, marginBottom: 16 }} />

                        {/* Group avatar */}
                        <TouchableOpacity onPress={changeGroupAvatar} activeOpacity={0.7} style={{ alignItems: 'center', marginBottom: 16 }}>
                            {conversation?.avatar_url ? (
                                <Image source={{ uri: conversation.avatar_url }} style={{ width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: Colors.border }} />
                            ) : (
                                <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.cardAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.border }}>
                                    <Ionicons name="people" size={28} color={Colors.textMuted} />
                                </View>
                            )}
                            <Text style={{ fontSize: 12, color: Colors.primary, fontFamily: Fonts.medium, marginTop: 6 }}>Cambiar foto</Text>
                        </TouchableOpacity>

                        {/* Group name input */}
                        <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
                            <Text style={{ fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textMuted, marginBottom: 6 }}>NOMBRE DEL GRUPO</Text>
                            <TextInput
                                style={{ backgroundColor: Colors.background, padding: 12, borderRadius: 12, color: Colors.textPrimary, fontSize: 15, borderWidth: 1, borderColor: Colors.border }}
                                placeholder="Nombre del grupo..."
                                placeholderTextColor={Colors.textMuted}
                                value={newGroupName}
                                onChangeText={setNewGroupName}
                            />
                        </View>

                        {/* Participants */}
                        <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
                            <Text style={{ fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textMuted, marginBottom: 8 }}>PARTICIPANTES ({groupParticipants.length + 1})</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                                {groupParticipants.map(p => (
                                    <View key={p.id} style={{ alignItems: 'center', marginRight: 14 }}>
                                        {p.avatar_url
                                            ? <Image source={{ uri: p.avatar_url }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                                            : <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.cardAlt, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="person" size={18} color={Colors.textMuted} /></View>}
                                        <Text style={{ fontSize: 10, color: Colors.textSecondary, marginTop: 3, maxWidth: 48 }} numberOfLines={1}>{p.display_name || p.username}</Text>
                                    </View>
                                ))}
                            </ScrollView>
                        </View>

                        {/* Actions */}
                        <View style={{ paddingHorizontal: 20, gap: 10 }}>
                            <TouchableOpacity
                                style={{ padding: 14, borderRadius: 14, backgroundColor: Colors.primary, alignItems: 'center' }}
                                onPress={renameGroup}
                            >
                                <Text style={{ fontFamily: Fonts.bold, color: '#fff', fontSize: 15 }}>Guardar nombre</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={{ padding: 14, borderRadius: 14, backgroundColor: '#FEE2E2', alignItems: 'center' }}
                                onPress={() => { setGroupSettingsVisible(false); leaveGroup(); }}
                            >
                                <Text style={{ fontFamily: Fonts.bold, color: '#EF4444', fontSize: 15 }}>Abandonar grupo</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={{ padding: 14, borderRadius: 14, backgroundColor: Colors.cardAlt, alignItems: 'center' }}
                                onPress={() => setGroupSettingsVisible(false)}
                            >
                                <Text style={{ fontFamily: Fonts.bold, color: Colors.textPrimary, fontSize: 15 }}>Cancelar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        padding: Spacing.md, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border
    },
    headerUserInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    headerAvatar: { width: 32, height: 32, borderRadius: 16 },
    headerTitle: { fontSize: 17, fontFamily: Fonts.bold, color: Colors.textPrimary },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    list: { padding: Spacing.md },
    msgWrapper: { marginBottom: Spacing.sm, width: '100%' },
    myMsg: { alignItems: 'flex-end' },
    theirMsg: { alignItems: 'flex-start' },
    bubble: { maxWidth: '80%', padding: 12, borderRadius: BorderRadius.lg },
    myBubble: { backgroundColor: '#8B5CF6', borderBottomRightRadius: 4 }, // Lighter aesthetic purple
    theirBubble: { backgroundColor: Colors.cardAlt, borderBottomLeftRadius: 4 },
    msgText: { fontSize: 15, fontFamily: Fonts.regular, color: Colors.textPrimary },
    myMsgText: { color: '#fff' },
    msgTime: { fontSize: 10, color: Colors.textSecondary, marginTop: 4, textAlign: 'right' },
    myMsgTime: { color: 'rgba(255,255,255,0.7)' },
    inputRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: Spacing.md, paddingTop: 10, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border },
    input: { flex: 1, minHeight: 44, maxHeight: 120, backgroundColor: Colors.background, borderRadius: 24, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 15, color: Colors.textPrimary },
    sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary, marginLeft: Spacing.sm, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
    
    // Bubble Avatars
    bubbleAvatarSlot: { width: 30, alignItems: 'center', justifyContent: 'flex-end' },
    bubbleAvatarSlotOwn: { width: 30, alignItems: 'center', justifyContent: 'flex-end' },
    bubbleAvatar: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: Colors.border },
    bubbleAvatarSpacer: { width: 26, height: 26 },

    // Recording Setup
    recordingWrap: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.background, borderRadius: 24, paddingHorizontal: 16, flex: 1 },
    recordingText: { color: Colors.error, fontSize: 14, fontFamily: Fonts.medium },
});
