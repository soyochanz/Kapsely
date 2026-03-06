import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Dimensions } from 'react-native';
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

interface TimelineActivityProps {
    item: any;
}

export default function TimelineActivity({ item }: TimelineActivityProps) {
    const navigation = useNavigation<any>();
    const profile = item.profiles || { username: 'user', avatar_url: null };
    const capsule = Array.isArray(item.capsules) ? item.capsules[0] : (item.capsules || { title: 'Capsule', type: 'instacap', model: 'beach' });

    const handlePress = () => {
        navigation.navigate('CapsuleDetail', { capsuleId: item.capsule_id });
    };

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
            case 'audio': return 'mic';
            case 'note': return 'document-text';
            default: return 'attach';
        }
    };

    return (
        <TouchableOpacity
            activeOpacity={0.95}
            onPress={handlePress}
            style={styles.card}
        >
            {/* Background Layer (Media or Gradient) */}
            <View style={styles.backgroundLayer}>
                {item.media_url && (item.media_type === 'image' || item.media_type === 'video') ? (
                    <>
                        <Image
                            source={{ uri: item.media_url }}
                            style={styles.backgroundImage}
                            blurRadius={capsule?.status === 'sealed' ? 20 : 0}
                        />
                        {capsule?.status === 'sealed' && (
                            <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
                        )}
                    </>
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
                        <Text style={styles.activityType}>Added {item.media_type || 'content'}</Text>
                    </View>
                </TouchableOpacity>

                {capsule && (
                    <View style={styles.topRightContainer}>
                        <TouchableOpacity
                            style={styles.capsuleCorner}
                            onPress={() => navigation.navigate('CapsuleDetail', { capsuleId: item.capsule_id })}
                        >
                            <CapsuleWithTimer
                                modelKey={capsule.model || 'beach'}
                                source={{ uri: capsule.status === 'opened' ? (timerConfigManager.getModelImageOpen(capsule.model) || MODEL_IMAGES_OPEN[capsule.model as keyof typeof MODEL_IMAGES_OPEN] || MODEL_IMAGES_OPEN.beach) : (timerConfigManager.getModelImage(capsule.model) || MODEL_IMAGES[capsule.model as keyof typeof MODEL_IMAGES] || MODEL_IMAGES.beach) }}
                                date={capsule.opens_at}
                                chainId={capsule.chain_id}
                                capsuleType={capsule.type}
                                hideTimer
                                isOpened={capsule.status === 'opened'}
                                style={styles.capsuleMini}
                            />
                        </TouchableOpacity>
                        
                        {capsule.status === 'sealed' && (
                            <View style={styles.miniTimerContainer}>
                                <LiveTimer 
                                    date={capsule.opens_at} 
                                    modelId={capsule.model}
                                    style={styles.miniTimerText}
                                />
                            </View>
                        )}
                    </View>
                )}
            </View>

            {/* Bottom Info Section */}
            <View style={styles.bottomSection}>
                <BlurView intensity={40} tint="dark" style={styles.glassInfo}>
                    <View style={styles.capsuleInfo}>
                        <View style={[styles.typeIndicator, { backgroundColor: getTypeColors()[0] as any }]} />
                        <Text style={styles.capsuleTitle} numberOfLines={1}>{capsule.title}</Text>
                    </View>

                    <View style={styles.itemPreview}>
                        <View style={styles.iconContainer}>
                            <Ionicons name={getIcon() as any} size={16} color="#fff" />
                        </View>
                        <Text style={styles.previewText}>
                            {item.content || `New ${item.media_type || 'item'} shared to this capsule`}
                        </Text>
                    </View>
                </BlurView>

                {item.capsules?.status === 'sealed' && (
                    <View style={styles.sealedBadge}>
                        <Ionicons name="lock-closed" size={10} color="#fff" />
                        <Text style={styles.sealedText}>SEALED</Text>
                    </View>
                )}
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    card: {
        height: 440,
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
        width: 64,
        height: 64,
        borderRadius: 32,
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
        width: 56,
        height: 56,
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
    }
});
