import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, SafeAreaView, StatusBar, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts, Spacing, Shadow, BorderRadius } from '../theme';
import InteractiveTour from '../components/InteractiveTour';

const { width } = Dimensions.get('window');

export default function CreateSelectionScreen({ route }: any) {
    const navigation = useNavigation<any>();
    const { capsuleId, isTutorial } = route.params || {};

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
                    <Ionicons name="close" size={28} color={Colors.textPrimary} />
                </TouchableOpacity>
            </View>

            <View style={styles.content}>
                <Text style={styles.title}>What would you like to do?</Text>
                <Text style={styles.subtitle}>Create something new or add to your capsules</Text>

                {!capsuleId && (
                    <>
                        <TouchableOpacity
                            style={styles.primaryBtn}
                            onPress={() => navigation.navigate('Main', { screen: 'Create' })}
                            activeOpacity={0.9}
                        >
                            <LinearGradient
                                colors={[Colors.primary, Colors.primaryDark]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.primaryGrad}
                            >
                                <View style={styles.iconCircle}>
                                    <Ionicons name="rocket" size={32} color="#fff" />
                                </View>
                                <View style={styles.btnInfo}>
                                    <Text style={styles.primaryBtnText}>Create a New Capsule</Text>
                                    <Text style={styles.primaryBtnSub}>Seal memories for your future self</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.6)" />
                            </LinearGradient>
                        </TouchableOpacity>

                        <View style={styles.divider}>
                            <View style={styles.line} />
                            <Text style={styles.dividerText}>OR ADD CONTENT</Text>
                            <View style={styles.line} />
                        </View>
                    </>
                )}

                <View style={styles.grid}>
                    {[
                        { id: 'image', icon: 'image', label: 'Image', color: '#FF6B6B', sub: 'Photos & Art' },
                        { id: 'video', icon: 'videocam', label: 'Video', color: '#4FACFE', sub: 'Live moments' },
                        { id: 'audio', icon: 'mic', label: 'Audio', color: '#06D6A0', sub: 'Voice notes' },
                        { id: 'note', icon: 'document-text', label: 'Note', color: '#FFD166', sub: 'Thoughts' },
                    ].map((item) => (
                        <TouchableOpacity
                            key={item.id}
                            style={styles.gridItem}
                            onPress={() => {
                                if (capsuleId) {
                                    navigation.navigate('AddItem', { capsuleId, type: item.id });
                                } else {
                                    navigation.navigate('CapsuleSelector', { contentType: item.id });
                                }
                            }}
                        >
                            <View style={[styles.gridIcon, { backgroundColor: item.color + '15' }]}>
                                <Ionicons name={item.icon as any} size={26} color={item.color} />
                            </View>
                            <View>
                                <Text style={styles.gridLabel}>{item.label}</Text>
                                <Text style={styles.gridSub}>{item.sub}</Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {/* Temporary disabled tutorial
            {isTutorial && !capsuleId && (
                <InteractiveTour 
                    step="SELECT_TYPE" 
                    onDismiss={() => navigation.setParams({ isTutorial: false })}
                />
            )}
            */}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    header: { padding: Spacing.md, alignItems: 'flex-end' },
    closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    content: { flex: 1, paddingHorizontal: 25, paddingTop: 20 },
    title: { fontSize: 28, fontFamily: Fonts.bold, color: Colors.textPrimary, textAlign: 'center' },
    subtitle: { fontSize: 16, fontFamily: Fonts.regular, color: Colors.textMuted, textAlign: 'center', marginTop: 8, marginBottom: 40 },

    primaryBtn: { marginBottom: 35 },
    primaryGrad: {
        flexDirection: 'row', alignItems: 'center', padding: 22, borderRadius: 24,
        ...Shadow.primary, gap: 15
    },
    iconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    btnInfo: { flex: 1 },
    primaryBtnText: { color: '#fff', fontSize: 18, fontFamily: Fonts.bold },
    primaryBtnSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontFamily: Fonts.medium, marginTop: 2 },

    divider: { flexDirection: 'row', alignItems: 'center', gap: 15, marginBottom: 35 },
    line: { flex: 1, height: 1.5, backgroundColor: Colors.border },
    dividerText: { fontSize: 12, fontFamily: Fonts.bold, color: Colors.textMuted, letterSpacing: 1.5 },

    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 15 },
    gridItem: {
        width: (width - 50 - 15) / 2,
        backgroundColor: Colors.surface,
        padding: 18,
        borderRadius: 22,
        borderWidth: 1.5,
        borderColor: Colors.border,
        gap: 12,
        ...Shadow.subtle
    },
    gridIcon: { width: 50, height: 50, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    gridLabel: { fontSize: 16, fontFamily: Fonts.bold, color: Colors.textPrimary },
    gridSub: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.textMuted, marginTop: 1 },
});
