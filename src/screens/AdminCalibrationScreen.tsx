import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
    View, Text, StyleSheet, Image, PanResponder, Animated,
    TouchableOpacity, ScrollView, StatusBar,
    Dimensions, Platform, TextInput, Modal, Alert, Switch, ActivityIndicator
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Fonts, Shadow } from '../theme';
import { timerConfigManager, ModelTimerConfig, DEFAULT_CONFIGS } from '../utils/timerConfig';
import { optimizeImageForUpload, optimizeThumbnailForUpload } from '../utils/mediaOptimization';
import { getAuthUserIdSnapshot, supabase } from '../lib/supabase';
import LiveTimer from '../components/LiveTimer';
import CapsuleWithTimer from '../components/CapsuleWithTimer';
import { LinearGradient } from 'expo-linear-gradient';
import { CAPSULE_MODELS } from '../constants/models';
import { safetyService } from '../utils/safety';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MODELS = CAPSULE_MODELS as unknown as any[];
const FRAME_SIZE = 300;
const LAYOUT_PREVIEW_SIZE = FRAME_SIZE;
const LAYOUT_PREVIEW_IMAGE_SIZE = FRAME_SIZE;
const MIN_MODEL_IMAGE_SCALE = 0.5;
const MAX_MODEL_IMAGE_SCALE = 1.8;
const MIN_MODEL_IMAGE_OFFSET = -80;
const MAX_MODEL_IMAGE_OFFSET = 80;
const MODEL_LAYOUT_PRESET_KEY = 'admin_model_layout_default_preset';
const MODEL_LAYOUT_AUTO_APPLY_KEY = 'admin_model_layout_auto_apply';

const PRESET_COLORS = ['#ffffff', '#000000', '#a269ff', '#6abf69', '#ff9f1c', '#ff5252', '#d4a017', '#e2e2e2'];
const PRESET_THEME_COLORS = ['#a269ff', '#6abf69', '#ff9f1c', '#00d2ff', '#e67e22', '#ff5252', '#d4a017', '#2d2d2d', '#ec4899', '#ff78b8', '#14b8a6', '#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16', '#f97316', '#0f172a', '#f43f5e', '#a3e635'];
const MODEL_EFFECT_OPTIONS = [
    { id: 'none', label: 'None', icon: 'close-circle-outline' as const },
    { id: 'glow', label: 'Glow', icon: 'sunny-outline' as const },
    { id: 'fire', label: 'Fire', icon: 'flame-outline' as const },
    { id: 'sparkles', label: 'Sparkles', icon: 'sparkles-outline' as const },
];
const FONTS = [
    { id: 'monospace', label: 'Retro', font: 'monospace' },
    { id: 'Inter_700Bold', label: 'Modern', font: Fonts.bold },
    { id: 'Inter_400Regular', label: 'Minimal', font: Fonts.regular },
    { id: 'serif', label: 'Classic', font: Platform.OS === 'ios' ? 'Times New Roman' : 'serif' },
];

const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const getModelImageLayout = (model: any) => ({
    scale: clampNumber(Number(model?.image_scale) || 1, MIN_MODEL_IMAGE_SCALE, MAX_MODEL_IMAGE_SCALE),
    scaleX: clampNumber(Number(model?.image_scale_x) || 1, MIN_MODEL_IMAGE_SCALE, MAX_MODEL_IMAGE_SCALE),
    scaleY: clampNumber(Number(model?.image_scale_y) || 1, MIN_MODEL_IMAGE_SCALE, MAX_MODEL_IMAGE_SCALE),
    offsetX: clampNumber(Number(model?.image_offset_x) || 0, MIN_MODEL_IMAGE_OFFSET, MAX_MODEL_IMAGE_OFFSET),
    offsetY: clampNumber(Number(model?.image_offset_y) || 0, MIN_MODEL_IMAGE_OFFSET, MAX_MODEL_IMAGE_OFFSET),
});

const getOpenModelImageLayout = (model: any) => ({
    scale: clampNumber(Number(model?.image_open_scale) || Number(model?.image_scale) || 1, MIN_MODEL_IMAGE_SCALE, MAX_MODEL_IMAGE_SCALE),
    scaleX: clampNumber(Number(model?.image_open_scale_x) || Number(model?.image_scale_x) || 1, MIN_MODEL_IMAGE_SCALE, MAX_MODEL_IMAGE_SCALE),
    scaleY: clampNumber(Number(model?.image_open_scale_y) || Number(model?.image_scale_y) || 1, MIN_MODEL_IMAGE_SCALE, MAX_MODEL_IMAGE_SCALE),
    offsetX: clampNumber(Number(model?.image_open_offset_x) || Number(model?.image_offset_x) || 0, MIN_MODEL_IMAGE_OFFSET, MAX_MODEL_IMAGE_OFFSET),
    offsetY: clampNumber(Number(model?.image_open_offset_y) || Number(model?.image_offset_y) || 0, MIN_MODEL_IMAGE_OFFSET, MAX_MODEL_IMAGE_OFFSET),
});

const getModelImageTransform = (model: any) => {
    const layout = getModelImageLayout(model);
    return [
        { translateX: layout.offsetX },
        { translateY: layout.offsetY },
        { scaleX: layout.scale * layout.scaleX },
        { scaleY: layout.scale * layout.scaleY },
    ];
};

const getOpenModelImageTransform = (model: any) => {
    const layout = getOpenModelImageLayout(model);
    return [
        { translateX: layout.offsetX },
        { translateY: layout.offsetY },
        { scaleX: layout.scale * layout.scaleX },
        { scaleY: layout.scale * layout.scaleY },
    ];
};

const extractStoragePath = (bucket: string, url?: string | null) => {
    if (!url) return null;
    const marker = `/storage/v1/object/public/${bucket}/`;
    const index = url.indexOf(marker);
    if (index === -1) return null;
    const path = url.slice(index + marker.length).split('?')[0];
    return path || null;
};

type AdminTab = 'models' | 'timer' | 'chain' | 'drops' | 'stickers' | 'moderation';
type ModelLayoutPreset = {
    image_scale: number;
    image_scale_x: number;
    image_scale_y: number;
    image_offset_x: number;
    image_offset_y: number;
};

type OpenModelLayoutPreset = {
    image_open_scale: number;
    image_open_scale_x: number;
    image_open_scale_y: number;
    image_open_offset_x: number;
    image_open_offset_y: number;
};

const ADMIN_TABS: Array<{ id: AdminTab; label: string; icon: keyof typeof Ionicons.glyphMap; hint: string }> = [
    { id: 'models', label: 'Library', icon: 'cube', hint: 'Create and edit capsule designs' },
    { id: 'timer', label: 'Timer', icon: 'time', hint: 'Position the opening timer' },
    { id: 'chain', label: 'Chains', icon: 'link', hint: 'Place chain accessories' },
    { id: 'drops', label: 'Drops', icon: 'flash', hint: 'Schedule design drops' },
    { id: 'stickers', label: 'Stickers', icon: 'sparkles', hint: 'Profile sticker library' },
    { id: 'moderation', label: 'Moderation', icon: 'shield-checkmark', hint: 'Review blocked or doubtful AI decisions' },
];

const DEFAULT_MODEL_LAYOUT: ModelLayoutPreset = {
    image_scale: 1,
    image_scale_x: 1,
    image_scale_y: 1,
    image_offset_x: 0,
    image_offset_y: 0,
};

const DEFAULT_OPEN_MODEL_LAYOUT: OpenModelLayoutPreset = {
    image_open_scale: 1,
    image_open_scale_x: 1,
    image_open_scale_y: 1,
    image_open_offset_x: 0,
    image_open_offset_y: 0,
};

const extractModelLayoutPreset = (model: any): ModelLayoutPreset => ({
    image_scale: getModelImageLayout(model).scale,
    image_scale_x: getModelImageLayout(model).scaleX,
    image_scale_y: getModelImageLayout(model).scaleY,
    image_offset_x: getModelImageLayout(model).offsetX,
    image_offset_y: getModelImageLayout(model).offsetY,
});

const extractOpenModelLayoutPreset = (model: any): OpenModelLayoutPreset => ({
    image_open_scale: getOpenModelImageLayout(model).scale,
    image_open_scale_x: getOpenModelImageLayout(model).scaleX,
    image_open_scale_y: getOpenModelImageLayout(model).scaleY,
    image_open_offset_x: getOpenModelImageLayout(model).offsetX,
    image_open_offset_y: getOpenModelImageLayout(model).offsetY,
});

