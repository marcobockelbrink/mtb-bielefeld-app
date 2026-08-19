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
 *
 * ## Warum `quelle` und nicht `uri`
 *
 * Die API liefert Profilbilder **nur mit Token** aus (`GET /avatar/:id`).
 * Eine nackte Adresse bekommt 401, und `Image` zeigt dann stillschweigend
 * nichts — kein Fehler, kein Platzhalter, nur ein leerer Kreis.
 *
 * Genau das ist passiert: Alle Aufrufstellen reichten
 * `api.bildQuelle(pfad).uri` herein und warfen die Kopfzeilen weg. **Das
 * Profilbild war dadurch nie sichtbar**, seit es die Funktion gibt — bei den
 * Albumbildern fiel es nicht auf, weil `FotoRaster` und `AlbumKarte` das
 * ganze Objekt übergeben (`source={api.bildQuelle(...)}`).
 *
 * Deshalb nimmt diese Komponente jetzt die **vollständige Quelle** entgegen,
 * so wie `bildQuelle` sie liefert. Eine Adresse ohne ihre Kopfzeilen lässt
 * sich damit gar nicht mehr übergeben; der Fehler kann nicht wiederkommen.
 */

import { Image, StyleSheet, Text, View } from 'react-native';

import { font } from '../theme';
import { farbpaarFuer, initialen } from './avatarFarben';

export function Avatar({
  name,
  quelle,
  size = 40,
}: {
  name: string;
  /**
   * Das Ergebnis von `api.bildQuelle(pfad)` — Adresse **samt** Kopfzeilen.
   * `null` ist ein gültiger Dauerzustand, dann stehen die Initialen.
   */
  quelle?: { uri: string; headers?: Record<string, string> } | null;
  size?: number;
}) {
  const paar = farbpaarFuer(name);

  if (quelle) {
    return (
      <Image
        source={quelle}
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
