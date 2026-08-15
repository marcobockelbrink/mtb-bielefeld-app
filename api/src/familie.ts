/**
 * Familienprofile — ein Mitglied legt Profile für seine Kinder selbst an.
 *
 * Der Grund steht in der Migration: Kinder haben oft keine eigene
 * Mailadresse, und die Verwaltung soll nicht jedes Kind einzeln einladen
 * müssen.
 *
 * ## Zwei Arten, ein Feld
 *
 * - **Kind** → `verwaltet_von` wird gesetzt. Das Profil gehört zur Familie,
 *   die verwaltende Person ändert Name, Geburtsjahr und Rechte.
 * - **Erwachsener** → **kein** `verwaltet_von`. Es entsteht ein
 *   eigenständiges Konto, das niemandem untersteht; die Mailadresse ist
 *   deshalb Pflicht — ohne sie käme niemand je hinein.
 *
 * ## Was die verwaltende Person **nicht** darf
 *
 * Rollen vergeben. Sonst verschaffte sich jeder über ein selbst angelegtes
 * Kind Guide- oder Verwaltungsrechte. Rollen bleiben bei der
 * Vereinsverwaltung, hier gibt es nur Name, Geburtsjahr und das
 * Upload-Recht.
 */

import type pg from 'pg';

import { erzeugeEinladung } from './einladung.ts';
import { istKennung } from './fotoalbum.ts';
import type { Mailer } from './mailer.ts';

/**
 * Mehr als das legt niemand für eine Familie an.
 *
 * Die Grenze ist kein Misstrauen gegen Mitglieder, sondern gegen ein
 * gekapertes Konto: Ohne sie ließen sich mit einem Zugang beliebig viele
 * Konten erzeugen, und jedes davon bekäme Mail vom Vereinsserver.
 */
export const HOECHSTENS_PROFILE = 6;

export type ProfilStatus = 'aktiv' | 'einladung_offen';

export interface Profil {
  id: string;
  name: string | null;
  email: string | null;
  geburtsjahr: number | null;
  kannBilderHochladen: boolean;
  avatarUrl: string | null;
  status: ProfilStatus;
}

interface Zeile {
  id: string;
  name: string | null;
  email: string;
  geburtsjahr: number | null;
  kann_bilder_hochladen: boolean;
  avatar_url: string | null;
  gesehen_am: Date | null;
}

/**
 * `gesehen_am IS NULL` heißt: noch nie angemeldet, die Bestätigung liegt
 * also noch im Postfach. Das ist dieselbe Unterscheidung wie in der
 * Mitgliederliste der Verwaltung — nur aus Sicht der Familie.
 */
export async function holeProfile(db: pg.Pool, verwalterId: string): Promise<Profil[]> {
  const { rows } = await db.query<Zeile>(
    `SELECT id, name, email, geburtsjahr, kann_bilder_hochladen, avatar_url, gesehen_am
       FROM mitglied WHERE verwaltet_von = $1 ORDER BY name NULLS LAST, email`,
    [verwalterId],
  );

  return rows.map((z) => ({
    id: z.id,
    name: z.name,
    email: z.email,
    geburtsjahr: z.geburtsjahr,
    kannBilderHochladen: z.kann_bilder_hochladen,
    avatarUrl: z.avatar_url,
    status: z.gesehen_am ? 'aktiv' : 'einladung_offen',
  }));
}

export interface ProfilEingabe {
  art: 'kind' | 'erwachsen';
  name: string;
  geburtsjahr?: number | null;
  email?: string | null;
  kannBilderHochladen?: boolean;
}

export type Anlegeergebnis =
  | { ok: true; profil: Profil; bestaetigungAn: string }
  | { ok: false; grund: 'zu-viele' | 'email-fehlt' | 'adresse-vergeben' };

/**
 * Legt ein Profil an und verschickt die Bestätigung.
 *
 * **Der Empfänger ist der springende Punkt:** Hat das Kind eine eigene
 * Adresse, geht die Mail dorthin. Sonst an die verwaltende Person, die die
 * Zugangsdaten weiterreicht — eine Bestätigungsmail an ein leeres Postfach
 * liefe ins Leere, und genau daran scheitert der naheliegende Weg „einfach
 * eine Mail ans Kind".
 *
 * Ohne eigene Adresse bekommt das Profil eine abgeleitete
 * (`name+kennung@…`): Die Anmeldung hängt in dieser App an einer Adresse,
 * und zwei Profile dürfen sich keine teilen — sonst landete der Anmeldelink
 * des Kindes im Konto des Elternteils.
 */
