import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { pool } from '../src/datenbank.ts';
import { erneuereSitzung, legeSitzungAn, pruefeZugang } from '../src/sitzung.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

const jetzt = new Date('2026-08-02T12:00:00Z');

async function neuesMitglied(): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO mitglied (email) VALUES ('malte@example.org') RETURNING id",
  );
  return rows[0]!.id;
}

beforeEach(async () => {
  await frischeDatenbank();
});

afterAll(async () => {
  await pool.end();
});

describe('erneuereSitzung', () => {
  it('gibt neue Token aus und entwertet die alten', async () => {
    const id = await neuesMitglied();
    const erste = await legeSitzungAn(pool, id, jetzt);

    const zweite = await erneuereSitzung(pool, erste.erneuerung, jetzt);
    expect(zweite.ok).toBe(true);
    if (!zweite.ok) return;

    expect(zweite.erneuerung).not.toBe(erste.erneuerung);
    expect(await pruefeZugang(pool, zweite.zugang, jetzt)).not.toBeNull();
  });

  // Ohne die Prüfung auf ersetzt_am bliebe das alte Zugangs-Token nach der
  // Rotation bis zu 15 Minuten weiter gültig — nur die Zeile wird ersetzt,
  // zugang_hash und zugang_bis der alten Zeile ändern sich nicht.
  it('lässt den alten Zugang nach der Rotation nicht mehr zu', async () => {
    const id = await neuesMitglied();
    const erste = await legeSitzungAn(pool, id, jetzt);
    expect(await pruefeZugang(pool, erste.zugang, jetzt)).not.toBeNull();

    const zweite = await erneuereSitzung(pool, erste.erneuerung, jetzt);
    if (!zweite.ok) throw new Error('Vorbedingung nicht erfüllt');

    expect(await pruefeZugang(pool, erste.zugang, jetzt)).toBeNull();
    expect(await pruefeZugang(pool, zweite.zugang, jetzt)).not.toBeNull();
  });

  it('erkennt ein wiederverwendetes Token und wirft alle Sitzungen raus', async () => {
    const id = await neuesMitglied();
    const erste = await legeSitzungAn(pool, id, jetzt);
    const zweite = await erneuereSitzung(pool, erste.erneuerung, jetzt);
    if (!zweite.ok) throw new Error('Vorbedingung nicht erfüllt');

    // Das alte Token taucht wieder auf: Es wurde kopiert.
    const dritte = await erneuereSitzung(pool, erste.erneuerung, jetzt);
    expect(dritte.ok).toBe(false);

    // Auch die zwischenzeitlich gültige Sitzung ist damit erledigt.
    expect(await pruefeZugang(pool, zweite.zugang, jetzt)).toBeNull();
  });

  it('lehnt ein unbekanntes Token ab', async () => {
    expect(await erneuereSitzung(pool, 'ausgedacht', jetzt)).toEqual({ ok: false });
  });

  it('lehnt ein abgelaufenes Token ab', async () => {
    const id = await neuesMitglied();
    const erste = await legeSitzungAn(pool, id, jetzt);
    const inZweiMonaten = new Date(jetzt.getTime() + 61 * 24 * 60 * 60 * 1000);

    expect(await erneuereSitzung(pool, erste.erneuerung, inZweiMonaten)).toEqual({
      ok: false,
    });
  });
});
