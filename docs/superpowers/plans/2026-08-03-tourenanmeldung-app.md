# Plan 3 — Tourenanmeldung (App)

> **Für agentische Bearbeiter:** ERFORDERLICHE UNTER-SKILL: `superpowers:subagent-driven-development` (empfohlen) oder `superpowers:executing-plans`, um diesen Plan Aufgabe für Aufgabe umzusetzen. Die Schritte nutzen Kästchen (`- [ ]`) zur Nachverfolgung.

**Ziel:** Ein Mitglied meldet sich in der App an und trägt sich mit zwei Fingertipps zu einer Tour ein; die Terminansicht zeigt, wie viele Plätze noch frei sind.

**Architektur:** Ein neues Modul `src/data/api.ts` spricht die API — getrennt von `repository.ts`, weil es andere Regeln hat: Es braucht ein Token, es schreibt, und es darf scheitern, ohne die App zu beeinträchtigen. Der Anmeldezustand lebt in einem eigenen Kontext neben `AppDataContext`; Token liegen im Schlüsselbund des Geräts, nicht in AsyncStorage. Die Terminliste bleibt unberührt — sie funktioniert weiter ohne jeden Server.

**Technik:** Expo SDK 57 · React Native · `expo-secure-store` · `expo-linking` · Vitest

**Voraussetzung:** Die API aus den Plänen 1, 1b und 2 ist umgesetzt. Sie läuft für die Entwicklung lokal (`cd api && npm start`, Postgres über `docker compose`).

## Übergreifende Vorgaben

Diese gelten für **jede** Aufgabe:

- **Sprache:** Code, Kommentare und Commit-Nachrichten auf Deutsch. Fachbegriffe ohne gute Entsprechung (Token, Hash, Commit) bleiben stehen.
- **Die App muss ohne API vollständig benutzbar bleiben.** Termine, Filter, Aktuelles, Verein, Erinnerungen funktionieren wie heute — ohne Netz, ohne Server, ohne Konto. Das ist das Kernversprechen des Projekts (`README.md`), und keine Aufgabe dieses Plans darf es brechen.
- **Token nur in `expo-secure-store`** (iOS Keychain, Android Keystore). Niemals in AsyncStorage: dort liegt alles im Klartext auf dem Gerät.
- **Das Zugangs-Token nur im Arbeitsspeicher**, nicht auf der Platte — es gilt 15 Minuten und wird bei Bedarf aus dem Erneuerungs-Token nachgezogen.
- **Keine stillen Fehlschläge.** Was schiefgeht, sieht die Person — in ihrer Sprache, nicht als Statuscode.
- **Expo gibt Paketversionen vor.** Neue Pakete ausschließlich über `npx expo install`, nie von Hand. `npx expo install --check` wacht darüber.
- **Rechenlogik ohne React Native**, damit sie ohne Gerät prüfbar bleibt — das Muster des Projekts (`notifications/scheduler.ts` gegenüber `notifications/index.ts`).
- **Nach jeder Aufgabe committen.** Kleine Commits, deutsche Nachricht.
- Vor jeder Rückmeldung: `npm test`, `npm run typecheck`, `npx expo install --check` — alle grün.

## Getroffene Entscheidungen

Vom Auftraggeber am 03.08.2026 entschieden:

| Frage | Entscheidung | Warum |
|---|---|---|
| Wo erscheint die Belegung? | **Nur in der Terminansicht** | Die Liste bleibt schnell und offlinefähig; eine Abfrage je geöffnetem Termin statt je sichtbarer Karte |
| Was wird aus dem Mail-Knopf? | **Bleibt als Rückfallebene** | Ohne Netz ist der Mail-Entwurf die einzige Anmeldung, die noch geht — im Wald der Normalfall |
| Wo meldet man sich an? | **Eigener Bereich unter Einstellungen** | Wer sich nie anmeldet, sieht die App wie bisher; nichts drängt sich auf |

---

## Aufgabe 1: Der API-Zugang

Das Modul, das mit der API spricht — und der Schlüsselbund, in dem das Erneuerungs-Token liegt.

**Dateien:**
- Anlegen: `src/data/api.ts`
- Anlegen: `src/data/tokenSpeicher.ts`
- Anlegen: `tests/api.test.ts`
- Ändern: `src/config.ts` — `API_BASE_URL`
- Ändern: `package.json` — `expo-secure-store` (über `npx expo install`)

**Schnittstellen:**
- Liefert: `interface TokenSpeicher { lies(): Promise<string | null>; schreib(token: string): Promise<void>; loesche(): Promise<void> }`
- Liefert: `sicherer TokenSpeicher` als `secureTokenSpeicher` — nutzt `expo-secure-store`
- Liefert: `class ApiZugang` mit `constructor(deps: { basisUrl: string; speicher: TokenSpeicher; fetchImpl?: typeof fetch })` und den Methoden:
  - `fordereAnmeldungAn(email: string, einladungscode?: string): Promise<void>`
  - `loeseEin(token: string): Promise<void>` — speichert das Erneuerungs-Token, hält das Zugangs-Token im Speicher
  - `istAngemeldet(): Promise<boolean>`
  - `abmelden(): Promise<void>`
  - `hole<T>(pfad: string): Promise<T>` und `sende<T>(pfad: string, methode: 'POST' | 'DELETE', koerper?: unknown): Promise<T>` — beide mit selbsttätiger Erneuerung bei 401
