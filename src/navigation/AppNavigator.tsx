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
import { supabase } from '../lib/supabase';
import { multiAccountService } from '../utils/multiAccount';


const Tab = createMaterialTopTabNavigator();
const Stack = createStackNavigator();

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
        const checkOnboarding = async () => {
            try {
                // Sync push tokens for all accounts
                multiAccountService.syncAllPushTokens().catch(console.error);
                // Also ensure current is saved
                multiAccountService.saveCurrentAccount().catch(console.error);

                // 1. Get user first to check DB status
                const { data: { user } } = await supabase.auth.getUser();
                
                if (user) {
                    const { data, error } = await supabase
                        .from('profiles')
                        .select('has_completed_onboarding')
                        .eq('id', user.id)
                        .single();
                    
                    if (data) {
                        // If DB says false, we MUST show onboarding even if local says true
                        if (data.has_completed_onboarding === false) {
                            await AsyncStorage.removeItem('@has_seen_onboarding_v2');
                            setHasSeenOnboarding(false);
                            return;
                        } else {
                            // If DB says true, ensure local is also true
                            await AsyncStorage.setItem('@has_seen_onboarding_v2', 'true');
                            setHasSeenOnboarding(true);
                            return;
                        }
                    }
                }

                // 2. Fallback to local check (for guest or if DB check failed)
                const seen = await AsyncStorage.getItem('@has_seen_onboarding_v2');
                setHasSeenOnboarding(seen === 'true');
            } catch (e) {
                setHasSeenOnboarding(false);
            }
        };
        checkOnboarding();
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

