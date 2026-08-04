/**
 * Der Bildschirm, auf dem der Link aus der Anmeldemail landet.
 *
 * **Warum es diese Datei geben muss.** Ohne sie findet expo-router für
 * `mtbie:///anmeldung/<token>` keine Route und zeigt seinen eigenen
 * Notbildschirm: schwarz, englisch, „Unmatched Route — Page could not be
 * found." Die Anmeldung gelang dabei trotzdem, weil `KontoContext` den Link
 * unabhängig von der Navigation auswertet — aber das sah niemand. Das erste,
 * was ein neues Mitglied von der App sieht, wäre eine Fehlerseite in einer
 * fremden Sprache gewesen.
 *
 * Der Token wird hier **nicht** eingelöst. Das tut `KontoContext` für beide
 * Wege (App lag im Hintergrund, App wurde vom Link gestartet), und zweimal
 * einlösen ginge schief: Ein Magic Link gilt genau einmal. Dieser Bildschirm
 * sieht nur zu und erzählt, was gerade passiert.
 */

import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useKonto } from '../../src/konto/KontoContext';
import { font, fontSize, spacing } from '../../src/theme';
import { ActionButton, Banner, LoadingState } from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';

/**
 * Wie lange auf das Einlösen gewartet wird, bevor der Bildschirm etwas sagt.
 *
 * `KontoContext` löst im Hintergrund ein; bei gutem Netz ist das nach
 * Sekundenbruchteilen erledigt. Nur wenn es länger dauert und **nichts**
 * passiert — kein Erfolg, kein Fehler —, ist etwas so schiefgegangen, dass
 * es keiner der beiden Wege bemerkt hat. Dann darf hier nicht ewig ein
 * Ladekringel stehen.
 */
const GEDULD_MS = 12_000;

export default function AnmeldungScreen() {
  const { palette } = useTheme();
  // Der Token steht in der Adresse, wird hier aber bewusst nicht benutzt —
  // siehe Dateikopf. Er wird nur gelesen, damit die Route ihn überhaupt
  // annimmt und expo-router nicht auf den Notbildschirm ausweicht.
  useLocalSearchParams<{ token: string }>();
  const { angemeldet, einloesenFehlgeschlagen } = useKonto();
  const [zuLange, setZuLange] = useState(false);

  useEffect(() => {
    const uhr = setTimeout(() => setZuLange(true), GEDULD_MS);
    return () => clearTimeout(uhr);
  }, []);

  // Geklappt: weiter zu den Terminen, dem eigentlichen Ziel. `Redirect`
  // statt eines Erfolgsbildschirms — wer sich anmeldet, will zur Sache,
  // nicht eine Bestätigung wegtippen. Die Einstellungen zeigen den Zustand,
  // wenn jemand nachsehen will.
  if (angemeldet) return <Redirect href="/" />;

  if (einloesenFehlgeschlagen) {
    return (
      <View style={styles.mitte}>
        <Text style={[styles.titel, { color: palette.text }]}>Das hat nicht geklappt</Text>
        <View style={styles.abstand}>
          <Banner tone="danger" text={einloesenFehlgeschlagen} />
        </View>
        <View style={styles.abstand}>
          <ActionButton label="Weiter zu den Terminen" tone="secondary" onPress={() => router.replace('/')} />
        </View>
      </View>
    );
  }

  if (zuLange) {
    return (
      <View style={styles.mitte}>
        <Text style={[styles.titel, { color: palette.text }]}>Das dauert länger als sonst</Text>
        <Text style={[styles.hinweis, { color: palette.textMuted }]}>
          Prüf deine Verbindung. Der Link gilt fünfzehn Minuten — solange kannst du ihn noch
          einmal antippen.
        </Text>
        <View style={styles.abstand}>
          <ActionButton label="Weiter zu den Terminen" tone="secondary" onPress={() => router.replace('/')} />
        </View>
      </View>
    );
  }

  return <LoadingState />;
}

const styles = StyleSheet.create({
  mitte: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  titel: {
    fontFamily: font.display,
    fontSize: fontSize.xl,
  },
  hinweis: {
    fontFamily: font.regular,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
  abstand: {
    marginTop: spacing.lg,
  },
});
