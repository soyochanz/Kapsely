import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts } from '../../theme';

interface FilterChipProps {
    filterKey: string;
    isActive: boolean;
    onPress: (key: string) => void;
    t: any;
    icon: string;
    label: string;
    iconColor?: string;
}

export const FilterChip = React.memo(({ filterKey, isActive, onPress, t, icon, label, iconColor }: FilterChipProps) => {
    return (
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => onPress(filterKey)}
            style={[fc.chip, isActive && fc.chipActive]}
        >
            {isActive && (
                <LinearGradient
                    colors={[Colors.primary, Colors.primaryDark]}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                />
            )}
            <Ionicons
                name={(isActive ? icon.replace('-outline', '') : icon) as any}
                size={13}
                color={isActive ? '#fff' : (iconColor || Colors.textSecondary)}
            />
            <Text style={[fc.label, isActive && fc.labelActive]}>{label}</Text>
        </TouchableOpacity>
    );
});

const fc = StyleSheet.create({
    chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 30, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, overflow: 'hidden' },
    chipActive: { borderColor: 'transparent' },
    label: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textSecondary },
    labelActive: { color: '#fff', fontFamily: Fonts.bold },
});
