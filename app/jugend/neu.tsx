/**
 * Der Entwurf-Bildschirm für Guides.
 *
 * Der Weg hierher steht nur für Guides in der Liste (`app/(tabs)/jugend.tsx`,
 * Knopf „Training anlegen"). Ruft jemand anderes diese Adresse trotzdem auf,
 * lehnt die API das Anlegen mit 403 ab — `beschreibeJugendFehler` übersetzt
 * das schon in „Das dürfen nur Guides.". Ein zweites Türschloss hier wäre nur
 * eine Kopie derselben Anzeigehilfe, die `KontoContext.rolle` schon ist.
 *
 * Datum und Uhrzeit als zwei einfache Textfelder statt eines nativen
 * Pickers: Das Projekt bringt kein Datumspaket mit (`npx expo install`
 * bräuchte einen eigenen Grund dafür), und für ein Formular, das ein Guide
 * vielleicht einmal in der Woche ausfüllt, genügt die Texteingabe.
 * `leseZeitpunkt` rechnet dabei in Bielefelder Ortszeit, nicht in der
 * Zeitzone des Geräts (siehe dort).
 *
 * Nach dem Anlegen ersetzt eine Bestätigung mit dem Hinweis, dass die Guides
 * jetzt eine Mail bekommen, das Formular — der Knopf „Zur Liste" geht von da
 * aus bewusst erst auf Antippen weiter, nicht automatisch: Ein Wegspringen
 * mitten im Lesen hätte den Hinweis leicht verschluckt.
 */

import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { legeTrainingAn } from '../../src/data/jugend';
import { leseOptionaleAnzahl, leseZeitpunkt } from '../../src/features/jugend/eingabe';
import { beschreibeJugendFehler } from '../../src/features/jugend/jugendFehler';
import { useKonto } from '../../src/konto/KontoContext';
import { font, fontSize, radius, spacing } from '../../src/theme';
import { ActionButton, Banner, Card, Label } from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';

