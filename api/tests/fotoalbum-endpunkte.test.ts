import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import sharp from 'sharp';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { baueApp } from '../src/app.ts';
import { Bildablage } from '../src/bildablage.ts';
import { pool } from '../src/datenbank.ts';
import { GemerkterMailer } from '../src/mailer.ts';
import { legeSitzungAn } from '../src/sitzung.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

const jetzt = new Date('2026-08-11T12:00:00Z');

let wurzel: string;

beforeEach(async () => {
  await frischeDatenbank();
  // Ein Wegwerf-Ordner je Test. Ohne das schriebe `npm test` Bilder in die
  // Ablage des Betriebs — und zwar genau dann, wenn jemand die Tests
  // versehentlich auf dem Server laufen lässt.
  wurzel = await fs.mkdtemp(path.join(os.tmpdir(), 'mtbie-endpunkte-'));
});

afterEach(async () => {
  await fs.rm(wurzel, { recursive: true, force: true });
});

afterAll(async () => {
  await pool.end();
});

function bauen() {
  return baueApp({
    pool,
    mailer: new GemerkterMailer(),
    jetzt: () => jetzt,
    bildablage: new Bildablage(wurzel),
  });
}

async function mitgliedMitToken(
  email: string,
  rolle: 'mitglied' | 'guide' | 'verwaltung' = 'mitglied',
) {
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO mitglied (email, rolle) VALUES ($1, $2) RETURNING id',
    [email, rolle],
  );
  const token = await legeSitzungAn(pool, rows[0]!.id, jetzt);
  return { id: rows[0]!.id, zugang: token.zugang };
}

/** Ein echtes JPEG — keine Attrappe, denn die Bildverarbeitung liest es wirklich. */
async function bild(breite = 60): Promise<Buffer> {
  return sharp({ create: { width: breite, height: 40, channels: 3, background: '#25749E' } })
    .jpeg()
    .toBuffer();
}

/** Baut den Multipart-Körper von Hand — zuverlässiger als eine weitere Abhängigkeit. */
function alsDatei(daten: Buffer, name = 'bild.jpg') {
  const grenze = '----mtbie-grenze';
  return {
    payload: Buffer.concat([
      Buffer.from(
        `--${grenze}\r\nContent-Disposition: form-data; name="datei"; filename="${name}"\r\n` +
          'Content-Type: image/jpeg\r\n\r\n',
      ),
      daten,
      Buffer.from(`\r\n--${grenze}--\r\n`),
    ]),
    headers: { 'content-type': `multipart/form-data; boundary=${grenze}` },
  };
}

async function albumAnlegen(
  app: ReturnType<typeof baueApp>,
  zugang: string,
  ueberschreibungen: Record<string, unknown> = {},
) {
  const antwort = await app.inject({
    method: 'POST',
    url: '/fotoalbum',
    headers: { authorization: `Bearer ${zugang}` },
    payload: { titel: 'Sommertour', ereignisAm: '2026-07-12T00:00:00Z', ...ueberschreibungen },
  });
  return antwort.json();
}

async function hochladen(
  app: ReturnType<typeof baueApp>,
  zugang: string,
  albumId: string,
  daten: Buffer,
) {
  const datei = alsDatei(daten);
  return app.inject({
    method: 'POST',
    url: `/fotoalbum/${albumId}/fotos`,
    headers: { authorization: `Bearer ${zugang}`, ...datei.headers },
    payload: datei.payload,
  });
}

