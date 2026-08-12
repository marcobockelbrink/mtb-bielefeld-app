/**
 * Wo die Bilddateien liegen — und warum nicht in der Datenbank.
 *
 * Bilder in Postgres wären bequem: eine Sache weniger zu sichern, keine
 * Pfade, keine verwaisten Dateien. Sie würden aber jede Sicherung und jede
 * Abfrage mitschleppen, und ein `pg_dump` eines Vereinsjahres wäre
 * zweistellig in Gigabyte. Deshalb: Dateien auf ein Docker-Volume, in der
 * Datenbank nur, was sie bedeuten.
 *
 * ## Der Pfad ist keine Auskunft
 *
 *     <wurzel>/<album-id>/<foto-id>-<fassung>.<endung>
 *
 * Kennungen als Dateinamen, **keine sprechenden**. Ein `IMG_4711.jpg` aus
 * einer fremden Kamera verrät die Kamera, die Reihenfolge der Aufnahmen und
 * mit etwas Pech den Namen dessen, der sie gemacht hat. Und weil die Datei
 * ohnehin nie direkt ausgeliefert wird — die API entscheidet erst, ob jemand
 * sie sehen darf —, muss der Pfad nichts erzählen.
 *
 * ## Warum jeder Bestandteil geprüft wird
 *
 * `albumId` und `fotoId` kommen aus einer Anfrage von außen. Ein `..` darin
 * wäre ein Weg aus dem Volume heraus, und der endete je nach Fassung beim
 * Lesen oder beim **Löschen** beliebiger Dateien. Die Prüfung auf eine echte
 * Kennung ist deshalb keine Formsache, sondern die Grenze.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { Fassung } from './fotoalbum.ts';
import { istKennung } from './fotoalbum.ts';

const ENDUNGEN: Record<Fassung, string> = {
  vorschau: 'webp',
  anzeige: 'webp',
  original: 'jpg',
};

/** Der Inhaltstyp zur Fassung — die Endpunkte setzen ihn beim Ausliefern. */
export const INHALTSTYPEN: Record<Fassung, string> = {
  vorschau: 'image/webp',
  anzeige: 'image/webp',
  original: 'image/jpeg',
};

export class AblageFehler extends Error {}

export class Bildablage {
  constructor(private readonly wurzel: string) {}

  /**
   * Der Pfad einer Fassung — und die Stelle, an der Unsinn abprallt.
   *
   * `path.join` allein reicht hier nicht: Es normalisiert `..` sauber weg
   * und läge damit außerhalb der Wurzel, ohne zu klagen. Erst die Prüfung
   * auf eine Kennung macht daraus eine Grenze.
   */
  pfad(albumId: string, fotoId: string, fassung: Fassung): string {
    if (!istKennung(albumId) || !istKennung(fotoId)) {
      throw new AblageFehler('Keine gültige Kennung.');
    }
    if (!(fassung in ENDUNGEN)) {
      throw new AblageFehler(`Unbekannte Fassung: ${fassung}`);
    }

    return path.join(this.wurzel, albumId, `${fotoId}-${fassung}.${ENDUNGEN[fassung]}`);
  }

  async lege(
    albumId: string,
    fotoId: string,
    fassungen: Record<Fassung, Buffer>,
  ): Promise<void> {
    // Erst den Ordner, dann alle drei. Die Reihenfolge unter den dreien ist
    // gleichgültig — was zählt, ist, dass die Datenbankzeile **danach**
    // entsteht: Eine Zeile ohne Datei zeigt einen kaputten Platzhalter, eine
    // Datei ohne Zeile liegt nur herum.
    await fs.mkdir(path.join(this.wurzel, this.gepruefteKennung(albumId)), { recursive: true });

    await Promise.all(
      (Object.keys(ENDUNGEN) as Fassung[]).map((fassung) =>
        fs.writeFile(this.pfad(albumId, fotoId, fassung), fassungen[fassung]),
      ),
    );
  }

  async lies(albumId: string, fotoId: string, fassung: Fassung): Promise<Buffer> {
    return fs.readFile(this.pfad(albumId, fotoId, fassung));
  }

  /**
   * Löscht alle Fassungen eines Bildes.
   *
   * Fehlt eine davon, ist das kein Fehler: Gelöscht werden soll sie ja. Ein
   * Wurf an dieser Stelle hieße, dass ein halb aufgeräumter Zustand sich
   * nicht mehr aufräumen ließe — genau dann, wenn man es am nötigsten hat.
   */
  async loesche(albumId: string, fotoId: string): Promise<void> {
    await Promise.all(
      (Object.keys(ENDUNGEN) as Fassung[]).map((fassung) =>
        fs.rm(this.pfad(albumId, fotoId, fassung), { force: true }),
      ),
    );
  }

  /** Räumt den ganzen Ordner eines Albums ab — nach `DELETE /fotoalbum/:id`. */
  async loescheAlbum(albumId: string): Promise<void> {
    await fs.rm(path.join(this.wurzel, this.gepruefteKennung(albumId)), {
      recursive: true,
      force: true,
    });
  }

  /** Wie viel Platz ein Album belegt — für die Übersicht der Verwaltung. */
  async groesse(albumId: string): Promise<number> {
    const ordner = path.join(this.wurzel, this.gepruefteKennung(albumId));

    let summe = 0;
    let eintraege: string[];
    try {
      eintraege = await fs.readdir(ordner);
    } catch {
      return 0;
    }

    for (const eintrag of eintraege) {
      const stat = await fs.stat(path.join(ordner, eintrag));
      summe += stat.size;
    }

    return summe;
  }

  private gepruefteKennung(id: string): string {
    if (!istKennung(id)) throw new AblageFehler('Keine gültige Kennung.');
    return id;
  }
}

/**
 * Ein kurzes, stabiles Kennzeichen einer Datei für `ETag`.
 *
 * Bilder ändern sich nach dem Hochladen nie — dieselbe Kennung meint immer
 * dieselben Pixel. Ein `ETag` erspart deshalb bei jedem zweiten Öffnen eines
 * Albums die gesamte Übertragung, und bei einem Raster mit 120 Vorschauen
 * ist das der Unterschied zwischen „geht auf" und „lädt".
 */
export function etag(albumId: string, fotoId: string, fassung: Fassung): string {
  return `"${createHash('sha1').update(`${albumId}:${fotoId}:${fassung}`).digest('hex')}"`;
}
