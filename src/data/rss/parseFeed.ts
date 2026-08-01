/**
 * Liest den RSS-Feed der Vereinswebsite.
 *
 * Bewusst ohne XML-Bibliothek: Der Feed ist klein, hat ein festes Format, und
 * eine zusätzliche Abhängigkeit lohnt dafür nicht. Der Parser ist entsprechend
 * nachsichtig — kaputte Einträge werden übersprungen, statt den ganzen Feed
 * scheitern zu lassen.
 */

import { WEBSITE_BASE_URL } from '../../config';
import type { NewsItem } from '../../domain/types';
import { decodeEntities, firstImageUrl, htmlToText, truncate } from '../parse/html';

/** Holt den Inhalt eines Elements, egal ob als CDATA oder als Text. */
function extractTag(xml: string, tagName: string): string | undefined {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)</${tagName}>`, 'i');
  const match = pattern.exec(xml);
  if (!match) return undefined;

  const raw = match[1].trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(raw);
  return cdata ? cdata[1] : raw;
}

/**
 * Liest ein Veröffentlichungsdatum.
 *
 * RSS schreibt es im Format "Thu, 23 Jul 2026 20:28:51 +0000", das `Date`
 * versteht. Bei ungültigem Datum lieber nichts als ein falsches Datum.
 */
function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value.trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Liest den Feed und liefert die Beiträge, neueste zuerst. */
export function parseFeed(xml: string, baseUrl: string = WEBSITE_BASE_URL): NewsItem[] {
  const items: NewsItem[] = [];
  const itemPattern = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;

  for (const match of xml.matchAll(itemPattern)) {
    const block = match[1];

    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link');
    if (!title || !link) continue; // Ohne Titel oder Link ist der Eintrag nutzlos.

    const contentHtml = extractTag(block, 'content:encoded') ?? extractTag(block, 'description') ?? '';
    const contentText = htmlToText(contentHtml);
    const descriptionText = htmlToText(extractTag(block, 'description') ?? '');
    const publishedAt = parseDate(extractTag(block, 'pubDate'));

    items.push({
      // Der Feed hängt an die GUID einen Zeitstempel; der Link ist stabiler.
      id: extractTag(block, 'guid') ?? link,
      title: decodeEntities(title).trim(),
      link: decodeEntities(link).trim(),
      publishedAt: publishedAt ?? new Date(0),
      summary: descriptionText || truncate(contentText, 200),
      contentHtml,
      contentText,
      author: extractTag(block, 'dc:creator')?.trim() || undefined,
      imageUrl: firstImageUrl(contentHtml, baseUrl),
    });
  }

  items.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  return items;
}
