import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

// ─── Config ───────────────────────────────────────────────────────────────────
const TAB_CONFIG = [
    { name: 'Feed', icon: 'home-outline' as const, iconActive: 'home' as const },
    { name: 'Notifications', icon: 'notifications-outline' as const, iconActive: 'notifications' as const },
    { name: 'Create', icon: 'add' as const, iconActive: 'add' as const, isCenter: true },
    { name: 'Search', icon: 'search-outline' as const, iconActive: 'search' as const },
    { name: 'Profile', icon: 'person-outline' as const, iconActive: 'person' as const },
];

export const TAB_BAR_HEIGHT = 80;

// ─── Single tab ───────────────────────────────────────────────────────────────
function TabItem({ route, index, state, navigation, cfg, hasBadge }: {
    route: any; index: number; state: any; navigation: any; cfg: typeof TAB_CONFIG[0]; hasBadge?: boolean;
}) {
    const isFocused = state.index === index;
    const scale = React.useRef(new Animated.Value(1)).current;

    React.useEffect(() => {
        Animated.spring(scale, {
            toValue: isFocused ? 1.08 : 1,
            useNativeDriver: true,
            tension: 80,
            friction: 8,
        }).start();
    }, [isFocused]);

    const onPress = () => {
        const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
        if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
    };

    return (
        <TouchableOpacity
            onPress={onPress}
            style={s.tab}
            activeOpacity={0.75}
        >
            <Animated.View
                style={[
                    s.iconWrap,
                    isFocused && s.iconWrapActive,
                    { transform: [{ scale }] },
                ]}
            >
                {isFocused ? (
                    // Filled squircle with gradient when active
                    <LinearGradient
                        colors={[Colors.primaryLight || '#b48aff', Colors.primary, Colors.primaryDark]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[StyleSheet.absoluteFill, { borderRadius: 13 }]}
                    />
                ) : null}

                <Ionicons
                    name={isFocused ? cfg.iconActive : cfg.icon}
                    size={20}
                    color={isFocused ? '#fff' : Colors.textMuted}
                />

                {/* Badge dot — only when inactive, no number */}
                {hasBadge && !isFocused && (
                    <View style={s.badgeDot} />
                )}
            </Animated.View>
        </TouchableOpacity>
    );
}

// ─── Center create button ─────────────────────────────────────────────────────
function CenterTab({ navigation }: { navigation: any }) {
    const scale = React.useRef(new Animated.Value(1)).current;

    const onPress = () => {
        Animated.sequence([
            Animated.timing(scale, { toValue: 0.9, duration: 80, useNativeDriver: true }),
            Animated.spring(scale, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }),
        ]).start();
        setTimeout(() => {
            const parent = navigation.getParent();
            if (parent) parent.navigate('CreateSelection');
            else navigation.navigate('CreateSelection');
        }, 0);
    };

    return (
        <View style={s.centerTab}>
            <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
                <Animated.View style={{ transform: [{ scale }] }}>
                    <LinearGradient
                        colors={[Colors.primaryLight || '#b48aff', Colors.primary, Colors.primaryDark]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={s.centerBtn}
                    >
                        <Ionicons name="add" size={24} color="#fff" />
                    </LinearGradient>
                </Animated.View>
            </TouchableOpacity>
        </View>
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

    // Hide bar if current tab opts out
    const focusedRoute = state.routes[state.index];
    const focusedOptions = props.descriptors[focusedRoute.key]?.options;
    if ((focusedOptions?.tabBarStyle as any)?.display === 'none') return null;

    // Bottom offset
    const bottomOffset = Platform.OS === 'ios'
        ? Math.max(insets.bottom, 16)
        : insets.bottom > 20
            ? insets.bottom + 8
            : 20;

    return (
        <View style={[s.outerWrap, { bottom: bottomOffset }]}>
            <View style={s.bar}>
                {TAB_CONFIG.map((cfg, idx) => {
                    if (cfg.isCenter) {
                        return <CenterTab key="center" navigation={navigation} />;
                    }

                    // Map visual index → route index (skip center slot)
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
        left: 20,
        right: 20,
        zIndex: 1000,
    },

    bar: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 62,
        borderRadius: 30,
        paddingHorizontal: 6,

        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.06)',

        ...Platform.select({
            ios: {
                shadowColor: 'rgba(0,0,0,0.12)',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 1,
                shadowRadius: 20,
            },
            android: { elevation: 8 },
            web: {
                boxShadow: '0 4px 28px rgba(0,0,0,0.09), 0 0 0 0.5px rgba(0,0,0,0.04)',
            },
        }),
    },

    // ── Regular tab ──
    tab: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
    },
    iconWrap: {
        width: 40,
        height: 40,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
    },
    iconWrapActive: {
        // shadow for the active squircle
        ...Platform.select({
            ios: {
                shadowColor: Colors.primary,
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
            },
            android: { elevation: 4 },
        }),
    },

    // Badge — just a dot, no number
    badgeDot: {
        position: 'absolute',
        top: 6,
        right: 6,
        width: 7,
        height: 7,
        borderRadius: 4,
        backgroundColor: '#E24B4A',
        borderWidth: 1.5,
        borderColor: '#fff',
    },

    // ── Center create ──
    centerTab: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    centerBtn: {
        width: 44,
        height: 44,
        borderRadius: 14,       // squircle, matches the active tabs
        alignItems: 'center',
        justifyContent: 'center',
        ...Platform.select({
            ios: {
                shadowColor: Colors.primary,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.38,
                shadowRadius: 10,
            },
            android: { elevation: 6 },
            web: { boxShadow: `0 4px 16px ${Colors.primary}55` },
        }),
    },
});