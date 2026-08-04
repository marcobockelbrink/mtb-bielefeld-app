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
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { API_BASE_URL } from '../config';
import { ApiZugang } from '../data/api';
import { secureTokenSpeicher } from '../data/secureTokenSpeicher';
import type { TokenSpeicher } from '../data/tokenSpeicher';
import { beschreibeEinloesenFehler } from './einloesenFehler';
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
  /**
   * Deutscher Satz, wenn das Einlösen des zuletzt angetippten Links
   * fehlgeschlagen ist — `null`, solange nichts schiefgegangen ist oder das
   * Problem behoben wurde (neuer Link angefordert, neuer Link eingelöst).
   */
  einloesenFehlgeschlagen: string | null;
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
  const [einloesenFehlgeschlagen, setEinloesenFehlgeschlagen] = useState<string | null>(null);
  // `Linking.getInitialURL()` und das `url`-Ereignis liefern je nach
  // Plattform gelegentlich dieselbe Adresse doppelt. Ein Magic Link gilt
  // aber nur einmal — der zweite Versuch schlüge zwangsläufig fehl und
  // zeigte "Link gilt nicht mehr", obwohl die Anmeldung gerade geklappt hat.
  // Der zuletzt behandelte Token merkt sich das, ohne einen Rerender zu
  // brauchen.
  const zuletztVersuchterToken = useRef<string | null>(null);

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
      // Derselbe Link kann zweimal ankommen (Anfangsadresse und Ereignis) —
      // eine Wiederholung bleibt stumm liegen, statt einen frischen Erfolg
      // mit einer falschen Fehlermeldung zu überschreiben.
      if (token === zuletztVersuchterToken.current) return;
      zuletztVersuchterToken.current = token;
      try {
        await api.loeseEin(token);
        setAngemeldet(true);
        setZuletztEingeloest(Date.now());
        setEinloesenFehlgeschlagen(null);
      } catch (fehler) {
        // Ein abgelaufener Link ist Alltag, kein Absturz — aber die Person
        // muss ihn sehen: sonst passiert nach dem Antippen sichtbar gar
        // nichts. `console.warn` bleibt zusätzlich für den Betreiber.
        console.warn('Anmeldelink ließ sich nicht einlösen:', fehler);
        setEinloesenFehlgeschlagen(beschreibeEinloesenFehler(fehler));
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
      einloesenFehlgeschlagen,
      anmeldungAnfordern: async (email, code) => {
        // Ein neu angeforderter Link löst das alte Problem ab — ein
        // stehengebliebener Hinweis wäre sonst eine Lüge über einen bereits
        // erledigten Fehler.
        setEinloesenFehlgeschlagen(null);
        await api.fordereAnmeldungAn(email, code);
      },
      abmelden: async () => {
        await api.abmelden();
        setAngemeldet(false);
      },
    }),
    [angemeldet, laedt, api, zuletztEingeloest, einloesenFehlgeschlagen],
  );

  return <Kontext.Provider value={wert}>{children}</Kontext.Provider>;
}

export function useKonto(): KontoZustand {
  const wert = useContext(Kontext);
  if (!wert) throw new Error('useKonto braucht einen KontoProvider darüber.');
  return wert;
}