- Liefert: `class ApiFehler extends Error` mit `status: number` und `feld?: { belegt?: number; plaetze?: number | null }`

- [ ] **Schritt 1: `expo-secure-store` installieren**

```bash
npx expo install expo-secure-store
npx expo install --check
```

Erwartet: „Dependencies are up to date". Von Hand in `package.json` schreiben ist verboten — Expo gibt die Version vor.

- [ ] **Schritt 2: `src/config.ts` ergänzen**

Bei den anderen Adressen:

```ts
/**
 * Die Adresse der Vereins-API.
 *
 * Nur für Anmeldung und Tourenanmeldung. Termine und Beiträge holt die App
 * weiterhin direkt von Google und der Website — die API ist ein Zusatz, kein
 * Umweg. Fällt sie aus, bleibt die App vollständig benutzbar.
 *
 * In der Entwicklung zeigt sie auf den lokalen Server (`cd api && npm start`).
 * `EXPO_PUBLIC_API_URL` überschreibt sie, ohne dass jemand Code anfassen muss.
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (__DEV__ ? 'http://localhost:3000' : 'https://api.mtb-bielefeld.de');
```

**Achtung:** `src/config.ts` greift seit Plan 2 über `globalThis` auf `__DEV__` zu, damit die Datei auch unter Node typisierbar bleibt. Sieh nach, wie es dort steht, und mach es genauso — **nicht** den nackten Bezeichner benutzen.

- [ ] **Schritt 3: `src/data/tokenSpeicher.ts` schreiben**

```ts
/**
 * Wo das Erneuerungs-Token liegt.
 *
 * Im Schlüsselbund des Geräts (iOS Keychain, Android Keystore), nicht in
 * AsyncStorage: Dort liegt alles im Klartext, und ein Token, das 60 Tage
 * gilt, gehört nicht offen auf die Platte.
 *
 * Die Schnittstelle steht getrennt von der Umsetzung, damit Tests einen
 * Speicher im Arbeitsspeicher einsetzen können — dasselbe Muster wie bei
 * `KeyValueStore` in `store.ts`.
 */

import * as SecureStore from 'expo-secure-store';

export interface TokenSpeicher {
  lies(): Promise<string | null>;
  schreib(token: string): Promise<void>;
  loesche(): Promise<void>;
}

const SCHLUESSEL = 'mtbie.erneuerung';

export const secureTokenSpeicher: TokenSpeicher = {
  lies: () => SecureStore.getItemAsync(SCHLUESSEL),
  schreib: (token) => SecureStore.setItemAsync(SCHLUESSEL, token),
  loesche: () => SecureStore.deleteItemAsync(SCHLUESSEL),
};

/** Für Tests: hält das Token im Arbeitsspeicher. */
export function speicherImArbeitsspeicher(anfangswert: string | null = null): TokenSpeicher {
  let wert = anfangswert;
  return {
    lies: async () => wert,
    schreib: async (token) => {
      wert = token;
    },
    loesche: async () => {
      wert = null;
    },
  };
}
```

- [ ] **Schritt 4: Den fehlschlagenden Test schreiben**

`tests/api.test.ts`:

```ts
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
```

- [ ] **Schritt 5: Test laufen lassen und Fehlschlag bestätigen**

```bash
npm test -- tests/api.test.ts
```

Erwartet: `Cannot find module '../src/data/api'`.

- [ ] **Schritt 6: `src/data/api.ts` schreiben**

