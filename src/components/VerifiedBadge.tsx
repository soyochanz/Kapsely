import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';

interface VerifiedBadgeProps {
    size?: number;
    style?: any;
}

/**
 * VerifiedBadge — diamond (rotated rounded square) with indigo→violet gradient.
 *
 * Fix: the SVG canvas is oversized (1.5× the visible size) so the rotated
 * diamond never clips. The outer <View> is clipped to `size × size`.
 */
export default function VerifiedBadge({ size = 18, style }: VerifiedBadgeProps) {
    // Canvas is larger than the badge so rotation never clips
    const canvas = size * 1.5;
    const cx = canvas / 2;
    const cy = canvas / 2;

    // Diamond side = size * 0.82 so there's breathing room inside the canvas
    const side = size * 0.82;
    const r = side * 0.22;

    // Checkmark: coordinates inside the canvas, scaled proportionally
    // Using a 10×10 grid scaled to `size`, centred in the canvas
    const offset = (canvas - size) / 2; // shift to centre the 10-unit grid
    const s = size / 10;
    const ck = {
        x1: offset + 2.0 * s, y1: offset + 5.1 * s,
        x2: offset + 4.1 * s, y2: offset + 7.3 * s,
        x3: offset + 8.1 * s, y3: offset + 2.8 * s,
    };
    const strokeW = Math.max(1.5, size * 0.135);

    return (
        <View
            style={[
                styles.outer,
                style,
                { width: size, height: size },
            ]}
        >
            {/* overflow hidden clips the oversized canvas to size×size */}
            <View style={{ width: canvas, height: canvas, marginLeft: -(canvas - size) / 2, marginTop: -(canvas - size) / 2 }}>
                <Svg width={canvas} height={canvas} viewBox={`0 0 ${canvas} ${canvas}`}>
                    <Defs>
                        <LinearGradient id="vbg" x1="0" y1="0" x2="1" y2="1">
                            <Stop offset="0%" stopColor="#6366F1" stopOpacity="1" />
                            <Stop offset="100%" stopColor="#8B5CF6" stopOpacity="1" />
                        </LinearGradient>
                    </Defs>

                    {/* Rotated diamond */}
                    <Rect
                        x={cx - side / 2}
                        y={cy - side / 2}
                        width={side}
                        height={side}
                        rx={r}
                        ry={r}
                        fill="url(#vbg)"
                        rotation={45}
                        origin={`${cx}, ${cy}`}
                    />

                    {/* Checkmark — not rotated, stays upright */}
                    <Path
                        d={`M${ck.x1} ${ck.y1} L${ck.x2} ${ck.y2} L${ck.x3} ${ck.y3}`}
                        fill="none"
                        stroke="#FFFFFF"
                        strokeWidth={strokeW}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </Svg>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    outer: {
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        ...Platform.select({
            web: {
                filter: 'drop-shadow(0px 1px 4px rgba(99, 102, 241, 0.5))',
                overflow: 'visible',
            },
            ios: {
                overflow: 'visible',
                shadowColor: '#6366F1',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.45,
                shadowRadius: 3,
            },
            android: {
                elevation: 3,
            },
        }),
    },
});