/**
 * Mitgliederverwaltung — das Gegenstück zu den `/verwaltung`-Endpunkten.
 * Nur für die Rolle `verwaltung`; die API prüft das bei jedem Aufruf.
 */

import type { ApiZugang } from './api';

export type Rolle = 'mitglied' | 'guide' | 'verwaltung';

export interface MitgliedZeile {
  /** `null`: eingeladen, aber noch nie angemeldet — es gibt kein Konto. */
  id: string | null;
  email: string;
  rolle: Rolle;
  jugend: boolean;
  gesehenAm: Date | null;
  offeneEinladung: boolean;
}

interface Roh {
  id: string | null;
  email: string;
  rolle: Rolle;
  jugend: boolean;
  gesehenAm: string | null;
  offeneEinladung: boolean;
}

export async function holeMitglieder(api: ApiZugang): Promise<MitgliedZeile[]> {
  return (await api.hole<Roh[]>('/verwaltung/mitglieder')).map((z) => ({
    ...z,
    gesehenAm: z.gesehenAm ? new Date(z.gesehenAm) : null,
  }));
}

export function ladeEin(api: ApiZugang, email: string): Promise<{ eingeladen: string }> {
  return api.sende<{ eingeladen: string }>('/verwaltung/einladungen', 'POST', { email });
}

export async function aendereMitglied(
  api: ApiZugang,
  id: string,
  aenderung: { rolle?: Rolle; jugend?: boolean },
): Promise<{ rolle: Rolle; jugend: boolean }> {
  return api.sende<{ rolle: Rolle; jugend: boolean }>(
    `/verwaltung/mitglieder/${id}`,
    'PATCH',
    aenderung,
  );
}
