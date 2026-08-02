/**
 * Anmeldung zu einem Termin per E-Mail.
 *
 * Der Verein hat kein Anmeldesystem und soll auch keines betreiben müssen —
 * die App hat schließlich keinen Server. Eine vorbereitete E-Mail ist deshalb
 * der ehrlichste Weg: Sie landet dort, wo die Absprachen ohnehin stattfinden,
 * und funktioniert ohne Konto, ohne Formular und ohne dass irgendwo Daten
 * liegenbleiben.
 *
 * Die App füllt nur aus, was sie sicher weiß — Titel, Tag, Uhrzeit,
 * Treffpunkt. Wer die Mail abschickt, sieht vorher jedes Wort und kann es
 * ändern. Verschickt wird nichts ohne Zutun.
 *
 * Bewusst **nicht** hierüber läuft die Mitgliedsanmeldung: Die verlangt
 * Anschrift und IBAN, und die gehören nicht unverschlüsselt in eine E-Mail.
 * Dafür bleibt der Knopf zum Formular der Website unter "Verein".
 */

import type { ClubEvent } from '../../domain/types';
import { formatDateWithYear, formatLongDate, formatTime } from './format';

/** Betreffzeile — kurz genug für die Vorschau im Postfach. */
export function buildSignupSubject(event: ClubEvent): string {
  return `Anmeldung: ${event.title} am ${formatDateWithYear(event.start)}`;
}

/** Der Text der Mail, so wie er im Entwurf steht. */
export function buildSignupBody(event: ClubEvent): string {
  const wann = event.allDay
    ? formatLongDate(event.start)
    : `${formatLongDate(event.start)} um ${formatTime(event.start)} Uhr`;

  const treffpunkt = event.details.meetingPoint ?? event.location;

  const zeilen = [
    'Hallo,',
    '',
    `ich möchte bei „${event.title}" am ${wann} mitfahren.`,
  ];

  if (treffpunkt) zeilen.push(`Treffpunkt: ${treffpunkt}`);

  zeilen.push('', 'Viele Grüße');

  return zeilen.join('\r\n');
}

/**
 * Die vollständige `mailto:`-Adresse für einen Termin.
 *
 * `\r\n` als Zeilenumbruch, weil das der Zeilenumbruch in E-Mails ist (RFC
 * 5322); mit reinem `\n` setzen manche Mail-Programme den Text in eine Zeile.
 */
export function buildSignupMailto(event: ClubEvent, recipient: string): string {
  const betreff = encodeURIComponent(buildSignupSubject(event));
  const text = encodeURIComponent(buildSignupBody(event));
  return `mailto:${recipient}?subject=${betreff}&body=${text}`;
}

/**
 * Ob die App überhaupt eine Anmeldung anbieten soll.
 *
 * Bei einem abgesagten Termin wäre der Knopf schlicht falsch. Trägt der
 * Termin eine eigene Anmeldeadresse in der Beschreibung, hat die Vorrang —
 * dann führt der Weg dorthin und nicht in die Mail-App.
 */
export function offersMailSignup(event: ClubEvent): boolean {
  return !event.cancelled && !event.details.signupUrl;
}
