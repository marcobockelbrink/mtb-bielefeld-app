/**
 * Die Feed-Adressen für Node-Werkzeuge.
 *
 * Doppelt geführt zu `src/config.ts`, weil die Werkzeuge hier reines JavaScript
 * ohne Übersetzungsschritt sind. Ändern sich die Adressen, gilt `src/config.ts`
 * als maßgeblich — der Test unten stellt sicher, dass beide zusammenpassen und
 * die Abweichung nicht unbemerkt bleibt.
 */

export const CALENDAR_ICS_URL =
  'https://calendar.google.com/calendar/ical/' +
  'janqj64k0lb8itmh49d9croubk%40group.calendar.google.com/public/basic.ics';

export const NEWS_RSS_URL = 'https://mtb-bielefeld.de/feed/page:feed.xml';
