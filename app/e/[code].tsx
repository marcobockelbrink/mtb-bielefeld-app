/**
 * Landeplatz des Ein-Klick-Einladungslinks (`https://<api>/e/<code>`).
 *
 * Wie `anmeldung/[token]`: Der Code wird hier **nicht** eingelöst — das tut
 * `KontoContext` für alle eingehenden Links zentral, egal ob die App dafür
 * gestartet wurde oder schon lief. Dieser Bildschirm zeigt nur, dass etwas
 * passiert, und exportiert deshalb schlicht denselben Bildschirm.
 */

export { default } from '../anmeldung/[token]';
