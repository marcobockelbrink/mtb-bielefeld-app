/**
 * Startet die API. Alles Fachliche steht in `app.ts`.
 */

import { baueApp } from './app.ts';

const port = Number(process.env.PORT ?? 3000);
const app = baueApp();

try {
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`API hört auf Port ${port}`);
} catch (fehler) {
  console.error('API konnte nicht starten:', fehler);
  process.exit(1);
}
