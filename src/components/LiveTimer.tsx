import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { timerConfigManager, ModelTimerConfig } from '../utils/timerConfig';
import { Fonts } from '../theme';

interface LiveTimerProps {
    date: string;
    modelId?: string;
    style?: any;
    configOverride?: ModelTimerConfig; // Higher priority for tool preview
    hideLabel?: boolean; // New prop to hide text (e.g. when opened)
}

const FONT_MAP: Record<string, string> = {
    'monospace': 'monospace',
    'Inter_700Bold': Fonts.bold,
    'Inter_400Regular': Fonts.regular,
    'serif': Platform.OS === 'ios' ? 'Times New Roman' : 'serif',
};

const LiveTimer = React.memo(({
    date, modelId, style, configOverride, hideLabel
}: LiveTimerProps) => {
    const [label, setLabel] = useState('');
    const [savedConfig, setSavedConfig] = useState<ModelTimerConfig | null>(null);

    const config = configOverride || savedConfig;

    useEffect(() => {
        if (!modelId) return;
        const updateConfig = () => {
            const newConfig = timerConfigManager.getConfig(modelId);
            setSavedConfig(newConfig);
        };
        updateConfig();
        return timerConfigManager.subscribe(updateConfig);
    }, [modelId]);

    useEffect(() => {
        const update = () => {
            const end = new Date(date).getTime();
            const now = Date.now();
            const diff = end - now;

            if (diff <= 0) {
                setLabel('Ready!');
                return;
            }

            const activeFormat = config?.format ?? 'standard';
            const totalHours = diff / (1000 * 60 * 60);
            const totalDays = Math.floor(totalHours / 24);

            if (activeFormat === 'days' || totalHours > 72) {
                if (totalDays > 730) { // More than 24 months
                    const years = Math.floor(totalDays / 365);
                    setLabel(`${years} ${years === 1 ? 'year' : 'years'}`);
                } else if (totalDays > 365) { // More than 1 year (365 days)
                    const months = Math.floor(totalDays / 30);
                    setLabel(`${months} ${months === 1 ? 'month' : 'months'}`);
                } else {
                    setLabel(`${totalDays} ${totalDays === 1 ? 'day' : 'days'}`);
                }
            } else {
                const h = Math.floor(totalHours);
                const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const s = Math.floor((diff % (1000 * 60)) / 1000);
                setLabel(`${h}:${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`);
            }
        };

        update();
        const timer = setInterval(update, 1000);
        return () => clearInterval(timer);
    }, [date, config]);

    const renderContent = () => {
        if (!config || config.curvature === 0 || label === 'Ready!') {
            return (
                <Text style={[
                    style,
                    config && { color: config.color, fontFamily: FONT_MAP[config.fontId] || 'monospace' },
                ]}>
                    {label}
                </Text>
            );
        }

        return label.split('').map((char, i, arr) => {
            const curve = config.curvature;
            const radius = 60 / (Math.abs(curve) || 1);
            const centerIdx = (arr.length - 1) / 2;
            const offset = i - centerIdx;
            const angle = offset * (curve * 0.1);
            const translateY = (Math.cos(angle) - 1) * radius * (curve > 0 ? 1 : -1);

            return (
                <Text
                    key={i}
                    style={[
                        style,
                        {
                            color: config.color,
                            fontFamily: FONT_MAP[config.fontId] || 'monospace',
                            transform: [{ rotate: `${angle}rad` }, { translateY: translateY }],
                        }
                    ]}
                >
                    {char}
                </Text>
            );
        });
    };

    if (hideLabel) return null;

    return (
        <View style={styles.curvedContainer}>
            {renderContent()}
        </View>
    );
});

export default LiveTimer;

const styles = StyleSheet.create({
    curvedContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    }
});
