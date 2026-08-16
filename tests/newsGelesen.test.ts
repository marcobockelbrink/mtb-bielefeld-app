import { describe, expect, it } from 'vitest';

import { createMemoryStore } from '../src/data/store';
import type { NewsItem } from '../src/domain/types';
import {
  ausJson,
  ersterStand,
  HOECHSTZAHL,
  istUngelesen,
  markiereGelesen,
  zaehleUngelesen,
  zuJson,
  type GelesenStand,
} from '../src/features/news/gelesen';
import { liesGelesen, schreibGelesen } from '../src/features/news/gelesenSpeicher';

const INSTALLIERT = new Date('2026-08-10T12:00:00Z');

function beitrag(teil: Partial<NewsItem> = {}): NewsItem {
  return {
    id: 'b1',
    title: 'Vereinsausfahrt',
    link: 'https://mtb-bielefeld.de/b1',
    publishedAt: new Date('2026-08-12T09:00:00Z'),
    summary: '',
    contentHtml: '',
    contentText: '',
    tags: [],
    ...teil,
  };
}

describe('istUngelesen', () => {
  const stand = ersterStand(INSTALLIERT);

  it('zeigt einen Punkt an allem, was nach dem ersten Start kam', () => {
    expect(istUngelesen(beitrag(), stand)).toBe(true);
  });

  it('lässt alles vor dem ersten Start ohne Punkt', () => {
    // Der Kern des Entwurfs: Wer die App gerade installiert hat, hat
    // nichts verpasst. Ohne diese Regel stünde beim ersten Öffnen über
    // jeder der dreißig Karten ein Punkt — Tapete statt Hinweis.
    const alt = beitrag({ publishedAt: new Date('2026-07-01T09:00:00Z') });
    expect(istUngelesen(alt, stand)).toBe(false);
  });

  it('behandelt den Startzeitpunkt selbst als gelesen', () => {
    // Grenzfall: Ein Beitrag genau in der Sekunde der Installation ist
    // nichts, was jemand „verpasst" haben könnte.
    expect(istUngelesen(beitrag({ publishedAt: INSTALLIERT }), stand)).toBe(false);
  });

  it('nimmt den Punkt weg, sobald der Beitrag vermerkt ist', () => {
    const gelesen = markiereGelesen(stand, 'b1');
    expect(istUngelesen(beitrag(), gelesen)).toBe(false);
  });

  it('lässt einen alten Beitrag auch ungeöffnet ohne Punkt', () => {
    // Sonst wäre der Startpunkt wirkungslos: Die beiden Bedingungen
    // sind mit UND verknüpft, nicht mit ODER.
    const alt = beitrag({ id: 'alt', publishedAt: new Date('2026-01-01T09:00:00Z') });
    expect(stand.ids).not.toContain('alt');
    expect(istUngelesen(alt, stand)).toBe(false);
  });
});

describe('markiereGelesen', () => {
  it('stellt die zuletzt gelesene Kennung nach vorn', () => {
    const stand = markiereGelesen(markiereGelesen(ersterStand(INSTALLIERT), 'a'), 'b');
    expect(stand.ids).toEqual(['b', 'a']);
  });

  it('gibt bei einem schon vermerkten Beitrag denselben Stand zurück', () => {
    // Die Aufrufer prüfen darauf und sparen sich ein Schreiben auf das
    // Gerät bei jedem erneuten Öffnen desselben Beitrags.
    const einmal = markiereGelesen(ersterStand(INSTALLIERT), 'a');
    expect(markiereGelesen(einmal, 'a')).toBe(einmal);
  });

  it('verschiebt den Startpunkt nicht', () => {
    const stand = markiereGelesen(ersterStand(INSTALLIERT), 'a');
    expect(stand.seit).toBe(INSTALLIERT.getTime());
  });

  it('lässt die Liste nicht über die Höchstzahl wachsen', () => {
    let stand = ersterStand(INSTALLIERT);
    for (let i = 0; i < HOECHSTZAHL + 25; i += 1) stand = markiereGelesen(stand, `b${i}`);

    expect(stand.ids).toHaveLength(HOECHSTZAHL);
    // Vorne bleibt das Neueste, hinten fällt das Älteste heraus.
    expect(stand.ids[0]).toBe(`b${HOECHSTZAHL + 24}`);
    expect(stand.ids).not.toContain('b0');
  });
});

