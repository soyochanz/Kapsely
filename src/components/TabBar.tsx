import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts } from '../theme';

const TAB_CONFIG = [
    { name: 'Feed', icon: 'home-outline', iconActive: 'home', label: 'Home' },
    { name: 'Notifications', icon: 'notifications-outline', iconActive: 'notifications', label: 'Alerts' },
    { name: 'Create', icon: 'add', iconActive: 'add', label: '', isCenter: true },
    { name: 'Search', icon: 'search-outline', iconActive: 'search', label: 'Search' },
    { name: 'Profile', icon: 'person-outline', iconActive: 'person', label: 'Profile' },
];

export const TAB_BAR_HEIGHT = 72;

export default function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
    return (
        <View style={styles.wrapper}>
            <View style={styles.bar}>
                {state.routes.map((route, index) => {
                    const isFocused = state.index === index;
                    const cfg = TAB_CONFIG[index];

                    const onPress = () => {
                        const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                        if (!isFocused && !event.defaultPrevented) {
                            if (route.name === 'Create') {
                                (navigation as any).navigate('CreateSelection');
                            } else {
                                navigation.navigate(route.name);
                            }
                        }
                    };

                    // ── Center Create button ─────────────────────────────────────────
                    if (cfg.isCenter) {
                        return (
                            <TouchableOpacity
                                key={route.key}
                                onPress={onPress}
                                style={styles.centerWrapper}
                                activeOpacity={0.88}
                            >
                                {/* soft glow halo */}
                                <View style={styles.centerGlow} />
                                <LinearGradient
                                    colors={[Colors.primaryLight, Colors.primary, Colors.primaryDark]}
                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                                    style={styles.centerBtn}
                                >
                                    <Ionicons name="add" size={32} color="#fff" />
                                </LinearGradient>
                            </TouchableOpacity>
                        );
                    }

                    // ── Regular tabs ─────────────────────────────────────────────────
                    return (
                        <TouchableOpacity
                            key={route.key}
                            onPress={onPress}
                            style={styles.tab}
                            activeOpacity={0.7}
                        >
                            {/* filled pill when active */}
                            {isFocused && <View style={styles.activePill} />}

                            <Ionicons
                                name={(isFocused ? cfg.iconActive : cfg.icon) as any}
                                size={22}
                                color={isFocused ? Colors.primary : Colors.textMuted}
                            />
                            <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>
                                {cfg.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        backgroundColor: Colors.tabBar,
        borderTopWidth: 1,
        borderTopColor: Colors.tabBarBorder,
        ...Platform.select({
            web: { boxShadow: '0px -4px 16px rgba(0, 0, 0, 0.07)' },
            default: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: -4 },
                shadowOpacity: 0.07,
                shadowRadius: 16,
                elevation: 24,
            }
        }),
    },
    bar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingTop: 6,
        paddingBottom: Platform.OS === 'ios' ? 28 : 10,
        height: TAB_BAR_HEIGHT,
    },

    // ── Regular tab ──
    tab: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 6,
        gap: 3,
        position: 'relative',
        borderRadius: 14,
        overflow: 'hidden',
    },
    activePill: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: Colors.primary + '13',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: Colors.primary + '25',
    },
    tabLabel: {
        fontSize: 9,
        fontFamily: Fonts.medium,
        color: Colors.textMuted,
    },
    tabLabelActive: {
        color: Colors.primary,
        fontFamily: Fonts.semiBold,
    },

    // ── Center Create ──
    centerWrapper: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        marginTop: -20,
    },
    centerGlow: {
        position: 'absolute',
        width: 74, height: 74,
        borderRadius: 37,
        backgroundColor: Colors.primary,
        opacity: 0.14,
    },
    centerBtn: {
        width: 60, height: 60,
        borderRadius: 30,
        alignItems: 'center',
        justifyContent: 'center',
        ...Platform.select({
            web: { boxShadow: `0px 8px 18px ${Colors.primary}72` },
            default: {
                shadowColor: Colors.primary,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.45,
                shadowRadius: 18,
                elevation: 16,
            }
        }),
        borderWidth: 2.5,
        borderColor: 'rgba(255,255,255,0.35)',
    },
});
