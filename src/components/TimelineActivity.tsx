import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Dimensions, Alert, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, BorderRadius, Spacing, Shadow } from '../theme';
import { useNavigation } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import LiveTimer from './LiveTimer';
import CapsuleWithTimer from './CapsuleWithTimer';
import { timerConfigManager } from '../utils/timerConfig';
import { MODEL_IMAGES, MODEL_IMAGES_OPEN } from '../constants/models';
import VerifiedBadge from './VerifiedBadge';

const { width } = Dimensions.get('window');

const CollageView = ({ items, count, isSealed }: { items: any[], count: number, isSealed: boolean }) => {
    // Show up to 4 items in the collage
    const displayItems = items.slice(0, 4);
    
    return (
        <View style={styles.collageContainer}>
            {isSealed && displayItems.length > 0 ? (
                <Image
                    source={{ uri: displayItems[0].thumbnail_url || displayItems[0].media_url }}
                    style={StyleSheet.absoluteFill}
                    blurRadius={Platform.OS === 'ios' ? 12 : 30}
                    resizeMode="cover"
                />
            ) : (
                <View style={styles.collageGrid}>
                    {displayItems.map((item, idx) => (
                        <Image
                            key={idx}
                            source={{ uri: item.thumbnail_url || item.media_url }}
                            style={[
                                styles.collageImage,
                                displayItems.length === 1 && styles.collageSingle,
                                displayItems.length === 2 && styles.collageDual,
                                displayItems.length === 3 && idx === 0 && styles.collageTripleLarge,
                            ]}
                            resizeMode="cover"
                        />
                    ))}
                </View>
            )}
            {isSealed && <BlurView intensity={45} tint="light" style={StyleSheet.absoluteFill} />}
            <View style={styles.groupCountBadge}>
                <Ionicons name="images" size={20} color="#fff" />
                <Text style={styles.groupCountText}>+{count}</Text>
            </View>
        </View>
    );
};

interface TimelineActivityProps {
    item: any;
}

const Waveform = ({ active = true }: { active?: boolean }) => {
    // Stable random-looking heights for the waveform
    const heights = [18, 32, 24, 38, 28, 35, 22, 16];
    return (
        <View style={styles.waveContainer}>
            {heights.map((h, i) => (
                <View 
                    key={i} 
                    style={[
                        styles.waveBar, 
                        { 
                            height: h,
                            opacity: active ? 1 : 0.5,
                            backgroundColor: '#fff'
                        }
                    ]} 
                />
            ))}
        </View>
    );
};

