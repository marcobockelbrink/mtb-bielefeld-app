/**
 * Die Bildrechte aller Kinder (Handoff 15, Sicht 15b).
 *
 * **Die einzige Stelle, an der ein Nein oder ein Widerruf entsteht.** In
 * der App gibt es dafür bewusst keinen Weg: Die Hürde soll beim Gespräch
 * liegen. Wer hier tippt, hat gerade mit jemandem gesprochen — deshalb
 * fragt jeder der beiden Knöpfe noch einmal nach, und deshalb steht der
 * Name des Kindes in der Rückfrage.
 *
 * Hier stehen die vollen Namen aller Kinder samt Elternadresse. Das ist
 * der Zweck (jemand muss zurückrufen können) und zugleich der Grund, warum
 * der Endpunkt die Rolle prüft und nicht nur dieser Bildschirm.
 */

import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  erfasseAntwort,
  hakeExternAb,
  holeBildrechte,
  type KindMitEinwilligung,
} from '../../src/data/bildrechte';
import { beschreibe, passtZuFilter, type Filter } from '../../src/features/bildrechte/status';
import { useKonto } from '../../src/konto/KontoContext';
import { font, fontSize, radius, spacing } from '../../src/theme';
import { Banner, Card, Chip, EmptyState, Label, LoadingState } from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';

