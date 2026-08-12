/**
 * Ein neues Album — für Guides und die Verwaltung.
 *
 * Dieselbe Haltung wie beim Trainings-Entwurf (`app/jugend/neu.tsx`): Der
 * Weg hierher steht nur den Berechtigten in der Übersicht; wer die Adresse
 * trotzdem aufruft, bekommt von der API ein 403. Datum als Textfeld, aus
 * demselben Grund wie dort.
 *
 * Die Sichtbarkeit ist ein Schalter mit zwei Werten, kein Freitext: Ob
 * freigegebene Bilder alle Mitglieder sehen oder nur die Jugend, ist eine
 * Vereinsentscheidung — die App bietet beide an und nimmt nichts vorweg.
 */

import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { legeAlbumAn, type Sichtbarkeit } from '../../src/data/fotos';
import { leseZeitpunkt } from '../../src/features/jugend/eingabe';
import { beschreibeJugendFehler } from '../../src/features/jugend/jugendFehler';
import { useKonto } from '../../src/konto/KontoContext';
import { font, fontSize, radius, spacing } from '../../src/theme';
import { ActionButton, Banner, Card, Label } from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';

export default function NeuesAlbumScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { api } = useKonto();

  const [titel, setTitel] = useState('');
  const [datum, setDatum] = useState('');
  const [beschreibung, setBeschreibung] = useState('');
  const [sichtbarkeit, setSichtbarkeit] = useState<Sichtbarkeit>('mitglieder');
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  async function anlegen() {
    const ereignisAm = leseZeitpunkt(datum, '12:00');
    if (titel.trim() === '' || !ereignisAm) {
      setFehler('Titel und Datum (TT.MM.JJJJ) werden gebraucht.');
      return;
    }

    setFehler(null);
    setLaeuft(true);
    try {
      const album = await legeAlbumAn(api, {
        titel: titel.trim(),
        beschreibung: beschreibung.trim() || null,
        ereignisAm,
        sichtbarkeit,
      });
      router.replace(`/fotos/${album.id}`);
    } catch (ursache) {
      setFehler(beschreibeJugendFehler(ursache));
      setLaeuft(false);
    }
  }

  const feldStil = {
    borderColor: palette.border,
    color: palette.text,
    backgroundColor: palette.surface,
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Neues Album' }} />
      <ScrollView contentContainerStyle={[styles.inhalt, { paddingBottom: insets.bottom + spacing.xxl }]}>
        {fehler ? <Banner text={fehler} tone="warning" /> : null}

        <Card>
          <Label>Titel</Label>
          <TextInput
            style={[styles.feld, feldStil]}
            value={titel}
            onChangeText={setTitel}
            placeholder="Sommertour 2026"
            placeholderTextColor={palette.textMuted}
          />

          <Label>Datum des Ereignisses</Label>
          <TextInput
            style={[styles.feld, feldStil]}
            value={datum}
            onChangeText={setDatum}
            placeholder="12.07.2026"
            placeholderTextColor={palette.textMuted}
            keyboardType="numbers-and-punctuation"
          />

          <Label>Beschreibung (optional)</Label>
          <TextInput
            style={[styles.feld, feldStil]}
            value={beschreibung}
            onChangeText={setBeschreibung}
            placeholder="Drei Tage Harz, zwölf Leute"
            placeholderTextColor={palette.textMuted}
          />

          <Label>Wer sieht freigegebene Bilder?</Label>
          <View style={styles.schalter}>
            {(
              [
                ['mitglieder', 'Alle Mitglieder'],
                ['jugend', 'Nur Jugend'],
              ] as const
            ).map(([wert, beschriftung]) => (
              <Pressable
                key={wert}
                onPress={() => setSichtbarkeit(wert)}
                style={[
                  styles.option,
                  { borderColor: palette.border },
                  sichtbarkeit === wert && { backgroundColor: palette.primary, borderColor: palette.primary },
                ]}
              >
                <Text
                  style={[
                    styles.optionstext,
                    { color: sichtbarkeit === wert ? '#fff' : palette.text },
                  ]}
                >
                  {beschriftung}
                </Text>
              </Pressable>
            ))}
          </View>
        </Card>

        {laeuft ? <ActivityIndicator /> : <ActionButton label="Album anlegen" onPress={() => void anlegen()} />}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  inhalt: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  feld: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.md,
    fontFamily: font.regular,
    fontSize: fontSize.md,
  },
  schalter: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  option: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  optionstext: {
    fontFamily: font.semibold,
    fontSize: fontSize.sm,
  },
});
