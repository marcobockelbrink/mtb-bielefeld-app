/**
 * Ein rundes Profilbild — überall dort, wo eine Person steht.
 *
 * **Nie ein leerer grauer Kreis.** Ist ein Foto gesetzt, zeigt es das Foto;
 * sonst die Initialen auf einer Farbe, die aus dem Namen abgeleitet wird.
 * Dieselbe Person bekommt so immer dieselbe Farbe — auch über Geräte und
 * Neustarts hinweg, ohne dass irgendwo etwas gespeichert werden muss.
 *
 * Initialen und Farbwahl stehen in `avatarFarben.ts` — ohne React Native und
 * damit ohne Gerät prüfbar. Hier bleibt nur die Darstellung.
 */

import { Image, StyleSheet, Text, View } from 'react-native';

import { font } from '../theme';
import { farbpaarFuer, initialen } from './avatarFarben';

export function Avatar({
  name,
  uri,
  size = 40,
}: {
  name: string;
  /** `null` ist ein gültiger Dauerzustand — dann stehen die Initialen. */
  uri?: string | null;
  size?: number;
}) {
  const paar = farbpaarFuer(name);

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[styles.kreis, { width: size, height: size, borderRadius: size / 2 }]}
        accessibilityLabel={`Profilbild von ${name}`}
      />
    );
  }

  return (
    <View
      style={[
        styles.kreis,
        styles.mitte,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: paar.grund },
      ]}
      accessibilityLabel={`Profilbild von ${name}`}
    >
      <Text style={[styles.text, { color: paar.schrift, fontSize: Math.round(size * 0.38) }]}>
        {initialen(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kreis: { overflow: 'hidden' },
  mitte: { alignItems: 'center', justifyContent: 'center' },
  text: { fontFamily: font.semibold },
});
