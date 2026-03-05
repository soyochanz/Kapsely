import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import LandingScreen from '../screens/auth/LandingScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import { Colors } from '../theme';

type AuthView = 'landing' | 'login' | 'register';

export default function AuthNavigator() {
    const [view, setView] = useState<AuthView>('landing');

    return (
        <View style={styles.container}>
            {view === 'landing' ? (
                <LandingScreen
                    onNavigateToLogin={() => setView('login')}
                    onNavigateToRegister={() => setView('register')}
                />
            ) : view === 'login' ? (
                <LoginScreen
                    onNavigateToRegister={() => setView('register')}
                    onNavigateBack={() => setView('landing')}
                />
            ) : (
                <RegisterScreen
                    onNavigateToLogin={() => setView('login')}
                    onNavigateBack={() => setView('landing')}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
});