```ts
/**
 * Der Zugang zur Vereins-API.
 *
 * Bewusst getrennt von `repository.ts`: Termine und Beiträge holt die App
 * ohne Konto und ohne Server-Abhängigkeit, hier dagegen gilt anderes — es
 * braucht ein Token, es wird geschrieben, und ein Ausfall darf die App
 * nicht mitreißen. Wer diese Trennung aufhebt, hängt die Terminliste an
 * einen Server, den sie nicht braucht.
 *
 * Die Sitzung besteht aus zwei Token: Das **Zugangs-Token** gilt 15 Minuten
 * und lebt nur im Arbeitsspeicher; das **Erneuerungs-Token** gilt 60 Tage
 * und liegt im Schlüsselbund. Läuft der Zugang ab, zieht dieses Modul ihn
 * selbsttätig nach — die Bildschirme merken davon nichts.
 */

import type { TokenSpeicher } from './tokenSpeicher';

/** Ein Fehler, den die API selbst benannt hat — mit ihrem deutschen Text. */
export class ApiFehler extends Error {
  readonly status: number;
  /** Zusatzangaben, die die API mitschickt — etwa Belegung bei „voll". */
  readonly feld?: { belegt?: number; plaetze?: number | null };

  constructor(status: number, nachricht: string, feld?: ApiFehler['feld']) {
    super(nachricht);
    this.name = 'ApiFehler';
    this.status = status;
    this.feld = feld;
  }
}

export interface ApiAbhaengigkeiten {
  basisUrl: string;
  speicher: TokenSpeicher;
  fetchImpl?: typeof fetch;
}

/** Nach dieser Zeit gilt eine Anfrage als gescheitert. */
const ZEITGRENZE_MS = 15000;

export class ApiZugang {
  readonly #basisUrl: string;
  readonly #speicher: TokenSpeicher;
  readonly #fetch: typeof fetch;
  /** Nur im Arbeitsspeicher — nie auf der Platte. */
  #zugang: string | null = null;

  constructor({ basisUrl, speicher, fetchImpl }: ApiAbhaengigkeiten) {
    this.#basisUrl = basisUrl.replace(/\/$/, '');
    this.#speicher = speicher;
    this.#fetch = fetchImpl ?? fetch;
  }

  async #ruf(pfad: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ZEITGRENZE_MS);
    try {
      return await this.#fetch(`${this.#basisUrl}${pfad}`, {
        ...init,
        signal: controller.signal,
        headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /** Wirft einen `ApiFehler` mit dem Text der API, sonst gibt es den Körper. */
  async #auswerten<T>(antwort: Response): Promise<T> {
    const koerper = (await antwort.json().catch(() => ({}))) as Record<string, unknown>;
    if (!antwort.ok) {
      throw new ApiFehler(
        antwort.status,
        typeof koerper.fehler === 'string' ? koerper.fehler : 'Da ist etwas schiefgegangen.',
        {
          belegt: typeof koerper.belegt === 'number' ? koerper.belegt : undefined,
          plaetze: typeof koerper.plaetze === 'number' ? koerper.plaetze : null,
        },
      );
    }
    return koerper as T;
  }

  async fordereAnmeldungAn(email: string, einladungscode?: string): Promise<void> {
    const antwort = await this.#ruf('/anmeldung/anfordern', {
      method: 'POST',
      body: JSON.stringify(einladungscode ? { email, einladungscode } : { email }),
    });
    await this.#auswerten(antwort);
  }

  async loeseEin(magicToken: string): Promise<void> {
    const antwort = await this.#ruf('/anmeldung/einloesen', {
      method: 'POST',
      body: JSON.stringify({ token: magicToken }),
    });
    const paar = await this.#auswerten<{ zugang: string; erneuerung: string }>(antwort);
    this.#zugang = paar.zugang;
    await this.#speicher.schreib(paar.erneuerung);
  }

  async istAngemeldet(): Promise<boolean> {
    return (await this.#speicher.lies()) !== null;
  }

  /**
   * Abmelden räumt in jedem Fall auf.
   *
   * Auch wenn der Server nicht antwortet: Wer abmelden will, ist danach
   * abgemeldet. Ein Token, das auf dem Gerät bleibt, weil der Server gerade
   * hustet, wäre das Gegenteil dessen, was der Knopf verspricht.
   */
  async abmelden(): Promise<void> {
    const erneuerung = await this.#speicher.lies();
    this.#zugang = null;
    await this.#speicher.loesche();
    if (!erneuerung) return;
    try {
      await this.#ruf('/sitzung', {
        method: 'DELETE',
        body: JSON.stringify({ erneuerung }),
      });
    } catch {
      // Das Gerät ist abgemeldet; die Sitzung serverseitig zu beenden war
      // nur die Kür. Sie läuft ohnehin ab.
    }
  }

  /** Zieht ein neues Zugangs-Token nach. `false`, wenn das nicht mehr geht. */
  async #erneuern(): Promise<boolean> {
    const erneuerung = await this.#speicher.lies();
    if (!erneuerung) return false;

    const antwort = await this.#ruf('/sitzung/erneuern', {
      method: 'POST',
      body: JSON.stringify({ erneuerung }),
    });
    if (!antwort.ok) {
      // Das Erneuerungs-Token gilt nicht mehr — dann ist die Sitzung vorbei.
      this.#zugang = null;
      await this.#speicher.loesche();
      return false;
    }
    const paar = (await antwort.json()) as { zugang: string; erneuerung: string };
    this.#zugang = paar.zugang;
    await this.#speicher.schreib(paar.erneuerung);
    return true;
  }

  async #mitToken<T>(pfad: string, init: RequestInit): Promise<T> {
    const kopf = () =>
      this.#zugang ? { authorization: `Bearer ${this.#zugang}` } : undefined;

    let antwort = await this.#ruf(pfad, { ...init, headers: kopf() });

    // Ein abgelaufenes Zugangs-Token ist der Normalfall, nicht die Ausnahme:
    // Es gilt 15 Minuten. Einmal nachziehen und wiederholen.
    if (antwort.status === 401 && (await this.#erneuern())) {
      antwort = await this.#ruf(pfad, { ...init, headers: kopf() });
    }

    return this.#auswerten<T>(antwort);
  }

  hole<T>(pfad: string): Promise<T> {
    return this.#mitToken<T>(pfad, { method: 'GET' });
  }

  sende<T>(pfad: string, methode: 'POST' | 'DELETE', koerper?: unknown): Promise<T> {
    return this.#mitToken<T>(pfad, {
      method: methode,
      body: koerper === undefined ? undefined : JSON.stringify(koerper),
    });
  }
}
```

- [ ] **Schritt 7: Alles prüfen und committen**

```bash
npm test && npm run typecheck && npx expo install --check
git add src/ tests/ package.json package-lock.json
git commit -m "Zugang zur Vereins-API mit Token im Schlüsselbund"
```

---

## Aufgabe 2: Der Anmeldezustand

Ein Kontext, der weiß, ob jemand angemeldet ist — und der den Magic Link aus der Mail entgegennimmt.

**Dateien:**
- Anlegen: `src/konto/KontoContext.tsx`
- Anlegen: `src/konto/magicLink.ts`
- Anlegen: `tests/magicLink.test.ts`
- Ändern: `app/_layout.tsx` — Kontext einhängen
- Ändern: `app.json` — `expo-secure-store` als Plugin, falls nötig

**Schnittstellen:**
- Liefert: `extrahiereMagicToken(url: string): string | null` aus `magicLink.ts`
- Liefert: `KontoProvider` und `useKonto(): KontoZustand` mit
  ```ts
  interface KontoZustand {
    angemeldet: boolean;
    /** Erster Blick in den Schlüsselbund läuft noch. */
    laedt: boolean;
    api: ApiZugang;
    anmeldungAnfordern(email: string, code?: string): Promise<void>;
    abmelden(): Promise<void>;
    /** Zuletzt eingelöster Link — die Oberfläche zeigt danach eine Bestätigung. */
    zuletztEingeloest: number | null;
  }
  ```

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`tests/magicLink.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { extrahiereMagicToken } from '../src/konto/magicLink';

