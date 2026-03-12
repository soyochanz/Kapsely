import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, Modal, Image, 
    TouchableOpacity, Animated, Easing, 
    StyleSheet as RNStyleSheet, 
    Dimensions, Pressable, StatusBar
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Fonts } from '../theme';
import { timerConfigManager } from '../utils/timerConfig';
import { MODEL_IMAGES } from '../constants/models';
import { supabase } from '../lib/supabase';

const { width, height } = Dimensions.get('window');

const MysteryOverlay = ({ seed }: { seed: string }) => {
    const side = parseInt(seed.replace(/-/g, '').slice(-1), 16) % 4;
    return (
        <View style={RNStyleSheet.absoluteFill}>
            <View style={[
                { backgroundColor: '#000', position: 'absolute' },
                side === 0 && { top: 0, left: 0, right: 0, height: '50%' },
                side === 1 && { bottom: 0, left: 0, right: 0, height: '50%' },
                side === 2 && { top: 0, left: 0, bottom: 0, width: '50%' },
                side === 3 && { top: 0, right: 0, bottom: 0, width: '50%' },
            ]} />
        </View>
    );
}

interface StoryViewerProps {
    visible: boolean;
    userGroup: any;
    onClose: () => void;
    onNextUser?: () => void;
    onPrevUser?: () => void;
    currentUserId?: string;
    onStoryRead?: (storyId: string) => void;
}

