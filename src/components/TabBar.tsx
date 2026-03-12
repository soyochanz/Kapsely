import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Animated } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts, Spacing, BorderRadius, Shadow } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

const TAB_CONFIG = [
    { name: 'Feed', icon: 'home-outline', iconActive: 'home', label: 'Home' },
    { name: 'Notifications', icon: 'notifications-outline', iconActive: 'notifications', label: 'Alerts' },
    { name: 'Create', icon: 'add', iconActive: 'add', label: '', isCenter: true },
    { name: 'Search', icon: 'search-outline', iconActive: 'search', label: 'Search' },
    { name: 'Profile', icon: 'person-outline', iconActive: 'person', label: 'Profile' },
];

function TabItem({ route, index, state, navigation, cfg, badgeCount }: { route: any, index: number, state: any, navigation: any, cfg: any, badgeCount?: number }) {
    const isFocused = state.index === index;
    const animatedScale = React.useRef(new Animated.Value(isFocused ? 1.1 : 1)).current;

    React.useEffect(() => {
        Animated.spring(animatedScale, {
            toValue: isFocused ? 1.15 : 1,
            useNativeDriver: true,
            tension: 50,
            friction: 7,
        }).start();
    }, [isFocused]);

    const onPress = () => {
        const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
        if (route.name === 'Create') {
            // Always navigate to CreateSelection regardless of focus state
            // setTimeout(0) lets React flush before navigating (fixes iOS Expo Go rendering bug)
            setTimeout(() => {
                (navigation as any).navigate('CreateSelection');
            }, 0);
            return;
        }
        if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
        }
    };

    if (cfg.isCenter) {
        return (
            <View key={route.key} style={styles.centerContainer}>
                <TouchableOpacity
                    onPress={onPress}
                    style={styles.centerBtnWrapper}
                    activeOpacity={0.8}
                >
                    <LinearGradient
                        colors={[Colors.primaryLight, Colors.primary, Colors.primaryDark]}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        style={styles.centerBtn}
                    >
                        <Ionicons name="add" size={32} color="#fff" />
                    </LinearGradient>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <TouchableOpacity
            key={route.key}
            onPress={onPress}
            style={styles.tab}
            activeOpacity={0.7}
        >
            <Animated.View style={[styles.iconContainer, { transform: [{ scale: animatedScale }] }]}>
                <Ionicons
                    name={(isFocused ? cfg.iconActive : cfg.icon) as any}
                    size={28}
                    color={isFocused ? Colors.primary : Colors.textMuted}
                />
                {badgeCount !== undefined && badgeCount > 0 && (
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>{badgeCount > 9 ? '9+' : badgeCount}</Text>
                    </View>
                )}
                {isFocused && <View style={styles.activeDot} />}
            </Animated.View>
        </TouchableOpacity>
    );
}

export const TAB_BAR_HEIGHT = 84;

export default function TabBar(props: BottomTabBarProps) {
    const { state } = props;
    const insets = useSafeAreaInsets();
    const [unreadCount, setUnreadCount] = React.useState(0);

    const fetchUnreadCount = React.useCallback(async () => {
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
        fetchUnreadCount();

        // Real-time subscription for unread count — listen to both INSERT and UPDATE
        const channel = supabase
            .channel('tabbar_notifs')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications'
            }, fetchUnreadCount)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'notifications'
            }, fetchUnreadCount)
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchUnreadCount]);

    // Refresh badge when the current tab changes (e.g., after visiting Notifications)
    React.useEffect(() => {
        fetchUnreadCount();
    }, [state.index]);
    
    // Determine bottom position based on device navigation type
    const hasOnScreenButtons = Platform.OS === 'android' && insets.bottom > 20;
    const bottomPos = Platform.OS === 'ios' ? 24 : (hasOnScreenButtons ? (12 + insets.bottom) : 24);

    const focusedRoute = state.routes[state.index];
    const focusedDescriptor = props.descriptors[focusedRoute.key];
    const focusedOptions = focusedDescriptor.options;

    if ((focusedOptions.tabBarStyle as any)?.display === 'none') {
        return null;
    }

    return (
        <View style={[styles.outerWrapper, { bottom: bottomPos }]}>
            <View style={styles.bar}>
                {state.routes.map((route, index) => (
                    <TabItem
                        key={route.key}
                        route={route}
                        index={index}
                        state={state}
                        navigation={props.navigation}
                        cfg={TAB_CONFIG[index]}
                        badgeCount={TAB_CONFIG[index].name === 'Notifications' ? unreadCount : 0}
                    />
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    outerWrapper: {
        position: 'absolute',
        bottom: Platform.OS === 'ios' ? 24 : 12,
        left: 16,
        right: 16,
        zIndex: 1000,
    },
    bar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 32,
        height: 72,
        paddingHorizontal: 12,
        borderWidth: 1.5,
        borderColor: 'rgba(166, 110, 255, 0.1)',
        ...Platform.select({
            web: { boxShadow: '0px 10px 40px rgba(166, 110, 255, 0.15)' },
            ios: {
                shadowColor: Colors.primary,
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.1,
                shadowRadius: 20,
            },
            android: {
                elevation: 8,
            }
        }),
    },

    // ── Regular tab ──
    tab: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
    },
    iconContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        height: 32,
        position: 'relative',
    },
    activeDot: {
        position: 'absolute',
        bottom: -2,
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: Colors.primary,
    },

    // ── Center Create ──
    centerContainer: {
        flex: 1.2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    centerBtnWrapper: {
        marginTop: -32,
        borderRadius: 30,
        backgroundColor: 'transparent',
        ...Platform.select({
            web: { boxShadow: `0px 12px 24px ${Colors.primary}50` },
            ios: {
                shadowColor: Colors.primary,
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.4,
                shadowRadius: 15,
            },
            android: {
                elevation: 12,
            }
        }),
    },
    centerBtn: {
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 4,
        borderColor: '#fff',
    },
    badge: {
        position: 'absolute',
        top: -4,
        right: -8,
        backgroundColor: Colors.eventCap, // Using a red-ish color from theme
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: '#fff',
    },
    badgeText: {
        color: '#fff',
        fontSize: 10,
        fontFamily: Fonts.bold,
        lineHeight: 12,
    },
});

