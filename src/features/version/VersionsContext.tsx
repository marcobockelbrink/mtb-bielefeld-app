/**
 * Hält die Versionslage für die ganze App bereit (Handoff 16).
 *
 * Ein Kontext und nicht ein Abruf je Bildschirm: Die Sperre liegt über
 * allem, der Hinweis steht in „Aktuelles" — beide brauchen dieselbe
 * Auskunft, und zwei Abrufe lieferten am Umschaltpunkt verschiedene.
 *
 * ## Wann gefragt wird
 *
 * Beim Start und bei **jeder Rückkehr in den Vordergrund**. Wer die App
 * tagelang offen liegen lässt, bekäme sonst nie mit, dass der Server
 * inzwischen mehr verlangt — und liefe in Fehlermeldungen, denen niemand
 * ansieht, dass eine Aktualisierung hilft.
 *
 * Kein eigener Takt darüber hinaus: Der Server legt seine Mindestversion
 * auf jede Antwort (`X-MTB-Version`), und `api.ts` wirft bei `426`. Ein
 * Wecker, der alle paar Minuten nachfragt, brächte nichts dazu.
 */

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { APP_VERSION } from '../../data/api';
import { asyncStorageStore } from '../../data/asyncStorageStore';
import { useKonto } from '../../konto/KontoContext';
import { beurteile, zeigeHinweis, type Versionsauskunft, type Versionslage } from './pruefung';
import { liesWeggewischt, merkeWeggewischt } from './weggewischt';

interface VersionsZustand {
  lage: Versionslage;
  auskunft: Versionsauskunft | null;
  /** Soll die Hinweiskarte in „Aktuelles" erscheinen? */
  hinweisSichtbar: boolean;
  /** Das ✕ an der Karte — merkt sich die Fassung, nicht ein Ja/Nein. */
  hinweisWegwischen: () => void;
}

const Kontext = createContext<VersionsZustand | null>(null);

export function VersionsProvider({ children }: { children: ReactNode }) {
  const { api } = useKonto();
  const [auskunft, setAuskunft] = useState<Versionsauskunft | null>(null);
  const [weggewischt, setWeggewischt] = useState<string | null>(null);

  const laden = useCallback(async () => {
    setAuskunft(await api.holeVersionsauskunft());
  }, [api]);

  useEffect(() => {
    void laden();
    void liesWeggewischt(asyncStorageStore).then(setWeggewischt);

    const abo = AppState.addEventListener('change', (zustand) => {
      if (zustand === 'active') void laden();
    });

    /*
      Der dritte Anlass, und der wichtigste: Weist der Server eine Anfrage
      mit `426` ab, ist die Sperre **jetzt** fällig und nicht erst beim
      nächsten Wechsel in den Vordergrund. Bis dahin sähe man bei jedem
      Tippen eine Fehlermeldung, der niemand ansieht, dass eine
      Aktualisierung hilft.

      `laden()` und nicht ein hartes Setzen der Lage: Die Auskunft holt die
      genaue Mindestversion mit, und die steht auf dem Sperrbildschirm.
    */
    api.beiZuAlt = () => void laden();
    return () => {
      abo.remove();
      api.beiZuAlt = null;
    };
  }, [laden, api]);

  const lage = beurteile(APP_VERSION, auskunft);

  const hinweisWegwischen = useCallback(() => {
    if (!auskunft) return;
    setWeggewischt(auskunft.aktuelleVersion);
    void merkeWeggewischt(asyncStorageStore, auskunft.aktuelleVersion);
  }, [auskunft]);

  return (
    <Kontext.Provider
      value={{
        lage,
        auskunft,
        hinweisSichtbar: zeigeHinweis(lage, auskunft, weggewischt),
        hinweisWegwischen,
      }}
    >
      {children}
    </Kontext.Provider>
  );
}

/**
 * Ohne Provider die harmlose Antwort — `aktuell`, kein Hinweis.
 *
 * Kein Wurf wie bei `useKonto`: Diese Auskunft ist ein Zusatz. Eine App,
 * die abstürzt, weil die Versionsprüfung nicht eingehängt ist, wäre
 * schlechter dran als eine, die sie nicht anzeigt.
 */
export function useVersion(): VersionsZustand {
  return (
    useContext(Kontext) ?? {
      lage: 'aktuell',
      auskunft: null,
      hinweisSichtbar: false,
      hinweisWegwischen: () => {},
    }
  );
}
