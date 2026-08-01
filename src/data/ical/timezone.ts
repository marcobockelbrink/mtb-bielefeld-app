/**
 * Umrechnung zwischen Ortszeit ("Wanduhrzeit") und echtem Zeitpunkt.
 *
 * Warum das nötig ist: Der MittwochsRudel-Termin startet "jeden Mittwoch um
 * 18:00 Uhr in Bielefeld". Das ist im Sommer ein anderer Zeitpunkt als im
 * Winter. Serientermine müssen deshalb in Ortszeit ausgerechnet und erst danach
 * in echte Zeitpunkte umgerechnet werden — sonst verschiebt sich das Rudel bei
 * der Zeitumstellung um eine Stunde.
 */

/**
 * Eine Wanduhrzeit ohne Zeitzone, kodiert als Millisekunden.
 *
 * Trick: Wir rechnen mit `Date.UTC`, tun also so, als wäre die Ortszeit UTC.
 * Damit funktioniert normale Datumsarithmetik, ohne dass eine Zeitzone
 * dazwischenfunkt. Erst `wallTimeToInstant` macht daraus einen echten Zeitpunkt.
 */
export type WallTime = number;

export interface DateTimeFields {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function fieldsToWallTime(f: DateTimeFields): WallTime {
  return Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second);
}

export function wallTimeToFields(w: WallTime): DateTimeFields {
  const d = new Date(w);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  };
}

/** Wochentag der Wanduhrzeit: 0 = Sonntag … 6 = Samstag (wie `Date.getDay`). */
export function wallTimeWeekday(w: WallTime): number {
  return new Date(w).getUTCDay();
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat | null {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    // Ein Probeaufruf: manche Engines akzeptieren die Zeitzone erst hier nicht.
    formatter.format(0);
    formatterCache.set(timeZone, formatter);
    return formatter;
  } catch {
    return null;
  }
}

/**
 * Notlösung für JS-Engines ohne Zeitzonendaten: die mitteleuropäische Regel.
 *
 * Sommerzeit vom letzten Sonntag im März 01:00 UTC bis zum letzten Sonntag im
 * Oktober 01:00 UTC. Deckt Europe/Berlin und Europe/Amsterdam ab — die einzigen
 * Zeitzonen, die im Vereinskalender vorkommen.
 */
function centralEuropeanOffsetMs(instant: number): number {
  const year = new Date(instant).getUTCFullYear();
  const lastSundayUtc = (month: number): number => {
    // Tag 0 des Folgemonats ist der letzte Tag des gesuchten Monats.
    const lastDay = new Date(Date.UTC(year, month + 1, 0));
    const day = lastDay.getUTCDate() - lastDay.getUTCDay();
    return Date.UTC(year, month, day, 1, 0, 0);
  };
  const summerStart = lastSundayUtc(2); // März
  const summerEnd = lastSundayUtc(9); // Oktober
  const isSummer = instant >= summerStart && instant < summerEnd;
  return (isSummer ? 2 : 1) * 60 * 60 * 1000;
}

/** Verschiebung der Zeitzone gegenüber UTC zu einem gegebenen Zeitpunkt. */
export function timeZoneOffsetMs(instant: number, timeZone: string): number {
  const formatter = getFormatter(timeZone);
  if (!formatter) return centralEuropeanOffsetMs(instant);

  const parts = formatter.formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    return part ? Number(part.value) : 0;
  };
  // `hourCycle: 'h23'` sollte 0-23 liefern; einzelne Engines geben trotzdem 24
  // für Mitternacht zurück.
  const hour = get('hour') % 24;
  const asIfUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return asIfUtc - instant;
}

/**
 * Ortszeit → echter Zeitpunkt.
 *
 * Zwei Durchläufe, weil die Verschiebung selbst vom Ergebnis abhängt: Der erste
 * Durchlauf schätzt, der zweite korrigiert an Zeitumstellungstagen.
 */
export function wallTimeToInstant(wall: WallTime, timeZone: string): number {
  const firstGuess = wall - timeZoneOffsetMs(wall, timeZone);
  const offset = timeZoneOffsetMs(firstGuess, timeZone);
  return wall - offset;
}

/** Echter Zeitpunkt → Ortszeit. */
export function instantToWallTime(instant: number, timeZone: string): WallTime {
  return instant + timeZoneOffsetMs(instant, timeZone);
}