describe('POST /fotoalbum', () => {
  it('lässt einen Guide ein Album anlegen', async () => {
    const app = bauen();
    const guide = await mitgliedMitToken('malte@example.org', 'guide');

    const antwort = await app.inject({
      method: 'POST',
      url: '/fotoalbum',
      headers: { authorization: `Bearer ${guide.zugang}` },
      payload: { titel: 'Sommertour', ereignisAm: '2026-07-12T00:00:00Z' },
    });

    expect(antwort.statusCode).toBe(201);
    expect(antwort.json().titel).toBe('Sommertour');
    expect(antwort.json().sichtbarkeit).toBe('mitglieder');
  });

  it('weist ein einfaches Mitglied mit 403 ab, ohne Anmeldung mit 401', async () => {
    // Dieselbe Trennung wie beim Jugendtraining: Wer nicht angemeldet ist,
    // soll sich anmelden; wem die Rolle fehlt, hilft Anmelden nicht.
    const app = bauen();
    const mitglied = await mitgliedMitToken('anna@example.org');

    expect((await app.inject({ method: 'POST', url: '/fotoalbum', payload: {} })).statusCode).toBe(401);

    const antwort = await app.inject({
      method: 'POST',
      url: '/fotoalbum',
      headers: { authorization: `Bearer ${mitglied.zugang}` },
      payload: { titel: 'X', ereignisAm: '2026-07-12T00:00:00Z' },
    });
    expect(antwort.statusCode).toBe(403);
  });

  it('verlangt Titel und Datum', async () => {
    const app = bauen();
    const guide = await mitgliedMitToken('malte@example.org', 'guide');

    const antwort = await app.inject({
      method: 'POST',
      url: '/fotoalbum',
      headers: { authorization: `Bearer ${guide.zugang}` },
      payload: { titel: '   ' },
    });
    expect(antwort.statusCode).toBe(400);
  });
});

describe('POST /fotoalbum/:id/fotos', () => {
  it('nimmt ein Bild an und legt die drei Fassungen ab', async () => {
    const app = bauen();
    const guide = await mitgliedMitToken('malte@example.org', 'guide');
    const anna = await mitgliedMitToken('anna@example.org');
    const album = await albumAnlegen(app, guide.zugang);

    const antwort = await hochladen(app, anna.zugang, album.id, await bild());

    expect(antwort.statusCode).toBe(201);
    expect(antwort.json().zustand).toBe('neu');

    const dateien = await fs.readdir(path.join(wurzel, album.id));
    expect(dateien).toHaveLength(3);
  });

  it('meldet ein zweites Mal dieselbe Datei als doppelt — mit 200, nicht mit einem Fehler', async () => {
    // Bei einem Stapel von dreißig Bildern, von denen fünf schon da sind,
    // will niemand fünf rote Meldungen. Für den Hochladenden ist „liegt
    // schon drin" das gewünschte Ergebnis.
    const app = bauen();
    const guide = await mitgliedMitToken('malte@example.org', 'guide');
    const album = await albumAnlegen(app, guide.zugang);
    const daten = await bild();

    expect((await hochladen(app, guide.zugang, album.id, daten)).statusCode).toBe(201);

    const zweite = await hochladen(app, guide.zugang, album.id, daten);
    expect(zweite.statusCode).toBe(200);
    expect(zweite.json().doppelt).toBe(true);
  });

  it('nimmt nichts mehr an, wenn das Album geschlossen ist', async () => {
    const app = bauen();
    const guide = await mitgliedMitToken('malte@example.org', 'guide');
    const album = await albumAnlegen(app, guide.zugang);

    await app.inject({
      method: 'PATCH',
      url: `/fotoalbum/${album.id}`,
      headers: { authorization: `Bearer ${guide.zugang}` },
      payload: { zustand: 'geschlossen' },
    });

    const antwort = await hochladen(app, guide.zugang, album.id, await bild());
    expect(antwort.statusCode).toBe(409);
  });

  it('weist zurück, was kein Bild ist', async () => {
    const app = bauen();
    const guide = await mitgliedMitToken('malte@example.org', 'guide');
    const album = await albumAnlegen(app, guide.zugang);

    const antwort = await hochladen(app, guide.zugang, album.id, Buffer.from('kein Bild'));
    expect(antwort.statusCode).toBe(400);
  });
});

