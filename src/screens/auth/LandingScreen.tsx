import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Animated, StatusBar, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Spacing, BorderRadius, Shadow } from '../../theme';

const { width, height } = Dimensions.get('window');

interface Props {
    onNavigateToLogin: () => void;
    onNavigateToRegister: () => void;
}

export default function LandingScreen({ onNavigateToLogin, onNavigateToRegister }: Props) {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(40)).current;
    const floatAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 1000,
                delay: 150,
                useNativeDriver: true,
            }),
            Animated.spring(translateY, {
                toValue: 0,
                tension: 40,
                friction: 7,
                delay: 150,
                useNativeDriver: true,
            }),
        ]).start();

        Animated.loop(
            Animated.sequence([
                Animated.timing(floatAnim, { toValue: 1, duration: 3000, useNativeDriver: true }),
                Animated.timing(floatAnim, { toValue: 0, duration: 3000, useNativeDriver: true })
            ])
        ).start();
    }, []);

    const floatY = floatAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -15]
    });

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

            {/* Aesthetic Background */}
            <LinearGradient
                colors={['#ffffff', '#fcfaff', '#f3ebff']}
                style={StyleSheet.absoluteFillObject}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            />

            {/* Glowing Orbs */}
            <View style={styles.glowCircle1} />
            <View style={styles.glowCircle2} />

            <View style={styles.content}>
                <View style={styles.topSection}>
                    <Animated.View style={[styles.heroIconWrapper, { transform: [{ translateY: floatY }] }]}>
                        <LinearGradient
                            colors={[Colors.primary, Colors.primaryLight]}
                            style={styles.heroIconBg}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        >
                            <Image
                                source={{ uri: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/website/Logomain.png' }}
                                style={styles.heroLogo}
                                resizeMode="contain"
                            />
                        </LinearGradient>
                    </Animated.View>

                    <Animated.View style={[styles.textContainer, { opacity: fadeAnim, transform: [{ translateY }] }]}>
                        <Text style={styles.appName}>kapsely</Text>
                        <Text style={styles.slogan}>The future of sharing.</Text>

                        <Text style={styles.conceptText}>
                            Seal your memories in digital capsules today.{"\n"}
                            Unveil them when the time is right.
                        </Text>
                    </Animated.View>
                </View>

                <Animated.View style={[styles.bottomSection, { opacity: fadeAnim, transform: [{ translateY }] }]}>
                    <TouchableOpacity onPress={onNavigateToRegister} activeOpacity={0.8} style={styles.btnWrapper}>
                        <LinearGradient
                            colors={[Colors.primary, Colors.primaryDark]}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={styles.primaryBtn}
                        >
                            <Text style={styles.primaryBtnText}>Get Started</Text>
                            <Ionicons name="arrow-forward" size={20} color="white" />
                        </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={onNavigateToLogin} activeOpacity={0.7} style={styles.secondaryBtn}>
                        <Text style={styles.secondaryBtnText}>I already have an account</Text>
                    </TouchableOpacity>
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
    glowCircle1: {
        position: 'absolute',
        top: -height * 0.1,
        right: -width * 0.2,
        width: width * 1.2,
        height: width * 1.2,
        borderRadius: width * 0.6,
        backgroundColor: Colors.primaryGlow,
        opacity: 0.6,
    },
    glowCircle2: {
        position: 'absolute',
        bottom: height * 0.1,
        left: -width * 0.4,
        width: width * 1.2,
        height: width * 1.2,
        borderRadius: width * 0.6,
        backgroundColor: Colors.instaCapLight,
        opacity: 0.5,
    },
    content: {
        flex: 1,
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.xl,
        paddingTop: height * 0.18,
        paddingBottom: height * 0.08,
    },
    topSection: {
        alignItems: 'center',
    },
    heroIconWrapper: {
        ...Shadow.primary,
        shadowRadius: 30,
        marginBottom: Spacing.xl,
    },
    heroIconBg: {
        width: 110,
        height: 110,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 4,
        borderColor: '#ffffff',
        overflow: 'hidden',
    },
    heroLogo: {
        width: '70%',
        height: '70%',
    },
    textContainer: {
        alignItems: 'center',
    },
    appName: {
        color: Colors.textPrimary,
        fontSize: 52,
        fontFamily: Fonts.bold,
        letterSpacing: -1.8,
        marginBottom: 2,
    },
    slogan: {
        color: Colors.primary,
        fontSize: 18,
        fontFamily: Fonts.semiBold,
        letterSpacing: 0.5,
        marginBottom: Spacing.md,
    },
    conceptText: {
        color: Colors.textSecondary,
        fontSize: 15,
        fontFamily: Fonts.regular,
        textAlign: 'center',
        lineHeight: 24,
        paddingHorizontal: Spacing.lg,
    },
    bottomSection: {
        width: '100%',
        gap: Spacing.md,
    },
    btnWrapper: {
        ...Shadow.primary,
        shadowRadius: 12,
    },
    primaryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 18,
        borderRadius: BorderRadius.xl,
        gap: 12,
    },
    primaryBtnText: {
        color: '#FFFFFF',
        fontSize: 17,
        fontFamily: Fonts.bold,
        letterSpacing: 0.5,
    },
    secondaryBtn: {
        paddingVertical: 16,
        alignItems: 'center',
        borderRadius: BorderRadius.xl,
        backgroundColor: Colors.cardAlt,
        borderWidth: 1,
        borderColor: Colors.borderLight,
    },
    secondaryBtnText: {
        color: Colors.primaryDark,
        fontSize: 15,
        fontFamily: Fonts.semiBold,
    },
});
