/**
 * Eine migrierte, leere Datenbank für jeden Test.
 *
 * Bewusst gegen ein echtes Postgres statt gegen eine Attrappe: Eindeutige
 * Indizes, Prüfbedingungen und Transaktionen sind genau die Dinge, an denen
 * dieser Code hängt — eine Attrappe würde sie alle wegtäuschen.
 */

import type net from 'node:net';
import type pg from 'pg';

import { pool } from '../../src/datenbank.ts';
import { wendeMigrationenAn } from '../../src/migrationen/laufen.ts';

const ERLAUBTE_ADRESSEN = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * Bricht ab, statt zu löschen, wenn die Verbindung nicht zweifelsfrei auf
 * die lokale Entwicklungsdatenbank zeigt.
 *
 * Diese Testhilfe und der Testaufbau der Migrationen räumen mit TRUNCATE
 * bzw. DROP SCHEMA ganze Tabellen leer. Wohin das trifft, entscheidet
 * allein `DATABASE_URL` — steht die versehentlich auf etwas anderes (eine
 * Shell, die sie noch von einem anderen Vorhaben gesetzt hat; eine CI, die
 * sie falsch durchreicht), würde ohne diese Prüfung eine produktive
 * Datenbank gelöscht statt der lokalen Testdatenbank.
 *
 * Geprüft wird, was die Verbindung selbst über sich sagt, nicht der Text
 * der Umgebungsvariablen: Der Datenbankname kommt aus einer echten Abfrage
 * an Postgres, und die Server-Adresse ist die tatsächlich aufgelöste
 * Gegenstelle des TCP-Sockets — verschiedene Schreibweisen wie „localhost“
 * oder „127.0.0.1“ landen nach der Namensauflösung auf demselben Wert und
 * können die Prüfung so nicht umgehen. (`inet_server_addr()`, von
 * Postgres selbst berichtet, wäre hier kein verlässliches Signal: Hinter
 * dem Docker-Portmapping meldet der Server seine eigene, containerinterne
 * Adresse — nicht 127.0.0.1.)
 */
export async function sichereEntwicklungsdatenbank(pool: pg.Pool): Promise<void> {
  const verbindung = await pool.connect();
  try {
    const socket = verbindung.connection.stream as unknown as net.Socket;
    const adresse = socket.remoteAddress;

    const { rows } = await verbindung.query<{ datenbank: string }>(
      'SELECT current_database() AS datenbank',
    );
    const datenbank = rows[0]?.datenbank;

    const istLokaleEntwicklungsdatenbank =
      datenbank === 'mtbie' && adresse !== undefined && ERLAUBTE_ADRESSEN.has(adresse);

    if (!istLokaleEntwicklungsdatenbank) {
      throw new Error(
        `Sicherheitsabbruch: erwartet war die lokale Entwicklungsdatenbank ` +
          `„mtbie“ auf 127.0.0.1, verbunden ist aber Datenbank ` +
          `„${datenbank ?? 'unbekannt'}“ auf „${adresse ?? 'unbekannt'}“. ` +
          `DATABASE_URL prüfen — es wird nichts gelöscht.`,
      );
    }
  } finally {
    verbindung.release();
  }
}

export async function frischeDatenbank(): Promise<pg.Pool> {
  await sichereEntwicklungsdatenbank(pool);
  await wendeMigrationenAn(pool);
  await pool.query('TRUNCATE einladung, mitglied RESTART IDENTITY CASCADE');
  return pool;
}
