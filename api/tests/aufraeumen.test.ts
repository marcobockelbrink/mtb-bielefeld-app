import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { raeumeAuf } from '../src/aufraeumen.ts';
import { pool } from '../src/datenbank.ts';
import { hashe } from '../src/token.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

const jetzt = new Date('2026-08-03T12:00:00Z');
const gestern = new Date('2026-08-02T12:00:00Z');

async function neuesMitglied(): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO mitglied (email) VALUES ('malte@example.org') RETURNING id",
  );
  return rows[0]!.id;
}

/** Legt eine Sitzung mit frei wählbaren Fristen an. */
async function sitzung(
  mitgliedId: string,
  erneuerungBis: Date,
  ersetztAm: Date | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO sitzung
       (mitglied_id, zugang_hash, erneuerung_hash, zugang_bis, erneuerung_bis, ersetzt_am)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      mitgliedId,
      hashe(`zugang-${Math.random()}`),
      hashe(`erneuerung-${Math.random()}`),
      erneuerungBis,
      erneuerungBis,
      ersetztAm,
    ],
  );
}

/**
 * Legt einen Magic Link mit frei wählbarem Anlege- und Ablaufzeitpunkt an.
 *
 * `angelegt_am` gehört hier ausdrücklich dazu: Daran hängt das Zählfenster
 * der Begrenzung, und genau darüber entscheidet sich, ob eine Zeile
 * weggeräumt werden darf.
 */
async function magicLink(angelegtAm: Date, gueltigBis: Date): Promise<void> {
  await pool.query(
    `INSERT INTO magic_link (token_hash, email, angelegt_am, gueltig_bis)
     VALUES ($1, 'malte@example.org', $2, $3)`,
    [hashe(`link-${Math.random()}`), angelegtAm, gueltigBis],
  );
}

/** Eine Gastanmeldung mit frei wählbarem Terminbeginn — fürs Fristen-Prüfen. */
async function gastanmeldung(schluessel: string, terminStart: Date): Promise<void> {
  await pool.query(
    `INSERT INTO tourenanmeldung
       (terminschluessel, termin_start, gast_name, gast_email, storno_hash, angelegt_am)
     VALUES ($1, $2, 'Traute', 'traute@example.org', $3, $4)`,
    [schluessel, terminStart, hashe(`storno-${schluessel}`), terminStart],
  );
}

/**
 * Eine Mitgliedsanmeldung mit frei wählbarem Terminbeginn — belegt, dass
 * die Frist wie im Kommentar versprochen für alle Anmeldungen gilt, nicht
 * nur für Gäste.
 */
