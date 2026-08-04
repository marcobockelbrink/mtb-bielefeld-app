import { describe, expect, it } from 'vitest';

import { ApiFehler } from '../src/data/api';
import { beschreibeTeilnahmeFehler } from '../src/features/events/teilnahmeFehler';

describe('beschreibeTeilnahmeFehler', () => {
  it('sagt bei einer nicht mehr gültigen Sitzung, dass eine neue Anmeldung nötig ist', () => {
    expect(beschreibeTeilnahmeFehler(new ApiFehler(401, 'Nicht angemeldet.', undefined, true))).toBe(
      'Deine Anmeldung ist nicht mehr gültig. Melde dich unter Einstellungen erneut an.',
    );
  });

  it('sagt bei einer Ratenbegrenzung, dass Warten hilft — nicht weiterprobieren', () => {
    expect(
      beschreibeTeilnahmeFehler(
        new ApiFehler(429, 'Zu viele Anmeldungen für diese Adresse. Versuch es später noch einmal.', undefined, true),
      ),
    ).toBe('Zu viele Versuche hintereinander. Warte eine Minute und probier es dann noch einmal.');
  });

  it('reicht den Grund einer vollen Tour durch, statt ihn zu ersetzen', () => {
    // Wortlaut wie in `api/src/app.ts`, `texte['voll']`.
    expect(beschreibeTeilnahmeFehler(new ApiFehler(409, 'Die Tour ist voll.', undefined, true))).toBe(
      'Die Tour ist voll.',
    );
  });

  it('reicht „schon angemeldet" durch', () => {
    expect(beschreibeTeilnahmeFehler(new ApiFehler(409, 'Du bist schon angemeldet.', undefined, true))).toBe(
      'Du bist schon angemeldet.',
    );
  });

  it('reicht einen nicht mehr existierenden Termin durch (404 beim Anmelden)', () => {
    expect(beschreibeTeilnahmeFehler(new ApiFehler(404, 'Diesen Termin gibt es nicht.', undefined, true))).toBe(
      'Diesen Termin gibt es nicht.',
    );
  });

  it('reicht „nicht angemeldet" durch (404 beim Abmelden)', () => {
    expect(
      beschreibeTeilnahmeFehler(new ApiFehler(404, 'Du bist bei diesem Termin nicht angemeldet.', undefined, true)),
    ).toBe('Du bist bei diesem Termin nicht angemeldet.');
  });

  it('reicht den Verbindungshinweis von api.ts durch (Status 0)', () => {
    expect(
      beschreibeTeilnahmeFehler(new ApiFehler(0, 'Keine Verbindung zum Server. Bitte prüfe deine Verbindung.')),
    ).toBe('Keine Verbindung zum Server. Bitte prüfe deine Verbindung.');
  });

  it('reicht die Meldung „Kalender nicht erreichbar" durch (503)', () => {
    // Die API setzt das hier wirklich in ihrem eigenen Feld `fehler`
    // (`api/src/app.ts:529`) — deshalb `vonDerApi: true` und deshalb wird der
    // Satz durchgereicht, obwohl er ein 5xx ist.
    const text = 'Der Vereinskalender ist gerade nicht erreichbar. Versuch es gleich noch einmal.';
    expect(beschreibeTeilnahmeFehler(new ApiFehler(503, text, undefined, true))).toBe(text);
  });

  it('reicht bei 5xx NICHT durch, was nicht von der API stammt', () => {
    // Ohne eigenen Fehlerbehandler setzt Fastify `message` auf den rohen Text
    // der Ursache. Genau so käme der Zeitablauf aus
    // `api/src/tourenanmeldung.ts` beim Mitglied an.
    expect(
      beschreibeTeilnahmeFehler(
        new ApiFehler(500, 'canceling statement due to statement timeout'),
      ),
    ).toBe('Der Verein ist gerade nicht erreichbar. Versuch es später noch einmal.');
  });

  it('erfindet einen eigenen Hinweis, wenn die Meldung leer ankäme', () => {
    expect(beschreibeTeilnahmeFehler(new ApiFehler(500, '   ', undefined, true))).toBe(
      'Der Verein ist gerade nicht erreichbar. Versuch es später noch einmal.',
    );
  });

  it('fällt bei einem unerwarteten Fehlertyp auf den vorübergehenden Text zurück', () => {
    expect(beschreibeTeilnahmeFehler(new Error('irgendwas'))).toBe(
      'Der Verein ist gerade nicht erreichbar. Versuch es später noch einmal.',
    );
  });
});
