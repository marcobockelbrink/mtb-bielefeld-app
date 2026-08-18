/**
 * Die Fastify-Instanz ohne Netzwerk.
 *
 * Abhängigkeiten kommen von außen herein, damit Tests eine echte Datenbank
 * und einen gemerkten Mailer einsetzen können.
 */

import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance } from 'fastify';
import type pg from 'pg';

import { fordereMagicLinkAn } from './anmeldung.ts';
import { Bildablage, INHALTSTYPEN, etag } from './bildablage.ts';
import { BildFehler, HOECHSTGROESSE_BYTES, verarbeite, verarbeiteAvatar } from './bildverarbeitung.ts';
import * as familie from './familie.ts';
import * as fotos from './fotoalbum.ts';
import { IpBegrenzung } from './ipbegrenzung.ts';
import * as jugend from './jugendtraining.ts';
import * as jugendmails from './jugendmails.ts';
import { holeKontoAuskunft, loescheKonto } from './konto.ts';
import { hatGuideRechte } from './rolle.ts';
import type { Mailer } from './mailer.ts';
import { serialisiereFehler, type Protokoll } from './protokoll.ts';
import { beendeSitzung, erneuereSitzung, loeseEinladungEin, loeseMagicLinkEin, pruefeZugang, type Ausweis } from './sitzung.ts';
import { erzeugeStandardTerminDienst, type TerminDienst } from './termine.ts';
import * as verwaltung from './verwaltung.ts';
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
  /**
   * Standard: das Volume unter `FOTO_WURZEL` (im Container `/fotos`). Tests
   * reichen einen Wegwerf-Ordner herein — sonst schriebe `npm test` Bilder
   * in die Ablage des Betriebs.
   */
  bildablage?: Bildablage;
}

/**
 * Wie viele Hintergrundvorgänge höchstens gleichzeitig laufen dürfen.
 *
 * Solange die Antwort auf die Arbeit wartete, bremste die Arbeit den
 * Anfragenden: Wer schneller schickte, als die Datenbank antwortete, wartete
 * selbst. Seit die Antwort vorausgeht, ist diese Bremse weg. Ohne
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
 * das eigentlich abfangen soll, ist die IP-Ebene — Caddy davor
 * (`betrieb/Caddyfile`, gegen den laufenden Aufbau geprüft) und
 * `ipbegrenzung.ts` dahinter. Diese globale Grenze bleibt trotzdem: Sie
 * greift auch dann, wenn eine Flut über viele IPs verteilt kommt, und ist
 * das Letzte, was zwischen einer Anfrageflut und dem Speicher steht.
 */
const HOECHSTENS_GLEICHZEITIG = 50;

/**
 * Wie lange ein Hintergrundvorgang höchstens seinen Platz behält, bevor er
 * ihn auf jeden Fall wieder freigibt.
 *
 * Ohne dieses Limit wird der Platz ausschließlich im `.finally()` der
 * Arbeit selbst frei — ein Zähler, der nur in eine Richtung läuft. Hängt ein
 * Vorgang dauerhaft (echter SMTP-Versand ohne eigene Zeitschranke,
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
 * Dieselbe Pfadliste wie in `betrieb/Caddyfile`:
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
const IP_GESCHUETZTE_PFAD_PRAEFIXE = [
  '/anmeldung/',
  '/sitzung',
  '/konto',
  '/termine/',
  '/gast/',
  '/jugendtraining',
  '/verwaltung',
  '/familie',
  '/avatar',
];

/**
 * Pfade, an denen nur die schreibenden Methoden mitgezählt werden.
 *
 * `GET /termine/:schluessel` ist die Belegungsabfrage, `GET /jugendtraining`
 * und `GET /jugendtraining/:id` sind die Listen- und Detailabfrage — die
 * Anfragen dieser API, die eine App im gewöhnlichen Gebrauch **je Termin
 * oder Training** stellt. Wer eine Liste öffnet, feuert damit ein Dutzend
 * GETs in wenigen Sekunden und reißt die Grenze von zwanzig je Minute, ohne
 * irgendetwas falsch zu machen. Eine Notbremse, die den Normalfall bremst,
 * ist keine Notbremse mehr, sondern ein Fehler.
 *
 * Das ist eine Abwägung, keine Lücke: Ein `GET` hierher kann eine
 * `Authorization`-Kopfzeile tragen und prüft dann ein Token gegen die
 * Datenbank — ungezählt heißt also, dass das Durchprobieren von Zugangs-
 * Token über diesen einen Weg von dieser Schicht nicht gebremst wird. Bei
 * einem 256-Bit-Token ist Erraten aussichtslos, und die Abwehr einer
 * schieren Anfrageflut ist ohnehin nicht die Aufgabe dieser Schicht,
 * sondern die von Caddy. Jedes `POST`, `PATCH`, `PUT` und `DELETE` zählt
 * unverändert mit — das sind Vorgänge, die ein Mensch je Termin oder
 * Training einmal auslöst, nie zwanzigmal je Minute.
 */
const NUR_SCHREIBEND_GEZAEHLT = ['/termine/', '/jugendtraining'];

