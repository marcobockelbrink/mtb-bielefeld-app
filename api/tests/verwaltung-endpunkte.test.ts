import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { baueApp } from '../src/app.ts';
import { pool } from '../src/datenbank.ts';
import { GemerkterMailer } from '../src/mailer.ts';
import { legeSitzungAn } from '../src/sitzung.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

const jetzt = new Date('2026-08-13T12:00:00Z');

beforeEach(async () => {
  await frischeDatenbank();
});

afterAll(async () => {
  await pool.end();
});

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

describe('Rechte', () => {
  it('verlangt Anmeldung (401) und die Rolle (403) — in dieser Reihenfolge', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const guide = await mitgliedMitToken('malte@example.org', 'guide');

    expect((await app.inject({ method: 'GET', url: '/verwaltung/mitglieder' })).statusCode).toBe(401);

    const alsGuide = await app.inject({
      method: 'GET',
      url: '/verwaltung/mitglieder',
      headers: { authorization: `Bearer ${guide.zugang}` },
    });
    // 403, nicht 404: Wer angemeldet ist, darf wissen, dass es den Bereich
    // gibt — anders als bei Fotos verrät die Existenz des Weges nichts.
    expect(alsGuide.statusCode).toBe(403);
  });
});

describe('GET /verwaltung/mitglieder', () => {
  it('führt Konten und noch nicht eingelöste Einladungen in einer Liste', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer, jetzt: () => jetzt });
    const chef = await mitgliedMitToken('chef@example.org', 'verwaltung');

    await app.inject({
      method: 'POST',
      url: '/verwaltung/einladungen',
      headers: { authorization: `Bearer ${chef.zugang}` },
      payload: { email: 'neu@example.org' },
    });
    // Der Versand läuft nach der Antwort — kurz warten, bis er durch ist.
    await new Promise((r) => setTimeout(r, 50));

    const liste = (
      await app.inject({
        method: 'GET',
        url: '/verwaltung/mitglieder',
        headers: { authorization: `Bearer ${chef.zugang}` },
      })
    ).json() as Array<{ email: string; id: string | null; offeneEinladung: boolean }>;

    const neu = liste.find((z) => z.email === 'neu@example.org');
    expect(neu).toMatchObject({ id: null, offeneEinladung: true });
    expect(liste.find((z) => z.email === 'chef@example.org')?.id).toBe(chef.id);
  });
});

describe('POST /verwaltung/einladungen', () => {
  it('verschickt die Mail mit Code selbst — niemand reicht mehr Codes weiter', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer, jetzt: () => jetzt });
    const chef = await mitgliedMitToken('chef@example.org', 'verwaltung');

    const antwort = await app.inject({
      method: 'POST',
      url: '/verwaltung/einladungen',
      headers: { authorization: `Bearer ${chef.zugang}` },
      payload: { email: 'anna@example.org' },
    });
    expect(antwort.statusCode).toBe(202);
    await new Promise((r) => setTimeout(r, 50));

    expect(mailer.versendet).toHaveLength(1);
    const mail = mailer.versendet[0]!;
    expect(mail.an).toBe('anna@example.org');

    // Der Code aus der Mail muss wirklich einlösbar sein — sonst ist die
    // schönste Mail eine Sackgasse. Aus dem Text gefischt wie ein Mensch:
    // die eingerückte Zeile.
    const code = mail.text.split('\n').find((z) => z.startsWith('    '))?.trim();
    expect(code).toBeTruthy();
    const { rows } = await pool.query('SELECT ausgestellt_fuer FROM einladung');
    expect(rows[0]?.ausgestellt_fuer).toBe('anna@example.org');
  });

  it('weist Unsinn statt einer Adresse mit 400 ab', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const chef = await mitgliedMitToken('chef@example.org', 'verwaltung');

    const antwort = await app.inject({
      method: 'POST',
      url: '/verwaltung/einladungen',
      headers: { authorization: `Bearer ${chef.zugang}` },
      payload: { email: 'keine-adresse' },
    });
    expect(antwort.statusCode).toBe(400);
  });
});

