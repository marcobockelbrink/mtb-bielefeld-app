import { describe, expect, it } from 'vitest';

import { leseOptionaleAnzahl, leseZeitpunkt } from '../src/features/jugend/eingabe';

describe('leseZeitpunkt', () => {
  it('rechnet in Bielefelder Ortszeit, nicht in der Zeitzone des Geräts', () => {
    // Sommerzeit: 10:30 Ortszeit ist 08:30 UTC. Ein Gerät auf UTC legte das
    // Training sonst zwei Stunden zu früh an.
    expect(leseZeitpunkt('9.8.2026', '10:30')).toEqual(new Date('2026-08-09T08:30:00Z'));
  });

  it('nimmt auch Angaben mit führender Null', () => {
    expect(leseZeitpunkt('09.08.2026', '08:05')).toEqual(new Date('2026-08-09T06:05:00Z'));
  });

  it('rechnet über die Zeitumstellung hinweg richtig — Winterzeit', () => {
    expect(leseZeitpunkt('10.1.2027', '18:00')).toEqual(new Date('2027-01-10T17:00:00Z'));
  });

  it('lehnt ein Datum ab, das JavaScript sonst stillschweigend umrechnen würde', () => {
    // Der 31. Februar gibt es nicht — `Date.UTC` machte daraus klaglos den
    // 3. März, ein anderes Datum als eingetippt.
    expect(leseZeitpunkt('31.02.2026', '10:00')).toBeNull();
  });

  it('lehnt eine Uhrzeit über 23:59 ab', () => {
    expect(leseZeitpunkt('9.8.2026', '25:00')).toBeNull();
  });

  it('lehnt ein Datum ab, das nicht dem Muster TT.MM.JJJJ entspricht', () => {
    expect(leseZeitpunkt('9. August 2026', '10:30')).toBeNull();
  });

  it('lehnt eine leere Eingabe ab', () => {
    expect(leseZeitpunkt('', '')).toBeNull();
  });
});

describe('leseOptionaleAnzahl', () => {
  it('liest eine leere Eingabe als "nichts angeben", nicht als ungültig', () => {
    expect(leseOptionaleAnzahl('')).toBeNull();
    expect(leseOptionaleAnzahl('   ')).toBeNull();
  });

  it('liest eine ganze Zahl über null', () => {
    expect(leseOptionaleAnzahl('12')).toBe(12);
  });

  it('lehnt null, negative und gebrochene Zahlen ab', () => {
    expect(leseOptionaleAnzahl('0')).toBe('ungueltig');
    expect(leseOptionaleAnzahl('-3')).toBe('ungueltig');
    expect(leseOptionaleAnzahl('2.5')).toBe('ungueltig');
  });

  it('unterscheidet eine kaputte Eingabe von einer leeren — sonst würde "abc" zu "unbegrenzt"', () => {
    expect(leseOptionaleAnzahl('abc')).toBe('ungueltig');
  });
});
