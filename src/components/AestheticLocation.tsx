import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

interface AestheticLocationProps {
    name: string;
    compact?: boolean;
    dark?: boolean;
}

export default function AestheticLocation({ name, compact, dark }: AestheticLocationProps) {
    if (!name) return null;

    if (compact) {
        return (
            <View style={[s.compact, dark && s.darkCompact]}>
                <Ionicons name="location" size={10} color={dark ? '#fff' : '#7C3AED'} />
                <Text style={[s.compactText, dark && s.darkText]} numberOfLines={1}>
                    {name}
                </Text>
            </View>
        );
    }

    return (
        <View style={s.container}>
            {Platform.OS === 'ios' ? (
                <BlurView intensity={20} tint={dark ? 'dark' : 'light'} style={s.glass}>
                    <LocationContent name={name} dark={dark} />
                </BlurView>
            ) : (
                <View style={[s.glass, s.androidGlass, dark && s.androidGlassDark]}>
                    <LocationContent name={name} dark={dark} />
                </View>
            )}
        </View>
    );
}

function LocationContent({ name, dark }: { name: string; dark?: boolean }) {
    return (
        <View style={s.content}>
            <View style={[s.iconCircle, dark && s.darkIconCircle]}>
                <Ionicons name="location-sharp" size={12} color={dark ? '#fff' : '#7C3AED'} />
            </View>
            <Text style={[s.fullText, dark && s.darkText]} numberOfLines={1}>
                {name}
            </Text>
        </View>
    );
}

const s = StyleSheet.create({
    container: {
        borderRadius: 12,
        overflow: 'hidden',
        alignSelf: 'flex-start',
    },
    glass: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        flexDirection: 'row',
        alignItems: 'center',
    },
    androidGlass: {
        backgroundColor: 'rgba(255,255,255,0.85)',
        borderWidth: 1,
        borderColor: 'rgba(124,58,237,0.1)',
    },
    androidGlassDark: {
        backgroundColor: 'rgba(10,8,20,0.7)',
        borderColor: 'rgba(255,255,255,0.15)',
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    iconCircle: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: 'rgba(124,58,237,0.12)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    darkIconCircle: {
        backgroundColor: 'rgba(255,255,255,0.15)',
    },
    fullText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#4B5563',
        letterSpacing: -0.2,
    },
    compact: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 6,
        paddingVertical: 3,
        backgroundColor: 'rgba(255,255,255,0.7)',
        borderRadius: 6,
    },
    darkCompact: {
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    compactText: {
        fontSize: 9,
        fontWeight: '700',
        color: '#6D28D9',
        maxWidth: 100,
    },
    darkText: {
        color: '#fff',
    },
});