describe('extrahiereMagicToken', () => {
  it('liest den Token aus einer Anmeldeadresse', () => {
    expect(extrahiereMagicToken('mtbie://anmeldung/abc-123_XYZ')).toBe('abc-123_XYZ');
  });

  it('versteht auch die Web-Adresse', () => {
    expect(extrahiereMagicToken('https://app.mtb-bielefeld.de/anmeldung/abc-123')).toBe(
      'abc-123',
    );
  });

  it('ignoriert andere Adressen', () => {
    expect(extrahiereMagicToken('mtbie://termin/xyz')).toBeNull();
    expect(extrahiereMagicToken('https://mtb-bielefeld.de/')).toBeNull();
    expect(extrahiereMagicToken('')).toBeNull();
  });

  it('ignoriert eine Adresse ohne Token', () => {
    expect(extrahiereMagicToken('mtbie://anmeldung/')).toBeNull();
    expect(extrahiereMagicToken('mtbie://anmeldung')).toBeNull();
  });

  it('lässt einen angehängten Fragezeichenteil weg', () => {
    expect(extrahiereMagicToken('mtbie://anmeldung/abc?quelle=mail')).toBe('abc');
  });
});
```

- [ ] **Schritt 2: Fehlschlag bestätigen**

```bash
npm test -- tests/magicLink.test.ts
```

- [ ] **Schritt 3: `src/konto/magicLink.ts` schreiben**

```ts
/**
 * Den Anmelde-Token aus der angetippten Adresse ziehen.
 *
 * Der Link in der Mail sieht so aus:
 *
 *     https://app.mtb-bielefeld.de/anmeldung/<token>
 *
 * Auf dem Gerät kommt er je nach Weg als `https://…` (Universal Link) oder
 * als `mtbie://anmeldung/<token>` (App-Schema) an. Beides führt hierher.
 *
 * Bewusst ohne `URL`-Klasse: React Native bringt sie in unterschiedlichen
 * Fassungen mit, und für „alles nach `/anmeldung/`" ist sie ohnehin zu viel
 * Werkzeug.
 */

const MUSTER = /\/anmeldung\/([A-Za-z0-9_-]+)/;

export function extrahiereMagicToken(url: string): string | null {
  const treffer = MUSTER.exec(url);
  return treffer?.[1] ?? null;
}
```

- [ ] **Schritt 4: Test grün, dann `src/konto/KontoContext.tsx` schreiben**

```tsx
/**
 * Wer ist angemeldet — und was passiert, wenn jemand den Link antippt.
 *
 * Ein eigener Kontext neben `AppDataContext`, nicht darin: Termine und
 * Beiträge sind für jeden da, das Konto ist es nicht. Wer die App nie
 * anmeldet, merkt von diesem Kontext nichts außer einem `angemeldet: false`.
 */

import * as Linking from 'expo-linking';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { API_BASE_URL } from '../config';
import { ApiZugang } from '../data/api';
import { secureTokenSpeicher, type TokenSpeicher } from '../data/tokenSpeicher';
import { extrahiereMagicToken } from './magicLink';

