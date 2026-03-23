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

import { createStackNavigator } from '@react-navigation/stack';
import CapsuleDetailScreen from '../screens/CapsuleDetailScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import TimerConfigScreen from '../screens/TimerConfigScreen';
import CreateSelectionScreen from '../screens/CreateSelectionScreen';
import CapsuleSelectorScreen from '../screens/CapsuleSelectorScreen';
import AddItemScreen from '../screens/AddItemScreen';
import UserListScreen from '../screens/UsersListScreen';
import PersonalizeProfileScreen from '../screens/PersonalizeProfileScreen';
import { View, StyleSheet } from 'react-native';
import { Colors } from '../theme';
import { navigationRef } from '../../App';


const Tab = createMaterialTopTabNavigator();
const Stack = createStackNavigator();

const FeedStack = createStackNavigator();
function FeedStackNavigator() {
    return (
        <FeedStack.Navigator screenOptions={{ headerShown: false }}>
            <FeedStack.Screen name="FeedMain" component={FeedScreen} />
        </FeedStack.Navigator>
    );
}

const SearchStack = createStackNavigator();
function SearchStackNavigator() {
    return (
        <SearchStack.Navigator screenOptions={{ headerShown: false }}>
            <SearchStack.Screen name="SearchMain" component={SearchScreen} />
        </SearchStack.Navigator>
    );
}

const NotifStack = createStackNavigator();
function NotifStackNavigator() {
    return (
        <NotifStack.Navigator screenOptions={{ headerShown: false }}>
            <NotifStack.Screen name="NotifMain" component={NotificationsScreen} />
        </NotifStack.Navigator>
    );
}

const ProfileStack = createStackNavigator();
function ProfileStackNavigator() {
    return (
        <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
            <ProfileStack.Screen name="ProfileMain" component={ProfileScreen} />
            <ProfileStack.Screen name="EditProfile" component={EditProfileScreen} />
        </ProfileStack.Navigator>
    );
}

function TabNavigator() {
    return (
        <Tab.Navigator
            tabBar={(props: any) => <TabBar {...props} />}
            tabBarPosition="bottom"
            screenOptions={{}}
        >
            <Tab.Screen name="Feed" component={FeedStackNavigator} />
            <Tab.Screen name="Search" component={SearchStackNavigator} />
            <Tab.Screen name="Notifications" component={NotifStackNavigator} />
            <Tab.Screen name="Profile" component={ProfileStackNavigator} />
        </Tab.Navigator>
    );
}

export default function AppNavigator() {
    return (
        <View style={{ flex: 1 }}>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
                <Stack.Screen name="Main" component={TabNavigator} />
                <Stack.Screen name="CapsuleDetail" component={CapsuleDetailScreen} />
                <Stack.Screen name="UserProfile" component={ProfileScreen} />
                <Stack.Screen name="ChatList" component={ChatListScreen} />
                <Stack.Screen name="ChatDetail" component={ChatDetailScreen} />
                <Stack.Screen name="CreateSelection" component={CreateSelectionScreen} />
                <Stack.Screen name="CapsuleCreation" component={CapsuleCreationScreen} />
                <Stack.Screen name="CapsuleSelector" component={CapsuleSelectorScreen} />
                <Stack.Screen name="AddItem" component={AddItemScreen} />
                <Stack.Screen name="UserList" component={UserListScreen} />
                <Stack.Screen name="TimerConfig" component={TimerConfigScreen} />
                <Stack.Screen name="PersonalizeProfile" component={PersonalizeProfileScreen} />
                <Stack.Screen name="Inbox" component={require('../screens/InboxScreen').default} />
                <Stack.Screen name="InstagramShare" component={require('../screens/InstagramShareScreen').default} />
            </Stack.Navigator>
        </View>
    );
}

const navStyles = StyleSheet.create({});

