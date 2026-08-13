/**
 * Ein Datums- oder Uhrzeitfeld mit dem Wähler des Betriebssystems.
 *
 * Bis zum 13.08.2026 waren das Textfelder („TT.MM.JJJJ") — bewusst, um kein
 * Datumspaket ohne Grund einzuführen. Der Grund kam von Marco: Tippen ist
 * auf dem Telefon die fehleranfälligste Eingabe, und der native Wähler
 * kennt Monatsl längen und Schaltjahre von selbst.
 *
 * iOS zeigt den kompakten Wähler direkt im Formular; Android öffnet auf
 * Antippen den System-Dialog — beides das jeweils übliche Verhalten der
 * Plattform, nichts Erfundenes.
 */

import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';

import { font, fontSize, radius, spacing } from '../theme';
import { useTheme } from './theme';

function formatiere(wert: Date | null, modus: 'date' | 'time'): string {
  if (!wert) return modus === 'date' ? 'Datum wählen' : 'Uhrzeit wählen';
  return modus === 'date'
    ? `${String(wert.getDate()).padStart(2, '0')}.${String(wert.getMonth() + 1).padStart(2, '0')}.${wert.getFullYear()}`
    : `${String(wert.getHours()).padStart(2, '0')}:${String(wert.getMinutes()).padStart(2, '0')}`;
}

export function DatumsFeld({
  wert,
  beiAenderung,
  modus,
}: {
  wert: Date | null;
  beiAenderung: (neu: Date) => void;
  modus: 'date' | 'time';
}) {
  const { palette } = useTheme();
  const [offen, setOffen] = useState(false);

  // iOS: immer sichtbar, kompakt, kein zweiter Zustand. Der Wähler IST das Feld.
  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        value={wert ?? new Date()}
        mode={modus}
        display="compact"
        onChange={(_ereignis, datum) => {
          if (datum) beiAenderung(datum);
        }}
        style={styles.ios}
      />
    );
  }

  // Android (und Web als Notbehelf): Antippen öffnet den Dialog.
  return (
    <>
      <Pressable
        onPress={() => setOffen(true)}
        style={[styles.feld, { borderColor: palette.border, backgroundColor: palette.surface }]}
      >
        <Text style={[styles.text, { color: wert ? palette.text : palette.textMuted }]}>
          {formatiere(wert, modus)}
        </Text>
      </Pressable>
      {offen ? (
        <DateTimePicker
          value={wert ?? new Date()}
          mode={modus}
          onChange={(_ereignis, datum) => {
            // Android liefert genau ein Ereignis (OK oder Abbrechen) — der
            // Dialog schließt danach in jedem Fall.
            setOffen(false);
            if (datum) beiAenderung(datum);
          }}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  ios: {
    alignSelf: 'flex-start',
    marginBottom: spacing.md,
  },
  feld: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.md,
  },
  text: {
    fontFamily: font.regular,
    fontSize: fontSize.md,
  },
});
