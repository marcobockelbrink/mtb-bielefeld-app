/**
 * Die Vereinsfarben — eine Quelle für App, Symbole und Startbild.
 *
 * ## Verbindlich ist die Druckdefinition
 *
 *     Blau:    C 90 | M 50 | Y 20 | K 5
 *     Schwarz: reines Schwarz
 *
 * Nachgeprüft an der Logodatei: Sie enthält genau diese Werte (gemessen
 * C 90,6 M 52,9 Y 18,8 K 3,9 — die Abweichung stammt aus der 8-Bit-Speicherung).
 *
 * ## Vom Druck auf den Bildschirm
 *
 * Ein Bildschirm kennt kein CMYK, und die Umrechnung hat kein einzelnes
 * richtiges Ergebnis — sie hängt am Farbprofil. Gemessen wurde (Abstand in ΔE,
 * unter 2 heißt für das Auge gleich, über 5 deutlich verschieden):
 *
 * | Weg                                  | Ergebnis  |
 * |--------------------------------------|-----------|
 * | ICC-Umrechnung der Druckfarbe        | `#25749e` |
 * | so rendert Ghostscript die Logodatei | `#076c9b` |
 * | Stylesheet der Vereinswebsite        | `#00679a` |
 * | Faustformel ohne Farbmanagement      | `#1879c2` |
 *
 * Verwendet wird die **ICC-Umrechnung**: Sie ist der einzige Wert, der sich
 * unmittelbar aus der offiziellen Druckdefinition ergibt, statt aus einer
 * Wiedergabe davon. Die drei erstgenannten liegen ohnehin in derselben
 * Farbfamilie (ΔE 3,5 bis 7,9 untereinander).
 *
 * Die Faustformel scheidet aus: Sie liegt mit ΔE über 14 von allen anderen
 * entfernt und ergäbe ein sichtbar helleres, bunteres Blau.
 *
 * ## Zum Ändern
 *
 * Nennt der Verein einen eigenen HEX-Wert für digitale Anwendungen, gehört er
 * hierher — er schlägt jede Umrechnung. Danach einmal
 * `python3 tools/logo-assets.py` laufen lassen, damit Symbole und Startbild
 * nachziehen. `python3 tools/farbe-pruefen.py` zeigt die Abstände.
 */

/** Die Druckdefinition des Vereinsblaus, in Prozent. */
export const BRAND_BLUE_CMYK = { c: 90, m: 50, y: 20, k: 5 } as const;

/** Das Vereinsblau als Bildschirmfarbe. */
export const BRAND_BLUE = '#25749e';

/**
 * Schwarz aus dem Logo — im Schriftzug, nicht in der Oberfläche.
 *
 * Für Fließtext auf hellem Grund nutzt die App bewusst kein reines Schwarz,
 * sondern ein sehr dunkles Blaugrau: Reines Schwarz auf Weiß erzeugt auf
 * Bildschirmen einen harten Kontrast, der beim Lesen längerer Texte ermüdet.
 */
export const BRAND_BLACK = '#000000';
