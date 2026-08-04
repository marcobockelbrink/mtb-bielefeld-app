/**
 * Wo das Erneuerungs-Token liegt.
 *
 * Im Schlüsselbund des Geräts (iOS Keychain, Android Keystore), nicht in
 * AsyncStorage: Dort liegt alles im Klartext, und ein Token, das 60 Tage
 * gilt, gehört nicht offen auf die Platte.
 *
 * Die Schnittstelle steht getrennt von der Umsetzung, damit Tests einen
 * Speicher im Arbeitsspeicher einsetzen können — dasselbe Muster wie bei
 * `KeyValueStore` in `store.ts`.
 *
 * Die schlüsselbundgestützte Umsetzung (`secureTokenSpeicher`) steht bewusst
 * in einer eigenen Datei, `secureTokenSpeicher.ts`: Sie zieht über
 * `expo-secure-store` React Native nach, und dessen Quelltext benutzt
 * Flow-Syntax, die vitest (ohne Babel-Transformation für React Native) nicht
 * einlesen kann. Landete der Import hier, würde schon das bloße Einbinden
 * dieser Datei — auch nur wegen `speicherImArbeitsspeicher` — jeden Test
 * zum Absturz bringen. Dasselbe Muster wie `store.ts` gegenüber
 * `asyncStorageStore.ts`.
 */

export interface TokenSpeicher {
  lies(): Promise<string | null>;
  schreib(token: string): Promise<void>;
  loesche(): Promise<void>;
}

/** Für Tests: hält das Token im Arbeitsspeicher. */
export function speicherImArbeitsspeicher(anfangswert: string | null = null): TokenSpeicher {
  let wert = anfangswert;
  return {
    lies: async () => wert,
    schreib: async (token) => {
      wert = token;
    },
    loesche: async () => {
      wert = null;
    },
  };
}
