/**
 * Ein Album: das Raster, der Upload, die Sichtung.
 *
 * Drei Rollen, ein Bildschirm:
 *
 * - **Mitglieder** sehen Freigegebenes und die eigenen Uploads, laden hoch,
 *   melden Bilder.
 * - **Die Verwaltung** sichtet: langer Druck startet die Auswahl, dann
 *   Freigeben/Ablehnen/Löschen über den Stapel — bei 120 Bildern vom
 *   Vereinsfest entscheidet das, ob das Feature benutzt wird.
 * - **Der Hochladende** sieht seine Bilder sofort mit der Ecke „neu" — sonst
 *   lädt er sie ein zweites Mal hoch.
 *
 * ## Der Einwilligungssatz
 *
 * Vor jedem Upload-Stapel, kein vorangekreuztes Kästchen — dieselbe Haltung
 * wie bei der Tourenanmeldung (`api/src/app.ts`). Er deckt **zwei** Dinge:
 * selbst aufgenommen, und die Abgebildeten sind einverstanden. Das erste ist
 * kein Formalismus — bei Rennen fotografieren bezahlte Fotografen, und deren
 * Bilder kursieren in jeder WhatsApp-Gruppe. Auf der Vereinsseite wären sie
 * Ärger anderer Art als ein Persönlichkeitsrecht, aber Ärger.
 *
 * ## Was vom Plan abweicht
 *
 * Die Warteschlange für Uploads ohne Netz (Aufgabe 5, Schritt 2) fehlt noch:
 * Scheitert ein Bild, bleibt es im Stapel und der Knopf sagt „N übrig —
 * weiter versuchen". Das überlebt keinen App-Neustart. Für den Wald reicht
 * es fürs Erste; die persistente Schlange steht als offener Punkt im Plan.
 */

import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  bereiteVor,
  entscheide,
  holeAlbum,
  ladeHoch,
  loescheFoto,
  melde,
  setzeFuerHomepage,
  type AlbumMitFotos,
  type Foto,
} from '../../src/data/fotos';
import { formatiereEreignisdatum } from '../../src/features/fotos/AlbumKarte';
import { FotoRaster } from '../../src/features/fotos/FotoRaster';
import { beschreibeJugendFehler } from '../../src/features/jugend/jugendFehler';
import { useKonto } from '../../src/konto/KontoContext';
import { font, fontSize, spacing } from '../../src/theme';
import { ActionButton, Banner, EmptyState, Label, LoadingState } from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';

