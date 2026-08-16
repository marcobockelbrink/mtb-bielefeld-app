/**
 * Der Entwurf-Bildschirm für Guides.
 *
 * Der Weg hierher steht nur für Guides in der Liste (`app/(tabs)/jugend.tsx`,
 * Knopf „Training anlegen"). Ruft jemand anderes diese Adresse trotzdem auf,
 * lehnt die API das Anlegen mit 403 ab — `beschreibeJugendFehler` übersetzt
 * das schon in „Das dürfen nur Guides.". Ein zweites Türschloss hier wäre nur
 * eine Kopie derselben Anzeigehilfe, die `KontoContext.rolle` schon ist.
 *
 * Datum und Uhrzeit kommen seit dem 13.08.2026 aus den nativen Wählern
 * (`DatumsFeld`) — der Grund, den das Projekt für ein Datumspaket
 * verlangte, kam von Marco: Tippen ist auf dem Telefon die
 * fehleranfälligste Eingabe. Gerechnet wird in der Zeitzone des Geräts,
 * was für einen Bielefelder Verein die Bielefelder Ortszeit ist.
 *
 * Nach dem Anlegen ersetzt eine Bestätigung mit dem Hinweis, dass die Guides
 * jetzt eine Mail bekommen, das Formular — der Knopf „Zur Liste" geht von da
 * aus bewusst erst auf Antippen weiter, nicht automatisch: Ein Wegspringen
 * mitten im Lesen hätte den Hinweis leicht verschluckt.
 */

import { Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { legeTrainingAn } from '../../src/data/jugend';
import { leseOptionaleAnzahl } from '../../src/features/jugend/eingabe';
import { hatInhalt, istFrisch, type TrainingsEntwurf } from '../../src/features/jugend/entwurf';
import { liesEntwurf, loescheEntwurf, schreibEntwurf } from '../../src/features/jugend/entwurfSpeicher';
import { beschreibeJugendFehler } from '../../src/features/jugend/jugendFehler';
import { useKonto } from '../../src/konto/KontoContext';
import { font, fontSize, radius, spacing } from '../../src/theme';
import { ActionButton, Banner, Card, Label } from '../../src/ui/components';
import { DatumsFeld } from '../../src/ui/DatumsFeld';
import { useTheme } from '../../src/ui/theme';

export default function NeuesTrainingScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { api } = useKonto();

  const [datum, setDatum] = useState<Date | null>(null);
  const [uhrzeit, setUhrzeit] = useState<Date | null>(null);
  const [ort, setOrt] = useState('');
  const [hinweis, setHinweis] = useState('');
  const [plaetze, setPlaetze] = useState('');
  // Vorbelegt mit dem Standard der API (`COALESCE(…, 2)` in
  // `api/src/jugendtraining.ts`) — wer nichts ändert, bekommt trotzdem einen
  // sinnvollen Wert statt eines leeren Felds.
  const [guidesNoetig, setGuidesNoetig] = useState('2');

  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [gefragte, setGefragte] = useState<number | null>(null);
  /**
   * Ein wiedergefundener Entwurf wird **angeboten**, nicht eingesetzt.
   *
   * Ungefragt zu füllen wäre übergriffig: Wer ein neues Training anlegt,
   * bekäme die Reste des letzten Versuchs untergeschoben und merkte es
   * womöglich erst nach dem Absenden.
   */
  const [gefunden, setGefunden] = useState<TrainingsEntwurf | null>(null);
  // Bleibt bewusst nur im Arbeitsspeicher dieses Bildschirms, statt den
  // Hinweis über einen Adress-Parameter an die Liste weiterzureichen: Ein
  // per `router.setParams` „gelöschter" Parameter blieb im Test hängen und
  // der Hinweis tauchte nach einem Abstecher zur Einzelansicht und zurück
  // ungewollt wieder auf. Diese Karte hier verschwindet dagegen zuverlässig,
  // sobald der Guide zur Liste weitergeht.
  const [angelegt, setAngelegt] = useState(false);

  useEffect(() => {
    void liesEntwurf().then((entwurf) => {
      if (entwurf && hatInhalt(entwurf) && istFrisch(entwurf, new Date())) setGefunden(entwurf);
      else if (entwurf) void loescheEntwurf();
    });
  }, []);

  // Bei jeder Eingabe sichern. Kein Entprellen: Der Vorgang ist ein
  // Schreibzugriff auf ein paar hundert Byte, und ein verlorener Entwurf
  // wiegt schwerer als ein paar Schreibvorgänge zu viel.
  useEffect(() => {
    const entwurf: TrainingsEntwurf = {
      datum: datum ? datum.toISOString() : null,
      uhrzeit: uhrzeit ? uhrzeit.toISOString() : null,
      ort,
      hinweis,
      plaetze,
      guidesNoetig,
      standAm: Date.now(),
    };
    if (hatInhalt(entwurf)) void schreibEntwurf(entwurf);
  }, [datum, uhrzeit, ort, hinweis, plaetze, guidesNoetig]);

  function entwurfUebernehmen(entwurf: TrainingsEntwurf) {
    setDatum(entwurf.datum ? new Date(entwurf.datum) : null);
    setUhrzeit(entwurf.uhrzeit ? new Date(entwurf.uhrzeit) : null);
    setOrt(entwurf.ort);
    setHinweis(entwurf.hinweis);
    setPlaetze(entwurf.plaetze);
    setGuidesNoetig(entwurf.guidesNoetig);
    setGefunden(null);
  }

  async function anlegen() {
    setFehler(null);

    // Datum und Uhrzeit kommen jetzt aus den nativen Wählern — beide in der
    // Zeitzone des Geräts, was für einen Bielefelder Verein die Bielefelder
    // Ortszeit ist. Das frühere leseZeitpunkt-Parsen entfällt mitsamt der
    // Tippfehler, gegen die es schützte.
    const beginntAm =
      datum && uhrzeit
        ? new Date(datum.getFullYear(), datum.getMonth(), datum.getDate(), uhrzeit.getHours(), uhrzeit.getMinutes())
        : null;
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
      const angelegtes = await legeTrainingAn(api, {
        beginntAm,
        ort: ort.trim(),
        hinweis: hinweis.trim() === '' ? null : hinweis.trim(),
        plaetze: plaetzeWert,
        guidesNoetig: guidesNoetigWert ?? undefined,
      });
      setGefragte(angelegtes.gefragteGuides);
      // Angelegt heißt: Der Entwurf hat seinen Zweck erfüllt.
      await loescheEntwurf();
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
          {/* Die Zahl statt „die Guides": Der Guide will wissen, ob die
              Info wirklich raus ist — „12 Guides" beantwortet das, „die
              Guides" lässt offen, ob es überhaupt welche gibt. */}
          <Banner
            tone="info"
            text={
              gefragte === null
                ? 'Angelegt. Die Guides bekommen jetzt eine Mail.'
                : gefragte === 0
                  ? 'Angelegt. Es ist allerdings kein Guide hinterlegt — es wurde niemand benachrichtigt.'
                  : `Angelegt. ${gefragte} ${gefragte === 1 ? 'Guide bekommt' : 'Guides bekommen'} jetzt eine Mail.`
            }
          />
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
        {/* Das Angebot steht über dem Formular, nicht darin: Wer es
            übersieht, tippt einfach weiter und verliert nichts. */}
        {gefunden ? (
          <Card>
            <Label>Angefangener Entwurf</Label>
            <Text style={[styles.feldLabel, { color: palette.textMuted }]}>
              Von dir ist noch ein unfertiges Training gespeichert
              {gefunden.ort.trim() !== '' ? ` — Ort: ${gefunden.ort.trim()}` : ''}. Übernehmen?
            </Text>
            <View style={styles.entwurfKnoepfe}>
              <ActionButton label="Weitermachen" onPress={() => entwurfUebernehmen(gefunden)} />
              <ActionButton
                label="Verwerfen"
                tone="secondary"
                onPress={() => {
                  void loescheEntwurf();
                  setGefunden(null);
                }}
              />
            </View>
          </Card>
        ) : null}

        <Card>
          <Label>Entwurf</Label>

          <Text style={[styles.feldLabel, { color: palette.textMuted }]}>Datum</Text>
          <DatumsFeld wert={datum} beiAenderung={setDatum} modus="date" />

          <Text style={[styles.feldLabel, { color: palette.textMuted }]}>Uhrzeit</Text>
          <DatumsFeld wert={uhrzeit} beiAenderung={setUhrzeit} modus="time" />

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
  entwurfKnoepfe: { gap: spacing.sm, marginTop: spacing.sm },
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
