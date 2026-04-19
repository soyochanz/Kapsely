import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts } from '../../theme';
import VerifiedBadge from '../VerifiedBadge';

const { width } = Dimensions.get('window');

const STICKER_POSITIONS = [
    { top: 40, left: 20, size: 70, rotation: '-15deg' },
    { top: 25, left: width * 0.4, size: 90, rotation: '5deg' },
    { top: 45, right: 30, size: 75, rotation: '12deg' },
    { top: 120, left: 35, size: 65, rotation: '-8deg' },
    { top: 115, right: 40, size: 85, rotation: '18deg' },
];

interface ProfileHeaderProps {
    profile: any;
    accentColor: string;
    profileStickers: any[];
    userStories: any;
    followersCount: number;
    followingCount: number;
    capsulesCount: number;
    isOwnProfile: boolean;
    isFollowing: boolean;
    onFollowToggle: () => void;
    onNavigateToConversation: () => void;
    onShowEdit: () => void;
    onShowSettings: () => void;
    onShowUserOptions: () => void;
    onShowStories: () => void;
    onBack: () => void;
    activeTab: string;
    setActiveTab: (tab: any) => void;
    insets: any;
    t: any;
    i18n: any;
    joinYear: string | number;
    profileId: string;
    navigation: any;
}

