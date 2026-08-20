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
 * ## Die Warteschlange
 *
 * Jedes ausgewählte Bild wird sofort ins App-Verzeichnis kopiert und als
 * Auftrag vermerkt (`warteschlangeSpeicher.ts`) — **vor** dem ersten
 * Sendeversuch. Scheitert der Upload im Wald, überlebt der Auftrag den
 * App-Neustart; beim nächsten Öffnen des Albums steht er wieder da.
 *
 * Seit dem Design-Review vom 14.08.2026 ist sie **sichtbar** („4c"):
 * Fortschrittskarte mit Balken und Pausieren, je Kachel ein Zustands-Badge
 * (hochgeladen · lädt · wartet · kein Netz), und ein Banner erklärt, dass
 * Wartendes gemerkt bleibt. Der Upload-Knopf sitzt in einer festen
 * Fußleiste („4b") statt am Scrollende, und die Einwilligung steht in einem
 * Blatt neben den gewählten Bildern statt in einem nüchternen System-Alert.
 */

import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  bereiteVor,
  entscheide,
  groesseVon,
  holeAlbum,
  ladeHoch,
  loescheFoto,
  melde,
  setzeFuerHomepage,
  type AlbumMitFotos,
  type Foto,
} from '../../src/data/fotos';
import { ApiFehler } from '../../src/data/api';
import { formatiereEreignisdatum } from '../../src/features/fotos/AlbumKarte';
import { UploadFortschritt, type UploadZustand } from '../../src/features/fotos/UploadFortschritt';
import { Blatt } from '../../src/ui/Blatt';
import { FotoRaster } from '../../src/features/fotos/FotoRaster';
import { darfJetztHochladen } from '../../src/features/fotos/netz';
import { useImWlan, useVerbunden } from '../../src/features/fotos/netzZustand';
import { useUploadEinstellungen } from '../../src/features/fotos/uploadEinstellungen';
import {
  entferne,
  fuegeHinzu,
  fuerAlbum,
  rundeIstDurch,
  vermerkeFehlschlag,
  type Auftrag,
} from '../../src/features/fotos/warteschlange';
import { kopiereInsAppVerzeichnis, liesSchlange, loescheKopie, schreibSchlange } from '../../src/features/fotos/warteschlangeSpeicher';
import { beschreibeUploadFehler, type UploadSchritt } from '../../src/features/fotos/uploadFehler';
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

  /** Offene Aufträge dieses Albums — aus der persistenten Schlange. */
  const [stapel, setStapel] = useState<Auftrag[]>([]);
  const [laeuftHoch, setLaeuftHoch] = useState(false);
  // Design „4b"/„4c" (Review vom 14.08.2026): Auswahl wartet in einem Blatt
  // auf die Einwilligung, und die Warteschlange ist sichtbar — je Auftrag
  // ein Zustand, dazu Pausieren. Der Ref spiegelt `pausiert` für die
  // laufende Schleife, die den React-State nicht frisch sieht.
  const [uploadBlattOffen, setUploadBlattOffen] = useState(false);
  const [auswahlUris, setAuswahlUris] = useState<string[]>([]);
  const [zustaende, setZustaende] = useState<Record<string, UploadZustand>>({});
  const [erledigteRunde, setErledigteRunde] = useState<Auftrag[]>([]);
  const [pausiert, setPausiert] = useState(false);
  const pausiertRef = useRef(false);
  // Spiegel von `laeuftHoch` für `wiederAufnehmen`: Der Aufruf kommt aus
  // `laden()` und sähe den React-State sonst veraltet — und startete den
  // Stapel ein zweites Mal, während er schon läuft.
  const laeuftHochRef = useRef(false);
  // Einmaliger Ausweg aus der WLAN-Regel: gilt für genau diesen Stapel und
  // ändert die Einstellung nicht.
  const mobilfunkErlaubtRef = useRef(false);
  const [uebersprungen, setUebersprungen] = useState(0);
  // Aufträge, die während eines laufenden Stapels abgewählt wurden. Siehe
  // `auftragEntfernen` — ohne diesen Merkzettel schriebe die Schleife sie
  // wieder in die Schlange zurück.
  //
  // Wird bewusst **nie** geleert: Auftragskennungen sind einmalig
  // (Zeitstempel und Zufall), ein alter Eintrag kann also nie einen neuen
  // treffen. Beim Beginn eines neuen Stapels zu leeren wäre dagegen
  // gefährlich — liefe der alte noch, holte er die abgewählten Bilder
  // zurück. Ein paar Zeichenketten je Sitzung sind der günstigere Preis.
  const entfernteRef = useRef<Set<string>>(new Set());

  /** Sichtung: leere Menge heißt kein Auswahlmodus. */
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [sichtungLaeuft, setSichtungLaeuft] = useState(false);

  const istVerwaltung = rolle === 'verwaltung';
  const imWlan = useImWlan();
  const verbunden = useVerbunden();
  const { werte: uploadRegeln } = useUploadEinstellungen();

  /**
   * Stößt liegengebliebene Aufträge an — beim Öffnen des Albums und wenn
   * das Netz zurückkommt.
   *
   * Ohne das war das Versprechen des Banners nur zur Hälfte eingelöst:
   * gemerkt wurden die Bilder, nachgelaufen sind sie nie. Der einzige Weg
   * zurück war Pausieren/Fortsetzen — ein Umweg, den niemand findet.
   */
  const wiederAufnehmen = useCallback(
    (auftraege: Auftrag[]) => {
      if (pausiertRef.current || laeuftHochRef.current || auftraege.length === 0) return;
      void stapelHochladen(auftraege);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /**
   * Album und offene Aufträge holen.
   *
   * `darfAnstossen` ist keine Feinheit, sondern die Bremse gegen eine
   * **Endlosschleife**: `stapelHochladen` ruft am Ende `laden()`, und
   * `laden()` stieß bis zum 17.08.2026 die Schlange wieder an — bei jedem
   * Fehlschlag drehte sich das im Sekundentakt weiter. Auf dem Gerät sah
   * man die Kachel zwischen „Lädt …" und „Kein Netz" flackern, und das
   * Kreuz zum Abwählen war kaum zu treffen (Screenshots vom 17.08.2026).
   */
  const laden = useCallback(async (darfAnstossen = true) => {
    if (!id) return;
    setFehler(null);
    try {
      setAlbum(await holeAlbum(api, id));
      // Liegengebliebene Aufträge dieses Albums — vom letzten Mal, auch
      // über einen Neustart hinweg.
      const offen = fuerAlbum(await liesSchlange(), id);
      setStapel(offen);
      if (darfAnstossen) wiederAufnehmen(offen);
    } catch (ursache) {
      setFehler(beschreibeJugendFehler(ursache));
    }
  }, [api, id]);

  useFocusEffect(
    useCallback(() => {
      if (angemeldet) void laden();
    }, [angemeldet, laden]),
  );

  /**
   * Arbeitet Aufträge ab. Ein gelungener (oder doppelter) Upload löscht
   * Auftrag und Kopie sofort — nicht erst am Ende des Stapels, damit ein
   * Abbruch mittendrin nur die wirklich offenen übrig lässt.
   */
  async function stapelHochladen(auftraege: Auftrag[]) {
    laeuftHochRef.current = true;
    setLaeuftHoch(true);
    setFehler(null);
    let doppelte = 0;
    let schlange = await liesSchlange();
    /**
     * Wie jeder Auftrag dieser Runde ausgegangen ist.
     *
     * Neben `setZustaende` und nicht daraus gelesen: Die Schleife sähe den
     * React-State erst nach dem nächsten Rendern — dieselbe Falle, für die
     * es weiter oben schon `pausiertRef` und `laeuftHochRef` gibt.
     */
    const ausgang: Record<string, string> = {};

    for (const auftrag of auftraege) {
      // Pausieren greift zwischen zwei Bildern — das laufende wird nicht
      // abgebrochen, die übrigen bleiben als „wartet" stehen.
      if (pausiertRef.current) break;
      // Zwischenzeitlich abgewählt (Befund „C2"): überspringen, sonst
      // lüde die Schleife ein Bild hoch, das der Nutzer gerade
      // zurückgezogen hat — und dessen Kopie es nicht mehr gibt.
      if (entfernteRef.current.has(auftrag.id)) continue;
      setZustaende((alt) => ({ ...alt, [auftrag.id]: 'laedt' }));
      // Welcher Schritt gerade läuft — die Meldung im Fehlerfall hängt
      // daran. Vorbereiten passiert auf dem Gerät, Senden geht ans Netz;
      // beides als „nicht erreichbar" zu melden hat den Upload eine Woche
      // lang unauffindbar kaputt gehalten (siehe `uploadFehler.ts`).
      let schritt: UploadSchritt = 'vorbereiten';
      try {
        const vorbereitet = await bereiteVor(auftrag.uri);

        // Erst nach dem Verkleinern messen: Ein 48-Megapixel-Foto, das als
        // JPEG zwei Megabyte wiegt, soll nicht auf WLAN warten, weil das
        // Original zwanzig hat.
        const bytes = await groesseVon(vorbereitet.uri);
        if (
          !darfJetztHochladen(
            {
              nurUeberWlan: uploadRegeln.nurUeberWlan,
              freigrenze: uploadRegeln.freigrenze,
              imWlan,
              mobilfunkErlaubt: mobilfunkErlaubtRef.current,
            },
            bytes,
          )
        ) {
          ausgang[auftrag.id] = 'wartetAufWlan';
          setZustaende((alt) => ({ ...alt, [auftrag.id]: 'wartetAufWlan' }));
          continue;
        }

        schritt = 'senden';
        const ergebnis = await ladeHoch(api, auftrag.albumId, vorbereitet.uri);
        if ('doppelt' in ergebnis) doppelte += 1;
        loescheKopie(auftrag);
        schlange = entferne(schlange, auftrag.id);
        ausgang[auftrag.id] = 'hochgeladen';
        setZustaende((alt) => ({ ...alt, [auftrag.id]: 'hochgeladen' }));
        setErledigteRunde((alt) => (alt.some((a) => a.id === auftrag.id) ? alt : [...alt, auftrag]));
      } catch (ursache) {
        schlange = vermerkeFehlschlag(schlange, auftrag.id);
        // `ohneNetz` statt `status === 0`: Auch eine gescheiterte
        // Token-Erneuerung wirft mit Status 0, und die heißt „der Verein ist
        // gerade überlastet", nicht „prüf dein Netz".
        //
        // **Und `verbunden === false` dazu.** `ohneNetz` heißt nur, dass
        // `fetch` geworfen hat. Am 17.08.2026 stand deshalb „Kein Netz" an
        // einer Kachel, während das Telefon an 5G hing — die Ursache lag
        // woanders, und das Etikett verdeckte sie.
        //
        // `=== false`, nicht `!== true`: Solange der Netzzustand unbekannt
        // ist, wird nichts behauptet. Der erste Anlauf hatte es andersherum
        // und zeigte deshalb weiter „Kein Netz", wenn NetInfo noch keine
        // Auskunft gegeben hatte.
        const keinNetz =
          ursache instanceof ApiFehler && ursache.ohneNetz && verbunden === false;
        ausgang[auftrag.id] = keinNetz ? 'keinNetz' : 'fehlgeschlagen';
        setZustaende((alt) => ({ ...alt, [auftrag.id]: keinNetz ? 'keinNetz' : 'fehlgeschlagen' }));
        // Ohne diesen Satz sah ein 413 („Bild zu groß") aus wie „steht in
        // der Schlange" — der Fehler aus dem Bericht vom 15.08.2026.
        if (!keinNetz) setFehler(beschreibeUploadFehler(ursache, schritt, verbunden));
      }
      // Abgewählte hier herauswerfen, nicht nur beim Überspringen: Diese
      // Zeile ist es, die sie sonst wieder in den Speicher schriebe.
      schlange = schlange.filter((eintrag) => !entfernteRef.current.has(eintrag.id));
      await schreibSchlange(schlange);
    }

    setStapel(fuerAlbum(schlange, id!));
    setUebersprungen(doppelte);
    laeuftHochRef.current = false;
    setLaeuftHoch(false);
    // **Ohne `false` hier dreht sich die Schlange endlos** — siehe `laden`.
    await laden(false);

    /*
      Die Fortschrittskarte räumt sich selbst ab, sobald die Runde restlos
      durch ist — **erst nach `laden()`**, denn bis dahin steht das Bild
      noch nicht im Raster, und die Seite sähe für einen Moment leer aus.

      Aus der Beta, mit Bildschirmfoto: Nach dem Hochladen stand dasselbe
      Foto zweimal da — oben in der Karte mit „HOCHGELADEN", unten im
      Raster mit „neu". Beides stimmte, zusammen sah es aus wie ein
      Fehler. Die Karte hat ihre Arbeit getan, sobald das Bild unten
      steht.

      Übersprungene Doppelte bleiben davon unberührt: Ihr Hinweis ist ein
      eigenes Banner und die einzige Stelle, an der sie überhaupt
      vorkommen.
    */
    const durch = rundeIstDurch(
      auftraege.filter((a) => !entfernteRef.current.has(a.id)).map((a) => ausgang[a.id] ?? 'offen'),
    );
    if (durch && !pausiertRef.current) {
      setErledigteRunde([]);
      setZustaende({});
      setFehler(null);
    }
  }

  /** Kopiert die Auswahl ins App-Verzeichnis und stellt sie in die Schlange. */
  async function inDieSchlange(uris: string[]): Promise<Auftrag[]> {
    const auftraege = uris.map((uri) => kopiereInsAppVerzeichnis(id!, uri));
    await schreibSchlange(fuegeHinzu(await liesSchlange(), auftraege));
    setStapel((alt) => [...alt, ...auftraege]);
    return auftraege;
  }

  async function bilderAuswaehlen() {
    const auswahl = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: true,
      quality: 1,
    });
    if (auswahl.canceled || auswahl.assets.length === 0) return;
    // Kein System-Alert mehr: Das Blatt zeigt die gewählten Bilder neben
    // dem Einwilligungssatz — wer bestätigt, sieht, was er bestätigt.
    setAuswahlUris(auswahl.assets.map((bild) => bild.uri));
    setUploadBlattOffen(true);
  }

  function bestaetigtHochladen() {
    const uris = auswahlUris;
    setUploadBlattOffen(false);
    setAuswahlUris([]);
    pausiertRef.current = false;
    setPausiert(false);
    // Erst sichern, dann senden: Ab hier überlebt die Auswahl auch einen
    // Absturz zwischen Kopieren und erstem Sendeversuch.
    void inDieSchlange(uris).then((auftraege) => stapelHochladen(auftraege));
  }

  /**
   * Ein einzelnes Bild aus der Schlange nehmen — Befund „C2" vom
   * 15.08.2026. Wer das falsche Foto erwischt hat, musste bisher den
   * ganzen Stapel abbrechen.
   *
   * **Die Tücke steckt im Zusammenspiel mit der laufenden Schleife.** Die
   * hält ihre eigene Kopie der Schlange und schreibt sie nach jedem Bild
   * zurück; ein hier gelöschter Auftrag stünde nach dem nächsten
   * Rückschreiben wieder drin — und wäre inzwischen ohne Datei. Deshalb
   * das Merkzettel-Ref: Die Schleife fragt es vor jedem Bild und vor jedem
   * Schreiben ab. Ohne das ist der Fehler weder in einem Test noch beim
   * Ausprobieren mit gutem Netz zu sehen — nur draußen, wo die Uploads
   * lange genug dauern, dass jemand dazwischenkommt.
   */
  async function auftragEntfernen(auftrag: Auftrag) {
    entfernteRef.current.add(auftrag.id);
    loescheKopie(auftrag);
    setStapel((alt) => alt.filter((a) => a.id !== auftrag.id));
    setZustaende(({ [auftrag.id]: _weg, ...rest }) => rest);
    await schreibSchlange(entferne(await liesSchlange(), auftrag.id));
  }

  function pausierenUmschalten() {
    const neu = !pausiertRef.current;
    pausiertRef.current = neu;
    setPausiert(neu);
    if (!neu && !laeuftHoch && stapel.length > 0) void stapelHochladen(stapel);
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

            <UploadFortschritt
              auftraege={[...erledigteRunde, ...stapel.filter((a) => !erledigteRunde.some((e) => e.id === a.id))]}
              zustaende={zustaende}
              pausiert={pausiert}
              beimPausieren={pausierenUmschalten}
              beimErneutVersuchen={() => void stapelHochladen(stapel)}
              fehlertext={fehler}
              beimUeberMobilfunk={() => {
                mobilfunkErlaubtRef.current = true;
                void stapelHochladen(stapel);
              }}
              beimEinstellungen={() => router.push('/einstellungen')}
              beimEntfernen={(auftrag) => void auftragEntfernen(auftrag)}
            />

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

          </>
        ) : null}
      </ScrollView>

      {/* Feste Fußleiste („4b"): Der Knopf gehört nicht ans Scrollende —
          bei 120 Bildern fand ihn dort niemand. */}
      {album && album.zustand === 'offen' && auswahl.size === 0 ? (
        <View
          style={[
            styles.fussleiste,
            { backgroundColor: palette.surface, borderTopColor: palette.border, paddingBottom: insets.bottom + 20 },
          ]}
        >
          <Pressable
            onPress={() => void bilderAuswaehlen()}
            accessibilityLabel="Bilder hochladen"
            style={({ pressed }) => [
              styles.uploadKnopf,
              { backgroundColor: pressed ? '#1b587a' : palette.primary },
            ]}
          >
            <Ionicons name="images-outline" size={18} color={palette.onPrimary} />
            <Text style={[styles.uploadKnopfText, { color: palette.onPrimary }]}>Bilder hochladen</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Upload-Blatt („4b"): Die gewählten Bilder neben dem
          Einwilligungssatz — wer bestätigt, sieht, was er bestätigt. */}
      <Blatt offen={uploadBlattOffen} beimSchliessen={() => setUploadBlattOffen(false)}>
        <Text style={[styles.blattTitel, { color: palette.text }]}>
          {auswahlUris.length} {auswahlUris.length === 1 ? 'Bild' : 'Bilder'} hochladen
        </Text>
        <View style={styles.vorschauZeile}>
          {auswahlUris.slice(0, auswahlUris.length > 5 ? 4 : 5).map((uri) => (
            <Image key={uri} source={{ uri }} style={styles.vorschau} />
          ))}
          {auswahlUris.length > 5 ? (
            <View style={[styles.vorschau, styles.mehrKachel, { backgroundColor: palette.surfaceMuted }]}>
              <Text style={[styles.mehrText, { color: palette.textMuted }]}>+{auswahlUris.length - 4}</Text>
            </View>
          ) : null}
        </View>
        <View style={[styles.einwilligung, { backgroundColor: palette.background }]}>
          <Text style={[styles.einwilligungText, { color: palette.text }]}>
            Ich habe die Bilder selbst aufgenommen, und die abgebildeten Personen sind mit der
            Verwendung im Verein einverstanden. Die Vereinsverwaltung sieht sie zuerst; sichtbar für
            andere werden sie erst nach Freigabe.
          </Text>
        </View>
        <ActionButton label="Einverstanden, hochladen" onPress={bestaetigtHochladen} />
        <Pressable onPress={() => setUploadBlattOffen(false)} style={styles.abbrechen} accessibilityLabel="Abbrechen">
          <Text style={[styles.abbrechenText, { color: palette.textMuted }]}>Abbrechen</Text>
        </Pressable>
      </Blatt>
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
  fussleiste: {
    borderTopWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: 10,
  },
  uploadKnopf: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: 6,
  },
  uploadKnopfText: {
    fontFamily: font.semibold,
    fontSize: fontSize.md,
  },
  blattTitel: {
    fontFamily: font.semibold,
    fontSize: fontSize.lg,
    marginBottom: spacing.md,
  },
  vorschauZeile: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: spacing.md,
  },
  vorschau: {
    width: 64,
    height: 64,
    borderRadius: 6,
  },
  mehrKachel: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  mehrText: {
    fontFamily: font.semibold,
    fontSize: fontSize.sm,
  },
  einwilligung: {
    borderRadius: 8,
    padding: 12,
    marginBottom: spacing.lg,
  },
  einwilligungText: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 19,
  },
  abbrechen: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  abbrechenText: {
    fontFamily: font.semibold,
    fontSize: 15,
  },
});