export default function NeuesTrainingScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { api } = useKonto();

  const [datum, setDatum] = useState('');
  const [uhrzeit, setUhrzeit] = useState('');
  const [ort, setOrt] = useState('');
  const [hinweis, setHinweis] = useState('');
  const [plaetze, setPlaetze] = useState('');
  // Vorbelegt mit dem Standard der API (`COALESCE(…, 2)` in
  // `api/src/jugendtraining.ts`) — wer nichts ändert, bekommt trotzdem einen
  // sinnvollen Wert statt eines leeren Felds.
  const [guidesNoetig, setGuidesNoetig] = useState('2');

  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  // Bleibt bewusst nur im Arbeitsspeicher dieses Bildschirms, statt den
  // Hinweis über einen Adress-Parameter an die Liste weiterzureichen: Ein
  // per `router.setParams` „gelöschter" Parameter blieb im Test hängen und
  // der Hinweis tauchte nach einem Abstecher zur Einzelansicht und zurück
  // ungewollt wieder auf. Diese Karte hier verschwindet dagegen zuverlässig,
  // sobald der Guide zur Liste weitergeht.
  const [angelegt, setAngelegt] = useState(false);

  async function anlegen() {
    setFehler(null);

    const beginntAm = leseZeitpunkt(datum, uhrzeit);
    if (!beginntAm) {
      setFehler('Datum und Uhrzeit brauchen das Muster TT.MM.JJJJ und HH:MM.');
      return;
    }
    if (ort.trim() === '') {
      setFehler('Der Ort fehlt noch.');
      return;
    }
    const plaetzeWert = leseOptionaleAnzahl(plaetze);
    const guidesNoetigWert = leseOptionaleAnzahl(guidesNoetig);
    if (plaetzeWert === 'ungueltig' || guidesNoetigWert === 'ungueltig') {
      setFehler('Plätze und benötigte Guides bleiben entweder leer oder sind eine ganze Zahl über null.');
      return;
    }

    setLaeuft(true);
    try {
      await legeTrainingAn(api, {
        beginntAm,
        ort: ort.trim(),
        hinweis: hinweis.trim() === '' ? null : hinweis.trim(),
        plaetze: plaetzeWert,
        guidesNoetig: guidesNoetigWert ?? undefined,
      });
      setAngelegt(true);
    } catch (ursache) {
      setFehler(beschreibeJugendFehler(ursache));
    } finally {
      setLaeuft(false);
    }
  }

  if (angelegt) {
    return (
      <>
        <Stack.Screen options={{ title: 'Neues Training' }} />
        <View style={[styles.bestaetigung, { paddingBottom: insets.bottom + spacing.xxl }]}>
          <Banner tone="info" text="Angelegt. Die Guides bekommen jetzt eine Mail." />
          <View style={styles.knopf}>
            <ActionButton label="Zur Liste" onPress={() => router.replace('/(tabs)/jugend')} />
          </View>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Neues Training' }} />
      <ScrollView contentContainerStyle={[styles.inhalt, { paddingBottom: insets.bottom + spacing.xxl }]}>
        <Card>
          <Label>Entwurf</Label>

          <Text style={[styles.feldLabel, { color: palette.textMuted }]}>Datum (TT.MM.JJJJ)</Text>
          <TextInput
            value={datum}
            onChangeText={setDatum}
            placeholder="10.08.2026"
            placeholderTextColor={palette.textMuted}
            keyboardType="numbers-and-punctuation"
            style={[
              styles.feld,
              { color: palette.text, borderColor: palette.border, backgroundColor: palette.surface },
            ]}
          />

          <Text style={[styles.feldLabel, { color: palette.textMuted }]}>Uhrzeit (HH:MM)</Text>
          <TextInput
            value={uhrzeit}
            onChangeText={setUhrzeit}
            placeholder="10:30"
            placeholderTextColor={palette.textMuted}
            keyboardType="numbers-and-punctuation"
            style={[
              styles.feld,
              { color: palette.text, borderColor: palette.border, backgroundColor: palette.surface },
            ]}
          />

          <Text style={[styles.feldLabel, { color: palette.textMuted }]}>Ort</Text>
          <TextInput
            value={ort}
            onChangeText={setOrt}
            placeholder="Wanderparkplatz Kalkofen"
            placeholderTextColor={palette.textMuted}
            style={[
              styles.feld,
              { color: palette.text, borderColor: palette.border, backgroundColor: palette.surface },
            ]}
          />

          <Text style={[styles.feldLabel, { color: palette.textMuted }]}>Hinweis (optional)</Text>
          <TextInput
            value={hinweis}
            onChangeText={setHinweis}
            placeholder="Helm nicht vergessen"
            placeholderTextColor={palette.textMuted}
            multiline
            style={[
              styles.feld,
              { color: palette.text, borderColor: palette.border, backgroundColor: palette.surface },
            ]}
          />

          <Text style={[styles.feldLabel, { color: palette.textMuted }]}>Plätze (leer = unbegrenzt)</Text>
          <TextInput
            value={plaetze}
            onChangeText={setPlaetze}
            placeholder="unbegrenzt"
            placeholderTextColor={palette.textMuted}
            keyboardType="number-pad"
            style={[
              styles.feld,
              { color: palette.text, borderColor: palette.border, backgroundColor: palette.surface },
            ]}
          />

          <Text style={[styles.feldLabel, { color: palette.textMuted }]}>Benötigte Guides</Text>
          <TextInput
            value={guidesNoetig}
            onChangeText={setGuidesNoetig}
            keyboardType="number-pad"
            style={[
              styles.feld,
              { color: palette.text, borderColor: palette.border, backgroundColor: palette.surface },
            ]}
          />

          {fehler ? (
            <View style={styles.banner}>
              <Banner tone="danger" text={fehler} />
            </View>
          ) : null}

          <View style={styles.knopf}>
            {laeuft ? (
              <ActivityIndicator color={palette.primary} />
            ) : (
              <ActionButton label="Entwurf anlegen" onPress={() => void anlegen()} />
            )}
          </View>
        </Card>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  inhalt: {
    gap: spacing.lg,
    padding: spacing.lg,
  },
  bestaetigung: {
    padding: spacing.lg,
  },
  feldLabel: {
    fontFamily: font.regular,
    fontSize: fontSize.sm,
    marginTop: spacing.md,
  },
  feld: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    fontFamily: font.regular,
    fontSize: fontSize.md,
    marginTop: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  banner: {
    marginTop: spacing.md,
  },
  knopf: {
    marginTop: spacing.lg,
  },
});
