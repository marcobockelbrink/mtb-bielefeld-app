import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { baueApp } from '../src/app.ts';
import { pool } from '../src/datenbank.ts';
import { GemerkterMailer, type Mailer } from '../src/mailer.ts';
import { GemerktesProtokoll, type Protokoll } from '../src/protokoll.ts';
import { legeSitzungAn } from '../src/sitzung.ts';
import { erzeugeTerminDienst, terminSchluessel, type TerminDienst } from '../src/termine.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

const jetzt = new Date('2026-08-03T12:00:00Z');
const stillesProtokoll: Protokoll = { error: () => {}, info: () => {} };

/**
 * Vier Termine, wie der Verein sie schreibt: einer mit Plätzen und Gästen,
 * einer nur für Mitglieder, einer abgesagt, einer schon gefahren.
 */
const KALENDER = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'UID:offen@test',
  'DTSTART;TZID=Europe/Berlin:20260813T180000',
  'DTEND;TZID=Europe/Berlin:20260813T200000',
  'SUMMARY:Oerli Runde',
  'DESCRIPTION:Plätze: 2\\nGäste: ja',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:intern@test',
  'DTSTART;TZID=Europe/Berlin:20260814T180000',
  'DTEND;TZID=Europe/Berlin:20260814T200000',
  'SUMMARY:Vereinsrunde',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:abgesagt@test',
  'DTSTART;TZID=Europe/Berlin:20260815T180000',
  'DTEND;TZID=Europe/Berlin:20260815T200000',
  'SUMMARY:-ABGESAGT- Regenrunde',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:vergangen@test',
  'DTSTART;TZID=Europe/Berlin:20260720T180000',
  'DTEND;TZID=Europe/Berlin:20260720T200000',
  'SUMMARY:Julirunde',
  'DESCRIPTION:Plätze: 5\\nGäste: ja',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

function dienst(): TerminDienst {
  return erzeugeTerminDienst({
    ladeKalender: async () => KALENDER,
    protokoll: stillesProtokoll,
    jetzt: () => jetzt,
  });
}

function bauen(mailer: Mailer = new GemerkterMailer(), protokoll?: Protokoll) {
  return baueApp({ pool, mailer, jetzt: () => jetzt, terminDienst: dienst(), protokoll });
}

/** Der Schlüssel des offenen Termins, so wie ihn die App berechnen würde. */
async function offenerSchluessel(): Promise<string> {
  const termine = await dienst().holeTermine();
  const offen = termine.find((t) => t.uid === 'offen@test');
  return terminSchluessel(offen!);
}

async function mitgliedMitToken(email: string, rolle: 'mitglied' | 'guide' = 'mitglied') {
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO mitglied (email, rolle) VALUES ($1, $2) RETURNING id',
    [email, rolle],
  );
  const token = await legeSitzungAn(pool, rows[0]!.id, jetzt);
  return { id: rows[0]!.id, zugang: token.zugang };
}

beforeEach(async () => {
  await frischeDatenbank();
});

afterAll(async () => {
  await pool.end();
});

describe('GET /termine/:schluessel', () => {
  it('zeigt jedem die Belegung, aber keine Teilnehmer', async () => {
    const app = bauen();
    const antwort = await app.inject({ method: 'GET', url: `/termine/${await offenerSchluessel()}` });

    expect(antwort.statusCode).toBe(200);
    expect(antwort.json()).toEqual({
      belegt: 0,
      plaetze: 2,
      frei: 2,
      gaesteErlaubt: true,
      abgesagt: false,
    });
    await app.close();
  });

  it('zeigt der Guide-Rolle die Teilnehmer', async () => {
    const app = bauen();
    const s = await offenerSchluessel();
    const { zugang } = await mitgliedMitToken('guide@example.org', 'guide');
    const { zugang: mitgliedZugang } = await mitgliedMitToken('malte@example.org');

    await app.inject({
      method: 'POST',
      url: `/termine/${s}`,
      headers: { authorization: `Bearer ${mitgliedZugang}` },
    });

    const antwort = await app.inject({
      method: 'GET',
      url: `/termine/${s}`,
      headers: { authorization: `Bearer ${zugang}` },
    });

    expect(antwort.json().teilnehmer).toEqual([{ anzeige: 'malte@example.org', gast: false }]);
    await app.close();
  });

  it('zeigt einem gewöhnlichen Mitglied keine Teilnehmer — die Rolle entscheidet', async () => {
    const app = bauen();
    const { zugang } = await mitgliedMitToken('malte@example.org');

    const antwort = await app.inject({
      method: 'GET',
      url: `/termine/${await offenerSchluessel()}`,
      headers: { authorization: `Bearer ${zugang}` },
    });

    expect(antwort.json().teilnehmer).toBeUndefined();
    await app.close();
  });

  it('antwortet 404 auf einen unbekannten Schlüssel', async () => {
    const app = bauen();
    const antwort = await app.inject({ method: 'GET', url: '/termine/gibtsnicht~0' });

    expect(antwort.statusCode).toBe(404);
    expect(antwort.json().fehler).toBe('Diesen Termin gibt es nicht.');
    await app.close();
  });
});

