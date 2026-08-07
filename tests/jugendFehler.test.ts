import { describe, expect, it } from 'vitest';

import { ApiFehler } from '../src/data/api';
import { beschreibeJugendFehler } from '../src/features/jugend/jugendFehler';

describe('beschreibeJugendFehler', () => {
  it('erklärt ein volles Training mit dem Satz der API', () => {
    expect(
      beschreibeJugendFehler(new ApiFehler(409, 'Dieses Training ist voll.', undefined, true)),
    ).toBe('Dieses Training ist voll.');
  });

  it('erklärt die Zwei-Kinder-Grenze verständlich', () => {
    expect(
      beschreibeJugendFehler(
        new ApiFehler(409, 'Mehr als zwei Kinder gehen über ein Konto nicht.', undefined, true),
      ),
    ).toBe('Mehr als zwei Kinder gehen über ein Konto nicht.');
  });

  it('sagt bei 403, dass es an der Rolle liegt — nicht an einem Fehler', () => {
    // „Das dürfen nur Guides" ist keine Panne, sondern eine Auskunft. Wer
    // hier „etwas ist schiefgegangen" liest, sucht an der falschen Stelle.
    expect(beschreibeJugendFehler(new ApiFehler(403, 'Das dürfen nur Guides.', undefined, true))).toBe(
      'Das dürfen nur Guides.',
    );
  });

  it('rät bei einer Ratenbegrenzung zum Warten', () => {
    expect(beschreibeJugendFehler(new ApiFehler(429, 'Zu viele Versuche.'))).toBe(
      'Zu viele Versuche hintereinander. Warte eine Minute und probier es dann noch einmal.',
    );
  });

  it('reicht den Verbindungshinweis von api.ts durch (Status 0)', () => {
    expect(
      beschreibeJugendFehler(new ApiFehler(0, 'Keine Verbindung zum Server. Bitte prüfe deine Verbindung.')),
    ).toBe('Keine Verbindung zum Server. Bitte prüfe deine Verbindung.');
  });

  it('reicht bei 5xx NICHT durch, was nicht von der API stammt', () => {
    // Sonst läse ein Elternteil „canceling statement due to statement timeout".
    expect(
      beschreibeJugendFehler(new ApiFehler(500, 'canceling statement due to statement timeout')),
    ).toBe('Der Verein ist gerade nicht erreichbar. Versuch es später noch einmal.');
  });
});
