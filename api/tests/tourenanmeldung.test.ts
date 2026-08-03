import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { pool } from '../src/datenbank.ts';
import { terminSchluessel } from '../src/termine.ts';
import {
  holeBelegung,
  holeTeilnehmer,
  meldeAb,
  meldeAn,
  storniereGast,
} from '../src/tourenanmeldung.ts';
import type { ClubEvent } from '../../src/domain/types.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

const jetzt = new Date('2026-08-03T12:00:00Z');

/** Ein Termin, wie ihn der Kalenderdienst liefern würde. */
function termin(overrides: Partial<ClubEvent> = {}): ClubEvent {
  const start = new Date('2026-08-13T16:00:00Z');
  return {
    id: 'tour@test#' + start.getTime(),
    uid: 'tour@test',
    originalStartInstant: start.getTime(),
    title: 'Oerli Runde',
    start,
    end: new Date(start.getTime() + 2 * 60 * 60 * 1000),
    allDay: false,
    location: 'Wanderparkplatz Kalkofen',
    descriptionHtml: '',
    descriptionText: '',
    category: 'tour',
    levels: [],
    ladiesOnly: false,
    cancelled: false,
    recurring: false,
    details: { guides: [], maxParticipants: 2, gaesteErlaubt: true },
    ...overrides,
  };
}

async function mitglied(email: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO mitglied (email) VALUES ($1) RETURNING id',
    [email],
  );
  return rows[0]!.id;
}

beforeEach(async () => {
  await frischeDatenbank();
});

afterAll(async () => {
  await pool.end();
});

describe('meldeAn — Mitglieder', () => {
  it('meldet an und zählt die Belegung', async () => {
    const id = await mitglied('malte@example.org');
    const t = termin();

    const ergebnis = await meldeAn(pool, t, { mitgliedId: id }, jetzt);

    expect(ergebnis).toEqual({ ok: true, belegt: 1 });
    expect(await holeBelegung(pool, terminSchluessel(t))).toBe(1);
  });

  it('lehnt eine zweite Anmeldung desselben Mitglieds ab', async () => {
    const id = await mitglied('malte@example.org');
    const t = termin();

    await meldeAn(pool, t, { mitgliedId: id }, jetzt);
    const zweite = await meldeAn(pool, t, { mitgliedId: id }, jetzt);

    expect(zweite.ok).toBe(false);
    if (!zweite.ok) expect(zweite.grund).toBe('schon-angemeldet');
    expect(await holeBelegung(pool, terminSchluessel(t))).toBe(1);
  });

  it('lehnt ab, wenn der Termin voll ist — mit Belegung in der Antwort', async () => {
    const t = termin(); // 2 Plätze
    await meldeAn(pool, t, { mitgliedId: await mitglied('a@example.org') }, jetzt);
    await meldeAn(pool, t, { mitgliedId: await mitglied('b@example.org') }, jetzt);

    const dritte = await meldeAn(pool, t, { mitgliedId: await mitglied('c@example.org') }, jetzt);

    expect(dritte).toEqual({ ok: false, grund: 'voll', belegt: 2, plaetze: 2 });
  });

  it('lehnt einen abgesagten Termin ab', async () => {
    const t = termin({ cancelled: true });
    const ergebnis = await meldeAn(pool, t, { mitgliedId: await mitglied('a@example.org') }, jetzt);

    expect(ergebnis.ok).toBe(false);
    if (!ergebnis.ok) expect(ergebnis.grund).toBe('abgesagt');
  });

  it('lässt ohne Platzangabe beliebig viele zu', async () => {
    const t = termin({ details: { guides: [], gaesteErlaubt: true } });
    for (const email of ['a', 'b', 'c', 'd'].map((n) => `${n}@example.org`)) {
      const e = await meldeAn(pool, t, { mitgliedId: await mitglied(email) }, jetzt);
      expect(e.ok).toBe(true);
    }
  });

  it('zwei greifen gleichzeitig nach dem letzten Platz — nur einer bekommt ihn', async () => {
    const t = termin({ details: { guides: [], maxParticipants: 1 } });
    const [a, b] = await Promise.all([
      mitglied('a@example.org'),
      mitglied('b@example.org'),
    ]);

    const [erste, zweite] = await Promise.all([
      meldeAn(pool, t, { mitgliedId: a }, jetzt),
      meldeAn(pool, t, { mitgliedId: b }, jetzt),
    ]);

    const erfolge = [erste, zweite].filter((e) => e.ok);
    expect(erfolge).toHaveLength(1);
    expect(await holeBelegung(pool, terminSchluessel(t))).toBe(1);
  });
});

