import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    TextInput, StatusBar, SafeAreaView, Dimensions, Switch,
    Image, Pressable, PanResponder, Animated, Alert, ActivityIndicator, Easing
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts, Spacing, BorderRadius, Shadow } from '../theme';
import { CapsuleType } from '../data/mockCapsules';
import { supabase } from '../lib/supabase';

import { CAPSULE_MODELS, MODEL_CATEGORIES } from '../constants/models';
import CapsuleWithTimer from '../components/CapsuleWithTimer';
import { timerConfigManager } from '../utils/timerConfig';

// ─── Duration helpers ─────────────────────────────────────────────────────────
// slider goes 0..1  →  14 days .. 365 days
const MIN_DAYS = 14;
const MAX_DAYS = 365;

const DURATION_PRESETS = [
    { label: '2 Weeks', days: 14, emoji: '⚡' },
    { label: '1 Month', days: 30, emoji: '📅' },
    { label: '3 Months', days: 90, emoji: '🌙' },
    { label: '6 Months', days: 180, emoji: '⭐' },
    { label: '1 Year', days: 365, emoji: '🔮' },
    { label: 'Custom', days: -1, emoji: '🗓️' },
];

function daysToLabel(days: number): string {
    if (days <= 14) return '2 Weeks';
    if (days <= 30) return '1 Month';
    if (days <= 90) return '3 Months';
    if (days <= 180) return '6 Months';
    if (days >= 365) return '1 Year';
    return `${days} days`;
}

function addDays(days: number): Date {
    return new Date(Date.now() + days * 86400000);
}

// ─── Pioneers Event Configuration ───────────────────────────────────────────
const PIONEERS_EVENT_START = new Date('2026-03-04T00:00:00Z');
const PIONEERS_EVENT_END = new Date('2026-06-04T00:00:00Z');
const PIONEERS_MODEL = 'pioneerscap';

function isPioneersEventActive(): boolean {
    const now = new Date();
    return now >= PIONEERS_EVENT_START && now <= PIONEERS_EVENT_END;
}

// ─── Capsule types ────────────────────────────────────────────────────────────
const { width } = Dimensions.get('window');
type Step = 'type' | 'content' | 'schedule' | 'capangel' | 'review';
const STEPS: Step[] = ['type', 'content', 'schedule', 'capangel', 'review'];

const capsuleTypes: {
    id: CapsuleType; title: string; tagline: string; description: string;
    color: string; bgColor: string; icon: string;
    rules: { icon: string; text: string }[]; limit: string;
    disabled?: boolean;
}[] = [
        {
            id: 'legacycap', title: 'LegacyCap', tagline: 'The capsule of your life',
            description: 'The most exclusive and symbolic capsule in Kapsely. A message to your future self — identity, legacy, permanence.',
            color: Colors.legacyCap, bgColor: Colors.legacyCapLight, icon: 'time', limit: '1 active',
            rules: [
                { icon: 'alert-circle-outline', text: 'Only 1 active LegacyCap per account' },
                { icon: 'lock-closed', text: 'Opens automatically after 5 years' },
                { icon: 'ban', text: 'Cannot be modified once sealed' },
                { icon: 'film', text: 'Cinematic unlock experience' },
                { icon: 'star', text: 'Exclusive animated countdown' },
            ],
        },
        {
            id: 'instacap', title: 'InstaCap', tagline: 'Memories with a release date',
            description: 'Flexible personal or shared capsule. Creates anticipation — turns waiting into meaning.',
            color: Colors.instaCap, bgColor: Colors.instaCapLight, icon: 'camera', limit: 'Max 5',
            rules: [
                { icon: 'albums-outline', text: 'Max 5 active InstaCaps at once' },
                { icon: 'calendar-outline', text: 'Duration: 2 weeks to 1 year' },
                { icon: 'people', text: 'Can be shared — invite a follower' },
                { icon: 'checkmark-circle', text: 'Both users can upload content' },
                { icon: 'hand-left-outline', text: 'Invitee must accept to participate' },
            ],
        },
        {
            id: 'eventcap', title: 'EventCap', tagline: 'Synchronized collective memory',
            description: 'Linked to real-world events — concerts, championships, graduations. All capsules open simultaneously.',
            color: Colors.eventCap, bgColor: Colors.eventCapLight, icon: 'calendar', limit: 'Per event',
            rules: [
                { icon: 'earth', text: 'Connected to verified global events' },
                { icon: 'sync', text: 'All capsules open simultaneously' },
                { icon: 'qr-code', text: 'Requires event QR or access code' },
                { icon: 'shield-checkmark', text: 'Only verified attendees can upload' },
                { icon: 'timer-outline', text: 'Globally synchronized countdown' },
            ],
            disabled: !isPioneersEventActive(), // Only enabled during Pioneers event

        },
    ];

// ─── Custom duration slider ───────────────────────────────────────────────────
const SLIDER_W = width - Spacing.md * 2 - Spacing.md * 2; // account for step+card padding

function DurationSlider({ days, onChange, color }: { days: number; onChange: (d: number) => void; color: string }) {
    const TRACK_W = SLIDER_W - 24; // thumb offset
    const ratio = (days - MIN_DAYS) / (MAX_DAYS - MIN_DAYS);

    // We use a ref for the animated value so it persists
    const thumbX = useRef(new Animated.Value(ratio * TRACK_W)).current;
    const lastRatio = useRef(ratio);

    // Sync thumb position if days change from outside (though mostly internal)
    useEffect(() => {
        const newRatio = (days - MIN_DAYS) / (MAX_DAYS - MIN_DAYS);
        thumbX.setValue(newRatio * TRACK_W);
        lastRatio.current = newRatio;
    }, [days, TRACK_W]);

    const pan = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onStartShouldSetPanResponderCapture: () => true,
            onMoveShouldSetPanResponderCapture: () => true,
            onPanResponderGrant: () => {
                // Initialize drag start position
                lastRatio.current = (days - MIN_DAYS) / (MAX_DAYS - MIN_DAYS);
            },
            onPanResponderMove: (_, gs) => {
                const cur = lastRatio.current * TRACK_W + gs.dx;
                const clamped = Math.max(0, Math.min(TRACK_W, cur));
                thumbX.setValue(clamped);

                const newDays = Math.round(MIN_DAYS + (clamped / TRACK_W) * (MAX_DAYS - MIN_DAYS));
                if (newDays !== days) {
                    onChange(newDays);
                }
            },
            onPanResponderRelease: (_, gs) => {
                const cur = lastRatio.current * TRACK_W + gs.dx;
                const clamped = Math.max(0, Math.min(TRACK_W, cur));
                lastRatio.current = clamped / TRACK_W;
            },
            onPanResponderTerminationRequest: () => false, // Don't let other components (like ScrollView) take the gesture
        })
    ).current;

    const fillW = Animated.add(thumbX, new Animated.Value(12));

    return (
        <View style={styles.sliderWrapper}>
            <View style={styles.sliderTrack}>
                <Animated.View style={[styles.sliderFill, { width: fillW, backgroundColor: color }]} />
                <Animated.View
                    style={[styles.sliderThumb, { left: thumbX, borderColor: color }]}
                    {...pan.panHandlers}
                />
            </View>
            <View style={styles.sliderLabels}>
                <Text style={styles.sliderLabelText}>2 Weeks</Text>
                <Text style={[styles.sliderLabelText, { color }]}>{daysToLabel(days)}</Text>
                <Text style={styles.sliderLabelText}>1 Year</Text>
            </View>
        </View>
    );
}

