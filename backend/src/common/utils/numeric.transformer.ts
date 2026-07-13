import { ValueTransformer } from 'typeorm';

/** PostgreSQL numeric-Spalten kommen als String an — API liefert Zahlen. */
export const numericTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) => (value == null ? value : parseFloat(value)),
};
