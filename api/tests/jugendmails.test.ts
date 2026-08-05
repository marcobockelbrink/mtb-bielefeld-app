import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { pool } from '../src/datenbank.ts';
import { baueAbsage, baueGuideAnfrage, baueVeroeffentlichung, holeAbonnenten, setzeAbonnement } from '../src/jugendmails.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

const training = {
  id: 'abc',
  beginntAm: new Date('2026-08-09T08:30:00Z'),
  endetAm: null,
  ort: 'Wanderparkplatz Kalkofen',
  hinweis: null,
  plaetze: null,
  guidesNoetig: 2,
  zustand: 'veroeffentlicht' as const,
  absagegrund: null,
  angelegtVon: 'x',
};

describe('baueGuideAnfrage', () => {
  it('nennt Tag, Uhrzeit und Ort in Vereinszeit', () => {
    // 08:30 UTC sind 10:30 in Bielefeld. Wer hier UTC anzeigt, schickt
    // Guides zwei Stunden zu früh los.
    const { text } = baueGuideAnfrage(training);
    expect(text).toContain('Sonntag, 9. August');
    expect(text).toContain('10:30');
    expect(text).toContain('Wanderparkplatz Kalkofen');
  });

  it('sagt, wie viele Guides gebraucht werden', () => {
    expect(baueGuideAnfrage(training).text).toContain('2');
  });
});

describe('baueAbsage', () => {
  it('nennt den Grund — eine Absage ohne Warum lässt Familien rätseln', () => {
    const { text } = baueAbsage({ ...training, zustand: 'abgesagt', absagegrund: 'Dauerregen' });
    expect(text).toContain('Dauerregen');
  });
});

describe('Umlaute', () => {
  it('bleiben erhalten', () => {
    expect(baueVeroeffentlichung(training).text).toMatch(/[äöüß]/);
  });
});

describe('holeAbonnenten und setzeAbonnement', () => {
  beforeEach(async () => {
    await frischeDatenbank();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('liefert nur, wer den Schalter eingeschaltet hat', async () => {
    await pool.query("INSERT INTO mitglied (email) VALUES ('an@example.org'), ('aus@example.org')");
    const { rows } = await pool.query<{ id: string }>(
      "SELECT id FROM mitglied WHERE email = 'an@example.org'",
    );
    const anId = rows[0]!.id;
    await setzeAbonnement(pool, anId, true);

    expect(await holeAbonnenten(pool)).toEqual(['an@example.org']);

    // Auch das Zurückschalten muss ankommen, nicht nur das Einschalten.
    await setzeAbonnement(pool, anId, false);
    expect(await holeAbonnenten(pool)).toEqual([]);
  });
});
