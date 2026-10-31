import { format } from 'date-fns';

export function safeFormat(iso, pattern, fallback = '') {
  if (!iso) return fallback;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? fallback : format(d, pattern);
}