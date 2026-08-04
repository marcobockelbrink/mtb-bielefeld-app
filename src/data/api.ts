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
  /** Läuft schon eine Erneuerung, teilen sich weitere Aufrufer ihr Ergebnis. */
  #erneuerungLaeuft: Promise<boolean> | null = null;

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
        headers: {
          ...(init.headers ?? {}),
          // Nur setzen, wenn wirklich ein Körper mitgeht. Fastify weist eine
          // Anfrage mit dieser Kopfzeile, aber leerem Körper schon vor jeder
          // eigenen Prüfung ab (FST_ERR_CTP_EMPTY_JSON_BODY) — noch bevor
          // das Token geprüft wird. Genau das trifft `sende(pfad, 'POST')`
          // und `sende(pfad, 'DELETE')` ohne `koerper`, etwa die Tour- und
          // die Abmelde-Anfrage der Tourenanmeldung: Beide lesen laut
          // `api/src/app.ts` keinen Körper. Stünde die Kopfzeile immer da,
          // käme keine der beiden Anfragen je durch — die Tourenanmeldung
          // funktionierte nie.
          ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
      });
    } catch (fehler) {
      // `fetch` selbst schlägt fehl: kein Netz, DNS-Fehler, abgebrochene
      // Verbindung — oder unser eigener Abbruch nach ZEITGRENZE_MS. Das ist
      // im Wald der Normalfall, kein Ausnahmezustand, und muss deshalb
      // genauso als `ApiFehler` bei der Person ankommen wie jede Antwort
      // der API — sonst sähe sie einen englischen "TypeError: Failed to
      // fetch" oder gar nichts. Status 0, weil nie eine Antwort vom Server
      // eintraf, also auch kein echter Statuscode existiert.
      const abgebrochen = fehler instanceof Error && fehler.name === 'AbortError';
      throw new ApiFehler(
        0,
        abgebrochen
          ? 'Die Anfrage hat zu lange gedauert. Bitte prüfe deine Verbindung.'
          : 'Keine Verbindung zum Server. Bitte prüfe deine Verbindung.',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /** Wirft einen `ApiFehler` mit dem Text der API, sonst gibt es den Körper. */
  async #auswerten<T>(antwort: Response): Promise<T> {
    const koerper = (await antwort.json().catch(() => ({}))) as Record<string, unknown>;
    if (!antwort.ok) {
      // `fehler` ist unser eigenes Feld. Anfragen, die schon Fastify selbst
      // abweist — bevor unser Code überhaupt läuft, etwa bei einem falsch
      // gesetzten `content-type` — kommen stattdessen mit `message` herein.
      // Ohne diesen zweiten Blick sähe die Person bei einem Protokollfehler
      // nur "Da ist etwas schiefgegangen." statt eines Hinweises.
      const nachricht =
        typeof koerper.fehler === 'string'
          ? koerper.fehler
          : typeof koerper.message === 'string'
            ? koerper.message
            : 'Da ist etwas schiefgegangen.';

      // `plaetze` nur übernehmen, wenn die Antwort es wirklich mitschickt.
      // `null` heißt in der API "unbegrenzt viele Plätze"
      // (`api/src/app.ts`) — würden wir es auch dann setzen, wenn das Feld
      // schlicht fehlt (etwa bei 404, "Termin gibt es nicht"), sähe ein
      // nicht existierender Termin wie einer ohne Platzgrenze aus.
      const plaetzeWert = koerper.plaetze;
      const plaetze =
        typeof plaetzeWert === 'number' ? plaetzeWert : plaetzeWert === null ? null : undefined;

      throw new ApiFehler(antwort.status, nachricht, {
        belegt: typeof koerper.belegt === 'number' ? koerper.belegt : undefined,
        plaetze,
      });
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

  /**
   * Zieht ein neues Zugangs-Token nach — geteilt zwischen gleichzeitigen
   * Aufrufern.
   *
   * Ohne dieses Teilen wäre der Normalfall der Fehlerfall: Nach 15 Minuten
   * Ruhe treffen beim Öffnen der App typischerweise mehrere Anfragen
   * gleichzeitig auf ein abgelaufenes Zugangs-Token — etwa Kontoabfrage und
   * Belegung nebeneinander. Schickte jede ihr eigenes Erneuerungs-Token los,
   * träfe die zweite auf die Wiederverwendungserkennung in
   * `api/src/sitzung.ts`: Die hält ein zweimal benutztes Erneuerungs-Token
   * für gestohlen und löscht *alle* Sitzungen des Mitglieds — das gerade
   * erst frisch geschriebene eingeschlossen. Läuft schon eine Erneuerung,
   * warten weitere Aufrufer auf ihr Ergebnis, statt eine zweite loszuschicken.
   *
   * Bewusst kein `async`: Die Zuweisung an `#erneuerungLaeuft` muss
   * synchron passieren, bevor irgendein `await` die Kontrolle abgibt —
   * sonst könnten zwei gleichzeitige Aufrufer die Prüfung `if
   * (!this.#erneuerungLaeuft)` beide noch als „leer" sehen und doch zwei
   * Erneuerungen lostreten.
   */
  #erneuern(): Promise<boolean> {
    if (!this.#erneuerungLaeuft) {
      this.#erneuerungLaeuft = this.#erneuernJetzt().finally(() => {
        this.#erneuerungLaeuft = null;
      });
    }
    return this.#erneuerungLaeuft;
  }

  /**
   * Die eigentliche Erneuerung — zwei Fehlerarten, zwei Antworten.
   *
   * Das Naheliegende („jeder Fehlschlag heißt: Sitzung tot, Schlüsselbund
   * räumen") ist hier falsch:
   *
   * - **401** — das Erneuerungs-Token selbst gilt nicht mehr (abgelaufen,
   *   schon verbraucht, serverseitig widerrufen). Nur dann ist die Sitzung
   *   wirklich vorbei.
   * - **alles andere** (429 durch die Ratenbegrenzung, 5xx, …) — ein
   *   vorübergehendes Problem des Servers oder der IP-Notbremse
   *   (`api/src/app.ts`), nicht des Tokens. Ein Vereins-WLAN hinter einer
   *   NAT reicht, um mehrere Geräte gemeinsam über diese Grenze laufen zu
   *   lassen. Würde hier jeder Fehlschlag löschen, verlöre ein Mitglied sein
   *   60 Tage gültiges Token wegen eines Servers, der gerade nur überlastet
   *   ist — eine stille Zwangsabmeldung, die niemand versteht.
   */
  async #erneuernJetzt(): Promise<boolean> {
    const erneuerung = await this.#speicher.lies();
    if (!erneuerung) return false;

    const antwort = await this.#ruf('/sitzung/erneuern', {
      method: 'POST',
      body: JSON.stringify({ erneuerung }),
    });
    if (antwort.status === 401) {
      this.#zugang = null;
      await this.#speicher.loesche();
      return false;
    }
    if (!antwort.ok) return false;

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
