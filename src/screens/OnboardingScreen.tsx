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

const { width, height } = Dimensions.get('window');

const ONBOARDING_DATA = [
    {
        id: '1',
        title: 'onboarding.step1_title',
        desc: 'onboarding.step1_desc',
        icon: 'heart-outline',
        colors: ['#a269ff', '#7b2fbe'],
    },
    {
        id: '2',
        title: 'onboarding.step2_title',
        desc: 'onboarding.step2_desc',
        icon: 'cube-outline',
        colors: ['#06D6A0', '#118A57'],
        showModels: true,
        models: [
            'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/cartoonkap.png',
            'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/goldenkap.png',
            'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/model_1772952082826.jpg'
        ]
    },
    {
        id: '3',
        title: 'onboarding.step3_title',
        desc: 'onboarding.step3_desc',
        icon: 'lock-closed-outline',
        colors: ['#118AB2', '#0EA5E9'],
    },
    {
        id: '4',
        title: 'onboarding.step4_title',
        desc: 'onboarding.step4_desc',
        icon: 'bolt',
        colors: ['#FF6B6B', '#E91E63'],
    },
    {
        id: '5',
        title: 'onboarding.step5_title',
        desc: 'onboarding.step5_desc',
        icon: 'help-circle-outline',
        colors: ['#FFD166', '#FFA552'],
    },
];

export default function OnboardingScreen() {
    const { t } = useTranslation();
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
            await AsyncStorage.setItem('@has_seen_onboarding', 'true');
            navigation.replace('Main');
        } catch (e) {
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

    const renderItem = ({ item, index }: any) => {
        const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
        
        const scale = scrollX.interpolate({
            inputRange,
            outputRange: [0.8, 1, 0.8],
            extrapolate: 'clamp',
        });

        const opacity = scrollX.interpolate({
            inputRange: [(index - 1) * width, index * width, (index + 1) * width],
            outputRange: [0, 1, 0],
        });

        return (
            <View style={s.cardContainer}>
                <LinearGradient colors={item.colors} style={s.gradientBg} />
                
                {/* Decorative background shapes */}
                <View style={StyleSheet.absoluteFill}>
                    <Ionicons name="sparkles" size={100} color="rgba(255,255,255,0.05)" style={{ position: 'absolute', top: 100, left: 30 }} />
                    <Ionicons name="flash" size={80} color="rgba(255,255,255,0.05)" style={{ position: 'absolute', bottom: 150, right: 40 }} />
                    <Ionicons name="star" size={60} color="rgba(255,255,255,0.05)" style={{ position: 'absolute', top: '40%', right: -20 }} />
                </View>

                <Animated.View style={[s.content, { 
                    scaleX: scale, scaleY: scale, opacity,
                    transform: [{ translateY: floatY }]
                }]}>
                    {item.showModels ? (
                        <View style={s.modelsRow}>
                            {item.models.map((uri: string, idx: number) => (
                                <View key={idx} style={[s.iconCircle, idx !== 1 ? s.smallIconCircle : null]}>
                                    <Image source={{ uri }} style={s.modelImg} resizeMode="contain" />
                                </View>
                            ))}
                        </View>
                    ) : (
                        <View style={s.iconCircle}>
                            <View style={s.glow} />
                            <Ionicons name={item.icon} size={80} color="#fff" />
                        </View>
                    )}
                    
                    <Text style={s.title}>{t(item.title)}</Text>
                    <Text style={s.desc}>{t(item.desc)}</Text>
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
    gradientBg: { ...StyleSheet.absoluteFillObject, opacity: 0.9 },
    content: { alignItems: 'center', paddingHorizontal: 40 },
    iconCircle: {
        width: 160,
        height: 160,
        borderRadius: 80,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 40,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    glow: {
        position: 'absolute',
        width: '120%',
        height: '120%',
        borderRadius: 100,
        backgroundColor: 'rgba(255,255,255,0.15)',
    },
    modelsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    smallIconCircle: {
        width: 100,
        height: 100,
        borderRadius: 50,
        marginHorizontal: -10,
        opacity: 0.8,
    },
    modelImg: {
        width: '100%',
        height: '100%',
        borderRadius: 40,
    },
    title: { 
        fontSize: 32, fontFamily: Fonts.bold, color: '#fff', 
        textAlign: 'center', marginBottom: 20,
        textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 10
    },
    desc: { 
        fontSize: 16, fontFamily: Fonts.medium, color: 'rgba(255,255,255,0.85)', 
        textAlign: 'center', lineHeight: 24 
    },
    indicatorContainer: {
        flexDirection: 'row',
        position: 'absolute',
        width: '100%',
        justifyContent: 'center',
    },
    dot: {
        height: 6,
        borderRadius: 3,
        backgroundColor: 'rgba(255,255,255,0.4)',
        marginHorizontal: 4,
    },
    activeDot: {
        backgroundColor: '#fff',
        width: 24,
    },
    inactiveDot: {
        width: 6,
    },
    actions: {
        position: 'absolute', width: '100%', flexDirection: 'row',
        justifyContent: 'space-between', paddingHorizontal: 30, alignItems: 'center'
    },
    skipBtn: { padding: 10, minWidth: 60 },
    skipText: { color: 'rgba(255,255,255,0.6)', fontSize: 15, fontFamily: Fonts.bold },
    nextBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: 'rgba(255,255,255,0.25)',
        paddingHorizontal: 24, paddingVertical: 14,
        borderRadius: 30, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
    },
    nextBtnText: { color: '#fff', fontSize: 16, fontFamily: Fonts.bold },
});
