import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Inter_300Light, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { Poppins_400Regular, Poppins_600SemiBold, Poppins_700Bold, Poppins_800ExtraBold } from '@expo-google-fonts/poppins';
import { NavigationContainer, DefaultTheme, createNavigationContainerRef } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';

export const navigationRef = createNavigationContainerRef();
import { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import { Colors } from './src/theme';
import AppNavigator from './src/navigation/AppNavigator';
import AuthNavigator from './src/navigation/AuthNavigator';
import { multiAccountService } from './src/utils/multiAccount';

import { timerConfigManager } from './src/utils/timerConfig';

import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Platform } from 'react-native';
import { registerForPushNotificationsAsync, savePushToken, setupNotificationHandlers, setupResponseListener, clearBadgeCount } from './src/utils/pushNotifications';

import AsyncStorage from '@react-native-async-storage/async-storage';
import './src/i18n/config';

SplashScreen.preventAutoHideAsync();

// Setup handlers outside the component
setupNotificationHandlers();

export default function App() {
  const [fontsLoaded] = useFonts({ 
    Inter_300Light, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
    Poppins_400Regular, Poppins_600SemiBold, Poppins_700Bold, Poppins_800ExtraBold
  });
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    async function startup() {
      try {
        // Init timer configs
        await timerConfigManager.init();

        // Clear notification badge
        if (Platform.OS !== 'web') clearBadgeCount();

        // Get session
        const { data: { session: s }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.warn('Auth check error:', error.message);
          // If the session is invalid/expired (common on web after clearing storage),
          // sign out to clear the corrupted session and let the user log in again.
          if (error.message?.includes('Refresh Token') || error.message?.includes('Invalid')) {
            await supabase.auth.signOut();
          }
        }

        // Check if user wants to stay connected
        const keepKey = await AsyncStorage.getItem('keep_connected');
        const shouldKeep = keepKey === null ? true : JSON.parse(keepKey);

        if (s) {
          if (!shouldKeep) {
            // User chose NOT to stay logged in, so sign out on fresh start
            await supabase.auth.signOut();
            setSession(null);
          } else {
            setSession(s);
            handlePushRegistration(s.user.id);
          }
        }
      } catch (e) {
        console.error('Startup error:', e);
      } finally {
        setAuthChecked(true);
      }
    }

    startup();

    async function handlePushRegistration(userId: string) {
      if (Platform.OS === 'web') return;
      // Sync ALL saved accounts with the current token to ensure push works for all of them
      await multiAccountService.syncAllPushTokens();
    }

    // Listen for auth state changes (login / logout / token refresh)
    const { data: listener } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // Register push token whenever a user is present, 
      // ensuring it works during account switching
      if (s?.user) {
        handlePushRegistration(s.user.id);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    const subscription = setupResponseListener(navigationRef);
    return () => {
      if (subscription && typeof subscription.remove === 'function') {
        subscription.remove();
      }
    };
  }, [session]);

  useEffect(() => {
    if (fontsLoaded && authChecked) {
      // Small delay to ensure everything is rendered
      const timer = setTimeout(async () => {
        try {
          await SplashScreen.hideAsync();
        } catch (e) {
          console.warn('Error hiding splash screen:', e);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [fontsLoaded, authChecked]);

  // Safety timer to hide splash screen even if something hangs
  useEffect(() => {
    const safetyTimer = setTimeout(async () => {
      if (authChecked && fontsLoaded) return;
      console.warn('Safety timer triggered: hiding splash screen due to timeout');
      setAuthChecked(true); 
      try {
        await SplashScreen.hideAsync();
      } catch (e) {}
    }, 6000); // 6 seconds max for splash screen
    return () => clearTimeout(safetyTimer);
  }, []);

  const onLayoutRootView = undefined;

  if (!authChecked || (!fontsLoaded && Platform.OS !== 'web')) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  const navTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      primary: Colors.primary,
      background: Colors.background,
      card: Colors.surface,
      border: Colors.border,
      notification: Colors.primary,
    },
  };

  const linking = {
    prefixes: ['kapsely://', 'https://kapsely.com', 'http://kapsely.com'],
    config: {
      screens: {
        Main: {
          screens: {
            Feed: 'feed',
            Search: 'search',
            Notifications: 'notifications',
            Profile: 'profile',
          },
        },
        CapsuleDetail: {
          path: 'capsules/:capsuleId',
          parse: {
            capsuleId: (id: string) => id.replace(/\/$/, ''), // Remove trailing slash
          },
        },
        ChatDetail: {
          path: 'chat/:conversationId',
          parse: {
            conversationId: (id: string) => id.replace(/\/$/, ''),
          },
        },
        UserProfile: {
          path: 'user/:userId',
          parse: {
            userId: (id: string) => id.replace(/\/$/, ''),
          },
        },
      },
    },
  };

  return (
    <SafeAreaProvider>
      <View
        style={[
          { flex: 1, backgroundColor: Colors.background },
          Platform.OS === 'web' && ({ height: '100vh', width: '100vw' } as any)
        ]}
      >
        <StatusBar style="dark" backgroundColor={Colors.background} />
        <NavigationContainer 
          ref={navigationRef} 
          theme={navTheme}
          linking={linking}
        >
          <View style={{ flex: 1 }}>
            {session ? <AppNavigator key={session.user.id} /> : <AuthNavigator />}
          </View>
        </NavigationContainer>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    height: Platform.OS === 'web' ? ('100vh' as any) : '100%',
    width: Platform.OS === 'web' ? ('100vw' as any) : '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
});
