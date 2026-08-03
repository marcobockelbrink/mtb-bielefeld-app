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
}

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

  function imHintergrund(arbeit: Promise<unknown>): void {
    laufendeArbeit.add(arbeit);
    void arbeit
      // Nichts darf hier unbemerkt sterben: Ein unbehandelter Fehlschlag
      // wäre genau der stille Fehlschlag, den dieses Projekt ausschließt.
      .catch((fehler) => log.error({ fehler: serialisiereFehler(fehler) }, 'Hintergrundarbeit fehlgeschlagen'))
      .finally(() => laufendeArbeit.delete(arbeit));
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

    imHintergrund(
      fordereMagicLinkAn(
        pool,
        mailer,
        log,
        email,
        einladungscode === undefined || einladungscode.length === 0
          ? undefined
          : einladungscode,
        jetzt(),
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
