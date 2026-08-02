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

    await fordereMagicLinkAn(
      pool,
      mailer,
      log,
      email,
      einladungscode === undefined || einladungscode.length === 0
        ? undefined
        : einladungscode,
      jetzt(),
    );

    // Immer dieselbe Antwort. Ob die Angaben stimmten, erfährt nur, wer die
    // Mail bekommt — sonst wäre dieser Endpunkt ein Werkzeug, um
    // Mitgliedschaften zu erraten.
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

    const auskunft = await holeKontoAuskunft(pool, ausweis.mitgliedId);
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
