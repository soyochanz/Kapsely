import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Platform, Animated, Easing } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../../theme';
import LiveTimer from '../LiveTimer';
import CapsuleWithTimer from '../CapsuleWithTimer';

const { width } = Dimensions.get('window');

interface CapsuleHeroProps {
    capsule: any;
    tint: string;
    isMember: boolean;
    isSealed: boolean;
    isOpening: boolean;
    modelImg: string;
    totalMembers: number;
    likeCount: number;
    followerCount: number;
    isFollowedCapsule: boolean;
    handleCapsuleFollowToggle: () => void;
    isOwner: boolean;
    canBeOpened: boolean;
    hasRequestedOpen: boolean;
    handleRequestOpen: () => void;
    reqCount: number;
    isSharedCapsule: boolean;
    isBornOpen: boolean;
    userId: string | null;
    setCapsule: (c: any) => void;
    onAddContent?: () => void;
    t: any;
    collaborators?: React.ReactNode;
}

const D = {
    text: '#1A1530',
    textSec: '#5C5778',
    textMuted: '#A09CC0',
    surfaceAlt: '#F5F3FB',
    border: '#EAE6F5',
};

export const CapsuleHero = React.memo(({
    capsule, tint, isMember, isSealed, isOpening,
    modelImg, totalMembers, likeCount, followerCount,
    isFollowedCapsule, handleCapsuleFollowToggle,
    isOwner, canBeOpened, hasRequestedOpen,
    handleRequestOpen, reqCount, isSharedCapsule, isBornOpen, userId,
    setCapsule, onAddContent, t, collaborators
}: CapsuleHeroProps) => {
    const canAddContent = isMember && (isBornOpen || (isSealed && !canBeOpened && !isOpening));
    const hasCapsuleCrowd = Number(followerCount || 0) > 49;
    const requiredVotes = Math.max(1, Math.ceil(totalMembers / 2));
    const openVoteText = isSharedCapsule && hasRequestedOpen
        ? `${reqCount}/${requiredVotes}`
        : (t('detail.unseal_now') || 'Abrir capsula');
    const emberPulse = React.useRef(new Animated.Value(0)).current;

    React.useEffect(() => {
        if (!hasCapsuleCrowd) return;
        emberPulse.setValue(0);
        const loop = Animated.loop(
            Animated.timing(emberPulse, {
                toValue: 1,
                duration: 2600,
                easing: Easing.inOut(Easing.cubic),
                useNativeDriver: true,
            })
        );
        loop.start();
        return () => loop.stop();
    }, [emberPulse, hasCapsuleCrowd]);

    return (
        <View style={s.heroSection}>
            {collaborators}
            <TouchableOpacity 
                activeOpacity={canAddContent ? 0.8 : 1} 
                onPress={canAddContent ? onAddContent : undefined}
                style={s.capsuleStage}
            >
                {hasCapsuleCrowd && (
                    <View style={s.emberField} pointerEvents="none">
                        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((dot) => (
                            <Animated.View
                                key={dot}
                                style={[
                                    s.emberDot,
                                    {
                                        backgroundColor: dot % 3 === 0 ? '#FF4D8D' : dot % 3 === 1 ? '#FFB86B' : tint,
                                        left: `${14 + (dot * 13) % 72}%`,
                                        top: `${20 + (dot * 17) % 58}%`,
                                        opacity: emberPulse.interpolate({
                                            inputRange: [0, 0.5, 1],
                                            outputRange: [0.08 + (dot % 3) * 0.04, 0.40 + (dot % 4) * 0.05, 0.08 + (dot % 3) * 0.04],
                                        }),
                                        transform: [
                                            { translateY: emberPulse.interpolate({ inputRange: [0, 1], outputRange: [14 + (dot % 3) * 5, -24 - (dot % 4) * 6] }) },
                                            { translateX: emberPulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, dot % 2 === 0 ? 12 : -12, 0] }) },
                                            { rotate: emberPulse.interpolate({ inputRange: [0, 1], outputRange: ['0deg', dot % 2 === 0 ? '16deg' : '-16deg'] }) },
                                            { scale: emberPulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.58, 0.96 + (dot % 5) * 0.08, 0.58] }) },
                                        ],
                                    },
                                    dot % 4 === 0 && s.emberDotLarge,
                                    dot % 4 === 1 && s.emberDotTiny,
                                ]}
                            />
                        ))}
                    </View>
                )}
                <View style={[s.capsuleGlow, { backgroundColor: tint + '12' }]} />
                <View style={[s.capsuleGlowInner, { backgroundColor: tint + '08' }]} />
                <CapsuleWithTimer
                    modelKey={capsule.model}
                    source={{ uri: modelImg }}
                    date={capsule.opens_at}
                    modelLayout={capsule.model_snapshot}
                    chainId={capsule.chain_id}
                    style={{ width: 210, height: 210 }}
                    isOpened={!isSealed}
                    hideParticles
                />
                
                {canAddContent && (
                    <View style={[s.addHintPill, { backgroundColor: tint }]}>
                        <Ionicons name="add" size={14} color="#fff" />
                        <Text style={s.addHintText}>{t('detail.tap_to_add') || 'Tap to add content'}</Text>
                    </View>
                )}
            </TouchableOpacity>

            <View style={s.heroMeta}>
                <View style={s.statRow}>
                    <StatPill icon="heart-outline" label={`${likeCount}`} />
                    <StatPill
                        icon={hasCapsuleCrowd ? 'flame' : 'person-outline'}
                        label={`${followerCount}`}
                        iconColor={hasCapsuleCrowd ? '#FF4D8D' : undefined}
                        textColor={hasCapsuleCrowd ? '#FF4D8D' : undefined}
                    />
                    <View style={s.statPill}>
                        <Ionicons name={isSealed ? "lock-closed" : "lock-open"} size={16} color={isSealed ? "#EF4444" : "#10B981"} />
                    </View>
                </View>

                <Text style={s.title}>{capsule.title}</Text>
                {capsule.description && <Text style={s.desc}>{capsule.description.replace(/\[STYLE:(OPEN|CLOSED)\]/gi, '').trim()}</Text>}

                {userId !== capsule.owner_id && !isMember && (
                    <TouchableOpacity
                        style={[s.capsuleFollowBtn, { borderColor: isFollowedCapsule ? D.border : tint + '40', backgroundColor: isFollowedCapsule ? 'transparent' : tint + '08' }]}
                        onPress={handleCapsuleFollowToggle}
                    >
                        <Ionicons name={isFollowedCapsule ? "person" : "person-outline"} size={16} color={isFollowedCapsule ? D.textMuted : tint} />
                        <Text style={[s.capsuleFollowBtnText, { color: isFollowedCapsule ? D.textMuted : tint }]}>
                            {isFollowedCapsule ? t('detail.unfollow_capsule') : t('detail.follow_capsule')}
                        </Text>
                    </TouchableOpacity>
                )}

                <View style={s.ctaBlock}>
                    {isSealed ? (
                        <>
                            {isMember ? (
                                isOpening ? (
                                    <View style={s.countdownCard}>
                                        <View style={[s.countdownIconWrap, { backgroundColor: tint + '15' }]}>
                                            <Ionicons name="timer-outline" size={22} color={tint} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[s.countdownLabel, { color: tint }]}>
                                                {isSharedCapsule
                                                    ? `${t('detail.unsealing_soon') || 'Abriéndose pronto'} · ${reqCount}/${requiredVotes}`
                                                    : (t('detail.unsealing_soon') || 'Abriéndose pronto')}
                                            </Text>
                                            {!!capsule.opening_at && (
                                                <LiveTimer date={capsule.opening_at} modelId={capsule.model} style={{ fontSize: 18, color: '#000' }} />
                                            )}
                                        </View>
                                    </View>
                                ) : canBeOpened ? (
                                    <View style={s.unsealBtnWrap}>
                                        <TouchableOpacity
                                            style={[
                                                s.unsealBtnGrad,
                                                { backgroundColor: isSharedCapsule && hasRequestedOpen ? '#9CA3AF' : tint },
                                                isSharedCapsule && hasRequestedOpen && s.unsealBtnDisabled,
                                            ]}
                                            disabled={isSharedCapsule && hasRequestedOpen}
                                            onPress={handleRequestOpen}
                                        >
                                            {isSharedCapsule && hasRequestedOpen && (
                                                <Ionicons name="checkmark-circle" size={18} color="#fff" style={{ marginRight: 8 }} />
                                            )}
                                            <Text style={s.unsealBtnText}>
                                                {isSharedCapsule
                                                    ? (hasRequestedOpen ? (t('detail.requested') || 'Voto registrado') : (t('detail.unseal_now') || 'Abrir cápsula'))
                                                    : (t('detail.unseal_now') || 'Abrir cápsula')}
                                            </Text>
                                        </TouchableOpacity>
                                        {isSharedCapsule && hasRequestedOpen && (
                                            <Text style={s.openVoteCount}>{reqCount}/{requiredVotes}</Text>
                                        )}
                                    </View>
                                ) : (
                                    <View style={[s.countdownCard, { borderColor: tint + '30', backgroundColor: tint + '05' }]}>
                                        <View style={[s.countdownIconWrap, { backgroundColor: tint + '15' }]}>
                                            <Ionicons name="time" size={22} color={tint} />
                                        </View>
                                        <View>
                                            <Text style={[s.countdownLabel, { color: tint }]}>{t('detail.unseals_in')}</Text>
                                            <LiveTimer date={capsule.opens_at} modelId={capsule.model} style={{ fontSize: 18, color: '#000' }} />
                                        </View>
                                    </View>
                                )
                            ) : (
                                <View style={[s.countdownCard, { borderColor: tint + '30', backgroundColor: tint + '05' }]}>
                                    <View style={[s.countdownIconWrap, { backgroundColor: tint + '15' }]}>
                                        <Ionicons name="time" size={22} color={tint} />
                                    </View>
                                    <View>
                                        <Text style={[s.countdownLabel, { color: tint }]}>{t('detail.unseals_in')}</Text>
                                        <LiveTimer date={capsule.opens_at} modelId={capsule.model} style={{ fontSize: 18, color: '#000' }} />
                                    </View>
                                </View>
                            )}
                        </>
                    ) : null}
                </View>
            </View>
        </View>
    );
});

