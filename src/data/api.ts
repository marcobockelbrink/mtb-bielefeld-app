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
