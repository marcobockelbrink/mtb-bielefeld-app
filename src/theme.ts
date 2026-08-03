/**
 * Farben, Schriften, Abstände und Schriftgrößen der App.
 *
 * Das Vereinsblau und seine Herleitung aus der Druckdefinition stehen in
 * `brand.ts` — dort und nur dort wird es geändert. In der Oberfläche bedeutet
 * es genau eine Sache: Zeit und Bedienung. Uhrzeiten, Links, ausgewählte
 * Filter.
 *
 * Daneben steht genau eine zweite Farbe, `grade` — ein Lehm-Ocker, die Farbe
 * des Waldbodens im Teuto. Sie gehört der Einstufung: den Fahrtechnik- und
 * Ausdauer-Balken auf der Karte und den zugehörigen Filtern. Wer sie sieht,
 * weiß ohne Beschriftung, dass es um Schwierigkeit geht.
 *
 * `warning` liegt in derselben Familie, und das ist Absicht: Beide sagen
 * "hinsehen". Verwechseln lassen sie sich nicht — eine Warnung ist immer eine
 * vollbreite Leiste mit Text, die Einstufung immer ein Balken aus drei Feldern.
 *
 * Der Untergrund ist kein neutrales Grau, sondern **aus dem Vereinsblau
 * abgeleitet**: Alle Flächen, Rahmen und Schriftfarben liegen im selben
 * Farbton (201°) wie `BRAND_BLUE`, nur stark entsättigt. Dadurch bezieht sich
 * jede Fläche der App auf die Vereinsfarbe, statt neben ihr zu stehen — ein
 * neutrales Grau daneben ließe das Blau wie einen Fremdkörper wirken.
 *
 * Im dunklen Schema wird daraus Dämmerung: Wer nach der Feierabendrunde im
 * Wald aufs Handy schaut, will nicht geblendet werden.
 */

import type { Ionicons } from '@expo/vector-icons';

import { BRAND_BLUE } from './brand';
import type { EventCategory } from './domain/types';

type IconName = keyof typeof Ionicons.glyphMap;

export interface Palette {
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  onPrimary: string;
  /** Einstufung — Fahrtechnik und Ausdauer. Sonst nirgends. */
  grade: string;
  /**
   * Hervorhebung, die weder Bedienung noch Schwierigkeit meint — „Ladies
   * only" und die Häkchen unter Verein.
   *
   * Bewusst ein Beeren-Violett und kein Grün mehr: Es muss sich sowohl vom
   * Vereinsblau als auch vom Lehm-Ocker der Einstufung deutlich absetzen,
   * damit keine dritte Bedeutung entsteht, die man erst lesen muss.
   */
  accent: string;
  danger: string;
  warning: string;
  success: string;
}

export const lightPalette: Palette = {
  background: '#dfe4e7',
  surface: '#fbfcfd',
  surfaceMuted: '#d0d8dc',
  border: '#b7c2c8',
  text: '#111c22',
  textMuted: '#495b65',
  primary: BRAND_BLUE,
  onPrimary: '#ffffff',
  grade: '#a9600f',
  accent: '#863c73',
  danger: '#af3626',
  warning: '#8c5a16',
  success: '#2e6b4a',
};

export const darkPalette: Palette = {
  background: '#0e1316',
  surface: '#192024',
  surfaceMuted: '#242d32',
  border: '#354046',
  text: '#e4e9ec',
  textMuted: '#92a2aa',
  // Das Vereinsblau aus `brand.ts`, im Farbton unverändert und nur aufgehellt
  // (HSL-Helligkeit 38 % auf 62 %). Der Druckwert selbst trägt auf dunklem
  // Grund zu wenig Kontrast; ein anderer Farbton wäre eine zweite Vereinsfarbe.
  primary: '#62aeda',
  onPrimary: '#04222f',
  grade: '#de9b4e',
  accent: '#ce7eba',
  danger: '#ea7b6d',
  warning: '#d9a64a',
  success: '#63bc8a',
};

