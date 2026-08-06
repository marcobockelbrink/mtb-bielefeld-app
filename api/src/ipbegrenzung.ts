/**
 * Ratenbegrenzung je IP, im Arbeitsspeicher — die Notbremse hinter Caddy.
 *
 * `betrieb/Caddyfile` ist die eigentliche IP-Schicht, aber sie
 * hängt an der Reihenfolge der Inbetriebnahme: Wer die API testweise
 * exponiert, bevor Caddy davor steht, oder Caddy bei einem Umbau falsch
 * konfiguriert, steht ohne sie da. Diese Klasse ersetzt Caddy nicht — sie
 * sorgt nur dafür, dass ein solcher Konfigurationsfehler kein offenes
 * Scheunentor ist. Die Einbindung steht in `app.ts`.
 *
 * Reine Rechenlogik, ohne Fastify und ohne laufenden Server prüfbar: ein
 * gleitendes Fenster je Schlüssel (üblicherweise die IP-Adresse), ganz wie
 * die Begrenzung je Adresse in `anmeldung.ts` — nur ohne Datenbank, denn
 * hier zählt nicht die Adresse aus dem Anfragekörper, sondern schlicht, wie
 * oft dieselbe Verbindung anklopft.
 *
 * Im Arbeitsspeicher ist hier richtig, nicht nachlässig: Bei einem Neustart
 * ist die Zählung weg, und das ist in Ordnung, weil diese Schicht nur eine
 * Notbremse gegen eine Flut ist, keine dauerhafte Schutzschicht. Die
 * dauerhaften Schichten — Begrenzung je Adresse, globales Stundenbudget —
 * liegen in der Datenbank (`anmeldung.ts`) und überleben jeden Neustart.
 * Eine Redis-Anbindung wäre ein zweites bewegliches Teil für ein Problem
 * dieser Größe: eine Handvoll Anfragen je Minute, von einem einzelnen
 * Prozess geprüft.
 */

/** Wie viele Aufrufe von `erlaubt` zwischen zwei vollständigen Aufräumdurchgängen liegen. */
const AUFRAEUM_INTERVALL = 500;

export class IpBegrenzung {
  private readonly hoechstens: number;
  private readonly fensterMs: number;

  /** Je Schlüssel die Zeitpunkte der noch im Fenster liegenden, erlaubten Zugriffe. */
  private readonly zeitpunkte = new Map<string, number[]>();

  /** Zählt die Aufrufe von `erlaubt` seit dem letzten vollständigen Aufräumen. */
  private aufrufeSeitAufraeumen = 0;

  constructor(hoechstens: number, fensterMs: number) {
    this.hoechstens = hoechstens;
    this.fensterMs = fensterMs;
  }

  /**
   * Ob unter `schluessel` gerade noch ein Zugriff erlaubt ist, und trägt ihn
   * bei Erlaubnis gleich ein.
   *
   * Geprüft und eingetragen als eine Operation, nicht getrennt: Käme dazwischen
   * ein zweiter Aufruf für denselben Schlüssel zum Zug, sähen beide denselben
   * Stand und beide kämen durch — dieselbe Art von Wettlauf, die
   * `legeAnWennDieBegrenzungEsZulaesst` in `anmeldung.ts` bei der
   * Begrenzung je Adresse vermeidet. Hier braucht es dafür keine Sperre: Ein
   * einzelner Node-Prozess arbeitet diese Methode ohnehin nie zwei Aufrufe
   * gleichzeitig ab, es gibt zwischen dem Lesen und dem Schreiben keinen
   * `await`, der etwas anderes dazwischenließe.
   *
   * Räumt bei dieser Gelegenheit auch veraltete Zeitpunkte für **diesen**
   * Schlüssel weg (das Fenster ist gleitend, nicht fest) — und stößt alle
   * `AUFRAEUM_INTERVALL` Aufrufe einen vollständigen Durchgang über **alle**
   * Schlüssel an. Ohne diesen zweiten Teil bliebe jeder einmal gesehene
   * Schlüssel für immer in der Map stehen, auch wenn sein Fenster längst
   * leer ist — dieselbe Art von unbegrenztem Wachstum, die dieses Projekt an
   * anderer Stelle schon zweimal beheben musste (`HOECHSTENS_GLEICHZEITIG`
   * in `app.ts`, das Aufräumen in `aufraeumen.ts`). Ein Angreifer, der mit
   * wechselnden Absenderadressen anklopft, bekäme sonst bei jedem Versuch
   * einen neuen, nie wieder entfernten Eintrag.
   */
  erlaubt(schluessel: string, jetzt: number): boolean {
    const fensteranfang = jetzt - this.fensterMs;
    const bisherige = this.zeitpunkte.get(schluessel) ?? [];
    const nochGueltige = bisherige.filter((zeitpunkt) => zeitpunkt > fensteranfang);

    const istErlaubt = nochGueltige.length < this.hoechstens;
    if (istErlaubt) nochGueltige.push(jetzt);

    if (nochGueltige.length > 0) {
      this.zeitpunkte.set(schluessel, nochGueltige);
    } else {
      this.zeitpunkte.delete(schluessel);
    }

    this.aufrufeSeitAufraeumen += 1;
    if (this.aufrufeSeitAufraeumen >= AUFRAEUM_INTERVALL) {
      this.aufrufeSeitAufraeumen = 0;
      this.raeumeAuf(jetzt);
    }

    return istErlaubt;
  }

  /**
   * Entfernt jeden Schlüssel, dessen Fenster vollständig abgelaufen ist.
   *
   * Läuft periodisch aus `erlaubt` selbst (siehe dort), steht aber auch für
   * sich zur Verfügung — für einen eigenen Zeitgeber im Betrieb und für
   * Tests, die einen Aufräumdurchgang ohne Umweg über hunderte Aufrufe
   * auslösen wollen.
   */
  raeumeAuf(jetzt: number): void {
    const fensteranfang = jetzt - this.fensterMs;
    for (const [schluessel, zeitpunkte] of this.zeitpunkte) {
      if (zeitpunkte.every((zeitpunkt) => zeitpunkt <= fensteranfang)) {
        this.zeitpunkte.delete(schluessel);
      }
    }
  }

  /** Wie viele Schlüssel derzeit gespeichert sind — für Tests, sonst ungenutzt. */
  get anzahlSchluessel(): number {
    return this.zeitpunkte.size;
  }
}
