/**
 * Die Fastify-Instanz ohne Netzwerk.
 *
 * Abhängigkeiten kommen von außen herein, damit Tests eine echte Datenbank
 * und einen gemerkten Mailer einsetzen können.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import type pg from 'pg';

import { fordereMagicLinkAn } from './anmeldung.ts';
import { IpBegrenzung } from './ipbegrenzung.ts';
import { holeKontoAuskunft, loescheKonto } from './konto.ts';
import type { Mailer } from './mailer.ts';
import { serialisiereFehler, type Protokoll } from './protokoll.ts';
import { beendeSitzung, erneuereSitzung, loeseMagicLinkEin, pruefeZugang, type Ausweis } from './sitzung.ts';
import { erzeugeStandardTerminDienst, type TerminDienst } from './termine.ts';
import {
  holeBelegung,
  holeTeilnehmer,
  meldeAb,
  meldeAn,
  storniereGast,
  type Teilnahmewunsch,
} from './tourenanmeldung.ts';

export interface Abhaengigkeiten {
  pool: pg.Pool;
  mailer: Mailer;
  jetzt?: () => Date;
  /** Standard: der Logger der Fastify-Instanz. Tests reichen eine Attrappe. */
  protokoll?: Protokoll;
  /**
   * Standard: `HOECHSTENS_GLEICHZEITIG`. Tests setzen sie klein, weil sich
   * Überlast sonst nur mit Dutzenden Anfragen herstellen ließe.
   */
  hoechstensGleichzeitig?: number;
  /**
   * Standard: `HINTERGRUND_ZEITSCHRANKE_MS`. Tests setzen sie klein, weil
   * sich ein hängender Vorgang sonst nur mit einer echten Wartezeit in
   * dieser Größenordnung herstellen ließe.
   */
  hintergrundZeitschrankeMs?: number;
  /**
   * Standard: eine frische `IpBegrenzung` mit `HOECHSTENS_ANFRAGEN_JE_MINUTE`
   * je `EINE_MINUTE_MS`. Bestehende Tests feuern viele Anfragen von
   * derselben Test-IP (127.0.0.1 bei `app.inject`) — wo das innerhalb eines
   * einzelnen Tests über die Voreinstellung hinausginge, reicht der Test ein
   * eigenes, großzügigeres Exemplar herein, statt an der Begrenzung zu
   * scheitern.
   */
  ipBegrenzung?: IpBegrenzung;
  /** Standard: `erzeugeStandardTerminDienst` — Tests reichen einen mit eingebettetem Kalender. */
  terminDienst?: TerminDienst;
}

/**
 * Wie viele Hintergrundvorgänge höchstens gleichzeitig laufen dürfen.
 *
 * Solange die Antwort auf die Arbeit wartete, bremste die Arbeit den
 * Anfragenden: Wer schneller schickte, als die Datenbank antwortete, wartete
 * selbst. Seit die Antwort vorausgeht, ist diese Bremse weg — und die
 * IP-Schicht, die sie ersetzen soll, kommt erst mit Plan 4 (`caddy/`). Ohne
 * Grenze wüchsen `laufendeArbeit` und die Warteschlange des Verbindungspools
 * mit der Anfragerate, bis der Speicher voll ist; die Begrenzung je Adresse
 * hilft dagegen nicht, denn sie greift erst **in** der Arbeit und für viele
 * verschiedene Adressen gar nicht.
 *
 * Fünfzig: Der Pool hält voreingestellt zehn Verbindungen. Was darüber
 * hinaus läuft, wartet ohnehin schon auf eine freie — ein paar Dutzend
 * fangen eine kurze Spitze ab, alles darüber ist keine Pufferung mehr,
 * sondern eine unbegrenzte Warteschlange mit anderem Namen.
 *
 * Die Grenze ist **global**, nicht je Adresse und nicht je IP: Wer mit
 * vielen verschiedenen Adressen flutet, statt eine einzelne zu wiederholen,
 * verdrängt damit echte Anmeldungen — die Begrenzung je Adresse
 * (`anmeldung.ts`) hilft dagegen nicht, sie zählt pro Adresse, nicht über
 * alle hinweg. Das ist eine bewusste Abwägung, keine Lücke: Die Schicht, die
 * das eigentlich abfangen soll, ist die IP-Ebene, und die kommt erst mit
 * Plan 4 (`caddy/`). Bis dahin ist diese globale Grenze das Einzige, was
 * zwischen einer Anfrageflut und dem Speicher steht.
 */
const HOECHSTENS_GLEICHZEITIG = 50;

