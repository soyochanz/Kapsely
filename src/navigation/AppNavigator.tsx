import React from 'react';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import FeedScreen from '../screens/FeedScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import CapsuleCreationScreen from '../screens/CapsuleCreationScreen';
import ChatScreen from '../screens/ChatScreen';
import SearchScreen from '../screens/SearchScreen';
import ChatListScreen from '../screens/ChatListScreen';
import ChatDetailScreen from '../screens/ChatDetailScreen';
import ProfileScreen from '../screens/ProfileScreen';
import TabBar from '../components/TabBar';

import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';
import CapsuleDetailScreen from '../screens/CapsuleDetailScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import CreateSelectionScreen from '../screens/CreateSelectionScreen';
import CapsuleSelectorScreen from '../screens/CapsuleSelectorScreen';
import AddItemScreen from '../screens/AddItemScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import UserListScreen from '../screens/UsersListScreen';
import PersonalizeProfileScreen from '../screens/PersonalizeProfileScreen';
import AdminCalibrationScreen from '../screens/AdminCalibrationScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Colors } from '../theme';
import { navigationRef } from '../../App';
import { safeSignOut, supabase } from '../lib/supabase';


const Tab = createMaterialTopTabNavigator();
const Stack = createStackNavigator();
const ONBOARDING_BOOT_TIMEOUT_MS = 1400;

const withTimeout = async <T,>(promise: any, ms: number, fallback: T): Promise<T> => {
    return await new Promise(resolve => {
        const timer = setTimeout(() => resolve(fallback), ms);
        Promise.resolve(promise)
            .then(value => {
                clearTimeout(timer);
                resolve(value);
            })
            .catch(() => {
                clearTimeout(timer);
                resolve(fallback);
            });
    });
};

const FeedStack = createStackNavigator();
function FeedStackNavigator() {
    return (
        <FeedStack.Navigator screenOptions={{ headerShown: false }}>
            <FeedStack.Screen name="FeedMain" component={FeedScreen} />
            {CommonScreens(FeedStack)}
        </FeedStack.Navigator>
    );
}

const SearchStack = createStackNavigator();
function SearchStackNavigator() {
    return (
        <SearchStack.Navigator screenOptions={{ headerShown: false }}>
            <SearchStack.Screen name="SearchMain" component={SearchScreen} />
            {CommonScreens(SearchStack)}
        </SearchStack.Navigator>
    );
}

const NotifStack = createStackNavigator();
function NotifStackNavigator() {
    return (
        <NotifStack.Navigator screenOptions={{ headerShown: false }}>
            <NotifStack.Screen name="NotifMain" component={NotificationsScreen} />
            {CommonScreens(NotifStack)}
        </NotifStack.Navigator>
    );
}

const ProfileStack = createStackNavigator();
function ProfileStackNavigator() {
    return (
        <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
            <ProfileStack.Screen name="ProfileMain" component={ProfileScreen} />
            <ProfileStack.Screen name="UserProfile" component={ProfileScreen} />
            <ProfileStack.Screen name="EditProfile" component={EditProfileScreen} />
            <ProfileStack.Screen name="CapsuleDetail" component={CapsuleDetailScreen} />
            <ProfileStack.Screen name="UserList" component={UserListScreen} />
            <ProfileStack.Screen name="ChatList" component={ChatListScreen} options={{ gestureEnabled: false }} />
        </ProfileStack.Navigator>
    );
}

function CommonScreens(S: any) {
    return (
        <>
            <S.Screen name="ChatList" component={ChatListScreen} options={{ gestureEnabled: false }} />
            <S.Screen name="UserProfile" component={ProfileScreen} />
            <S.Screen name="CapsuleDetail" component={CapsuleDetailScreen} />
            <S.Screen name="UserList" component={UserListScreen} />
        </>
    );
}

