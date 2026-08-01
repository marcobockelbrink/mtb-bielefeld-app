import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppDataProvider } from '../src/data/AppDataContext';
import { configureNotificationHandler } from '../src/notifications';
import { NotificationProvider } from '../src/notifications/NotificationContext';
import { darkPalette, lightPalette } from '../src/theme';
import { useTheme } from '../src/ui/theme';

export default function RootLayout() {
  useEffect(() => {
    configureNotificationHandler();
  }, []);

  return (
    <SafeAreaProvider>
      <AppDataProvider>
        <NotificationProvider>
          <AppStack />
        </NotificationProvider>
      </AppDataProvider>
    </SafeAreaProvider>
  );
}

function AppStack() {
  const { palette, isDark } = useTheme();

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: palette.surface },
          headerTintColor: palette.primary,
          headerTitleStyle: { color: palette.text },
          contentStyle: { backgroundColor: palette.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="termin/[id]" options={{ title: 'Termin' }} />
        <Stack.Screen name="news/[id]" options={{ title: 'Beitrag' }} />
      </Stack>
    </>
  );
}

/** Farbwerte für Navigationselemente außerhalb von React-Komponenten. */
export const navigationPalettes = { light: lightPalette, dark: darkPalette };
