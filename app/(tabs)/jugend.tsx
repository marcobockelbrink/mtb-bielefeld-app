/**
 * Jugendtrainings.
 *
 * Bewusst ein eigener Bereich und nicht in der Terminliste: Die kommt ohne
 * Server aus und soll es bleiben. Trainings dagegen stehen in der Datenbank
 * des Vereins — wer ohne Netz unterwegs ist, sieht hier nichts, und das
 * sagt der Bildschirm auch, statt eine leere Liste zu zeigen.
 *
 * Die Karten verlinken auf die Einzelansicht (`app/jugend/[id].tsx`), in der
 * ein Kind angemeldet wird. Der Knopf „Training anlegen" führt zum
 * Entwurf-Bildschirm (`app/jugend/neu.tsx`) — beide nur sichtbar, wenn
 * `KontoContext.rolle` `'guide'` meldet. Reine Anzeigehilfe (siehe dort):
 * Wer die Adresse trotzdem aufruft, bekommt von der API ein 403.
 */

import { Link, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { holeTrainings, type Training } from '../../src/data/jugend';
import { formatiereTrainingszeit } from '../../src/features/jugend/format';
import { beschreibeJugendFehler } from '../../src/features/jugend/jugendFehler';
import { TrainingKarte } from '../../src/features/jugend/TrainingKarte';
import { useKonto } from '../../src/konto/KontoContext';
import { spacing } from '../../src/theme';
import { ActionButton, EmptyState, LoadingState } from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';

export default function JugendScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { angemeldet, laedt: kontoLaedt, api, rolle } = useKonto();

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

  const istGuide = rolle === 'guide';

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
      <ScrollView contentContainerStyle={[styles.leerInhalt, { paddingBottom: insets.bottom + spacing.xxl }]}>
        <EmptyState
          title="Keine Trainings geplant"
          hint={istGuide ? 'Leg den ersten Entwurf an.' : 'Sobald ein Guide eines anlegt, steht es hier.'}
        />
        {istGuide ? (
          <View style={styles.anlegenKnopf}>
            <ActionButton label="Training anlegen" onPress={() => router.push('/jugend/neu')} />
          </View>
        ) : null}
      </ScrollView>
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
      {istGuide ? <ActionButton label="Training anlegen" onPress={() => router.push('/jugend/neu')} /> : null}

      {trainings.map((training) => (
        // `Link asChild` ersetzt das äußere Element und dessen Stil ginge
        // verloren — deshalb sitzt die Gestaltung auf `TrainingKarte` selbst
        // (über `style`) und nicht auf diesem `Pressable`. Siehe `EventCard`,
        // wo das schon einmal schiefging.
        <Link key={training.id} href={{ pathname: '/jugend/[id]', params: { id: training.id } }} asChild>
          <Pressable accessibilityRole="button" accessibilityLabel={formatiereTrainingszeit(training)}>
            {({ pressed }) => <TrainingKarte training={training} style={{ opacity: pressed ? 0.8 : 1 }} />}
          </Pressable>
        </Link>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  inhalt: {
    gap: spacing.md,
    padding: spacing.md,
  },
  leerInhalt: {
    flexGrow: 1,
    padding: spacing.md,
  },
  anlegenKnopf: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
});
