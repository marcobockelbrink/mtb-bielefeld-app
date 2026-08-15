/**
 * Familienprofile — das Gegenstück zu den `/familie`-Endpunkten.
 *
 * Wer angemeldet ist, sieht hier die Profile, die **er** verwaltet. Ein
 * Erwachsener, den man anlegt, taucht bewusst nicht auf: Er bekommt ein
 * eigenständiges Konto und untersteht niemandem.
 */

import type { ApiZugang } from './api';

export type ProfilStatus = 'aktiv' | 'einladung_offen';

export interface Profil {
  id: string;
  name: string | null;
  email: string | null;
  geburtsjahr: number | null;
  kannBilderHochladen: boolean;
  avatarUrl: string | null;
  status: ProfilStatus;
}

export interface ProfilEingabe {
  art: 'kind' | 'erwachsen';
  name: string;
  geburtsjahr?: number | null;
  email?: string | null;
  kannBilderHochladen?: boolean;
}

export function holeProfile(api: ApiZugang): Promise<Profil[]> {
  return api.hole<Profil[]>('/familie');
}

/** Antwortet mit dem Profil **und** dem tatsächlichen Empfänger der Mail. */
export function legeProfilAn(
  api: ApiZugang,
  eingabe: ProfilEingabe,
): Promise<{ profil: Profil; bestaetigungAn: string }> {
  return api.sende<{ profil: Profil; bestaetigungAn: string }>('/familie', 'POST', eingabe);
}

export function aendereProfil(
  api: ApiZugang,
  id: string,
  aenderung: { name?: string; geburtsjahr?: number | null; kannBilderHochladen?: boolean },
): Promise<void> {
  return api.sende<void>(`/familie/${id}`, 'PATCH', aenderung);
}

export function loescheProfil(api: ApiZugang, id: string): Promise<void> {
  return api.sende<void>(`/familie/${id}`, 'DELETE');
}

/** „Kind · 11" — das Alter aus dem Geburtsjahr, wenn eines da ist. */
export function altersTag(profil: Profil, heute: Date): string {
  if (profil.geburtsjahr === null) return 'Kind';
  return `Kind · ${heute.getFullYear() - profil.geburtsjahr}`;
}

export function statusZeile(profil: Profil): string {
  if (profil.status === 'einladung_offen') {
    return `Bestätigung an ${profil.email ?? 'das Postfach'} gesendet`;
  }
  return profil.kannBilderHochladen ? 'Aktiv' : 'Aktiv · kann keine Bilder hochladen';
}
