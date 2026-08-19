import { describe, expect, it } from 'vitest';

import { beschreibeAenderung } from '../src/features/jugend/geaendert';

// Punkt 5 aus Handoff 12/13. Der Zweck der Zeile ist eine einzige Frage:
// „Hat sich das geändert, oder irre ich mich?"

const JETZT = new Date(2026, 7, 19, 20, 30);

describe('beschreibeAenderung', () => {
  it('schweigt, wenn nie geändert wurde', () => {
    // Der Normalfall — und `undefined` heißt „nicht mitgeliefert", was in
    // der Liste zutrifft. Beides ergibt keine Zeile.
    expect(beschreibeAenderung(null, null, JETZT)).toBeNull();
    expect(beschreibeAenderung(undefined, undefined, JETZT)).toBeNull();
  });

  it('sagt „gerade eben" für die letzten Minuten', () => {
    const vorZweiMinuten = new Date(JETZT.getTime() - 2 * 60 * 1000);
    expect(beschreibeAenderung(vorZweiMinuten, 'Marco', JETZT)).toBe('Geändert gerade eben · Marco');
  });

  it('nennt bei heute die Uhrzeit', () => {
    const heuteFrueh = new Date(2026, 7, 19, 9, 4);
    expect(beschreibeAenderung(heuteFrueh, 'Marco', JETZT)).toBe('Geändert heute 09:04 · Marco');
  });

  it('nennt gestern beim Namen', () => {
    const gestern = new Date(2026, 7, 18, 19, 4);
    expect(beschreibeAenderung(gestern, 'Marco', JETZT)).toBe('Geändert gestern 19:04 · Marco');
  });

  it('nimmt bei Älterem das Datum', () => {
    // „vor elf Tagen" muss man umrechnen; ein Datum vergleicht man mit dem
    // eigenen Kalender.
    const vorelf = new Date(2026, 7, 8, 17, 30);
    expect(beschreibeAenderung(vorelf, 'Marco', JETZT)).toBe('Geändert 08.08. 17:30 · Marco');
  });

  it('lässt den Namen weg, wenn keiner da ist', () => {
    // `geaendert_von` zeigt mit ON DELETE SET NULL aufs Mitglied — ein
    // gelöschtes Konto lässt die Änderung ohne Namen übrig. Die Zeile
    // deshalb ganz zu verschlucken wäre falsch: Geändert wurde ja.
    const gestern = new Date(2026, 7, 18, 19, 4);
    expect(beschreibeAenderung(gestern, null, JETZT)).toBe('Geändert gestern 19:04');
    expect(beschreibeAenderung(gestern, '   ', JETZT)).toBe('Geändert gestern 19:04');
  });

  it('kommt mit einem Zeitpunkt in der Zukunft zurecht', () => {
    // Uhren gehen falsch. „gerade eben" wäre hier eine Behauptung; das
    // Datum ist die ruhigere Auskunft.
    const gleich = new Date(JETZT.getTime() + 60 * 1000);
    expect(beschreibeAenderung(gleich, 'Marco', JETZT)).toBe('Geändert heute 20:31 · Marco');
  });

  it('springt über einen Monatswechsel richtig auf „gestern"', () => {
    const ersterAugust = new Date(2026, 7, 1, 10, 0);
    const letzterJuli = new Date(2026, 6, 31, 18, 0);
    expect(beschreibeAenderung(letzterJuli, 'Marco', ersterAugust)).toBe('Geändert gestern 18:00 · Marco');
  });
});