export interface KontoZustand {
  angemeldet: boolean;
  laedt: boolean;
  api: ApiZugang;
  anmeldungAnfordern(email: string, code?: string): Promise<void>;
  abmelden(): Promise<void>;
  zuletztEingeloest: number | null;
}

const Kontext = createContext<KontoZustand | null>(null);

export function KontoProvider({
  children,
  speicher = secureTokenSpeicher,
  basisUrl = API_BASE_URL,
}: {
  children: ReactNode;
  speicher?: TokenSpeicher;
  basisUrl?: string;
}) {
  const api = useMemo(() => new ApiZugang({ basisUrl, speicher }), [basisUrl, speicher]);
  const [angemeldet, setAngemeldet] = useState(false);
  const [laedt, setLaedt] = useState(true);
  const [zuletztEingeloest, setZuletztEingeloest] = useState<number | null>(null);

  // Beim Start einmal in den Schlüsselbund sehen.
  useEffect(() => {
    let abgebrochen = false;
    void api
      .istAngemeldet()
      .then((wert) => {
        if (!abgebrochen) setAngemeldet(wert);
      })
      .finally(() => {
        if (!abgebrochen) setLaedt(false);
      });
    return () => {
      abgebrochen = true;
    };
  }, [api]);

  const loeseEin = useCallback(
    async (url: string) => {
      const token = extrahiereMagicToken(url);
      if (!token) return;
      try {
        await api.loeseEin(token);
        setAngemeldet(true);
        setZuletztEingeloest(Date.now());
      } catch (fehler) {
        // Ein abgelaufener Link ist Alltag, kein Absturz. Die Oberfläche
        // erfährt es über `angemeldet: false`; wer den Grund sehen will,
        // fordert einen neuen Link an.
        console.warn('Anmeldelink ließ sich nicht einlösen:', fehler);
      }
    },
    [api],
  );

  // Zwei Wege: Die App lag im Hintergrund (Ereignis) oder wurde vom Link
  // erst gestartet (Anfangsadresse).
  useEffect(() => {
    const abo = Linking.addEventListener('url', ({ url }) => void loeseEin(url));
    void Linking.getInitialURL().then((url) => {
      if (url) void loeseEin(url);
    });
    return () => abo.remove();
  }, [loeseEin]);

  const wert = useMemo<KontoZustand>(
    () => ({
      angemeldet,
      laedt,
      api,
      zuletztEingeloest,
      anmeldungAnfordern: (email, code) => api.fordereAnmeldungAn(email, code),
      abmelden: async () => {
        await api.abmelden();
        setAngemeldet(false);
      },
    }),
    [angemeldet, laedt, api, zuletztEingeloest],
  );

  return <Kontext.Provider value={wert}>{children}</Kontext.Provider>;
}

export function useKonto(): KontoZustand {
  const wert = useContext(Kontext);
  if (!wert) throw new Error('useKonto braucht einen KontoProvider darüber.');
  return wert;
}
```

- [ ] **Schritt 5: In `app/_layout.tsx` einhängen**

Der `KontoProvider` kommt **innerhalb** von `AppDataProvider` und außerhalb von `NotificationProvider` — er braucht keine Daten, aber die Erinnerungen könnten später den Anmeldezustand brauchen:

```tsx
        <AppDataProvider>
          <KontoProvider>
            <NotificationProvider>
              <AppStack />
            </NotificationProvider>
          </KontoProvider>
        </AppDataProvider>
```

- [ ] **Schritt 6: Prüfen und committen**

```bash
npm test && npm run typecheck && npx expo install --check
git add src/ tests/ app/_layout.tsx
git commit -m "Anmeldezustand der App, mit Magic Link aus der Mail"
```

---

## Aufgabe 3: Der Anmeldebereich in den Einstellungen

Wo man sich anmeldet — und sieht, dass man angemeldet ist.

**Dateien:**
- Anlegen: `src/features/konto/AnmeldeKarte.tsx`
- Ändern: `app/(tabs)/einstellungen.tsx` — Karte einsetzen

**Schnittstellen:**
- Liefert: `AnmeldeKarte` — eine `Card` ohne Eigenschaften, die sich alles über `useKonto()` holt

- [ ] **Schritt 1: `src/features/konto/AnmeldeKarte.tsx` schreiben**

Drei Zustände in einer Karte: nicht angemeldet (Formular), Mail unterwegs (Hinweis), angemeldet (Adresse plus Abmelden).

```tsx
/**
 * Der Anmeldebereich in den Einstellungen.
 *
 * Bewusst hier und nicht an der Terminansicht: Wer sich nie anmeldet, soll
 * die App benutzen wie bisher. Die Anmeldung ist ein Zusatz für Mitglieder,
 * keine Hürde vor dem Kalender.
 *
 * Kein Passwort: Die API schickt einen Link an die hinterlegte Adresse. Der
 * Einladungscode ist nur beim ersten Mal nötig — wer schon ein Konto hat,
 * gibt bloß seine Adresse ein.
 */

