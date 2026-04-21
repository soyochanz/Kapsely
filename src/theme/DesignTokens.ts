import { Platform } from 'react-native';

export const P = {
    // Purples
    p50: '#F5F3FF',
    p100: '#EDE9FE',
    p200: '#DDD6FE',
    p300: '#C4B5FD',
    p400: '#A78BFA',
    p500: '#8B5CF6',
    p600: '#7C3AED',
    p700: '#6D28D9',
    p800: '#5B21B6',
    // Neutrals
    white: '#FFFFFF',
    gray50: '#FAFAFA',
    gray100: '#F4F4F5',
    gray200: '#E4E4E7',
    gray300: '#D1D1D6',
    gray400: '#A1A1AA',
    gray500: '#71717A',
    gray700: '#3F3F46',
    gray900: '#18181B',
    // Semantic
    red: '#EF4444',
    redPale: '#FEF2F2',
    green: '#10B981',
};

export const R = { xs: 8, sm: 14, md: 18, lg: 24, xl: 32, full: 999 };

export const shadow = {
    soft: Platform.select({
        ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10 },
        android: { elevation: 3 },
        default: {}
    }),
    medium: Platform.select({
        ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 15 },
        android: { elevation: 8 },
        default: {}
    }),
    purple: Platform.select({
        ios: { shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.22, shadowRadius: 20 },
        android: { elevation: 12 },
        default: {}
    })
};
