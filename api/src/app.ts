/**
 * Die Fastify-Instanz ohne Netzwerk.
 *
 * Getrennt von `server.ts`, damit Tests die App mit `inject()` ansprechen
 * können, ohne einen Port zu belegen. Dasselbe Muster wie in der App:
 * Logik getrennt von der Anbindung ans Betriebssystem.
 */

import Fastify, { type FastifyInstance } from 'fastify';

export function baueApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/gesundheit', async () => ({ zustand: 'bereit' }));

  return app;
}
