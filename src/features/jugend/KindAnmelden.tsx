/**
 * Ein Kind zu einem Jugendtraining anmelden.
 *
 * Der heikelste Teil des Jugendbereichs: Hier entscheiden Eltern, was andere
 * Vereinsmitglieder über ihr Kind erfahren. Deshalb der zweite Schalter mit
 * eigenem Erklärsatz statt eines stillen Standardwerts, und deshalb die
 * datensparsame Vorgabe — Vorname an, Nachname aus.
 *
 * Baugleich mit `TeilnahmeKarte` in zwei Punkten, die dort schon einmal
 * schiefgingen:
 *
 * - Erfolg und Fehlschlag laufen beide über `Banner`, aber nie mit derselben
 *   `tone` — sonst stünde „Dieses Training ist voll." in derselben ruhigen
 *   Vereinsfarbe da wie „Eingetragen.".
 * - Erfolg und Fehlschlag laufen beide über `Banner`, aber nie mit derselben
 *   `tone`.
 *
 * **Der Zustand kommt aus der API, nicht aus dem Arbeitsspeicher.** Das war
 * einmal anders: Die Komponente merkte sich die `kindId` aus der Antwort
 * selbst. Wer den Bildschirm verließ, konnte sein Kind danach nie wieder
 * abmelden — `DELETE …/kinder/:kindId` braucht genau diese Kennung. Seit
 * `kinder[].eigene` (siehe `src/data/jugend.ts`) steht nach einem Neustart
 * dasselbe da wie vorher, und beide Plätze sind erreichbar statt nur einer.
 */

import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import type { TrainingDetails } from '../../data/jugend';
import { meldeKindAb, meldeKindAn } from '../../data/jugend';
import { useKonto } from '../../konto/KontoContext';
import { font, fontSize, radius, spacing } from '../../theme';
import { ActionButton, Banner, Card, Label } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { darfNochAnmelden, eigeneKinder } from './eigeneKinder';
import { beschreibeJugendFehler } from './jugendFehler';

