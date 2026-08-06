/**
 * Jugendtrainings.
 *
 * Bewusst ein eigener Bereich und nicht in der Terminliste: Die kommt ohne
 * Server aus und soll es bleiben. Trainings dagegen stehen in der Datenbank
 * des Vereins — wer ohne Netz unterwegs ist, sieht hier nichts, und das
 * sagt der Bildschirm auch, statt eine leere Liste zu zeigen.
 *
 * Erste Fassung: die Liste. Einzelansicht, Anmeldeformular und die
 * Guide-Ansicht kommen in den folgenden Aufgaben.
 */

import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { holeTrainings, type Training } from '../../src/data/jugend';
import { beschreibeJugendFehler } from '../../src/features/jugend/jugendFehler';
import { useKonto } from '../../src/konto/KontoContext';
import { font, fontSize, spacing } from '../../src/theme';
import { Badge, Banner, Card, EmptyState, Label, LoadingState } from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';

export default function JugendScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { angemeldet, laedt: kontoLaedt, api } = useKonto();

  const [trainings, setTrainings] = useState<Training[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedtNach, setLaedtNach] = useState(false);

  const laden = useCallback(async () => {
    setFehler(null);
    try {
      setTrainings(await holeTrainings(api));
    } catch (ursache) {
      setFehler(beschreibeJugendFehler(ursache));
    }
  }, [api]);

  useEffect(() => {
    if (angemeldet) void laden();
  }, [angemeldet, laden]);

  // Vier Zustände, und alle vier müssen sichtbar sein. „Leer" ist der, den
  // man am leichtesten mit einem Fehler verwechselt.
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
  if (!trainings) return <LoadingState />;

  if (trainings.length === 0) {
    return (
      <EmptyState
        title="Keine Trainings geplant"
        hint="Sobald ein Guide eines anlegt, steht es hier."
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.inhalt, { paddingBottom: insets.bottom + spacing.xxl }]}
      refreshControl={
        <RefreshControl
          refreshing={laedtNach}
          onRefresh={() => {
            setLaedtNach(true);
            void laden().finally(() => setLaedtNach(false));
          }}
          tintColor={palette.primary}
        />
      }
    >
      {trainings.map((training) => (
        <Card key={training.id}>
          <View style={styles.kopf}>
            <Label>{training.zustand === 'entwurf' ? 'Entwurf' : 'Training'}</Label>
            {training.zustand === 'abgesagt' ? <Badge label="Abgesagt" tone="danger" /> : null}
          </View>

          <Text style={[styles.zeit, { color: palette.text }]}>
            {training.beginntAm.toLocaleString('de-DE', {
              timeZone: 'Europe/Berlin',
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              hour: '2-digit',
              minute: '2-digit',
            })}{' '}
            Uhr
          </Text>
          <Text style={[styles.ort, { color: palette.textMuted }]}>{training.ort}</Text>

          {training.zustand === 'abgesagt' && training.absagegrund ? (
            <View style={styles.banner}>
              <Banner tone="danger" text={training.absagegrund} />
            </View>
          ) : (
            <Text style={[styles.ort, { color: palette.textMuted }]}>
              {training.plaetze === null
                ? `${training.belegt} angemeldet`
                : `${training.belegt} von ${training.plaetze} Plätzen belegt`}
            </Text>
          )}
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  inhalt: {
    gap: spacing.md,
    padding: spacing.md,
  },
  kopf: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  zeit: {
    fontFamily: font.display,
    fontSize: fontSize.lg,
    marginTop: spacing.sm,
  },
  ort: {
    fontFamily: font.regular,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  banner: {
    marginTop: spacing.md,
  },
});