/**
 * Wie lange ein Hintergrundvorgang höchstens seinen Platz behält, bevor er
 * ihn auf jeden Fall wieder freigibt.
 *
 * Ohne dieses Limit wird der Platz ausschließlich im `.finally()` der
 * Arbeit selbst frei — ein Zähler, der nur in eine Richtung läuft. Hängt ein
 * Vorgang dauerhaft (echter SMTP-Versand ohne eigene Zeitschranke ab Plan 4,
 * oder ein Warten auf die Adresssperre in `anmeldung.ts`), sind nach
 * `HOECHSTENS_GLEICHZEITIG` solcher Fälle alle Plätze für immer belegt, und
 * der Endpunkt verwirft ab dann jede Anmeldung, unbegrenzt lange. Diese
 * Zeitschranke gibt den Platz in jedem Fall frei, unabhängig davon, ob die
 * Arbeit selbst jemals fertig wird — sie bricht die Arbeit dabei nicht ab,
 * sie hört nur auf, sie mitzuzählen.
 */
const HINTERGRUND_ZEITSCHRANKE_MS = 30_000;

const EINE_MINUTE_MS = 60_000;

/**
 * Wie viele Anfragen eine einzelne IP je Minute an die authentifizierungsnahen
 * Pfade stellen darf, bevor diese Notbremse greift (siehe `ipbegrenzung.ts`
 * für das Warum dieser Schicht überhaupt).
 *
 * Zwanzig ist großzügig bemessen, nicht scharf: Ein einzelnes Mitglied, das
 * mehrere Geräte startet oder eine Anmeldung mehrfach antippt, bleibt weit
 * darunter. Wer sie reißt, prüft nicht mehr „habe ich mich vertippt", sondern
 * probiert etwas — genau dann soll ohne Caddy trotzdem etwas bremsen.
 */
const HOECHSTENS_ANFRAGEN_JE_MINUTE = 20;

/**
 * Dieselbe Pfadliste wie in der Caddy-Vorlage (`caddy/anmeldung.Caddyfile`):
 * jeder Pfad, der ein Token gegen die Datenbank prüft. Mit `startsWith`
 * geprüft, nicht mit exaktem Vergleich — `/sitzung` erfasst so sowohl
 * `/sitzung/erneuern` als auch das exakte `DELETE /sitzung` (Abmelden), und
 * `/konto` sowohl `GET /konto` als auch `DELETE /konto`. `/termine/` deckt
 * das Bearer-Token beim Anmelden und Abmelden ab, `/gast/` den Storno-Token
 * aus der Gäste-Mail.
 *
 * Die Schreibweise ist bewusst dieselbe wie dort — `/anmeldung/` hier gegen
 * `/anmeldung/*` bei Caddy, `/sitzung` gegen `/sitzung*` — damit sich beide
 * Listen Zeile für Zeile nebeneinanderlegen lassen. Wo Caddy einen Stern
 * ohne Schrägstrich davor braucht, steht hier ein Präfix ohne Schrägstrich
 * dahinter; wo dort `/…/*` steht, endet der Präfix hier auf `/`.
 */
const IP_GESCHUETZTE_PFAD_PRAEFIXE = ['/anmeldung/', '/sitzung', '/konto', '/termine/', '/gast/'];

/**
 * Der Pfad, an dem nur die schreibenden Methoden mitgezählt werden.
 *
 * `GET /termine/:schluessel` ist die Belegungsabfrage — die einzige Anfrage
 * dieser API, die eine App im gewöhnlichen Gebrauch **je Termin** stellt.
 * Wer eine Terminliste öffnet, feuert damit ein Dutzend GETs in wenigen
 * Sekunden und reißt die Grenze von zwanzig je Minute, ohne irgendetwas
 * falsch zu machen. Eine Notbremse, die den Normalfall bremst, ist keine
 * Notbremse mehr, sondern ein Fehler.
 *
 * Das ist eine Abwägung, keine Lücke: Ein `GET` hierher kann eine
 * `Authorization`-Kopfzeile tragen und prüft dann ein Token gegen die
 * Datenbank — ungezählt heißt also, dass das Durchprobieren von Zugangs-
 * Token über diesen einen Weg von dieser Schicht nicht gebremst wird. Bei
 * einem 256-Bit-Token ist Erraten aussichtslos, und die Abwehr einer
 * schieren Anfrageflut ist ohnehin nicht die Aufgabe dieser Schicht,
 * sondern die von Caddy. `POST` (Anmelden) und `DELETE` (Abmelden) zählen
 * unverändert mit — beides sind Vorgänge, die ein Mensch je Termin einmal
 * auslöst, nie zwanzigmal je Minute.
 */
