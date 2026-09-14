export interface DurationStats {
  sampleCount: number;
  avgSeconds: number;
  p95Seconds: number;
  maxSeconds: number;
}

// Fixed-size ring buffer of recent durations (ms), so avg/p95/max can be computed on demand
// without an unbounded array or per-sample shift() cost on the hot path.
export const createDurationSampler = (capacity: number) => {
  const durationsMs = new Float64Array(capacity);
  let index = 0;
  let count = 0;

  const record = (durationMs: number): void => {
    durationsMs[index] = durationMs;
    index = (index + 1) % capacity;
    count = Math.min(count + 1, capacity);
  };

  const stats = (): DurationStats => {
    const samples = Array.from(durationsMs.slice(0, count)).sort(
      (a, b) => a - b,
    );
    const avgMs = samples.length
      ? samples.reduce((sum, value) => sum + value, 0) / samples.length
      : 0;
    const p95Ms = samples.length ? samples[Math.floor(samples.length * 0.95)] : 0;
    const maxMs = samples.length ? samples[samples.length - 1] : 0;

    return {
      sampleCount: samples.length,
      avgSeconds: Number((avgMs / 1000).toFixed(3)),
      p95Seconds: Number((p95Ms / 1000).toFixed(3)),
      maxSeconds: Number((maxMs / 1000).toFixed(3)),
    };
  };

  return { record, stats };
};
