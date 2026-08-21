import { describe, expect, it } from 'vitest';

import { baueApp } from '../src/app.ts';
import { pool } from '../src/datenbank.ts';
import {
  baueGesundheit,
  liesVersion,
  pruefeDatenbank,
  statusFuer,
} from '../src/gesundheit.ts';
import { GemerkterMailer } from '../src/mailer.ts';

const jetzt = new Date('2026-08-21T18:07:00Z');

describe('Gesundheitsprüfung — der Endpunkt', () => {
  it('antwortet mit 200, solange die Datenbank erreichbar ist', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const antwort = await app.inject({ method: 'GET', url: '/gesundheit' });

    expect(antwort.statusCode).toBe(200);
    expect(antwort.json()).toMatchObject({
      status: 'ok',
      datenbank: 'ok',
      zeit: '2026-08-21T18:07:00.000Z',
      // Das alte Feld bleibt: `pruefe-adressen.sh` und die Rauchprobe
      // kennen es.
      zustand: 'bereit',
    });
    expect(antwort.json().version).toBe(liesVersion());
    await app.close();
  });

  it('verbietet das Zwischenspeichern', async () => {
    // Eine zwischengespeicherte Gesundheitsmeldung ist eine Lüge mit
    // Verfallsdatum: Der Wächter sähe minutenlang die Antwort von vorhin.
    const app = baueApp({ pool, mailer: new GemerkterMailer() });
    const antwort = await app.inject({ method: 'GET', url: '/gesundheit' });

    expect(antwort.headers['cache-control']).toBe('no-store');
    await app.close();
  });

  it('verlangt keine Anmeldung', async () => {
    // Ohne Token und ohne 401 — der Wächter hat keines und soll keines
    // brauchen.
    const app = baueApp({ pool, mailer: new GemerkterMailer() });
    const antwort = await app.inject({ method: 'GET', url: '/gesundheit' });

    expect(antwort.statusCode).not.toBe(401);
    await app.close();
  });

  it('meldet 503, wenn die Datenbank nicht antwortet', async () => {
    /**
     * **Der Fall, für den es diesen Umbau gibt.** Vorher stand hier ein
     * fester Wert, und der Endpunkt antwortete auch bei toter Datenbank
     * mit 200 — ein Wächter daran meldete „alles in Ordnung", während sich
     * niemand anmelden konnte.
     *
     * Statt Postgres wirklich anzuhalten wird ein Pool eingesetzt, dessen
     * `query` wirft: Der Test soll die **Antwort** prüfen, nicht Docker
     * fernsteuern, und er muss auch dort laufen, wo niemand Container
     * anhalten darf.
     */
    const kaputt = {
      query: () => Promise.reject(new Error('ECONNREFUSED')),
    } as unknown as typeof pool;

    const app = baueApp({ pool: kaputt, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const antwort = await app.inject({ method: 'GET', url: '/gesundheit' });

    expect(antwort.statusCode).toBe(503);
    expect(antwort.json()).toMatchObject({
      status: 'fehler',
      datenbank: 'keine Verbindung',
      // **Nicht „bereit".** Ein Feld, das bei toter Datenbank „bereit"
      // sagt, wäre dieselbe Lüge eine Zeile tiefer.
      zustand: 'gestört',
    });
    // Die Fassung steht auch in der Störung da: „Welcher Stand läuft
    // überhaupt?" ist die erste Frage, die dann jemand stellt.
    expect(antwort.json().version).toBe(liesVersion());
    expect(antwort.headers['cache-control']).toBe('no-store');
    await app.close();
  });

  it('gibt keine Einzelheiten des Fehlers preis', async () => {
    // Was Postgres sagt, nennt Wirtsnamen, Ports und manchmal
    // Benutzernamen — und diese Antwort kann jeder im Netz abrufen.
    const kaputt = {
      query: () => Promise.reject(new Error('connect ECONNREFUSED 10.0.0.5:5432 als mtbie')),
    } as unknown as typeof pool;

    const app = baueApp({ pool: kaputt, mailer: new GemerkterMailer() });
    const koerper = (await app.inject({ method: 'GET', url: '/gesundheit' })).body;

    expect(koerper).not.toContain('ECONNREFUSED');
    expect(koerper).not.toContain('5432');
    expect(koerper).not.toContain('mtbie');
    await app.close();
  });
});

describe('pruefeDatenbank', () => {
  it('meldet „ok" bei einer erreichbaren Datenbank', async () => {
    expect(await pruefeDatenbank(pool)).toBe('ok');
  });

  it('wartet nicht auf eine Datenbank, die gar nicht antwortet', async () => {
    /**
     * Ohne eigene Zeitschranke hinge die Anfrage am Netzzeitablauf des
     * Betriebssystems — Minuten. Der Wächter liefe in seinen eigenen
     * Zeitablauf und meldete „keine Antwort" statt „Datenbank weg": genau
     * dieselbe Meldung wie bei einem abgestürzten Prozess, und damit eine,
     * die nichts unterscheidet.
     */
    const haengt = {
      query: () => new Promise(() => {}),
    } as unknown as typeof pool;

    const begonnen = Date.now();
    expect(await pruefeDatenbank(haengt, 50)).toBe('keine Verbindung');
    expect(Date.now() - begonnen).toBeLessThan(1000);
  });
});

describe('baueGesundheit', () => {
  it('leitet den Status aus der Datenbank ab', () => {
    expect(baueGesundheit('ok', '0.12.4', jetzt).status).toBe('ok');
    expect(baueGesundheit('keine Verbindung', '0.12.4', jetzt).status).toBe('fehler');
  });

  it('trägt dieselben Felder in beiden Fällen', () => {
    // Anders als im Handoff skizziert, wo die Fehlerantwort nur `status`
    // und `datenbank` trägt. Gerade in der Störung ist „welcher Stand
    // läuft da?" die erste Frage.
    const krank = baueGesundheit('keine Verbindung', '0.12.4', jetzt);
    expect(Object.keys(krank).sort()).toEqual(['datenbank', 'status', 'version', 'zeit']);
  });

  it('schreibt die Zeit nach ISO 8601', () => {
    expect(baueGesundheit('ok', '0.12.4', jetzt).zeit).toBe('2026-08-21T18:07:00.000Z');
  });
});

describe('statusFuer', () => {
  it('nimmt 503 und nicht 500', () => {
    // 500 darf ein Proxy zwischenspeichern, 503 heißt „vorübergehend".
    expect(statusFuer(baueGesundheit('keine Verbindung', '0.12.4', jetzt))).toBe(503);
    expect(statusFuer(baueGesundheit('ok', '0.12.4', jetzt))).toBe(200);
  });
});

describe('liesVersion', () => {
  it('liefert die Fassung aus der package.json', () => {
    expect(liesVersion()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
