import { describe, expect, it } from 'vitest';

import { baueAenderung, findeAenderungen } from '../src/jugendmails.ts';
import type { Training } from '../src/jugendtraining.ts';

// Keine Datenbank: Was sich geändert hat und wie es in der Mail steht, ist
// Rechenlogik — und die soll ohne Postgres prüfbar bleiben.

function training(teil: Partial<Training> = {}): Training {
  return {
    id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
    beginntAm: new Date('2026-08-22T08:00:00Z'),
    endetAm: null,
    ort: 'Kalkofen',
    hinweis: null,
    plaetze: 12,
    guidesNoetig: 2,
    zustand: 'veroeffentlicht',
    absagegrund: null,
    ...teil,
  } as Training;
}

describe('findeAenderungen', () => {
  it('meldet nichts, wenn nichts anders ist', () => {
    // Eine Mail über null Änderungen ist eine Mail zu viel — die Guides
    // ließen das Häkchen sonst bald grundsätzlich weg.
    expect(findeAenderungen(training(), training())).toEqual([]);
  });

  it('nennt eine verschobene Zeit mit altem und neuem Wert', () => {
    const aenderungen = findeAenderungen(
      training(),
      training({ beginntAm: new Date('2026-08-22T09:30:00Z') }),
    );
    expect(aenderungen).toHaveLength(1);
    expect(aenderungen[0]!.feld).toBe('Wann');
    expect(aenderungen[0]!.vorher).not.toBe(aenderungen[0]!.nachher);
  });

  it('nennt einen geänderten Treffpunkt', () => {
    const [a] = findeAenderungen(training(), training({ ort: 'Johannisberg' }));
    expect(a).toEqual({ feld: 'Treffpunkt', vorher: 'Kalkofen', nachher: 'Johannisberg' });
  });

  it('schreibt für einen fehlenden Hinweis „kein Hinweis" statt null', () => {
    // „Hinweis: null → Helm mitbringen" wäre in einer Elternmail Unsinn.
    const [a] = findeAenderungen(training(), training({ hinweis: 'Helm mitbringen' }));
    expect(a).toEqual({ feld: 'Hinweis', vorher: 'kein Hinweis', nachher: 'Helm mitbringen' });
  });

  it('schreibt für fehlende Plätze „unbegrenzt"', () => {
    const [a] = findeAenderungen(training({ plaetze: null }), training({ plaetze: 8 }));
    expect(a).toEqual({ feld: 'Plätze', vorher: 'unbegrenzt', nachher: '8' });
  });

  it('übergeht die benötigten Guides', () => {
    // Eine Angabe der Guides untereinander — für Eltern ohne Bedeutung,
    // und in ihrer Mail nur Rauschen.
    expect(findeAenderungen(training(), training({ guidesNoetig: 4 }))).toEqual([]);
  });

  it('übergeht Zustand und Absagegrund', () => {
    // Die laufen über eigene Wege und eigene Mails.
    expect(
      findeAenderungen(training(), training({ zustand: 'abgesagt', absagegrund: 'Gewitter' })),
    ).toEqual([]);
  });

  it('zählt mehrere Änderungen einzeln auf', () => {
    const aenderungen = findeAenderungen(
      training(),
      training({ ort: 'Johannisberg', plaetze: 8, hinweis: 'Helm' }),
    );
    expect(aenderungen.map((a) => a.feld)).toEqual(['Treffpunkt', 'Hinweis', 'Plätze']);
  });
});

describe('baueAenderung', () => {
  const aenderungen = findeAenderungen(training(), training({ ort: 'Johannisberg' }));

  it('nennt den Termin im Betreff', () => {
    expect(baueAenderung(training({ ort: 'Johannisberg' }), aenderungen).betreff).toContain('Änderung');
  });

  it('führt alt → neu im Text auf', () => {
    const { text } = baueAenderung(training({ ort: 'Johannisberg' }), aenderungen);
    expect(text).toContain('Treffpunkt: Kalkofen → Johannisberg');
  });

  it('fordert **nicht** zum Neuanmelden auf', () => {
    // Der Platz bleibt bestehen. Eine Mail, die zum Handeln auffordert, wo
    // nichts zu tun ist, kostet acht Familien einen Gedanken und den Guide
    // die Rückfragen.
    const { text } = baueAenderung(training({ ort: 'Johannisberg' }), aenderungen);
    expect(text).toContain('Der Platz bleibt bestehen');
    expect(text).not.toMatch(/neu anmelden|erneut anmelden/i);
  });

  it('nutzt Zeilenumbrüche nach RFC 5322', () => {
    // `\n` allein setzt manche Mailprogramme in eine Zeile — dieselbe
    // Begründung wie bei den übrigen Mails des Projekts.
    expect(baueAenderung(training(), aenderungen).text).toContain('\r\n');
  });
});
