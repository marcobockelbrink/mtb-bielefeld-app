/**
 * Die Fastify-Instanz ohne Netzwerk.
 *
 * Abhängigkeiten kommen von außen herein, damit Tests eine echte Datenbank
 * und einen gemerkten Mailer einsetzen können.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import type pg from 'pg';

import { fordereMagicLinkAn } from './anmeldung.ts';
import type { Mailer } from './mailer.ts';

export interface Abhaengigkeiten {
  pool: pg.Pool;
  mailer: Mailer;
  jetzt?: () => Date;
}

interface AnfordernKoerper {
  email?: unknown;
  einladungscode?: unknown;
}

export function baueApp({ pool, mailer, jetzt = () => new Date() }: Abhaengigkeiten): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/gesundheit', async () => ({ zustand: 'bereit' }));

  app.post('/anmeldung/anfordern', async (anfrage, antwort) => {
    const { email, einladungscode } = (anfrage.body ?? {}) as AnfordernKoerper;

    if (typeof email !== 'string' || !email.includes('@')) {
      return antwort.code(400).send({ fehler: 'E-Mail-Adresse fehlt oder ist ungültig.' });
    }
    if (typeof einladungscode !== 'string' || einladungscode.length === 0) {
      return antwort.code(400).send({ fehler: 'Einladungscode fehlt.' });
    }

    await fordereMagicLinkAn(pool, mailer, email, einladungscode, jetzt());

    // Immer dieselbe Antwort. Ob die Angaben stimmten, erfährt nur, wer die
    // Mail bekommt — sonst wäre dieser Endpunkt ein Werkzeug, um
    // Mitgliedschaften zu erraten.
    return antwort.code(202).send({
      hinweis: 'Wenn die Angaben stimmen, ist eine Mail unterwegs.',
    });
  });

  return app;
}
