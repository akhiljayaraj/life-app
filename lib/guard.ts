/** Accept loopback hosts only, which also blocks DNS rebinding. */
export function isLocalHost(host: string | null): boolean {
  return host !== null && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
}

/** Share one in-flight call and skip calls made during the cooldown. */
export function singleFlight<T>(
  fn: () => Promise<T>,
  cooldownMs: number,
  now: () => number = Date.now,
): () => Promise<T | undefined> {
  let inFlight: Promise<T> | null = null;
  let last = -Infinity;
  return async () => {
    if (inFlight) return inFlight;
    if (now() - last < cooldownMs) return undefined;
    inFlight = fn().finally(() => {
      inFlight = null;
      last = now();
    });
    return inFlight;
  };
}
