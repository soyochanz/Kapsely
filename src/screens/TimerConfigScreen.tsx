import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, StyleSheet, Image, PanResponder, Animated,
    TouchableOpacity, ScrollView, SafeAreaView, StatusBar,
    Dimensions, Platform, TextInput, Modal, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Colors, Fonts, Spacing, BorderRadius, Shadow } from '../theme';
import { timerConfigManager, ModelTimerConfig, DEFAULT_CONFIGS, ChainItem, ModelChainConfig } from '../utils/timerConfig';
import LiveTimer from '../components/LiveTimer';
import { CAPSULE_MODELS } from '../constants/models';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MODELS = CAPSULE_MODELS as unknown as any[];

const PRESET_COLORS = ['#ffffff', '#000000', '#a269ff', '#6abf69', '#ff9f1c', '#ff5252', '#d4a017', '#e2e2e2'];
const PRESET_THEME_COLORS = ['#a269ff', '#6abf69', '#ff9f1c', '#00d2ff', '#e67e22', '#ff5252', '#d4a017', '#2d2d2d', '#ec4899', '#ff78b8'];
const FONTS = [
    { id: 'monospace', label: 'Retro', font: 'monospace' },
    { id: 'Inter_700Bold', label: 'Modern', font: Fonts.bold },
    { id: 'Inter_400Regular', label: 'Minimal', font: Fonts.regular },
    { id: 'serif', label: 'Classic', font: Platform.OS === 'ios' ? 'Times New Roman' : 'serif' },
];

