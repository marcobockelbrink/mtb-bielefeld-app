/**
 * Das Bildraster eines Albums — drei Spalten, nach Tagen gruppiert.
 *
 * Es lädt ausschließlich Vorschau-Fassungen (400 px). Die Anzeige-Fassung
 * holt erst die Einzelansicht; 120 Vollbilder in einem Raster wären der
 * Unterschied zwischen „geht auf" und „lädt".
 *
 * Der Auswahlmodus gehört der Sichtung: Die Verwaltung wählt viele Bilder
 * und entscheidet über den Stapel — bei 120 Fotos vom Vereinsfest
 * entscheidet genau das, ob das Feature benutzt wird oder verstaubt.
 */

import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import type { ApiZugang } from '../../data/api';
import { fotoPfad, type Foto } from '../../data/fotos';
import { font, fontSize, spacing } from '../../theme';
import { useTheme } from '../../ui/theme';
import { brauchtUeberschriften, gruppiereNachTagen } from './gruppierung';

const SPALTEN = 3;

export function FotoRaster({
  fotos,
  api,
  ausgewaehlt,
  beimTippen,
  beimLangenDruck,
}: {
  fotos: Foto[];
  api: ApiZugang;
  /** Kennungen der ausgewählten Bilder — leer heißt: kein Auswahlmodus. */
  ausgewaehlt?: Set<string>;
  beimTippen: (foto: Foto) => void;
  beimLangenDruck?: (foto: Foto) => void;
}) {
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const kante = (width - spacing.lg * 2 - spacing.xs * (SPALTEN - 1)) / SPALTEN;

  const gruppen = gruppiereNachTagen(fotos);
  const mitUeberschriften = brauchtUeberschriften(gruppen);

  return (
    <View>
      {gruppen.map((gruppe) => (
        <View key={gruppe.ueberschrift}>
          {mitUeberschriften ? (
            <Text style={[styles.tag, { color: palette.textMuted }]}>{gruppe.ueberschrift}</Text>
          ) : null}
          <View style={styles.raster}>
            {gruppe.fotos.map((foto) => {
              const markiert = ausgewaehlt?.has(foto.id) ?? false;
              return (
                <Pressable
                  key={foto.id}
                  onPress={() => beimTippen(foto)}
                  onLongPress={beimLangenDruck ? () => beimLangenDruck(foto) : undefined}
                  accessibilityLabel={
                    foto.zustand === 'neu' ? 'Foto, wartet auf Freigabe' : 'Foto'
                  }
                  style={[
                    styles.zelle,
                    { width: kante, height: kante },
                    markiert && { borderColor: palette.accent, borderWidth: 3 },
                  ]}
                >
                  <Image
                    source={api.bildQuelle(fotoPfad(foto.id, 'vorschau'))}
                    style={styles.bild}
                    resizeMode="cover"
                  />
                  {/* Der Hochladende sieht seine eigenen Bilder sofort — die
                      Ecke sagt ihm, dass sie noch niemand sonst sieht. */}
                  {foto.zustand === 'neu' ? (
                    <View style={[styles.ecke, { backgroundColor: palette.accent }]}>
                      <Text style={styles.eckentext}>neu</Text>
                    </View>
                  ) : null}
                  {foto.fuerHomepage ? (
                    <View style={[styles.ecke, styles.eckeUnten, { backgroundColor: palette.success }]}>
                      <Text style={styles.eckentext}>web</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    fontFamily: font.semibold,
    fontSize: fontSize.sm,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  raster: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  zelle: {
    borderRadius: 6,
    overflow: 'hidden',
  },
  bild: {
    width: '100%',
    height: '100%',
  },
  ecke: {
    position: 'absolute',
    top: 4,
    right: 4,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  eckeUnten: {
    top: undefined,
    bottom: 4,
  },
  eckentext: {
    color: '#fff',
    fontFamily: font.semibold,
    fontSize: 10,
  },
});
