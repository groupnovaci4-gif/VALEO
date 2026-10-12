/** Thème clair / sombre / automatique : préférence de CE navigateur (confort, rien de sensible). */
import { useEffect, useState } from 'react';

export type ThemePref = 'light' | 'dark' | 'auto';
const KEY = 'bo-theme';

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' || v === 'auto' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function useTheme(): { pref: ThemePref; theme: 'light' | 'dark'; setPref: (p: ThemePref) => void } {
  const [pref, setPrefState] = useState<ThemePref>(readThemePref);
  const [sysDark, setSysDark] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const m = matchMedia('(prefers-color-scheme: dark)');
    const on = (e: MediaQueryListEvent) => setSysDark(e.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  const setPref = (p: ThemePref) => {
    setPrefState(p);
    try {
      localStorage.setItem(KEY, p);
    } catch {
      /* stockage indisponible : le choix vaut pour cette visite */
    }
  };
  const theme = pref === 'auto' ? (sysDark ? 'dark' : 'light') : pref;
  return { pref, theme, setPref };
}
