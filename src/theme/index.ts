export const Colors = {
    // Core brand — more vibrant tech feel
    primary: '#a66eff',      // Radiant Cosmic Purple
    primaryLight: '#c59dff', 
    primaryDark: '#7938ff',
    primaryGlow: 'rgba(166, 110, 255, 0.22)',
    accent: '#00f2ff',       // Tech Cyan

    // Backgrounds — sleek and airy
    background: '#f8f9ff',   // Very light icy blue
    surface: '#ffffff',
    card: '#ffffff',
    cardAlt: '#f4f0ff',
    border: 'rgba(166, 110, 255, 0.14)',
    borderLight: 'rgba(166, 110, 255, 0.07)',

    // Text — high contrast
    textPrimary: '#0f0a1d',
    textSecondary: '#3e345e',
    textMuted: '#948cb3',
    textAccent: '#8a4dff',

    // Capsule Types — modern tech palette
    eventCap: '#ff4d4d',     // Electric Red
    eventCapLight: 'rgba(255, 77, 77, 0.08)',
    instaCap: '#a66eff',
    instaCapLight: 'rgba(166, 110, 255, 0.12)',
    legacyCap: '#ffb300',    // Cyber Gold
    legacyCapLight: 'rgba(255, 179, 0, 0.1)',

    // Status
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#0ea5e9',

    // UI & Glassmorphism
    tabBar: '#ffffff',
    tabBarBorder: 'rgba(166, 110, 255, 0.1)',
    overlay: 'rgba(15, 10, 29, 0.55)',
    glass: 'rgba(255, 255, 255, 0.82)',
    glassDark: 'rgba(15, 10, 29, 0.75)',

    // Branding / Dividers
    shadow: 'rgba(166, 110, 255, 0.12)',
    divider: 'rgba(166, 110, 255, 0.08)',

    // Helpers
    getAvatarUrl: (url?: string | null, name?: string | null) => {
        if (url) return url;
        const seed = name || 'U';
        return `https://ui-avatars.com/api/?background=a66eff&color=fff&name=${encodeURIComponent(seed)}&size=256`;
    }
};

export const Gradients = {
    primary: ['#a66eff', '#7938ff'] as const,
    cosmic: ['#7938ff', '#a66eff', '#00f2ff'] as const,
    glass: ['rgba(255, 255, 255, 0.65)', 'rgba(255, 255, 255, 0.3)'] as const,
    dark: ['#1c1433', '#0f0a1d'] as const,
    surface: ['#ffffff', '#f8f9ff'] as const,
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
    xs: 6,
    sm: 10,
    md: 14,
    lg: 20,
    xl: 28,
    full: 999,
};

import { Platform } from 'react-native';

export const Shadow = Platform.select({
    web: {
        primary: { boxShadow: '0px 8px 24px rgba(166, 110, 255, 0.22)' },
        card: { boxShadow: '0px 4px 16px rgba(166, 110, 255, 0.12)' },
        subtle: { boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.04)' },
        lg: { boxShadow: '0px 12px 40px rgba(0, 0, 0, 0.08)' },
    },
    ios: {
        primary: {
            shadowColor: '#7938ff',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.22,
            shadowRadius: 20,
        },
        card: {
            shadowColor: '#a66eff',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.12,
            shadowRadius: 14,
        },
        subtle: {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.04,
            shadowRadius: 8,
        },
        lg: {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.1,
            shadowRadius: 24,
        },
    },
    android: {
        primary: { elevation: 8 },
        card: { elevation: 4 },
        subtle: { elevation: 2 },
        lg: { elevation: 12 },
    },
    default: {
        primary: {},
        card: {},
        subtle: {},
        lg: {}
    }
}) as any;

export * from './DesignTokens';

