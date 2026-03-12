import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Animated, StatusBar, Image, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Spacing, BorderRadius, Shadow, Gradients } from '../../theme';

const { width, height } = Dimensions.get('window');

interface Props {
    onNavigateToLogin: () => void;
    onNavigateToRegister: () => void;
}

export default function LandingScreen({ onNavigateToLogin, onNavigateToRegister }: Props) {
    const insets = useSafeAreaInsets();
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(40)).current;
    const rotateAnim = useRef(new Animated.Value(0)).current;
    const floatAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 800,
                delay: 100,
                useNativeDriver: true,
            }),
            Animated.spring(translateY, {
                toValue: 0,
                tension: 40,
                friction: 7,
                delay: 100,
                useNativeDriver: true,
            }),
        ]).start();

        Animated.loop(
            Animated.timing(rotateAnim, {
                toValue: 1,
                duration: 25000,
                useNativeDriver: true,
            })
        ).start();

        Animated.loop(
            Animated.sequence([
                Animated.timing(floatAnim, { toValue: 1, duration: 4000, useNativeDriver: true }),
                Animated.timing(floatAnim, { toValue: 0, duration: 4000, useNativeDriver: true })
            ])
        ).start();
    }, []);

    const rotate = rotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg']
    });

    const floatY = floatAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -20]
    });

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

            {/* Light Premium Background */}
            <LinearGradient
                colors={['#ffffff', '#f8f9ff', '#f0f4ff']}
                style={StyleSheet.absoluteFillObject}
            />

            <Animated.View style={[styles.glowOrb, { transform: [{ rotate }] }]}>
                <LinearGradient
                    colors={['rgba(166, 110, 255, 0.12)', 'transparent']}
                    style={styles.orbInner}
                />
            </Animated.View>

            <View style={[styles.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
                <View style={styles.topSection}>
                    <Animated.View style={[styles.heroIconWrapper, { transform: [{ translateY: floatY }] }]}>
                        <View style={styles.iconGlow} />
                        <View style={styles.logoContainer}>
                            <Image
                                source={{ uri: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/website/Logomain.png' }}
                                style={styles.heroLogo}
                                resizeMode="contain"
                            />
                        </View>
                    </Animated.View>

                    <Animated.View style={[styles.textContainer, { opacity: fadeAnim, transform: [{ translateY }] }]}>
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>TEMPORAL PROTOCOL 2.2</Text>
                        </View>
                        <Text style={styles.appName}>kapsely</Text>
                        <Text style={styles.slogan}>BRIDGE THROUGH TIME</Text>

                        <Text style={styles.conceptText}>
                            The premier digital sanctuary for your future memories. 
                            <Text style={{ color: Colors.primary, fontFamily: Fonts.bold }}> Secure. </Text>
                            Timed. Private.
                        </Text>
                    </Animated.View>
                </View>

                <Animated.View style={[styles.bottomSection, { opacity: fadeAnim, transform: [{ translateY }] }]}>
                    <TouchableOpacity onPress={onNavigateToRegister} activeOpacity={0.8} style={styles.btnWrapper}>
                        <LinearGradient
                            colors={Gradients.primary as any}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={styles.primaryBtn}
                        >
                            <Text style={styles.primaryBtnText}>Sign Up</Text>
                            <Ionicons name="arrow-forward" size={18} color="white" />
                        </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={onNavigateToLogin} activeOpacity={0.7} style={styles.secondaryBtn}>
                        <BlurView intensity={20} tint="light" style={styles.blurBtn}>
                            <Text style={styles.secondaryBtnText}>Log In</Text>
                        </BlurView>
                    </TouchableOpacity>

                    <Text style={styles.footerNote}>© 2026 KAPSELY INC. // SECURED ENCRYPTION</Text>
                </Animated.View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#ffffff',
    },
    glowOrb: {
        position: 'absolute',
        top: -100,
        right: -150,
        width: 600,
        height: 600,
        borderRadius: 300,
    },
    orbInner: {
        width: '100%',
        height: '100%',
        borderRadius: 300,
    },
    content: {
        flex: 1,
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.xl,
        paddingTop: 40,
        paddingBottom: 20,
    },
    topSection: {
        alignItems: 'center',
    },
    heroIconWrapper: {
        marginBottom: Spacing.xl,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconGlow: {
        position: 'absolute',
        width: 140,
        height: 140,
        borderRadius: 70,
        backgroundColor: Colors.primaryGlow,
        opacity: 0.8,
    },
    logoContainer: {
        width: 140,
        height: 140,
        justifyContent: 'center',
        alignItems: 'center',
    },
    heroLogo: {
        width: '100%',
        height: '100%',
    },
    textContainer: {
        alignItems: 'center',
    },
    badge: {
        backgroundColor: Colors.borderLight,
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: BorderRadius.full,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: Colors.divider,
    },
    badgeText: {
        fontSize: 10,
        fontFamily: Fonts.bold,
        color: Colors.textMuted,
        letterSpacing: 2.5,
    },
    appName: {
        color: Colors.textPrimary,
        fontSize: 64,
        fontFamily: Fonts.bold,
        letterSpacing: -3.5,
        marginBottom: -4,
    },
    slogan: {
        color: Colors.primaryDark,
        fontSize: 13,
        fontFamily: Fonts.bold,
        letterSpacing: 4,
        marginBottom: Spacing.lg,
    },
    conceptText: {
        color: Colors.textSecondary,
        fontSize: 16,
        fontFamily: Fonts.regular,
        textAlign: 'center',
        lineHeight: 26,
        paddingHorizontal: Spacing.md,
    },
    bottomSection: {
        width: '100%',
        gap: Spacing.md,
        alignItems: 'center',
    },
    btnWrapper: {
        width: '100%',
        ...Shadow.primary,
    },
    primaryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 18,
        borderRadius: BorderRadius.xl,
        gap: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    primaryBtnText: {
        color: '#FFFFFF',
        fontSize: 17,
        fontFamily: Fonts.bold,
        letterSpacing: 0.5,
    },
    secondaryBtn: {
        width: '100%',
        borderRadius: BorderRadius.xl,
        overflow: 'hidden',
        borderWidth: 1.5,
        borderColor: Colors.border,
    },
    blurBtn: {
        paddingVertical: 17,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.5)',
    },
    secondaryBtnText: {
        color: Colors.textPrimary,
        fontSize: 16,
        fontFamily: Fonts.semiBold,
    },
    footerNote: {
        color: Colors.textMuted,
        fontSize: 9,
        fontFamily: Fonts.medium,
        letterSpacing: 1,
        marginTop: Spacing.md,
        opacity: 0.6,
    },
});