function TabNavigator() {
    return (
        <Tab.Navigator
            tabBar={(props: any) => <TabBar {...props} />}
            tabBarPosition="bottom"
            screenOptions={{ swipeEnabled: true }}
        >
            <Tab.Screen name="Feed" component={FeedStackNavigator} />
            <Tab.Screen name="Search" component={SearchStackNavigator} />
            <Tab.Screen name="Notifications" component={NotifStackNavigator} />
            <Tab.Screen name="Profile" component={ProfileStackNavigator} />
        </Tab.Navigator>
    );
}

export default function AppNavigator() {
    const [hasSeenOnboarding, setHasSeenOnboarding] = React.useState<boolean | null>(null);

    React.useEffect(() => {
        let alive = true;
        const checkOnboarding = async () => {
            try {
                const localSeenRaw = await withTimeout(AsyncStorage.getItem('@has_seen_onboarding_v2'), 220, null as string | null);

                // 1. Get user first to check DB status
                const authResult = await withTimeout(supabase.auth.getUser(), ONBOARDING_BOOT_TIMEOUT_MS, null as Awaited<ReturnType<typeof supabase.auth.getUser>> | null);
                const user = authResult?.data?.user ?? null;
                
                if (user) {
                    const profileResult = await withTimeout(
                        supabase
                            .from('profiles')
                            .select('has_completed_onboarding, account_status')
                            .eq('id', user.id)
                            .single(),
                        ONBOARDING_BOOT_TIMEOUT_MS,
                        null as any
                    );
                    
                    if (profileResult?.data) {
                        if (profileResult.data.account_status && profileResult.data.account_status !== 'active') {
                            await safeSignOut();
                            await AsyncStorage.removeItem('@has_seen_onboarding_v2');
                            if (alive) setHasSeenOnboarding(false);
                            return;
                        }

                        if (profileResult.data.has_completed_onboarding === false) {
                            await AsyncStorage.removeItem('@has_seen_onboarding_v2');
                            if (alive) setHasSeenOnboarding(false);
                            return;
                        }

                        await AsyncStorage.setItem('@has_seen_onboarding_v2', 'true');
                        if (alive) setHasSeenOnboarding(true);
                        return;
                    }
                }

                // 2. Fallback to local check if Supabase is slow or unavailable
                const fallbackSeen = localSeenRaw === 'true';
                if (alive) setHasSeenOnboarding(fallbackSeen);
            } catch (e) {
                if (alive) setHasSeenOnboarding(false);
            }
        };
        checkOnboarding();
        return () => {
            alive = false;
        };
    }, []);

    if (hasSeenOnboarding === null) {
        return (
            <View style={{ flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    return (
        <View style={{ flex: 1 }}>
            <Stack.Navigator 
                screenOptions={{ headerShown: false }}
                initialRouteName={hasSeenOnboarding ? "Main" : "Onboarding"}
            >
                <Stack.Screen name="Onboarding" component={OnboardingScreen} />
                <Stack.Screen name="Main" component={TabNavigator} />
                <Stack.Screen name="CapsuleDetail" component={CapsuleDetailScreen} />
                <Stack.Screen name="CreateSelection" component={CreateSelectionScreen} />
                <Stack.Screen name="CapsuleCreation" component={CapsuleCreationScreen} />
                <Stack.Screen name="CapsuleSelector" component={CapsuleSelectorScreen} />
                <Stack.Screen name="AddItem" component={AddItemScreen} />
                <Stack.Screen name="PersonalizeProfile" component={PersonalizeProfileScreen} />
                <Stack.Screen name="AdminCalibration" component={AdminCalibrationScreen} />
                <Stack.Screen name="InstagramShare" component={require('../screens/InstagramShareScreen').default} />
                <Stack.Screen 
                    name="ChatDetail" 
                    component={ChatDetailScreen} 
                    options={{ 
                        gestureEnabled: true,
                        cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS
                    }} 
                />
                <Stack.Screen name="ExternalProfile" component={ProfileScreen} />
                <Stack.Screen name="ChatList" component={ChatListScreen} />
                <Stack.Screen name="UserList" component={UserListScreen} />
            </Stack.Navigator>
        </View>
    );
}

const navStyles = StyleSheet.create({});

