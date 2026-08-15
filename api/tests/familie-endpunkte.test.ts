import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { baueApp } from '../src/app.ts';
import { pool } from '../src/datenbank.ts';
import { HOECHSTENS_PROFILE } from '../src/familie.ts';
import { GemerkterMailer } from '../src/mailer.ts';
import { legeSitzungAn } from '../src/sitzung.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

const jetzt = new Date('2026-08-15T12:00:00Z');

beforeEach(async () => {
  await frischeDatenbank();
});

afterAll(async () => {
  await pool.end();
});

async function mitgliedMitToken(email: string) {
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO mitglied (email) VALUES ($1) RETURNING id',
    [email],
  );
  const token = await legeSitzungAn(pool, rows[0]!.id, jetzt);
  return { id: rows[0]!.id, zugang: token.zugang };
}

describe('POST /familie', () => {
  it('legt ein Kinderprofil an und schickt die Bestätigung an den Verwalter', async () => {
    // Der springende Punkt: Ohne eigene Adresse geht die Mail an das
    // Postfach der Eltern — eine Bestätigung an ein leeres Postfach liefe
    // ins Leere.
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer, jetzt: () => jetzt });
    const eltern = await mitgliedMitToken('eltern@example.org');

    const antwort = await app.inject({
      method: 'POST',
      url: '/familie',
      headers: { authorization: `Bearer ${eltern.zugang}` },
      payload: { art: 'kind', name: 'Mika', geburtsjahr: 2015, kannBilderHochladen: false },
    });

    expect(antwort.statusCode).toBe(201);
    expect(antwort.json().bestaetigungAn).toBe('eltern@example.org');
    expect(antwort.json().profil).toMatchObject({ name: 'Mika', kannBilderHochladen: false });
    expect(mailer.versendet[0]?.an).toBe('eltern@example.org');
  });

  it('schickt die Bestätigung ans Kind, wenn es eine eigene Adresse hat', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer, jetzt: () => jetzt });
    const eltern = await mitgliedMitToken('eltern@example.org');

    const antwort = await app.inject({
      method: 'POST',
      url: '/familie',
      headers: { authorization: `Bearer ${eltern.zugang}` },
      payload: { art: 'kind', name: 'Mika', email: 'mika@example.org' },
    });

    expect(antwort.json().bestaetigungAn).toBe('mika@example.org');
    expect(mailer.versendet[0]?.an).toBe('mika@example.org');
  });

  it('verlangt bei Erwachsenen eine Adresse — sonst käme niemand hinein', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const eltern = await mitgliedMitToken('eltern@example.org');

    const antwort = await app.inject({
      method: 'POST',
      url: '/familie',
      headers: { authorization: `Bearer ${eltern.zugang}` },
      payload: { art: 'erwachsen', name: 'Partner' },
    });
    expect(antwort.statusCode).toBe(400);
  });

  it('macht Erwachsene zu eigenständigen Konten, nicht zu verwalteten', async () => {
    // Ein Erwachsener untersteht niemandem — auch nicht dem, der ihn
    // angelegt hat. Sonst wäre „Familienmitglied hinzufügen" ein Weg,
    // fremde Konten zu kontrollieren.
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const eltern = await mitgliedMitToken('eltern@example.org');

    await app.inject({
      method: 'POST',
      url: '/familie',
      headers: { authorization: `Bearer ${eltern.zugang}` },
      payload: { art: 'erwachsen', name: 'Partner', email: 'partner@example.org' },
    });

    const liste = (
      await app.inject({
        method: 'GET',
        url: '/familie',
        headers: { authorization: `Bearer ${eltern.zugang}` },
      })
    ).json() as unknown[];
    expect(liste).toHaveLength(0);

    const { rows } = await pool.query('SELECT verwaltet_von FROM mitglied WHERE email = $1', [
      'partner@example.org',
    ]);
    expect(rows[0]?.verwaltet_von).toBeNull();
  });

  it('begrenzt die Zahl der Profile', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const eltern = await mitgliedMitToken('eltern@example.org');
    const kopf = { authorization: `Bearer ${eltern.zugang}` };

    for (let i = 0; i < HOECHSTENS_PROFILE; i += 1) {
      const a = await app.inject({
        method: 'POST',
        url: '/familie',
        headers: kopf,
        payload: { art: 'kind', name: `Kind ${i}` },
      });
      expect(a.statusCode).toBe(201);
    }

    const zuViel = await app.inject({
      method: 'POST',
      url: '/familie',
      headers: kopf,
      payload: { art: 'kind', name: 'Eins zu viel' },
    });
    expect(zuViel.statusCode).toBe(409);
  });
});

