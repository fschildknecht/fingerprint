export interface Collector {
  id: string;
  /** Stable signals are mixed into visitorId. Volatile ones (IPs, battery, viewport) are only reported. */
  stable: boolean;
  /** Rough entropy estimate in bits, used for the confidence model. Heuristic, signals are correlated. */
  bits: number;
  timeoutMs?: number;
  /** Not run unless explicitly listed in options.include (may trigger browser UI or be invasive). */
  optIn?: boolean;
  run: () => unknown | Promise<unknown>;
}
