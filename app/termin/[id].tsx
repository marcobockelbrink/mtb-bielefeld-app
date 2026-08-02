/**
 * Die Detailansicht eines Termins.
 *
 * Alles, was man am Vorabend wissen will: wann, wo, wie schwer, wer führt —
 * und ein Knopf, der den Treffpunkt in der Karten-App öffnet.
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppData } from '../../src/data/AppDataContext';
import { categoryDisplay, font, fontSize, levelDisplay, spacing } from '../../src/theme';
import { ActionButton, Badge, Banner, Card, DetailRow, EmptyState, LoadingState } from '../../src/ui/components';
import { SkillSpan } from '../../src/ui/SkillSpan';
import { useTheme } from '../../src/ui/theme';
import {
  formatDateWithYear,
  formatLongDate,
  formatTimeRange,
  mapsQuery,
} from '../../src/features/events/format';

export default function TerminDetailScreen() {
  const { palette } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { events } = useAppData();

  const event = events.data.find((eintrag) => eintrag.id === id);

  if (events.loading) return <LoadingState />;
  if (!event) {
    return (
      <EmptyState
        title="Termin nicht gefunden"
        hint="Vielleicht wurde er im Vereinskalender gelöscht oder verschoben."
      />
    );
  }

  const kategorie = categoryDisplay[event.category];
  const { technique: fahrtechnik, endurance: ausdauer } = event.details;
  const ziel = mapsQuery(event);

  /** Öffnet den Treffpunkt in der Karten-App der jeweiligen Plattform. */
  async function karteOeffnen(adresse: string) {
    const suche = encodeURIComponent(adresse);
    const url =
      Platform.OS === 'ios'
        ? `http://maps.apple.com/?q=${suche}`
        : `geo:0,0?q=${suche}`;
    const kannOeffnen = await Linking.canOpenURL(url);
    // Ohne Karten-App bleibt der Weg über den Browser.
    await Linking.openURL(kannOeffnen ? url : `https://www.google.com/maps/search/?api=1&query=${suche}`);
  }

  return (
    <ScrollView contentContainerStyle={styles.inhalt}>
      {event.cancelled ? (
        <Banner tone="danger" text="Dieser Termin wurde abgesagt und findet nicht statt." />
      ) : null}

      <View style={styles.kopf}>
        <Text style={[styles.titel, { color: palette.text }]}>{event.title}</Text>
        <Text style={[styles.datum, { color: palette.primary }]}>
          {formatLongDate(event.start)} · {formatTimeRange(event)}
        </Text>
        <Text style={[styles.jahr, { color: palette.textMuted }]}>{formatDateWithYear(event.start)}</Text>
      </View>

      <View style={styles.markierungen}>
        <Ionicons name={kategorie.icon} size={16} color={palette.textMuted} />
        <Badge label={kategorie.label} tone="primary" />
        {event.ladiesOnly ? <Badge label="Ladies only" tone="accent" /> : null}
        {event.levels.map((level) => (
          <Badge key={level} label={levelDisplay[level]} />
        ))}
        {event.recurring ? <Badge label="Regelmäßig" /> : null}
      </View>

      {fahrtechnik || ausdauer || event.details.trailShare || event.details.difficulty ? (
        <Card>
          <Text style={[styles.abschnittTitel, { color: palette.text }]}>Einstufung</Text>
          {/*
            Derselbe Balken wie in der Liste, nur mit mehr Luft: Wer vom
            Durchblättern hierher kommt, soll die Angabe wiedererkennen und
            nicht neu entziffern müssen.
          */}
          {fahrtechnik ? (
            <DetailRow label="Fahrtechnik">
              <SkillSpan label="Fahrtechnik" range={fahrtechnik} showLabel={false} />
            </DetailRow>
          ) : null}
          {ausdauer ? (
            <DetailRow label="Ausdauer">
              <SkillSpan label="Ausdauer" range={ausdauer} showLabel={false} />
            </DetailRow>
          ) : null}
          {event.details.trailShare ? <DetailRow label="Trail-Anteil" value={event.details.trailShare} /> : null}
          {event.details.difficulty ? <DetailRow label="Schwierigkeit" value={event.details.difficulty} /> : null}
          {event.details.distanceKm ? <DetailRow label="Strecke" value={`${event.details.distanceKm} km`} /> : null}
          {event.details.elevationM ? (
            <DetailRow label="Höhenmeter" value={`${event.details.elevationM} hm`} />
          ) : null}
        </Card>
      ) : null}

      <Card>
        <Text style={[styles.abschnittTitel, { color: palette.text }]}>Treffpunkt & Ablauf</Text>
        {event.details.meetingPoint ? <DetailRow label="Abfahrtsort" value={event.details.meetingPoint} /> : null}
        {event.location ? <DetailRow label="Ort" value={event.location} /> : null}
        {event.details.timeAndDuration ? (
          <DetailRow label="Uhrzeit & Dauer" value={event.details.timeAndDuration} />
        ) : null}
        {event.details.guides.length > 0 ? (
          <DetailRow
            label={event.details.guides.length === 1 ? 'Guide' : 'Guides'}
            value={event.details.guides.join(', ')}
          />
        ) : null}
        {event.details.maxParticipants ? (
          <DetailRow label="Plätze" value={`höchstens ${event.details.maxParticipants}`} />
        ) : null}

        {ziel ? (
          <View style={styles.knopf}>
            <ActionButton label="In Karten öffnen" onPress={() => void karteOeffnen(ziel)} />
          </View>
        ) : null}
      </Card>

      {event.details.signupUrl ? (
        <ActionButton
          label="Zur Anmeldung"
          tone="secondary"
          onPress={() => void WebBrowser.openBrowserAsync(event.details.signupUrl!)}
        />
      ) : null}

      {event.descriptionText ? (
        <Card>
          <Text style={[styles.abschnittTitel, { color: palette.text }]}>Beschreibung</Text>
          <Text style={[styles.beschreibung, { color: palette.text }]}>{event.descriptionText}</Text>
        </Card>
      ) : null}

      <View style={styles.fussnote}>
        <Ionicons name="information-circle-outline" size={15} color={palette.textMuted} />
        <Text style={[styles.fussnoteText, { color: palette.textMuted }]}>
          Angaben aus dem Vereinskalender. Kurzfristige Änderungen gibt der Verein über Instagram bekannt.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  inhalt: {
    gap: spacing.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xxl * 2,
  },
  kopf: {
    gap: spacing.xs,
  },
  titel: {
    fontFamily: font.semibold,
    fontSize: fontSize.xxl,
    lineHeight: 32,
  },
  datum: {
    fontFamily: font.display,
    fontSize: fontSize.xl,
  },
  jahr: {
    fontFamily: font.regular,
    fontSize: fontSize.sm,
  },
  markierungen: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  abschnittTitel: {
    fontFamily: font.semibold,
    fontSize: fontSize.lg,
    marginBottom: spacing.sm,
  },
  beschreibung: {
    fontFamily: font.regular,
    fontSize: fontSize.md,
    lineHeight: 23,
  },
  knopf: {
    marginTop: spacing.md,
  },
  fussnote: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  fussnoteText: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: fontSize.xs,
    lineHeight: 17,
  },
});
