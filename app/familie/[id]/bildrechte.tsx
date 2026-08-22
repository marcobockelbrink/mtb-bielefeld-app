/**
 * Die Foto- und Videoeinwilligung erteilen (Handoff 15, Sicht 15a).
 *
 * ## Warum es hier nur ein Ja gibt
 *
 * Kein Ablehnen-Knopf, kein Widerrufen-Knopf. Das ist eine Entscheidung
 * des Vereins: Die Hürde für ein Nein soll beim Gespräch liegen, nicht bei
 * einem Antippen. Der Satz unter dem Knopf sagt das offen — ein Weg, der
 * verschwiegen würde, wäre etwas anderes als einer, der über Menschen
 * läuft.
 *
 * Durchgesetzt wird es am Server (`darfSetzen` in `api/src/einwilligung.ts`):
 * Ein Mitgliedskonto kann auch mit einem Aufruf von Hand nichts anderes
 * setzen als `erteilt`. Ein fehlender Knopf ist keine Regel.
 *
 * ## Zwei Stimmen ab 13
 *
 * Hat das Kind ein eigenes Konto, bestätigt es selbst — dann steht hier
 * nur der Hinweis, dass seine Stimme noch fehlt. Ohne eigenes Konto setzen
 * die Eltern das Häkchen „<Name> stimmt zu". Erst mit beiden Stimmen gilt
 * die Einwilligung als vollständig, und erst dann verschwindet für die
 * Guides das Etikett „keine Fotos".
 */

import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  erteileEinwilligung,
  holeEinwilligungstext,
  type Einwilligungstext,
} from '../../../src/data/bildrechte';
import { holeProfile, type Profil } from '../../../src/data/familie';
import { HINWEIS_NEIN } from '../../../src/features/bildrechte/status';
import { useKonto } from '../../../src/konto/KontoContext';
import { font, fontSize, radius, spacing } from '../../../src/theme';
import { Banner, Card, Label, LoadingState } from '../../../src/ui/components';
import { useTheme } from '../../../src/ui/theme';

