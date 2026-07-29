import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Animated, Easing, Image, Dimensions, useWindowDimensions } from 'react-native';
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
import { safeLocalSignOut, setAuthSessionSnapshot, supabase } from './src/lib/supabase';
import { Colors, Fonts } from './src/theme';
import AppNavigator from './src/navigation/AppNavigator';
import AuthNavigator from './src/navigation/AuthNavigator';
import { multiAccountService } from './src/utils/multiAccount';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, asyncStoragePersister } from './src/lib/QueryClient';

import { timerConfigManager } from './src/utils/timerConfig';

import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Platform } from 'react-native';
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
const SUPABASE_RELIEF_MODE = true;

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
  const shimmer = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 2100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 2100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    shimmerLoop.start();

    Animated.timing(progress, {
      toValue: 1,
      duration: 1850,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      shimmerLoop.stop();
      onDone();
    });
  }, [onDone, progress, shimmer]);

  const scale = progress.interpolate({ inputRange: [0, 0.72, 1], outputRange: [1, 1.035, 1.08] });
  const opacity = progress.interpolate({ inputRange: [0, 0.84, 1], outputRange: [1, 1, 0] });
  const glowScale = progress.interpolate({ inputRange: [0, 0.58, 1], outputRange: [0.84, 1.04, 1.22] });
  const glowOpacity = progress.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 0.08, 0.17, 0] });
  const shimmerTranslate = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-screenWidth * 0.5, screenWidth * 0.5] });
  const shimmerOpacity = progress.interpolate({ inputRange: [0, 0.82, 1], outputRange: [0.08, 0.14, 0] });

  return (
    <Animated.View pointerEvents="none" style={[styles.splashOpen, { opacity, transform: [{ scale }] }]}>
      <Image source={require('./assets/android-icon-background.png')} style={styles.splashOpenBg} resizeMode="cover" />
      <Animated.View
        style={[
          styles.splashOpenGlow,
          {
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.splashOpenShimmer,
          {
            opacity: shimmerOpacity,
            transform: [{ translateX: shimmerTranslate }, { rotate: '16deg' }],
          },
        ]}
      />
    </Animated.View>
  );
}

