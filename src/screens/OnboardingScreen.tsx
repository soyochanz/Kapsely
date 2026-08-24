import React, { useState, useRef } from 'react';
import {
    View, Text, StyleSheet, FlatList, Dimensions, 
    TouchableOpacity, Animated, StatusBar, Platform, Image, Easing, Modal,
    ScrollView
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import { Colors, Fonts, Spacing, BorderRadius, Shadow } from '../theme';
import { supabase } from '../lib/supabase';
import { BlurView } from 'expo-blur';
import { P, R, shadow } from '../theme';
import { CAPSULE_MODELS } from '../constants/models';
import CapsuleWithTimer from '../components/CapsuleWithTimer';
import { timerConfigManager } from '../utils/timerConfig';

const { width, height } = Dimensions.get('window');

const ONBOARDING_DATA = [
    {
        id: '0',
        type: 'language',
        titleKey: 'onboarding.step0_title',
        descKey: 'onboarding.step0_desc',
        icon: 'language-outline',
        colors: ['#1F2937', '#111827'],
    },
    {
        id: '1',
        type: 'concept',
        titleKey: 'onboarding.step1_title',
        descKey: 'onboarding.step1_desc',
        icon: 'infinite-outline',
        colors: ['#4F46E5', '#7C3AED'],
    },
    {
        id: '2',
        type: 'drops',
        titleKey: 'onboarding.step2_title',
        descKey: 'onboarding.step2_desc',
        icon: 'diamond-outline',
        colors: ['#7C3AED', '#C026D3'],
    },
    {
        id: '3',
        type: 'interactive_add',
        titleKey: 'onboarding.step3_title',
        descKey: 'onboarding.step3_desc',
        icon: 'add-circle-outline',
        colors: ['#DB2777', '#E11D48'],
    },
    {
        id: '4',
        type: 'social',
        titleKey: 'onboarding.step4_title',
        descKey: 'onboarding.step4_desc',
        icon: 'heart-outline',
        colors: ['#EA580C', '#E11D48'],
    },
    {
        id: '5',
        type: 'event_caps',
        titleKey: 'onboarding.step5_title',
        descKey: 'onboarding.step5_desc',
        icon: 'calendar-outline',
        colors: ['#2563EB', '#1D4ED8'],
    },
    {
        id: '6',
        type: 'banner_stickers',
        titleKey: 'onboarding.step_banner_title',
        descKey: 'onboarding.step_banner_desc',
        icon: 'brush-outline',
        colors: ['#8B5CF6', '#EC4899'],
    },
    {
        id: '7',
        type: 'ready',
        titleKey: 'onboarding.step6_title',
        descKey: 'onboarding.step6_desc',
        icon: 'rocket-outline',
        colors: ['#10B981', '#059669'],
    },
];

const PRESET_COLORS = [
    '#A269FF', '#FF6B6B', '#06D6A0', '#0EA5E9', '#F72585', '#FFD166',
    '#3A86FF', '#FB5607', '#8338EC', '#FF006E', '#2EC4B6', '#E71D36',
    '#FF9F1C', '#2A9D8F', '#E9C46A', '#F4A261', '#E76F51', '#264653',
    '#606C38', '#283618', '#FEFAE0', '#DDA15E', '#BC6C25', '#003049',
    '#D62828', '#F77F00', '#FCBF49', '#EAE2B7', '#5F0F40', '#9A031E',
    '#FB8B24', '#E36414', '#0F4C5C', '#540B0E', '#6A4C93', '#1982C4',
    '#8AC926', '#FFCA3A', '#FF595E', '#2D6A4F', '#40916C', '#52B788'
];
const PREVIEW_MODELS = ['flame_kap', 'unicorn_kap', 'Cartoon_kap', 'diamond_kap'];
const EVENT_MODEL_URL = CAPSULE_MODELS.find(m => m.id === 'pioneers_cap')?.image || '';

export default function OnboardingScreen() {
    const { t, i18n } = useTranslation();
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const [activeIndex, setActiveIndex] = useState(0);
    const [birthdate, setBirthdate] = useState<Date>(new Date(2000, 0, 1));
    const [favoriteColor, setFavoriteColor] = useState('#A269FF');
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showColorModal, setShowColorModal] = useState(false);
    const [configVersion, setConfigVersion] = useState(0);

    const scrollX = useRef(new Animated.Value(0)).current;
    const flatListRef = useRef<any>(null);
    const floatAnim = useRef(new Animated.Value(0)).current;
    const stickerPos = useRef(new Animated.ValueXY({ x: 0, y: 150 })).current;

    React.useEffect(() => {
        if (ONBOARDING_DATA[activeIndex]?.type === 'banner_stickers') {
            startStickerAnim();
        } else {
            stickerPos.setValue({ x: 0, y: 150 });
        }
    }, [activeIndex]);

    const startStickerAnim = () => {
        stickerPos.setValue({ x: 0, y: 150 });
        Animated.loop(
            Animated.sequence([
                Animated.delay(800),
                // Dragging to banner
                Animated.timing(stickerPos, {
                    toValue: { x: 50, y: -40 },
                    duration: 1800,
                    useNativeDriver: true,
                    easing: Easing.bezier(0.4, 0, 0.2, 1),
                }),
                // "Drop" effect (small bounce)
                Animated.spring(stickerPos, {
                    toValue: { x: 50, y: -45 },
                    friction: 4,
                    useNativeDriver: true,
                }),
                Animated.delay(1500),
                // Reset
                Animated.timing(stickerPos, {
                    toValue: { x: 0, y: 150 },
                    duration: 400,
                    useNativeDriver: true,
                    easing: Easing.in(Easing.ease),
                }),
            ])
        ).start();
    };

    React.useEffect(() => {
        // Initialize timer config manager to load models from DB
        if (!SUPABASE_RELIEF_MODE) {
            timerConfigManager.init();
        }
        const unsub = timerConfigManager.subscribe(() => setConfigVersion(v => v + 1));

        Animated.loop(
            Animated.sequence([
                Animated.timing(floatAnim, {
                    toValue: 1,
                    duration: 3000,
                    useNativeDriver: true,
                }),
                Animated.timing(floatAnim, {
                    toValue: 0,
                    duration: 3000,
                    useNativeDriver: true,
                }),
            ])
        ).start();

        return unsub;
    }, []);

    const floatY = floatAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -15],
    });

    const handleFinish = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                // Sync with account
                await supabase
                    .from('profiles')
                    .update({ 
                        has_completed_onboarding: true,
                        birthdate: birthdate.toISOString().split('T')[0],
                        favorite_color: favoriteColor
                    })
                    .eq('id', user.id);
            }
            await AsyncStorage.setItem('@has_seen_onboarding_v2', 'true');
            navigation.replace('Main');
        } catch (e) {
            console.error('Onboarding sync failed:', e);
            navigation.replace('Main');
        }
    };

    const handleNext = () => {
        if (activeIndex < ONBOARDING_DATA.length - 1) {
            flatListRef.current?.scrollToIndex({ index: activeIndex + 1 });
        } else {
            handleFinish();
        }
    };

    const handleSkip = () => handleFinish();

    const renderVisual = (item: any, opacity: any) => {
        switch(item.type) {
            case 'language':
                const changeLang = async (lang: string) => {
                    await i18n.changeLanguage(lang);
                    await AsyncStorage.setItem('@user_language', lang);
                };
                return (
                    <View style={s.langSelector}>
                        <View style={s.langRow}>
                            <TouchableOpacity 
                                activeOpacity={0.8}
                                style={[s.langBtnSmall, i18n.language.startsWith('es') && s.langBtnActive]} 
                                onPress={() => changeLang('es')}
                            >
                                <Text style={s.langEmoji}>🇪🇸</Text>
                                <Text style={[s.langTextSmall, i18n.language.startsWith('es') && s.langTextActive]}>Español</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                activeOpacity={0.8}
                                style={[s.langBtnSmall, i18n.language.startsWith('en') && s.langBtnActive]} 
                                onPress={() => changeLang('en')}
                            >
                                <Text style={s.langEmoji}>🇺🇸</Text>
                                <Text style={[s.langTextSmall, i18n.language.startsWith('en') && s.langTextActive]}>English</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Extra info section */}
                        <View style={s.extraInfoSection}>
                            <Text style={s.extraLabel}>{t('onboarding.birthday')}</Text>
                            <TouchableOpacity 
                                style={s.extraInput} 
                                onPress={() => setShowDatePicker(true)}
                                activeOpacity={0.7}
                            >
                                <Ionicons name="calendar-outline" size={20} color="#fff" />
                                <Text style={s.extraInputText}>
                                    {birthdate.toLocaleDateString(i18n.language === 'es' ? 'es-ES' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
                                </Text>
                            </TouchableOpacity>

                            {showDatePicker && (
                                <View style={Platform.OS === 'ios' ? s.iosPickerContainer : s.androidPickerContainer}>
                                    <View style={s.pickerHeader}>
                                        <View style={{ flex: 1 }} />
                                        <TouchableOpacity 
                                            style={s.pickerDoneBtn} 
                                            onPress={() => setShowDatePicker(false)}
                                        >
                                            <Text style={s.pickerDoneText}>{t('common.done') || 'OK'}</Text>
                                        </TouchableOpacity>
                                    </View>
                                    <DateTimePicker
                                        value={birthdate}
                                        mode="date"
                                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                        onChange={(event, selectedDate) => {
                                            if (Platform.OS === 'android' && event.type === 'set') {
                                                // On Android, 'set' means OK was pressed in the system dialog
                                                // but we also have our custom OK button now for consistency if needed
                                                // Actually, the system dialog has its own OK.
                                                // Let's keep our custom button for when it's NOT a dialog if possible.
                                            }
                                            if (selectedDate) setBirthdate(selectedDate);
                                        }}
                                        maximumDate={new Date()}
                                        themeVariant="dark"
                                        locale={i18n.language.startsWith('es') ? 'es-ES' : 'en-US'}
                                    />
                                </View>
                            )}

                            <Text style={s.extraLabel}>{t('onboarding.choose_color')}</Text>
                            <View style={s.colorPalette}>
                                {PRESET_COLORS.slice(0, 5).map(c => (
                                    <TouchableOpacity 
                                        key={c}
                                        onPress={() => setFavoriteColor(c)}
                                        style={[s.colorCircle, { backgroundColor: c }, favoriteColor === c && s.colorCircleActive]}
                                    >
                                        {favoriteColor === c && <Ionicons name="checkmark" size={16} color="#fff" />}
                                    </TouchableOpacity>
                                ))}
                                <TouchableOpacity 
                                    style={s.moreColorsBtn}
                                    onPress={() => setShowColorModal(true)}
                                >
                                    <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
                                    <Text style={s.moreColorsText}>{t('common.view_more') || 'Ver más'}</Text>
                                </TouchableOpacity>
                            </View>

                            <Modal visible={showColorModal} transparent animationType="fade">
                                <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill}>
                                    <TouchableOpacity 
                                        style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}
                                        activeOpacity={1}
                                        onPress={() => setShowColorModal(false)}
                                    >
                                        <View style={s.colorModalContent} onStartShouldSetResponder={() => true}>
                                            <View style={s.colorModalHeader}>
                                                <Text style={s.colorModalTitle}>{t('onboarding.choose_color')}</Text>
                                                <TouchableOpacity onPress={() => setShowColorModal(false)}>
                                                    <Ionicons name="close-circle" size={28} color="rgba(255,255,255,0.5)" />
                                                </TouchableOpacity>
                                            </View>
                                            <ScrollView contentContainerStyle={s.colorModalGrid}>
                                                {PRESET_COLORS.map(c => (
                                                    <TouchableOpacity 
                                                        key={c}
                                                        onPress={() => {
                                                            setFavoriteColor(c);
                                                            setShowColorModal(false);
                                                        }}
                                                        style={[s.colorCircleLarge, { backgroundColor: c }, favoriteColor === c && s.colorCircleActive]}
                                                    >
                                                        {favoriteColor === c && <Ionicons name="checkmark" size={24} color="#fff" />}
                                                    </TouchableOpacity>
                                                ))}
                                            </ScrollView>
                                        </View>
                                    </TouchableOpacity>
                                </BlurView>
                            </Modal>
                        </View>
                    </View>
                );
            case 'drops':
                return (
                    <View style={s.dropsGallery}>
                        {PREVIEW_MODELS.map((url, i) => {
                            // Alternate floating animation for each item
                            const itemFloat = floatAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: i % 2 === 0 ? [0, -15] : [-15, 0]
                            });
                            
                            return (
                                <Animated.View 
                                    key={i} 
                                    style={[
                                        s.dropItemLarge, 
                                        { 
                                            transform: [
                                                { translateY: itemFloat },
                                                { rotate: i % 2 === 0 ? '8deg' : '-8deg' }
                                            ],
                                            zIndex: i === 1 || i === 2 ? 10 : 1,
                                            marginLeft: i === 0 ? 0 : -45
                                        }
                                    ]}
                                >
                                    <CapsuleWithTimer 
                                        modelKey={PREVIEW_MODELS[i]}
                                        source={{ uri: timerConfigManager.getModelImage(PREVIEW_MODELS[i]) || (CAPSULE_MODELS.find(m => m.id === PREVIEW_MODELS[i])?.image) }}
                                        style={s.dropImageLarge}
                                        date={new Date(Date.now() + 86400000).toISOString()}
                                        hideTimer={true}
                                        disableAnimations={true}
                                        isMinimal={true}
                                    />
                                </Animated.View>
                            );
                        })}
                    </View>
                );
            case 'event_caps':
                return (
                    <View style={s.eventVisualContainer}>
                        <Animated.View style={[s.eventModelWrap, { transform: [{ translateY: floatY }] }]}>
                            <CapsuleWithTimer 
                                modelKey="pioneers_cap"
                                source={{ uri: timerConfigManager.getModelImage('pioneers_cap') || EVENT_MODEL_URL }}
                                style={s.eventModelImg}
                                date={new Date(Date.now() + 172800000).toISOString()}
                                hideTimer={true}
                                disableAnimations={true}
                            />
                            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.3)']} style={s.eventModelOverlay} />
                        </Animated.View>
                        <View style={s.eventInfoBox}>
                            <Text style={s.eventName}>{t('onboarding.current_event_name')}</Text>
                            <View style={s.eventDateBadge}>
                                <Ionicons name="time-outline" size={14} color="#fff" />
                                <Text style={s.eventDateText}>{t('onboarding.current_event_date')}</Text>
                            </View>
                        </View>
                    </View>
                );
            case 'interactive_add':
                return (
                    <View style={s.addSimulation}>
                        <View style={s.fakeButton}>
                            <LinearGradient colors={[P.p500, P.p700]} style={s.fakeButtonGrad}>
                                <Ionicons name="add" size={40} color="#fff" />
                            </LinearGradient>
                        </View>
                        <View style={s.pulseOrb} />
                    </View>
                );
            case 'banner_stickers':
                return (
                    <View style={s.bannerSimContainer}>
                        {/* Fake Banner */}
                        <View style={s.fakeBanner}>
                            <LinearGradient 
                                colors={['#1F2937', '#111827']} 
                                style={s.fakeBannerGrad}
                            />
                            {/* Target Zone */}
                            <View style={[s.targetZone, { transform: [{ translateX: 50 }, { translateY: -40 }] }]}>
                                <View style={s.targetDashed} />
                            </View>
                        </View>

                        {/* Hand/Sticker dragging simulation */}
                        <Animated.View style={[
                            s.draggingSticker,
                            {
                                transform: [
                                    { translateX: stickerPos.x },
                                    { translateY: stickerPos.y }
                                ]
                            }
                        ]}>
                            <View style={s.stickerVisual}>
                                <Ionicons name="star" size={30} color="#FFD166" />
                            </View>
                            <View style={s.handPointer}>
                                <Ionicons name="hand-right" size={40} color="rgba(255,255,255,0.8)" />
                            </View>
                        </Animated.View>

                        <View style={s.stickerShelf}>
                            <View style={s.shelfItem}><Ionicons name="heart" size={24} color="#FF6B6B" /></View>
                            <View style={[s.shelfItem, { opacity: 0.3 }]}><Ionicons name="star" size={24} color="#FFD166" /></View>
                            <View style={s.shelfItem}><Ionicons name="images-outline" size={24} color="#0EA5E9" /></View>
                        </View>
                    </View>
                );
            default:
                return (
                    <View style={s.iconCircle}>
                        <View style={s.glow} />
                        <Ionicons name={item.icon} size={80} color="#fff" />
                    </View>
                );
        }
    };

    const renderItem = ({ item, index }: any) => {
        const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
        
        const scale = scrollX.interpolate({
            inputRange,
            outputRange: [0.85, 1, 0.85],
            extrapolate: 'clamp',
        });

        const opacity = scrollX.interpolate({
            inputRange,
            outputRange: [0, 1, 0],
            extrapolate: 'clamp',
        });

        return (
            <View style={s.cardContainer}>
                <LinearGradient colors={item.colors} style={s.gradientBg} />
                
                {/* Ambient Orbs */}
                <View style={StyleSheet.absoluteFill}>
                    <View style={[s.bgOrb, { top: 100, right: -50, backgroundColor: 'rgba(255,255,255,0.1)' }]} />
                    <View style={[s.bgOrb, { bottom: 150, left: -60, backgroundColor: 'rgba(255,255,255,0.05)' }]} />
                </View>

                <Animated.View style={[s.content, { 
                    scaleX: scale, scaleY: scale, opacity,
                    transform: [{ translateY: floatY }]
                }]}>
                    {item.type === 'language' && renderVisual(item, opacity)}
                    
                    <View style={s.textContainer}>
                        <Text style={s.title}>{t(item.titleKey)}</Text>
                        <Text style={s.desc}>{t(item.descKey)}</Text>
                    </View>

                    {item.type !== 'language' && renderVisual(item, opacity)}
                </Animated.View>
            </View>
        );
    };

    return (
        <View style={s.container}>
            <StatusBar barStyle="light-content" />
            
            <Animated.FlatList
                ref={flatListRef}
                data={ONBOARDING_DATA}
                renderItem={renderItem}
                keyExtractor={(item: any) => item.id}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                    { useNativeDriver: true }
                )}
                onMomentumScrollEnd={(e: any) => {
                    const index = Math.round(e.nativeEvent.contentOffset.x / width);
                    setActiveIndex(index);
                }}
            />

            {/* Pagination dots */}
            <View style={[s.indicatorContainer, { bottom: insets.bottom + 120 }]}>
                {ONBOARDING_DATA.map((_, i) => (
                    <View 
                        key={i} 
                        style={[s.dot, activeIndex === i ? s.activeDot : s.inactiveDot]} 
                    />
                ))}
            </View>

            {/* Bottom Actions */}
            <View style={[s.actions, { bottom: insets.bottom + 40 }]}>
                {activeIndex < ONBOARDING_DATA.length - 1 ? (
                    <TouchableOpacity onPress={handleSkip} style={s.skipBtn}>
                        <Text style={s.skipText}>{t('common.skip') || 'Skip'}</Text>
                    </TouchableOpacity>
                ) : <View style={s.skipBtn} />}

                <TouchableOpacity 
                    onPress={handleNext} 
                    style={s.nextBtn}
                    activeOpacity={0.8}
                >
                    <Text style={s.nextBtnText}>
                        {activeIndex === ONBOARDING_DATA.length - 1 ? (t('common.let_go') || 'Let\'s go!') : (t('common.next') || 'Next')}
                    </Text>
                    <Ionicons 
                        name={activeIndex === ONBOARDING_DATA.length - 1 ? "rocket" : "arrow-forward"} 
                        size={18} 
                        color="#fff" 
                    />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    cardContainer: { width, height, alignItems: 'center', justifyContent: 'center' },
    gradientBg: { ...StyleSheet.absoluteFillObject, opacity: 0.8 },
    bgOrb: { position: 'absolute', width: 300, height: 300, borderRadius: 150 },
    content: { alignItems: 'center', width: '100%', paddingHorizontal: 30 },
    textContainer: { marginBottom: 40, alignItems: 'center' },
    iconCircle: {
        width: 180, height: 180, borderRadius: 90,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)',
        ...shadow.medium,
    },
    glow: {
        position: 'absolute', width: '130%', height: '130%', borderRadius: 120,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    title: { 
        fontSize: 34, fontWeight: '900', color: '#fff', 
        textAlign: 'center', marginBottom: 16, letterSpacing: -0.5,
    },
    desc: { 
        fontSize: 16, fontWeight: '500', color: 'rgba(255,255,255,0.9)', 
        textAlign: 'center', lineHeight: 26, paddingHorizontal: 10,
    },
    indicatorContainer: {
        flexDirection: 'row', position: 'absolute', width: '100%', justifyContent: 'center',
    },
    dot: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: 4 },
    activeDot: { backgroundColor: '#fff', width: 32 },
    inactiveDot: { width: 8 },
    actions: {
        position: 'absolute', width: '100%', flexDirection: 'row',
        justifyContent: 'space-between', paddingHorizontal: 30, alignItems: 'center'
    },
    skipBtn: { padding: 10, minWidth: 60 },
    skipText: { color: 'rgba(255,255,255,0.5)', fontSize: 15, fontWeight: '700' },
    nextBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: '#fff', paddingHorizontal: 28, paddingVertical: 16,
        borderRadius: 35, ...shadow.medium,
    },
    nextBtnText: { color: '#000', fontSize: 16, fontWeight: '800' },

    // Interactive Elements
    logicContainer: {
        flexDirection: 'row', alignItems: 'center', gap: 30,
        backgroundColor: 'rgba(255,255,255,0.15)', padding: 30, borderRadius: 40,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    },
    logicCol: { alignItems: 'center', gap: 10 },
    logicIcon: { width: 70, height: 70, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
    logicLabel: { color: '#fff', fontSize: 13, fontWeight: '800', textTransform: 'uppercase' },
    logicDivider: { width: 1, height: 60, backgroundColor: 'rgba(255,255,255,0.1)' },
    
    addSimulation: { alignItems: 'center', justifyContent: 'center' },
    fakeButton: { width: 100, height: 100, borderRadius: 50, overflow: 'hidden', ...shadow.purple },
    fakeButtonGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    pulseOrb: {
        position: 'absolute', width: 140, height: 140, borderRadius: 70,
        borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', opacity: 0.5,
    },
    langSelector: { width: '100%', gap: 20, paddingHorizontal: 10 },
    langRow: { flexDirection: 'row', gap: 12 },
    langBtnSmall: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingVertical: 14, borderRadius: 20, gap: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    },
    langBtnActive: {
        backgroundColor: 'rgba(255,255,255,0.25)', borderColor: 'rgba(255,255,255,0.4)',
    },
    langEmoji: { fontSize: 20 },
    langTextSmall: { color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: '700' },
    langTextActive: { color: '#fff' },

    extraInfoSection: { gap: 12, marginTop: 10 },
    extraLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
    extraInput: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: 'rgba(255,255,255,0.1)',
        padding: 18, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    },
    extraInputText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    
    colorPalette: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginTop: 5 },
    colorCircle: {
        width: 44, height: 44, borderRadius: 22,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 2, borderColor: 'transparent',
    },
    colorCircleActive: { borderColor: '#fff', transform: [{ scale: 1.1 }] },
    moreColorsBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(255,255,255,0.15)',
        paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    },
    moreColorsText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    
    colorModalContent: {
        width: '100%', backgroundColor: 'rgba(30,30,30,0.95)',
        borderRadius: 30, padding: 25, maxHeight: '80%',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    },
    colorModalHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20,
    },
    colorModalTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
    colorModalGrid: {
        flexDirection: 'row', flexWrap: 'wrap', gap: 15, justifyContent: 'center',
    },
    colorCircleLarge: {
        width: 54, height: 54, borderRadius: 27,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 3, borderColor: 'transparent',
    },

    dropsGallery: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        height: 200, width: '100%', marginBottom: 20
    },
    dropItemLarge: {
        width: 130, height: 130,
        alignItems: 'center', justifyContent: 'center',
    },
    dropImageLarge: { width: 130, height: 130 },

    eventVisualContainer: { alignItems: 'center', gap: 20 },
    eventModelWrap: {
        width: 280, height: 280,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 140, padding: 20,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
        overflow: 'hidden', justifyContent: 'center', alignItems: 'center'
    },
    eventModelImg: { width: 220, height: 220 },
    eventModelOverlay: { ...StyleSheet.absoluteFillObject },
    eventInfoBox: { alignItems: 'center', gap: 6 },
    eventName: { color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
    eventDateBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: Colors.eventCap || '#ff4d4d',
        paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20
    },
    eventDateText: { color: '#fff', fontSize: 13, fontWeight: '800' },

    // Banner Sticker Simulation
    bannerSimContainer: {
        width: 300, height: 300, alignItems: 'center', justifyContent: 'center',
    },
    fakeBanner: {
        width: 280, height: 100, borderRadius: 15, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
        ...shadow.medium,
    },
    fakeBannerGrad: { flex: 1 },
    targetZone: {
        position: 'absolute', width: 50, height: 50,
        alignItems: 'center', justifyContent: 'center',
    },
    targetDashed: {
        width: 44, height: 44, borderRadius: 8,
        borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
        borderStyle: 'dashed',
    },
    draggingSticker: {
        position: 'absolute', alignItems: 'center', justifyContent: 'center',
    },
    stickerVisual: {
        width: 50, height: 50, borderRadius: 25,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    },
    handPointer: {
        position: 'absolute', bottom: -30, right: -20,
    },
    stickerShelf: {
        flexDirection: 'row', gap: 15, marginTop: 100,
        backgroundColor: 'rgba(255,255,255,0.05)',
        padding: 15, borderRadius: 25, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    },
    shelfItem: {
        width: 50, height: 50, borderRadius: 15,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center', justifyContent: 'center',
    },
    iosPickerContainer: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 20,
        padding: 10,
        marginTop: 10,
    },
    androidPickerContainer: {
        marginTop: 10,
    },
    pickerHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    pickerDoneBtn: {
        paddingHorizontal: 15,
        paddingVertical: 8,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 12,
    },
    pickerDoneText: {
        color: '#fff',
        fontWeight: '800',
        fontSize: 14,
    },
    iosPickerDone: {
        alignSelf: 'flex-end',
        paddingHorizontal: 15,
        paddingVertical: 8,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 12,
    },
    iosPickerDoneText: {
        color: '#fff',
        fontWeight: '800',
        fontSize: 14,
    },
});
const SUPABASE_RELIEF_MODE = true;
