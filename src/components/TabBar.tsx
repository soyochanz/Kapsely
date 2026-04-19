import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform, Animated, Alert, Text, Image, ScrollView, Modal, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { feedScrollBus } from '../utils/feedScrollBus';


// ─── Config ───────────────────────────────────────────────────────────────────
const TAB_CONFIG = [
    { name: 'Feed', icon: 'home-outline' as const, iconActive: 'home' as const },
    { name: 'Search', icon: 'search-outline' as const, iconActive: 'search' as const },
    { name: 'Create', icon: 'add' as const, iconActive: 'add' as const, isCenter: true },
    { name: 'Notifications', icon: 'notifications-outline' as const, iconActive: 'notifications' as const },
    { name: 'Profile', icon: 'person-outline' as const, iconActive: 'person' as const },
];

const PURPLE = '#7c3aed';
const PURPLE_LIGHT = '#a78bfa';

import { multiAccountService, SavedAccount } from '../utils/multiAccount';
import QuickLoginModal from './QuickLoginModal';

export const TAB_BAR_HEIGHT = 50;

// ─── Single tab ───────────────────────────────────────────────────────────────
function TabItem({ route, index, state, navigation, cfg, hasBadge, onProfileLongPress }: {
    route: any; index: number; state: any; navigation: any;
    cfg: typeof TAB_CONFIG[0]; hasBadge?: boolean;
    onProfileLongPress?: () => void;
}) {
    const { t } = useTranslation();
    const isFocused = state.index === index;
    const scale = React.useRef(new Animated.Value(1)).current;

    React.useEffect(() => {
        Animated.spring(scale, {
            toValue: isFocused ? 1.12 : 1,
            useNativeDriver: true,
            tension: 120,
            friction: 8,
        }).start();
    }, [isFocused]);

    const onPress = () => {
        const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
        if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
            return;
        }

        if (isFocused && cfg.name === 'Feed') {
            feedScrollBus.emitScrollToTop();
            feedScrollBus.emitRefresh();
        }
    };

    const onLongPress = () => {
        if (cfg.name === 'Profile' && onProfileLongPress) {
            onProfileLongPress();
        }
    };

    return (
        <TouchableOpacity 
            onPress={onPress} 
            onLongPress={onLongPress}
            style={s.tab} 
            activeOpacity={0.6}
            delayLongPress={500}
        >
            <Animated.View style={[s.tabInner, { transform: [{ scale }] }]}>
                <Ionicons
                    name={isFocused ? cfg.iconActive : cfg.icon}
                    size={25}
                    color={isFocused ? PURPLE : Colors.textMuted}
                />
                {/* Active dot — purple, tiny, under icon */}
                {isFocused && (
                    <View style={s.activeDot} />
                )}
                {/* Unread badge */}
                {hasBadge && !isFocused && <View style={s.badgeDot} />}
            </Animated.View>
        </TouchableOpacity>
    );
}

