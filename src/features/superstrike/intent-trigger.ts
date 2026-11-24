import type { DepthSample } from "./hits-test.ts";

export const INTENT_EARLY_STEP = 1;
export const INTENT_FALLBACK_STEP = 5;
// These are prototype values in HITS steps, not physical travel or firmware settings.
const MIN_PRESS_SPEED = 0.1;
const MAX_SAMPLE_GAP_MS = 50;

export type IntentOutcome = "early" | "fallback" | "ignored";

/** Evaluate one button's host-received travel samples, once per press. */
export function createIntentTrigger() {
  let previous: DepthSample | undefined;
  let armed = false;
  let fired = false;

  return {
    sample(current: DepthSample): IntentOutcome | null {
      if (!Number.isFinite(current.t) || !Number.isFinite(current.depth) || current.depth < 0 || current.depth > 10) return null;
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

      if (prior && elapsed <= MAX_SAMPLE_GAP_MS
        && current.depth >= INTENT_EARLY_STEP && current.depth < INTENT_FALLBACK_STEP
        && (current.depth - prior.depth) / elapsed >= MIN_PRESS_SPEED) {
        fired = true;
        return "early";
      }
      // A first report at or beyond the fallback cannot establish an earlier click.
      if (current.depth >= INTENT_FALLBACK_STEP) {
        fired = true;
        return "fallback";
      }
      return null;
    },
  };
}
