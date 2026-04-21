import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Platform, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Colors, Fonts } from '../theme';

const { width, height } = Dimensions.get('window');

const D = {
    purple: '#7C3AED',
    rose: '#F43F5E',
    amber: '#F59E0B',
    emerald: '#10B981',
    text: '#1A1530',
    textSec: '#5C5778',
    textMuted: '#A09CC0',
    glass: 'rgba(255, 255, 255, 0.7)',
    border: 'rgba(255, 255, 255, 0.3)',
};

export default function CreateSelectionScreen({ route }: any) {
    const navigation = useNavigation<any>();
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const { capsuleId } = route.params || {};

    const contentItems = [
        { id: 'image', icon: 'image', label: t('create.selection.image'), color: D.rose, sub: t('create.selection.image_sub'), grad: ['#FF8E8E', '#F43F5E'] },
        { id: 'video', icon: 'videocam', label: t('create.selection.video'), color: D.purple, sub: t('create.selection.video_sub'), grad: ['#A78BFA', '#7C3AED'] },
        { id: 'audio', icon: 'mic', label: t('create.selection.audio'), color: D.emerald, sub: t('create.selection.audio_sub'), grad: ['#6EE7B7', '#10B981'] },
        { id: 'note', icon: 'document-text', label: t('create.selection.note'), color: D.amber, sub: t('create.selection.note_sub'), grad: ['#FCD34D', '#F59E0B'] },
    ];

    return (
        <View style={s.root}>
            <StatusBar barStyle="dark-content" />
            
            {/* Ambient Orbs for aesthetic background */}
            <View style={[s.orb, { top: -50, right: -50, backgroundColor: D.purple + '15' }]} />
            <View style={[s.orb, { bottom: height * 0.2, left: -100, backgroundColor: D.rose + '10', width: 300, height: 300 }]} />

            <View style={[s.header, { paddingTop: insets.top + 10 }]}>
                <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.goBack()} style={s.closeBtn}>
                    <BlurView intensity={30} tint="light" style={s.closeBlur}>
                        <Ionicons name="close" size={24} color={D.text} />
                    </BlurView>
                </TouchableOpacity>
            </View>

            <View style={s.content}>
                <View style={s.titleGroup}>
                    <Text style={s.title}>{t('create.selection.title')}</Text>
                    <Text style={s.subtitle}>{t('create.selection.subtitle')}</Text>
                </View>

                <View style={s.grid}>
                    {contentItems.map((item) => (
                        <TouchableOpacity
                            key={item.id}
                            style={s.card}
                            activeOpacity={0.85}
                            onPress={() => {
                                if (capsuleId) {
                                    navigation.navigate('AddItem', { capsuleId, type: item.id });
                                } else {
                                    navigation.navigate('CapsuleSelector', { contentType: item.id });
                                }
                            }}
                        >
                            <BlurView intensity={60} tint="light" style={s.cardInner}>
                                <LinearGradient
                                    colors={item.grad as any}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={s.iconWrap}
                                >
                                    <Ionicons name={item.icon as any} size={28} color="#fff" />
                                </LinearGradient>
                                <View style={s.cardText}>
                                    <Text style={s.cardLabel}>{item.label}</Text>
                                    <Text style={s.cardSub} numberOfLines={2}>{item.sub}</Text>
                                </View>
                                <View style={s.arrow}>
                                    <Ionicons name="chevron-forward" size={18} color={D.textMuted} />
                                </View>
                            </BlurView>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            <View style={[s.footer, { paddingBottom: insets.bottom + 20 }]}>
                <Text style={s.footerText}>Kapsely • Memories Forever</Text>
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#FFFFFF' },
    orb: { position: 'absolute', width: 250, height: 250, borderRadius: 125 },
    header: { paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'flex-end', zIndex: 10 },
    closeBtn: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden' },
    closeBlur: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    
    content: { flex: 1, paddingHorizontal: 24, paddingTop: 10 },
    titleGroup: { marginBottom: 35 },
    title: { fontSize: 32, fontFamily: Fonts.bold, color: D.text, letterSpacing: -0.5 },
    subtitle: { fontSize: 16, fontFamily: Fonts.regular, color: D.textSec, marginTop: 8 },

    grid: { gap: 16 },
    card: {
        height: 90,
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: D.border,
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10 },
            android: { elevation: 2 }
        })
    },
    cardInner: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    iconWrap: {
        width: 56,
        height: 56,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    cardText: { flex: 1, gap: 2 },
    cardLabel: { fontSize: 18, fontFamily: Fonts.bold, color: D.text },
    cardSub: { fontSize: 13, fontFamily: Fonts.regular, color: D.textSec },
    arrow: { width: 30, alignItems: 'center' },

    footer: { alignItems: 'center' },
    footerText: { fontSize: 12, fontFamily: Fonts.medium, color: D.textMuted, opacity: 0.6, letterSpacing: 1 },
});
