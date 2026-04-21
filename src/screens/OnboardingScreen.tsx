import React, { useState, useRef } from 'react';
import {
    View, Text, StyleSheet, FlatList, Dimensions, 
    TouchableOpacity, Animated, StatusBar, Platform, Image
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { Colors, Fonts, Spacing, BorderRadius, Shadow } from '../theme';
import { supabase } from '../lib/supabase';
import { BlurView } from 'expo-blur';
import { P, R, shadow } from '../theme';

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
        type: 'capsule_logic',
        titleKey: 'onboarding.step2_title',
        descKey: 'onboarding.step2_desc',
        icon: 'lock-open-outline',
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
        type: 'ready',
        titleKey: 'onboarding.step5_title',
        descKey: 'onboarding.step5_desc',
        icon: 'rocket-outline',
        colors: ['#10B981', '#059669'],
    },
];

export default function OnboardingScreen() {
    const { t, i18n } = useTranslation();
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const [activeIndex, setActiveIndex] = useState(0);
    const scrollX = useRef(new Animated.Value(0)).current;
    const flatListRef = useRef<any>(null);
    const floatAnim = useRef(new Animated.Value(0)).current;

    React.useEffect(() => {
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
                    .update({ has_completed_onboarding: true })
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
                        <TouchableOpacity 
                            activeOpacity={0.8}
                            style={[s.langBtn, i18n.language.startsWith('es') && s.langBtnActive]} 
                            onPress={() => changeLang('es')}
                        >
                            <View style={s.flagCircle}><Text style={s.langEmoji}>🇪🇸</Text></View>
                            <View style={{ flex: 1 }}>
                                <Text style={[s.langText, i18n.language.startsWith('es') && s.langTextActive]}>Español</Text>
                                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Elegir idioma español</Text>
                            </View>
                            {i18n.language.startsWith('es') && <Ionicons name="checkmark-circle" size={24} color="#fff" />}
                        </TouchableOpacity>
                        <TouchableOpacity 
                            activeOpacity={0.8}
                            style={[s.langBtn, i18n.language.startsWith('en') && s.langBtnActive]} 
                            onPress={() => changeLang('en')}
                        >
                            <View style={s.flagCircle}><Text style={s.langEmoji}>🇺🇸</Text></View>
                            <View style={{ flex: 1 }}>
                                <Text style={[s.langText, i18n.language.startsWith('en') && s.langTextActive]}>English</Text>
                                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Choose English language</Text>
                            </View>
                            {i18n.language.startsWith('en') && <Ionicons name="checkmark-circle" size={24} color="#fff" />}
                        </TouchableOpacity>
                    </View>
                );
            case 'capsule_logic':
                return (
                    <View style={s.logicContainer}>
                        <View style={s.logicCol}>
                            <View style={[s.logicIcon, { backgroundColor: '#F0FDF4' }]}>
                                <Ionicons name="lock-open" size={32} color="#22C55E" />
                            </View>
                            <Text style={s.logicLabel}>Abierta</Text>
                        </View>
                        <View style={s.logicDivider} />
                        <View style={s.logicCol}>
                            <View style={[s.logicIcon, { backgroundColor: '#FEF2F2' }]}>
                                <Ionicons name="lock-closed" size={32} color="#EF4444" />
                            </View>
                            <Text style={s.logicLabel}>Sellada</Text>
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
                    {renderVisual(item, opacity)}
                    
                    <View style={s.textContainer}>
                        <Text style={s.title}>{t(item.titleKey)}</Text>
                        <Text style={s.desc}>{t(item.descKey)}</Text>
                    </View>
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
                keyExtractor={item => item.id}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                    { useNativeDriver: true }
                )}
                onMomentumScrollEnd={e => {
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
    textContainer: { marginTop: 40, alignItems: 'center' },
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
    langSelector: { width: '100%', gap: 12, paddingHorizontal: 10 },
    langBtn: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)',
        padding: 20, borderRadius: 24, gap: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    },
    langBtnActive: {
        backgroundColor: 'rgba(255,255,255,0.25)', borderColor: 'rgba(255,255,255,0.4)',
    },
    langEmoji: { fontSize: 24 },
    flagCircle: {
        width: 48, height: 48, borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center', justifyContent: 'center',
    },
    langText: { flex: 1, color: 'rgba(255,255,255,0.7)', fontSize: 18, fontWeight: '700' },
    langTextActive: { color: '#fff' },
});
