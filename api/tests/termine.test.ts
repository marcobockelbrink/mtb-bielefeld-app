import { describe, expect, it } from 'vitest';

import type { Protokoll } from '../src/protokoll.ts';
import { erzeugeTerminDienst, terminSchluessel } from '../src/termine.ts';

const stillesProtokoll: Protokoll = { error: () => {}, info: () => {} };

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

/**
 * Ein Kalender mit genau einem gewöhnlichen Einzeltermin — die Startzeit ist
 * frei wählbar, damit sich eine Verschiebung nachstellen lässt.
 */
function einzeltermin(startWall: string): string {
  return [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:einzeln@test',
    `DTSTART;TZID=Europe/Berlin:${startWall}`,
    'DTEND;TZID=Europe/Berlin:20260810T200000',
    'SUMMARY:Feierabendrunde',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/**
 * Eine wöchentliche Serie mit zwei Einzelterminen; der zweite kann als
 * verschobener Einzeltermin mit `RECURRENCE-ID` überschrieben werden.
 */
function serie(verschiebung?: { auf: string }): string {
  const zeilen = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:rudel@test',
    'DTSTART;TZID=Europe/Berlin:20260805T180000',
    'DTEND;TZID=Europe/Berlin:20260805T200000',
    'RRULE:FREQ=WEEKLY;COUNT=2',
    'SUMMARY:MittwochsRudel',
    'END:VEVENT',
  ];
  if (verschiebung) {
    zeilen.push(
      'BEGIN:VEVENT',
      'UID:rudel@test',
      'RECURRENCE-ID;TZID=Europe/Berlin:20260812T180000',
      `DTSTART;TZID=Europe/Berlin:${verschiebung.auf}`,
      'DTEND;TZID=Europe/Berlin:20260812T210000',
      'SUMMARY:MittwochsRudel',
      'END:VEVENT',
    );
  }
  zeilen.push('END:VCALENDAR');
  return zeilen.join('\r\n');
}

async function termineAus(ics: string) {
  const dienst = erzeugeTerminDienst({
    ladeKalender: async () => ics,
    protokoll: stillesProtokoll,
    jetzt: () => jetzt,
  });
  return dienst.holeTermine();
}

describe('terminSchluessel', () => {
  it('hält bei einem verschobenen Einzeltermin — die uid allein trägt ihn', async () => {
    // Der Normalfall bei Touren: kein RECURRENCE-ID, also wandert
    // originalStartInstant mit der Startzeit mit. Nähme der Schlüssel ihn
    // auf, spränge die Belegung nach jeder Verschiebung auf 0.
    const [vorher] = await termineAus(einzeltermin('20260810T180000'));
    const [nachher] = await termineAus(einzeltermin('20260811T190000'));

    expect(vorher!.start.getTime()).not.toBe(nachher!.start.getTime());
    expect(terminSchluessel(nachher!)).toBe(terminSchluessel(vorher!));
    expect(terminSchluessel(vorher!)).toBe('einzeln@test');
  });

  it('gibt zwei Terminen derselben Serie verschiedene Schlüssel', async () => {
    const termine = await termineAus(serie());

    expect(termine).toHaveLength(2);
    expect(termine[0]!.uid).toBe(termine[1]!.uid);
    expect(terminSchluessel(termine[0]!)).not.toBe(terminSchluessel(termine[1]!));
  });

  it('hält bei einem verschobenen Einzeltermin einer Serie', async () => {
    const unverschoben = await termineAus(serie());
    const verschoben = await termineAus(serie({ auf: '20260813T190000' }));

    const zweiterVorher = unverschoben[1]!;
    const zweiterNachher = verschoben.find((t) => t.start.getTime() !== unverschoben[0]!.start.getTime())!;

    expect(zweiterNachher.start.getTime()).not.toBe(zweiterVorher.start.getTime());
    expect(terminSchluessel(zweiterNachher)).toBe(terminSchluessel(zweiterVorher));
  });
});

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
      protokoll: { error: (o) => meldungen.push(o), info: () => {} },
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
