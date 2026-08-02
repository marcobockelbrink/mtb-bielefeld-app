/**
 * Ein einzelner Beitrag aus "Aktuelles".
 *
 * Die Übersicht kennt nur den Anriss — der vollständige Text steht auf der
 * Seite des Beitrags und wird erst geholt, wenn jemand ihn öffnet. Angezeigt
 * wird er als reiner Text statt in einer eingebetteten Webansicht: schneller,
 * lesbarer, und funktioniert offline.
 */

import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppData } from '../../src/data/AppDataContext';
import { asyncStorageStore } from '../../src/data/asyncStorageStore';
import { loadArticle } from '../../src/data/repository';
import type { NewsItem } from '../../src/domain/types';
import { formatDateWithYear } from '../../src/features/events/format';
import { fontSize, radius, spacing } from '../../src/theme';
import { ActionButton, Badge, Banner, EmptyState, LoadingState } from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';

export default function NewsDetailScreen() {
  const { palette } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { news } = useAppData();

  const anriss = news.data.find((eintrag) => eintrag.id === id);

  /** Der nachgeladene vollständige Beitrag, sobald er da ist. */
  const [volltext, setVolltext] = useState<NewsItem | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [fehlgeschlagen, setFehlgeschlagen] = useState(false);

  useEffect(() => {
    // Nur nachladen, wenn der vorliegende Text tatsächlich gekürzt ist.
    if (!anriss?.link || !anriss.truncated) return;

    let abgebrochen = false;
    setLaedt(true);

    void loadArticle({ store: asyncStorageStore }, anriss.link)
      .then((ergebnis) => {
        if (abgebrochen) return;
        if (ergebnis.data) setVolltext(ergebnis.data);
        else setFehlgeschlagen(true);
      })
      .catch(() => {
        // Ohne Netz bleibt der Anriss stehen — besser als ein leerer Bildschirm.
        if (!abgebrochen) setFehlgeschlagen(true);
      })
      .finally(() => {
        if (!abgebrochen) setLaedt(false);
      });

    return () => {
      abgebrochen = true;
    };
  }, [anriss?.link, anriss?.truncated]);

  if (news.loading) return <LoadingState />;
  if (!anriss) {
    return <EmptyState title="Beitrag nicht gefunden" hint="Er wurde vermutlich von der Website entfernt." />;
  }

  const beitrag = volltext ?? anriss;
  const nurAnriss = beitrag.truncated === true;

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

        {beitrag.tags.length > 0 ? (
          <View style={styles.markierungen}>
            {beitrag.tags.map((name) => (
              <Badge key={name} label={name} tone="primary" />
            ))}
          </View>
        ) : null}
      </View>

      <Text style={[styles.text, { color: palette.text }]}>{beitrag.contentText}</Text>

      {laedt ? (
        <View style={styles.laedt}>
          <ActivityIndicator color={palette.primary} />
          <Text style={[styles.laedtText, { color: palette.textMuted }]}>Vollständiger Beitrag wird geladen …</Text>
        </View>
      ) : null}

      {!laedt && nurAnriss ? (
        <Banner
          tone="info"
          text={
            fehlgeschlagen
              ? 'Der vollständige Beitrag ließ sich nicht laden. Auf der Website steht er komplett.'
              : 'Das ist der Anfang des Beitrags. Vollständig steht er auf der Website.'
          }
        />
      ) : null}

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
    gap: spacing.sm,
  },
  datum: {
    fontSize: fontSize.sm,
  },
  titel: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    lineHeight: 32,
  },
  markierungen: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  text: {
    fontSize: fontSize.md,
    lineHeight: 24,
  },
  laedt: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  laedtText: {
    fontSize: fontSize.sm,
  },
});
