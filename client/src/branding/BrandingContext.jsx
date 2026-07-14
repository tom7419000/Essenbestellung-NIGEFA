import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';

export const DEFAULT_COLORS = {
  primary: '#e8590c',
  secondary: '#1971c2',
  accent: '#2f9e44',
};

const DEFAULT_FAVICON =
  'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🍽️</text></svg>';

// Relative Luminanz (WCAG) – entscheidet, ob Text auf einer Farbe hell oder dunkel sein muss.
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const channel = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

// Setzt die Branding-Farben als CSS-Variablen – die gesamte App passt sich live an.
export function applyColors(colors) {
  const root = document.documentElement;
  root.style.setProperty('--color-primary', colors.primary);
  root.style.setProperty('--color-secondary', colors.secondary);
  root.style.setProperty('--color-accent', colors.accent);
  // Kontrastsichere Textfarbe auf Primär-/Akzentflächen (z. B. Buttons).
  root.style.setProperty('--on-primary', luminance(colors.primary) > 0.45 ? '#1c2430' : '#ffffff');
  root.style.setProperty('--on-accent', luminance(colors.accent) > 0.45 ? '#1c2430' : '#ffffff');
}

function applyFavicon(faviconUrl) {
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = faviconUrl || DEFAULT_FAVICON;
}

const BrandingContext = createContext(null);

export function useBranding() {
  return useContext(BrandingContext);
}

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState({
    colors: DEFAULT_COLORS,
    logoUrl: null,
    faviconUrl: null,
  });

  const refresh = useCallback(async () => {
    try {
      setBranding(await api('/branding'));
    } catch {
      // Ohne Server-Antwort bleiben die Standardwerte aktiv.
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    applyColors(branding.colors);
    applyFavicon(branding.faviconUrl);
  }, [branding]);

  return (
    <BrandingContext.Provider value={{ branding, refresh }}>{children}</BrandingContext.Provider>
  );
}
