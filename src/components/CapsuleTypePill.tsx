import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, BorderRadius, Spacing } from '../theme';
import { CapsuleType } from '../data/mockCapsules';

interface CapsuleTypePillProps {
    type: CapsuleType | 'all';
    label: string;
    isActive: boolean;
    onPress: () => void;
}

const typeColors: Record<string, string> = {
    all: Colors.primary,
    instacap: Colors.instaCap,
    eventcap: Colors.eventCap,
    legacycap: Colors.legacyCap,
};

const typeIcons: Record<string, string> = {
    all: 'apps-outline',
    instacap: 'camera-outline',
    eventcap: 'calendar-outline',
    legacycap: 'time-outline',
};

export default function CapsuleTypePill({ type, label, isActive, onPress }: CapsuleTypePillProps) {
    const color = typeColors[type];

    return (
        <TouchableOpacity
            onPress={onPress}
            style={[
                styles.pill,
                isActive
                    ? { backgroundColor: color + '18', borderColor: color }
                    : { backgroundColor: Colors.surface, borderColor: Colors.border },
            ]}
            activeOpacity={0.7}
        >
            <Ionicons name={typeIcons[type] as any} size={12} color={isActive ? color : Colors.textMuted} />
            <Text style={[styles.label, { color: isActive ? color : Colors.textMuted }]}>{label}</Text>
            {isActive && <View style={[styles.activeDot, { backgroundColor: color }]} />}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingVertical: 8,
        borderRadius: BorderRadius.full,
        borderWidth: 1.5,
        marginRight: Spacing.sm,
        gap: 5,
    },
    label: { fontSize: 12, fontFamily: Fonts.semiBold },
    activeDot: { width: 5, height: 5, borderRadius: 2.5, marginLeft: 2 },
});
