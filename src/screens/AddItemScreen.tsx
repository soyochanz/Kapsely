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
    const [media, setMedia] = useState<any>(null);
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
            allowsEditing: true,
            aspect: [4, 5],
            quality: 0.5, // Reduced quality to save space
            videoMaxDuration: 120, // Optional constraint
            base64: true,
        });

        if (!result.canceled && result.assets[0]) {
            let asset = result.assets[0];

            // Optimize image further with formatting and resizing (e.g. max width 1080)
            if (contentType === 'image') {
                try {
                    const manipResult = await ImageManipulator.manipulateAsync(
                        asset.uri,
                        [{ resize: { width: 1080 } }],
                        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
                    );
                    asset = { ...asset, uri: manipResult.uri, base64: manipResult.base64 };
                } catch (e) {
                    console.log('Error optimizing image:', e);
                }
            }

            setMedia(asset);
        } else if (!media) {
            navigation.goBack();
        }
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
        setLoading(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            let mediaUrl = null;
            const finalUri = contentType === 'audio' ? recordedUri : media?.uri;

            if (finalUri) {
                const ext = finalUri.split('.').pop() || (contentType === 'audio' ? 'm4a' : 'jpg');
                const fileName = `${user.id}/${Date.now()}.${ext}`;
                const filePath = `items/${fileName}`;

                const base64 = await FileSystem.readAsStringAsync(finalUri, { encoding: 'base64' as any });
                const body = decode(base64);

                const { error: uploadError } = await supabase.storage
                    .from('capsule-media')
                    .upload(filePath, body, {
                        contentType: contentType === 'video' ? 'video/mp4' : contentType === 'audio' ? 'audio/x-m4a' : 'image/jpeg',
                        upsert: true
                    });

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage.from('capsule-media').getPublicUrl(filePath);
                mediaUrl = publicUrl;
            }

            const { error } = await supabase.from('capsule_items').insert({
                capsule_id: capsuleId,
                owner_id: user.id,
                media_url: mediaUrl,
                media_type: contentType,
                content: text || null,
                caption: caption || null,
            });

            if (error) throw error;

            Alert.alert('Success', 'Item added to your capsule!');
            navigation.pop(2); // Go back to CapsuleDetail
        } catch (err: any) {
            console.error(err);
            Alert.alert('Error', err.message || 'Failed to upload item');
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Ionicons name="close" size={28} color={Colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Add {contentType}</Text>
                <TouchableOpacity onPress={handleUpload} disabled={loading || (contentType === 'note' && !text) || (contentType === 'audio' && !recordedUri) || ((contentType === 'image' || contentType === 'video') && !media)}>
                    {loading ? <ActivityIndicator size="small" color={Colors.primary} /> : <Text style={styles.postBtn}>Add</Text>}
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
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
                        {media ? (
                            <View style={styles.previewContainer}>
                                <Image source={{ uri: media.uri }} style={styles.preview} />
                                <TouchableOpacity style={styles.changeBtn} onPress={pickMedia}>
                                    <Text style={styles.changeBtnText}>Change</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <TouchableOpacity style={styles.placeholder} onPress={pickMedia}>
                                <Ionicons name="add" size={40} color={Colors.textMuted} />
                                <Text style={styles.placeholderText}>Select {contentType}</Text>
                            </TouchableOpacity>
                        )}
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
    previewContainer: { width: '100%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: Colors.cardAlt, marginBottom: 20 },
    preview: { width: '100%', height: '100%' },
    changeBtn: { position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
    changeBtnText: { color: '#fff', fontSize: 12, fontFamily: Fonts.bold },
    placeholder: { width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: Colors.cardAlt, alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', borderWidth: 2, borderColor: Colors.border },
    placeholderText: { marginTop: 10, color: Colors.textMuted, fontFamily: Fonts.medium },
    captionInput: { borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: 10, fontSize: 16, fontFamily: Fonts.regular, marginTop: 10 },
    recordingSection: { alignItems: 'center', justifyContent: 'center', paddingVertical: 50, gap: 20 },
    recordBtn: {
        width: 100, height: 100, borderRadius: 50, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
        ...Platform.select({
            web: { boxShadow: `0px 4px 10px ${Colors.primary}4D` },
            default: {
                elevation: 5,
                shadowColor: Colors.primary,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 10,
            }
        })
    },
    recordBtnActive: { backgroundColor: '#ff4757', transform: [{ scale: 1.1 }] },
    recordingLabel: { fontSize: 16, fontFamily: Fonts.semiBold, color: Colors.textSecondary },
    retryBtn: { padding: 10 },
    retryText: { color: '#ff4757', fontFamily: Fonts.bold },
});
