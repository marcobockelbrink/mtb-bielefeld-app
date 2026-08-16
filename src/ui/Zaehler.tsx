/**
 * Ein Zähler mit `−` und `+` statt eines Zahlenfelds.
 *
 * Aus dem Handoff „Runde 11" (11c): Für Plätze und benötigte Guides holte
 * das Formular die Zahlentastatur hoch — die auf iOS kein „Fertig" hat und
 * damit den halben Bildschirm belegt, bis man daneben tippt. Für Werte
 * zwischen null und zwanzig ist das die falsche Eingabe.
 *
 * Die Tippziele sind 46 pt, nicht die üblichen 44: Die beiden Knöpfe stehen
 * dicht nebeneinander, und die zwei Punkte sind der Unterschied zwischen
 * Treffen und Danebentippen.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { font, fontSize, radius, spacing } from '../theme';
import { useTheme } from './theme';

const KANTE = 46;

export function Zaehler({
  wert,
  beiAenderung,
  kleinster = 0,
  groesster = 99,
  beschriftung,
  gesperrt = false,
}: {
  wert: number;
  beiAenderung: (wert: number) => void;
  kleinster?: number;
  groesster?: number;
  /** Für die Vorlesefunktion — „Plätze", „Benötigte Guides". */
  beschriftung: string;
  /**
   * Ausgegraut und ohne Wirkung. Gebraucht für „unbegrenzt": Die Plätze
   * haben dann keinen Wert, und ein Zähler, der trotzdem zählt, behauptete
   * das Gegenteil.
   */
  gesperrt?: boolean;
}) {
  const { palette } = useTheme();

  function knopf(zeichen: string, neuerWert: number, name: string) {
    const moeglich = !gesperrt && neuerWert >= kleinster && neuerWert <= groesster;
    return (
      <Pressable
        onPress={() => beiAenderung(neuerWert)}
        disabled={!moeglich}
        accessibilityRole="button"
        accessibilityLabel={`${beschriftung} ${name}`}
        style={({ pressed }) => [
          styles.knopf,
          {
            borderColor: palette.border,
            backgroundColor: pressed && moeglich ? palette.surfaceMuted : palette.surface,
            opacity: moeglich ? 1 : 0.4,
          },
        ]}
      >
        <Text style={[styles.zeichen, { color: palette.text }]}>{zeichen}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.reihe}>
      {/* „−" ist das Minuszeichen U+2212, nicht der Bindestrich: Neben dem
          „+" sähe ein Bindestrich zu kurz und zu hoch aus. */}
      {knopf('−', wert - 1, 'verringern')}
      <Text
        style={[styles.wert, { color: gesperrt ? palette.textMuted : palette.text }]}
        accessibilityLabel={`${beschriftung}: ${gesperrt ? 'unbegrenzt' : wert}`}
      >
        {gesperrt ? '–' : wert}
      </Text>
      {knopf('+', wert + 1, 'erhöhen')}
    </View>
  );
}

const styles = StyleSheet.create({
  reihe: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  knopf: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    height: KANTE,
    justifyContent: 'center',
    width: KANTE,
  },
  zeichen: {
    fontFamily: font.semibold,
    fontSize: fontSize.lg,
  },
  wert: {
    fontFamily: font.display,
    fontSize: fontSize.xl,
    // Feste Breite, damit die Knöpfe beim Wechsel von 9 auf 10 nicht
    // springen.
    minWidth: 40,
    textAlign: 'center',
  },
});
