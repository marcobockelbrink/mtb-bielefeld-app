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

/**
 * `wartet` heißt seit dem 15.08.2026 **nur noch**: noch nicht versucht.
 *
 * Vorher war es der Anzeige-Standard für alles Unbekannte — und damit sah
 * ein echter Fehler (413 zu groß, 403, Album geschlossen) genauso aus wie
 * „steht in der Schlange". Wer wartete, wartete auf nichts. Deshalb jetzt
 * `fehlgeschlagen` als eigener Zustand mit Text.
 */
export type UploadZustand =
  | 'laedt'
  | 'wartet'
  | 'wartetAufWlan'
  | 'keinNetz'
  | 'fehlgeschlagen'
  | 'hochgeladen';

const BADGE: Record<UploadZustand, { text: string; farbe: string }> = {
  hochgeladen: { text: 'Hochgeladen', farbe: '#2e7d4f' },
  laedt: { text: 'Lädt …', farbe: '#25749e' },
  wartet: { text: 'Wartet', farbe: '#495b65' },
  wartetAufWlan: { text: 'Wartet auf WLAN', farbe: '#8c5a16' },
  keinNetz: { text: 'Kein Netz', farbe: '#8c5a16' },
  fehlgeschlagen: { text: 'Fehler', farbe: '#a33b2e' },
};

const SPALTEN = 3;

export function UploadFortschritt({
  auftraege,
  zustaende,
  pausiert,
  beimPausieren,
  beimErneutVersuchen,
  fehlertext,
  beimUeberMobilfunk,
  beimEinstellungen,
  beimEntfernen,
}: {
  auftraege: Auftrag[];
  zustaende: Record<string, UploadZustand>;
  pausiert: boolean;
  beimPausieren: () => void;
  beimErneutVersuchen: () => void;
  /** Der Satz zum letzten Fehlschlag — sonst steht dort nur ein Badge. */
  fehlertext: string | null;
  beimUeberMobilfunk: () => void;
  beimEinstellungen: () => void;
  /**
   * Ein einzelnes Bild aus der Schlange nehmen — Befund „C2" vom
   * 15.08.2026. Vorher blieb bei einem falsch gewählten Foto nur, den
   * ganzen Stapel abzubrechen.
   */
  beimEntfernen: (auftrag: Auftrag) => void;
}) {
  const { palette } = useTheme();
  const { width } = useWindowDimensions();

  if (auftraege.length === 0) return null;

  const kante = (width - spacing.lg * 2 - spacing.xs * (SPALTEN - 1)) / SPALTEN;
  const fertig = auftraege.filter((a) => zustaende[a.id] === 'hochgeladen').length;
  const ohneNetz = auftraege.filter((a) => zustaende[a.id] === 'keinNetz').length;
  const aufWlan = auftraege.filter((a) => zustaende[a.id] === 'wartetAufWlan').length;
  const gescheitert = auftraege.filter((a) => zustaende[a.id] === 'fehlgeschlagen').length;
  const offen = auftraege.length - fertig;

  return (
    <View style={styles.bereich}>
      <View style={[styles.karte, { backgroundColor: palette.surface, borderColor: 'rgba(183,194,200,0.65)' }]}>
        <View style={styles.kartenZeile}>
          <Text style={[styles.stand, { color: palette.text }]}>
            {fertig} von {auftraege.length} hochgeladen
          </Text>
          <View style={styles.aktionen}>
            {/* „Erneut versuchen" statt des versteckten Umwegs über
                Pausieren/Fortsetzen, der bisher der einzige Weg war, einen
                liegengebliebenen Stapel wieder anzustoßen. */}
            {offen > 0 && !pausiert ? (
              <Pressable onPress={beimErneutVersuchen} accessibilityLabel="Erneut versuchen">
                <Text style={[styles.pausieren, { color: palette.primary }]}>Erneut versuchen</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={beimPausieren} accessibilityLabel={pausiert ? 'Upload fortsetzen' : 'Upload pausieren'}>
              <Text style={[styles.pausieren, { color: palette.primary }]}>
                {pausiert ? 'Fortsetzen' : 'Pausieren'}
              </Text>
            </Pressable>
          </View>
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
          // Nicht beim laufenden Bild und nicht beim fertigen: Das laufende
          // ist schon halb beim Verein, und was oben liegt, holt kein
          // Wegwischen hier zurück — dafür gibt es das Melden im Album.
          const abwaehlbar = zustand !== 'laedt' && zustand !== 'hochgeladen';
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
              {abwaehlbar ? (
                <Pressable
                  onPress={() => beimEntfernen(auftrag)}
                  accessibilityRole="button"
                  accessibilityLabel="Dieses Bild nicht hochladen"
                  hitSlop={8}
                  style={styles.entfernen}
                >
                  <Text style={styles.entfernenZeichen}>×</Text>
                </Pressable>
              ) : null}
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

      {/* Eine Regel, die Uploads stoppt, muss sagen, dass sie es tut — und
          einen Ausweg bieten. Ohne den ersten Knopf sitzt jemand am Ende
          einer Tour fest und weiß nicht, warum. */}
      {aufWlan > 0 ? (
        <View style={[styles.hinweis, { backgroundColor: palette.surfaceMuted, borderLeftColor: '#8c5a16' }]}>
          <Text style={[styles.hinweisText, { color: palette.text }]}>
            {aufWlan === 1 ? 'Ein Bild wartet' : `${aufWlan} Bilder warten`} auf WLAN — so
            eingestellt, um deinen Datentarif zu schonen. Sie bleiben gemerkt, auch nach einem
            Neustart.
          </Text>
          <View style={styles.hinweisKnoepfe}>
            <Pressable
              onPress={beimUeberMobilfunk}
              style={({ pressed }) => [
                styles.knopf,
                { backgroundColor: pressed ? '#1b587a' : palette.primary },
              ]}
            >
              <Text style={[styles.knopfText, { color: palette.onPrimary }]}>
                Jetzt über Mobilfunk laden
              </Text>
            </Pressable>
            <Pressable
              onPress={beimEinstellungen}
              style={({ pressed }) => [
                styles.knopf,
                styles.knopfUmriss,
                { borderColor: palette.border, backgroundColor: pressed ? palette.surface : 'transparent' },
              ]}
            >
              <Text style={[styles.knopfText, { color: palette.text }]}>Einstellung ändern</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {gescheitert > 0 && fehlertext ? (
        <View style={[styles.hinweis, { backgroundColor: palette.surfaceMuted, borderLeftColor: '#a33b2e' }]}>
          <Text style={[styles.hinweisText, { color: palette.text }]}>{fehlertext}</Text>
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
  entfernen: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    // Eigene dunkle Scheibe statt einer Themenfarbe: Darunter liegt ein
    // beliebiges Foto, und auf hellem Himmel wäre ein helles Kreuz weg.
    backgroundColor: 'rgba(20,26,30,0.72)',
  },
  entfernenZeichen: {
    color: '#fff',
    fontFamily: font.semibold,
    fontSize: 15,
    lineHeight: 17,
  },
  hinweis: {
    borderLeftWidth: 3,
    borderRadius: 3,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  hinweisText: { fontFamily: font.regular, fontSize: 13, lineHeight: 19 },
  hinweisKnoepfe: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  knopf: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  knopfUmriss: { borderWidth: 1 },
  knopfText: { fontFamily: font.semibold, fontSize: fontSize.sm },
  aktionen: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
});
