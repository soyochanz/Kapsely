export const Colors = {
    // Core brand
    primary: '#a269ff',
    primaryLight: '#c49cff',
    primaryDark: '#7c3cff',
    primaryGlow: 'rgba(162, 105, 255, 0.2)',

    // Backgrounds — light theme
    background: '#f7f5ff',
    surface: '#ffffff',
    card: '#ffffff',
    cardAlt: '#f0eaff',
    border: 'rgba(162, 105, 255, 0.18)',
    borderLight: 'rgba(162, 105, 255, 0.09)',

    // Text
    textPrimary: '#18122b',
    textSecondary: '#4a3e6a',
    textMuted: '#9b8fc0',
    textAccent: '#a269ff',

    // Capsule Types
    eventCap: '#e84545',
    eventCapLight: 'rgba(232, 69, 69, 0.08)',
    instaCap: '#a269ff',
    instaCapLight: 'rgba(162, 105, 255, 0.1)',
    legacyCap: '#d4a017',
    legacyCapLight: 'rgba(212, 160, 23, 0.1)',

    // Status
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',

    // UI
    tabBar: '#ffffff',
    tabBarBorder: 'rgba(162, 105, 255, 0.12)',
    overlay: 'rgba(24, 18, 43, 0.5)',
    glass: 'rgba(255, 255, 255, 0.88)',

    // Shadows & dividers
    shadow: 'rgba(162, 105, 255, 0.12)',
    divider: 'rgba(162, 105, 255, 0.1)',
};

export const Fonts = {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semiBold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
    light: 'Inter_300Light',
};

export const Spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
};

export const BorderRadius = {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    full: 999,
};

import { Platform } from 'react-native';

export const Shadow = Platform.select({
    web: {
        primary: { boxShadow: '0px 4px 16px rgba(162, 105, 255, 0.18)' },
        card: { boxShadow: '0px 2px 12px rgba(162, 105, 255, 0.08)' },
        subtle: { boxShadow: '0px 1px 6px rgba(0, 0, 0, 0.06)' },
        lg: { boxShadow: '0px 8px 30px rgba(0, 0, 0, 0.12)' },
    },
    default: {
        primary: {
            shadowColor: '#a269ff',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.18,
            shadowRadius: 16,
            elevation: 6,
        },
        card: {
            shadowColor: '#a269ff',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.08,
            shadowRadius: 12,
            elevation: 3,
        },
        subtle: {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06,
            shadowRadius: 6,
            elevation: 2,
        },
        lg: {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.15,
            shadowRadius: 20,
            elevation: 10,
        },
    }
}) || {
    primary: {},
    card: {},
    subtle: {},
    lg: {}
};