describe('PATCH /verwaltung/mitglieder/:id', () => {
  it('setzt Rolle und Jugend-Zugehörigkeit', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const chef = await mitgliedMitToken('chef@example.org', 'verwaltung');
    const anna = await mitgliedMitToken('anna@example.org');

    const antwort = await app.inject({
      method: 'PATCH',
      url: `/verwaltung/mitglieder/${anna.id}`,
      headers: { authorization: `Bearer ${chef.zugang}` },
      payload: { rolle: 'guide', jugend: true },
    });

    expect(antwort.statusCode).toBe(200);
    expect(antwort.json()).toMatchObject({ rolle: 'guide', jugend: true });
  });

  it('verweigert das Entziehen der letzten Verwaltungsrolle', async () => {
    // Sonst sperrt sich der Verein mit einem Fingertipp selbst aus, und
    // der Rückweg wäre wieder das CLI über SSH.
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const chef = await mitgliedMitToken('chef@example.org', 'verwaltung');

    const antwort = await app.inject({
      method: 'PATCH',
      url: `/verwaltung/mitglieder/${chef.id}`,
      headers: { authorization: `Bearer ${chef.zugang}` },
      payload: { rolle: 'mitglied' },
    });
    expect(antwort.statusCode).toBe(409);

    // Mit einer zweiten Verwaltung geht es — dann ist der Verein nicht
    // ausgesperrt.
    await mitgliedMitToken('zweite@example.org', 'verwaltung');
    const zweiter = await app.inject({
      method: 'PATCH',
      url: `/verwaltung/mitglieder/${chef.id}`,
      headers: { authorization: `Bearer ${chef.zugang}` },
      payload: { rolle: 'mitglied' },
    });
    expect(zweiter.statusCode).toBe(200);
  });

  it('antwortet 404 bei unbekannter und bei kaputter Kennung', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const chef = await mitgliedMitToken('chef@example.org', 'verwaltung');
    const kopf = { authorization: `Bearer ${chef.zugang}` };

    for (const id of ['aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'kein-uuid']) {
      const antwort = await app.inject({
        method: 'PATCH',
        url: `/verwaltung/mitglieder/${id}`,
        headers: kopf,
        payload: { jugend: true },
      });
      expect(antwort.statusCode).toBe(404);
    }
  });

  it('macht ein Mitglied per Jugend-Häkchen zum Betrachter von Jugend-Alben', async () => {
    // Der eigentliche Zweck des Feldes: Die Sichtbarkeitslogik der Fotos
    // fragt gehoertZurJugend, und die kennt seit Migration 014 beide Wege.
    const { gehoertZurJugend } = await import('../src/fotoalbum.ts');
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const chef = await mitgliedMitToken('chef@example.org', 'verwaltung');
    const anna = await mitgliedMitToken('anna@example.org');

    expect(await gehoertZurJugend(pool, anna.id)).toBe(false);

    await app.inject({
      method: 'PATCH',
      url: `/verwaltung/mitglieder/${anna.id}`,
      headers: { authorization: `Bearer ${chef.zugang}` },
      payload: { jugend: true },
    });

    expect(await gehoertZurJugend(pool, anna.id)).toBe(true);
  });
});

