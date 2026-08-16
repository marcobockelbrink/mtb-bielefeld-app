/**
 * "Aktuelles" — die Beiträge von der Vereinswebsite.
 *
 * Die Beiträge tragen Themen ("Racing", "Jugend", "Naturschutz", …), die der
 * Verein auf der Website vergibt. Danach lässt sich filtern — wer nur die
 * Rennberichte lesen will, muss nicht durch alles blättern.
 */

import { Image } from 'expo-image';
import { Link, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppData } from '../../src/data/AppDataContext';
import { asyncStorageStore } from '../../src/data/asyncStorageStore';
import type { NewsItem } from '../../src/domain/types';
import { formatAge, formatDateWithYear } from '../../src/features/events/format';
import { istUngelesen, type GelesenStand } from '../../src/features/news/gelesen';
import { liesGelesen } from '../../src/features/news/gelesenSpeicher';
import { font, fontSize, labelType, radius, spacing } from '../../src/theme';
import { ActionButton, Badge, Banner, Chip, EmptyState, LoadingState } from '../../src/ui/components';
import { Blatt } from '../../src/ui/Blatt';
import { useTheme } from '../../src/ui/theme';

/**
 * Spielraum in Punkten, ab dem die Zeile als „geht weiter" gilt.
 *
 * Unterhalb davon bleibt am Ende oft ein Bruchteil eines Punktes stehen,
 * und eine Kante, die beim letzten Pixel wieder aufblitzt, flackert.
 */
const RAND = 4;

