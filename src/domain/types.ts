/**
 * Die Datentypen, mit denen die Oberfläche arbeitet.
 *
 * Diese Typen sind bewusst unabhängig von iCal und RSS: Woher die Daten kommen,
 * ist für die Screens nicht sichtbar.
 */

/** Grobe Einordnung eines Termins — steuert Icon, Farbe und Filter. */
export type EventCategory =
  | 'tour'
  | 'fahrtechnik'
  | 'treff'
  | 'ausflug'
  | 'werkstatt'
  | 'jugend'
  | 'racing'
  | 'verein'
  | 'sonstiges';

/** Für wen ein Termin gedacht ist. Ein Termin kann mehrere Stufen ansprechen. */
export type SkillLevel = 'einsteiger' | 'aufsteiger' | 'fortgeschritten' | 'koenner';

/**
 * Eine Sterne-Angabe aus der Terminbeschreibung.
 *
 * Der Verein schreibt teils einen festen Wert ("⭐⭐"), teils eine Spanne
 * ("⭐ bis ⭐⭐⭐" oder "⭐/⭐⭐"). Beides wird als Spanne abgebildet; bei einem
 * festen Wert sind `min` und `max` gleich.
 */
export interface StarRange {
  min: number;
  max: number;
}

/** Aus der Terminbeschreibung herausgelesene Tourdaten. */
export interface RideDetails {
  guides: string[];
  /** "Ausdauer:" — wie fit man sein muss. */
  endurance?: StarRange;
  /** "Fahrtechnik:" — wie gut man fahren können muss. */
  technique?: StarRange;
  /** "Trail-Anteil:" — z.B. "gering", "hoch". */
  trailShare?: string;
  /** "Schwierigkeitsgrad:" — z.B. "flowig", "einfach bis schwer". */
  difficulty?: string;
  /** "Abfahrtsort:" — oft genauer als das Kalenderfeld "Ort". */
  meetingPoint?: string;
  /** "Uhrzeit & Dauer:" im Originalwortlaut. */
  timeAndDuration?: string;
  distanceKm?: number;
  elevationM?: number;
  maxParticipants?: number;
  /** Link aus "Anmeldung unter:". */
  signupUrl?: string;
}

/** Ein einzelner Termin — bei Serien ein konkreter Einzeltermin, nicht die Serie. */
export interface ClubEvent {
  /** Eindeutig je Einzeltermin: UID der Serie plus Startzeitpunkt. */
  id: string;
  /** UID aus dem Kalender. Bei Serien für alle Einzeltermine gleich. */
  uid: string;
  title: string;
  start: Date;
  end: Date;
  /** Ganztägig — dann ist die Uhrzeit bedeutungslos. */
  allDay: boolean;
  /** Ortsangabe aus dem Kalenderfeld, z.B. "Johannisberg, 33617 Bielefeld". */
  location?: string;
  descriptionHtml: string;
  /** Beschreibung ohne HTML, für Suche und Vorschau. */
  descriptionText: string;
  category: EventCategory;
  levels: SkillLevel[];
  /** Termin richtet sich ausdrücklich an Frauen ("Ladies Only"). */
  ladiesOnly: boolean;
  /** Der Verein hat den Termin abgesagt (erkannt an Titel oder Kalenderstatus). */
  cancelled: boolean;
  /** Teil einer Serie wie dem MittwochsRudel. */
  recurring: boolean;
  details: RideDetails;
}

/** Ein Beitrag aus "Aktuelles" auf der Website. */
export interface NewsItem {
  id: string;
  title: string;
  /** Link auf den vollständigen Beitrag auf mtb-bielefeld.de. */
  link: string;
  publishedAt: Date;
  /** Kurzfassung als reiner Text. */
  summary: string;
  /** Vollständiger Beitrag als HTML, so wie ihn die Website liefert. */
  contentHtml: string;
  /** Beitrag als reiner Text — für die Anzeige ohne WebView. */
  contentText: string;
  author?: string;
  /** Erstes Bild im Beitrag, als absolute URL. */
  imageUrl?: string;
  /**
   * Themen des Beitrags, wie der Verein sie auf der Website vergibt —
   * z.B. "Racing", "Jugend", "Naturschutz".
   *
   * Grundlage der Themenfilter im Reiter "Aktuelles". Leer, wenn der Beitrag
   * aus dem RSS-Feed stammt: Der Feed nennt keine Themen.
   */
  tags: string[];
  /**
   * Der Text ist nur ein Anriss; der vollständige Beitrag steht auf der
   * Website. Übersichtsseiten kürzen nach wenigen Zeilen ab.
   */
  truncated?: boolean;
}

/**
 * Ergebnis eines Ladevorgangs.
 *
 * `fromCache` sagt der Oberfläche, ob sie gerade Daten aus dem Speicher zeigt —
 * wichtig im Wald ohne Empfang, wo veraltete Daten besser sind als keine.
 */
export interface LoadResult<T> {
  data: T;
  fromCache: boolean;
  /** Wann die Daten zuletzt erfolgreich vom Server geholt wurden. */
  fetchedAt: Date | null;
  /** Gesetzt, wenn die Aktualisierung fehlschlug, aber Zwischenspeicher da war. */
  error?: Error;
}