export default function StoryViewer({ 
    visible, 
    userGroup, 
    onClose, 
    onNextUser, 
    onPrevUser, 
    currentUserId,
    onStoryRead
}: StoryViewerProps) {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const [activeIndex, setActiveIndex] = useState(0);
    const [progress] = useState(new Animated.Value(0));
    const [isPaused, setIsPaused] = useState(false);

    const progressRef = React.useRef(0);

    useEffect(() => {
        const listener = progress.addListener(({ value }) => {
            progressRef.current = value;
        });
        return () => {
            progress.removeListener(listener);
        };
    }, [progress]);

    useEffect(() => {
        if (visible && userGroup) {
            progress.stopAnimation();
            progress.setValue(0);
            progressRef.current = 0;
        }
    }, [activeIndex, userGroup, visible]);

    useEffect(() => {
        if (visible && userGroup) {
            if (!isPaused) {
                const remainingDuration = 5000 * (1 - progressRef.current);
                Animated.timing(progress, {
                    toValue: 1,
                    duration: remainingDuration,
                    easing: Easing.linear,
                    useNativeDriver: false,
                }).start(({ finished }) => {
                    if (finished) nextStory();
                });

                const currentStory = userGroup.stories[activeIndex];
                if (currentStory && !currentStory.is_read && onStoryRead) {
                    onStoryRead(currentStory.id);
                }
            } else {
                progress.stopAnimation();
            }
        }
    }, [visible, userGroup, activeIndex, isPaused]);

    const nextStory = () => {
        if (activeIndex < userGroup.stories.length - 1) {
            setActiveIndex(prev => prev + 1);
        } else {
            if (onNextUser) {
                onNextUser();
                setActiveIndex(0);
            } else {
                onClose();
            }
        }
    };

    const prevStory = () => {
        if (activeIndex > 0) {
            setActiveIndex(prev => prev - 1);
        } else {
            if (onPrevUser) {
                onPrevUser();
            } else {
                // Stay on first story of this user if no previous user logic
            }
        }
    };

    if (!visible || !userGroup) return null;

    const currentStory = userGroup.stories[activeIndex];

    return (
        <Modal visible={visible} transparent animationType="fade">
            <View style={styles.container}>
                <StatusBar barStyle="light-content" />
                
                <Pressable 
                    style={RNStyleSheet.absoluteFill}
                    onPressIn={() => setIsPaused(true)}
                    onPressOut={() => setIsPaused(false)}
                >
                    <Image 
                        source={{ uri: currentStory.media_url }} 
                        style={styles.storyBackground}
                        resizeMode="cover"
                    />

                    {currentStory.is_mystery && (
                        <MysteryOverlay seed={currentStory.id} />
                    )}

                    <LinearGradient colors={['rgba(0,0,0,0.6)', 'transparent', 'rgba(0,0,0,0.4)']} style={RNStyleSheet.absoluteFill} />

                    <View style={styles.gestureOverlay}>
                        <Pressable style={styles.gestureSide} onPress={prevStory} />
                        <View style={{ flex: 1 }} />
                        <Pressable style={styles.gestureSide} onPress={nextStory} />
                    </View>

                    <TouchableOpacity
                        style={styles.floatingCapsule}
                        activeOpacity={0.85}
                        onPress={() => {
                            const capsuleId = currentStory?.capsule_id || currentStory?.capsules?.id;
                            if (capsuleId) {
                                progress.stopAnimation();
                                onClose();
                                navigation.navigate('CapsuleDetail', { capsuleId });
                            }
                        }}
                    >
                        <BlurView intensity={30} tint="dark" style={styles.blurCapsule}>
                            <View style={styles.floatingCapsuleInner}>
                                <Image 
                                    source={{ uri: timerConfigManager.getModelImage(currentStory.capsules.model) || MODEL_IMAGES[currentStory.capsules.model] }} 
                                    style={styles.floatingModelImg}
                                    resizeMode="contain"
                                />
                                <Text style={styles.floatingModelText}>View Capsule</Text>
                                <Ionicons name="arrow-forward" size={12} color="#fff" />
                            </View>
                        </BlurView>
                    </TouchableOpacity>

                    <View style={[styles.header, { paddingTop: insets.top + 15 }]}>
                        <View style={styles.progressBars}>
                            {userGroup.stories.map((s: any, i: number) => (
                                <View key={s.id} style={styles.progressBarBg}>
                                    <Animated.View 
                                        style={[
                                            styles.progressBarFill,
                                            {
                                                width: i < activeIndex ? '100%' : 
                                                       i === activeIndex ? progress.interpolate({
                                                           inputRange: [0, 1],
                                                           outputRange: ['0%', '100%']
                                                       }) : '0%'
                                            }
                                        ]}
                                    />
                                </View>
                            ))}
                        </View>

                        <View style={styles.userInfo}>
                            <Image source={{ uri: userGroup.avatar_url || 'https://via.placeholder.com/150' }} style={styles.avatarSmall} />
                            <View>
                                <Text style={styles.username}>{userGroup.username}</Text>
                                <Text style={styles.capsuleTitle}>{currentStory.capsules.title}</Text>
                            </View>
                            <View style={{ flex: 1 }} />
                            <TouchableOpacity onPress={onClose}>
                                <Ionicons name="close" size={32} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    </View>
                </Pressable>
            </View>
        </Modal>
    );
}

const styles = RNStyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    storyBackground: { width: '100%', height: '100%' },
    gestureOverlay: { ...RNStyleSheet.absoluteFillObject, flexDirection: 'row' },
    gestureSide: { width: '30%', height: '100%' },
    header: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 15 },
    progressBars: { flexDirection: 'row', gap: 4, marginBottom: 15 },
    progressBarBg: { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 1, overflow: 'hidden' },
    progressBarFill: { height: '100%', backgroundColor: '#fff' },
    userInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatarSmall: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' },
    username: { color: '#fff', fontSize: 14, fontFamily: Fonts.bold },
    capsuleTitle: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontFamily: Fonts.medium },
    floatingCapsule: { position: 'absolute', bottom: 40, alignSelf: 'center' },
    blurCapsule: { borderRadius: 20, overflow: 'hidden' },
    floatingCapsuleInner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 10 },
    floatingModelImg: { width: 24, height: 24 },
    floatingModelText: { color: '#fff', fontSize: 13, fontFamily: Fonts.bold },
});
