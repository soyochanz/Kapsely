import React, { useState, useEffect } from 'react';
import * as ExpoLocation from 'expo-location';
import {
    View, Text, StyleSheet, TouchableOpacity, TextInput,
    ActivityIndicator, SafeAreaView, ScrollView, Alert,
    Platform, Modal, StatusBar, Dimensions, KeyboardAvoidingView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { Audio, Video, ResizeMode } from 'expo-av';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { BlurView } from 'expo-blur';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import Slider from '@react-native-community/slider';
import { optimizeImageForUpload, optimizeThumbnailForUpload } from '../utils/mediaOptimization';
import { locationService } from '../utils/location';

const { width } = Dimensions.get('window');

// ─── Design Tokens ────────────────────────────────────────────────────────────
const P = {
    // Purples
    p50: '#F5F3FF',
    p100: '#EDE9FE',
    p200: '#DDD6FE',
    p300: '#C4B5FD',
    p400: '#A78BFA',
    p500: '#8B5CF6',
    p600: '#7C3AED',
    p700: '#6D28D9',
    p800: '#5B21B6',
    // Neutrals
    white: '#FFFFFF',
    gray50: '#FAFAFA',
    gray100: '#F4F4F5',
    gray200: '#E4E4E7',
    gray300: '#D1D1D6',
    gray400: '#A1A1AA',
    gray500: '#71717A',
    gray700: '#3F3F46',
    gray900: '#18181B',
    // Semantic
    red: '#EF4444',
    redPale: '#FEF2F2',
    green: '#10B981',
};

const R = { xs: 8, sm: 14, md: 18, lg: 24, xl: 32, full: 999 };

const shadow = {
    soft: Platform.select({
        ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10 },
        android: { elevation: 3 },
    }),
    medium: Platform.select({
        ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.09, shadowRadius: 18 },
        android: { elevation: 6 },
    }),
    purple: Platform.select({
        ios: { shadowColor: P.p600, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 20 },
        android: { elevation: 10 },
    }),
};
// ─────────────────────────────────────────────────────────────────────────────

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
    const [recording, setRecording] = useState<Audio.Recording | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordedUri, setRecordedUri] = useState<string | null>(null);
    const [audioDuration, setAudioDuration] = useState<number | null>(null);
    const [previewVideo, setPreviewVideo] = useState<string | null>(null);
    const [trimModalVisible, setTrimModalVisible] = useState(false);
    const [trimmingIndex, setTrimmingIndex] = useState<number | null>(null);
    const [trimStart, setTrimStart] = useState(0);
    const [trimEnd, setTrimEnd] = useState(0);
    const [trimSeekingValue, setTrimSeekingValue] = useState<number | null>(null);
    const [aestheticAlert, setAestheticAlert] = useState<any>(null);
    const [currentLocation, setCurrentLocation] = useState<{ latitude: number, longitude: number, altitude: number | null, locationName: string } | null>(null);
    const [suggestedLocation, setSuggestedLocation] = useState<any>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchingLocation, setIsSearchingLocation] = useState(false);
    const [locationModalVisible, setLocationModalVisible] = useState(false);
    const [locationSuggestions, setLocationSuggestions] = useState<any[]>([]);
    const [includeLocation, setIncludeLocation] = useState(true);

    useEffect(() => {
        const fetchLocation = async () => {
            const loc = await locationService.getCurrentLocation();
            if (loc) setCurrentLocation(loc);
        };
        fetchLocation();
    }, []);

    useEffect(() => {
        if (!searchQuery.trim() || searchQuery.length < 3) {
            setLocationSuggestions([]);
            return;
        }

        const delay = setTimeout(async () => {
            setIsSearchingLocation(true);
            try {
                // Using geocodeAsync to get potential coordinates for the query
                // Note: Expo Location geocodeAsync usually returns an array of matching coordinates
                const results = await ExpoLocation.geocodeAsync(searchQuery);
                if (results && results.length > 0) {
                    const uniqueNames = new Set();
                    const suggestions = [];
                    
                    // Take top 5 results and get city names
                    for (const res of results.slice(0, 5)) {
                        const [addr] = await ExpoLocation.reverseGeocodeAsync({
                            latitude: res.latitude,
                            longitude: res.longitude
                        });
                        const name = addr?.city || addr?.subregion || addr?.region || searchQuery;
                        if (name && !uniqueNames.has(name)) {
                            uniqueNames.add(name);
                            suggestions.push({ ...res, locationName: name });
                        }
                    }
                    setLocationSuggestions(suggestions);
                }
            } catch (e) {
                console.log('Search error:', e);
            } finally {
                setIsSearchingLocation(false);
            }
        }, 800);

        return () => clearTimeout(delay);
    }, [searchQuery]);

    useEffect(() => {
        return () => { if (recording) recording.stopAndUnloadAsync(); };
    }, []);

    const processAssets = async (assets: any[]) => {
        setLoading(true);
        const processed: any[] = [];
        for (const asset of assets) {
            let cur = { ...asset };
            
            // Extract location from EXIF
            if (asset.exif && !suggestedLocation) {
                const suggested = await locationService.getLocationFromExif(asset.exif);
                if (suggested) {
                    setSuggestedLocation(suggested);
                    // Standard: ask or auto-suggest later
                }
            }

            if (contentType === 'image') {
                try {
                    const optimizedUri = await optimizeImageForUpload(asset.uri);
                    const thumbUri = await optimizeThumbnailForUpload(asset.uri);
                    const r = await ImageManipulator.manipulateAsync(optimizedUri, [], {});
                    cur = { ...cur, uri: optimizedUri, thumbnailUri: thumbUri, width: r.width, height: r.height };
                } catch (e) { }
            } else if (contentType === 'video') {
                try {
                    if (asset.duration && asset.duration > 61000) { Alert.alert('Error', 'Videos must be 1 minute or less.'); setLoading(false); return; }
                    const { uri: rawThumbUri } = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 1000 });
                    const optimizedThumbUri = await optimizeThumbnailForUpload(rawThumbUri);
                    cur.thumbnailUri = optimizedThumbUri; cur.duration = asset.duration;
                } catch (e) { }
            }
            processed.push(cur);
        }
        setMediaList(prev => [...prev, ...processed]);
        setLoading(false);
    };

    const pickMedia = async () => {
        try {
            const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (permission.status !== 'granted') {
                Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para añadir recuerdos.');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: contentType === 'image' ? 'images' : 'videos',
                allowsMultipleSelection: true,
                selectionLimit: 20,
                quality: 1,
                videoMaxDuration: 60,
                videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
                videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
                base64: false,
                exif: true,
            });

            if (!result.canceled && result.assets?.length > 0) {
                await processAssets(result.assets);
            }
        } catch (e) {
            console.error('Pick media error:', e);
            Alert.alert('Error', 'No se pudo abrir la galería.');
        }
    };

    const captureMedia = async () => {
        try {
            const permission = await ImagePicker.requestCameraPermissionsAsync();
            if (permission.status !== 'granted') {
                Alert.alert('Permiso requerido', 'Necesitamos acceso a tu cámara para capturar recuerdos.');
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: contentType === 'image' ? 'images' : 'videos',
                quality: 1,
                videoMaxDuration: 60,
                videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
                videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
                exif: true,
            });

            if (!result.canceled && result.assets?.length > 0) {
                await processAssets(result.assets);
            }
        } catch (e) {
            console.error('Capture media error:', e);
            Alert.alert('Error', 'No se pudo abrir la cámara.');
        }
    };

    const [lastSource, setLastSource] = useState<'camera' | 'gallery' | null>(null);
    const captureMediaWithTrack = () => { setLastSource('camera'); captureMedia(); };
    const pickMediaWithTrack = () => { setLastSource('gallery'); pickMedia(); };
    const handleAddMore = () => { lastSource === 'camera' ? captureMedia() : pickMedia(); };
    const removeMedia = (index: number) => setMediaList(prev => prev.filter((_, i) => i !== index));

    const openTrimModal = (index: number) => {
        const item = mediaList[index]; if (!item) return;
        setTrimmingIndex(index); setTrimStart(item.trimStart || 0);
        setTrimEnd(item.trimEnd || item.duration || 0); setTrimModalVisible(true);
    };

    const saveTrim = () => {
        if (trimmingIndex === null) return;
        setMediaList(prev => prev.map((item, idx) => idx === trimmingIndex ? { ...item, trimStart, trimEnd, duration: trimEnd - trimStart } : item));
        setTrimModalVisible(false); setTrimmingIndex(null);
    };

    const startRecording = async () => {
        try {
            const p = await Audio.requestPermissionsAsync();
            if (p.status !== 'granted') return;
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
                playThroughEarpieceAndroid: false,
                staysActiveInBackground: true,
            });
            const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
            setRecording(recording); setIsRecording(true);
        } catch (err) { console.error(err); }
    };

    const stopRecording = async () => {
        setIsRecording(false);
        if (!recording) return;
        try {
            const status = await recording.getStatusAsync();
            if (status && 'durationMillis' in status) setAudioDuration(status.durationMillis);
            await recording.stopAndUnloadAsync();
            setRecordedUri(recording.getURI()); setRecording(null);
        } catch (err) { console.error(err); }
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
            const uploadTasks: Promise<any>[] = [];

            if (contentType === 'audio' && recordedUri) {
                uploadTasks.push((async () => {
                    const url = await uploadFile(recordedUri, 'audio', user.id);
                    return { mediaUrl: url, thumbUrl: null, duration: audioDuration, type: 'audio' };
                })());
            } else if (mediaList.length > 0) {
                mediaList.forEach((media) => {
                    uploadTasks.push((async () => {
                        const mediaUrl = await uploadFile(media.uri, contentType, user.id);
                        let thumbUrl = null;
                        if (media.thumbnailUri) {
                            try { thumbUrl = await uploadFile(media.thumbnailUri, 'image', user.id, true); } catch (e) { }
                        }
                        return { mediaUrl, thumbUrl, duration: media.duration, type: contentType, originalMedia: media };
                    })());
                });
            } else if (contentType === 'note') {
                uploadTasks.push(Promise.resolve({ mediaUrl: '', thumbUrl: '', duration: null, type: 'note' }));
            }

            const results = await Promise.allSettled(uploadTasks);
            const successfulUploads: any[] = [];
            const failedUploads: any[] = [];
            results.forEach((res, idx) => {
                if (res.status === 'fulfilled') successfulUploads.push(res.value);
                else failedUploads.push({ index: idx, reason: res.reason?.message || 'Unknown error', item: mediaList[idx] });
            });

            if (successfulUploads.length === 0 && failedUploads.length > 0) throw new Error(failedUploads[0].reason);

            const entries = successfulUploads.map((res: any) => {
                const mi = res.originalMedia || {};
                let contentStr = text || null;
                if (res.type === 'video' || res.type === 'audio') {
                    const dur = mi.duration || res.duration;
                    const min = Math.floor(dur / 60000);
                    const sec = Math.floor((dur % 60000) / 1000).toString().padStart(2, '0');
                    contentStr = `${min}:${sec}`;
                    if (mi.trimStart !== undefined && mi.trimEnd !== undefined) contentStr += `|${mi.trimStart}-${mi.trimEnd}`;
                }
                return {
                    capsule_id: capsuleId, owner_id: user.id,
                    media_url: res.mediaUrl || '', thumbnail_url: res.thumbUrl || '',
                    media_type: res.type, content: contentStr,
                    caption: caption ? `${caption} !!b:${batchId}` : `!!b:${batchId}`,
                    latitude: includeLocation ? currentLocation?.latitude : null,
                    longitude: includeLocation ? currentLocation?.longitude : null,
                    location_name: includeLocation ? currentLocation?.locationName : null,
                    altitude: includeLocation ? (currentLocation as any)?.altitude : null,
                };
            });

            const { error: dbError } = await supabase.from('capsule_items').insert(entries);
            if (dbError) throw dbError;

            try {
                const { data: followers } = await supabase.from('capsule_followers').select('user_id').eq('capsule_id', capsuleId);
                const { data: capData } = await supabase.from('capsules').select('title, owner_id').eq('id', capsuleId).single();
                const recipients = new Set((followers || []).map((f: any) => f.user_id));
                if (capData) recipients.add(capData.owner_id);
                recipients.delete(user.id);
                const notifs = Array.from(recipients).map(rid => ({
                    user_id: rid, sender_id: user.id, type: 'item_added', capsule_id: capsuleId,
                    message: `New items were added to "${capData?.title || 'a capsule'}"`
                }));
                if (notifs.length > 0) await supabase.from('notifications').insert(notifs);
            } catch (e) { }

            if (failedUploads.length > 0) {
                setAestheticAlert({
                    visible: true, title: 'Casi listo...',
                    message: `${successfulUploads.length} subidos, ${failedUploads.length} fallaron.`,
                    errors: failedUploads.map(f => f.reason?.includes('allowed size') ? 'Archivo demasiado grande.' : f.reason),
                    onClose: () => { setAestheticAlert(null); navigation.pop(2); }
                });
            } else {
                Alert.alert('¡Listo!', `${entries.length} elemento${entries.length !== 1 ? 's' : ''} guardado${entries.length !== 1 ? 's' : ''}.`);
                navigation.pop(2);
            }
        } catch (err: any) {
            setAestheticAlert({
                visible: true, title: 'Algo salió mal',
                message: err.message?.includes('allowed size') ? 'El archivo es demasiado grande.' : (err.message || 'Error al subir.'),
                onClose: () => setAestheticAlert(null)
            });
        } finally { setLoading(false); }
    };

    const uploadFile = async (uri: string, type: string, userId: string, isThumbnail = false) => {
        let ext = 'jpg';
        const lastDot = uri.lastIndexOf('.');
        if (lastDot !== -1 && lastDot > uri.lastIndexOf('/')) ext = uri.substring(lastDot + 1).split('?')[0];
        else ext = type === 'video' ? 'mp4' : type === 'audio' ? 'm4a' : 'webp';
        const fileName = `${userId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
        const filePath = isThumbnail ? `thumbnails/${fileName}` : `items/${fileName}`;
        try {
            if (!isThumbnail) setUploadProgress(prev => ({ ...prev, [uri]: 20 }));
            const formData = new FormData();
            formData.append('file', { uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''), name: `file.${ext}`, type: type === 'video' ? 'video/mp4' : type === 'audio' ? 'audio/x-m4a' : 'image/jpeg' } as any);
            const { data, error } = await supabase.storage.from('capsule-media').upload(filePath, formData, { contentType: 'multipart/form-data', upsert: true });
            if (error) throw error;
            if (!isThumbnail) setUploadProgress(prev => ({ ...prev, [uri]: 100 }));
            const { data: { publicUrl } } = supabase.storage.from('capsule-media').getPublicUrl(filePath);
            return publicUrl;
        } catch (error: any) {
            throw new Error(`Upload failed: ${error.message || 'Network error'}`);
        }
    };

    const isUploadDisabled = loading
        || (contentType === 'note' && !text)
        || (contentType === 'audio' && !recordedUri)
        || ((contentType === 'image' || contentType === 'video') && mediaList.length === 0);

    const typeConfig: Record<string, { label: string; icon: any; accent: string }> = {
        image: { label: 'Foto', icon: 'image-outline', accent: '#7C3AED' },
        video: { label: 'Video', icon: 'videocam-outline', accent: '#7C3AED' },
        audio: { label: 'Audio', icon: 'mic-outline', accent: '#7C3AED' },
        note: { label: 'Nota', icon: 'document-text-outline', accent: '#7C3AED' },
    };
    const tc = typeConfig[contentType] || typeConfig.note;

    return (
        <View style={[s.root, { paddingTop: insets.top }]}>
            <StatusBar barStyle="dark-content" backgroundColor={P.white} />

            {/* ── Header ── */}
            <View style={s.header}>
                <TouchableOpacity style={s.backBtn} activeOpacity={0.7} onPress={() => navigation.goBack()}>
                    <Ionicons name="chevron-back" size={22} color={P.gray700} />
                </TouchableOpacity>

                <View style={s.headerMid}>
                    <View style={s.typePill}>
                        <Ionicons name={tc.icon} size={12} color={P.p600} />
                        <Text style={s.typePillText}>{tc.label}</Text>
                    </View>
                    <Text style={s.headerTitle}>Nueva memoria</Text>
                </View>

                <TouchableOpacity
                    style={[s.publishBtn, isUploadDisabled && s.publishBtnOff]}
                    activeOpacity={0.85}
                    onPress={handleUpload}
                    disabled={isUploadDisabled}
                >
                    {loading
                        ? <ActivityIndicator size="small" color={P.white} />
                        : <Text style={s.publishBtnText}>Guardar</Text>
                    }
                </TouchableOpacity>
            </View>

            {/* ── Thin accent line below header ── */}
            <View style={s.headerRule} />

            <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
                style={{ flex: 1 }}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
            >
                <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

                    {/* ════════ NOTE ════════ */}
                    {contentType === 'note' && (
                        <View style={s.noteWrapper}>
                            <View style={s.noteTopRow}>
                                <View style={s.noteIconWrap}>
                                    <Ionicons name="create" size={16} color={P.p600} />
                                </View>
                                <Text style={s.noteSectionLabel}>Tu nota</Text>
                            </View>

                            <View style={s.noteField}>
                                <TextInput
                                    style={s.noteInput}
                                    placeholder="Escribe algo que quieras recordar..."
                                    placeholderTextColor={P.gray300}
                                    multiline
                                    value={text}
                                    onChangeText={setText}
                                    autoFocus
                                    autoCorrect={false}
                                    spellCheck={false}
                                />
                                <View style={s.noteFooter}>
                                    <View style={s.noteFooterDot} />
                                    <Text style={s.noteCharCount}>{text.length} caracteres</Text>
                                </View>
                            </View>
                        </View>
                    )}

                    {/* ════════ AUDIO ════════ */}
                    {contentType === 'audio' && (
                        <View style={s.audioCard}>
                            {/* waveform decoration */}
                            <View style={s.waveRow}>
                                {[6, 14, 10, 22, 16, 28, 20, 34, 18, 26, 12, 20, 8, 16, 24, 12].map((h, i) => (
                                    <View
                                        key={i}
                                        style={[
                                            s.wave,
                                            { height: h },
                                            isRecording
                                                ? { backgroundColor: P.p500, opacity: 0.5 + (i % 4) * 0.12 }
                                                : recordedUri
                                                    ? { backgroundColor: P.green, opacity: 0.6 }
                                                    : { backgroundColor: P.p200 },
                                        ]}
                                    />
                                ))}
                            </View>

                            <TouchableOpacity
                                style={s.micBtnOuter}
                                activeOpacity={0.9}
                                onPress={isRecording ? stopRecording : startRecording}
                            >
                                <LinearGradient
                                    colors={
                                        isRecording ? [P.red, '#DC2626'] :
                                            recordedUri ? [P.green, '#059669'] :
                                                [P.p500, P.p800]
                                    }
                                    style={s.micBtnGrad}
                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                                >
                                    <Ionicons
                                        name={isRecording ? 'square' : recordedUri ? 'checkmark' : 'mic'}
                                        size={34} color={P.white}
                                    />
                                </LinearGradient>
                            </TouchableOpacity>

                            <Text style={s.micStatus}>
                                {isRecording ? 'Grabando…' : recordedUri ? '¡Listo!' : 'Toca para grabar'}
                            </Text>
                            <Text style={s.micHint}>
                                {isRecording ? 'Toca de nuevo para detener' : recordedUri ? 'Nota de voz guardada' : 'Nota de voz'}
                            </Text>

                            {recordedUri && (
                                <TouchableOpacity style={s.retryRow} activeOpacity={0.7} onPress={() => setRecordedUri(null)}>
                                    <Ionicons name="refresh-circle-outline" size={16} color={P.red} />
                                    <Text style={s.retryLabel}>Grabar de nuevo</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}

                    {/* ════════ LOCATION SELECTOR ════════ */}
                    <TouchableOpacity 
                        style={s.locationCard} 
                        activeOpacity={0.8} 
                        onPress={() => setLocationModalVisible(true)}
                    >
                        <View style={s.locationInfo}>
                            <View style={[s.locationIconWrap, { backgroundColor: includeLocation ? P.p50 : P.gray100 }]}>
                                <Ionicons 
                                    name="location" 
                                    size={20} 
                                    color={includeLocation ? P.p600 : P.gray400} 
                                />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={s.locationTitle}>Ubicación del contenido</Text>
                                <Text style={s.locationSub} numberOfLines={1}>
                                    {includeLocation && currentLocation ? currentLocation.locationName : 'Configurar ubicación…'}
                                </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color={P.gray300} />
                        </View>
                    </TouchableOpacity>

                    {/* ════════ IMAGE / VIDEO ════════ */}
                    {(contentType === 'image' || contentType === 'video') && (
                        <>
                            {mediaList.length === 0 ? (
                                /* ── Empty picker ── */
                                <View style={s.emptyWrap}>
                                    <View style={s.emptyIcon}>
                                        <LinearGradient colors={[P.p50, P.p100]} style={s.emptyIconGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                                            <Ionicons
                                                name={contentType === 'image' ? 'images-outline' : 'film-outline'}
                                                size={40} color={P.p600}
                                            />
                                        </LinearGradient>
                                    </View>

                                    <Text style={s.emptyTitle}>
                                        {contentType === 'image' ? 'Añade tus fotos' : 'Añade tu video'}
                                    </Text>
                                    <Text style={s.emptySub}>
                                        {contentType === 'image'
                                            ? 'Captura un momento o elige desde la galería'
                                            : 'Máximo 1 minuto · HD listo para guardar'}
                                    </Text>

                                    <View style={s.pickerRow}>
                                        {/* Camera */}
                                        <TouchableOpacity style={s.pickerCardPrimary} activeOpacity={0.85} onPress={captureMediaWithTrack}>
                                            <LinearGradient colors={[P.p500, P.p800]} style={s.pickerCardGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                                                <View style={s.pickerIconCircle}>
                                                    <Ionicons name="camera" size={28} color={P.white} />
                                                </View>
                                                <Text style={s.pickerLabelPrimary}>Cámara</Text>
                                                <Text style={s.pickerSubPrimary}>Captura ahora</Text>
                                            </LinearGradient>
                                        </TouchableOpacity>

                                        {/* Gallery */}
                                        <TouchableOpacity style={s.pickerCardSecondary} activeOpacity={0.85} onPress={pickMediaWithTrack}>
                                            <View style={s.pickerIconCircleGhost}>
                                                <Ionicons name="images-outline" size={28} color={P.p600} />
                                            </View>
                                            <Text style={s.pickerLabelSecondary}>Galería</Text>
                                            <Text style={s.pickerSubSecondary}>Tus fotos</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ) : (
                                /* ── Media strip ── */
                                <>
                                    <View style={s.stripHeader}>
                                        <View style={s.countChip}>
                                            <View style={s.countDot} />
                                            <Text style={s.countText}>
                                                {mediaList.length} {contentType === 'image' ? 'foto' : 'video'}{mediaList.length !== 1 ? 's' : ''}
                                            </Text>
                                        </View>
                                        <TouchableOpacity style={s.addMoreBtn} onPress={handleAddMore} activeOpacity={0.7}>
                                            <Ionicons name="add" size={15} color={P.p600} />
                                            <Text style={s.addMoreText}>Añadir más</Text>
                                        </TouchableOpacity>
                                    </View>

                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.strip}>
                                        {mediaList.map((item, index) => {
                                            const progress = uploadProgress[item.uri] || 0;
                                            return (
                                                <View key={index} style={s.mediaCard}>
                                                    <Image source={{ uri: item.thumbnailUri || item.uri }} style={s.mediaThumb} contentFit="cover" transition={200} />

                                                    <LinearGradient
                                                        colors={['transparent', 'rgba(24,24,27,0.65)']}
                                                        style={StyleSheet.absoluteFill}
                                                        start={{ x: 0, y: 0.45 }} end={{ x: 0, y: 1 }}
                                                    />

                                                    {loading && progress < 100 && (
                                                        <View style={s.progressWrap}>
                                                            <View style={s.progressTrack}>
                                                                <View style={[s.progressFill, { width: `${progress}%` as any }]} />
                                                            </View>
                                                        </View>
                                                    )}

                                                    {contentType === 'video' && (
                                                        <TouchableOpacity style={s.playCircle} activeOpacity={0.7} onPress={() => setPreviewVideo(item.uri)}>
                                                            <Ionicons name="play" size={18} color={P.white} />
                                                        </TouchableOpacity>
                                                    )}
                                                    {contentType === 'video' && (
                                                        <TouchableOpacity style={s.trimChip} activeOpacity={0.8} onPress={() => openTrimModal(index)}>
                                                            <Ionicons name="cut-outline" size={11} color={P.white} />
                                                            <Text style={s.trimChipText}>Cortar</Text>
                                                        </TouchableOpacity>
                                                    )}

                                                    <TouchableOpacity style={s.removeBtn} activeOpacity={0.7} onPress={() => removeMedia(index)}>
                                                        <Ionicons name="close" size={13} color={P.white} />
                                                    </TouchableOpacity>
                                                </View>
                                            );
                                        })}
                                    </ScrollView>
                                </>
                            )}

                            {/* Caption */}
                            <View style={s.captionRow}>
                                <View style={s.captionIconWrap}>
                                    <Ionicons name="chatbubble-ellipses-outline" size={16} color={P.p500} />
                                </View>
                                <TextInput
                                    style={s.captionInput}
                                    placeholder="Añade un pie de foto…"
                                    placeholderTextColor={P.gray300}
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
            </KeyboardAvoidingView>

            {/* ── Video Preview Modal ── */}
            <Modal visible={!!previewVideo} transparent animationType="fade">
                <View style={s.videoModal}>
                    {previewVideo && (
                        <Video source={{ uri: previewVideo }} rate={1.0} volume={1.0} isMuted={false}
                            resizeMode={ResizeMode.CONTAIN} shouldPlay useNativeControls style={s.videoFull} />
                    )}
                    <TouchableOpacity style={s.videoClose} activeOpacity={0.7} onPress={() => setPreviewVideo(null)}>
                        <View style={s.videoCloseCircle}>
                            <Ionicons name="close" size={20} color={P.white} />
                        </View>
                    </TouchableOpacity>
                </View>
            </Modal>

            {/* ── Trim Modal ── */}
            <Modal visible={trimModalVisible} transparent animationType="slide">
                <View style={s.trimOverlay}>
                    {Platform.OS === 'ios'
                        ? <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
                        : <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,8,20,0.93)' }]} />
                    }
                    <View style={s.trimSheet}>
                        <View style={s.trimHandle} />
                        <Text style={s.trimTitle}>Recortar video</Text>

                        {trimmingIndex !== null && mediaList[trimmingIndex] && (
                            <Video source={{ uri: mediaList[trimmingIndex].uri }}
                                rate={1.0} volume={1.0} isMuted={false}
                                resizeMode={ResizeMode.CONTAIN}
                                shouldPlay={trimSeekingValue === null}
                                useNativeControls={false}
                                style={s.trimPreview}
                                positionMillis={trimSeekingValue !== null ? trimSeekingValue : trimStart}
                            />
                        )}

                        <View style={s.trimSliders}>
                            <View style={s.trimRow}>
                                <Text style={s.trimLabel}>Inicio</Text>
                                <View style={s.trimBadge}><Text style={s.trimBadgeText}>{Math.floor(trimStart / 1000)}s</Text></View>
                            </View>
                            <Slider style={{ width: '100%', height: 36 }}
                                minimumValue={0}
                                maximumValue={trimmingIndex !== null ? (mediaList[trimmingIndex]?.duration || 0) : 1000}
                                value={trimStart}
                                onValueChange={val => { setTrimStart(Math.min(val, trimEnd - 1000)); setTrimSeekingValue(val); }}
                                onSlidingComplete={() => setTrimSeekingValue(null)}
                                minimumTrackTintColor={P.p500}
                                maximumTrackTintColor="rgba(255,255,255,0.12)"
                                thumbTintColor={P.p300}
                            />
                            <View style={[s.trimRow, { marginTop: 10 }]}>
                                <Text style={s.trimLabel}>Fin</Text>
                                <View style={s.trimBadge}><Text style={s.trimBadgeText}>{Math.floor(trimEnd / 1000)}s</Text></View>
                            </View>
                            <Slider style={{ width: '100%', height: 36 }}
                                minimumValue={0}
                                maximumValue={trimmingIndex !== null ? (mediaList[trimmingIndex]?.duration || 0) : 1000}
                                value={trimEnd}
                                onValueChange={val => { setTrimEnd(Math.max(val, trimStart + 1000)); setTrimSeekingValue(val); }}
                                onSlidingComplete={() => setTrimSeekingValue(null)}
                                minimumTrackTintColor="rgba(255,255,255,0.12)"
                                maximumTrackTintColor={P.p500}
                                thumbTintColor={P.p300}
                            />
                        </View>

                        <View style={s.trimActions}>
                            <TouchableOpacity style={s.trimCancel} onPress={() => setTrimModalVisible(false)}>
                                <Text style={s.trimCancelText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.trimSave} onPress={saveTrim}>
                                <LinearGradient colors={[P.p500, P.p800]} style={s.trimSaveGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                                    <Text style={s.trimSaveText}>Guardar</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* ── Upload Overlay ── */}
            {loading && (
                <View style={s.uploadOverlay}>
                    <View style={s.uploadCard}>
                        <View style={s.uploadSpinner}>
                            <ActivityIndicator size="large" color={P.p600} />
                        </View>
                        <Text style={s.uploadTitle}>Subiendo…</Text>
                        <Text style={s.uploadSub}>{mediaList.length > 0 ? 'Procesando archivos' : 'Un momento'}</Text>
                    </View>
                </View>
            )}

            {/* ── Aesthetic Alert ── */}
            <Modal visible={!!aestheticAlert?.visible} transparent animationType="fade">
                <View style={s.alertOverlay}>
                    {Platform.OS === 'ios'
                        ? <BlurView intensity={18} tint="light" style={StyleSheet.absoluteFill} />
                        : <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(90,80,120,0.22)' }]} />
                    }
                    <View style={s.alertCard}>
                        <View style={s.alertIconWrap}>
                            <Ionicons name="alert-circle-outline" size={38} color={P.red} />
                        </View>
                        <Text style={s.alertTitle}>{aestheticAlert?.title}</Text>
                        <Text style={s.alertMsg}>{aestheticAlert?.message}</Text>

                        {aestheticAlert?.errors?.length > 0 && (
                            <View style={s.alertErrors}>
                                {aestheticAlert.errors.map((err: string, i: number) => (
                                    <View key={i} style={s.alertErrorItem}>
                                        <View style={s.alertDot} />
                                        <Text style={s.alertErrorText}>{err}</Text>
                                    </View>
                                ))}
                            </View>
                        )}

                        <TouchableOpacity style={s.alertBtn} activeOpacity={0.85} onPress={() => aestheticAlert?.onClose()}>
                            <LinearGradient colors={[P.p500, P.p800]} style={s.alertBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                                <Text style={s.alertBtnText}>Entendido</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ── Location Selector Modal ── */}
            <Modal visible={locationModalVisible} transparent animationType="slide">
                <View style={s.modalOverlay}>
                    <BlurView intensity={90} tint="light" style={StyleSheet.absoluteFill} />
                    <View style={s.locationSheet}>
                        <View style={s.sheetHandle} />
                        <View style={s.sheetHeader}>
                            <Text style={s.sheetTitle}>Ubicación</Text>
                            <TouchableOpacity onPress={() => setLocationModalVisible(false)}>
                                <Ionicons name="close-circle" size={28} color={P.gray300} />
                            </TouchableOpacity>
                        </View>

                        <View style={s.searchWrap}>
                            <Ionicons name="search" size={20} color={P.gray400} />
                            <TextInput
                                style={s.searchField}
                                placeholder="Buscar ciudad…"
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                autoCorrect={false}
                            />
                            {isSearchingLocation && <ActivityIndicator size="small" color={P.p600} />}
                        </View>

                        <ScrollView style={s.optionsScroll} keyboardShouldPersistTaps="handled">
                            {/* Autocomplete Results */}
                            {locationSuggestions.length > 0 && (
                                <View style={s.suggestionsBlock}>
                                    <Text style={s.sectionTitleText}>Sugerencias</Text>
                                    {locationSuggestions.map((item, idx) => (
                                        <TouchableOpacity 
                                            key={idx} 
                                            style={s.optionItem}
                                            onPress={() => {
                                                setCurrentLocation({
                                                    latitude: item.latitude,
                                                    longitude: item.longitude,
                                                    altitude: null,
                                                    locationName: item.locationName
                                                });
                                                setIncludeLocation(true);
                                                setSearchQuery('');
                                                setLocationSuggestions([]);
                                                setLocationModalVisible(false);
                                            }}
                                        >
                                            <View style={[s.optionIcon, { backgroundColor: P.p50 }]}>
                                                <Ionicons name="location-outline" size={20} color={P.p600} />
                                            </View>
                                            <View>
                                                <Text style={s.optionLabel}>{item.locationName}</Text>
                                                <Text style={s.optionSub}>Toca para seleccionar</Text>
                                            </View>
                                        </TouchableOpacity>
                                    ))}
                                    <View style={s.divider} />
                                </View>
                            )}

                            {/* Current Location */}
                            <TouchableOpacity 
                                style={s.optionItem}
                                onPress={async () => {
                                    const loc = await locationService.getCurrentLocation();
                                    if (loc) {
                                        setCurrentLocation(loc);
                                        setIncludeLocation(true);
                                        setLocationModalVisible(false);
                                    }
                                }}
                            >
                                <View style={[s.optionIcon, { backgroundColor: '#EFF6FF' }]}>
                                    <Ionicons name="navigate" size={20} color="#3B82F6" />
                                </View>
                                <View>
                                    <Text style={s.optionLabel}>Ubicación actual</Text>
                                    <Text style={s.optionSub}>Detectar donde estás ahora</Text>
                                </View>
                            </TouchableOpacity>

                            {/* Suggested Location (from EXIF) */}
                            {suggestedLocation && (
                                <TouchableOpacity 
                                    style={s.optionItem}
                                    onPress={() => {
                                        setCurrentLocation(suggestedLocation);
                                        setIncludeLocation(true);
                                        setLocationModalVisible(false);
                                    }}
                                >
                                    <View style={[s.optionIcon, { backgroundColor: '#F0FDF4' }]}>
                                        <Ionicons name="image" size={20} color="#22C55E" />
                                    </View>
                                    <View>
                                        <Text style={s.optionLabel}>Lugar de la foto</Text>
                                        <Text style={s.optionSub} numberOfLines={1}>{suggestedLocation.locationName}</Text>
                                    </View>
                                </TouchableOpacity>
                            )}

                            {/* Clear Location */}
                            <TouchableOpacity 
                                style={s.optionItem}
                                onPress={() => {
                                    setIncludeLocation(false);
                                    setLocationModalVisible(false);
                                }}
                            >
                                <View style={[s.optionIcon, { backgroundColor: P.gray100 }]}>
                                    <Ionicons name="location-outline" size={20} color={P.gray500} />
                                </View>
                                <View>
                                    <Text style={s.optionLabel}>Sin ubicación</Text>
                                    <Text style={s.optionSub}>No mostrar etiquetas de lugar</Text>
                                </View>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: P.white },

    // Header
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingVertical: 12, backgroundColor: P.white,
    },
    headerRule: { height: 1, backgroundColor: P.gray100, marginHorizontal: 0 },
    backBtn: {
        width: 38, height: 38, borderRadius: 19,
        backgroundColor: P.gray100,
        alignItems: 'center', justifyContent: 'center',
    },
    headerMid: { alignItems: 'center', flex: 1, marginHorizontal: 10 },
    typePill: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: P.p100, paddingHorizontal: 10, paddingVertical: 3,
        borderRadius: R.full, marginBottom: 3,
    },
    typePillText: { fontSize: 10, fontWeight: '700', color: P.p600, textTransform: 'uppercase', letterSpacing: 0.8 },
    headerTitle: { fontSize: 16, fontWeight: '700', color: P.gray900 },
    publishBtn: {
        backgroundColor: P.p600, paddingHorizontal: 20, paddingVertical: 10,
        borderRadius: R.full, minWidth: 78, alignItems: 'center',
        ...shadow.purple,
    },
    publishBtnOff: { backgroundColor: P.gray200, ...Platform.select({ ios: { shadowOpacity: 0 }, android: { elevation: 0 } }) },
    publishBtnText: { color: P.white, fontSize: 14, fontWeight: '700' },

    // Scroll
    scroll: { padding: 20, paddingBottom: 60 },

    // ── NOTE
    noteWrapper: { gap: 14 },
    noteTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    noteIconWrap: {
        width: 30, height: 30, borderRadius: 10,
        backgroundColor: P.p100, alignItems: 'center', justifyContent: 'center',
    },
    noteSectionLabel: { fontSize: 13, fontWeight: '700', color: P.p600, letterSpacing: 0.3 },
    noteField: {
        borderWidth: 1.5, borderColor: P.gray200,
        borderRadius: R.lg, backgroundColor: P.white,
        overflow: 'hidden', ...shadow.soft,
    },
    noteInput: {
        fontSize: 16, color: P.gray900, lineHeight: 26,
        minHeight: 230, textAlignVertical: 'top', padding: 20,
    },
    noteFooter: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: 20, paddingVertical: 12,
        borderTopWidth: 1, borderTopColor: P.gray100,
    },
    noteFooterDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: P.p300 },
    noteCharCount: { fontSize: 12, color: P.gray400, fontWeight: '500' },

    // ── AUDIO
    audioCard: {
        alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 6,
        backgroundColor: P.p50, borderRadius: R.xl,
        borderWidth: 1.5, borderColor: P.p100, marginTop: 8,
        ...shadow.soft,
    },
    waveRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 28, height: 40 },
    wave: { width: 3.5, borderRadius: 2 },
    micBtnOuter: {
        width: 96, height: 96, borderRadius: 48, overflow: 'hidden',
        ...shadow.purple,
    },
    micBtnGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    micStatus: { fontSize: 18, fontWeight: '700', color: P.gray900, marginTop: 22 },
    micHint: { fontSize: 13, color: P.gray400, marginBottom: 10 },

    // Location Modal
    modalOverlay: { flex: 1, justifyContent: 'flex-end' },
    locationSheet: {
        backgroundColor: P.white,
        borderTopLeftRadius: 32, borderTopRightRadius: 32,
        paddingHorizontal: 20, paddingBottom: 40,
        height: '75%', ...shadow.medium,
    },
    sheetHandle: {
        width: 40, height: 5, backgroundColor: P.gray200,
        borderRadius: 3, alignSelf: 'center', marginVertical: 12,
    },
    sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    sheetTitle: { fontSize: 20, fontWeight: '800', color: P.gray900 },
    searchWrap: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: P.gray100, borderRadius: R.md,
        paddingHorizontal: 15, height: 54, marginBottom: 20,
    },
    searchField: { flex: 1, fontSize: 16, color: P.gray900, fontWeight: '600' },
    optionsScroll: { flex: 1 },
    optionItem: {
        flexDirection: 'row', alignItems: 'center', gap: 16,
        paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: P.gray50,
    },
    optionIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    optionLabel: { fontSize: 16, fontWeight: '700', color: P.gray900, marginBottom: 2 },
    optionSub: { fontSize: 13, color: P.gray500, fontWeight: '500' },
    suggestionsBlock: { marginBottom: 10 },
    sectionTitleText: { fontSize: 12, fontWeight: '800', color: P.gray400, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginLeft: 5 },
    divider: { height: 1, backgroundColor: P.gray100, marginVertical: 15, marginHorizontal: 10 },
    retryRow: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 16, paddingVertical: 9,
        borderRadius: R.full, borderWidth: 1.5,
        borderColor: P.red + '35', backgroundColor: P.redPale, marginTop: 6,
    },
    retryLabel: { color: P.red, fontSize: 13, fontWeight: '600' },

    // ── EMPTY STATE
    emptyWrap: { alignItems: 'center', paddingVertical: 32, gap: 0 },
    emptyIcon: { width: 110, height: 110, borderRadius: 55, overflow: 'hidden', marginBottom: 22, ...shadow.soft },
    emptyIconGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyTitle: { fontSize: 22, fontWeight: '700', color: P.gray900, marginBottom: 8 },
    emptySub: { fontSize: 14, color: P.gray400, textAlign: 'center', lineHeight: 20, marginBottom: 30 },
    pickerRow: { flexDirection: 'row', gap: 14, width: '100%' },

    pickerCardPrimary: { flex: 1, borderRadius: R.lg, overflow: 'hidden', ...shadow.purple },
    pickerCardGrad: { padding: 22, alignItems: 'center', gap: 10 },
    pickerIconCircle: {
        width: 54, height: 54, borderRadius: 27,
        backgroundColor: 'rgba(255,255,255,0.18)',
        alignItems: 'center', justifyContent: 'center', marginBottom: 2,
    },
    pickerLabelPrimary: { fontSize: 15, fontWeight: '700', color: P.white },
    pickerSubPrimary: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },

    pickerCardSecondary: {
        flex: 1, borderRadius: R.lg,
        backgroundColor: P.white, borderWidth: 1.5, borderColor: P.gray200,
        padding: 22, alignItems: 'center', gap: 10, ...shadow.soft,
    },
    pickerIconCircleGhost: {
        width: 54, height: 54, borderRadius: 27,
        backgroundColor: P.p100, alignItems: 'center', justifyContent: 'center', marginBottom: 2,
    },
    pickerLabelSecondary: { fontSize: 15, fontWeight: '700', color: P.gray900 },
    pickerSubSecondary: { fontSize: 12, color: P.gray400 },

    // ── STRIP
    stripHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14,
    },
    countChip: {
        flexDirection: 'row', alignItems: 'center', gap: 7,
        backgroundColor: P.p100, paddingHorizontal: 12, paddingVertical: 6, borderRadius: R.full,
    },
    countDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: P.p600 },
    countText: { fontSize: 13, fontWeight: '700', color: P.p600 },
    addMoreBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 12, paddingVertical: 6,
        borderRadius: R.full, borderWidth: 1.5, borderColor: P.p200,
        backgroundColor: P.white,
    },
    addMoreText: { fontSize: 13, fontWeight: '600', color: P.p600 },

    strip: { paddingBottom: 4, gap: 12, paddingRight: 4 },
    mediaCard: {
        width: 146, height: 254, borderRadius: R.lg,
        overflow: 'hidden', backgroundColor: P.gray100,
        ...shadow.medium,
    },
    mediaThumb: { width: '100%', height: '100%' },
    progressWrap: { position: 'absolute', bottom: 14, left: 12, right: 12 },
    progressTrack: { height: 3, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 2, overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: P.white, borderRadius: 2 },
    playCircle: {
        position: 'absolute', top: '50%', left: '50%',
        marginTop: -22, marginLeft: -22,
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.42)',
        alignItems: 'center', justifyContent: 'center',
    },
    trimChip: {
        position: 'absolute', bottom: 32, left: 10,
        flexDirection: 'row', alignItems: 'center', gap: 3,
        backgroundColor: 'rgba(0,0,0,0.48)',
        borderRadius: R.xs, paddingHorizontal: 8, paddingVertical: 5,
    },
    trimChipText: { color: P.white, fontSize: 11, fontWeight: '600' },
    removeBtn: {
        position: 'absolute', top: 10, right: 10,
        width: 26, height: 26, borderRadius: 13,
        backgroundColor: 'rgba(0,0,0,0.48)',
        alignItems: 'center', justifyContent: 'center',
    },

    // Caption
    captionRow: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: P.white, borderWidth: 1.5, borderColor: P.gray200,
        borderRadius: R.md, paddingHorizontal: 16, marginTop: 18,
        ...shadow.soft,
    },
    captionIconWrap: {
        width: 32, height: 32, borderRadius: 10,
        backgroundColor: P.p50, alignItems: 'center', justifyContent: 'center',
    },
    captionInput: { flex: 1, paddingVertical: 14, fontSize: 15, color: P.gray900 },

    // Video Modal
    videoModal: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
    videoFull: { width: '100%', height: '80%' },
    videoClose: { position: 'absolute', top: 56, right: 20 },
    videoCloseCircle: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.14)',
        alignItems: 'center', justifyContent: 'center',
    },

    // Trim Modal
    trimOverlay: { flex: 1, justifyContent: 'flex-end' },
    trimSheet: {
        backgroundColor: '#0F0D1A', borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl,
        padding: 28, paddingBottom: 40, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    },
    trimHandle: {
        width: 38, height: 4, borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.18)', alignSelf: 'center', marginBottom: 20,
    },
    trimTitle: { fontSize: 17, fontWeight: '700', color: P.white, textAlign: 'center', marginBottom: 18 },
    trimPreview: { width: '100%', height: 180, borderRadius: R.md, marginBottom: 22, backgroundColor: '#000' },
    trimSliders: { marginBottom: 6 },
    trimRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    trimLabel: { fontSize: 12, color: 'rgba(255,255,255,0.45)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
    trimBadge: {
        backgroundColor: P.p600 + '30', paddingHorizontal: 10, paddingVertical: 3,
        borderRadius: R.full, borderWidth: 1, borderColor: P.p500 + '50',
    },
    trimBadgeText: { fontSize: 12, color: P.p300, fontWeight: '700' },
    trimActions: { flexDirection: 'row', gap: 12, marginTop: 22 },
    trimCancel: {
        flex: 1, paddingVertical: 15, alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: R.full,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    },
    trimCancelText: { color: 'rgba(255,255,255,0.65)', fontWeight: '600' },
    trimSave: { flex: 1, borderRadius: R.full, overflow: 'hidden' },
    trimSaveGrad: { paddingVertical: 15, alignItems: 'center' },
    trimSaveText: { color: P.white, fontWeight: '700' },

    // Upload Overlay
    uploadOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255,255,255,0.9)',
        alignItems: 'center', justifyContent: 'center', zIndex: 999,
    },
    uploadCard: {
        alignItems: 'center', gap: 10, backgroundColor: P.white,
        borderRadius: R.xl, padding: 36,
        borderWidth: 1, borderColor: P.gray100, ...shadow.medium,
    },
    uploadSpinner: {
        width: 70, height: 70, borderRadius: 35,
        backgroundColor: P.p50, alignItems: 'center', justifyContent: 'center', marginBottom: 2,
    },
    uploadTitle: { fontSize: 17, fontWeight: '700', color: P.gray900 },
    uploadSub: { fontSize: 13, color: P.gray400 },

    // Alert
    alertOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    alertCard: {
        width: '88%', backgroundColor: P.white,
        borderRadius: R.xl, padding: 28, alignItems: 'center',
        borderWidth: 1, borderColor: P.gray100, ...shadow.medium,
    },
    alertIconWrap: {
        width: 70, height: 70, borderRadius: 35,
        backgroundColor: P.redPale, alignItems: 'center', justifyContent: 'center', marginBottom: 14,
    },
    alertTitle: { fontSize: 19, fontWeight: '700', color: P.gray900, marginBottom: 6, textAlign: 'center' },
    alertMsg: { fontSize: 14, color: P.gray500, textAlign: 'center', lineHeight: 21, marginBottom: 18 },
    alertErrors: {
        width: '100%', backgroundColor: P.gray50, borderRadius: R.md,
        padding: 14, marginBottom: 22, gap: 8, borderWidth: 1, borderColor: P.gray100,
    },
    alertErrorItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    alertDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: P.red, marginTop: 7 },
    alertErrorText: { fontSize: 13, color: P.gray500, flex: 1, lineHeight: 19 },
    alertBtn: { width: '100%', borderRadius: R.full, overflow: 'hidden' },
    alertBtnGrad: { paddingVertical: 15, alignItems: 'center' },
    alertBtnText: { color: P.white, fontSize: 15, fontWeight: '700' },

    // ── LOCATION TOGGLE
    locationCard: {
        marginTop: 20,
        backgroundColor: P.white,
        borderRadius: R.md,
        padding: 16,
        borderWidth: 1.5,
        borderColor: P.gray200,
        ...shadow.soft,
    },
    locationInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    locationIconWrap: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    locationTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: P.gray900,
    },
    locationSub: {
        fontSize: 12,
        color: P.gray400,
        marginTop: 2,
    },
    toggleBase: {
        width: 48,
        height: 26,
        borderRadius: 13,
        backgroundColor: P.gray200,
        padding: 2,
        justifyContent: 'center',
    },
    toggleActive: {
        backgroundColor: P.p600,
    },
    toggleCircle: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: P.white,
    },
    toggleCircleActive: {
        alignSelf: 'flex-end',
    },
});