/**
 * Schriftschnitte — eine Sippe in drei Breiten.
 *
 * Barlow steht in der Linie der DIN, der Schrift deutscher Wegweiser. Das ist
 * die Sprache, in der Wanderschilder und Streckenposten reden, und damit die
 * naheliegende Wahl für eine App über Termine, Treffpunkte und Strecken.
 *
 * Die Rangfolge trägt hier die **Breite**, nicht nur Größe und Fettung:
 * Schmalschnitt für Zahlen und Überschriften, Normalbreite für Fließtext,
 * Halbschmal in Versalien für Kleinbeschriftungen. Deshalb genügt eine einzige
 * Sippe — wichtig für eine App, die klein bleiben und offline laufen soll.
 *
 * Wichtig: Zu einer gesetzten `fontFamily` gehört **kein** `fontWeight`.
 * Android rechnet sonst eine eigene Fettung dazu und zerstört den Schnitt.
 */
export const font = {
  /** Barlow — Fließtext, Termintitel, Knöpfe. */
  regular: 'Barlow_400Regular',
  medium: 'Barlow_500Medium',
  semibold: 'Barlow_600SemiBold',
  /** Barlow Condensed — Uhrzeiten, Zahlen, Bildschirmtitel. */
  display: 'BarlowCondensed_700Bold',
  displayMedium: 'BarlowCondensed_600SemiBold',
  /** Barlow Semi Condensed — Kleinbeschriftungen, immer in Versalien. */
  label: 'BarlowSemiCondensed_600SemiBold',
} as const;

/**
 * Versalien-Kleinbeschriftung.
 *
 * Nur für Angaben, die **einordnen**: Kategorie, Erfahrungsstufe, Wochentag,
 * Feldname, Filtergruppe. Nicht für Überschriften über Fließtext und nicht für
 * Knopfbeschriftungen — Versalien lesen sich langsamer, und wo ein Knopf sagt,
 * was er tut, soll man ihn lesen können, nicht entziffern.
 */
export const labelType = {
  fontFamily: font.label,
  letterSpacing: 0.9,
  textTransform: 'uppercase',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/**
 * Kanten bleiben knapp. Stark gerundete Ecken sehen auf jeder Plattform gleich
 * aus und nach nichts; ein Wegweiser ist ein Brett, keine Seifenblase.
 */
export const radius = {
  sm: 3,
  md: 6,
  lg: 10,
  pill: 999,
} as const;

export const fontSize = {
  xs: 12,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 21,
  xxl: 27,
} as const;

/** Anzeigename und Symbol je Kategorie — einheitlich in Liste, Detail und Filter. */
export const categoryDisplay: Record<EventCategory, { label: string; icon: IconName }> = {
  tour: { label: 'Tour', icon: 'bicycle-outline' },
  fahrtechnik: { label: 'Fahrtechnik', icon: 'trail-sign-outline' },
  treff: { label: 'Treff', icon: 'people-circle-outline' },
  ausflug: { label: 'Ausflug', icon: 'bus-outline' },
  werkstatt: { label: 'Werkstatt', icon: 'build-outline' },
  jugend: { label: 'Jugend', icon: 'happy-outline' },
  racing: { label: 'Racing', icon: 'flag-outline' },
  verein: { label: 'Verein', icon: 'clipboard-outline' },
  sonstiges: { label: 'Sonstiges', icon: 'ellipsis-horizontal-circle-outline' },
};

export const levelDisplay = {
  einsteiger: 'Einsteiger',
  aufsteiger: 'Aufsteiger',
  fortgeschritten: 'Fortgeschritten',
  koenner: 'Könner',
} as const;

/** Höchste Sterne-Zahl, die der Verein vergibt — die Breite jedes Einstufungsbalkens. */
export const MAX_STARS = 3;
