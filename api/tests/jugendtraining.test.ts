import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { pool } from '../src/datenbank.ts';
import {
  aendereTraining,
  holeBelegungTraining,
  holeElternAdressen,
  holeGuideAdressen,
  holeGuideAntworten,
  holeKinder,
  holeTraining,
  holeTrainings,
  legeTrainingAn,
  meldeKindAb,
  meldeKindAn,
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

describe('istKennung', () => {
  it('weist eine Zeichenkette ab, die nur aus Bindestrichen besteht', async () => {
    // Das frühere Muster `/^[0-9a-f-]{36}$/i` ließ genau das durch — also
    // das, wovor es schützen sollte. Postgres bricht dann mit 22P02 ab, und
    // aus einem 404 wird ein 500 mit englischer Datenbankmeldung.
    expect(await holeTraining(pool, '-'.repeat(36))).toBeNull();
  });

  it('weist 36 Hexziffern ohne Bindestriche ab', async () => {
    expect(await holeTraining(pool, 'a'.repeat(36))).toBeNull();
  });

  it('weist eine zu kurze Kennung ab', async () => {
    expect(await holeTraining(pool, 'abc')).toBeNull();
  });
});

describe('Guide-Antworten', () => {
  it('merkt sich Zusage und Absage je Guide', async () => {
    const { id } = await legeTrainingAn(pool, eingabe(), guideId, jetzt);

    expect(await setzeGuideAntwort(pool, id, guideId, true, jetzt)).toBe('ok');

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

  it('meldet „unbekannt" für ein unbekanntes Training, statt einen Fremdschlüssel zu werfen', async () => {
    expect(
      await setzeGuideAntwort(pool, '00000000-0000-0000-0000-000000000000', guideId, true, jetzt),
    ).toBe('unbekannt');
  });

  it('nimmt keine Antwort mehr an, wenn das Training abgesagt ist', async () => {
    // Der erlaubte Ausgangszustand steht in der Bedingung der Anweisung, nicht
    // in einer Prüfung davor — sonst käme zwischen Lesen und Schreiben eine
    // Absage durch. Genau wie bei `aendereTraining`.
    const { id } = await legeTrainingAn(pool, eingabe(), guideId, jetzt);
    await veroeffentliche(pool, id, jetzt);
    await sageAb(pool, id, 'Gewitter', jetzt);

    expect(await setzeGuideAntwort(pool, id, guideId, true, jetzt)).toBe('abgesagt');
    expect(await holeGuideAntworten(pool, id)).toHaveLength(0);
  });

  it('lässt eine frühere Zusage nach der Absage unangetastet', async () => {
    // Wer vor der Absage zugesagt hat, dessen Antwort bleibt stehen — sie
    // wird nur nicht mehr geändert.
    const { id } = await legeTrainingAn(pool, eingabe(), guideId, jetzt);
    await veroeffentliche(pool, id, jetzt);
    await setzeGuideAntwort(pool, id, guideId, true, jetzt);
    await sageAb(pool, id, 'Gewitter', jetzt);

    expect(await setzeGuideAntwort(pool, id, guideId, false, jetzt)).toBe('abgesagt');
    expect((await holeGuideAntworten(pool, id))[0]?.zusage).toBe(true);
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

describe('aendereTraining nach der Absage', () => {
  it('lässt ein abgesagtes Training unangetastet', async () => {
    // Die Eltern haben die Absage mit Ort und Zeit in der Hand. Wanderten
    // beide danach noch, stünde in ihrer Mail etwas anderes als in der App.
    const { id } = await legeTrainingAn(pool, eingabe(), guideId, jetzt);
    await sageAb(pool, id, 'Regen', jetzt);

    expect(await aendereTraining(pool, id, { ort: 'Woanders' })).toBeNull();
    expect((await holeTraining(pool, id))?.ort).toBe('Wanderparkplatz Kalkofen');
  });

  it('lässt einen Entwurf und ein veröffentlichtes Training weiter ändern', async () => {
    const { id } = await legeTrainingAn(pool, eingabe(), guideId, jetzt);
    expect((await aendereTraining(pool, id, { ort: 'Eisgrund' }))?.ort).toBe('Eisgrund');
    await veroeffentliche(pool, id, jetzt);
    expect((await aendereTraining(pool, id, { ort: 'Kalkofen' }))?.ort).toBe('Kalkofen');
  });
});

describe('Kinder anmelden', () => {
  let elternId: string;
  let trainingId: string;

  beforeEach(async () => {
    const { rows } = await pool.query<{ id: string }>(
      "INSERT INTO mitglied (email) VALUES ('eltern@example.org') RETURNING id",
    );
    elternId = rows[0]!.id;
    const training = await legeTrainingAn(pool, eingabe(), guideId, jetzt);
    await veroeffentliche(pool, training.id, jetzt);
    trainingId = training.id;
  });

  const lena = { vorname: 'Lena', nachname: 'Musterfrau', zeigtVorname: true, zeigtNachname: false };
  const jonas = { vorname: 'Jonas', nachname: 'Musterfrau', zeigtVorname: true, zeigtNachname: false };

  it('trägt ein Kind ein und zählt es', async () => {
    const ergebnis = await meldeKindAn(pool, trainingId, elternId, lena, jetzt);
    expect(ergebnis).toMatchObject({ ok: true, belegt: 1 });
  });

  it('lässt genau zwei Kinder je Konto zu', async () => {
    await meldeKindAn(pool, trainingId, elternId, lena, jetzt);
    await meldeKindAn(pool, trainingId, elternId, jonas, jetzt);

    const drittes = await meldeKindAn(
      pool,
      trainingId,
      elternId,
      { ...lena, vorname: 'Mia' },
      jetzt,
    );
    expect(drittes).toEqual({ ok: false, grund: 'schon-zwei' });
  });

  it('gibt einen Platz wieder frei, wenn ein Kind abgemeldet wird', async () => {
    // Sonst hätte ein Elternteil, das sich vertippt und korrigiert, dauerhaft
    // einen Platz verbrannt.
    const erst = await meldeKindAn(pool, trainingId, elternId, lena, jetzt);
    if (!erst.ok) throw new Error('Anmeldung schlug fehl');
    await meldeKindAb(pool, trainingId, elternId, erst.kindId, jetzt);

    await meldeKindAn(pool, trainingId, elternId, jonas, jetzt);
    const drittes = await meldeKindAn(pool, trainingId, elternId, { ...lena, vorname: 'Mia' }, jetzt);
    expect(drittes.ok).toBe(true);
  });

  it('lehnt einen Entwurf ab — den soll niemand sehen, geschweige denn buchen', async () => {
    const entwurf = await legeTrainingAn(pool, eingabe(), guideId, jetzt);
    expect(await meldeKindAn(pool, entwurf.id, elternId, lena, jetzt)).toEqual({
      ok: false,
      grund: 'nicht-offen',
    });
  });

  it('lehnt ein abgesagtes Training ab', async () => {
    await sageAb(pool, trainingId, 'Regen', jetzt);
    expect(await meldeKindAn(pool, trainingId, elternId, lena, jetzt)).toEqual({
      ok: false,
      grund: 'nicht-offen',
    });
  });

  it('lehnt ein vergangenes Training ab', async () => {
    const spaeter = new Date('2026-09-01T00:00:00Z');
    expect(await meldeKindAn(pool, trainingId, elternId, lena, spaeter)).toEqual({
      ok: false,
      grund: 'vorbei',
    });
  });

  it('lehnt ab, wenn kein Platz mehr frei ist', async () => {
    await aendereTraining(pool, trainingId, { plaetze: 1 });
    await meldeKindAn(pool, trainingId, elternId, lena, jetzt);

    const { rows } = await pool.query<{ id: string }>(
      "INSERT INTO mitglied (email) VALUES ('andere@example.org') RETURNING id",
    );
    expect(await meldeKindAn(pool, trainingId, rows[0]!.id, jonas, jetzt)).toEqual({
      ok: false,
      grund: 'voll',
    });
  });

  it('meldet nur eigene Kinder ab', async () => {
    // Sonst könnte jedes Mitglied fremde Kinder austragen.
    const erst = await meldeKindAn(pool, trainingId, elternId, lena, jetzt);
    if (!erst.ok) throw new Error('Anmeldung schlug fehl');

    const { rows } = await pool.query<{ id: string }>(
      "INSERT INTO mitglied (email) VALUES ('fremd@example.org') RETURNING id",
    );
    expect(await meldeKindAb(pool, trainingId, rows[0]!.id, erst.kindId, jetzt)).toBe(false);
  });
});

/** Ein Konto, das weder Guide ist noch das Kind angemeldet hat. */
async function drittesKonto(): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO mitglied (email) VALUES ('dritter-${Math.random().toString(36).slice(2)}@example.org')
     RETURNING id`,
  );
  return rows[0]!.id;
}

describe('holeKinder', () => {
  let elternId: string;
  let trainingId: string;

  beforeEach(async () => {
    const { rows } = await pool.query<{ id: string }>(
      "INSERT INTO mitglied (email) VALUES ('eltern@example.org') RETURNING id",
    );
    elternId = rows[0]!.id;
    const training = await legeTrainingAn(pool, eingabe(), guideId, jetzt);
    await veroeffentliche(pool, training.id, jetzt);
    trainingId = training.id;
  });

  it('zeigt Guides immer Vor- und Nachname', async () => {
    // Sie haben die Aufsicht. Bei einem Sturz muss jemand wissen, wer da liegt.
    await meldeKindAn(
      pool,
      trainingId,
      elternId,
      { vorname: 'Lena', nachname: 'Musterfrau', zeigtVorname: false, zeigtNachname: false },
      jetzt,
    );
    const fuerGuide = await holeKinder(pool, trainingId, true, guideId);
    expect(fuerGuide[0]?.anzeige).toBe('Lena Musterfrau');
  });

  it('zeigt anderen Mitgliedern nur, was freigegeben ist', async () => {
    await meldeKindAn(
      pool,
      trainingId,
      elternId,
      { vorname: 'Lena', nachname: 'Musterfrau', zeigtVorname: true, zeigtNachname: false },
      jetzt,
    );
    // Ein Dritter schaut, nicht das anmeldende Elternteil selbst — sonst
    // prüfte der Test die eigene Sicht und hieße trotzdem „andere".
    const fuerMitglied = await holeKinder(pool, trainingId, false, await drittesKonto());
    expect(fuerMitglied[0]?.anzeige).toBe('Lena');
  });

  it('zeigt dem Anfragenden sein eigenes Kind ungefiltert', async () => {
    // Die Freigabe regelt, was andere sehen. Sich selbst gegenüber verbirgt
    // niemand einen Namen, den er eben eingetippt hat — und ohne das stünden
    // bei zwei datensparsam angemeldeten Kindern zwei ununterscheidbare
    // Knöpfe „ein Kind abmelden" nebeneinander.
    await meldeKindAn(
      pool,
      trainingId,
      elternId,
      { vorname: 'Lena', nachname: 'Musterfrau', zeigtVorname: false, zeigtNachname: false },
      jetzt,
    );
    const fuerMichSelbst = await holeKinder(pool, trainingId, false, elternId);
    expect(fuerMichSelbst[0]?.anzeige).toBe('Lena Musterfrau');
    expect(fuerMichSelbst[0]?.eigene).toBe(true);
  });

  it('zeigt ein Kind ohne jede Freigabe als „ein Kind"', async () => {
    // Weglassen wäre falsch: Dann stimmte die Liste nicht mehr mit der Zahl
    // überein, und jemand hielte das für einen Fehler.
    await meldeKindAn(
      pool,
      trainingId,
      elternId,
      { vorname: 'Lena', nachname: 'Musterfrau', zeigtVorname: false, zeigtNachname: false },
      jetzt,
    );
    const fuerMitglied = await holeKinder(pool, trainingId, false, await drittesKonto());
    expect(fuerMitglied[0]?.anzeige).toBe('ein Kind');
  });

  it('lässt abgemeldete Kinder weg', async () => {
    const erst = await meldeKindAn(
      pool,
      trainingId,
      elternId,
      { vorname: 'Lena', nachname: 'M', zeigtVorname: true, zeigtNachname: false },
      jetzt,
    );
    if (!erst.ok) throw new Error('Anmeldung schlug fehl');
    await meldeKindAb(pool, trainingId, elternId, erst.kindId, jetzt);

    expect(await holeKinder(pool, trainingId, true, guideId)).toHaveLength(0);
  });

  it('markiert die Kinder des Anfragenden als eigene', async () => {
    // Ohne diese Markierung weiß die App nach einem Neustart nicht mehr,
    // welchen Platz sie abmelden darf.
    const { rows } = await pool.query<{ id: string }>(
      "INSERT INTO mitglied (email) VALUES ('zweite@example.org') RETURNING id",
    );
    const andereId = rows[0]!.id;
    await meldeKindAn(
      pool,
      trainingId,
      elternId,
      { vorname: 'Lena', nachname: 'M', zeigtVorname: true, zeigtNachname: false },
      jetzt,
    );
    await meldeKindAn(
      pool,
      trainingId,
      andereId,
      { vorname: 'Finn', nachname: 'B', zeigtVorname: true, zeigtNachname: false },
      jetzt,
    );

    // Das eigene Kind ungefiltert („Lena M"), das fremde nur so weit, wie
    // dessen Elternteil freigegeben hat („Finn"). Beides in einer Antwort —
    // genau daran hängt, dass der Abmelden-Knopf einen Namen tragen kann.
    // Nach Merkmal nachschlagen statt nach Position: Beide Kinder tragen
    // denselben `angelegt_am`, die Reihenfolge entscheidet dann die
    // zufällige Kennung.
    const ausSichtEltern = await holeKinder(pool, trainingId, false, elternId);
    expect(ausSichtEltern.find((k) => k.eigene)?.anzeige).toBe('Lena M');
    expect(ausSichtEltern.find((k) => !k.eigene)?.anzeige).toBe('Finn');
  });

  it('gibt einem Guide bei fremden Kindern kein eigene: true', async () => {
    // Die Guide-Rolle gibt Namenssichtbarkeit, nicht Besitz.
    await meldeKindAn(
      pool,
      trainingId,
      elternId,
      { vorname: 'Lena', nachname: 'Musterfrau', zeigtVorname: false, zeigtNachname: false },
      jetzt,
    );

    const fuerGuide = await holeKinder(pool, trainingId, true, guideId);
    expect(fuerGuide[0]?.eigene).toBe(false);
    // Und die Namenssichtbarkeit bleibt unverändert.
    expect(fuerGuide[0]?.anzeige).toBe('Lena Musterfrau');
  });
});
