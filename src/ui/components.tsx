/**
 * Wiederverwendete Bausteine der Oberfläche.
 *
 * Alle Bausteine holen sich ihre Farben über `useTheme` — dadurch stimmen
 * helles und dunkles Schema überall, ohne dass jeder Bildschirm daran denken
 * muss.
 */

import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { fontSize, radius, spacing } from '../theme';
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

/** Kleine Markierung, z.B. für Kategorie oder "Abgesagt". */
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

/** Auswahlknopf für Filter — an/aus, deutlich sichtbar. */
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? palette.primary : palette.surface,
          borderColor: selected ? palette.primary : palette.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[styles.chipText, { color: selected ? palette.onPrimary : palette.text }]}>{label}</Text>
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

/** Beschriftete Zeile für die Detailansicht. */
export function DetailRow({ label, value }: { label: string; value: string }) {
  const { palette } = useTheme();
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: palette.textMuted }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: palette.text }]}>{value}</Text>
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
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  chipText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  banner: {
    borderLeftWidth: 3,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bannerText: {
    fontSize: fontSize.sm,
  },
  empty: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl * 2,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: fontSize.md,
    lineHeight: 22,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  detailRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  detailLabel: {
    flexShrink: 0,
    fontSize: fontSize.md,
    width: 132,
  },
  detailValue: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  actionButton: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: spacing.md,
  },
  actionButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});
