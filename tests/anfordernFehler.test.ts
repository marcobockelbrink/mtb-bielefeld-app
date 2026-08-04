import { describe, expect, it } from 'vitest';

import { ApiFehler } from '../src/data/api';
import { beschreibeAnfordernFehler } from '../src/konto/anfordernFehler';

describe('beschreibeAnfordernFehler', () => {
  it('reicht bei einer ungültigen Adresse den Satz der API durch, statt ihn zu ersetzen', () => {
    // Wortlaut wie gegen die laufende API gemessen: {"email":"keine-adresse"}
    // antwortet mit 400 und genau diesem Text.
    expect(
      beschreibeAnfordernFehler(new ApiFehler(400, 'E-Mail-Adresse fehlt oder ist ungültig.')),
    ).toBe('E-Mail-Adresse fehlt oder ist ungültig.');
  });

  it('sagt bei einer Ratenbegrenzung, dass Warten hilft — nicht weiterprobieren', () => {
    expect(beschreibeAnfordernFehler(new ApiFehler(429, 'Zu viele Versuche.'))).toBe(
      'Zu viele Versuche hintereinander. Warte eine Minute und probier es dann noch einmal.',
    );
  });

  it('erklärt einen Netzfehler (Status 0) als vorübergehend', () => {
    expect(beschreibeAnfordernFehler(new ApiFehler(0, 'Keine Verbindung zum Server.'))).toBe(
      'Der Verein ist gerade nicht erreichbar. Versuch es später noch einmal.',
    );
  });

  it('erklärt einen Serverfehler (Status 500) als vorübergehend', () => {
    expect(beschreibeAnfordernFehler(new ApiFehler(500, 'Da ist etwas schiefgegangen.'))).toBe(
      'Der Verein ist gerade nicht erreichbar. Versuch es später noch einmal.',
    );
  });

  it('erfindet einen eigenen Hinweis, wenn ein 400 ohne Text ankommt', () => {
    // Sonst stünde eine leere Fehlerzeile da — sichtbar, aber ohne Aussage.
    expect(beschreibeAnfordernFehler(new ApiFehler(400, '   '))).toBe('Prüf deine E-Mail-Adresse.');
  });

  it('fällt bei einem unerwarteten Fehlertyp auf den vorübergehenden Text zurück', () => {
    expect(beschreibeAnfordernFehler(new Error('irgendwas'))).toBe(
      'Der Verein ist gerade nicht erreichbar. Versuch es später noch einmal.',
    );
  });
});
