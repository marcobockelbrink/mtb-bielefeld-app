import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { baueApp } from '../src/app.ts';
import { pool } from '../src/datenbank.ts';
import { GemerkterMailer, type Mailer } from '../src/mailer.ts';
import { legeSitzungAn } from '../src/sitzung.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

const jetzt = new Date('2026-08-03T12:00:00Z');

function bauen(mailer: Mailer = new GemerkterMailer()) {
  return baueApp({ pool, mailer, jetzt: () => jetzt });
}

async function mitgliedMitToken(email: string, rolle: 'mitglied' | 'guide' = 'mitglied') {
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO mitglied (email, rolle) VALUES ($1, $2) RETURNING id',
    [email, rolle],
  );
  const token = await legeSitzungAn(pool, rows[0]!.id, jetzt);
  return { id: rows[0]!.id, zugang: token.zugang };
}

/** Legt über die API ein Training im Entwurf an und gibt dessen Körper zurück. */
async function trainingAnlegen(
  app: ReturnType<typeof baueApp>,
  guideZugang: string,
  ueberschreibungen: Record<string, unknown> = {},
) {
  const antwort = await app.inject({
    method: 'POST',
    url: '/jugendtraining',
    headers: { authorization: `Bearer ${guideZugang}` },
    payload: { beginntAm: '2026-08-10T18:00:00Z', ort: 'Waldparkplatz', ...ueberschreibungen },
  });
  return antwort.json();
}

beforeEach(async () => {
  await frischeDatenbank();
});

afterAll(async () => {
  await pool.end();
});

describe('Ohne Anmeldung', () => {
  it('antwortet auf einen Guide-Weg mit 401, nicht mit 403', async () => {
    // Beides mit „Das dürfen nur Guides" zu beantworten schickte Leute in
    // die falsche Richtung: Wer nicht angemeldet ist, soll sich anmelden;
    // wer angemeldet und kein Guide ist, braucht jemanden, der ihm die Rolle
    // gibt. Anmelden hilft ihm nicht.
    const app = bauen();
    const antwort = await app.inject({
      method: 'POST',
      url: '/jugendtraining',
      payload: { beginntAm: '2026-09-01T08:30:00Z', ort: 'X' },
    });
    expect(antwort.statusCode).toBe(401);
    expect(antwort.json().fehler).toBe('Nicht angemeldet.');
  });
});

describe('POST /jugendtraining', () => {
  it('weist einen Nicht-Guide beim Anlegen mit 403 ab — die Rolle entscheidet, nicht die Anmeldung', async () => {
    const app = bauen();
    const { zugang } = await mitgliedMitToken('malte@example.org');

    const antwort = await app.inject({
      method: 'POST',
      url: '/jugendtraining',
      headers: { authorization: `Bearer ${zugang}` },
      payload: { beginntAm: '2026-08-10T18:00:00Z', ort: 'Waldparkplatz' },
    });

    expect(antwort.statusCode).toBe(403);
    await app.close();
  });
});

describe('GET /jugendtraining/:id', () => {
  it('zeigt Entwürfe nur Guides — für andere ist es ein 404', async () => {
    const app = bauen();
    const { zugang: guideZugang } = await mitgliedMitToken('guide@example.org', 'guide');
    const { zugang: mitgliedZugang } = await mitgliedMitToken('malte@example.org');
    const training = await trainingAnlegen(app, guideZugang);

    const alsMitglied = await app.inject({
      method: 'GET',
      url: `/jugendtraining/${training.id}`,
      headers: { authorization: `Bearer ${mitgliedZugang}` },
    });
    const alsGuide = await app.inject({
      method: 'GET',
      url: `/jugendtraining/${training.id}`,
      headers: { authorization: `Bearer ${guideZugang}` },
    });

    // Ein 404 verrät die Existenz des Entwurfs nicht — ein anderer Code
    // (etwa 403) würde einem Nicht-Guide bestätigen, dass es ihn gibt.
    expect(alsMitglied.statusCode).toBe(404);
    expect(alsGuide.statusCode).toBe(200);
    await app.close();
  });

  it('gibt einem Mitglied keine Guide-Liste heraus', async () => {
    const app = bauen();
    const { zugang: guideZugang } = await mitgliedMitToken('guide@example.org', 'guide');
    const { zugang: mitgliedZugang } = await mitgliedMitToken('malte@example.org');
    const training = await trainingAnlegen(app, guideZugang);
    await app.inject({
      method: 'POST',
      url: `/jugendtraining/${training.id}/veroeffentlichen`,
      headers: { authorization: `Bearer ${guideZugang}` },
    });

    const alsMitglied = await app.inject({
      method: 'GET',
      url: `/jugendtraining/${training.id}`,
      headers: { authorization: `Bearer ${mitgliedZugang}` },
    });
    const alsGuide = await app.inject({
      method: 'GET',
      url: `/jugendtraining/${training.id}`,
      headers: { authorization: `Bearer ${guideZugang}` },
    });

    // Wer nur Mitglied ist, bekommt das Feld gar nicht erst — nicht etwa
    // eine leere Liste, die dieselbe Auskunft anders verpackt wäre.
    expect(alsMitglied.json().guides).toBeUndefined();
    expect(alsGuide.json().guides).toBeDefined();
    await app.close();
  });
});

