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
import { setzeAbonnement } from '../data/jugend';
import { secureTokenSpeicher } from '../data/secureTokenSpeicher';
import type { TokenSpeicher } from '../data/tokenSpeicher';
import { beschreibeEinloesenFehler } from './einloesenFehler';
import { extrahiereMagicToken } from './magicLink';

export interface KontoZustand {
  angemeldet: boolean;
  /** Erster Blick in den Schlüsselbund läuft noch. */
  laedt: boolean;
  api: ApiZugang;
  /**
   * `'mitglied' | 'guide' | 'verwaltung'` aus `GET /konto` — `null`, solange
   * niemand angemeldet ist oder die Abfrage noch nicht zurück ist.
   *
   * **Reine Anzeigehilfe, keine Absicherung.** Sie blendet Guide-Knöpfe ein,
   * die sonst in ein 403 liefen — die API prüft die Rolle bei jedem eigenen
   * Aufruf selbst, unabhängig davon, was hier steht. Wer diese Rolle als
   * Schutz behandelt (etwa eine Aktion freischaltet, die die API nicht auch
   * selbst prüft), baut eine Prüfung, die nur in der App steht und sich mit
   * einem manipulierten Client umgehen lässt.
   */
  rolle: string | null;
  /**
   * Abonnement für „neues Jugendtraining veröffentlicht" — `null`, solange
   * niemand angemeldet ist oder `GET /konto` noch nicht zurück ist. Kommt aus
   * demselben Aufruf wie `rolle`, siehe dort.
   */
  jugendBenachrichtigung: boolean | null;
  /**
   * Ändert das Abonnement optimistisch: Die Anzeige springt sofort um, ein
   * Fehlschlag nimmt sie zurück. Der Schalter, der `an` auslöst, bliebe sonst
   * eine Sekunde ohne Reaktion stehen — und würde ein zweites Mal angetippt,
   * bevor die erste Antwort da ist.
   */
  setzeJugendBenachrichtigung(an: boolean): Promise<void>;
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
  const [angemeldet, setAngemeldet] = useState(false);
  // `beiSitzungsende` schließt die Lücke zwischen Datenschicht und Anzeige:
  // Wirft der Server das Erneuerungs-Token weg, löscht `api.ts` es auch hier
  // — ohne diesen Rückruf bliebe `angemeldet: true` stehen, und die
  // Anmeldekarte zeigte weiter „Du bist angemeldet." samt Abmelden-Knopf,
  // aber ohne Formular, mit dem man dem Rat „melde dich neu an" folgen
  // könnte.
  const api = useMemo(
    () => new ApiZugang({ basisUrl, speicher, beiSitzungsende: () => setAngemeldet(false) }),
    [basisUrl, speicher],
  );
  const [laedt, setLaedt] = useState(true);
  const [rolle, setRolle] = useState<string | null>(null);
  const [jugendBenachrichtigung, setJugendBenachrichtigung] = useState<boolean | null>(null);
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

  // Rolle und Abonnement hängen an der Sitzung, nicht an einer eigenen
  // Aktion — sie folgen deshalb `angemeldet`, statt dass jeder Aufrufer sie
  // selbst holen muss. Das deckt beide Wege ab, auf denen `angemeldet` `true`
  // wird (Schlüsselbund beim Start, Magic Link in `loeseEin`), und räumt
  // beim Abmelden wieder auf — sonst zeigte ein zweites, gerade neu
  // angemeldetes Mitglied auf demselben Gerät kurzzeitig noch die
  // Guide-Knöpfe oder den Schalterstand des vorigen.
  useEffect(() => {
    if (!angemeldet) {
      setRolle(null);
      setJugendBenachrichtigung(null);
      return;
    }
    let abgebrochen = false;
    void api
      .hole<{ rolle: string; jugendBenachrichtigung: boolean }>('/konto')
      .then((auskunft) => {
        if (!abgebrochen) {
          setRolle(auskunft.rolle);
          setJugendBenachrichtigung(auskunft.jugendBenachrichtigung);
        }
      })
      .catch((fehler) => {
        // Reine Anzeigehilfe (siehe Kommentar bei `rolle` oben): Ein
        // Fehlschlag hier blendet nur die Guide-Knöpfe und den
        // Abonnement-Schalter aus, mehr nicht — kein Bannergrund für ein
        // Detail, das niemand angefordert hat. `console.warn` bleibt für den
        // Betreiber.
        if (!abgebrochen) console.warn('Rolle ließ sich nicht laden:', fehler);
      });
    return () => {
      abgebrochen = true;
    };
  }, [angemeldet, api]);

  const setzeJugendBenachrichtigungAn = useCallback(
    async (an: boolean) => {
      // Optimistisch: Erst die Anzeige, dann die Anfrage. Wer den Schalter
      // antippt und eine Sekunde nichts sieht, tippt ihn ein zweites Mal —
      // und der Zustand steht danach auf dem Gegenteil dessen, was die
      // Person wollte.
      const vorher = jugendBenachrichtigung;
      setJugendBenachrichtigung(an);
      try {
        await setzeAbonnement(api, an);
      } catch (fehler) {
        setJugendBenachrichtigung(vorher);
        throw fehler;
      }
    },
    [api, jugendBenachrichtigung],
  );

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
      rolle,
      jugendBenachrichtigung,
      setzeJugendBenachrichtigung: setzeJugendBenachrichtigungAn,
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
    [
      angemeldet,
      laedt,
      api,
      rolle,
      jugendBenachrichtigung,
      setzeJugendBenachrichtigungAn,
      zuletztEingeloest,
      einloesenFehlgeschlagen,
    ],
  );

  return <Kontext.Provider value={wert}>{children}</Kontext.Provider>;
}

export function useKonto(): KontoZustand {
  const wert = useContext(Kontext);
  if (!wert) throw new Error('useKonto braucht einen KontoProvider darüber.');
  return wert;
}
