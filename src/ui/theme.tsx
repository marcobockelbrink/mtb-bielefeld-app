/**
 * Farbschema-Anbindung: liefert die Palette passend zur Systemeinstellung.
 */

import { useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { darkPalette, lightPalette, type Palette } from '../theme';

export interface ThemeInfo {
  palette: Palette;
  isDark: boolean;
}

export function useTheme(): ThemeInfo {
  const scheme = useColorScheme();
  return useMemo(
    () => ({
      palette: scheme === 'dark' ? darkPalette : lightPalette,
      isDark: scheme === 'dark',
    }),
    [scheme],
  );
}
