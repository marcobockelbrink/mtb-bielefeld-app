import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type pg from 'pg';

import { pool } from '../src/datenbank.ts';
import { GemerktesProtokoll } from '../src/protokoll.ts';
import {
  erneuereSitzung,
  legeSitzungAn,
  pruefeZugang,
  raeumeAbgelaufeneSitzungenAuf,
} from '../src/sitzung.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

const jetzt = new Date('2026-08-02T12:00:00Z');

async function neuesMitglied(): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO mitglied (email) VALUES ('malte@example.org') RETURNING id",
  );
  return rows[0]!.id;
}

/**
 * Reicht `connect` unverändert durch, lässt aber das Aufräumen abgelaufener
 * Sitzungen scheitern — wie ein Full-Table-Scan es bei einer gestörten
 * Datenbank auch täte. Steht für N4: Die Erneuerung selbst darf davon
 * unberührt bleiben.
 */
function poolMitScheiterndemAufraeumen(echterPool: pg.Pool): pg.Pool {
  return {
    connect: (...args: unknown[]) =>
      (echterPool.connect as (...args: unknown[]) => unknown)(...args),
    query: (text: unknown, werte?: unknown) => {
      if (typeof text === 'string' && text.startsWith('DELETE FROM sitzung WHERE erneuerung_bis')) {
        return Promise.reject(new Error('Das Aufräumen ist gestört.'));
      }
      return (echterPool.query as (text: unknown, werte?: unknown) => unknown)(text, werte);
    },
  } as unknown as pg.Pool;
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

    const zweite = await erneuereSitzung(pool, erste.erneuerung, jetzt, new GemerktesProtokoll());
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

    const zweite = await erneuereSitzung(pool, erste.erneuerung, jetzt, new GemerktesProtokoll());
    if (!zweite.ok) throw new Error('Vorbedingung nicht erfüllt');

    expect(await pruefeZugang(pool, erste.zugang, jetzt)).toBeNull();
    expect(await pruefeZugang(pool, zweite.zugang, jetzt)).not.toBeNull();
  });

  it('erkennt ein wiederverwendetes Token und wirft alle Sitzungen raus', async () => {
    const id = await neuesMitglied();
    const erste = await legeSitzungAn(pool, id, jetzt);
    const zweite = await erneuereSitzung(pool, erste.erneuerung, jetzt, new GemerktesProtokoll());
    if (!zweite.ok) throw new Error('Vorbedingung nicht erfüllt');

    // Das alte Token taucht wieder auf: Es wurde kopiert.
    const dritte = await erneuereSitzung(pool, erste.erneuerung, jetzt, new GemerktesProtokoll());
    expect(dritte.ok).toBe(false);

    // Auch die zwischenzeitlich gültige Sitzung ist damit erledigt.
    expect(await pruefeZugang(pool, zweite.zugang, jetzt)).toBeNull();
  });

  it('lehnt ein unbekanntes Token ab', async () => {
    expect(await erneuereSitzung(pool, 'ausgedacht', jetzt, new GemerktesProtokoll())).toEqual({ ok: false });
  });

  it('lehnt ein abgelaufenes Token ab', async () => {
    const id = await neuesMitglied();
    const erste = await legeSitzungAn(pool, id, jetzt);
    const inZweiMonaten = new Date(jetzt.getTime() + 61 * 24 * 60 * 60 * 1000);

    expect(await erneuereSitzung(pool, erste.erneuerung, inZweiMonaten, new GemerktesProtokoll())).toEqual({
      ok: false,
    });
  });

  // N4: Das Aufräumen läuft nach der Erneuerung und außerhalb ihrer
  // Transaktion — sein Scheitern darf ein gültiges Token nicht mit in ein
  // 401 reißen.
  it('gelingt auch, wenn das Aufräumen abgelaufener Sitzungen scheitert', async () => {
    const id = await neuesMitglied();
    const erste = await legeSitzungAn(pool, id, jetzt);
    const protokoll = new GemerktesProtokoll();

    const zweite = await erneuereSitzung(
      poolMitScheiterndemAufraeumen(pool),
      erste.erneuerung,
      jetzt,
      protokoll,
    );

    expect(zweite.ok).toBe(true);
    if (!zweite.ok) return;
    expect(await pruefeZugang(pool, zweite.zugang, jetzt)).not.toBeNull();

    // Das Scheitern verschwindet nicht, es wechselt nur den Empfänger.
    expect(protokoll.fehler).toHaveLength(1);
    expect(String(protokoll.fehler[0]?.daten.fehler)).toMatch(/gestört/);
  });
});

describe('raeumeAbgelaufeneSitzungenAuf', () => {
  it('räumt eine Sitzung weg, deren Erneuerungsfrist vorbei ist', async () => {
    const id = await neuesMitglied();
    await legeSitzungAn(pool, id, jetzt);
    const nachDerFrist = new Date(jetzt.getTime() + 61 * 24 * 60 * 60 * 1000);

    const anzahl = await raeumeAbgelaufeneSitzungenAuf(pool, nachDerFrist);

    expect(anzahl).toBe(1);
    const { rows } = await pool.query('SELECT id FROM sitzung');
    expect(rows).toHaveLength(0);
  });

  // Der wichtigere Fall: Eine ersetzte, aber noch nicht abgelaufene Zeile
  // ist genau das, woran die Wiederverwendungserkennung ein kopiertes Token
  // noch erkennt. Räumt man sie zu früh weg, wird aus einem gestohlenen
  // Token wieder ein unbekanntes — und aus einem Alarm ein stilles „gilt
  // nicht".
  it('lässt eine ersetzte, aber noch nicht abgelaufene Sitzung stehen', async () => {
    const id = await neuesMitglied();
    const erste = await legeSitzungAn(pool, id, jetzt);
    const zweite = await erneuereSitzung(pool, erste.erneuerung, jetzt, new GemerktesProtokoll());
    if (!zweite.ok) throw new Error('Vorbedingung nicht erfüllt');

    const anzahl = await raeumeAbgelaufeneSitzungenAuf(pool, jetzt);

    expect(anzahl).toBe(0);
    const { rows } = await pool.query<{ ersetzt_am: Date | null }>(
      'SELECT ersetzt_am FROM sitzung ORDER BY angelegt_am',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.ersetzt_am).not.toBeNull();
    expect(rows[1]?.ersetzt_am).toBeNull();

    // Die Wiederverwendungserkennung sieht das kopierte Token noch als
    // solches — und schlägt Alarm.
    const dritte = await erneuereSitzung(pool, erste.erneuerung, jetzt, new GemerktesProtokoll());
    expect(dritte.ok).toBe(false);
    const { rows: nachAlarm } = await pool.query('SELECT id FROM sitzung');
    expect(nachAlarm).toHaveLength(0);
  });
});