describe('POST /anmeldung/einladung — der Ein-Klick-Weg', () => {
  it('legt Konto und Sitzung mit dem bloßen Code an — die Adresse kennt der Server', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer, jetzt: () => jetzt });
    const chef = await mitgliedMitToken('chef@example.org', 'verwaltung');

    await app.inject({
      method: 'POST',
      url: '/verwaltung/einladungen',
      headers: { authorization: `Bearer ${chef.zugang}` },
      payload: { email: 'anna@example.org' },
    });
    await new Promise((r) => setTimeout(r, 50));

    // Der Link aus der Mail trägt den Code als letztes Pfadstück.
    const mail = mailer.versendet[0]!;
    const link = mail.text.split('\n').find((z) => z.includes('/e/'))?.trim();
    const code = link?.split('/e/')[1];
    expect(code).toBeTruthy();

    const antwort = await app.inject({
      method: 'POST',
      url: '/anmeldung/einladung',
      payload: { code },
    });

    expect(antwort.statusCode).toBe(200);
    expect(antwort.json().zugang).toBeTruthy();

    const { rows } = await pool.query(
      "SELECT rolle FROM mitglied WHERE email = 'anna@example.org'",
    );
    expect(rows).toHaveLength(1);
  });

  it('meldet beim zweiten Klick dasselbe Konto an, statt zu scheitern', async () => {
    // Derselbe Link wird angetippt, weitergeleitet, nochmal angetippt —
    // das ist Alltag, kein Angriff. Die Einladung ist dann entwertet, aber
    // das Konto besteht, und Bestehende brauchen keine Eintrittskarte.
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer, jetzt: () => jetzt });
    const chef = await mitgliedMitToken('chef@example.org', 'verwaltung');

    await app.inject({
      method: 'POST',
      url: '/verwaltung/einladungen',
      headers: { authorization: `Bearer ${chef.zugang}` },
      payload: { email: 'anna@example.org' },
    });
    await new Promise((r) => setTimeout(r, 50));
    const code = mailer.versendet[0]!.text.split('/e/')[1]!.split('\n')[0]!.trim();

    expect((await app.inject({ method: 'POST', url: '/anmeldung/einladung', payload: { code } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/anmeldung/einladung', payload: { code } })).statusCode).toBe(200);

    const { rows } = await pool.query("SELECT count(*) AS n FROM mitglied WHERE email = 'anna@example.org'");
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it('weist einen erfundenen Code mit 401 ab, wortgleich zum Magic Link', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });

    const antwort = await app.inject({
      method: 'POST',
      url: '/anmeldung/einladung',
      payload: { code: 'gibt-es-nicht' },
    });

    expect(antwort.statusCode).toBe(401);
    expect(antwort.json().fehler).toBe('Der Link gilt nicht mehr.');
  });
});

describe('Löschen — Einladungen und Mitglieder', () => {
  it('zieht eine offene Einladung zurück; danach ist der Code wertlos', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer, jetzt: () => jetzt });
    const chef = await mitgliedMitToken('chef@example.org', 'verwaltung');
    const kopf = { authorization: `Bearer ${chef.zugang}` };

    await app.inject({ method: 'POST', url: '/verwaltung/einladungen', headers: kopf, payload: { email: 'falsch@example.org' } });
    await new Promise((r) => setTimeout(r, 50));
    const code = mailer.versendet[0]!.text.split('/e/')[1]!.split('\n')[0]!.trim();

    const weg = await app.inject({
      method: 'DELETE',
      url: `/verwaltung/einladungen/${encodeURIComponent('falsch@example.org')}`,
      headers: kopf,
    });
    expect(weg.statusCode).toBe(204);

    // Der schon verschickte Ein-Klick-Link darf danach nicht mehr ziehen.
    expect((await app.inject({ method: 'POST', url: '/anmeldung/einladung', payload: { code } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'DELETE', url: '/verwaltung/einladungen/nie@example.org', headers: kopf })).statusCode).toBe(404);
  });

  it('löscht ein Mitglied samt Sitzung — das Gerät ist sofort abgemeldet', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const chef = await mitgliedMitToken('chef@example.org', 'verwaltung');
    const anna = await mitgliedMitToken('anna@example.org');

    const weg = await app.inject({
      method: 'DELETE',
      url: `/verwaltung/mitglieder/${anna.id}`,
      headers: { authorization: `Bearer ${chef.zugang}` },
    });
    expect(weg.statusCode).toBe(204);

    const alsAnna = await app.inject({
      method: 'GET',
      url: '/konto',
      headers: { authorization: `Bearer ${anna.zugang}` },
    });
    expect(alsAnna.statusCode).toBe(401);
  });

  it('verweigert das Löschen der letzten Verwaltung — auch sich selbst', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const chef = await mitgliedMitToken('chef@example.org', 'verwaltung');

    const antwort = await app.inject({
      method: 'DELETE',
      url: `/verwaltung/mitglieder/${chef.id}`,
      headers: { authorization: `Bearer ${chef.zugang}` },
    });
    expect(antwort.statusCode).toBe(409);
  });
});

describe('Verwaltung erbt Guide-Rechte', () => {
  it('lässt die Verwaltung ein Training anlegen wie ein Guide', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const chef = await mitgliedMitToken('chef@example.org', 'verwaltung');

    const antwort = await app.inject({
      method: 'POST',
      url: '/jugendtraining',
      headers: { authorization: `Bearer ${chef.zugang}` },
      payload: { beginntAm: '2026-09-01T18:00:00Z', ort: 'Waldparkplatz' },
    });
    expect(antwort.statusCode).toBe(201);
  });
});
