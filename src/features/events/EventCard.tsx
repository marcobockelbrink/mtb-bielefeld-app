/**
 * Die Terminkarte in der Liste.
 *
 * Aufgebaut wie eine Zeile im Streckenbuch, von oben nach unten in der
 * Reihenfolge, in der gefragt wird: **wann**, **was**, **wo**, **wie schwer**.
 *
 *     ┌────────────────────────────────────────┐
 *     │ 18:00   MittwochsRudel                 │
 *     │ bis 20  Johannisberg info point        │
 *     │         22 km · 450 hm                 │
 *     │         TREFF · EINSTEIGER             │
 *     ├────────────────────────────────────────┤
 *     │ FAHRTECHNIK ▰▰▱     AUSDAUER ▰▱▱       │
 *     └────────────────────────────────────────┘
 *
 * Die Einstufung steht unter einem Strich statt mitten im Text: Sie ist die
 * Angabe, die über Mitfahren oder Nicht-Mitfahren entscheidet, und in einem
 * eigenen Band findet das Auge sie beim Durchblättern immer an derselben
 * Stelle.
 *
 * Was hier bewusst **fehlt**: die früheren grauen Pillen um Kategorie und
 * Erfahrungsstufe. Vier Pillen je Karte ergeben in einer langen Liste ein
 * Rauschen, das keine Frage beantwortet. Als Versalienzeile steht dieselbe
 * Angabe ruhiger da — und lässt dem Einstufungsbalken den Auftritt.
 */

import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ClubEvent } from '../../domain/types';
import { categoryDisplay, font, fontSize, labelType, levelDisplay, radius, spacing } from '../../theme';
import { Badge } from '../../ui/components';
import { SkillSpan } from '../../ui/SkillSpan';
import { useTheme } from '../../ui/theme';
import { formatRideSummary, formatTime, formatTimeRange } from './format';

export function EventCard({ event }: { event: ClubEvent }) {
  const { palette } = useTheme();
  const kategorie = categoryDisplay[event.category];
  const eckdaten = formatRideSummary(event);
  const einstufung = event.details.technique ?? event.details.endurance;

  // Kategorie und Erfahrungsstufen als eine Zeile — mehrere Angaben, ein Element.
  const rubrik = [kategorie.label, ...event.levels.map((level) => levelDisplay[level])].join(' · ');
  const hatEnde = !event.allDay && event.end.getTime() > event.start.getTime();

  return (
    <Link href={{ pathname: '/termin/[id]', params: { id: event.id } }} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${event.title}, ${formatTimeRange(event)}`}
      >
        {/*
          Die Gestaltung sitzt bewusst auf dieser inneren Ansicht und nicht auf
          dem Pressable: `Link asChild` ersetzt das äußere Element, wobei dessen
          Stil verlorengeht — die Karte verlor dadurch Hintergrund, Rahmen und
          die zweispaltige Anordnung. Nach innen verlagert greift sie sicher.
        */}
        {({ pressed }) => (
          <View
            style={[
              styles.card,
              {
                backgroundColor: palette.surface,
                borderColor: palette.border,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <View style={styles.oben}>
              <View style={styles.zeitspalte}>
                {event.allDay ? (
                  <Text style={[styles.ganztags, { color: palette.primary }]}>Ganztags</Text>
                ) : (
                  <>
                    <Text style={[styles.zeit, { color: palette.primary }]}>
                      {formatTime(event.start)}
                    </Text>
                    {hatEnde ? (
                      <Text style={[styles.bis, { color: palette.textMuted }]}>
                        bis {formatTime(event.end)}
                      </Text>
                    ) : null}
                  </>
                )}
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

                {eckdaten ? (
                  <Text style={[styles.eckdaten, { color: palette.textMuted }]}>{eckdaten}</Text>
                ) : null}

                <View style={styles.rubrikzeile}>
                  <Ionicons name={kategorie.icon} size={13} color={palette.textMuted} />
                  <Text style={[styles.rubrik, { color: palette.textMuted }]} numberOfLines={1}>
                    {rubrik}
                  </Text>
                </View>

                {event.cancelled || event.ladiesOnly ? (
                  <View style={styles.stempel}>
                    {event.cancelled ? <Badge label="Abgesagt" tone="danger" /> : null}
                    {event.ladiesOnly ? <Badge label="Ladies only" tone="accent" /> : null}
                  </View>
                ) : null}
              </View>
            </View>

            {einstufung ? (
              <View style={[styles.band, { borderTopColor: palette.border }]}>
                {event.details.technique ? (
                  <SkillSpan label="Fahrtechnik" range={event.details.technique} />
                ) : null}
                {event.details.endurance ? (
                  <SkillSpan label="Ausdauer" range={event.details.endurance} />
                ) : null}
              </View>
            ) : null}
          </View>
        )}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  oben: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  zeitspalte: {
    width: 56,
  },
  zeit: {
    fontFamily: font.display,
    fontSize: fontSize.xl,
    // Der Schmalschnitt setzt Ziffern eng; ohne festen Zeilenabstand rutscht
    // die Uhrzeit gegen den Termintitel aus dem Lot.
    lineHeight: 23,
  },
  bis: {
    fontFamily: font.regular,
    fontSize: fontSize.xs - 1,
    marginTop: 1,
  },
  ganztags: {
    ...labelType,
    fontSize: fontSize.xs - 1,
    lineHeight: 23,
  },
  inhalt: {
    flex: 1,
    gap: spacing.xs,
  },
  titel: {
    fontFamily: font.semibold,
    fontSize: fontSize.lg,
    lineHeight: 22,
  },
  ortzeile: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  ort: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: fontSize.sm,
  },
  eckdaten: {
    fontFamily: font.regular,
    fontSize: fontSize.sm,
  },
  rubrikzeile: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs + 1,
    marginTop: spacing.xs,
  },
  rubrik: {
    ...labelType,
    flex: 1,
    fontSize: fontSize.xs - 1,
  },
  stempel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  band: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
});
