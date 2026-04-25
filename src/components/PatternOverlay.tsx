import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Rect, Circle, Defs, Pattern } from 'react-native-svg';

interface PatternOverlayProps {
    color?: string;
    size?: number;
    gap?: number;
    opacity?: number;
}

/**
 * A subtle, elegant dotted grid pattern for premium backgrounds.
 */
export const PatternOverlay: React.FC<PatternOverlayProps> = ({ 
    color = 'rgba(0,0,0,0.2)', 
    size = 2, 
    gap = 20, 
    opacity = 0.3 
}) => {
    const patternId = React.useId().replace(/:/g, ''); // Unique ID for each list item

    return (
        <View style={[StyleSheet.absoluteFill, { opacity }, { pointerEvents: 'none' }]}>
            <Svg width="100%" height="100%">
                <Defs>
                    <Pattern
                        id={`gridPattern_${patternId}`}
                        x="0"
                        y="0"
                        width={gap}
                        height={gap}
                        patternUnits="userSpaceOnUse"
                    >
                        <Circle 
                            cx={size / 2} 
                            cy={size / 2} 
                            r={size / 2} 
                            fill={color} 
                        />
                    </Pattern>
                </Defs>
                <Rect width="100%" height="100%" fill={`url(#gridPattern_${patternId})`} />
            </Svg>
        </View>
    );
};

export default PatternOverlay;
