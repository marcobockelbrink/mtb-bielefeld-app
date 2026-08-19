/**
 * Die Detailansicht eines Jugendtrainings.
 *
 * Zeit, Ort, Hinweis, Belegung und die Teilnehmerliste — plus das Formular,
 * mit dem ein Elternteil ein Kind anmeldet (`KindAnmelden`). Die
 * Teilnehmerliste zeigt `kinder[].anzeige` unverändert: Die API hat schon
 * entschieden, was für diese Person sichtbar ist (voller Name für Guides,
 * sonst nach Freigabe der Eltern) — hier wird nichts nachgerechnet oder
 * gefiltert, sonst gäbe es zwei Wahrheiten über dieselbe Anmeldung.
 */

import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { TEILEN_BASIS_URL } from '../../../src/config';
import { holeTraining, type TrainingDetails } from '../../../src/data/jugend';
import { formatiereTrainingszeit } from '../../../src/features/jugend/format';
import { GuideKarte } from '../../../src/features/jugend/GuideKarte';
import { beschreibeAenderung } from '../../../src/features/jugend/geaendert';
import { beschreibeJugendFehler } from '../../../src/features/jugend/jugendFehler';
import { KindAnmelden } from '../../../src/features/jugend/KindAnmelden';
import { baueTeilenText } from '../../../src/features/jugend/teilen';
import { useKonto } from '../../../src/konto/KontoContext';
import { font, fontSize, spacing } from '../../../src/theme';
import { ActionButton, Banner, Card, DetailRow, EmptyState, Label, LoadingState } from '../../../src/ui/components';
import { useTheme } from '../../../src/ui/theme';

