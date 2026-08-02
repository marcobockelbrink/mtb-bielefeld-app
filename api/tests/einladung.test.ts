import { beforeEach, afterAll, describe, expect, it } from 'vitest';

import { pool } from '../src/datenbank.ts';
import {
  erzeugeEinladung,
  pruefeEinladung,
  verbraucheEinladung,
} from '../src/einladung.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

const jetzt = new Date('2026-08-02T12:00:00Z');

beforeEach(async () => {
  await frischeDatenbank();
});

afterAll(async () => {
  await pool.end();
});

/** Entwertet außerhalb einer laufenden Transaktion — nur für Tests. */
async function entwerte(einladungId: string, mitgliedId: string) {
  const verbindung = await pool.connect();
  try {
    return await verbraucheEinladung(verbindung, einladungId, mitgliedId, jetzt);
  } finally {
    verbindung.release();
  }
}

async function neuesMitglied(email: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO mitglied (email) VALUES ($1) RETURNING id',
    [email],
  );
  return rows[0]!.id;
}

describe('erzeugeEinladung', () => {
  it('gibt den Code im Klartext zurück, speichert aber nur den Hash', async () => {
    const code = await erzeugeEinladung(pool, 'malte@example.org', jetzt);

    const { rows } = await pool.query<{ code_hash: string }>(
      'SELECT code_hash FROM einladung',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.code_hash).not.toBe(code);
    expect(rows[0]?.code_hash).toHaveLength(64);
  });

  it('rechnet die Gültigkeit ab der eingespeisten Uhr, nicht ab der Systemzeit', async () => {
    await erzeugeEinladung(pool, 'malte@example.org', jetzt);

    const { rows } = await pool.query<{ gueltig_bis: Date }>(
      'SELECT gueltig_bis FROM einladung',
    );
    const erwartet = new Date(jetzt.getTime() + 60 * 24 * 60 * 60 * 1000);
    expect(rows[0]?.gueltig_bis.getTime()).toBe(erwartet.getTime());
  });
});

describe('pruefeEinladung', () => {
  it('nimmt einen frischen Code mit passender Adresse an', async () => {
    const code = await erzeugeEinladung(pool, 'malte@example.org', jetzt);

    const pruefung = await pruefeEinladung(pool, code, 'malte@example.org', jetzt);
    expect(pruefung.ok).toBe(true);
  });

  it('verbraucht den Code beim Prüfen nicht', async () => {
    const code = await erzeugeEinladung(pool, 'malte@example.org', jetzt);

    await pruefeEinladung(pool, code, 'malte@example.org', jetzt);
    await pruefeEinladung(pool, code, 'malte@example.org', jetzt);

    // Prüfen ist folgenlos — sonst wäre ein nie angetippter Link genug, um
    // die Eintrittskarte zu vernichten.
    expect((await pruefeEinladung(pool, code, 'malte@example.org', jetzt)).ok).toBe(true);
    const { rows } = await pool.query<{ eingeloest_am: Date | null }>(
      'SELECT eingeloest_am FROM einladung',
    );
    expect(rows[0]?.eingeloest_am).toBeNull();
  });

  it('lehnt einen unbekannten Code ab', async () => {
    expect(await pruefeEinladung(pool, 'ausgedacht', 'malte@example.org', jetzt)).toEqual({
      ok: false,
      grund: 'unbekannt',
    });
  });

  it('lehnt einen bereits verbrauchten Code ab', async () => {
    const code = await erzeugeEinladung(pool, 'malte@example.org', jetzt);
    const pruefung = await pruefeEinladung(pool, code, 'malte@example.org', jetzt);
    if (!pruefung.ok) throw new Error('Vorbedingung nicht erfüllt');
    await entwerte(pruefung.einladungId, await neuesMitglied('malte@example.org'));

    expect(await pruefeEinladung(pool, code, 'malte@example.org', jetzt)).toEqual({
      ok: false,
      grund: 'verbraucht',
    });
  });

  it('lehnt einen abgelaufenen Code ab', async () => {
    const code = await erzeugeEinladung(pool, 'malte@example.org', jetzt);
    const inEinemJahr = new Date('2027-08-02T12:00:00Z');

    expect(await pruefeEinladung(pool, code, 'malte@example.org', inEinemJahr)).toEqual({
      ok: false,
      grund: 'abgelaufen',
    });
  });

  it('lehnt eine falsche Adresse ab, ohne den Code zu verbrauchen', async () => {
    const code = await erzeugeEinladung(pool, 'malte@example.org', jetzt);

    expect(await pruefeEinladung(pool, code, 'fremd@example.org', jetzt)).toEqual({
      ok: false,
      grund: 'falsche-adresse',
    });

    // Der Fehlversuch mit der falschen Adresse darf den Code nicht
    // entwertet haben — sonst könnte ein Fremder mit einem einzigen
    // falschen Versuch den Zugang des Mitglieds zerstören.
    expect((await pruefeEinladung(pool, code, 'malte@example.org', jetzt)).ok).toBe(true);
  });

  it('vergleicht die Adresse ohne Rücksicht auf Groß- und Kleinschreibung', async () => {
    const code = await erzeugeEinladung(pool, 'malte@example.org', jetzt);

    expect((await pruefeEinladung(pool, code, 'MALTE@EXAMPLE.ORG', jetzt)).ok).toBe(true);
  });
});

describe('verbraucheEinladung', () => {
  it('entwertet den Code und hält fest, wer ihn eingelöst hat', async () => {
    const code = await erzeugeEinladung(pool, 'malte@example.org', jetzt);
    const pruefung = await pruefeEinladung(pool, code, 'malte@example.org', jetzt);
    if (!pruefung.ok) throw new Error('Vorbedingung nicht erfüllt');
    const mitgliedId = await neuesMitglied('malte@example.org');

    expect(await entwerte(pruefung.einladungId, mitgliedId)).toEqual({ ok: true });

    const { rows } = await pool.query<{
      eingeloest_am: Date | null;
      eingeloest_von: string | null;
    }>('SELECT eingeloest_am, eingeloest_von FROM einladung');
    expect(rows[0]?.eingeloest_am?.getTime()).toBe(jetzt.getTime());
    expect(rows[0]?.eingeloest_von).toBe(mitgliedId);
  });

  it('greift kein zweites Mal', async () => {
    const code = await erzeugeEinladung(pool, 'malte@example.org', jetzt);
    const pruefung = await pruefeEinladung(pool, code, 'malte@example.org', jetzt);
    if (!pruefung.ok) throw new Error('Vorbedingung nicht erfüllt');
    const mitgliedId = await neuesMitglied('malte@example.org');
    await entwerte(pruefung.einladungId, mitgliedId);

    expect(await entwerte(pruefung.einladungId, mitgliedId)).toEqual({
      ok: false,
      grund: 'nicht-mehr-offen',
    });
  });
});
