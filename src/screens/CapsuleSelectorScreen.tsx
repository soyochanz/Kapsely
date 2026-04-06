import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity,
    ActivityIndicator, StatusBar, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
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
    const { contentType }: any = route.params || {};

    const [capsules, setCapsules] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { loadCapsules(); }, []);

    const loadCapsules = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: ownCaps } = await supabase
            .from('capsules')
            .select('*')
            .or(`owner_id.eq.${user.id},invited_user_id.eq.${user.id}`)
            .in('status', ['sealed', 'opened'])
            .order('created_at', { ascending: false });

        const filteredOwnAndLegacy = (ownCaps || []).filter(cap =>
            (cap.owner_id === user.id || cap.invite_status === 'accepted') &&
            (cap.status === 'sealed' || (cap.status === 'opened' && cap.duration_days === 0))
        );

        const { data: inviteEntries } = await supabase
            .from('capsule_invites')
            .select('capsule_id, capsules:capsule_id(*)')
            .eq('user_id', user.id)
            .eq('status', 'accepted');

        let allCaps = [...filteredOwnAndLegacy];
        if (inviteEntries) {
            inviteEntries.forEach((entry: any) => {
                const invitedCap = entry.capsules;
                const isAcceptable = invitedCap && (
                    invitedCap.status === 'sealed' || 
                    (invitedCap.status === 'opened' && invitedCap.duration_days === 0)
                );
                if (isAcceptable && !allCaps.some(c => c.id === invitedCap.id)) {
                    allCaps.push(invitedCap);
                }
            });
        }

        setCapsules(
            allCaps
                // .filter(c => c.type !== 'eventcap') // Removed filter for 'eventcap'
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
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
                    <Text style={styles.headerTitle}>Select Capsule</Text>
                    <Text style={styles.headerSub}>Choose where to save this memory</Text>
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
                    <Text style={styles.emptyTitle}>No capsules available</Text>
                    <Text style={styles.emptyText}>Create a Sealed or Open capsule to start storing memories</Text>
                    <TouchableOpacity
                        style={styles.createBtn}
                        activeOpacity={0.85}
                        onPress={() => navigation.navigate('CapsuleCreation')}
                    >
                        <Ionicons name="add" size={18} color="#fff" />
                        <Text style={styles.createBtnText}>Create a Capsule</Text>
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
                                {capsules.length} {capsules.length === 1 ? 'capsule' : 'capsules'} available
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
    const isBornOpen = item.status === 'opened' && item.duration_days === 0;
    const cfg = isBornOpen ? TYPE_CONFIG.opencap : (TYPE_CONFIG[item.type as keyof typeof TYPE_CONFIG] || TYPE_CONFIG.legacycap);
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

    return (
        <TouchableOpacity style={styles.card} activeOpacity={0.82} onPress={() => onSelect(item)}>
            {/* Left: capsule preview with tinted glow bg */}
            <View style={[styles.cardImageContainer, { backgroundColor: cfg.color + '12' }]}>
                <LinearGradient
                    colors={[cfg.color + '1A', 'transparent']}
                    style={StyleSheet.absoluteFill}
                />
                <CapsuleWithTimer
                    modelKey={item.model}
                    source={{ uri: modelImg }}
                    date={item.opens_at}
                    chainId={item.chain_id}
                    capsuleType={isBornOpen ? 'opencap' : item.type}
                    style={styles.cardImage}
                    hideTimer={true}
                    hideParticles={true}
                    isOpened={item.status === 'opened'}
                />
            </View>

            {/* Center: title + metadata */}
            <View style={styles.cardInfo}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                {/* Type pill */}
                <View style={styles.metaRow}>
                    <View style={[styles.typePill, { backgroundColor: cfg.color + '18' }]}>
                        <Text style={[styles.typePillText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                </View>
                <View style={styles.openRow}>
                    <Ionicons name={item.status === 'opened' ? "eye-outline" : "time-outline"} size={11} color={Colors.textMuted} />
                    {item.status === 'opened' ? (
                        <Text style={styles.cardDate}>Always open</Text>
                    ) : (
                        <LiveTimer date={item.opens_at} style={styles.cardDate} />
                    )}
                </View>
            </View>

            {/* Right: soft chevron circle */}
            <View style={styles.chevronCircle}>
                <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
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
        borderRadius: 20, borderWidth: 1, borderColor: Colors.border,
        gap: 14,
    },
    cardImageContainer: {
        width: 64, height: 64, borderRadius: 16,
        alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
    },
    cardImage: { width: 54, height: 54 },
    cardInfo: { flex: 1, gap: 4 },
    cardTitle: { fontSize: 16, fontFamily: Fonts.bold, color: Colors.textPrimary },

    // Type pill
    metaRow: { flexDirection: 'row', alignItems: 'center' },
    typePill: {
        paddingHorizontal: 8, paddingVertical: 3,
        borderRadius: BorderRadius.full,
        alignSelf: 'flex-start',
    },
    typePillText: { fontSize: 10, fontFamily: Fonts.bold, letterSpacing: 0.3 },

    // Timer row
    openRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    cardDate: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.textMuted },

    // Chevron
    chevronCircle: {
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: Colors.cardAlt, borderWidth: 1, borderColor: Colors.border,
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