async function mitgliedanmeldung(
  schluessel: string,
  terminStart: Date,
  mitgliedId: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO tourenanmeldung
       (terminschluessel, termin_start, mitglied_id, angelegt_am)
     VALUES ($1, $2, $3, $4)`,
    [schluessel, terminStart, mitgliedId, terminStart],
  );
}

beforeEach(async () => {
  await frischeDatenbank();
});

afterAll(async () => {
  await pool.end();
});

describe('raeumeAuf', () => {
  it('wirft abgelaufene Sitzungen weg', async () => {
    const id = await neuesMitglied();
    await sitzung(id, gestern, null);

    const bilanz = await raeumeAuf(pool, jetzt);

    expect(bilanz.sitzungen).toBe(1);
    const { rows } = await pool.query('SELECT id FROM sitzung');
    expect(rows).toHaveLength(0);
  });

  it('lässt ersetzte, aber noch gültige Sitzungen stehen', async () => {
    // Der wichtigste Test dieser Datei: Genau an einer solchen Zeile
    // erkennt die Wiederverwendungserkennung ein kopiertes Token. Wer sie
    // wegräumt, macht aus einem Alarm ein stilles „gilt nicht".
    const id = await neuesMitglied();
    const morgen = new Date('2026-08-04T12:00:00Z');
    await sitzung(id, morgen, gestern);

    const bilanz = await raeumeAuf(pool, jetzt);

    expect(bilanz.sitzungen).toBe(0);
    const { rows } = await pool.query('SELECT id FROM sitzung');
    expect(rows).toHaveLength(1);
  });

  it('wirft Magic Links weg, die auch für die Begrenzung wertlos sind', async () => {
    // Gestern angelegt, gestern abgelaufen: als Link nutzlos, und aus dem
    // Zählfenster der Begrenzung längst herausgefallen.
    await magicLink(gestern, gestern);

    const bilanz = await raeumeAuf(pool, jetzt);

    expect(bilanz.magicLinks).toBe(1);
    const { rows } = await pool.query('SELECT id FROM magic_link');
    expect(rows).toHaveLength(0);
  });

  it('lässt noch gültige Magic Links stehen', async () => {
    await magicLink(new Date('2026-08-03T11:55:00Z'), new Date('2026-08-03T12:10:00Z'));

    const bilanz = await raeumeAuf(pool, jetzt);

    expect(bilanz.magicLinks).toBe(0);
    const { rows } = await pool.query('SELECT id FROM magic_link');
    expect(rows).toHaveLength(1);
  });

  it('lässt abgelaufene Magic Links stehen, solange die Begrenzung auf ihnen zählt', async () => {
    // Der wichtigste Magic-Link-Test dieser Datei: Vor zwanzig Minuten
    // angelegt, seit fünf Minuten abgelaufen — als Link wertlos, für die
    // Begrenzung aber nicht. Die zählt eine Stunde zurück und braucht diese
    // Zeile noch. Wer sie hier wegräumt, macht aus „drei je Stunde" faktisch
    // das Drei- bis Vierfache, weil der Zeitgeber alle fünfzehn Minuten läuft.
    await magicLink(new Date('2026-08-03T11:40:00Z'), new Date('2026-08-03T11:55:00Z'));

    const bilanz = await raeumeAuf(pool, jetzt);

    expect(bilanz.magicLinks).toBe(0);
    const { rows } = await pool.query('SELECT id FROM magic_link');
    expect(rows).toHaveLength(1);
  });

  it('meldet null, wenn es nichts zu tun gibt', async () => {
    expect(await raeumeAuf(pool, jetzt)).toEqual({
      sitzungen: 0,
      magicLinks: 0,
      tourenanmeldungen: 0,
    });
  });
});

describe('raeumeAuf — Tourenanmeldungen', () => {
  it('löscht Anmeldungen 30 Tage nach dem Termin', async () => {
    const vor31Tagen = new Date(jetzt.getTime() - 31 * 24 * 60 * 60 * 1000);
    await gastanmeldung('alt~1', vor31Tagen);

    const bilanz = await raeumeAuf(pool, jetzt);

    expect(bilanz.tourenanmeldungen).toBe(1);
    const { rows } = await pool.query('SELECT id FROM tourenanmeldung');
    expect(rows).toHaveLength(0);
  });

  it('lässt Anmeldungen zu jüngeren Terminen stehen', async () => {
    const vor10Tagen = new Date(jetzt.getTime() - 10 * 24 * 60 * 60 * 1000);
    await gastanmeldung('frisch~1', vor10Tagen);

    const bilanz = await raeumeAuf(pool, jetzt);

    expect(bilanz.tourenanmeldungen).toBe(0);
    const { rows } = await pool.query('SELECT id FROM tourenanmeldung');
    expect(rows).toHaveLength(1);
  });

  it('löscht auch die Anmeldung eines Mitglieds 30 Tage nach dem Termin', async () => {
    // Die Frist gilt laut Kommentar bewusst für alle Anmeldungen, nicht nur
    // für Gäste — bisher war das nur behauptet, nicht geprüft.
    const id = await neuesMitglied();
    const vor31Tagen = new Date(jetzt.getTime() - 31 * 24 * 60 * 60 * 1000);
    await mitgliedanmeldung('alt~mitglied', vor31Tagen, id);

    const bilanz = await raeumeAuf(pool, jetzt);

    expect(bilanz.tourenanmeldungen).toBe(1);
    const { rows } = await pool.query('SELECT id FROM tourenanmeldung');
    expect(rows).toHaveLength(0);
  });

  it('löscht auch eine stornierte Anmeldung 30 Tage nach dem Termin', async () => {
    const vor31Tagen = new Date(jetzt.getTime() - 31 * 24 * 60 * 60 * 1000);
    await gastanmeldung('alt~storniert', vor31Tagen);
    await pool.query(
      `UPDATE tourenanmeldung SET storniert_am = $1 WHERE terminschluessel = 'alt~storniert'`,
      [vor31Tagen],
    );

    const bilanz = await raeumeAuf(pool, jetzt);

    expect(bilanz.tourenanmeldungen).toBe(1);
    const { rows } = await pool.query('SELECT id FROM tourenanmeldung');
    expect(rows).toHaveLength(0);
  });
});
