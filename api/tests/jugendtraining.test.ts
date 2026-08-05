import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { pool } from '../src/datenbank.ts';
import {
  aendereTraining,
  holeGuideAdressen,
  holeGuideAntworten,
  holeTraining,
  holeTrainings,
  legeTrainingAn,
  sageAb,
  setzeGuideAntwort,
  veroeffentliche,
} from '../src/jugendtraining.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

const jetzt = new Date('2026-08-05T12:00:00Z');
const sonntag = new Date('2026-08-09T08:30:00Z'); // 10:30 Ortszeit

let guideId: string;

beforeEach(async () => {
  await frischeDatenbank();
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO mitglied (email, rolle) VALUES ('trainer@example.org', 'guide') RETURNING id",
  );
  guideId = rows[0]!.id;
});

afterAll(async () => {
  await pool.end();
});

function eingabe() {
  return { beginntAm: sonntag, ort: 'Wanderparkplatz Kalkofen' };
}

describe('legeTrainingAn', () => {
  it('legt einen Entwurf an, nicht etwas Sichtbares', async () => {
    // Der Entwurf ist der ganze Zweck der ersten Phase: Erst wenn genug
    // Guides zugesagt haben, soll jemand davon erfahren.
    const training = await legeTrainingAn(pool, eingabe(), guideId, jetzt);
    expect(training.zustand).toBe('entwurf');
    expect(training.ort).toBe('Wanderparkplatz Kalkofen');
    expect(training.guidesNoetig).toBe(2);
  });
});

describe('holeTrainings', () => {
  it('zeigt Entwürfe nur, wenn ausdrücklich danach gefragt wird', async () => {
    await legeTrainingAn(pool, eingabe(), guideId, jetzt);

    expect(await holeTrainings(pool, false, jetzt)).toHaveLength(0);
    expect(await holeTrainings(pool, true, jetzt)).toHaveLength(1);
  });

  it('lässt vergangene Trainings weg', async () => {
    // Wer den Bereich öffnet, will wissen, was kommt. Was war, steht in
    // niemandes Weg herum.
    const vorbei = { ...eingabe(), beginntAm: new Date('2026-07-01T08:30:00Z') };
    await legeTrainingAn(pool, vorbei, guideId, jetzt);
    await veroeffentliche(pool, (await holeTrainings(pool, true, new Date('2026-06-01T00:00:00Z')))[0]!.id, jetzt);

    expect(await holeTrainings(pool, true, jetzt)).toHaveLength(0);
  });
});

describe('veroeffentliche', () => {
  it('macht aus dem Entwurf ein sichtbares Training', async () => {
    const { id } = await legeTrainingAn(pool, eingabe(), guideId, jetzt);

    const ergebnis = await veroeffentliche(pool, id, jetzt);
    expect(ergebnis.ok).toBe(true);
    expect((await holeTraining(pool, id))?.zustand).toBe('veroeffentlicht');
    expect(await holeTrainings(pool, false, jetzt)).toHaveLength(1);
  });

  it('lehnt ein zweites Veröffentlichen ab, statt still nichts zu tun', async () => {
    // Sonst ginge die Mail an die Abonnenten zweimal raus.
    const { id } = await legeTrainingAn(pool, eingabe(), guideId, jetzt);
    await veroeffentliche(pool, id, jetzt);

    const nochmal = await veroeffentliche(pool, id, jetzt);
    expect(nochmal).toEqual({ ok: false, grund: 'falscher-zustand' });
  });

  it('lässt bei erzwungener Verschränkung genau einen Versuch durch', async () => {
    // **Die Verschränkung wird erzwungen, nicht erhofft.** Ein einfaches
    // `Promise.all` beweist hier nichts: Die beiden Aufrufe laufen dann in
    // der Praxis nacheinander durch, und der Test bliebe auch bei „erst
    // lesen, dann prüfen, dann schreiben" grün — nachgemessen.
    //
    // Deterministisch wird es über zwei Verbindungen und eine offene
    // Transaktion: A ändert, ohne festzuschreiben. B liest damit noch den
    // alten Stand („entwurf"), läuft dann aber beim Schreiben in die
    // Zeilensperre und wartet. Nach A's COMMIT sieht B's `WHERE zustand =
    // ANY('entwurf')` den neuen Zustand und trifft keine Zeile mehr.
    //
    // Eine Umsetzung, die vorher liest und danach bedingungslos schreibt,
    // fällt hier durch — genau dafür ist der Test da.
    const { id } = await legeTrainingAn(pool, eingabe(), guideId, jetzt);

    const a = await pool.connect();
    const b = await pool.connect();
    try {
      await a.query('BEGIN');
      const ergebnisA = await veroeffentliche(a, id, jetzt);
      expect(ergebnisA.ok).toBe(true);

      await b.query('BEGIN');
      // Läuft in die Sperre und kehrt erst nach dem COMMIT von A zurück.
      const wartend = veroeffentliche(b, id, jetzt);
      await new Promise((weiter) => setTimeout(weiter, 50));
      await a.query('COMMIT');

      const ergebnisB = await wartend;
      await b.query('COMMIT');

      expect(ergebnisB).toEqual({ ok: false, grund: 'falscher-zustand' });
    } finally {
      a.release();
      b.release();
    }
  });

  it('meldet ein unbekanntes Training als solches', async () => {
    const ergebnis = await veroeffentliche(pool, '00000000-0000-0000-0000-000000000000', jetzt);
    expect(ergebnis).toEqual({ ok: false, grund: 'unbekannt' });
  });
});

