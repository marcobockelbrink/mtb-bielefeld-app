/**
 * Ein bestehendes Training ändern.
 *
 * Aus dem Handoff „12/13" (12b). Gemeldet war: „Trainings sollte man wieder
 * ändern können. Falls man sich verschrieben hat oder die Adresse nicht
 * passt." Der Server konnte das längst (`PATCH /jugendtraining/:id`) — es
 * gab in der App keinen Weg dahin.
 *
 * ## Was diesen Bildschirm vom Anlegen unterscheidet
 *
 * Die Eingaben sind dieselben wie in `app/jugend/neu.tsx` (Chips für Tag,
 * Uhrzeit und Treffpunkt, Zähler für die Zahlen) — eine Form, ein
 * Verhalten. Hinzu kommt genau eine Sache, und die ist der Kern der
 * Aufgabe:
 *
 * **Geänderte Angaben zeigen ihren alten Wert durchgestrichen daneben.**
 * Wer korrigiert, will vor dem Speichern sehen, *was* er korrigiert hat.
 * Ohne das ist ein Bearbeiten-Formular ein Anlege-Formular mit
 * vorbelegten Feldern, und ein versehentlich verstellter Zähler fällt
 * niemandem auf.
 *
 * ## Nur Geändertes geht raus
 *
 * `aendereTraining` schickt ausschließlich die Felder, die wirklich anders
 * sind. Am Server heißt „nicht angegeben" zuverlässig „unverändert"
 * (`COALESCE`/`CASE`); schickte dieser Bildschirm stur alle Felder, würde
 * ein leer gelassenes Hinweisfeld einen Hinweis überschreiben, den niemand
 * angefasst hat.
 */

import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

import {
  aendereTraining,
  holeTraining,
  holeTrainings,
  type Training,
  type TrainingDetails,
} from '../../../src/data/jugend';
import { beschreibeJugendFehler } from '../../../src/features/jugend/jugendFehler';
import {
  alsUhrzeit,
  baueZeitpunkt,
  datumsVorschlaege,
  ortsVorschlaege,
  uhrzeitVorschlaege,
} from '../../../src/features/jugend/vorschlaege';
import { useKonto } from '../../../src/konto/KontoContext';
import { font, fontSize, radius, spacing } from '../../../src/theme';
import { Banner, Card, Chip, Label, LoadingState } from '../../../src/ui/components';
import { DatumsFeld } from '../../../src/ui/DatumsFeld';
import { useTheme } from '../../../src/ui/theme';
import { Zaehler } from '../../../src/ui/Zaehler';

/** Wie die Zeit eines Trainings als Text dasteht — für den alten Wert. */
function alsZeitText(zeitpunkt: Date): string {
  return `${zeitpunkt.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' })}, ${String(zeitpunkt.getHours()).padStart(2, '0')}:${String(zeitpunkt.getMinutes()).padStart(2, '0')}`;
}