describe('GET /foto/:id/:fassung — wer was sieht', () => {
  it('verbirgt ein fremdes, noch nicht freigegebenes Bild mit 404 statt 403', async () => {
    // **Der wichtigste Test dieser Datei.** Ein 403 verriete, dass es das
    // Bild gibt — und damit, dass jemand etwas hochgeladen hat, das noch
    // niemand gesichtet hat. „Gibt es nicht" und „darfst du nicht" müssen
    // sich für den Anfragenden gleich anfühlen.
    const app = bauen();
    const guide = await mitgliedMitToken('malte@example.org', 'guide');
    const anna = await mitgliedMitToken('anna@example.org');
    const bernd = await mitgliedMitToken('bernd@example.org');
    const album = await albumAnlegen(app, guide.zugang);

    const foto = (await hochladen(app, anna.zugang, album.id, await bild())).json();

    const antwort = await app.inject({
      method: 'GET',
      url: `/foto/${foto.id}/anzeige`,
      headers: { authorization: `Bearer ${bernd.zugang}` },
    });

    expect(antwort.statusCode).toBe(404);
    expect(antwort.json().fehler).toBe('Dieses Bild gibt es nicht.');
  });

  it('zeigt dem Hochladenden sein eigenes Bild sofort', async () => {
    const app = bauen();
    const guide = await mitgliedMitToken('malte@example.org', 'guide');
    const anna = await mitgliedMitToken('anna@example.org');
    const album = await albumAnlegen(app, guide.zugang);
    const foto = (await hochladen(app, anna.zugang, album.id, await bild())).json();

    const antwort = await app.inject({
      method: 'GET',
      url: `/foto/${foto.id}/anzeige`,
      headers: { authorization: `Bearer ${anna.zugang}` },
    });

    expect(antwort.statusCode).toBe(200);
    expect(antwort.headers['content-type']).toBe('image/webp');
  });

  it('zeigt ein freigegebenes Bild allen Mitgliedern', async () => {
    const app = bauen();
    const chef = await mitgliedMitToken('chef@example.org', 'verwaltung');
    const anna = await mitgliedMitToken('anna@example.org');
    const bernd = await mitgliedMitToken('bernd@example.org');
    const album = await albumAnlegen(app, chef.zugang);
    const foto = (await hochladen(app, anna.zugang, album.id, await bild())).json();

    await app.inject({
      method: 'PATCH',
      url: `/foto/${foto.id}`,
      headers: { authorization: `Bearer ${chef.zugang}` },
      payload: { zustand: 'freigegeben' },
    });

    const antwort = await app.inject({
      method: 'GET',
      url: `/foto/${foto.id}/anzeige`,
      headers: { authorization: `Bearer ${bernd.zugang}` },
    });
    expect(antwort.statusCode).toBe(200);
  });

  it('verbirgt ein Jugend-Album vor Mitgliedern ohne Jugendbezug', async () => {
    const app = bauen();
    const chef = await mitgliedMitToken('chef@example.org', 'verwaltung');
    const anna = await mitgliedMitToken('anna@example.org');
    const bernd = await mitgliedMitToken('bernd@example.org');
    const album = await albumAnlegen(app, chef.zugang, { sichtbarkeit: 'jugend' });
    const foto = (await hochladen(app, anna.zugang, album.id, await bild())).json();

    await app.inject({
      method: 'PATCH',
      url: `/foto/${foto.id}`,
      headers: { authorization: `Bearer ${chef.zugang}` },
      payload: { zustand: 'freigegeben' },
    });

    const antwort = await app.inject({
      method: 'GET',
      url: `/foto/${foto.id}/anzeige`,
      headers: { authorization: `Bearer ${bernd.zugang}` },
    });
    expect(antwort.statusCode).toBe(404);
  });

  it('gibt das Original nur der Verwaltung', async () => {
    const app = bauen();
    const chef = await mitgliedMitToken('chef@example.org', 'verwaltung');
    const anna = await mitgliedMitToken('anna@example.org');
    const album = await albumAnlegen(app, chef.zugang);
    const foto = (await hochladen(app, anna.zugang, album.id, await bild())).json();

    // Anna sieht ihr eigenes Bild — aber nicht in voller Auflösung.
    const alsMitglied = await app.inject({
      method: 'GET',
      url: `/foto/${foto.id}/original`,
      headers: { authorization: `Bearer ${anna.zugang}` },
    });
    expect(alsMitglied.statusCode).toBe(404);

    const alsChef = await app.inject({
      method: 'GET',
      url: `/foto/${foto.id}/original`,
      headers: { authorization: `Bearer ${chef.zugang}` },
    });
    expect(alsChef.statusCode).toBe(200);
    expect(alsChef.headers['content-type']).toBe('image/jpeg');
  });

  it('antwortet auf ein bekanntes ETag mit 304', async () => {
    const app = bauen();
    const chef = await mitgliedMitToken('chef@example.org', 'verwaltung');
    const album = await albumAnlegen(app, chef.zugang);
    const foto = (await hochladen(app, chef.zugang, album.id, await bild())).json();

    const erste = await app.inject({
      method: 'GET',
      url: `/foto/${foto.id}/vorschau`,
      headers: { authorization: `Bearer ${chef.zugang}` },
    });
    const marke = erste.headers.etag as string;

    const zweite = await app.inject({
      method: 'GET',
      url: `/foto/${foto.id}/vorschau`,
      headers: { authorization: `Bearer ${chef.zugang}`, 'if-none-match': marke },
    });
    expect(zweite.statusCode).toBe(304);
  });
});

