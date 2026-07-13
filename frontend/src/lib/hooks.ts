'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { Restaurant, UserPublic } from './types';

/** Restaurantliste (Admin optional inkl. inaktiver). */
export function useRestaurants(includeInactive = false) {
  return useQuery({
    queryKey: ['restaurants', { includeInactive }],
    queryFn: () =>
      api.get<Restaurant[]>(`/restaurants${includeInactive ? '?includeInactive=true' : ''}`),
  });
}

/** Aktive Benutzer für Auswahllisten (Organisator-Zuweisung). */
export function useAllUsers() {
  return useQuery({
    queryKey: ['users', 'all'],
    queryFn: () => api.get<UserPublic[]>('/users?all=true'),
  });
}

/** Entprellter Wert (z. B. für Suchfelder). */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Ordnet API-Validierungsmeldungen den Formularfeldern zu (feldnahe Anzeige).
 * Meldungen, die keinem Feld zugeordnet werden können, landen unter `general`.
 */
export function splitFieldErrors(
  messages: string[],
  fields: string[],
): { fieldErrors: Record<string, string>; general: string[] } {
  const fieldErrors: Record<string, string> = {};
  const general: string[] = [];
  for (const message of messages) {
    const lower = message.toLowerCase();
    const field = fields.find((f) => lower.includes(f.toLowerCase()));
    if (field && !fieldErrors[field]) fieldErrors[field] = message;
    else general.push(message);
  }
  return { fieldErrors, general };
}
