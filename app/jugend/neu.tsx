/**
 * Der Entwurf-Bildschirm für Guides.
 *
 * Der Weg hierher steht nur für Guides in der Liste (`app/(tabs)/jugend.tsx`,
 * Knopf „Training anlegen"). Ruft jemand anderes diese Adresse trotzdem auf,
 * lehnt die API das Anlegen mit 403 ab — `beschreibeJugendFehler` übersetzt
 * das schon in „Das dürfen nur Guides.". Ein zweites Türschloss hier wäre nur
 * eine Kopie derselben Anzeigehilfe, die `KontoContext.rolle` schon ist.
 *
 * ## Seit dem 16.08.2026: antippen statt tippen (Handoff 11, „11c")
 *
 * Gemeldet war „die Eingaben bei Trainings sind so lala", und der Befund
 * traf es: sechs Angaben in fünf optisch **identischen** Feldern, dazwischen
 * ein Systemkasten. Ein Guide legt jede Woche ein Training an, tippt jede
 * Woche denselben Treffpunkt und stellt jede Woche dieselbe Uhrzeit.
 *
 * Jetzt vier verschiedene Eingabearten statt sechs gleicher Felder:
 * Chips für Datum, Uhrzeit und Treffpunkt (aus den letzten Trainings
 * abgelesen, siehe `vorschlaege.ts`), Zähler für die beiden Zahlen, ein
 * Textfeld für den Hinweis. Der Regelfall ist **dreimal Antippen ohne
 * Tastatur**.
 *
 * Die nativen Wähler bleiben als Ausweg für Ausnahmen — die Chips ersetzen
 * sie nicht, sie ersparen sie im Regelfall.
 *
 * Gerechnet wird weiterhin in der Zeitzone des Geräts, was für einen
 * Bielefelder Verein die Bielefelder Ortszeit ist; `baueZeitpunkt` ist
 * dieselbe Rechnung wie vorher, nur ausgelagert und damit prüfbar.
 *
 * ## Prüfung am Feld, nicht im Banner
 *
 * Vorher erschienen Fehler erst **nach** dem Absenden, gesammelt in einem
 * Banner am Formularende — darunter „Datum und Uhrzeit brauchen das Muster
 * TT.MM.JJJJ", ein Satz, der seit den nativen Wählern nicht mehr stimmte.
 * Jetzt bleibt der Knopf gesperrt, solange etwas fehlt, und die betroffene
 * Zeile sagt selbst, was. Das Banner bleibt für Fehler der API (403, kein
 * Netz).
 */