describe('PATCH /foto/:id — sichten', () => {
  it('lässt nur die Verwaltung freigeben', async () => {
    const app = bauen();
    const guide = await mitgliedMitToken('malte@example.org', 'guide');
    const album = await albumAnlegen(app, guide.zugang);
    const foto = (await hochladen(app, guide.zugang, album.id, await bild())).json();

    const antwort = await app.inject({
      method: 'PATCH',
      url: `/foto/${foto.id}`,
      headers: { authorization: `Bearer ${guide.zugang}` },
      payload: { zustand: 'freigegeben' },
    });
    expect(antwort.statusCode).toBe(403);
  });

  it('nimmt ein abgelehntes Bild von der Homepage-Auswahl herunter', async () => {
    const app = bauen();
    const chef = await mitgliedMitToken('chef@example.org', 'verwaltung');
    const album = await albumAnlegen(app, chef.zugang);
    const foto = (await hochladen(app, chef.zugang, album.id, await bild())).json();

    const kopf = { authorization: `Bearer ${chef.zugang}` };
    await app.inject({ method: 'PATCH', url: `/foto/${foto.id}`, headers: kopf, payload: { zustand: 'freigegeben' } });
    await app.inject({ method: 'PATCH', url: `/foto/${foto.id}`, headers: kopf, payload: { fuerHomepage: true } });

    const abgelehnt = await app.inject({
      method: 'PATCH',
      url: `/foto/${foto.id}`,
      headers: kopf,
      payload: { zustand: 'abgelehnt' },
    });

    // Sonst stünde ein abgelehntes Bild auf der Vereinsseite — der
    // Widerspruch, den niemand bemerkt, bis er auf der Startseite steht.
    expect(abgelehnt.json().fuerHomepage).toBe(false);
  });

  it('weigert sich, ein noch nicht freigegebenes Bild für die Homepage vorzumerken', async () => {
    const app = bauen();
    const chef = await mitgliedMitToken('chef@example.org', 'verwaltung');
    const album = await albumAnlegen(app, chef.zugang);
    const foto = (await hochladen(app, chef.zugang, album.id, await bild())).json();

    const antwort = await app.inject({
      method: 'PATCH',
      url: `/foto/${foto.id}`,
      headers: { authorization: `Bearer ${chef.zugang}` },
      payload: { fuerHomepage: true },
    });
    expect(antwort.statusCode).toBe(409);
  });
});