describe('meldeAn — Gäste', () => {
  it('meldet einen Gast an und gibt einmalig einen Storno-Token heraus', async () => {
    const t = termin();
    const ergebnis = await meldeAn(
      pool,
      t,
      { gastName: 'Traute', gastEmail: 'traute@example.org' },
      jetzt,
    );

    expect(ergebnis.ok).toBe(true);
    if (!ergebnis.ok) return;
    expect(typeof ergebnis.stornoToken).toBe('string');

    // In der Datenbank steht nur der Hash, nie der Klartext.
    const { rows } = await pool.query<{ storno_hash: string }>(
      'SELECT storno_hash FROM tourenanmeldung',
    );
    expect(rows[0]?.storno_hash).not.toBe(ergebnis.stornoToken);
    expect(rows[0]?.storno_hash).toHaveLength(64);
  });

  it('lehnt Gäste ab, wenn der Termin sie nicht erlaubt', async () => {
    const ohne = termin({ details: { guides: [], maxParticipants: 5 } });
    const ergebnis = await meldeAn(
      pool,
      ohne,
      { gastName: 'Traute', gastEmail: 'traute@example.org' },
      jetzt,
    );

    expect(ergebnis.ok).toBe(false);
    if (!ergebnis.ok) expect(ergebnis.grund).toBe('gaeste-nicht-erlaubt');
  });
});

describe('Abmelden und Storno', () => {
  it('macht den Platz wieder frei und erlaubt die Wiederanmeldung', async () => {
    const id = await mitglied('malte@example.org');
    const t = termin({ details: { guides: [], maxParticipants: 1 } });
    const s = terminSchluessel(t);

    await meldeAn(pool, t, { mitgliedId: id }, jetzt);
    await meldeAb(pool, s, id, jetzt);

    expect(await holeBelegung(pool, s)).toBe(0);
    const wieder = await meldeAn(pool, t, { mitgliedId: id }, jetzt);
    expect(wieder.ok).toBe(true);
  });

  it('storniert einen Gast über den Token — genau einmal', async () => {
    const t = termin();
    const ergebnis = await meldeAn(
      pool,
      t,
      { gastName: 'Traute', gastEmail: 'traute@example.org' },
      jetzt,
    );
    if (!ergebnis.ok || !ergebnis.stornoToken) throw new Error('Vorbedingung');

    expect(await storniereGast(pool, ergebnis.stornoToken, jetzt)).toBe(true);
    expect(await holeBelegung(pool, terminSchluessel(t))).toBe(0);
    expect(await storniereGast(pool, ergebnis.stornoToken, jetzt)).toBe(false);
    expect(await storniereGast(pool, 'ausgedacht', jetzt)).toBe(false);
  });
});

describe('holeTeilnehmer', () => {
  it('zeigt Mitglieder mit Adresse und Gäste mit Namen', async () => {
    const t = termin();
    await meldeAn(pool, t, { mitgliedId: await mitglied('malte@example.org') }, jetzt);
    await meldeAn(pool, t, { gastName: 'Traute', gastEmail: 'traute@example.org' }, jetzt);

    const liste = await holeTeilnehmer(pool, terminSchluessel(t));

    expect(liste).toHaveLength(2);
    expect(liste).toContainEqual({ anzeige: 'malte@example.org', gast: false });
    expect(liste).toContainEqual({ anzeige: 'Traute', gast: true });
  });
});