export default function TrainingBearbeitenScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { api } = useKonto();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [training, setTraining] = useState<TrainingDetails | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [vergangene, setVergangene] = useState<Training[]>([]);

  const [datum, setDatum] = useState<Date | null>(null);
  const [uhrzeit, setUhrzeit] = useState<Date | null>(null);
  const [ort, setOrt] = useState('');
  const [hinweis, setHinweis] = useState('');
  const [plaetze, setPlaetze] = useState<number | null>(null);

  const [datumOffen, setDatumOffen] = useState(false);
  const [uhrzeitOffen, setUhrzeitOffen] = useState(false);
  const [ortOffen, setOrtOffen] = useState(false);
  const [informieren, setInformieren] = useState(true);

  const jetzt = useMemo(() => new Date(), []);

  const laden = useCallback(async () => {
    if (!id) return;
    try {
      const geholt = await holeTraining(api, id);
      setTraining(geholt);
      setDatum(new Date(geholt.beginntAm));
      setUhrzeit(new Date(geholt.beginntAm));
      setOrt(geholt.ort);
      setHinweis(geholt.hinweis ?? '');
      setPlaetze(geholt.plaetze);
    } catch (ursache) {
      setFehler(beschreibeJugendFehler(ursache));
    }
  }, [api, id]);

  useEffect(() => {
    void laden();
  }, [laden]);

  // Dieselben Vorschläge wie beim Anlegen — wer den Ort korrigiert, will
  // meist einen, den es schon gibt.
  useEffect(() => {
    void holeTrainings(api)
      .then(setVergangene)
      .catch(() => setVergangene([]));
  }, [api]);

  const datumChips = useMemo(() => datumsVorschlaege(jetzt), [jetzt]);
  const zeitChips = useMemo(() => uhrzeitVorschlaege(vergangene), [vergangene]);
  const ortChips = useMemo(() => ortsVorschlaege(vergangene), [vergangene]);

  if (!training) return fehler ? <Banner tone="danger" text={fehler} /> : <LoadingState />;

  const beginntAm = baueZeitpunkt(datum, uhrzeit);
  const alt = {
    beginntAm: new Date(training.beginntAm),
    ort: training.ort,
    hinweis: training.hinweis ?? '',
    plaetze: training.plaetze,
  };

  const zeitGeaendert = beginntAm !== null && beginntAm.getTime() !== alt.beginntAm.getTime();
  const ortGeaendert = ort.trim() !== alt.ort;
  const hinweisGeaendert = hinweis.trim() !== alt.hinweis;
  const plaetzeGeaendert = plaetze !== alt.plaetze;
  const etwasGeaendert = zeitGeaendert || ortGeaendert || hinweisGeaendert || plaetzeGeaendert;

  // Vor dem Senden abfangen, mit einem Satz statt einem gesperrten Feld:
  // Ein Zähler, der bei acht nicht weiter herunterzählt, sagt nicht, warum.
  const zuWenigPlaetze = plaetze !== null && plaetze < training.belegt;
  const bereit = etwasGeaendert && ort.trim() !== '' && beginntAm !== null && !zuWenigPlaetze;

  async function speichern() {
    if (!bereit || !id || !beginntAm) return;
    setFehler(null);
    setLaeuft(true);
    try {
      await aendereTraining(
        api,
        id,
        {
          ...(zeitGeaendert ? { beginntAm } : {}),
          ...(ortGeaendert ? { ort: ort.trim() } : {}),
          ...(hinweisGeaendert ? { hinweis: hinweis.trim() === '' ? null : hinweis.trim() } : {}),
          ...(plaetzeGeaendert ? { plaetze } : {}),
        },
        // Beim Entwurf weiß niemand von dem Termin — dort gibt es das
        // Kästchen gar nicht, und der Server verschickt ohnehin nichts.
        training!.zustand === 'veroeffentlicht' && informieren,
      );
      router.back();
    } catch (ursache) {
      setFehler(beschreibeJugendFehler(ursache));
    } finally {
      setLaeuft(false);
    }
  }

  /** „— geändert" am Label, darunter der alte Wert durchgestrichen. */
  function AlterWert({ geaendert, wert }: { geaendert: boolean; wert: string }) {
    if (!geaendert) return null;
    return (
      <Text style={[styles.alterWert, { color: palette.textMuted }]}>
        vorher: <Text style={styles.durchgestrichen}>{wert}</Text>
      </Text>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Training ändern',
          // **Kein eigenes „Abbrechen" links.** Es stand hier, tat aber
          // nichts anderes als der Zurück-Pfeil, den es verdeckte — und ließ
          // die Kopfzeile einseitig aussehen: links ein Wort, rechts nichts.
          // Auf iOS gehört „Abbrechen" nach oben links, wenn rechts
          // „Sichern" steht; dieser Bildschirm ist aber kein Blatt, das sich
          // über alles legt, sondern einer wie jeder andere. Die eine
          // Formularaktion sitzt unten, wo auch das Kästchen für die Mail
          // steht — beides gehört zusammen.
        }}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.rahmen}>
        <ScrollView contentContainerStyle={styles.inhalt} keyboardShouldPersistTaps="handled">
          <Card>
            <Label>Wann{zeitGeaendert ? ' — geändert' : ''}</Label>
            <AlterWert geaendert={zeitGeaendert} wert={alsZeitText(alt.beginntAm)} />

            <Text style={[styles.feldLabel, { color: palette.textMuted }]}>Tag</Text>
            <View style={styles.chips}>
              {datumChips.map((vorschlag) => (
                <Chip
                  key={vorschlag.schluessel}
                  label={vorschlag.label}
                  selected={
                    datum !== null &&
                    datum.getFullYear() === vorschlag.datum.getFullYear() &&
                    datum.getMonth() === vorschlag.datum.getMonth() &&
                    datum.getDate() === vorschlag.datum.getDate()
                  }
                  onPress={() => {
                    setDatum(vorschlag.datum);
                    setDatumOffen(false);
                  }}
                />
              ))}
              <Chip label="Datum wählen" selected={datumOffen} onPress={() => setDatumOffen((o) => !o)} />
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
                onPress={() => setUhrzeitOffen((o) => !o)}
              />
            </View>
            {uhrzeitOffen ? <DatumsFeld wert={uhrzeit} beiAenderung={setUhrzeit} modus="time" /> : null}
          </Card>

          <Card>
            <Label>Treffpunkt{ortGeaendert ? ' — geändert' : ''}</Label>
            <AlterWert geaendert={ortGeaendert} wert={alt.ort} />
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
                onPress={() => setOrtOffen((o) => !o)}
              />
            </View>
            {ortOffen ? (
              <TextInput
                value={ort}
                onChangeText={setOrt}
                autoFocus
                accessibilityLabel="Treffpunkt"
                style={[styles.feld, { color: palette.text, borderColor: palette.border, backgroundColor: palette.surface }]}
              />
            ) : (
              <Text style={[styles.wert, { color: palette.text }]}>{ort || '—'}</Text>
            )}
            {ort.trim() === '' ? (
              <Text style={[styles.mangel, { color: palette.textMuted }]}>Der Treffpunkt fehlt noch.</Text>
            ) : null}
          </Card>

          <Card>
            <Label>Plätze{plaetzeGeaendert ? ' — geändert' : ''}</Label>
            <AlterWert
              geaendert={plaetzeGeaendert}
              wert={alt.plaetze === null ? 'unbegrenzt' : String(alt.plaetze)}
            />
            <View style={styles.zaehlerZeile}>
              <Zaehler
                wert={plaetze ?? Math.max(training.belegt, 1)}
                beiAenderung={setPlaetze}
                kleinster={1}
                beschriftung="Plätze"
                gesperrt={plaetze === null}
              />
              <Pressable
                onPress={() => setPlaetze((a) => (a === null ? Math.max(training.belegt, 1) : null))}
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
            {zuWenigPlaetze ? (
              <Text style={[styles.mangel, { color: palette.danger }]}>
                {training.belegt === 1
                  ? 'Ein Kind ist schon angemeldet — weniger als ein Platz geht nicht.'
                  : `${training.belegt} Kinder sind schon angemeldet — weniger Plätze gehen nicht.`}
              </Text>
            ) : null}
          </Card>

          <Card>
            <Label>Hinweis{hinweisGeaendert ? ' — geändert' : ''}</Label>
            <AlterWert geaendert={hinweisGeaendert} wert={alt.hinweis || 'kein Hinweis'} />
            <TextInput
              value={hinweis}
              onChangeText={setHinweis}
              multiline
              textAlignVertical="top"
              accessibilityLabel="Hinweis"
              style={[
                styles.feld,
                styles.mehrzeilig,
                { color: palette.text, borderColor: palette.border, backgroundColor: palette.surface },
              ]}
            />
          </Card>

          {fehler ? <Banner tone="danger" text={fehler} /> : null}
        </ScrollView>

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
          {/* Beim Entwurf gibt es das Kästchen nicht: Niemand weiß von dem
              Termin, eine „Änderung"-Mail wäre die erste Nachricht davon. */}
          {training.zustand === 'veroeffentlicht' && training.belegt > 0 ? (
            <Pressable
              onPress={() => setInformieren((a) => !a)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: informieren }}
              accessibilityLabel="Angemeldete Familien informieren"
              hitSlop={6}
              style={styles.schalterZeile}
            >
              <View
                style={[
                  styles.kaestchen,
                  {
                    borderColor: informieren ? palette.primary : palette.border,
                    backgroundColor: informieren ? palette.primary : 'transparent',
                  },
                ]}
              />
              <Text style={[styles.schalterText, { color: palette.text }]}>
                {training.belegt === 1
                  ? 'Die angemeldete Familie per Mail informieren'
                  : `Die ${training.belegt} angemeldeten Familien per Mail informieren`}
              </Text>
            </Pressable>
          ) : null}

          {laeuft ? (
            <ActivityIndicator color={palette.primary} />
          ) : (
            <Pressable
              onPress={() => void speichern()}
              disabled={!bereit}
              accessibilityRole="button"
              accessibilityState={{ disabled: !bereit }}
              accessibilityLabel="Änderungen speichern"
              style={({ pressed }) => [
                styles.hauptknopf,
                {
                  backgroundColor: pressed && bereit ? '#1b587a' : palette.primary,
                  opacity: bereit ? 1 : 0.45,
                },
              ]}
            >
              <Text style={[styles.hauptknopfText, { color: palette.onPrimary }]}>
                {etwasGeaendert ? 'Änderungen speichern' : 'Nichts geändert'}
              </Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  rahmen: { flex: 1 },
  inhalt: { gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.xxl },
  feldLabel: { fontFamily: font.regular, fontSize: fontSize.sm, marginTop: spacing.md },
  alterWert: { fontFamily: font.regular, fontSize: fontSize.xs, marginTop: spacing.xs },
  durchgestrichen: { textDecorationLine: 'line-through' },
  wert: { fontFamily: font.semibold, fontSize: fontSize.md, marginTop: spacing.sm },
  mangel: { fontFamily: font.regular, fontSize: fontSize.xs, lineHeight: 17, marginTop: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
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
  mehrzeilig: { minHeight: 76 },
  zaehlerZeile: { gap: spacing.sm, marginTop: spacing.sm },
  schalterZeile: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 44 },
  kaestchen: { borderRadius: 4, borderWidth: 1.5, height: 20, width: 20 },
  schalterText: { flexShrink: 1, fontFamily: font.regular, fontSize: fontSize.sm },
  fussleiste: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  hauptknopf: { alignItems: 'center', borderRadius: radius.md, justifyContent: 'center', minHeight: 50 },
  hauptknopfText: { fontFamily: font.semibold, fontSize: fontSize.md },
});
