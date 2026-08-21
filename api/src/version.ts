/**
 * Welche App-Fassung der Server noch bedient (Handoff 16).
 *
 * Zwei Grenzen, und der Unterschied ist der ganze Punkt:
 *
 * - **`mindestVersion`** — darunter ist Schluss. Der Server weist ab
 *   (`426 Upgrade Required`), die App zeigt eine Sperre ohne Ausweg.
 * - **`aktuelleVersion`** — darüber gibt es nichts Neueres. Dazwischen
 *   läuft alles, es gibt nur einen wegwischbaren Hinweis.
 *
 * ## Warum das gegen die andere Regel dieses Projekts steht
 *
 * Am 19.08.2026 haben wir aufgeschrieben: **alte Domainnamen werden nie
 * abgeschaltet**, weil eine ausgelieferte App ihre Serveradresse fest
 * eingebaut trägt und ein toter Name sie tötet
 * (`.claude/memory/alte-adressen-nie-abschalten.md`).
 *
 * Die Mindestversion tut genau das absichtlich. Beides ist richtig, aber
 * der Unterschied muss bewusst bleiben: Ein toter Domainname tötet
 * **wahllos** und ohne Nutzen; eine angehobene Mindestversion tötet
 * **gezielt** und nur, wenn die alte Fassung sonst Falsches täte.
 *
 * Deshalb steht die Zahl in der Umgebung und nicht im Quelltext: Sie
 * anzuheben soll eine Entscheidung sein, kein Nebeneffekt eines Release.
 * Ohne `MINDEST_APP_VERSION` gilt `0.0.0` — **niemand wird ausgesperrt**.
 * Die riskante Richtung braucht die ausdrückliche Angabe, wie überall in
 * diesem Projekt.
 *
 * Wer sie anhebt, sperrt Eltern am Trainingsmorgen aus. Das ist manchmal
 * richtig und nie beiläufig.
 */

import { istAelterAls } from '../../src/domain/fassung.ts';

export interface Versionsauskunft {
  mindestVersion: string;
  aktuelleVersion: string;
  hinweis: string | null;
}

/**
 * Die Auskunft aus der Umgebung.
 *
 * `aktuelleVersion` fällt auf die Fassung des Servers zurück: App und API
 * werden in diesem Projekt gemeinsam hochgezählt, und eine Auskunft, die
 * eine ältere Fassung als „aktuell" nennt, zeigte den Hinweis nie.
 *
 * **`||` und nicht `??`** — der Unterschied ist hier nicht Geschmack. Die
 * Compose-Datei reicht die Werte als `${MINDEST_APP_VERSION:-}` durch, und
 * ohne Eintrag in der `.env` kommt damit eine **leere Zeichenkette** an,
 * kein `undefined`. `??` griffe nicht, und `/version` meldete
 * `mindestVersion: ""`.
 *
 * Gefährlich war das nicht — `liesFassung('')` ist `null`, und dann wird
 * niemand ausgesperrt. Aber die Auskunft war Unsinn, der Kopf
 * `X-MTB-Version` leer, und die App hätte nichts anzuzeigen gehabt.
 * Bemerkt am 21.08.2026 beim Messen gegen den frisch ausgerollten Server;
 * kein Test hätte es gefunden, weil in den Tests niemand die Variable auf
 * `''` setzt — das tut nur Compose.
 */
export function liesAuskunft(serverVersion: string): Versionsauskunft {
  return {
    mindestVersion: process.env.MINDEST_APP_VERSION || '0.0.0',
    aktuelleVersion: process.env.AKTUELLE_APP_VERSION || serverVersion,
    hinweis: process.env.APP_UPDATE_HINWEIS || null,
  };
}

/**
 * Ist diese App zu alt für diesen Server?
 *
 * **Eine fehlende oder unverständliche Angabe gilt als in Ordnung.** Der
 * Kopf `X-App-Version` kommt von einer App, die ihn setzen muss; ältere
 * Fassungen kennen ihn gar nicht. Wer ihn nicht schickt, auszusperren
 * hieße, mit der Einführung dieser Prüfung rückwirkend jede Fassung
 * abzuschalten, die es vorher gab — und das ist genau die wahllose Art zu
 * töten, gegen die der Dateikopf argumentiert.
 *
 * Wer die Sperre umgehen will, lässt den Kopf einfach weg. Das ist kein
 * Loch, sondern die Aufgabenteilung: Diese Prüfung schützt vor
 * **veralteten** Apps, nicht vor böswilligen. Gegen die stehen Token,
 * Rechte und Ratenbegrenzung.
 */
export function istZuAlt(appVersion: string | undefined, mindestVersion: string): boolean {
  return istAelterAls(appVersion, mindestVersion);
}
