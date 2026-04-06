import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
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
    date, modelId, style, configOverride, hideLabel, lightweight
}: LiveTimerProps & { lightweight?: boolean }) => {
    const [label, setLabel] = useState('');
    const [savedConfig, setSavedConfig] = useState<ModelTimerConfig | null>(null);
    const { t } = useTranslation();

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
            if (!date) {
                setLabel('');
                return 0;
            }
            const end = new Date(date).getTime();
            if (isNaN(end)) {
                setLabel('');
                return 0;
            }
            const now = Date.now();
            const diff = end - now;

            let newLabel = '';
            if (diff <= 0) {
                newLabel = t('common.ready') ?? 'Ready!';
            } else {
                const activeFormat = config?.format ?? 'standard';
                const totalHours = diff / (1000 * 60 * 60);
                const totalDays = Math.floor(totalHours / 24);

                if (activeFormat === 'days' || totalHours > 72) {
                    if (totalDays > 730) {
                        const years = Math.floor(totalDays / 365);
                        newLabel = `${years} ${years === 1 ? t('common.year') : t('common.years')}`;
                    } else if (totalDays > 365) {
                        const months = Math.floor(totalDays / 30);
                        newLabel = `${months} ${months === 1 ? t('common.month') : t('common.months')}`;
                    } else {
                        newLabel = `${totalDays} ${t('common.days')}`;
                    }
                } else {
                    const h = Math.floor(totalHours);
                    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                    const s = Math.floor((diff % (1000 * 60)) / 1000);
                    newLabel = `${h}:${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
                }
            }

            setLabel(prev => {
                if (prev === newLabel) return prev;
                return newLabel;
            });

            return diff;
        };

        const initialDiff = update();
        
        // Optimization: If distant (> 72h) or Ready or lightweight, don't tick every second
        const isFar = initialDiff > (72 * 3600000);
        const isReady = initialDiff <= 0;
        
        if (isReady || (lightweight && isFar)) {
            // Check again in 1 minute instead of every second
            const timer = setInterval(update, 60000);
            return () => clearInterval(timer);
        }

        const timer = setInterval(update, 1000);
        return () => clearInterval(timer);
    }, [date, config, t, lightweight]);

    const renderContent = () => {
        const isReadyString = label === 'Ready!' || label === '¡Lista!' || label === 'Ready';
        if (!config || config.curvature === 0 || isReadyString) {
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
