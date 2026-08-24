import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, Modal, TouchableOpacity,
    Dimensions, Animated, Easing, SafeAreaView, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts, Spacing, BorderRadius, Shadow } from '../theme';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

// We use a global state to synchronize steps across screens
export type TutorialStep = 
    | 'IDLE' 
    | 'WELCOME' 
    | 'PRESS_PLUS' 
    | 'SELECT_TYPE' 
    | 'FINISHED';

interface InteractiveTourProps {
    step: TutorialStep;
    onAction?: (action: string) => void;
    onDismiss?: () => void;
}

export default function InteractiveTour({ step, onAction, onDismiss }: InteractiveTourProps) {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(20)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (step !== 'IDLE' && step !== 'FINISHED') {
            Animated.parallel([
                Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
                Animated.timing(slideAnim, { toValue: 0, duration: 400, easing: Easing.out(Easing.back(1)), useNativeDriver: true })
            ]).start();

            if (step === 'PRESS_PLUS' || step === 'SELECT_TYPE') {
                startPulse();
            }
        } else {
            fadeAnim.setValue(0);
            slideAnim.setValue(20);
        }
    }, [step]);

    const startPulse = () => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.2, duration: 600, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true })
            ])
        ).start();
    };

    if (step === 'IDLE' || step === 'FINISHED') return null;

    // --- STEP 1: WELCOME MODAL ---
    if (step === 'WELCOME') {
        return (
            <Modal transparent visible animationType="fade">
                <View style={styles.overlay}>
                    <LinearGradient colors={['rgba(0,0,0,0.8)', 'rgba(0,0,0,0.95)']} style={styles.gradient} />
                    <Animated.View style={[styles.modalContent, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                        <View style={styles.iconBox}>
                            <Ionicons name="sparkles" size={40} color={Colors.primary} />
                        </View>
                        <Text style={styles.modalTitle}>Mission Control</Text>
                        <Text style={styles.modalSub}>Welcome to the Kapsely temporal network. I’ll guide you through your first mission.</Text>
                        
                        <TouchableOpacity 
                            style={styles.actionBtn} 
                            onPress={() => onAction?.('START')}
                        >
                            <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.btnGradient}>
                                <Text style={styles.btnText}>Begin Initiation</Text>
                                <Ionicons name="arrow-forward" size={18} color="#fff" />
                            </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.skipLink} onPress={onDismiss}>
                            <Text style={styles.skipLinkText}>Skip Training</Text>
                        </TouchableOpacity>
                    </Animated.View>
                </View>
            </Modal>
        );
    }

    // --- STEP 2: PRESS PLUS (POINT TO BUTTON) ---
    if (step === 'PRESS_PLUS') {
        return (
            <View style={[styles.pointerOverlay, { pointerEvents: 'box-none' }]}>
                <View style={styles.hintContainer}>
                    <Animated.View style={[styles.hintBox, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                        <Text style={styles.hintTitle}>Step 1: Create</Text>
                        <Text style={styles.hintText}>Tap the "+" icon to initialize a new digital capsule.</Text>
                        <View style={styles.arrowDown} />
                    </Animated.View>
                </View>

                {/* This circle highlights the "+" button area in the header */}
                <Animated.View 
                    style={[
                        styles.highlightCircle, 
                        { 
                            top: Platform.OS === 'ios' ? 62 : 55, 
                            right: 98, 
                            transform: [{ scale: pulseAnim }] 
                        }
                    ]} 
                />
            </View>
        );
    }

    // --- STEP 3: SELECT TYPE ---
    if (step === 'SELECT_TYPE') {
        return (
            <View style={[styles.pointerOverlay, { pointerEvents: 'box-none' }]}>
                <View style={[styles.hintContainer, { top: height * 0.25 }]}>
                    <Animated.View style={[styles.hintBox, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                        <Text style={styles.hintTitle}>Step 2: Choose</Text>
                        <Text style={styles.hintText}>Pick "InstaCap" for a quick memory or "EventCap" for shared moments.</Text>
                        <View style={styles.arrowUp} />
                    </Animated.View>
                </View>
            </View>
        );
    }

    return null;
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center' },
    gradient: { ...StyleSheet.absoluteFillObject },
    modalContent: {
        width: width * 0.85,
        backgroundColor: Colors.surface,
        borderRadius: 30,
        padding: 30,
        alignItems: 'center',
        ...Shadow.primary,
    },
    iconBox: {
        width: 80, height: 80, borderRadius: 40,
        backgroundColor: Colors.primary + '15',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 20,
    },
    modalTitle: { fontSize: 22, fontFamily: Fonts.bold, color: Colors.textPrimary, marginBottom: 12 },
    modalSub: { fontSize: 15, fontFamily: Fonts.medium, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 25 },
    actionBtn: { width: '100%', height: 54, borderRadius: 15, overflow: 'hidden' },
    btnGradient: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
    btnText: { color: '#fff', fontSize: 16, fontFamily: Fonts.bold },
    skipLink: { marginTop: 15 },
    skipLinkText: { color: Colors.textMuted, fontSize: 13, fontFamily: Fonts.semiBold },

    pointerOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 9999 },
    hintContainer: { position: 'absolute', top: Platform.OS === 'ios' ? 110 : 100, width: '100%', alignItems: 'center', paddingHorizontal: 40 },
    hintBox: {
        backgroundColor: Colors.primary,
        borderRadius: 15,
        padding: 18,
        ...Shadow.primary,
        alignItems: 'center',
    },
    hintTitle: { color: '#fff', fontSize: 16, fontFamily: Fonts.bold, marginBottom: 4 },
    hintText: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontFamily: Fonts.medium, textAlign: 'center' },
    arrowDown: {
        position: 'absolute', bottom: -8, right: 65,
        width: 0, height: 0,
        borderLeftWidth: 8, borderLeftColor: 'transparent',
        borderRightWidth: 8, borderRightColor: 'transparent',
        borderTopWidth: 8, borderTopColor: Colors.primary,
    },
    arrowUp: {
        position: 'absolute', top: -8, alignSelf: 'center',
        width: 0, height: 0,
        borderLeftWidth: 8, borderLeftColor: 'transparent',
        borderRightWidth: 8, borderRightColor: 'transparent',
        borderBottomWidth: 8, borderBottomColor: Colors.primary,
    },
    highlightCircle: {
        position: 'absolute',
        width: 50, height: 50,
        borderRadius: 25,
        borderWidth: 3,
        borderColor: Colors.primary,
        backgroundColor: Colors.primary + '20',
    }
});
