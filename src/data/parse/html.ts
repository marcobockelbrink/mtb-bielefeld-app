/**
 * Wandelt HTML in lesbaren Text.
 *
 * Sowohl die Terminbeschreibungen aus Google Kalender als auch die Beiträge aus
 * dem RSS-Feed enthalten HTML. Beides soll in der App ohne eingebettete
 * Webansicht darstellbar sein.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  szlig: 'ß',
  auml: 'ä',
  ouml: 'ö',
  uuml: 'ü',
  Auml: 'Ä',
  Ouml: 'Ö',
  Uuml: 'Ü',
  euro: '€',
  hellip: '…',
  ndash: '–',
  mdash: '—',
  laquo: '«',
  raquo: '»',
  bdquo: '„',
  ldquo: '“',
  rdquo: '”',
  sbquo: '‚',
  lsquo: '‘',
  rsquo: '’',
  deg: '°',
};

/** Löst benannte und nummerische HTML-Entitäten auf (`&amp;`, `&#039;`, `&#x27;`). */
export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const isHex = entity[1] === 'x' || entity[1] === 'X';
      const code = Number.parseInt(isHex ? entity.slice(2) : entity.slice(1), isHex ? 16 : 10);
      if (Number.isFinite(code) && code > 0) {
        try {
          return String.fromCodePoint(code);
        } catch {
          return match;
        }
      }
      return match;
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

/**
 * HTML zu Text — Absätze und Zeilenumbrüche bleiben als Leerzeilen erhalten.
 *
 * Die Struktur ist wichtig: Der Beschreibungs-Parser erkennt Angaben wie
 * "Fahrtechnik: ⭐⭐" daran, dass sie am Zeilenanfang stehen.
 */
export function htmlToText(html: string): string {
  if (!html) return '';
  return decodeEntities(
    html
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6])\s*>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '\n• ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Erstes `<img src="…">` als absolute URL, für die Vorschaubilder im News-Feed. */
export function firstImageUrl(html: string, baseUrl: string): string | undefined {
  const match = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i.exec(html);
  if (!match) return undefined;
  const source = decodeEntities(match[1]).trim();
  if (!source) return undefined;
  if (/^https?:\/\//i.test(source)) return source;
  if (source.startsWith('//')) return `https:${source}`;
  return `${baseUrl.replace(/\/$/, '')}/${source.replace(/^\//, '')}`;
}

/** Kürzt Text auf eine Vorschaulänge, ohne Wörter zu zerschneiden. */
export function truncate(text: string, maxLength: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= maxLength) return collapsed;
  const cut = collapsed.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
