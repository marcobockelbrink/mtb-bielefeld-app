/**
 * Der weiche Update-Hinweis (Handoff 16, Abschnitt 16b).
 *
 * Das Gegenstück zur Sperre: Hier funktioniert alles, es gibt nur etwas
 * Neueres. Deshalb eine wegwischbare Karte und kein Riegel — gezwungen
 * wird nur, was wirklich bricht.
 *
 * **Genau einmal je Fassung.** Das ✕ merkt sich die Fassungsnummer, nicht
 * ein Ja/Nein (`weggewischt.ts`); die nächste Fassung zeigt die Karte von
 * selbst wieder. Kein Zähler, keine Frist, kein zweites Nachfassen: Eine
 * Karte, die wiederkommt, wird zur Karte, die man nicht mehr liest — und
 * dann liest man auch die eine nicht mehr, auf die es ankommt.
 */

import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { font, fontSize, radius, spacing } from '../../theme';
import { useTheme } from '../../ui/theme';
import { useVersion } from './VersionsContext';

export function UpdateKarte() {
  const { palette } = useTheme();
  const { auskunft, hinweisSichtbar, hinweisWegwischen } = useVersion();

  if (!hinweisSichtbar || !auskunft) return null;

  return (
    <View
      style={[styles.karte, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      <Ionicons name="arrow-up-circle-outline" size={22} color={palette.primary} />

      <View style={styles.text}>
        <Text style={[styles.titel, { color: palette.text }]}>
          Version {auskunft.aktuelleVersion} ist da
        </Text>
        {/* Nur wenn wirklich etwas dasteht. „Neue Version verfügbar" ohne
            Inhalt ist eine Zeile, die niemandem bei der Entscheidung hilft,
            ob sich das Update jetzt lohnt. */}
        {auskunft.hinweis ? (
          <Text style={[styles.zeile, { color: palette.textMuted }]}>{auskunft.hinweis}</Text>
        ) : null}
      </View>

      <Pressable
        onPress={hinweisWegwischen}
        accessibilityRole="button"
        accessibilityLabel="Hinweis ausblenden"
        hitSlop={10}
      >
        <Ionicons name="close" size={20} color={palette.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  karte: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  text: { flex: 1, gap: 2 },
  titel: { fontFamily: font.semibold, fontSize: fontSize.sm },
  zeile: { fontFamily: font.regular, fontSize: fontSize.xs, lineHeight: 17 },
});
