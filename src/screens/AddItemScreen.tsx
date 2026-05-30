import React, { useState, useEffect, useRef } from 'react';
import * as ExpoLocation from 'expo-location';
import {
    View, Text, StyleSheet, TouchableOpacity, TextInput,
    ActivityIndicator, SafeAreaView, ScrollView, Alert,
    Platform, Modal, StatusBar, Dimensions, KeyboardAvoidingView, Animated
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
import { MODEL_IMAGES, MODEL_IMAGES_OPEN } from '../constants/models';
import { P, R, shadow } from '../theme';
import ViewShot from 'react-native-view-shot';
import Svg, { Path as SvgPath } from 'react-native-svg';
import { PanResponder } from 'react-native';

const { width } = Dimensions.get('window');
const MAX_VIDEO_DURATION_MS = 10 * 60 * 1000;
const UNDO_UPLOAD_DELAY_MS = 5000;

const createUploadBatchId = () =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.floor(Math.random() * 16);
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });

const stripBatchMarker = (value?: string | null) =>
    (value || '').replace(/!!b:[^\s]+/g, '').trim();

const isLockedSealedCapsule = (capsule: any) => {
    if (!capsule || capsule.status !== 'sealed') return false;
    if (capsule.is_opening) return true;
    if (!capsule.opens_at) return false;
    return new Date(capsule.opens_at).getTime() <= Date.now();
};

// ─── Design Tokens ────────────────────────────────────────────────────────────
// Imported from ../theme/DesignTokens
// ─────────────────────────────────────────────────────────────────────────────

