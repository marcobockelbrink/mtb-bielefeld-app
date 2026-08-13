/**
 * Mitgliederverwaltung — Liste, Rollen, Jugend-Zuteilung, Einladungen.
 *
 * Bisher ging das nur per CLI über SSH, also nur durch einen Menschen von
 * einem Rechner. Diese Funktionen tragen dieselben Vorgänge in die App,
 * hinter die Rolle `verwaltung`; die CLI-Werkzeuge bleiben als Rückweg.
 *
 * Rechenlogik und Datenbank wie überall getrennt von Fastify — die
 * Endpunkte in `app.ts` reichen nur durch.
 */

import type pg from 'pg';

import { erzeugeEinladung } from './einladung.ts';
import { istKennung } from './fotoalbum.ts';
import type { Mailer } from './mailer.ts';
import type { Rolle } from './rolle.ts';

export interface MitgliedZeile {
  /** `null`: eingeladen, aber noch nie angemeldet — es gibt kein Konto. */
  id: string | null;
  email: string;
  rolle: Rolle;
  jugend: boolean;
  angelegtAm: Date | null;
  gesehenAm: Date | null;
  /** Zur Adresse liegt eine uneingelöste, nicht abgelaufene Einladung. */
  offeneEinladung: boolean;
}

/**
 * Alle Konten — plus die Eingeladenen, die sich noch nie angemeldet haben.
 *
 * Eine Einladung erzeugt kein Konto; das entsteht erst beim ersten
 * Anmelden. Die Verwaltung muss aber beide Sorten sehen, sonst lautet die
 * Antwort auf „hab ich Anna schon eingeladen?" jedes Mal: nachschauen im
 * Terminal. Solche Zeilen tragen `id: null` — an ihnen gibt es nichts zu
 * ändern, nur zu warten oder neu einzuladen.
 *
 * Zwei einfache Abfragen statt eines FULL OUTER JOIN: Der wäre kürzer,
 * aber bei mehreren Einladungen je Adresse sofort wieder eine Gruppierung
 * mit Sonderfällen. Die Liste ist kurz (ein Verein), Lesbarkeit gewinnt.
 */
export async function holeMitglieder(db: pg.Pool, jetzt: Date): Promise<MitgliedZeile[]> {
  const konten = await db.query<{
    id: string;
    email: string;
    rolle: Rolle;
    jugend: boolean;
    angelegt_am: Date;
    gesehen_am: Date | null;
  }>('SELECT id, email, rolle, jugend, angelegt_am, gesehen_am FROM mitglied');

  const offene = await db.query<{ ausgestellt_fuer: string }>(
    'SELECT DISTINCT ausgestellt_fuer FROM einladung WHERE eingeloest_am IS NULL AND gueltig_bis > $1',
    [jetzt],
  );
  const offeneAdressen = new Set(offene.rows.map((z) => z.ausgestellt_fuer.toLowerCase()));
  const kontenAdressen = new Set(konten.rows.map((z) => z.email.toLowerCase()));

  const liste: MitgliedZeile[] = konten.rows.map((z) => ({
    id: z.id,
    email: z.email,
    rolle: z.rolle,
    jugend: z.jugend,
    angelegtAm: z.angelegt_am,
    gesehenAm: z.gesehen_am,
    offeneEinladung: offeneAdressen.has(z.email.toLowerCase()),
  }));

  for (const zeile of offene.rows) {
    if (kontenAdressen.has(zeile.ausgestellt_fuer.toLowerCase())) continue;
    liste.push({
      id: null,
      email: zeile.ausgestellt_fuer,
      rolle: 'mitglied',
      jugend: false,
      angelegtAm: null,
      gesehenAm: null,
      offeneEinladung: true,
    });
  }

  return liste.sort((a, b) => a.email.localeCompare(b.email));
}

export type Aenderung =
  | { ok: true; rolle: Rolle; jugend: boolean }
  | { ok: false; grund: 'unbekannt' | 'letzte-verwaltung' };

/**
 * Setzt Rolle und/oder Jugend-Zugehörigkeit.
 *
 * **Die letzte Verwaltungsrolle ist unentziehbar** — sonst sperrt sich der
 * Verein mit einem Fingertipp selbst aus, und der Rückweg wäre wieder das
 * CLI über SSH. Das bedingte UPDATE prüft die Zahl der übrigen
 * Verwaltungen in derselben Anweisung; zwei gleichzeitige Herabstufungen
 * können sich so nicht gegenseitig durchlassen.
 */
export async function aendereMitglied(
  db: pg.Pool,
  id: string,
  aenderung: { rolle?: Rolle; jugend?: boolean },
): Promise<Aenderung> {
  if (!istKennung(id)) return { ok: false, grund: 'unbekannt' };

  const { rows } = await db.query<{ rolle: Rolle; jugend: boolean }>(
    // Die ::-Casts sind Pflicht, nicht Zier: Ein Platzhalter, der sowohl in
    // COALESCE als auch in einem Vergleich steht, lässt Postgres den Typ
    // nicht ableiten — die Anfrage scheitert dann als 500 zur Laufzeit,
    // während jeder Test mit nur einem der beiden Felder grün bliebe.
    `UPDATE mitglied SET
       rolle  = COALESCE($2::text, rolle),
       jugend = COALESCE($3::boolean, jugend)
     WHERE id = $1
       AND NOT (
         rolle = 'verwaltung' AND $2::text IS NOT NULL AND $2::text <> 'verwaltung'
         AND NOT EXISTS (
           SELECT 1 FROM mitglied a WHERE a.rolle = 'verwaltung' AND a.id <> $1
         )
       )
     RETURNING rolle, jugend`,
    [id, aenderung.rolle ?? null, aenderung.jugend ?? null],
  );

  if (rows[0]) return { ok: true, ...rows[0] };

  const { rowCount } = await db.query('SELECT 1 FROM mitglied WHERE id = $1', [id]);
  return { ok: false, grund: (rowCount ?? 0) > 0 ? 'letzte-verwaltung' : 'unbekannt' };
}

/**
 * Legt eine Einladung an und verschickt sie selbst — seit SMTP steht,
 * entfällt damit das Weiterreichen von Codes von Hand.
 *
 * Der Code steht nur in dieser Mail; in der Datenbank liegt sein Hash.
 * `testflightLink` kommt aus der Umgebung und macht aus der Mail die ganze
 * Einladung: App holen, Adresse plus Code, fertig.
 */
export async function ladeEin(
  db: pg.Pool,
  mailer: Mailer,
  email: string,
  jetzt: Date,
  testflightLink?: string,
): Promise<void> {
  const code = await erzeugeEinladung(db, email, jetzt);

  const zeilen = [
    'Hallo!',
    '',
    'Du bist eingeladen, die App des MTB Bielefeld e.V. zu benutzen.',
    '',
    ...(testflightLink
      ? [`1. App installieren: ${testflightLink}`, '']
      : []),
    `${testflightLink ? '2.' : '1.'} In der App unter Einstellungen anmelden — mit dieser`,
    `E-Mail-Adresse (${email}) und dem folgenden Einladungscode:`,
    '',
    `    ${code}`,
    '',
    `${testflightLink ? '3.' : '2.'} Den Anmeldelink aus der Mail antippen, die dann kommt.`,
    '',
    'Der Code gilt nur für diese Adresse und nur für die erste Anmeldung —',
    'danach genügt die Adresse allein.',
    '',
    'Dein MTB Bielefeld e.V.',
  ];

  await mailer.sende(email, 'Deine Einladung zur Vereins-App', zeilen.join('\n'));
}
