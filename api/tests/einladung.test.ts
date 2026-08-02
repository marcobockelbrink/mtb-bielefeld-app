import { beforeEach, afterAll, describe, expect, it } from 'vitest';

import { pool } from '../src/datenbank.ts';
import { erzeugeEinladung, loeseEinladungEin } from '../src/einladung.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

const jetzt = new Date('2026-08-02T12:00:00Z');

beforeEach(async () => {
  await frischeDatenbank();
});

afterAll(async () => {
  await pool.end();
});

describe('erzeugeEinladung', () => {
  it('gibt den Code im Klartext zurück, speichert aber nur den Hash', async () => {
    const code = await erzeugeEinladung(pool, 'malte@example.org');

    const { rows } = await pool.query<{ code_hash: string }>(
      'SELECT code_hash FROM einladung',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.code_hash).not.toBe(code);
    expect(rows[0]?.code_hash).toHaveLength(64);
  });
});

describe('loeseEinladungEin', () => {
  it('nimmt einen frischen Code an', async () => {
    const code = await erzeugeEinladung(pool, 'malte@example.org');
    expect(await loeseEinladungEin(pool, code, jetzt)).toEqual({ ok: true });
  });

  it('lehnt einen unbekannten Code ab', async () => {
    expect(await loeseEinladungEin(pool, 'ausgedacht', jetzt)).toEqual({
      ok: false,
      grund: 'unbekannt',
    });
  });

  it('lehnt einen bereits verbrauchten Code ab', async () => {
    const code = await erzeugeEinladung(pool, 'malte@example.org');
    await loeseEinladungEin(pool, code, jetzt);

    expect(await loeseEinladungEin(pool, code, jetzt)).toEqual({
      ok: false,
      grund: 'verbraucht',
    });
  });

  it('lehnt einen abgelaufenen Code ab', async () => {
    const code = await erzeugeEinladung(pool, 'malte@example.org');
    const inEinemJahr = new Date('2027-08-02T12:00:00Z');

    expect(await loeseEinladungEin(pool, code, inEinemJahr)).toEqual({
      ok: false,
      grund: 'abgelaufen',
    });
  });
});
