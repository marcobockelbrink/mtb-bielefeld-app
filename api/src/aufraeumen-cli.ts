/**
 * Aufräumen von der Kommandozeile — für cron oder von Hand.
 *
 * Der Zeitgeber in `server.ts` erledigt es im Normalbetrieb. Dieses
 * Werkzeug gibt es für den Fall, dass die API nicht läuft oder jemand
 * nachsehen will, wie viel sich angesammelt hat.
 */

import { raeumeAuf } from './aufraeumen.ts';
import { pool } from './datenbank.ts';

const bilanz = await raeumeAuf(pool, new Date());
console.log(
  `Weggeräumt: ${bilanz.sitzungen} Sitzung(en), ${bilanz.magicLinks} Magic Link(s), ` +
    `${bilanz.tourenanmeldungen} Tourenanmeldung(en), ${bilanz.kinder} Kind(er).`,
);
await pool.end();