export const ProfileHeader = React.memo(({
    profile, accentColor, profileStickers, userStories,
    followersCount, followingCount, capsulesCount,
    isOwnProfile, isFollowing, onFollowToggle,
    onNavigateToConversation, onShowEdit, onShowSettings,
    onShowUserOptions, onShowStories, onBack,
    activeTab, setActiveTab, insets, t, i18n, joinYear,
    profileId, navigation
}: ProfileHeaderProps) => {
    return (
        <View style={s.root}>
            {/* HERO BANNER */}
            <View style={s.bannerWrap}>
                <LinearGradient
                    colors={[`${accentColor}CC`, `${accentColor}88`, Colors.background]}
                    start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }}
                    style={s.banner}
                />
                <View style={[s.orb, s.orb1, { backgroundColor: accentColor + '30' }]} />
                <View style={[s.orb, s.orb2, { backgroundColor: accentColor + '18' }]} />

                {/* Stickers */}
                <View style={[StyleSheet.absoluteFill, { overflow: 'visible', pointerEvents: 'none' }]}>
                    {profileStickers.map((ps: any) => {
                        const posConfig = STICKER_POSITIONS[ps.position - 1] || STICKER_POSITIONS[0];
                        const { size: defSize, rotation: defRot, ...pos } = posConfig;
                        const isDynamic = ps.x !== undefined && ps.y !== undefined && ps.x !== null;
                        const size = isDynamic ? (ps.size || 70) : (defSize || 70);
                        const rotation = isDynamic ? `${ps.rotation || 0}deg` : `${defRot || 0}deg`;
                        const style = isDynamic ? {
                            position: 'absolute' as 'absolute',
                            left: (ps.x / (width - 40)) * width,
                            top: ps.y,
                            width: size, height: size,
                            marginLeft: -(size / 2),
                            marginTop: -(size / 2),
                            transform: [{ rotate: rotation }],
                            opacity: 0.9,
                        } : [s.bannerSticker, pos, { width: size, height: size, transform: [{ rotate: rotation }], opacity: 0.8 }];

                        return ps.stickers?.image_url && (
                            <Image key={ps.id} source={{ uri: ps.stickers.image_url }} style={style} contentFit="contain" transition={300} />
                        );
                    })}
                </View>

                {/* Header buttons */}
                <View style={[s.bannerBtns, { paddingTop: insets.top + (Platform.OS === 'ios' ? 10 : 20) }]}>
                    {!isOwnProfile && (
                        <TouchableOpacity 
                            onPress={onBack} 
                            style={s.glassBtn} 
                            activeOpacity={0.7}
                            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                        >
                            <Ionicons name="chevron-back" size={20} color="#fff" />
                        </TouchableOpacity>
                    )}
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity 
                        style={s.glassBtn} 
                        activeOpacity={0.7} 
                        onPress={isOwnProfile ? onShowSettings : onShowUserOptions}
                        hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                    >
                        <Ionicons name={isOwnProfile ? "settings-outline" : "ellipsis-horizontal"} size={20} color="#fff" />
                    </TouchableOpacity>
                </View>
            </View>

            {/* PROFILE HEADER CARD */}
            <View style={s.headerCard}>
                <View style={s.avatarRow}>
                    <TouchableOpacity style={s.avatarWrap} activeOpacity={0.9} disabled={!userStories} onPress={onShowStories}>
                        {userStories ? (
                            <LinearGradient 
                                colors={userStories.all_read ? [accentColor + '55', accentColor + '33'] : [accentColor, Colors.accent || '#F72585']} 
                                style={s.storyRing}
                            >
                                <Image 
                                    source={{ uri: Colors.getAvatarUrl(profile?.avatar_url, profile?.display_name || profile?.username) }} 
                                    style={s.avatar} 
                                    contentFit="cover" 
                                    cachePolicy="memory-disk" 
                                />
                            </LinearGradient>
                        ) : (
                            <View style={[s.storyRing, { borderColor: Colors.border, borderWidth: 2, padding: 2.5 }]}>
                                <Image 
                                    source={{ uri: Colors.getAvatarUrl(profile?.avatar_url, profile?.display_name || profile?.username) }} 
                                    style={s.avatar} 
                                    contentFit="cover" 
                                    cachePolicy="memory-disk" 
                                    transition={200} 
                                />
                            </View>
                        )}
                    </TouchableOpacity>

                    <View style={s.statsRow}>
                        {[
                            { label: t('profile.followersCount'), value: followersCount, onPress: () => navigation.push('UserList', { userId: profileId, type: 'followers' }) },
                            { label: t('profile.followingCount'), value: followingCount, onPress: () => navigation.push('UserList', { userId: profileId, type: 'following' }) },
                            { label: t('profile.totalCapsules'), value: capsulesCount, onPress: undefined },
                        ].map(stat => (
                            <TouchableOpacity key={stat.label} style={s.stat} activeOpacity={stat.onPress ? 0.7 : 1} onPress={stat.onPress}>
                                <Text style={s.statValue}>{stat.value}</Text>
                                <Text style={s.statLabel}>{stat.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                <View style={s.nameSection}>
                    <View style={s.nameRow}>
                        <Text style={s.displayName}>{profile?.display_name ?? '—'}</Text>
                        {profile?.is_verified && <VerifiedBadge size={17} style={{ marginLeft: 4 }} />}
                    </View>
                    <Text style={s.username}>@{profile?.username ?? '—'}</Text>
                    {profile?.bio && <Text style={s.bio}>{profile.bio}</Text>}

                    <View style={s.metaRow}>
                        <View style={s.metaChip}>
                            {profile?.birthdate
                                ? <Text style={{ fontSize: 12 }}>🎂</Text>
                                : <Ionicons name="calendar-outline" size={12} color={Colors.textMuted} />
                            }
                            <Text style={s.metaChipText}>
                                {profile?.birthdate
                                    ? new Date(profile.birthdate).toLocaleDateString(i18n.language === 'es' ? 'es-ES' : 'en-US', { day: 'numeric', month: 'long' })
                                    : `${t('profile.since')} ${joinYear}`}
                            </Text>
                        </View>
                    </View>
                </View>

                {(profile?.favorite_movie || profile?.favorite_song) && (
                    <View style={s.favRow}>
                        {profile?.favorite_movie && (
                            <View style={s.favChip}>
                                <Ionicons name="film-outline" size={18} color={accentColor} />
                                <View style={{ flex: 1 }}>
                                    <Text style={s.favLabel}>{t('profile.favoriteMovie')}</Text>
                                    <Text style={s.favValue}>{profile.favorite_movie}</Text>
                                </View>
                            </View>
                        )}
                        {profile?.favorite_song && (
                            <View style={s.favChip}>
                                <Ionicons name="musical-notes-outline" size={18} color="#0EA5E9" />
                                <View style={{ flex: 1 }}>
                                    <Text style={s.favLabel}>{t('profile.favoriteSong')}</Text>
                                    <Text style={s.favValue}>{profile.favorite_song}</Text>
                                </View>
                            </View>
                        )}
                    </View>
                )}

                <View style={s.actionsRow}>
                    {isOwnProfile ? (
                        <TouchableOpacity style={[s.primaryBtn, { backgroundColor: accentColor }]} onPress={onShowEdit} activeOpacity={0.85}>
                            <Ionicons name="pencil" size={15} color="#fff" />
                            <Text style={s.primaryBtnText}>{t('profile.editProfile')}</Text>
                        </TouchableOpacity>
                    ) : (
                        <>
                            <TouchableOpacity
                                style={[s.primaryBtn, { backgroundColor: isFollowing ? Colors.surface : accentColor, borderWidth: isFollowing ? 1.5 : 0, borderColor: accentColor + '55' }]}
                                onPress={onFollowToggle} activeOpacity={0.85}
                            >
                                <Ionicons name={isFollowing ? "person-remove-outline" : "person-add-outline"} size={15} color={isFollowing ? accentColor : '#fff'} />
                                <Text style={[s.primaryBtnText, isFollowing && { color: accentColor }]}>
                                    {isFollowing ? t('profile.followingBtn') : t('profile.followBtn')}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.iconBtn} activeOpacity={0.7} onPress={onNavigateToConversation}>
                                <Ionicons name="chatbubble-outline" size={19} color={Colors.textSecondary} />
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </View>

            {/* TAB BAR */}
            <View style={s.tabBarWrap}>
                {['all', 'opened', 'sealed'].map(tab => {
                    const isActive = activeTab === tab;
                    const labels: any = { all: t('profile.allCapsules'), opened: t('profile.openedCapsules'), sealed: t('profile.sealedCapsules') };
                    return (
                        <TouchableOpacity
                            key={tab}
                            style={[s.tabItem, isActive && { borderBottomColor: accentColor, borderBottomWidth: 2 }]}
                            onPress={() => setActiveTab(tab)}
                            activeOpacity={0.75}
                        >
                            <Text style={[s.tabText, isActive && { color: accentColor, fontFamily: Fonts.bold }]}>
                                {labels[tab]}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
});

const s = StyleSheet.create({
    root: { backgroundColor: Colors.background },
    bannerWrap: { height: 200, position: 'relative', overflow: 'hidden' },
    banner: { ...StyleSheet.absoluteFillObject },
    orb: { position: 'absolute', borderRadius: 999 },
    orb1: { width: 200, height: 200, top: -60, right: -40 },
    orb2: { width: 140, height: 140, bottom: -30, left: 30 },
    bannerSticker: { position: 'absolute', zIndex: 5 },
    bannerBtns: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, zIndex: 10 },
    glassBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.22)', alignItems: 'center', justifyContent: 'center' },
    headerCard: { marginHorizontal: 16, marginTop: -28, backgroundColor: Colors.surface, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: Colors.divider, shadowColor: 'rgba(0,0,0,0.08)', shadowOpacity: 1, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 4, marginBottom: 12 },
    avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 14 },
    avatarWrap: { flexShrink: 0 },
    storyRing: { width: 80, height: 80, borderRadius: 40, padding: 2.5, alignItems: 'center', justifyContent: 'center' },
    avatar: { width: 70, height: 70, borderRadius: 35, backgroundColor: Colors.cardAlt },
    avatarFallback: { width: 70, height: 70, borderRadius: 35, backgroundColor: Colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
    statsRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
    stat: { alignItems: 'center', gap: 2 },
    statValue: { fontSize: 20, fontFamily: Fonts.bold, color: Colors.textPrimary, letterSpacing: -0.5 },
    statLabel: { fontSize: 10, fontFamily: Fonts.semiBold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    nameSection: { marginBottom: 14 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
    displayName: { fontSize: 22, fontFamily: Fonts.bold, color: Colors.textPrimary, letterSpacing: -0.3 },
    username: { fontSize: 13, fontFamily: Fonts.medium, color: Colors.textMuted },
    bio: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textSecondary, lineHeight: 20, marginTop: 8 },
    metaRow: { flexDirection: 'row', marginTop: 10 },
    metaChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: Colors.cardAlt, borderRadius: 20, borderWidth: 1, borderColor: Colors.divider },
    metaChipText: { fontSize: 11, fontFamily: Fonts.medium, color: Colors.textSecondary },
    favRow: { gap: 10, marginBottom: 16 },
    favChip: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.divider },
    favLabel: { fontSize: 10, fontFamily: Fonts.bold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
    favValue: { fontSize: 14, fontFamily: Fonts.medium, color: Colors.textPrimary, lineHeight: 20 },
    actionsRow: { flexDirection: 'row', gap: 10 },
    primaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: 44, borderRadius: 22 },
    primaryBtnText: { color: '#fff', fontSize: 14, fontFamily: Fonts.bold },
    iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.cardAlt, borderWidth: 1, borderColor: Colors.divider, alignItems: 'center', justifyContent: 'center' },
    tabBarWrap: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: Colors.divider },
    tabItem: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
    tabText: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.textMuted },
});
