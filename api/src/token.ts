/**
 * Zufällige Token und ihre Hashes.
 *
 * In der Datenbank steht ausschließlich der Hash. Wer sie erbeutet, hält
 * damit nichts in der Hand, womit er sich anmelden könnte.
 *
 * Bewusst SHA-256 und **nicht** bcrypt oder Argon2: Das sind Zufallswerte
 * mit 256 Bit Entropie, keine Passwörter. Gegen Raten hilft hier die Länge,
 * nicht ein langsames Verfahren — langsames Hashen kostete nur Rechenzeit
 * bei jeder Anfrage.
 */

import { createHash, randomBytes } from 'node:crypto';

/** 32 zufällige Bytes, adresstauglich kodiert. */
export function erzeugeToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 als Hexadezimaltext. */
export function hashe(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
