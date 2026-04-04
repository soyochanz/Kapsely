import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, Modal, TouchableOpacity,
    Dimensions, Animated, Easing, SafeAreaView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts, Spacing, BorderRadius, Shadow } from '../theme';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useTranslation } from 'react-i18next';
import { timerConfigManager } from '../utils/timerConfig';
import { Image } from 'react-native';

const { width, height } = Dimensions.get('window');

const MODEL_EXAMPLES = [
    'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/cartoonkap.png',
    'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/goldenkap.png',
    'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/model_1772952082826.jpg'
];

const TOUR_STEPS = (t: any) => [
    {
        title: t('onboarding.step1_title'),
        description: t('onboarding.step1_desc'),
        icon: 'sparkles',
        color: Colors.primary,
    },
    {
        title: t('onboarding.step2_title'),
        description: t('onboarding.step2_desc'),
        icon: 'add-circle',
        color: Colors.instaCap,
        showModels: true,
    },
    {
        title: t('onboarding.step3_title'),
        description: t('onboarding.step3_desc'),
        icon: 'archive',
        color: Colors.legacyCap,
    },
    {
        title: t('onboarding.step4_title'),
        description: t('onboarding.step4_desc'),
        icon: 'flash',
        color: Colors.accent,
    },
    {
        title: t('onboarding.step5_title'),
        description: t('onboarding.step5_desc'),
        icon: 'chatbubbles',
        color: Colors.primary,
    }
];

interface OnboardingTourProps {
    onComplete: () => void;
}

export default function OnboardingTour({ onComplete }: OnboardingTourProps) {
    const { t } = useTranslation();
    const [currentStep, setCurrentStep] = useState(0);
    const [visible, setVisible] = useState(false);
    
    // Animations
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(20)).current;
    const scaleAnim = useRef(new Animated.Value(0.9)).current;
    const floatAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        checkFirstTime();
        
        // Synchronized floating animation for all cards
        Animated.loop(
            Animated.sequence([
                Animated.timing(floatAnim, { toValue: 1, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
                Animated.timing(floatAnim, { toValue: 0, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            ])
        ).start();
    }, []);

    const floatY = floatAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -12]
    });

    const checkFirstTime = async () => {
        try {
            const hasSeen = await AsyncStorage.getItem('hasSeenTour');
            if (!hasSeen) {
                setVisible(true);
                startAnims();
            } else {
                onComplete();
            }
        } catch (e) {
            setVisible(true);
        }
    };

    const startAnims = () => {
        fadeAnim.setValue(0);
        slideAnim.setValue(20);
        scaleAnim.setValue(0.9);
        
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 400, easing: Easing.out(Easing.back(1)), useNativeDriver: true }),
            Animated.timing(scaleAnim, { toValue: 1, duration: 400, easing: Easing.out(Easing.back(1)), useNativeDriver: true })
        ]).start();
    };

    const handleNext = () => {
        const steps = TOUR_STEPS(t);
        if (currentStep < steps.length - 1) {
            setCurrentStep(currentStep + 1);
            startAnims();
        } else {
            completeTour();
        }
    };

    const completeTour = async () => {
        await AsyncStorage.setItem('hasSeenTour', 'true');
        setVisible(false);
        onComplete();
    };

    if (!visible) return null;

    const steps = TOUR_STEPS(t);
    const step = steps[currentStep];

    return (
        <Modal transparent visible={visible} animationType="fade">
            <View style={styles.overlay}>
                <LinearGradient
                    colors={['rgba(0,0,0,0.85)', 'rgba(0,0,0,0.92)', 'rgba(0,0,0,0.98)']}
                    style={styles.gradient}
                />
                
                <SafeAreaView style={styles.container}>
                    <TouchableOpacity style={styles.skipBtn} onPress={completeTour}>
                        <Text style={styles.skipText}>{t('common.skip')}</Text>
                    </TouchableOpacity>

                    <Animated.View 
                        style={[
                            styles.content, 
                            { 
                                opacity: fadeAnim,
                                transform: [
                                    { translateY: slideAnim },
                                    { scale: scaleAnim },
                                    { translateY: floatY }
                                ]
                            }
                        ]}
                    >
                        {step.showModels ? (
                            <View style={styles.modelsGrid}>
                                {MODEL_EXAMPLES.map((url, i) => (
                                    <View key={i} style={[styles.modelCircle, { transform: [{ rotate: `${(i - 1) * 15}deg` }] }]}>
                                        <Image source={{ uri: url }} style={styles.modelImage} resizeMode="contain" />
                                    </View>
                                ))}
                            </View>
                        ) : (
                            <View style={[styles.iconContainer, { backgroundColor: step.color + '20' }]}>
                                <Ionicons name={step.icon as any} size={48} color={step.color} />
                            </View>
                        )}
                        
                        <Text style={styles.title}>{step.title}</Text>
                        <Text style={styles.description}>{step.description}</Text>

                        <View style={styles.indicatorContainer}>
                            {steps.map((_, i) => (
                                <View 
                                    key={i} 
                                    style={[
                                        styles.indicator, 
                                        currentStep === i ? { backgroundColor: step.color, width: 24 } : { backgroundColor: 'rgba(255,255,255,0.1)' }
                                    ]} 
                                />
                            ))}
                        </View>

                        <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
                            <LinearGradient
                                colors={[step.color, step.color === Colors.primary ? Colors.primaryDark : step.color + 'aa']}
                                style={styles.nextBtnGradient}
                            >
                                <Text style={styles.nextBtnText}>
                                    {currentStep === steps.length - 1 ? t('common.let_go') : t('common.next')}
                                </Text>
                                <Ionicons 
                                    name={currentStep === steps.length - 1 ? 'rocket' : 'arrow-forward'} 
                                    size={18} 
                                    color="#fff" 
                                />
                            </LinearGradient>
                        </TouchableOpacity>
                    </Animated.View>
                </SafeAreaView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    gradient: { ...StyleSheet.absoluteFillObject },
    container: { flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' },
    skipBtn: { position: 'absolute', top: 60, right: 30, padding: 10, zIndex: 10 },
    skipText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontFamily: Fonts.semiBold },
    content: {
        width: width * 0.85,
        backgroundColor: Colors.surface,
        borderRadius: 32,
        padding: 32,
        alignItems: 'center',
        ...Shadow.primary,
    },
    iconContainer: {
        width: 100,
        height: 100,
        borderRadius: 50,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    modelsGrid: {
        flexDirection: 'row',
        height: 120,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
        gap: -30,
    },
    modelCircle: {
        width: 90,
        height: 90,
        borderRadius: 45,
        backgroundColor: '#fff',
        borderWidth: 3,
        borderColor: Colors.border,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        ...Shadow.medium,
    },
    modelImage: {
        width: '100%',
        height: '100%',
    },
    title: {
        fontSize: 24,
        fontFamily: Fonts.bold,
        color: Colors.textPrimary,
        textAlign: 'center',
        marginBottom: 16,
    },
    description: {
        fontSize: 15,
        fontFamily: Fonts.medium,
        color: Colors.textSecondary,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 32,
    },
    indicatorContainer: {
        flexDirection: 'row',
        gap: 6,
        marginBottom: 32,
    },
    indicator: {
        height: 6,
        borderRadius: 3,
    },
    nextBtn: {
        width: '100%',
        height: 56,
        borderRadius: 16,
        overflow: 'hidden',
    },
    nextBtnGradient: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    nextBtnText: {
        color: '#fff',
        fontSize: 16,
        fontFamily: Fonts.bold,
    }
});