describe('POST /termine/:schluessel — Mitglieder', () => {
  it('meldet mit Bearer an', async () => {
    const app = bauen();
    const { zugang } = await mitgliedMitToken('malte@example.org');

    const antwort = await app.inject({
      method: 'POST',
      url: `/termine/${await offenerSchluessel()}`,
      headers: { authorization: `Bearer ${zugang}` },
    });

    expect(antwort.statusCode).toBe(201);
    expect(antwort.json()).toEqual({ belegt: 1 });
    await app.close();
  });

  it('lehnt einen schon gefahrenen Termin ab', async () => {
    const app = bauen();
    const termine = await dienst().holeTermine();
    const vergangen = termine.find((t) => t.uid === 'vergangen@test');
    const { zugang } = await mitgliedMitToken('malte@example.org');

    const antwort = await app.inject({
      method: 'POST',
      url: `/termine/${terminSchluessel(vergangen!)}`,
      headers: { authorization: `Bearer ${zugang}` },
    });

    expect(antwort.statusCode).toBe(409);
    expect(antwort.json().fehler).toBe('Dieser Termin liegt in der Vergangenheit.');
    await app.close();
  });

  it('antwortet bei vollem Termin 409 mit Belegung', async () => {
    const app = bauen();
    const s = await offenerSchluessel();
    for (const email of ['a@example.org', 'b@example.org']) {
      const { zugang } = await mitgliedMitToken(email);
      await app.inject({ method: 'POST', url: `/termine/${s}`, headers: { authorization: `Bearer ${zugang}` } });
    }
    const { zugang } = await mitgliedMitToken('c@example.org');

    const antwort = await app.inject({
      method: 'POST',
      url: `/termine/${s}`,
      headers: { authorization: `Bearer ${zugang}` },
    });

    expect(antwort.statusCode).toBe(409);
    expect(antwort.json()).toEqual({ fehler: 'Die Tour ist voll.', belegt: 2, plaetze: 2 });
    await app.close();
  });

  it('lehnt eine doppelte Anmeldung desselben Mitglieds weiterhin ehrlich mit 409 ab', async () => {
    const app = bauen();
    const s = await offenerSchluessel();
    const { zugang } = await mitgliedMitToken('malte@example.org');
    const anmeldung = {
      method: 'POST' as const,
      url: `/termine/${s}`,
      headers: { authorization: `Bearer ${zugang}` },
    };

    await app.inject(anmeldung);
    const zweite = await app.inject(anmeldung);

    // Anders als beim Gast-Pfad (siehe unten): Wer mit Token anfragt, fragt
    // nach dem eigenen Zustand. „Du bist schon angemeldet." ist hier die
    // richtige, hilfreiche Antwort — kein Orakel über eine fremde Adresse,
    // weil Mitglieder nicht für andere anfragen können.
    expect(zweite.statusCode).toBe(409);
    expect(zweite.json().fehler).toBe('Du bist schon angemeldet.');
    await app.close();
  });
});