export default function TimelineActivity({ item }: TimelineActivityProps) {
    const navigation = useNavigation<any>();
    const profile = item.profiles || { username: 'user', avatar_url: null };
    const capsule = Array.isArray(item.capsules) ? item.capsules[0] : (item.capsules || { title: 'Capsule', type: 'instacap', model: 'basicred_kap' });

    const isAudio = item.media_type === 'audio';
    const isNote = item.media_type === 'note';

    const getTypeColors = () => {
        switch (capsule.type) {
            case 'instacap': return [Colors.instaCap, '#9b59b6'];
            case 'eventcap': return [Colors.eventCap, '#e67e22'];
            case 'legacycap': return [Colors.legacyCap, '#2980b9'];
            default: return [Colors.primary, Colors.primaryDark];
        }
    };

    const getIcon = () => {
        switch (item.media_type) {
            case 'image': return 'image';
            case 'video': return 'videocam';
            case 'audio': return 'stats-chart';
            case 'note': return 'document-text';
            default: return 'attach';
        }
    };

    // Determine access
    const [currentUserId, setCurrentUserId] = React.useState<string | null>(null);
    const [hasAccess, setHasAccess] = React.useState(true);

    React.useEffect(() => {
        const checkAccess = async () => {
             const { data: { user } } = await supabase.auth.getUser();
             if (user) {
                 setCurrentUserId(user.id);
                 const access = capsule.is_public || capsule.owner_id === user.id || item.owner_id === user.id || capsule.is_participant;
                 setHasAccess(!!access);
             } else {
                 setHasAccess(!!capsule.is_public);
             }
        };
        checkAccess();
    }, [capsule.id, item.owner_id]);

    const handlePress = () => {
        if (!hasAccess) {
             Alert.alert("Private Capsule", "You haven't been invited to this capsule yet.");
             return;
        }
        navigation.navigate('CapsuleDetail', { capsuleId: item.capsule_id });
    };

    return (
        <TouchableOpacity
            activeOpacity={0.95}
            onPress={handlePress}
            style={styles.card}
        >
            {/* Background Layer (Media or Gradient) */}
            <View style={styles.backgroundLayer}>
                {item.feedType === 'activity_group' ? (
                    <CollageView 
                        items={item.groupItems} 
                        count={item.count} 
                        isSealed={capsule?.status === 'sealed'} 
                    />
                ) : (item.media_url || item.thumbnail_url) && (item.media_type === 'image' || item.media_type === 'video') ? (
                    <>
                        <Image
                            source={{ uri: item.thumbnail_url || item.media_url }}
                            style={styles.backgroundImage}
                            blurRadius={capsule?.status === 'sealed' ? (Platform.OS === 'ios' ? 12 : 30) : 0}
                        />
                        {capsule?.status === 'sealed' && (
                            <BlurView intensity={Platform.OS === 'ios' ? 45 : 70} tint="light" style={StyleSheet.absoluteFill} />
                        )}
                    </>
                ) : isAudio ? (
                    <LinearGradient colors={['#a269ff', '#8050d0']} style={styles.backgroundGradient} />
                ) : isNote ? (
                    <LinearGradient colors={['#bd9aff', '#a269ff']} style={styles.backgroundGradient} />
                ) : (
                    <LinearGradient colors={getTypeColors() as any} style={styles.backgroundGradient} />
                )}
                <LinearGradient
                    colors={['rgba(0,0,0,0.4)', 'transparent', 'rgba(0,0,0,0.8)']}
                    style={StyleSheet.absoluteFill}
                />

            </View>

            {/* Top Info Bar */}
            <View style={styles.topBar}>
                <TouchableOpacity
                    style={styles.userSection}
                    onPress={() => navigation.navigate('UserProfile', { targetUserId: item.owner_id })}
                >
                    {profile.avatar_url ? (
                        <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
                    ) : (
                        <View style={styles.avatarPlaceholder}>
                            <Ionicons name="person" size={12} color="#fff" />
                        </View>
                    )}
                    <View>
                        <TouchableOpacity 
                            style={{ flexDirection: 'row', alignItems: 'center' }}
                            onPress={() => navigation.navigate('UserProfile', { targetUserId: item.owner_id })}
                        >
                            <Text style={styles.username}>{profile.display_name || profile.username || 'user'}</Text>
                            {profile.is_verified && <VerifiedBadge size={14} style={{ marginLeft: 2 }} />}
                        </TouchableOpacity>
                        <Text style={styles.activityType}>
                            {item.feedType === 'activity_group' 
                                ? `Added ${item.count} memories` 
                                : `Added ${item.media_type || 'content'}`
                            }
                        </Text>
                    </View>
                </TouchableOpacity>

                {capsule && (
                    <View style={styles.topRightContainer}>
                        <TouchableOpacity
                            style={styles.capsuleCorner}
                            onPress={() => navigation.navigate('CapsuleDetail', { capsuleId: item.capsule_id })}
                        >
                            <CapsuleWithTimer
                                modelKey={capsule.model || 'basicred_kap'}
                                source={{ uri: capsule.status === 'opened' ? (timerConfigManager.getModelImageOpen(capsule.model) || MODEL_IMAGES_OPEN[capsule.model as keyof typeof MODEL_IMAGES_OPEN] || (MODEL_IMAGES_OPEN as any).basicred_kap) : (timerConfigManager.getModelImage(capsule.model) || MODEL_IMAGES[capsule.model as keyof typeof MODEL_IMAGES] || (MODEL_IMAGES as any).basicred_kap) }}
                                date={capsule.opens_at}
                                chainId={capsule.chain_id}
                                capsuleType={capsule.type}
                                hideTimer
                                isOpened={capsule.status === 'opened'}
                                style={styles.capsuleMini}
                                hideParticles
                            />
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            {/* Middle Content Layer for Audio/Note/Video */}
            {(isAudio || isNote || item.media_type === 'video') && (
                <View style={styles.middleContent}>
                    {isAudio && (
                        <View style={styles.audioPreviewWrap}>
                            <LinearGradient colors={['rgba(255,255,255,0.2)', 'rgba(255,255,255,0.05)']} style={styles.audioMainCircle}>
                                <Ionicons name="mic-outline" size={32} color="#fff" />
                            </LinearGradient>
                            <Waveform />
                        </View>
                    )}
                    {item.media_type === 'video' && (
                        <View style={styles.videoPlayOverlay}>
                            <View style={styles.playIconCircle}>
                                <Ionicons name="play" size={32} color="#fff" style={{ marginLeft: 3 }} />
                            </View>
                            {/* If we had duration, we could show it here, but typically we have it in caption or metadata */}
                        </View>
                    )}
                    {isNote && (
                        <View style={[styles.noteContainer]}>
                            {capsule?.status === 'sealed' ? (
                                <>
                                    <View style={styles.noteTextSkeletonWrap}>
                                        <Text style={[styles.scrambledText, { fontSize: 22, opacity: 0.1 }]} numberOfLines={12}>
                                            {'∑ ∆ ∿ ⎈ ⌬ ⍟ ⚯ ⌘ Ω ✚ ✣ ✢ ✥ ✦ ✧ ✩ ✪ ✫ ✬ ✭ ✮ ✯ ✰ ✱ ✲ ✳ ✴ ✵ ✶ ✷ ✸ ✹ ✺ ✻ ✼ ✽ ✾ ✿ ❀ ❁ ❂ ❃ ❄ ❅ ❆ ❇ ❈ ❉ ❊ ❋'.split(' ').sort(() => 0.5 - Math.random()).join(' ')}
                                        </Text>
                                    </View>

                                    {/* Premium frosted glass blur edge-to-edge */}
                                    {Platform.OS === 'ios' ? (
                                        <BlurView intensity={100} tint="light" style={StyleSheet.absoluteFill} />
                                    ) : (
                                        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.85)' }]} />
                                    )}

                                    <View style={styles.sealedNoteOverlay}>
                                        <View style={[styles.aestheticIconWrap, { backgroundColor: 'transparent', shadowOpacity: 0 }]}>
                                            <Ionicons name="lock-closed-outline" size={32} color="rgba(0, 0, 0, 0.2)" />
                                        </View>
                                        <Text style={[styles.aestheticHintText, { color: 'rgba(0,0,0,0.4)', letterSpacing: 4 }]}>ENCRYPTED THOUGHT</Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, opacity: 0.5 }}>
                                            <Ionicons name="document-text-outline" size={14} color="#000" />
                                            <Text style={{ fontSize: 11, fontFamily: Fonts.bold, marginLeft: 4 }}>Note Memory</Text>
                                        </View>
                                    </View>
                                </>
                            ) : (
                                <View style={{ width: '100%', padding: 40, alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                                    <Ionicons name="document-text-outline" size={32} color="rgba(255,255,255,0.7)" style={{ marginBottom: 20 }} />
                                    <Text style={[styles.noteContentText, { fontSize: 18, color: '#fff', textAlign: 'center', letterSpacing: 0.5 }]} numberOfLines={8}>
                                        {item.content}
                                    </Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', position: 'absolute', bottom: 20, opacity: 0.7 }}>
                                        <Text style={{ fontSize: 11, fontFamily: Fonts.bold, color: '#fff' }}>Note Memory</Text>
                                    </View>
                                </View>
                            )}
                        </View>
                    )}
                </View>
            )}

            {/* Bottom Info Section (Hidden for Notes to be edge-to-edge elegant) */}
            {!isNote && (
                <View style={styles.bottomSection}>
                <BlurView intensity={40} tint="dark" style={styles.glassInfo}>
                    <View style={styles.capsuleInfo}>
                        <View style={[styles.typeIndicator, { backgroundColor: getTypeColors()[0] as any }]} />
                        <Text style={styles.capsuleTitle} numberOfLines={1}>{capsule.title}</Text>
                        {!hasAccess && (
                            <Ionicons name="lock-closed" size={14} color="#ff4757" style={{ marginLeft: 6 }} />
                        )}
                    </View>

                    <View style={styles.itemPreview}>
                        <View style={styles.iconContainer}>
                            <Ionicons name={getIcon() as any} size={16} color="#fff" />
                        </View>
                        <Text style={styles.previewText} numberOfLines={1}>
                            {item.feedType === 'activity_group'
                                ? `New memory collection (${item.count} items)`
                                : isAudio ? `Voice Note (${item.content || '--:--'})` : isNote ? 'Written Note' : (item.caption || (item.media_type === 'video' ? `Video (${item.content || '--:--'})` : (item.content || `New ${item.media_type} shared`)))
                            }
                        </Text>
                        {(isAudio) && (
                            <View style={styles.durationBadge}>
                                <Ionicons name="mic" size={10} color="#fff" style={{ marginRight: 4 }} />
                                <Text style={styles.durationText}>{item.content || '--:--'}</Text>
                            </View>
                        )}
                    </View>
                </BlurView>

                {capsule?.status === 'sealed' && (
                    <View style={styles.sealedBadge}>
                        <Ionicons name="lock-closed" size={10} color="#fff" />
                        <Text style={styles.sealedText}>SEALED</Text>
                    </View>
                )}
            </View>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    card: {
        height: 375,
        marginHorizontal: Spacing.md,
        marginBottom: Spacing.lg,
        borderRadius: BorderRadius.xl,
        overflow: 'hidden',
        backgroundColor: Colors.cardAlt,
        ...Shadow.card
    },
    backgroundLayer: {
        ...StyleSheet.absoluteFillObject,
    },
    backgroundImage: {
        width: '100%',
        height: '100%',
    },
    backgroundGradient: {
        flex: 1,
    },
    topBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: Spacing.md,
        zIndex: 5,
    },
    userSection: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 6,
        paddingRight: 12,
        borderRadius: 25,
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    avatar: {
        width: 28,
        height: 28,
        borderRadius: 14,
        marginRight: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.5)',
    },
    avatarPlaceholder: {
        width: 28,
        height: 28,
        borderRadius: 14,
        marginRight: 8,
        backgroundColor: Colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    username: {
        fontSize: 12,
        fontFamily: Fonts.bold,
        color: '#fff',
    },
    activityType: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.8)',
        marginTop: -2,
    },
    capsuleCorner: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.3)',
        overflow: 'hidden',
    },
    topRightContainer: {
        alignItems: 'center',
    },
    miniTimerContainer: {
        marginTop: 4,
        backgroundColor: 'rgba(0,0,0,0.4)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 12,
    },
    miniTimerText: {
        fontSize: 10,
        color: '#fff',
        fontFamily: Fonts.bold,
    },
    capsuleMini: {
        width: 42,
        height: 42,
    },
    middleContent: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        zIndex: 2,
    },
    videoPlayOverlay: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    playIconCircle: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: 'rgba(0,0,0,0.4)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.6)',
    },
    audioPreviewWrap: {
        alignItems: 'center',
        gap: 20,
    },
    audioMainCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.4)',
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    waveContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        height: 40,
    },
    waveBar: {
        width: 4,
        borderRadius: 2,
    },
    noteContainer: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    notePaper: {
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(255,255,255,0.14)',
        borderRadius: 22,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.35)',
        alignItems: 'center',
        justifyContent: 'center',
        ...Shadow.subtle,
    },
    sparkle: {
        position: 'absolute',
        borderRadius: 2,
    },
    noteTextSkeletonWrap: {
        width: '100%',
        padding: 30,
        gap: 14,
    },
    skeletonLine: {
        height: 6,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 3,
        width: '100%',
    },
    scrambledText: {
        fontSize: 16,
        color: 'rgba(0,0,0,0.25)',
        lineHeight: 28,
        letterSpacing: 4,
        textAlign: 'center',
    },
    sealedNoteOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    aestheticIconWrap: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
        ...Shadow.primary,
        shadowOpacity: 0.1,
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.05)'
    },
    aestheticHintText: {
        fontFamily: Fonts.bold,
        fontSize: 14,
        color: 'rgba(0, 0, 0, 0.4)',
        letterSpacing: 3,
        textTransform: 'uppercase',
    },
    noteContentText: {
        fontSize: 17,
        fontFamily: Fonts.medium,
        color: '#fff',
        lineHeight: 26,
        textAlign: 'center',
        fontStyle: 'italic',
    },
    timerChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        overflow: 'hidden',
    },
    timerText: {
        fontSize: 10,
        color: '#fff',
        fontFamily: Fonts.bold,
    },
    bottomSection: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: Spacing.md,
    },
    glassInfo: {
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    capsuleInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    typeIndicator: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 8,
    },
    capsuleTitle: {
        fontSize: 16,
        fontFamily: Fonts.bold,
        color: '#fff',
    },
    itemPreview: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    iconContainer: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    previewText: {
        flex: 1,
        fontSize: 13,
        color: 'rgba(255,255,255,0.9)',
        lineHeight: 18,
    },
    durationBadge: {
        backgroundColor: 'rgba(0,0,0,0.4)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    durationText: {
        fontSize: 11,
        fontFamily: Fonts.bold,
        color: '#fff',
    },
    sealedBadge: {
        position: 'absolute',
        top: -10,
        right: Spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.primary,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    sealedText: {
        fontSize: 9,
        fontFamily: Fonts.bold,
        color: '#fff',
        marginLeft: 4,
        letterSpacing: 1,
    },
    // Collage Styles
    collageContainer: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    collageGrid: {
        flex: 1,
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    collageImage: {
        width: '50%',
        height: '50%',
    },
    collageSingle: {
        width: '100%',
        height: '100%',
    },
    collageDual: {
        width: '50%',
        height: '100%',
    },
    collageTripleLarge: {
        width: '100%',
        height: '50%',
    },
    groupCountBadge: {
        position: 'absolute',
        top: '40%',
        alignSelf: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 25,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    groupCountText: {
        color: '#fff',
        fontSize: 18,
        fontFamily: Fonts.bold,
    },
});
