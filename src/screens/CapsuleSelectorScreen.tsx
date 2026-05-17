import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity,
    ActivityIndicator, StatusBar, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Colors, Fonts, Spacing, BorderRadius, Shadow } from '../theme';
import { supabase } from '../lib/supabase';
import { MODEL_IMAGES, MODEL_IMAGES_OPEN } from '../constants/models';
import LiveTimer from '../components/LiveTimer';
import CapsuleWithTimer from '../components/CapsuleWithTimer';
import { timerConfigManager } from '../utils/timerConfig';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

const TYPE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
    instacap:  { icon: 'camera',   color: Colors.instaCap,  label: 'InstaCap'  },
    legacycap: { icon: 'time',     color: Colors.legacyCap, label: 'LegacyCap' },
    opencap:   { icon: 'book',     color: Colors.primary,   label: 'Open Cap'  },
    eventcap:  { icon: 'flash',    color: Colors.eventCap,  label: 'EventCap'  },
};

export default function CapsuleSelectorScreen() {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const route = useRoute();
    const { t } = useTranslation();
    const { contentType }: any = route.params || {};

    const [capsules, setCapsules] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { loadCapsules(); }, []);

    const loadCapsules = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        const user = session.user;

        const [{ data: ownCaps }, { data: inviteEntries }] = await Promise.all([
            supabase
                .from('capsules')
                .select('*, items_count:capsule_items(count), invites_count:capsule_invites(count)')
                .or(`owner_id.eq.${user.id},invited_user_id.eq.${user.id}`)
                .in('status', ['sealed', 'opened'])
                .order('created_at', { ascending: false }),
            supabase
                .from('capsule_invites')
                .select('capsule_id, capsules:capsule_id(*, items_count:capsule_items(count), invites_count:capsule_invites(count))')
                .eq('user_id', user.id)
                .eq('status', 'accepted'),
        ]);

        const now = new Date().getTime();
        const filteredOwnAndLegacy = (ownCaps || []).filter(cap => {
            const isAccepted = cap.owner_id === user.id || cap.invite_status === 'accepted';
            const isBornOpen = cap.status === 'opened' && cap.duration_days === 0;
            const isSealedAndNotReady = cap.status === 'sealed' && new Date(cap.opens_at).getTime() > now;
            return isAccepted && (isBornOpen || isSealedAndNotReady);
        });

        let allCaps = [...filteredOwnAndLegacy];
        if (inviteEntries) {
            inviteEntries.forEach((entry: any) => {
                const invitedCap = entry.capsules;
                const isBornOpen = invitedCap?.status === 'opened' && invitedCap?.duration_days === 0;
                const isSealedAndNotReady = invitedCap?.status === 'sealed' && new Date(invitedCap?.opens_at).getTime() > now;
                const isAcceptable = invitedCap && (isBornOpen || isSealedAndNotReady);
                if (isAcceptable && !allCaps.some(c => c.id === invitedCap.id)) {
                    allCaps.push(invitedCap);
                }
            });
        }

        setCapsules(
            allCaps.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        );
        setLoading(false);
    };

    const handleSelect = (capsule: any) => {
        navigation.navigate('AddItem', { capsuleId: capsule.id, type: contentType });
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <StatusBar barStyle="dark-content" />

            {/* ── Header ───────────────────────────────────────── */}
            <View style={styles.header}>
                <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <View style={styles.backBtnInner}>
                        <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
                    </View>
                </TouchableOpacity>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>{t('add.select_capsule')}</Text>
                    <Text style={styles.headerSub}>{t('add.choose_destination')}</Text>
                </View>
                <View style={{ width: 44 }} />
            </View>

            {loading ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                </View>
            ) : capsules.length === 0 ? (
                /* ── Empty state ──────────────────────────────── */
                <View style={styles.centered}>
                    <View style={styles.emptyIconWrap}>
                        <LinearGradient
                            colors={[Colors.primary + '18', Colors.primary + '04']}
                            style={StyleSheet.absoluteFill}
                        />
                        <Ionicons name="lock-closed-outline" size={38} color={Colors.primary} />
                    </View>
                    <Text style={styles.emptyTitle}>{t('add.no_capsules_available')}</Text>
                    <Text style={styles.emptyText}>{t('add.no_capsules_desc')}</Text>
                    <TouchableOpacity
                        style={styles.createBtn}
                        activeOpacity={0.85}
                        onPress={() => navigation.navigate('CapsuleCreation')}
                    >
                        <Ionicons name="add" size={18} color="#fff" />
                        <Text style={styles.createBtnText}>{t('create.create_btn')}</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                /* ── List ─────────────────────────────────────── */
                <FlatList
                    data={capsules}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.list}
                    ListHeaderComponent={
                        <View style={styles.listHeader}>
                            <Text style={styles.listHeaderCount}>
                                {t('add.capsules_available', { count: capsules.length })}
                            </Text>
                        </View>
                    }
                    renderItem={({ item }) => <CapsuleEntry item={item} onSelect={handleSelect} />}
                    showsVerticalScrollIndicator={false}
                />
            )}
        </View>
    );
}

