/**
 * Ein einzelner Beitrag aus "Aktuelles".
 *
 * Der Text wird als reiner Text angezeigt statt in einer eingebetteten
 * Webansicht: schneller, lesbarer, und funktioniert offline. Wer das Original
 * mit allen Bildern sehen will, kommt über den Knopf am Ende dorthin.
 */

import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppData } from '../../src/data/AppDataContext';
import { formatDateWithYear } from '../../src/features/events/format';
import { fontSize, radius, spacing } from '../../src/theme';
import { ActionButton, EmptyState, LoadingState } from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';

export default function NewsDetailScreen() {
  const { palette } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { news } = useAppData();

  const beitrag = news.data.find((eintrag) => eintrag.id === id);

  if (news.loading) return <LoadingState />;
  if (!beitrag) {
    return <EmptyState title="Beitrag nicht gefunden" hint="Er wurde vermutlich von der Website entfernt." />;
  }

  return (
    <ScrollView contentContainerStyle={styles.inhalt}>
      {beitrag.imageUrl ? (
        <Image source={{ uri: beitrag.imageUrl }} style={styles.bild} contentFit="cover" cachePolicy="disk" />
      ) : null}

      <View style={styles.kopf}>
        <Text style={[styles.datum, { color: palette.textMuted }]}>
          {formatDateWithYear(beitrag.publishedAt)}
          {beitrag.author ? ` · ${beitrag.author}` : ''}
        </Text>
        <Text style={[styles.titel, { color: palette.text }]}>{beitrag.title}</Text>
      </View>

      <Text style={[styles.text, { color: palette.text }]}>{beitrag.contentText}</Text>

      <ActionButton
        label="Auf mtb-bielefeld.de lesen"
        tone="secondary"
        onPress={() => void WebBrowser.openBrowserAsync(beitrag.link)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  inhalt: {
    gap: spacing.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xxl * 2,
  },
  bild: {
    borderRadius: radius.md,
    height: 208,
    width: '100%',
  },
  kopf: {
    gap: spacing.xs,
  },
  datum: {
    fontSize: fontSize.sm,
  },
  titel: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    lineHeight: 32,
  },
  text: {
    fontSize: fontSize.md,
    lineHeight: 24,
  },
});
