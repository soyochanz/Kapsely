import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface VerifiedBadgeProps {
    size?: number;
    style?: any;
}

export default function VerifiedBadge({ size = 16, style }: VerifiedBadgeProps) {
    // 8 sides star or just a classic checked badge but with nice gradient background
    return (
        <View style={[styles.container, style, { width: size, height: size, borderRadius: size / 2 }]}>
            <LinearGradient
                colors={['#00d2ff', '#3a7bd5']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.gradient, { borderRadius: size / 2 }]}
            >
                <MaterialIcons name="check" size={size * 0.7} color="#fff" />
            </LinearGradient>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        justifyContent: 'center',
        alignItems: 'center',
        ...Platform.select({
            web: { boxShadow: '0px 2px 4px rgba(58, 123, 213, 0.4)' },
            ios: {
                shadowColor: '#3a7bd5',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.4,
                shadowRadius: 4,
            },
            android: {
                elevation: 3,
            }
        }),
        marginLeft: 4, // standard spacing from text
    },
    gradient: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    }
});
