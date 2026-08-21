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
import { useVersion, VersionsProvider } from '../src/features/version/VersionsContext';
import { VersionsSperre } from '../src/features/version/VersionsSperre';

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
            {/* Innerhalb von `KontoProvider`, weil die Auskunft über
                dessen `api` geholt wird — und außerhalb von `AppStack`,
                weil die Sperre **über** der Navigation liegen muss und
                nicht als Bildschirm darin. */}
            <VersionsProvider>
              <AppStack />
            </VersionsProvider>
          </NotificationProvider>
        </KontoProvider>
      </AppDataProvider>
    </SafeAreaProvider>
  );
}

function AppStack() {
  const { palette, isDark } = useTheme();
  const { lage, auskunft } = useVersion();

  /*
    Die Sperre ersetzt die Navigation, statt sich darüberzulegen (Handoff
    16a). Ein Bildschirm im Stapel ließe sich wegwischen, und ein Overlay
    ließe den Stapel darunter weiterleben — beides steht dem Sinn entgegen:
    Es soll keinen Weg dahinter geben. Jeder Aufruf bekäme ohnehin ein 426.
  */
  if (lage === 'gesperrt') {
    return (
      <>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <VersionsSperre mindestVersion={auskunft?.mindestVersion ?? '—'} />
      </>
    );
  }

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
        {/* `jugend/[id]` ist seit dem Bearbeiten-Bildschirm ein Ordner:
            `index` ist die Einzelansicht, daneben liegt `bearbeiten`. Ohne
            beide Einträge stünde der rohe Routenpfad in der Kopfzeile. */}
        <Stack.Screen name="jugend/[id]/index" options={{ title: 'Jugendtraining' }} />
        <Stack.Screen name="jugend/[id]/bearbeiten" options={{ title: 'Training ändern' }} />
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
            // Vollbild statt halbhohem Blatt — Design-Review vom 14.08.2026
            // („3b"): Der Bereich ist inzwischen zu voll für einen
            // Teilausschnitt (Konto, Verwaltung, Erinnerungen, Abo), und der
            // durchscheinende Termine-Bildschirm dahinter lenkte nur ab.
            // Der Zurück-Pfeil kommt vom Stack.
            presentation: 'card',
          }}
        />
      </Stack>
    </>
  );
}

/** Farbwerte für Navigationselemente außerhalb von React-Komponenten. */
export const navigationPalettes = { light: lightPalette, dark: darkPalette };