// ─── Center create button ─────────────────────────────────────────────────────
function CenterTab({ navigation, sealedCount, fetchSealedCount }: { navigation: any, sealedCount: number | null, fetchSealedCount: () => void }) {
    const scale = React.useRef(new Animated.Value(1)).current;


    const onPress = () => {
        // Instant visual feedback
        Animated.sequence([
            Animated.timing(scale, { toValue: 0.86, duration: 80, useNativeDriver: true }),
            Animated.spring(scale, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
        ]).start();

        // Use cached count if available for instant navigation
        if (sealedCount === 0) {
            navigation.navigate('CapsuleCreation');
        } else {
            // Default to selection screen if we don't know or if > 0
            navigation.navigate('CreateSelection');
        }

        // Background check to stay in sync (not blocking)
        fetchSealedCount();
    };


    return (
        <TouchableOpacity onPress={onPress} style={s.tab} activeOpacity={0.8}>
            <Animated.View style={{ transform: [{ scale }] }}>
                <LinearGradient
                    colors={[PURPLE_LIGHT, PURPLE, '#5b21b6']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={s.createBtn}
                >
                    <Ionicons name="add" size={22} color="#fff" />
                </LinearGradient>
            </Animated.View>
        </TouchableOpacity>
    );
}

// ─── Main TabBar ──────────────────────────────────────────────────────────────
export default function TabBar(props: any) {
    const { t } = useTranslation();
    const { state, navigation } = props;
    const insets = useSafeAreaInsets();
    const [unreadCount, setUnreadCount] = React.useState(0);
    const [sealedCount, setSealedCount] = React.useState<number | null>(null);
    const [accounts, setAccounts] = React.useState<SavedAccount[]>([]);
    const [showAccountSwitcher, setShowAccountSwitcher] = React.useState(false);
    const [showAddAccount, setShowAddAccount] = React.useState(false);
    const [currentUserId, setCurrentUserId] = React.useState<string | null>(null);

    const fetchSealedCount = React.useCallback(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        setCurrentUserId(session.user.id);
        const { count } = await supabase
            .from('capsules')
            .select('*', { count: 'exact', head: true })
            .eq('owner_id', session.user.id)
            .eq('status', 'sealed');
        setSealedCount(count || 0);
    }, []);

    const loadAccounts = React.useCallback(async () => {
        await multiAccountService.saveCurrentAccount();
        const accs = await multiAccountService.getAccounts();
        setAccounts(accs);
    }, []);

    const onProfileLongPress = React.useCallback(() => {
        loadAccounts();
        setShowAccountSwitcher(true);
    }, [loadAccounts]);


    const fetchUnread = React.useCallback(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;
        const { count } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('is_read', false)
            .not('type', 'in', '("chat_message","capsule_chat","chat","message")');
        setUnreadCount(count || 0);
    }, []);

    React.useEffect(() => {
        fetchUnread();
        fetchSealedCount();
        const channel = supabase.channel('tabbar_realtime')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, fetchUnread)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications' }, fetchUnread)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'capsules' }, fetchSealedCount)
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [fetchUnread, fetchSealedCount]);


    React.useEffect(() => { fetchUnread(); }, [state.index]);

    // Hide if current screen opts out
    const focusedRoute = state.routes[state.index];
    const focusedOptions = props.descriptors[focusedRoute.key]?.options;
    if ((focusedOptions?.tabBarStyle as any)?.display === 'none') return null;

    const bottomPad = Platform.OS === 'ios'
        ? Math.max(insets.bottom, 0)
        : insets.bottom > 0 ? insets.bottom : 0;

    return (
        <View style={[s.outerWrap, { paddingBottom: bottomPad }]}>
            {/* Solid background */}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff' }]} />

            {/* Hairline top border */}
            <View style={s.topBorder} />

            {/* Tabs */}
            <View style={s.bar}>
                {TAB_CONFIG.map((cfg, idx) => {
                    if (cfg.isCenter) {
                        return (
                            <CenterTab 
                                key="center" 
                                navigation={navigation} 
                                sealedCount={sealedCount}
                                fetchSealedCount={fetchSealedCount}
                            />
                        );
                    }

                    const routeIndex = idx < 2 ? idx : idx - 1;
                    const route = state.routes[routeIndex];
                    if (!route) return null;

                    return (
                        <TabItem
                            key={route.key}
                            route={route}
                            index={routeIndex}
                            state={state}
                            navigation={navigation}
                            cfg={cfg}
                            hasBadge={cfg.name === 'Notifications' && unreadCount > 0}
                            onProfileLongPress={onProfileLongPress}
                        />
                    );
                })}
            </View>

            {/* Account Switcher Modal */}
            <Modal 
                visible={showAccountSwitcher} 
                transparent 
                animationType="slide"
                onRequestClose={() => setShowAccountSwitcher(false)}
            >
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                    <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowAccountSwitcher(false)} />
                    
                    <View style={{ backgroundColor: Colors.surface, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 20, paddingBottom: 40, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 10 }}>
                        <View style={{ width: 40, height: 4, backgroundColor: '#E0E0E0', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />
                        <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 20, textAlign: 'center', color: Colors.textPrimary }}>{t('profile.switch_profile', 'Cambiar perfil')}</Text>
                        
                        <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
                            {accounts.length === 0 ? (
                                <ActivityIndicator size="small" color={PURPLE} style={{ marginVertical: 20 }} />
                            ) : (
                                accounts.map(acc => (
                                    <TouchableOpacity 
                                        key={acc.id}
                                        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border + '33' }}
                                        onPress={async () => {
                                            await multiAccountService.saveCurrentAccount();
                                            await multiAccountService.switchAccount(acc.id);
                                            setShowAccountSwitcher(false);
                                            navigation.navigate('Profile');
                                        }}
                                    >
                                        <View style={[
                                            { width: 44, height: 44, borderRadius: 22, padding: 2, backgroundColor: Colors.surface, elevation: 2 },
                                            acc.id === currentUserId && { backgroundColor: PURPLE }
                                        ]}>
                                            <Image 
                                                source={{ uri: acc.avatar_url || 'https://via.placeholder.com/150' }} 
                                                style={{ width: '100%', height: '100%', borderRadius: 20, borderWidth: 1, borderColor: '#fff' }} 
                                            />
                                        </View>
                                        <View style={{ flex: 1, marginLeft: 12 }}>
                                            <Text style={{ fontSize: 16, fontWeight: acc.id === currentUserId ? '700' : '500', color: Colors.textPrimary }}>@{acc.username}</Text>
                                            <Text style={{ fontSize: 12, color: Colors.textMuted }}>{acc.email}</Text>
                                        </View>
                                        {acc.id === currentUserId && (
                                            <Ionicons name="checkmark-circle" size={24} color={PURPLE} />
                                        )}
                                    </TouchableOpacity>
                                ))
                            )}
                            
                            <TouchableOpacity 
                                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 15, marginTop: 10 }}
                                onPress={async () => {
                                    setShowAccountSwitcher(false);
                                    // Give it a tiny delay to let the switcher modal close
                                    setTimeout(() => setShowAddAccount(true), 300);
                                }}
                            >
                                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: PURPLE + '15', alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', borderWidth: 1, borderColor: PURPLE }}>
                                    <Ionicons name="add" size={24} color={PURPLE} />
                                </View>
                                <Text style={{ marginLeft: 12, fontSize: 16, color: PURPLE, fontWeight: '600' }}>{t('profile.add_account')}</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            <QuickLoginModal 
                visible={showAddAccount}
                onClose={() => setShowAddAccount(false)}
                onSuccess={() => {
                    setShowAddAccount(false);
                    loadAccounts();
                    // Optional: refresh current screen
                    navigation.navigate('Profile');
                }}
            />
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    outerWrap: {
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        zIndex: 1000,
        overflow: 'hidden',
    },

    topBorder: {
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: StyleSheet.hairlineWidth,
        backgroundColor: 'rgba(0,0,0,0.10)',
        zIndex: 1,
    },

    bar: {
        flexDirection: 'row',
        alignItems: 'center',
        height: TAB_BAR_HEIGHT,
        paddingHorizontal: 4,
    },

    // ── Regular tab ──
    tab: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
    },
    tabInner: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
    },

    // Active indicator — purple dot under icon
    activeDot: {
        width: 3.5,
        height: 3.5,
        borderRadius: 2,
        backgroundColor: PURPLE,
    },

    // Unread badge
    badgeDot: {
        position: 'absolute',
        top: -2,
        right: -7,
        width: 7,
        height: 7,
        borderRadius: 4,
        backgroundColor: '#E33935',
        borderWidth: 1.5,
        borderColor: '#fff',
    },

    // ── Center create — círculo limpio ──
    createBtn: {
        width: 42,
        height: 42,
        borderRadius: 21,           // círculo perfecto
        alignItems: 'center',
        justifyContent: 'center',
        ...Platform.select({
            ios: {
                shadowColor: PURPLE,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.4,
                shadowRadius: 10,
            },
            android: { elevation: 6 },
        }),
    },
});