export default function BildrechteScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { api } = useKonto();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [profil, setProfil] = useState<Profil | null>(null);
  const [text, setText] = useState<Einwilligungstext | null>(null);
  const [gelesen, setGelesen] = useState(false);
  const [haekchen, setHaekchen] = useState(false);
  const [jugendHaekchen, setJugendHaekchen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let abgebrochen = false;
    void Promise.all([holeProfile(api), holeEinwilligungstext(api)])
      .then(([profile, gelesenerText]) => {
        if (abgebrochen) return;
        setProfil(profile.find((p) => p.id === id) ?? null);
        setText(gelesenerText);
      })
      .catch(() => {
        if (!abgebrochen) setFehler('Der Text konnte nicht geladen werden. Besteht eine Verbindung?');
      });
    return () => {
      abgebrochen = true;
    };
  }, [api, id]);

  if (!profil || !text) return fehler ? <Banner tone="danger" text={fehler} /> : <LoadingState />;

  const vorname = (profil.name ?? '').trim().split(/\s+/)[0] || 'Dein Kind';
  // Braucht dieses Kind eine zweite Stimme? Der Server rechnet dasselbe;
  // hier geht es nur darum, ob das Häkchen erscheint.
  const brauchtZweite = profil.einwilligung.jugendBestaetigt !== null;
  const hatEigenesKonto = !profil.email?.endsWith('@familie.mtb-bielefeld.de');
  const bereit = haekchen && (!brauchtZweite || hatEigenesKonto || jugendHaekchen);

  async function erteilen() {
    setFehler(null);
    setLaeuft(true);
    try {
      await erteileEinwilligung(api, id!, brauchtZweite ? jugendHaekchen : undefined);
      router.back();
    } catch {
      setFehler('Das hat nicht geklappt. Versuch es gleich noch einmal.');
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Bildrechte' }} />
      <ScrollView
        contentContainerStyle={[styles.inhalt, { paddingBottom: insets.bottom + spacing.xxl }]}
      >
        {fehler ? <Banner tone="danger" text={fehler} /> : null}

        <Card>
          <Label>Fotos und Videos</Label>
          <Text style={[styles.zusammenfassung, { color: palette.text }]}>
            {text.zusammenfassung}
          </Text>

          <Pressable
            onPress={() => setGelesen((offen) => !offen)}
            accessibilityRole="button"
            accessibilityState={{ expanded: gelesen }}
            style={styles.mehrZeile}
          >
            <Text style={[styles.mehr, { color: palette.primary }]}>
              {gelesen ? 'Volltext ausblenden' : 'Volltext lesen'}
            </Text>
            <Ionicons
              name={gelesen ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={palette.primary}
            />
          </Pressable>
        </Card>

        {/*
          Der Volltext ist ausklappbar und **nicht** hinter einem zweiten
          Bildschirm: Wer zustimmen soll, muss lesen können, was er
          unterschreibt, ohne die Seite zu verlassen und den Faden zu
          verlieren. Er steht wörtlich so da, wie der Verein ihn führt.
        */}
        {gelesen ? (
          <Card>
            {text.abschnitte.map((abschnitt) => (
              <View key={abschnitt.titel} style={styles.abschnitt}>
                <Text style={[styles.abschnittTitel, { color: palette.text }]}>
                  {abschnitt.titel}
                </Text>
                {abschnitt.absaetze.map((absatz, nr) => (
                  <Text key={nr} style={[styles.absatz, { color: palette.textMuted }]}>
                    {absatz}
                  </Text>
                ))}
              </View>
            ))}
            <Text style={[styles.fassung, { color: palette.textMuted }]}>
              Fassung {text.version}
            </Text>
          </Card>
        ) : null}

        <Card>
          <Kaestchen
            an={haekchen}
            beimTippen={() => setHaekchen((a) => !a)}
            text={text.haekchen}
          />

          {/*
            Die zweite Stimme ab 13. Hat das Kind ein eigenes Konto, gehört
            sie ihm — dann steht hier ein Hinweis statt eines Häkchens, denn
            die Eltern können sie nicht stellvertretend geben.
          */}
          {brauchtZweite && !hatEigenesKonto ? (
            <Kaestchen
              an={jugendHaekchen}
              beimTippen={() => setJugendHaekchen((a) => !a)}
              text={`${vorname} ist damit einverstanden.`}
            />
          ) : null}

          {brauchtZweite && hatEigenesKonto ? (
            <Text style={[styles.hinweis, { color: palette.textMuted }]}>
              {vorname} ist alt genug, um selbst zu entscheiden, und hat ein eigenes Konto — die
              zweite Zustimmung gibt {vorname} dort.
            </Text>
          ) : null}
        </Card>

        {laeuft ? (
          <ActivityIndicator color={palette.primary} />
        ) : (
          <Pressable
            onPress={() => void erteilen()}
            disabled={!bereit}
            accessibilityRole="button"
            accessibilityState={{ disabled: !bereit }}
            accessibilityLabel="Einwilligung erteilen"
            style={({ pressed }) => [
              styles.knopf,
              {
                backgroundColor: pressed && bereit ? '#1b587a' : palette.primary,
                opacity: bereit ? 1 : 0.45,
              },
            ]}
          >
            <Text style={[styles.knopfText, { color: palette.onPrimary }]}>
              Einwilligung erteilen
            </Text>
          </Pressable>
        )}

        <Text style={[styles.hinweis, { color: palette.textMuted }]}>{HINWEIS_NEIN}</Text>
      </ScrollView>
    </>
  );
}

/** Ein Häkchen mit Text daneben — beides zusammen antippbar. */
function Kaestchen({
  an,
  beimTippen,
  text,
}: {
  an: boolean;
  beimTippen: () => void;
  text: string;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={beimTippen}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: an }}
      accessibilityLabel={text}
      hitSlop={6}
      style={styles.kaestchenZeile}
    >
      <View
        style={[
          styles.kaestchen,
          {
            borderColor: an ? palette.primary : palette.border,
            backgroundColor: an ? palette.primary : 'transparent',
          },
        ]}
      >
        {an ? <Ionicons name="checkmark" size={14} color={palette.onPrimary} /> : null}
      </View>
      <Text style={[styles.kaestchenText, { color: palette.text }]}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  inhalt: { gap: spacing.md, padding: spacing.lg },
  zusammenfassung: { fontFamily: font.regular, fontSize: fontSize.md, lineHeight: 23, marginTop: spacing.sm },
  mehrZeile: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md, minHeight: 44 },
  mehr: { fontFamily: font.medium, fontSize: fontSize.md },
  abschnitt: { gap: spacing.xs, marginTop: spacing.md },
  abschnittTitel: { fontFamily: font.semibold, fontSize: fontSize.md },
  absatz: { fontFamily: font.regular, fontSize: fontSize.sm, lineHeight: 21 },
  fassung: { fontFamily: font.regular, fontSize: fontSize.xs, marginTop: spacing.lg },
  kaestchenZeile: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, minHeight: 44 },
  kaestchen: {
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1.5,
    height: 22,
    justifyContent: 'center',
    marginTop: 2,
    width: 22,
  },
  kaestchenText: { flexShrink: 1, fontFamily: font.regular, fontSize: fontSize.sm, lineHeight: 21 },
  knopf: { alignItems: 'center', borderRadius: radius.md, justifyContent: 'center', minHeight: 50 },
  knopfText: { fontFamily: font.semibold, fontSize: fontSize.md },
  hinweis: { fontFamily: font.regular, fontSize: fontSize.xs, lineHeight: 18 },
});