describe('PATCH und DELETE /familie/:id', () => {
  it('lässt nur die verwaltende Person ändern und löschen', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const eltern = await mitgliedMitToken('eltern@example.org');
    const fremd = await mitgliedMitToken('fremd@example.org');

    const profil = (
      await app.inject({
        method: 'POST',
        url: '/familie',
        headers: { authorization: `Bearer ${eltern.zugang}` },
        payload: { art: 'kind', name: 'Mika' },
      })
    ).json().profil as { id: string };

    // 404 statt 403: „gibt es nicht" und „gehört dir nicht" dürfen sich
    // nicht unterscheiden.
    const fremdVersuch = await app.inject({
      method: 'PATCH',
      url: `/familie/${profil.id}`,
      headers: { authorization: `Bearer ${fremd.zugang}` },
      payload: { name: 'Übernommen' },
    });
    expect(fremdVersuch.statusCode).toBe(404);

    const eigen = await app.inject({
      method: 'PATCH',
      url: `/familie/${profil.id}`,
      headers: { authorization: `Bearer ${eltern.zugang}` },
      payload: { name: 'Mika M.', kannBilderHochladen: true },
    });
    expect(eigen.statusCode).toBe(204);

    const weg = await app.inject({
      method: 'DELETE',
      url: `/familie/${profil.id}`,
      headers: { authorization: `Bearer ${eltern.zugang}` },
    });
    expect(weg.statusCode).toBe(204);
  });
});

describe('Upload-Recht', () => {
  it('weist ein Profil ohne Upload-Recht am Endpunkt ab, nicht nur im UI', async () => {
    // Ein Kinderprofil, bei dem der Knopf nur versteckt ist, lädt trotzdem
    // hoch, sobald jemand den Endpunkt direkt aufruft.
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const { rows } = await pool.query<{ id: string }>(
      "INSERT INTO mitglied (email, rolle, kann_bilder_hochladen) VALUES ('kind@example.org', 'guide', false) RETURNING id",
    );
    const token = await legeSitzungAn(pool, rows[0]!.id, jetzt);

    const album = (
      await app.inject({
        method: 'POST',
        url: '/fotoalbum',
        headers: { authorization: `Bearer ${token.zugang}` },
        payload: { titel: 'Tour', ereignisAm: '2026-07-12T00:00:00Z' },
      })
    ).json() as { id: string };

    const grenze = '----g';
    const antwort = await app.inject({
      method: 'POST',
      url: `/fotoalbum/${album.id}/fotos`,
      headers: {
        authorization: `Bearer ${token.zugang}`,
        'content-type': `multipart/form-data; boundary=${grenze}`,
      },
      payload: Buffer.concat([
        Buffer.from(
          `--${grenze}\r\nContent-Disposition: form-data; name="datei"; filename="b.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
        ),
        Buffer.from('egal'),
        Buffer.from(`\r\n--${grenze}--\r\n`),
      ]),
    });

    expect(antwort.statusCode).toBe(403);
    expect(antwort.json().fehler).toBe('Dieses Profil darf keine Bilder hochladen.');
  });
});
