/**
 * Belegung und Anmeldung eines Termins.
 *
 * Holt ihre Zahlen beim Öffnen — bewusst hier und nicht in der Liste: Die
 * Terminliste kommt ohne Server aus, und das soll sie bleiben. Wer einen
 * Termin öffnet, nimmt eine Abfrage in Kauf; wer blättert, nicht.
 *
 * Ist die API nicht erreichbar, verschwindet diese Karte stillschweigend.
 * Das ist kein verschwiegener Fehler: Der Mail-Knopf darunter bleibt
 * sichtbar und tut, was er immer tat. Eine Fehlermeldung über einen
 * Zusatzdienst hilft niemandem im Wald.
 *
 * **Bekannte Grenze:** Ob man selbst schon angemeldet ist, liefert
 * `GET /termine/:schluessel` nicht mit — die API kennt nur die Gesamtzahl.
 * Die Karte merkt sich einen Anmelde-Erfolg deshalb nur im eigenen
 * Zustand (`istDabei`); ein Neuladen der Ansicht (App neu geöffnet,
 * zurück- und wieder hergeblättert) vergisst das wieder, auch wenn die
 * Anmeldung serverseitig weiter besteht. Das ist keine Verwechslungsgefahr
 * — der „Ich bin dabei"-Knopf meldet in dem Fall nur ein weiteres Mal an,
 * was `schon-angemeldet` beantwortet und im Banner angezeigt wird, keine
 * Doppelbuchung. Behoben wird das erst, wenn die API die eigene Teilnahme
 * mitliefert (nicht Teil dieses Plans).
 */

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { ClubEvent } from '../../domain/types';
import { terminSchluessel } from '../../domain/terminSchluessel';
import { useKonto } from '../../konto/KontoContext';
import { font, fontSize, spacing } from '../../theme';
import { ActionButton, Banner, Card, Label } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { beschreibeTeilnahmeFehler } from './teilnahmeFehler';

interface Belegung {
  belegt: number;
  plaetze: number | null;
  frei: number | null;
  abgesagt: boolean;
}

export function TeilnahmeKarte({ event }: { event: ClubEvent }) {
  const { palette } = useTheme();
  const { angemeldet, api } = useKonto();
  // In der URL kodiert: Der Schlüssel enthält `@` und bei manchen Terminen
  // `_` (aus der `uid` des Kalendereintrags).
  const pfad = `/termine/${encodeURIComponent(terminSchluessel(event))}`;

  const [belegung, setBelegung] = useState<Belegung | null>(null);
  const [erreichbar, setErreichbar] = useState(true);
  const [laeuft, setLaeuft] = useState(false);
  // Text **und** Art: Ein misslungener Versuch darf nicht aussehen wie eine
  // Bestätigung. `Banner` unterscheidet die beiden nur über `tone`, und ohne
  // diese Unterscheidung stünde „Die Tour ist voll." in derselben ruhigen
  // Vereinsfarbe da wie „Du bist dabei." — die Person läse Erfolg, wo keiner
  // war, und liefe am Mittwoch umsonst zum Treffpunkt.
  const [meldung, setMeldung] = useState<{ text: string; fehler: boolean } | null>(null);
  // Siehe Dateikopf: nur ein Zustand im Arbeitsspeicher, keine Auskunft der
  // API — überlebt kein Neuladen der Ansicht.
  const [istDabei, setIstDabei] = useState(false);

  /**
   * Zahlen holen. `darfVerbergen` steuert, was ein Fehlschlag bedeutet.
   *
   * Beim **ersten** Laden heißt „geht nicht" schlicht: Es gibt hier nichts zu
   * zeigen, die Karte bleibt weg. Beim **Nachladen nach einer Anmeldung**
   * darf derselbe Fehlschlag die Karte nicht verschwinden lassen — sonst
   * verschwände mit ihr die gerade gesetzte Bestätigung „Eingetragen. Bis
   * dann!", und die Person stünde vor einem Bildschirm, der so aussieht, als
   * hätte sie nie etwas getan. Die Anmeldung ist zu diesem Zeitpunkt aber
   * längst durch; nur die neue Zahl kam nicht an. Dann lieber die alte Zahl
   * stehen lassen als den ganzen Zustand einziehen.
   */
  const laden = useCallback(
    async (darfVerbergen = true) => {
      try {
        setBelegung(await api.hole<Belegung>(pfad));
        setErreichbar(true);
      } catch {
        if (darfVerbergen) setErreichbar(false);
      }
    },
    [api, pfad],
  );

  useEffect(() => {
    void laden();
  }, [laden]);

  if (!erreichbar || !belegung) return null;

  async function anmelden() {
    setMeldung(null);
    setLaeuft(true);
    try {
      await api.sende(pfad, 'POST');
      setIstDabei(true);
      setMeldung({ text: 'Eingetragen. Bis dann!', fehler: false });
      await laden(false);
    } catch (fehler) {
      setMeldung({ text: beschreibeTeilnahmeFehler(fehler), fehler: true });
    } finally {
      setLaeuft(false);
    }
  }

  async function abmelden() {
    setMeldung(null);
    setLaeuft(true);
    try {
      await api.sende(`${pfad}/ich`, 'DELETE');
      setIstDabei(false);
      setMeldung({ text: 'Du bist wieder ausgetragen.', fehler: false });
      await laden(false);
    } catch (fehler) {
      setMeldung({ text: beschreibeTeilnahmeFehler(fehler), fehler: true });
    } finally {
      setLaeuft(false);
    }
  }

  const platzText =
    belegung.plaetze === null
      ? `${belegung.belegt} angemeldet`
      : `${belegung.belegt} von ${belegung.plaetze} Plätzen belegt`;

  return (
    <Card>
      <Label>Anmeldung</Label>
      <Text style={[styles.zahl, { color: palette.text }]}>{platzText}</Text>

      {!belegung.abgesagt && belegung.plaetze !== null && belegung.frei === 0 ? (
        <Text style={[styles.hinweis, { color: palette.textMuted }]}>
          Die Tour ist voll. Frag den Guide, ob doch noch etwas geht.
        </Text>
      ) : null}

      {meldung ? (
        <View style={styles.banner}>
          <Banner tone={meldung.fehler ? 'danger' : 'info'} text={meldung.text} />
        </View>
      ) : null}

      {belegung.abgesagt ? null : angemeldet ? (
        <View style={styles.knopf}>
          {laeuft ? (
            <ActivityIndicator color={palette.primary} />
          ) : istDabei ? (
            <View style={styles.dabei}>
              <Text style={[styles.hinweis, { color: palette.text }]}>Du bist dabei.</Text>
              <ActionButton label="Doch nicht" tone="secondary" onPress={() => void abmelden()} />
            </View>
          ) : (
            <ActionButton label="Ich bin dabei" onPress={() => void anmelden()} />
          )}
        </View>
      ) : (
        <Text style={[styles.hinweis, { color: palette.textMuted }]}>
          Melde dich unter Einstellungen an, um dich direkt einzutragen.
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  zahl: {
    fontFamily: font.display,
    fontSize: fontSize.xl,
    marginTop: spacing.sm,
  },
  hinweis: {
    fontFamily: font.regular,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  banner: {
    marginTop: spacing.md,
  },
  knopf: {
    marginTop: spacing.lg,
  },
  dabei: {
    gap: spacing.sm,
  },
});
