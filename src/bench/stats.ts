export interface Summary {
  count: number;
  mean: number | null;
  p50: number | null;
  p95: number | null;
  min: number | null;
  max: number | null;
}

/** Nearest-rank percentile on a copy of `samples` (inclusive 0..100). */
export function percentile(samples: readonly number[], p: number): number | null {
  if (samples.length === 0) return null;
  if (p <= 0) return Math.min(...samples);
  if (p >= 100) return Math.max(...samples);
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  const idx = Math.min(sorted.length - 1, Math.max(0, rank));
  return sorted[idx] ?? null;
}

export function summarize(samples: readonly number[]): Summary {
  if (samples.length === 0) {
    return { count: 0, mean: null, p50: null, p95: null, min: null, max: null };
  }
  const sum = samples.reduce((acc, n) => acc + n, 0);
  return {
    count: samples.length,
    mean: sum / samples.length,
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    min: Math.min(...samples),
    max: Math.max(...samples),
  };
}

export function formatMs(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return "-";
  return `${Math.round(ms)}`;
}
