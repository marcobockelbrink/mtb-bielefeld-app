import { describe, expect, it } from 'vitest';

import { ApiFehler } from '../src/data/api';
import { beschreibeTeilnahmeFehler } from '../src/features/events/teilnahmeFehler';

describe('beschreibeTeilnahmeFehler', () => {
  it('sagt bei einer nicht mehr gültigen Sitzung, dass eine neue Anmeldung nötig ist', () => {
    expect(beschreibeTeilnahmeFehler(new ApiFehler(401, 'Nicht angemeldet.'))).toBe(
      'Deine Anmeldung ist nicht mehr gültig. Melde dich unter Einstellungen erneut an.',
    );
  });

  it('sagt bei einer Ratenbegrenzung, dass Warten hilft — nicht weiterprobieren', () => {
    expect(
      beschreibeTeilnahmeFehler(
        new ApiFehler(429, 'Zu viele Anmeldungen für diese Adresse. Versuch es später noch einmal.'),
      ),
    ).toBe('Zu viele Versuche hintereinander. Warte eine Minute und probier es dann noch einmal.');
  });

  it('reicht den Grund einer vollen Tour durch, statt ihn zu ersetzen', () => {
    // Wortlaut wie in `api/src/app.ts`, `texte['voll']`.
    expect(beschreibeTeilnahmeFehler(new ApiFehler(409, 'Die Tour ist voll.'))).toBe(
      'Die Tour ist voll.',
    );
  });

  it('reicht „schon angemeldet" durch', () => {
    expect(beschreibeTeilnahmeFehler(new ApiFehler(409, 'Du bist schon angemeldet.'))).toBe(
      'Du bist schon angemeldet.',
    );
  });

  it('reicht einen nicht mehr existierenden Termin durch (404 beim Anmelden)', () => {
    expect(beschreibeTeilnahmeFehler(new ApiFehler(404, 'Diesen Termin gibt es nicht.'))).toBe(
      'Diesen Termin gibt es nicht.',
    );
  });

  it('reicht „nicht angemeldet" durch (404 beim Abmelden)', () => {
    expect(
      beschreibeTeilnahmeFehler(new ApiFehler(404, 'Du bist bei diesem Termin nicht angemeldet.')),
    ).toBe('Du bist bei diesem Termin nicht angemeldet.');
  });

  it('reicht den Verbindungshinweis von api.ts durch (Status 0)', () => {
    expect(
      beschreibeTeilnahmeFehler(new ApiFehler(0, 'Keine Verbindung zum Server. Bitte prüfe deine Verbindung.')),
    ).toBe('Keine Verbindung zum Server. Bitte prüfe deine Verbindung.');
  });

  it('reicht die Meldung „Kalender nicht erreichbar" durch (503)', () => {
    const text = 'Der Vereinskalender ist gerade nicht erreichbar. Versuch es gleich noch einmal.';
    expect(beschreibeTeilnahmeFehler(new ApiFehler(503, text))).toBe(text);
  });

  it('erfindet einen eigenen Hinweis, wenn die Meldung leer ankäme', () => {
    expect(beschreibeTeilnahmeFehler(new ApiFehler(500, '   '))).toBe(
      'Der Verein ist gerade nicht erreichbar. Versuch es später noch einmal.',
    );
  });

  it('fällt bei einem unerwarteten Fehlertyp auf den vorübergehenden Text zurück', () => {
    expect(beschreibeTeilnahmeFehler(new Error('irgendwas'))).toBe(
      'Der Verein ist gerade nicht erreichbar. Versuch es später noch einmal.',
    );
  });
});
