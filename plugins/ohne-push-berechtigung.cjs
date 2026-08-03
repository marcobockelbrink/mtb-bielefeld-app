/**
 * Entfernt die Push-Berechtigung, die `expo-notifications` ungefragt setzt.
 *
 * ## Warum
 *
 * `expo-notifications` trägt beim Erzeugen des nativen Projekts
 * `aps-environment` in die Entitlements ein — die Berechtigung für **Remote
 * Push**, also Mitteilungen, die von einem Server kommen.
 *
 * Diese App benutzt das nirgends. Ihre Erinnerungen entstehen auf dem Gerät
 * (`src/notifications/scheduler.ts`), der Verein betreibt keinen Push-Dienst,
 * und im ganzen Quelltext wird kein einziges Push-Token geholt. Die
 * Berechtigung ist also schlicht falsch.
 *
 * Falsch und dazu hinderlich, gleich zweifach:
 *
 * 1. **Der Bau aufs eigene Gerät scheitert daran.** Ein kostenloses Apple
 *    Personal Team darf Push nicht ausstellen und bricht ab mit "Personal
 *    development teams do not support the Push Notifications capability".
 *    Ohne dieses Plugin muss die Berechtigung vor jedem Gerätetest von Hand
 *    aus `ios/` gelöscht werden — und `prebuild` schreibt sie jedes Mal
 *    zurück.
 * 2. **Im App Store führt sie zu Rückfragen.** Wer Push deklariert, aber
 *    nicht benutzt, erklärt das in der Prüfung. Und es widerspricht der
 *    Zusage in HINWEISE.md, dass kein Gerätekennzeichen den Verein erreicht.
 *
 * ## Wenn die App doch einmal Remote-Push bekommt
 *
 * Dann gehört dieser Eintrag aus der Plugin-Liste in `app.json` entfernt —
 * nicht diese Datei angepasst. Ohne `aps-environment` kommt keine
 * Server-Mitteilung an, und der Fehler wäre schwer zu finden.
 *
 * ## Reihenfolge — Vorsicht, sie ist umgekehrt
 *
 * Der Eintrag muss in `app.json` **vor** `expo-notifications` stehen, obwohl
 * er danach wirken soll. Die Mods der Config Plugins bilden eine Kette, und
 * die wird von hinten nach vorn abgearbeitet: Was zuletzt in der Liste steht,
 * läuft zuerst.
 *
 * Nachgemessen, nicht vermutet — steht dieses Plugin am Ende der Liste, sieht
 * es leere Entitlements und hat nichts zu löschen. `expo-notifications` trägt
 * die Berechtigung danach ein, und sie landet in der Datei.
 */

const { withEntitlementsPlist } = require('expo/config-plugins');

/** @type {import('expo/config-plugins').ConfigPlugin} */
module.exports = function ohnePushBerechtigung(config) {
  return withEntitlementsPlist(config, (konfiguration) => {
    delete konfiguration.modResults['aps-environment'];
    return konfiguration;
  });
};