function zaehltGegenIpGrenze(methode: string, pfad: string): boolean {
  if (!IP_GESCHUETZTE_PFAD_PRAEFIXE.some((praefix) => pfad.startsWith(praefix))) return false;
  return !(methode === 'GET' && NUR_SCHREIBEND_GEZAEHLT.some((praefix) => pfad.startsWith(praefix)));
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

/**
 * Hinter Caddy steht in `anfrage.ip` sonst immer die Adresse des Proxys —
 * ein einziger Eimer für den ganzen Verein, und die Begrenzung je IP wäre
 * wertlos (`ipbegrenzung.ts`).
 *
 * Bewusst nicht `true`, sondern die Adresse des Proxys: `true` würde jedem
 * geglaubt, der ein `X-Forwarded-For` mitschickt — dann setzt sich ein
 * Angreifer für jede Anfrage eine neue Adresse und die Begrenzung ist
 * wieder wertlos. `VERTRAUTER_PROXY` kommt aus der Umgebung; ohne den Wert
 * bleibt es bei `false`, was für die Entwicklung ohne Proxy richtig ist.
 *
 * **Wovon das abhängt, gemessen und nicht angenommen:** `172.16.0.0/12` ist
 * der ganze Docker-Bereich, nicht eine einzelne Adresse — Compose vergibt
 * die Container-Adressen dynamisch, eine feste ließe sich nicht eintragen.
 * Wer aus diesem Bereich anfragt, darf also bestimmen, welche IP hier
 * ankommt; direkt gegen die API gemessen wird aus `X-Forwarded-For:
 * 9.9.9.9` tatsächlich `anfrage.ip === '9.9.9.9'`. Zwei Dinge halten das
 * zusammen: Die API hat keine Portfreigabe, erreichbar ist sie nur aus dem
 * Compose-Netz — und Caddy **ersetzt** ein mitgeschicktes
 * `X-Forwarded-For`, statt die echte Adresse anzuhängen (seit Caddy 2.7,
 * solange `trusted_proxies` leer bleibt). Über Caddy kommt die Fälschung
 * deshalb nicht durch, gemessen ebenfalls.
 *
 * Daraus folgt die Bedingung für später: **Wer `trusted_proxies` in den
 * Caddyfile schreibt** — der naheliegende Handgriff, sobald ein CDN oder
 * ein Lastverteiler davorsteht — **hebelt diese Begrenzung aus**, ohne dass
 * ein Test rot wird. Dann muss `VERTRAUTER_PROXY` mitwachsen und die Kette
 * neu durchgerechnet werden.
 */
const vertrauterProxy = process.env.VERTRAUTER_PROXY;

export function baueApp({
  pool,
  mailer,
  jetzt = () => new Date(),
  protokoll,
  hoechstensGleichzeitig = HOECHSTENS_GLEICHZEITIG,
  hintergrundZeitschrankeMs = HINTERGRUND_ZEITSCHRANKE_MS,
  ipBegrenzung = new IpBegrenzung(HOECHSTENS_ANFRAGEN_JE_MINUTE, EINE_MINUTE_MS),
  terminDienst,
  bildablage = new Bildablage(process.env.FOTO_WURZEL ?? '/fotos'),
}: Abhaengigkeiten): FastifyInstance {
  const app = Fastify({ logger: protokollEinstellung, trustProxy: vertrauterProxy ?? false });

  // Ein Bild je Anfrage, und die Grenze steht **hier** und nicht erst in der
  // Bildverarbeitung: Ohne sie läse Fastify erst 400 MB in den Speicher, um
  // sie danach abzulehnen. Caddy hat davor noch eine eigene Grenze — zwei
  // Schichten, weil die äußere bei einem Aufruf ohne Proxy fehlt.
  app.register(multipart, { limits: { fileSize: HOECHSTGROESSE_BYTES, files: 1 } });
  const log = protokoll ?? app.log;
  const termine = terminDienst ?? erzeugeStandardTerminDienst(log);

  /**
   * Notbremse je IP für die tokenprüfenden Pfade (siehe
   * `IP_GESCHUETZTE_PFAD_PRAEFIXE`), ohne die Belegungsabfrage `GET
   * /termine/…` (siehe `NUR_SCHREIBEND_GEZAEHLT`) — `ipbegrenzung.ts`
   * begründet das Warum dieser Schicht, `betrieb/Caddyfile` ist die
   * Schicht, die das eigentlich übernehmen soll — angewandt und gegen einen
   * laufenden Caddy geprüft in `betrieb/Caddyfile`.
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

  /**
   * Ein Fehler, den nur ein echtes Telefon sieht, ins Serverprotokoll.
   *
   * **Warum es das gibt.** Der Foto-Upload scheitert auf dem Gerät, und
   * zwar in dem Moment, in dem `fetch` wirft — die Anfrage kommt hier also
   * nie an. Alles von außen Prüfbare ist geprüft: Netzweg, Caddy, Grenzen,
   * natives Modul, Berechtigungen. Was übrig bleibt, kann nur das Telefon
   * sagen, und der Weg dahin war bisher: Marco liest die Meldung ab und
   * tippt sie ab. Das kostet ihn jedes Mal einen Anlauf und mich eine
   * Fassung.
   *
   * **Was hier ankommt**, ist ausschließlich der technische Text der
   * Ausnahme und der Bereich, in dem sie auftrat — keine Bildinhalte.
   * Angemeldet sein muss man trotzdem, sonst wäre das ein offenes
   * Schreibfeld ins Protokoll.
   *
   * **Das ist eine Behelfsbrücke.** Sobald der Upload-Fehler gefunden ist,
   * gehört sie wieder entfernt; ein Endpunkt, dessen einziger Zweck eine
   * einzelne Untersuchung war, verrottet sonst still im Betrieb.
   */
  app.post('/diagnose', async (anfrage, antwort) => {
    const betrachter = await holeBetrachter(anfrage);
    if (!betrachter) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });

    const { bereich, text } = (anfrage.body ?? {}) as { bereich?: unknown; text?: unknown };
    if (typeof bereich !== 'string' || typeof text !== 'string') {
      return antwort.code(400).send({ fehler: 'bereich und text müssen Zeichenketten sein.' });
    }

    // Gekappt, damit niemand das Protokoll vollschreiben kann — weder aus
    // Versehen noch mit Absicht.
    anfrage.log.warn(
      { bereich: bereich.slice(0, 60), text: text.slice(0, 500), mitglied: betrachter.id },
      'DIAGNOSE vom Geraet',
    );
    return antwort.code(204).send();
  });

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

  // Der Ein-Klick-Weg aus der Einladungsmail: Der Code im Link genügt,
  // die Adresse kennt der Server — der Code ist an sie gebunden. Dieselbe
  // Beweislage wie beim Magic Link (Zugriff aufs Postfach), siehe
  // `loeseEinladungEin`.
  app.post('/anmeldung/einladung', async (anfrage, antwort) => {
    const { code } = (anfrage.body ?? {}) as { code?: unknown };

    if (typeof code !== 'string' || code.length === 0) {
      return antwort.code(400).send({ fehler: 'Code fehlt.' });
    }

    const ergebnis = await loeseEinladungEin(pool, code, jetzt());
    if (!ergebnis.ok) {
      // Wortgleich zum Magic Link — ein Grund würde verraten, ob es den
      // Code je gab.
      return antwort.code(401).send({ fehler: 'Der Link gilt nicht mehr.' });
    }

    return antwort.send({ zugang: ergebnis.zugang, erneuerung: ergebnis.erneuerung });
  });

  // Der Einladungslink im **Browser** — Android ohne App, Weiterleitung im
  // Mailprogramm, Desktop. Statt eines nackten 404: zum TestFlight, wenn
  // es den Link gibt, sonst ein Satz, der weiterhilft. Der Code wird hier
  // weder geprüft noch entwertet — das tut erst die App.
  app.get('/e/:code', async (_anfrage, antwort) => {
    const testflight = process.env.TESTFLIGHT_LINK;
    if (testflight) return antwort.redirect(testflight, 302);
    return antwort
      .header('content-type', 'text/plain; charset=utf-8')
      .send('Diesen Link bitte auf dem Handy öffnen — er gehört zur Vereins-App des MTB Bielefeld e.V.');
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

  /**
   * Liest einen Zeitpunkt aus dem Anfragekörper.
   *
   * `undefined` heißt „nicht angegeben", `null` heißt „angegeben, aber
   * unbrauchbar". Ohne diese Unterscheidung liefe ein Tippfehler als
   * `Invalid Date` in die Datenbank, Postgres bräche mit 22007 ab, und die
   * Person läse „invalid input syntax for type timestamp with time zone" —
   * auf Englisch, mit Fehlercode, aus einer Schicht, von der sie nichts weiß.
   */
  function lieszeitpunkt(wert: unknown): Date | null | undefined {
    if (wert === undefined) return undefined;
    if (wert === null) return null;
    const zeit = new Date(String(wert));
    return Number.isNaN(zeit.getTime()) ? null : zeit;
  }

  /** Wie `lieszeitpunkt`, aber für eine Anzahl. Null und negativ sind keine. */
  function liesAnzahl(wert: unknown): number | null | undefined {
    if (wert === undefined) return undefined;
    if (wert === null) return null;
    const zahl = Number(wert);
    return Number.isInteger(zahl) && zahl > 0 ? zahl : null;
  }

  /**
   * Wie `holeAusweis`, aber besteht auf der Guide-Rolle.
   *
   * Unterscheidet die beiden Fälle, statt beide als „darfst du nicht" zu
   * beantworten: Wer gar nicht angemeldet ist, bekommt 401 und weiß, dass
   * er sich anmelden soll. Wer angemeldet ist, aber kein Guide, bekommt 403
   * — dann hilft kein Anmelden, sondern nur jemand, der ihm die Rolle gibt.
   * Beides mit „Das dürfen nur Guides" zu beantworten schickte Leute in die
   * falsche Richtung.
   */
  async function holeGuide(
    anfrage: { headers: Record<string, unknown> },
  ): Promise<{ ausweis: Ausweis } | { fehler: 401 | 403 }> {
    const ausweis = await holeAusweis(anfrage);
    if (!ausweis) return { fehler: 401 };
    if (!hatGuideRechte(ausweis.rolle)) return { fehler: 403 };
    return { ausweis };
  }

  /** Die passende Antwort zu einem Ergebnis von `holeGuide`. */
  function weiseAb(antwort: { code(n: number): { send(k: unknown): unknown } }, code: 401 | 403) {
    return code === 401
      ? antwort.code(401).send({ fehler: 'Nicht angemeldet.' })
      : antwort.code(403).send({ fehler: 'Das dürfen nur Guides.' });
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

  app.put('/konto/jugend-benachrichtigung', async (anfrage, antwort) => {
    const ausweis = await holeAusweis(anfrage);
    if (!ausweis) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });

    const koerper = anfrage.body as Record<string, unknown>;
    if (typeof koerper?.an !== 'boolean') {
      return antwort.code(400).send({ fehler: 'An oder aus angeben.' });
    }
    await jugendmails.setzeAbonnement(pool, ausweis.mitgliedId, koerper.an);
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
    if (ausweis && hatGuideRechte(ausweis.rolle)) {
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

    // Restkanal, bewusst offen und nicht behoben: Wer eine fremde, noch
    // **nicht** angemeldete Adresse probiert, meldet sie damit wirklich an —
    // das ist ein echter Erfolg unten, keine Täuschung. Die öffentliche
    // Belegung (`GET /termine/:schluessel`) steigt dabei sichtbar um eins,
    // und wer vorher und nachher zählt, liest daraus, dass die Probe „ins
    // Leere" ging (die Adresse war noch frei). Das lässt sich ohne eine
    // Bestätigungsschleife vor dem Speichern nicht schließen — die würde den
    // ganzen Gast-Pfad genau um das Konto-Login komplizieren, den dieser
    // Endpunkt bewusst nicht verlangt. Der Preis für den Angreifer bleibt
    // trotzdem hoch: Die betroffene Adresse bekommt eine echte
    // Bestätigungsmail mit Storno-Link (sie merkt die fremde Anmeldung sofort
    // und macht sie mit einem Klick rückgängig) und der Vorgang steht mit
    // ihrer Adresse im Protokoll — anders als bei `schon-angemeldet` und
    // `zu-viele` unten, wo nichts entsteht, das der Angreifer beobachten oder
    // die betroffene Person bemerken könnte.

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
        // Bewusst `belegt + 1`, nicht die unveränderte Zahl: Ein Angreifer,
        // der den Stand vorher per GET abliest, sähe an einer ehrlichen
        // Antwort genau dasselbe Orakel wie am Text zuvor — nur als Zahl
        // statt als Statuscode. `belegt` ist hier der Stand **vor** dem
        // (unterbliebenen) Einfügen, also derselbe Wert, den ein echter
        // Erfolg an dieser Stelle um eins erhöht ausgibt. Die Lüge muss
        // vollständig sein, sonst ist sie keine.
        return antwort.code(201).send({ belegt: ergebnis.belegt + 1 });
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

    // Die Storno-Mail läuft im Hintergrund, nicht vor der Antwort — genau wie
    // bei den Magic Links (`fordereMagicLinkAn`), und aus demselben Grund:
    // Der vorgetäuschte Zweig oben antwortet sofort, ohne je einen Mailer
    // anzufassen. Wartete der echte Erfolg hier auf `mailer.sende(...)`, wäre
    // mit einem echten Mailanbieter die Antwortzeit selbst wieder
    // ein Orakel — ein Angreifer, der eine fremde Adresse probiert, könnte am
    // Zeitunterschied ablesen, ob sie noch frei war (schnelle Antwort, keine
    // Mail) oder gerade wirklich angemeldet wurde (langsamere Antwort, echter
    // Versand). Scheitert der Versand, bleibt die Anmeldung bestehen — der
    // Gast ist angemeldet, die Mail ist Komfort — und der Fehler geht laut
    // ins Protokoll, nicht an den längst beantworteten Anfragenden.
    if (ergebnis.stornoToken && 'gastEmail' in wunsch) {
      const { gastName, gastEmail } = wunsch;
      const stornoToken = ergebnis.stornoToken;
      const terminTitel = termin.title;
      imHintergrund(async () => {
        const basis = process.env.API_BASIS_URL ?? 'https://api.mtb-bielefeld.de';
        try {
          await mailer.sende(
            gastEmail,
            `Deine Anmeldung: ${terminTitel}`,
            [
              `Hallo ${gastName},`,
              '',
              `du bist angemeldet: ${terminTitel}.`,
              '',
              'Wenn du doch nicht mitfahren kannst, sag mit einem Klick ab:',
              `${basis}/gast/storno/${stornoToken}`,
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
      });
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

  /**
   * Das Ziel eines geteilten Links — der einzige Pfad im ganzen Vorhaben ohne
   * Token.
   *
   * Er zeigt bewusst wenig: kein Datum, keine Uhrzeit, kein Ort, keine
   * Teilnehmer. WhatsApp-Nachrichten werden weitergeleitet, und ein Link ist
   * kein Zugangsschutz — Ort und Zeit dürfen im Nachrichtentext selbst
   * stehen, der geht heute ohnehin durch dieselbe Gruppe.
   *
   * Für ein unbekanntes Kürzel antwortet er **genauso** wie für ein
   * bekanntes: gleiche Seite, gleicher Statuscode. Sonst wäre er ein
   * Auskunftsdienst darüber, welche Kennungen existieren — dieselbe
   * Überlegung wie bei `/anmeldung/anfordern`. Deshalb liest die
   * Handlerfunktion `:id` gar nicht erst aus.
   *
   * Erreichbar ohne Token, deshalb in Caddys Zone `anmeldung`
   * (`betrieb/Caddyfile`) — aber bewusst
   * **nicht** in `IP_GESCHUETZTE_PFAD_PRAEFIXE`: Diese Liste zählt Pfade,
   * die ein Token gegen die Datenbank prüfen, und das tut dieser Pfad nicht.
   */
  app.get('/t/:id', async (_anfrage, antwort) => {
    return antwort.type('text/html; charset=utf-8').send(`<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MTB Bielefeld e.V.</title></head>
<body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem">
<h1>Jugendtraining</h1>
<p>Die Einzelheiten stehen in der App des MTB Bielefeld e.V. — dort kannst du
dein Kind auch anmelden.</p>
<p><a href="mtbie://">App öffnen</a></p>
</body></html>`);
  });

  /**
   * Drei Mailversände, alle nach demselben Muster: Adressen holen, Text aus
   * `jugendmails.ts` bauen, **einzeln** verschicken.
   *
   * Einzeln und nicht als Sammel-Mail: Ein Verteiler im An-Feld gäbe jedem
   * Guide die Adressen aller anderen Guides preis, jedem Elternteil die
   * aller anderen Eltern — ein Datenleck durch Bequemlichkeit.
   *
   * `.catch` um jeden einzelnen Versand statt um die Schleife: Eine
   * schlechte Adresse darf die Zustellung an alle anderen nicht abbrechen.
   * Der Fehlschlag bleibt dabei nicht still — er geht laut ins Protokoll,
   * bevor mit der nächsten Adresse weitergemacht wird.
   */
  async function fragteGuides(training: jugend.Training): Promise<void> {
    const adressen = await jugend.holeGuideAdressen(pool);
    const { betreff, text } = jugendmails.baueGuideAnfrage(training);
    for (const adresse of adressen) {
      await mailer.sende(adresse, betreff, text).catch((fehler) => {
        log.error({ fehler: serialisiereFehler(fehler), adresse }, 'Guide-Anfrage nicht zugestellt');
      });
    }
  }

  async function benachrichtigeAbonnenten(training: jugend.Training): Promise<void> {
    const adressen = await jugendmails.holeAbonnenten(pool);
    const { betreff, text } = jugendmails.baueVeroeffentlichung(training);
    for (const adresse of adressen) {
      await mailer.sende(adresse, betreff, text).catch((fehler) => {
        log.error(
          { fehler: serialisiereFehler(fehler), adresse },
          'Veröffentlichungs-Mail nicht zugestellt',
        );
      });
    }
  }

  async function meldeAbsage(training: jugend.Training, eltern: string[]): Promise<void> {
    const { betreff, text } = jugendmails.baueAbsage(training);
    for (const adresse of eltern) {
      await mailer.sende(adresse, betreff, text).catch((fehler) => {
        log.error({ fehler: serialisiereFehler(fehler), adresse }, 'Absage-Mail nicht zugestellt');
      });
    }
  }

  async function meldeAenderung(
    training: jugend.Training,
    aenderungen: jugendmails.Aenderung[],
    eltern: string[],
  ): Promise<void> {
    const { betreff, text } = jugendmails.baueAenderung(training, aenderungen);
    for (const adresse of eltern) {
      await mailer.sende(adresse, betreff, text).catch((fehler) => {
        log.error({ fehler: serialisiereFehler(fehler), adresse }, 'Änderungs-Mail nicht zugestellt');
      });
    }
  }

  app.post('/jugendtraining', async (anfrage, antwort) => {
    // 403 und nicht 404: Wer angemeldet ist, darf erfahren, dass es diesen
    // Weg gibt — nur nicht, dass er ihn gehen darf. Ein 404 wäre hier
    // Geheimniskrämerei ohne Gewinn.
    const erlaubnis = await holeGuide(anfrage);
    if ('fehler' in erlaubnis) return weiseAb(antwort, erlaubnis.fehler);
    const guide = erlaubnis.ausweis;

    const koerper = anfrage.body as Record<string, unknown>;
    const beginntAm = lieszeitpunkt(koerper?.beginntAm);
    const endetAm = lieszeitpunkt(koerper?.endetAm);
    const plaetze = liesAnzahl(koerper?.plaetze);
    const guidesNoetig = liesAnzahl(koerper?.guidesNoetig);
    const ort = typeof koerper?.ort === 'string' ? koerper.ort.trim() : '';

    if (!beginntAm || ort === '') {
      return antwort.code(400).send({ fehler: 'Beginn und Ort werden gebraucht.' });
    }
    if (endetAm === null && koerper?.endetAm !== null && koerper?.endetAm !== undefined) {
      return antwort.code(400).send({ fehler: 'Das Ende ist kein gültiger Zeitpunkt.' });
    }
    if (plaetze === null && koerper?.plaetze !== null && koerper?.plaetze !== undefined) {
      return antwort.code(400).send({ fehler: 'Die Platzzahl muss eine ganze Zahl über null sein.' });
    }
    if (guidesNoetig === null && koerper?.guidesNoetig !== undefined) {
      return antwort.code(400).send({ fehler: 'Die Zahl der Guides muss eine ganze Zahl über null sein.' });
    }

    const training = await jugend.legeTrainingAn(
      pool,
      {
        beginntAm,
        endetAm: endetAm ?? null,
        ort,
        hinweis: typeof koerper.hinweis === 'string' ? koerper.hinweis.trim() : null,
        plaetze: plaetze ?? null,
        guidesNoetig: guidesNoetig ?? undefined,
      },
      guide.mitgliedId,
      jetzt(),
    );

    // Wie viele gefragt werden, steht **vor** der Antwort fest — der Guide
    // will wissen „ist die Info jetzt raus?", und die Zahl nachzureichen
    // ginge nur über einen zweiten Aufruf. Der Versand selbst läuft
    // weiterhin danach: Er darf die Antwort nicht aufhalten.
    const gefragte = (await jugend.holeGuideAdressen(pool)).length;
    antwort.code(201).send({ ...training, gefragteGuides: gefragte });
    imHintergrund(() => fragteGuides(training));
    return antwort;
  });

  app.get('/jugendtraining', async (anfrage, antwort) => {
    const ausweis = await holeAusweis(anfrage);
    if (!ausweis) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });

    // 90 Tage zurück: genug, um die Saison nachzuschlagen, wenig genug,
    // dass die Liste nicht über Jahre wächst.
    const trainings = await jugend.holeTrainings(pool, hatGuideRechte(ausweis.rolle), jetzt(), 90);
    const mitZahlen = await Promise.all(
      trainings.map(async (t) => ({
        ...t,
        belegt: await jugend.holeBelegungTraining(pool, t.id),
      })),
    );
    return antwort.send(mitZahlen);
  });

  app.get('/jugendtraining/:id', async (anfrage, antwort) => {
    const ausweis = await holeAusweis(anfrage);
    if (!ausweis) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });

    const { id } = anfrage.params as { id: string };
    const training = await jugend.holeTraining(pool, id);
    const istGuide = hatGuideRechte(ausweis.rolle);
    // Ein Entwurf ist für alle anderen dasselbe wie ein Training, das es
    // nicht gibt — sonst verriete der Statuscode seine Existenz.
    if (!training || (training.zustand === 'entwurf' && !istGuide)) {
      return antwort.code(404).send({ fehler: 'Dieses Training gibt es nicht.' });
    }

    const guideAntworten = await jugend.holeGuideAntworten(pool, id);
    return antwort.send({
      ...training,
      belegt: await jugend.holeBelegungTraining(pool, id),
      kinder: await jugend.holeKinder(pool, id, istGuide, ausweis.mitgliedId),
      // Guides bekommen die Namen, alle anderen nur die Zahl der Zusagen —
      // die Spec verspricht ihnen genau das. Ohne die Zahl bliebe „reichen
      // die Guides?" für Eltern unsichtbar, mit den Namen wüssten sie mehr
      // über andere Mitglieder, als sie müssen.
      guides: istGuide ? guideAntworten : undefined,
      guideZusagen: guideAntworten.filter((g) => g.zusage).length,
    });
  });

  app.patch('/jugendtraining/:id', async (anfrage, antwort) => {
    const erlaubnis = await holeGuide(anfrage);
    if ('fehler' in erlaubnis) return weiseAb(antwort, erlaubnis.fehler);

    const { id } = anfrage.params as { id: string };
    const koerper = anfrage.body as Record<string, unknown>;

    const beginntAm = lieszeitpunkt(koerper.beginntAm);
    const endetAm = lieszeitpunkt(koerper.endetAm);
    const plaetze = liesAnzahl(koerper.plaetze);
    if ('beginntAm' in koerper && !beginntAm) {
      return antwort.code(400).send({ fehler: 'Der Beginn ist kein gültiger Zeitpunkt.' });
    }
    if ('endetAm' in koerper && endetAm === null && koerper.endetAm !== null) {
      return antwort.code(400).send({ fehler: 'Das Ende ist kein gültiger Zeitpunkt.' });
    }
    if ('plaetze' in koerper && plaetze === null && koerper.plaetze !== null) {
      return antwort.code(400).send({ fehler: 'Die Platzzahl muss eine ganze Zahl über null sein.' });
    }

    // Den Stand **vor** der Änderung holen. Ohne ihn ließe sich hinterher
    // nicht sagen, was sich geändert hat — und genau das ist der Inhalt der
    // Mail an die Familien. Die Adressen kommen aus demselben Grund vorher,
    // wie beim Absagen.
    const vorher = await jugend.holeTraining(pool, id);
    const eltern = vorher?.zustand === 'veroeffentlicht' ? await jugend.holeElternAdressen(pool, id) : [];

    const geaendert = await jugend.aendereTraining(pool, id, {
      ...(beginntAm ? { beginntAm } : {}),
      ...(typeof koerper.ort === 'string' ? { ort: koerper.ort.trim() } : {}),
      ...('endetAm' in koerper ? { endetAm } : {}),
      ...('hinweis' in koerper ? { hinweis: koerper.hinweis === null ? null : String(koerper.hinweis) } : {}),
      ...('plaetze' in koerper ? { plaetze } : {}),
    });
    if (!geaendert) return antwort.code(404).send({ fehler: 'Dieses Training gibt es nicht.' });

    antwort.send(geaendert);

    // Nur auf ausdrücklichen Wunsch, nur bei einem veröffentlichten
    // Training und nur, wenn sich für die Familien wirklich etwas geändert
    // hat. Beim **Entwurf** weiß niemand von dem Termin; eine Mail darüber
    // wäre die erste Nachricht, die jemand davon hört. Und eine Mail über
    // null Änderungen ist eine Mail zu viel — die Guides würden das Häkchen
    // sonst bald grundsätzlich weglassen.
    if (koerper.elternInformieren === true && vorher && eltern.length > 0) {
      const aenderungen = jugendmails.findeAenderungen(vorher, geaendert);
      if (aenderungen.length > 0) {
        imHintergrund(() => meldeAenderung(geaendert, aenderungen, eltern));
      }
    }
    return antwort;
  });

  app.post('/jugendtraining/:id/veroeffentlichen', async (anfrage, antwort) => {
    const erlaubnis = await holeGuide(anfrage);
    if ('fehler' in erlaubnis) return weiseAb(antwort, erlaubnis.fehler);

    const { id } = anfrage.params as { id: string };
    const ergebnis = await jugend.veroeffentliche(pool, id, jetzt());
    if (!ergebnis.ok) {
      return ergebnis.grund === 'unbekannt'
        ? antwort.code(404).send({ fehler: 'Dieses Training gibt es nicht.' })
        : antwort.code(409).send({ fehler: 'Dieses Training ist nicht mehr im Entwurf.' });
    }

    antwort.send(ergebnis.training);
    imHintergrund(() => benachrichtigeAbonnenten(ergebnis.training));
    return antwort;
  });

  app.post('/jugendtraining/:id/absage', async (anfrage, antwort) => {
    const erlaubnis = await holeGuide(anfrage);
    if ('fehler' in erlaubnis) return weiseAb(antwort, erlaubnis.fehler);

    const { id } = anfrage.params as { id: string };
    const koerper = anfrage.body as Record<string, unknown>;
    const grund = typeof koerper?.grund === 'string' ? koerper.grund.trim() : '';
    // Ein Grund ist Pflicht: „abgesagt" ohne Warum lässt acht Familien
    // rätseln, und jemand fährt trotzdem hin.
    if (grund === '') return antwort.code(400).send({ fehler: 'Bitte einen Grund angeben.' });

    // Die Adressen **vor** der Absage holen: Danach ändert sich zwar nichts
    // an den Anmeldungen, aber die Reihenfolge macht es unabhängig davon,
    // ob später einmal beim Absagen aufgeräumt wird.
    const eltern = await jugend.holeElternAdressen(pool, id);
    const ergebnis = await jugend.sageAb(pool, id, grund, jetzt());
    if (!ergebnis.ok) {
      return ergebnis.grund === 'unbekannt'
        ? antwort.code(404).send({ fehler: 'Dieses Training gibt es nicht.' })
        : antwort.code(409).send({ fehler: 'Dieses Training ist schon abgesagt.' });
    }

    antwort.send(ergebnis.training);
    imHintergrund(() => meldeAbsage(ergebnis.training, eltern));
    return antwort;
  });

  app.put('/jugendtraining/:id/guide', async (anfrage, antwort) => {
    const erlaubnis = await holeGuide(anfrage);
    if ('fehler' in erlaubnis) return weiseAb(antwort, erlaubnis.fehler);
    const guide = erlaubnis.ausweis;

    const { id } = anfrage.params as { id: string };
    const koerper = anfrage.body as Record<string, unknown>;
    if (typeof koerper?.zusage !== 'boolean') {
      return antwort.code(400).send({ fehler: 'Zusage oder Absage angeben.' });
    }

    const ergebnis = await jugend.setzeGuideAntwort(pool, id, guide.mitgliedId, koerper.zusage, jetzt());
    // 409 und nicht 404: Das Training gibt es ja, es ist nur nicht mehr das,
    // was der Bildschirm zeigte. Der Satz muss das sagen — „gibt es nicht"
    // schickte einen Guide auf die Suche nach einem Fehler, der keiner ist.
    if (ergebnis === 'abgesagt') {
      return antwort.code(409).send({ fehler: 'Dieses Training wurde inzwischen abgesagt.' });
    }
    if (ergebnis === 'unbekannt') {
      return antwort.code(404).send({ fehler: 'Dieses Training gibt es nicht.' });
    }
    return antwort.code(204).send();
  });

  app.post('/jugendtraining/:id/kinder', async (anfrage, antwort) => {
    const ausweis = await holeAusweis(anfrage);
    if (!ausweis) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });

    const { id } = anfrage.params as { id: string };
    const koerper = anfrage.body as Record<string, unknown>;
    const vorname = typeof koerper?.vorname === 'string' ? koerper.vorname.trim() : '';
    const nachname = typeof koerper?.nachname === 'string' ? koerper.nachname.trim() : '';
    if (vorname === '' || nachname === '') {
      return antwort.code(400).send({ fehler: 'Vor- und Nachname werden gebraucht.' });
    }

    const ergebnis = await jugend.meldeKindAn(
      pool,
      id,
      ausweis.mitgliedId,
      {
        vorname,
        nachname,
        zeigtVorname: koerper.zeigtVorname !== false,
        zeigtNachname: koerper.zeigtNachname === true,
      },
      jetzt(),
    );

    if (!ergebnis.ok) {
      const texte: Record<string, [number, string]> = {
        unbekannt: [404, 'Dieses Training gibt es nicht.'],
        'nicht-offen': [409, 'Für dieses Training kann man sich nicht anmelden.'],
        vorbei: [409, 'Dieses Training ist vorbei.'],
        voll: [409, 'Dieses Training ist voll.'],
        'schon-zwei': [409, 'Mehr als zwei Kinder gehen über ein Konto nicht.'],
      };
      const [code, text] = texte[ergebnis.grund]!;
      return antwort.code(code).send({ fehler: text });
    }

    return antwort.code(201).send({ kindId: ergebnis.kindId, belegt: ergebnis.belegt });
  });

  app.delete('/jugendtraining/:id/kinder/:kindId', async (anfrage, antwort) => {
    const ausweis = await holeAusweis(anfrage);
    if (!ausweis) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });

    const { id, kindId } = anfrage.params as { id: string; kindId: string };
    const weg = await jugend.meldeKindAb(pool, id, ausweis.mitgliedId, kindId, jetzt());
    // 404 auch für ein fremdes Kind: „Gibt es nicht" und „gehört dir nicht"
    // dürfen sich für den Anfragenden nicht unterscheiden.
    if (!weg) return antwort.code(404).send({ fehler: 'Diese Anmeldung gibt es nicht.' });
    return antwort.code(204).send();
  });

  /**
   * Eine bestehende Anmeldung korrigieren — Name oder Sichtbarkeit.
   *
   * Angemeldet sein genügt, eine Rolle braucht es nicht: Es sind die
   * eigenen Kinder. **Ein Guide darf hier trotzdem nichts** — er sieht die
   * vollen Namen, aber Sichtbarkeit ist nicht Besitz. Durchgesetzt wird das
   * nicht hier, sondern in der `WHERE`-Bedingung von `aendereAnmeldung`.
   */
  app.patch('/jugendtraining/:id/kinder/:kindId', async (anfrage, antwort) => {
    const ausweis = await holeAusweis(anfrage);
    if (!ausweis) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });

    const { id, kindId } = anfrage.params as { id: string; kindId: string };
    const koerper = (anfrage.body ?? {}) as Record<string, unknown>;

    // Leere Namen abweisen, statt sie durchzulassen: `COALESCE` würde einen
    // leeren Text als Wert nehmen, und in der Teilnehmerliste stünde dann
    // eine namenlose Zeile.
    for (const feld of ['vorname', 'nachname'] as const) {
      if (feld in koerper && (typeof koerper[feld] !== 'string' || koerper[feld].trim() === '')) {
        return antwort.code(400).send({ fehler: 'Vor- und Nachname werden gebraucht.' });
      }
    }

    const geaendert = await jugend.aendereAnmeldung(pool, id, ausweis.mitgliedId, kindId, {
      ...(typeof koerper.vorname === 'string' ? { vorname: koerper.vorname } : {}),
      ...(typeof koerper.nachname === 'string' ? { nachname: koerper.nachname } : {}),
      ...(typeof koerper.zeigtVorname === 'boolean' ? { zeigtVorname: koerper.zeigtVorname } : {}),
      ...(typeof koerper.zeigtNachname === 'boolean' ? { zeigtNachname: koerper.zeigtNachname } : {}),
    });

    // 404 auch für eine fremde Anmeldung: „Gibt es nicht" und „gehört dir
    // nicht" dürfen sich für den Anfragenden nicht unterscheiden.
    if (!geaendert) return antwort.code(404).send({ fehler: 'Diese Anmeldung gibt es nicht.' });
    return antwort.code(204).send();
  });

  // --- Fotoalben ------------------------------------------------------------

  /**
   * Wer fragt — samt der Angabe, ob er zur Jugend zählt.
   *
   * Die Zusatzabfrage kostet eine Zeile Datenbank je Anfrage und ist der
   * Preis dafür, dass `darfSehen` nichts herleiten muss. Sie läuft nur bei
   * den Foto-Pfaden, nicht bei jeder Anfrage der API.
   */
  async function holeBetrachter(
    anfrage: { headers: Record<string, unknown> },
  ): Promise<fotos.Betrachter | null> {
    const ausweis = await holeAusweis(anfrage);
    if (!ausweis) return null;

    return {
      id: ausweis.mitgliedId,
      rolle: ausweis.rolle as fotos.Betrachter['rolle'],
      gehoertZurJugend: await fotos.gehoertZurJugend(pool, ausweis.mitgliedId),
    };
  }

  app.post('/fotoalbum', async (anfrage, antwort) => {
    const betrachter = await holeBetrachter(anfrage);
    if (!betrachter) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });
    if (!fotos.darfAlbumAnlegen(betrachter.rolle)) {
      return antwort.code(403).send({ fehler: 'Alben legen Guides und die Verwaltung an.' });
    }

    const koerper = anfrage.body as Record<string, unknown>;
    const titel = typeof koerper?.titel === 'string' ? koerper.titel.trim() : '';
    const ereignisAm = lieszeitpunkt(koerper?.ereignisAm);

    if (titel === '' || !ereignisAm) {
      return antwort.code(400).send({ fehler: 'Titel und Datum werden gebraucht.' });
    }

    const sichtbarkeit = koerper?.sichtbarkeit;
    if (sichtbarkeit !== undefined && sichtbarkeit !== 'mitglieder' && sichtbarkeit !== 'jugend') {
      return antwort.code(400).send({ fehler: 'Sichtbarkeit ist „mitglieder" oder „jugend".' });
    }

    const album = await fotos.legeAlbumAn(
      pool,
      {
        titel,
        beschreibung: typeof koerper.beschreibung === 'string' ? koerper.beschreibung.trim() : null,
        ereignisAm,
        terminSchluessel:
          typeof koerper.terminSchluessel === 'string' ? koerper.terminSchluessel : null,
        sichtbarkeit,
        hochladenBis: lieszeitpunkt(koerper?.hochladenBis),
      },
      betrachter.id,
    );

    return antwort.code(201).send(album);
  });

  app.get('/fotoalbum', async (anfrage, antwort) => {
    const betrachter = await holeBetrachter(anfrage);
    if (!betrachter) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });

    return antwort.send(await fotos.holeAlben(pool));
  });

  app.get('/fotoalbum/:id', async (anfrage, antwort) => {
    const betrachter = await holeBetrachter(anfrage);
    if (!betrachter) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });

    const { id } = anfrage.params as { id: string };
    const album = await fotos.holeAlbum(pool, id);
    if (!album) return antwort.code(404).send({ fehler: 'Dieses Album gibt es nicht.' });

    // Gefiltert wird **hier**, nicht in der Abfrage: Die eine Funktion, die
    // über Sichtbarkeit entscheidet, soll auch die einzige bleiben.
    const alle = await fotos.holeFotos(pool, id);
    return antwort.send({
      ...album,
      fotos: alle.filter((foto) => fotos.darfSehen(betrachter, album, foto)),
    });
  });

  app.patch('/fotoalbum/:id', async (anfrage, antwort) => {
    const betrachter = await holeBetrachter(anfrage);
    if (!betrachter) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });
    if (!fotos.darfAlbumAnlegen(betrachter.rolle)) {
      return antwort.code(403).send({ fehler: 'Das dürfen Guides und die Verwaltung.' });
    }

    const { id } = anfrage.params as { id: string };
    const koerper = anfrage.body as Record<string, unknown>;

    const geaendert = await fotos.aendereAlbum(pool, id, {
      titel: typeof koerper?.titel === 'string' ? koerper.titel : undefined,
      beschreibung: 'beschreibung' in (koerper ?? {})
        ? (koerper.beschreibung as string | null)
        : undefined,
      sichtbarkeit:
        koerper?.sichtbarkeit === 'mitglieder' || koerper?.sichtbarkeit === 'jugend'
          ? koerper.sichtbarkeit
          : undefined,
      zustand:
        koerper?.zustand === 'offen' || koerper?.zustand === 'geschlossen'
          ? koerper.zustand
          : undefined,
    });

    if (!geaendert) return antwort.code(404).send({ fehler: 'Dieses Album gibt es nicht.' });
    return antwort.send(geaendert);
  });

  app.delete('/fotoalbum/:id', async (anfrage, antwort) => {
    const betrachter = await holeBetrachter(anfrage);
    if (!betrachter) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });
    if (!fotos.darfSichten(betrachter.rolle)) {
      return antwort.code(403).send({ fehler: 'Das darf nur die Verwaltung.' });
    }

    const { id } = anfrage.params as { id: string };
    const weg = await fotos.loescheAlbum(pool, id);
    if (!weg) return antwort.code(404).send({ fehler: 'Dieses Album gibt es nicht.' });

    // Erst die Zeilen, dann die Dateien. Andersherum bliebe bei einem Fehler
    // dazwischen ein Album voller kaputter Platzhalter stehen; so bleiben
    // schlimmstenfalls Dateien liegen, die niemand mehr referenziert.
    await bildablage.loescheAlbum(id);
    return antwort.code(204).send();
  });

  app.post('/fotoalbum/:id/fotos', async (anfrage, antwort) => {
    const betrachter = await holeBetrachter(anfrage);
    if (!betrachter) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });

    const { id } = anfrage.params as { id: string };
    const album = await fotos.holeAlbum(pool, id);
    if (!album) return antwort.code(404).send({ fehler: 'Dieses Album gibt es nicht.' });

    if (!fotos.darfHochladen(album, jetzt())) {
      return antwort.code(409).send({ fehler: 'Dieses Album nimmt keine Bilder mehr an.' });
    }

    // **Serverseitig, nicht nur im UI.** Ein Kinderprofil, bei dem der
    // Knopf nur versteckt ist, lädt trotzdem hoch, sobald jemand den
    // Endpunkt direkt aufruft.
    if (!(await familie.darfBilderHochladen(pool, betrachter.id))) {
      return antwort.code(403).send({ fehler: 'Dieses Profil darf keine Bilder hochladen.' });
    }

    const datei = await anfrage.file();
    if (!datei) return antwort.code(400).send({ fehler: 'Es kam keine Datei an.' });

    const roh = await datei.toBuffer();

    let bild;
    try {
      bild = await verarbeite(roh);
    } catch (fehler) {
      if (fehler instanceof BildFehler) {
        return antwort.code(400).send({ fehler: fehler.message });
      }
      throw fehler;
    }

    const zeile = await fotos.legeFotoAn(pool, {
      albumId: id,
      hochgeladenVon: betrachter.id,
      aufgenommenAm: bild.aufgenommenAm,
      pruefsumme: bild.pruefsumme,
      bytes: bild.bytes,
      breite: bild.breite,
      hoehe: bild.hoehe,
    });

    // 200 statt 409: Für den Hochladenden ist „liegt schon drin" kein
    // Fehler, sondern das gewünschte Ergebnis. Bei einem Stapel von dreißig
    // Bildern, von denen fünf schon da sind, will niemand fünf rote Meldungen.
    if (zeile === 'doppelt') {
      return antwort.code(200).send({ doppelt: true });
    }

    await bildablage.lege(id, zeile.id, bild.fassungen);
    return antwort.code(201).send(zeile);
  });

  app.get('/foto/:id/:fassung', async (anfrage, antwort) => {
    const betrachter = await holeBetrachter(anfrage);
    if (!betrachter) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });

    const { id, fassung } = anfrage.params as { id: string; fassung: string };
    if (fassung !== 'vorschau' && fassung !== 'anzeige' && fassung !== 'original') {
      return antwort.code(404).send({ fehler: 'Diese Fassung gibt es nicht.' });
    }

    const foto = await fotos.holeFoto(pool, id);
    const album = foto ? await fotos.holeAlbum(pool, foto.albumId) : null;

    // **404 und nicht 403.** Ein 403 verriete, dass es dieses Bild gibt —
    // und damit, dass jemand ein Bild hochgeladen hat, das noch niemand
    // freigegeben hat. „Gibt es nicht" und „darfst du nicht" müssen sich für
    // den Anfragenden gleich anfühlen.
    if (
      !foto ||
      !album ||
      !fotos.darfSehen(betrachter, album, foto) ||
      !fotos.darfFassungSehen(betrachter.rolle, fassung)
    ) {
      return antwort.code(404).send({ fehler: 'Dieses Bild gibt es nicht.' });
    }

    const marke = etag(foto.albumId, foto.id, fassung);
    if (anfrage.headers['if-none-match'] === marke) return antwort.code(304).send();

    let daten;
    try {
      daten = await bildablage.lies(foto.albumId, foto.id, fassung);
    } catch {
      // Zeile ohne Datei: Das sollte nicht vorkommen, und wenn doch, ist ein
      // 404 die ehrlichere Antwort als ein 500 — für den Anfragenden ist das
      // Bild schlicht nicht da.
      return antwort.code(404).send({ fehler: 'Dieses Bild gibt es nicht.' });
    }

    return antwort
      .header('content-type', INHALTSTYPEN[fassung])
      .header('etag', marke)
      // `private`: Bilder dürfen im Browser des Mitglieds liegen, aber in
      // keinem Zwischenspeicher, der sie an andere ausliefert.
      .header('cache-control', 'private, max-age=86400')
      .send(daten);
  });

  app.patch('/foto/:id', async (anfrage, antwort) => {
    const betrachter = await holeBetrachter(anfrage);
    if (!betrachter) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });
    if (!fotos.darfSichten(betrachter.rolle)) {
      return antwort.code(403).send({ fehler: 'Sichten darf nur die Verwaltung.' });
    }

    const { id } = anfrage.params as { id: string };
    const koerper = anfrage.body as Record<string, unknown>;

    if (koerper?.zustand === 'freigegeben' || koerper?.zustand === 'abgelehnt') {
      const foto = await fotos.entscheideUeberFoto(
        pool,
        id,
        koerper.zustand,
        betrachter.id,
        jetzt(),
      );
      if (!foto) return antwort.code(404).send({ fehler: 'Dieses Bild gibt es nicht.' });
      return antwort.send(foto);
    }

    if (typeof koerper?.fuerHomepage === 'boolean') {
      const foto = await fotos.setzeFuerHomepage(pool, id, koerper.fuerHomepage);
      // 409, nicht 404: Das Bild gibt es, nur ist es nicht freigegeben —
      // und ein nicht freigegebenes Bild gehört nicht auf die Vereinsseite.
      if (!foto) {
        const vorhanden = await fotos.holeFoto(pool, id);
        return vorhanden
          ? antwort.code(409).send({ fehler: 'Erst freigeben, dann für die Homepage vormerken.' })
          : antwort.code(404).send({ fehler: 'Dieses Bild gibt es nicht.' });
      }
      return antwort.send(foto);
    }

    return antwort.code(400).send({ fehler: 'Nichts zu ändern.' });
  });

  app.delete('/foto/:id', async (anfrage, antwort) => {
    const betrachter = await holeBetrachter(anfrage);
    if (!betrachter) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });

    const { id } = anfrage.params as { id: string };
    const foto = await fotos.holeFoto(pool, id);
    if (!foto) return antwort.code(404).send({ fehler: 'Dieses Bild gibt es nicht.' });

    if (!fotos.darfLoeschen(betrachter, foto)) {
      // 404 aus demselben Grund wie beim Ausliefern: Wer das Bild nicht
      // sehen darf, soll auch nicht erfahren, dass es existiert.
      const album = await fotos.holeAlbum(pool, foto.albumId);
      const sichtbar = album ? fotos.darfSehen(betrachter, album, foto) : false;
      return sichtbar
        ? antwort.code(403).send({ fehler: 'Das darf nur die Verwaltung.' })
        : antwort.code(404).send({ fehler: 'Dieses Bild gibt es nicht.' });
    }

    await fotos.loescheFoto(pool, id);
    await bildablage.loesche(foto.albumId, foto.id);
    return antwort.code(204).send();
  });

  app.post('/foto/:id/melden', async (anfrage, antwort) => {
    const betrachter = await holeBetrachter(anfrage);
    if (!betrachter) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });

    const { id } = anfrage.params as { id: string };
    const foto = await fotos.holeFoto(pool, id);
    const album = foto ? await fotos.holeAlbum(pool, foto.albumId) : null;

    if (!foto || !album || !fotos.darfSehen(betrachter, album, foto)) {
      return antwort.code(404).send({ fehler: 'Dieses Bild gibt es nicht.' });
    }

    const koerper = anfrage.body as Record<string, unknown>;
    await fotos.meldeFoto(
      pool,
      id,
      betrachter.id,
      typeof koerper?.grund === 'string' ? koerper.grund.trim() : null,
    );

    // 204 auch bei der zweiten Meldung desselben Menschen: Ihm zu sagen
    // „hast du schon" hilft ihm nicht und erzählt ihm etwas über die Liste
    // der Verwaltung.
    return antwort.code(204).send();
  });

  // --- Mitgliederverwaltung -------------------------------------------------
  //
  // 403 und nicht 404 für Angemeldete ohne Rolle — dieselbe Abwägung wie
  // bei den Guide-Wegen: Wer angemeldet ist, darf wissen, dass es diesen
  // Bereich gibt, nur nicht hinein. Anders als bei den Fotos verrät die
  // bloße Existenz des Weges nichts über Inhalte.

  async function holeVerwaltung(
    anfrage: { headers: Record<string, unknown> },
  ): Promise<{ ausweis: Ausweis } | { fehler: 401 | 403 }> {
    const ausweis = await holeAusweis(anfrage);
    if (!ausweis) return { fehler: 401 };
    if (ausweis.rolle !== 'verwaltung') return { fehler: 403 };
    return { ausweis };
  }

  function weiseVerwaltungAb(
    antwort: { code(n: number): { send(k: unknown): unknown } },
    code: 401 | 403,
  ) {
    return code === 401
      ? antwort.code(401).send({ fehler: 'Nicht angemeldet.' })
      : antwort.code(403).send({ fehler: 'Das darf nur die Verwaltung.' });
  }

  app.get('/verwaltung/mitglieder', async (anfrage, antwort) => {
    const erlaubnis = await holeVerwaltung(anfrage);
    if ('fehler' in erlaubnis) return weiseVerwaltungAb(antwort, erlaubnis.fehler);

    return antwort.send(await verwaltung.holeMitglieder(pool, jetzt()));
  });

  app.post('/verwaltung/einladungen', async (anfrage, antwort) => {
    const erlaubnis = await holeVerwaltung(anfrage);
    if ('fehler' in erlaubnis) return weiseVerwaltungAb(antwort, erlaubnis.fehler);

    const koerper = anfrage.body as Record<string, unknown>;
    const email = typeof koerper?.email === 'string' ? koerper.email.trim() : '';
    // Dieselbe bescheidene Prüfung wie beim Anmelden: ein @ mit etwas davor
    // und dahinter, ein Punkt danach. Bewusst ohne regulären Ausdruck:
    // `/^\S+@\S+\.\S+$/` backtrackt auf Eingaben wie "!@!@!@…" quadratisch
    // (CodeQL js/polynomial-redos) — drei indexOf sagen dasselbe in
    // linearer Zeit. Alles Strengere weist echte Adressen ab.
    const at = email.indexOf('@');
    const istAdresse =
      email.length <= 254 &&
      at > 0 &&
      email.lastIndexOf('.') > at + 1 &&
      !email.includes(' ') &&
      !email.endsWith('.');
    if (!istAdresse) {
      return antwort.code(400).send({ fehler: 'Das ist keine E-Mail-Adresse.' });
    }

    // Erst antworten, dann verschicken — dieselbe Regel wie bei den Magic
    // Links: Der Mailversand darf die Antwort nicht aufhalten.
    antwort.code(202).send({ eingeladen: email });
    imHintergrund(() =>
      verwaltung.ladeEin(
        pool,
        mailer,
        email,
        jetzt(),
        process.env.API_BASIS_URL ?? 'https://api.mtb-bielefeld.de',
        process.env.TESTFLIGHT_LINK,
      ),
    );
    return antwort;
  });

  app.patch('/verwaltung/mitglieder/:id', async (anfrage, antwort) => {
    const erlaubnis = await holeVerwaltung(anfrage);
    if ('fehler' in erlaubnis) return weiseVerwaltungAb(antwort, erlaubnis.fehler);

    const { id } = anfrage.params as { id: string };
    const koerper = anfrage.body as Record<string, unknown>;

    const rolle =
      koerper?.rolle === 'mitglied' || koerper?.rolle === 'guide' || koerper?.rolle === 'verwaltung'
        ? koerper.rolle
        : undefined;
    const jugend = typeof koerper?.jugend === 'boolean' ? koerper.jugend : undefined;
    const jugendGuide = typeof koerper?.jugendGuide === 'boolean' ? koerper.jugendGuide : undefined;
    if (rolle === undefined && jugend === undefined && jugendGuide === undefined) {
      return antwort.code(400).send({ fehler: 'Nichts zu ändern.' });
    }

    const ergebnis = await verwaltung.aendereMitglied(pool, id, { rolle, jugend, jugendGuide });
    if (!ergebnis.ok) {
      return ergebnis.grund === 'unbekannt'
        ? antwort.code(404).send({ fehler: 'Dieses Mitglied gibt es nicht.' })
        : antwort.code(409).send({
            fehler: 'Das ist die letzte Verwaltungsrolle — erst jemand anderem geben, dann abgeben.',
          });
    }

    return antwort.send(ergebnis);
  });

  app.delete('/verwaltung/einladungen/:email', async (anfrage, antwort) => {
    const erlaubnis = await holeVerwaltung(anfrage);
    if ('fehler' in erlaubnis) return weiseVerwaltungAb(antwort, erlaubnis.fehler);

    const { email } = anfrage.params as { email: string };
    const weg = await verwaltung.zieheEinladungZurueck(pool, decodeURIComponent(email));
    // 404 bei null Treffern: „Da war nichts offen" ist für die Verwaltung
    // eine brauchbare Antwort — vielleicht schon eingelöst, dann steht das
    // Konto in der Liste und wird dort gelöscht.
    if (weg === 0) return antwort.code(404).send({ fehler: 'Keine offene Einladung zu dieser Adresse.' });
    return antwort.code(204).send();
  });

  app.delete('/verwaltung/mitglieder/:id', async (anfrage, antwort) => {
    const erlaubnis = await holeVerwaltung(anfrage);
    if ('fehler' in erlaubnis) return weiseVerwaltungAb(antwort, erlaubnis.fehler);

    const { id } = anfrage.params as { id: string };
    const ergebnis = await verwaltung.loescheMitglied(pool, id);
    if (!ergebnis.ok) {
      return ergebnis.grund === 'unbekannt'
        ? antwort.code(404).send({ fehler: 'Dieses Mitglied gibt es nicht.' })
        : antwort.code(409).send({
            fehler: 'Das ist die letzte Verwaltungsrolle — erst jemand anderem geben, dann löschen.',
          });
    }
    return antwort.code(204).send();
  });

  // --- Familienprofile ------------------------------------------------------

  app.get('/familie', async (anfrage, antwort) => {
    const ausweis = await holeAusweis(anfrage);
    if (!ausweis) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });

    return antwort.send(await familie.holeProfile(pool, ausweis.mitgliedId));
  });

  app.post('/familie', async (anfrage, antwort) => {
    const ausweis = await holeAusweis(anfrage);
    if (!ausweis) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });

    const koerper = anfrage.body as Record<string, unknown>;
    const art = koerper?.art === 'erwachsen' ? 'erwachsen' : 'kind';
    const name = typeof koerper?.name === 'string' ? koerper.name.trim() : '';
    if (name === '') return antwort.code(400).send({ fehler: 'Ein Name wird gebraucht.' });

    const auskunft = await holeKontoAuskunft(pool, ausweis.mitgliedId, jetzt());
    if (!auskunft) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });

    const ergebnis = await familie.legeProfilAn(
      pool,
      mailer,
      { id: ausweis.mitgliedId, email: auskunft.email },
      {
        art,
        name,
        geburtsjahr: liesAnzahl(koerper?.geburtsjahr) ?? null,
        email: typeof koerper?.email === 'string' ? koerper.email.trim() : null,
        kannBilderHochladen:
          typeof koerper?.kannBilderHochladen === 'boolean' ? koerper.kannBilderHochladen : undefined,
      },
      jetzt(),
      process.env.API_BASIS_URL ?? 'https://api.mtb-bielefeld.de',
    );

    if (!ergebnis.ok) {
      const texte: Record<typeof ergebnis.grund, [number, string]> = {
        'zu-viele': [
          409,
          `Mehr als ${familie.HOECHSTENS_PROFILE} Profile gehen über ein Konto nicht.`,
        ],
        'email-fehlt': [400, 'Für Erwachsene wird eine E-Mail-Adresse gebraucht.'],
        'adresse-vergeben': [409, 'Diese E-Mail-Adresse gehört schon zu einem Konto.'],
      };
      const [code, text] = texte[ergebnis.grund];
      return antwort.code(code).send({ fehler: text });
    }

    return antwort.code(201).send({ profil: ergebnis.profil, bestaetigungAn: ergebnis.bestaetigungAn });
  });

  app.patch('/familie/:id', async (anfrage, antwort) => {
    const ausweis = await holeAusweis(anfrage);
    if (!ausweis) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });

    const { id } = anfrage.params as { id: string };
    const koerper = anfrage.body as Record<string, unknown>;

    const geaendert = await familie.aendereProfil(pool, ausweis.mitgliedId, id, {
      name: typeof koerper?.name === 'string' ? koerper.name : undefined,
      geburtsjahr: liesAnzahl(koerper?.geburtsjahr) ?? undefined,
      kannBilderHochladen:
        typeof koerper?.kannBilderHochladen === 'boolean' ? koerper.kannBilderHochladen : undefined,
    });

    // 404 auch für ein fremdes Profil: „gibt es nicht" und „gehört dir
    // nicht" dürfen sich für den Anfragenden nicht unterscheiden.
    if (!geaendert) return antwort.code(404).send({ fehler: 'Dieses Profil gibt es nicht.' });
    return antwort.code(204).send();
  });

  app.delete('/familie/:id', async (anfrage, antwort) => {
    const ausweis = await holeAusweis(anfrage);
    if (!ausweis) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });

    const { id } = anfrage.params as { id: string };
    const weg = await familie.loescheProfil(pool, ausweis.mitgliedId, id);
    if (!weg) return antwort.code(404).send({ fehler: 'Dieses Profil gibt es nicht.' });
    return antwort.code(204).send();
  });

  // --- Profilbilder ---------------------------------------------------------
  //
  // Ein eigener Weg neben den Fotoalben, nicht derselbe: Avatare sind
  // 256×256 klein, gehören keinem Album, und wer keine Bilder hochladen
  // darf, bekommt trotzdem ein Profilbild.

  app.post('/avatar/:id', async (anfrage, antwort) => {
    const ausweis = await holeAusweis(anfrage);
    if (!ausweis) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });

    const { id } = anfrage.params as { id: string };
    if (!(await familie.darfAvatarSetzen(pool, ausweis.mitgliedId, id))) {
      return antwort.code(404).send({ fehler: 'Dieses Profil gibt es nicht.' });
    }

    const datei = await anfrage.file();
    if (!datei) return antwort.code(400).send({ fehler: 'Es kam keine Datei an.' });

    let bild: Buffer;
    try {
      bild = await verarbeiteAvatar(await datei.toBuffer());
    } catch (fehler) {
      if (fehler instanceof BildFehler) return antwort.code(400).send({ fehler: fehler.message });
      throw fehler;
    }

    await bildablage.legeAvatar(id, bild);
    const pfad = await familie.setzeAvatar(pool, id, jetzt());
    return antwort.code(201).send({ avatarUrl: pfad });
  });

  app.delete('/avatar/:id', async (anfrage, antwort) => {
    const ausweis = await holeAusweis(anfrage);
    if (!ausweis) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });

    const { id } = anfrage.params as { id: string };
    if (!(await familie.darfAvatarSetzen(pool, ausweis.mitgliedId, id))) {
      return antwort.code(404).send({ fehler: 'Dieses Profil gibt es nicht.' });
    }

    await familie.entferneAvatar(pool, id);
    await bildablage.loescheAvatar(id);
    // 204, kein Fehler: „Initialen behalten" ist ein gültiger Dauerzustand.
    return antwort.code(204).send();
  });

  app.get('/avatar/:id', async (anfrage, antwort) => {
    // Jedes angemeldete Mitglied darf jedes Profilbild sehen — sie stehen
    // ohnehin neben Namen in Listen, Teilnehmern und Beiträgen. Etwas
    // anderes wäre ein Recht, das die Oberfläche gar nicht abbilden kann.
    const ausweis = await holeAusweis(anfrage);
    if (!ausweis) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });

    const { id } = anfrage.params as { id: string };
    let daten;
    try {
      daten = await bildablage.liesAvatar(id);
    } catch {
      return antwort.code(404).send({ fehler: 'Kein Profilbild.' });
    }

    return antwort
      .header('content-type', 'image/jpeg')
      .header('cache-control', 'private, max-age=86400')
      .send(daten);
  });

  return app;
}
