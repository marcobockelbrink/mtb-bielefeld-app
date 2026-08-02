/**
 * Startet die API. Alles Fachliche steht in `app.ts`.
 */

import { baueApp } from './app.ts';
import { pool } from './datenbank.ts';
// Der echte Mailversand ist noch offen (siehe `mailer.ts`, Plan 4). Bis
// dahin scheitert ein Anmeldeversuch laut statt eine Mail vorzutäuschen,
// die nie ankommt.
import { NichtEingerichteterMailer } from './mailer.ts';

const port = Number(process.env.PORT ?? 3000);
const app = baueApp({ pool, mailer: new NichtEingerichteterMailer() });

try {
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`API hört auf Port ${port}`);
} catch (fehler) {
  console.error('API konnte nicht starten:', fehler);
  process.exit(1);
}
