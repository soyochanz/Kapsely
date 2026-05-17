import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Animated, Easing, Image, Dimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Inter_300Light, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { Poppins_400Regular, Poppins_600SemiBold, Poppins_700Bold, Poppins_800ExtraBold } from '@expo-google-fonts/poppins';
import { TitanOne_400Regular } from '@expo-google-fonts/titan-one';
import { Outfit_400Regular, Outfit_700Bold } from '@expo-google-fonts/outfit';
import { Lobster_400Regular } from '@expo-google-fonts/lobster';
import { SpaceMono_400Regular } from '@expo-google-fonts/space-mono';
import { PermanentMarker_400Regular } from '@expo-google-fonts/permanent-marker';
import { Bangers_400Regular } from '@expo-google-fonts/bangers';
import { Caveat_400Regular, Caveat_700Bold } from '@expo-google-fonts/caveat';
import { NavigationContainer, DefaultTheme, createNavigationContainerRef } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';

export const navigationRef = createNavigationContainerRef();
import { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import { Colors } from './src/theme';
import AppNavigator from './src/navigation/AppNavigator';
import AuthNavigator from './src/navigation/AuthNavigator';
import { multiAccountService } from './src/utils/multiAccount';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, asyncStoragePersister } from './src/lib/QueryClient';

import { timerConfigManager } from './src/utils/timerConfig';

import { SafeAreaProvider } from 'react-native-safe-area-context';
import { InteractionManager, Platform } from 'react-native';
import { registerForPushNotificationsAsync, savePushToken, setupNotificationHandlers, setupResponseListener, clearBadgeCount } from './src/utils/pushNotifications';

import AsyncStorage from '@react-native-async-storage/async-storage';
import './src/i18n/config';

SplashScreen.preventAutoHideAsync();

// Setup handlers outside the component
setupNotificationHandlers();

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const STARTUP_AUTH_TIMEOUT_MS = 1200;
const FONT_GATE_TIMEOUT_MS = 900;
const SAFETY_SPLASH_TIMEOUT_MS = 1700;

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T | null> =>
  new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), ms);
    promise
      .then(value => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });

function SplashOpenAnimation({ onDone }: { onDone: () => void }) {
  const progress = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 760,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(onDone);
  }, [onDone, progress]);

  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const opacity = progress.interpolate({ inputRange: [0, 0.72, 1], outputRange: [1, 0.95, 0] });
  const logoScale = progress.interpolate({ inputRange: [0, 0.55, 1], outputRange: [1, 0.92, 1.22] });
  const logoY = progress.interpolate({ inputRange: [0, 1], outputRange: [0, -22] });

  return (
    <Animated.View pointerEvents="none" style={[styles.splashOpen, { opacity, transform: [{ scale }] }]}>
      <Image source={require('./assets/android-icon-background.png')} style={styles.splashOpenBg} resizeMode="cover" />
      <Animated.Image
        source={require('./assets/splash-icon.png')}
        style={[styles.splashOpenLogo, { transform: [{ scale: logoScale }, { translateY: logoY }] }]}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({ 
    Inter_300Light, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
    Poppins_400Regular, Poppins_600SemiBold, Poppins_700Bold, Poppins_800ExtraBold,
    TitanOne_400Regular, Outfit_400Regular, Outfit_700Bold, Lobster_400Regular, SpaceMono_400Regular,
    PermanentMarker_400Regular, Bangers_400Regular, Caveat_400Regular, Caveat_700Bold
  });
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [fontGateReady, setFontGateReady] = useState(Platform.OS === 'web');
  const [showSplashOpen, setShowSplashOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function startup() {
      try {
        const result = await withTimeout(supabase.auth.getSession(), STARTUP_AUTH_TIMEOUT_MS);
        const s = result?.data?.session ?? null;
        const error = result?.error ?? null;
        
        if (error) {
          console.warn('Auth check error:', error.message);
          // If the session is invalid/expired (common on web after clearing storage),
          // sign out to clear the corrupted session and let the user log in again.
          if (error.message?.includes('Refresh Token') || error.message?.includes('Invalid')) {
            await supabase.auth.signOut();
          }
        }

        const keepKey = await withTimeout(AsyncStorage.getItem('keep_connected'), 350);
        const shouldKeep = keepKey === null ? true : JSON.parse(keepKey);

        if (s) {
          if (!shouldKeep) {
            await supabase.auth.signOut();
            if (mounted) setSession(null);
          } else {
            if (mounted) setSession(s);
          }
        }
      } catch (e) {
        console.error('Startup error:', e);
      } finally {
        if (mounted) setAuthChecked(true);
      }
    }

    startup();

    const deferredTimer = setTimeout(() => {
      InteractionManager.runAfterInteractions(async () => {
        try {
          await timerConfigManager.init();
          if (Platform.OS !== 'web') {
            clearBadgeCount();
            setTimeout(() => multiAccountService.syncAllPushTokens().catch(() => {}), 2500);
          }
        } catch (e) {
          console.warn('Deferred startup task failed:', e);
        }
      });
    }, 350);

    async function handlePushRegistration(userId: string) {
      if (Platform.OS === 'web') return;
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

    return () => {
      mounted = false;
      clearTimeout(deferredTimer);
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (fontsLoaded || Platform.OS === 'web') {
      setFontGateReady(true);
      return;
    }
    const timer = setTimeout(() => setFontGateReady(true), FONT_GATE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [fontsLoaded]);

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
    if (fontGateReady && authChecked) {
      // Small delay to ensure everything is rendered
      const timer = setTimeout(async () => {
        try {
          await SplashScreen.hideAsync();
          if (Platform.OS !== 'web') setShowSplashOpen(true);
        } catch (e) {
          console.warn('Error hiding splash screen:', e);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [fontGateReady, authChecked]);

  // Safety timer to hide splash screen even if something hangs
  useEffect(() => {
    const safetyTimer = setTimeout(async () => {
      if (authChecked && fontGateReady) return;
      console.warn('Safety timer triggered: hiding splash screen due to timeout');
      setAuthChecked(true); 
      setFontGateReady(true);
      try {
        await SplashScreen.hideAsync();
      } catch (e) {}
    }, SAFETY_SPLASH_TIMEOUT_MS);
    return () => clearTimeout(safetyTimer);
  }, [authChecked, fontGateReady]);

  const onLayoutRootView = undefined;

  if (!authChecked || !fontGateReady) {
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister: asyncStoragePersister }}
      >
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
            {showSplashOpen && <SplashOpenAnimation onDone={() => setShowSplashOpen(false)} />}
          </View>
        </SafeAreaProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
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
  splashOpen: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: screenWidth,
    height: screenHeight,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f1fe',
    zIndex: 9999,
  },
  splashOpenBg: {
    position: 'absolute',
    width: screenWidth,
    height: screenHeight,
  },
  splashOpenLogo: {
    width: Math.min(180, screenWidth * 0.42),
    height: Math.min(180, screenWidth * 0.42),
  },
});
