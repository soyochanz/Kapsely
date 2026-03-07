import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator, SafeAreaView, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Fonts, Spacing, BorderRadius, Shadow } from '../theme';
import { supabase } from '../lib/supabase';

import { MODEL_IMAGES } from '../constants/models';

import LiveTimer from '../components/LiveTimer';
import CapsuleWithTimer from '../components/CapsuleWithTimer';
import { timerConfigManager } from '../utils/timerConfig';

const TYPE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
    instacap: { icon: 'camera', color: Colors.instaCap, label: 'Insta' },
    eventcap: { icon: 'calendar', color: Colors.eventCap, label: 'Event' },
    legacycap: { icon: 'time', color: Colors.legacyCap, label: 'Legacy' },
};

export default function CapsuleSelectorScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute();
    const { contentType }: any = route.params || {};

    const [capsules, setCapsules] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadCapsules();
    }, []);

    const loadCapsules = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // 1. Fetch own capsules and old shared capsules
        const { data: ownCaps, error: ownErr } = await supabase
            .from('capsules')
            .select('*')
            .or(`owner_id.eq.${user.id},invited_user_id.eq.${user.id}`)
            .eq('status', 'sealed')
            .order('created_at', { ascending: false });

        // Filter legacy own/shared
        const filteredOwnAndLegacy = (ownCaps || []).filter(cap =>
            cap.owner_id === user.id || cap.invite_status === 'accepted'
        );

        // 2. Fetch capsules where user is invited via the new system
        const { data: inviteEntries, error: inviteErr } = await supabase
            .from('capsule_invites')
            .select('capsule_id, capsules:capsule_id(*)')
            .eq('user_id', user.id)
            .eq('status', 'accepted');

        let allCaps = [...filteredOwnAndLegacy];

        if (inviteEntries) {
            inviteEntries.forEach((entry: any) => {
                const invitedCap = entry.capsules;
                // Since we query by 'accepted' status on the invite, we just add it
                if (invitedCap && invitedCap.status === 'sealed' && !allCaps.some(c => c.id === invitedCap.id)) {
                    allCaps.push(invitedCap);
                }
            });
        }

        setCapsules(allCaps.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
        setLoading(false);
    };

    const handleSelect = (capsule: any) => {
        navigation.navigate('AddItem', { capsuleId: capsule.id, type: contentType });
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Select Capsule</Text>
                <View style={{ width: 44 }} />
            </View>

            {loading ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                </View>
            ) : capsules.length === 0 ? (
                <View style={styles.centered}>
                    <Ionicons name="archive-outline" size={60} color={Colors.textMuted} />
                    <Text style={styles.emptyText}>You don't have any active capsules.</Text>
                    <TouchableOpacity
                        style={styles.createBtn}
                        onPress={() => navigation.navigate('Main', { screen: 'Create' })}
                    >
                        <Text style={styles.createBtnText}>Create your first one</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={capsules}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.list}
                    renderItem={({ item }) => <CapsuleEntry item={item} onSelect={handleSelect} />}
                />
            )}
        </SafeAreaView>
    );
}

const CapsuleEntry = ({ item, onSelect }: { item: any, onSelect: (cap: any) => void }) => {
    const cfg = TYPE_CONFIG[item.type as keyof typeof TYPE_CONFIG] || TYPE_CONFIG.legacycap;
    const [modelImg, setModelImg] = useState(() => {
        return timerConfigManager.getModelImage(item.model) || MODEL_IMAGES[item.model] || MODEL_IMAGES.beach;
    });

    useEffect(() => {
        const updateModel = () => {
            setModelImg(timerConfigManager.getModelImage(item.model) || MODEL_IMAGES[item.model] || MODEL_IMAGES.beach);
        };
        const unsubscribe = timerConfigManager.subscribe(updateModel);
        updateModel();
        return unsubscribe;
    }, [item.model]);

    return (
        <TouchableOpacity style={styles.card} onPress={() => onSelect(item)}>
            <View style={styles.cardImageContainer}>
                <View style={styles.modelWrapperSmall}>
                    <CapsuleWithTimer
                        modelKey={item.model}
                        source={{ uri: modelImg }}
                        date={item.opens_at}
                        chainId={item.chain_id}
                        capsuleType={item.type}
                        style={styles.cardImage}
                    />
                    {/* Corner Type Icon */}
                    <View style={[styles.cornerTypeIconMini, { backgroundColor: cfg.color }]}>
                        <Ionicons name={cfg.icon as any} size={8} color="#fff" />
                    </View>
                </View>
            </View>
            <View style={styles.cardInfo}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.cardType, { color: cfg.color }]}>{cfg.label.toUpperCase()}</Text>
                    <Text style={styles.dotSeparator}>•</Text>
                    <LiveTimer date={item.opens_at} style={styles.cardDate} />
                </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: Spacing.md, height: 60, borderBottomWidth: 1, borderBottomColor: Colors.border
    },
    backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 18, fontFamily: Fonts.bold, color: Colors.textPrimary },
    list: { padding: Spacing.md, gap: 15 },
    card: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
        padding: 12, borderRadius: 16, borderWidth: 1, borderColor: Colors.border,
        ...Shadow.subtle
    },
    cardImageContainer: { width: 50, height: 50, backgroundColor: Colors.cardAlt, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    cardImage: { width: 40, height: 40 },
    modelWrapperSmall: { position: 'relative', width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

    cornerTypeIconMini: {
        position: 'absolute', top: -2, right: -2,
        width: 12, height: 12, borderRadius: 6,
        alignItems: 'center', justifyContent: 'center'
    },
    dotSeparator: { color: Colors.textMuted, fontSize: 12 },
    cardInfo: { flex: 1, marginLeft: 12 },
    cardTitle: { fontSize: 16, fontFamily: Fonts.bold, color: Colors.textPrimary },
    cardType: { fontSize: 10, fontFamily: Fonts.bold, color: Colors.primary, marginTop: 2 },
    cardDate: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.textMuted, marginTop: 2 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
    emptyText: { textAlign: 'center', fontFamily: Fonts.regular, color: Colors.textMuted, marginTop: 15, fontSize: 16 },
    createBtn: { marginTop: 25, backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: BorderRadius.full },
    createBtnText: { color: '#fff', fontFamily: Fonts.bold }
});
