/**
 * Farben, Abstände und Schriftgrößen der App.
 *
 * Der Grundton `#00679a` ist die einzige vereinseigene Farbe im Stylesheet der
 * Website — alles andere dort ist Bootstrap-Standard. Damit bleibt die App
 * optisch mit mtb-bielefeld.de verwandt, ohne sie nachzubauen.
 *
 * Beide Farbschemata sind gepflegt: Wer im Wald bei Dämmerung aufs Handy
 * schaut, will nicht geblendet werden.
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
  primary: '#00679a',
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