export default function TrainingDetailScreen() {
  const { palette } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { angemeldet, laedt: kontoLaedt, api, rolle } = useKonto();

  const [training, setTraining] = useState<TrainingDetails | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [teilenFehler, setTeilenFehler] = useState<string | null>(null);

  /**
   * `darfVerbergen` unterscheidet den ersten Aufruf vom Nachladen nach einer
   * An- oder Abmeldung — nach dem Muster von `TeilnahmeKarte.laden`. Ein
   * Fehlschlag beim Nachladen darf die gerade gesetzte Bestätigung in
   * `KindAnmelden` nicht mitreißen: Bliebe hier der alte Trainingsstand
   * stehen statt der Fehleransicht, sieht die Person weiterhin ihre Karte
   * samt „Eingetragen." — nur die neue Teilnehmerzahl kommt eben erst beim
   * nächsten Versuch an.
   */
  const laden = useCallback(
    async (darfVerbergen = true) => {
      try {
        setTraining(await holeTraining(api, id));
        setFehler(null);
      } catch (ursache) {
        if (darfVerbergen) setFehler(beschreibeJugendFehler(ursache));
      }
    },
    [api, id],
  );

  // `useFocusEffect` statt `useEffect`: Der Bildschirm bleibt eingehängt,
  // wenn man zurückblättert und wieder herkommt. Ein reines `useEffect`
  // zeigte dann den Stand von vorhin — etwa eine Belegung, die sich
  // inzwischen geändert hat.
  useFocusEffect(
    useCallback(() => {
        if (angemeldet) void laden();
    }, [angemeldet, laden]),
  );

  // Dieselben vier Zustände wie in der Liste (`app/(tabs)/jugend.tsx`).
  if (kontoLaedt) return <LoadingState />;

  if (!angemeldet) {
    return (
      <EmptyState
        title="Melde dich an"
        hint="Jugendtrainings sehen nur angemeldete Mitglieder. Das geht über das Zahnrad oben rechts."
      />
    );
  }

  if (fehler) return <EmptyState title="Nicht erreichbar" hint={fehler} />;
  if (!training) return <LoadingState />;

  const abgesagt = training.zustand === 'abgesagt';
  const platzText =
    training.plaetze === null
      ? `${training.belegt} angemeldet`
      : `${training.belegt} von ${training.plaetze} Plätzen belegt`;

  /**
   * Öffnet das System-Teilen, aus dem der Guide WhatsApp wählt.
   *
   * `baueTeilenText` wirft bei allem außer einem veröffentlichten Training —
   * der Knopf unten erscheint deshalb nur dann. Der `catch` bleibt trotzdem
   * nötig: Ein Guide kann das Training absagen, während dieser Bildschirm
   * offen ist, und in der Sekunde zwischen Antippen und Auswertung liegt ein
   * Wettlauf, den keine Anzeigebedingung ausschließen kann. `Share.share`
   * selbst kann auf dem Gerät ebenfalls scheitern — beides darf nicht
   * spurlos verpuffen.
   */
  async function teilen() {
    // Erneute, engere Prüfung als die schon bestandene `if (!training)`
    // weiter oben: TypeScript engt eine geschlossene Funktion nicht anhand
    // einer Prüfung aus ihrem umgebenden Gültigkeitsbereich ein — das gilt
    // erst innerhalb der Funktion selbst.
    if (!training) return;
    setTeilenFehler(null);
    try {
      const text = baueTeilenText(training, TEILEN_BASIS_URL);
      await Share.share({ message: text });
    } catch (ursache) {
      console.warn('Teilen ist fehlgeschlagen:', ursache);
      setTeilenFehler('Teilen hat nicht geklappt. Versuch es noch einmal.');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.inhalt}>
      {abgesagt ? (
        <Banner tone="danger" text={training.absagegrund ?? 'Dieses Training wurde abgesagt.'} />
      ) : null}

      <View style={styles.kopf}>
        <Text style={[styles.zeit, { color: palette.primary }]}>{formatiereTrainingszeit(training)}</Text>
        {/* Wortgleich zum Termin (app/termin/[id].tsx): Apple Maps auf iOS,
            geo: auf Android, Browser als Rückweg. Der Ort ist Freitext —
            als Suche taugt er trotzdem, genau wie bei den Terminen. */}
        <Pressable
          onPress={() => {
            const suche = encodeURIComponent(training.ort);
            const url = Platform.OS === 'ios' ? `http://maps.apple.com/?q=${suche}` : `geo:0,0?q=${suche}`;
            void Linking.canOpenURL(url).then((kann) =>
              Linking.openURL(kann ? url : `https://www.google.com/maps/search/?api=1&query=${suche}`),
            );
          }}
          accessibilityLabel="Treffpunkt in der Karten-App öffnen"
        >
          <Text style={[styles.ort, { color: palette.primary }]}>📍 {training.ort}</Text>
        </Pressable>
      </View>

      {/*
        Nur veröffentlicht und nur für Guides: Eine Einladung zu einem
        Entwurf oder zu etwas Abgesagtem wäre schlimmer als keine — siehe
        `baueTeilenText` in `src/features/jugend/teilen.ts`. `rolle` ist wie
        bei `GuideKarte` reine Anzeigehilfe; die API prüft bei jedem eigenen
        Aufruf selbst, hier gibt es aber ohnehin keinen Aufruf, der geprüft
        werden müsste — nur ein Text und das System-Teilen.
      */}
      {(rolle === 'guide' || rolle === 'verwaltung') && training.zustand === 'veroeffentlicht' ? (
        <View style={styles.teilen}>
          <ActionButton label="Für die WhatsApp-Gruppe teilen" tone="secondary" onPress={() => void teilen()} />
          {teilenFehler ? <Banner tone="danger" text={teilenFehler} /> : null}
        </View>
      ) : null}

      {/* „Training bearbeiten" stand bis Handoff 14 hier — jetzt im Block
          „Als Organisator" in `GuideKarte`, zusammen mit Veröffentlichen und
          Absagen. Es ist eine Handlung am ganzen Training, keine an der
          eigenen Zusage, und die beiden Ebenen sahen vorher gleich aus. */}

      <Card>
        <Label>Training</Label>
        {training.hinweis ? <DetailRow label="Hinweis" value={training.hinweis} /> : null}
        <DetailRow label="Belegung" value={platzText} />
        <DetailRow
          label={training.guideZusagen === 1 ? 'Guide' : 'Guides'}
          value={`${training.guideZusagen} zugesagt`}
        />

        {/* „Zuletzt geändert" — damit eine Änderung auch bemerkt, wer die
            Mail übersieht. Vorher stand der neue Stand einfach da, als wäre
            er immer so gewesen. Steht ganz unten und leise: Es ist eine
            Fußnote, keine Angabe zum Training. */}
        {beschreibeAenderung(training.geaendertAm, training.geaendertVon, new Date()) ? (
          <Text style={[styles.geaendert, { color: palette.textMuted }]}>
            {beschreibeAenderung(training.geaendertAm, training.geaendertVon, new Date())}
          </Text>
        ) : null}
      </Card>

      {/*
        Reine Anzeigehilfe (`KontoContext.rolle`, siehe dort): Die API prüft
        bei jedem Aufruf innerhalb von `GuideKarte` selbst, ob wirklich ein
        Guide antwortet. Diese Prüfung hier blendet den Abschnitt nur ein,
        sie ersetzt keine.
      */}
      {/* Auch für die Verwaltung — sie erbt die Guide-Rechte. Ohne diese
          Karte konnte sie Trainings zwar anlegen, aber nie veröffentlichen:
          Der Entwurf blieb stehen und nahm keine Kind-Anmeldungen an. */}
      {rolle === 'guide' || rolle === 'verwaltung' ? <GuideKarte training={training} onGeaendert={() => void laden(false)} /> : null}

      <Card>
        <Label>Angemeldete Kinder</Label>
        {training.kinder.length === 0 ? (
          <Text style={[styles.leer, { color: palette.textMuted }]}>Noch niemand angemeldet.</Text>
        ) : (
          training.kinder.map((kind) => (
            <Text key={kind.id} style={[styles.kind, { color: palette.text }]}>
              {kind.anzeige}
            </Text>
          ))
        )}
      </Card>

      {/*
        Ein abgesagtes Training nimmt keine neuen Anmeldungen mehr an — der
        Banner oben sagt schon, warum. Ein Formular danach würde einen
        Vorgang anbieten, den es nicht mehr gibt.
      */}
      {/*
        Die Karte trägt jetzt beides: die Abmelden-Knöpfe für die eigenen
        Kinder und, solange noch ein Platz frei ist, das Formular. Sie
        entscheidet das selbst (`darfNochAnmelden`) — auch für den Entwurf,
        auf den `POST …/kinder` mit 409 antwortet. Hier bleibt nur die
        Absage stehen, denn dann gibt es auch nichts mehr abzumelden.
      */}
      {abgesagt ? null : <KindAnmelden training={training} onGeaendert={() => void laden(false)} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  geaendert: {
    fontFamily: font.regular,
    fontSize: fontSize.xs,
    lineHeight: 17,
    marginTop: spacing.md,
  },
  inhalt: {
    gap: spacing.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xxl * 2,
  },
  kopf: {
    gap: spacing.xs,
  },
  teilen: {
    gap: spacing.sm,
  },
  zeit: {
    fontFamily: font.display,
    fontSize: fontSize.xl,
  },
  ort: {
    fontFamily: font.regular,
    fontSize: fontSize.md,
  },
  leer: {
    fontFamily: font.regular,
    fontSize: fontSize.md,
    marginTop: spacing.sm,
  },
  kind: {
    fontFamily: font.regular,
    fontSize: fontSize.md,
    lineHeight: 22,
    marginTop: spacing.sm,
  },
});
