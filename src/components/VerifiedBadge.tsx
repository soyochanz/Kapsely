import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle, Polygon } from 'react-native-svg';

interface VerifiedBadgeProps {
    size?: number;
    style?: any;
}

/**
 * VerifiedBadge — hexagonal shield with purple gradient and a clean checkmark.
 * Modern, distinctive, purple. No diamond — that reads too generic.
 */
export default function VerifiedBadge({ size = 18, style }: VerifiedBadgeProps) {
    const s = size;
    const cx = s / 2;
    const cy = s / 2;

    // Hexagon points (flat-top orientation, slightly taller than wide)
    // Centered at (cx, cy), radius = size * 0.48
    const R = s * 0.48;
    const hexPoints = Array.from({ length: 6 }, (_, i) => {
        const angle = (Math.PI / 180) * (60 * i - 30);
        return `${cx + R * Math.cos(angle)},${cy + R * Math.sin(angle)}`;
    }).join(' ');

    // Inner hex for subtle border ring (slightly smaller)
    const Ri = R * 0.88;
    const innerHexPoints = Array.from({ length: 6 }, (_, i) => {
        const angle = (Math.PI / 180) * (60 * i - 30);
        return `${cx + Ri * Math.cos(angle)},${cy + Ri * Math.sin(angle)}`;
    }).join(' ');

    // Checkmark path — bold, centred, slightly lower-left to upper-right
    const ck = {
        x1: cx - s * 0.17, y1: cy + s * 0.01,
        x2: cx - s * 0.02, y2: cy + s * 0.16,
        x3: cx + s * 0.20, y3: cy - s * 0.13,
    };
    const strokeW = Math.max(1.4, s * 0.13);

    return (
        <View
            style={[
                {
                    width: size,
                    height: size,
                    ...Platform.select({
                        ios: {
                            shadowColor: '#7c3aed',
                            shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: 0.55,
                            shadowRadius: size * 0.28,
                        },
                        android: { elevation: 4 },
                        web: {
                            filter: `drop-shadow(0px 1px ${size * 0.22}px rgba(124, 58, 237, 0.6))`,
                        },
                    }),
                },
                style,
            ]}
        >
            <Svg width={size} height={size} viewBox={`0 0 ${s} ${s}`}>
                <Defs>
                    {/* Main fill: deep purple → violet */}
                    <LinearGradient id="vgrad" x1="0" y1="0" x2="1" y2="1">
                        <Stop offset="0%" stopColor="#6d28d9" stopOpacity="1" />
                        <Stop offset="55%" stopColor="#7c3aed" stopOpacity="1" />
                        <Stop offset="100%" stopColor="#a855f7" stopOpacity="1" />
                    </LinearGradient>
                    {/* Shine overlay: subtle top-left highlight */}
                    <LinearGradient id="shine" x1="0" y1="0" x2="0.6" y2="1">
                        <Stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
                        <Stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                    </LinearGradient>
                </Defs>

                {/* Hexagon fill */}
                <Polygon points={hexPoints} fill="url(#vgrad)" />

                {/* Shine layer */}
                <Polygon points={hexPoints} fill="url(#shine)" />

                {/* Inner ring — 1px border to add depth */}
                <Polygon
                    points={innerHexPoints}
                    fill="none"
                    stroke="rgba(255,255,255,0.18)"
                    strokeWidth={0.7}
                />

                {/* Checkmark */}
                <Path
                    d={`M${ck.x1} ${ck.y1} L${ck.x2} ${ck.y2} L${ck.x3} ${ck.y3}`}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth={strokeW}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </Svg>
        </View>
    );
}