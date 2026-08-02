import { describe, expect, it } from 'vitest';

import { CALENDAR_ICS_URL, NEWS_RSS_URL } from '../src/config';
import { CALENDAR_ICS_URL as WERKZEUG_ICS, NEWS_RSS_URL as WERKZEUG_RSS } from '../tools/quellen.mjs';

/**
 * Die Screenshot-Werkzeuge führen die Feed-Adressen ein zweites Mal, weil sie
 * reines JavaScript ohne Übersetzungsschritt sind. Doppelt geführte Angaben
 * laufen auseinander — dieser Test macht daraus einen Fehlschlag statt einer
 * stillen Abweichung.
 */
describe('Feed-Adressen', () => {
  it('stimmen zwischen App und Werkzeugen überein', () => {
    expect(WERKZEUG_ICS).toBe(CALENDAR_ICS_URL);
    expect(WERKZEUG_RSS).toBe(NEWS_RSS_URL);
  });
});