const StatPill = ({ icon, label, iconColor, textColor }: any) => (
    <View style={s.statPill}>
        <Ionicons name={icon} size={15} color={iconColor || D.textMuted} />
        <Text style={[s.statPillText, textColor && { color: textColor }]}>{label}</Text>
    </View>
);

const s = StyleSheet.create({
    heroSection: { alignItems: 'center', paddingTop: 28, paddingBottom: 28, paddingHorizontal: 22, position: 'relative', overflow: 'hidden' },
    capsuleStage: { alignItems: 'center', justifyContent: 'center', width: '100%', marginBottom: 8 },
    emberField: {
        position: 'absolute',
        width: 292,
        height: 252,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emberDot: {
        position: 'absolute',
        width: 8,
        height: 8,
        borderRadius: 4,
        ...Platform.select({
            ios: { shadowColor: '#FF4D8D', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.42, shadowRadius: 10 },
            android: { elevation: 2 },
            web: { boxShadow: '0 0 14px rgba(255,77,141,0.30)' },
        }),
    },
    emberDotLarge: { width: 12, height: 12, borderRadius: 6 },
    emberDotTiny: { width: 5, height: 5, borderRadius: 3 },
    capsuleGlow: { position: 'absolute', width: 260, height: 260, borderRadius: 130 },
    capsuleGlowInner: { position: 'absolute', width: 190, height: 190, borderRadius: 95 },
    heroMeta: { width: '100%', alignItems: 'center', marginTop: 12 },
    statRow: { flexDirection: 'row', gap: 20, justifyContent: 'center', marginBottom: 12 },
    statPill: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statPillText: { fontSize: 13, fontFamily: Fonts.semiBold, color: D.textSec },
    openedLabel: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
    openedLabelText: { fontSize: 12, fontFamily: Fonts.bold, letterSpacing: 0.5 },
    title: { fontSize: 24, fontFamily: Fonts.bold, color: D.text, textAlign: 'center', marginBottom: 8 },
    desc: { fontSize: 14, fontFamily: Fonts.regular, color: D.textSec, textAlign: 'center', paddingHorizontal: 24, marginBottom: 16, lineHeight: 20 },
    capsuleFollowBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, borderWidth: 1.5 },
    capsuleFollowBtnText: { fontSize: 14, fontFamily: Fonts.bold },
    ctaBlock: { width: '100%', alignItems: 'center', gap: 12, marginTop: 6 },
    unsealBtnWrap: { width: '90%', borderRadius: 24 },
    unsealBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 18, borderRadius: 24 },
    unsealBtnDisabled: { opacity: 0.82 },
    unsealBtnText: { fontSize: 17, fontFamily: Fonts.bold, color: '#fff' },
    openVoteCount: { marginTop: 8, textAlign: 'center', fontSize: 13, fontFamily: Fonts.bold, color: D.textMuted },
    countdownCard: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 18, borderWidth: 1.5, padding: 14, width: '88%' },
    countdownIconWrap: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    countdownLabel: { fontSize: 11, fontFamily: Fonts.semiBold, marginBottom: 2, opacity: 0.8 },
    addHintPill: {
        position: 'absolute', bottom: -10,
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 12, paddingVertical: 6,
        borderRadius: 20, 
        ...Platform.select({ ios: { shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }, android: { elevation: 6 } })
    },
    addHintText: { fontSize: 11, fontFamily: Fonts.bold, color: '#fff' },
});
