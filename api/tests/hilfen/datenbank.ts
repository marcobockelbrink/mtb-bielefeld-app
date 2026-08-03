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
 * Ausschlaggebend ist das Kennzeichen `wegwerf.markierung`
 * (`db-init/001-wegwerf-markierung.sql`), nicht die Netzwerkadresse: Ein
 * `remoteAddress` von 127.0.0.1 beweist nur, wo der lokale Socket endet —
 * bei einer SSH-Portweiterleitung oder einem Tunnel zu einem entfernten
 * Server (`ssh -L 5432:produktivserver:5432`) terminiert die Verbindung
 * ebenfalls auf 127.0.0.1, während die Pakete tatsächlich zu einer
 * entfernten, unter Umständen produktiven Datenbank laufen. Heißt die dort
 * zufällig auch „mtbie“, würde eine reine Adress-/Namensprüfung das
 * Löschen fälschlich zulassen. Nur die Datenbank selbst kann verlässlich
 * beantworten, ob sie zum Wegwerfen da ist — deshalb das Kennzeichen als
 * härteste Hürde. Datenbankname und Socket-Adresse bleiben als zusätzliche,
 * aber nachrangige Prüfung erhalten.
 */
export async function sichereEntwicklungsdatenbank(pool: pg.Pool): Promise<void> {
  const verbindung = await pool.connect();
  try {
    const socket = verbindung.connection.stream as unknown as net.Socket;
    const adresse = socket.remoteAddress;

    const { rows } = await verbindung.query<{
      datenbank: string;
      kennzeichen: string | null;
    }>(
      "SELECT current_database() AS datenbank, to_regclass('wegwerf.markierung') AS kennzeichen",
    );
    const datenbank = rows[0]?.datenbank;
    const traegtKennzeichen = rows[0]?.kennzeichen != null;

    if (!traegtKennzeichen) {
      throw new Error(
        `Sicherheitsabbruch: Die Tabelle "wegwerf.markierung" fehlt in der ` +
          `Datenbank „${datenbank ?? 'unbekannt'}“ auf „${adresse ?? 'unbekannt'}“. ` +
          `Ohne dieses Kennzeichen gilt eine Verbindung nicht als lokale ` +
          `Wegwerf-Datenbank der Entwicklung — unabhängig davon, wie ` +
          `Datenbankname oder Adresse aussehen —, deshalb wird nichts ` +
          `gelöscht. Das Kennzeichen entsteht nur beim allerersten Start ` +
          `eines frischen Docker-Volumes; ein bereits bestehendes Volume ` +
          `führt das Initialisierungsskript nicht erneut aus. Abhilfe: in ` +
          `api/ "docker compose down -v && docker compose up -d" ausführen.`,
      );
    }

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
  await pool.query(
    'TRUNCATE tourenanmeldung, sitzung, magic_link, einladung, mitglied RESTART IDENTITY CASCADE',
  );
  return pool;
}
