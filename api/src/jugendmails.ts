/**
 * Die Mailtexte rund um Jugendtrainings — und der Abonnement-Schalter, der
 * bestimmt, wer die Veröffentlichungs-Mail bekommt.
 *
 * Die Textfunktionen sind reine Rechenlogik: kein Zugriff auf `pool`, kein
 * `Mailer` — genau deshalb ohne Datenbank prüfbar. `holeAbonnenten` und
 * `setzeAbonnement` brauchen dagegen die Datenbank; sie stehen trotzdem
 * hier und nicht in `app.ts`, weil sie zu genau demselben Abonnement
 * gehören wie `baueVeroeffentlichung`.
 */

import type pg from 'pg';

import type { Training } from './jugendtraining.ts';

/**
 * Vereinszeit, nicht die Zeitzone des Servers.
 *
 * Der Server läuft in UTC. `08:30 UTC` sind `10:30` in Bielefeld — wer hier
 * mit der Serverzeit formatiert, schickt Guides und Familien zwei Stunden
 * zu früh los. `Intl.DateTimeFormat` mit fester `timeZone` rechnet das
 * unabhängig davon richtig, wo der Prozess tatsächlich läuft.
 */
const VEREINSZEIT = 'Europe/Berlin';

const tagFormat = new Intl.DateTimeFormat('de-DE', {
  timeZone: VEREINSZEIT,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const uhrzeitFormat = new Intl.DateTimeFormat('de-DE', {
  timeZone: VEREINSZEIT,
  hour: '2-digit',
  minute: '2-digit',
});

/** "Sonntag, 9. August, 10:30 Uhr" — immer in Vereinszeit. */
function formatiereTermin(training: Training): string {
  return `${tagFormat.format(training.beginntAm)}, ${uhrzeitFormat.format(training.beginntAm)} Uhr`;
}

export interface Mailtext {
  betreff: string;
  text: string;
}

/** Anfrage an alle Guides, ob sie ein neu angelegtes Training übernehmen. */
export function baueGuideAnfrage(training: Training): Mailtext {
  const zeilen = [
    'Hallo,',
    '',
    `am ${formatiereTermin(training)} ist ein Jugendtraining geplant, Treffpunkt ${training.ort}.`,
    `Gebraucht werden ${training.guidesNoetig} Guides.`,
  ];
  if (training.hinweis) zeilen.push('', training.hinweis);
  zeilen.push('', 'Sag in der App zu oder ab.', '', 'Viele Grüße', 'MTB Bielefeld e.V.');

  return { betreff: 'Jugendtraining: bist du dabei?', text: zeilen.join('\r\n') };
}

/** Mail an die Abonnenten, sobald ein Training veröffentlicht ist und Eltern Kinder anmelden können. */
export function baueVeroeffentlichung(training: Training): Mailtext {
  const platzHinweis = training.plaetze !== null ? ` (${training.plaetze} Plätze)` : '';
  const zeilen = [
    'Hallo,',
    '',
    `am ${formatiereTermin(training)} findet ein Jugendtraining statt, Treffpunkt ${training.ort}${platzHinweis}.`,
  ];
  if (training.hinweis) zeilen.push('', training.hinweis);
  zeilen.push(
    '',
    'Meld dein Kind in der App an — bis zu zwei Kinder je Konto.',
    '',
    'Viele Grüße',
    'MTB Bielefeld e.V.',
  );

  return { betreff: 'Neues Jugendtraining — jetzt anmelden', text: zeilen.join('\r\n') };
}

/**
 * Absage an die Eltern angemeldeter Kinder.
 *
 * Der Grund gehört in jeden Fall in den Text: „abgesagt" ohne Warum lässt
 * Familien rätseln, und wer nicht liest, fährt trotzdem hin.
 */
export function baueAbsage(training: Training): Mailtext {
  // `absagegrund` ist zu diesem Zeitpunkt über die Datenbank-Prüfung
  // `jugendtraining_absage_hat_grund` garantiert gesetzt — der Fallback
  // greift nur, falls diese Funktion je außerhalb dieses Pfads aufgerufen
  // wird, und soll dann trotzdem keinen leeren Satz erzeugen.
  const grund = training.absagegrund ?? 'kein Grund angegeben';
  const text = [
    'Hallo,',
    '',
    `das Jugendtraining am ${formatiereTermin(training)} fällt leider aus.`,
    `Grund: ${grund}.`,
    '',
    'Viele Grüße',
    'MTB Bielefeld e.V.',
  ].join('\r\n');

  return { betreff: 'Jugendtraining abgesagt', text };
}

/** Die Adressen aller Mitglieder, die Jugendtrainings-Mails abonniert haben. */
export async function holeAbonnenten(pool: pg.Pool): Promise<string[]> {
  const { rows } = await pool.query<{ email: string }>(
    'SELECT email FROM mitglied WHERE jugend_benachrichtigung ORDER BY email',
  );
  return rows.map((zeile) => zeile.email);
}

/** Stellt den Abonnement-Schalter eines Mitglieds ein — an oder aus. */
export async function setzeAbonnement(
  pool: pg.Pool,
  mitgliedId: string,
  an: boolean,
): Promise<void> {
  await pool.query('UPDATE mitglied SET jugend_benachrichtigung = $2 WHERE id = $1', [
    mitgliedId,
    an,
  ]);
}
