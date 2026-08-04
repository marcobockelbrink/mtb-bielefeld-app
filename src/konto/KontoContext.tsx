/**
 * Wer ist angemeldet — und was passiert, wenn jemand den Link antippt.
 *
 * Ein eigener Kontext neben `AppDataContext`, nicht darin: Termine und
 * Beiträge sind für jeden da, das Konto ist es nicht. Wer die App nie
 * anmeldet, merkt von diesem Kontext nichts außer einem `angemeldet: false`.
 */

import * as Linking from 'expo-linking';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { API_BASE_URL } from '../config';
import { ApiZugang } from '../data/api';
import { secureTokenSpeicher } from '../data/secureTokenSpeicher';
import type { TokenSpeicher } from '../data/tokenSpeicher';
import { extrahiereMagicToken } from './magicLink';

export interface KontoZustand {
  angemeldet: boolean;
  /** Erster Blick in den Schlüsselbund läuft noch. */
  laedt: boolean;
  api: ApiZugang;
  anmeldungAnfordern(email: string, code?: string): Promise<void>;
  abmelden(): Promise<void>;
  /** Zuletzt eingelöster Link — die Oberfläche zeigt danach eine Bestätigung. */
  zuletztEingeloest: number | null;
}

const Kontext = createContext<KontoZustand | null>(null);

export function KontoProvider({
  children,
  speicher = secureTokenSpeicher,
  basisUrl = API_BASE_URL,
}: {
  children: ReactNode;
  speicher?: TokenSpeicher;
  basisUrl?: string;
}) {
  const api = useMemo(() => new ApiZugang({ basisUrl, speicher }), [basisUrl, speicher]);
  const [angemeldet, setAngemeldet] = useState(false);
  const [laedt, setLaedt] = useState(true);
  const [zuletztEingeloest, setZuletztEingeloest] = useState<number | null>(null);

  // Beim Start einmal in den Schlüsselbund sehen.
  useEffect(() => {
    let abgebrochen = false;
    void api
      .istAngemeldet()
      .then((wert) => {
        if (!abgebrochen) setAngemeldet(wert);
      })
      .finally(() => {
        if (!abgebrochen) setLaedt(false);
      });
    return () => {
      abgebrochen = true;
    };
  }, [api]);

  const loeseEin = useCallback(
    async (url: string) => {
      const token = extrahiereMagicToken(url);
      if (!token) return;
      try {
        await api.loeseEin(token);
        setAngemeldet(true);
        setZuletztEingeloest(Date.now());
      } catch (fehler) {
        // Ein abgelaufener Link ist Alltag, kein Absturz. Die Oberfläche
        // erfährt es über `angemeldet: false`; wer den Grund sehen will,
        // fordert einen neuen Link an.
        console.warn('Anmeldelink ließ sich nicht einlösen:', fehler);
      }
    },
    [api],
  );

  // Zwei Wege: Die App lag im Hintergrund (Ereignis) oder wurde vom Link
  // erst gestartet (Anfangsadresse).
  useEffect(() => {
    const abo = Linking.addEventListener('url', ({ url }) => void loeseEin(url));
    void Linking.getInitialURL().then((url) => {
      if (url) void loeseEin(url);
    });
    return () => abo.remove();
  }, [loeseEin]);

  const wert = useMemo<KontoZustand>(
    () => ({
      angemeldet,
      laedt,
      api,
      zuletztEingeloest,
      anmeldungAnfordern: (email, code) => api.fordereAnmeldungAn(email, code),
      abmelden: async () => {
        await api.abmelden();
        setAngemeldet(false);
      },
    }),
    [angemeldet, laedt, api, zuletztEingeloest],
  );

  return <Kontext.Provider value={wert}>{children}</Kontext.Provider>;
}

export function useKonto(): KontoZustand {
  const wert = useContext(Kontext);
  if (!wert) throw new Error('useKonto braucht einen KontoProvider darüber.');
  return wert;
}
