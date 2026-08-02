import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { hasNextPage, parseArticle, parseEntries, parseTags } from '../src/data/web/parseEntries';

/** Eingefrorene Seiten der echten Vereinswebsite. */
const uebersicht = fs.readFileSync(path.join(__dirname, 'fixtures/beitragsliste.html'), 'utf8');
const artikel = fs.readFileSync(path.join(__dirname, 'fixtures/beitrag.html'), 'utf8');

describe('Themenschlagworte', () => {
  it('liest sie aus der CSS-Klasse', () => {
    // So schreibt die Website sie: mit Schrägstrich, der nicht zum Namen gehört.
    expect(parseTags(' tag-Jugend/ tag-Racing/')).toEqual(['Jugend', 'Racing']);
  });

  it('kommt mit einem Beitrag ohne Thema zurecht', () => {
    expect(parseTags('')).toEqual([]);
  });

  it('übersetzt prozentkodierte Umlaute zurück', () => {
    // Die Website kodiert Umlaute in den Klassennamen; ohne Rückübersetzung
    // stand "Ausfl%C3%BCge" als Beschriftung auf dem Filterknopf.
    expect(parseTags(' tag-Ausfl%C3%BCge/')).toEqual(['Ausflüge']);
  });

  it('lässt kaputte Kodierung stehen, statt daran zu scheitern', () => {
    expect(parseTags(' tag-100%/ tag-Racing/')).toEqual(['100%', 'Racing']);
  });
});

describe('Übersichtsseite einlesen', () => {
  const beitraege = parseEntries(uebersicht);

  it('liest alle Beiträge der Seite', () => {
    expect(beitraege).toHaveLength(5);
  });

  it('liefert Titel, Adresse, Datum und Verfasser', () => {
    const beitrag = beitraege.find((b) => b.title.includes('Farchant'))!;
    expect(beitrag.link).toBe('https://mtb-bielefeld.de/pilgerreise-nach-farchant-zum-vpace-kids-cup');
    expect(beitrag.publishedAt.toISOString().slice(0, 10)).toBe('2026-07-23');
    expect(beitrag.author).toBe('Basti');
  });

  it('liefert die Themen je Beitrag', () => {
    const beitrag = beitraege.find((b) => b.title.includes('Farchant'))!;
    expect(beitrag.tags).toEqual(['Jugend', 'Racing']);
  });

  it('vergibt Themen nicht pauschal', () => {
    // Jeder Beitrag hat seine eigenen; sie dürfen nicht vom Nachbarn stammen.
    const themen = beitraege.map((b) => b.tags.join(','));
    expect(new Set(themen).size).toBeGreaterThan(1);
  });

  it('erkennt, dass der Text gekürzt ist', () => {
    expect(beitraege.every((b) => b.truncated)).toBe(true);
  });

  it('lässt "Lies mehr…" nicht im Text stehen', () => {
    for (const beitrag of beitraege) {
      expect(beitrag.contentText).not.toMatch(/Lies mehr…/);
      expect(beitrag.summary).not.toMatch(/Lies mehr…/);
    }
  });

  it('findet Vorschaubilder als vollständige Adresse', () => {
    const mitBild = beitraege.filter((b) => b.imageUrl);
    expect(mitBild.length).toBeGreaterThan(0);
    for (const beitrag of mitBild) {
      expect(beitrag.imageUrl).toMatch(/^https:\/\/mtb-bielefeld\.de\//);
    }
  });

  it('erkennt, dass es weitere Seiten gibt', () => {
    expect(hasNextPage(uebersicht)).toBe(true);
  });
});

describe('Artikelseite einlesen', () => {
  const link = 'https://mtb-bielefeld.de/pilgerreise-nach-farchant-zum-vpace-kids-cup';
  const beitrag = parseArticle(artikel, link)!;

  it('liest den Beitrag', () => {
    expect(beitrag).not.toBeNull();
    expect(beitrag.title).toBe('Pilgerreise nach Farchant zum VPACE Kids Cup');
    expect(beitrag.link).toBe(link);
  });

  it('liefert den vollständigen Text, nicht den Anriss', () => {
    // Der Anriss auf der Übersicht hat rund 340 Zeichen, der Beitrag über 6000.
    const anriss = parseEntries(uebersicht).find((b) => b.title.includes('Farchant'))!;
    expect(anriss.contentText.length).toBeLessThan(600);
    expect(beitrag.contentText.length).toBeGreaterThan(3000);
    expect(beitrag.truncated).toBe(false);
  });

  it('liefert auch hier die Themen', () => {
    expect(beitrag.tags).toEqual(['Jugend', 'Racing']);
  });

  it('behält den Fließtext lesbar', () => {
    expect(beitrag.contentText).toContain('Traute Simon');
    expect(beitrag.contentText).not.toContain('<p>');
  });
});

describe('Robustheit', () => {
  it('gibt bei fremdem HTML eine leere Liste zurück, statt zu scheitern', () => {
    expect(parseEntries('<html><body><h1>Ganz andere Seite</h1></body></html>')).toEqual([]);
  });

  it('kommt mit leerem Inhalt zurecht', () => {
    expect(parseEntries('')).toEqual([]);
    expect(parseArticle('', 'https://mtb-bielefeld.de/x')).toBeNull();
  });

  it('überspringt Einträge ohne Titel', () => {
    expect(parseEntries('<div class="entry tag-Racing/"><div class="entry-meta">01.01.2026</div>')).toEqual([]);
  });
});