export default function NewsScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { news, refresh, loadMoreNews } = useAppData();

  // Mehrfachauswahl statt Einzelthema — Design-Review vom 14.08.2026
  // („2a"). Leer heißt: alle Beiträge.
  const [gewaehlteThemen, setGewaehlteThemen] = useState<string[]>([]);
  const [themenBlattOffen, setThemenBlattOffen] = useState(false);
  // Befund „G1": Die Fade-Kante rechts stand fest da — auch wenn alle
  // Themen ins Bild passten. Diese drei Werte sagen, ob wirklich noch
  // etwas kommt; gemessen statt geraten, weil die Breite von der Anzahl
  // der Themen, der Schriftgröße und dem Gerät abhängt.
  const [inhaltsbreite, setInhaltsbreite] = useState(0);
  const [zeilenbreite, setZeilenbreite] = useState(0);
  const [amEnde, setAmEnde] = useState(false);
  // Solange nicht gemessen ist, wird die Kante **gezeigt**. Der umgekehrte
  // Ausgangswert war der erste Entwurf und der falsche: Vor der ersten
  // Messung sind beide Breiten 0, die Kante fehlte also im ersten Bild —
  // und blieb in der Web-Fassung ganz weg. Lieber einmal zu viel
  // angedeutet als eine Andeutung verloren, die vorher funktionierte.
  const gemessen = inhaltsbreite > 0 && zeilenbreite > 0;
  const mehrThemen = !gemessen || (inhaltsbreite > zeilenbreite + RAND && !amEnde);

  /**
   * Befund „G2": ein dezenter Punkt an ungelesenen Beiträgen.
   *
   * Neu geladen bei **jedem** Zuwenden, nicht nur einmal: Wer einen
   * Beitrag liest und zurückkommt, soll den Punkt weg sehen. Die
   * Detailansicht schreibt in denselben Speicher, aber in einen eigenen
   * Bildschirm — ohne das Nachladen bliebe der Punkt bis zum Neustart.
   */
  const [gelesen, setGelesen] = useState<GelesenStand | null>(null);
  useFocusEffect(
    useCallback(() => {
      void liesGelesen(asyncStorageStore, new Date()).then(setGelesen);
    }, []),
  );
  // Die Auswahl im Blatt togglet sofort optisch, angewandt wird sie erst
  // mit dem Bestätigen-Knopf — bis dahin lebt sie hier.
  const [blattAuswahl, setBlattAuswahl] = useState<string[]>([]);

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

  const sichtbar = useMemo(() => {
    if (gewaehlteThemen.length === 0) return news.data;
    const menge = new Set(gewaehlteThemen);
    return news.data.filter((beitrag) => beitrag.tags.some((tag) => menge.has(tag)));
  }, [news.data, gewaehlteThemen]);

  if (news.loading) return <LoadingState label="Beiträge werden geladen …" />;

  return (
    <>
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
            <View style={styles.zeileRahmen}>
              {/* Eine scrollende Zeile statt drei umbrechender: Die Tags
                  schoben den ersten Beitrag unter die Falte. Die Fade-Kante
                  rechts sagt, dass es weitergeht.

                  Seit dem 16.08.2026 (Befund „G1") sagt sie es nur noch,
                  wenn es stimmt: Fest eingeblendet stand sie auch über
                  drei Themen, die vollständig ins Bild passten — ein
                  Hinweis auf Verborgenes, hinter dem nichts lag. Wer
                  daraufhin wischt und nichts findet, glaubt der Kante
                  beim nächsten Mal nicht mehr. */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.zeile}
                scrollEventThrottle={32}
                onScroll={(e) => {
                  const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                  setAmEnde(contentOffset.x + layoutMeasurement.width >= contentSize.width - RAND);
                }}
                onContentSizeChange={(breite) => {
                  setInhaltsbreite(breite);
                  // Kommt ein Thema dazu, ist „am Ende" nicht mehr wahr.
                  // Der nächste Wisch berichtigt es ohnehin; ohne das
                  // bliebe die Kante bis dahin verschwunden.
                  setAmEnde(false);
                }}
                onLayout={(e) => setZeilenbreite(e.nativeEvent.layout.width)}
              >
                <Pressable
                  onPress={() => {
                    setBlattAuswahl(gewaehlteThemen);
                    setThemenBlattOffen(true);
                  }}
                  accessibilityLabel="Themen wählen"
                  style={({ pressed }) => [
                    styles.themenKnopf,
                    { borderColor: palette.primary, backgroundColor: pressed ? palette.surfaceMuted : palette.surface },
                  ]}
                >
                  <Ionicons name="options-outline" size={16} color={palette.primary} />
                  <Text style={[styles.themenKnopfText, { color: palette.primary }]}>Themen</Text>
                </Pressable>
                <Chip label="Alle" selected={gewaehlteThemen.length === 0} onPress={() => setGewaehlteThemen([])} />
                {themen.map((name) => (
                  <Chip
                    key={name}
                    label={name}
                    selected={gewaehlteThemen.includes(name)}
                    onPress={() =>
                      setGewaehlteThemen((alt) =>
                        alt.includes(name) ? alt.filter((t) => t !== name) : [...alt, name],
                      )
                    }
                  />
                ))}
              </ScrollView>
              {mehrThemen ? (
                <LinearGradient
                  colors={['transparent', palette.background]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.fade}
                  pointerEvents="none"
                />
              ) : null}
            </View>
          ) : null}
        </View>
      }
      renderItem={({ item }) => (
        <NewsCard item={item} ungelesen={gelesen !== null && istUngelesen(item, gelesen)} />
      )}
      ListEmptyComponent={
        <EmptyState
          title={gewaehlteThemen.length > 0 ? `Nichts zu ${gewaehlteThemen.length === 1 ? `„${gewaehlteThemen[0]}“` : 'diesen Themen'}` : 'Keine Beiträge'}
          hint={
            gewaehlteThemen.length > 0
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
        if (gewaehlteThemen.length === 0) void loadMoreNews();
      }}
    />
    <Blatt offen={themenBlattOffen} beimSchliessen={() => setThemenBlattOffen(false)}>
      <View style={styles.blattKopf}>
        <Text style={[styles.blattTitel, { color: palette.text }]}>Themen wählen</Text>
        <Pressable onPress={() => setBlattAuswahl([])} accessibilityLabel="Auswahl zurücksetzen">
          <Text style={[styles.zuruecksetzen, { color: palette.textMuted }]}>Zurücksetzen</Text>
        </Pressable>
      </View>
      <View style={styles.blattThemen}>
        {themen.map((name) => (
          <Chip
            key={name}
            label={name}
            selected={blattAuswahl.includes(name)}
            onPress={() =>
              setBlattAuswahl((alt) => (alt.includes(name) ? alt.filter((t) => t !== name) : [...alt, name]))
            }
          />
        ))}
      </View>
      <ActionButton
        label={
          blattAuswahl.length === 0
            ? 'Alle Beiträge anzeigen'
            : `${blattAuswahl.length} ${blattAuswahl.length === 1 ? 'Thema' : 'Themen'} anzeigen`
        }
        onPress={() => {
          setGewaehlteThemen(blattAuswahl);
          setThemenBlattOffen(false);
        }}
      />
    </Blatt>
    </>
  );
}

