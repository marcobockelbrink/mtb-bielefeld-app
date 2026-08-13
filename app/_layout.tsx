import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppDataProvider } from '../src/data/AppDataContext';
import { KontoProvider } from '../src/konto/KontoContext';
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
        <KontoProvider>
          <NotificationProvider>
            <AppStack />
          </NotificationProvider>
        </KontoProvider>
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
          // Ohne das schreibt iOS den Titel des vorigen Bildschirms neben den
          // Pfeil. Von der Terminliste aus ist das die Reitergruppe, die
          // intern "(tabs)" heißt und keinen Titel trägt — genau dieser
          // Routenname stand dann in der Oberfläche.
          headerBackTitle: 'Zurück',
          headerBackTitleStyle: { fontFamily: font.medium, fontSize: fontSize.md },
          contentStyle: { backgroundColor: palette.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="termin/[id]" options={{ title: 'Termin' }} />
        <Stack.Screen name="jugend/[id]" options={{ title: 'Jugendtraining' }} />
        <Stack.Screen name="news/[id]" options={{ title: 'Beitrag' }} />
        {/* Ohne Eintrag stünde der rohe Routenpfad in der Kopfzeile —
            „anmeldung/[token]" mitten im Anmelden, auf dem Gerät gesehen. */}
        <Stack.Screen name="anmeldung/[token]" options={{ title: 'Anmeldung' }} />
        <Stack.Screen name="t/[id]" options={{ title: 'Jugendtraining' }} />
        <Stack.Screen name="e/[code]" options={{ title: 'Anmeldung' }} />
        <Stack.Screen
          name="einstellungen"
          options={{
            title: 'Einstellungen',
            // Als Blatt von unten und nicht als weiterer Bildschirm: Wer
            // etwas einstellt, will danach dorthin zurück, wo er war — nicht
            // eine Ebene tiefer stehen. `formSheet` gibt es seit expo-router
            // in SDK 54 auf beiden Plattformen; ein natives Kontextmenü
            // hätte eine Abhängigkeit gekostet, die Expo mitsegnen muss.
            presentation: 'formSheet',
            sheetGrabberVisible: true,
            // Zwei Rastpunkte: Wer nur den Anmeldezustand sehen will, zieht
            // nicht das ganze Blatt auf.
            sheetAllowedDetents: [0.6, 1],
          }}
        />
      </Stack>
    </>
  );
}

/** Farbwerte für Navigationselemente außerhalb von React-Komponenten. */
export const navigationPalettes = { light: lightPalette, dark: darkPalette };
