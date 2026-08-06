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

import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { holeTraining, type TrainingDetails } from '../../src/data/jugend';
import { formatiereTrainingszeit } from '../../src/features/jugend/format';
import { GuideKarte } from '../../src/features/jugend/GuideKarte';
import { beschreibeJugendFehler } from '../../src/features/jugend/jugendFehler';
import { KindAnmelden } from '../../src/features/jugend/KindAnmelden';
import { useKonto } from '../../src/konto/KontoContext';
import { font, fontSize, spacing } from '../../src/theme';
import { Banner, Card, DetailRow, EmptyState, Label, LoadingState } from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';

export default function TrainingDetailScreen() {
  const { palette } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { angemeldet, laedt: kontoLaedt, api, rolle } = useKonto();

  const [training, setTraining] = useState<TrainingDetails | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

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

  useEffect(() => {
    if (angemeldet) void laden();
  }, [angemeldet, laden]);

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

  return (
    <ScrollView contentContainerStyle={styles.inhalt}>
      {abgesagt ? (
        <Banner tone="danger" text={training.absagegrund ?? 'Dieses Training wurde abgesagt.'} />
      ) : null}

      <View style={styles.kopf}>
        <Text style={[styles.zeit, { color: palette.primary }]}>{formatiereTrainingszeit(training)}</Text>
        <Text style={[styles.ort, { color: palette.text }]}>{training.ort}</Text>
      </View>

      <Card>
        <Label>Training</Label>
        {training.hinweis ? <DetailRow label="Hinweis" value={training.hinweis} /> : null}
        <DetailRow label="Belegung" value={platzText} />
        <DetailRow
          label={training.guideZusagen === 1 ? 'Guide' : 'Guides'}
          value={`${training.guideZusagen} zugesagt`}
        />
      </Card>

      {/*
        Reine Anzeigehilfe (`KontoContext.rolle`, siehe dort): Die API prüft
        bei jedem Aufruf innerhalb von `GuideKarte` selbst, ob wirklich ein
        Guide antwortet. Diese Prüfung hier blendet den Abschnitt nur ein,
        sie ersetzt keine.
      */}
      {rolle === 'guide' ? <GuideKarte training={training} onGeaendert={() => void laden(false)} /> : null}

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
      {abgesagt ? null : <KindAnmelden trainingId={training.id} onGeaendert={() => void laden(false)} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  inhalt: {
    gap: spacing.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xxl * 2,
  },
  kopf: {
    gap: spacing.xs,
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
