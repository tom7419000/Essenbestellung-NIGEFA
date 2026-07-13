/**
 * Kopiert nur definierte Werte auf das Ziel. Notwendig, weil DTO-Instanzen
 * (class-validator + ES2022-Klassenfelder) alle deklarierten optionalen Felder
 * als eigene undefined-Properties tragen — ein naives Object.assign würde
 * vorhandene Entity-Werte damit überschreiben.
 */
export function assignDefined<T extends object>(target: T, source: Partial<T>): T {
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) {
      (target as Record<string, unknown>)[key] = value;
    }
  }
  return target;
}
