import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import {
  BildFehler,
  HOECHSTGROESSE_BYTES,
  KANTEN,
  liesAufnahmezeit,
  verarbeite,
} from '../src/bildverarbeitung.ts';

/**
 * Ein Testbild mit echten Metadaten — kein nachgebautes EXIF, sondern eines,
 * das sharp selbst geschrieben hat. Eine Attrappe würde genau die Frage
 * wegtäuschen, um die es hier geht.
 */
async function testbild(
  optionen: { breite?: number; hoehe?: number; ausrichtung?: number; exif?: Record<string, Record<string, string>> } = {},
): Promise<Buffer> {
  const { breite = 120, hoehe = 60, ausrichtung, exif } = optionen;

  let bild = sharp({
    create: { width: breite, height: hoehe, channels: 3, background: '#25749E' },
  });

  if (ausrichtung !== undefined) bild = bild.withMetadata({ orientation: ausrichtung });
  if (exif) bild = bild.withExif(exif);

  return bild.jpeg().toBuffer();
}

describe('verarbeite', () => {
  it('liefert drei Fassungen', async () => {
    const ergebnis = await verarbeite(await testbild({ breite: 3000, hoehe: 2000 }));

    expect(ergebnis.fassungen.original.length).toBeGreaterThan(0);
    expect(ergebnis.fassungen.anzeige.length).toBeGreaterThan(0);
    expect(ergebnis.fassungen.vorschau.length).toBeGreaterThan(0);
  });

  it('verkleinert Anzeige und Vorschau auf ihre lange Kante, das Original nicht', async () => {
    const ergebnis = await verarbeite(await testbild({ breite: 3000, hoehe: 2000 }));

    const original = await sharp(ergebnis.fassungen.original).metadata();
    const anzeige = await sharp(ergebnis.fassungen.anzeige).metadata();
    const vorschau = await sharp(ergebnis.fassungen.vorschau).metadata();

    expect(original.width).toBe(3000);
    expect(anzeige.width).toBe(KANTEN.anzeige);
    expect(vorschau.width).toBe(KANTEN.vorschau);
  });

  it('vergrößert kleine Bilder nicht', async () => {
    // `withoutEnlargement`. Ohne das würde ein 120 px breites Bild auf 2000
    // aufgeblasen — vier Fünftel erfundene Pixel und eine Datei, die größer
    // ist als das Original.
    const ergebnis = await verarbeite(await testbild({ breite: 120, hoehe: 60 }));

    expect((await sharp(ergebnis.fassungen.anzeige).metadata()).width).toBe(120);
  });

  it('entfernt die Metadaten aus allen drei Fassungen', async () => {
    // **Der wichtigste Test dieser Datei.** Handyfotos tragen
    // GPS-Koordinaten; ein Bild vom Jugendtraining verriete sonst auf den
    // Meter, wo sich regelmäßig Kinder aufhalten. Geprüft wird nicht „kein
    // GPS", sondern „kein EXIF" — das ist die stärkere Aussage und fällt
    // nicht durch, wenn jemand ein Feld übersieht.
    const mitExif = await testbild({
      exif: { IFD2: { DateTimeOriginal: '2026:07:12 10:30:00' } },
    });
    expect((await sharp(mitExif).metadata()).exif).toBeDefined();

    const ergebnis = await verarbeite(mitExif);

    for (const [name, daten] of Object.entries(ergebnis.fassungen)) {
      const kopf = await sharp(daten).metadata();
      expect(kopf.exif, `${name} trägt noch EXIF`).toBeUndefined();
    }
  });

  it('rettet die Aufnahmezeit, bevor sie verschwindet', async () => {
    const ergebnis = await verarbeite(
      await testbild({ exif: { IFD2: { DateTimeOriginal: '2026:07:12 10:30:00' } } }),
    );

    expect(ergebnis.aufgenommenAm).toBeInstanceOf(Date);
    expect(ergebnis.aufgenommenAm?.getFullYear()).toBe(2026);
    expect(ergebnis.aufgenommenAm?.getMonth()).toBe(6); // Juli
    expect(ergebnis.aufgenommenAm?.getDate()).toBe(12);
  });

  it('kommt ohne Aufnahmezeit zurecht', async () => {
    const ergebnis = await verarbeite(await testbild());
    expect(ergebnis.aufgenommenAm).toBeNull();
  });

  it('rechnet die Ausrichtung ins Bild, statt sie mit dem EXIF wegzuwerfen', async () => {
    // Ausrichtung 6 heißt „um 90° drehen". Aus 120×60 muss 60×120 werden.
    // Ohne `rotate()` bliebe es 120×60 — und läge auf jedem Bildschirm quer,
    // ohne dass irgendein anderer Test rot würde.
    const ergebnis = await verarbeite(await testbild({ breite: 120, hoehe: 60, ausrichtung: 6 }));

    expect(ergebnis.breite).toBe(60);
    expect(ergebnis.hoehe).toBe(120);
  });

  it('gibt dieselbe Prüfsumme für dieselbe Datei und eine andere für eine andere', async () => {
    const eins = await testbild({ breite: 120, hoehe: 60 });
    const zwei = await testbild({ breite: 121, hoehe: 60 });

    expect((await verarbeite(eins)).pruefsumme).toBe((await verarbeite(eins)).pruefsumme);
    expect((await verarbeite(eins)).pruefsumme).not.toBe((await verarbeite(zwei)).pruefsumme);
  });

  it('weist zurück, was kein Bild ist', async () => {
    await expect(verarbeite(Buffer.from('das ist ein Text, kein Bild'))).rejects.toBeInstanceOf(
      BildFehler,
    );
  });

  it('weist eine leere Datei zurück', async () => {
    await expect(verarbeite(Buffer.alloc(0))).rejects.toBeInstanceOf(BildFehler);
  });

  it('weist zu große Dateien zurück, ohne sie zu verarbeiten', async () => {
    // Die Prüfung steht **vor** sharp. Andernfalls entschiede ein Upload von
    // außen, wie viel Arbeitsspeicher der Server für ein Bild aufwendet, das
    // er ohnehin ablehnt.
    const zuGross = Buffer.alloc(HOECHSTGROESSE_BYTES + 1);
    await expect(verarbeite(zuGross)).rejects.toBeInstanceOf(BildFehler);
  });

  it('weist ein Format zurück, das wir nicht annehmen', async () => {
    // GIF ist ein gültiges Bild und trotzdem nichts, was jemand von einem
    // Vereinsevent hochlädt.
    const gif = await sharp({
      create: { width: 10, height: 10, channels: 3, background: '#000000' },
    })
      .gif()
      .toBuffer();

    await expect(verarbeite(gif)).rejects.toBeInstanceOf(BildFehler);
  });
});

describe('liesAufnahmezeit', () => {
  it('liefert null ohne EXIF', () => {
    expect(liesAufnahmezeit(undefined)).toBeNull();
  });

  it('liefert null statt zu werfen, wenn das EXIF beschädigt ist', () => {
    // Ein kaputtes EXIF ist kein Grund, einen Upload scheitern zu lassen.
    // Dann ist das Bild eben ohne Datum und wird nach Hochladezeit sortiert.
    expect(liesAufnahmezeit(Buffer.from('kaputt'))).toBeNull();
  });
});
