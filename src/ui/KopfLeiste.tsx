/**
 * Der Anmeldestatus oben rechts — Design „9a"/„9b" (15.08.2026).
 *
 * Vorher stand dort ein Zahnrad, und ob man angemeldet war, sah man
 * nirgends. Jetzt steht dort die Person selbst: angemeldet der Avatar,
 * abgemeldet eine Pille „Anmelden". Beides führt in die Einstellungen —
 * der Kreis ist zugleich Statusanzeige und Weg dorthin.
 *
 * **Kein „Anonym"-Text.** Der Zustand wird über die Aktion benannt, nicht
 * über eine Bezeichnung: „Anmelden" ist kürzer und sagt zugleich, was zu
 * tun ist.
 *
 * **Beim Laden ein neutraler Kreis.** Kurz „Anmelden" zu zeigen und dann
 * auf den Avatar umzuspringen sähe aus, als hätte die App einen
 * abgemeldet — der unangenehmste Fehleindruck, den dieser Platz erzeugen
 * kann.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useKonto } from '../konto/KontoContext';
import { font, spacing } from '../theme';
import { Avatar } from './Avatar';
import { useTheme } from './theme';

export function KopfLeiste() {
  const { palette } = useTheme();
  const { angemeldet, laedt, email, name, avatarUrl, api } = useKonto();

  if (laedt) {
    return (
      <View style={styles.rand}>
        <View style={[styles.laden, { backgroundColor: palette.surfaceMuted }]} />
      </View>
    );
  }

  if (!angemeldet) {
    return (
      <Pressable
        onPress={() => router.push('/einstellungen')}
        accessibilityRole="button"
        accessibilityLabel="Anmelden"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={({ pressed }) => [
          styles.rand,
          styles.pille,
          { borderColor: palette.border, backgroundColor: pressed ? palette.surfaceMuted : palette.surface },
        ]}
      >
        <Ionicons name="person-circle-outline" size={22} color={palette.textMuted} />
        <Text style={[styles.pillenText, { color: palette.primary }]}>Anmelden</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={() => router.push('/einstellungen')}
      accessibilityRole="button"
      accessibilityLabel="Konto und Einstellungen"
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={({ pressed }) => [styles.rand, pressed && styles.gedrueckt]}
    >
      {/* Ohne Adresse (die Auskunft ist noch unterwegs) trägt der Kreis ein
          Fragezeichen statt eines leeren Grau — nie ein leerer Kreis. */}
      {/* Name **und** Bild — beides hatte `useKonto()` schon, hier stand
          nur die Adresse und gar kein Bild. Die Initialen wurden dadurch
          aus „marco@…" gebildet („M") statt aus dem Namen („MB"), und ein
          gesetztes Profilbild war nie zu sehen. `bildQuelle` macht aus dem
          Serverpfad eine ladbare Adresse samt Zugang — geschützte Bilder
          liefert die API nur mit Token aus. */}
      <Avatar
        name={name ?? email ?? ''}
        quelle={avatarUrl ? api.bildQuelle(avatarUrl) : null}
        size={34}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rand: { marginRight: spacing.md },
  gedrueckt: { opacity: 0.7 },
  laden: { width: 34, height: 34, borderRadius: 17 },
  pille: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 34,
    paddingLeft: 6,
    paddingRight: 10,
    borderRadius: 17,
    borderWidth: 1,
  },
  pillenText: { fontFamily: font.semibold, fontSize: 14 },
});
