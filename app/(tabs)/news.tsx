/**
 * "Aktuelles" — die Beiträge von der Vereinswebsite.
 *
 * Die Beiträge tragen Themen ("Racing", "Jugend", "Naturschutz", …), die der
 * Verein auf der Website vergibt. Danach lässt sich filtern — wer nur die
 * Rennberichte lesen will, muss nicht durch alles blättern.
 */

import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppData } from '../../src/data/AppDataContext';
import type { NewsItem } from '../../src/domain/types';
import { formatAge, formatDateWithYear } from '../../src/features/events/format';
import { fontSize, radius, spacing } from '../../src/theme';
import { ActionButton, Badge, Banner, Chip, EmptyState, LoadingState } from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';

export default function NewsScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { news, refresh, loadMoreNews } = useAppData();

  const [thema, setThema] = useState<string | null>(null);

  /**
   * Die Themen der geladenen Beiträge, nach Häufigkeit sortiert.
   *
   * Bewusst aus den Daten abgeleitet statt fest verdrahtet: Legt der Verein ein
   * neues Thema an, taucht es von selbst auf.
   */
  const themen = useMemo(() => {
    const zaehler = new Map<string, number>();
    for (const beitrag of news.data) {
      for (const name of beitrag.tags) zaehler.set(name, (zaehler.get(name) ?? 0) + 1);
    }
    return [...zaehler.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
  }, [news.data]);

  const sichtbar = useMemo(
    () => (thema ? news.data.filter((beitrag) => beitrag.tags.includes(thema)) : news.data),
    [news.data, thema],
  );

  if (news.loading) return <LoadingState label="Beiträge werden geladen …" />;

  return (
    <FlatList
      data={sichtbar}
      keyExtractor={(item) => item.id}
      contentContainerStyle={[styles.liste, { paddingBottom: insets.bottom + spacing.xxl }]}
      refreshControl={
        <RefreshControl
          refreshing={news.refreshing}
          onRefresh={() => void refresh({ force: true })}
          tintColor={palette.primary}
          colors={[palette.primary]}
        />
      }
      ListHeaderComponent={
        <View style={styles.kopf}>
          {news.error ? (
            <Banner
              tone={news.data.length > 0 ? 'warning' : 'danger'}
              text={
                news.data.length > 0
                  ? `Keine Verbindung — angezeigter Stand: ${formatAge(news.fetchedAt)}.`
                  : 'Beiträge konnten nicht geladen werden. Besteht eine Internetverbindung?'
              }
            />
          ) : null}

          {themen.length > 0 ? (
            <View style={styles.themen}>
              <Chip label="Alle" selected={thema === null} onPress={() => setThema(null)} />
              {themen.map((name) => (
                <Chip
                  key={name}
                  label={name}
                  selected={thema === name}
                  onPress={() => setThema(thema === name ? null : name)}
                />
              ))}
            </View>
          ) : null}
        </View>
      }
      renderItem={({ item }) => <NewsCard item={item} />}
      ListEmptyComponent={
        <EmptyState
          title={thema ? `Nichts zum Thema „${thema}“` : 'Keine Beiträge'}
          hint={
            thema
              ? 'Vielleicht steht dazu etwas weiter hinten im Archiv — lade weitere Beiträge nach.'
              : 'Sobald der Verein etwas veröffentlicht, erscheint es hier.'
          }
        />
      }
      ListFooterComponent={
        news.hasMore ? (
          <View style={styles.fuss}>
            {news.loadingMore ? (
              <ActivityIndicator color={palette.primary} />
            ) : (
              <ActionButton
                label="Ältere Beiträge laden"
                tone="secondary"
                onPress={() => void loadMoreNews()}
              />
            )}
          </View>
        ) : news.data.length > 0 ? (
          <Text style={[styles.ende, { color: palette.textMuted }]}>
            Das war das ganze Archiv — {news.data.length} Beiträge.
          </Text>
        ) : null
      }
      // Erst nachladen, wenn wirklich bis ans Ende gescrollt wurde.
      onEndReachedThreshold={0.4}
      onEndReached={() => {
        if (!thema) void loadMoreNews();
      }}
    />
  );
}

function NewsCard({ item }: { item: NewsItem }) {
  const { palette } = useTheme();

  return (
    <Link href={{ pathname: '/news/[id]', params: { id: item.id } }} asChild>
      <Pressable accessibilityRole="button">
        {/*
          Gestaltung auf der inneren Ansicht, nicht auf dem Pressable: `Link
          asChild` ersetzt das äußere Element und dessen Stil geht dabei
          verloren — die Karte stand sonst ohne Hintergrund und Rahmen da.
        */}
        {({ pressed }) => (
          <View
            style={[
              styles.karte,
              { backgroundColor: palette.surface, borderColor: palette.border, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            {item.imageUrl ? (
              <Image
                source={{ uri: item.imageUrl }}
                style={styles.bild}
                contentFit="cover"
                transition={150}
                // Beiträge im Wald ohne Empfang: das Bild kommt aus dem Gerätespeicher.
                cachePolicy="disk"
              />
            ) : null}

            <View style={styles.karteninhalt}>
              <Text style={[styles.datumZeile, { color: palette.textMuted }]}>
                {formatDateWithYear(item.publishedAt)}
                {item.author ? ` · ${item.author}` : ''}
              </Text>
              <Text style={[styles.titel, { color: palette.text }]} numberOfLines={3}>
                {item.title}
              </Text>
              <Text style={[styles.anriss, { color: palette.textMuted }]} numberOfLines={3}>
                {item.summary}
              </Text>

              {item.tags.length > 0 ? (
                <View style={styles.markierungen}>
                  {item.tags.map((name) => (
                    <Badge key={name} label={name} />
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        )}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  liste: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  kopf: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  themen: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  karte: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  bild: {
    height: 176,
    width: '100%',
  },
  karteninhalt: {
    gap: spacing.xs,
    padding: spacing.lg,
  },
  datumZeile: {
    fontSize: fontSize.xs,
  },
  titel: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    lineHeight: 23,
  },
  anriss: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  markierungen: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  fuss: {
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
  },
  ende: {
    fontSize: fontSize.sm,
    paddingVertical: spacing.lg,
    textAlign: 'center',
  },
});