import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { useKonto } from '../../konto/KontoContext';
import { font, fontSize, radius, spacing } from '../../theme';
import { ActionButton, Banner, Card, Label } from '../../ui/components';
import { useTheme } from '../../ui/theme';

export function AnmeldeKarte() {
  const { palette } = useTheme();
  const { angemeldet, laedt, anmeldungAnfordern, abmelden } = useKonto();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [angefordert, setAngefordert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  if (laedt) return null;

  if (angemeldet) {
    return (
      <Card>
        <Label>Mein Konto</Label>
        <Text style={[styles.zustand, { color: palette.text }]}>Du bist angemeldet.</Text>
        <Text style={[styles.hinweis, { color: palette.textMuted }]}>
          Damit kannst du dich in der Terminansicht zu Touren an- und abmelden.
        </Text>
        <View style={styles.knopf}>
          <ActionButton label="Abmelden" tone="secondary" onPress={() => void abmelden()} />
        </View>
      </Card>
    );
  }

  async function anfordern() {
    setFehler(null);
    setLaeuft(true);
    try {
      await anmeldungAnfordern(email.trim(), code.trim() || undefined);
      setAngefordert(true);
    } catch {
      // Die API antwortet absichtlich immer gleich; ein Fehler hier heißt,
      // dass sie gar nicht erreichbar war.
      setFehler('Der Verein ist gerade nicht erreichbar. Versuch es später noch einmal.');
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Card>
      <Label>Mein Konto</Label>

      {angefordert ? (
        <>
          <Text style={[styles.zustand, { color: palette.text }]}>Schau in dein Postfach.</Text>
          <Text style={[styles.hinweis, { color: palette.textMuted }]}>
            Wenn die Angaben stimmen, ist eine Mail an {email.trim()} unterwegs. Tipp den Link
            darin an — er gilt 15 Minuten.
          </Text>
          <View style={styles.knopf}>
            <ActionButton
              label="Nochmal versuchen"
              tone="secondary"
              onPress={() => setAngefordert(false)}
            />
          </View>
        </>
      ) : (
        <>
          <Text style={[styles.hinweis, { color: palette.textMuted }]}>
            Als Mitglied kannst du dich zu Touren anmelden. Du bekommst einen Link per Mail —
            ein Passwort brauchst du nicht.
          </Text>

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="deine@adresse.de"
            placeholderTextColor={palette.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            style={[styles.feld, { color: palette.text, borderColor: palette.border, backgroundColor: palette.surface }]}
          />

          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="Einladungscode (nur beim ersten Mal)"
            placeholderTextColor={palette.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.feld, { color: palette.text, borderColor: palette.border, backgroundColor: palette.surface }]}
          />

          {fehler ? (
            <View style={styles.banner}>
              <Banner tone="danger" text={fehler} />
            </View>
          ) : null}

          <View style={styles.knopf}>
            <ActionButton
              label={laeuft ? 'Wird angefordert …' : 'Link anfordern'}
              onPress={() => void anfordern()}
            />
          </View>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  zustand: {
    fontFamily: font.semibold,
    fontSize: fontSize.lg,
    marginTop: spacing.sm,
  },
  hinweis: {
    fontFamily: font.regular,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  feld: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    fontFamily: font.regular,
    fontSize: fontSize.md,
    marginTop: spacing.md,
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  banner: {
    marginTop: spacing.md,
  },
  knopf: {
    marginTop: spacing.lg,
  },
});
```

Prüfe beim Umsetzen, ob `Label` und `ActionButton` genau diese Eigenschaften haben (`src/ui/components.tsx`) — der Plan beschreibt den Stand bei Planerstellung.

- [ ] **Schritt 2: In `app/(tabs)/einstellungen.tsx` einsetzen**

Als **erste** Karte, noch vor „Termin-Erinnerungen":

```tsx
      <AnmeldeKarte />
```

Import ergänzen. Die bestehenden Karten bleiben unverändert.

- [ ] **Schritt 3: Prüfen, ansehen, committen**

```bash
npm test && npm run typecheck && npm run vorschau
```

Sieh dir `docs/screenshots/einstellungen.png` an: Die Karte muss oben stehen, die Eingabefelder müssen lesbar sein, und im dunklen Schema muss der Platzhaltertext erkennbar bleiben.

```bash
git add src/ app/ docs/screenshots/
git commit -m "Anmeldebereich in den Einstellungen"
```

---

## Aufgabe 4: Belegung und Anmeldung in der Terminansicht

Das Ziel des ganzen Plans: zwei Fingertipps.

**Dateien:**
- Anlegen: `src/features/events/TeilnahmeKarte.tsx`
- Ändern: `app/termin/[id].tsx` — Karte einsetzen
- Ändern: `src/features/events/signup.ts` — Terminschlüssel

**Schnittstellen:**
- Konsumiert: `terminSchluessel` — **muss in der App dieselbe Regel anwenden wie `api/src/termine.ts`**: bei `recurring === false` nur `uid`, sonst `uid~originalStartInstant`.
- Liefert: `TeilnahmeKarte({ event }: { event: ClubEvent })`

- [ ] **Schritt 1: Den Terminschlüssel in ein eigenes geteiltes Modul holen**

Die Regel darf **nicht** zweimal geschrieben werden — sie ist die Klammer zwischen App und API.

**Wohin, und warum nicht nach `signup.ts`:** Alles, was die API importiert, muss der Kette der `.ts`-Endungen folgen (Plan 2, Aufgabe 1) und unter Node auflösbar sein. `signup.ts` zieht `format.ts` nach und damit weitere App-Module — daraus würde eine Erweiterung der geteilten Zone durch die Hintertür. Leg die Funktion deshalb in eine **eigene Datei ohne weitere Abhängigkeiten**: `src/domain/terminSchluessel.ts`, die nur den Typ `ClubEvent` importiert (`import type { ClubEvent } from './types.ts'` — mit Endung, sie ist ab jetzt geteilter Code).

```ts
/**
 * Der stabile Schlüssel eines Termins — dieselbe Regel in App und API.
 *
 * Bei einer **Serie** trägt ein verschobener Einzeltermin seine
 * `RECURRENCE-ID`, also den ursprünglichen Zeitpunkt: Der Schlüssel bleibt
 * gleich, obwohl `start` sich ändert. Ein gewöhnlicher **Einzeltermin** hat
 * keine — bei ihm genügt die `uid`, und genau deshalb steht hier eine
 * Fallunterscheidung statt einer Formel.
 *
 * Der Schlüssel wird nie geparst, nur verglichen. Er muss in App und API
 * **buchstabengleich** entstehen, sonst finden Anmeldungen ihren Termin
 * nicht — deshalb steht er hier einmal und nicht zweimal.
 */
export function terminSchluessel(event: ClubEvent): string {
  return event.recurring ? `${event.uid}~${event.originalStartInstant}` : event.uid;
}
```

Ein neuer Test `tests/terminSchluessel.test.ts` sichert beide Fälle: Ein Einzeltermin behält seinen Schlüssel, wenn `start` sich ändert; zwei Termine derselben Serie bekommen verschiedene.

In `api/src/termine.ts` bleibt ein Re-Export, damit dortige Aufrufe unverändert bleiben:

```ts
// Dieselbe Regel wie in der App — sie steht in `src/domain/terminSchluessel.ts`
// und nicht hier, weil ein Schlüssel, der in beiden Welten verschieden
// entsteht, Anmeldungen ihren Termin nicht finden lässt.
export { terminSchluessel } from '../../src/domain/terminSchluessel.ts';
```

Die bisherige Umsetzung in `termine.ts` samt ihrem Dokumentationskopf wandert mit in die neue Datei — sie ist gut begründet, sie steht nur am falschen Ort.

Prüfe danach **beide** Seiten: `npm test` in der Wurzel und `cd api && npm test && npm run typecheck`. Die API-Tests importieren `terminSchluessel` aus `termine.ts` und müssen unverändert grün bleiben.

- [ ] **Schritt 2: `src/features/events/TeilnahmeKarte.tsx` schreiben**

Die Karte holt beim Öffnen die Belegung und zeigt je nach Zustand: Belegung mit Anmelde-Knopf (angemeldet), Belegung mit Hinweis auf die Anmeldung (nicht angemeldet), oder nichts (API nicht erreichbar — dann greift der Mail-Knopf).

```tsx
/**
 * Belegung und Anmeldung eines Termins.
 *
 * Holt ihre Zahlen beim Öffnen — bewusst hier und nicht in der Liste: Die
 * Terminliste kommt ohne Server aus, und das soll sie bleiben. Wer einen
 * Termin öffnet, nimmt eine Abfrage in Kauf; wer blättert, nicht.
 *
 * Ist die API nicht erreichbar, verschwindet diese Karte stillschweigend.
 * Das ist kein verschwiegener Fehler: Der Mail-Knopf darunter bleibt
 * sichtbar und tut, was er immer tat. Eine Fehlermeldung über einen
 * Zusatzdienst hilft niemandem im Wald.
 */

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { ClubEvent } from '../../domain/types';
import { ApiFehler } from '../../data/api';
import { useKonto } from '../../konto/KontoContext';
import { font, fontSize, spacing } from '../../theme';
import { ActionButton, Banner, Card, Label } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { terminSchluessel } from './signup';

interface Belegung {
  belegt: number;
  plaetze: number | null;
  frei: number | null;
  gaesteErlaubt: boolean;
  abgesagt: boolean;
}

export function TeilnahmeKarte({ event }: { event: ClubEvent }) {
  const { palette } = useTheme();
  const { angemeldet, api } = useKonto();
  const schluessel = terminSchluessel(event);

  const [belegung, setBelegung] = useState<Belegung | null>(null);
  const [erreichbar, setErreichbar] = useState(true);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);

  const laden = useCallback(async () => {
    try {
      setBelegung(await api.hole<Belegung>(`/termine/${schluessel}`));
      setErreichbar(true);
    } catch {
      setErreichbar(false);
    }
  }, [api, schluessel]);

  useEffect(() => {
    void laden();
  }, [laden]);

  if (!erreichbar || !belegung) return null;

  async function anmelden() {
    setMeldung(null);
    setLaeuft(true);
    try {
      await api.sende(`/termine/${schluessel}`, 'POST');
      setMeldung('Du bist angemeldet.');
      await laden();
    } catch (fehler) {
      setMeldung(
        fehler instanceof ApiFehler ? fehler.message : 'Das hat gerade nicht geklappt.',
      );
    } finally {
      setLaeuft(false);
    }
  }

  const platzText =
    belegung.plaetze === null
      ? `${belegung.belegt} angemeldet`
      : `${belegung.belegt} von ${belegung.plaetze} Plätzen belegt`;

  return (
    <Card>
      <Label>Anmeldung</Label>
      <Text style={[styles.zahl, { color: palette.text }]}>{platzText}</Text>

      {belegung.plaetze !== null && belegung.frei === 0 ? (
        <Text style={[styles.hinweis, { color: palette.textMuted }]}>
          Die Tour ist voll. Frag den Guide, ob doch noch etwas geht.
        </Text>
      ) : null}

      {meldung ? (
        <View style={styles.banner}>
          <Banner tone="info" text={meldung} />
        </View>
      ) : null}

      {angemeldet ? (
        <View style={styles.knopf}>
          {laeuft ? (
            <ActivityIndicator color={palette.primary} />
          ) : (
            <ActionButton label="Ich bin dabei" onPress={() => void anmelden()} />
          )}
        </View>
      ) : (
        <Text style={[styles.hinweis, { color: palette.textMuted }]}>
          Melde dich unter Einstellungen an, um dich direkt einzutragen.
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  zahl: {
    fontFamily: font.display,
    fontSize: fontSize.xl,
    marginTop: spacing.sm,
  },
  hinweis: {
    fontFamily: font.regular,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  banner: {
    marginTop: spacing.md,
  },
  knopf: {
    marginTop: spacing.lg,
  },
});
```

**Fehlende Stücke, die du ergänzen musst** (der Plan zeigt den Kern, nicht jedes Detail):
- Ein **Abmelden**-Knopf, wenn die eigene Anmeldung besteht. Die API sagt nicht, ob man selbst dabei ist — das muss die App sich merken (Zustand nach erfolgreicher Anmeldung) oder die API müsste es mitliefern. **Halte dich an den einfachen Weg:** Nach erfolgreicher Anmeldung zeigt die Karte „Du bist dabei" plus „Doch nicht" (ruft `DELETE /termine/:schluessel/ich`). Nach dem Neuladen der Ansicht ist dieser Zustand weg — das ist eine bekannte Grenze, notier sie im Kommentar. (Sie verschwindet, sobald die API die eigene Teilnahme mitliefert; das ist kein Teil dieses Plans.)
- Bei `belegung.abgesagt`: kein Anmelde-Knopf.

- [ ] **Schritt 3: In `app/termin/[id].tsx` einsetzen**

Die `TeilnahmeKarte` kommt **vor** den Mail-Knopf. Der Mail-Knopf bleibt unverändert stehen — er ist die Rückfallebene, wenn die API nicht erreichbar ist.

- [ ] **Schritt 4: Prüfen, ansehen, committen**

```bash
npm test && npm run typecheck
cd api && npm start &   # lokale API für den Sichttest
```

Dann `npm run vorschau` und die Terminansicht ansehen. **Wichtig:** Ohne laufende API muss die Ansicht genauso aussehen wie heute — die Karte verschwindet dann, und das ist richtig.

```bash
git add src/ app/ api/src/termine.ts tests/
git commit -m "Belegung und Anmeldung in der Terminansicht"
```

---

## Nach diesem Plan

Ein Mitglied kann sich in der App anmelden und zu Touren eintragen. Die Terminliste, Filter, Aktuelles, Verein und Erinnerungen funktionieren unverändert ohne Server.

**Bewusst offen:**
- **Die eigene Teilnahme überlebt kein Neuladen** — die API liefert nicht mit, ob der Anfragende selbst angemeldet ist. Ein Feld `binIchDabei` in `GET /termine/:schluessel` würde das lösen; das gehört in einen eigenen kleinen API-Nachtrag.
- **Gastanmeldung in der App** — die API kann sie, die App bietet sie nicht an. Der Mail-Weg bleibt für Nicht-Mitglieder.
- **Universal Links** sind in `app.json` noch nicht eingerichtet; bis dahin trägt das Schema `mtbie://`. Gehört zu Plan 4, wo die Domain feststeht.
- **Nutzbar wird das alles erst mit Plan 4** — solange keine API im Netz läuft, zeigt die Karte nichts an. Das ist kein Fehler, sondern die Reihenfolge.