export function KindAnmelden({
  training,
  onGeaendert,
}: {
  training: TrainingDetails;
  /**
   * Ruft der Elternbildschirm nach einer geglückten An- oder Abmeldung auf,
   * damit Belegung und Teilnehmerliste dort neu geladen werden. Schlägt
   * dieses Nachladen fehl, darf es die Bestätigung hier nicht mitreißen —
   * dafür ist es Sache des Elternbildschirms, das Nachladen wie
   * `TeilnahmeKarte.laden(false)` fehlertolerant zu halten, nicht diese
   * Komponente.
   */
  onGeaendert: () => void;
}) {
  const { palette } = useTheme();
  const { api } = useKonto();

  const [vorname, setVorname] = useState('');
  const [nachname, setNachname] = useState('');
  // Datensparsam als Standard: Vorname sichtbar, Nachname nicht. Wer mehr
  // zeigen will, tippt einmal.
  const [zeigtVorname, setZeigtVorname] = useState(true);
  const [zeigtNachname, setZeigtNachname] = useState(false);

  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ text: string; fehler: boolean } | null>(null);

  const trainingId = training.id;
  const meine = eigeneKinder(training);

  async function anmelden() {
    setMeldung(null);
    setLaeuft(true);
    try {
      await meldeKindAn(api, trainingId, { vorname, nachname, zeigtVorname, zeigtNachname });
      // Zurück auf die datensparsame Vorgabe. Das Formular bleibt stehen,
      // solange noch ein Platz frei ist — ein Elternteil mit zwei Kindern
      // tippt sonst zweimal denselben Weg über die Liste zurück.
      setVorname('');
      setNachname('');
      setZeigtVorname(true);
      setZeigtNachname(false);
      setMeldung({ text: 'Eingetragen.', fehler: false });
      onGeaendert();
    } catch (ursache) {
      setMeldung({ text: beschreibeJugendFehler(ursache), fehler: true });
    } finally {
      setLaeuft(false);
    }
  }

  async function abmelden(kindId: string) {
    setMeldung(null);
    setLaeuft(true);
    try {
      await meldeKindAb(api, trainingId, kindId);
      setMeldung({ text: 'Abgemeldet.', fehler: false });
      onGeaendert();
    } catch (ursache) {
      // Kein Zurücksetzen: Die Liste kommt beim nächsten Laden aus der API,
      // und ein Fehlschlag darf sie nicht so aussehen lassen, als wäre er
      // geglückt.
      setMeldung({ text: beschreibeJugendFehler(ursache), fehler: true });
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Card>
      <Label>Kind anmelden</Label>

      {meldung ? (
        <View style={styles.banner}>
          <Banner tone={meldung.fehler ? 'danger' : 'info'} text={meldung.text} />
        </View>
      ) : null}

      {/*
        Je eigenem Kind eine Zeile mit eigenem Knopf. Der Name steht dabei,
        weil bei zwei Kindern sonst niemand wüsste, welches der beiden er
        gerade austrägt — und weil „Abmelden" allein schon einmal das falsche
        versprochen hat.
      */}
      {meine.map((kind) => (
        <View key={kind.id} style={styles.knopf}>
          <ActionButton
            label={`${kind.anzeige} abmelden`}
            tone="secondary"
            onPress={() => void abmelden(kind.id)}
          />
        </View>
      ))}

      {laeuft ? (
        <View style={styles.knopf}>
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : null}

      {darfNochAnmelden(training) && !laeuft ? (
        <>
          <TextInput
            value={vorname}
            onChangeText={setVorname}
            placeholder="Vorname"
            placeholderTextColor={palette.textMuted}
            style={[
              styles.feld,
              { color: palette.text, borderColor: palette.border, backgroundColor: palette.surface },
            ]}
          />
          <TextInput
            value={nachname}
            onChangeText={setNachname}
            placeholder="Nachname"
            placeholderTextColor={palette.textMuted}
            style={[
              styles.feld,
              { color: palette.text, borderColor: palette.border, backgroundColor: palette.surface },
            ]}
          />

          <View style={styles.schalterZeile}>
            <Text style={[styles.schalterText, { color: palette.text }]}>Vorname zeigen</Text>
            <Switch
              value={zeigtVorname}
              onValueChange={setZeigtVorname}
              trackColor={{ false: palette.surfaceMuted, true: palette.primary }}
              thumbColor={palette.surface}
            />
          </View>
          <View style={styles.schalterZeile}>
            <Text style={[styles.schalterText, { color: palette.text }]}>Nachname zeigen</Text>
            <Switch
              value={zeigtNachname}
              onValueChange={setZeigtNachname}
              trackColor={{ false: palette.surfaceMuted, true: palette.primary }}
              thumbColor={palette.surface}
            />
          </View>

          {/*
            Das ist keine Zierzeile, sondern die Einwilligung in Kurzform —
            wörtlich aus der Aufgabenbeschreibung, damit sie nicht
            unbeabsichtigt umformuliert wird.
          */}
          <Text style={[styles.hinweis, { color: palette.textMuted }]}>
            Andere Mitglieder sehen nur, was du hier freigibst. Die Guides sehen immer den vollen
            Namen — sie haben die Aufsicht und müssen wissen, wer dabei ist.
          </Text>

          <View style={styles.knopf}>
            <ActionButton label="Anmelden" onPress={() => void anmelden()} />
          </View>
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginTop: spacing.md,
  },
  feld: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    fontFamily: font.regular,
    fontSize: fontSize.md,
    marginTop: spacing.md,
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  schalterZeile: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  schalterText: {
    fontFamily: font.regular,
    fontSize: fontSize.md,
  },
  hinweis: {
    fontFamily: font.regular,
    fontSize: fontSize.xs,
    lineHeight: 17,
    marginTop: spacing.md,
  },
  knopf: {
    marginTop: spacing.lg,
  },
});