export default function App() {
  const { width: viewportWidth } = useWindowDimensions();
  const showWebDesktopShell = Platform.OS === 'web' && viewportWidth >= 760;
  const showWebBrandPanel = viewportWidth >= 1180;
  const showWebInfoPanel = viewportWidth >= 1260;
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
        const authTimedOut = result === null;
        
        if (error) {
          console.warn('Auth check error:', error.message);
          // If the session is invalid/expired (common on web after clearing storage),
          // sign out to clear the corrupted session and let the user log in again.
          if (error.message?.includes('Refresh Token') || error.message?.includes('Invalid')) {
            await safeLocalSignOut();
          }
        }
        if (authTimedOut) {
          console.warn('Auth startup timed out, preserving local session and waiting for auth listener');
        }

        const keepKey = await withTimeout(AsyncStorage.getItem('keep_connected'), 350);
        const shouldKeep = keepKey === null ? true : JSON.parse(keepKey);

        if (s) {
          if (!shouldKeep) {
            await safeLocalSignOut();
            if (mounted) setSession(null);
          } else {
            setAuthSessionSnapshot(s);
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
      if (Platform.OS !== 'web') {
        clearBadgeCount();
      }
    }, 80);

    async function handlePushRegistration(userId: string) {
      if (Platform.OS === 'web' || SUPABASE_RELIEF_MODE) return;
      await multiAccountService.syncAllPushTokens();
    }

    // Listen for auth state changes (login / logout / token refresh)
    const { data: listener } = supabase.auth.onAuthStateChange((event, s) => {
      setAuthSessionSnapshot(s ?? null);
      setSession(s);
      // Register push token whenever a user is present, 
      // ensuring it works during account switching
      if (s?.user && (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION')) {
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
    if (!SUPABASE_RELIEF_MODE) {
      void timerConfigManager.init().catch(e => {
        console.warn('Deferred startup task failed:', e);
      });
    }
    if (Platform.OS !== 'web' && !SUPABASE_RELIEF_MODE) {
      setTimeout(() => multiAccountService.syncAllPushTokens().catch(() => {}), 2500);
    }
    const subscription = setupResponseListener(navigationRef);
    return () => {
      if (subscription && typeof subscription.remove === 'function') {
        subscription.remove();
      }
    };
  }, [session]);

  useEffect(() => {
    if (fontGateReady && authChecked) {
      const timer = setTimeout(async () => {
        try {
          setShowSplashOpen(true);
          requestAnimationFrame(() => {
            SplashScreen.hideAsync().catch((e) => {
              console.warn('Error hiding splash screen:', e);
            });
          });
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
    prefixes: ['kapsely://', 'https://kapsely.com', 'https://www.kapsely.com', 'http://kapsely.com', 'http://www.kapsely.com'],
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

  const navigationContent = (
    <NavigationContainer 
      ref={navigationRef} 
      theme={navTheme}
      linking={linking}
    >
      <View style={{ flex: 1 }}>
        {session ? <AppNavigator key={session.user.id} /> : <AuthNavigator />}
      </View>
    </NavigationContainer>
  );

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
            {showWebDesktopShell ? (
              <View style={styles.webDesktopShell}>
                {showWebBrandPanel && (
                  <View style={styles.webBrandPanel}>
                    <Image source={require('./assets/android-icon-foreground.png')} style={styles.webBrandLogo} resizeMode="contain" />
                    <Text style={styles.webBrandName}>kapsely</Text>
                    <Text style={styles.webBrandCopy}>Capsulas privadas, recuerdos compartidos y momentos que se abren cuando toca.</Text>
                  </View>
                )}
                <View style={styles.webAppFrame}>
                  {navigationContent}
                </View>
                {showWebInfoPanel && (
                  <View style={styles.webInfoPanel}>
                    <Text style={styles.webInfoTitle}>Web preview</Text>
                    <Text style={styles.webInfoText}>Disenada para usar Kapsely comodamente desde ordenador sin perder la experiencia movil.</Text>
                  </View>
                )}
              </View>
            ) : navigationContent}
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
  splashOpenGlow: {
    position: 'absolute',
    width: Math.min(360, screenWidth * 0.54),
    height: Math.min(360, screenWidth * 0.54),
    borderRadius: 999,
    bottom: Math.max(240, screenHeight * 0.19),
    backgroundColor: 'rgba(237, 182, 255, 0.42)',
  },
  splashOpenShimmer: {
    position: 'absolute',
    width: screenWidth * 0.42,
    height: screenHeight * 1.1,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  webDesktopShell: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'stretch',
    gap: 22,
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: '#F7F5FE',
  },
  webBrandPanel: {
    width: 260,
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: 28,
  },
  webBrandLogo: {
    width: 82,
    height: 82,
    marginBottom: 18,
  },
  webBrandName: {
    fontFamily: Fonts.bold,
    fontSize: 38,
    color: '#1A1530',
    marginBottom: 12,
  },
  webBrandCopy: {
    fontFamily: Fonts.regular,
    fontSize: 16,
    lineHeight: 24,
    color: '#5C5778',
  },
  webAppFrame: {
    flex: 1,
    maxWidth: 560,
    minWidth: 0,
    height: '100%' as any,
    overflow: 'hidden',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(124,92,191,0.16)',
    backgroundColor: Colors.background,
    ...Platform.select({
      web: {
        boxShadow: '0 28px 90px rgba(49, 36, 89, 0.18)',
      } as any,
    }),
  },
  webInfoPanel: {
    width: 260,
    justifyContent: 'flex-end',
    padding: 28,
  },
  webInfoTitle: {
    fontFamily: Fonts.bold,
    fontSize: 18,
    color: '#1A1530',
    marginBottom: 8,
  },
  webInfoText: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    lineHeight: 21,
    color: '#5C5778',
  },
});