/* ─── Card ─────────────────────────────────────────────────────────────────── */
const CapsuleEntry = React.memo(({ item, onSelect }: { item: any; onSelect: (cap: any) => void }) => {
    const { t } = useTranslation();
    const isBornOpen = item.status === 'opened' && item.duration_days === 0;
    const cfg = isBornOpen ? TYPE_CONFIG.opencap : (TYPE_CONFIG[item.type as keyof typeof TYPE_CONFIG] || TYPE_CONFIG.legacycap);
    
    // Count logic: handles Supabase (count) format
    const itemCount = Array.isArray(item.items_count) ? (item.items_count[0]?.count || 0) : (item.items_count?.count || 0);
    const invitesCount = Array.isArray(item.invites_count) ? (item.invites_count[0]?.count || 0) : (item.invites_count?.count || 0);
    const totalMembers = 1 + invitesCount; // Owner + accepted invites
    const isShared = totalMembers > 1;

    const [modelImg, setModelImg] = useState<string>(() => {
        const modelId = item.model;
        const img = item.status === 'opened' 
            ? timerConfigManager.getModelImageOpen(modelId) 
            : timerConfigManager.getModelImage(modelId);
        return img || (item.status === 'opened' ? (MODEL_IMAGES_OPEN as any)[modelId] : (MODEL_IMAGES as any)[modelId]) || (MODEL_IMAGES as any).basicred_kap;
    });

    useEffect(() => {
        const update = () => {
            const modelId = item.model;
            const img = item.status === 'opened' 
                ? timerConfigManager.getModelImageOpen(modelId) 
                : timerConfigManager.getModelImage(modelId);
            setModelImg(img || (item.status === 'opened' ? (MODEL_IMAGES_OPEN as any)[modelId] : (MODEL_IMAGES as any)[modelId]) || (MODEL_IMAGES as any).basicred_kap);
        };
        const unsub = timerConfigManager.subscribe(update);
        update();
        return unsub;
    }, [item.model, item.status]);

    const isOpened = item.status === 'opened';

    return (
        <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => onSelect(item)}>
            {/* Left: capsule preview */}
            <View style={[styles.cardImageContainer, { backgroundColor: cfg.color + '08' }]}>
                <LinearGradient
                    colors={[cfg.color + '12', 'transparent']}
                    style={StyleSheet.absoluteFill}
                />
                <CapsuleWithTimer
                    modelKey={item.model}
                    source={{ uri: modelImg }}
                    date={item.opens_at}
                    modelLayout={item.model_snapshot}
                    chainId={item.chain_id}
                    capsuleType={isBornOpen ? 'opencap' : item.type}
                    style={styles.cardImage}
                    hideTimer={true}
                    hideParticles={true}
                    isOpened={isOpened}
                />
                {/* Lock Indicator */}
                <View style={[styles.lockBadge, { backgroundColor: isOpened ? '#4ADE80' : '#F87171' }]}>
                    <Ionicons name={isOpened ? "lock-open" : "lock-closed"} size={10} color="#fff" />
                </View>
            </View>

            {/* Center: Info */}
            <View style={styles.cardInfo}>
                <View style={styles.cardHeaderRow}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                    {isShared && (
                        <View style={styles.sharedBadge}>
                            <Ionicons name="people" size={10} color={Colors.textMuted} />
                            <Text style={styles.sharedBadgeText}>{totalMembers}</Text>
                        </View>
                    )}
                </View>

                <View style={styles.metaRow}>
                    <View style={[styles.typePill, { backgroundColor: cfg.color + '15' }]}>
                        <Text style={[styles.typePillText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                    <View style={styles.dotSeparator} />
                    <View style={styles.statRow}>
                        <Ionicons name="images-outline" size={12} color={Colors.textMuted} />
                        <Text style={styles.statText}>{itemCount}</Text>
                    </View>
                </View>

                <View style={styles.openRow}>
                    <Ionicons name="time-outline" size={12} color={Colors.textMuted} />
                    {isOpened ? (
                        <Text style={styles.cardDate}>{t('add.always_open')}</Text>
                    ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={styles.cardDate}>{t('add.opens_label')}</Text>
                            <LiveTimer date={item.opens_at} style={styles.cardDateBold} />
                        </View>
                    )}
                </View>
            </View>

            {/* Right Action */}
            <View style={styles.selectBtn}>
                <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
            </View>
        </TouchableOpacity>
    );
});

/* ─── Styles ─────────────────────────────────────────────────────────────────*/
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },

    // Header
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: Spacing.md, paddingTop: 8, paddingBottom: 16,
        borderBottomWidth: 0,
    },
    backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    backBtnInner: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: Colors.cardAlt, borderWidth: 1, borderColor: Colors.border,
        alignItems: 'center', justifyContent: 'center',
    },
    headerCenter: { flex: 1, alignItems: 'center', gap: 2 },
    headerTitle: { fontSize: 18, fontFamily: Fonts.bold, color: Colors.textPrimary },
    headerSub: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.textMuted },

    // List
    list: { padding: Spacing.md, paddingTop: 6, gap: 12, paddingBottom: 40 },
    listHeader: { marginBottom: 6 },
    listHeaderCount: {
        fontSize: 12, fontFamily: Fonts.semiBold,
        color: Colors.textMuted, letterSpacing: 0.3,
    },

    // Card
    card: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: Colors.surface,
        paddingVertical: 14, paddingHorizontal: 14,
        borderRadius: 24, borderWidth: 1, borderColor: Colors.border,
        gap: 14,
        marginBottom: 4,
    },
    cardImageContainer: {
        width: 72, height: 72, borderRadius: 20,
        alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
    },
    cardImage: { width: 62, height: 62 },
    lockBadge: {
        position: 'absolute', top: 4, right: 4,
        width: 18, height: 18, borderRadius: 9,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 2, borderColor: Colors.surface,
    },
    cardInfo: { flex: 1, gap: 4 },
    cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    cardTitle: { fontSize: 16, fontFamily: Fonts.bold, color: Colors.textPrimary, flex: 1 },
    sharedBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: Colors.cardAlt, paddingHorizontal: 6, paddingVertical: 2,
        borderRadius: 8, borderWidth: 1, borderColor: Colors.border,
    },
    sharedBadgeText: { fontSize: 10, fontFamily: Fonts.bold, color: Colors.textMuted },

    // Type pill & stats
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    typePill: {
        paddingHorizontal: 8, paddingVertical: 3,
        borderRadius: 10,
    },
    typePillText: { fontSize: 10, fontFamily: Fonts.bold, letterSpacing: 0.3, textTransform: 'uppercase' },
    dotSeparator: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.border },
    statRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    statText: { fontSize: 11, fontFamily: Fonts.medium, color: Colors.textMuted },

    // Timer row
    openRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    cardDate: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.textMuted },
    cardDateBold: { fontSize: 12, fontFamily: Fonts.bold, color: Colors.textPrimary },

    // Select Btn
    selectBtn: {
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: Colors.primary + '10',
        alignItems: 'center', justifyContent: 'center',
    },

    // Centered states
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },

    // Empty state
    emptyIconWrap: {
        width: 80, height: 80, borderRadius: 40,
        alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', marginBottom: 6,
        borderWidth: 1.5, borderColor: Colors.primary + '22',
    },
    emptyTitle: {
        fontSize: 20, fontFamily: Fonts.bold,
        color: Colors.textPrimary, textAlign: 'center',
    },
    emptyText: {
        textAlign: 'center', fontFamily: Fonts.regular,
        color: Colors.textMuted, fontSize: 14, lineHeight: 20,
    },
    createBtn: {
        marginTop: 10, backgroundColor: Colors.primary,
        paddingHorizontal: 24, paddingVertical: 14,
        borderRadius: BorderRadius.full,
        flexDirection: 'row', alignItems: 'center', gap: 8,
    },
    createBtnText: { color: '#fff', fontFamily: Fonts.bold, fontSize: 15 },
});
