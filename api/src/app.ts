/**
 * Die Fastify-Instanz ohne Netzwerk.
 *
 * Abhängigkeiten kommen von außen herein, damit Tests eine echte Datenbank
 * und einen gemerkten Mailer einsetzen können.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import type pg from 'pg';

import { fordereMagicLinkAn } from './anmeldung.ts';
import { holeKontoAuskunft, loescheKonto } from './konto.ts';
import type { Mailer } from './mailer.ts';
import { serialisiereFehler, type Protokoll } from './protokoll.ts';
import { beendeSitzung, erneuereSitzung, loeseMagicLinkEin, pruefeZugang, type Ausweis } from './sitzung.ts';

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

declare module 'fastify' {
  interface FastifyInstance {
    /** Wartet, bis alle nach der Antwort gestarteten Vorgänge fertig sind. Für Tests. */
    warteAufHintergrundarbeit(): Promise<void>;
  }
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
 */
const protokollEinstellung =
  process.env.NODE_ENV === 'test'
    ? false
    : { serializers: { fehler: serialisiereFehler } };

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
}: Abhaengigkeiten): FastifyInstance {
  const app = Fastify({ logger: protokollEinstellung });
  const log = protokoll ?? app.log;

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

  return app;
}
