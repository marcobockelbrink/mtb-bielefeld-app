/**
 * Der sichtbare Teil der Upload-Warteschlange — Design „4c" aus dem Review
 * vom 14.08.2026.
 *
 * Bisher war die Warteschlange unsichtbar: Während des Uploads drehte ein
 * Spinner, und wer im Wald stand, wusste nicht, ob drei von fünf durch sind
 * oder gar nichts. Jetzt zeigt eine Fortschrittskarte den Stand, jede
 * wartende Kachel ihren Zustand, und ein Banner erklärt, dass Bilder ohne
 * Netz gemerkt bleiben — auch über einen Neustart.
 *
 * Die Zustände liefert der Bildschirm aus der bestehenden Warteschlange
 * (`warteschlange.ts`); hier ist nur Anzeige.
 */

import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { font, fontSize, spacing } from '../../theme';
import { useTheme } from '../../ui/theme';
import type { Auftrag } from './warteschlange';

export type UploadZustand = 'laedt' | 'wartet' | 'keinNetz' | 'hochgeladen';

const BADGE: Record<UploadZustand, { text: string; farbe: string }> = {
  hochgeladen: { text: 'Hochgeladen', farbe: '#2e7d4f' },
  laedt: { text: 'Lädt …', farbe: '#25749e' },
  wartet: { text: 'Wartet', farbe: '#495b65' },
  keinNetz: { text: 'Kein Netz', farbe: '#8c5a16' },
};

const SPALTEN = 3;

export function UploadFortschritt({
  auftraege,
  zustaende,
  pausiert,
  beimPausieren,
}: {
  auftraege: Auftrag[];
  zustaende: Record<string, UploadZustand>;
  pausiert: boolean;
  beimPausieren: () => void;
}) {
  const { palette } = useTheme();
  const { width } = useWindowDimensions();

  if (auftraege.length === 0) return null;

  const kante = (width - spacing.lg * 2 - spacing.xs * (SPALTEN - 1)) / SPALTEN;
  const fertig = auftraege.filter((a) => zustaende[a.id] === 'hochgeladen').length;
  const ohneNetz = auftraege.filter((a) => zustaende[a.id] === 'keinNetz').length;

  return (
    <View style={styles.bereich}>
      <View style={[styles.karte, { backgroundColor: palette.surface, borderColor: 'rgba(183,194,200,0.65)' }]}>
        <View style={styles.kartenZeile}>
          <Text style={[styles.stand, { color: palette.text }]}>
            {fertig} von {auftraege.length} hochgeladen
          </Text>
          <Pressable onPress={beimPausieren} accessibilityLabel={pausiert ? 'Upload fortsetzen' : 'Upload pausieren'}>
            <Text style={[styles.pausieren, { color: palette.primary }]}>
              {pausiert ? 'Fortsetzen' : 'Pausieren'}
            </Text>
          </Pressable>
        </View>
        <View style={[styles.balkenSpur, { backgroundColor: palette.surfaceMuted }]}>
          <View
            style={[
              styles.balken,
              { backgroundColor: palette.primary, width: `${Math.round((fertig / auftraege.length) * 100)}%` },
            ]}
          />
        </View>
      </View>

      <View style={styles.raster}>
        {auftraege.map((auftrag) => {
          const zustand = zustaende[auftrag.id] ?? 'wartet';
          const badge = BADGE[zustand];
          const gedimmt = zustand === 'wartet' || zustand === 'keinNetz';
          return (
            <View
              key={auftrag.id}
              style={[
                styles.zelle,
                { width: kante, height: kante },
                zustand === 'laedt' && { borderWidth: 2, borderColor: palette.primary },
                gedimmt && { opacity: 0.55 },
              ]}
            >
              <Image source={{ uri: auftrag.uri }} style={styles.bild} resizeMode="cover" />
              <View style={[styles.badge, { backgroundColor: badge.farbe }]}>
                <Text style={styles.badgeText}>{badge.text}</Text>
              </View>
            </View>
          );
        })}
      </View>

      {ohneNetz > 0 ? (
        <View style={[styles.hinweis, { backgroundColor: palette.surfaceMuted, borderLeftColor: '#8c5a16' }]}>
          <Text style={[styles.hinweisText, { color: palette.text }]}>
            {ohneNetz === 1 ? 'Ein Bild wartet' : `${ohneNetz} Bilder warten`} auf Netz — sie bleiben
            gemerkt, auch nach einem Neustart.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bereich: { gap: spacing.sm },
  karte: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: spacing.sm,
  },
  kartenZeile: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stand: { fontFamily: font.semibold, fontSize: fontSize.sm },
  pausieren: {
    fontFamily: font.label,
    fontSize: 11,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  balkenSpur: { height: 4, borderRadius: 2, overflow: 'hidden' },
  balken: { height: 4, borderRadius: 2 },
  raster: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  zelle: { borderRadius: 6, overflow: 'hidden' },
  bild: { width: '100%', height: '100%' },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    color: '#fff',
    fontFamily: font.label,
    fontSize: 9,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  hinweis: {
    borderLeftWidth: 3,
    borderRadius: 3,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  hinweisText: { fontFamily: font.regular, fontSize: 13, lineHeight: 19 },
});
