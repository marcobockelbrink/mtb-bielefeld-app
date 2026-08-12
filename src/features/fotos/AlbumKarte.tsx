/**
 * Eine Karte in der Albumübersicht.
 *
 * Das Titelbild lädt als Vorschau-Fassung — die 400er reicht für eine Karte
 * vollauf, und 120 Alben mit Vollbildern wären genau die Liste, die nie lädt.
 */

import { Image, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import type { ApiZugang } from '../../data/api';
import { fotoPfad, type Album } from '../../data/fotos';
import { font, fontSize, spacing } from '../../theme';
import { Badge, Card, Label } from '../../ui/components';
import { useTheme } from '../../ui/theme';

const MONATE = ['Jan.', 'Feb.', 'März', 'April', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];

export function formatiereEreignisdatum(datum: Date): string {
  return `${datum.getDate()}. ${MONATE[datum.getMonth()]} ${datum.getFullYear()}`;
}

export function AlbumKarte({
  album,
  api,
  style,
}: {
  album: Album;
  api: ApiZugang;
  style?: ViewStyle;
}) {
  const { palette } = useTheme();

  return (
    <Card style={style}>
      {album.titelbildId ? (
        <Image
          source={api.bildQuelle(fotoPfad(album.titelbildId, 'vorschau'))}
          style={styles.titelbild}
          resizeMode="cover"
          accessibilityLabel={`Titelbild des Albums ${album.titel}`}
        />
      ) : null}

      <View style={styles.kopf}>
        <Label>{formatiereEreignisdatum(album.ereignisAm)}</Label>
        {album.sichtbarkeit === 'jugend' ? <Badge label="Jugend" tone="accent" /> : null}
        {album.zustand === 'geschlossen' ? <Badge label="Geschlossen" tone="neutral" /> : null}
      </View>

      <Text style={[styles.titel, { color: palette.text }]}>{album.titel}</Text>
      {album.beschreibung ? (
        <Text style={[styles.beschreibung, { color: palette.textMuted }]} numberOfLines={2}>
          {album.beschreibung}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  titelbild: {
    width: '100%',
    height: 140,
    borderRadius: 8,
    marginBottom: spacing.sm,
  },
  kopf: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  titel: {
    fontFamily: font.semibold,
    fontSize: fontSize.lg,
    marginTop: spacing.xs,
  },
  beschreibung: {
    fontFamily: font.regular,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
});
