import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, Modal, TouchableOpacity,
    Dimensions, Animated, Easing, SafeAreaView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts, Spacing, BorderRadius, Shadow } from '../theme';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

const TOUR_STEPS = [
    {
        title: 'Welcome to Kapsely',
        description: 'The premier digital sanctuary for your future memories. Let’s show you around.',
        icon: 'sparkles',
        color: Colors.primary,
    },
    {
        title: 'Create Your First Capsule',
        description: 'Tap the "+" icon to start a new capsule. Choose between InstaCap, EventCap, or LegacyCap.',
        icon: 'add-circle',
        color: Colors.instaCap,
    },
    {
        title: 'Discover YourCap',
        description: 'View and share timed stories. Memories that appear exactly when they are meant to be seen.',
        icon: 'play-circle',
        color: Colors.eventCap,
    },
    {
        title: 'Preserve Memories',
        description: 'Add photos, videos, and notes to your capsules. Seal them and wait for the perfect moment.',
        icon: 'archive',
        color: Colors.legacyCap,
    }
];

interface OnboardingTourProps {
    onComplete: () => void;
}

export default function OnboardingTour({ onComplete }: OnboardingTourProps) {
    const [currentStep, setCurrentStep] = useState(0);
    const [visible, setVisible] = useState(false);
    
    // Animations
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(20)).current;
    const scaleAnim = useRef(new Animated.Value(0.9)).current;

    useEffect(() => {
        checkFirstTime();
    }, []);

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
        if (currentStep < TOUR_STEPS.length - 1) {
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

    const step = TOUR_STEPS[currentStep];

    return (
        <Modal transparent visible={visible} animationType="fade">
            <View style={styles.overlay}>
                <LinearGradient
                    colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.85)', 'rgba(0,0,0,0.95)']}
                    style={styles.gradient}
                />
                
                <SafeAreaView style={styles.container}>
                    <TouchableOpacity style={styles.skipBtn} onPress={completeTour}>
                        <Text style={styles.skipText}>Skip</Text>
                    </TouchableOpacity>

                    <Animated.View 
                        style={[
                            styles.content, 
                            { 
                                opacity: fadeAnim,
                                transform: [
                                    { translateY: slideAnim },
                                    { scale: scaleAnim }
                                ]
                            }
                        ]}
                    >
                        <View style={[styles.iconContainer, { backgroundColor: step.color + '20' }]}>
                            <Ionicons name={step.icon as any} size={48} color={step.color} />
                        </View>
                        
                        <Text style={styles.title}>{step.title}</Text>
                        <Text style={styles.description}>{step.description}</Text>

                        <View style={styles.indicatorContainer}>
                            {TOUR_STEPS.map((_, i) => (
                                <View 
                                    key={i} 
                                    style={[
                                        styles.indicator, 
                                        currentStep === i ? { backgroundColor: step.color, width: 24 } : { backgroundColor: 'rgba(255,255,255,0.2)' }
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
                                    {currentStep === TOUR_STEPS.length - 1 ? 'Get Started' : 'Next'}
                                </Text>
                                <Ionicons 
                                    name={currentStep === TOUR_STEPS.length - 1 ? 'rocket' : 'arrow-forward'} 
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
