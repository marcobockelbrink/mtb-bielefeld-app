import { describe, expect, it } from 'vitest';

import type { Protokoll } from '../src/protokoll.ts';
import { erzeugeTerminDienst, terminSchluessel } from '../src/termine.ts';

const stillesProtokoll: Protokoll = { error: () => {} };

const jetzt = new Date('2026-08-03T12:00:00Z');

function kalender(summary: string): string {
  return [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:probe-1@test',
    'DTSTART;TZID=Europe/Berlin:20260810T180000',
    'DTEND;TZID=Europe/Berlin:20260810T200000',
    `SUMMARY:${summary}`,
    'DESCRIPTION:Plätze: 12\\nGäste: ja',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

describe('TerminDienst', () => {
  it('liest den Kalender und findet einen Termin über den Schlüssel', async () => {
    const dienst = erzeugeTerminDienst({
      ladeKalender: async () => kalender('Proberunde'),
      protokoll: stillesProtokoll,
      jetzt: () => jetzt,
    });

    const termine = await dienst.holeTermine();
    expect(termine).toHaveLength(1);

    const gefunden = await dienst.findeTermin(terminSchluessel(termine[0]!));
    expect(gefunden?.title).toBe('Proberunde');
    expect(await dienst.findeTermin('gibtsnicht~0')).toBeNull();
  });

  it('fragt innerhalb der Frist nur einmal ab', async () => {
    let abrufe = 0;
    const dienst = erzeugeTerminDienst({
      ladeKalender: async () => {
        abrufe++;
        return kalender('Proberunde');
      },
      protokoll: stillesProtokoll,
      jetzt: () => jetzt,
    });

    await dienst.holeTermine();
    await dienst.holeTermine();
    expect(abrufe).toBe(1);
  });

  it('liefert nach der Frist frisch', async () => {
    let abrufe = 0;
    let uhr = jetzt;
    const dienst = erzeugeTerminDienst({
      ladeKalender: async () => {
        abrufe++;
        return kalender(`Runde ${abrufe}`);
      },
      protokoll: stillesProtokoll,
      jetzt: () => uhr,
      ttlMs: 5 * 60 * 1000,
    });

    await dienst.holeTermine();
    uhr = new Date(jetzt.getTime() + 6 * 60 * 1000);
    const termine = await dienst.holeTermine();

    expect(abrufe).toBe(2);
    expect(termine[0]?.title).toBe('Runde 2');
  });

  it('hält bei einem gescheiterten Abruf den letzten Stand', async () => {
    let scheitert = false;
    let uhr = jetzt;
    const meldungen: unknown[] = [];
    const dienst = erzeugeTerminDienst({
      ladeKalender: async () => {
        if (scheitert) throw new Error('Kalender weg');
        return kalender('Proberunde');
      },
      protokoll: { error: (o) => meldungen.push(o) },
      jetzt: () => uhr,
      ttlMs: 5 * 60 * 1000,
    });

    await dienst.holeTermine();
    scheitert = true;
    uhr = new Date(jetzt.getTime() + 6 * 60 * 1000);

    const termine = await dienst.holeTermine();
    expect(termine[0]?.title).toBe('Proberunde');
    expect(meldungen).toHaveLength(1);
  });

  it('scheitert laut, wenn es nie einen Stand gab', async () => {
    const dienst = erzeugeTerminDienst({
      ladeKalender: async () => {
        throw new Error('Kalender weg');
      },
      protokoll: stillesProtokoll,
      jetzt: () => jetzt,
    });

    await expect(dienst.holeTermine()).rejects.toThrow();
  });
});