import { Stack, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { holeTrainings, legeTrainingAn, type Training } from '../../src/data/jugend';
import {
  guidesAusEntwurf,
  hatInhalt,
  istFrisch,
  plaetzeAusEntwurf,
  zahlInEntwurf,
  type TrainingsEntwurf,
} from '../../src/features/jugend/entwurf';
import { liesEntwurf, loescheEntwurf, schreibEntwurf } from '../../src/features/jugend/entwurfSpeicher';
import { beschreibeJugendFehler } from '../../src/features/jugend/jugendFehler';
import {
  alsUhrzeit,
  baueZeitpunkt,
  datumsVorschlaege,
  ortsVorschlaege,
  uhrzeitVorschlaege,
} from '../../src/features/jugend/vorschlaege';
import { useKonto } from '../../src/konto/KontoContext';
import { font, fontSize, radius, spacing } from '../../src/theme';
import { ActionButton, Banner, Card, Chip, Label } from '../../src/ui/components';
import { DatumsFeld } from '../../src/ui/DatumsFeld';
import { useTheme } from '../../src/ui/theme';
import { Zaehler } from '../../src/ui/Zaehler';

/** Voreinstellung wie in der API (`COALESCE(…, 2)` in `jugendtraining.ts`). */
const GUIDES_VOREINSTELLUNG = 2;
/** Ein Wert, der bei begrenzten Plätzen als Startpunkt taugt. */
const PLAETZE_VOREINSTELLUNG = 12;

export default function NeuesTrainingScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { api } = useKonto();

  const [datum, setDatum] = useState<Date | null>(null);
  const [uhrzeit, setUhrzeit] = useState<Date | null>(null);
  const [ort, setOrt] = useState('');
  const [hinweis, setHinweis] = useState('');
  // Zahlen sind jetzt Zahlen, keine Zeichenketten mehr — der Zähler kann
  // gar nichts Ungültiges erzeugen. `null` heißt bei den Plätzen
  // „unbegrenzt", genau wie das früher leere Feld.
  const [plaetze, setPlaetze] = useState<number | null>(null);
  const [guidesNoetig, setGuidesNoetig] = useState(GUIDES_VOREINSTELLUNG);

  // Die nativen Wähler und das Ortsfeld sind ausklappbar: Sie stehen für
  // die Ausnahme bereit, ohne im Regelfall Platz zu kosten.
  const [datumOffen, setDatumOffen] = useState(false);
  const [uhrzeitOffen, setUhrzeitOffen] = useState(false);
  const [ortOffen, setOrtOffen] = useState(false);

  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [gefragte, setGefragte] = useState<number | null>(null);
  const [vergangene, setVergangene] = useState<Training[]>([]);
  const [gesichert, setGesichert] = useState(false);

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

  // Die Vorschläge kommen aus der Liste, die die Jugendseite ohnehin holt —
  // kein neuer Endpunkt. Scheitert es, bleiben eben nur „Heute" und
  // „Morgen": Ein Formular, das wegen fehlender Vorschläge nicht aufginge,
  // wäre der schlechtere Tausch.
  useEffect(() => {
    void holeTrainings(api)
      .then(setVergangene)
      .catch(() => setVergangene([]));
  }, [api]);

  const jetzt = useMemo(() => new Date(), []);
  const datumChips = useMemo(() => datumsVorschlaege(vergangene, jetzt), [vergangene, jetzt]);
  const zeitChips = useMemo(() => uhrzeitVorschlaege(vergangene), [vergangene]);
  const ortChips = useMemo(() => ortsVorschlaege(vergangene), [vergangene]);

  // Bei jeder Eingabe sichern. Kein Entprellen: Der Vorgang ist ein
  // Schreibzugriff auf ein paar hundert Byte, und ein verlorener Entwurf
  // wiegt schwerer als ein paar Schreibvorgänge zu viel.
  useEffect(() => {
    const entwurf: TrainingsEntwurf = {
      datum: datum ? datum.toISOString() : null,
      uhrzeit: uhrzeit ? uhrzeit.toISOString() : null,
      ort,
      hinweis,
      // Das Entwurfsformat hält beide Zahlen als Zeichenkette — siehe
      // `entwurf.ts`, wo die Übersetzung samt Begründung steht.
      plaetze: zahlInEntwurf(plaetze),
      guidesNoetig: zahlInEntwurf(guidesNoetig),
      standAm: Date.now(),
    };
    if (hatInhalt(entwurf)) {
      void schreibEntwurf(entwurf);
      setGesichert(true);
    }
  }, [datum, uhrzeit, ort, hinweis, plaetze, guidesNoetig]);

  function entwurfUebernehmen(entwurf: TrainingsEntwurf) {
    setDatum(entwurf.datum ? new Date(entwurf.datum) : null);
    setUhrzeit(entwurf.uhrzeit ? new Date(entwurf.uhrzeit) : null);
    setOrt(entwurf.ort);
    setHinweis(entwurf.hinweis);
    setPlaetze(plaetzeAusEntwurf(entwurf.plaetze));
    setGuidesNoetig(guidesAusEntwurf(entwurf.guidesNoetig, GUIDES_VOREINSTELLUNG));
    // Ein übernommener Ort, der nicht unter den Chips steht, muss sichtbar
    // sein — sonst sähe das Formular leer aus und wäre es nicht.
    if (entwurf.ort.trim() !== '') setOrtOffen(true);
    setGefunden(null);
  }

  const beginntAm = baueZeitpunkt(datum, uhrzeit);
  const vollstaendig = beginntAm !== null && ort.trim() !== '';

  async function anlegen() {
    if (!beginntAm) return;
    setFehler(null);
    setLaeuft(true);
    try {
      const angelegtes = await legeTrainingAn(api, {
        beginntAm,
        ort: ort.trim(),
        hinweis: hinweis.trim() === '' ? null : hinweis.trim(),
        plaetze,
        guidesNoetig,
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.rahmen}
      >
        <ScrollView
          contentContainerStyle={styles.inhalt}
          keyboardShouldPersistTaps="handled"
        >
          {/* Das Angebot steht über dem Formular, nicht darin: Wer es
              übersieht, tippt einfach weiter und verliert nichts. */}
          {gefunden ? (
            <Card>
              <Label>Angefangener Entwurf</Label>
              <Text style={[styles.hinweisText, { color: palette.textMuted }]}>
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
            <Label>Wann</Label>

            <Text style={[styles.feldLabel, { color: palette.textMuted }]}>Tag</Text>
            <View style={styles.chips}>
              {datumChips.map((vorschlag) => (
                <Chip
                  key={vorschlag.schluessel}
                  label={vorschlag.label}
                  selected={datum !== null && istSelberTag(datum, vorschlag.datum)}
                  onPress={() => {
                    setDatum(vorschlag.datum);
                    setDatumOffen(false);
                  }}
                />
              ))}
              <Chip
                label="Datum wählen"
                selected={datumOffen}
                onPress={() => setDatumOffen((offen) => !offen)}
              />
            </View>
            {datumOffen ? <DatumsFeld wert={datum} beiAenderung={setDatum} modus="date" /> : null}

            <Text style={[styles.feldLabel, { color: palette.textMuted }]}>Uhrzeit</Text>
            <View style={styles.chips}>
              {zeitChips.map((vorschlag) => (
                <Chip
                  key={vorschlag.schluessel}
                  label={vorschlag.label}
                  selected={
                    uhrzeit !== null &&
                    uhrzeit.getHours() === vorschlag.stunde &&
                    uhrzeit.getMinutes() === vorschlag.minute
                  }
                  onPress={() => {
                    setUhrzeit(alsUhrzeit(vorschlag.stunde, vorschlag.minute, jetzt));
                    setUhrzeitOffen(false);
                  }}
                />
              ))}
              <Chip
                label={zeitChips.length > 0 ? 'Andere' : 'Uhrzeit wählen'}
                selected={uhrzeitOffen}
                onPress={() => setUhrzeitOffen((offen) => !offen)}
              />
            </View>
            {uhrzeitOffen ? <DatumsFeld wert={uhrzeit} beiAenderung={setUhrzeit} modus="time" /> : null}

            {/* Prüfung am Feld: Der Satz steht dort, wo die Lücke ist —
                nicht in einem Banner am Formularende. */}
            {!beginntAm ? (
              <Text style={[styles.mangel, { color: palette.textMuted }]}>
                {datum === null && uhrzeit === null
                  ? 'Tag und Uhrzeit fehlen noch.'
                  : datum === null
                    ? 'Der Tag fehlt noch.'
                    : 'Die Uhrzeit fehlt noch.'}
              </Text>
            ) : null}
          </Card>

          <Card>
            <Label>Treffpunkt</Label>
            <View style={styles.chips}>
              {ortChips.map((vorschlag) => (
                <Chip
                  key={vorschlag}
                  label={vorschlag}
                  selected={ort.trim() === vorschlag}
                  onPress={() => {
                    setOrt(vorschlag);
                    setOrtOffen(false);
                  }}
                />
              ))}
              <Chip
                label={ortChips.length > 0 ? 'Anderer Ort …' : 'Ort eingeben'}
                selected={ortOffen}
                onPress={() => setOrtOffen((offen) => !offen)}
              />
            </View>
            {ortOffen ? (
              <TextInput
                value={ort}
                onChangeText={setOrt}
                autoFocus
                style={[
                  styles.feld,
                  { color: palette.text, borderColor: palette.border, backgroundColor: palette.surface },
                ]}
              />
            ) : null}
            {ort.trim() === '' ? (
              <Text style={[styles.mangel, { color: palette.textMuted }]}>
                Der Treffpunkt fehlt noch.
              </Text>
            ) : null}
          </Card>

          <Card>
            <Label>Umfang</Label>
            <View style={styles.zaehlerReihe}>
              <View style={styles.zaehlerSpalte}>
                <Text style={[styles.feldLabel, { color: palette.textMuted }]}>Plätze</Text>
                <Zaehler
                  wert={plaetze ?? PLAETZE_VOREINSTELLUNG}
                  beiAenderung={setPlaetze}
                  kleinster={1}
                  beschriftung="Plätze"
                  gesperrt={plaetze === null}
                />
                {/* „unbegrenzt" als eigener Schalter statt als leeres Feld:
                    Ein Zähler kann nicht leer sein, und `null` ist in der
                    API etwas anderes als 0. */}
                <Pressable
                  onPress={() => setPlaetze((alt) => (alt === null ? PLAETZE_VOREINSTELLUNG : null))}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: plaetze === null }}
                  accessibilityLabel="Unbegrenzt viele Plätze"
                  hitSlop={6}
                  style={styles.schalterZeile}
                >
                  <View
                    style={[
                      styles.kaestchen,
                      {
                        borderColor: plaetze === null ? palette.primary : palette.border,
                        backgroundColor: plaetze === null ? palette.primary : 'transparent',
                      },
                    ]}
                  />
                  <Text style={[styles.schalterText, { color: palette.text }]}>unbegrenzt</Text>
                </Pressable>
              </View>

              <View style={styles.zaehlerSpalte}>
                <Text style={[styles.feldLabel, { color: palette.textMuted }]}>Guides nötig</Text>
                <Zaehler
                  wert={guidesNoetig}
                  beiAenderung={setGuidesNoetig}
                  kleinster={1}
                  beschriftung="Benötigte Guides"
                />
                {/* Der Befund war nicht die Zahl, sondern dass niemand
                    weiß, was aus ihr folgt. Die Zahl der *gefragten*
                    Guides steht bewusst nicht hier: Sie ist der App vor dem
                    Anlegen nicht bekannt, und eine geratene wäre schlechter
                    als keine. Sie kommt in der Bestätigung. */}
                <Text style={[styles.folge, { color: palette.textMuted }]}>
                  So viele müssen zusagen, damit es stattfindet.
                </Text>
              </View>
            </View>
          </Card>

          <Card>
            <Label>Hinweis (optional)</Label>
            <TextInput
              value={hinweis}
              onChangeText={setHinweis}
              multiline
              // Ohne das steht der Text auf Android in der senkrechten
              // Mitte des Felds und sieht aus wie ein einzeiliges Feld,
              // das falsch gepolstert ist.
              textAlignVertical="top"
              style={[
                styles.feld,
                styles.mehrzeilig,
                { color: palette.text, borderColor: palette.border, backgroundColor: palette.surface },
              ]}
            />
          </Card>

          {fehler ? <Banner tone="danger" text={fehler} /> : null}
        </ScrollView>

        {/* Feste Fußleiste: Der Knopf war vorher das Letzte im Scrollinhalt
            und damit das Erste, was hinter der Tastatur verschwand. */}
        <View
          style={[
            styles.fussleiste,
            {
              backgroundColor: palette.surface,
              borderTopColor: palette.border,
              paddingBottom: insets.bottom + spacing.sm,
            },
          ]}
        >
          <View style={styles.fusszeile}>
            <Text style={[styles.zusammenfassung, { color: palette.text }]} numberOfLines={1}>
              {zusammenfassung(beginntAm, ort)}
            </Text>
            {gesichert ? (
              <Text style={[styles.gesichert, { color: palette.textMuted }]}>Entwurf gesichert</Text>
            ) : null}
          </View>
          {laeuft ? (
            <ActivityIndicator color={palette.primary} />
          ) : (
            <Pressable
              onPress={() => void anlegen()}
              disabled={!vollstaendig}
              accessibilityRole="button"
              accessibilityState={{ disabled: !vollstaendig }}
              accessibilityLabel="Training anlegen"
              style={({ pressed }) => [
                styles.hauptknopf,
                {
                  backgroundColor: pressed && vollstaendig ? '#1b587a' : palette.primary,
                  opacity: vollstaendig ? 1 : 0.45,
                },
              ]}
            >
              <Text style={[styles.hauptknopfText, { color: palette.onPrimary }]}>Training anlegen</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

/** Ob zwei Zeitpunkte auf denselben Kalendertag fallen (Gerätezeit). */
function istSelberTag(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/**
 * Die Zeile in der Fußleiste: „Do 20.8. · 17:30 · Kalkofen".
 *
 * Zeigt nur, was schon dasteht — sie ist eine Rückmeldung, keine Vorschau.
 * Ist noch nichts gewählt, steht dort, was als Nächstes fehlt.
 */
function zusammenfassung(beginntAm: Date | null, ort: string): string {
  const teile: string[] = [];
  if (beginntAm) {
    teile.push(beginntAm.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' }));
    teile.push(
      `${String(beginntAm.getHours()).padStart(2, '0')}:${String(beginntAm.getMinutes()).padStart(2, '0')}`,
    );
  }
  if (ort.trim() !== '') teile.push(ort.trim());

  return teile.length > 0 ? teile.join(' · ') : 'Tag, Uhrzeit und Treffpunkt wählen';
}

const styles = StyleSheet.create({
  rahmen: { flex: 1 },
  inhalt: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  bestaetigung: {
    padding: spacing.lg,
  },
  feldLabel: {
    fontFamily: font.regular,
    fontSize: fontSize.sm,
    marginTop: spacing.md,
  },
  hinweisText: {
    fontFamily: font.regular,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  mangel: {
    fontFamily: font.regular,
    fontSize: fontSize.xs,
    marginTop: spacing.sm,
  },
  folge: {
    fontFamily: font.regular,
    fontSize: fontSize.xs,
    lineHeight: 17,
    marginTop: spacing.xs,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  entwurfKnoepfe: { gap: spacing.sm, marginTop: spacing.sm },
  feld: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    fontFamily: font.regular,
    fontSize: fontSize.md,
    marginTop: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  // Als Fläche für mehrere Zeilen erkennbar — mit `minHeight: 44` sah das
  // Hinweisfeld aus wie eine einzeilige Eingabe.
  mehrzeilig: { minHeight: 76 },
  zaehlerReihe: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  zaehlerSpalte: { flexGrow: 1, flexShrink: 1, minWidth: 150 },
  schalterZeile: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    minHeight: 44,
  },
  kaestchen: {
    borderRadius: 4,
    borderWidth: 1.5,
    height: 20,
    width: 20,
  },
  schalterText: {
    fontFamily: font.regular,
    fontSize: fontSize.sm,
  },
  fussleiste: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  fusszeile: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  zusammenfassung: {
    flexShrink: 1,
    fontFamily: font.semibold,
    fontSize: fontSize.sm,
  },
  gesichert: {
    fontFamily: font.regular,
    fontSize: 11,
  },
  hauptknopf: {
    alignItems: 'center',
    borderRadius: radius.md,
    justifyContent: 'center',
    // 50 pt für die Hauptaktion, wie im Handoff festgelegt.
    minHeight: 50,
  },
  hauptknopfText: {
    fontFamily: font.semibold,
    fontSize: fontSize.md,
  },
  knopf: {
    marginTop: spacing.lg,
  },
});