describe('GET /jugendtraining/:id — eigene Kinder', () => {
  /**
   * Legt ein veröffentlichtes Training an und meldet je ein Kind über zwei
   * verschiedene Elternkonten an.
   */
  async function trainingMitZweiEltern(app: ReturnType<typeof baueApp>) {
    const { zugang: guideZugang } = await mitgliedMitToken('guide@example.org', 'guide');
    const { zugang: elternA } = await mitgliedMitToken('elternA@example.org');
    const { zugang: elternB } = await mitgliedMitToken('elternB@example.org');
    const training = await trainingAnlegen(app, guideZugang);
    await app.inject({
      method: 'POST',
      url: `/jugendtraining/${training.id}/veroeffentlichen`,
      headers: { authorization: `Bearer ${guideZugang}` },
    });

    const anmelden = (zugang: string, vorname: string, nachname: string) =>
      app.inject({
        method: 'POST',
        url: `/jugendtraining/${training.id}/kinder`,
        headers: { authorization: `Bearer ${zugang}` },
        payload: { vorname, nachname, zeigtVorname: true, zeigtNachname: false },
      });

    const kindA = (await anmelden(elternA, 'Finn', 'Meyer')).json().kindId;
    const kindB = (await anmelden(elternB, 'Lena', 'Musterfrau')).json().kindId;
    return { training, guideZugang, elternA, elternB, kindA, kindB };
  }

  const holen = (app: ReturnType<typeof baueApp>, id: string, zugang: string) =>
    app.inject({
      method: 'GET',
      url: `/jugendtraining/${id}`,
      headers: { authorization: `Bearer ${zugang}` },
    });

  it('markiert nur die Kinder des anfragenden Kontos als eigene', async () => {
    // Ohne diese Markierung weiß die App nach einem Neustart nicht mehr,
    // welchen Platz sie abmelden darf — der Platz bliebe bis zum Training
    // belegt.
    const app = bauen();
    const { training, elternA, kindA, kindB } = await trainingMitZweiEltern(app);

    const antwort = await holen(app, training.id, elternA);
    const kinder = antwort.json().kinder as Array<{ id: string; eigene: boolean }>;

    expect(kinder.find((k) => k.id === kindA)?.eigene).toBe(true);
    expect(kinder.find((k) => k.id === kindB)?.eigene).toBe(false);
    await app.close();
  });

  it('zeigt demselben Kind aus dem zweiten Konto heraus eigene: false', async () => {
    const app = bauen();
    const { training, elternB, kindA, kindB } = await trainingMitZweiEltern(app);

    const antwort = await holen(app, training.id, elternB);
    const kinder = antwort.json().kinder as Array<{ id: string; eigene: boolean }>;

    expect(kinder.find((k) => k.id === kindA)?.eigene).toBe(false);
    expect(kinder.find((k) => k.id === kindB)?.eigene).toBe(true);
    await app.close();
  });

  it('gibt einem Guide bei fremden Kindern kein eigene: true', async () => {
    // Die Guide-Rolle gibt Namenssichtbarkeit, nicht Besitz. Wer sie
    // verwechselt, baut dem Guide einen Abmelden-Knopf, den die API bei
    // jedem Druck mit 404 abweist.
    const app = bauen();
    const { training, guideZugang } = await trainingMitZweiEltern(app);

    const antwort = await holen(app, training.id, guideZugang);
    const kinder = antwort.json().kinder as Array<{ anzeige: string; eigene: boolean }>;

    expect(kinder.map((k) => k.eigene)).toEqual([false, false]);
    // Und die Namenssichtbarkeit bleibt, wie sie war — das war eine
    // Vereinsentscheidung, keine Nebenwirkung der neuen Markierung.
    // Sortiert verglichen: Beide Kinder tragen denselben `angelegt_am`, die
    // Reihenfolge entscheidet dann die zufällige Kennung.
    expect(kinder.map((k) => k.anzeige).sort()).toEqual(['Finn Meyer', 'Lena Musterfrau']);
    await app.close();
  });

  it('filtert den Namen des fremden Kindes, zeigt das eigene aber ganz', async () => {
    const app = bauen();
    const { training, elternA, kindA, kindB } = await trainingMitZweiEltern(app);

    const antwort = await holen(app, training.id, elternA);
    const kinder = antwort.json().kinder as Array<{ id: string; anzeige: string }>;

    // Zwei verschiedene Fragen in einer Antwort. Das **fremde** Kind zeigt
    // nur, was dessen Elternteil freigegeben hat — der Nachname war es
    // nicht. Das **eigene** steht ungefiltert da: Die Freigabe regelt, was
    // andere sehen, und sich selbst gegenüber verbirgt niemand einen Namen,
    // den er eben eingetippt hat.
    //
    // Daran hängt mehr als Bequemlichkeit: Ohne den vollen Namen trügen bei
    // zwei datensparsam angemeldeten Kindern beide Knöpfe „ein Kind
    // abmelden", und das Elternteil hätte beim Austragen die Wahl zwischen
    // zwei nicht unterscheidbaren Möglichkeiten.
    expect(kinder.find((k) => k.id === kindA)?.anzeige).toBe('Finn Meyer');
    expect(kinder.find((k) => k.id === kindB)?.anzeige).toBe('Lena');
    await app.close();
  });
});

