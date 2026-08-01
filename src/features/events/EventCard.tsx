/**
 * Die Terminkarte in der Liste.
 *
 * Wichtigste Gestaltungsentscheidung: Uhrzeit und Titel zuerst, Einstufung
 * darunter. Wer die Liste durchblättert, sucht "wann" und "was" — die Sterne
 * entscheiden erst danach.
 */

import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ClubEvent } from '../../domain/types';
import { categoryDisplay, fontSize, levelDisplay, radius, spacing } from '../../theme';
import { Badge } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { formatRideSummary, formatStars, formatTimeRange } from './format';

export function EventCard({ event }: { event: ClubEvent }) {
  const { palette } = useTheme();
  const kategorie = categoryDisplay[event.category];
  const fahrtechnik = formatStars(event.details.technique);
  const ausdauer = formatStars(event.details.endurance);
  const eckdaten = formatRideSummary(event);

  return (
    <Link href={{ pathname: '/termin/[id]', params: { id: event.id } }} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${event.title}, ${formatTimeRange(event)}`}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: palette.surface,
            borderColor: palette.border,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <View style={styles.zeitspalte}>
          <Text style={[styles.zeit, { color: palette.primary }]}>
            {event.allDay ? '––:––' : formatTimeRange(event).split(' – ')[0]}
          </Text>
          <Text style={styles.symbol}>{kategorie.icon}</Text>
        </View>

        <View style={styles.inhalt}>
          <Text
            style={[
              styles.titel,
              { color: palette.text },
              event.cancelled && { textDecorationLine: 'line-through', color: palette.textMuted },
            ]}
            numberOfLines={2}
          >
            {event.title}
          </Text>

          {event.location ? (
            <View style={styles.ortzeile}>
              <Ionicons name="location-outline" size={13} color={palette.textMuted} />
              <Text style={[styles.ort, { color: palette.textMuted }]} numberOfLines={1}>
                {event.details.meetingPoint ?? event.location}
              </Text>
            </View>
          ) : null}

          {eckdaten ? <Text style={[styles.eckdaten, { color: palette.textMuted }]}>{eckdaten}</Text> : null}

          <View style={styles.markierungen}>
            {event.cancelled ? <Badge label="Abgesagt" tone="danger" /> : null}
            {event.ladiesOnly ? <Badge label="Ladies only" tone="accent" /> : null}
            <Badge label={kategorie.label} />
            {event.levels.map((level) => (
              <Badge key={level} label={levelDisplay[level]} />
            ))}
          </View>

          {fahrtechnik || ausdauer ? (
            <View style={styles.sterne}>
              {fahrtechnik ? (
                <Text style={[styles.sterneText, { color: palette.textMuted }]}>
                  Fahrtechnik {fahrtechnik}
                </Text>
              ) : null}
              {ausdauer ? (
                <Text style={[styles.sterneText, { color: palette.textMuted }]}>Ausdauer {ausdauer}</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.lg,
  },
  zeitspalte: {
    alignItems: 'center',
    gap: spacing.xs,
    width: 54,
  },
  zeit: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  symbol: {
    fontSize: 20,
  },
  inhalt: {
    flex: 1,
    gap: spacing.xs,
  },
  titel: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    lineHeight: 22,
  },
  ortzeile: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  ort: {
    flex: 1,
    fontSize: fontSize.sm,
  },
  eckdaten: {
    fontSize: fontSize.sm,
  },
  markierungen: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  sterne: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  sterneText: {
    fontSize: fontSize.xs,
  },
});
