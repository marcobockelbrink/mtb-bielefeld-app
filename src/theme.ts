/**
 * Farben, Abstände und Schriftgrößen der App.
 *
 * ## Das Vereinsblau
 *
 * Verbindlich ist die Druckdefinition des Vereins:
 *
 *     C 90 | M 50 | Y 20 | K 5
 *
 * Nachgeprüft: Die Logodatei enthält genau diese Werte (C 90,6 M 52,9 Y 18,8
 * K 3,9 — die Abweichung stammt aus der 8-Bit-Speicherung).
 *
 * Für den Bildschirm braucht es daraus ein RGB-Gegenstück, und dabei gibt es
 * kein einzelnes richtiges Ergebnis — es hängt am Farbprofil. Gemessen wurde:
 *
 * | Weg                                  | Ergebnis  | Abstand zu `#076c9b` |
 * |--------------------------------------|-----------|----------------------|
 * | Faustformel ohne Farbmanagement      | `#1879c2` | ΔE 16,5              |
 * | ICC-Umrechnung (CMYK → sRGB)         | `#25749e` | ΔE  4,6              |
 * | so rendert Ghostscript die Logodatei | `#076c9b` | —                    |
 * | Stylesheet der Vereinswebsite        | `#00679a` | ΔE  3,5              |
 *
 * Gewählt ist `#076c9b`: Es liegt mit ΔE unter 5 sowohl an der farbmetrischen
 * Umrechnung der offiziellen Druckfarbe als auch am Blau der Website, hält also
 * beides zusammen. Die Faustformel scheidet aus — mit ΔE über 14 wäre das ein
 * sichtbar anderes, zu helles Blau gewesen.
 *
 * (ΔE unter 2 heißt für das Auge praktisch gleich, über 5 deutlich verschieden.)
 *
 * ## Farbschemata
 *
 * Beide sind gepflegt: Wer im Wald bei Dämmerung aufs Handy schaut, will nicht
 * geblendet werden.
 */

import type { EventCategory } from './domain/types';

export interface Palette {
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  onPrimary: string;
  accent: string;
  danger: string;
  warning: string;
  success: string;
}

export const lightPalette: Palette = {
  background: '#f6f7f9',
  surface: '#ffffff',
  surfaceMuted: '#eef1f4',
  border: '#dfe4ea',
  text: '#16202b',
  textMuted: '#5d6b7a',
  primary: '#076c9b',
  onPrimary: '#ffffff',
  accent: '#2f8f4e',
  danger: '#c0392b',
  warning: '#b8860b',
  success: '#2f8f4e',
};

export const darkPalette: Palette = {
  background: '#0f1519',
  surface: '#182128',
  surfaceMuted: '#212c35',
  border: '#2c3945',
  text: '#e8edf2',
  textMuted: '#9aa9b8',
  primary: '#4bb3e0',
  onPrimary: '#06222f',
  accent: '#5fc47f',
  danger: '#e57368',
  warning: '#e0b44c',
  success: '#5fc47f',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

export const fontSize = {
  xs: 12,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 26,
} as const;

/** Anzeigename und Symbol je Kategorie — einheitlich in Liste, Detail und Filter. */
export const categoryDisplay: Record<EventCategory, { label: string; icon: string }> = {
  tour: { label: 'Tour', icon: '🚵' },
  fahrtechnik: { label: 'Fahrtechnik', icon: '🎯' },
  treff: { label: 'Treff', icon: '🤝' },
  ausflug: { label: 'Ausflug', icon: '🚐' },
  werkstatt: { label: 'Werkstatt', icon: '🔧' },
  jugend: { label: 'Jugend', icon: '🧒' },
  racing: { label: 'Racing', icon: '🏁' },
  verein: { label: 'Verein', icon: '📋' },
  sonstiges: { label: 'Sonstiges', icon: '📌' },
};

export const levelDisplay = {
  einsteiger: 'Einsteiger',
  aufsteiger: 'Aufsteiger',
  fortgeschritten: 'Fortgeschritten',
  koenner: 'Könner',
} as const;
