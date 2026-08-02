/**
 * Laden der Barlow-Schnitte.
 *
 * Die Schriften liegen als Dateien in der App — nichts wird nachgeladen, die
 * App bleibt auch ohne Empfang vollständig. Geladen werden nur die sechs
 * Schnitte, die `src/theme.ts` benennt; jeder weitere würde die App nur größer
 * machen.
 *
 * Schlägt das Laden fehl, gilt die App trotzdem als bereit: React Native fällt
 * dann auf die Systemschrift zurück. Ein Schriftproblem darf niemanden vor
 * einem leeren Bildschirm stehen lassen.
 */

import { Barlow_400Regular } from '@expo-google-fonts/barlow/400Regular';
import { Barlow_500Medium } from '@expo-google-fonts/barlow/500Medium';
import { Barlow_600SemiBold } from '@expo-google-fonts/barlow/600SemiBold';
import { BarlowCondensed_600SemiBold } from '@expo-google-fonts/barlow-condensed/600SemiBold';
import { BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed/700Bold';
import { BarlowSemiCondensed_600SemiBold } from '@expo-google-fonts/barlow-semi-condensed/600SemiBold';
import { useFonts } from 'expo-font';

/** `true`, sobald gezeichnet werden darf — geladen oder endgültig gescheitert. */
export function useAppFonts(): boolean {
  const [geladen, fehler] = useFonts({
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_600SemiBold,
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
    BarlowSemiCondensed_600SemiBold,
  });

  return geladen || fehler !== null;
}
