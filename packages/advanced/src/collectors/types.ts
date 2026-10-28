export interface Collector {
  id: string;
  /** Stable signals are mixed into visitorId. Volatile ones (IPs, battery, viewport) are only reported. */
  stable: boolean;
  /** Rough entropy estimate in bits, used for the confidence model. Heuristic, signals are correlated. */
  bits: number;
  timeoutMs?: number;
  /** Not run unless explicitly listed in options.include (may trigger browser UI or be invasive). */
  optIn?: boolean;
  /** Measures timing, so it runs alone after all other collectors instead of competing with them for the CPU. */
  exclusive?: boolean;
  /** Costs 0.5 s or more (one-time browser init, DRM or network round trips). Skipped by options.fast. */
  slow?: boolean;
  run: () => unknown | Promise<unknown>;
}
