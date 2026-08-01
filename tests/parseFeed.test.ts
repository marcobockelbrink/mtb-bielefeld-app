import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { decodeEntities, firstImageUrl, htmlToText, truncate } from '../src/data/parse/html';
import { parseFeed } from '../src/data/rss/parseFeed';

/** Ausschnitt aus dem echten RSS-Feed der Vereinswebsite. */
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/news-feed.xml'), 'utf8');

describe('News-Feed einlesen', () => {
  const items = parseFeed(fixture);

  it('liest alle Beiträge', () => {
    expect(items).toHaveLength(6);
  });

  it('liefert Titel, Link und Datum', () => {
    const beitrag = items.find((item) => item.title.includes('Farchant'));
    expect(beitrag).toBeDefined();
    expect(beitrag!.link).toBe('https://mtb-bielefeld.de/pilgerreise-nach-farchant-zum-vpace-kids-cup');
    expect(beitrag!.publishedAt.toISOString()).toBe('2026-07-23T20:28:51.000Z');
    expect(beitrag!.author).toBe('Basti');
  });

  it('löst Sonderzeichen im Titel auf', () => {
    // Im Feed steht "Malte hat&#039;s geschafft!"
    const beitrag = items.find((item) => item.title.includes('Stoneman'));
    expect(beitrag!.title).toContain("hat's geschafft");
  });

  it('macht aus dem Beitrag lesbaren Text', () => {
    const beitrag = items.find((item) => item.title.includes('Farchant'))!;
    expect(beitrag.contentText).not.toContain('<p>');
    expect(beitrag.contentText).toContain('Traute Simon');
  });

  it('findet das Vorschaubild als vollständige Adresse', () => {
    const mitBild = items.find((item) => item.imageUrl);
    expect(mitBild?.imageUrl).toMatch(/^https:\/\/mtb-bielefeld\.de\/media\//);
  });

  it('sortiert neueste zuerst', () => {
    const zeiten = items.map((item) => item.publishedAt.getTime());
    expect([...zeiten].sort((a, b) => b - a)).toEqual(zeiten);
  });

  it('überspringt kaputte Einträge, statt aufzugeben', () => {
    const kaputt = '<rss><channel><item><title>Ohne Link</title></item></channel></rss>';
    expect(parseFeed(kaputt)).toEqual([]);
  });

  it('kommt mit leerem Inhalt zurecht', () => {
    expect(parseFeed('')).toEqual([]);
  });
});

describe('HTML in Text umwandeln', () => {
  it('macht aus Umbrüchen und Absätzen Zeilen', () => {
    expect(htmlToText('<p>Erste Zeile</p><p>Zweite<br />Dritte</p>')).toBe(
      'Erste Zeile\nZweite\nDritte',
    );
  });

  it('entfernt Auszeichnungen, behält den Text', () => {
    expect(htmlToText('<b>Euer Guide:</b> <i>Malte</i>')).toBe('Euer Guide: Malte');
  });

  it('löst benannte und nummerische Sonderzeichen auf', () => {
    expect(decodeEntities('Malte hat&#039;s geschafft &amp; wie!')).toBe("Malte hat's geschafft & wie!");
    expect(decodeEntities('Gr&uuml;&szlig;e aus Biel&#x65;feld')).toBe('Grüße aus Bielefeld');
  });

  it('wirft Skripte weg', () => {
    expect(htmlToText('<script>alert(1)</script>Inhalt')).toBe('Inhalt');
  });

  it('macht relative Bildadressen absolut', () => {
    expect(firstImageUrl('<img src="/media/images/foto.jpg">', 'https://mtb-bielefeld.de')).toBe(
      'https://mtb-bielefeld.de/media/images/foto.jpg',
    );
  });

  it('lässt absolute Bildadressen unverändert', () => {
    expect(firstImageUrl('<img src="https://example.org/x.png">', 'https://mtb-bielefeld.de')).toBe(
      'https://example.org/x.png',
    );
  });

  it('kürzt an der Wortgrenze', () => {
    expect(truncate('Eine schöne Tour durch den Teutoburger Wald', 20)).toBe('Eine schöne Tour…');
    expect(truncate('Kurz', 20)).toBe('Kurz');
  });
});