describe('POST /termine/:schluessel — Gäste', () => {
  it('meldet mit Einwilligung an und schickt den Storno-Link, der genau einmal gilt', async () => {
    const mailer = new GemerkterMailer();
    const app = bauen(mailer);
    const s = await offenerSchluessel();

    const antwort = await app.inject({
      method: 'POST',
      url: `/termine/${s}`,
      payload: { gastName: 'Traute', gastEmail: 'traute@example.org', einwilligung: true },
    });

    expect(antwort.statusCode).toBe(201);
    expect(mailer.versendet).toHaveLength(1);
    expect(mailer.versendet[0]?.an).toBe('traute@example.org');

    const token = mailer.versendet[0]?.text.match(/\/gast\/storno\/([A-Za-z0-9_-]+)/)?.[1];
    expect(token).toBeDefined();

    const storno = await app.inject({ method: 'GET', url: `/gast/storno/${token}` });
    expect(storno.statusCode).toBe(200);
    expect(storno.body).toContain('storniert');

    const nochmal = await app.inject({ method: 'GET', url: `/gast/storno/${token}` });
    expect(nochmal.statusCode).toBe(404);
    await app.close();
  });

  it('täuscht bei einer zweiten Anmeldung derselben Adresse am selben Termin Erfolg vor', async () => {
    const mailer = new GemerkterMailer();
    const protokoll = new GemerktesProtokoll();
    const app = bauen(mailer, protokoll);
    const s = await offenerSchluessel();
    const anmeldung = {
      method: 'POST' as const,
      url: `/termine/${s}`,
      payload: { gastName: 'Traute', gastEmail: 'traute@example.org', einwilligung: true },
    };

    const erste = await app.inject(anmeldung);
    const zweite = await app.inject(anmeldung);

    // Kein unauthentifiziertes Teilnahme-Orakel mehr: Beide Antworten sehen
    // wie ein Erfolg aus — derselbe Statuscode, dieselbe Körpergestalt. Wer
    // die eigene Adresse noch einmal probiert, merkt nichts Abweichendes;
    // wer eine fremde Adresse durchprobiert, erfährt so auch nichts über sie.
    expect(erste.statusCode).toBe(201);
    expect(zweite.statusCode).toBe(201);
    expect(Object.keys(zweite.json()).sort()).toEqual(Object.keys(erste.json()).sort());
    expect(zweite.json()).toEqual({ belegt: 1 });

    // Keine zweite Mail und keine zweite Zeile: Der Unique-Index verhindert
    // ohnehin das Einfügen, sonst wäre der Doppelklick — oder das gezielte
    // Durchprobieren einer fremden Adresse — ein Werkzeug, um ein fremdes
    // Postfach zu fluten.
    expect(mailer.versendet).toHaveLength(1);
    const { rows } = await pool.query('SELECT id FROM tourenanmeldung');
    expect(rows).toHaveLength(1);

    // Laut im Protokoll bleibt es trotzdem — nur eben nicht als `error`,
    // sondern als Alltagsrauschen, an dem der Betreiber Missbrauchsmuster
    // erkennen kann.
    expect(protokoll.eintraege).toHaveLength(1);
    expect(protokoll.eintraege[0]?.daten).toMatchObject({
      an: 'traute@example.org',
      grund: 'schon-angemeldet',
    });
    await app.close();
  });

  it('täuscht bei der vierten Anmeldung derselben Adresse in der Stunde ebenfalls Erfolg vor', async () => {
    const mailer = new GemerkterMailer();
    const protokoll = new GemerktesProtokoll();
    const app = bauen(mailer, protokoll);

    // Drei Gastanmeldungen derselben Adresse zu drei anderen Terminen,
    // innerhalb der letzten Stunde — das Kontingent ist damit aufgebraucht.
    await pool.query(
      `INSERT INTO tourenanmeldung
         (terminschluessel, termin_start, gast_name, gast_email, storno_hash, angelegt_am)
       VALUES ('anderer~1', $1, 'Traute', 'traute@example.org', 'hash-1', $2),
              ('anderer~2', $1, 'Traute', 'traute@example.org', 'hash-2', $2),
              ('anderer~3', $1, 'Traute', 'traute@example.org', 'hash-3', $2)`,
      [new Date('2026-08-20T16:00:00Z'), new Date(jetzt.getTime() - 10 * 60 * 1000)],
    );

    const antwort = await app.inject({
      method: 'POST',
      url: `/termine/${await offenerSchluessel()}`,
      payload: { gastName: 'Traute', gastEmail: 'traute@example.org', einwilligung: true },
    });

    // Dasselbe Bild wie bei der Doppelanmeldung: 201 statt 429, sonst ließe
    // sich über eine fremde Adresse ausspähen, dass ihr Stundenfenster gerade
    // erschöpft ist.
    expect(antwort.statusCode).toBe(201);
    expect(antwort.json()).toEqual({ belegt: 0 });
    expect(mailer.versendet).toHaveLength(0);

    const { rows } = await pool.query('SELECT id FROM tourenanmeldung');
    expect(rows).toHaveLength(3);

    expect(protokoll.eintraege).toHaveLength(1);
    expect(protokoll.eintraege[0]?.daten).toMatchObject({
      an: 'traute@example.org',
      grund: 'zu-viele',
    });
    await app.close();
  });

  it('lehnt ohne Einwilligung ab, ohne etwas zu speichern', async () => {
    const mailer = new GemerkterMailer();
    const app = bauen(mailer);

    const antwort = await app.inject({
      method: 'POST',
      url: `/termine/${await offenerSchluessel()}`,
      payload: { gastName: 'Traute', gastEmail: 'traute@example.org' },
    });

    expect(antwort.statusCode).toBe(400);
    expect(mailer.versendet).toHaveLength(0);
    const { rows } = await pool.query('SELECT id FROM tourenanmeldung');
    expect(rows).toHaveLength(0);
    await app.close();
  });

  it('lehnt Gäste ab, wenn der Termin sie nicht erlaubt', async () => {
    const app = bauen();
    const termine = await dienst().holeTermine();
    const intern = termine.find((t) => t.uid === 'intern@test');

    const antwort = await app.inject({
      method: 'POST',
      url: `/termine/${terminSchluessel(intern!)}`,
      payload: { gastName: 'Traute', gastEmail: 'traute@example.org', einwilligung: true },
    });

    expect(antwort.statusCode).toBe(409);
    expect(antwort.json().fehler).toBe('Bei diesem Termin können sich nur Mitglieder anmelden.');
    await app.close();
  });

  it('lässt die Anmeldung bestehen, wenn die Storno-Mail scheitert', async () => {
    const kaputterMailer: Mailer = {
      sende: async () => {
        throw new Error('SMTP weg');
      },
    };
    const app = bauen(kaputterMailer);
    const s = await offenerSchluessel();

    const antwort = await app.inject({
      method: 'POST',
      url: `/termine/${s}`,
      payload: { gastName: 'Traute', gastEmail: 'traute@example.org', einwilligung: true },
    });

    expect(antwort.statusCode).toBe(201);
    const { rows } = await pool.query('SELECT id FROM tourenanmeldung WHERE storniert_am IS NULL');
    expect(rows).toHaveLength(1);
    await app.close();
  });
});

