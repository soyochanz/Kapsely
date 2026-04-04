import React, { useState, useRef, useEffect } from 'react';
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
import { Colors, Fonts, Shadow } from '../theme';
import { timerConfigManager, ModelTimerConfig, DEFAULT_CONFIGS } from '../utils/timerConfig';
import { supabase } from '../lib/supabase';
import LiveTimer from '../components/LiveTimer';
import { LinearGradient } from 'expo-linear-gradient';
import { CAPSULE_MODELS } from '../constants/models';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MODELS = CAPSULE_MODELS as unknown as any[];
const FRAME_SIZE = 300;

const PRESET_COLORS = ['#ffffff', '#000000', '#a269ff', '#6abf69', '#ff9f1c', '#ff5252', '#d4a017', '#e2e2e2'];
const PRESET_THEME_COLORS = ['#a269ff', '#6abf69', '#ff9f1c', '#00d2ff', '#e67e22', '#ff5252', '#d4a017', '#2d2d2d', '#ec4899', '#ff78b8'];
const FONTS = [
    { id: 'monospace', label: 'Retro', font: 'monospace' },
    { id: 'Inter_700Bold', label: 'Modern', font: Fonts.bold },
    { id: 'Inter_400Regular', label: 'Minimal', font: Fonts.regular },
    { id: 'serif', label: 'Classic', font: Platform.OS === 'ios' ? 'Times New Roman' : 'serif' },
];

