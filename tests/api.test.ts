import { beforeEach, describe, expect, it } from 'vitest';

import { ApiFehler, ApiZugang } from '../src/data/api';
import { speicherImArbeitsspeicher } from '../src/data/tokenSpeicher';

/** Ein `fetch`, das vorgegebene Antworten der Reihe nach zurückgibt. */
function fetchMit(antworten: Array<{ status: number; koerper?: unknown }>) {
  const aufrufe: Array<{ url: string; init?: RequestInit }> = [];
  let index = 0;
  const impl = (async (url: string, init?: RequestInit) => {
    aufrufe.push({ url, init });
    const antwort = antworten[Math.min(index++, antworten.length - 1)]!;
    return {
      ok: antwort.status >= 200 && antwort.status < 300,
      status: antwort.status,
      json: async () => antwort.koerper ?? {},
    } as Response;
  }) as unknown as typeof fetch;
  return { impl, aufrufe };
}

function zugang(
  antworten: Array<{ status: number; koerper?: unknown }>,
  erneuerung: string | null = null,
) {
  const { impl, aufrufe } = fetchMit(antworten);
  const speicher = speicherImArbeitsspeicher(erneuerung);
  return {
    api: new ApiZugang({ basisUrl: 'http://test', speicher, fetchImpl: impl }),
    aufrufe,
    speicher,
  };
}

describe('fordereAnmeldungAn', () => {
  it('schickt Adresse und Code an den richtigen Pfad', async () => {
    const { api, aufrufe } = zugang([{ status: 202 }]);

    await api.fordereAnmeldungAn('malte@example.org', 'code123');

    expect(aufrufe[0]?.url).toBe('http://test/anmeldung/anfordern');
    expect(JSON.parse(String(aufrufe[0]?.init?.body))).toEqual({
      email: 'malte@example.org',
      einladungscode: 'code123',
    });
  });

  it('lässt den Code weg, wenn keiner angegeben ist', async () => {
    const { api, aufrufe } = zugang([{ status: 202 }]);

    await api.fordereAnmeldungAn('malte@example.org');

    expect(JSON.parse(String(aufrufe[0]?.init?.body))).toEqual({
      email: 'malte@example.org',
    });
  });
});

describe('loeseEin', () => {
  it('legt das Erneuerungs-Token in den Speicher', async () => {
    const { api, speicher } = zugang([
      { status: 200, koerper: { zugang: 'z1', erneuerung: 'e1' } },
    ]);

    await api.loeseEin('magic');

    expect(await speicher.lies()).toBe('e1');
    expect(await api.istAngemeldet()).toBe(true);
  });

  it('wirft bei ungültigem Link', async () => {
    const { api, speicher } = zugang([{ status: 401 }]);

    await expect(api.loeseEin('kaputt')).rejects.toBeInstanceOf(ApiFehler);
    expect(await speicher.lies()).toBeNull();
  });
});

describe('hole', () => {
  it('schickt das Zugangs-Token mit', async () => {
    const { api, aufrufe } = zugang([
      { status: 200, koerper: { zugang: 'z1', erneuerung: 'e1' } },
      { status: 200, koerper: { belegt: 3 } },
    ]);
    await api.loeseEin('magic');

    await api.hole('/termine/abc');

    const kopf = aufrufe[1]?.init?.headers as Record<string, string>;
    expect(kopf.authorization).toBe('Bearer z1');
  });

  it('erneuert bei 401 selbsttätig und wiederholt die Anfrage', async () => {
    // 1. Einlösen · 2. Anfrage → 401 · 3. Erneuern · 4. Wiederholung → 200
    const { api, aufrufe } = zugang([
      { status: 200, koerper: { zugang: 'z1', erneuerung: 'e1' } },
      { status: 401 },
      { status: 200, koerper: { zugang: 'z2', erneuerung: 'e2' } },
      { status: 200, koerper: { belegt: 3 } },
    ]);
    await api.loeseEin('magic');

    const ergebnis = await api.hole<{ belegt: number }>('/termine/abc');

    expect(ergebnis.belegt).toBe(3);
    expect(aufrufe[2]?.url).toBe('http://test/sitzung/erneuern');
    const kopf = aufrufe[3]?.init?.headers as Record<string, string>;
    expect(kopf.authorization).toBe('Bearer z2');
  });

  it('meldet ab, wenn auch die Erneuerung scheitert', async () => {
    const { api, speicher } = zugang(
      [{ status: 401 }, { status: 401 }],
      'altes-erneuerungs-token',
    );

    await expect(api.hole('/konto')).rejects.toBeInstanceOf(ApiFehler);
    expect(await speicher.lies()).toBeNull();
    expect(await api.istAngemeldet()).toBe(false);
  });

  it('reicht Belegung und Plätze aus einer 409-Antwort weiter', async () => {
    const { api } = zugang([
      { status: 409, koerper: { fehler: 'Die Tour ist voll.', belegt: 12, plaetze: 12 } },
    ]);

    try {
      await api.sende('/termine/abc', 'POST');
      expect.unreachable('hätte werfen müssen');
    } catch (fehler) {
      expect(fehler).toBeInstanceOf(ApiFehler);
      expect((fehler as ApiFehler).status).toBe(409);
      expect((fehler as ApiFehler).message).toBe('Die Tour ist voll.');
      expect((fehler as ApiFehler).feld?.belegt).toBe(12);
    }
  });
});

describe('abmelden', () => {
  it('räumt den Speicher, auch wenn der Server nicht antwortet', async () => {
    const { api, speicher } = zugang([{ status: 500 }], 'e1');

    await api.abmelden();

    expect(await speicher.lies()).toBeNull();
    expect(await api.istAngemeldet()).toBe(false);
  });
});
