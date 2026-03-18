import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

export async function registerForPushNotificationsAsync() {
    let token;

    if (Platform.OS === 'web') return null;

    if (Device.isDevice) {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== 'granted') {
            console.log('Failed to get push token for push notification!');
            return null;
        }

        // Project ID is required for Expo Push Tokens since SDK 49
        const projectId =
            Constants?.expoConfig?.extra?.eas?.projectId ??
            Constants?.easConfig?.projectId;

        try {
            token = (await Notifications.getExpoPushTokenAsync({
                projectId,
            })).data;
        } catch (e) {
            console.error('Error getting push token', e);
        }
    } else {
        console.log('Must use physical device for Push Notifications');
    }

    if (Platform.OS === 'android') {
        Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
        });
    }

    return token;
}

export async function savePushToken(userId: string, token: string) {
    const { error } = await supabase
        .from('profiles')
        .update({ push_token: token })
        .eq('id', userId);

    if (error) {
        console.error('Error saving push token to profile:', error);
    }
}

export function setupNotificationHandlers() {
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
            shouldShowBanner: true,
            shouldShowList: true,
        }),
    });
}

export function setupResponseListener(navigationRef: any) {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
        const data = response.notification.request.content.data;
        console.log('[NotificationResponse] Received:', data);
        if (data && data.screen) {
            if (navigationRef.isReady()) {
                navigationRef.navigate(data.screen, data.params);
            } else {
                const unsubscribe = navigationRef.addListener('state', () => {
                    if (navigationRef.isReady()) {
                        navigationRef.navigate(data.screen, data.params);
                        unsubscribe();
                    }
                });
            }
        }
    });

    // Handle when app is opened from a closed state by a notification
    Notifications.getLastNotificationResponseAsync().then(response => {
        const data = response?.notification?.request?.content?.data;
        if (data && data.screen) {
            console.log('[NotificationResponse] Cold start data:', data);
            const checkReady = setInterval(() => {
                if (navigationRef.isReady()) {
                    navigationRef.navigate(data.screen, data.params);
                    clearInterval(checkReady);
                }
            }, 500);
            setTimeout(() => clearInterval(checkReady), 5000); // safety timeout
        }
    });

    return subscription;
}

export async function clearBadgeCount() {
    await Notifications.setBadgeCountAsync(0);
}

export async function sendPushNotification(targetUserId: string, title: string, body: string, data: any = {}) {
    try {
        // 1. Fetch user setting and token
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('push_token, push_notifications_enabled')
            .eq('id', targetUserId)
            .maybeSingle();

        if (error || !profile?.push_token) return;
        if (profile.push_notifications_enabled === false) return; // User disabled all

        console.log(`[PushNotifications] attempt send to ${targetUserId}. Token: ${profile.push_token}`);

        // 2. Send to Expo Push Service
        const res = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to: profile.push_token,
                title: title,
                body: body,
                data: { ...data, sender: 'kapsely' },
                sound: 'default',
            }),
        });

        const resJson = await res.json();
        console.log(`[PushNotifications] response from Expo:`, resJson);
    } catch (e) {
        console.error('sendPushNotification error:', e);
    }
}