const NUR_SCHREIBEND_GEZAEHLT = '/termine/';

function zaehltGegenIpGrenze(methode: string, pfad: string): boolean {
  if (!IP_GESCHUETZTE_PFAD_PRAEFIXE.some((praefix) => pfad.startsWith(praefix))) return false;
  return !(methode === 'GET' && pfad.startsWith(NUR_SCHREIBEND_GEZAEHLT));
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Wartet, bis alle nach der Antwort gestarteten Vorgänge fertig sind. Für Tests. */
    warteAufHintergrundarbeit(): Promise<void>;
  }
}

/**
 * Der eine Pfad, dessen Token im Weg selbst steht.
 *
 * Bei jedem anderen tokenprüfenden Endpunkt reist das Token im Körper
 * (`/anmeldung/einloesen`, `/sitzung/erneuern`, `DELETE /sitzung`) oder in
 * der Kopfzeile `Authorization` (`/konto`, `/termine/…`) — beides schreibt
 * der Anfrage-Logger nicht mit. Der Storno-Link für Gäste kann das nicht:
 * Er wird in einer Mail angetippt, und ein anklickbarer Link trägt alles,
 * was er braucht, im `GET`-Pfad. Ohne diese Maskierung stünde der Klartext
 * des Storno-Tokens in jeder Protokollzeile zu dieser Anfrage — dieselbe
 * Regel, nach der die Datenbank nur den SHA-256-Hash speichert, gälte dann
 * überall außer im Protokoll.
 */
const TOKEN_IM_PFAD_PRAEFIX = '/gast/storno/';

/** Was statt des Tokens im Protokoll steht. */
const MASKIERUNG = `${TOKEN_IM_PFAD_PRAEFIX}[maskiert]`;

/**
 * Maskiert die URL einer Anfrage, wenn ein Token darin steht.
 *
 * Nur dieser eine Präfix, nicht vorsorglich alles: Eine URL, die nichts
 * Geheimes trägt, gehört unverfälscht ins Protokoll — sonst wäre der
 * Betreiber bei jeder Fehlersuche blind. Ein etwaiger Abfrageteil (`?…`)
 * fällt mit weg; an dieser Route gibt es keinen, und was hinter dem Token
 * stünde, wäre ohnehin nichts, was ohne ihn Sinn ergäbe.
 */
export function maskiereAnfrageUrl(url: string): string {
  return url.startsWith(TOKEN_IM_PFAD_PRAEFIX) ? MASKIERUNG : url;
}

/** Nur die Felder, die der Serialisierer unten anfasst. */
interface ProtokollierbareAnfrage {
  method?: string;
  url?: string;
  headers?: Record<string, unknown>;
  host?: string;
  ip?: string;
  socket?: { remotePort?: number };
}

/**
 * Der `req`-Serialisierer des Anfrage-Loggers.
 *
 * Wortgleich der von Fastify voreingestellte (`lib/logger-pino.js`), nur
 * mit `maskiereAnfrageUrl` um die URL herum. Selbst geschrieben und nicht
 * um den eingebauten herumgelegt, weil der nicht exportiert ist; dafür ist
 * er hier vollständig sichtbar und einzeln prüfbar.
 */
export function serialisiereAnfrage(anfrage: ProtokollierbareAnfrage): Record<string, unknown> {
  return {
    method: anfrage.method,
    url: anfrage.url === undefined ? undefined : maskiereAnfrageUrl(anfrage.url),
    version: anfrage.headers?.['accept-version'],
    host: anfrage.host,
    remoteAddress: anfrage.ip,
    remotePort: anfrage.socket?.remotePort,
  };
}

/**
 * Laut im Betrieb, stumm im Test.
 *
 * Ohne Protokoll wäre der bewusst abgefangene Mailer-Fehler (siehe
 * `verschickeLeise` in `anmeldung.ts`) nur für den Client laut und beim
 * Betreiber spurlos — der stille Fehlschlag durch die Hintertür. Auch jede
 * unbehandelte Ausnahme in einem Endpunkt landet über Fastify hier und
 * sonst nirgends.
 *
 * Nur in Tests bleibt es aus, damit deren Ausgabe lesbar bleibt: Jede
 * Anfrage schriebe sonst zwei JSON-Zeilen dazwischen. Vitest setzt
 * `NODE_ENV=test` von sich aus.
 *
 * Zwei eigene Serialisierer: `fehler`, damit ein Fehler nicht als `{}`
 * ankommt (siehe `protokoll.ts`), und `req`, damit der Storno-Token nicht
 * im Klartext in der protokollierten URL steht (siehe
 * `serialisiereAnfrage`).
 */