const MemoizedModelCard = React.memo(({ model, isActive, onSelect }: any) => {

    const getTierColor = (tier: string) => {
        switch (tier?.toLowerCase()) {
            case 'legendary': return '#F6E05E';
            case 'rare': return '#4299E1';
            case 'uncommon': return '#48BB78';
            default: return 'transparent';
        }
    };
    const tierColor = getTierColor(model.tier);

    return (
        <TouchableOpacity
            onPress={onSelect}
            activeOpacity={0.8}
            style={[
                styles.modelCard,
                isActive && { borderColor: model.tint },
                model.tier?.toLowerCase() === 'legendary' && { backgroundColor: '#F6E05E11', borderColor: isActive ? model.tint : '#F6E05E44' }
            ]}
        >
            <Image source={{ uri: model.image }} style={styles.modelImage} resizeMode="contain" />
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 4 }}>
                <Text style={[styles.modelLabel, isActive && { color: model.tint }, { marginTop: 0 }]} numberOfLines={1}>{model.label}</Text>
                {model.tier && model.tier !== 'common' && (
                    <View style={{ backgroundColor: tierColor, width: 6, height: 6, borderRadius: 3 }} />
                )}
            </View>
            {isActive && (
                <View style={[styles.modelCheck, { backgroundColor: model.tint }]}>
                    <Ionicons name="checkmark" size={9} color="#fff" />
                </View>
            )}
        </TouchableOpacity>
    );
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function CapsuleCreationScreen() {
    const navigation = useNavigation<any>();
    const [currentStep, setCurrentStep] = useState<Step>('type');
    const [selectedType, setSelectedType] = useState<CapsuleType | null>(null);
    const [selectedModel, setSelectedModel] = useState('beach');
    const [hasLegacyCap, setHasLegacyCap] = useState(false);
    const [modelSearch, setModelSearch] = useState('');
    const [modelCategory, setModelCategory] = useState('All');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [isShared, setIsShared] = useState(false);
    const [invitedUsers, setInvitedUsers] = useState<any[]>([]);
    const [userSearchQuery, setUserSearchQuery] = useState('');
    const [userSearchResults, setUserSearchResults] = useState<any[]>([]);
    const [searchingUsers, setSearchingUsers] = useState(false);
    const [capAngel, setCapAngel] = useState(false);
    const [capAngelHandle, setCapAngelHandle] = useState('');
    const [eventCode, setEventCode] = useState('');
    const [isPublic, setIsPublic] = useState(true);

    // Duration (InstaCap)
    const [selectedPreset, setSelectedPreset] = useState<number | null>(null); // days or null if custom is showing
    const [showCustomSlider, setShowCustomSlider] = useState(false);
    const [customDays, setCustomDays] = useState(60);

    const [selectedChainId, setSelectedChainId] = useState<string | null>(null);

    const [sealing, setSealing] = useState(false);
    const [isAnimatingSeal, setIsAnimatingSeal] = useState(false);
    const dropAnim = useRef(new Animated.Value(-300)).current;
    const capScaleAnim = useRef(new Animated.Value(1)).current;

    const [availableModels, setAvailableModels] = useState<any[]>(timerConfigManager.models);
    const [availableCategories, setAvailableCategories] = useState<string[]>(['All', ...new Set(timerConfigManager.models.map(m => m.category))]);

    const stepIndex = STEPS.indexOf(currentStep);
    const activeCfg = selectedType ? capsuleTypes.find((t) => t.id === selectedType) : null;
    const activeModel = availableModels.find((m: any) => m.id === selectedModel) ?? availableModels[0] ?? CAPSULE_MODELS[0];

    const [activeThemeColor, setActiveThemeColor] = useState(() => {
        return timerConfigManager.getConfig(selectedModel)?.themeColor || (activeCfg?.color ?? Colors.primary);
    });

    useEffect(() => {
        const updateTheme = () => {
            const config = timerConfigManager.getConfig(selectedModel);
            if (config?.themeColor) {
                setActiveThemeColor(config.themeColor);
            } else if (activeCfg?.color) {
                setActiveThemeColor(activeCfg.color);
            }
        };

        const syncData = () => {
            updateTheme();
            setAvailableModels(timerConfigManager.models);
            setAvailableCategories(['All', ...new Set(timerConfigManager.models.map(m => m.category))]);
        };

        const checkLegacyCap = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { count } = await supabase
                    .from('capsules')
                    .select('*', { count: 'exact', head: true })
                    .eq('owner_id', user.id)
                    .eq('type', 'legacycap')
                    .eq('status', 'sealed');
                if (count && count > 0) {
                    setHasLegacyCap(true);
                }
            }
        };
        checkLegacyCap();
        syncData();

        return timerConfigManager.subscribe(syncData);
    }, [selectedModel, activeCfg]);

    useEffect(() => {
        if (userSearchQuery.trim().length > 1) {
            const delayDebounceFn = setTimeout(() => {
                searchUsers();
            }, 300);
            return () => clearTimeout(delayDebounceFn);
        } else {
            setUserSearchResults([]);
        }
    }, [userSearchQuery]);

    const searchUsers = async () => {
        setSearchingUsers(true);
        const { data } = await supabase
            .from('profiles')
            .select('*')
            .or(`username.ilike.%${userSearchQuery}%,display_name.ilike.%${userSearchQuery}%`)
            .limit(10);
        if (data) setUserSearchResults(data);
        setSearchingUsers(false);
    };

    const toggleInviteUser = (user: any) => {
        if (invitedUsers.some(u => u.id === user.id)) {
            setInvitedUsers(invitedUsers.filter(u => u.id !== user.id));
        } else {
            if (invitedUsers.length >= 9) {
                Alert.alert('Limit reached', 'A shared capsule can have a maximum of 10 users (Owner + 9 Guests).');
                return;
            }
            setInvitedUsers([...invitedUsers, user]);
        }
        setUserSearchQuery('');
        setUserSearchResults([]);
    };

    const filteredModels = React.useMemo(() => {
        return availableModels.filter(m => {
            if (m.is_active === false) return false;
            const matchesSearch = m.label.toLowerCase().includes(modelSearch.toLowerCase());
            const matchesCategory = modelCategory === 'All' || m.category === modelCategory;
            return matchesSearch && matchesCategory;
        });
    }, [modelSearch, modelCategory, availableModels]);

    const goNext = () => {
        if (currentStep === 'type' && !selectedType) {
            Alert.alert('Required', 'Please select a capsule type');
            return;
        }
        if (currentStep === 'content') {
            if (!title.trim() || !description.trim()) {
                Alert.alert('Required', 'Please enter a title and description');
                return;
            }
        }
        if (currentStep === 'schedule') {
            if (selectedType === 'instacap' && !selectedPreset && !showCustomSlider) {
                Alert.alert('Required', 'Please select a duration for your capsule');
                return;
            }
        }
        if (stepIndex < STEPS.length - 1) setCurrentStep(STEPS[stepIndex + 1]);
    };
    const goBack = () => { if (stepIndex > 0) setCurrentStep(STEPS[stepIndex - 1]); };

    const stepLabels = ['Type', 'Content', 'Schedule', 'Angel', 'Review'];

    // ── Compute final duration in days ────────────────────────────────────────
    const finalDays: number | null =
        selectedType === 'legacycap' ? 365 * 5 :
            selectedType === 'eventcap' ? null :
                showCustomSlider ? customDays :
                    selectedPreset;

    // ── Seal capsule → save to Supabase ───────────────────────────────────────
    const sealCapsule = async () => {
        if (sealing) return;

        // Final validation
        if (!title.trim() || !description.trim()) {
            Alert.alert('Required', 'Title and description are required.');
            return;
        }

        if (selectedType === 'instacap' && !selectedPreset && !showCustomSlider) {
            Alert.alert('Required', 'Please select an opening date.');
            return;
        }

        setSealing(true);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            Alert.alert('Error', 'You must be logged in to create a capsule.');
            setSealing(false);
            return;
        }
        if (!selectedType) {
            Alert.alert('Error', 'Please select a capsule type.');
            setSealing(false);
            return;
        }

        try {
            // Check legacy cap limit (1 per account)
            if (selectedType === 'legacycap') {
                const { count, error: countError } = await supabase
                    .from('capsules')
                    .select('*', { count: 'exact', head: true })
                    .eq('owner_id', user.id)
                    .eq('type', 'legacycap')
                    .eq('status', 'sealed');

                if (countError) throw countError;
                if (count && count >= 1) {
                    Alert.alert('Legacy Limit reached', 'You can only have one active Legacy Capsule at a time.');
                    setSealing(false);
                    return;
                }
            }

            // invitedUsers handling moved to capsule_invites table

            const opensAt = selectedType === 'eventcap' && isPioneersEventActive()
                ? PIONEERS_EVENT_END.toISOString()
                : finalDays ? new Date(Date.now() + finalDays * 86400000).toISOString() : null;
            const { data: newCapsule, error } = await supabase.from('capsules').insert({
                owner_id: user.id,
                type: selectedType,
                model: selectedModel,
                title: title || 'Untitled Capsule',
                description,
                event_code: eventCode || null,
                is_shared: isShared,
                invite_handle: invitedUsers.length > 0 ? invitedUsers[0].username : null,
                invited_user_id: invitedUsers.length > 0 ? invitedUsers[0].id : null,
                invite_status: invitedUsers.length > 0 ? 'pending' : 'none',
                cap_angel: capAngel,
                cap_angel_handle: capAngelHandle || null,
                duration_days: finalDays,
                opens_at: opensAt,
                is_public: isPublic,
                status: 'sealed',
                chain_id: selectedChainId || null,
            }).select().single();

            if (error) {
                setSealing(false);
                throw error;
            }

            if (invitedUsers.length > 0 && newCapsule) {
                const inviteData = invitedUsers.map(u => ({
                    capsule_id: newCapsule.id,
                    user_id: u.id,
                    status: 'pending'
                }));
                await supabase.from('capsule_invites').insert(inviteData);

                const notifs = invitedUsers.map(u => ({
                    user_id: u.id,
                    sender_id: user.id,
                    type: 'capsule_invite',
                    capsule_id: newCapsule.id,
                    message: 'invited you to a shared capsule',
                }));
                await supabase.from('notifications').insert(notifs);
            }

            // Animation sequence
            setIsAnimatingSeal(true);
            Animated.sequence([
                Animated.timing(dropAnim, { toValue: 50, duration: 600, easing: Easing.bounce, useNativeDriver: true }),
                Animated.parallel([
                    Animated.timing(dropAnim, { toValue: 120, duration: 200, useNativeDriver: true }),
                    Animated.sequence([
                        Animated.timing(capScaleAnim, { toValue: 1.15, duration: 150, useNativeDriver: true }),
                        Animated.timing(capScaleAnim, { toValue: 1, duration: 150, useNativeDriver: true })
                    ])
                ])
            ]).start(() => {
                setIsAnimatingSeal(false);
                dropAnim.setValue(-300);

                // reset
                setCurrentStep('type'); setSelectedType(null); setTitle(''); setDescription('');
                setSelectedModel('beach'); setSelectedPreset(null); setShowCustomSlider(false);
                setIsPublic(true); setCapAngel(false); setIsShared(false); setInvitedUsers([]);
                setModelSearch(''); setModelCategory('All');
                setSelectedChainId(null);
                setSealing(false);

                // Navigate to Profile
                navigation.navigate('Main', { screen: 'Profile' });
            });

        } catch (e: any) {
            Alert.alert('Error', e.message ?? 'Could not save capsule.');
            setSealing(false);
        }
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={Colors.surface} />
            {isAnimatingSeal && (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.95)', zIndex: 1000, alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ fontSize: 24, fontFamily: Fonts.bold, color: activeThemeColor, marginBottom: 40 }}>Sealing your memories...</Text>
                    <View style={{ width: 200, height: 200, alignItems: 'center' }}>
                        <Animated.View style={{ transform: [{ translateY: dropAnim }], zIndex: 2 }}>
                            <Ionicons name="sparkles" size={40} color={activeThemeColor} />
                        </Animated.View>
                        <Animated.View style={{ transform: [{ scale: capScaleAnim }], position: 'absolute', bottom: 0 }}>
                            <Image source={{ uri: activeModel.image }} style={{ width: 150, height: 150 }} resizeMode="contain" />
                        </Animated.View>
                    </View>
                </View>
            )}
            <SafeAreaView style={styles.safeArea}>
                {/* Header */}
                <View style={styles.header}>
                    {stepIndex > 0 ? (
                        <TouchableOpacity onPress={goBack} style={styles.headerBtn}>
                            <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.headerBtn} />
                    )}
                    <Text style={styles.headerTitle}>
                        {currentStep === 'type' && 'Choose Type'}
                        {currentStep === 'content' && 'Add Content'}
                        {currentStep === 'schedule' && 'Set Opening'}
                        {currentStep === 'review' && 'Review & Seal'}
                    </Text>
                    <View style={styles.headerBtn} />
                </View>

                {/* Step Indicator */}
                <View style={styles.stepIndicatorRow}>
                    {STEPS.map((step, i) => (
                        <React.Fragment key={step}>
                            <View style={styles.stepDotWrapper}>
                                <View style={[
                                    styles.stepDot,
                                    i < stepIndex ? { backgroundColor: activeThemeColor } :
                                        i === stepIndex ? { backgroundColor: activeThemeColor, borderWidth: 0 } :
                                            { backgroundColor: Colors.cardAlt, borderWidth: 1, borderColor: Colors.border },
                                ]}>
                                    {i < stepIndex
                                        ? <Ionicons name="checkmark" size={10} color="#fff" />
                                        : <Text style={[styles.stepNum, { color: i <= stepIndex ? '#fff' : Colors.textMuted }]}>{i + 1}</Text>
                                    }
                                </View>
                                <Text style={[styles.stepLabel, { color: i === stepIndex ? activeThemeColor : Colors.textMuted }]}>
                                    {stepLabels[i]}
                                </Text>
                            </View>
                            {i < STEPS.length - 1 && (
                                <View style={[styles.stepLine, { backgroundColor: i < stepIndex ? activeThemeColor : Colors.border }]} />
                            )}
                        </React.Fragment>
                    ))}
                </View>

                {/* Persistent Preview */}
                <View style={[styles.persistentPreview, { borderColor: activeThemeColor + '33', backgroundColor: activeThemeColor + '08' }]}>
                    <View style={styles.previewImgContainer}>
                        <CapsuleWithTimer
                            modelKey={selectedType === 'eventcap' && isPioneersEventActive() ? 'pioneerscap' : selectedModel}
                            source={{ uri: selectedType === 'eventcap' && isPioneersEventActive() ? 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/pioneerscap.png' : activeModel.image }}
                            date={finalDays ? addDays(finalDays).toISOString() : new Date().toISOString()}
                            chainId={selectedChainId}
                            capsuleType={selectedType || undefined}
                            style={styles.previewImgSmall}
                            hideTimer={true}
                        />
                    </View>
                    <View style={styles.previewTextContainer}>
                        <Text style={styles.previewTitleText} numberOfLines={1}>{title || 'My Capsule'}</Text>
                        <Text style={[styles.previewSubText, { color: activeThemeColor }]}>{activeCfg?.title || 'No Type Selected'}</Text>
                    </View>
                </View>

            </SafeAreaView>

            <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

                {/* ═══ STEP 1: TYPE ══════════════════════════════════════════ */}
                {currentStep === 'type' && (
                    <View style={styles.step}>
                        <Text style={styles.stepTitle}>What are you sealing?</Text>
                        <Text style={styles.stepSub}>Each capsule type has a different soul</Text>

                        {capsuleTypes.map((type) => {
                            const isActive = selectedType === type.id;
                            return (
                                <Pressable
                                    key={type.id}
                                    onPress={() => {
                                        if (type.disabled) {
                                            if (isPioneersEventActive()) {
                                                // Should not happen, but handle gracefully
                                                return;
                                            } else {
                                                Alert.alert(
                                                    'Event Ended',
                                                    'The Pioneers event has concluded. EventCaps are no longer available for creation.'
                                                );
                                            }
                                            return;
                                        }
                                        if (type.id === 'legacycap' && hasLegacyCap) {
                                            Alert.alert('Limit Reached', 'You can only have one active Legacy Capsule at a time.');
                                            return;
                                        }
                                        setSelectedType(type.id);
                                        // Auto-assign Pioneers model for EventCap
                                        if (type.id === 'eventcap' && isPioneersEventActive()) {
                                            setSelectedModel(PIONEERS_MODEL);
                                        }
                                    }}
                                    style={[
                                        styles.typeCard,
                                        isActive ? { borderColor: type.color, backgroundColor: type.bgColor } : {},
                                        (type.id === 'legacycap' && hasLegacyCap) || type.disabled ? { opacity: 0.5 } : { opacity: 1 }
                                    ]}
                                >
                                    <View style={styles.typeCardTop}>
                                        <View style={[styles.typeCardIconBg, { backgroundColor: type.color + '20' }]}>
                                            <Ionicons name={type.icon as any} size={26} color={type.color} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <View style={styles.typeCardTitleRow}>
                                                <Text style={[styles.typeCardTitle, isActive && { color: type.color }]}>{type.title}</Text>
                                                <View style={[styles.limitBadge, { backgroundColor: type.color + '18', borderColor: type.color + '44' }]}>
                                                    <Text style={[styles.limitBadgeText, { color: type.color }]}>{type.limit}</Text>
                                                </View>
                                            </View>
                                            <Text style={styles.typeCardTagline}>{type.tagline}</Text>
                                        </View>
                                        {isActive && (
                                            <View style={[styles.checkCircle, { backgroundColor: type.color }]}>
                                                <Ionicons name="checkmark" size={14} color="#fff" />
                                            </View>
                                        )}
                                    </View>
                                    <Text style={styles.typeCardDesc}>{type.description}</Text>
                                    <View style={styles.rulesList}>
                                        {type.rules.map((rule, ri) => (
                                            <View key={ri} style={styles.ruleRow}>
                                                <View style={[styles.ruleIconBg, { backgroundColor: type.color + '15' }]}>
                                                    <Ionicons name={rule.icon as any} size={12} color={type.color} />
                                                </View>
                                                <Text style={styles.ruleText}>{rule.text}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </Pressable>
                            );
                        })}

                        {/* Pioneers Event Active Banner */}
                        {isPioneersEventActive() && (
                            <View style={styles.pioneersEventBanner}>
                                <LinearGradient
                                    colors={['#f5a623', '#e8472f']}
                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                    style={styles.pioneersGradient}
                                >
                                    <Ionicons name="rocket" size={18} color="#fff" />
                                    <View style={{ flex: 1, marginLeft: 10 }}>
                                        <Text style={styles.pioneersTitle}>🚀 Pioneers Event — Active</Text>
                                        <Text style={styles.pioneersSubtitle}>Create an EventCap now and get the limited-edition <Text style={{ fontFamily: 'bold' }}>Pioneers</Text> model, exclusive to this 3-month window.</Text>
                                    </View>
                                </LinearGradient>
                            </View>
                        )}

                        {/* Capsule Model Picker — locked if EventCap selected during event */}
                        {selectedType === 'eventcap' && isPioneersEventActive() ? (
                            <View style={styles.pioneersModelLock}>
                                <Text style={styles.modelPickerTitle}>🏆 Exclusive Event Model</Text>
                                <Text style={styles.modelPickerSub}>Your EventCap receives the Pioneers limited-edition model automatically</Text>
                                <View style={styles.pioneersModelPreview}>
                                    <Image
                                        source={{ uri: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/pioneerscap.png' }}
                                        style={{ width: 120, height: 120 }}
                                        resizeMode="contain"
                                    />
                                    <View style={styles.pioneersModelInfo}>
                                        <View style={styles.exclusiveBadge}>
                                            <Ionicons name="star" size={10} color="#f5a623" />
                                            <Text style={styles.exclusiveBadgeText}>LIMITED EDITION</Text>
                                        </View>
                                        <Text style={styles.pioneersModelName}>Pioneers Cap</Text>
                                        <Text style={styles.pioneersModelDesc}>Only available until Jun 4, 2026. Forever yours once created.</Text>
                                    </View>
                                </View>
                            </View>
                        ) : (
                            <>
                                {/* Capsule Model Picker */}
                                <Text style={styles.modelPickerTitle}>Capsule Model</Text>
                                <Text style={styles.modelPickerSub}>Choose the look of your capsule</Text>
                                <View style={styles.modelSearchContainer}>
                                    <View style={styles.modelSearchInputWrapper}>
                                        <Ionicons name="search" size={18} color={Colors.textMuted} />
                                        <TextInput
                                            placeholder="Search models..."
                                            placeholderTextColor={Colors.textMuted}
                                            style={styles.modelSearchInput}
                                            value={modelSearch}
                                            onChangeText={setModelSearch}
                                        />
                                        {modelSearch.length > 0 && (
                                            <TouchableOpacity onPress={() => setModelSearch('')}>
                                                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                                            </TouchableOpacity>
                                        )}
                                    </View>

                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catRow} contentContainerStyle={styles.catContent}>
                                        {availableCategories.map(cat => (
                                            <TouchableOpacity
                                                key={cat}
                                                onPress={() => setModelCategory(cat)}
                                                style={[
                                                    styles.catPill,
                                                    modelCategory === cat && { backgroundColor: activeThemeColor }
                                                ]}
                                            >
                                                <Text style={[
                                                    styles.catPillText,
                                                    modelCategory === cat && { color: '#fff' }
                                                ]}>
                                                    {cat}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                </View>

                                <View style={styles.modelGrid}>
                                    {filteredModels.map((model) => (
                                        <MemoizedModelCard
                                            key={model.id}
                                            model={model}
                                            isActive={selectedModel === model.id}
                                            onSelect={() => setSelectedModel(model.id)}
                                        />
                                    ))}
                                    {filteredModels.length === 0 && (
                                        <View style={styles.emptyResults}>
                                            <Ionicons name="search-outline" size={32} color={Colors.border} />
                                            <Text style={styles.emptyResultsText}>No models found</Text>
                                        </View>
                                    )}
                                </View>

                                {/* Chain Picker — hidden for EventCap */}
                                {selectedType !== 'eventcap' && (
                                    <>
                                        <Text style={styles.modelPickerTitle}>Add a Chain (Pendant)</Text>
                                        <Text style={styles.modelPickerSub}>Customize your capsule with a unique charm</Text>

                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chainList}>
                                            <TouchableOpacity
                                                style={[styles.chainCard, !selectedChainId && styles.activeChainCard]}
                                                onPress={() => setSelectedChainId(null)}
                                            >
                                                <View style={[styles.chainIconBg, !selectedChainId && { borderColor: activeThemeColor }]}>
                                                    <Ionicons name="close" size={24} color={Colors.textMuted} />
                                                </View>
                                                <Text style={[styles.chainLabel, !selectedChainId && { color: activeThemeColor }]}>None</Text>
                                            </TouchableOpacity>
                                            {timerConfigManager.getChainLibrary().map(chain => (
                                                <TouchableOpacity
                                                    key={chain.id}
                                                    style={[styles.chainCard, selectedChainId === chain.id && styles.activeChainCard]}
                                                    onPress={() => setSelectedChainId(chain.id)}
                                                >
                                                    <View style={[styles.chainIconBg, selectedChainId === chain.id && { borderColor: activeThemeColor }]}>
                                                        <Image source={{ uri: chain.thumbnail_url || chain.image_url }} style={styles.chainImg} resizeMode="cover" />
                                                    </View>
                                                    <Text style={[styles.chainLabel, selectedChainId === chain.id && { color: activeThemeColor }]} numberOfLines={1}>{chain.name}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </ScrollView>
                                    </>
                                )}

                            </>
                        )}

                    </View>
                )}

                {/* ═══ STEP 2: CONTENT ══════════════════════════════════════ */}
                {currentStep === 'content' && (
                    <View style={styles.step}>
                        <Text style={styles.stepTitle}>Add your content</Text>
                        <Text style={styles.stepSub}>What do you want to seal inside?</Text>

                        {/* EventCap: access code */}
                        {selectedType === 'eventcap' && (
                            <>
                                <View style={[styles.infoBox, { borderColor: Colors.eventCap + '33', backgroundColor: Colors.eventCapLight }]}>
                                    <Ionicons name="qr-code" size={20} color={Colors.eventCap} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.infoBoxTitle, { color: Colors.eventCap }]}>Event Verification Required</Text>
                                        <Text style={styles.infoBoxText}>Enter your event QR code or access code to link to a verified event</Text>
                                    </View>
                                </View>
                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>Event Access Code</Text>
                                    <TextInput
                                        style={[styles.textInput, { borderColor: Colors.eventCap + '55' }]}
                                        placeholder="e.g. COACHELLA-2026-XXXX"
                                        placeholderTextColor={Colors.textMuted}
                                        value={eventCode} onChangeText={setEventCode}
                                    />
                                </View>
                            </>
                        )}

                        {selectedType === 'instacap' && (
                            <View style={styles.toggleRow}>
                                <View style={styles.toggleInfo}>
                                    <View style={[styles.typeIconSmall, { backgroundColor: Colors.instaCap + '15' }]}>
                                        <Ionicons name="people" size={18} color={Colors.instaCap} />
                                    </View>
                                    <View>
                                        <Text style={styles.toggleLabel}>Shared Capsule</Text>
                                        <Text style={styles.toggleSub}>Invite up to 9 friends ({invitedUsers.length}/9)</Text>
                                    </View>
                                </View>
                                <Switch value={isShared} onValueChange={setIsShared}
                                    trackColor={{ false: Colors.border, true: Colors.instaCap + '66' }}
                                    thumbColor={isShared ? Colors.instaCap : Colors.textMuted} />
                            </View>
                        )}

                        {selectedType === 'instacap' && isShared && (
                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>Participants</Text>

                                {/* Selected users tags */}
                                {invitedUsers.length > 0 && (
                                    <View style={styles.memberTagsList}>
                                        {invitedUsers.map(u => (
                                            <View key={u.id} style={styles.memberTag}>
                                                <Image source={{ uri: u.avatar_url }} style={styles.tagAvatar} />
                                                <Text style={styles.tagName}>{u.username}</Text>
                                                <TouchableOpacity onPress={() => toggleInviteUser(u)}>
                                                    <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                                                </TouchableOpacity>
                                            </View>
                                        ))}
                                    </View>
                                )}

                                <View style={styles.searchBarWrapper}>
                                    <Ionicons name="search" size={20} color={Colors.textMuted} />
                                    <TextInput
                                        style={styles.searchBarInput}
                                        placeholder="Search by username..."
                                        placeholderTextColor={Colors.textMuted}
                                        value={userSearchQuery}
                                        onChangeText={setUserSearchQuery}
                                        autoCapitalize="none"
                                    />
                                    {searchingUsers && <ActivityIndicator size="small" color={Colors.primary} />}
                                </View>

                                {userSearchResults.length > 0 && (
                                    <View style={styles.searchResults}>
                                        {userSearchResults.filter(u => !invitedUsers.some(iu => iu.id === u.id)).map(user => (
                                            <TouchableOpacity
                                                key={user.id}
                                                style={styles.searchResultItem}
                                                onPress={() => toggleInviteUser(user)}
                                            >
                                                <Image source={{ uri: user.avatar_url }} style={styles.resultAvatar} />
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.resultName}>{user.display_name}</Text>
                                                    <Text style={styles.resultUsername}>@{user.username}</Text>
                                                </View>
                                                <Ionicons name="add-circle-outline" size={24} color={Colors.primary} />
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )}

                                <Text style={styles.helperText}>Invite other players to add memories together</Text>
                            </View>
                        )}

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Capsule Title</Text>
                            <TextInput style={styles.textInput} placeholder="Name your capsule..."
                                placeholderTextColor={Colors.textMuted}
                                value={title} onChangeText={setTitle} />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Message</Text>
                            <TextInput style={[styles.textInput, styles.textArea]}
                                placeholder="Write a message to your future self or someone special..."
                                placeholderTextColor={Colors.textMuted}
                                value={description} onChangeText={setDescription}
                                multiline numberOfLines={4}
                                selectionColor={activeThemeColor} />
                        </View>

                        {/* Visibility */}
                        <View style={styles.toggleRow}>
                            <View style={styles.toggleInfo}>
                                <Ionicons name={isPublic ? 'globe-outline' : 'lock-closed-outline'} size={18} color={activeThemeColor} />
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.toggleLabel}>{isPublic ? 'Public Capsule' : 'Private Capsule'}</Text>
                                    <Text style={styles.toggleSub}>
                                        {isPublic ? 'Appears in feed & public profile' : 'Only visible to you in your private feed'}
                                    </Text>
                                </View>
                            </View>
                            <Switch value={isPublic} onValueChange={setIsPublic}
                                trackColor={{ false: Colors.border, true: activeThemeColor + '66' }}
                                thumbColor={isPublic ? activeThemeColor : Colors.textMuted} />
                        </View>
                    </View>
                )}

                {/* ═══ STEP 3: SCHEDULE ══════════════════════════════════════ */}
                {currentStep === 'schedule' && (
                    <View style={styles.step}>
                        <Text style={styles.stepTitle}>When does it open?</Text>
                        <Text style={styles.stepSub}>
                            {selectedType === 'legacycap'
                                ? 'LegacyCaps open automatically after 5 years'
                                : selectedType === 'eventcap'
                                    ? 'EventCaps open simultaneously with all attendees'
                                    : 'Choose when your capsule unlocks'}
                        </Text>

                        {/* LegacyCap fixed */}
                        {selectedType === 'legacycap' && (
                            <View style={[styles.fixedDateCard, { borderColor: Colors.legacyCap + '44', backgroundColor: Colors.legacyCapLight }]}>
                                <Image source={{ uri: activeModel.image }} style={{ width: 40, height: 54 }} resizeMode="contain" />
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.fixedDateLabel, { color: Colors.legacyCap }]}>Fixed Opening: 5 Years</Text>
                                    <Text style={styles.fixedDateSub}>
                                        Opens on {addDays(365 * 5).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                                    </Text>
                                </View>
                            </View>
                        )}

                        {/* EventCap fixed */}
                        {selectedType === 'eventcap' && (
                            <View style={[styles.fixedDateCard, { borderColor: Colors.eventCap + '44', backgroundColor: Colors.eventCapLight }]}>
                                <Ionicons name="earth" size={28} color={Colors.eventCap} />
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.fixedDateLabel, { color: Colors.eventCap }]}>Event-Synchronized Opening</Text>
                                    <Text style={styles.fixedDateSub}>Opens simultaneously with all verified attendees when the event ends</Text>
                                </View>
                            </View>
                        )}

                        {/* InstaCap duration presets */}
                        {selectedType === 'instacap' && (
                            <>
                                <View style={styles.presetGrid}>
                                    {DURATION_PRESETS.map((p) => {
                                        const isCustom = p.days === -1;
                                        const isActive = isCustom ? showCustomSlider : (!showCustomSlider && selectedPreset === p.days);
                                        return (
                                            <TouchableOpacity
                                                key={p.label}
                                                activeOpacity={0.8}
                                                onPress={() => {
                                                    if (isCustom) {
                                                        setShowCustomSlider(true);
                                                        setSelectedPreset(null);
                                                    } else {
                                                        setShowCustomSlider(false);
                                                        setSelectedPreset(p.days);
                                                    }
                                                }}
                                                style={[styles.presetCard, isActive && { borderColor: Colors.instaCap, backgroundColor: Colors.instaCapLight }]}
                                            >
                                                <Text style={styles.presetEmoji}>{p.emoji}</Text>
                                                <Text style={[styles.presetLabel, isActive && { color: Colors.instaCap }]}>{p.label}</Text>
                                                {isActive && (
                                                    <View style={[styles.presetCheck, { backgroundColor: Colors.instaCap }]}>
                                                        <Ionicons name="checkmark" size={10} color="#fff" />
                                                    </View>
                                                )}
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>

                                {/* Custom slider */}
                                {showCustomSlider && (
                                    <View style={[styles.customSliderCard, { borderColor: Colors.instaCap + '44' }]}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                            <Ionicons name="time-outline" size={18} color={Colors.instaCap} />
                                            <Text style={[styles.selectedDateLabel, { flex: 1 }]}>Custom duration</Text>
                                            <Text style={[styles.selectedDateValue, { color: Colors.instaCap }]}>{daysToLabel(customDays)}</Text>
                                        </View>
                                        <DurationSlider days={customDays} onChange={setCustomDays} color={Colors.instaCap} />
                                    </View>
                                )}

                                {/* Selected date preview */}
                                {(selectedPreset || showCustomSlider) && (
                                    <View style={[styles.selectedDateCard, { borderColor: Colors.instaCap + '44' }]}>
                                        <Ionicons name="calendar-outline" size={20} color={Colors.instaCap} />
                                        <View>
                                            <Text style={styles.selectedDateLabel}>Opening date</Text>
                                            <Text style={[styles.selectedDateValue, { color: Colors.instaCap }]}>
                                                {addDays(showCustomSlider ? customDays : selectedPreset!).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                                            </Text>
                                        </View>
                                    </View>
                                )}
                            </>
                        )}
                    </View>
                )}



                {/* ═══ STEP 4: CAPANGEL ═════════════════════════════════════ */}
                {currentStep === 'capangel' && (
                    <View style={styles.step}>
                        <Text style={styles.stepTitle}>Assign a CapAngel?</Text>
                        <Text style={styles.stepSub}>Someone who will watch over your capsule</Text>

                        <TouchableOpacity
                            style={[styles.toggleRow, capAngel && { borderColor: activeCfg?.color ?? Colors.primary, backgroundColor: (activeCfg?.color ?? Colors.primary) + '08' }]}
                            onPress={() => setCapAngel(!capAngel)}
                        >
                            <View style={styles.toggleInfo}>
                                <Ionicons name="sparkles-outline" size={24} color={capAngel ? activeThemeColor : Colors.textMuted} />
                                <View>
                                    <Text style={styles.toggleLabel}>Enable CapAngel</Text>
                                    <Text style={styles.toggleSub}>Specify a guardian for this capsule</Text>
                                </View>
                            </View>
                            <Switch
                                value={capAngel}
                                onValueChange={setCapAngel}
                                trackColor={{ false: Colors.border, true: activeThemeColor + '66' }}
                                thumbColor={capAngel ? activeThemeColor : Colors.textMuted}
                            />
                        </TouchableOpacity>

                        {capAngel && (
                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>Angel's Handle</Text>
                                <TextInput
                                    style={styles.textInput}
                                    placeholder="@angel_username"
                                    placeholderTextColor={Colors.textMuted}
                                    value={capAngelHandle}
                                    onChangeText={setCapAngelHandle}
                                />
                                <Text style={styles.helperText}>Your CapAngel will be notified and can help manage this capsule</Text>
                            </View>
                        )}

                        <View style={[styles.infoBox, { marginTop: 20 }]}>
                            <Ionicons name="information-circle-outline" size={20} color={Colors.textMuted} />
                            <Text style={styles.infoBoxText}>
                                A CapAngel is a trusted contact who ensures your capsule's legacy is preserved.
                            </Text>
                        </View>
                    </View>
                )}



                {/* ═══ STEP 5: REVIEW ══════════════════════════════════════ */}
                {currentStep === 'review' && (
                    <View style={styles.step}>
                        <Text style={styles.stepTitle}>Ready to seal?</Text>
                        <Text style={styles.stepSub}>One last look before we lock it away</Text>

                        {/* Capsule model preview - Clean PNG Hero */}
                        <View style={styles.reviewHero}>
                            <View style={styles.modelContainerLarge}>
                                <CapsuleWithTimer
                                    modelKey={selectedType === 'eventcap' && isPioneersEventActive() ? 'pioneerscap' : selectedModel}
                                    source={{ uri: selectedType === 'eventcap' && isPioneersEventActive() ? 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/pioneerscap.png' : activeModel.image }}
                                    date={new Date(Date.now() + 1000 * 3600 * 73).toISOString()}
                                    chainId={selectedChainId}
                                    capsuleType={selectedType || undefined}
                                    style={styles.reviewHeroImg}
                                />
                                <View style={[styles.cornerTypeIconLarge, { backgroundColor: activeThemeColor }]}>
                                    <Ionicons name={activeCfg?.icon as any} size={14} color="#fff" />
                                </View>
                            </View>

                            <View style={[styles.reviewTypeBadge, { backgroundColor: activeThemeColor + '18', borderColor: activeThemeColor + '44', marginTop: 10 }]}>
                                <Text style={[styles.reviewTypeBadgeText, { color: activeThemeColor }]}>{activeCfg?.title ?? 'Capsule'}</Text>
                            </View>
                            <Text style={styles.reviewTitle}>{title || 'Untitled Capsule'}</Text>
                        </View>

                        {/* Checklist */}
                        {[
                            { label: 'Type', value: activeCfg?.title ?? '—', done: !!selectedType },
                            { label: 'Title', value: title || 'Not set', done: title.length > 0 },
                            { label: 'Duration', value: selectedType === 'legacycap' ? '5 years' : selectedType === 'eventcap' ? 'Event sync' : finalDays ? daysToLabel(finalDays) : 'Not set', done: !!finalDays || selectedType !== 'instacap' },
                            { label: 'Model', value: activeModel.label, done: true },
                            { label: 'CapAngel', value: capAngel ? (capAngelHandle || 'Set') : 'Skipped', done: capAngel },
                        ].map((item, i) => (
                            <View key={i} style={styles.reviewRow}>
                                <View style={[styles.reviewCheck,
                                item.done ? { backgroundColor: Colors.success + '18', borderColor: Colors.success + '55' } :
                                    { backgroundColor: Colors.cardAlt, borderColor: Colors.border }]}>
                                    <Ionicons name={item.done ? 'checkmark' : 'remove'} size={12} color={item.done ? Colors.success : Colors.textMuted} />
                                </View>
                                <Text style={styles.reviewRowLabel}>{item.label}</Text>
                                <Text style={[styles.reviewRowValue, !item.done && { color: Colors.textMuted }]}>{item.value}</Text>
                            </View>
                        ))}

                        {selectedType === 'legacycap' && (
                            <View style={[styles.warningBox, { borderColor: Colors.legacyCap + '44', backgroundColor: Colors.legacyCapLight }]}>
                                <Ionicons name="warning" size={18} color={Colors.legacyCap} />
                                <Text style={[styles.warningText, { color: Colors.legacyCap + 'cc' }]}>
                                    <Text style={{ fontFamily: Fonts.semiBold, color: Colors.legacyCap }}>LegacyCap Warning: </Text>
                                    Once sealed, this capsule cannot be modified. It will open in exactly 5 years.
                                </Text>
                            </View>
                        )}
                    </View>
                )}

                {/* ── CTA inside ScrollView ────────────────────────────────── */}
                <View style={styles.ctaContainer}>
                    <Pressable
                        disabled={sealing}
                        onPress={() => {
                            if (sealing) return;
                            if (currentStep === 'type' && !selectedType) return;
                            if (currentStep === 'review') { sealCapsule(); return; }
                            goNext();
                        }}
                        style={[
                            styles.ctaBtn,
                            { backgroundColor: selectedType ? activeThemeColor : Colors.textMuted },
                            (sealing || (!selectedType && currentStep === 'type')) && { opacity: 0.5 },
                        ]}
                    >
                        {sealing ? (
                            <ActivityIndicator color="#fff" size="small" />
                        ) : currentStep === 'review' ? (
                            <><Ionicons name="lock-closed" size={18} color="#fff" /><Text style={styles.ctaText}>Seal Capsule</Text></>
                        ) : (
                            <Text style={styles.ctaText}>Next →</Text>
                        )}
                    </Pressable>

                </View>

            </ScrollView>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    safeArea: { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: Spacing.md, paddingTop: 50, paddingBottom: 12,
    },
    headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { color: Colors.textPrimary, fontSize: 16, fontFamily: Fonts.semiBold },

    stepIndicatorRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, paddingTop: 4,
    },
    stepDotWrapper: { alignItems: 'center', gap: 3 },
    stepDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    stepNum: { fontSize: 10, fontFamily: Fonts.bold },
    stepLabel: { fontSize: 8, fontFamily: Fonts.semiBold, letterSpacing: 0.3 },
    stepLine: { flex: 1, height: 2, marginHorizontal: 2, marginBottom: 14, borderRadius: 1 },

    persistentPreview: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
        marginHorizontal: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: 14,
        borderRadius: BorderRadius.lg, borderWidth: 1, marginBottom: Spacing.md,
        ...Shadow.subtle,
    },
    previewImgContainer: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
    previewImgSmall: { width: 64, height: 64 },
    previewTextContainer: { flex: 1 },
    previewTitleText: { fontSize: 16, fontFamily: Fonts.bold, color: Colors.textPrimary },
    previewSubText: { fontSize: 13, fontFamily: Fonts.semiBold, marginTop: 4 },

    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 110 },
    step: { padding: Spacing.md },
    stepTitle: { color: Colors.textPrimary, fontSize: 22, fontFamily: Fonts.bold, marginBottom: 4 },
    stepSub: { color: Colors.textMuted, fontSize: 13, fontFamily: Fonts.regular, marginBottom: Spacing.lg },

    // Type cards
    typeCard: {
        backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
        borderWidth: 1.5, borderColor: Colors.border,
        padding: Spacing.md, marginBottom: Spacing.md, ...Shadow.subtle,
    },
    typeCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: 8 },
    typeCardIconBg: { width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    typeCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    typeCardTitle: { color: Colors.textPrimary, fontSize: 17, fontFamily: Fonts.bold },
    limitBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: BorderRadius.full, borderWidth: 1 },
    limitBadgeText: { fontSize: 10, fontFamily: Fonts.semiBold },
    typeCardTagline: { color: Colors.textMuted, fontSize: 11, fontFamily: Fonts.medium, marginTop: 2 },
    checkCircle: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    typeCardDesc: { color: Colors.textSecondary, fontSize: 13, fontFamily: Fonts.regular, lineHeight: 18, marginBottom: 12 },
    rulesList: { gap: 7 },
    ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    ruleIconBg: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    ruleText: { color: Colors.textSecondary, fontSize: 12, fontFamily: Fonts.regular, flex: 1 },

    // Model picker
    modelPickerTitle: { color: Colors.textPrimary, fontSize: 16, fontFamily: Fonts.bold, marginTop: Spacing.lg, marginBottom: 4 },
    modelPickerSub: { color: Colors.textMuted, fontSize: 12, fontFamily: Fonts.regular, marginBottom: Spacing.md },
    modelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    modelCard: {
        width: (width - Spacing.md * 2 - Spacing.sm * 2) / 3,
        backgroundColor: '#fff', borderRadius: BorderRadius.md,
        borderWidth: 1.5, borderColor: Colors.border,
        paddingTop: Spacing.sm, paddingBottom: Spacing.sm / 2, paddingHorizontal: Spacing.sm,
        alignItems: 'center', gap: 4,
        position: 'relative', ...Shadow.subtle,
    },
    modelImage: { width: 90, height: 120 },
    modelLabel: { color: Colors.textSecondary, fontSize: 11, fontFamily: Fonts.semiBold },
    modelCheck: {
        position: 'absolute', top: 6, right: 6,
        width: 16, height: 16, borderRadius: 8,
        alignItems: 'center', justifyContent: 'center',
    },

    modelSearchContainer: { marginBottom: Spacing.md },
    modelSearchInputWrapper: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: '#fff', borderRadius: BorderRadius.md,
        paddingHorizontal: 15, paddingVertical: 10,
        borderWidth: 1.5, borderColor: Colors.border,
        marginBottom: 10, ...Shadow.subtle
    },
    modelSearchInput: { flex: 1, color: Colors.textPrimary, fontSize: 14, height: 24, padding: 0 },
    catRow: { marginHorizontal: -Spacing.md },
    catContent: { paddingHorizontal: Spacing.md, gap: 8, paddingBottom: 5 },
    catPill: {
        paddingHorizontal: 15, paddingVertical: 7,
        borderRadius: BorderRadius.full, backgroundColor: Colors.cardAlt,
        borderWidth: 1, borderColor: Colors.border
    },
    catPillText: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textSecondary },
    emptyResults: { width: '100%', alignItems: 'center', paddingVertical: 40, gap: 10 },
    emptyResultsText: { fontSize: 14, color: Colors.textMuted, fontFamily: Fonts.medium },

    // Content
    infoBox: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 10,
        padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1, marginBottom: Spacing.md,
    },
    infoBoxTitle: { fontSize: 13, fontFamily: Fonts.semiBold, marginBottom: 3 },
    infoBoxText: { color: Colors.textSecondary, fontSize: 12, fontFamily: Fonts.regular, lineHeight: 16 },
    toggleRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: BorderRadius.md,
        borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md, ...Shadow.subtle,
    },
    toggleInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    toggleLabel: { color: Colors.textPrimary, fontSize: 14, fontFamily: Fonts.semiBold },
    toggleSub: { color: Colors.textMuted, fontSize: 11, fontFamily: Fonts.regular, marginTop: 2 },
    inputGroup: { marginBottom: Spacing.md },
    inputLabel: { color: Colors.textSecondary, fontSize: 12, fontFamily: Fonts.semiBold, letterSpacing: 0.5, marginBottom: 8 },
    textInput: {
        backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border,
        borderRadius: BorderRadius.md, padding: Spacing.md,
        color: Colors.textPrimary, fontSize: 14, fontFamily: Fonts.regular, ...Shadow.subtle,
    },
    textArea: { minHeight: 100, textAlignVertical: 'top' },
    helperText: { color: Colors.textMuted, fontSize: 11, fontFamily: Fonts.regular, marginTop: 5 },

    // Member selection
    typeIconSmall: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    memberTagsList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    memberTag: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: Colors.cardAlt, paddingHorizontal: 8, paddingVertical: 4,
        borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border
    },
    tagAvatar: { width: 18, height: 18, borderRadius: 9 },
    tagName: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textPrimary },
    searchBarWrapper: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border,
        borderRadius: BorderRadius.md, paddingHorizontal: 12, height: 48, ...Shadow.subtle
    },
    searchBarInput: { flex: 1, fontSize: 14, fontFamily: Fonts.regular, color: Colors.textPrimary },
    searchResults: {
        backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
        borderWidth: 1, borderColor: Colors.border, marginTop: 8,
        maxHeight: 200, overflow: 'hidden', ...Shadow.lg
    },
    searchResultItem: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.divider
    },
    resultAvatar: { width: 40, height: 40, borderRadius: 20 },
    resultName: { fontSize: 14, fontFamily: Fonts.bold, color: Colors.textPrimary },
    resultUsername: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.textMuted },

    // Schedule
    fixedDateCard: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
        padding: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1.5, marginBottom: Spacing.md,
    },
    fixedDateLabel: { fontSize: 14, fontFamily: Fonts.semiBold, marginBottom: 4 },
    fixedDateSub: { color: Colors.textSecondary, fontSize: 12, fontFamily: Fonts.regular, lineHeight: 16 },
    presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
    presetCard: {
        width: (width - Spacing.md * 2 - Spacing.sm * 2) / 3,
        backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
        borderWidth: 1.5, borderColor: Colors.border,
        padding: Spacing.sm + 2, alignItems: 'center', gap: 2,
        position: 'relative', ...Shadow.subtle,
    },
    presetEmoji: { fontSize: 20 },
    presetLabel: { color: Colors.textPrimary, fontSize: 13, fontFamily: Fonts.semiBold },
    presetCheck: {
        position: 'absolute', top: 5, right: 5, width: 16, height: 16,
        borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    },
    customSliderCard: {
        borderRadius: BorderRadius.md, borderWidth: 1,
        backgroundColor: Colors.surface, padding: Spacing.md,
        marginBottom: Spacing.md, ...Shadow.subtle,
    },
    selectedDateCard: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
        padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1,
        backgroundColor: Colors.surface, marginBottom: Spacing.md, ...Shadow.subtle,
    },
    selectedDateLabel: { color: Colors.textMuted, fontSize: 11, fontFamily: Fonts.regular },
    selectedDateValue: { fontSize: 15, fontFamily: Fonts.semiBold },

    // Slider
    sliderWrapper: { paddingHorizontal: 12, paddingTop: 4 },
    sliderTrack: {
        height: 6, backgroundColor: Colors.border, borderRadius: 3,
        position: 'relative', marginBottom: 14,
    },
    sliderFill: { position: 'absolute', left: 0, top: 0, height: 6, borderRadius: 3 },
    sliderThumb: {
        position: 'absolute', top: -7, width: 20, height: 20,
        borderRadius: 10, backgroundColor: Colors.surface,
        borderWidth: 2.5, ...Shadow.primary,
    },
    sliderLabels: { flexDirection: 'row', justifyContent: 'space-between' },
    sliderLabelText: { fontSize: 10, fontFamily: Fonts.regular, color: Colors.textMuted },

    // CapAngel
    capAngelHero: { borderRadius: BorderRadius.lg, padding: Spacing.lg, alignItems: 'center', gap: 8, marginBottom: Spacing.md },
    capAngelIconRing: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.primary + '18', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.primary + '33' },
    capAngelTitle: { color: Colors.textPrimary, fontSize: 18, fontFamily: Fonts.bold },
    capAngelSub: { color: Colors.textMuted, fontSize: 12, fontFamily: Fonts.medium },
    capAngelDesc: { color: Colors.textSecondary, fontSize: 13, fontFamily: Fonts.regular, lineHeight: 20, textAlign: 'center' },
    sectionHeaderText: { color: Colors.textSecondary, fontSize: 12, fontFamily: Fonts.semiBold, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
    howItWorksRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
    howItWorksIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    howItWorksText: { color: Colors.textSecondary, fontSize: 13, fontFamily: Fonts.regular, flex: 1, lineHeight: 18 },
    capAngelToggleCard: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: BorderRadius.md,
        borderWidth: 1, borderColor: Colors.border, marginTop: 4, marginBottom: Spacing.md, ...Shadow.subtle,
    },
    capAngelIconSm: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    skipNote: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 8,
        padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1, backgroundColor: Colors.cardAlt,
    },
    skipNoteText: { color: Colors.textMuted, fontSize: 12, fontFamily: Fonts.regular, flex: 1, lineHeight: 17 },

    // Review
    reviewHero: { alignItems: 'center', marginVertical: Spacing.lg },
    reviewHeroImg: { width: 180, height: 180 },
    modelContainerLarge: { position: 'relative', width: 220, height: 220, alignItems: 'center', justifyContent: 'center' },
    cornerTypeIconLarge: {
        position: 'absolute', top: 20, right: 20,
        width: 28, height: 28, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center', ...Shadow.subtle, zIndex: 10,
    },
    modelTimerOverlayLarge: {
        position: 'absolute', top: '53%', alignSelf: 'center',
    },
    modelTimerTextLarge: { color: '#fff', fontSize: 24, fontWeight: '800', fontFamily: 'monospace' },
    reviewTypeBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: BorderRadius.full, borderWidth: 1 },
    reviewTypeBadgeText: { fontSize: 10, fontFamily: Fonts.semiBold },
    reviewTitle: { fontSize: 22, fontFamily: Fonts.bold, color: Colors.textPrimary, marginTop: 10, textAlign: 'center' },
    reviewMeta: { color: Colors.textSecondary, fontSize: 12, fontFamily: Fonts.regular },
    reviewRow: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.divider,
    },
    reviewCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    reviewRowLabel: { color: Colors.textSecondary, fontSize: 13, fontFamily: Fonts.regular, flex: 1 },
    reviewRowValue: { color: Colors.textPrimary, fontSize: 13, fontFamily: Fonts.semiBold },
    warningBox: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 10,
        padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1.5, marginTop: Spacing.md,
    },
    warningText: { fontSize: 12, fontFamily: Fonts.regular, flex: 1, lineHeight: 17 },

    // CTA
    ctaContainer: { padding: Spacing.md, paddingBottom: Spacing.xl, gap: 8 },
    ctaBtn: {
        borderRadius: BorderRadius.lg, paddingVertical: 16,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        overflow: 'hidden',
    },
    ctaText: { color: '#fff', fontSize: 16, fontFamily: Fonts.bold },
    skipBtn: { alignItems: 'center', paddingVertical: 4 },
    skipBtnText: { color: Colors.textMuted, fontSize: 13, fontFamily: Fonts.medium },

    // Chain picker
    chainList: { gap: 12, paddingBottom: 10, paddingHorizontal: Spacing.md, marginHorizontal: -Spacing.md },
    chainCard: { width: 80, alignItems: 'center', gap: 6, opacity: 0.6 },
    activeChainCard: { opacity: 1 },
    chainIconBg: {
        width: 64, height: 64, borderRadius: 16,
        backgroundColor: '#fff', borderWidth: 2, borderColor: Colors.border,
        alignItems: 'center', justifyContent: 'center', ...Shadow.subtle
    },
    chainImg: { width: '100%', height: '100%', borderRadius: 14 },
    chainLabel: { fontSize: 10, fontFamily: Fonts.bold, color: Colors.textSecondary, textAlign: 'center' },

    // Pioneers Event styles
    pioneersEventBanner: { marginTop: Spacing.md, borderRadius: BorderRadius.lg, overflow: 'hidden' },
    pioneersGradient: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: BorderRadius.lg },
    pioneersTitle: { color: '#fff', fontFamily: Fonts.bold, fontSize: 13 },
    pioneersSubtitle: { color: 'rgba(255,255,255,0.88)', fontFamily: Fonts.regular, fontSize: 11, marginTop: 2 },
    pioneersModelLock: { marginTop: Spacing.md },
    pioneersModelPreview: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginTop: Spacing.md, padding: Spacing.md, borderRadius: BorderRadius.lg, backgroundColor: 'rgba(245,166,35,0.08)', borderWidth: 1.5, borderColor: 'rgba(245,166,35,0.3)' },
    pioneersModelInfo: { flex: 1, gap: 6 },
    pioneersModelName: { fontSize: 18, fontFamily: Fonts.bold, color: Colors.textPrimary },
    pioneersModelDesc: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.textSecondary, lineHeight: 17 },
    exclusiveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(245,166,35,0.15)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
    exclusiveBadgeText: { fontSize: 9, fontFamily: Fonts.bold, color: '#f5a623', letterSpacing: 0.5 },
});