describe('zaehleUngelesen', () => {
  it('zählt nur die neuen und ungeöffneten', () => {
    const stand = markiereGelesen(ersterStand(INSTALLIERT), 'neu-gelesen');
    const beitraege = [
      beitrag({ id: 'alt', publishedAt: new Date('2026-05-01T09:00:00Z') }),
      beitrag({ id: 'neu-gelesen' }),
      beitrag({ id: 'neu-1' }),
      beitrag({ id: 'neu-2' }),
    ];
    expect(zaehleUngelesen(beitraege, stand)).toBe(2);
  });

  it('zählt bei leerer Liste null', () => {
    expect(zaehleUngelesen([], ersterStand(INSTALLIERT))).toBe(0);
  });
});

describe('ausJson', () => {
  it('liest zurück, was zuJson geschrieben hat', () => {
    const stand: GelesenStand = { ids: ['a', 'b'], seit: INSTALLIERT.getTime() };
    expect(ausJson(zuJson(stand))).toEqual(stand);
  });

  it('verwirft Kaputtes, statt es zu reparieren', () => {
    // Ein halber Stand mit `seit: NaN` machte jeden Vergleich falsch —
    // und zwar stumm.
    expect(ausJson(null)).toBeNull();
    expect(ausJson('')).toBeNull();
    expect(ausJson('kein json')).toBeNull();
    expect(ausJson('[]')).toBeNull();
    expect(ausJson('{"ids":["a"]}')).toBeNull();
    expect(ausJson('{"seit":null,"ids":[]}')).toBeNull();
    expect(ausJson(JSON.stringify({ seit: Number.NaN, ids: [] }))).toBeNull();
    expect(ausJson('{"seit":123,"ids":"a"}')).toBeNull();
  });

  it('wirft einzelne unbrauchbare Kennungen weg und behält den Rest', () => {
    expect(ausJson('{"seit":123,"ids":["a",null,7,"b"]}')).toEqual({ seit: 123, ids: ['a', 'b'] });
  });
});

describe('liesGelesen', () => {
  it('legt beim ersten Mal den Startpunkt an und schreibt ihn fest', () => {
    const store = createMemoryStore();
    return liesGelesen(store, INSTALLIERT).then(async (erst) => {
      expect(erst).toEqual({ ids: [], seit: INSTALLIERT.getTime() });

      // Der zweite Aufruf — Tage später — darf den Startpunkt **nicht**
      // verschieben. Täte er es, wäre alles Neue plötzlich gelesen.
      const spaeter = await liesGelesen(store, new Date('2026-09-01T12:00:00Z'));
      expect(spaeter.seit).toBe(INSTALLIERT.getTime());
    });
  });

  it('gibt Vermerktes wieder heraus', async () => {
    const store = createMemoryStore();
    await schreibGelesen(store, { ids: ['a'], seit: INSTALLIERT.getTime() });
    expect(await liesGelesen(store, new Date())).toEqual({ ids: ['a'], seit: INSTALLIERT.getTime() });
  });

  it('fängt bei beschädigtem Inhalt neu an, statt zu werfen', async () => {
    const store = createMemoryStore();
    await store.setItem('mtbie.gelesen', '{kaputt');
    const stand = await liesGelesen(store, INSTALLIERT);
    expect(stand).toEqual({ ids: [], seit: INSTALLIERT.getTime() });
  });

  it('kommt mit einem Speicher zurecht, der beim Lesen wirft', async () => {
    const store = {
      getItem: () => Promise.reject(new Error('kaputt')),
      setItem: () => Promise.resolve(),
      removeItem: () => Promise.resolve(),
    };
    expect(await liesGelesen(store, INSTALLIERT)).toEqual({ ids: [], seit: INSTALLIERT.getTime() });
  });
});