describe('sageAb', () => {
  it('sagt ein veröffentlichtes Training mit Grund ab', async () => {
    const { id } = await legeTrainingAn(pool, eingabe(), guideId, jetzt);
    await veroeffentliche(pool, id, jetzt);

    const ergebnis = await sageAb(pool, id, 'Dauerregen', jetzt);
    expect(ergebnis.ok).toBe(true);

    const nachher = await holeTraining(pool, id);
    expect(nachher?.zustand).toBe('abgesagt');
    expect(nachher?.absagegrund).toBe('Dauerregen');
  });

  it('sagt auch einen Entwurf ab — dann hat sich die Guide-Suche erledigt', async () => {
    const { id } = await legeTrainingAn(pool, eingabe(), guideId, jetzt);
    expect((await sageAb(pool, id, 'zu wenig Guides', jetzt)).ok).toBe(true);
  });

  it('lehnt eine zweite Absage ab', async () => {
    const { id } = await legeTrainingAn(pool, eingabe(), guideId, jetzt);
    await sageAb(pool, id, 'Regen', jetzt);
    expect(await sageAb(pool, id, 'immer noch Regen', jetzt)).toEqual({
      ok: false,
      grund: 'falscher-zustand',
    });
  });

  it('bleibt in der Liste sichtbar, damit niemand umsonst hinfährt', async () => {
    // Ein abgesagtes Training verschwinden zu lassen wäre das Gegenteil von
    // hilfreich: Wer es gestern gesehen hat, hielte das Verschwinden für
    // einen Fehler der App und führe hin.
    const { id } = await legeTrainingAn(pool, eingabe(), guideId, jetzt);
    await veroeffentliche(pool, id, jetzt);
    await sageAb(pool, id, 'Regen', jetzt);

    const sichtbar = await holeTrainings(pool, false, jetzt);
    expect(sichtbar).toHaveLength(1);
    expect(sichtbar[0]?.zustand).toBe('abgesagt');
  });
});

describe('aendereTraining', () => {
  it('ändert nur, was angegeben ist', async () => {
    const { id } = await legeTrainingAn(pool, eingabe(), guideId, jetzt);

    const geaendert = await aendereTraining(pool, id, { ort: 'Eisgrund' });
    expect(geaendert?.ort).toBe('Eisgrund');
    expect(geaendert?.beginntAm.getTime()).toBe(sonntag.getTime());
  });
});

describe('Guide-Antworten', () => {
  it('merkt sich Zusage und Absage je Guide', async () => {
    const { id } = await legeTrainingAn(pool, eingabe(), guideId, jetzt);

    expect(await setzeGuideAntwort(pool, id, guideId, true, jetzt)).toBe(true);

    const antworten = await holeGuideAntworten(pool, id);
    expect(antworten).toEqual([
      { mitgliedId: guideId, email: 'trainer@example.org', zusage: true },
    ]);
  });

  it('überschreibt eine frühere Antwort, statt eine zweite anzulegen', async () => {
    // Wer erst zusagt und dann doch nicht kann, drückt auf denselben Knopf.
    const { id } = await legeTrainingAn(pool, eingabe(), guideId, jetzt);
    await setzeGuideAntwort(pool, id, guideId, true, jetzt);
    await setzeGuideAntwort(pool, id, guideId, false, jetzt);

    const antworten = await holeGuideAntworten(pool, id);
    expect(antworten).toHaveLength(1);
    expect(antworten[0]?.zusage).toBe(false);
  });

  it('meldet false für ein unbekanntes Training, statt einen Fremdschlüssel zu werfen', async () => {
    expect(
      await setzeGuideAntwort(pool, '00000000-0000-0000-0000-000000000000', guideId, true, jetzt),
    ).toBe(false);
  });

  it('holeGuideAdressen findet nur Guides', async () => {
    await pool.query(
      "INSERT INTO mitglied (email, rolle) VALUES ('eltern@example.org', 'mitglied')",
    );
    await pool.query(
      "INSERT INTO mitglied (email, rolle) VALUES ('zweiter@example.org', 'guide')",
    );

    const adressen = await holeGuideAdressen(pool);
    expect(adressen.sort()).toEqual(['trainer@example.org', 'zweiter@example.org']);
  });
});