const protokollEinstellung =
  process.env.NODE_ENV === 'test'
    ? false
    : { serializers: { fehler: serialisiereFehler, req: serialisiereAnfrage } };

interface AnfordernKoerper {
  email?: unknown;
  einladungscode?: unknown;
}

export function baueApp({
  pool,
  mailer,
  jetzt = () => new Date(),
  protokoll,
  hoechstensGleichzeitig = HOECHSTENS_GLEICHZEITIG,
  hintergrundZeitschrankeMs = HINTERGRUND_ZEITSCHRANKE_MS,
  ipBegrenzung = new IpBegrenzung(HOECHSTENS_ANFRAGEN_JE_MINUTE, EINE_MINUTE_MS),
  terminDienst,
}: Abhaengigkeiten): FastifyInstance {
  const app = Fastify({ logger: protokollEinstellung });
  const log = protokoll ?? app.log;
  const termine = terminDienst ?? erzeugeStandardTerminDienst(log);

  /**
   * Notbremse je IP für die tokenprüfenden Pfade (siehe
   * `IP_GESCHUETZTE_PFAD_PRAEFIXE`), ohne die Belegungsabfrage `GET
   * /termine/…` (siehe `NUR_SCHREIBEND_GEZAEHLT`) — `ipbegrenzung.ts`
   * begründet das Warum dieser Schicht, `caddy/anmeldung.Caddyfile` ist die
   * Schicht, die das eigentlich übernehmen soll, sobald Plan 4 sie anwendet.
   *
   * Ein 429 hier ist **kein** Orakel wie ein abweichender Statuscode bei
   * `/anmeldung/anfordern` es wäre: Er hängt ausschließlich daran, wie oft
   * der Anfragende selbst in der letzten Minute anklopfte — nicht an der
   * E-Mail-Adresse im Anfragekörper, die diese Prüfung gar nicht ansieht
   * (`onRequest` läuft vor dem Parsen des Körpers). Zwei verschiedene IPs,
   * die für dieselbe Adresse anfragen, sehen unterschiedliche Antworten je
   * nachdem, wie oft *sie* schon anklopften — nie danach, ob die Adresse
   * zum Verein gehört. Das ist die Abgrenzung zur 202-Regel der Begrenzung
   * je Adresse in `anmeldung.ts`: Die darf niemals verraten, ob eine
   * Adresse bekannt ist; die IP-Begrenzung hier verrät dazu gar nichts,
   * weil sie die Adresse nie zu Gesicht bekommt.
   */
  app.addHook('onRequest', async (anfrage, antwort) => {
    const pfad = anfrage.url.split('?', 1)[0] ?? anfrage.url;
    if (!zaehltGegenIpGrenze(anfrage.method, pfad)) return;

    if (!ipBegrenzung.erlaubt(anfrage.ip, jetzt().getTime())) {
      return antwort.code(429).send({ fehler: 'Zu viele Anfragen. Versuch es gleich noch einmal.' });
    }
  });

  /**
   * Arbeit, die nach der Antwort weiterläuft.
   *
   * Der Grund ist keine Geschwindigkeit, sondern Gleichheit: Solange der
   * berechtigte Pfad schreibt und verschickt, während der unberechtigte
   * sofort umkehrt, ist die Antwortzeit ein Orakel. Wer eine Liste von
   * Adressen durchprobiert, sieht am Zeitunterschied, welche zum Verein
   * gehören — obwohl Statuscode und Text überall gleich sind.
   *
   * Also antworten wir zuerst und arbeiten danach. Die laufenden Vorgänge
   * werden gesammelt, damit Tests darauf warten können; ohne das wären sie
   * ein Wettrennen.
   */
  const laufendeArbeit = new Set<Promise<unknown>>();

  /**
   * Nimmt die Arbeit als Funktion und nicht als schon laufendes Promise:
   * Über der Grenze soll sie **nicht** anfangen. Wäre sie beim Aufruf schon
   * gestartet, hielte sie längst eine Poolverbindung — genau das, was die
   * Grenze verhindern soll.
   */
  function imHintergrund(beginne: () => Promise<unknown>): void {
    if (laufendeArbeit.size >= hoechstensGleichzeitig) {
      // Verworfen, aber nicht still: Für den Anfragenden bleibt es bei 202 —
      // ein anderer Code oder Text wäre ein neues Orakel, denn verworfen wird
      // unabhängig davon, ob die Adresse zum Verein gehört. Wer die Mail
      // erwartet hat, bekommt sie hier nicht und fordert sie neu an; der
      // Betreiber sieht am Protokoll, dass die Grenze greift.
      log.error(
        { laufend: laufendeArbeit.size, grenze: hoechstensGleichzeitig },
        'Zu viele Hintergrundvorgänge gleichzeitig — dieser wurde verworfen, ' +
          'statt die Warteschlange weiter wachsen zu lassen. Der Anfragende ' +
          'hat trotzdem 202 bekommen, weil eine abweichende Antwort verraten ' +
          'würde, dass die Adresse zum Verein gehört.',
      );
      return;
    }

    const arbeit = beginne();
    laufendeArbeit.add(arbeit);

    // Zeitschranke statt eines Platzes, der nur befreit wird, wenn die
    // Arbeit selbst das tut: Läuft sie ab, während `arbeit` noch offen ist,
    // wird der Platz trotzdem frei — laut protokolliert, damit der Betreiber
    // sieht, dass hier etwas hängt. Die Arbeit selbst läuft weiter, sie
    // zählt nur nicht mehr gegen die Obergrenze.
    const zeitgeber = setTimeout(() => {
      if (!laufendeArbeit.delete(arbeit)) return; // schon regulär fertig
      log.error(
        { zeitschrankeMs: hintergrundZeitschrankeMs },
        'Hintergrundvorgang lief länger als die Zeitschranke — der Platz ' +
          'wurde freigegeben, damit die Obergrenze nicht dauerhaft zugeht. ' +
          'Der Vorgang selbst läuft weiter, zählt aber nicht mehr mit.',
      );
    }, hintergrundZeitschrankeMs);
    zeitgeber.unref();

    void arbeit
      // Nichts darf hier unbemerkt sterben: Ein unbehandelter Fehlschlag
      // wäre genau der stille Fehlschlag, den dieses Projekt ausschließt.
      .catch((fehler) => log.error({ fehler: serialisiereFehler(fehler) }, 'Hintergrundarbeit fehlgeschlagen'))
      .finally(() => {
        clearTimeout(zeitgeber);
        laufendeArbeit.delete(arbeit);
      });
  }

  app.decorate('warteAufHintergrundarbeit', async () => {
    while (laufendeArbeit.size > 0) {
      await Promise.allSettled([...laufendeArbeit]);
    }
  });

  app.get('/gesundheit', async () => ({ zustand: 'bereit' }));

  app.post('/anmeldung/anfordern', async (anfrage, antwort) => {
    const { email, einladungscode } = (anfrage.body ?? {}) as AnfordernKoerper;

    if (typeof email !== 'string' || !email.includes('@')) {
      return antwort.code(400).send({ fehler: 'E-Mail-Adresse fehlt oder ist ungültig.' });
    }
    // Der Code darf fehlen: Wer schon Mitglied ist, braucht keinen mehr.
    // Ein Code vom falschen Typ ist dagegen ein Fehler des Aufrufers und
    // wird benannt, statt stillschweigend als „keiner“ zu gelten — er
    // verrät nichts über die Adresse.
    if (einladungscode !== undefined && typeof einladungscode !== 'string') {
      return antwort.code(400).send({ fehler: 'Einladungscode muss Text sein.' });
    }

    // Der Zeitpunkt gehört zur Anfrage, nicht zum Start der Arbeit: Die
    // eingespeiste Uhr wird deshalb hier abgelesen und nicht erst drinnen.
    const angefragtAm = jetzt();

    imHintergrund(() =>
      fordereMagicLinkAn(
        pool,
        mailer,
        log,
        email,
        einladungscode === undefined || einladungscode.length === 0
          ? undefined
          : einladungscode,
        angefragtAm,
      ),
    );

    // Immer dieselbe Antwort, immer sofort. Ob die Angaben stimmten, erfährt
    // nur, wer die Mail bekommt — sonst wäre dieser Endpunkt ein Werkzeug, um
    // Mitgliedschaften zu erraten, sei es über den Text oder über die Zeit
    // bis zur Antwort.
    return antwort.code(202).send({
      hinweis: 'Wenn die Angaben stimmen, ist eine Mail unterwegs.',
    });
  });

  app.post('/anmeldung/einloesen', async (anfrage, antwort) => {
    const { token } = (anfrage.body ?? {}) as { token?: unknown };

    if (typeof token !== 'string' || token.length === 0) {
      return antwort.code(400).send({ fehler: 'Token fehlt.' });
    }

    const ergebnis = await loeseMagicLinkEin(pool, token, jetzt());
    if (!ergebnis.ok) {
      // Ein Grund würde verraten, ob der Link existiert hat.
      return antwort.code(401).send({ fehler: 'Der Link gilt nicht mehr.' });
    }

    return antwort.send({ zugang: ergebnis.zugang, erneuerung: ergebnis.erneuerung });
  });

  app.post('/sitzung/erneuern', async (anfrage, antwort) => {
    const { erneuerung } = (anfrage.body ?? {}) as { erneuerung?: unknown };

    if (typeof erneuerung !== 'string' || erneuerung.length === 0) {
      return antwort.code(400).send({ fehler: 'Token fehlt.' });
    }

    const ergebnis = await erneuereSitzung(pool, erneuerung, jetzt());
    if (!ergebnis.ok) {
      return antwort.code(401).send({ fehler: 'Bitte melde dich neu an.' });
    }

    return antwort.send({ zugang: ergebnis.zugang, erneuerung: ergebnis.erneuerung });
  });

  app.delete('/sitzung', async (anfrage, antwort) => {
    const { erneuerung } = (anfrage.body ?? {}) as { erneuerung?: unknown };

    if (typeof erneuerung === 'string' && erneuerung.length > 0) {
      await beendeSitzung(pool, erneuerung);
    }

    // Immer 204: Abmelden soll nie fehlschlagen.
    return antwort.code(204).send();
  });

  /** Liest das Zugangs-Token aus dem Kopf und löst es auf. */
  async function holeAusweis(anfrage: { headers: Record<string, unknown> }): Promise<Ausweis | null> {
    const kopf = anfrage.headers.authorization;
    if (typeof kopf !== 'string' || !kopf.startsWith('Bearer ')) return null;
    return pruefeZugang(pool, kopf.slice('Bearer '.length), jetzt());
  }

  app.get('/konto', async (anfrage, antwort) => {
    const ausweis = await holeAusweis(anfrage);
    if (!ausweis) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });

    // `pruefeZugang` verknüpft schon mit `mitglied` — zum Zeitpunkt dieser
    // Abfrage gab es also ein bestehendes Mitglied. Zwischen ihr und der
    // folgenden Auskunft liegt aber kein Schloss: Löscht sich das Konto in
    // genau diesem Moment (eine parallele Anfrage, dasselbe noch gültige
    // Zugangs-Token), liefert `holeKontoAuskunft` `null` — sitzung.mitglied_id
    // hängt per ON DELETE CASCADE an mitglied, die Sitzung wäre mit
    // verschwunden, dieser Ausweis wurde aber schon davor aufgelöst. Ohne
    // diese Prüfung ginge das als 200 mit leerem Körper heraus statt als
    // 401. Ein Test dafür bräuchte ein echtes Wettrennen zwischen zwei
    // Anfragen und wäre nur erratbar zuverlässig — deshalb keiner.
    const auskunft = await holeKontoAuskunft(pool, ausweis.mitgliedId, jetzt());
    if (!auskunft) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });
    return antwort.send(auskunft);
  });

  app.delete('/konto', async (anfrage, antwort) => {
    const ausweis = await holeAusweis(anfrage);
    if (!ausweis) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });

    await loescheKonto(pool, ausweis.mitgliedId);
    return antwort.code(204).send();
  });

  app.get('/termine/:schluessel', async (anfrage, antwort) => {
    const { schluessel } = anfrage.params as { schluessel: string };

    let termin;
    try {
      termin = await termine.findeTermin(schluessel);
    } catch (fehler) {
      log.error({ fehler: serialisiereFehler(fehler) }, 'Kalender nicht lesbar');
      return antwort.code(503).send({
        fehler: 'Der Vereinskalender ist gerade nicht erreichbar. Versuch es gleich noch einmal.',
      });
    }
    if (!termin) return antwort.code(404).send({ fehler: 'Diesen Termin gibt es nicht.' });

    const belegt = await holeBelegung(pool, schluessel);
    const plaetze = termin.details.maxParticipants ?? null;
    const grunddaten = {
      belegt,
      plaetze,
      frei: plaetze === null ? null : Math.max(0, plaetze - belegt),
      gaesteErlaubt: termin.details.gaesteErlaubt === true,
      abgesagt: termin.cancelled,
    };

    const ausweis = await holeAusweis(anfrage);
    if (ausweis?.rolle === 'guide') {
      return antwort.send({ ...grunddaten, teilnehmer: await holeTeilnehmer(pool, schluessel) });
    }
    return antwort.send(grunddaten);
  });

  app.post('/termine/:schluessel', async (anfrage, antwort) => {
    const { schluessel } = anfrage.params as { schluessel: string };

    let termin;
    try {
      termin = await termine.findeTermin(schluessel);
    } catch (fehler) {
      log.error({ fehler: serialisiereFehler(fehler) }, 'Kalender nicht lesbar');
      return antwort.code(503).send({
        fehler: 'Der Vereinskalender ist gerade nicht erreichbar. Versuch es gleich noch einmal.',
      });
    }
    if (!termin) return antwort.code(404).send({ fehler: 'Diesen Termin gibt es nicht.' });

    const ausweis = await holeAusweis(anfrage);
    let wunsch: Teilnahmewunsch;

    if (ausweis) {
      wunsch = { mitgliedId: ausweis.mitgliedId };
    } else {
      const koerper = (anfrage.body ?? {}) as {
        gastName?: unknown;
        gastEmail?: unknown;
        einwilligung?: unknown;
      };
      if (typeof koerper.gastName !== 'string' || koerper.gastName.trim().length === 0) {
        return antwort.code(400).send({ fehler: 'Name fehlt.' });
      }
      if (typeof koerper.gastEmail !== 'string' || !koerper.gastEmail.includes('@')) {
        return antwort.code(400).send({ fehler: 'E-Mail-Adresse fehlt oder ist ungültig.' });
      }
      // Kein vorangekreuztes Kästchen: Die Einwilligung muss ausdrücklich
      // mitgeschickt werden, sonst wird nichts gespeichert.
      if (koerper.einwilligung !== true) {
        return antwort.code(400).send({
          fehler:
            'Ohne Einwilligung geht es nicht: Name und E-Mail-Adresse werden bis 30 Tage nach dem Termin gespeichert und sind nur für den Guide sichtbar.',
        });
      }
      wunsch = { gastName: koerper.gastName.trim(), gastEmail: koerper.gastEmail.trim() };
    }

    const ergebnis = await meldeAn(pool, termin, wunsch, jetzt());

    if (!ergebnis.ok) {
      // `schon-angemeldet` und `zu-viele` hängen an der **Adresse**, nicht am
      // Termin — ein unauthentifizierter Anfragender, der eine fremde
      // `gastEmail` einschickt, dürfte aus der Antwort nicht ablesen können,
      // ob diese Adresse dort schon angemeldet ist oder kürzlich mehrfach
      // gemeldet wurde. Das wäre ein Teilnahme-Orakel: Ohne eigene Anmeldung
      // ließe sich prüfen, wer bei welcher Tour mitfährt — eine Auskunft, die
      // laut Spec nur die Guide-Rolle bekommt. Dieselbe Regel wie bei den
      // Magic Links (`anmeldung.ts`, `fordereMagicLinkAn`): Die Antwort an
      // einen unauthentifizierten Anfragenden darf nicht vom Zustand einer
      // Adresse abhängen — deshalb hier 201 statt 409/429, mit derselben
      // Körpergestalt wie ein echter Erfolg. Wer wirklich schon angemeldet
      // ist, hat seine Bestätigungsmail mit Storno-Link längst; wer fremde
      // Adressen durchprobiert, erfährt nichts. Es entsteht dabei ohnehin
      // keine zweite Zeile (der Unique-Index verhindert das Einfügen) und
      // keine zweite Mail (der Versand unten wird nur bei `ergebnis.ok`
      // erreicht).
      //
      // `voll`, `abgesagt`, `vorbei` und `gaeste-nicht-erlaubt` hängen dagegen
      // am **Termin**, nicht an der Adresse, und sind über `GET
      // /termine/:schluessel` ohnehin öffentlich — hier bleibt es ehrlich.
      // Für Mitglieder (mit Token) bleibt ebenfalls alles wie bisher: Wer
      // authentifiziert ist, fragt nach dem eigenen Zustand, und „Du bist
      // schon angemeldet." ist dort die richtige, hilfreiche Antwort.
      const adressbezogen = ergebnis.grund === 'schon-angemeldet' || ergebnis.grund === 'zu-viele';
      if (adressbezogen && 'gastEmail' in wunsch) {
        // Kein `error`: Das ist Alltagsrauschen (vertippte Adresse, doppelter
        // Klick, jemand probiert Adressen durch), kein Alarm, der den
        // Betreiber wecken soll — er soll das Muster trotzdem im Protokoll
        // sehen. `an` folgt derselben Konvention wie in `anmeldung.ts`: die
        // Gast-Adresse steht dort ohnehin schon in bestehenden Einträgen.
        log.info(
          { an: wunsch.gastEmail, grund: ergebnis.grund },
          'Vorgetäuschte Gastanmeldung — die Antwort verrät den Zustand der ' +
            'Adresse nicht.',
        );
        return antwort.code(201).send({ belegt: ergebnis.belegt });
      }

      const texte: Record<typeof ergebnis.grund, string> = {
        abgesagt: 'Dieser Termin wurde abgesagt.',
        vorbei: 'Dieser Termin liegt in der Vergangenheit.',
        voll: 'Die Tour ist voll.',
        'gaeste-nicht-erlaubt': 'Bei diesem Termin können sich nur Mitglieder anmelden.',
        'schon-angemeldet': 'Du bist schon angemeldet.',
        'zu-viele': 'Zu viele Anmeldungen für diese Adresse. Versuch es später noch einmal.',
      };
      // `zu-viele` ist kein Widerspruch zum Zustand des Termins, sondern
      // eine Ratenbegrenzung — 429 wie bei der IP-Notbremse, damit ein
      // Client „später nochmal" von „voll" und „schon angemeldet"
      // unterscheiden kann, statt beides als endgültig zu behandeln.
      return antwort.code(ergebnis.grund === 'zu-viele' ? 429 : 409).send({
        fehler: texte[ergebnis.grund],
        belegt: ergebnis.belegt,
        plaetze: ergebnis.plaetze,
      });
    }

    // Die Storno-Mail nach dem Speichern: Scheitert sie, bleibt die
    // Anmeldung bestehen — der Gast ist angemeldet, die Mail ist Komfort.
    // Der Fehler geht laut ins Protokoll, nicht an den Anfragenden.
    if (ergebnis.stornoToken && !('mitgliedId' in wunsch)) {
      const basis = process.env.API_BASIS_URL ?? 'https://api.mtb-bielefeld.de';
      try {
        await mailer.sende(
          wunsch.gastEmail,
          `Deine Anmeldung: ${termin.title}`,
          [
            `Hallo ${wunsch.gastName},`,
            '',
            `du bist angemeldet: ${termin.title}.`,
            '',
            'Wenn du doch nicht mitfahren kannst, sag mit einem Klick ab:',
            `${basis}/gast/storno/${ergebnis.stornoToken}`,
            '',
            'Deine Angaben werden 30 Tage nach dem Termin gelöscht und sind nur für den Guide sichtbar.',
            '',
            'Viele Grüße',
            'MTB Bielefeld e.V.',
          ].join('\r\n'),
        );
      } catch (fehler) {
        log.error(
          { fehler: serialisiereFehler(fehler) },
          'Storno-Mail an Gast nicht verschickt — Anmeldung bleibt bestehen',
        );
      }
    }

    return antwort.code(201).send({ belegt: ergebnis.belegt });
  });

  app.delete('/termine/:schluessel/ich', async (anfrage, antwort) => {
    const ausweis = await holeAusweis(anfrage);
    if (!ausweis) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });

    const { schluessel } = anfrage.params as { schluessel: string };
    // Traf das Abmelden nichts, ist es kein Erfolg: Der Anfragende hielte
    // sich sonst für abgemeldet, während er weiter auf der Liste steht. Der
    // Text verrät dabei nichts, was der Anfragende nicht ohnehin über sich
    // selbst wüsste — nur, dass **er** hier nicht angemeldet ist.
    if (!(await meldeAb(pool, schluessel, ausweis.mitgliedId, jetzt()))) {
      return antwort.code(404).send({ fehler: 'Du bist bei diesem Termin nicht angemeldet.' });
    }
    return antwort.code(204).send();
  });

  app.get('/gast/storno/:token', async (anfrage, antwort) => {
    const { token } = anfrage.params as { token: string };
    const storniert = await storniereGast(pool, token, jetzt());

    // Der Link wird aus einer Mail heraus im Browser geöffnet — die Antwort
    // ist deshalb eine kleine Seite, kein JSON.
    if (!storniert) {
      return antwort
        .code(404)
        .type('text/html; charset=utf-8')
        .send('<p>Dieser Link ist nicht mehr gültig.</p>');
    }
    return antwort
      .type('text/html; charset=utf-8')
      .send('<p>Deine Anmeldung ist storniert. Danke fürs Bescheidsagen!</p>');
  });

  return app;
}
