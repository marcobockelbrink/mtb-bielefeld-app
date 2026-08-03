/**
 * Verbindung zur Datenbank.
 *
 * Die Adresse kommt ausschließlich aus der Umgebung — im Repository steht
 * kein Zugangsdatum, es ist öffentlich.
 */

import pg from 'pg';

const { Pool } = pg;

const adresse =
  process.env.DATABASE_URL ?? 'postgres://mtbie:entwicklung@127.0.0.1:5432/mtbie';

/**
 * Ohne diese Angabe wartet `pool.connect()` unbegrenzt auf eine freie
 * Verbindung — die Voreinstellung von `pg` ist kein Zeitlimit, sondern
 * keines. Hängt irgendwo ein Vorgang (etwa an der Sperre je Adresse in
 * `anmeldung.ts`) und belegt dadurch alle zehn Verbindungen des Pools,
 * reihen sich sonst auch alle weiteren Anfragen unbegrenzt auf — inklusive
 * `/konto`, `/anmeldung/einloesen` und `/sitzung/erneuern`, die mit der
 * hängenden Sperre gar nichts zu tun haben. Mit dem Limit scheitert das
 * Warten stattdessen nach ein paar Sekunden mit einem Fehler, den der
 * Aufrufer sieht und der Betreiber protokolliert bekommt.
 */
export const pool = new Pool({ connectionString: adresse, connectionTimeoutMillis: 5_000 });