export default function BildrechteVerwaltung() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { api } = useKonto();

  const [kinder, setKinder] = useState<KindMitEinwilligung[] | null>(null);
  const [filter, setFilter] = useState<Filter>('fehlt');
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);

  const laden = useCallback(async () => {
    try {
      setKinder(await holeBildrechte(api));
      setFehler(null);
    } catch {
      setFehler('Die Liste konnte nicht geladen werden.');
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      void laden();
    }, [laden]),
  );

  async function handeln(kind: KindMitEinwilligung, was: 'abgelehnt' | 'widerrufen' | 'extern') {
    setLaeuft(kind.id);
    setFehler(null);
    try {
      if (was === 'extern') await hakeExternAb(api, kind.id);
      else await erfasseAntwort(api, kind.id, was);
      await laden();
    } catch {
      setFehler('Das hat nicht geklappt. Versuch es gleich noch einmal.');
    } finally {
      setLaeuft(null);
    }
  }

  /**
   * Jede der drei Handlungen fragt nach.
   *
   * Sie sind alle drei stellvertretend: Jemand trägt ein, was ein anderer
   * gesagt hat. Ein Fehlgriff in einer Liste von dreißig Namen träfe die
   * falsche Familie, und niemand merkte es — beim Nein bliebe ein Kind
   * ohne Grund von jedem Foto ausgeschlossen, beim Abhaken stünde eine
   * Einwilligung da, die es nie gab.
   */
  function nachfragen(kind: KindMitEinwilligung, was: 'abgelehnt' | 'widerrufen' | 'extern') {
    const name = kind.name ?? 'dieses Kind';
    const texte = {
      abgelehnt: [`Nein für ${name} erfassen?`, 'Damit gilt für Guides: keine Fotos.'],
      widerrufen: [
        `Einwilligung für ${name} widerrufen?`,
        'Die bisherige Zustimmung bleibt als Eintrag erhalten, gilt aber nicht mehr.',
      ],
      extern: [
        `Für ${name} extern bestätigt?`,
        'Nur für den Altbestand aus dem Formular — nicht statt einer Zustimmung in der App.',
      ],
    }[was];

    Alert.alert(texte[0]!, texte[1], [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Erfassen', style: was === 'extern' ? 'default' : 'destructive', onPress: () => void handeln(kind, was) },
    ]);
  }

  if (!kinder) return <LoadingState />;

  const sichtbar = kinder.filter((k) => passtZuFilter(k.einwilligung, filter));
  const fehlen = kinder.filter((k) => passtZuFilter(k.einwilligung, 'fehlt')).length;

  return (
    <>
      <Stack.Screen options={{ title: 'Bildrechte' }} />
      <ScrollView
        contentContainerStyle={[styles.inhalt, { paddingBottom: insets.bottom + spacing.xxl }]}
      >
        {fehler ? <Banner tone="danger" text={fehler} /> : null}

        <Text style={[styles.zusammenfassung, { color: palette.text }]}>
          {fehlen === 0
            ? `Von allen ${kinder.length} Kindern liegt eine Antwort vor.`
            : `Bei ${fehlen} von ${kinder.length} Kindern fehlt noch eine Antwort.`}
        </Text>

        <View style={styles.filter}>
          {(
            [
              ['fehlt', 'Fehlt'],
              ['nein', 'Nein'],
              ['alle', 'Alle'],
            ] as const
          ).map(([wert, beschriftung]) => (
            <Chip
              key={wert}
              label={beschriftung}
              selected={filter === wert}
              onPress={() => setFilter(wert)}
            />
          ))}
        </View>

        {sichtbar.length === 0 ? (
          <EmptyState
            title="Nichts offen"
            hint="Zu allen Kindern in dieser Auswahl liegt eine Antwort vor."
          />
        ) : (
          sichtbar.map((kind) => {
            const stand = beschreibe(kind.einwilligung, kind.name);
            const farbe =
              stand.ton === 'gut'
                ? palette.success
                : stand.ton === 'nein'
                  ? palette.danger
                  : palette.textMuted;

            return (
              <Card key={kind.id}>
                <View style={styles.kopf}>
                  <Text style={[styles.name, { color: palette.text }]}>
                    {kind.name ?? 'ohne Namen'}
                  </Text>
                  {/* Punkt **und** Wort — Farbe allein trägt die Aussage nicht. */}
                  <View style={styles.stand}>
                    <View style={[styles.punkt, { backgroundColor: farbe }]} />
                    <Text style={[styles.standWort, { color: farbe }]}>{stand.wort}</Text>
                  </View>
                </View>

                {stand.zusatz ? (
                  <Text style={[styles.zeile, { color: palette.textMuted }]}>{stand.zusatz}</Text>
                ) : null}

                {kind.einwilligung.bestaetigtVon || kind.einwilligung.zeitpunkt ? (
                  <Text style={[styles.zeile, { color: palette.textMuted }]}>
                    {[
                      kind.einwilligung.bestaetigtVon,
                      kind.einwilligung.zeitpunkt
                        ? new Date(kind.einwilligung.zeitpunkt).toLocaleDateString('de-DE')
                        : null,
                      kind.einwilligung.textVersion ? `Fassung ${kind.einwilligung.textVersion}` : null,
                      kind.einwilligung.quelle === 'forms-import' ? 'aus dem Formular' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                ) : null}

                {/* Die Elternadresse ist der Grund, warum diese Liste
                    existiert: Für ein Nein muss jemand anrufen können. */}
                <Pressable
                  onPress={() => void Linking.openURL(`mailto:${kind.elternEmail}`)}
                  accessibilityRole="link"
                  hitSlop={6}
                >
                  <Text style={[styles.zeile, { color: palette.primary }]}>
                    {kind.elternEmail}
                  </Text>
                </Pressable>

                {laeuft === kind.id ? (
                  <ActivityIndicator color={palette.primary} style={styles.laeuft} />
                ) : (
                  <View style={styles.knoepfe}>
                    {kind.einwilligung.status !== 'abgelehnt' ? (
                      <Pressable onPress={() => nachfragen(kind, 'abgelehnt')} hitSlop={6}>
                        <Text style={[styles.knopf, { color: palette.danger }]}>Nein erfassen</Text>
                      </Pressable>
                    ) : null}

                    {kind.einwilligung.status === 'erteilt' ? (
                      <Pressable onPress={() => nachfragen(kind, 'widerrufen')} hitSlop={6}>
                        <Text style={[styles.knopf, { color: palette.danger }]}>Widerrufen</Text>
                      </Pressable>
                    ) : null}

                    {/* Nur solange nichts vorliegt: Der Übergang aus dem
                        Formular ist einmalig, danach ist Forms zu. */}
                    {kind.einwilligung.status === 'offen' ? (
                      <Pressable onPress={() => nachfragen(kind, 'extern')} hitSlop={6}>
                        <Text style={[styles.knopf, { color: palette.primary }]}>
                          Extern bestätigt
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                )}
              </Card>
            );
          })
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  inhalt: { gap: spacing.md, padding: spacing.lg },
  zusammenfassung: { fontFamily: font.medium, fontSize: fontSize.md },
  filter: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  kopf: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  name: { flexShrink: 1, fontFamily: font.semibold, fontSize: fontSize.md },
  stand: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  punkt: { borderRadius: 5, height: 10, width: 10 },
  standWort: { fontFamily: font.medium, fontSize: fontSize.sm },
  zeile: { fontFamily: font.regular, fontSize: fontSize.xs, lineHeight: 18, marginTop: spacing.xs },
  knoepfe: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, marginTop: spacing.md },
  knopf: { fontFamily: font.medium, fontSize: fontSize.sm },
  laeuft: { marginTop: spacing.md },
});
