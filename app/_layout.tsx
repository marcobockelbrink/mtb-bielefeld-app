import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppDataProvider } from '../src/data/AppDataContext';
import { configureNotificationHandler } from '../src/notifications';
import { useAppFonts } from '../src/ui/fonts';
// Nur wegen der Nebenwirkung: Das Modul meldet den Hintergrundauftrag im
// Modulrumpf an. Weckt das System die App im Hintergrund, startet sie in einer
// frischen Umgebung — der Auftrag muss dann schon bekannt sein, bevor
// irgendeine Komponente gezeichnet wird.
import '../src/notifications/backgroundTask';
import { NotificationProvider } from '../src/notifications/NotificationContext';
import { darkPalette, font, fontSize, lightPalette } from '../src/theme';
import { useTheme } from '../src/ui/theme';

export default function RootLayout() {
  const schriftenBereit = useAppFonts();

  useEffect(() => {
    configureNotificationHandler();
  }, []);

  // Erst zeichnen, wenn die Schriften stehen — sonst springt beim ersten Bild
  // jede Zeile um, wenn die Systemschrift durch Barlow ersetzt wird.
  if (!schriftenBereit) return null;

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
          headerTitleStyle: {
            color: palette.text,
            fontFamily: font.display,
            fontSize: fontSize.xl,
          },
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
