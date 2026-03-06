import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, TextInput, ActivityIndicator, SafeAreaView, ScrollView, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { Audio } from 'expo-av';
import { Colors, Fonts, Spacing, BorderRadius } from '../theme';
import { supabase } from '../lib/supabase';
import { decode } from 'base64-arraybuffer';

export default function AddItemScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute();
    const { capsuleId, type: contentType }: any = route.params || {};

    const [loading, setLoading] = useState(false);
    const [mediaList, setMediaList] = useState<any[]>([]);
    const [text, setText] = useState('');
    const [caption, setCaption] = useState('');

    // Audio recording state
    const [recording, setRecording] = useState<Audio.Recording | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordedUri, setRecordedUri] = useState<string | null>(null);

    useEffect(() => {
        if (contentType === 'image' || contentType === 'video') {
            pickMedia();
        }
        return () => {
            if (recording) {
                recording.stopAndUnloadAsync();
            }
        };
    }, [contentType]);

    const pickMedia = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: contentType === 'image' ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.Videos,
            allowsMultipleSelection: true,
            selectionLimit: 10,
            quality: 0.8,
            videoMaxDuration: 120,
            base64: false, // Don't request base64 in initial pick for multiple to save memory
        });

        if (!result.canceled && result.assets && result.assets.length > 0) {
            setLoading(true);
            const processedAssets: any[] = [];

            for (const asset of result.assets) {
                let currentAsset = asset;
                if (contentType === 'image') {
                    try {
                        const manipResult = await ImageManipulator.manipulateAsync(
                            asset.uri,
                            [{ resize: { width: 1080 } }],
                            { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
                        );
                        currentAsset = { ...asset, uri: manipResult.uri, width: manipResult.width, height: manipResult.height };
                    } catch (e) {
                        console.log('Error optimizing image:', e);
                    }
                }
                processedAssets.push(currentAsset);
            }

            setMediaList(prev => [...prev, ...processedAssets]);
            setLoading(false);
        } else if (mediaList.length === 0) {
            navigation.goBack();
        }
    };

    const removeMedia = (index: number) => {
        setMediaList(prev => prev.filter((_, i) => i !== index));
    };

    const startRecording = async () => {
        try {
            const permission = await Audio.requestPermissionsAsync();
            if (permission.status !== 'granted') return;

            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            });

            const { recording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );
            setRecording(recording);
            setIsRecording(true);
        } catch (err) {
            console.error('Failed to start recording', err);
        }
    };

    const stopRecording = async () => {
        setIsRecording(false);
        if (!recording) return;
        try {
            await recording.stopAndUnloadAsync();
            const uri = recording.getURI();
            setRecordedUri(uri);
            setRecording(null);
        } catch (err) {
            console.error('Failed to stop recording', err);
        }
    };

    const handleUpload = async () => {
        if (loading) return;
        if (contentType === 'note' && !text) return;
        if (contentType === 'audio' && !recordedUri) return;
        if ((contentType === 'image' || contentType === 'video') && mediaList.length === 0) return;

        setLoading(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            const uploadTasks = [];

            // 1. Handle Audio
            if (contentType === 'audio' && recordedUri) {
                uploadTasks.push(uploadFile(recordedUri, 'audio', user.id));
            } 
            // 2. Handle Media List (Images/Videos)
            else if (mediaList.length > 0) {
                for (const media of mediaList) {
                    uploadTasks.push(uploadFile(media.uri, contentType, user.id));
                }
            }
            // 3. Handle Note (no file but data entry)
            else if (contentType === 'note') {
                uploadTasks.push(Promise.resolve(null));
            }

            const mediaUrls = await Promise.all(uploadTasks);

            // Create entries in DB
            const entries = mediaUrls.map(url => ({
                capsule_id: capsuleId,
                owner_id: user.id,
                media_url: url,
                media_type: contentType,
                content: text || null,
                caption: caption || null,
            }));

            const { error } = await supabase.from('capsule_items').insert(entries);

            if (error) throw error;

            Alert.alert('Success', `${entries.length} item${entries.length > 1 ? 's' : ''} added to your capsule!`);
            navigation.pop(2); // Go back to CapsuleDetail
        } catch (err: any) {
            console.error(err);
            Alert.alert('Error', err.message || 'Failed to upload items');
        } finally {
            setLoading(false);
        }
    };

    const uploadFile = async (uri: string, type: string, userId: string) => {
        const ext = uri.split('.').pop() || (type === 'audio' ? 'm4a' : 'jpg');
        const fileName = `${userId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
        const filePath = `items/${fileName}`;

        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        const body = decode(base64);

        const { error: uploadError } = await supabase.storage
            .from('capsule-media')
            .upload(filePath, body, {
                contentType: type === 'video' ? 'video/mp4' : type === 'audio' ? 'audio/x-m4a' : 'image/jpeg',
                upsert: true
            });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from('capsule-media').getPublicUrl(filePath);
        return publicUrl;
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Ionicons name="close" size={28} color={Colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Add {contentType}</Text>
                <TouchableOpacity onPress={handleUpload} disabled={loading || (contentType === 'note' && !text) || (contentType === 'audio' && !recordedUri) || ((contentType === 'image' || contentType === 'video') && mediaList.length === 0)}>
                    {loading ? <ActivityIndicator size="small" color={Colors.primary} /> : <Text style={styles.postBtn}>Add</Text>}
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                {contentType === 'note' ? (
                    <TextInput
                        style={styles.textInput}
                        placeholder="Write something..."
                        multiline
                        value={text}
                        onChangeText={setText}
                        autoFocus
                    />
                ) : contentType === 'audio' ? (
                    <View style={styles.recordingSection}>
                        <TouchableOpacity
                            style={[styles.recordBtn, isRecording && styles.recordBtnActive]}
                            onPress={isRecording ? stopRecording : startRecording}
                        >
                            <Ionicons name={isRecording ? "stop" : "mic"} size={40} color="#fff" />
                        </TouchableOpacity>
                        <Text style={styles.recordingLabel}>
                            {isRecording ? "Recording..." : recordedUri ? "Recording saved" : "Tap to record voice note"}
                        </Text>
                        {recordedUri && (
                            <TouchableOpacity style={styles.retryBtn} onPress={() => setRecordedUri(null)}>
                                <Text style={styles.retryText}>Discard & Retry</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                ) : (
                    <>
                        <View style={styles.mediaContainer}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaList}>
                                {mediaList.map((item, index) => (
                                    <View key={index} style={styles.mediaPreviewWrapper}>
                                        <Image source={{ uri: item.uri }} style={styles.mediaPreview} />
                                        <TouchableOpacity style={styles.removeBtn} onPress={() => removeMedia(index)}>
                                            <Ionicons name="close-circle" size={24} color="#ff4757" />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                                <TouchableOpacity style={styles.addMoreBtn} onPress={pickMedia}>
                                    <Ionicons name="add" size={32} color={Colors.textMuted} />
                                </TouchableOpacity>
                            </ScrollView>
                        </View>

                        <TextInput
                            style={styles.captionInput}
                            placeholder="Add a caption... (optional)"
                            value={caption}
                            onChangeText={setCaption}
                        />
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
    headerTitle: { fontSize: 18, fontFamily: Fonts.bold, color: Colors.textPrimary, textTransform: 'capitalize' },
    postBtn: { color: Colors.primary, fontFamily: Fonts.bold, fontSize: 16 },
    content: { padding: Spacing.md },
    textInput: { fontSize: 18, fontFamily: Fonts.regular, color: Colors.textPrimary, minHeight: 200, textAlignVertical: 'top' },
    
    mediaContainer: { marginBottom: 20, minHeight: 200 },
    mediaList: { gap: 12, paddingRight: 20 },
    mediaPreviewWrapper: { width: 140, height: 248, borderRadius: 12, overflow: 'hidden', backgroundColor: Colors.cardAlt },
    mediaPreview: { width: '100%', height: '100%' },
    removeBtn: { position: 'absolute', top: 5, right: 5, zIndex: 10 },
    addMoreBtn: { width: 140, height: 248, borderRadius: 12, backgroundColor: Colors.cardAlt, alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', borderWidth: 2, borderColor: Colors.border },

    placeholder: { width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: Colors.cardAlt, alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', borderWidth: 2, borderColor: Colors.border },
    placeholderText: { marginTop: 10, color: Colors.textMuted, fontFamily: Fonts.medium },
    captionInput: { borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: 10, fontSize: 16, fontFamily: Fonts.regular, marginTop: 10 },
    recordingSection: { alignItems: 'center', justifyContent: 'center', paddingVertical: 50, gap: 20 },
    recordBtn: {
        width: 100, height: 100, borderRadius: 50, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
        ...Platform.select({
            web: { boxShadow: `0px 4px 10px ${Colors.primary}4D` },
            ios: {
                shadowColor: Colors.primary,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 10,
            },
            android: {
                elevation: 5,
            }
        })
    },
    recordBtnActive: { backgroundColor: '#ff4757', transform: [{ scale: 1.1 }] },
    recordingLabel: { fontSize: 16, fontFamily: Fonts.semiBold, color: Colors.textSecondary },
    retryBtn: { padding: 10 },
    retryText: { color: '#ff4757', fontFamily: Fonts.bold },
});