describe('DELETE /termine/:schluessel/ich', () => {
  it('meldet ab und macht den Platz frei', async () => {
    const app = bauen();
    const s = await offenerSchluessel();
    const { zugang } = await mitgliedMitToken('malte@example.org');
    await app.inject({ method: 'POST', url: `/termine/${s}`, headers: { authorization: `Bearer ${zugang}` } });

    const antwort = await app.inject({
      method: 'DELETE',
      url: `/termine/${s}/ich`,
      headers: { authorization: `Bearer ${zugang}` },
    });

    expect(antwort.statusCode).toBe(204);
    const danach = await app.inject({ method: 'GET', url: `/termine/${s}` });
    expect(danach.json().belegt).toBe(0);
    await app.close();
  });

  it('verlangt ein Token', async () => {
    const app = bauen();
    const antwort = await app.inject({
      method: 'DELETE',
      url: `/termine/${await offenerSchluessel()}/ich`,
    });

    expect(antwort.statusCode).toBe(401);
    await app.close();
  });

  it('antwortet 404, wenn gar keine Anmeldung storniert wurde', async () => {
    const app = bauen();
    const s = await offenerSchluessel();
    const { zugang } = await mitgliedMitToken('malte@example.org');

    const antwort = await app.inject({
      method: 'DELETE',
      url: `/termine/${s}/ich`,
      headers: { authorization: `Bearer ${zugang}` },
    });

    expect(antwort.statusCode).toBe(404);
    expect(antwort.json().fehler).toBe('Du bist bei diesem Termin nicht angemeldet.');
    await app.close();
  });

  it('antwortet beim zweiten Abmelden 404 statt noch einmal 204', async () => {
    const app = bauen();
    const s = await offenerSchluessel();
    const { zugang } = await mitgliedMitToken('malte@example.org');
    const kopf = { authorization: `Bearer ${zugang}` };
    await app.inject({ method: 'POST', url: `/termine/${s}`, headers: kopf });

    const erste = await app.inject({ method: 'DELETE', url: `/termine/${s}/ich`, headers: kopf });
    const zweite = await app.inject({ method: 'DELETE', url: `/termine/${s}/ich`, headers: kopf });

    expect(erste.statusCode).toBe(204);
    expect(zweite.statusCode).toBe(404);
    await app.close();
  });
});
