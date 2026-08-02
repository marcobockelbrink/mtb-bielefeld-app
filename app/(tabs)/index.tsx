/**
 * Die Terminliste — der Hauptbildschirm der App.
 */

import { useMemo, useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CLUB_TIMEZONE } from '../../src/config';
import { useAppData } from '../../src/data/AppDataContext';
import { localDayKey } from '../../src/data/ical/parseCalendar';
import type { ClubEvent } from '../../src/domain/types';
import { EventCard } from '../../src/features/events/EventCard';
import { FilterPanel } from '../../src/features/events/FilterPanel';
import { applyFilter, emptyFilter, isFilterActive, upcomingOnly, type EventFilter } from '../../src/features/events/filter';
import { formatAge, formatDayHeadingParts } from '../../src/features/events/format';
import { font, fontSize, labelType, spacing } from '../../src/theme';
import { Banner, EmptyState, LoadingState } from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';

export default function TermineScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { events, refresh } = useAppData();

  const [filter, setFilter] = useState<EventFilter>(emptyFilter);
  const [filterOffen, setFilterOffen] = useState(false);

  const abschnitte = useMemo(() => {
    const kommend = upcomingOnly(events.data);
    const gefiltert = applyFilter(kommend, filter);
    return zuAbschnitten(gefiltert);
  }, [events.data, filter]);

  const gesamtKommend = useMemo(() => upcomingOnly(events.data).length, [events.data]);

  if (events.loading) {
    return <LoadingState label="Termine werden geladen …" />;
  }

  return (
    <SectionList
      sections={abschnitte}
      keyExtractor={(event) => event.id}
      contentContainerStyle={[styles.liste, { paddingBottom: insets.bottom + spacing.xxl }]}
      stickySectionHeadersEnabled={false}
      refreshControl={
        <RefreshControl
          refreshing={events.refreshing}
          onRefresh={() => void refresh({ force: true })}
          tintColor={palette.primary}
          colors={[palette.primary]}
        />
      }
      ListHeaderComponent={
        <View style={styles.kopf}>
          <StatusHinweis
            fromCache={events.fromCache}
            fetchedAt={events.fetchedAt}
            error={events.error}
            hatDaten={events.data.length > 0}
          />
          <FilterPanel
            filter={filter}
            onChange={setFilter}
            expanded={filterOffen}
            onToggleExpanded={() => setFilterOffen((offen) => !offen)}
          />
        </View>
      }
      renderSectionHeader={({ section }) => <TagUeberschrift date={section.date} />}
      renderItem={({ item }) => <EventCard event={item} />}
      ListEmptyComponent={
        <EmptyState
          title={
            isFilterActive(filter) ? 'Kein Termin passt zum Filter' : 'Keine kommenden Termine'
          }
          hint={
            isFilterActive(filter)
              ? `Von ${gesamtKommend} kommenden Terminen passt gerade keiner. Setze den Filter zurück oder erlaube mehr Sterne.`
              : 'Sobald der Verein neue Termine einträgt, erscheinen sie hier. Zum Aktualisieren nach unten ziehen.'
          }
        />
      }
    />
  );
}

/**
 * Die Tagestrennung in der Liste — links der Bezug, rechts das Datum, dazwischen
 * eine durchlaufende Linie.
 *
 *     HEUTE ─────────────────────────────── 05.08.
 *
 * Der Aufbau eines Wegweisers: Wohin es geht, steht vorn; die Zahl steht hinten
 * und wartet, bis sie gebraucht wird. "Heute" und "Morgen" tragen die
 * Vereinsfarbe — in einer Liste, die Wochen umfasst, sind sie die einzigen
 * Überschriften, die keine Rechenarbeit verlangen.
 */
function TagUeberschrift({ date }: { date: Date }) {
  const { palette } = useTheme();
  const { label, date: datum, relative } = formatDayHeadingParts(date);

  return (
    <View style={styles.tagzeile}>
      <Text style={[styles.tagLabel, { color: relative ? palette.primary : palette.text }]}>
        {label}
      </Text>
      <View style={[styles.tagLinie, { backgroundColor: palette.border }]} />
      <Text style={[styles.tagDatum, { color: palette.textMuted }]}>{datum}</Text>
    </View>
  );
}

/** Zeigt an, wenn die Daten aus dem Zwischenspeicher stammen oder veraltet sind. */
function StatusHinweis({
  fromCache,
  fetchedAt,
  error,
  hatDaten,
}: {
  fromCache: boolean;
  fetchedAt: Date | null;
  error: Error | null;
  hatDaten: boolean;
}) {
  if (error && !hatDaten) {
    return <Banner tone="danger" text="Termine konnten nicht geladen werden. Besteht eine Internetverbindung?" />;
  }
  if (error) {
    return <Banner tone="warning" text={`Keine Verbindung — angezeigter Stand: ${formatAge(fetchedAt)}.`} />;
  }
  if (fromCache && fetchedAt && Date.now() - fetchedAt.getTime() > 6 * 60 * 60 * 1000) {
    return <Banner tone="warning" text={`Stand: ${formatAge(fetchedAt)}. Zum Aktualisieren nach unten ziehen.`} />;
  }
  return null;
}

interface Abschnitt {
  key: string;
  date: Date;
  data: ClubEvent[];
}

/** Gruppiert nach Kalendertag in Vereinszeit — `SectionList` erwartet `data`. */
function zuAbschnitten(events: ClubEvent[]): Abschnitt[] {
  const abschnitte = new Map<string, Abschnitt>();

  for (const event of events) {
    const key = localDayKey(event.start, CLUB_TIMEZONE);
    let abschnitt = abschnitte.get(key);
    if (!abschnitt) {
      abschnitt = { key, date: event.start, data: [] };
      abschnitte.set(key, abschnitt);
    }
    abschnitt.data.push(event);
  }

  return [...abschnitte.values()];
}

const styles = StyleSheet.create({
  liste: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  kopf: {
    gap: spacing.md,
  },
  tagzeile: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  tagLabel: {
    ...labelType,
    fontSize: fontSize.sm,
  },
  tagLinie: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  tagDatum: {
    fontFamily: font.displayMedium,
    fontSize: fontSize.md,
  },
});
