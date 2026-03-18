import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, Modal, Image, 
    TouchableOpacity, Animated, Easing, 
    StyleSheet as RNStyleSheet, 
    Dimensions, Pressable, StatusBar, TextInput
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

const AnimatedLikeButton = ({ 
    hasLiked, 
    likesCount, 
    onPress,
    setIsPaused
}: { 
    hasLiked: boolean, 
    likesCount: number, 
    onPress: () => void,
    setIsPaused: (p: boolean) => void
}) => {
    const scaleAnim = React.useRef(new Animated.Value(1)).current;

    const handlePress = () => {
        setIsPaused(true);
        Animated.sequence([
            Animated.timing(scaleAnim, { toValue: 1.4, duration: 150, useNativeDriver: true }),
            Animated.spring(scaleAnim, { toValue: 1, friction: 3, tension: 50, useNativeDriver: true })
        ]).start();
        onPress();
        setTimeout(() => setIsPaused(false), 500);
    };

    return (
        <TouchableOpacity 
            style={styles.likeBtn} 
            activeOpacity={0.9}
            onPress={handlePress}
        >
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                <Ionicons 
                    name={hasLiked ? "heart" : "heart-outline"} 
                    size={38} 
                    color={hasLiked ? "#FF3B30" : "#FFF"} 
                    style={{ textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: {width: 0, height: 2}, textShadowRadius: 8}} 
                />
            </Animated.View>
            {(likesCount > 0) && (
                <Text style={styles.likeText}>{likesCount}</Text>
            )}
        </TouchableOpacity>
    );
};

