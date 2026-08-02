/**
 * Liest Beiträge aus den HTML-Seiten der Vereinswebsite.
 *
 * ## Warum nicht der RSS-Feed?
 *
 * Der Feed kann zwei Dinge nicht, die für die App wichtig sind:
 *
 * 1. **Keine Themen.** Er nennt zu keinem Beitrag, ob es um Racing, Jugend oder
 *    Naturschutz geht. Genau danach möchte man aber filtern.
 * 2. **Kein Archiv.** Er liefert nur die 30 neuesten Beiträge; blättern lässt er
 *    sich nicht. Die Website hat rund 150.
 *
 * Die Übersichtsseiten können beides. Das Themenschlagwort steht dort in der
 * CSS-Klasse des Beitrags (`<div class="entry tag-Jugend/ tag-Racing/">`) und
 * die Seiten lassen sich durchblättern (`/page:2`, `/page:3`, …).
 *
 * ## Ein Parser für zwei Seitenarten
 *
 * Übersicht und Artikelseite verwenden dieselbe Struktur — auf der Übersicht
 * steht der Titel in `<h2>` und der Text ist nach ein paar Zeilen abgeschnitten,
 * auf der Artikelseite steht er in `<h1>` und der Text ist vollständig. Deshalb
 * genügt eine Funktion für beides.
 *
 * ## Zerbrechlichkeit
 *
 * Das ist HTML einer fremden Website, kein vereinbartes Format: Ein Umbau der
 * Website kann das hier brechen. Der Parser gibt deshalb eine leere Liste
 * zurück, statt zu scheitern — die Datenschicht fällt dann auf den RSS-Feed
 * zurück, der zwar weniger kann, aber stabil ist.
 */

import { WEBSITE_BASE_URL } from '../../config';
import type { NewsItem } from '../../domain/types';
import { decodeEntities, firstImageUrl, htmlToText, truncate } from '../parse/html';