export default function AdminCalibrationScreen() {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const [selectedModel, setSelectedModel] = useState<any>((timerConfigManager.models.filter((m: any) => !m?.is_hidden)[0]) || MODELS[0]);
    const [allModels, setAllModels] = useState<any[]>((timerConfigManager.models.filter((m: any) => !m?.is_hidden)).length > 0 ? timerConfigManager.models.filter((m: any) => !m?.is_hidden) : MODELS);
    const [activeTab, setActiveTab] = useState<AdminTab>('models');
    const [selectedChainId, setSelectedChainId] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const [showAddModel, setShowAddModel] = useState(false);
    const [editingModelId, setEditingModelId] = useState<string | null>(null);
    const [showBaseModelReference, setShowBaseModelReference] = useState(true);
    const [baseModelReferenceOpacity, setBaseModelReferenceOpacity] = useState(0.24);
    const [baseModelReferenceLayer, setBaseModelReferenceLayer] = useState<'behind' | 'front'>('behind');
    const [defaultLayoutPreset, setDefaultLayoutPreset] = useState<ModelLayoutPreset | null>(null);
    const [autoApplyDefaultLayout, setAutoApplyDefaultLayout] = useState(false);
    const [showLayoutTimerReference, setShowLayoutTimerReference] = useState(true);
    const [showLayoutChainReference, setShowLayoutChainReference] = useState(true);
    interface ModelState {
        id: string;
        label: string;
        image: string;
        image_open: string;
        category: string;
        tint: string;
        is_active: boolean;
        is_event: boolean;
        is_birthday: boolean;
        is_trending: boolean;
        is_new: boolean;
        image_scale: number;
        image_scale_x: number;
        image_scale_y: number;
        image_offset_x: number;
        image_offset_y: number;
        image_open_scale: number;
        image_open_scale_x: number;
        image_open_scale_y: number;
        image_open_offset_x: number;
        image_open_offset_y: number;
        effect_type: string;
        effect_tint: string;
        effect_scale: number;
        effect_offset_x: number;
        effect_offset_y: number;
        effect_opacity: number;
        effect_layer: 'behind' | 'front';
        event_start: string;
        event_end: string;
        event_title: string;
        event_description: string;
        drop_id: string | null;
        thumbnail_url?: string;
    }

    const [newModel, setNewModel] = useState<ModelState>({
        id: '', label: '', image: '', image_open: '',
        category: 'Vibe', tint: '#a269ff', is_active: true, is_event: false, is_birthday: false,
        is_trending: false, is_new: false,
        image_scale: 1, image_scale_x: 1, image_scale_y: 1, image_offset_x: 0, image_offset_y: 0,
        image_open_scale: 1, image_open_scale_x: 1, image_open_scale_y: 1, image_open_offset_x: 0, image_open_offset_y: 0,
        effect_type: 'none', effect_tint: '#a269ff', effect_scale: 1, effect_offset_x: 0, effect_offset_y: 0, effect_opacity: 1, effect_layer: 'behind',
        event_start: '', event_end: '', event_title: '', event_description: '',
        drop_id: null
    });
    const [datePickerMode, setDatePickerMode] = useState<'start' | 'end' | null>(null);
    const [datePickerTarget, setDatePickerTarget] = useState<'model' | 'drop' | null>(null);

    const handleDatePickerPress = (mode: 'start' | 'end') => {
        const currentVal = (newModel as any)[mode === 'start' ? 'event_start' : 'event_end'];
        let date = new Date();
        if (currentVal) {
            const parsed = new Date(currentVal);
            if (!isNaN(parsed.getTime())) {
                date = parsed;
            }
        }

        if (Platform.OS === 'android') {
            try {
                if (typeof DateTimePickerAndroid !== 'undefined' && DateTimePickerAndroid.open) {
                    // ... (android logic remains same, but we can also set target just in case)
                    setDatePickerTarget('model');
                    DateTimePickerAndroid.open({
                        value: date,
                        onChange: (event, selectedDate) => {
                            if (event.type === 'set' && selectedDate) {
                                setTimeout(() => {
                                    if (typeof DateTimePickerAndroid !== 'undefined' && DateTimePickerAndroid.open) {
                                        DateTimePickerAndroid.open({
                                            value: selectedDate,
                                            onChange: (event2, finalDate) => {
                                                if (event2.type === 'set' && finalDate) {
                                                    setNewModel(p => ({
                                                        ...p,
                                                        [mode === 'start' ? 'event_start' : 'event_end']: finalDate.toISOString()
                                                    }));
                                                }
                                            },
                                            mode: 'time',
                                            is24Hour: true,
                                        });
                                    }
                                }, 150);
                            }
                        },
                        mode: 'date',
                        is24Hour: true,
                    });
                } else {
                    setDatePickerTarget('model');
                    setDatePickerMode(mode);
                }
            } catch (error) {
                console.error('Date picker error:', error);
                setDatePickerTarget('model');
                setDatePickerMode(mode);
            }
        } else {
            setDatePickerTarget('model');
            setDatePickerMode(mode);
        }
    };

    const handleDropDatePicker = (mode: 'start' | 'end') => {
        if (Platform.OS === 'android') {
            let date = new Date();
            const currentVal = (newDrop as any)[mode === 'start' ? 'start_date' : 'end_date'];
            if (currentVal) {
                const parsed = new Date(currentVal);
                if (!isNaN(parsed.getTime())) date = parsed;
            }

            if (typeof DateTimePickerAndroid !== 'undefined' && DateTimePickerAndroid.open) {
                setDatePickerTarget('drop');
                DateTimePickerAndroid.open({
                    value: date,
                    onChange: (event, selectedDate) => {
                        if (event.type === 'set' && selectedDate) {
                            setNewDrop(p => ({
                                ...p,
                                [mode === 'start' ? 'start_date' : 'end_date']: selectedDate.toISOString()
                            }));
                        }
                    },
                    mode: 'date',
                });
            } else {
                setDatePickerTarget('drop');
                setDatePickerMode(mode as any);
            }
        } else {
            setDatePickerTarget('drop');
            setDatePickerMode(mode as any);
        }
    };


    const [showAddChain, setShowAddChain] = useState(false);
    const [editingChainId, setEditingChainId] = useState<string | null>(null);
    const [newChain, setNewChain] = useState({ id: '', name: '', image_url: '', thumbnail_url: '', is_active: true });

    const [stickers, setStickers] = useState<any[]>([]);
    const [showAddSticker, setShowAddSticker] = useState(false);
    const [editingStickerId, setEditingStickerId] = useState<string | null>(null);
    const [newSticker, setNewSticker] = useState({ name: '', image_url: '', is_active: true });
    const [addingSticker, setAddingSticker] = useState(false);

    const [drops, setDrops] = useState<any[]>([]);
    const [showAddDrop, setShowAddDrop] = useState(false);
    const [editingDropId, setEditingDropId] = useState<string | null>(null);
    const [newDrop, setNewDrop] = useState({
        id: '', name: '', start_date: '', end_date: '', is_active: true
    });
    const [moderationFilter, setModerationFilter] = useState<'open' | 'blocked' | 'all'>('open');
    const [moderationReviews, setModerationReviews] = useState<any[]>([]);
    const [moderationLoading, setModerationLoading] = useState(false);
    const [moderationBusyId, setModerationBusyId] = useState<string | null>(null);
    const [blockedOwnerIds, setBlockedOwnerIds] = useState<string[]>([]);
    const [moderationSearchType, setModerationSearchType] = useState<'owner' | 'capsule'>('owner');
    const [moderationSearchValue, setModerationSearchValue] = useState('');

    // Per-model configurations initialized from manager
    const [configs, setConfigs] = useState<Record<string, ModelTimerConfig>>(() => {
        const initial: Record<string, ModelTimerConfig> = {};
        allModels.forEach(m => {
            initial[m.id] = timerConfigManager.getConfig(m.id);
        });
        return initial;
    });

    const activeConfig = configs[selectedModel.id] || DEFAULT_CONFIGS.basicred_kap;

    // Keep a ref to the current selected model ID for the PanResponder closure
    const currentModelIdRef = useRef(selectedModel.id);
    useEffect(() => {
        currentModelIdRef.current = selectedModel.id;
    }, [selectedModel.id]);

    const syncConfigs = () => {
        const dbModels = timerConfigManager.models.filter((m: any) => !m?.is_hidden && m?.is_active !== false && !!(m?.image_cover || m?.image));
        if (dbModels.length > 0) {
            setAllModels([...dbModels]);
        }
        setConfigs((prev) => {
            const newConfigs: Record<string, ModelTimerConfig> = { ...prev };
            const modelsToSync = dbModels.length > 0 ? dbModels : MODELS;
            modelsToSync.forEach(m => {
                newConfigs[m.id] = timerConfigManager.getConfig(m.id);
            });
            return newConfigs;
        });
    };

    useEffect(() => {
        const unsubscribe = timerConfigManager.subscribe(() => {
            syncConfigs();
            setDrops(timerConfigManager.getDrops());
        });
        syncConfigs();
        loadStickers();
        setDrops(timerConfigManager.getDrops());
        return unsubscribe;
    }, []);

    useEffect(() => {
        if (!allModels.find(m => m.id === selectedModel?.id) && allModels.length > 0) {
            setSelectedModel(allModels[0]);
        }
    }, [allModels, selectedModel?.id]);

    useEffect(() => {
        const loadLayoutPreset = async () => {
            try {
                const [presetRaw, autoApplyRaw] = await Promise.all([
                    AsyncStorage.getItem(MODEL_LAYOUT_PRESET_KEY),
                    AsyncStorage.getItem(MODEL_LAYOUT_AUTO_APPLY_KEY),
                ]);
                if (presetRaw) {
                    setDefaultLayoutPreset(JSON.parse(presetRaw));
                }
                setAutoApplyDefaultLayout(autoApplyRaw === 'true');
            } catch (error) {
                console.warn('Could not load model layout preset', error);
            }
        };
        loadLayoutPreset();
    }, []);

    useEffect(() => {
        if (activeTab === 'moderation') {
            loadModerationQueue();
        }
    }, [activeTab, moderationFilter, moderationSearchType, moderationSearchValue]);

    const loadStickers = async () => {
        const { data } = await supabase.from('stickers').select('*').order('created_at', { ascending: false });
        if (data) setStickers(data);
    };

    const loadModerationQueue = async () => {
        setModerationLoading(true);
        try {
            const trimmedSearch = moderationSearchValue.trim();
            const isSearchMode = trimmedSearch.length > 0;
            const statuses = moderationFilter === 'open'
                ? ['needs_review', 'error']
                : moderationFilter === 'blocked'
                    ? ['rejected']
                    : ['needs_review', 'error', 'rejected', 'approved'];

            const adminId = getAuthUserIdSnapshot() || (await supabase.auth.getUser()).data.user?.id || null;
            let reviewsQuery = supabase
                .from('content_moderation_reviews')
                .select(`
                    *,
                    item:item_id(id, media_url, thumbnail_url, media_type, content),
                    owner:owner_id(id, username, display_name, avatar_url),
                    capsule:capsule_id(id, title, model)
                `)
                .order('created_at', { ascending: false })
                .limit(isSearchMode ? 120 : 100);

            if (isSearchMode) {
                reviewsQuery = moderationSearchType === 'owner'
                    ? reviewsQuery.eq('owner_id', trimmedSearch)
                    : reviewsQuery.eq('capsule_id', trimmedSearch);
            } else {
                reviewsQuery = reviewsQuery
                    .in('status', statuses)
                    .is('resolved_at', null);
            }

            const [reviewsResult, blockedResult] = await Promise.all([
                reviewsQuery,
                adminId
                    ? supabase.from('blocks').select('blocked_id').eq('blocker_id', adminId)
                    : Promise.resolve({ data: [], error: null } as any),
            ]);

            if (reviewsResult.error) {
                throw reviewsResult.error;
            }

            setModerationReviews(reviewsResult.data || []);
            setBlockedOwnerIds(((blockedResult as any)?.data || []).map((entry: any) => entry.blocked_id));
        } catch (error: any) {
            console.error('Failed to load moderation reviews', error);
            setModerationReviews([]);
            Alert.alert('Error', error?.message || 'Could not load moderation queue.');
        } finally {
            setModerationLoading(false);
        }
    };

    const resolveModerationReview = async (review: any, decision: 'approved' | 'rejected') => {
        setModerationBusyId(review.id);
        try {
            const adminId = getAuthUserIdSnapshot() || (await supabase.auth.getUser()).data.user?.id;
            const nowIso = new Date().toISOString();
            const item = review.item || {};
            const mediaPaths = [
                extractStoragePath('capsule-media', item.media_url || review.media_url),
                extractStoragePath('capsule-media', item.thumbnail_url),
            ].filter(Boolean) as string[];
            const { error: reviewError } = await supabase
                .from('content_moderation_reviews')
                .update({
                    status: decision,
                    action: decision === 'approved' ? 'allow' : 'block',
                    admin_notes: decision === 'approved'
                        ? 'Approved from Calibration Tool moderation queue'
                        : 'Rejected from Calibration Tool moderation queue',
                    media_url: null,
                    resolved_at: nowIso,
                    resolved_by: adminId || null,
                })
                .eq('id', review.id);

            if (reviewError) throw reviewError;

            if (review.item_id) {
                if (mediaPaths.length > 0) {
                    const { error: storageError } = await supabase.storage.from('capsule-media').remove(Array.from(new Set(mediaPaths)));
                    if (storageError) {
                        console.warn('Could not remove moderated media from storage', storageError);
                    }
                }
                const { error: itemError } = await supabase
                    .from('capsule_items')
                    .update({
                        moderation_status: decision === 'approved' ? 'approved' : 'rejected',
                        moderation_reason: review.reason || (decision === 'approved' ? 'Approved by admin review' : 'Rejected by admin review'),
                        moderated_at: nowIso,
                        moderation_review_id: review.id,
                        media_url: '',
                        thumbnail_url: '',
                    })
                    .eq('id', review.item_id);

                if (itemError) throw itemError;
            }

            setModerationReviews(prev => prev.filter(item => item.id !== review.id));
        } catch (error: any) {
            Alert.alert('Error', error?.message || 'Could not update moderation review.');
        } finally {
            setModerationBusyId(null);
        }
    };

    const blockModerationUser = async (review: any) => {
        const ownerId = review?.owner_id;
        if (!ownerId) {
            Alert.alert('Error', 'This review has no user to block.');
            return;
        }

        const adminId = getAuthUserIdSnapshot() || (await supabase.auth.getUser()).data.user?.id;
        if (!adminId) {
            Alert.alert('Error', 'Admin session not available.');
            return;
        }

        if (blockedOwnerIds.includes(ownerId)) {
            Alert.alert('Blocked', 'This user is already blocked by this admin account.');
            return;
        }

        setModerationBusyId(review.id);
        try {
            const { error } = await safetyService.blockUser(adminId, ownerId);
            if (error) throw error;
            setBlockedOwnerIds(prev => prev.includes(ownerId) ? prev : [...prev, ownerId]);
            Alert.alert('User blocked', `@${review?.owner?.username || review?.owner?.display_name || 'user'} has been blocked.`);
        } catch (error: any) {
            Alert.alert('Error', error?.message || 'Could not block this user.');
        } finally {
            setModerationBusyId(null);
        }
    };

    const applyLayoutPresetToForm = (preset: ModelLayoutPreset | null) => {
        if (!preset) return;
        setNewModel(p => ({
            ...p,
            ...preset,
        }));
    };

    const saveDefaultLayoutPreset = async () => {
        const preset = extractModelLayoutPreset(newModel);
        setDefaultLayoutPreset(preset);
        await AsyncStorage.setItem(MODEL_LAYOUT_PRESET_KEY, JSON.stringify(preset));
        Alert.alert('Preset saved', 'Default capsule layout preset saved.');
    };

    const updateAutoApplyDefaultLayout = async (value: boolean) => {
        setAutoApplyDefaultLayout(value);
        await AsyncStorage.setItem(MODEL_LAYOUT_AUTO_APPLY_KEY, value ? 'true' : 'false');
    };

    const resetModelForm = () => {
        setEditingModelId(null);
        const layout = autoApplyDefaultLayout && defaultLayoutPreset ? defaultLayoutPreset : DEFAULT_MODEL_LAYOUT;
        setNewModel({
            id: '', label: '', image: '', image_open: '',
            category: 'Vibe', tint: '#a269ff', is_active: true, is_event: false, is_birthday: false,
            is_trending: false, is_new: false,
            ...layout,
            ...DEFAULT_OPEN_MODEL_LAYOUT,
            effect_type: 'none', effect_tint: '#a269ff', effect_scale: 1, effect_offset_x: 0, effect_offset_y: 0, effect_opacity: 1, effect_layer: 'behind',
            event_start: '', event_end: '', event_title: '', event_description: '',
            drop_id: null
        });
    };

    const openNewModel = () => {
        resetModelForm();
        setShowAddModel(true);
    };

    const openEditModel = (model: any) => {
        setEditingModelId(model.id);
        setNewModel({
            ...model,
            thumbnail_url: model.thumbnail_url || '',
            event_start: model.event_start || '',
            event_end: model.event_end || '',
            event_title: model.event_title || '',
            event_description: model.event_description || '',
            is_birthday: !!model.is_birthday,
            is_event: !!model.is_event,
            is_trending: !!model.is_trending,
            is_new: !!model.is_new,
            image_scale: Number(model.image_scale) || 1,
            image_scale_x: Number(model.image_scale_x) || 1,
            image_scale_y: Number(model.image_scale_y) || 1,
            image_offset_x: Number(model.image_offset_x) || 0,
            image_offset_y: Number(model.image_offset_y) || 0,
            image_open_scale: Number(model.image_open_scale) || Number(model.image_scale) || 1,
            image_open_scale_x: Number(model.image_open_scale_x) || Number(model.image_scale_x) || 1,
            image_open_scale_y: Number(model.image_open_scale_y) || Number(model.image_scale_y) || 1,
            image_open_offset_x: Number(model.image_open_offset_x) || Number(model.image_offset_x) || 0,
            image_open_offset_y: Number(model.image_open_offset_y) || Number(model.image_offset_y) || 0,
            effect_type: model.effect_type || 'none',
            effect_tint: model.effect_tint || model.tint || '#a269ff',
            effect_scale: Number(model.effect_scale) || 1,
            effect_offset_x: Number(model.effect_offset_x) || 0,
            effect_offset_y: Number(model.effect_offset_y) || 0,
            effect_opacity: Number(model.effect_opacity) || 1,
            effect_layer: model.effect_layer === 'front' ? 'front' : 'behind',
            is_active: model.is_active !== false,
            drop_id: model.drop_id || null
        });
        setShowAddModel(true);
    };

    const openNewChain = () => {
        setEditingChainId(null);
        setNewChain({ id: '', name: '', image_url: '', thumbnail_url: '', is_active: true });
        setShowAddChain(true);
    };

    const openEditChain = (chain: any) => {
        setEditingChainId(chain.id);
        setNewChain({
            id: chain.id || '',
            name: chain.name || '',
            image_url: chain.image_url || '',
            thumbnail_url: chain.thumbnail_url || '',
            is_active: chain.is_active !== false,
        });
        setShowAddChain(true);
    };

    const openNewSticker = () => {
        setEditingStickerId(null);
        setNewSticker({ name: '', image_url: '', is_active: true });
        setShowAddSticker(true);
    };

    const openEditSticker = (sticker: any) => {
        setEditingStickerId(sticker.id);
        setNewSticker({
            name: sticker.name || '',
            image_url: sticker.image_url || '',
            is_active: sticker.is_active !== false,
        });
        setShowAddSticker(true);
    };

    const openNewDrop = () => {
        setEditingDropId(null);
        setNewDrop({ id: '', name: '', start_date: '', end_date: '', is_active: true });
        setShowAddDrop(true);
    };

    const openEditDrop = (drop: any) => {
        setEditingDropId(drop.id);
        setNewDrop({
            id: drop.id || '',
            name: drop.name || '',
            start_date: drop.start_date || '',
            end_date: drop.end_date || '',
            is_active: drop.is_active !== false,
        });
        setShowAddDrop(true);
    };

    const confirmDestructive = (title: string, message: string, onConfirm: () => void) => {
        if (Platform.OS === 'web') {
            if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) onConfirm();
            return;
        }
        Alert.alert(title, message, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: onConfirm },
        ]);
    };

    const deleteSticker = (sticker: any) => {
        confirmDestructive('Delete sticker', `Delete "${sticker.name}" from the admin library?`, async () => {
            const previous = stickers;
            setStickers(prev => prev.filter(item => item.id !== sticker.id));
            try {
                await supabase.from('profile_stickers').delete().eq('sticker_id', sticker.id);
                await supabase.from('user_stickers').delete().eq('sticker_id', sticker.id);
                const { error } = await supabase.from('stickers').delete().eq('id', sticker.id);
                if (error) throw error;
                await loadStickers();
            } catch (e) {
                setStickers(previous);
                Alert.alert('Error', 'Could not delete sticker. Check admin permissions.');
            }
        });
    };

    const deleteChain = (chain: any) => {
        confirmDestructive('Delete chain', `Delete "${chain.name}" and its calibrations?`, async () => {
            const success = await timerConfigManager.deleteChain(chain.id);
            if (success) {
                if (selectedChainId === chain.id) setSelectedChainId(null);
                syncConfigs();
            } else {
                Alert.alert('Error', 'Could not delete chain. Check admin permissions.');
            }
        });
    };

    const updateActiveConfigById = (modelId: string, updates: Partial<ModelTimerConfig>) => {
        setConfigs((prev: Record<string, ModelTimerConfig>) => ({
            ...prev,
            [modelId]: { ...prev[modelId], ...updates }
        }));
    };

    const updateActiveConfig = (updates: Partial<ModelTimerConfig>) => {
        updateActiveConfigById(selectedModel.id, updates);
    };

    const saveAsGlobalTimer = async () => {
        const success = await timerConfigManager.saveConfig('__GLOBAL__', activeConfig);
        if (success) Alert.alert('Success', 'Global Timer Position saved!');
    };

    const applyGlobalTimer = async () => {
        const globalConfig = timerConfigManager.getConfig('__GLOBAL__');
        if (globalConfig && globalConfig !== timerConfigManager.getConfig('basicred_kap')) {
            updateActiveConfig({
                x: globalConfig.x,
                y: globalConfig.y,
                w: globalConfig.w,
                h: globalConfig.h,
                fontId: globalConfig.fontId,
                color: globalConfig.color,
                format: globalConfig.format,
                themeColor: globalConfig.themeColor
            });
            Alert.alert('Applied', 'Global position template applied to current model');
        } else {
            Alert.alert('Not Found', 'No global timer position saved yet.');
        }
    };

    const saveAsGlobalChain = async () => {
        if (!selectedChainId) return;
        const x = (chainPan.x as any)._value;
        const y = (chainPan.y as any)._value;
        const success = await timerConfigManager.saveChainConfig({
            model_id: '__GLOBAL_TEMPLATE__',
            chain_id: selectedChainId,
            x: x / FRAME_SIZE,
            y: y / FRAME_SIZE,
            scale: chainScale
        });
        if (success) Alert.alert('Success', `Global Position for ${selectedChainId} saved!`);
    };

    const applyGlobalChain = async () => {
        if (!selectedChainId) return;
        const globalChain = timerConfigManager.getChainConfig('__GLOBAL_TEMPLATE__', selectedChainId);
        if (globalChain) {
            chainPan.setValue({ x: globalChain.x * FRAME_SIZE, y: globalChain.y * FRAME_SIZE });
            setChainScale(globalChain.scale);
            Alert.alert('Applied', `Global template for ${selectedChainId} applied to current view`);
        } else {
            Alert.alert('Not Found', `No global position saved for ${selectedChainId} yet.`);
        }
    };

    const filteredModels = useMemo(() => {
        if (!searchQuery.trim()) return allModels;
        const q = searchQuery.toLowerCase().trim();
        return allModels.filter(m =>
            (m.label || '').toLowerCase().includes(q) ||
            (m.id || '').toLowerCase().includes(q)
        );
    }, [allModels, searchQuery]);

    const activeTabMeta = ADMIN_TABS.find(tab => tab.id === activeTab) || ADMIN_TABS[0];
    const activeModelsCount = allModels.filter(m => m.is_active).length;
    const specialModelsCount = allModels.filter(m => m.is_event || m.is_birthday || m.is_trending || m.is_new).length;
    const baseModelReference = allModels.find(m => m.id === 'base_kap') || MODELS.find(m => m.id === 'base_kap');
    const layoutTimerReference = timerConfigManager.getConfig('__GLOBAL__') || timerConfigManager.getConfig('base_kap');
    const punkRabbitChain = timerConfigManager.getChainLibrary().find(c => c.id === 'punkrabbit_chain')
        || timerConfigManager.getChainLibrary().find(c => `${c.id} ${c.name}`.toLowerCase().includes('punk') && `${c.id} ${c.name}`.toLowerCase().includes('rabbit'));
    const layoutChainReference = punkRabbitChain ? timerConfigManager.getChainConfig('__GLOBAL_TEMPLATE__', punkRabbitChain.id) : undefined;
    const getDropName = (dropId?: string | null) => drops.find(d => d.id === dropId)?.name || null;
    const getDropModels = (dropId: string) => allModels.filter(m => m.drop_id === dropId);

    const pan = useRef(new Animated.ValueXY({ x: activeConfig.x * FRAME_SIZE, y: activeConfig.y * FRAME_SIZE })).current;

    useEffect(() => {
        pan.setValue({ x: activeConfig.x * FRAME_SIZE, y: activeConfig.y * FRAME_SIZE });
    }, [selectedModel.id, activeConfig.x, activeConfig.y, activeTab === 'timer']);

    // --- CHAIN POSITIONING ---
    const chainPan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
    const [chainScale, setChainScale] = useState(0.3);

    const activeChainConfig = selectedChainId
        ? (timerConfigManager.getChainConfig(selectedModel.id, selectedChainId) || {
            model_id: selectedModel.id, chain_id: selectedChainId, x: 0.5, y: 0.5, scale: 0.3
        }) : null;

    useEffect(() => {
        if (activeChainConfig) {
            chainPan.setValue({ x: activeChainConfig.x * FRAME_SIZE, y: activeChainConfig.y * FRAME_SIZE });
            setChainScale(activeChainConfig.scale);
        }
    }, [selectedChainId, selectedModel.id]);

    const chainResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onStartShouldSetPanResponderCapture: () => true,
            onMoveShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponderCapture: () => true,
            onPanResponderGrant: () => {
                setIsDragging(true);
                const x = (chainPan.x as any)._value;
                const y = (chainPan.y as any)._value;
                chainPan.setOffset({ x, y });
                chainPan.setValue({ x: 0, y: 0 });
            },
            onPanResponderMove: Animated.event([null, { dx: chainPan.x, dy: chainPan.y }], { useNativeDriver: false }),
            onPanResponderRelease: () => {
                setIsDragging(false);
                chainPan.flattenOffset();
            },
            onPanResponderTerminate: () => setIsDragging(false)
        })
    ).current;

    const [uploading, setUploading] = useState(false);

    const pickAndUploadImage = async (onDone: (url: string, thumbUrl?: string) => void) => {
        try {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) {
                Alert.alert('Permission required', 'Allow photo access to upload images.');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                quality: 0.8,
            });

            if (!result.canceled && result.assets[0]) {
                setUploading(true);
                const asset = result.assets[0];
                const timestamp = Date.now();
                const fileName = `model_${timestamp}.webp`;
                const thumbFileName = `model_${timestamp}_thumb.webp`;

                let body: any;
                let thumbBody: any;

                const processUri = async (uri: string, isThumb: boolean) => {
                    const manipulated = await (isThumb ? optimizeThumbnailForUpload(uri) : optimizeImageForUpload(uri));
                    if (Platform.OS === 'web') {
                        const res = await fetch(manipulated);
                        return await res.blob();
                    } else {
                        const base64 = await FileSystem.readAsStringAsync(manipulated, { encoding: 'base64' });
                        return decode(base64);
                    }
                };

                body = await processUri(asset.uri, false);
                thumbBody = await processUri(asset.uri, true);

                // Upload Full
                const { error: uploadError } = await supabase.storage.from('models').upload(fileName, body, {
                    contentType: 'image/webp',
                    upsert: true,
                });
                if (uploadError) throw uploadError;

                // Upload Thumb
                await supabase.storage.from('models').upload(thumbFileName, thumbBody, {
                    contentType: 'image/webp',
                    upsert: true,
                });

                const { data: { publicUrl: url } } = supabase.storage.from('models').getPublicUrl(fileName);
                const { data: { publicUrl: thumbUrl } } = supabase.storage.from('models').getPublicUrl(thumbFileName);

                onDone(url, thumbUrl);
            }
        } catch (e: any) {
            Alert.alert('Upload Error', e.message || 'Could not upload image.');
        } finally {
            setUploading(false);
        }
    };

    const handleAddModel = async () => {
        if (!newModel.id || !newModel.image) {
            Alert.alert('Error', 'Please provide ID and Image URL');
            return;
        }

        const modelToSave: any = { ...newModel, id: editingModelId || newModel.id.trim() };

        delete modelToSave.thumbnail_url;
        delete modelToSave.image_cover;

        // Clean up empty strings to prevent Postgres type errors
        if (!modelToSave.image_open) modelToSave.image_open = modelToSave.image;
        if (!modelToSave.event_start) modelToSave.event_start = null;
        if (!modelToSave.event_end) modelToSave.event_end = null;
        if (!modelToSave.drop_id) modelToSave.drop_id = null;
        if (!modelToSave.event_title) modelToSave.event_title = '';
        if (!modelToSave.event_description) modelToSave.event_description = '';
        modelToSave.image_scale = clampNumber(Number(modelToSave.image_scale) || 1, MIN_MODEL_IMAGE_SCALE, MAX_MODEL_IMAGE_SCALE);
        modelToSave.image_scale_x = clampNumber(Number(modelToSave.image_scale_x) || 1, MIN_MODEL_IMAGE_SCALE, MAX_MODEL_IMAGE_SCALE);
        modelToSave.image_scale_y = clampNumber(Number(modelToSave.image_scale_y) || 1, MIN_MODEL_IMAGE_SCALE, MAX_MODEL_IMAGE_SCALE);
        modelToSave.image_offset_x = clampNumber(Number(modelToSave.image_offset_x) || 0, MIN_MODEL_IMAGE_OFFSET, MAX_MODEL_IMAGE_OFFSET);
        modelToSave.image_offset_y = clampNumber(Number(modelToSave.image_offset_y) || 0, MIN_MODEL_IMAGE_OFFSET, MAX_MODEL_IMAGE_OFFSET);
        modelToSave.image_open_scale = clampNumber(Number(modelToSave.image_open_scale) || modelToSave.image_scale || 1, MIN_MODEL_IMAGE_SCALE, MAX_MODEL_IMAGE_SCALE);
        modelToSave.image_open_scale_x = clampNumber(Number(modelToSave.image_open_scale_x) || modelToSave.image_scale_x || 1, MIN_MODEL_IMAGE_SCALE, MAX_MODEL_IMAGE_SCALE);
        modelToSave.image_open_scale_y = clampNumber(Number(modelToSave.image_open_scale_y) || modelToSave.image_scale_y || 1, MIN_MODEL_IMAGE_SCALE, MAX_MODEL_IMAGE_SCALE);
        modelToSave.image_open_offset_x = clampNumber(Number(modelToSave.image_open_offset_x) || modelToSave.image_offset_x || 0, MIN_MODEL_IMAGE_OFFSET, MAX_MODEL_IMAGE_OFFSET);
        modelToSave.image_open_offset_y = clampNumber(Number(modelToSave.image_open_offset_y) || modelToSave.image_offset_y || 0, MIN_MODEL_IMAGE_OFFSET, MAX_MODEL_IMAGE_OFFSET);
        modelToSave.effect_type = modelToSave.effect_type || 'none';
        modelToSave.effect_tint = modelToSave.effect_tint || modelToSave.tint || '#a269ff';
        modelToSave.effect_scale = clampNumber(Number(modelToSave.effect_scale) || 1, 0.4, 2.2);
        modelToSave.effect_offset_x = clampNumber(Number(modelToSave.effect_offset_x) || 0, -120, 120);
        modelToSave.effect_offset_y = clampNumber(Number(modelToSave.effect_offset_y) || 0, -120, 120);
        modelToSave.effect_opacity = clampNumber(Number(modelToSave.effect_opacity) || 1, 0, 1);
        modelToSave.effect_layer = modelToSave.effect_layer === 'front' ? 'front' : 'behind';

        const success = await timerConfigManager.saveModel(modelToSave);
        if (success) {
            if (!editingModelId && !configs[modelToSave.id]) {
                await timerConfigManager.saveConfig(modelToSave.id, DEFAULT_CONFIGS.basicred_kap);
            }
            syncConfigs();
            setSelectedModel(modelToSave);
            setShowAddModel(false);
            resetModelForm();
            Alert.alert('Success', editingModelId ? 'Model updated successfully' : 'Model created successfully');
        } else {
            console.error('Failed to save model:', timerConfigManager.lastError);
            const dbError = timerConfigManager.lastError as any;
            const details = [dbError?.message, dbError?.details, dbError?.hint].filter(Boolean).join('\n');
            Alert.alert('Error', details || 'Could not save model to database.');
        }
    };

    const handleAddChain = async () => {
        if (!newChain.id.trim() || !newChain.name.trim() || !newChain.image_url.trim()) {
            Alert.alert('Error', 'Please provide ID, Name and Image URL');
            return;
        }
        const chainToSave = {
            ...newChain,
            id: editingChainId || newChain.id.trim(),
            name: newChain.name.trim(),
            image_url: newChain.image_url.trim(),
            thumbnail_url: newChain.thumbnail_url?.trim() || null,
        };

        const success = await timerConfigManager.addChainToLibrary(chainToSave);
        if (success) {
            setSelectedChainId(chainToSave.id);
            setShowAddChain(false);
            setEditingChainId(null);
            setNewChain({ id: '', name: '', image_url: '', thumbnail_url: '', is_active: true });
            Alert.alert('Success', editingChainId ? 'Chain updated!' : 'Chain created!');
        } else {
            Alert.alert('Error', 'Could not save chain.');
        }
    };

    const handleAddSticker = async () => {
        if (!newSticker.name || !newSticker.image_url) {
            Alert.alert('Error', 'Please provide Name and Image URL');
            return;
        }

        try {
            setAddingSticker(true);
            const payload = {
                name: newSticker.name.trim(),
                image_url: newSticker.image_url.trim(),
                is_active: newSticker.is_active,
            };
            const query = editingStickerId
                ? supabase.from('stickers').update(payload).eq('id', editingStickerId).select()
                : supabase.from('stickers').insert([payload]).select();
            const { data, error } = await query;

            if (error) {
                Alert.alert('Error', error.message);
                return;
            }

            if (data && data.length > 0) {
                setStickers(prev => editingStickerId ? prev.map(s => s.id === editingStickerId ? data[0] : s) : [data[0], ...prev]);
                setShowAddSticker(false);
                setEditingStickerId(null);
                setNewSticker({ name: '', image_url: '', is_active: true });
                Alert.alert('Success', editingStickerId ? 'Sticker updated!' : 'Sticker added!');
            } else {
                loadStickers();
                setShowAddSticker(false);
                setEditingStickerId(null);
                setNewSticker({ name: '', image_url: '', is_active: true });
            }
        } catch (e: any) {
            Alert.alert('Error', 'An unexpected error occurred: ' + e.message);
        } finally {
            setAddingSticker(false);
        }
    };

    const handleAddDrop = async () => {
        if (!newDrop.name || !newDrop.start_date) {
            Alert.alert('Error', 'Please provide name and start date');
            return;
        }
        const dropToSave: any = {
            ...newDrop,
            id: editingDropId || newDrop.id || undefined,
            name: newDrop.name.trim(),
            end_date: newDrop.end_date || null,
        };
        if (!dropToSave.id) delete dropToSave.id;
        const success = await timerConfigManager.saveDrop(dropToSave);
        if (success) {
            setShowAddDrop(false);
            setEditingDropId(null);
            setNewDrop({ id: '', name: '', start_date: '', end_date: '', is_active: true });
            setDrops(timerConfigManager.getDrops());
            Alert.alert('Success', editingDropId ? 'Drop updated!' : 'Drop created!');
        } else {
            Alert.alert('Error', 'Could not save drop.');
        }
    };

    const handleDeleteDrop = async (id: string) => {
        confirmDestructive('Delete Drop', 'This removes the drop schedule. Designs already created keep their saved data.', async () => {
            const success = await timerConfigManager.deleteDrop(id);
            if (success) {
                setDrops(timerConfigManager.getDrops());
                Alert.alert('Success', 'Drop deleted.');
            } else {
                Alert.alert('Error', 'Could not delete drop.');
            }
        });
    };

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onStartShouldSetPanResponderCapture: () => true,
            onMoveShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponderCapture: () => true,
            onPanResponderGrant: () => {
                setIsDragging(true);
                const x = (pan.x as any)._value;
                const y = (pan.y as any)._value;
                pan.setOffset({ x, y });
                pan.setValue({ x: 0, y: 0 });
            },
            onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
            onPanResponderRelease: () => {
                setIsDragging(false);
                pan.flattenOffset();
                const x = (pan.x as any)._value;
                const y = (pan.y as any)._value;
                updateActiveConfigById(currentModelIdRef.current, {
                    x: Math.max(0, Math.min(1, x / FRAME_SIZE)),
                    y: Math.max(0, Math.min(1, y / FRAME_SIZE))
                });
            },
            onPanResponderTerminate: () => setIsDragging(false),
        })
    ).current;

    const reset = () => {
        const def: ModelTimerConfig = DEFAULT_CONFIGS[selectedModel.id] || DEFAULT_CONFIGS['basicred_kap'];
        pan.setValue({ x: def.x * FRAME_SIZE, y: def.y * FRAME_SIZE });
        updateActiveConfig(def);
    };

    const saveChanges = async () => {
        const success = await timerConfigManager.saveConfig(selectedModel.id, activeConfig);
        if (success) {
            Alert.alert('Success', `Config for ${selectedModel.label} saved globally!`);
        } else {
            Alert.alert('Error', 'Failed to save configuration. Check permissions.');
        }
    };

    return (
        <View style={[styles.container, { paddingTop: Platform.OS === 'android' ? insets.top : 0 }]}>
            <StatusBar barStyle="dark-content" />
            <View style={styles.header}>
                <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="close" size={28} color={Colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Admin Tools</Text>
                <TouchableOpacity activeOpacity={0.7} onPress={reset}>
                    <Text style={styles.resetBtn}>Reset</Text>
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false} scrollEnabled={!isDragging}>
                <LinearGradient colors={['#ffffff', '#f7f3ff']} style={styles.adminHero}>
                    <View style={styles.adminHeroTop}>
                        <View>
                            <Text style={styles.adminEyebrow}>Kapsely admin</Text>
                            <Text style={styles.adminTitle}>{activeTabMeta.label}</Text>
                            <Text style={styles.adminHint}>{activeTabMeta.hint}</Text>
                        </View>
                        <View style={styles.adminHeroIcon}>
                            <Ionicons name={activeTabMeta.icon} size={24} color={Colors.primary} />
                        </View>
                    </View>
                    <View style={styles.adminStats}>
                        <View style={styles.adminStatCard}>
                            <Text style={styles.adminStatValue}>{allModels.length}</Text>
                            <Text style={styles.adminStatLabel}>Models</Text>
                        </View>
                        <View style={styles.adminStatCard}>
                            <Text style={styles.adminStatValue}>{activeModelsCount}</Text>
                            <Text style={styles.adminStatLabel}>Active</Text>
                        </View>
                        <View style={styles.adminStatCard}>
                            <Text style={styles.adminStatValue}>{specialModelsCount}</Text>
                            <Text style={styles.adminStatLabel}>Special</Text>
                        </View>
                    </View>
                </LinearGradient>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.topTabs} contentContainerStyle={styles.topTabsContent}>
                    {ADMIN_TABS.map(tab => (
                        <TouchableOpacity
                            key={tab.id}
                            style={[styles.topTab, activeTab === tab.id && styles.activeTopTab]}
                            activeOpacity={0.78}
                            onPress={() => setActiveTab(tab.id)}
                        >
                            <Ionicons name={tab.icon} size={18} color={activeTab === tab.id ? '#fff' : Colors.textMuted} />
                            <Text style={[styles.topTabText, activeTab === tab.id && styles.activeTopTabText]}>{tab.label}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {(activeTab === 'timer' || activeTab === 'chain') && <View style={styles.previewContainer}>
                    <View style={styles.modelFrame}>
                        <Image
                            source={{ uri: selectedModel.image }}
                            style={[
                                styles.modelImg,
                                {
                                    transform: getModelImageTransform(selectedModel),
                                },
                            ]}
                            resizeMode="contain"
                        />

                        {activeTab === 'timer' ? (
                            <Animated.View
                                style={{
                                    position: 'absolute', left: 0, top: 0,
                                    width: activeConfig.w * FRAME_SIZE,
                                    height: activeConfig.h * FRAME_SIZE,
                                    transform: [{ translateX: pan.x }, { translateY: pan.y }],
                                    borderWidth: 1, borderColor: 'rgba(162, 105, 255, 0.5)',
                                    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(162, 105, 255, 0.1)'
                                }}
                                {...panResponder.panHandlers}
                            >
                                <LiveTimer
                                    date={new Date(Date.now() + 1000 * 3600 * 2.25).toISOString()}
                                    modelId={selectedModel.id}
                                    configOverride={activeConfig}
                                    style={{ fontSize: Math.max(10, (FRAME_SIZE * activeConfig.h) * 0.55) }}
                                />
                            </Animated.View>
                        ) : (
                            !!selectedChainId && (
                                <Animated.View
                                    style={{
                                        position: 'absolute',
                                        left: chainPan.x,
                                        top: chainPan.y,
                                        width: FRAME_SIZE * chainScale,
                                        height: FRAME_SIZE * chainScale,
                                        transform: [
                                            { translateX: - (FRAME_SIZE * chainScale) / 2 },
                                            { translateY: - (FRAME_SIZE * chainScale) / 2 }
                                        ],
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderWidth: 1,
                                        borderColor: 'rgba(162, 105, 255, 0.4)',
                                        borderStyle: 'dashed',
                                    }}
                                    {...chainResponder.panHandlers}
                                >
                                    <Image
                                        source={{ uri: timerConfigManager.getChainLibrary().find(c => c.id === selectedChainId)?.image_url }}
                                        style={{ width: '100%', height: '100%', resizeMode: 'contain' }}
                                    />
                                    <View style={{
                                        position: 'absolute',
                                        width: 8, height: 8,
                                        borderRadius: 4,
                                        backgroundColor: '#a269ff',
                                        borderWidth: 2,
                                        borderColor: 'white'
                                    }} />
                                </Animated.View>
                            )
                        )}
                    </View>
                    <Text style={styles.hint}>Drag to move · Selected: {selectedModel.label}</Text>
                </View>}

                <View style={styles.controls}>
                    {(activeTab === 'timer' || activeTab === 'chain') && <><View style={styles.sectionHeaderInner}>
                        <View>
                            <Text style={styles.sectionLabelTitle}>Model Selection</Text>
                            <Text style={styles.sectionSub}>Choose or create a base capsule model</Text>
                        </View>
                        <TouchableOpacity style={styles.addModelBtn} activeOpacity={0.7} onPress={openNewModel}>
                            <LinearGradient colors={[Colors.primary, Colors.primaryDark || Colors.primary]} style={styles.addModelIcon}>
                                <Ionicons name="add" size={18} color="#fff" />
                            </LinearGradient>
                            <Text style={styles.addModelBtnText}>New</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.modelList}>
                        {allModels.map(m => (
                            <TouchableOpacity
                                key={m.id}
                                style={[styles.modelTab, selectedModel.id === m.id && styles.activeTab]}
                                activeOpacity={0.8}
                                onPress={() => setSelectedModel(m)}
                            >
                                <View style={styles.tabImgWrapper}>
                                    <Image source={{ uri: m.image }} style={styles.tabImg} />
                                    {selectedModel.id === m.id && <View style={styles.tabActiveIndicator} />}
                                </View>
                                <Text style={[styles.tabLabel, selectedModel.id === m.id && styles.activeTabText]}>{m.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <View style={styles.divider} /></>}

                    {activeTab === 'moderation' ? (
                        <View style={styles.moderationSection}>
                            <View style={styles.sectionHeaderInner}>
                                <View>
                                    <Text style={styles.label}>Moderation Queue</Text>
                                    <Text style={styles.sectionSub}>Blocked content and items the AI was unsure about.</Text>
                                </View>
                                <TouchableOpacity style={styles.addModelBtn} activeOpacity={0.75} onPress={loadModerationQueue}>
                                    <Ionicons name="refresh" size={18} color={Colors.primary} />
                                    <Text style={styles.addModelBtnText}>Refresh</Text>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.moderationFilterRow}>
                                {[
                                    { id: 'open', label: 'Review' },
                                    { id: 'blocked', label: 'Blocked' },
                                    { id: 'all', label: 'All' },
                                ].map(option => (
                                    <TouchableOpacity
                                        key={option.id}
                                        style={[styles.moderationFilterBtn, moderationFilter === option.id && styles.moderationFilterBtnActive]}
                                        activeOpacity={0.78}
                                        onPress={() => setModerationFilter(option.id as 'open' | 'blocked' | 'all')}
                                    >
                                        <Text style={[styles.moderationFilterText, moderationFilter === option.id && styles.moderationFilterTextActive]}>
                                            {option.label}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <View style={styles.moderationSearchCard}>
                                <Text style={styles.moderationSearchLabel}>Search archived moderation</Text>
                                <View style={styles.moderationSearchTypeRow}>
                                    {[
                                        { id: 'owner', label: 'User ID' },
                                        { id: 'capsule', label: 'Capsule ID' },
                                    ].map(option => (
                                        <TouchableOpacity
                                            key={option.id}
                                            style={[styles.moderationSearchTypeBtn, moderationSearchType === option.id && styles.moderationSearchTypeBtnActive]}
                                            activeOpacity={0.78}
                                            onPress={() => setModerationSearchType(option.id as 'owner' | 'capsule')}
                                        >
                                            <Text style={[styles.moderationSearchTypeText, moderationSearchType === option.id && styles.moderationSearchTypeTextActive]}>
                                                {option.label}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                                <View style={styles.searchContainer}>
                                    <Ionicons name="search" size={18} color={Colors.textMuted} style={styles.searchIcon} />
                                    <TextInput
                                        style={styles.searchInput}
                                        placeholder={moderationSearchType === 'owner' ? 'Paste user ID to see archived reviews...' : 'Paste capsule ID to see archived reviews...'}
                                        placeholderTextColor={Colors.textMuted}
                                        value={moderationSearchValue}
                                        onChangeText={setModerationSearchValue}
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                    />
                                    {moderationSearchValue.length > 0 && (
                                        <TouchableOpacity onPress={() => setModerationSearchValue('')}>
                                            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                                        </TouchableOpacity>
                                    )}
                                </View>
                                <Text style={styles.moderationSearchHint}>
                                    Resolved content leaves this queue. Archived cases only appear when you search by exact user or capsule ID.
                                </Text>
                            </View>

                            {moderationLoading ? (
                                <View style={styles.moderationEmptyState}>
                                    <ActivityIndicator color={Colors.primary} />
                                    <Text style={styles.moderationEmptyTitle}>Loading moderation queue...</Text>
                                </View>
                            ) : moderationReviews.length === 0 ? (
                                <View style={styles.moderationEmptyState}>
                                    <Ionicons name="checkmark-done-circle" size={30} color="#22c55e" />
                                    <Text style={styles.moderationEmptyTitle}>All clear</Text>
                                    <Text style={styles.moderationEmptyText}>There is nothing pending in this filter right now.</Text>
                                </View>
                            ) : (
                                <View style={styles.moderationList}>
                                    {moderationReviews.map(review => {
                                        const owner = review.owner || {};
                                        const capsule = review.capsule || {};
                                        const item = review.item || {};
                                        const previewType = item.media_type || review.media_type;
                                        const previewUrl = item.thumbnail_url || item.media_url || review.media_url || '';
                                        const fullMediaUrl = item.media_url || review.media_url || '';
                                        const topScoreEntry = Object.entries(review.category_scores || {})
                                            .sort((a: any, b: any) => Number(b[1]) - Number(a[1]))[0] as [string, any] | undefined;
                                        const isBusy = moderationBusyId === review.id;
                                        const alreadyBlocked = blockedOwnerIds.includes(review.owner_id);

                                        return (
                                            <View key={review.id} style={styles.moderationCard}>
                                                <View style={styles.moderationPreview}>
                                                    {previewType === 'image' && previewUrl ? (
                                                        <Image source={{ uri: previewUrl }} style={styles.moderationPreviewMedia} resizeMode="contain" />
                                                    ) : previewType === 'video' && (previewUrl || fullMediaUrl) ? (
                                                        <Image source={{ uri: previewUrl || fullMediaUrl }} style={styles.moderationPreviewMedia} resizeMode="contain" />
                                                    ) : previewType === 'note' && (item.content || review.content_excerpt) ? (
                                                        <View style={styles.moderationTextPreview}>
                                                            <Ionicons name="document-text" size={24} color={Colors.primary} />
                                                            <Text style={styles.moderationTextPreviewLabel}>Note preview</Text>
                                                            <Text style={styles.moderationTextPreviewContent} numberOfLines={6}>
                                                                {item.content || review.content_excerpt}
                                                            </Text>
                                                        </View>
                                                    ) : previewType === 'audio' ? (
                                                        <View style={styles.moderationVideoPlaceholder}>
                                                            <Ionicons name="mic" size={24} color={Colors.primary} />
                                                            <Text style={styles.moderationVideoText}>Audio clip</Text>
                                                        </View>
                                                    ) : (
                                                        <View style={styles.moderationVideoPlaceholder}>
                                                            <Ionicons name="document-text" size={24} color={Colors.primary} />
                                                            <Text style={styles.moderationVideoText}>{previewType || 'Text'}</Text>
                                                        </View>
                                                    )}
                                                    <View style={[
                                                        styles.moderationStatusPill,
                                                        review.status === 'rejected'
                                                            ? styles.moderationStatusRejected
                                                            : review.status === 'approved'
                                                                ? styles.moderationStatusApproved
                                                                : styles.moderationStatusReview
                                                    ]}>
                                                        <Text style={styles.moderationStatusText}>{review.status}</Text>
                                                    </View>
                                                </View>

                                                <View style={styles.moderationBody}>
                                                    <Text style={styles.moderationCapsuleTitle}>{capsule.title || 'Untitled capsule'}</Text>
                                                    <Text style={styles.moderationOwnerText}>
                                                        @{owner.username || owner.display_name || 'user'}
                                                    </Text>
                                                    {!!review.content_excerpt && (
                                                        <Text style={styles.moderationExcerpt} numberOfLines={3}>{review.content_excerpt}</Text>
                                                    )}
                                                    <View style={styles.moderationReasonRow}>
                                                        <Ionicons name="alert-circle" size={15} color="#f97316" />
                                                        <Text style={styles.moderationReasonText}>
                                                            {review.reason || 'The AI could not confidently auto-approve this content.'}
                                                        </Text>
                                                    </View>
                                                    {topScoreEntry ? (
                                                        <Text style={styles.moderationScoreText}>
                                                            Strongest signal: {topScoreEntry[0]} ({Math.round(Number(topScoreEntry[1]) * 100)}%)
                                                        </Text>
                                                    ) : null}

                                                    <View style={styles.moderationActionRow}>
                                                        <TouchableOpacity
                                                            style={[styles.moderationApproveBtn, isBusy && styles.moderationActionDisabled]}
                                                            activeOpacity={0.8}
                                                            disabled={isBusy}
                                                            onPress={() => resolveModerationReview(review, 'approved')}
                                                        >
                                                            {isBusy ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="checkmark" size={16} color="#fff" />}
                                                            <Text style={styles.moderationApproveText}>Approve</Text>
                                                        </TouchableOpacity>
                                                        <TouchableOpacity
                                                            style={[styles.moderationRejectBtn, isBusy && styles.moderationActionDisabled]}
                                                            activeOpacity={0.8}
                                                            disabled={isBusy}
                                                            onPress={() => resolveModerationReview(review, 'rejected')}
                                                        >
                                                            <Ionicons name="close" size={16} color="#fff" />
                                                            <Text style={styles.moderationRejectText}>Reject</Text>
                                                        </TouchableOpacity>
                                                    </View>

                                                    <TouchableOpacity
                                                        style={[styles.moderationBlockBtn, alreadyBlocked && styles.moderationBlockBtnDisabled, isBusy && styles.moderationActionDisabled]}
                                                        activeOpacity={0.78}
                                                        disabled={alreadyBlocked || isBusy}
                                                        onPress={() => blockModerationUser(review)}
                                                    >
                                                        <Ionicons name={alreadyBlocked ? 'shield-checkmark' : 'ban'} size={15} color={alreadyBlocked ? '#64748b' : '#ef4444'} />
                                                        <Text style={[styles.moderationBlockText, alreadyBlocked && styles.moderationBlockTextDisabled]}>
                                                            {alreadyBlocked ? 'User already blocked' : 'Block user'}
                                                        </Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>
                            )}
                        </View>
                    ) : activeTab === 'timer' ? (
                        <View style={styles.timerCalibration}>
                            <View style={styles.grid}>
                                <View style={styles.col}>
                                    <Text style={styles.label}>Timer Style</Text>
                                    <View style={styles.toggleRow}>
                                        <TouchableOpacity
                                            style={[styles.toggleBtn, activeConfig.format === 'standard' && styles.activeToggle]}
                                            activeOpacity={0.7}
                                            onPress={() => updateActiveConfig({ format: 'standard' })}
                                        >
                                            <Text style={[styles.toggleText, activeConfig.format === 'standard' && styles.activeToggleText]}>H:M:S</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.toggleBtn, activeConfig.format === 'days' && styles.activeToggle]}
                                            activeOpacity={0.7}
                                            onPress={() => updateActiveConfig({ format: 'days' })}
                                        >
                                            <Text style={[styles.toggleText, activeConfig.format === 'days' && styles.activeToggleText]}>Days</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                                <View style={styles.col}>
                                    <Text style={styles.label}>Typography</Text>
                                    <View style={styles.fontRow}>
                                        {FONTS.map(f => (
                                            <TouchableOpacity
                                                key={f.id}
                                                style={[styles.fontBtn, activeConfig.fontId === f.id && styles.activeFontBtn]}
                                                activeOpacity={0.7}
                                                onPress={() => updateActiveConfig({ fontId: f.id })}
                                            >
                                                <Text style={[styles.fontBtnText, activeConfig.fontId === f.id && styles.activeFontBtnText, { fontFamily: f.font }]}>Aa</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                            </View>

                            <Text style={styles.label}>Text Color</Text>
                            <View style={styles.colorPalette}>
                                {PRESET_COLORS.map(c => (
                                    <TouchableOpacity
                                        key={c}
                                        style={[styles.colorBubble, { backgroundColor: c }, activeConfig.color === c && styles.activeColorBubble]}
                                        activeOpacity={0.7}
                                        onPress={() => updateActiveConfig({ color: c })}
                                    />
                                ))}
                            </View>

                            <Text style={styles.label}>Theme Base Color</Text>
                            <View style={styles.colorPalette}>
                                {PRESET_THEME_COLORS.map(c => (
                                    <TouchableOpacity
                                        key={c}
                                        style={[styles.colorBubble, { backgroundColor: c }, activeConfig.themeColor === c && styles.activeColorBubble]}
                                        activeOpacity={0.7}
                                        onPress={() => updateActiveConfig({ themeColor: c })}
                                    />
                                ))}
                            </View>

                            <View style={styles.grid}>
                                <View style={styles.col}>
                                    <Text style={styles.label}>Width: {(activeConfig.w * 100).toFixed(0)}%</Text>
                                    <View style={styles.sliderTrackAlt}>
                                        <TouchableOpacity style={styles.sliderBtnSmall} activeOpacity={0.7} onPress={() => updateActiveConfig({ w: Math.max(0.1, activeConfig.w - 0.05) })}>
                                            <Ionicons name="remove" size={16} />
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.sliderBtnSmall} activeOpacity={0.7} onPress={() => updateActiveConfig({ w: Math.min(1.0, activeConfig.w + 0.05) })}>
                                            <Ionicons name="add" size={16} />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                                <View style={styles.col}>
                                    <Text style={styles.label}>Height: {(activeConfig.h * 100).toFixed(0)}%</Text>
                                    <View style={styles.sliderTrackAlt}>
                                        <TouchableOpacity style={styles.sliderBtnSmall} activeOpacity={0.7} onPress={() => updateActiveConfig({ h: Math.max(0.05, activeConfig.h - 0.02) })}>
                                            <Ionicons name="remove" size={16} />
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.sliderBtnSmall} activeOpacity={0.7} onPress={() => updateActiveConfig({ h: Math.min(0.5, activeConfig.h + 0.02) })}>
                                            <Ionicons name="add" size={16} />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>

                            <TouchableOpacity style={styles.saveBtn} activeOpacity={0.8} onPress={saveChanges}>
                                <Text style={styles.saveBtnText}>Save Configuration</Text>
                            </TouchableOpacity>

                            <View style={[styles.grid, { marginTop: 10 }]}>
                                <TouchableOpacity
                                    style={[styles.globalBtn, { backgroundColor: '#FF8A00' }]}
                                    onPress={saveAsGlobalTimer}
                                >
                                    <Ionicons name="earth" size={16} color="#fff" />
                                    <Text style={styles.globalBtnText}>Set Global Timer</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.globalBtn, { backgroundColor: '#00D1FF' }]}
                                    onPress={applyGlobalTimer}
                                >
                                    <Ionicons name="download" size={16} color="#fff" />
                                    <Text style={styles.globalBtnText}>Use Global Timer</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ) : activeTab === 'chain' ? (
                        <View style={styles.chainSection}>
                            <View style={styles.sectionHeaderInner}>
                                <Text style={styles.label}>Select Chain from Library</Text>
                                <TouchableOpacity style={styles.addModelBtn} activeOpacity={0.7} onPress={openNewChain}>
                                    <Ionicons name="add-circle" size={18} color={Colors.primary} />
                                    <Text style={styles.addModelBtnText}>New Chain</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={styles.chainList}>
                                {timerConfigManager.getChainLibrary().map(c => (
                                    <TouchableOpacity
                                        key={c.id}
                                        style={[styles.chainCard, selectedChainId === c.id && styles.activeChainCard]}
                                        activeOpacity={0.7}
                                        onPress={() => setSelectedChainId(c.id)}
                                    >
                                        <Image source={{ uri: c.image_url }} style={styles.chainImg} resizeMode="cover" />
                                        <Text style={styles.chainLabel} numberOfLines={1}>{c.name}</Text>
                                        <TouchableOpacity
                                            style={styles.editChainBtn}
                                            activeOpacity={0.75}
                                            onPress={(event) => {
                                                event.stopPropagation?.();
                                                openEditChain(c);
                                            }}
                                        >
                                            <Ionicons name="pencil" size={13} color={Colors.primary} />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={styles.deleteChainBtn}
                                            activeOpacity={0.75}
                                            onPress={(event) => {
                                                event.stopPropagation?.();
                                                deleteChain(c);
                                            }}
                                        >
                                            <Ionicons name="trash-outline" size={13} color={Colors.error} />
                                        </TouchableOpacity>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {selectedChainId && (
                                <View style={styles.chainCalibration}>
                                    <Text style={styles.label}>Calibrate Scale</Text>
                                    <View style={styles.sliderTrackAlt}>
                                        <TouchableOpacity style={styles.sliderBtnSmall} activeOpacity={0.7} onPress={() => setChainScale(Math.max(0.05, chainScale - 0.05))}>
                                            <Ionicons name="remove" size={16} />
                                        </TouchableOpacity>
                                        <Text style={{ fontSize: 12, fontFamily: Fonts.bold, width: 50, textAlign: 'center' }}>{(chainScale * 100).toFixed(0)}%</Text>
                                        <TouchableOpacity style={styles.sliderBtnSmall} activeOpacity={0.7} onPress={() => setChainScale(Math.min(1.0, chainScale + 0.05))}>
                                            <Ionicons name="add" size={16} />
                                        </TouchableOpacity>
                                    </View>
                                    <TouchableOpacity
                                        style={[styles.saveBtn, { marginTop: 15, backgroundColor: Colors.textSecondary }]}
                                        activeOpacity={0.8}
                                        onPress={async () => {
                                            const x = (chainPan.x as any)._value;
                                            const y = (chainPan.y as any)._value;
                                            const success = await timerConfigManager.saveChainConfig({
                                                model_id: selectedModel.id,
                                                chain_id: selectedChainId,
                                                x: x / FRAME_SIZE,
                                                y: y / FRAME_SIZE,
                                                scale: chainScale
                                            });
                                            if (success) {
                                                Alert.alert('Success', 'Chain calibration saved!');
                                            } else {
                                                Alert.alert('Error', 'Could not save chain calibration.');
                                            }
                                        }}
                                    >
                                        <Text style={styles.saveBtnText}>Save Chain Calibration</Text>
                                    </TouchableOpacity>

                                    <View style={[styles.grid, { marginTop: 10 }]}>
                                        <TouchableOpacity
                                            style={[styles.globalBtn, { backgroundColor: '#FF8A00' }]}
                                            onPress={saveAsGlobalChain}
                                        >
                                            <Ionicons name="earth" size={16} color="#fff" />
                                            <Text style={styles.globalBtnText}>Set Global Chain</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.globalBtn, { backgroundColor: '#00D1FF' }]}
                                            onPress={applyGlobalChain}
                                        >
                                            <Ionicons name="download" size={16} color="#fff" />
                                            <Text style={styles.globalBtnText}>Use Global Chain</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}
                        </View>
                    ) : activeTab === 'stickers' ? (
                        <View style={styles.stickerSection}>
                            <View style={styles.sectionHeaderInner}>
                                <Text style={styles.label}>Manage Profile Stickers</Text>
                                <TouchableOpacity style={styles.addModelBtn} activeOpacity={0.7} onPress={openNewSticker}>
                                    <Ionicons name="add-circle" size={18} color={Colors.primary} />
                                    <Text style={styles.addModelBtnText}>New Sticker</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={styles.stickerGrid}>
                                {stickers.map(s => (
                                    <View key={s.id} style={styles.stickerCard}>
                                        <Image source={{ uri: s.image_url }} style={styles.stickerImg} resizeMode="contain" />
                                        <Text style={styles.stickerName} numberOfLines={1}>{s.name}</Text>
                                        <TouchableOpacity style={styles.editStickerBtn} onPress={() => openEditSticker(s)}>
                                            <Ionicons name="pencil" size={14} color={Colors.primary} />
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.deleteStickerBtn} onPress={() => deleteSticker(s)}>
                                            <Ionicons name="trash-outline" size={14} color={Colors.error} />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        </View>
                    ) : activeTab === 'drops' ? (
                        <View style={styles.dropSection}>
                            <View style={styles.sectionHeaderInner}>
                                <View>
                                    <Text style={styles.sectionLabelTitle}>Drops Management</Text>
                                    <Text style={styles.sectionSub}>Create and manage design drops</Text>
                                </View>
                                <TouchableOpacity style={styles.addModelBtn} activeOpacity={0.7} onPress={openNewDrop}>
                                    <LinearGradient colors={[Colors.primary, Colors.primaryDark || Colors.primary]} style={styles.addModelIcon}>
                                        <Ionicons name="add" size={18} color="#fff" />
                                    </LinearGradient>
                                    <Text style={styles.addModelBtnText}>New Drop</Text>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.dropList}>
                                {drops.map(d => {
                                    const dropModels = getDropModels(d.id);
                                    return (
                                        <View key={d.id} style={styles.dropCard}>
                                            <View style={styles.dropCardTop}>
                                                <View style={styles.dropCardInfo}>
                                                    <Text style={styles.dropCardName}>{d.name}</Text>
                                                    <Text style={styles.dropCardDates}>
                                                        {new Date(d.start_date).toLocaleDateString()} - {d.end_date ? new Date(d.end_date).toLocaleDateString() : 'No end date'}
                                                    </Text>
                                                    <View style={styles.dropMetaRow}>
                                                        <View style={[styles.statusPill, { backgroundColor: d.is_active ? '#e6fce6' : '#ffeeee' }]}>
                                                            <Text style={[styles.statusPillText, { color: d.is_active ? '#2d8a2d' : '#8a2d2d' }]}>
                                                                {d.is_active ? 'Active' : 'Inactive'}
                                                            </Text>
                                                        </View>
                                                        <View style={[styles.statusPill, { backgroundColor: Colors.primary + '10' }]}>
                                                            <Text style={[styles.statusPillText, { color: Colors.primary }]}>
                                                                {dropModels.length} capsule{dropModels.length === 1 ? '' : 's'}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                </View>
                                                <View style={styles.dropActions}>
                                                    <TouchableOpacity onPress={() => openEditDrop(d)} style={styles.editDropBtn}>
                                                        <Ionicons name="pencil" size={18} color={Colors.primary} />
                                                    </TouchableOpacity>
                                                    <TouchableOpacity onPress={() => handleDeleteDrop(d.id)} style={styles.deleteDropBtn}>
                                                        <Ionicons name="trash-outline" size={20} color="#ff5252" />
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                            <View style={styles.dropModelList}>
                                                {dropModels.length > 0 ? dropModels.map((m: any) => (
                                                    <View key={m.id} style={styles.dropModelChip}>
                                                        <Image source={{ uri: m.image_cover || m.image }} style={styles.dropModelThumb} />
                                                        <Text style={styles.dropModelName} numberOfLines={1}>{m.label || m.id}</Text>
                                                        <Text style={[styles.dropModelState, { color: m.is_active === false ? Colors.error : '#319795' }]}>
                                                            {m.is_active === false ? 'Hidden' : 'Active'}
                                                        </Text>
                                                    </View>
                                                )) : (
                                                    <View style={styles.dropEmptyState}>
                                                        <Ionicons name="cube-outline" size={15} color={Colors.textMuted} />
                                                        <Text style={styles.dropEmptyText}>No capsules assigned to this drop</Text>
                                                    </View>
                                                )}
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        </View>
                    ) : (
                        <View style={styles.stickerSection}>
                            <View style={styles.sectionHeaderInner}>
                                <View>
                                    <Text style={styles.label}>Capsule Library</Text>
                                    <Text style={styles.sectionSub}>Total: {allModels.length} models</Text>
                                </View>
                                <TouchableOpacity style={styles.addModelBtn} onPress={openNewModel}>
                                    <Ionicons name="add-circle" size={18} color={Colors.primary} />
                                    <Text style={styles.addModelBtnText}>New Model</Text>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.searchContainer}>
                                <Ionicons name="search" size={18} color={Colors.textMuted} style={styles.searchIcon} />
                                <TextInput
                                    style={styles.searchInput}
                                    placeholder="Search capsule by name or ID..."
                                    placeholderTextColor={Colors.textMuted}
                                    value={searchQuery}
                                    onChangeText={setSearchQuery}
                                />
                                {searchQuery.length > 0 && (
                                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                                        <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                                    </TouchableOpacity>
                                )}
                            </View>

                            <View>
                                {filteredModels.map((m: any) => (
                                    <View key={m.id} style={styles.modelLibraryCard}>
                                        <Image source={{ uri: m.image_cover || m.image }} style={styles.modelLibraryThumb} />
                                        <View style={{ flex: 1, gap: 2 }}>
                                            <Text style={styles.modelLibraryLabel}>{m.label || m.id}</Text>
                                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                                {m.is_active ?
                                                    <View style={[styles.statusTag, { backgroundColor: '#e6fffa' }]}><Text style={[styles.statusTagText, { color: '#319795' }]}>Active</Text></View> :
                                                    <View style={[styles.statusTag, { backgroundColor: '#fff5f5' }]}><Text style={[styles.statusTagText, { color: '#e53e3e' }]}>Hidden</Text></View>
                                                }
                                                {m.is_event &&
                                                    <View style={[styles.statusTag, { backgroundColor: '#fffaf0' }]}><Text style={[styles.statusTagText, { color: '#dd6b20' }]}>Event</Text></View>
                                                }
                                                {m.is_birthday &&
                                                    <View style={[styles.statusTag, { backgroundColor: '#fff1f8' }]}><Text style={[styles.statusTagText, { color: '#db2777' }]}>Birthday</Text></View>
                                                }
                                                {m.is_trending &&
                                                    <View style={[styles.statusTag, { backgroundColor: '#fff5f5' }]}><Text style={[styles.statusTagText, { color: '#e53e3e' }]}>Popular</Text></View>
                                                }
                                                {m.is_new &&
                                                    <View style={[styles.statusTag, { backgroundColor: '#ebf8ff' }]}><Text style={[styles.statusTagText, { color: '#3182ce' }]}>New</Text></View>
                                                }
                                                {m.drop_id && getDropName(m.drop_id) &&
                                                    <View style={[styles.statusTag, styles.dropLibraryTag]}>
                                                        <Ionicons name="flash" size={10} color="#fff" />
                                                        <Text style={[styles.statusTagText, { color: '#fff' }]}>{getDropName(m.drop_id)}</Text>
                                                    </View>
                                                }
                                            </View>
                                        </View>
                                        <View style={{ flexDirection: 'row', gap: 10 }}>
                                            <TouchableOpacity
                                                style={styles.libActionBtn}
                                                onPress={() => openEditModel(m)}
                                            >
                                                <Ionicons name="pencil" size={16} color={Colors.primary} />
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.libActionBtn, { backgroundColor: Colors.error + '10' }]}
                                                onPress={() => {
                                                    const performDelete = async () => {
                                                        const success = await timerConfigManager.deleteModel(m.id);
                                                        if (success) {
                                                            syncConfigs();
                                                            Alert.alert('Success', 'Model deleted successfully');
                                                        } else {
                                                            const errorMessage =
                                                                (timerConfigManager as any).lastError?.message ||
                                                                'Could not delete model. Check dependencies or admin permissions.';
                                                            Alert.alert('Error', errorMessage);
                                                        }
                                                    };

                                                    if (Platform.OS === 'web') {
                                                        if (window.confirm(`Delete model ${m.id}?`)) {
                                                            performDelete();
                                                        }
                                                    } else {
                                                        Alert.alert('Delete', `Delete model ${m.id}?`, [
                                                            { text: 'Cancel' },
                                                            { text: 'Delete', style: 'destructive', onPress: performDelete }
                                                        ]);
                                                    }
                                                }}
                                            >
                                                <Ionicons name="trash" size={16} color={Colors.error} />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}
                    <View style={{ height: 60 }} />
                </View>
            </ScrollView>

            <Modal visible={showAddModel} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <ScrollView contentContainerStyle={styles.modalScrollContent} style={{ flex: 1 }}>
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>{editingModelId ? 'Edit Model' : 'Configure Model'}</Text>

                            <View style={styles.inputSection}>
                                <Text style={styles.innerLabel}>Basic Info</Text>
                                <TextInput
                                    placeholder="Model ID (e.g. golden_cap)"
                                    placeholderTextColor="#999"
                                    value={newModel.id || ''}
                                    onChangeText={t => setNewModel(p => ({ ...p, id: t }))}
                                    editable={!editingModelId}
                                    style={[styles.input, editingModelId ? styles.disabledInput : null]}
                                />
                                <TextInput
                                    placeholder="Label (e.g. Golden Capsule)"
                                    placeholderTextColor="#999"
                                    value={newModel.label || ''}
                                    onChangeText={t => setNewModel(p => ({ ...p, label: t }))}
                                    style={styles.input}
                                />
                            </View>

                            <View style={styles.inputSection}>
                                <Text style={styles.innerLabel}>Drop Association</Text>
                                <Text style={styles.switchSub}>Designs in a drop only appear during its active dates.</Text>
                                <View style={styles.dropPicker}>
                                    <TouchableOpacity
                                        style={[styles.dropOption, !newModel.drop_id && styles.activeDropOption]}
                                        onPress={() => setNewModel(p => ({ ...p, drop_id: null }))}
                                    >
                                        <Text style={[styles.dropOptionText, !newModel.drop_id && styles.activeDropOptionText]}>None</Text>
                                    </TouchableOpacity>
                                    {drops.map(d => (
                                        <TouchableOpacity
                                            key={d.id}
                                            style={[styles.dropOption, newModel.drop_id === d.id && styles.activeDropOption]}
                                            onPress={() => setNewModel(p => ({ ...p, drop_id: d.id }))}
                                        >
                                            <Text style={[styles.dropOptionText, newModel.drop_id === d.id && styles.activeDropOptionText]}>{d.name}</Text>
                                            {newModel.drop_id === d.id && <Ionicons name="checkmark" size={12} color="#fff" />}
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>

                            <View style={styles.inputSection}>
                                <Text style={styles.innerLabel}>Assets</Text>
                                <View style={styles.assetInputRow}>
                                    <View style={{ flex: 1 }}>
                                        <TextInput
                                            placeholder="Image URL (WebP)"
                                            placeholderTextColor="#999"
                                            value={newModel.image || ''}
                                            onChangeText={t => setNewModel(p => ({ ...p, image: t }))}
                                            style={[styles.input, { marginBottom: 0 }]}
                                        />
                                        {newModel.image ? (
                                            <Image source={{ uri: newModel.image }} style={styles.assetPreview} resizeMode="contain" />
                                        ) : null}
                                    </View>
                                    <TouchableOpacity
                                        style={[styles.uploadSmallBtn, uploading && { opacity: 0.5 }]}
                                        onPress={() => pickAndUploadImage((url) => setNewModel(p => ({ ...p, image: url })))}
                                        disabled={uploading}
                                    >
                                        {uploading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="camera" size={20} color="#fff" />}
                                    </TouchableOpacity>
                                </View>
                                <View style={[styles.assetInputRow, { marginTop: 15 }]}>
                                    <View style={{ flex: 1 }}>
                                        <TextInput
                                            placeholder="Image Open URL (WebP)"
                                            placeholderTextColor="#999"
                                            value={newModel.image_open || ''}
                                            onChangeText={t => setNewModel(p => ({ ...p, image_open: t }))}
                                            style={[styles.input, { marginBottom: 0 }]}
                                        />
                                        {newModel.image_open ? (
                                            <Image source={{ uri: newModel.image_open }} style={styles.assetPreview} resizeMode="contain" />
                                        ) : null}
                                    </View>
                                    <TouchableOpacity
                                        style={[styles.uploadSmallBtn, uploading && { opacity: 0.5 }]}
                                        onPress={() => pickAndUploadImage(url => setNewModel(p => ({ ...p, image_open: url })))}
                                        disabled={uploading}
                                    >
                                        {uploading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="camera" size={20} color="#fff" />}
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <View style={styles.inputSection}>
                                <View style={styles.layoutSectionHeader}>
                                    <View>
                                        <Text style={styles.innerLabel}>Image Layout</Text>
                                        <Text style={styles.switchSub}>Adjust size and position inside the design frame.</Text>
                                    </View>
                                    <TouchableOpacity
                                        style={styles.layoutResetBtn}
                                        activeOpacity={0.75}
                                        onPress={() => setNewModel(p => ({ ...p, image_scale: 1, image_scale_x: 1, image_scale_y: 1, image_offset_x: 0, image_offset_y: 0 }))}
                                    >
                                        <Ionicons name="refresh" size={14} color={Colors.primary} />
                                        <Text style={styles.layoutResetText}>Reset</Text>
                                    </TouchableOpacity>
                                </View>
                                <View style={styles.referenceToggleRow}>
                                    <View style={styles.referenceToggleCopy}>
                                        <Ionicons name="grid-outline" size={16} color={Colors.primary} />
                                        <Text style={styles.referenceToggleText}>Guides + base_kap reference</Text>
                                    </View>
                                    <Switch
                                        value={showBaseModelReference}
                                        onValueChange={setShowBaseModelReference}
                                        trackColor={{ true: Colors.primary }}
                                    />
                                </View>
                                <View style={styles.referenceToggleRow}>
                                    <View style={styles.referenceToggleCopy}>
                                        <Ionicons name="time-outline" size={16} color={Colors.primary} />
                                        <Text style={styles.referenceToggleText}>Global timer position</Text>
                                    </View>
                                    <Switch
                                        value={showLayoutTimerReference}
                                        onValueChange={setShowLayoutTimerReference}
                                        trackColor={{ true: Colors.primary }}
                                    />
                                </View>
                                <View style={styles.referenceToggleRow}>
                                    <View style={styles.referenceToggleCopy}>
                                        <Ionicons name="link-outline" size={16} color={Colors.primary} />
                                        <Text style={styles.referenceToggleText}>Punk Rabbit global chain</Text>
                                    </View>
                                    <Switch
                                        value={showLayoutChainReference}
                                        onValueChange={setShowLayoutChainReference}
                                        trackColor={{ true: Colors.primary }}
                                    />
                                </View>
                                <View style={styles.referenceControls}>
                                    <View style={styles.referenceControlHeader}>
                                        <Text style={styles.layoutControlLabel}>base_kap Opacity</Text>
                                        <Text style={styles.referenceValue}>{Math.round(baseModelReferenceOpacity * 100)}%</Text>
                                    </View>
                                    <View style={styles.layoutStepper}>
                                        <TouchableOpacity
                                            style={styles.layoutStepBtn}
                                            activeOpacity={0.75}
                                            onPress={() => setBaseModelReferenceOpacity(v => clampNumber(v - 0.05, 0.1, 1))}
                                        >
                                            <Ionicons name="remove" size={18} color={Colors.textPrimary} />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.referenceLayerBtn, baseModelReferenceLayer === 'behind' && styles.activeReferenceLayerBtn]}
                                            activeOpacity={0.75}
                                            onPress={() => setBaseModelReferenceLayer('behind')}
                                        >
                                            <Text style={[styles.referenceLayerText, baseModelReferenceLayer === 'behind' && styles.activeReferenceLayerText]}>Behind</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.referenceLayerBtn, baseModelReferenceLayer === 'front' && styles.activeReferenceLayerBtn]}
                                            activeOpacity={0.75}
                                            onPress={() => setBaseModelReferenceLayer('front')}
                                        >
                                            <Text style={[styles.referenceLayerText, baseModelReferenceLayer === 'front' && styles.activeReferenceLayerText]}>Front</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={styles.layoutStepBtn}
                                            activeOpacity={0.75}
                                            onPress={() => setBaseModelReferenceOpacity(v => clampNumber(v + 0.05, 0.1, 1))}
                                        >
                                            <Ionicons name="add" size={18} color={Colors.textPrimary} />
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <View style={styles.modelLayoutPreview}>
                                    <View pointerEvents="none" style={styles.layoutGuideLayer}>
                                        <View style={[styles.layoutGuideLine, styles.layoutGuideVertical]} />
                                        <View style={[styles.layoutGuideLine, styles.layoutGuideHorizontal]} />
                                        <View style={[styles.layoutGuideLineSoft, styles.layoutGuideVerticalLeft]} />
                                        <View style={[styles.layoutGuideLineSoft, styles.layoutGuideVerticalRight]} />
                                        <View style={[styles.layoutGuideLineSoft, styles.layoutGuideHorizontalTop]} />
                                        <View style={[styles.layoutGuideLineSoft, styles.layoutGuideHorizontalBottom]} />
                                        <View style={styles.layoutGuideCenterDot} />
                                    </View>
                                    {showBaseModelReference && baseModelReference?.image ? (
                                        <View
                                            pointerEvents="none"
                                            style={[
                                                styles.baseModelReferenceLayer,
                                                { zIndex: baseModelReferenceLayer === 'front' ? 4 : 1 }
                                            ]}
                                        >
                                            <Image
                                                source={{ uri: baseModelReference.image }}
                                                style={[
                                                    styles.baseModelReferenceImage,
                                                    { opacity: baseModelReferenceOpacity },
                                                    {
                                                        transform: [
                                                        ...getModelImageTransform(baseModelReference),
                                                        ],
                                                    },
                                                ]}
                                                resizeMode="contain"
                                            />
                                        </View>
                                    ) : null}
                                    {newModel.image ? (
                                        <CapsuleWithTimer
                                            modelKey={newModel.id || 'base_kap'}
                                            source={{ uri: newModel.image }}
                                            date={new Date(Date.now() + 1000 * 3600 * 24).toISOString()}
                                            modelLayout={newModel}
                                            preferModelLayout
                                            style={styles.modelLayoutPreviewImage}
                                            hideTimer
                                            hideParticles
                                            disableAnimations
                                        />
                                    ) : (
                                        <Ionicons name="image-outline" size={38} color={Colors.textMuted} />
                                    )}
                                    {showLayoutTimerReference && layoutTimerReference ? (
                                        <View
                                            pointerEvents="none"
                                            style={[
                                                styles.layoutTimerReference,
                                                {
                                                    left: layoutTimerReference.x * LAYOUT_PREVIEW_SIZE,
                                                    top: layoutTimerReference.y * LAYOUT_PREVIEW_SIZE,
                                                    width: layoutTimerReference.w * LAYOUT_PREVIEW_SIZE,
                                                    height: layoutTimerReference.h * LAYOUT_PREVIEW_SIZE,
                                                },
                                            ]}
                                        >
                                            <LiveTimer
                                                date={new Date(Date.now() + 1000 * 3600 * 2.25).toISOString()}
                                                modelId="__GLOBAL__"
                                                configOverride={layoutTimerReference}
                                                style={{ fontSize: Math.max(7, (LAYOUT_PREVIEW_SIZE * layoutTimerReference.h) * 0.48) }}
                                            />
                                        </View>
                                    ) : null}
                                    {showLayoutChainReference && punkRabbitChain?.image_url && layoutChainReference ? (
                                        <View
                                            pointerEvents="none"
                                            style={[
                                                styles.layoutChainReference,
                                                {
                                                    left: layoutChainReference.x * LAYOUT_PREVIEW_SIZE,
                                                    top: layoutChainReference.y * LAYOUT_PREVIEW_SIZE,
                                                    width: LAYOUT_PREVIEW_SIZE * layoutChainReference.scale,
                                                    height: LAYOUT_PREVIEW_SIZE * layoutChainReference.scale,
                                                    transform: [
                                                        { translateX: -(LAYOUT_PREVIEW_SIZE * layoutChainReference.scale) / 2 },
                                                        { translateY: -(LAYOUT_PREVIEW_SIZE * layoutChainReference.scale) / 2 },
                                                    ],
                                                },
                                            ]}
                                        >
                                            <Image source={{ uri: punkRabbitChain.image_url }} style={styles.layoutChainReferenceImage} resizeMode="contain" />
                                        </View>
                                    ) : null}
                                </View>

                                <View style={styles.layoutQuickActions}>
                                    <TouchableOpacity
                                        style={styles.layoutQuickBtn}
                                        activeOpacity={0.75}
                                        onPress={() => {
                                            const baseLayout = getModelImageLayout(baseModelReference);
                                            setNewModel(p => ({
                                                ...p,
                                                image_scale: baseLayout.scale,
                                                image_scale_x: baseLayout.scaleX,
                                                image_scale_y: baseLayout.scaleY,
                                                image_offset_x: baseLayout.offsetX,
                                                image_offset_y: baseLayout.offsetY,
                                            }));
                                        }}
                                    >
                                        <Ionicons name="copy-outline" size={14} color={Colors.primary} />
                                        <Text style={styles.layoutQuickText}>Match base_kap</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.layoutQuickBtn}
                                        activeOpacity={0.75}
                                        onPress={saveDefaultLayoutPreset}
                                    >
                                        <Ionicons name="save-outline" size={14} color={Colors.primary} />
                                        <Text style={styles.layoutQuickText}>Save default</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.layoutQuickBtn, !defaultLayoutPreset && { opacity: 0.45 }]}
                                        activeOpacity={0.75}
                                        disabled={!defaultLayoutPreset}
                                        onPress={() => applyLayoutPresetToForm(defaultLayoutPreset)}
                                    >
                                        <Ionicons name="download-outline" size={14} color={Colors.primary} />
                                        <Text style={styles.layoutQuickText}>Apply default</Text>
                                    </TouchableOpacity>
                                </View>
                                <View style={styles.autoPresetRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.referenceToggleText}>Use default preset on new designs</Text>
                                        <Text style={styles.switchSub}>You can still apply or reset it manually.</Text>
                                    </View>
                                    <Switch
                                        value={autoApplyDefaultLayout}
                                        onValueChange={updateAutoApplyDefaultLayout}
                                        trackColor={{ true: Colors.primary }}
                                    />
                                </View>

                                <View style={styles.layoutControl}>
                                    <Text style={styles.layoutControlLabel}>Overall Size</Text>
                                    <View style={styles.layoutStepper}>
                                        <TouchableOpacity
                                            style={styles.layoutStepBtn}
                                            activeOpacity={0.75}
                                            onPress={() => setNewModel(p => ({ ...p, image_scale: clampNumber((Number(p.image_scale) || 1) - 0.01, MIN_MODEL_IMAGE_SCALE, MAX_MODEL_IMAGE_SCALE) }))}
                                        >
                                            <Ionicons name="remove" size={18} color={Colors.textPrimary} />
                                        </TouchableOpacity>
                                        <Text style={styles.layoutValue}>{Math.round(getModelImageLayout(newModel).scale * 100)}%</Text>
                                        <TouchableOpacity
                                            style={styles.layoutStepBtn}
                                            activeOpacity={0.75}
                                            onPress={() => setNewModel(p => ({ ...p, image_scale: clampNumber((Number(p.image_scale) || 1) + 0.01, MIN_MODEL_IMAGE_SCALE, MAX_MODEL_IMAGE_SCALE) }))}
                                        >
                                            <Ionicons name="add" size={18} color={Colors.textPrimary} />
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <View style={styles.layoutControl}>
                                    <Text style={styles.layoutControlLabel}>Width Stretch</Text>
                                    <View style={styles.layoutStepper}>
                                        <TouchableOpacity
                                            style={styles.layoutStepBtn}
                                            activeOpacity={0.75}
                                            onPress={() => setNewModel(p => ({ ...p, image_scale_x: clampNumber((Number(p.image_scale_x) || 1) - 0.01, MIN_MODEL_IMAGE_SCALE, MAX_MODEL_IMAGE_SCALE) }))}
                                        >
                                            <Ionicons name="contract-outline" size={17} color={Colors.textPrimary} />
                                        </TouchableOpacity>
                                        <Text style={styles.layoutValue}>{Math.round(getModelImageLayout(newModel).scaleX * 100)}%</Text>
                                        <TouchableOpacity
                                            style={styles.layoutStepBtn}
                                            activeOpacity={0.75}
                                            onPress={() => setNewModel(p => ({ ...p, image_scale_x: clampNumber((Number(p.image_scale_x) || 1) + 0.01, MIN_MODEL_IMAGE_SCALE, MAX_MODEL_IMAGE_SCALE) }))}
                                        >
                                            <Ionicons name="resize-outline" size={17} color={Colors.textPrimary} />
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <View style={styles.layoutControl}>
                                    <Text style={styles.layoutControlLabel}>Height Stretch</Text>
                                    <View style={styles.layoutStepper}>
                                        <TouchableOpacity
                                            style={styles.layoutStepBtn}
                                            activeOpacity={0.75}
                                            onPress={() => setNewModel(p => ({ ...p, image_scale_y: clampNumber((Number(p.image_scale_y) || 1) - 0.01, MIN_MODEL_IMAGE_SCALE, MAX_MODEL_IMAGE_SCALE) }))}
                                        >
                                            <Ionicons name="contract-outline" size={17} color={Colors.textPrimary} />
                                        </TouchableOpacity>
                                        <Text style={styles.layoutValue}>{Math.round(getModelImageLayout(newModel).scaleY * 100)}%</Text>
                                        <TouchableOpacity
                                            style={styles.layoutStepBtn}
                                            activeOpacity={0.75}
                                            onPress={() => setNewModel(p => ({ ...p, image_scale_y: clampNumber((Number(p.image_scale_y) || 1) + 0.01, MIN_MODEL_IMAGE_SCALE, MAX_MODEL_IMAGE_SCALE) }))}
                                        >
                                            <Ionicons name="resize-outline" size={17} color={Colors.textPrimary} />
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <View style={styles.layoutControl}>
                                    <Text style={styles.layoutControlLabel}>Move Horizontal</Text>
                                    <View style={styles.layoutStepper}>
                                        <TouchableOpacity
                                            style={styles.layoutStepBtn}
                                            activeOpacity={0.75}
                                            onPress={() => setNewModel(p => ({ ...p, image_offset_x: clampNumber((Number(p.image_offset_x) || 0) - 1, MIN_MODEL_IMAGE_OFFSET, MAX_MODEL_IMAGE_OFFSET) }))}
                                        >
                                            <Ionicons name="arrow-back" size={17} color={Colors.textPrimary} />
                                        </TouchableOpacity>
                                        <Text style={styles.layoutValue}>{Math.round(getModelImageLayout(newModel).offsetX)}px</Text>
                                        <TouchableOpacity
                                            style={styles.layoutStepBtn}
                                            activeOpacity={0.75}
                                            onPress={() => setNewModel(p => ({ ...p, image_offset_x: clampNumber((Number(p.image_offset_x) || 0) + 1, MIN_MODEL_IMAGE_OFFSET, MAX_MODEL_IMAGE_OFFSET) }))}
                                        >
                                            <Ionicons name="arrow-forward" size={17} color={Colors.textPrimary} />
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <View style={styles.layoutControl}>
                                    <Text style={styles.layoutControlLabel}>Move Vertical</Text>
                                    <View style={styles.layoutStepper}>
                                        <TouchableOpacity
                                            style={styles.layoutStepBtn}
                                            activeOpacity={0.75}
                                            onPress={() => setNewModel(p => ({ ...p, image_offset_y: clampNumber((Number(p.image_offset_y) || 0) - 1, MIN_MODEL_IMAGE_OFFSET, MAX_MODEL_IMAGE_OFFSET) }))}
                                        >
                                            <Ionicons name="arrow-up" size={17} color={Colors.textPrimary} />
                                        </TouchableOpacity>
                                        <Text style={styles.layoutValue}>{Math.round(getModelImageLayout(newModel).offsetY)}px</Text>
                                        <TouchableOpacity
                                            style={styles.layoutStepBtn}
                                            activeOpacity={0.75}
                                            onPress={() => setNewModel(p => ({ ...p, image_offset_y: clampNumber((Number(p.image_offset_y) || 0) + 1, MIN_MODEL_IMAGE_OFFSET, MAX_MODEL_IMAGE_OFFSET) }))}
                                        >
                                            <Ionicons name="arrow-down" size={17} color={Colors.textPrimary} />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>

                            <View style={[styles.inputSection, { marginTop: 18 }]}>
                                <View style={styles.layoutSectionHeader}>
                                    <View>
                                        <Text style={styles.innerLabel}>Open Image Layout</Text>
                                        <Text style={styles.switchSub}>Adjust the opened version independently. If there is no open art yet, this still calibrates the fallback view.</Text>
                                    </View>
                                    <TouchableOpacity
                                        style={styles.layoutResetBtn}
                                        activeOpacity={0.75}
                                        onPress={() => setNewModel(p => ({
                                            ...p,
                                            image_open_scale: p.image_scale || 1,
                                            image_open_scale_x: p.image_scale_x || 1,
                                            image_open_scale_y: p.image_scale_y || 1,
                                            image_open_offset_x: p.image_offset_x || 0,
                                            image_open_offset_y: p.image_offset_y || 0,
                                        }))}
                                    >
                                        <Ionicons name="refresh" size={14} color={Colors.primary} />
                                        <Text style={styles.layoutResetText}>Match Closed</Text>
                                    </TouchableOpacity>
                                </View>

                                <View style={styles.modelLayoutPreview}>
                                    <View pointerEvents="none" style={styles.layoutGuideLayer}>
                                        <View style={[styles.layoutGuideLine, styles.layoutGuideVertical]} />
                                        <View style={[styles.layoutGuideLine, styles.layoutGuideHorizontal]} />
                                        <View style={[styles.layoutGuideLineSoft, styles.layoutGuideVerticalLeft]} />
                                        <View style={[styles.layoutGuideLineSoft, styles.layoutGuideVerticalRight]} />
                                        <View style={[styles.layoutGuideLineSoft, styles.layoutGuideHorizontalTop]} />
                                        <View style={[styles.layoutGuideLineSoft, styles.layoutGuideHorizontalBottom]} />
                                        <View style={styles.layoutGuideCenterDot} />
                                    </View>
                                    {newModel.image_open || newModel.image ? (
                                        <CapsuleWithTimer
                                            modelKey={newModel.id || 'base_kap'}
                                            source={{ uri: newModel.image_open || newModel.image }}
                                            date={new Date(Date.now() + 1000 * 3600 * 24).toISOString()}
                                            modelLayout={newModel}
                                            preferModelLayout
                                            style={styles.modelLayoutPreviewImage}
                                            hideTimer
                                            hideParticles
                                            isOpened
                                            disableAnimations
                                        />
                                    ) : (
                                        <Ionicons name="image-outline" size={38} color={Colors.textMuted} />
                                    )}
                                    {showLayoutTimerReference && layoutTimerReference ? (
                                        <View
                                            pointerEvents="none"
                                            style={[
                                                styles.layoutTimerReference,
                                                {
                                                    left: layoutTimerReference.x * LAYOUT_PREVIEW_SIZE,
                                                    top: layoutTimerReference.y * LAYOUT_PREVIEW_SIZE,
                                                    width: layoutTimerReference.w * LAYOUT_PREVIEW_SIZE,
                                                    height: layoutTimerReference.h * LAYOUT_PREVIEW_SIZE,
                                                },
                                            ]}
                                        >
                                            <LiveTimer
                                                date={new Date(Date.now() + 1000 * 3600 * 2.25).toISOString()}
                                                modelId="__GLOBAL__"
                                                configOverride={layoutTimerReference}
                                                style={{ fontSize: Math.max(7, (LAYOUT_PREVIEW_SIZE * layoutTimerReference.h) * 0.48) }}
                                                hideLabel
                                                isOpened
                                            />
                                        </View>
                                    ) : null}
                                    {showLayoutChainReference && punkRabbitChain?.image_url && layoutChainReference ? (
                                        <View
                                            pointerEvents="none"
                                            style={[
                                                styles.layoutChainReference,
                                                {
                                                    left: layoutChainReference.x * LAYOUT_PREVIEW_SIZE,
                                                    top: layoutChainReference.y * LAYOUT_PREVIEW_SIZE,
                                                    width: LAYOUT_PREVIEW_SIZE * layoutChainReference.scale,
                                                    height: LAYOUT_PREVIEW_SIZE * layoutChainReference.scale,
                                                    transform: [
                                                        { translateX: -(LAYOUT_PREVIEW_SIZE * layoutChainReference.scale) / 2 },
                                                        { translateY: -(LAYOUT_PREVIEW_SIZE * layoutChainReference.scale) / 2 },
                                                    ],
                                                },
                                            ]}
                                        >
                                            <Image source={{ uri: punkRabbitChain.image_url }} style={styles.layoutChainReferenceImage} resizeMode="contain" />
                                        </View>
                                    ) : null}
                                </View>

                                <View style={styles.layoutQuickActions}>
                                    <TouchableOpacity
                                        style={styles.layoutQuickBtn}
                                        activeOpacity={0.75}
                                        onPress={() => {
                                            const openLayout = getOpenModelImageLayout(newModel);
                                            setNewModel(p => ({
                                                ...p,
                                                image_open_scale: openLayout.scale,
                                                image_open_scale_x: openLayout.scaleX,
                                                image_open_scale_y: openLayout.scaleY,
                                                image_open_offset_x: openLayout.offsetX,
                                                image_open_offset_y: openLayout.offsetY,
                                            }));
                                        }}
                                    >
                                        <Ionicons name="sparkles-outline" size={14} color={Colors.primary} />
                                        <Text style={styles.layoutQuickText}>Keep open values</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.layoutQuickBtn}
                                        activeOpacity={0.75}
                                        onPress={() => {
                                            const closedLayout = extractModelLayoutPreset(newModel);
                                            setNewModel(p => ({
                                                ...p,
                                                image_open_scale: closedLayout.image_scale,
                                                image_open_scale_x: closedLayout.image_scale_x,
                                                image_open_scale_y: closedLayout.image_scale_y,
                                                image_open_offset_x: closedLayout.image_offset_x,
                                                image_open_offset_y: closedLayout.image_offset_y,
                                            }));
                                        }}
                                    >
                                        <Ionicons name="copy-outline" size={14} color={Colors.primary} />
                                        <Text style={styles.layoutQuickText}>Copy closed layout</Text>
                                    </TouchableOpacity>
                                </View>

                                <View style={styles.layoutControl}>
                                    <Text style={styles.layoutControlLabel}>Open Overall Size</Text>
                                    <View style={styles.layoutStepper}>
                                        <TouchableOpacity
                                            style={styles.layoutStepBtn}
                                            activeOpacity={0.75}
                                            onPress={() => setNewModel(p => ({ ...p, image_open_scale: clampNumber((Number(p.image_open_scale) || 1) - 0.01, MIN_MODEL_IMAGE_SCALE, MAX_MODEL_IMAGE_SCALE) }))}
                                        >
                                            <Ionicons name="remove" size={18} color={Colors.textPrimary} />
                                        </TouchableOpacity>
                                        <Text style={styles.layoutValue}>{Math.round(getOpenModelImageLayout(newModel).scale * 100)}%</Text>
                                        <TouchableOpacity
                                            style={styles.layoutStepBtn}
                                            activeOpacity={0.75}
                                            onPress={() => setNewModel(p => ({ ...p, image_open_scale: clampNumber((Number(p.image_open_scale) || 1) + 0.01, MIN_MODEL_IMAGE_SCALE, MAX_MODEL_IMAGE_SCALE) }))}
                                        >
                                            <Ionicons name="add" size={18} color={Colors.textPrimary} />
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <View style={styles.layoutControl}>
                                    <Text style={styles.layoutControlLabel}>Open Width Stretch</Text>
                                    <View style={styles.layoutStepper}>
                                        <TouchableOpacity
                                            style={styles.layoutStepBtn}
                                            activeOpacity={0.75}
                                            onPress={() => setNewModel(p => ({ ...p, image_open_scale_x: clampNumber((Number(p.image_open_scale_x) || 1) - 0.01, MIN_MODEL_IMAGE_SCALE, MAX_MODEL_IMAGE_SCALE) }))}
                                        >
                                            <Ionicons name="contract-outline" size={17} color={Colors.textPrimary} />
                                        </TouchableOpacity>
                                        <Text style={styles.layoutValue}>{Math.round(getOpenModelImageLayout(newModel).scaleX * 100)}%</Text>
                                        <TouchableOpacity
                                            style={styles.layoutStepBtn}
                                            activeOpacity={0.75}
                                            onPress={() => setNewModel(p => ({ ...p, image_open_scale_x: clampNumber((Number(p.image_open_scale_x) || 1) + 0.01, MIN_MODEL_IMAGE_SCALE, MAX_MODEL_IMAGE_SCALE) }))}
                                        >
                                            <Ionicons name="resize-outline" size={17} color={Colors.textPrimary} />
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <View style={styles.layoutControl}>
                                    <Text style={styles.layoutControlLabel}>Open Height Stretch</Text>
                                    <View style={styles.layoutStepper}>
                                        <TouchableOpacity
                                            style={styles.layoutStepBtn}
                                            activeOpacity={0.75}
                                            onPress={() => setNewModel(p => ({ ...p, image_open_scale_y: clampNumber((Number(p.image_open_scale_y) || 1) - 0.01, MIN_MODEL_IMAGE_SCALE, MAX_MODEL_IMAGE_SCALE) }))}
                                        >
                                            <Ionicons name="contract-outline" size={17} color={Colors.textPrimary} />
                                        </TouchableOpacity>
                                        <Text style={styles.layoutValue}>{Math.round(getOpenModelImageLayout(newModel).scaleY * 100)}%</Text>
                                        <TouchableOpacity
                                            style={styles.layoutStepBtn}
                                            activeOpacity={0.75}
                                            onPress={() => setNewModel(p => ({ ...p, image_open_scale_y: clampNumber((Number(p.image_open_scale_y) || 1) + 0.01, MIN_MODEL_IMAGE_SCALE, MAX_MODEL_IMAGE_SCALE) }))}
                                        >
                                            <Ionicons name="resize-outline" size={17} color={Colors.textPrimary} />
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <View style={styles.layoutControl}>
                                    <Text style={styles.layoutControlLabel}>Open Move Horizontal</Text>
                                    <View style={styles.layoutStepper}>
                                        <TouchableOpacity
                                            style={styles.layoutStepBtn}
                                            activeOpacity={0.75}
                                            onPress={() => setNewModel(p => ({ ...p, image_open_offset_x: clampNumber((Number(p.image_open_offset_x) || 0) - 1, MIN_MODEL_IMAGE_OFFSET, MAX_MODEL_IMAGE_OFFSET) }))}
                                        >
                                            <Ionicons name="arrow-back" size={17} color={Colors.textPrimary} />
                                        </TouchableOpacity>
                                        <Text style={styles.layoutValue}>{Math.round(getOpenModelImageLayout(newModel).offsetX)}px</Text>
                                        <TouchableOpacity
                                            style={styles.layoutStepBtn}
                                            activeOpacity={0.75}
                                            onPress={() => setNewModel(p => ({ ...p, image_open_offset_x: clampNumber((Number(p.image_open_offset_x) || 0) + 1, MIN_MODEL_IMAGE_OFFSET, MAX_MODEL_IMAGE_OFFSET) }))}
                                        >
                                            <Ionicons name="arrow-forward" size={17} color={Colors.textPrimary} />
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <View style={styles.layoutControl}>
                                    <Text style={styles.layoutControlLabel}>Open Move Vertical</Text>
                                    <View style={styles.layoutStepper}>
                                        <TouchableOpacity
                                            style={styles.layoutStepBtn}
                                            activeOpacity={0.75}
                                            onPress={() => setNewModel(p => ({ ...p, image_open_offset_y: clampNumber((Number(p.image_open_offset_y) || 0) - 1, MIN_MODEL_IMAGE_OFFSET, MAX_MODEL_IMAGE_OFFSET) }))}
                                        >
                                            <Ionicons name="arrow-up" size={17} color={Colors.textPrimary} />
                                        </TouchableOpacity>
                                        <Text style={styles.layoutValue}>{Math.round(getOpenModelImageLayout(newModel).offsetY)}px</Text>
                                        <TouchableOpacity
                                            style={styles.layoutStepBtn}
                                            activeOpacity={0.75}
                                            onPress={() => setNewModel(p => ({ ...p, image_open_offset_y: clampNumber((Number(p.image_open_offset_y) || 0) + 1, MIN_MODEL_IMAGE_OFFSET, MAX_MODEL_IMAGE_OFFSET) }))}
                                        >
                                            <Ionicons name="arrow-down" size={17} color={Colors.textPrimary} />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>

                            <View style={styles.inputSection}>
                                <View style={styles.layoutSectionHeader}>
                                    <View>
                                        <Text style={styles.innerLabel}>Model Effect</Text>
                                        <Text style={styles.switchSub}>Add glow, fire or sparkles and position them around the design.</Text>
                                    </View>
                                </View>

                                <View style={styles.effectOptionRow}>
                                    {MODEL_EFFECT_OPTIONS.map(option => (
                                        <TouchableOpacity
                                            key={option.id}
                                            style={[styles.effectOptionBtn, newModel.effect_type === option.id && styles.effectOptionBtnActive]}
                                            activeOpacity={0.8}
                                            onPress={() => setNewModel(p => ({ ...p, effect_type: option.id }))}
                                        >
                                            <Ionicons name={option.icon} size={16} color={newModel.effect_type === option.id ? '#fff' : Colors.primary} />
                                            <Text style={[styles.effectOptionText, newModel.effect_type === option.id && styles.effectOptionTextActive]}>{option.label}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                <Text style={styles.label}>Effect Color</Text>
                                <View style={styles.colorPalette}>
                                    {PRESET_THEME_COLORS.map(c => (
                                        <TouchableOpacity
                                            key={`effect-${c}`}
                                            style={[styles.colorBubble, { backgroundColor: c }, newModel.effect_tint === c && styles.activeColorBubble]}
                                            activeOpacity={0.7}
                                            onPress={() => setNewModel(p => ({ ...p, effect_tint: c }))}
                                        />
                                    ))}
                                </View>

                                <View style={styles.referenceToggleRow}>
                                    <View style={styles.referenceToggleCopy}>
                                        <Ionicons name="layers-outline" size={16} color={Colors.primary} />
                                        <Text style={styles.referenceToggleText}>Effect Layer</Text>
                                    </View>
                                    <View style={styles.effectLayerRow}>
                                        <TouchableOpacity
                                            style={[styles.referenceLayerBtn, newModel.effect_layer === 'behind' && styles.activeReferenceLayerBtn]}
                                            activeOpacity={0.75}
                                            onPress={() => setNewModel(p => ({ ...p, effect_layer: 'behind' }))}
                                        >
                                            <Text style={[styles.referenceLayerText, newModel.effect_layer === 'behind' && styles.activeReferenceLayerText]}>Behind</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.referenceLayerBtn, newModel.effect_layer === 'front' && styles.activeReferenceLayerBtn]}
                                            activeOpacity={0.75}
                                            onPress={() => setNewModel(p => ({ ...p, effect_layer: 'front' }))}
                                        >
                                            <Text style={[styles.referenceLayerText, newModel.effect_layer === 'front' && styles.activeReferenceLayerText]}>Front</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <View style={styles.grid}>
                                    <View style={styles.col}>
                                        <Text style={styles.layoutControlLabel}>Effect Scale</Text>
                                        <View style={styles.layoutStepper}>
                                            <TouchableOpacity style={styles.layoutStepBtn} activeOpacity={0.75} onPress={() => setNewModel(p => ({ ...p, effect_scale: clampNumber((Number(p.effect_scale) || 1) - 0.02, 0.4, 2.2) }))}>
                                                <Ionicons name="remove" size={18} color={Colors.textPrimary} />
                                            </TouchableOpacity>
                                            <Text style={styles.layoutValue}>{Math.round((Number(newModel.effect_scale) || 1) * 100)}%</Text>
                                            <TouchableOpacity style={styles.layoutStepBtn} activeOpacity={0.75} onPress={() => setNewModel(p => ({ ...p, effect_scale: clampNumber((Number(p.effect_scale) || 1) + 0.02, 0.4, 2.2) }))}>
                                                <Ionicons name="add" size={18} color={Colors.textPrimary} />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                    <View style={styles.col}>
                                        <Text style={styles.layoutControlLabel}>Effect Opacity</Text>
                                        <View style={styles.layoutStepper}>
                                            <TouchableOpacity style={styles.layoutStepBtn} activeOpacity={0.75} onPress={() => setNewModel(p => ({ ...p, effect_opacity: clampNumber((Number(p.effect_opacity) || 1) - 0.05, 0, 1) }))}>
                                                <Ionicons name="remove" size={18} color={Colors.textPrimary} />
                                            </TouchableOpacity>
                                            <Text style={styles.layoutValue}>{Math.round((Number(newModel.effect_opacity) || 1) * 100)}%</Text>
                                            <TouchableOpacity style={styles.layoutStepBtn} activeOpacity={0.75} onPress={() => setNewModel(p => ({ ...p, effect_opacity: clampNumber((Number(p.effect_opacity) || 1) + 0.05, 0, 1) }))}>
                                                <Ionicons name="add" size={18} color={Colors.textPrimary} />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </View>

                                <View style={styles.grid}>
                                    <View style={styles.col}>
                                        <Text style={styles.layoutControlLabel}>Effect Move Horizontal</Text>
                                        <View style={styles.layoutStepper}>
                                            <TouchableOpacity style={styles.layoutStepBtn} activeOpacity={0.75} onPress={() => setNewModel(p => ({ ...p, effect_offset_x: clampNumber((Number(p.effect_offset_x) || 0) - 1, -120, 120) }))}>
                                                <Ionicons name="arrow-back" size={17} color={Colors.textPrimary} />
                                            </TouchableOpacity>
                                            <Text style={styles.layoutValue}>{Math.round(Number(newModel.effect_offset_x) || 0)}px</Text>
                                            <TouchableOpacity style={styles.layoutStepBtn} activeOpacity={0.75} onPress={() => setNewModel(p => ({ ...p, effect_offset_x: clampNumber((Number(p.effect_offset_x) || 0) + 1, -120, 120) }))}>
                                                <Ionicons name="arrow-forward" size={17} color={Colors.textPrimary} />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                    <View style={styles.col}>
                                        <Text style={styles.layoutControlLabel}>Effect Move Vertical</Text>
                                        <View style={styles.layoutStepper}>
                                            <TouchableOpacity style={styles.layoutStepBtn} activeOpacity={0.75} onPress={() => setNewModel(p => ({ ...p, effect_offset_y: clampNumber((Number(p.effect_offset_y) || 0) - 1, -120, 120) }))}>
                                                <Ionicons name="arrow-up" size={17} color={Colors.textPrimary} />
                                            </TouchableOpacity>
                                            <Text style={styles.layoutValue}>{Math.round(Number(newModel.effect_offset_y) || 0)}px</Text>
                                            <TouchableOpacity style={styles.layoutStepBtn} activeOpacity={0.75} onPress={() => setNewModel(p => ({ ...p, effect_offset_y: clampNumber((Number(p.effect_offset_y) || 0) + 1, -120, 120) }))}>
                                                <Ionicons name="arrow-down" size={17} color={Colors.textPrimary} />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </View>
                            </View>

                            <View style={styles.inputSection}>
                                <View style={styles.switchRow}>
                                    <View>
                                        <Text style={styles.switchLabel}>Available in Creation</Text>
                                        <Text style={styles.switchSub}>Users can pick this in the grid</Text>
                                    </View>
                                    <Switch value={newModel.is_active} onValueChange={v => setNewModel(p => ({ ...p, is_active: v }))} trackColor={{ true: Colors.primary }} />
                                </View>

                                <View style={[styles.switchRow, { marginTop: 12 }]}>
                                    <View>
                                        <Text style={styles.switchLabel}>Popular (Trending)</Text>
                                        <Text style={styles.switchSub}>Show with flame effect</Text>
                                    </View>
                                    <Switch value={newModel.is_trending} onValueChange={v => setNewModel(p => ({ ...p, is_trending: v }))} trackColor={{ true: '#FF8C00' }} />
                                </View>

                                <View style={[styles.switchRow, { marginTop: 12 }]}>
                                    <View>
                                        <Text style={styles.switchLabel}>New Model</Text>
                                        <Text style={styles.switchSub}>Show with sparkles effect</Text>
                                    </View>
                                    <Switch value={newModel.is_new} onValueChange={v => setNewModel(p => ({ ...p, is_new: v }))} trackColor={{ true: '#00D2FF' }} />
                                </View>

                                <View style={[styles.switchRow, { marginTop: 12 }]}>
                                    <View>
                                        <Text style={styles.switchLabel}>Is Event Mode</Text>
                                        <Text style={styles.switchSub}>Requires start/end dates</Text>
                                    </View>
                                    <Switch value={newModel.is_event} onValueChange={v => setNewModel(p => ({ ...p, is_event: v }))} trackColor={{ true: Colors.primary }} />
                                </View>
                                <View style={[styles.switchRow, { marginTop: 12 }]}>
                                    <View>
                                        <Text style={styles.switchLabel}>Birthday-only Design</Text>
                                        <Text style={styles.switchSub}>Only appears in creation on the user's birthday</Text>
                                    </View>
                                    <Switch value={newModel.is_birthday} onValueChange={v => setNewModel(p => ({ ...p, is_birthday: v, category: v ? 'Birthday' : p.category }))} trackColor={{ true: '#FF6FB7' }} />
                                </View>
                            </View>

                            {newModel.is_event && (
                                <View style={[styles.inputSection, { backgroundColor: '#fff9ef', borderColor: '#ffe0b2' }]}>
                                    <Text style={[styles.innerLabel, { color: '#f5a623' }]}>Event Details</Text>
                                    <TextInput
                                        placeholder="Event Title"
                                        placeholderTextColor="#999"
                                        value={newModel.event_title || ''}
                                        onChangeText={t => setNewModel(p => ({ ...p, event_title: t }))}
                                        style={styles.input}
                                    />
                                    <TextInput
                                        placeholder="Event Description"
                                        placeholderTextColor="#999"
                                        value={newModel.event_description || ''}
                                        onChangeText={t => setNewModel(p => ({ ...p, event_description: t }))}
                                        style={[styles.input, { height: 60 }]}
                                        multiline
                                    />
                                    <View style={styles.grid}>
                                        <View style={styles.col}>
                                            <Text style={styles.miniLabel}>Start Date</Text>
                                            <TouchableOpacity
                                                style={styles.datePickerBtn}
                                                onPress={() => handleDatePickerPress('start')}
                                            >
                                                <Ionicons name="calendar-outline" size={16} color={Colors.textMuted} />
                                                <Text style={styles.dateText}>
                                                    {newModel.event_start ? new Date(newModel.event_start).toLocaleString() : 'Set Date'}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                        <View style={styles.col}>
                                            <Text style={styles.miniLabel}>End Date</Text>
                                            <TouchableOpacity
                                                style={styles.datePickerBtn}
                                                onPress={() => handleDatePickerPress('end')}
                                            >
                                                <Ionicons name="calendar-outline" size={16} color={Colors.textMuted} />
                                                <Text style={styles.dateText}>
                                                    {newModel.event_end ? new Date(newModel.event_end).toLocaleString() : 'Set Date'}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>

                                    {Platform.OS === 'web' && datePickerMode && datePickerTarget === 'model' && (
                                        <View style={styles.webDatePickerContainer}>
                                            <Text style={styles.miniLabel}>Quick Actions ({datePickerMode})</Text>
                                            <View style={styles.quickActionRow}>
                                                {[
                                                    { label: 'Today', days: 0 },
                                                    { label: 'Tomorrow', days: 1 },
                                                    { label: '+1 Week', days: 7 },
                                                    { label: '+1 Month', days: 30 },
                                                ].map((preset) => (
                                                    <TouchableOpacity
                                                        key={preset.label}
                                                        style={styles.quickActionBtn}
                                                        onPress={() => {
                                                            const d = new Date();
                                                            d.setDate(d.getDate() + preset.days);
                                                            setNewModel(p => ({
                                                                ...p,
                                                                [datePickerMode === 'start' ? 'event_start' : 'event_end']: d.toISOString()
                                                            }));
                                                        }}
                                                    >
                                                        <Text style={styles.quickActionText}>{preset.label}</Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                            <input
                                                type="datetime-local"
                                                style={{
                                                    width: '100%',
                                                    padding: '12px',
                                                    borderRadius: '12px',
                                                    border: '2px solid #a269ff20',
                                                    backgroundColor: '#fff',
                                                    fontFamily: 'inherit',
                                                    fontSize: '14px',
                                                    outline: 'none',
                                                    color: '#333'
                                                }}
                                                value={(() => {
                                                    const v = (newModel as any)[datePickerMode === 'start' ? 'event_start' : 'event_end'];
                                                    if (!v) return '';
                                                    const d = new Date(v);
                                                    const pad = (n: number) => n.toString().padStart(2, '0');
                                                    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                                                })()}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val) {
                                                        setNewModel(p => ({
                                                            ...p,
                                                            [datePickerMode === 'start' ? 'event_start' : 'event_end']: new Date(val).toISOString()
                                                        }));
                                                    }
                                                }}
                                            />
                                            <TouchableOpacity
                                                style={[styles.confirmBtn, { marginTop: 12, height: 40, paddingVertical: 0, justifyContent: 'center' }]}
                                                onPress={() => {
                                                    setDatePickerMode(null);
                                                    setDatePickerTarget(null);
                                                }}
                                            >
                                                <Text style={styles.confirmBtnText}>Done</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}

                                    {Platform.OS !== 'web' && datePickerMode && datePickerTarget === 'model' && (
                                        <DateTimePicker
                                            value={(() => {
                                                const v = (newModel as any)[datePickerMode === 'start' ? 'event_start' : 'event_end'];
                                                const d = v ? new Date(v) : new Date();
                                                return isNaN(d.getTime()) ? new Date() : d;
                                            })()}
                                            mode="datetime"
                                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                            onChange={(event, selectedDate) => {
                                                if (event.type === 'set' && selectedDate) {
                                                    setNewModel(p => ({
                                                        ...p,
                                                        [datePickerMode === 'start' ? 'event_start' : 'event_end']: selectedDate.toISOString()
                                                    }));
                                                }
                                                setDatePickerMode(null);
                                                setDatePickerTarget(null);
                                            }}
                                        />
                                    )}
                                </View>
                            )}

                            <View style={styles.modalActions}>
                                <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowAddModel(false); resetModelForm(); }} disabled={uploading}>
                                    <Text style={styles.cancelBtnText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.confirmBtn, (uploading || !newModel.id || !newModel.image) && { opacity: 0.5 }]}
                                    onPress={handleAddModel}
                                    disabled={uploading || !newModel.id || !newModel.image}
                                >
                                    <Text style={styles.confirmBtnText}>Confirm</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </ScrollView>
                </View>
            </Modal>

            <Modal visible={showAddChain} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>{editingChainId ? 'Edit Chain' : 'Add New Chain'}</Text>
                        <TextInput
                            placeholder="Chain ID (e.g. cherry_charm)"
                            placeholderTextColor="#999"
                            value={newChain.id || ''}
                            onChangeText={t => setNewChain(p => ({ ...p, id: t }))}
                            editable={!editingChainId}
                            style={[styles.input, editingChainId ? styles.disabledInput : null]}
                        />
                        <TextInput
                            placeholder="Name (e.g. Red Cherry)"
                            placeholderTextColor="#999"
                            value={newChain.name || ''}
                            onChangeText={t => setNewChain(p => ({ ...p, name: t }))}
                            style={styles.input}
                        />
                        <View style={styles.assetInputRow}>
                            <TextInput
                                placeholder="Image URL (PNG)"
                                placeholderTextColor="#999"
                                value={newChain.image_url || ''}
                                onChangeText={t => setNewChain(p => ({ ...p, image_url: t }))}
                                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                            />
                            <TouchableOpacity style={styles.uploadSmallBtn} onPress={() => pickAndUploadImage(url => setNewChain(p => ({ ...p, image_url: url })))}>
                                <Ionicons name="camera" size={20} color="#fff" />
                            </TouchableOpacity>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 4 }}>
                            <Text style={{ fontSize: 14, fontFamily: Fonts.medium, color: Colors.textPrimary }}>Available in Creation Screen</Text>
                            <Switch value={newChain.is_active} onValueChange={v => setNewChain(p => ({ ...p, is_active: v }))} trackColor={{ true: Colors.primary }} />
                        </View>
                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowAddChain(false); setEditingChainId(null); }}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.confirmBtn} onPress={handleAddChain}>
                                <Text style={styles.confirmBtnText}>{editingChainId ? 'Save' : 'Add'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal visible={showAddSticker} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>{editingStickerId ? 'Edit Sticker' : 'Add New Sticker'}</Text>
                        <TextInput
                            placeholder="Sticker Name (e.g. Heart)"
                            placeholderTextColor="#999"
                            value={newSticker.name}
                            onChangeText={t => setNewSticker(p => ({ ...p, name: t }))}
                            style={styles.input}
                        />
                        <View style={styles.assetInputRow}>
                            <TextInput
                                placeholder="Image URL (PNG)"
                                placeholderTextColor="#999"
                                value={newSticker.image_url}
                                onChangeText={t => setNewSticker(p => ({ ...p, image_url: t }))}
                                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                            />
                            <TouchableOpacity style={styles.uploadSmallBtn} onPress={() => pickAndUploadImage(url => setNewSticker(p => ({ ...p, image_url: url })))}>
                                <Ionicons name="camera" size={20} color="#fff" />
                            </TouchableOpacity>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 14 }}>
                            <Text style={{ fontSize: 14, fontFamily: Fonts.medium, color: Colors.textPrimary }}>Active</Text>
                            <Switch value={newSticker.is_active} onValueChange={v => setNewSticker(p => ({ ...p, is_active: v }))} trackColor={{ true: Colors.primary }} />
                        </View>
                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowAddSticker(false); setEditingStickerId(null); }} disabled={addingSticker}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.confirmBtn} onPress={handleAddSticker} disabled={addingSticker || !newSticker.name || !newSticker.image_url}>
                                {addingSticker ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text style={styles.confirmBtnText}>{editingStickerId ? 'Save Sticker' : 'Add Sticker'}</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal visible={showAddDrop} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>{editingDropId ? 'Edit Drop' : 'Create New Drop'}</Text>
                        <TextInput
                            placeholder="Drop Name (e.g. Halloween Drop)"
                            placeholderTextColor="#999"
                            value={newDrop.name}
                            onChangeText={t => setNewDrop(p => ({ ...p, name: t }))}
                            style={styles.input}
                        />
                        <View style={styles.grid}>
                            <View style={styles.col}>
                                <Text style={styles.miniLabel}>Start Date</Text>
                                <TouchableOpacity
                                    style={styles.datePickerBtn}
                                    onPress={() => handleDropDatePicker('start')}
                                >
                                    <Ionicons name="calendar-outline" size={16} color={Colors.textMuted} />
                                    <Text style={styles.dateText}>
                                        {newDrop.start_date ? new Date(newDrop.start_date).toLocaleDateString() : 'Set Date'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                            <View style={styles.col}>
                                <Text style={styles.miniLabel}>End Date</Text>
                                <TouchableOpacity
                                    style={styles.datePickerBtn}
                                    onPress={() => handleDropDatePicker('end')}
                                >
                                    <Ionicons name="calendar-outline" size={16} color={Colors.textMuted} />
                                    <Text style={styles.dateText}>
                                        {newDrop.end_date ? new Date(newDrop.end_date).toLocaleDateString() : 'Set Date'}
                                    </Text>
                                </TouchableOpacity>
                                {newDrop.end_date ? (
                                    <TouchableOpacity
                                        style={styles.clearDateBtn}
                                        activeOpacity={0.75}
                                        onPress={() => setNewDrop(p => ({ ...p, end_date: '' }))}
                                    >
                                        <Ionicons name="close-circle" size={13} color={Colors.primary} />
                                        <Text style={styles.clearDateText}>No end date</Text>
                                    </TouchableOpacity>
                                ) : null}
                            </View>
                        </View>

                        {Platform.OS === 'web' && datePickerMode && datePickerTarget === 'drop' && (
                            <View style={styles.webDatePickerContainer}>
                                <Text style={styles.miniLabel}>Quick Actions ({datePickerMode})</Text>
                                <View style={styles.quickActionRow}>
                                    {[
                                        { label: 'Today', days: 0 },
                                        { label: 'Tomorrow', days: 1 },
                                        { label: '+1 Week', days: 7 },
                                        { label: '+1 Month', days: 30 },
                                    ].map((preset) => (
                                        <TouchableOpacity
                                            key={preset.label}
                                            style={styles.quickActionBtn}
                                            onPress={() => {
                                                const d = new Date();
                                                d.setDate(d.getDate() + preset.days);
                                                setNewDrop(p => ({
                                                    ...p,
                                                    [datePickerMode === 'start' ? 'start_date' : 'end_date']: d.toISOString()
                                                }));
                                            }}
                                        >
                                            <Text style={styles.quickActionText}>{preset.label}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                                <input
                                    type="date"
                                    style={{
                                        width: '100%',
                                        padding: '12px',
                                        borderRadius: '12px',
                                        border: '2px solid #a269ff20',
                                        backgroundColor: '#fff',
                                        fontFamily: 'inherit',
                                        fontSize: '14px',
                                        outline: 'none',
                                        color: '#333'
                                    }}
                                    value={(() => {
                                        const v = (newDrop as any)[datePickerMode === 'start' ? 'start_date' : 'end_date'];
                                        if (!v) return '';
                                        const d = new Date(v);
                                        const pad = (n: number) => n.toString().padStart(2, '0');
                                        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                                    })()}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val) {
                                            setNewDrop(p => ({
                                                ...p,
                                                [datePickerMode === 'start' ? 'start_date' : 'end_date']: new Date(val).toISOString()
                                            }));
                                        }
                                    }}
                                />
                                <TouchableOpacity
                                    style={[styles.confirmBtn, { marginTop: 12, height: 40, paddingVertical: 0, justifyContent: 'center' }]}
                                    onPress={() => {
                                        setDatePickerMode(null);
                                        setDatePickerTarget(null);
                                    }}
                                >
                                    <Text style={styles.confirmBtnText}>Done</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {Platform.OS !== 'web' && datePickerMode && datePickerTarget === 'drop' && (
                            <DateTimePicker
                                value={(() => {
                                    const v = (newDrop as any)[datePickerMode === 'start' ? 'start_date' : 'end_date'];
                                    const d = v ? new Date(v) : new Date();
                                    return isNaN(d.getTime()) ? new Date() : d;
                                })()}
                                mode="date"
                                display={Platform.OS === 'ios' ? 'default' : 'default'}
                                onChange={(event, selectedDate) => {
                                    if (selectedDate) {
                                        setNewDrop(p => ({
                                            ...p,
                                            [datePickerMode === 'start' ? 'start_date' : 'end_date']: selectedDate.toISOString()
                                        }));
                                    }
                                    if (Platform.OS === 'android' || event.type === 'dismissed' || event.type === 'set') {
                                        setDatePickerMode(null);
                                        setDatePickerTarget(null);
                                    }
                                }}
                            />
                        )}

                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 4 }}>
                            <Text style={{ fontSize: 14, fontFamily: Fonts.medium, color: Colors.textPrimary }}>Active Drop</Text>
                            <Switch value={newDrop.is_active} onValueChange={v => setNewDrop(p => ({ ...p, is_active: v }))} trackColor={{ true: Colors.primary }} />
                        </View>

                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowAddDrop(false); setEditingDropId(null); }}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.confirmBtn} onPress={handleAddDrop}>
                                <Text style={styles.confirmBtnText}>{editingDropId ? 'Save Drop' : 'Create Drop'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, height: 60, borderBottomWidth: 1, borderBottomColor: '#eee', backgroundColor: '#fff' },
    headerTitle: { fontSize: 17, fontFamily: Fonts.bold, color: Colors.textPrimary },
    backBtn: { width: 40 },
    resetBtn: { color: Colors.primary, fontFamily: Fonts.medium },
    scrollContainer: { flex: 1 },
    adminHero: { margin: 14, marginBottom: 10, padding: 18, borderRadius: 24, borderWidth: 1, borderColor: '#ede7ff' },
    adminHeroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 },
    adminEyebrow: { fontSize: 11, fontFamily: Fonts.bold, color: Colors.primary, textTransform: 'uppercase', marginBottom: 4 },
    adminTitle: { fontSize: 24, fontFamily: Fonts.bold, color: Colors.textPrimary },
    adminHint: { fontSize: 13, fontFamily: Fonts.medium, color: Colors.textMuted, marginTop: 3, maxWidth: SCREEN_WIDTH - 120 },
    adminHeroIcon: { width: 50, height: 50, borderRadius: 18, backgroundColor: Colors.primary + '12', alignItems: 'center', justifyContent: 'center' },
    adminStats: { flexDirection: 'row', gap: 10, marginTop: 18 },
    adminStatCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: '#efeaff', borderRadius: 16, paddingVertical: 10, alignItems: 'center' },
    adminStatValue: { fontSize: 18, fontFamily: Fonts.bold, color: Colors.textPrimary },
    adminStatLabel: { fontSize: 10, fontFamily: Fonts.bold, color: Colors.textMuted, textTransform: 'uppercase', marginTop: 2 },
    topTabs: { backgroundColor: '#fff', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#f0edf8' },
    topTabsContent: { paddingHorizontal: 14, paddingVertical: 10, gap: 10 },
    topTab: { minWidth: 106, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 16, backgroundColor: '#f7f7fb', borderWidth: 1, borderColor: '#efedf6' },
    activeTopTab: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    topTabText: { fontSize: 13, fontFamily: Fonts.bold, color: Colors.textMuted },
    activeTopTabText: { color: '#fff' },
    previewContainer: { alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: '#f0f0f5' },
    modelFrame: { width: 300, height: 300, backgroundColor: '#fff', borderRadius: 24, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 10, alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' },
    modelImg: { width: '100%', height: '100%' },
    assetPreview: { width: '100%', height: 100, borderRadius: 12, marginTop: 8, backgroundColor: '#f0f0f0' },
    layoutSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
    layoutResetBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, backgroundColor: Colors.primary + '10' },
    layoutResetText: { fontSize: 11, fontFamily: Fonts.bold, color: Colors.primary },
    referenceToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14, backgroundColor: Colors.primary + '08', borderWidth: 1, borderColor: Colors.primary + '10' },
    referenceToggleCopy: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 },
    referenceToggleText: { fontSize: 12, fontFamily: Fonts.bold, color: Colors.textPrimary },
    referenceControls: { marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.primary + '12' },
    referenceControlHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    referenceValue: { fontSize: 12, fontFamily: Fonts.bold, color: Colors.primary },
    referenceLayerBtn: { minWidth: 70, height: 42, borderRadius: 21, borderWidth: 1, borderColor: '#ebe6f7', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
    activeReferenceLayerBtn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    referenceLayerText: { fontSize: 12, fontFamily: Fonts.bold, color: Colors.textMuted },
    activeReferenceLayerText: { color: '#fff' },
    layoutQuickActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 12 },
    layoutQuickBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.primary + '18' },
    layoutQuickText: { fontSize: 12, fontFamily: Fonts.bold, color: Colors.primary },
    autoPresetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: '#f7f4ff', borderWidth: 1, borderColor: Colors.primary + '10' },
    modelLayoutPreview: { width: LAYOUT_PREVIEW_SIZE, height: LAYOUT_PREVIEW_SIZE, alignSelf: 'center', borderRadius: 24, backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.primary + '12', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginTop: 12 },
    layoutGuideLayer: { ...StyleSheet.absoluteFillObject, zIndex: 5 },
    layoutGuideLine: { position: 'absolute', backgroundColor: Colors.primary + '36' },
    layoutGuideLineSoft: { position: 'absolute', backgroundColor: Colors.primary + '18' },
    layoutGuideVertical: { top: 0, bottom: 0, left: '50%', width: 1 },
    layoutGuideHorizontal: { left: 0, right: 0, top: '50%', height: 1 },
    layoutGuideVerticalLeft: { top: 0, bottom: 0, left: '33.33%', width: 1 },
    layoutGuideVerticalRight: { top: 0, bottom: 0, right: '33.33%', width: 1 },
    layoutGuideHorizontalTop: { left: 0, right: 0, top: '33.33%', height: 1 },
    layoutGuideHorizontalBottom: { left: 0, right: 0, bottom: '33.33%', height: 1 },
    layoutGuideCenterDot: { position: 'absolute', left: '50%', top: '50%', width: 8, height: 8, marginLeft: -4, marginTop: -4, borderRadius: 4, backgroundColor: Colors.primary + '55', borderWidth: 1, borderColor: '#fff' },
    baseModelReferenceLayer: { ...StyleSheet.absoluteFillObject, zIndex: 1, alignItems: 'center', justifyContent: 'center' },
    baseModelReferenceImage: { width: LAYOUT_PREVIEW_IMAGE_SIZE, height: LAYOUT_PREVIEW_IMAGE_SIZE },
    modelLayoutPreviewImage: { width: LAYOUT_PREVIEW_IMAGE_SIZE, height: LAYOUT_PREVIEW_IMAGE_SIZE, zIndex: 2 },
    layoutTimerReference: { position: 'absolute', zIndex: 6, borderWidth: 1, borderColor: Colors.primary + '70', borderRadius: 6, backgroundColor: 'rgba(162, 105, 255, 0.12)', alignItems: 'center', justifyContent: 'center' },
    layoutChainReference: { position: 'absolute', zIndex: 7, borderWidth: 1, borderStyle: 'dashed', borderColor: '#11182755', borderRadius: 12, alignItems: 'center', justifyContent: 'center', opacity: 0.72 },
    layoutChainReferenceImage: { width: '100%', height: '100%' },
    layoutControl: { marginTop: 14 },
    layoutControlLabel: { fontSize: 11, fontFamily: Fonts.bold, color: Colors.textMuted, textTransform: 'uppercase', marginBottom: 8 },
    layoutStepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
    layoutStepBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ebe6f7', alignItems: 'center', justifyContent: 'center' },
    layoutValue: { minWidth: 76, textAlign: 'center', fontSize: 14, fontFamily: Fonts.bold, color: Colors.textPrimary },
    hint: { marginTop: 15, color: Colors.textMuted, fontSize: 11, fontFamily: Fonts.medium },
    controls: { backgroundColor: '#fff', padding: 20, borderTopLeftRadius: 30, borderTopRightRadius: 30, elevation: 10, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20 },
    sectionHeaderInner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    label: { fontSize: 12, fontFamily: Fonts.bold, color: Colors.textPrimary, marginBottom: 8, textTransform: 'uppercase' },
    addModelBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    addModelBtnText: { fontSize: 12, color: Colors.primary, fontFamily: Fonts.bold },
    modelList: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
    modelTab: { alignItems: 'center', width: 66, gap: 4, opacity: 0.5 },
    activeTab: { opacity: 1 },
    tabImg: { width: 50, height: 50, borderRadius: 10, backgroundColor: '#f5f5f5' },
    tabLabel: { fontSize: 9, color: Colors.textMuted, fontFamily: Fonts.medium, textAlign: 'center' },
    activeTabText: { color: Colors.primary, fontFamily: Fonts.bold },
    grid: { flexDirection: 'row', gap: 15, marginBottom: 15 },
    col: { flex: 1 },
    toggleRow: { flexDirection: 'row', backgroundColor: '#f0f0f0', borderRadius: 10, padding: 3 },
    toggleBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
    activeToggle: { backgroundColor: '#fff', elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4 },
    toggleText: { fontSize: 11, color: Colors.textMuted, fontFamily: Fonts.bold },
    activeToggleText: { color: Colors.primary },
    fontRow: { flexDirection: 'row', gap: 8 },
    fontBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center' },
    activeFontBtn: { backgroundColor: Colors.primary },
    fontBtnText: { fontSize: 14, color: Colors.textPrimary },
    activeFontBtnText: { color: '#fff' },
    assetInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    uploadSmallBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', elevation: 3, shadowColor: Colors.primary, shadowOpacity: 0.3, shadowRadius: 6 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    modalScrollContent: { flexGrow: 1, justifyContent: 'center' },
    modalContent: { backgroundColor: '#fff', borderRadius: 24, padding: 24, paddingBottom: 30, elevation: 20, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 30 },
    modalTitle: { fontSize: 20, fontFamily: Fonts.bold, color: Colors.textPrimary, marginBottom: 20, textAlign: 'center' },
    inputSection: { marginBottom: 20, backgroundColor: '#f9f9f9', padding: 15, borderRadius: 16, borderWidth: 1, borderColor: '#eee' },
    innerLabel: { fontSize: 13, fontFamily: Fonts.bold, color: Colors.textPrimary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
    input: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#eee', borderRadius: 12, padding: 14, color: Colors.textPrimary, fontSize: 14, fontFamily: Fonts.regular, marginBottom: 10 },
    miniLabel: { fontSize: 10, fontFamily: Fonts.bold, color: Colors.textMuted, marginBottom: 4, textTransform: 'uppercase' },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    switchLabel: { fontSize: 14, fontFamily: Fonts.bold, color: Colors.textPrimary },
    switchSub: { fontSize: 11, color: Colors.textMuted, fontFamily: Fonts.regular },
    modalActions: { flexDirection: 'row', gap: 12, marginTop: 10 },
    cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#f0f0f0' },
    cancelBtnText: { color: Colors.textSecondary, fontFamily: Fonts.bold },
    confirmBtn: { flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: Colors.primary },
    confirmBtnText: { color: '#fff', fontFamily: Fonts.bold },
    colorPalette: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
    colorBubble: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: '#eee' },
    activeColorBubble: { borderColor: Colors.primary, transform: [{ scale: 1.1 }] },
    sliderBtnSmall: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center' },
    saveBtn: { backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 15, alignItems: 'center', marginTop: 10 },
    saveBtnText: { color: '#fff', fontFamily: Fonts.bold, fontSize: 15 },
    timerCalibration: { gap: 15 },
    stickerSection: { marginTop: 10 },
    moderationSection: { gap: 14, marginTop: 10 },
    moderationFilterRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
    moderationFilterBtn: { flex: 1, paddingVertical: 11, borderRadius: 14, borderWidth: 1, borderColor: '#ece7fb', backgroundColor: '#f8f7fc', alignItems: 'center', justifyContent: 'center' },
    moderationFilterBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    moderationFilterText: { fontSize: 12, fontFamily: Fonts.bold, color: Colors.textMuted },
    moderationFilterTextActive: { color: '#fff' },
    moderationSearchCard: { padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#ece7fb', backgroundColor: '#faf9fe', gap: 10 },
    moderationSearchLabel: { fontSize: 12, fontFamily: Fonts.bold, color: Colors.textPrimary, textTransform: 'uppercase' },
    moderationSearchTypeRow: { flexDirection: 'row', gap: 8 },
    moderationSearchTypeBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ece7fb' },
    moderationSearchTypeBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    moderationSearchTypeText: { fontSize: 12, fontFamily: Fonts.bold, color: Colors.textMuted },
    moderationSearchTypeTextActive: { color: '#fff' },
    moderationSearchHint: { fontSize: 11, lineHeight: 16, fontFamily: Fonts.medium, color: Colors.textMuted },
    moderationEmptyState: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 34, paddingHorizontal: 18, borderRadius: 18, backgroundColor: '#faf9fe', borderWidth: 1, borderColor: '#efe9ff' },
    moderationEmptyTitle: { fontSize: 15, fontFamily: Fonts.bold, color: Colors.textPrimary, textAlign: 'center' },
    moderationEmptyText: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.textMuted, textAlign: 'center', maxWidth: 260 },
    moderationList: { gap: 12 },
    moderationCard: { backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: '#eee', ...Shadow.small },
    moderationPreview: { height: 190, backgroundColor: '#f5f3fb', alignItems: 'center', justifyContent: 'center', position: 'relative' },
    moderationPreviewMedia: { width: '100%', height: '100%' },
    moderationVideoPlaceholder: { alignItems: 'center', justifyContent: 'center', gap: 8 },
    moderationVideoText: { fontSize: 12, fontFamily: Fonts.bold, color: Colors.textMuted },
    moderationTextPreview: { flex: 1, width: '100%', paddingHorizontal: 18, paddingVertical: 16, alignItems: 'flex-start', justifyContent: 'center', gap: 8 },
    moderationTextPreviewLabel: { fontSize: 12, fontFamily: Fonts.bold, color: Colors.primary },
    moderationTextPreviewContent: { fontSize: 13, lineHeight: 20, fontFamily: Fonts.medium, color: Colors.textPrimary, width: '100%' },
    moderationStatusPill: { position: 'absolute', top: 12, right: 12, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
    moderationStatusReview: { backgroundColor: '#f97316' },
    moderationStatusRejected: { backgroundColor: '#ef4444' },
    moderationStatusApproved: { backgroundColor: '#22c55e' },
    moderationStatusText: { fontSize: 10, fontFamily: Fonts.bold, color: '#fff', textTransform: 'uppercase' },
    moderationBody: { padding: 15, gap: 8 },
    moderationCapsuleTitle: { fontSize: 16, fontFamily: Fonts.bold, color: Colors.textPrimary },
    moderationOwnerText: { fontSize: 13, fontFamily: Fonts.medium, color: Colors.primary },
    moderationExcerpt: { fontSize: 13, lineHeight: 19, fontFamily: Fonts.regular, color: Colors.textSecondary },
    moderationReasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#fff7ed', borderRadius: 12, padding: 10 },
    moderationReasonText: { flex: 1, fontSize: 12, lineHeight: 17, fontFamily: Fonts.medium, color: '#9a3412' },
    moderationScoreText: { fontSize: 11, fontFamily: Fonts.bold, color: Colors.textMuted },
    moderationActionRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
    moderationApproveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 14, backgroundColor: '#22c55e' },
    moderationRejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 14, backgroundColor: '#ef4444' },
    moderationApproveText: { fontSize: 13, fontFamily: Fonts.bold, color: '#fff' },
    moderationRejectText: { fontSize: 13, fontFamily: Fonts.bold, color: '#fff' },
    moderationBlockBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 11, borderRadius: 14, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fff5f5' },
    moderationBlockBtnDisabled: { borderColor: '#e5e7eb', backgroundColor: '#f8fafc' },
    moderationBlockText: { fontSize: 12, fontFamily: Fonts.bold, color: '#ef4444' },
    moderationBlockTextDisabled: { color: '#64748b' },
    moderationActionDisabled: { opacity: 0.6 },
    stickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    stickerCard: { width: (SCREEN_WIDTH - 64) / 3, backgroundColor: '#fff', borderRadius: 15, padding: 10, alignItems: 'center', position: 'relative', borderWidth: 1, borderColor: '#eee' },
    stickerImg: { width: 60, height: 60 },
    stickerName: { fontSize: 11, fontFamily: Fonts.medium, marginTop: 4 },
    deleteStickerBtn: { position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.error + '15', alignItems: 'center', justifyContent: 'center' },
    editStickerBtn: { position: 'absolute', top: 5, left: 5, width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
    modelLibraryCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 15, marginBottom: 10, borderWidth: 1, borderColor: '#eee', gap: 12 },
    modelLibraryThumb: { width: 50, height: 50, borderRadius: 10, backgroundColor: '#f5f5f5' },
    modelLibraryLabel: { fontSize: 14, fontFamily: Fonts.bold, color: Colors.textPrimary },
    statusTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    dropLibraryTag: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.primary },
    statusTagText: { fontSize: 10, fontFamily: Fonts.bold, textTransform: 'uppercase' },
    libActionBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: Colors.primary + '10', alignItems: 'center', justifyContent: 'center' },
    addModelIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', elevation: 3, shadowColor: Colors.primary, shadowOpacity: 0.3, shadowRadius: 6 },
    tabImgWrapper: { position: 'relative', width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
    tabActiveIndicator: { position: 'absolute', bottom: -10, width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.primary },
    sliderTrackAlt: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#f5f5f5', padding: 4, borderRadius: 12 },
    datePickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#ddd', borderRadius: 10, paddingHorizontal: 12, height: 44, marginTop: 5 },
    dateText: { fontSize: 13, fontFamily: Fonts.bold, color: '#000000' },
    clearDateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 8, paddingVertical: 7, borderRadius: 10, backgroundColor: Colors.primary + '08' },
    clearDateText: { fontSize: 11, fontFamily: Fonts.bold, color: Colors.primary },
    chainCard: { width: 100, height: 130, alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0.6, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#eee', position: 'relative' },
    activeChainCard: { opacity: 1, borderColor: Colors.primary, backgroundColor: Colors.primary + '08' },
    chainImg: { width: 80, height: 80, borderRadius: 15 },
    chainLabel: { fontSize: 11, fontFamily: Fonts.bold, color: Colors.textSecondary },
    editChainBtn: { position: 'absolute', top: 6, left: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.primary + '16', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.primary + '24' },
    deleteChainBtn: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.error + '16', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.error + '24' },
    dropActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    editDropBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary + '12', alignItems: 'center', justifyContent: 'center' },
    disabledInput: { opacity: 0.55, backgroundColor: '#f3f1f8' },
    chainCalibration: { backgroundColor: '#f9f9ff', padding: 15, borderRadius: 15, marginTop: 10 },
    sectionLabelTitle: { fontSize: 16, fontFamily: Fonts.bold, color: Colors.textPrimary },
    sectionSub: { fontSize: 12, color: Colors.textMuted, fontFamily: Fonts.regular, marginTop: 2 },
    divider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 20 },
    chainSection: { gap: 15 },
    chainList: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingBottom: 10 },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#eee',
        borderRadius: 12,
        paddingHorizontal: 12,
        marginBottom: 15,
        height: 44,
    },
    searchIcon: { marginRight: 10 },
    searchInput: {
        flex: 1,
        fontSize: 14,
        fontFamily: Fonts.medium,
        color: Colors.textPrimary,
    },
    globalBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        borderRadius: 12,
    },
    globalBtnText: {
        color: '#fff',
        fontSize: 11,
        fontFamily: Fonts.bold,
    },
    // Drops styles
    dropSection: { gap: 15 },
    dropList: { gap: 12, marginTop: 10 },
    dropCard: {
        padding: 16,
        backgroundColor: '#fff',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#eee',
        gap: 12
    },
    dropCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    dropCardInfo: { flex: 1, gap: 4 },
    dropCardName: { fontSize: 16, fontFamily: Fonts.bold, color: Colors.textPrimary },
    dropCardDates: { fontSize: 12, color: Colors.textMuted, fontFamily: Fonts.medium },
    dropMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
    statusPill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginTop: 2 },
    statusPillText: { fontSize: 10, fontFamily: Fonts.bold },
    deleteDropBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    dropModelList: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    dropModelChip: { flexDirection: 'row', alignItems: 'center', gap: 7, maxWidth: 240, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 12, backgroundColor: '#f8f7fc', borderWidth: 1, borderColor: Colors.primary + '10' },
    dropModelThumb: { width: 26, height: 26, borderRadius: 7, backgroundColor: '#fff' },
    dropModelName: { flexShrink: 1, fontSize: 12, fontFamily: Fonts.bold, color: Colors.textPrimary },
    dropModelState: { fontSize: 9, fontFamily: Fonts.bold, textTransform: 'uppercase' },
    dropEmptyState: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: '#f8f8fb' },
    dropEmptyText: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.textMuted },

    // Model picker for Drops
    dropPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    dropOption: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: 'transparent' },
    activeDropOption: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    dropOptionText: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.textSecondary },
    activeDropOptionText: { color: '#fff', fontFamily: Fonts.bold },
    effectOptionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
    effectOptionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#ece7fb',
    },
    effectOptionBtnActive: {
        backgroundColor: Colors.primary,
        borderColor: Colors.primary,
    },
    effectOptionText: {
        fontSize: 12,
        fontFamily: Fonts.bold,
        color: Colors.primary,
    },
    effectOptionTextActive: {
        color: '#fff',
    },
    effectLayerRow: {
        flexDirection: 'row',
        gap: 8,
    },
    inputLabel: { fontSize: 13, fontFamily: Fonts.bold, color: Colors.textPrimary, marginBottom: 5 },
    webDatePickerContainer: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 16,
        borderWidth: 1.5,
        borderColor: Colors.primary + '15',
        marginTop: 10,
        ...Shadow.small,
    },
    quickActionRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 16,
    },
    quickActionBtn: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: Colors.primary + '08',
        borderWidth: 1,
        borderColor: Colors.primary + '10',
    },
    quickActionText: {
        fontSize: 11,
        fontFamily: Fonts.bold,
        color: Colors.primary,
    },
    inputWrap: { marginBottom: 15 },
});