const LikersModal = ({ visible, onClose, storyId }: { visible: boolean, onClose: () => void, storyId: string }) => {
    const { insets } = { insets: { bottom: 20 } }; 
    const [likers, setLikers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!visible) return;
        setLoading(true);
        supabase
            .from('story_likes')
            .select(`
                user_id,
                profiles:user_id ( id, username, display_name, avatar_url )
            `)
            .eq('story_id', storyId)
            .order('created_at', { ascending: false })
            .then(({ data }) => {
                if (data) setLikers(data.map((d: any) => d.profiles));
                setLoading(false);
            });
    }, [visible, storyId]);

    return (
        <Modal visible={visible} transparent animationType="slide">
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                <Pressable style={RNStyleSheet.absoluteFill} onPress={onClose}>
                    <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} />
                </Pressable>
                <View style={{ backgroundColor: Colors.surface, borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20, minHeight: 300, paddingBottom: 20 + insets.bottom }}>
                    <View style={{ width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />
                    <Text style={{ fontSize: 18, fontFamily: Fonts.bold, color: Colors.textPrimary, marginBottom: 15 }}>Likes</Text>
                    {loading ? (
                        <Text style={{ textAlign: 'center', marginTop: 20, color: Colors.textMuted }}>Cargando...</Text>
                    ) : likers.length === 0 ? (
                        <Text style={{ textAlign: 'center', marginTop: 20, color: Colors.textMuted }}>Aún no hay likes.</Text>
                    ) : (
                        likers.map((user, i) => (
                            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15 }}>
                                <Image source={{ uri: user.avatar_url || 'https://via.placeholder.com/150' }} style={{ width: 40, height: 40, borderRadius: 20, marginRight: 12, backgroundColor: Colors.border }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 15, fontFamily: Fonts.bold, color: Colors.textPrimary }}>{user.display_name}</Text>
                                    <Text style={{ fontSize: 13, fontFamily: Fonts.medium, color: Colors.textMuted }}>@{user.username}</Text>
                                </View>
                                <Ionicons name="heart" size={20} color="#FF3B30" />
                            </View>
                        ))
                    )}
                </View>
            </View>
        </Modal>
    );
};



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
    
    // Per-story states mapped by story id
    const [likesData, setLikesData] = useState<Record<string, { count: number, hasLiked: boolean }>>({});
    const [showLikersId, setShowLikersId] = useState<string | null>(null);
    const lastUserGroupRef = React.useRef<any>(null);

    const [storyComments, setStoryComments] = useState<any[]>([]);
    const [activeComment, setActiveComment] = useState<any>(null);
    const [currentComment, setCurrentComment] = useState('');
    const commentFadeAnim = React.useRef(new Animated.Value(0)).current;

    const progressRef = React.useRef(0);
    const ownerId = userGroup?.owner_id || userGroup?.id;
    const isOwner = ownerId === currentUserId;

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
            // Start at first unread story when userGroup changes
            if (lastUserGroupRef.current !== userGroup) {
                lastUserGroupRef.current = userGroup;
                const firstUnread = userGroup.stories.findIndex((s: any) => !s.is_read);
                if (firstUnread !== -1) {
                    setActiveIndex(firstUnread);
                    return; // Wait for index update to trigger effect again
                }
            }

            progress.stopAnimation();
            progress.setValue(0);
            progressRef.current = 0;
            
            // Fetch likes and comments for current active story if not already loaded
            const currentStory = userGroup.stories[activeIndex];
            if (currentStory) {
                if (!likesData[currentStory.id]) {
                    fetchLikesData(currentStory.id);
                }
                fetchComments(currentStory.id);
            }
        } else if (!visible) {
            // Reset ref when closing to allow re-initialization next time
            lastUserGroupRef.current = null;
        }
    }, [activeIndex, userGroup, visible]);

    const fetchComments = async (storyId: string) => {
        const { data } = await supabase
            .from('story_comments')
            .select(`
                *,
                profiles:user_id ( id, username, display_name, avatar_url )
            `)
            .eq('story_id', storyId)
            .order('created_at', { ascending: true });
        
        if (data) setStoryComments(data);
    };

    const fetchLikesData = async (storyId: string) => {
        const { count } = await supabase.from('story_likes').select('*', { count: 'exact', head: true }).eq('story_id', storyId);
        
        let hasLiked = false;
        if (currentUserId) {
            const { data } = await supabase.from('story_likes').select('id').eq('story_id', storyId).eq('user_id', currentUserId).maybeSingle();
            hasLiked = !!data;
        }

        setLikesData(prev => ({
            ...prev,
            [storyId]: { count: count || 0, hasLiked }
        }));
    };

    useEffect(() => {
        if (visible && userGroup && !showLikersId) {
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
        } else {
            progress.stopAnimation();
        }
    }, [visible, userGroup, activeIndex, isPaused, showLikersId]);

    useEffect(() => {
        if (storyComments.length === 0) {
            setActiveComment(null);
            return;
        }

        let index = 0;
        setActiveComment(storyComments[0]);
        commentFadeAnim.setValue(0);
        Animated.timing(commentFadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();

        const interval = setInterval(() => {
            Animated.timing(commentFadeAnim, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => {
                index = (index + 1) % storyComments.length;
                setActiveComment(storyComments[index]);
                Animated.timing(commentFadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
            });
        }, 3500);

        return () => clearInterval(interval);
    }, [storyComments]);

    const handleSendComment = async () => {
        if (!currentComment.trim() || !currentUserId) return;
        const currentStory = userGroup.stories[activeIndex];
        if (!currentStory) return;

        const { data, error } = await supabase
            .from('story_comments')
            .insert({
                story_id: currentStory.id,
                user_id: currentUserId,
                content: currentComment.trim()
            })
            .select(`
                *,
                profiles:user_id ( id, username, display_name, avatar_url )
            `)
            .single();

        if (data) {
            setStoryComments(prev => [...prev, data]);
            setCurrentComment('');
        }
    };

    const handleToggleLike = async (storyId: string) => {
        if (!currentUserId) return;
        const currentData = likesData[storyId] || { count: 0, hasLiked: false };
        
        setLikesData(prev => ({
            ...prev,
            [storyId]: { 
                count: currentData.hasLiked ? Math.max(0, currentData.count - 1) : currentData.count + 1,
                hasLiked: !currentData.hasLiked 
            }
        }));

        if (currentData.hasLiked) {
            await supabase.from('story_likes').delete().eq('story_id', storyId).eq('user_id', currentUserId);
        } else {
            await supabase.from('story_likes').insert({ story_id: storyId, user_id: currentUserId });
            // Send notification to the owner if not current user
            if (ownerId && ownerId !== currentUserId) {
                await supabase.from('notifications').insert({
                    user_id: ownerId,
                    sender_id: currentUserId,
                    type: 'story_like',
                    message: 'ha dado like a tu Flash',
                    is_read: false
                }).select();
            }
        }
    };

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

                    <Image 
                        source={{ uri: currentStory.media_url }} 
                        style={styles.storyBackground}
                        resizeMode="cover"
                    />

                    <LinearGradient colors={['rgba(0,0,0,0.6)', 'transparent', 'rgba(0,0,0,0.4)']} style={RNStyleSheet.absoluteFill} />

                    <View style={styles.gestureOverlay}>
                        <Pressable 
                            style={styles.gestureSide} 
                            onPress={prevStory}
                            onPressIn={() => setIsPaused(true)}
                            onPressOut={() => setIsPaused(false)}
                            onLongPress={() => {}}
                            delayLongPress={300}
                        />
                        <Pressable 
                            style={{ flex: 1 }} 
                            onPressIn={() => setIsPaused(true)}
                            onPressOut={() => setIsPaused(false)}
                        />
                        <Pressable 
                            style={styles.gestureSide} 
                            onPress={nextStory}
                            onPressIn={() => setIsPaused(true)}
                            onPressOut={() => setIsPaused(false)}
                            onLongPress={() => {}}
                            delayLongPress={300}
                        />
                    </View>

                    <TouchableOpacity
                        style={[styles.floatingCapsule, { top: insets.top + 70 }]}
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

                    {/* Like Button */}
                    <View style={styles.floatingRight}>
                        <AnimatedLikeButton 
                            hasLiked={likesData[currentStory.id]?.hasLiked || false}
                            likesCount={likesData[currentStory.id]?.count || 0}
                            onPress={() => {
                                if (isOwner) {
                                    setShowLikersId(currentStory.id);
                                } else {
                                    handleToggleLike(currentStory.id);
                                }
                            }}
                            setIsPaused={setIsPaused}
                        />
                    </View>

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
                            <TouchableOpacity 
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                                activeOpacity={0.8}
                                onPress={() => {
                                    progress.stopAnimation();
                                    onClose();
                                    navigation.navigate('UserProfile', { targetUserId: ownerId });
                                }}
                            >
                                <Image source={{ uri: userGroup.avatar_url || 'https://via.placeholder.com/150' }} style={styles.avatarSmall} />
                                <View>
                                    <Text style={styles.username}>{userGroup.display_name || userGroup.username}</Text>
                                    <Text style={styles.capsuleTitle}>{currentStory.capsules.title}</Text>
                                </View>
                            </TouchableOpacity>
                            <View style={{ flex: 1 }} />
                            <TouchableOpacity onPress={onClose}>
                                <Ionicons name="close" size={32} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Metadata Overlays (Texts and Emojis) */}
                    {currentStory.metadata?.filter && currentStory.metadata.filter !== 'none' && (
                        <View style={[RNStyleSheet.absoluteFill, { backgroundColor: currentStory.metadata.filter === 'vintage' ? 'rgba(230, 190, 120, 0.25)' : currentStory.metadata.filter === 'warm' ? 'rgba(255, 150, 50, 0.18)' : currentStory.metadata.filter === 'cool' ? 'rgba(0, 150, 255, 0.18)' : currentStory.metadata.filter === 'dark' ? 'rgba(0,0,0,0.4)' : 'transparent' }]} pointerEvents="none" />
                    )}

                    {currentStory.metadata?.texts && currentStory.metadata.texts.map((t: any) => (
                        <View key={t.id} style={{ position: 'absolute', top: t.y * height, left: t.x * width - 50 }}>
                            <View style={{ backgroundColor: t.bg || 'rgba(0,0,0,0.5)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }}>
                                <Text style={{ color: t.color || '#fff', fontSize: 18, fontFamily: Fonts.bold }}>{t.text}</Text>
                            </View>
                        </View>
                    ))}

                    {currentStory.metadata?.emojis && currentStory.metadata.emojis.map((e: any) => (
                        <Text key={e.id} style={{ position: 'absolute', top: e.y * height, left: e.x * width, fontSize: 32 }}>{e.emoji}</Text>
                    ))}

                    {/* Active Comment Overlay */}
                    {activeComment && (
                        <Animated.View style={[styles.floatingComment, { opacity: commentFadeAnim }]}>
                            <Image source={{ uri: activeComment.profiles?.avatar_url || 'https://via.placeholder.com/150' }} style={styles.commentAvatar} />
                            <View>
                                <Text style={styles.commentUser}>@{activeComment.profiles?.username}</Text>
                                <Text style={styles.commentText}>{activeComment.content}</Text>
                            </View>
                        </Animated.View>
                    )}

                    {/* Comment Input Bar */}
                    {!isOwner && (
                        <View style={[styles.commentBar, { bottom: Math.max(insets.bottom, 10) }]}>
                            <TextInput
                                style={styles.commentInput}
                                placeholder="Responde a este Flash..."
                                placeholderTextColor="#ccc"
                                value={currentComment}
                                onChangeText={setCurrentComment}
                                onFocus={() => setIsPaused(true)}
                                onBlur={() => setIsPaused(false)}
                            />
                            {currentComment.trim().length > 0 && (
                                <TouchableOpacity style={styles.commentSend} onPress={handleSendComment}>
                                    <Ionicons name="send" size={20} color={Colors.primary} />
                                </TouchableOpacity>
                            )}
                        </View>
                    )}
                </Pressable>
            </View>

            <LikersModal 
                visible={!!showLikersId} 
                onClose={() => setShowLikersId(null)} 
                storyId={showLikersId || ''} 
            />
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
    floatingCapsule: { position: 'absolute', alignSelf: 'center', zIndex: 10 },
    blurCapsule: { borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
    floatingCapsuleInner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 10, gap: 12 },
    floatingModelImg: { width: 36, height: 36 },
    floatingModelText: { color: '#fff', fontSize: 14, fontFamily: Fonts.semiBold },
    floatingRight: { position: 'absolute', bottom: 75, right: 20, alignItems: 'center', zIndex: 10 },
    likeBtn: { alignItems: 'center', justifyContent: 'center', gap: 4 },
    likeText: { color: '#fff', fontSize: 13, fontFamily: Fonts.bold, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: {width: 0, height: 1}, textShadowRadius: 4 },
    floatingComment: { position: 'absolute', bottom: 120, left: 20, right: 80, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 20, zIndex: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    commentAvatar: { width: 32, height: 32, borderRadius: 16 },
    commentUser: { color: '#fff', fontSize: 11, fontFamily: Fonts.bold },
    commentText: { color: '#fff', fontSize: 13, fontFamily: Fonts.regular },
    commentBar: { position: 'absolute', left: 15, right: 15, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 25, paddingHorizontal: 15, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', zIndex: 11 },
    commentInput: { flex: 1, color: '#fff', fontSize: 14, fontFamily: Fonts.medium, paddingVertical: 4 },
    commentSend: { marginLeft: 10, padding: 4 },
});