describe('DELETE /foto/:id', () => {
  it('lässt den Hochladenden sein Bild zurückziehen, solange es neu ist', async () => {
    const app = bauen();
    const chef = await mitgliedMitToken('chef@example.org', 'verwaltung');
    const anna = await mitgliedMitToken('anna@example.org');
    const album = await albumAnlegen(app, chef.zugang);
    const foto = (await hochladen(app, anna.zugang, album.id, await bild())).json();

    const antwort = await app.inject({
      method: 'DELETE',
      url: `/foto/${foto.id}`,
      headers: { authorization: `Bearer ${anna.zugang}` },
    });

    expect(antwort.statusCode).toBe(204);
    expect(await fs.readdir(path.join(wurzel, album.id))).toEqual([]);
  });

  it('lässt die Verwaltung jedes Bild löschen — auch ein freigegebenes', async () => {
    // Ausdrückliche Anforderung des Vereins: ohne Einschränkung und ohne
    // Begründungszwang.
    const app = bauen();
    const chef = await mitgliedMitToken('chef@example.org', 'verwaltung');
    const anna = await mitgliedMitToken('anna@example.org');
    const album = await albumAnlegen(app, chef.zugang);
    const foto = (await hochladen(app, anna.zugang, album.id, await bild())).json();

    await app.inject({
      method: 'PATCH',
      url: `/foto/${foto.id}`,
      headers: { authorization: `Bearer ${chef.zugang}` },
      payload: { zustand: 'freigegeben' },
    });

    const antwort = await app.inject({
      method: 'DELETE',
      url: `/foto/${foto.id}`,
      headers: { authorization: `Bearer ${chef.zugang}` },
    });
    expect(antwort.statusCode).toBe(204);
  });

  it('verbirgt fremde unfreigegebene Bilder auch beim Löschen mit 404', async () => {
    const app = bauen();
    const chef = await mitgliedMitToken('chef@example.org', 'verwaltung');
    const anna = await mitgliedMitToken('anna@example.org');
    const bernd = await mitgliedMitToken('bernd@example.org');
    const album = await albumAnlegen(app, chef.zugang);
    const foto = (await hochladen(app, anna.zugang, album.id, await bild())).json();

    const antwort = await app.inject({
      method: 'DELETE',
      url: `/foto/${foto.id}`,
      headers: { authorization: `Bearer ${bernd.zugang}` },
    });
    expect(antwort.statusCode).toBe(404);
  });
});

describe('POST /foto/:id/melden', () => {
  it('nimmt eine Meldung an und die zweite still auch', async () => {
    const app = bauen();
    const chef = await mitgliedMitToken('chef@example.org', 'verwaltung');
    const anna = await mitgliedMitToken('anna@example.org');
    const album = await albumAnlegen(app, chef.zugang);
    const foto = (await hochladen(app, anna.zugang, album.id, await bild())).json();

    const melden = () =>
      app.inject({
        method: 'POST',
        url: `/foto/${foto.id}/melden`,
        headers: { authorization: `Bearer ${anna.zugang}` },
        payload: { grund: 'Da ist mein Kind drauf.' },
      });

    expect((await melden()).statusCode).toBe(204);
    expect((await melden()).statusCode).toBe(204);

    const { rows } = await pool.query('SELECT * FROM foto_meldung WHERE foto_id = $1', [foto.id]);
    expect(rows).toHaveLength(1);
  });
});

describe('GET /fotoalbum/:id', () => {
  it('zeigt jedem nur die Bilder, die er sehen darf', async () => {
    const app = bauen();
    const chef = await mitgliedMitToken('chef@example.org', 'verwaltung');
    const anna = await mitgliedMitToken('anna@example.org');
    const bernd = await mitgliedMitToken('bernd@example.org');
    const album = await albumAnlegen(app, chef.zugang);

    const eins = (await hochladen(app, anna.zugang, album.id, await bild(60))).json();
    await hochladen(app, anna.zugang, album.id, await bild(61));

    await app.inject({
      method: 'PATCH',
      url: `/foto/${eins.id}`,
      headers: { authorization: `Bearer ${chef.zugang}` },
      payload: { zustand: 'freigegeben' },
    });

    const fuerBernd = await app.inject({
      method: 'GET',
      url: `/fotoalbum/${album.id}`,
      headers: { authorization: `Bearer ${bernd.zugang}` },
    });
    const fuerAnna = await app.inject({
      method: 'GET',
      url: `/fotoalbum/${album.id}`,
      headers: { authorization: `Bearer ${anna.zugang}` },
    });
    const fuerChef = await app.inject({
      method: 'GET',
      url: `/fotoalbum/${album.id}`,
      headers: { authorization: `Bearer ${chef.zugang}` },
    });

    expect(fuerBernd.json().fotos).toHaveLength(1); // nur das freigegebene
    expect(fuerAnna.json().fotos).toHaveLength(2); // ihre eigenen beide
    expect(fuerChef.json().fotos).toHaveLength(2); // die Verwaltung sieht alles
  });
});