export default function TimerConfigScreen() {
    const navigation = useNavigation();
    const [selectedModel, setSelectedModel] = useState<any>(MODELS[0]);
    const [activeTab, setActiveTab] = useState<'timer' | 'chain'>('timer');
    const [selectedChainId, setSelectedChainId] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    // Dynamic models list
    const [allModels, setAllModels] = useState<any[]>(MODELS);
    const [showAddModel, setShowAddModel] = useState(false);
    const [newModel, setNewModel] = useState({ id: '', label: '', image: '', image_open: '', category: 'Vibe', tint: '#a269ff' });

    const [showAddChain, setShowAddChain] = useState(false);
    const [newChain, setNewChain] = useState({ id: '', name: '', image_url: '', thumbnail_url: '' });

    // Per-model configurations initialized from manager
    const [configs, setConfigs] = useState<Record<string, ModelTimerConfig>>(() => {
        return MODELS.reduce((acc, m) => ({
            ...acc,
            [m.id]: timerConfigManager.getConfig(m.id)
        }), {});
    });

    const activeConfig = configs[selectedModel.id] || DEFAULT_CONFIGS.beach;

    // Keep a ref to the current selected model ID for the PanResponder closure
    const currentModelIdRef = useRef(selectedModel.id);
    useEffect(() => {
        currentModelIdRef.current = selectedModel.id;
    }, [selectedModel.id]);

    const [refreshTrigger, setRefreshTrigger] = useState(0);

    useEffect(() => {
        const syncConfigs = () => {
            setConfigs((prev) => {
                const newConfigs: Record<string, ModelTimerConfig> = { ...prev };
                allModels.forEach(m => {
                    newConfigs[m.id] = timerConfigManager.getConfig(m.id);
                });
                return newConfigs;
            });
            setRefreshTrigger(prev => prev + 1); // Force re-render for chains etc
        };
        const unsubscribe = timerConfigManager.subscribe(syncConfigs);
        syncConfigs();
        return unsubscribe;
    }, [allModels]);

    const updateActiveConfigById = (modelId: string, updates: Partial<ModelTimerConfig>) => {
        setConfigs((prev: Record<string, ModelTimerConfig>) => ({
            ...prev,
            [modelId]: { ...prev[modelId], ...updates }
        }));
    };

    const updateActiveConfig = (updates: Partial<ModelTimerConfig>) => {
        updateActiveConfigById(selectedModel.id, updates);
    };

    const FRAME_SIZE = 300;
    const pan = useRef(new Animated.ValueXY({ x: activeConfig.x * FRAME_SIZE, y: activeConfig.y * FRAME_SIZE })).current;

    useEffect(() => {
        pan.setValue({ x: activeConfig.x * FRAME_SIZE, y: activeConfig.y * FRAME_SIZE });
    }, [selectedModel.id, activeConfig.x, activeConfig.y]);

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
                // No auto-save here, user must click the button
            },
            onPanResponderTerminate: () => setIsDragging(false),
        })
    ).current;

    const saveChainScale = (s: number) => {
        setChainScale(s);
        // Scaling also needs explicit save now
    };


    const handleAddModel = async () => {
        if (!newModel.id || !newModel.image) {
            Alert.alert('Error', 'Please provide ID and Image URL');
            return;
        }

        const success = await timerConfigManager.saveModel(newModel);
        if (success) {
            await timerConfigManager.saveConfig(newModel.id, DEFAULT_CONFIGS.beach);
            setAllModels(timerConfigManager.models);
            setSelectedModel(newModel);
            setShowAddModel(false);
            setNewModel({ id: '', label: '', image: '', image_open: '', category: 'Vibe', tint: '#a269ff' });
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
            setNewChain({ id: '', name: '', image_url: '', thumbnail_url: '' });
        } else {
            Alert.alert('Error', 'Could not add chain to library.');
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
        const def: ModelTimerConfig = DEFAULT_CONFIGS[selectedModel.id] || DEFAULT_CONFIGS['beach'];
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
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="close" size={28} color={Colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Calibration Tool</Text>
                <TouchableOpacity onPress={reset}>
                    <Text style={styles.resetBtn}>Reset</Text>
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false} scrollEnabled={!isDragging}>
                <View style={styles.topTabs}>
                    <TouchableOpacity
                        style={[styles.topTab, activeTab === 'timer' && styles.activeTopTab]}
                        onPress={() => setActiveTab('timer')}
                    >
                        <Ionicons name="time" size={20} color={activeTab === 'timer' ? Colors.primary : Colors.textMuted} />
                        <Text style={[styles.topTabText, activeTab === 'timer' && styles.activeTopTabText]}>Timer</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.topTab, activeTab === 'chain' && styles.activeTopTab]}
                        onPress={() => setActiveTab('chain')}
                    >
                        <Ionicons name="link" size={20} color={activeTab === 'chain' ? Colors.primary : Colors.textMuted} />
                        <Text style={[styles.topTabText, activeTab === 'chain' && styles.activeTopTabText]}>Chains</Text>
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
                                    {/* Precise Center Marker */}
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
                        <Text style={styles.label}>1. Choose Model</Text>
                        <TouchableOpacity style={styles.addModelBtn} onPress={() => setShowAddModel(true)}>
                            <Ionicons name="add-circle" size={18} color={Colors.primary} />
                            <Text style={styles.addModelBtnText}>New Model</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modelList}>
                        {allModels.map(m => (
                            <TouchableOpacity
                                key={m.id}
                                style={[styles.modelTab, selectedModel.id === m.id && styles.activeTab]}
                                onPress={() => setSelectedModel(m)}
                            >
                                <Image source={{ uri: m.image }} style={styles.tabImg} />
                                <Text style={[styles.tabLabel, selectedModel.id === m.id && styles.activeTabText]}>{m.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    {activeTab === 'timer' ? (
                        <>
                            <View style={styles.grid}>
                                <View style={styles.col}>
                                    <Text style={styles.label}>2. Format</Text>
                                    <View style={styles.toggleRow}>
                                        <TouchableOpacity
                                            style={[styles.toggleBtn, activeConfig.format === 'standard' && styles.activeToggle]}
                                            onPress={() => updateActiveConfig({ format: 'standard' })}
                                        >
                                            <Text style={[styles.toggleText, activeConfig.format === 'standard' && styles.activeToggleText]}>H:M:S</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.toggleBtn, activeConfig.format === 'days' && styles.activeToggle]}
                                            onPress={() => updateActiveConfig({ format: 'days' })}
                                        >
                                            <Text style={[styles.toggleText, activeConfig.format === 'days' && styles.activeToggleText]}>Days</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                                <View style={styles.col}>
                                    <Text style={styles.label}>3. Typography</Text>
                                    <View style={styles.fontRow}>
                                        {FONTS.map(f => (
                                            <TouchableOpacity
                                                key={f.id}
                                                style={[styles.fontBtn, activeConfig.fontId === f.id && styles.activeFontBtn]}
                                                onPress={() => updateActiveConfig({ fontId: f.id })}
                                            >
                                                <Text style={[styles.fontBtnText, activeConfig.fontId === f.id && styles.activeFontBtnText, { fontFamily: f.font }]}>Aa</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                            </View>

                            <Text style={styles.label}>4. Text Color</Text>
                            <View style={styles.colorPalette}>
                                {PRESET_COLORS.map(c => (
                                    <TouchableOpacity
                                        key={c}
                                        style={[styles.colorBubble, { backgroundColor: c }, activeConfig.color === c && styles.activeColorBubble]}
                                        onPress={() => updateActiveConfig({ color: c })}
                                    />
                                ))}
                            </View>

                            <Text style={styles.label}>5. Theme Color</Text>
                            <View style={styles.colorPalette}>
                                {PRESET_THEME_COLORS.map(c => (
                                    <TouchableOpacity
                                        key={c}
                                        style={[styles.colorBubble, { backgroundColor: c }, activeConfig.themeColor === c && styles.activeColorBubble]}
                                        onPress={() => updateActiveConfig({ themeColor: c })}
                                    />
                                ))}
                            </View>

                            <View style={styles.grid}>
                                <View style={styles.col}>
                                    <Text style={styles.label}>6. Width: {(activeConfig.w * 100).toFixed(0)}%</Text>
                                    <View style={styles.sliderTrack}>
                                        <TouchableOpacity style={styles.sliderBtnSmall} onPress={() => updateActiveConfig({ w: Math.max(0.1, activeConfig.w - 0.05) })}>
                                            <Ionicons name="remove" size={16} />
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.sliderBtnSmall} onPress={() => updateActiveConfig({ w: Math.min(1.0, activeConfig.w + 0.05) })}>
                                            <Ionicons name="add" size={16} />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                                <View style={styles.col}>
                                    <Text style={styles.label}>7. Height: {(activeConfig.h * 100).toFixed(0)}%</Text>
                                    <View style={styles.sliderTrack}>
                                        <TouchableOpacity style={styles.sliderBtnSmall} onPress={() => updateActiveConfig({ h: Math.max(0.05, activeConfig.h - 0.02) })}>
                                            <Ionicons name="remove" size={16} />
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.sliderBtnSmall} onPress={() => updateActiveConfig({ h: Math.min(0.5, activeConfig.h + 0.02) })}>
                                            <Ionicons name="add" size={16} />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>

                            <TouchableOpacity style={styles.saveBtn} onPress={saveChanges}>
                                <Text style={styles.saveBtnText}>Save Configuration</Text>
                            </TouchableOpacity>
                        </>
                    ) : (
                        <View style={styles.chainSection}>
                            <View style={styles.sectionHeaderInner}>
                                <Text style={styles.label}>2. Select Chain from Library</Text>
                                <TouchableOpacity style={styles.addModelBtn} onPress={() => setShowAddChain(true)}>
                                    <Ionicons name="add-circle" size={18} color={Colors.primary} />
                                    <Text style={styles.addModelBtnText}>New Chain</Text>
                                </TouchableOpacity>
                            </View>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chainList}>
                                {timerConfigManager.getChainLibrary().map(c => (
                                    <TouchableOpacity
                                        key={c.id}
                                        style={[styles.chainCard, selectedChainId === c.id && styles.activeChainCard]}
                                        onPress={() => setSelectedChainId(c.id)}
                                    >
                                        <Image source={{ uri: c.thumbnail_url || c.image_url }} style={styles.chainImg} resizeMode="cover" />
                                        <Text style={styles.chainLabel} numberOfLines={1}>{c.name}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>

                            {selectedChainId && (
                                <View style={styles.chainCalibration}>
                                    <Text style={styles.label}>3. Calibrate Scale</Text>
                                    <View style={styles.sliderTrack}>
                                        <TouchableOpacity style={styles.sliderBtnSmall} onPress={() => saveChainScale(Math.max(0.05, chainScale - 0.05))}>
                                            <Ionicons name="remove" size={16} />
                                        </TouchableOpacity>
                                        <Text style={styles.scaleValue}>{(chainScale * 100).toFixed(0)}%</Text>
                                        <TouchableOpacity style={styles.sliderBtnSmall} onPress={() => saveChainScale(Math.min(1.0, chainScale + 0.05))}>
                                            <Ionicons name="add" size={16} />
                                        </TouchableOpacity>
                                    </View>
                                    <Text style={styles.hint}>Position changes are temporary until saved:</Text>
                                    <TouchableOpacity
                                        style={[styles.saveBtn, { marginTop: 15, backgroundColor: Colors.textSecondary }]}
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
                    )}
                    <View style={{ height: 60 }} />
                </View>
            </ScrollView>

            <Modal visible={showAddModel} transparent animationType="slide">
                <View style={[styles.modalOverlay, { margin: 0 }]}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Add New Model</Text>
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
                        <TextInput
                            placeholder="Image URL (PNG)"
                            placeholderTextColor="#999"
                            value={newModel.image}
                            onChangeText={t => setNewModel(p => ({ ...p, image: t }))}
                            style={styles.input}
                        />
                        <TextInput
                            placeholder="Image Open URL (PNG) (Optional)"
                            placeholderTextColor="#999"
                            value={newModel.image_open}
                            onChangeText={t => setNewModel(p => ({ ...p, image_open: t }))}
                            style={styles.input}
                        />
                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAddModel(false)}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.confirmBtn} onPress={handleAddModel}>
                                <Text style={styles.confirmBtnText}>Add</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal visible={showAddChain} transparent animationType="slide">
                <View style={[styles.modalOverlay, { margin: 0 }]}>
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
                        <TextInput
                            placeholder="Image URL (PNG)"
                            placeholderTextColor="#999"
                            value={newChain.image_url}
                            onChangeText={t => setNewChain(p => ({ ...p, image_url: t }))}
                            style={styles.input}
                        />
                        <TextInput
                            placeholder="Thumbnail URL (Square, Optional)"
                            placeholderTextColor="#999"
                            value={newChain.thumbnail_url}
                            onChangeText={t => setNewChain(p => ({ ...p, thumbnail_url: t }))}
                            style={styles.input}
                        />
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
        </SafeAreaView>
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
    topTabText: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.textMuted },
    activeTopTabText: { color: Colors.textPrimary },
    previewContainer: { alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: '#f0f0f5' },
    modelFrame: { width: 300, height: 300, backgroundColor: '#fff', borderRadius: 24, ...Shadow.card, alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' },
    modelImg: { width: '100%', height: '100%' },
    hint: { marginTop: 15, color: Colors.textMuted, fontSize: 11, fontFamily: Fonts.medium },
    controls: { backgroundColor: '#fff', padding: 20, borderTopLeftRadius: 30, borderTopRightRadius: 30, ...Shadow.primary },
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
    activeToggle: { backgroundColor: '#fff', ...Shadow.subtle },
    toggleText: { fontSize: 11, color: Colors.textMuted, fontFamily: Fonts.bold },
    activeToggleText: { color: Colors.primary },
    fontRow: { flexDirection: 'row', gap: 8 },
    fontBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center' },
    activeFontBtn: { backgroundColor: Colors.primary },
    fontBtnText: { fontSize: 14, color: Colors.textPrimary },
    activeFontBtnText: { color: '#fff' },
    colorPalette: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
    colorBubble: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: '#eee' },
    activeColorBubble: { borderColor: Colors.primary, transform: [{ scale: 1.1 }] },
    sliderTrack: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    sliderBtnSmall: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center' },
    saveBtn: { backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 15, alignItems: 'center', marginTop: 10 },
    saveBtnText: { color: '#fff', fontFamily: Fonts.bold, fontSize: 15 },
    exportBtn: { backgroundColor: '#eee', paddingVertical: 12, borderRadius: 15, alignItems: 'center', marginTop: 10 },
    exportBtnText: { color: Colors.textPrimary, fontFamily: Fonts.bold, fontSize: 13 },
    chainSection: { gap: 15 },
    chainList: { gap: 12, paddingBottom: 10 },
    chainCard: { width: 80, alignItems: 'center', gap: 6, opacity: 0.6 },
    activeChainCard: { opacity: 1 },
    chainImg: { width: '100%', height: '100%', borderRadius: 12 },
    chainLabel: { fontSize: 10, fontFamily: Fonts.medium },
    chainCalibration: { backgroundColor: '#f9f9ff', padding: 15, borderRadius: 15, marginTop: 10 },
    scaleValue: { fontSize: 16, fontFamily: Fonts.bold, color: Colors.primary },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    modalContent: { backgroundColor: '#fff', borderRadius: 24, padding: 24, gap: 15 },
    modalTitle: { fontSize: 20, fontFamily: Fonts.bold, color: Colors.textPrimary, marginBottom: 5 },
    input: { backgroundColor: '#f5f5f5', borderRadius: 12, padding: 12, fontSize: 14, fontFamily: Fonts.regular, color: '#333' },
    modalActions: { flexDirection: 'row', gap: 12, marginTop: 10 },
    cancelBtn: { flex: 1, paddingVertical: 14, alignItems: 'center' },
    cancelBtnText: { color: Colors.textMuted, fontFamily: Fonts.bold },
    confirmBtn: { flex: 2, backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    confirmBtnText: { color: '#fff', fontFamily: Fonts.bold },
});