export default function AdminCalibrationScreen() {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const [selectedModel, setSelectedModel] = useState<any>(MODELS[0]);
    const [allModels, setAllModels] = useState<any[]>(timerConfigManager.models.length > 0 ? timerConfigManager.models : MODELS);
    const [activeTab, setActiveTab] = useState<'timer' | 'chain' | 'stickers' | 'models'>('timer');
    const [selectedChainId, setSelectedChainId] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    const [showAddModel, setShowAddModel] = useState(false);
    const [newModel, setNewModel] = useState({ 
        id: '', label: '', image: '', image_open: '', image_cover: '', 
        category: 'Vibe', tint: '#a269ff', is_active: true, is_event: false,
        event_start: '', event_end: '', event_title: '', event_description: ''
    });
    const [datePickerMode, setDatePickerMode] = useState<'start' | 'end' | null>(null);

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
                    DateTimePickerAndroid.open({
                        value: date,
                        onChange: (event, selectedDate) => {
                            if (event.type === 'set' && selectedDate) {
                                // Add a small delay before opening time picker to avoid conflict with closing date picker
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
                    setDatePickerMode(mode);
                }
            } catch (error) {
                console.error('Date picker error:', error);
                setDatePickerMode(mode);
            }
        } else {
            setDatePickerMode(mode);
        }
    };


    const [showAddChain, setShowAddChain] = useState(false);
    const [newChain, setNewChain] = useState({ id: '', name: '', image_url: '', thumbnail_url: '', is_active: true });

    const [stickers, setStickers] = useState<any[]>([]);
    const [showAddSticker, setShowAddSticker] = useState(false);
    const [newSticker, setNewSticker] = useState({ name: '', image_url: '', is_active: true });
    const [addingSticker, setAddingSticker] = useState(false);

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
        const dbModels = timerConfigManager.models;
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
        const unsubscribe = timerConfigManager.subscribe(syncConfigs);
        syncConfigs();
        loadStickers();
        return unsubscribe;
    }, []);

    const loadStickers = async () => {
        const { data } = await supabase.from('stickers').select('*').order('created_at', { ascending: false });
        if (data) setStickers(data);
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
            onMoveShouldSetPanResponder: () => true,
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

    const pickAndUploadImage = async (onDone: (url: string) => void) => {
        try {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) {
                Alert.alert('Permission required', 'Allow photo access to upload images.');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                quality: 0.8,
            });

            if (!result.canceled && result.assets[0]) {
                setUploading(true);
                const asset = result.assets[0];
                const fileName = `model_${Date.now()}.jpg`;
                
                let body: any;
                const manipulated = await ImageManipulator.manipulateAsync(
                    asset.uri,
                    [{ resize: { width: 800 } }],
                    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
                );
                const base64 = await FileSystem.readAsStringAsync(manipulated.uri, { encoding: 'base64' });
                body = decode(base64);

                const { error: uploadError } = await supabase.storage.from('models').upload(fileName, body, {
                    contentType: 'image/jpeg',
                    upsert: true,
                });

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage.from('models').getPublicUrl(fileName);
                onDone(publicUrl);
                Alert.alert('Success', 'Image uploaded successfully!');
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

        const success = await timerConfigManager.saveModel(newModel);
        if (success) {
            await timerConfigManager.saveConfig(newModel.id, DEFAULT_CONFIGS.basicred_kap);
            syncConfigs();
            setSelectedModel(newModel);
            setShowAddModel(false);
            setNewModel({ 
                id: '', label: '', image: '', image_open: '', image_cover: '', 
                category: 'Vibe', tint: '#a269ff', is_active: true, is_event: false,
                event_start: '', event_end: '', event_title: '', event_description: ''
            });
            Alert.alert('Success', 'Model added successfully');
        } else {
            Alert.alert('Error', 'Could not save model to database');
        }
    };

    const handleAddChain = async () => {
        if (!newChain.id || !newChain.image_url) {
            Alert.alert('Error', 'Please provide ID and Image URL');
            return;
        }
        const success = await timerConfigManager.addChainToLibrary(newChain);
        if (success) {
            setSelectedChainId(newChain.id);
            setShowAddChain(false);
            setNewChain({ id: '', name: '', image_url: '', thumbnail_url: '', is_active: true });
        }
    };

    const handleAddSticker = async () => {
        if (!newSticker.name || !newSticker.image_url) {
            Alert.alert('Error', 'Please provide Name and Image URL');
            return;
        }

        try {
            setAddingSticker(true);
            const { data, error } = await supabase.from('stickers').insert([newSticker]).select();
            
            if (error) {
                Alert.alert('Error', error.message);
                return;
            }

            if (data && data.length > 0) {
                setStickers(prev => [data[0], ...prev]);
                setShowAddSticker(false);
                setNewSticker({ name: '', image_url: '', is_active: true });
                Alert.alert('Success', 'Sticker added!');
            } else {
                loadStickers();
                setShowAddSticker(false);
                setNewSticker({ name: '', image_url: '', is_active: true });
            }
        } catch (e: any) {
            Alert.alert('Error', 'An unexpected error occurred: ' + e.message);
        } finally {
            setAddingSticker(false);
        }
    };

    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: () => true,
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
                <Text style={styles.headerTitle}>Calibration Tool</Text>
                <TouchableOpacity activeOpacity={0.7} onPress={reset}>
                    <Text style={styles.resetBtn}>Reset</Text>
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false} scrollEnabled={!isDragging}>
                <View style={styles.topTabs}>
                    <TouchableOpacity
                        style={[styles.topTab, activeTab === 'timer' && styles.activeTopTab]}
                        activeOpacity={0.7}
                        onPress={() => setActiveTab('timer')}
                    >
                        <Ionicons name="time" size={20} color={activeTab === 'timer' ? Colors.primary : Colors.textMuted} />
                        <Text style={[styles.topTabText, activeTab === 'timer' && styles.activeTopTabText]}>Timer</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.topTab, activeTab === 'chain' && styles.activeTopTab]}
                        activeOpacity={0.7}
                        onPress={() => setActiveTab('chain')}
                    >
                        <Ionicons name="link" size={20} color={activeTab === 'chain' ? Colors.primary : Colors.textMuted} />
                        <Text style={[styles.topTabText, activeTab === 'chain' && styles.activeTopTabText]}>Chains</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.topTab, activeTab === 'stickers' && styles.activeTopTab]}
                        activeOpacity={0.7}
                        onPress={() => setActiveTab('stickers')}
                    >
                        <Ionicons name="sparkles" size={20} color={activeTab === 'stickers' ? Colors.primary : Colors.textMuted} />
                        <Text style={[styles.topTabText, activeTab === 'stickers' && styles.activeTopTabText]}>Stickers</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.topTab, activeTab === 'models' && styles.activeTopTab]}
                        activeOpacity={0.7}
                        onPress={() => setActiveTab('models')}
                    >
                        <Ionicons name="cube" size={20} color={activeTab === 'models' ? Colors.primary : Colors.textMuted} />
                        <Text style={[styles.topTabText, activeTab === 'models' && styles.activeTopTabText]}>Library</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.previewContainer}>
                    <View style={styles.modelFrame}>
                        <Image source={{ uri: selectedModel.image }} style={styles.modelImg} resizeMode="contain" />

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
                            selectedChainId && (
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
                </View>

                <View style={styles.controls}>
                    <View style={styles.sectionHeaderInner}>
                        <View>
                            <Text style={styles.sectionLabelTitle}>Model Selection</Text>
                            <Text style={styles.sectionSub}>Choose or create a base capsule model</Text>
                        </View>
                        <TouchableOpacity style={styles.addModelBtn} activeOpacity={0.7} onPress={() => setShowAddModel(true)}>
                            <LinearGradient colors={[Colors.primary, Colors.primaryDark || Colors.primary]} style={styles.addModelIcon}>
                                <Ionicons name="add" size={18} color="#fff" />
                            </LinearGradient>
                            <Text style={styles.addModelBtnText}>New</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modelList}>
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
                    </ScrollView>

                    <View style={styles.divider} />

                    {activeTab === 'timer' ? (
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
                        </View>
                    ) : activeTab === 'chain' ? (
                        <View style={styles.chainSection}>
                            <View style={styles.sectionHeaderInner}>
                                <Text style={styles.label}>Select Chain from Library</Text>
                                <TouchableOpacity style={styles.addModelBtn} activeOpacity={0.7} onPress={() => setShowAddChain(true)}>
                                    <Ionicons name="add-circle" size={18} color={Colors.primary} />
                                    <Text style={styles.addModelBtnText}>New Chain</Text>
                                </TouchableOpacity>
                            </View>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chainList}>
                                {timerConfigManager.getChainLibrary().map(c => (
                                    <TouchableOpacity
                                        key={c.id}
                                        style={[styles.chainCard, selectedChainId === c.id && styles.activeChainCard]}
                                        activeOpacity={0.7}
                                        onPress={() => setSelectedChainId(c.id)}
                                    >
                                        <Image source={{ uri: c.thumbnail_url || c.image_url }} style={styles.chainImg} resizeMode="cover" />
                                        <Text style={styles.chainLabel} numberOfLines={1}>{c.name}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>

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
                                </View>
                            )}
                        </View>
                    ) : activeTab === 'stickers' ? (
                        <View style={styles.stickerSection}>
                            <View style={styles.sectionHeaderInner}>
                                <Text style={styles.label}>Manage Profile Stickers</Text>
                                <TouchableOpacity style={styles.addModelBtn} activeOpacity={0.7} onPress={() => setShowAddSticker(true)}>
                                    <Ionicons name="add-circle" size={18} color={Colors.primary} />
                                    <Text style={styles.addModelBtnText}>New Sticker</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={styles.stickerGrid}>
                                {stickers.map(s => (
                                    <View key={s.id} style={styles.stickerCard}>
                                        <Image source={{ uri: s.image_url }} style={styles.stickerImg} resizeMode="contain" />
                                        <Text style={styles.stickerName} numberOfLines={1}>{s.name}</Text>
                                        <TouchableOpacity 
                                            style={styles.deleteStickerBtn}
                                            onPress={() => {
                                                Alert.alert('Delete', 'Delete this sticker?', [
                                                    { text: 'Cancel' },
                                                    { text: 'Delete', style: 'destructive', onPress: async () => {
                                                        const { error } = await supabase.from('stickers').delete().eq('id', s.id);
                                                        if (!error) loadStickers();
                                                    }}
                                                ]);
                                            }}
                                        >
                                            <Ionicons name="trash-outline" size={14} color={Colors.error} />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        </View>
                    ) : (
                        <View style={styles.stickerSection}>
                            <View style={styles.sectionHeaderInner}>
                                <View>
                                    <Text style={styles.label}>Capsule Library</Text>
                                    <Text style={styles.sectionSub}>Total: {allModels.length} models</Text>
                                </View>
                                <TouchableOpacity style={styles.addModelBtn} onPress={() => {
                                    setNewModel({ 
                                        id: '', label: '', image: '', image_open: '', image_cover: '', 
                                        category: 'Vibe', tint: '#a269ff', is_active: true, is_event: false,
                                        event_start: '', event_end: '', event_title: '', event_description: ''
                                    });
                                    setShowAddModel(true);
                                }}>
                                    <Ionicons name="add-circle" size={18} color={Colors.primary} />
                                    <Text style={styles.addModelBtnText}>New Model</Text>
                                </TouchableOpacity>
                            </View>

                            <View>
                                {allModels.map((m) => (
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
                                            </View>
                                        </View>
                                        <View style={{ flexDirection: 'row', gap: 10 }}>
                                            <TouchableOpacity 
                                                style={styles.libActionBtn}
                                                onPress={() => {
                                                    setNewModel({ ...m, 
                                                        event_start: m.event_start || '', 
                                                        event_end: m.event_end || '', 
                                                        event_title: m.event_title || '', 
                                                        event_description: m.event_description || ''
                                                    });
                                                    setShowAddModel(true);
                                                }}
                                            >
                                                <Ionicons name="pencil" size={16} color={Colors.primary} />
                                            </TouchableOpacity>
                                            <TouchableOpacity 
                                                style={[styles.libActionBtn, { backgroundColor: Colors.error + '10' }]}
                                                onPress={() => {
                                                    Alert.alert('Delete', `Delete model ${m.id}?`, [
                                                        { text: 'Cancel' },
                                                        { text: 'Delete', style: 'destructive', onPress: async () => {
                                                            const { error } = await supabase.from('models').delete().eq('id', m.id);
                                                            if (!error) {
                                                                timerConfigManager.refresh();
                                                            }
                                                        }}
                                                    ]);
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
                            <Text style={styles.modalTitle}>Configure Model</Text>
                            
                            <View style={styles.inputSection}>
                                <Text style={styles.innerLabel}>Basic Info</Text>
                                <TextInput
                                    placeholder="Model ID (e.g. golden_cap)"
                                    placeholderTextColor="#999"
                                    value={newModel.id}
                                    onChangeText={t => setNewModel(p => ({ ...p, id: t }))}
                                    style={styles.input}
                                />
                                <TextInput
                                    placeholder="Label (e.g. Golden Capsule)"
                                    placeholderTextColor="#999"
                                    value={newModel.label}
                                    onChangeText={t => setNewModel(p => ({ ...p, label: t }))}
                                    style={styles.input}
                                />
                            </View>

                            <View style={styles.inputSection}>
                                <Text style={styles.innerLabel}>Assets</Text>
                                <View style={styles.assetInputRow}>
                                    <TextInput
                                        placeholder="Image URL (PNG)"
                                        placeholderTextColor="#999"
                                        value={newModel.image}
                                        onChangeText={t => setNewModel(p => ({ ...p, image: t }))}
                                        style={[styles.input, { flex: 1, marginBottom: 0 }]}
                                    />
                                    <TouchableOpacity style={styles.uploadSmallBtn} onPress={() => pickAndUploadImage(url => setNewModel(p => ({ ...p, image: url })))}>
                                        <Ionicons name="camera" size={20} color="#fff" />
                                    </TouchableOpacity>
                                </View>
                                <View style={[styles.assetInputRow, { marginTop: 10 }]}>
                                    <TextInput
                                        placeholder="Image Open URL (PNG)"
                                        placeholderTextColor="#999"
                                        value={newModel.image_open}
                                        onChangeText={t => setNewModel(p => ({ ...p, image_open: t }))}
                                        style={[styles.input, { flex: 1, marginBottom: 0 }]}
                                    />
                                    <TouchableOpacity style={styles.uploadSmallBtn} onPress={() => pickAndUploadImage(url => setNewModel(p => ({ ...p, image_open: url })))}>
                                        <Ionicons name="camera" size={20} color="#fff" />
                                    </TouchableOpacity>
                                </View>
                                <View style={[styles.assetInputRow, { marginTop: 10 }]}>
                                    <TextInput
                                        placeholder="Cover Image URL (PNG)"
                                        placeholderTextColor="#999"
                                        value={newModel.image_cover}
                                        onChangeText={t => setNewModel(p => ({ ...p, image_cover: t }))}
                                        style={[styles.input, { flex: 1, marginBottom: 0 }]}
                                    />
                                    <TouchableOpacity style={styles.uploadSmallBtn} onPress={() => pickAndUploadImage(url => setNewModel(p => ({ ...p, image_cover: url })))}>
                                        <Ionicons name="camera" size={20} color="#fff" />
                                    </TouchableOpacity>
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

                                <View style={[styles.switchRow, { marginTop: 15 }]}>
                                    <View>
                                        <Text style={styles.switchLabel}>Event Capsule</Text>
                                        <Text style={styles.switchSub}>Automatically active for events</Text>
                                    </View>
                                    <Switch value={newModel.is_event} onValueChange={v => setNewModel(p => ({ ...p, is_event: v }))} trackColor={{ true: '#f5a623' }} />
                                </View>
                            </View>

                            {newModel.is_event && (
                                <View style={[styles.inputSection, { backgroundColor: '#fff9ef', borderColor: '#ffe0b2' }]}>
                                    <Text style={[styles.innerLabel, { color: '#f5a623' }]}>Event Details</Text>
                                    <TextInput
                                        placeholder="Event Title"
                                        placeholderTextColor="#999"
                                        value={newModel.event_title}
                                        onChangeText={t => setNewModel(p => ({ ...p, event_title: t }))}
                                        style={styles.input}
                                    />
                                    <TextInput
                                        placeholder="Event Description"
                                        placeholderTextColor="#999"
                                        value={newModel.event_description}
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

                                    {datePickerMode && (
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
                                            }}
                                        />
                                    )}
                                </View>
                            )}

                            <View style={styles.modalActions}>
                                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAddModel(false)}>
                                    <Text style={styles.cancelBtnText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.confirmBtn} onPress={handleAddModel}>
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
                        <Text style={styles.modalTitle}>Add New Chain</Text>
                        <TextInput
                            placeholder="Chain ID (e.g. cherry_charm)"
                            placeholderTextColor="#999"
                            value={newChain.id}
                            onChangeText={t => setNewChain(p => ({ ...p, id: t }))}
                            style={styles.input}
                        />
                        <TextInput
                            placeholder="Name (e.g. Red Cherry)"
                            placeholderTextColor="#999"
                            value={newChain.name}
                            onChangeText={t => setNewChain(p => ({ ...p, name: t }))}
                            style={styles.input}
                        />
                        <View style={styles.assetInputRow}>
                            <TextInput
                                placeholder="Image URL (PNG)"
                                placeholderTextColor="#999"
                                value={newChain.image_url}
                                onChangeText={t => setNewChain(p => ({ ...p, image_url: t }))}
                                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                            />
                            <TouchableOpacity style={styles.uploadSmallBtn} onPress={() => pickAndUploadImage(url => setNewChain(p => ({ ...p, image_url: url })))}>
                                <Ionicons name="camera" size={20} color="#fff" />
                            </TouchableOpacity>
                        </View>
                        <View style={[styles.assetInputRow, { marginTop: 10 }]}>
                            <TextInput
                                placeholder="Thumbnail URL (Square, Optional)"
                                placeholderTextColor="#999"
                                value={newChain.thumbnail_url}
                                onChangeText={t => setNewChain(p => ({ ...p, thumbnail_url: t }))}
                                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                            />
                            <TouchableOpacity style={styles.uploadSmallBtn} onPress={() => pickAndUploadImage(url => setNewChain(p => ({ ...p, thumbnail_url: url })))}>
                                <Ionicons name="camera" size={20} color="#fff" />
                            </TouchableOpacity>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 4 }}>
                            <Text style={{ fontSize: 14, fontFamily: Fonts.medium, color: Colors.textPrimary }}>Available in Creation Screen</Text>
                            <Switch value={newChain.is_active} onValueChange={v => setNewChain(p => ({ ...p, is_active: v }))} trackColor={{ true: Colors.primary }} />
                        </View>
                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAddChain(false)}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.confirmBtn} onPress={handleAddChain}>
                                <Text style={styles.confirmBtnText}>Add</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal visible={showAddSticker} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Add New Sticker</Text>
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
                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAddSticker(false)} disabled={addingSticker}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.confirmBtn} onPress={handleAddSticker} disabled={addingSticker || !newSticker.name || !newSticker.image_url}>
                                {addingSticker ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text style={styles.confirmBtnText}>Add Sticker</Text>
                                )}
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
    topTabs: { flexDirection: 'row', backgroundColor: '#fff', paddingBottom: 10 },
    topTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
    activeTopTab: { borderBottomColor: Colors.primary },
    topTabText: { fontSize: 13, fontFamily: Fonts.bold, color: Colors.textMuted },
    activeTopTabText: { color: Colors.textPrimary },
    previewContainer: { alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: '#f0f0f5' },
    modelFrame: { width: 300, height: 300, backgroundColor: '#fff', borderRadius: 24, elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' },
    modelImg: { width: '100%', height: '100%' },
    hint: { marginTop: 15, color: Colors.textMuted, fontSize: 11, fontFamily: Fonts.medium },
    controls: { backgroundColor: '#fff', padding: 20, borderTopLeftRadius: 30, borderTopRightRadius: 30, elevation: 10, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20 },
    sectionHeaderInner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    label: { fontSize: 12, fontFamily: Fonts.bold, color: Colors.textPrimary, marginBottom: 8, textTransform: 'uppercase' },
    addModelBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    addModelBtnText: { fontSize: 12, color: Colors.primary, fontFamily: Fonts.bold },
    modelList: { gap: 12, marginBottom: 20 },
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
    stickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    stickerCard: { width: (SCREEN_WIDTH - 64) / 3, backgroundColor: '#fff', borderRadius: 15, padding: 10, alignItems: 'center', position: 'relative', borderWidth: 1, borderColor: '#eee' },
    stickerImg: { width: 60, height: 60 },
    stickerName: { fontSize: 11, fontFamily: Fonts.medium, marginTop: 4 },
    deleteStickerBtn: { position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.error + '15', alignItems: 'center', justifyContent: 'center' },
    modelLibraryCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 15, marginBottom: 10, borderWidth: 1, borderColor: '#eee', gap: 12 },
    modelLibraryThumb: { width: 50, height: 50, borderRadius: 10, backgroundColor: '#f5f5f5' },
    modelLibraryLabel: { fontSize: 14, fontFamily: Fonts.bold, color: Colors.textPrimary },
    statusTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    statusTagText: { fontSize: 10, fontFamily: Fonts.bold, textTransform: 'uppercase' },
    libActionBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: Colors.primary + '10', alignItems: 'center', justifyContent: 'center' },
    addModelIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', elevation: 3, shadowColor: Colors.primary, shadowOpacity: 0.3, shadowRadius: 6 },
    tabImgWrapper: { position: 'relative', width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
    tabActiveIndicator: { position: 'absolute', bottom: -10, width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.primary },
    sliderTrackAlt: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#f5f5f5', padding: 4, borderRadius: 12 },
    datePickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e2e2', borderRadius: 8, paddingHorizontal: 10, height: 40, marginTop: 5 },
    dateText: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.textPrimary },
    chainCard: { width: 100, height: 130, alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0.6, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#eee' },
    activeChainCard: { opacity: 1, borderColor: Colors.primary, backgroundColor: Colors.primary + '08' },
    chainImg: { width: 80, height: 80, borderRadius: 15 },
    chainLabel: { fontSize: 11, fontFamily: Fonts.bold, color: Colors.textSecondary },
    chainCalibration: { backgroundColor: '#f9f9ff', padding: 15, borderRadius: 15, marginTop: 10 },
    sectionLabelTitle: { fontSize: 16, fontFamily: Fonts.bold, color: Colors.textPrimary },
    sectionSub: { fontSize: 12, color: Colors.textMuted, fontFamily: Fonts.regular, marginTop: 2 },
    divider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 20 },
    chainSection: { gap: 15 },
    chainList: { gap: 12, paddingBottom: 10 },
});
