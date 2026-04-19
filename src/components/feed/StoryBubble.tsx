import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts } from '../../theme';

interface StoryBubbleProps {
    user: any;
    isOwn?: boolean;
    onPress: () => void;
}

export const StoryBubble = React.memo(({ user, isOwn, onPress }: StoryBubbleProps) => {
    const scaleAnim = useRef(new Animated.Value(1)).current;
    
    const handlePress = () => {
        Animated.sequence([
            Animated.timing(scaleAnim, { toValue: 0.92, duration: 70, useNativeDriver: true }),
            Animated.spring(scaleAnim, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
        ]).start();
        onPress();
    };
    
    const avatarUri = Colors.getAvatarUrl(user?.avatar_url, user?.display_name || user?.username);
    const label = isOwn ? 'Flash' : (user?.display_name || user?.username || 'user');
    const hasUnread = !user?.all_read;

    return (
        <Animated.View style={[st.wrap, { transform: [{ scale: scaleAnim }] }]}>
            <TouchableOpacity activeOpacity={1} onPress={handlePress} style={st.inner}>
                {isOwn && !user ? (
                    <View style={st.addWrap}>
                        <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={st.addRing}>
                            <Ionicons name="add" size={22} color="#fff" />
                        </LinearGradient>
                    </View>
                ) : hasUnread && !isOwn ? (
                    <LinearGradient
                        colors={[Colors.primary, Colors.primaryDark, '#00f2ff']}
                        style={st.ring} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }}
                    >
                        <View style={st.avatarWrap}>
                            <Image source={{ uri: avatarUri }} style={st.avatar} cachePolicy="memory-disk" transition={200} />
                        </View>
                    </LinearGradient>
                ) : (
                    <View style={[st.ring, st.ringRead, isOwn && { borderColor: Colors.primary + '80', borderStyle: 'dashed' }]}>
                        <View style={st.avatarWrap}>
                            <Image source={{ uri: avatarUri }} style={st.avatar} cachePolicy="memory-disk" transition={200} />
                        </View>
                    </View>
                )}
                <Text
                    style={[st.label, isOwn && { color: Colors.primary, fontFamily: Fonts.bold }, !hasUnread && !isOwn && { color: Colors.textMuted }]}
                    numberOfLines={1}
                >
                    {label}
                </Text>
            </TouchableOpacity>
        </Animated.View>
    );
});

const st = StyleSheet.create({
    wrap: { alignItems: 'center', marginRight: 14 },
    inner: { alignItems: 'center', gap: 5 },
    ring: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center', padding: 2.5 },
    ringRead: { borderWidth: 2, borderColor: Colors.border, backgroundColor: 'transparent' },
    avatarWrap: { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    avatar: { width: 58, height: 58, borderRadius: 29 },
    addWrap: { width: 66, height: 66, alignItems: 'center', justifyContent: 'center' },
    addRing: {
        width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center',
        ...Platform.select({
            ios: { shadowColor: Colors.primary, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
            android: { elevation: 4 },
            web: { boxShadow: `0px 3px 10px ${Colors.primary}4D` },
        }),
    },
    label: { fontSize: 11, fontFamily: Fonts.medium, color: Colors.textSecondary, textAlign: 'center', maxWidth: 66 },
});