export async function legeProfilAn(
  db: pg.Pool,
  mailer: Mailer,
  verwalter: { id: string; email: string },
  eingabe: ProfilEingabe,
  jetzt: Date,
  apiBasisUrl: string,
): Promise<Anlegeergebnis> {
  if (eingabe.art === 'erwachsen' && !eingabe.email) {
    return { ok: false, grund: 'email-fehlt' };
  }

  const { rowCount } = await db.query('SELECT 1 FROM mitglied WHERE verwaltet_von = $1', [
    verwalter.id,
  ]);
  if ((rowCount ?? 0) >= HOECHSTENS_PROFILE) return { ok: false, grund: 'zu-viele' };

  const eigeneAdresse = eingabe.email?.trim() || null;
  const adresse =
    eigeneAdresse ??
    `${eingabe.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${Math.random().toString(36).slice(2, 8)}@familie.mtb-bielefeld.de`;

  let profilId: string;
  try {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO mitglied (email, name, geburtsjahr, verwaltet_von, kann_bilder_hochladen, angelegt_am)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        adresse,
        eingabe.name.trim(),
        eingabe.art === 'kind' ? (eingabe.geburtsjahr ?? null) : null,
        // Erwachsene entstehen als eigenständiges Konto — niemand verwaltet
        // sie, auch nicht der, der sie angelegt hat.
        eingabe.art === 'kind' ? verwalter.id : null,
        eingabe.kannBilderHochladen ?? eingabe.art !== 'kind',
        jetzt,
      ],
    );
    profilId = rows[0]!.id;
  } catch (fehler) {
    // 23505 = eindeutiger Index auf lower(email). Die Adresse gibt es schon.
    if ((fehler as { code?: string }).code === '23505') {
      return { ok: false, grund: 'adresse-vergeben' };
    }
    throw fehler;
  }

  const bestaetigungAn = eigeneAdresse ?? verwalter.email;
  const code = await erzeugeEinladung(db, adresse, jetzt);
  const link = `${apiBasisUrl}/e/${code}`;

  await mailer.sende(
    bestaetigungAn,
    `Profil für ${eingabe.name.trim()} bestätigen`,
    [
      'Hallo!',
      '',
      eigeneAdresse
        ? `Für dich wurde ein Profil in der App des MTB Bielefeld e.V. angelegt.`
        : `Du hast ein Profil für ${eingabe.name.trim()} in der App des MTB Bielefeld e.V. angelegt.`,
      '',
      'Diesen Link auf dem Handy antippen — das bestätigt das Profil und meldet an:',
      '',
      `    ${link}`,
      '',
      ...(eigeneAdresse
        ? []
        : ['Danach gibst du die Zugangsdaten weiter — das Profil erscheint dann in der App.', '']),
      'Dein MTB Bielefeld e.V.',
    ].join('\n'),
  );

  const profile = await holeProfile(db, verwalter.id);
  const profil = profile.find((p) => p.id === profilId) ?? {
    id: profilId,
    name: eingabe.name.trim(),
    email: adresse,
    geburtsjahr: eingabe.geburtsjahr ?? null,
    kannBilderHochladen: eingabe.kannBilderHochladen ?? eingabe.art !== 'kind',
    avatarUrl: null,
    status: 'einladung_offen' as const,
  };

  return { ok: true, profil, bestaetigungAn };
}

/** Ändern darf nur, wer das Profil auch verwaltet — geprüft in der Abfrage. */
export async function aendereProfil(
  db: pg.Pool,
  verwalterId: string,
  profilId: string,
  aenderung: { name?: string; geburtsjahr?: number | null; kannBilderHochladen?: boolean },
): Promise<boolean> {
  if (!istKennung(profilId)) return false;

  const { rowCount } = await db.query(
    `UPDATE mitglied SET
       name = COALESCE($3::text, name),
       geburtsjahr = COALESCE($4::integer, geburtsjahr),
       kann_bilder_hochladen = COALESCE($5::boolean, kann_bilder_hochladen)
     WHERE id = $2 AND verwaltet_von = $1`,
    [
      verwalterId,
      profilId,
      aenderung.name?.trim() ?? null,
      aenderung.geburtsjahr ?? null,
      aenderung.kannBilderHochladen ?? null,
    ],
  );

  return (rowCount ?? 0) > 0;
}

export async function loescheProfil(
  db: pg.Pool,
  verwalterId: string,
  profilId: string,
): Promise<boolean> {
  if (!istKennung(profilId)) return false;

  const { rowCount } = await db.query(
    'DELETE FROM mitglied WHERE id = $1 AND verwaltet_von = $2',
    [profilId, verwalterId],
  );

  return (rowCount ?? 0) > 0;
}

/**
 * Darf dieses Profil Bilder hochladen?
 *
 * **Serverseitig geprüft, nicht nur in der App.** Ein Kinderprofil, bei dem
 * der Knopf nur versteckt ist, lädt trotzdem hoch, sobald jemand den
 * Endpunkt direkt aufruft.
 */
export async function darfBilderHochladen(db: pg.Pool, mitgliedId: string): Promise<boolean> {
  const { rows } = await db.query<{ kann_bilder_hochladen: boolean }>(
    'SELECT kann_bilder_hochladen FROM mitglied WHERE id = $1',
    [mitgliedId],
  );

  return rows[0]?.kann_bilder_hochladen ?? false;
}