/** Ein `<div class="entry …">` samt Inhalt. */
const ENTRY_PATTERN = /<div class="entry([^"]*)">([\s\S]*?)(?=<div class="entry[ "]|<\/main>|<footer)/gi;

/**
 * Datum im deutschen Format aus der Kopfzeile eines Beitrags.
 *
 * Steht dort als `23.07.2026 von <a …>Basti</a>`.
 */
function parseGermanDate(text: string): Date | null {
  const match = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(text);
  if (!match) return null;

  const [, tag, monat, jahr] = match;
  // Mittags angesetzt, damit die Zeitzone das Datum nicht kippt — im Feed steht
  // ohnehin keine Uhrzeit.
  const datum = new Date(Date.UTC(Number(jahr), Number(monat) - 1, Number(tag), 12));
  return Number.isNaN(datum.getTime()) ? null : datum;
}

/** Zieht den Inhalt eines `<div class="…">`-Blocks heraus. */
function extractBlock(html: string, klasse: string): string | undefined {
  const pattern = new RegExp(`<div class="${klasse}">([\\s\\S]*?)</div>\\s*(?=<div class="entry-|</div>)`, 'i');
  return pattern.exec(html)?.[1];
}

/**
 * Themenschlagworte aus der CSS-Klasse.
 *
 * Die Website schreibt sie als `tag-Jugend/ tag-Racing/` — mit Schrägstrich am
 * Ende, der nicht zum Namen gehört.
 *
 * Umlaute stehen dort prozentkodiert, weil die Klassennamen aus den Adressen
 * stammen: `tag-Ausfl%C3%BCge`. Ohne Rückübersetzung stand genau das als
 * Beschriftung auf dem Filterknopf.
 */
export function parseTags(klassen: string): string[] {
  return [...klassen.matchAll(/tag-([^\s"/]+)/g)]
    .map((treffer) => decodePercent(decodeEntities(treffer[1])).trim())
    .filter((name) => name.length > 0);
}

/**
 * Prozent-Kodierung zurückübersetzen, soweit sie sich zurückübersetzen lässt.
 *
 * `decodeURIComponent` wirft bei unvollständigen Folgen wie `100%`. Ein
 * Schlagwort ist das nicht wert: Dann bleibt der Rohtext stehen, und die App
 * zeigt weiterhin alle Beiträge an, statt beim Auswerten abzubrechen.
 */
function decodePercent(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** Absolute Adresse aus einem Verweis der Website. */
function absoluteUrl(pfad: string, baseUrl: string): string {
  const sauber = decodeEntities(pfad).trim().replace(/#.*$/, '');
  if (/^https?:\/\//i.test(sauber)) return sauber;
  return `${baseUrl.replace(/\/$/, '')}/${sauber.replace(/^\//, '')}`;
}

/**
 * Liest alle Beiträge einer Seite.
 *
 * Funktioniert für Übersichtsseiten (mehrere Beiträge, gekürzt) wie für
 * Artikelseiten (ein Beitrag, vollständig).
 */
export function parseEntries(html: string, baseUrl: string = WEBSITE_BASE_URL): NewsItem[] {
  if (!html) return [];

  const beitraege: NewsItem[] = [];

  for (const treffer of html.matchAll(ENTRY_PATTERN)) {
    const klassen = treffer[1];
    const block = treffer[2];

    // Titel steht je nach Seitenart in h1 oder h2.
    const titelTreffer = /<div class="entry-title">\s*<h[12][^>]*>\s*(?:<a href="([^"]+)"[^>]*>)?([\s\S]*?)(?:<\/a>)?\s*<\/h[12]>/i.exec(block);
    if (!titelTreffer) continue;

    const [, verweis, roherTitel] = titelTreffer;
    const titel = decodeEntities(roherTitel.replace(/<[^>]+>/g, '')).trim();
    if (!titel) continue;

    const meta = extractBlock(block, 'entry-meta') ?? '';
    const metaText = htmlToText(meta);
    const inhaltHtml = extractBlock(block, 'entry-content') ?? '';
    const inhaltText = htmlToText(inhaltHtml).replace(/\s*Lies mehr…\s*$/, '');

    // Auf der Artikelseite fehlt der Verweis im Titel — dort ist die Adresse
    // die Seite selbst und wird von der aufrufenden Stelle nachgetragen.
    const link = verweis ? absoluteUrl(verweis, baseUrl) : '';

    beitraege.push({
      id: link || titel,
      title: titel,
      link,
      publishedAt: parseGermanDate(metaText) ?? new Date(0),
      summary: truncate(inhaltText, 220),
      contentHtml: inhaltHtml,
      contentText: inhaltText,
      author: /von\s+(.+)$/.exec(metaText)?.[1]?.trim() || undefined,
      imageUrl: firstImageUrl(inhaltHtml, baseUrl),
      tags: parseTags(klassen),
      // Übersichtsseiten kürzen ab und hängen "Lies mehr…" an; auf der
      // Artikelseite steht der vollständige Text.
      truncated: /Lies mehr…/.test(inhaltHtml),
    });
  }

  return beitraege;
}

/**
 * Liest einen einzelnen Beitrag von seiner eigenen Seite — mit vollständigem
 * Text statt des Anrisses.
 */
export function parseArticle(html: string, link: string, baseUrl: string = WEBSITE_BASE_URL): NewsItem | null {
  const beitraege = parseEntries(html, baseUrl);
  if (beitraege.length === 0) return null;

  return { ...beitraege[0], link, id: link, truncated: false };
}

/**
 * Gibt es eine weitere Seite?
 *
 * Die Website zeigt am Fuß der Übersicht einen Verweis auf die nächste Seite.
 * Fehlt er, ist das Archiv zu Ende.
 */
export function hasNextPage(html: string): boolean {
  return /class="next"|href="[^"]*page:\d+/i.test(html);
}
