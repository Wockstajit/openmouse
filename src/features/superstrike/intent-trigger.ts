import type { DepthSample } from "./hits-test.ts";

export const INTENT_EARLY_STEP = 1;
export const INTENT_FALLBACK_STEP = 5;
// Speeds are reported HITS steps per second.
export const DEFAULT_INTENT_SPEED = 100;
export const MIN_INTENT_SPEED = 10;
export const MAX_INTENT_SPEED = 600;
export const INTENT_SPEED_STEP = 5;
const MAX_SAMPLE_GAP_MS = 50;

export type IntentOutcome = "early" | "fallback" | "ignored";

export function intentDepths(early = INTENT_EARLY_STEP, maxActuation = 10) {
  return { early, fallback: Math.min(maxActuation, Math.max(INTENT_FALLBACK_STEP, early + 1)) };
}

export function validDepthSample({ t, depth }: DepthSample): boolean {
  return Number.isFinite(t) && Number.isFinite(depth) && depth >= 0 && depth <= 10;
}

export function earlyPressSpeed(previous: DepthSample, current: DepthSample, { early, fallback }: ReturnType<typeof intentDepths>): number {
  const elapsed = current.t - previous.t;
  if (elapsed <= 0 || elapsed > MAX_SAMPLE_GAP_MS
    || current.depth < early || current.depth >= fallback) return 0;
  return Math.max(0, (current.depth - previous.depth) * 1000 / elapsed);
}

/** Evaluate one button's host-received travel samples, once per press. */
export function createIntentTrigger(minSpeed = DEFAULT_INTENT_SPEED, depths = intentDepths()) {
  let previous: DepthSample | undefined;
  let armed = false;
  let fired = false;

  return {
    sample(current: DepthSample): IntentOutcome | null {
      if (!validDepthSample(current)) return null;
      const prior = previous;
      const elapsed = prior ? current.t - prior.t : 0;
      if (prior && elapsed <= 0) return null;
      previous = current;

      if (current.depth === 0) {
        const ignored = armed && !fired && prior !== undefined && prior.depth > 0;
        armed = true;
        fired = false;
        return ignored ? "ignored" : null;
      }
      if (!armed || fired) return null;

      if (prior && earlyPressSpeed(prior, current, depths) >= minSpeed) {
        fired = true;
        return "early";
      }
      // A first report at or beyond the fallback cannot establish an earlier click.
      if (current.depth >= depths.fallback) {
        fired = true;
        return "fallback";
      }
      return null;
    },
  };
}
