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
 * - Welches Kind die eigene Anmeldung ist, liefert die API nicht mit
 *   (`kinder[]` zeigt nur, was für alle sichtbar ist). Deshalb merkt sich
 *   diese Komponente die `kindId` aus der Antwort selbst, nur im
 *   Arbeitsspeicher — ein Neuladen der Ansicht vergisst das wieder, genau wie
 *   `istDabei` in `TeilnahmeKarte`.
 */

import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { meldeKindAb, meldeKindAn } from '../../data/jugend';
import { useKonto } from '../../konto/KontoContext';
import { font, fontSize, radius, spacing } from '../../theme';
import { ActionButton, Banner, Card, Label } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { beschreibeJugendFehler } from './jugendFehler';

export function KindAnmelden({
  trainingId,
  onGeaendert,
}: {
  trainingId: string;
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
  // Nur im Arbeitsspeicher — siehe Dateikopf.
  const [angemeldetesKind, setAngemeldetesKind] = useState<string | null>(null);

  async function anmelden() {
    setMeldung(null);
    setLaeuft(true);
    try {
      const { kindId } = await meldeKindAn(api, trainingId, {
        vorname,
        nachname,
        zeigtVorname,
        zeigtNachname,
      });
      setAngemeldetesKind(kindId);
      setMeldung({ text: 'Eingetragen.', fehler: false });
      onGeaendert();
    } catch (ursache) {
      setMeldung({ text: beschreibeJugendFehler(ursache), fehler: true });
    } finally {
      setLaeuft(false);
    }
  }

  async function abmelden() {
    if (!angemeldetesKind) return;
    setMeldung(null);
    setLaeuft(true);
    try {
      await meldeKindAb(api, trainingId, angemeldetesKind);
      setAngemeldetesKind(null);
      // Zurück auf die datensparsame Vorgabe, falls als Nächstes ein zweites
      // Kind angemeldet wird.
      setVorname('');
      setNachname('');
      setZeigtVorname(true);
      setZeigtNachname(false);
      setMeldung({ text: 'Abgemeldet.', fehler: false });
      onGeaendert();
    } catch (ursache) {
      // Die `kindId` bleibt gesetzt, damit „Abmelden" nach einem Fehlschlag
      // noch einmal versucht werden kann statt ins Leere zu laufen.
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

      {angemeldetesKind ? (
        <View style={styles.knopf}>
          {laeuft ? (
            <ActivityIndicator color={palette.primary} />
          ) : (
            <ActionButton label="Abmelden" tone="secondary" onPress={() => void abmelden()} />
          )}
        </View>
      ) : (
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
            {laeuft ? (
              <ActivityIndicator color={palette.primary} />
            ) : (
              <ActionButton label="Anmelden" onPress={() => void anmelden()} />
            )}
          </View>
        </>
      )}
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
