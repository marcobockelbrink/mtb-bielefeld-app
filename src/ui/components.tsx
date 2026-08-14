/**
 * Wiederverwendete Bausteine der Oberfläche.
 *
 * Alle Bausteine holen sich ihre Farben über `useTheme` — dadurch stimmen
 * helles und dunkles Schema überall, ohne dass jeder Bildschirm daran denken
 * muss. Ebenso die Schrift: Wer hier einen Text setzt, setzt ihn in einem der
 * drei Schnitte aus `theme.font`, nie in der Systemschrift.
 */

import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { font, fontSize, labelType, radius, spacing } from '../theme';
import { useTheme } from './theme';

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { palette } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.surface, borderColor: palette.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * Kleinbeschriftung in Versalien — Kategorie, Gruppentitel, Rubriken.
 *
 * Der halbschmale Schnitt hält sie auch bei mehreren Angaben nebeneinander
 * kurz, und die Versalien setzen sie deutlich vom Fließtext ab, ohne dafür
 * Farbe oder eine weitere Größe zu verbrauchen.
 */
export function Label({
  children,
  tone = 'muted',
  numberOfLines,
}: {
  children: ReactNode;
  tone?: 'muted' | 'text' | 'primary';
  numberOfLines?: number;
}) {
  const { palette } = useTheme();
  const farbe = { muted: palette.textMuted, text: palette.text, primary: palette.primary }[tone];
  return (
    <Text style={[styles.label, { color: farbe }]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

/**
 * Überschrift über einem Textblock oder einer Karte.
 *
 * Bewusst in Normalbreite und Gemischtschreibung: Versalien ordnen ein
 * (`Label`), Überschriften benennen. Wer beides gleich setzt, nimmt der
 * Seite die Rangfolge.
 */
export function Heading({ children }: { children: ReactNode }) {
  const { palette } = useTheme();
  return <Text style={[styles.heading, { color: palette.text }]}>{children}</Text>;
}

/**
 * Stempel für den Ausnahmefall — „Abgesagt", „Ladies only".
 *
 * Bewusst kantig und flächig: Was hier steht, ist eine Abweichung vom
 * Normalfall und soll auch so aussehen. Der Regelfall einer Karte kommt ohne
 * Stempel aus.
 */
export function Badge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'primary' | 'danger' | 'accent';
}) {
  const { palette } = useTheme();
  const farben = {
    neutral: { background: palette.surfaceMuted, text: palette.textMuted },
    primary: { background: palette.primary, text: palette.onPrimary },
    danger: { background: palette.danger, text: '#ffffff' },
    accent: { background: palette.accent, text: '#ffffff' },
  }[tone];

  return (
    <View style={[styles.badge, { backgroundColor: farben.background }]}>
      <Text style={[styles.badgeText, { color: farben.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Auswahlknopf für Filter — an/aus, deutlich sichtbar.
 *
 * `children` nimmt statt der Beschriftung eigenen Inhalt auf; die
 * Sterne-Filter setzen dort denselben Einstufungsbalken, den auch die
 * Terminkarte zeigt. Filter und Ergebnis sprechen so dieselbe Sprache.
 */
export function Chip({
  label,
  icon,
  selected,
  onPress,
  children,
  accessibilityLabel,
}: {
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  onPress: () => void;
  children?: ReactNode;
  accessibilityLabel?: string;
}) {
  const { palette } = useTheme();
  const vordergrund = selected ? palette.onPrimary : palette.text;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? palette.primary : palette.surface,
          borderColor: selected ? palette.primary : palette.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      {icon ? <Ionicons name={icon} size={14} color={vordergrund} /> : null}
      {children}
      {label ? <Text style={[styles.chipText, { color: vordergrund }]}>{label}</Text> : null}
    </Pressable>
  );
}

/** Hinweisleiste, etwa für veraltete Daten oder einen Abruffehler. */
export function Banner({ text, tone = 'info' }: { text: string; tone?: 'info' | 'warning' | 'danger' }) {
  const { palette } = useTheme();
  const farbe = { info: palette.primary, warning: palette.warning, danger: palette.danger }[tone];

  return (
    <View style={[styles.banner, { backgroundColor: palette.surfaceMuted, borderLeftColor: farbe }]}>
      <Text style={[styles.bannerText, { color: palette.text }]}>{text}</Text>
    </View>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  const { palette } = useTheme();
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyTitle, { color: palette.text }]}>{title}</Text>
      {hint ? <Text style={[styles.emptyHint, { color: palette.textMuted }]}>{hint}</Text> : null}
    </View>
  );
}

export function LoadingState({ label = 'Lädt …' }: { label?: string }) {
  const { palette } = useTheme();
  return (
    <View style={styles.empty}>
      <ActivityIndicator color={palette.primary} />
      <Text style={[styles.emptyHint, { color: palette.textMuted, marginTop: spacing.md }]}>{label}</Text>
    </View>
  );
}

/**
 * Beschriftete Zeile für die Detailansicht.
 *
 * Beschriftung links in Versalien, Angabe rechts — der Aufbau eines
 * Streckenbuchs. `children` erlaubt statt Text eigenen Inhalt, etwa den
 * Einstufungsbalken.
 */
export function DetailRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: ReactNode;
}) {
  const { palette } = useTheme();
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: palette.textMuted }]}>{label}</Text>
      <View style={styles.detailValue}>
        {children ?? <Text style={[styles.detailValueText, { color: palette.text }]}>{value}</Text>}
      </View>
    </View>
  );
}

/** Vollbreiter Knopf für die Hauptaktion eines Bildschirms. */
export function ActionButton({
  label,
  onPress,
  tone = 'primary',
}: {
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'secondary';
}) {
  const { palette } = useTheme();
  const primary = tone === 'primary';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.actionButton,
        {
          backgroundColor: primary ? palette.primary : palette.surface,
          borderColor: primary ? palette.primary : palette.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <Text style={[styles.actionButtonText, { color: primary ? palette.onPrimary : palette.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
  },
  label: {
    ...labelType,
    fontSize: fontSize.xs - 1,
  },
  heading: {
    fontFamily: font.semibold,
    fontSize: fontSize.lg,
    lineHeight: 23,
  },
  badge: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  badgeText: {
    ...labelType,
    fontSize: fontSize.xs - 1,
  },
  chip: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    // 44 statt 40 — Mindest-Tippziel aus dem Design-Review vom 14.08.2026.
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  chipText: {
    fontFamily: font.medium,
    fontSize: fontSize.md,
  },
  banner: {
    borderLeftWidth: 3,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bannerText: {
    fontFamily: font.regular,
    fontSize: fontSize.sm,
    lineHeight: 19,
  },
  empty: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl * 2,
  },
  emptyTitle: {
    fontFamily: font.semibold,
    fontSize: fontSize.lg,
    textAlign: 'center',
  },
  emptyHint: {
    fontFamily: font.regular,
    fontSize: fontSize.md,
    lineHeight: 22,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  detailRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  detailLabel: {
    ...labelType,
    flexShrink: 0,
    fontSize: fontSize.xs - 1,
    width: 116,
  },
  detailValue: {
    flex: 1,
  },
  detailValueText: {
    fontFamily: font.medium,
    fontSize: fontSize.md,
    lineHeight: 21,
  },
  actionButton: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: spacing.md,
  },
  actionButtonText: {
    fontFamily: font.semibold,
    fontSize: fontSize.md,
  },
});
