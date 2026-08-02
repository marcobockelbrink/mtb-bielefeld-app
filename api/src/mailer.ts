/**
 * Mailversand hinter einer Schnittstelle.
 *
 * Welcher Anbieter tatsächlich verschickt, ist in der Spec noch offen. Die
 * Schnittstelle hält diese Entscheidung heraus: Tests nutzen den gemerkten
 * Mailer, die Umsetzung des echten Versands kommt in Plan 4.
 *
 * Ein eigener Mailserver kommt nicht in Frage — Zustellbarkeit ist ein
 * Vollzeitproblem.
 */

export interface Mailer {
  sende(an: string, betreff: string, text: string): Promise<void>;
}

export interface GemerkteMail {
  an: string;
  betreff: string;
  text: string;
}

/** Verschickt nichts, merkt sich alles. Für Tests. */
export class GemerkterMailer implements Mailer {
  readonly versendet: GemerkteMail[] = [];

  async sende(an: string, betreff: string, text: string): Promise<void> {
    this.versendet.push({ an, betreff, text });
  }
}

/**
 * Platzhalter für Umgebungen ohne echten Mailversand — scheitert laut statt
 * still zu schlucken.
 *
 * Ein Mailer, der einfach nichts tut, wäre gefährlicher als gar keiner: Der
 * Anmeldeendpunkt antwortet immer mit 202, egal ob eine Mail unterwegs ist —
 * genau deshalb darf ein fehlender Versand nicht unbemerkt bleiben. Mit
 * diesem Platzhalter endet ein Anmeldeversuch sichtbar mit einem
 * Serverfehler, statt einen Erfolg vorzutäuschen, den es nicht gibt.
 */
export class NichtEingerichteterMailer implements Mailer {
  async sende(_an: string, _betreff: string, _text: string): Promise<void> {
    throw new Error(
      'Mailversand ist noch nicht eingerichtet — welcher Anbieter ' +
        'verschickt, klärt Plan 4. Bis dahin kann keine Mail raus.',
    );
  }
}
