/**
 * "Aktuelles" — die Beiträge von der Vereinswebsite.
 */

import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppData } from '../../src/data/AppDataContext';
import type { NewsItem } from '../../src/domain/types';
import { formatAge, formatDateWithYear } from '../../src/features/events/format';
import { fontSize, radius, spacing } from '../../src/theme';
import { Banner, EmptyState, LoadingState } from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';

export default function NewsScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { news, refresh } = useAppData();

  if (news.loading) return <LoadingState label="Beiträge werden geladen …" />;

  return (
    <FlatList
      data={news.data}
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
        news.error ? (
          <View style={styles.kopf}>
            <Banner
              tone={news.data.length > 0 ? 'warning' : 'danger'}
              text={
                news.data.length > 0
                  ? `Keine Verbindung — angezeigter Stand: ${formatAge(news.fetchedAt)}.`
                  : 'Beiträge konnten nicht geladen werden. Besteht eine Internetverbindung?'
              }
            />
          </View>
        ) : null
      }
      renderItem={({ item }) => <NewsCard item={item} />}
      ListEmptyComponent={
        <EmptyState
          title="Keine Beiträge"
          hint="Sobald der Verein etwas veröffentlicht, erscheint es hier."
        />
      }
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
    marginBottom: spacing.md,
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
});
