/**
 * Formats a number the way Qt's QString::number()/arg(double) does by default
 * (%g with 6 significant digits), so generated AMCP and XML match the Qt client.
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return String(Number(value.toPrecision(6)));
}

export function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  const v = raw.trim().toLowerCase();
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return fallback;
}

export function parseIntOr(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isNaN(n) ? fallback : n;
}

export function parseFloatOr(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number.parseFloat(raw.trim());
  return Number.isNaN(n) ? fallback : n;
}
