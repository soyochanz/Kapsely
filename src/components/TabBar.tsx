import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { BlurView } from 'expo-blur';

// ─── Config ───────────────────────────────────────────────────────────────────
const TAB_CONFIG = [
    { name: 'Feed', icon: 'home-outline' as const, iconActive: 'home' as const },
    { name: 'Search', icon: 'search-outline' as const, iconActive: 'search' as const },
    { name: 'Create', icon: 'add' as const, iconActive: 'add' as const, isCenter: true },
    { name: 'Notifications', icon: 'notifications-outline' as const, iconActive: 'notifications' as const },
    { name: 'Profile', icon: 'person-outline' as const, iconActive: 'person' as const },
];

// Purple accent — used for active state everywhere
const PURPLE = '#7c3aed';
const PURPLE_LIGHT = '#a855f7';

export const TAB_BAR_HEIGHT = 50;

// ─── Single tab ───────────────────────────────────────────────────────────────
function TabItem({ route, index, state, navigation, cfg, hasBadge }: {
    route: any; index: number; state: any; navigation: any;
    cfg: typeof TAB_CONFIG[0]; hasBadge?: boolean;
}) {
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
        if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
    };

    return (
        <TouchableOpacity onPress={onPress} style={s.tab} activeOpacity={0.6}>
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
function CenterTab({ navigation }: { navigation: any }) {
    const scale = React.useRef(new Animated.Value(1)).current;

    const onPress = async () => {
        Animated.sequence([
            Animated.timing(scale, { toValue: 0.86, duration: 80, useNativeDriver: true }),
            Animated.spring(scale, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
        ]).start();

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                const { count } = await supabase
                    .from('capsules')
                    .select('*', { count: 'exact', head: true })
                    .eq('owner_id', session.user.id)
                    .eq('status', 'sealed');
                
                if (count === 0) {
                    navigation.navigate('CapsuleCreation');
                    return;
                }
            }
        } catch (e) {
            console.error('Error checking capsules in TabBar:', e);
        }

        // Bubble up to common root in AppNavigator (sibling stack screen)
        navigation.navigate('CreateSelection');
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
    const { state, navigation } = props;
    const insets = useSafeAreaInsets();
    const [unreadCount, setUnreadCount] = React.useState(0);

    const fetchUnread = React.useCallback(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;
        const { count } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('is_read', false);
        setUnreadCount(count || 0);
    }, []);

    React.useEffect(() => {
        fetchUnread();
        const channel = supabase.channel('tabbar_notifs')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, fetchUnread)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications' }, fetchUnread)
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [fetchUnread]);

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
                        return <CenterTab key="center" navigation={navigation} />;
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
                        />
                    );
                })}
            </View>
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