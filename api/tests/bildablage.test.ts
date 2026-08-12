import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AblageFehler, Bildablage, etag } from '../src/bildablage.ts';

const ALBUM = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const FOTO = 'ffffffff-2222-4222-8222-ffffffffffff';

let wurzel: string;
let ablage: Bildablage;

beforeEach(async () => {
  wurzel = await fs.mkdtemp(path.join(os.tmpdir(), 'mtbie-bilder-'));
  ablage = new Bildablage(wurzel);
});

afterEach(async () => {
  await fs.rm(wurzel, { recursive: true, force: true });
});

const FASSUNGEN = {
  vorschau: Buffer.from('klein'),
  anzeige: Buffer.from('mittel'),
  original: Buffer.from('groß'),
};

describe('Bildablage', () => {
  it('legt alle drei Fassungen ab und liest sie wieder', async () => {
    await ablage.lege(ALBUM, FOTO, FASSUNGEN);

    expect((await ablage.lies(ALBUM, FOTO, 'vorschau')).toString()).toBe('klein');
    expect((await ablage.lies(ALBUM, FOTO, 'anzeige')).toString()).toBe('mittel');
    expect((await ablage.lies(ALBUM, FOTO, 'original')).toString()).toBe('groß');
  });

  it('legt je Album einen eigenen Ordner an', async () => {
    await ablage.lege(ALBUM, FOTO, FASSUNGEN);

    expect(await fs.readdir(wurzel)).toEqual([ALBUM]);
    expect((await fs.readdir(path.join(wurzel, ALBUM))).sort()).toEqual([
      `${FOTO}-anzeige.webp`,
      `${FOTO}-original.jpg`,
      `${FOTO}-vorschau.webp`,
    ]);
  });

  it('verweigert Kennungen, die keine sind', () => {
    // **Die Grenze des Volumes.** `albumId` und `fotoId` kommen aus einer
    // Anfrage von außen; ein `..` darin wäre ein Weg hinaus — beim Lesen
    // schlimm, beim Löschen schlimmer.
    expect(() => ablage.pfad('../../etc', FOTO, 'original')).toThrow(AblageFehler);
    expect(() => ablage.pfad(ALBUM, '../../../etc/passwd', 'original')).toThrow(AblageFehler);
    expect(() => ablage.pfad('', FOTO, 'original')).toThrow(AblageFehler);
  });

  it('löscht alle Fassungen eines Bildes', async () => {
    await ablage.lege(ALBUM, FOTO, FASSUNGEN);
    await ablage.loesche(ALBUM, FOTO);

    expect(await fs.readdir(path.join(wurzel, ALBUM))).toEqual([]);
  });

  it('stört sich nicht daran, wenn schon etwas fehlt', async () => {
    // Gelöscht werden soll es ja. Ein Wurf hier hieße, dass ein halb
    // aufgeräumter Zustand sich nicht mehr aufräumen lässt — genau dann,
    // wenn man es am nötigsten hat.
    await ablage.lege(ALBUM, FOTO, FASSUNGEN);
    await fs.rm(ablage.pfad(ALBUM, FOTO, 'anzeige'));

    await expect(ablage.loesche(ALBUM, FOTO)).resolves.toBeUndefined();
  });

  it('räumt beim Löschen eines Albums den ganzen Ordner ab', async () => {
    await ablage.lege(ALBUM, FOTO, FASSUNGEN);
    await ablage.loescheAlbum(ALBUM);

    expect(await fs.readdir(wurzel)).toEqual([]);
  });

  it('meldet die Größe eines Albums, und null für ein leeres', async () => {
    expect(await ablage.groesse(ALBUM)).toBe(0);

    await ablage.lege(ALBUM, FOTO, FASSUNGEN);

    expect(await ablage.groesse(ALBUM)).toBe(
      FASSUNGEN.vorschau.length + FASSUNGEN.anzeige.length + FASSUNGEN.original.length,
    );
  });
});

describe('etag', () => {
  it('ist für dieselbe Fassung gleich und für andere verschieden', () => {
    // Bilder ändern sich nach dem Hochladen nie — dieselbe Kennung meint
    // immer dieselben Pixel. Deshalb darf der Wert stabil sein.
    expect(etag(ALBUM, FOTO, 'vorschau')).toBe(etag(ALBUM, FOTO, 'vorschau'));
    expect(etag(ALBUM, FOTO, 'vorschau')).not.toBe(etag(ALBUM, FOTO, 'anzeige'));
  });

  it('ist in Anführungszeichen gefasst, wie es der Standard verlangt', () => {
    expect(etag(ALBUM, FOTO, 'vorschau')).toMatch(/^".+"$/);
  });
});
