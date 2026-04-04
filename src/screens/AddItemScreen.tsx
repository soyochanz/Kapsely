import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, SafeAreaView, ScrollView, Alert, Platform, Modal, StatusBar } from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { Audio, Video, ResizeMode } from 'expo-av';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Colors, Fonts, Spacing, BorderRadius, Shadow } from '../theme';
import { BlurView } from 'expo-blur';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/supabase';
import { decode } from 'base64-arraybuffer';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';

import Slider from '@react-native-community/slider';

export default function AddItemScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute();
    const { t } = useTranslation();
    const { capsuleId, type: contentType }: any = route.params || {};
    const insets = useSafeAreaInsets();

    const [loading, setLoading] = useState(false);
    const [mediaList, setMediaList] = useState<any[]>([]);
    const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
    const [text, setText] = useState('');
    const [caption, setCaption] = useState('');

    // Audio recording state
    const [recording, setRecording] = useState<Audio.Recording | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordedUri, setRecordedUri] = useState<string | null>(null);
    const [audioDuration, setAudioDuration] = useState<number | null>(null);
    const [previewVideo, setPreviewVideo] = useState<string | null>(null);

    // Video Trimming State
    const [trimModalVisible, setTrimModalVisible] = useState(false);
    const [trimmingIndex, setTrimmingIndex] = useState<number | null>(null);
    const [trimStart, setTrimStart] = useState(0);
    const [trimEnd, setTrimEnd] = useState(0);
    const [trimSeekingValue, setTrimSeekingValue] = useState<number | null>(null);

    useEffect(() => {
        return () => {
            if (recording) {
                recording.stopAndUnloadAsync();
            }
        };
    }, []);

    const processAssets = async (assets: any[]) => {
        setLoading(true);
        const processedAssets: any[] = [];

        for (const asset of assets) {
            let currentAsset = { ...asset };
            if (contentType === 'image') {
                try {
                    const manipResult = await ImageManipulator.manipulateAsync(
                        asset.uri,
                        [{ resize: { width: 1080 } }],
                        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
                    );
                    currentAsset = { ...currentAsset, uri: manipResult.uri, width: manipResult.width, height: manipResult.height };
                } catch (e) {
                    console.log('Error optimizing image:', e);
                }
            } else if (contentType === 'video') {
                try {
                    const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 1000 });
                    (currentAsset as any).thumbnailUri = thumbUri;
                    (currentAsset as any).duration = asset.duration;
                } catch (e) {
                    console.log('Error generating thumbnail:', e);
                }
            }
            processedAssets.push(currentAsset);
        }

        setMediaList(prev => [...prev, ...processedAssets]);
        setLoading(false);
    };

    const pickMedia = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: contentType === 'image' ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.Videos,
            allowsMultipleSelection: true,
            selectionLimit: 20,
            quality: 0.8,
            videoMaxDuration: 600,
            base64: false,
        });

        if (!result.canceled && result.assets && result.assets.length > 0) {
            await processAssets(result.assets);
        } else if (mediaList.length === 0) {
            navigation.goBack();
        }
    };

    const captureMedia = async () => {
        try {
            const permission = await ImagePicker.requestCameraPermissionsAsync();
            if (permission.status !== 'granted') {
                Alert.alert(t('common.permission_required'), t('common.camera_permission'));
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: contentType === 'image' ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.Videos,
                quality: 0.8,
                videoMaxDuration: 600,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                await processAssets(result.assets);
            }
        } catch (e) {
            console.error('Camera error:', e);
            Alert.alert(t('common.error'), t('common.upload_failed'));
        }
    };

    const [lastSource, setLastSource] = useState<'camera' | 'gallery' | null>(null);

    const captureMediaWithTrack = () => {
        setLastSource('camera');
        captureMedia();
    };

    const pickMediaWithTrack = () => {
        setLastSource('gallery');
        pickMedia();
    };

    const handleAddMore = () => {
        if (lastSource === 'gallery') {
            pickMedia();
        } else if (lastSource === 'camera') {
            captureMedia();
        } else {
            pickMedia(); // fallback
        }
    };

    const removeMedia = (index: number) => {
        setMediaList(prev => prev.filter((_, i) => i !== index));
    };

    const openTrimModal = (index: number) => {
        const item = mediaList[index];
        if (!item) return;
        setTrimmingIndex(index);
        setTrimStart(item.trimStart || 0);
        setTrimEnd(item.trimEnd || item.duration || 0);
        setTrimModalVisible(true);
    };

    const saveTrim = () => {
        if (trimmingIndex === null) return;
        setMediaList(prev => prev.map((item, idx) => 
            idx === trimmingIndex 
                ? { ...item, trimStart, trimEnd, duration: trimEnd - trimStart } 
                : item
        ));
        setTrimModalVisible(false);
        setTrimmingIndex(null);
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
            const status = await recording.getStatusAsync();
            if (status && 'durationMillis' in status) {
                setAudioDuration(status.durationMillis);
            }
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

        const batchId = Math.random().toString(36).substring(2, 11);
        setLoading(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            const uploadTasks = [];

            // 1. Handle Audio
            if (contentType === 'audio' && recordedUri) {
                const audioTask = async () => {
                    const url = await uploadFile(recordedUri, 'audio', user.id);
                    return { mediaUrl: url, thumbUrl: null, duration: audioDuration };
                };
                uploadTasks.push(audioTask());
            } 
            // 2. Handle Media List (Images/Videos)
            else if (mediaList.length > 0) {
                for (const media of mediaList) {
                    const uploadPromise = async () => {
                        const mediaUrl = await uploadFile(media.uri, contentType, user.id);
                        let thumbUrl = null;
                        if (contentType === 'video' && media.thumbnailUri) {
                            thumbUrl = await uploadFile(media.thumbnailUri, 'image', user.id, true);
                        }
                        return { mediaUrl, thumbUrl, duration: media.duration };
                    };
                    uploadTasks.push(uploadPromise());
                }
            }
            // 3. Handle Note (no file but data entry)
            else if (contentType === 'note') {
                uploadTasks.push(Promise.resolve({ mediaUrl: '', thumbUrl: '', duration: null }));
            }

            const uploadResults = await Promise.all(uploadTasks);

            // Create entries in DB
            const entries = uploadResults.map((res: any, idx: number) => {
                const mediaItem = mediaList[idx] || {};
                let contentStr = text || null;

                if (contentType === 'video' || contentType === 'audio') {
                    const dur = mediaItem.duration || res.duration;
                    const min = Math.floor(dur / 60000);
                    const sec = Math.floor((dur % 60000) / 1000).toString().padStart(2, '0');
                    contentStr = `${min}:${sec}`;

                    if (mediaItem.trimStart !== undefined && mediaItem.trimEnd !== undefined) {
                        contentStr += `|${mediaItem.trimStart}-${mediaItem.trimEnd}`;
                    }
                }

                return {
                    capsule_id: capsuleId,
                    owner_id: user.id,
                    media_url: res.mediaUrl || '',
                    thumbnail_url: res.thumbUrl || '',
                    media_type: contentType,
                    content: contentStr,
                    caption: caption ? `${caption} !!b:${batchId}` : `!!b:${batchId}`,
                };
            });

            const { error } = await supabase.from('capsule_items').insert(entries);

            if (error) throw error;

            Alert.alert(t('common.success'), t('common.items_added', { count: entries.length }));
            navigation.pop(2); // Go back to CapsuleDetail
        } catch (err: any) {
            console.error(err);
            Alert.alert(t('common.error'), err.message || t('common.upload_failed'));
        } finally {
            setLoading(false);
        }
    };

    const uploadFile = async (uri: string, type: string, userId: string, isThumbnail = false) => {
        let ext = 'jpg';
        const lastDot = uri.lastIndexOf('.');
        if (lastDot !== -1 && lastDot > uri.lastIndexOf('/')) {
            ext = uri.substring(lastDot + 1).split('?')[0];
        } else {
            ext = type === 'video' ? 'mp4' : type === 'audio' ? 'm4a' : 'jpg';
        }

        const fileName = `${userId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
        const filePath = isThumbnail ? `thumbnails/${fileName}` : `items/${fileName}`;

        try {
            if (!isThumbnail) {
                setUploadProgress(prev => ({ ...prev, [uri]: 20 }));
            }

            // --- Memory Safe Upload using FormData ---
            const formData = new FormData();
            formData.append('file', {
                uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
                name: `file.${ext}`,
                type: type === 'video' ? 'video/mp4' : type === 'audio' ? 'audio/x-m4a' : 'image/jpeg'
            } as any);

            const { data, error } = await supabase.storage
                .from('capsule-media')
                .upload(filePath, formData, {
                    contentType: 'multipart/form-data',
                    upsert: true
                });

            if (error) throw error;

            if (!isThumbnail) {
                setUploadProgress(prev => ({ ...prev, [uri]: 100 }));
            }

            const { data: { publicUrl } } = supabase.storage.from('capsule-media').getPublicUrl(filePath);
            return publicUrl;
        } catch (error: any) {
            console.error('File upload error:', error);
            throw new Error(`Upload failed: ${error.message || 'Network error'}`);
        }
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
            <View style={styles.header}>
                <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.goBack()}>
                    <Ionicons name="close" size={28} color={Colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Add {contentType}</Text>
                <TouchableOpacity activeOpacity={0.8} onPress={handleUpload} disabled={loading || (contentType === 'note' && !text) || (contentType === 'audio' && !recordedUri) || ((contentType === 'image' || contentType === 'video') && mediaList.length === 0)}>
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
                        autoCorrect={false}
                        spellCheck={false}
                    />
                ) : contentType === 'audio' ? (
                    <View style={styles.recordingSection}>
                        <TouchableOpacity
                            style={[styles.recordBtn, isRecording && styles.recordBtnActive]}
                            activeOpacity={0.9}
                            onPress={isRecording ? stopRecording : startRecording}
                        >
                            <Ionicons name={isRecording ? "stop" : "mic"} size={40} color="#fff" />
                        </TouchableOpacity>
                        <Text style={styles.recordingLabel}>
                            {isRecording ? "Recording..." : recordedUri ? "Recording saved" : "Tap to record voice note"}
                        </Text>
                        {recordedUri && (
                            <TouchableOpacity style={styles.retryBtn} activeOpacity={0.7} onPress={() => setRecordedUri(null)}>
                                <Text style={styles.retryText}>Discard & Retry</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                ) : (
                    <>
                        <View style={styles.mediaContainer}>
                            {mediaList.length === 0 ? (
                                <View style={styles.emptyMedia}>
                                    <View style={styles.illustrationContainer}>
                                        <View style={[styles.glowCircle, { backgroundColor: Colors.primary + '20' }]} />
                                        <Ionicons name={contentType === 'image' ? 'images' : 'videocam'} size={80} color={Colors.primary} style={{ opacity: 0.8 }} />
                                    </View>
                                    
                                    <TouchableOpacity style={styles.modernChoiceBtn} activeOpacity={0.8} onPress={captureMediaWithTrack}>
                                        <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.modernChoiceGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                                            <View style={styles.modernIconBox}>
                                                <Ionicons name="camera" size={32} color="#fff" />
                                            </View>
                                            <View>
                                                <Text style={styles.modernChoiceLabel}>Capture Now</Text>
                                                <Text style={styles.modernChoiceSub}>Use your camera for a new memory</Text>
                                            </View>
                                        </LinearGradient>
                                    </TouchableOpacity>
                                    
                                    <TouchableOpacity style={[styles.modernChoiceBtn, { backgroundColor: Colors.cardAlt }]} activeOpacity={0.8} onPress={pickMediaWithTrack}>
                                        <View style={styles.modernChoiceGrad}>
                                            <View style={[styles.modernIconBox, { backgroundColor: Colors.primary + '15' }]}>
                                                <Ionicons name="library" size={32} color={Colors.primary} />
                                            </View>
                                            <View>
                                                <Text style={[styles.modernChoiceLabel, { color: Colors.textPrimary }]}>From Gallery</Text>
                                                <Text style={[styles.modernChoiceSub, { color: Colors.textMuted }]}>Choose from your photos and videos</Text>
                                            </View>
                                        </View>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaList}>
                                    {mediaList.map((item, index) => {
                                        const progress = uploadProgress[item.uri] || 0;
                                        return (
                                            <View key={index} style={styles.mediaPreviewWrapper}>
                                                <Image source={{ uri: item.thumbnailUri || item.uri }} style={styles.mediaPreview} contentFit="cover" transition={200} />

                                                
                                                {loading && progress < 100 && (
                                                    Platform.OS === 'ios' ? (
                                                        <BlurView intensity={20} tint="dark" style={styles.progressOverlay}>
                                                            <View style={{ alignItems: 'center', width: '100%' }}>
                                                                <Text style={styles.progressText}>{progress}%</Text>
                                                                <View style={styles.progressTrack}>
                                                                    <View style={[styles.progressBar, { width: `${progress}%` }]} />
                                                                </View>
                                                            </View>
                                                        </BlurView>
                                                    ) : (
                                                        <View style={[styles.progressOverlay, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
                                                            <View style={{ alignItems: 'center', width: '100%' }}>
                                                                <Text style={styles.progressText}>{progress}%</Text>
                                                                <View style={styles.progressTrack}>
                                                                    <View style={[styles.progressBar, { width: `${progress}%` }]} />
                                                                </View>
                                                            </View>
                                                        </View>
                                                    )
                                                )}

                                                {contentType === 'video' && (
                                                    <TouchableOpacity 
                                                        style={styles.playOverlay} 
                                                        activeOpacity={0.7}
                                                        onPress={() => setPreviewVideo(item.uri)}
                                                    >
                                                        <View style={styles.playCircle}>
                                                            <Ionicons name="play" size={30} color="#fff" />
                                                        </View>
                                                    </TouchableOpacity>
                                                )}

                                                {contentType === 'video' && (
                                                    <TouchableOpacity 
                                                        style={styles.trimBtnOverlay} 
                                                        activeOpacity={0.8}
                                                        onPress={() => openTrimModal(index)}
                                                    >
                                                        <Ionicons name="cut" size={16} color="#fff" />
                                                    </TouchableOpacity>
                                                )}

                                                <TouchableOpacity style={styles.removeBtn} activeOpacity={0.7} onPress={() => removeMedia(index)}>
                                                    <Ionicons name="close-circle" size={24} color="#ff4757" />
                                                </TouchableOpacity>
                                            </View>
                                        );
                                    })}
                                    <TouchableOpacity style={[styles.addMoreBtnModern, { borderStyle: 'solid', backgroundColor: Colors.primary + '08', borderColor: Colors.primary + '30' }]} activeOpacity={0.8} onPress={handleAddMore}>
                                        <Ionicons name="add" size={32} color={Colors.primary} />
                                        <Text style={{ fontSize: 10, fontFamily: Fonts.bold, color: Colors.primary, marginTop: 4 }}>Add more</Text>
                                    </TouchableOpacity>
                                </ScrollView>
                            )}
                        </View>

                        <Modal visible={!!previewVideo} transparent animationType="fade">
                            <View style={styles.videoModal}>
                                {previewVideo && (
                                    <Video
                                        source={{ uri: (previewVideo && !previewVideo.startsWith('text://')) ? previewVideo : '' }}
                                        rate={1.0}
                                        volume={1.0}
                                        isMuted={false}
                                        resizeMode={ResizeMode.CONTAIN}
                                        shouldPlay
                                        useNativeControls
                                        style={styles.fullVideo}
                                    />
                                )}
                                <TouchableOpacity style={styles.closeVideo} activeOpacity={0.7} onPress={() => setPreviewVideo(null)}>
                                    <Ionicons name="close-circle" size={40} color="#fff" />
                                </TouchableOpacity>
                            </View>
                        </Modal>

                        <Modal visible={trimModalVisible} transparent animationType="slide">
                            <View style={styles.trimModalContainer}>
                                {Platform.OS === 'ios' ? (
                                    <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
                                ) : (
                                    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.85)' }]} />
                                )}
                                <View style={styles.trimContent}>
                                    <Text style={styles.trimTitle}>Trim Video</Text>
                                    
                                    {trimmingIndex !== null && mediaList[trimmingIndex] && (
                                        <Video
                                            source={{ uri: mediaList[trimmingIndex].uri }}
                                            rate={1.0}
                                            volume={1.0}
                                            isMuted={false}
                                            resizeMode={ResizeMode.CONTAIN}
                                            shouldPlay={trimSeekingValue === null}
                                            useNativeControls={false}
                                            style={styles.trimVideoPreview}
                                            positionMillis={trimSeekingValue !== null ? trimSeekingValue : trimStart}
                                        />
                                    )}

                                    <View style={styles.sliderGroup}>
                                        <Text style={styles.sliderLabel}>Start: {Math.floor(trimStart / 1000)}s</Text>
                                        <Slider
                                            style={{ width: '100%', height: 40 }}
                                            minimumValue={0}
                                            maximumValue={trimmingIndex !== null ? (mediaList[trimmingIndex]?.duration || 0) : 1000}
                                            value={trimStart}
                                            onValueChange={(val) => {
                                                setTrimStart(Math.min(val, trimEnd - 1000));
                                                setTrimSeekingValue(val);
                                            }}
                                            onSlidingComplete={() => setTrimSeekingValue(null)}
                                            minimumTrackTintColor={Colors.primary}
                                            maximumTrackTintColor="#ffffff33"
                                            thumbTintColor="#fff"
                                        />

                                        <Text style={styles.sliderLabel}>End: {Math.floor(trimEnd / 1000)}s</Text>
                                        <Slider
                                            style={{ width: '100%', height: 40 }}
                                            minimumValue={0}
                                            maximumValue={trimmingIndex !== null ? (mediaList[trimmingIndex]?.duration || 0) : 1000}
                                            value={trimEnd}
                                            onValueChange={(val) => {
                                                setTrimEnd(Math.max(val, trimStart + 1000));
                                                setTrimSeekingValue(val);
                                            }}
                                            onSlidingComplete={() => setTrimSeekingValue(null)}
                                            minimumTrackTintColor="#ffffff33"
                                            maximumTrackTintColor={Colors.primary}
                                            thumbTintColor="#fff"
                                        />
                                    </View>

                                    <View style={styles.trimActions}>
                                        <TouchableOpacity style={[styles.trimActionBtn, { backgroundColor: '#ff475715' }]} onPress={() => setTrimModalVisible(false)}>
                                            <Text style={{ color: '#ff4757', fontFamily: Fonts.bold }}>Cancel</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[styles.trimActionBtn, { backgroundColor: Colors.primary }]} onPress={saveTrim}>
                                            <Text style={{ color: '#fff', fontFamily: Fonts.bold }}>Save</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        </Modal>

                        <View style={styles.captionWrapper}>
                            <Ionicons name="chatbubble-ellipses-outline" size={20} color={Colors.primary} style={styles.captionIcon} />
                            <TextInput
                                style={styles.captionInputModern}
                                placeholder="Write a caption..."
                                placeholderTextColor={Colors.textMuted}
                                value={caption}
                                onChangeText={setCaption}
                                multiline={false}
                                autoCorrect={false}
                                spellCheck={false}
                            />
                        </View>
                    </>
                )}
            </ScrollView>
            {loading && (
                <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                    <Text style={{ marginTop: 16, fontFamily: Fonts.bold, color: Colors.textPrimary, fontSize: 16 }}>
                        {mediaList.length > 0 ? "Uploading media..." : "Processing media..."}
                    </Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    header: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        paddingHorizontal: Spacing.md, 
        paddingVertical: Platform.OS === 'android' ? 20 : Spacing.md,
        height: Platform.OS === 'android' ? 80 : 64,
        borderBottomWidth: 1, 
        borderBottomColor: Colors.border + '44'
    },
    headerTitle: { fontSize: 18, fontFamily: Fonts.bold, color: Colors.textPrimary, textTransform: 'capitalize' },
    postBtn: { color: Colors.primary, fontFamily: Fonts.bold, fontSize: 16 },
    content: { padding: Spacing.md },
    textInput: { 
        fontSize: 18, 
        fontFamily: Fonts.regular, 
        color: Colors.textPrimary, 
        minHeight: 250, 
        textAlignVertical: 'top',
        backgroundColor: Colors.cardAlt,
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    
    mediaContainer: { marginBottom: 30, minHeight: 280 },
    mediaList: { paddingHorizontal: 4, gap: 16, paddingRight: 20 },
    mediaPreviewWrapper: { 
        width: 150, 
        height: 260, 
        borderRadius: 24, 
        overflow: 'hidden', 
        backgroundColor: Colors.cardAlt, 
        ...Shadow.subtle,
        borderWidth: 1,
        borderColor: Colors.border
    },
    mediaPreview: { width: '100%', height: '100%' },
    removeBtn: { 
        position: 'absolute', 
        top: 10, 
        right: 10, 
        zIndex: 10,
        backgroundColor: 'rgba(255,255,255,0.9)',
        borderRadius: 12,
        padding: 2
    },

    captionWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.surface,
        borderRadius: 24,
        borderWidth: 1.5,
        borderColor: Colors.border,
        paddingHorizontal: 18,
        marginTop: 20,
        marginHorizontal: 4,
        ...Shadow.subtle
    },
    captionIcon: { marginRight: 12 },
    captionInputModern: {
        flex: 1,
        paddingVertical: 18,
        fontSize: 16,
        fontFamily: Fonts.medium,
        color: Colors.textPrimary,
    },
    recordingSection: { 
        alignItems: 'center', 
        justifyContent: 'center', 
        paddingVertical: 60, 
        gap: 24,
        backgroundColor: Colors.cardAlt,
        borderRadius: 32,
        marginVertical: 20
    },
    recordBtn: {
        width: 110, height: 110, borderRadius: 55, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
        ...Platform.select({
            ios: {
                shadowColor: Colors.primary,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.4,
                shadowRadius: 12,
            },
            android: {
                elevation: 8,
            }
        })
    },
    recordBtnActive: { backgroundColor: '#ff4757', transform: [{ scale: 1.1 }] },
    recordingLabel: { fontSize: 17, fontFamily: Fonts.semiBold, color: Colors.textSecondary },
    retryBtn: { padding: 12, backgroundColor: '#ff475715', borderRadius: 20 },
    retryText: { color: '#ff4757', fontFamily: Fonts.bold },

    playOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.15)' },
    playCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center', ...Shadow.subtle },
    videoModal: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
    fullVideo: { width: '100%', height: '80%' },
    closeVideo: { position: 'absolute', top: 50, right: 20 },

    emptyMedia: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, paddingVertical: 40 },
    modernChoiceBtn: { 
        width: '100%', 
        backgroundColor: Colors.surface, 
        borderRadius: 28, 
        flexDirection: 'row', 
        alignItems: 'center', 
        gap: 16, 
        borderWidth: 1.5, 
        borderColor: Colors.border,
        overflow: 'hidden',
        minHeight: 120,
        ...Shadow.card 
    },
    modernChoiceGrad: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 28,
        gap: 24,
    },
    modernIconBox: { 
        width: 64, 
        height: 64, 
        borderRadius: 22, 
        backgroundColor: 'rgba(255,255,255,0.25)', 
        alignItems: 'center', 
        justifyContent: 'center' 
    },
    modernChoiceLabel: { fontSize: 18, fontFamily: Fonts.bold, color: '#fff' },
    modernChoiceSub: { fontSize: 14, fontFamily: Fonts.regular, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
    
    progressOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.6)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    progressTrack: {
        width: '100%',
        height: 6,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 3,
        overflow: 'hidden',
        marginTop: 8,
    },
    illustrationContainer: {
        width: 160,
        height: 160,
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: 20,
    },
    glowCircle: {
        position: 'absolute',
        width: 140,
        height: 140,
        borderRadius: 70,
        opacity: 0.5,
    },
    progressBar: {
        height: '100%',
        backgroundColor: Colors.primary,
        borderRadius: 2,
    },
    progressText: {
        color: '#fff',
        fontSize: 14,
        fontFamily: Fonts.bold,
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3
    },
    addMoreBtnModern: {
        width: 150,
        height: 260,
        borderRadius: 24,
        backgroundColor: Colors.cardAlt,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: Colors.primary + '30',
        borderStyle: 'dashed',
    },
    trimBtnOverlay: {
        position: 'absolute',
        top: 10,
        left: 10,
        zIndex: 10,
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderRadius: 12,
        padding: 5
    },
    trimModalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    trimContent: { width: '85%', backgroundColor: 'rgba(0,0,0,0.85)', borderRadius: 24, padding: 25, borderWidth: 1, borderColor: '#ffffff22' },
    trimTitle: { fontSize: 18, fontFamily: Fonts.bold, color: '#fff', textAlign: 'center', marginBottom: 20 },
    trimVideoPreview: { width: '100%', height: 200, borderRadius: 12, marginBottom: 20 },
    sliderGroup: { marginVertical: 10 },
    sliderLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontFamily: Fonts.medium, marginTop: 10 },
    trimActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 15, marginTop: 25 },
    trimActionBtn: { flex: 1, paddingVertical: 14, borderRadius: 15, alignItems: 'center' },
});
