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

describe('Kopfzeile "content-type"', () => {
  it('bleibt weg, wenn eine Anfrage keinen Körper hat', async () => {
    // Fastify weist eine Anfrage mit "content-type: application/json", aber
    // leerem Körper schon vor jeder eigenen Prüfung ab — noch bevor das
    // Token geprüft wird. `sende(pfad, 'POST')` ohne `koerper` (etwa die
    // Tour- und die Abmelde-Anfrage der Tourenanmeldung) darf die
    // Kopfzeile deshalb nicht setzen.
    const { api, aufrufe } = zugang([
      { status: 200, koerper: { zugang: 'z1', erneuerung: 'e1' } },
      { status: 200 },
    ]);
    await api.loeseEin('magic');

    await api.sende('/termine/abc', 'POST');

    const kopf = aufrufe[1]?.init?.headers as Record<string, string>;
    expect(kopf['content-type']).toBeUndefined();
  });

  it('steht da, sobald ein Körper mitgeht', async () => {
    const { api, aufrufe } = zugang([{ status: 202 }]);

    await api.fordereAnmeldungAn('malte@example.org');

    const kopf = aufrufe[0]?.init?.headers as Record<string, string>;
    expect(kopf['content-type']).toBe('application/json');
  });
});

describe('Fehlertext der Antwort', () => {
  it('liest "message", wenn Fastify selbst die Anfrage abweist, nicht "fehler"', async () => {
    // Genau die Antwort, die Fastify bei FST_ERR_CTP_EMPTY_JSON_BODY schickt
    // — unser eigener Code läuft in diesem Fall gar nicht erst.
    const { api } = zugang([
      {
        status: 400,
        koerper: {
          statusCode: 400,
          code: 'FST_ERR_CTP_EMPTY_JSON_BODY',
          message: "Body cannot be empty when content-type is set to 'application/json'",
        },
      },
    ]);

    await expect(api.fordereAnmeldungAn('malte@example.org')).rejects.toMatchObject({
      message: "Body cannot be empty when content-type is set to 'application/json'",
    });
  });

  it('lässt "plaetze" unbestimmt, wenn die Antwort das Feld gar nicht mitschickt', async () => {
    // null bedeutet in der API "unbegrenzt viele Plätze" — ein 404 ohne
    // dieses Feld darf nicht so aussehen.
    const { api } = zugang([{ status: 404, koerper: { fehler: 'Diesen Termin gibt es nicht.' } }]);

    try {
      await api.hole('/termine/unbekannt');
      expect.unreachable('hätte werfen müssen');
    } catch (fehler) {
      expect((fehler as ApiFehler).feld?.plaetze).toBeUndefined();
    }
  });
});

describe('Erneuerung: nur 401 löscht das Token', () => {
  it('behält das Erneuerungs-Token, wenn die Erneuerung an der Ratenbegrenzung scheitert (429)', async () => {
    const { api, speicher } = zugang(
      [{ status: 401 }, { status: 429 }],
      'e0',
    );

    await expect(api.hole('/konto')).rejects.toBeInstanceOf(ApiFehler);
    expect(await speicher.lies()).toBe('e0');
    expect(await api.istAngemeldet()).toBe(true);
  });

  it('löscht das Erneuerungs-Token, wenn die Erneuerung selbst mit 401 scheitert', async () => {
    const { api, speicher } = zugang(
      [{ status: 401 }, { status: 401 }],
      'altes-erneuerungs-token',
    );

    await expect(api.hole('/konto')).rejects.toBeInstanceOf(ApiFehler);
    expect(await speicher.lies()).toBeNull();
    expect(await api.istAngemeldet()).toBe(false);
  });
});

describe('Erneuerung: gleichzeitige Aufrufer', () => {
  it('löst genau eine Erneuerung aus, wenn zwei Anfragen gleichzeitig auf 401 laufen', async () => {
    const { api, aufrufe } = zugang([
      { status: 200, koerper: { zugang: 'z1', erneuerung: 'e1' } }, // loeseEin
      { status: 401 }, // erste Anfrage (/konto)
      { status: 401 }, // zweite Anfrage (/termine/abc), zeitgleich
      { status: 200, koerper: { zugang: 'z2', erneuerung: 'e2' } }, // die eine Erneuerung
      { status: 200, koerper: { belegt: 1 } }, // Wiederholung /konto
      { status: 200, koerper: { belegt: 2 } }, // Wiederholung /termine/abc
    ]);
    await api.loeseEin('magic');

    const [a, b] = await Promise.all([
      api.hole<{ belegt: number }>('/konto'),
      api.hole<{ belegt: number }>('/termine/abc'),
    ]);

    expect(a.belegt).toBe(1);
    expect(b.belegt).toBe(2);
    const erneuerungsAufrufe = aufrufe.filter((a) => a.url === 'http://test/sitzung/erneuern');
    expect(erneuerungsAufrufe).toHaveLength(1);
  });
});

describe('Netzwerkfehler', () => {
  it('kommt als ApiFehler mit deutschem Text an, wenn fetch selbst scheitert', async () => {
    const speicher = speicherImArbeitsspeicher();
    const kaputtesFetch = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const api = new ApiZugang({ basisUrl: 'http://test', speicher, fetchImpl: kaputtesFetch });

    try {
      await api.fordereAnmeldungAn('malte@example.org');
      expect.unreachable('hätte werfen müssen');
    } catch (fehler) {
      expect(fehler).toBeInstanceOf(ApiFehler);
      expect((fehler as ApiFehler).status).toBe(0);
      expect((fehler as ApiFehler).message).not.toMatch(/TypeError|Failed to fetch/);
    }
  });
});
