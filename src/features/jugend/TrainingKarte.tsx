/**
 * Eine Karte in der Liste der Jugendtrainings.
 *
 * Eigene Komponente statt Rechnung in der Liste: Der Bildschirm ordnet nur
 * noch an, die Karte entscheidet, was ein einzelnes Training zeigt.
 *
 * Ein abgesagtes Training verschwindet **nicht** aus der Liste — wer es
 * gestern gesehen hat, hielte das Verschwinden für einen Fehler der App und
 * führe trotzdem hin. Der Grund steht stattdessen in einem `Banner`.
 */

import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import type { Training } from '../../data/jugend';
import { font, fontSize, spacing } from '../../theme';
import { Badge, Banner, Card, Label } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { formatiereTrainingszeit } from './format';

/**
 * `style` reicht bis zu `Card` durch — allein dafür da, dass die Liste beim
 * Antippen eine Druckrückmeldung zeigen kann (`opacity`), ohne dass die Karte
 * ihre eigene Gestaltung dafür aufgeben muss.
 */
export function TrainingKarte({ training, style }: { training: Training; style?: ViewStyle }) {
  const { palette } = useTheme();
  const abgesagt = training.zustand === 'abgesagt';

  return (
    <Card style={style}>
      <View style={styles.kopf}>
        <Label>{training.zustand === 'entwurf' ? 'Entwurf' : 'Training'}</Label>
        {abgesagt ? <Badge label="Abgesagt" tone="danger" /> : null}
      </View>

      <Text style={[styles.zeit, { color: palette.text }]}>{formatiereTrainingszeit(training)}</Text>
      <Text style={[styles.ort, { color: palette.textMuted }]}>{training.ort}</Text>

      {abgesagt && training.absagegrund ? (
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
  );
}

const styles = StyleSheet.create({
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