describe('POST /jugendtraining/:id/absage', () => {
  it('verlangt beim Absagen einen Grund', async () => {
    const app = bauen();
    const { zugang: guideZugang } = await mitgliedMitToken('guide@example.org', 'guide');
    const training = await trainingAnlegen(app, guideZugang);

    const antwort = await app.inject({
      method: 'POST',
      url: `/jugendtraining/${training.id}/absage`,
      headers: { authorization: `Bearer ${guideZugang}` },
      payload: {},
    });

    expect(antwort.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /jugendtraining/:id/veroeffentlichen', () => {
  it('lehnt ein zweites Veröffentlichen mit 409 ab', async () => {
    const app = bauen();
    const { zugang: guideZugang } = await mitgliedMitToken('guide@example.org', 'guide');
    const training = await trainingAnlegen(app, guideZugang);
    const veroeffentlichen = {
      method: 'POST' as const,
      url: `/jugendtraining/${training.id}/veroeffentlichen`,
      headers: { authorization: `Bearer ${guideZugang}` },
    };

    const erste = await app.inject(veroeffentlichen);
    const zweite = await app.inject(veroeffentlichen);

    expect(erste.statusCode).toBe(200);
    expect(zweite.statusCode).toBe(409);
    await app.close();
  });
});

describe('PUT /jugendtraining/:id/guide', () => {
  it('lehnt eine Zusage auf ein abgesagtes Training mit 409 ab', async () => {
    // Guide A hat den Bildschirm offen, Guide B sagt in der Zwischenzeit ab.
    // Ohne Bedingung in der Anweisung käme A durch, und ein abgesagtes
    // Training stünde mit einer Zusage da — Erfolgsmeldung und roter
    // Absagebanner gleichzeitig auf dem Bildschirm.
    const app = bauen();
    const { zugang: guideA } = await mitgliedMitToken('guideA@example.org', 'guide');
    const { zugang: guideB } = await mitgliedMitToken('guideB@example.org', 'guide');
    const training = await trainingAnlegen(app, guideA);
    await app.inject({
      method: 'POST',
      url: `/jugendtraining/${training.id}/veroeffentlichen`,
      headers: { authorization: `Bearer ${guideA}` },
    });
    await app.inject({
      method: 'POST',
      url: `/jugendtraining/${training.id}/absage`,
      headers: { authorization: `Bearer ${guideB}` },
      payload: { grund: 'Gewitter' },
    });

    const antwort = await app.inject({
      method: 'PUT',
      url: `/jugendtraining/${training.id}/guide`,
      headers: { authorization: `Bearer ${guideA}` },
      payload: { zusage: true },
    });

    expect(antwort.statusCode).toBe(409);
    // Der Satz muss den nächsten Schritt nennen, nicht nur den Fehlschlag.
    expect(antwort.json().fehler).toBe('Dieses Training wurde inzwischen abgesagt.');

    // Und die Zahl der Zusagen bleibt, wo sie war: bei null.
    const nachher = await app.inject({
      method: 'GET',
      url: `/jugendtraining/${training.id}`,
      headers: { authorization: `Bearer ${guideA}` },
    });
    expect(nachher.json().guideZusagen).toBe(0);
    await app.close();
  });

  it('antwortet bei einem unbekannten Training weiterhin mit 404', async () => {
    // „Gibt es nicht" und „ist abgesagt" verlangen Verschiedenes vom Guide —
    // dieselbe Unterscheidung wie beim Veröffentlichen und Absagen.
    const app = bauen();
    const { zugang } = await mitgliedMitToken('guide@example.org', 'guide');

    const antwort = await app.inject({
      method: 'PUT',
      url: '/jugendtraining/00000000-0000-0000-0000-000000000000/guide',
      headers: { authorization: `Bearer ${zugang}` },
      payload: { zusage: true },
    });

    expect(antwort.statusCode).toBe(404);
    await app.close();
  });

  it('nimmt eine Zusage auf ein veröffentlichtes Training weiterhin an', async () => {
    const app = bauen();
    const { zugang } = await mitgliedMitToken('guide@example.org', 'guide');
    const training = await trainingAnlegen(app, zugang);
    await app.inject({
      method: 'POST',
      url: `/jugendtraining/${training.id}/veroeffentlichen`,
      headers: { authorization: `Bearer ${zugang}` },
    });

    const antwort = await app.inject({
      method: 'PUT',
      url: `/jugendtraining/${training.id}/guide`,
      headers: { authorization: `Bearer ${zugang}` },
      payload: { zusage: true },
    });

    expect(antwort.statusCode).toBe(204);
    await app.close();
  });
});

describe('DELETE /jugendtraining/:id/kinder/:kindId', () => {
  it('meldet ein fremdes Kind mit 404 ab, nicht mit 403', async () => {
    const app = bauen();
    const { zugang: guideZugang } = await mitgliedMitToken('guide@example.org', 'guide');
    const { zugang: elternZugangA } = await mitgliedMitToken('elternA@example.org');
    const { zugang: elternZugangB } = await mitgliedMitToken('elternB@example.org');
    const training = await trainingAnlegen(app, guideZugang);
    await app.inject({
      method: 'POST',
      url: `/jugendtraining/${training.id}/veroeffentlichen`,
      headers: { authorization: `Bearer ${guideZugang}` },
    });
    const anmeldung = await app.inject({
      method: 'POST',
      url: `/jugendtraining/${training.id}/kinder`,
      headers: { authorization: `Bearer ${elternZugangA}` },
      payload: { vorname: 'Finn', nachname: 'Meyer' },
    });
    const kindId = anmeldung.json().kindId;

    // "Gibt es nicht" und "gehört dir nicht" dürfen sich für den
    // Anfragenden nicht unterscheiden — deshalb 404 statt 403.
    const antwort = await app.inject({
      method: 'DELETE',
      url: `/jugendtraining/${training.id}/kinder/${kindId}`,
      headers: { authorization: `Bearer ${elternZugangB}` },
    });

    expect(antwort.statusCode).toBe(404);
    await app.close();
  });
});