export default function AddItemScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute();
    const { t } = useTranslation();
    const { capsuleId, type: contentType }: any = route.params || {};
    const insets = useSafeAreaInsets();

    const [loading, setLoading] = useState(false);
    const [isProcessingMedia, setIsProcessingMedia] = useState(false);
    const [processingMediaLabel, setProcessingMediaLabel] = useState('');
    const [scrollEnabled, setScrollEnabled] = useState(true);
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

    // --- New Capsule Selection State ---
    const [myCapsules, setMyCapsules] = useState<any[]>([]);
    const [selectedCapsule, setSelectedCapsule] = useState<any>(null);
    const [capsuleSelectorVisible, setCapsuleSelectorVisible] = useState(false);
    const [isLoadingCapsules, setIsLoadingCapsules] = useState(false);

    // --- Handwriting State ---
    const [isHandwriting, setIsHandwriting] = useState(false);
    const [paths, setPaths] = useState<string[]>([]);
    const [currentPath, setCurrentPath] = useState<string>('');
    const currentPathRef = useRef<string>('');
    const viewShotRef = React.useRef<any>(null);

    const panResponder = React.useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onStartShouldSetPanResponderCapture: () => true,
            onMoveShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponderCapture: () => true,
            onPanResponderGrant: (evt) => {
                setScrollEnabled(false);
                const { locationX, locationY } = evt.nativeEvent;
                if (locationX != null && locationY != null) {
                    const startPoint = `M${locationX} ${locationY}`;
                    currentPathRef.current = startPoint;
                    setCurrentPath(startPoint);
                }
            },
            onPanResponderMove: (evt) => {
                const { locationX, locationY } = evt.nativeEvent;
                if (locationX != null && locationY != null) {
                    const newPoint = ` L${locationX} ${locationY}`;
                    currentPathRef.current += newPoint;
                    setCurrentPath(currentPathRef.current);
                }
            },
            onPanResponderRelease: (evt) => {
                const { locationX, locationY } = evt.nativeEvent;
                const finalPoint = locationX != null ? ` L${locationX} ${locationY}` : '';
                const fullPath = currentPathRef.current + finalPoint;
                
                if (fullPath) {
                    setPaths(prev => [...prev, fullPath]);
                }
                
                currentPathRef.current = '';
                setCurrentPath('');
                setScrollEnabled(true);
            },
            onPanResponderTerminate: () => {
                if (currentPathRef.current) {
                    setPaths(prev => [...prev, currentPathRef.current]);
                }
                currentPathRef.current = '';
                setCurrentPath('');
                setScrollEnabled(true);
            }
        })
    ).current;

    // --- Undo Logic State ---
    const [isUndoOverlayVisible, setIsUndoOverlayVisible] = useState(false);
    const undoProgress = useRef(new Animated.Value(0)).current;
    const undoTimerRef = useRef<NodeJS.Timeout | null>(null);
    const uploadCancelledRef = useRef(false);
    const uploadedPathsRef = useRef<string[]>([]);
    const activeUploadRequestsRef = useRef<XMLHttpRequest[]>([]);
    const [pendingUploadData, setPendingUploadData] = useState<any>(null);

    useEffect(() => {
        if (!capsuleId) {
            fetchMyCapsules();
            setCapsuleSelectorVisible(true);
        } else {
            // Fetch the specific capsule info if needed for the header
            fetchTargetCapsule(capsuleId);
        }
    }, [capsuleId]);

    const fetchMyCapsules = async () => {
        setIsLoadingCapsules(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            // Fetch capsules where I am owner OR I am a member (accepted invite)
            const { data, error } = await supabase.rpc('get_my_available_capsules', { p_user_id: user.id });
            if (data) setMyCapsules((data || []).filter((cap: any) => !isLockedSealedCapsule(cap)));
            else if (error) {
                // Fallback to owned capsules if RPC fails
                const { data: owned } = await supabase
                    .from('capsules')
                    .select('*, profiles:owner_id(username, avatar_url, display_name)')
                    .eq('owner_id', user.id)
                    .order('created_at', { ascending: false });
                if (owned) setMyCapsules((owned || []).filter((cap: any) => !isLockedSealedCapsule(cap)));
            }
        }
        setIsLoadingCapsules(false);
    };

    const fetchTargetCapsule = async (id: string) => {
        const { data } = await supabase
            .from('capsules')
            .select('*, profiles:owner_id(username, avatar_url, display_name)')
            .eq('id', id)
            .single();
        if (data) setSelectedCapsule(data);
    };

    useEffect(() => {
        if (!selectedCapsule || !isLockedSealedCapsule(selectedCapsule)) return;
        Alert.alert(
            'Cápsula bloqueada',
            'Esta cápsula sellada ya está lista para abrirse y no admite más contenido.',
            [{ text: 'Entendido', onPress: () => navigation.goBack() }]
        );
    }, [selectedCapsule, navigation]);

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
        setIsProcessingMedia(true);
        setProcessingMediaLabel(contentType === 'video' ? 'Procesando video...' : 'Preparando contenido...');
        const processed: any[] = [];
        try {
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
                        setProcessingMediaLabel('Optimizando imagen...');
                        const optimizedUri = await optimizeImageForUpload(asset.uri);
                        const thumbUri = await optimizeThumbnailForUpload(asset.uri);
                        const r = await ImageManipulator.manipulateAsync(optimizedUri, [], {});
                        cur = { ...cur, uri: optimizedUri, thumbnailUri: thumbUri, width: r.width, height: r.height };
                    } catch (e) { }
                } else if (contentType === 'video') {
                    try {
                        if (asset.duration && asset.duration > MAX_VIDEO_DURATION_MS + 1000) {
                            Alert.alert('Error', 'Los videos pueden durar hasta 10 minutos.');
                            return;
                        }
                        setProcessingMediaLabel('Creando miniatura del video...');
                        const { uri: rawThumbUri } = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 1000 });
                        setProcessingMediaLabel('Preparando miniatura...');
                        const optimizedThumbUri = await optimizeThumbnailForUpload(rawThumbUri);
                        cur.thumbnailUri = optimizedThumbUri; cur.duration = asset.duration;
                    } catch (e) { }
                }
                processed.push(cur);
            }
            setMediaList(prev => [...prev, ...processed]);
        } finally {
            setIsProcessingMedia(false);
            setProcessingMediaLabel('');
        }
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
                videoMaxDuration: 600,
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
                videoMaxDuration: 600,
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

    const handleCancelUpload = () => {
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        undoTimerRef.current = null;
        setIsUndoOverlayVisible(false);
        undoProgress.setValue(0);
        uploadCancelledRef.current = true;
    };

    const handleCancelActiveUpload = async () => {
        uploadCancelledRef.current = true;
        activeUploadRequestsRef.current.forEach(req => {
            try { req.abort(); } catch (e) {}
        });
        activeUploadRequestsRef.current = [];
        setLoading(false);
        setUploadProgress({});
        const uploaded = [...uploadedPathsRef.current];
        uploadedPathsRef.current = [];
        if (uploaded.length > 0) {
            try { await supabase.storage.from('capsule-media').remove(uploaded); } catch (e) {}
        }
    };

    const handleUpload = async () => {
        if (loading || isUndoOverlayVisible) return;
        if (isLockedSealedCapsule(selectedCapsule)) {
            Alert.alert('No disponible', 'Esta cápsula sellada ya está lista para abrirse y no admite más contenido.');
            return;
        }
        if (contentType === 'note' && !text && (!isHandwriting || paths.length === 0)) return;
        if (contentType === 'audio' && !recordedUri) return;
        if ((contentType === 'image' || contentType === 'video') && mediaList.length === 0) return;

        // Show Undo Overlay first
        uploadCancelledRef.current = false;
        setIsUndoOverlayVisible(true);
        undoProgress.setValue(0);
        
        Animated.timing(undoProgress, {
            toValue: 1,
            duration: UNDO_UPLOAD_DELAY_MS,
            useNativeDriver: false,
        }).start();

        undoTimerRef.current = setTimeout(() => {
            setIsUndoOverlayVisible(false);
            performActualUpload();
        }, UNDO_UPLOAD_DELAY_MS);
    };

    const performActualUpload = async () => {
        if (loading) return;
        if (isLockedSealedCapsule(selectedCapsule)) {
            throw new Error('Esta cápsula sellada ya está lista para abrirse y no admite más contenido.');
        }
        if (contentType === 'note' && !text && (!isHandwriting || paths.length === 0)) return;
        if (contentType === 'audio' && !recordedUri) return;
        if ((contentType === 'image' || contentType === 'video') && mediaList.length === 0) return;

        const batchId = createUploadBatchId();
        uploadCancelledRef.current = false;
        uploadedPathsRef.current = [];
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');
            let results;
            if (contentType === 'audio' && recordedUri) {
                const url = await uploadFile(recordedUri, 'audio', user.id);
                results = [{ status: 'fulfilled', value: { mediaUrl: url, thumbUrl: null, duration: audioDuration, type: 'audio' } }];
            } else if (mediaList.length > 0) {
                results = await uploadInChunks(mediaList, user);
            } else if (contentType === 'note') {
                results = [{ status: 'fulfilled', value: { mediaUrl: '', thumbUrl: '', duration: null, type: 'note' } }];
            } else {
                throw new Error('No content to upload');
            }

            const successfulUploads: any[] = [];
            const failedUploads: any[] = [];
            
            results.forEach((res: any) => {
                if (res.status === 'fulfilled') successfulUploads.push(res.value);
                else failedUploads.push({ reason: res.reason || 'Unknown error' });
            });

            if (uploadCancelledRef.current) throw new Error('UPLOAD_CANCELLED');
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
                    capsule_id: capsuleId || selectedCapsule?.id, owner_id: user.id,
                    media_url: res.mediaUrl || '', thumbnail_url: res.thumbUrl || '',
                    media_type: res.type, content: contentStr,
                    batch_id: batchId,
                    caption: caption ? `${caption} !!b:${batchId}` : `!!b:${batchId}`,
                    latitude: includeLocation ? currentLocation?.latitude : null,
                    longitude: includeLocation ? currentLocation?.longitude : null,
                    location_name: includeLocation ? currentLocation?.locationName : null,
                    altitude: includeLocation ? (currentLocation as any)?.altitude : null,
                };
            });

            let finalEntries = entries;

            // Handle Handwriting Capture
            if (contentType === 'note' && isHandwriting && viewShotRef.current) {
                try {
                    const uri = await viewShotRef.current.capture();
                    const url = await uploadFile(uri, 'image', user.id);
                    finalEntries = entries.map(e => ({
                        ...e,
                        media_url: url,
                        media_type: 'image',
                        content: 'Nota manuscrita'
                    }));
                } catch (e) {
                    console.error('Handwriting capture failed:', e);
                }
            }

            if (uploadCancelledRef.current) throw new Error('UPLOAD_CANCELLED');
            setProcessingMediaLabel('Revisando contenido...');
            const moderatedEntries = [];
            for (const entry of finalEntries) {
                const { data: moderation, error: moderationError } = await supabase.functions.invoke('moderate-content', {
                    body: {
                        owner_id: user.id,
                        capsule_id: entry.capsule_id,
                        media_url: entry.media_url,
                        thumbnail_url: entry.thumbnail_url,
                        media_type: entry.media_type,
                        content: entry.media_type === 'note' || contentType === 'note' ? text : entry.content,
                        caption: stripBatchMarker(entry.caption),
                    },
                });

                if (moderationError) {
                    moderatedEntries.push({
                        ...entry,
                        moderation_status: 'pending',
                        moderation_reason: 'Moderation temporarily unavailable',
                        moderation_review_id: null,
                        moderated_at: null,
                    });
                    continue;
                }

                if (moderation?.action === 'block') {
                    const blockedError = new Error(moderation?.reason || 'CONTENT_BLOCKED');
                    (blockedError as any).code = 'CONTENT_BLOCKED';
                    throw blockedError;
                }

                if (!moderation?.ok || moderation?.action === 'review' || moderation?.status === 'error') {
                    moderatedEntries.push({
                        ...entry,
                        moderation_status: moderation?.status === 'error' ? 'pending' : 'needs_review',
                        moderation_reason: moderation?.reason || 'Pending moderation review',
                        moderation_review_id: moderation?.review_id || null,
                        moderated_at: new Date().toISOString(),
                    });
                    continue;
                }

                moderatedEntries.push({
                    ...entry,
                    moderation_status: 'approved',
                    moderation_reason: moderation?.reason || null,
                    moderation_review_id: moderation?.review_id || null,
                    moderated_at: new Date().toISOString(),
                });
            }
            finalEntries = moderatedEntries;

            const { error: dbError } = await supabase.from('capsule_items').insert(finalEntries);
            if (dbError) throw dbError;
            uploadedPathsRef.current = [];

            // Notifications will be handled by a Database Trigger for better performance

            if (failedUploads.length > 0) {
                setAestheticAlert({
                    visible: true, title: 'Casi listo...',
                    message: `${successfulUploads.length} subidos, ${failedUploads.length} fallaron.`,
                    errors: failedUploads.map(f => f.reason?.includes('allowed size') ? 'Archivo demasiado grande.' : f.reason),
                    onClose: () => { setAestheticAlert(null); navigation.pop(2); }
                });
            } else {
                Alert.alert(t('add.save_success'), t('add.save_success_msg', { count: entries.length }));
                navigation.pop(2);
            }
        } catch (err: any) {
            if (err.message === 'UPLOAD_CANCELLED') {
                const uploaded = [...uploadedPathsRef.current];
                uploadedPathsRef.current = [];
                if (uploaded.length > 0) {
                    try { await supabase.storage.from('capsule-media').remove(uploaded); } catch (e) {}
                }
                return;
            }
            const uploaded = [...uploadedPathsRef.current];
            uploadedPathsRef.current = [];
            if (uploaded.length > 0) {
                try { await supabase.storage.from('capsule-media').remove(uploaded); } catch (e) {}
            }
            const isBlocked = err.code === 'CONTENT_BLOCKED';
            const moderationUnavailable = err.message === 'MODERATION_UNAVAILABLE';
            setAestheticAlert({
                visible: true,
                title: isBlocked ? 'Contenido bloqueado' : t('common.error'),
                message: isBlocked
                    ? 'Este contenido no se puede publicar porque incumple las normas de seguridad de Kapsely.'
                    : moderationUnavailable
                        ? 'No hemos podido revisar el contenido ahora mismo. Inténtalo de nuevo en unos segundos.'
                        : err.message?.includes('allowed size') ? 'El archivo es demasiado grande.' : (err.message || 'Error al subir.'),
                onClose: () => setAestheticAlert(null)
            });
        } finally { setLoading(false); uploadCancelledRef.current = false; }
    };

    const uploadFile = async (uri: string, type: string, userId: string, isThumbnail = false, onProgress?: (p: number) => void) => {
        let ext = 'jpg';
        const lastDot = uri.lastIndexOf('.');
        if (lastDot !== -1 && lastDot > uri.lastIndexOf('/')) ext = uri.substring(lastDot + 1).split('?')[0];
        else ext = type === 'video' ? 'mp4' : type === 'audio' ? 'm4a' : 'webp';
        
        const fileName = `${userId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
        const filePath = isThumbnail ? `thumbnails/${fileName}` : `items/${fileName}`;
        const mimeType = type === 'video'
            ? 'video/mp4'
            : type === 'audio'
                ? 'audio/x-m4a'
                : ext.toLowerCase() === 'webp'
                    ? 'image/webp'
                    : 'image/jpeg';
        
        try {
            if (uploadCancelledRef.current) throw new Error('UPLOAD_CANCELLED');
            if (!isThumbnail && onProgress) onProgress(10);

            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) throw new Error('Not authenticated');

            await new Promise<void>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                activeUploadRequestsRef.current.push(xhr);
                xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/capsule-media/${filePath}`);
                xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
                xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
                xhr.setRequestHeader('x-upsert', 'true');
                xhr.setRequestHeader('Content-Type', mimeType);

                xhr.upload.onprogress = (event) => {
                    if (!isThumbnail && onProgress && event.lengthComputable && event.total > 0) {
                        const pct = Math.min(95, Math.max(10, Math.round((event.loaded / event.total) * 95)));
                        onProgress(pct);
                    }
                };
                xhr.onload = () => {
                    activeUploadRequestsRef.current = activeUploadRequestsRef.current.filter(req => req !== xhr);
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve();
                    } else {
                        let message = xhr.responseText || `HTTP ${xhr.status}`;
                        try {
                            const parsed = JSON.parse(xhr.responseText);
                            message = parsed.message || parsed.error || message;
                        } catch (e) {}
                        reject(new Error(message));
                    }
                };
                xhr.onerror = () => {
                    activeUploadRequestsRef.current = activeUploadRequestsRef.current.filter(req => req !== xhr);
                    reject(new Error('Network error'));
                };
                xhr.onabort = () => {
                    activeUploadRequestsRef.current = activeUploadRequestsRef.current.filter(req => req !== xhr);
                    reject(new Error('UPLOAD_CANCELLED'));
                };
                xhr.send({
                    uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
                    name: `file.${ext}`,
                    type: mimeType,
                } as any);
            });

            uploadedPathsRef.current.push(filePath);
            if (uploadCancelledRef.current) throw new Error('UPLOAD_CANCELLED');
            if (!isThumbnail && onProgress) onProgress(100);
            
            const { data: { publicUrl } } = supabase.storage.from('capsule-media').getPublicUrl(filePath);
            return publicUrl;
        } catch (error: any) {
            if (error.message === 'UPLOAD_CANCELLED') throw error;
            throw new Error(`Upload failed: ${error.message || 'Network error'}`);
        }
    };

    // Helper to process uploads in chunks to prevent freezing
    const uploadInChunks = async (items: any[], user: any) => {
        const results = [];
        const CHUNK_SIZE = contentType === 'video' ? 1 : 3; // large videos upload more reliably one at a time
        
        for (let i = 0; i < items.length; i += CHUNK_SIZE) {
            const chunk = items.slice(i, i + CHUNK_SIZE);
            const chunkPromises = chunk.map(async (media, indexInChunk) => {
                const globalIndex = i + indexInChunk;
                try {
                    const mediaUpload = uploadFile(media.uri, contentType, user.id, false, (p) => {
                        setUploadProgress(prev => ({ ...prev, [media.uri]: p }));
                    });
                    
                    const thumbUpload = media.thumbnailUri
                        ? uploadFile(media.thumbnailUri, 'image', user.id, true).catch(() => null)
                        : Promise.resolve(null);
                    const [mediaUrl, thumbUrl] = await Promise.all([mediaUpload, thumbUpload]);
                    
                    return { status: 'fulfilled', value: { mediaUrl, thumbUrl, duration: media.duration, type: contentType, originalMedia: media } };
                } catch (e: any) {
                    return { status: 'rejected', reason: e.message, index: globalIndex };
                }
            });
            
            const chunkResults = await Promise.all(chunkPromises);
            results.push(...chunkResults);
        }
        return results;
    };

    const isUploadDisabled = loading || isProcessingMedia
        || (contentType === 'note' && !text && (!isHandwriting || paths.length === 0))
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
            {/* Ambient Background Orbs */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <View style={[s.orb, { top: -50, right: -100, width: 350, height: 350, backgroundColor: '#F5F3FF' }]} />
                <View style={[s.orb, { bottom: 100, left: -80, width: 250, height: 250, backgroundColor: '#FFF1F2' }]} />
            </View>
            <StatusBar barStyle="dark-content" />

            {/* ── Header ── */}
            <View style={s.header}>
                <TouchableOpacity style={s.backBtn} activeOpacity={0.7} onPress={() => navigation.goBack()}>
                    <Ionicons name="close-outline" size={26} color={P.gray900} />
                </TouchableOpacity>

                <View style={s.headerMid}>
                    <Text style={s.headerTitle}>{t('add.new_memory')}</Text>
                    <TouchableOpacity 
                        style={s.targetPill} 
                        activeOpacity={0.7}
                        onPress={() => {
                            fetchMyCapsules();
                            setCapsuleSelectorVisible(true);
                        }}
                    >
                        <Text style={s.targetPillLabel}>En: </Text>
                        <Text style={s.targetPillValue} numberOfLines={1}>
                            {selectedCapsule?.title || t('common.search')}
                        </Text>
                        <Ionicons name="chevron-down" size={14} color={P.p600} />
                    </TouchableOpacity>
                </View>

                <TouchableOpacity
                    style={[s.publishBtn, (isUploadDisabled || (!capsuleId && !selectedCapsule)) && s.publishBtnOff]}
                    activeOpacity={0.85}
                    onPress={handleUpload}
                    disabled={isUploadDisabled || (!capsuleId && !selectedCapsule)}
                >
                    <LinearGradient 
                        colors={isUploadDisabled || (!capsuleId && !selectedCapsule) ? [P.gray100, P.gray200] : [P.p500, P.p700]} 
                        style={s.publishBtnGrad}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    >
                        {loading || isProcessingMedia
                            ? <ActivityIndicator size="small" color={P.white} />
                            : <Text style={s.publishBtnText}>{t('add.save_btn')}</Text>
                        }
                    </LinearGradient>
                </TouchableOpacity>
            </View>

            {/* ── Thin accent line below header ── */}
            <View style={s.headerRule} />

            <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
                style={{ flex: 1 }}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
            >
                <ScrollView 
                    contentContainerStyle={s.scroll} 
                    keyboardShouldPersistTaps="handled" 
                    showsVerticalScrollIndicator={false}
                    scrollEnabled={scrollEnabled}
                >

                    {/* ════════ NOTE ════════ */}
                    {contentType === 'note' && (
                        <View style={s.noteWrapper}>
                            {/* Note Mode Selector */}
                            <View style={s.noteModeSelector}>
                                <TouchableOpacity 
                                    style={[s.noteModeBtn, !isHandwriting && s.noteModeBtnActive]} 
                                    onPress={() => setIsHandwriting(false)}
                                >
                                    <Ionicons name="text-outline" size={18} color={!isHandwriting ? P.white : P.gray400} />
                                    <Text style={[s.noteModeText, !isHandwriting && s.noteModeTextActive]}>{t('add.keyboard')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity 
                                    style={[s.noteModeBtn, isHandwriting && s.noteModeBtnActive]} 
                                    onPress={() => setIsHandwriting(true)}
                                >
                                    <Ionicons name="brush-outline" size={18} color={isHandwriting ? P.white : P.gray400} />
                                    <Text style={[s.noteModeText, isHandwriting && s.noteModeTextActive]}>{t('add.handwriting')}</Text>
                                </TouchableOpacity>
                            </View>

                            {!isHandwriting ? (
                                <View style={s.noteCard}>
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
                                        <View style={s.noteSignatureLine} />
                                        <View style={s.noteCharBadge}>
                                            <Text style={s.noteCharCount}>{text.length} caracteres</Text>
                                        </View>
                                    </View>
                                </View>
                            ) : (
                                <View style={s.handwritingContainer}>
                                    <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 0.9 }} style={s.drawingCanvas}>
                                        <View style={s.paperBackground} {...panResponder.panHandlers}>
                                            <Svg style={StyleSheet.absoluteFill}>
                                                {paths.map((p, i) => (
                                                    <SvgPath key={i} d={p} fill="none" stroke={P.gray900} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                                                ))}
                                                {currentPath ? (
                                                    <SvgPath d={currentPath} fill="none" stroke={P.gray900} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                                                ) : null}
                                            </Svg>
                                            {paths.length === 0 && !currentPath && (
                                                <View style={s.drawingPlaceholder} pointerEvents="none">
                                                    <Ionicons name="pencil-outline" size={40} color={P.gray100} />
                                                    <Text style={s.drawingPlaceholderText}>{t('add.draw_here')}</Text>
                                                </View>
                                            )}
                                        </View>
                                    </ViewShot>
                                    <TouchableOpacity style={s.clearCanvasBtn} onPress={() => setPaths([])}>
                                        <Ionicons name="trash-outline" size={18} color={P.red} />
                                        <Text style={s.clearCanvasText}>{t('add.clear_all')}</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
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
                                {isRecording ? t('add.recording') : recordedUri ? t('common.ready') : t('add.tap_to_record')}
                            </Text>
                            <Text style={s.micHint}>
                                {isRecording ? t('add.stop_record') : recordedUri ? t('add.voice_note_saved') : t('add.voice_note')}
                            </Text>

                            {recordedUri && (
                                <TouchableOpacity style={s.retryRow} activeOpacity={0.7} onPress={() => setRecordedUri(null)}>
                                    <Ionicons name="refresh-circle-outline" size={16} color={P.red} />
                                    <Text style={s.retryLabel}>{t('add.retry_record')}</Text>
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
                                <Text style={s.locationTitle}>{t('add.location_title')}</Text>
                                <Text style={s.locationSub} numberOfLines={1}>
                                    {includeLocation && currentLocation ? currentLocation.locationName : t('add.location_placeholder')}
                                </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color={P.gray300} />
                        </View>
                    </TouchableOpacity>

                    {/* ════════ IMAGE / VIDEO ════════ */}
                    {(contentType === 'image' || contentType === 'video') && (
                        <>
                            {mediaList.length === 0 ? (
                                /* ── Premium Empty Picker ── */
                                <View style={s.emptyPremiumContainer}>
                                    <View style={s.emptyPremiumHeader}>
                                        <Text style={s.emptyPremiumTitle}>
                                            {contentType === 'image' ? t('add.add_your_photos') : t('add.add_your_video')}
                                        </Text>
                                        <Text style={s.emptyPremiumSub}>
                                            {contentType === 'image'
                                                ? t('add.capture_moment')
                                                : t('add.hd_ready')}
                                        </Text>
                                    </View>

                                    <View style={s.pickerRowContainer}>
                                        <TouchableOpacity 
                                            style={s.pickerRow} 
                                            activeOpacity={0.7} 
                                            onPress={captureMediaWithTrack}
                                        >
                                            <View style={[s.pickerIconCircle, { backgroundColor: '#FF4B8B' }]}>
                                                <LinearGradient 
                                                    colors={['#FF4B8B', '#FF2D55']} 
                                                    style={StyleSheet.absoluteFill}
                                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                                                />
                                                <Ionicons name="camera" size={24} color={P.white} />
                                            </View>
                                            <View style={s.pickerRowText}>
                                                <Text style={s.pickerRowTitle}>{t('add.camera')}</Text>
                                                <Text style={s.pickerRowDesc}>{t('add.camera_sub')}</Text>
                                            </View>
                                            <Ionicons name="chevron-forward" size={20} color={P.gray300} />
                                        </TouchableOpacity>

                                        <TouchableOpacity 
                                            style={s.pickerRow} 
                                            activeOpacity={0.7} 
                                            onPress={pickMediaWithTrack}
                                        >
                                            <View style={[s.pickerIconCircle, { backgroundColor: '#6366F1' }]}>
                                                <LinearGradient 
                                                    colors={['#6366F1', '#4F46E5']} 
                                                    style={StyleSheet.absoluteFill}
                                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                                                />
                                                <Ionicons name="images" size={24} color={P.white} />
                                            </View>
                                            <View style={s.pickerRowText}>
                                                <Text style={s.pickerRowTitle}>{t('add.gallery')}</Text>
                                                <Text style={s.pickerRowDesc}>{t('add.gallery_sub')}</Text>
                                            </View>
                                            <Ionicons name="chevron-forward" size={20} color={P.gray300} />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ) : (
                                /* ── Media strip ── */
                                <>
                                    <View style={s.stripHeader}>
                                        <View style={s.premiumCountBadge}>
                                            <Text style={s.premiumCountText}>
                                                {mediaList.length} {contentType === 'image' ? 'foto' : 'video'}{mediaList.length !== 1 ? 's' : ''}
                                            </Text>
                                        </View>
                                        <TouchableOpacity style={s.premiumAddMoreBtn} onPress={handleAddMore} activeOpacity={0.7}>
                                            <LinearGradient colors={[P.p500, P.p600]} style={s.premiumAddMoreGrad}>
                                                <Ionicons name="add" size={18} color={P.white} />
                                            </LinearGradient>
                                            <Text style={s.premiumAddMoreText}>Añadir más</Text>
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
                                    placeholder={t('add.add_caption')}
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

            {/* ── Capsule Selector Modal (Premium) ── */}
            <Modal visible={capsuleSelectorVisible} transparent animationType="slide">
                <View style={s.capsuleModalOverlay}>
                    <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} />
                    
                    {/* Ambient Orbs */}
                    <View style={StyleSheet.absoluteFill} pointerEvents="none">
                        <View style={[s.orb, { top: 100, right: -50, backgroundColor: P.p100 + '80' }]} />
                        <View style={[s.orb, { bottom: 200, left: -60, backgroundColor: P.p200 + '50' }]} />
                    </View>

                    <View style={s.capsuleSheet}>
                        <View style={s.capsuleSheetHandle} />
                        <View style={s.capsuleSheetHeader}>
                            <View>
                                <Text style={s.capsuleSheetTitle}>{t('add.target_capsule')}</Text>
                                <Text style={s.capsuleSheetSub}>{t('add.target_capsule_sub')}</Text>
                            </View>
                            <TouchableOpacity onPress={() => setCapsuleSelectorVisible(false)}>
                                <Ionicons name="close-circle" size={32} color={P.gray300} />
                            </TouchableOpacity>
                        </View>

                        {isLoadingCapsules ? (
                            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                                <ActivityIndicator size="large" color={P.p600} />
                            </View>
                        ) : (
                            <ScrollView 
                                style={s.capsuleOptionsScroll} 
                                showsVerticalScrollIndicator={false}
                                contentContainerStyle={{ paddingBottom: 40 }}
                            >
                                {myCapsules.length === 0 ? (
                                    <View style={s.emptyMyCaps}>
                                        <Ionicons name="albums-outline" size={48} color={P.gray200} />
                                        <Text style={s.emptyMyCapsText}>{t('add.no_capsules')}</Text>
                                        <TouchableOpacity 
                                            style={s.createCapsBtn}
                                            onPress={() => {
                                                setCapsuleSelectorVisible(false);
                                                navigation.navigate('CreateCapsule');
                                            }}
                                        >
                                            <Text style={s.createCapsBtnText}>{t('add.create_first_capsule')}</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    myCapsules.map((cap) => (
                                        <TouchableOpacity 
                                            key={cap.id}
                                            activeOpacity={0.8}
                                            style={[
                                                s.capsuleChoiceCard,
                                                selectedCapsule?.id === cap.id && s.capsuleChoiceSelected
                                            ]}
                                            onPress={() => {
                                                setSelectedCapsule(cap);
                                                setCapsuleSelectorVisible(false);
                                            }}
                                        >
                                            <View style={s.capsuleChoiceVisual}>
                                                <Image 
                                                    source={{ 
                                                        uri: cap.cover_url || 
                                                             (cap.status === 'opened' ? MODEL_IMAGES_OPEN[cap.model] : MODEL_IMAGES[cap.model]) || 
                                                             MODEL_IMAGES.cartoonkap 
                                                    }}
                                                    style={s.capsuleChoiceImg}
                                                    contentFit="cover"
                                                />
                                                <LinearGradient 
                                                    colors={['transparent', 'rgba(0,0,0,0.3)']}
                                                    style={StyleSheet.absoluteFill}
                                                />
                                                <View style={s.capsuleChoiceBadge}>
                                                    <Ionicons 
                                                        name={cap.status === 'opened' ? "lock-open" : "lock-closed"} 
                                                        size={10} color="#fff" 
                                                    />
                                                </View>
                                            </View>
                                            <View style={s.capsuleChoiceInfo}>
                                                <Text style={s.capsuleChoiceTitle} numberOfLines={1}>{cap.title}</Text>
                                                <Text style={s.capsuleChoiceMeta}>
                                                    {cap.status === 'opened' ? t('common.open') : t('common.sealed')} · {cap.type}
                                                </Text>
                                            </View>
                                            {selectedCapsule?.id === cap.id && (
                                                <View style={s.checkMark}>
                                                    <Ionicons name="checkmark-circle" size={24} color={P.p600} />
                                                </View>
                                            )}
                                        </TouchableOpacity>
                                    ))
                                )}
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>

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
                        <Text style={s.trimTitle}>{t('add.trim_video')}</Text>

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
            {isProcessingMedia && (
                <View style={s.uploadOverlay}>
                    <BlurView intensity={28} style={StyleSheet.absoluteFill} />
                    <View style={s.uploadCard}>
                        <View style={s.uploadProgressCircle}>
                            <ActivityIndicator size="large" color={P.p600} />
                        </View>
                        <Text style={s.uploadTitle}>{processingMediaLabel || 'Procesando contenido...'}</Text>
                        <Text style={s.uploadSub}>Espera un momento. El video aparecerá aquí cuando esté listo.</Text>
                    </View>
                </View>
            )}

            {loading && (
                <View style={s.uploadOverlay}>
                    <BlurView intensity={20} style={StyleSheet.absoluteFill} />
                    <View style={s.uploadCard}>
                        <View style={s.uploadProgressCircle}>
                            <ActivityIndicator size="large" color={P.p600} />
                        </View>
                        <Text style={s.uploadTitle}>
                            {mediaList.length > 0 
                                ? t('add.saving_items', { current: Math.min(Object.values(uploadProgress).filter(v => v === 100).length + 1, mediaList.length), total: mediaList.length })
                                : contentType === 'note' ? t('add.saving_note') : contentType === 'audio' ? t('add.saving_audio') : t('add.saving_content')
                            }
                        </Text>
                        
                        {mediaList.length > 0 && (
                            <View style={s.globalProgressContainer}>
                                <View style={s.globalProgressBar}>
                                    <View 
                                        style={[
                                            s.globalProgressFill, 
                                            { 
                                                width: `${(Object.values(uploadProgress).reduce((a, b) => a + b, 0) / (mediaList.length * 100)) * 100}%` as any 
                                            }
                                        ]} 
                                    />
                                </View>
                                <Text style={s.globalProgressText}>
                                    {Math.round((Object.values(uploadProgress).reduce((a, b) => a + b, 0) / (mediaList.length * 100)) * 100)}%
                                </Text>
                            </View>
                        )}
                        
                        <Text style={s.uploadSub}>
                            {mediaList.length > 0 ? t('add.uploading_success') : t('add.one_moment')}
                        </Text>
                        <TouchableOpacity style={s.uploadCancelBtn} activeOpacity={0.75} onPress={handleCancelActiveUpload}>
                            <Text style={s.uploadCancelText}>Cancelar subida</Text>
                        </TouchableOpacity>
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

            {/* Undo Overlay */}
            <Modal visible={isUndoOverlayVisible} transparent animationType="fade">
                <BlurView intensity={80} tint="dark" style={s.undoOverlay}>
                    <View style={s.undoCard}>
                        <LinearGradient colors={['#7C3AED', '#5B21B6']} style={s.undoIconWrap}>
                            <Ionicons name="time" size={32} color="#fff" />
                        </LinearGradient>
                        
                        <Text style={s.undoTitle}>{t('add.undo_title')}</Text>
                        <Text style={s.undoSub}>{t('add.undo_sub')}</Text>
                        
                        <View style={s.undoProgressBg}>
                            <Animated.View 
                                style={[s.undoProgressBar, { 
                                    width: undoProgress.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: ['0%', '100%']
                                    }),
                                    backgroundColor: '#A855F7'
                                }]} 
                            />
                        </View>

                        <TouchableOpacity 
                            style={s.undoBtn} 
                            onPress={handleCancelUpload}
                            activeOpacity={0.8}
                        >
                            <LinearGradient colors={['#EF4444', '#DC2626']} style={s.undoBtnGrad}>
                                <Text style={s.undoBtnText}>{t('add.undo_btn')}</Text>
                            </LinearGradient>
                        </TouchableOpacity>

                        <Text style={s.undoHint}>{t('add.undo_hint')}</Text>
                    </View>
                </BlurView>
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
        paddingHorizontal: 22, paddingVertical: 18, backgroundColor: 'transparent',
    },
    headerRule: { height: 1, backgroundColor: P.gray100, marginHorizontal: 0 },
    backBtn: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: P.white, ...shadow.soft,
        alignItems: 'center', justifyContent: 'center',
    },
    headerMid: { alignItems: 'center', flex: 1, marginHorizontal: 10 },
    headerTitle: { fontSize: 16, fontWeight: '800', color: P.gray900, marginBottom: 2 },
    targetPill: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: P.p50, paddingHorizontal: 10, paddingVertical: 4,
        borderRadius: R.full, borderWidth: 1, borderColor: P.p100,
    },
    targetPillLabel: { fontSize: 11, fontWeight: '600', color: P.gray400 },
    targetPillValue: { fontSize: 11, fontWeight: '700', color: P.p700, maxWidth: 120 },
    publishBtn: {
        borderRadius: R.full, minWidth: 90, overflow: 'hidden',
        ...shadow.purple,
    },
    publishBtnGrad: { paddingHorizontal: 22, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
    publishBtnOff: { opacity: 0.5, ...shadow.soft },
    publishBtnText: { color: P.white, fontSize: 14, fontWeight: '800' },

    // Scroll
    scroll: { padding: 20, paddingBottom: 60 },

    noteWrapper: { paddingHorizontal: 20, paddingTop: 10 },
    noteCard: {
        backgroundColor: P.white, borderRadius: 28, padding: 22,
        minHeight: 200, ...shadow.medium, borderWidth: 1, borderColor: P.gray100,
    },
    noteInput: {
        fontSize: 18, fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
        color: P.gray900, lineHeight: 26, flex: 1, textAlignVertical: 'top',
    },
    noteFooter: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 20, paddingTop: 15, borderTopWidth: 1, borderTopColor: P.gray50,
    },
    noteSignatureLine: { height: 1, flex: 1, backgroundColor: P.gray100, marginRight: 20 },
    noteCharBadge: {
        backgroundColor: P.gray50, paddingHorizontal: 10, paddingVertical: 4,
        borderRadius: 8,
    },
    noteCharCount: { fontSize: 10, fontWeight: '700', color: P.gray400, textTransform: 'uppercase' },

    // ── AUDIO
    audioCard: {
        backgroundColor: P.white, borderRadius: 32, padding: 30,
        marginHorizontal: 0, marginTop: 10, alignItems: 'center',
        ...shadow.medium, borderWidth: 1, borderColor: P.gray100,
    },
    waveRow: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 60, marginBottom: 30 },
    wave: { width: 3, borderRadius: 1.5, backgroundColor: P.gray100 },
    micBtnOuter: {
        width: 90, height: 90, borderRadius: 45, backgroundColor: P.white,
        alignItems: 'center', justifyContent: 'center', ...shadow.purple,
    },
    micBtnGrad: { width: 74, height: 74, borderRadius: 37, alignItems: 'center', justifyContent: 'center' },
    micStatus: { fontSize: 18, fontWeight: '800', color: P.gray900, marginTop: 20 },
    micHint: { fontSize: 13, color: P.gray400, marginTop: 4, fontWeight: '500' },

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

    locationCard: {
        marginHorizontal: 20, marginTop: 24,
        backgroundColor: P.white, borderRadius: 24, padding: 18,
        flexDirection: 'row', alignItems: 'center', gap: 14,
        borderWidth: 1, borderColor: P.gray100, ...shadow.soft,
    },

    // ── EMPTY STATE
    emptyWrap: { alignItems: 'center', paddingVertical: 32, gap: 0 },
    emptyIcon: { width: 110, height: 110, borderRadius: 55, overflow: 'hidden', marginBottom: 22, ...shadow.soft },
    emptyIconGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyTitle: { fontSize: 22, fontWeight: '700', color: P.gray900, marginBottom: 8 },
    emptySub: { fontSize: 14, color: P.gray400, textAlign: 'center', lineHeight: 20, marginBottom: 30 },
    pickerCardPrimary: { flex: 1, borderRadius: R.lg, overflow: 'hidden', ...shadow.purple },
    pickerCardGrad: { padding: 22, alignItems: 'center', gap: 10 },
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

    // ── PREMIUM EMPTY PICKER
    emptyPremiumContainer: { paddingVertical: 20 },
    emptyPremiumHeader: { marginBottom: 24, paddingLeft: 4 },
    emptyPremiumTitle: { fontSize: 26, fontWeight: '900', color: P.gray900, letterSpacing: -0.8 },
    emptyPremiumSub: { fontSize: 14, color: P.gray400, marginTop: 4, fontWeight: '500' },
    premiumPickerGrid: { flexDirection: 'row', gap: 14 },
    premiumPickerCard: { flex: 1, height: 180, borderRadius: 32, overflow: 'hidden', ...shadow.medium },
    premiumPickerGrad: { flex: 1, padding: 20, justifyContent: 'flex-end', gap: 8 },
    premiumIconCircle: { width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
    premiumPickerLabel: { fontSize: 18, fontWeight: '800', color: P.white },
    premiumPickerHint: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },

    // ── PREMIUM STRIP HEADER
    premiumCountBadge: {
        backgroundColor: P.gray900, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12,
    },
    premiumCountText: { fontSize: 13, fontWeight: '800', color: P.white, letterSpacing: 0.5 },
    premiumAddMoreBtn: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    premiumAddMoreGrad: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', ...shadow.soft },
    premiumAddMoreText: { fontSize: 14, fontWeight: '700', color: P.p700 },

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

    // Note Mode
    noteModeSelector: {
        flexDirection: 'row', backgroundColor: P.gray100,
        borderRadius: 16, padding: 4, marginBottom: 16, gap: 4,
    },
    noteModeBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, paddingVertical: 10, borderRadius: 12,
    },
    noteModeBtnActive: {
        backgroundColor: P.p600, ...shadow.soft,
    },
    noteModeText: { fontSize: 14, fontWeight: '700', color: P.gray500 },
    noteModeTextActive: { color: P.white },

    // Handwriting
    handwritingContainer: { gap: 16 },
    drawingCanvas: {
        width: '100%', height: 350, borderRadius: 28,
        backgroundColor: P.white, overflow: 'hidden',
        borderWidth: 1, borderColor: P.gray100, ...shadow.medium,
    },
    paperBackground: { flex: 1, backgroundColor: '#FFFEF5' }, // Slightly yellowish paper feel
    drawingPlaceholder: { 
        ...StyleSheet.absoluteFillObject, 
        alignItems: 'center', justifyContent: 'center', opacity: 0.5 
    },
    drawingPlaceholderText: { color: P.gray300, fontSize: 16, fontWeight: '600', marginTop: 10 },
    clearCanvasBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 8,
    },
    clearCanvasText: { color: P.red, fontSize: 14, fontWeight: '700' },
    trimCancelText: { color: 'rgba(255,255,255,0.65)', fontWeight: '600' },
    trimSave: { flex: 1, borderRadius: R.full, overflow: 'hidden' },
    trimSaveGrad: { paddingVertical: 15, alignItems: 'center' },
    trimSaveText: { color: P.white, fontWeight: '700' },
    // Picker Rows
    pickerRowContainer: { gap: 12, marginTop: 10 },
    pickerRow: {
        flexDirection: 'row', alignItems: 'center', gap: 16,
        padding: 16, backgroundColor: P.white, borderRadius: 24,
        ...shadow.soft, borderWidth: 1, borderColor: P.gray100,
    },
    pickerIconCircle: {
        width: 56, height: 56, borderRadius: 18,
        alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
    },
    pickerRowText: { flex: 1 },
    pickerRowTitle: { fontSize: 18, fontWeight: '800', color: P.gray900, marginBottom: 2 },
    pickerRowDesc: { fontSize: 13, color: P.gray400, fontWeight: '500' },

    // ── CAPSULE SELECTOR MODAL
    capsuleModalOverlay: { flex: 1, justifyContent: 'flex-end' },
    capsuleSheet: {
        backgroundColor: P.white,
        borderTopLeftRadius: 40, borderTopRightRadius: 40,
        paddingHorizontal: 24, paddingBottom: 40,
        height: '82%', ...shadow.medium,
    },
    capsuleSheetHandle: { width: 40, height: 4, backgroundColor: P.gray100, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 20 },
    capsuleSheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    capsuleSheetTitle: { fontSize: 24, fontWeight: '900', color: P.gray900, letterSpacing: -0.5 },
    capsuleSheetSub: { fontSize: 13, color: P.gray400, marginTop: 2, fontWeight: '500' },
    capsuleOptionsScroll: { flex: 1 },
    capsuleChoiceCard: {
        flexDirection: 'row', alignItems: 'center', gap: 16,
        padding: 12, backgroundColor: P.gray50, borderRadius: 24,
        marginBottom: 12, borderWidth: 2, borderColor: 'transparent',
    },
    capsuleChoiceSelected: {
        borderColor: P.p200, backgroundColor: P.p50,
    },
    capsuleChoiceVisual: {
        width: 64, height: 64, borderRadius: 18, overflow: 'hidden',
    },
    capsuleChoiceImg: { width: '100%', height: '100%' },
    capsuleChoiceBadge: {
        position: 'absolute', top: 6, right: 6,
        width: 18, height: 18, borderRadius: 9,
        backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
    },
    capsuleChoiceInfo: { flex: 1 },
    capsuleChoiceTitle: { fontSize: 16, fontWeight: '800', color: P.gray900, marginBottom: 4 },
    capsuleChoiceMeta: { fontSize: 12, color: P.gray500, fontWeight: '600' },
    checkMark: { marginLeft: 8 },
    orb: { position: 'absolute', width: 300, height: 300, borderRadius: 150 },
    emptyMyCaps: { alignItems: 'center', paddingVertical: 60 },
    emptyMyCapsText: { fontSize: 15, color: P.gray400, marginTop: 16, fontWeight: '600' },
    createCapsBtn: {
        marginTop: 24, backgroundColor: P.p600, 
        paddingHorizontal: 24, paddingVertical: 14, borderRadius: R.full,
    },
    createCapsBtnText: { color: P.white, fontSize: 14, fontWeight: '700' },

    // Upload Overlay
    uploadOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center', justifyContent: 'center', zIndex: 999,
    },
    uploadCard: {
        width: width * 0.82,
        alignItems: 'center', backgroundColor: P.white,
        borderRadius: R.xl, padding: 32,
        borderWidth: 1, borderColor: P.gray100, ...shadow.medium,
    },
    uploadProgressCircle: {
        width: 64, height: 64, borderRadius: 32,
        backgroundColor: P.p50, alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    },
    globalProgressContainer: {
        width: '100%',
        marginTop: 18,
        marginBottom: 8,
        alignItems: 'center',
    },
    globalProgressBar: {
        width: '100%',
        height: 8,
        backgroundColor: P.gray100,
        borderRadius: 4,
        overflow: 'hidden',
    },
    globalProgressFill: {
        height: '100%',
        backgroundColor: P.p600,
        borderRadius: 4,
    },
    globalProgressText: {
        fontSize: 12,
        fontWeight: '700',
        color: P.p600,
        marginTop: 8,
    },
    uploadTitle: { fontSize: 17, fontWeight: '700', color: P.gray900, textAlign: 'center' },
    uploadSub: { fontSize: 13, color: P.gray400, textAlign: 'center', marginTop: 8 },
    uploadCancelBtn: {
        marginTop: 18,
        height: 42,
        paddingHorizontal: 22,
        borderRadius: 21,
        backgroundColor: '#FEE2E2',
        alignItems: 'center',
        justifyContent: 'center',
    },
    uploadCancelText: { color: '#DC2626', fontSize: 13, fontWeight: '800' },

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

    // ── LOCATION TOGGLE (Handled in locationCard block above)
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

    // Undo Styles
    undoOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    undoCard: { width: width * 0.85, backgroundColor: '#fff', borderRadius: 32, padding: 24, alignItems: 'center', ...shadow.medium },
    undoIconWrap: { width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    undoTitle: { fontSize: 24, fontWeight: '900', color: '#1F2937', marginBottom: 8 },
    undoSub: { fontSize: 15, color: '#6B7280', textAlign: 'center', marginBottom: 24 },
    undoProgressBg: { width: '100%', height: 10, backgroundColor: '#F3F4F6', borderRadius: 5, overflow: 'hidden', marginBottom: 32 },
    undoProgressBar: { height: '100%' },
    undoBtn: { width: '100%', height: 56, borderRadius: 28, overflow: 'hidden' },
    undoBtnGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    undoBtnText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
    undoHint: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', marginTop: 16, paddingHorizontal: 10 },
});