export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { angemeldet, api, rolle } = useKonto();

  const [album, setAlbum] = useState<AlbumMitFotos | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedtNach, setLaedtNach] = useState(false);

  /** Upload-Stapel: was noch hoch muss. Leer heißt: kein Upload im Gang. */
  const [stapel, setStapel] = useState<string[]>([]);
  const [laeuftHoch, setLaeuftHoch] = useState(false);
  const [uebersprungen, setUebersprungen] = useState(0);

  /** Sichtung: leere Menge heißt kein Auswahlmodus. */
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [sichtungLaeuft, setSichtungLaeuft] = useState(false);

  const istVerwaltung = rolle === 'verwaltung';

  const laden = useCallback(async () => {
    if (!id) return;
    setFehler(null);
    try {
      setAlbum(await holeAlbum(api, id));
    } catch (ursache) {
      setFehler(beschreibeJugendFehler(ursache));
    }
  }, [api, id]);

  useFocusEffect(
    useCallback(() => {
      if (angemeldet) void laden();
    }, [angemeldet, laden]),
  );

  /** Arbeitet den Stapel ab; was scheitert, bleibt für „weiter versuchen". */
  async function stapelHochladen(uris: string[]) {
    setLaeuftHoch(true);
    setFehler(null);
    let doppelte = 0;
    const gescheitert: string[] = [];

    for (const uri of uris) {
      try {
        const vorbereitet = await bereiteVor(uri);
        const ergebnis = await ladeHoch(api, id!, vorbereitet.uri);
        if ('doppelt' in ergebnis) doppelte += 1;
      } catch {
        gescheitert.push(uri);
      }
    }

    setStapel(gescheitert);
    setUebersprungen(doppelte);
    setLaeuftHoch(false);
    if (gescheitert.length > 0) {
      setFehler(
        `${gescheitert.length} ${gescheitert.length === 1 ? 'Bild ist' : 'Bilder sind'} nicht angekommen — kein Netz? „Weiter versuchen" schickt nur die fehlenden.`,
      );
    }
    await laden();
  }

  async function auswaehlenUndHochladen() {
    const auswahl = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: true,
      quality: 1,
    });
    if (auswahl.canceled || auswahl.assets.length === 0) return;
    const uris = auswahl.assets.map((bild) => bild.uri);

    // Der Satz vor dem ersten Byte — und „Abbrechen" ist die erste Option.
    Alert.alert(
      'Kurz bestätigen',
      'Ich habe die Bilder selbst aufgenommen, und die abgebildeten Personen sind mit der Verwendung im Verein einverstanden. Die Vereinsverwaltung sieht sie zuerst; sichtbar für andere werden sie erst nach Freigabe.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Einverstanden, hochladen', onPress: () => void stapelHochladen(uris) },
      ],
    );
  }

  function beimTippen(foto: Foto) {
    if (auswahl.size > 0) {
      // Im Auswahlmodus schaltet Tippen die Markierung um.
      setAuswahl((alt) => {
        const neu = new Set(alt);
        if (neu.has(foto.id)) neu.delete(foto.id);
        else neu.add(foto.id);
        return neu;
      });
      return;
    }

    // Außerhalb der Auswahl: Melden für Mitglieder, nichts für die
    // Verwaltung (die arbeitet über die Auswahl). Eine eigene Vollbild-
    // Ansicht ist ein späterer Schritt — das Raster zeigt die 400er,
    // und fürs Sichten am Telefon reicht sie aus.
    if (!istVerwaltung) {
      Alert.alert('Bild melden?', 'Die Vereinsverwaltung sieht sich das Bild dann an.', [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Melden',
          style: 'destructive',
          onPress: () => {
            void melde(api, foto.id, 'Über die App gemeldet.').then(
              () => Alert.alert('Gemeldet', 'Danke — die Verwaltung schaut drauf.'),
              (ursache: unknown) => setFehler(beschreibeJugendFehler(ursache)),
            );
          },
        },
      ]);
    }
  }

  /** Stapel-Aktion der Sichtung: über alle Markierten, Fehler gesammelt. */
  async function sichte(aktion: (fotoId: string) => Promise<unknown>) {
    setSichtungLaeuft(true);
    let daneben = 0;
    for (const fotoId of auswahl) {
      try {
        await aktion(fotoId);
      } catch {
        daneben += 1;
      }
    }
    setSichtungLaeuft(false);
    setAuswahl(new Set());
    if (daneben > 0) setFehler(`${daneben} von ${auswahl.size} haben nicht geklappt.`);
    await laden();
  }

  const neueImAlbum = album?.fotos.filter((f) => f.zustand === 'neu').length ?? 0;

  return (
    <>
      <Stack.Screen options={{ title: album?.titel ?? 'Album' }} />
      <ScrollView
        contentContainerStyle={[styles.inhalt, { paddingBottom: insets.bottom + spacing.xxl }]}
        refreshControl={
          <RefreshControl
            refreshing={laedtNach}
            onRefresh={() => {
              setLaedtNach(true);
              void laden().finally(() => setLaedtNach(false));
            }}
          />
        }
      >
        {fehler ? <Banner text={fehler} tone="warning" /> : null}
        {uebersprungen > 0 ? (
          <Banner text={`${uebersprungen} ${uebersprungen === 1 ? 'Bild war' : 'Bilder waren'} schon da und ${uebersprungen === 1 ? 'wurde' : 'wurden'} übersprungen.`} tone="info" />
        ) : null}

        {!angemeldet ? (
          <EmptyState title="Nur für Mitglieder" hint="Melde dich in den Einstellungen an." />
        ) : null}

        {angemeldet && album === null && !fehler ? <LoadingState /> : null}

        {album ? (
          <>
            <View>
              <Label>{formatiereEreignisdatum(album.ereignisAm)}</Label>
              {album.beschreibung ? (
                <Text style={[styles.beschreibung, { color: palette.textMuted }]}>{album.beschreibung}</Text>
              ) : null}
            </View>

            {istVerwaltung && neueImAlbum > 0 && auswahl.size === 0 ? (
              <Banner
                text={`${neueImAlbum} ${neueImAlbum === 1 ? 'Bild wartet' : 'Bilder warten'} auf Sichtung — langer Druck auf ein Bild startet die Auswahl.`}
                tone="info"
              />
            ) : null}

            {album.fotos.length === 0 ? (
              <EmptyState title="Noch keine Bilder" hint="Leg los — der Knopf unten nimmt auch mehrere auf einmal." />
            ) : (
              <FotoRaster
                fotos={album.fotos}
                api={api}
                ausgewaehlt={auswahl}
                beimTippen={beimTippen}
                beimLangenDruck={
                  istVerwaltung
                    ? (foto) => setAuswahl(new Set([foto.id]))
                    : undefined
                }
              />
            )}

            {auswahl.size > 0 ? (
              <View style={styles.sichtung}>
                <Text style={[styles.sichtungstitel, { color: palette.text }]}>
                  {auswahl.size} ausgewählt
                </Text>
                {sichtungLaeuft ? (
                  <ActivityIndicator />
                ) : (
                  <>
                    <ActionButton label="Freigeben" onPress={() => void sichte((fotoId) => entscheide(api, fotoId, 'freigegeben'))} />
                    <ActionButton label="Ablehnen" onPress={() => void sichte((fotoId) => entscheide(api, fotoId, 'abgelehnt'))} />
                    <ActionButton label="Für die Homepage" onPress={() => void sichte((fotoId) => setzeFuerHomepage(api, fotoId, true))} />
                    <ActionButton
                      label="Löschen"
                      onPress={() =>
                        Alert.alert('Wirklich löschen?', `${auswahl.size} ${auswahl.size === 1 ? 'Bild' : 'Bilder'} — das geht nicht zurück.`, [
                          { text: 'Abbrechen', style: 'cancel' },
                          { text: 'Löschen', style: 'destructive', onPress: () => void sichte((fotoId) => loescheFoto(api, fotoId)) },
                        ])
                      }
                    />
                    <ActionButton label="Auswahl aufheben" onPress={() => setAuswahl(new Set())} />
                  </>
                )}
              </View>
            ) : null}

            {laeuftHoch ? (
              <View style={styles.laufend}>
                <ActivityIndicator />
                <Text style={[styles.laufendText, { color: palette.textMuted }]}>Lädt hoch …</Text>
              </View>
            ) : stapel.length > 0 ? (
              <ActionButton
                label={`${stapel.length} übrig — weiter versuchen`}
                onPress={() => void stapelHochladen(stapel)}
              />
            ) : album.zustand === 'offen' && auswahl.size === 0 ? (
              <ActionButton label="Bilder hochladen" onPress={() => void auswaehlenUndHochladen()} />
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  inhalt: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  beschreibung: {
    fontFamily: font.regular,
    fontSize: fontSize.md,
    marginTop: spacing.xs,
  },
  sichtung: {
    gap: spacing.sm,
  },
  sichtungstitel: {
    fontFamily: font.semibold,
    fontSize: fontSize.md,
  },
  laufend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  laufendText: {
    fontFamily: font.regular,
    fontSize: fontSize.sm,
  },
});