function NewsCard({ item, ungelesen }: { item: NewsItem; ungelesen: boolean }) {
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
              {/* Befund „G2": ein Punkt, kein Wort und keine Farbe an der
                  ganzen Karte. Er steht **vor** dem Titel, weil das Auge
                  beim Blättern der linken Kante folgt — und er nimmt keinen
                  Platz weg, wenn er fehlt (`gap` greift nur zwischen
                  vorhandenen Kindern).

                  Der Punkt trägt zusätzlich einen Text für die
                  Vorlesefunktion: Wer die Karte hört statt sieht, bekommt
                  eine Farbe nicht mit. */}
              <View style={styles.titelZeile}>
                {ungelesen ? (
                  <View
                    style={[styles.punkt, { backgroundColor: palette.primary }]}
                    accessibilityLabel="Ungelesen"
                  />
                ) : null}
                <Text style={[styles.titel, { color: palette.text }]} numberOfLines={3}>
                  {item.title}
                </Text>
              </View>
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
  zeileRahmen: {
    // Rand-zu-Rand scrollen: Die Liste hat 16 Padding, die Zeile hebt es
    // auf und bringt es innen wieder an — sonst schnitte der Rand die Chips.
    marginHorizontal: -spacing.lg,
  },
  zeile: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  fade: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 36,
  },
  themenKnopf: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
  },
  themenKnopfText: {
    fontFamily: font.medium,
    fontSize: fontSize.md,
  },
  blattKopf: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  blattTitel: {
    fontFamily: font.semibold,
    fontSize: fontSize.lg,
  },
  zuruecksetzen: {
    fontFamily: font.label,
    fontSize: 11,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  blattThemen: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
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
    ...labelType,
    fontSize: fontSize.xs - 1,
  },
  titelZeile: {
    flexDirection: 'row',
    gap: spacing.sm,
    // Oben ausgerichtet, nicht mittig: Bei einem dreizeiligen Titel
    // stünde der Punkt sonst neben der mittleren Zeile und sähe wie ein
    // Aufzählungszeichen aus.
    alignItems: 'flex-start',
  },
  punkt: {
    width: 8,
    height: 8,
    borderRadius: 4,
    // Auf die Höhe der ersten Zeile gerückt: `lineHeight` 23, Punkt 8 —
    // die Differenz halbiert setzt ihn auf die Mitte der Versalhöhe.
    marginTop: 7,
  },
  titel: {
    flexShrink: 1,
    fontFamily: font.semibold,
    fontSize: fontSize.lg,
    lineHeight: 23,
  },
  anriss: {
    fontFamily: font.regular,
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
    fontFamily: font.regular,
    fontSize: fontSize.sm,
    paddingVertical: spacing.lg,
    textAlign: 'center',
  },
});
