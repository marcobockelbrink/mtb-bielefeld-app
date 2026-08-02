/**
 * Der Einstufungsbalken — das Erkennungszeichen der App.
 *
 * Der Verein schreibt seine Einstufung als Spanne aus: „Fahrtechnik: ⭐ bis
 * ⭐⭐⭐". Als Text ist das die wichtigste Angabe der ganzen Karte und zugleich
 * die, die man beim Durchblättern am schlechtesten erfasst. Als Balken ist sie
 * in einem Blick zu lesen, und die Spanne bleibt erhalten:
 *
 *     ▰▰▱   volle Felder: so viel wird es mindestens
 *           offene Felder: so weit kann es gehen
 *           leere Felder: darüber geht es nicht hinaus
 *
 * Die Felder stehen schräg — die Steigung, um die es beim Rad am Ende immer
 * geht. Sie tragen als einzige Elemente der App die Lehmfarbe `grade`; wo
 * dieser Ocker auftaucht, geht es um Schwierigkeit und um sonst nichts.
 *
 * Wer die Balken nicht sehen kann, hört den Satz: Vorlesehilfen bekommen die
 * Spanne ausgeschrieben, nicht die einzelnen Felder.
 */

import { StyleSheet, Text, View } from 'react-native';

import type { StarRange } from '../domain/types';
import { fontSize, labelType, MAX_STARS, spacing } from '../theme';
import { useTheme } from './theme';

const FELDER = Array.from({ length: MAX_STARS }, (_, index) => index + 1);

/**
 * Beschrifteter Balken für die Terminkarte und die Detailansicht.
 *
 * `showLabel={false}` lässt die sichtbare Beschriftung weg — für Stellen, die
 * schon eine eigene haben, etwa die Zeilen der Detailansicht. Vorlesehilfen
 * hören die Spanne trotzdem vollständig.
 */
export function SkillSpan({
  label,
  range,
  showLabel = true,
}: {
  label: string;
  range: StarRange;
  showLabel?: boolean;
}) {
  const { palette } = useTheme();

  return (
    <View
      style={styles.span}
      accessible
      accessibilityRole="text"
      accessibilityLabel={gesprochen(label, range)}
    >
      {showLabel ? <Text style={[styles.label, { color: palette.textMuted }]}>{label}</Text> : null}
      <SpanMarks min={range.min} max={range.max} />
    </View>
  );
}

/**
 * Nur die Felder, ohne Beschriftung — für Filterknöpfe.
 *
 * `tone="onPrimary"` kehrt die Farben um, wenn der Knopf ausgewählt und damit
 * flächig eingefärbt ist.
 */
export function SpanMarks({
  min,
  max,
  tone = 'grade',
}: {
  min: number;
  max: number;
  tone?: 'grade' | 'onPrimary';
}) {
  const { palette } = useTheme();
  const voll = tone === 'onPrimary' ? palette.onPrimary : palette.grade;
  // Nicht `palette.border`: Im dunklen Schema verschwanden die leeren Felder
  // damit fast vollständig, und ein Balken ohne sichtbare Skala sagt nicht
  // mehr, worauf sich die gefüllten Felder beziehen.
  const leer =
    tone === 'onPrimary' ? withAlpha(palette.onPrimary, '55') : withAlpha(palette.textMuted, '77');

  return (
    <View style={styles.felder} importantForAccessibility="no-hide-descendants">
      {FELDER.map((feld) => {
        const gefuellt = feld <= min;
        const offen = !gefuellt && feld <= max;
        return (
          <View
            key={feld}
            style={[
              styles.feld,
              // Drei Zustände, drei deutlich verschiedene Flächen. Nur über die
              // Rahmenfarbe zu gehen reichte nicht: Bei 13 Pixeln Breite sah
              // "kann noch kommen" genauso aus wie "kommt nicht mehr".
              gefuellt && { backgroundColor: voll, borderColor: voll },
              offen && { backgroundColor: withAlpha(voll, '33'), borderColor: voll },
              !gefuellt && !offen && { backgroundColor: 'transparent', borderColor: leer },
            ]}
          />
        );
      })}
    </View>
  );
}

/** „Fahrtechnik: 1 bis 3 von 3 Sternen" — der Balken in Worten. */
function gesprochen(label: string, range: StarRange): string {
  const spanne =
    range.min === range.max ? `${range.min}` : `${range.min} bis ${range.max}`;
  return `${label}: ${spanne} von ${MAX_STARS} Sternen`;
}

/** Volltonfarbe mit Deckkraft — `alpha` als zweistelliger Hex-Wert. */
function withAlpha(hex: string, alpha: string): string {
  return `${hex}${alpha}`;
}

const styles = StyleSheet.create({
  span: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  label: {
    ...labelType,
    fontSize: fontSize.xs - 2,
  },
  felder: {
    flexDirection: 'row',
    gap: 3,
  },
  feld: {
    borderRadius: 1,
    borderWidth: 1.5,
    height: 9,
    // Die Schräge steht für die Steigung — der Grund, warum es überhaupt eine
    // Einstufung gibt.
    transform: [{ skewX: '-14deg' }],
    width: 13,
  },
});
