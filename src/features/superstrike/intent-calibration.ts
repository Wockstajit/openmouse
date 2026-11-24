import type { DepthSample } from "./hits-test.ts";
import {
  earlyPressSpeed, INTENT_FALLBACK_STEP, INTENT_SPEED_STEP, MAX_INTENT_SPEED, MIN_INTENT_SPEED, validDepthSample,
} from "./intent-trigger.ts";

export const INTENT_CALIBRATION_COUNT = 10;
export type IntentCalibrationProgress =
  | { phase: "normal" | "intent"; count: number }
  | { phase: "done"; speed: number }
  | { phase: "failed" };

function calibratedSpeed(normal: readonly number[], intent: readonly number[], currentSpeed: number): number | null {
  let best: number | null = null;
  // Always classifying a press as normal would miss every intent press.
  let bestErrors = intent.length;
  for (let speed = MIN_INTENT_SPEED; speed <= MAX_INTENT_SPEED; speed += INTENT_SPEED_STEP) {
    const errors = normal.filter((observed) => observed >= speed).length
      + intent.filter((observed) => observed < speed).length;
    if (errors < bestErrors
      || (best !== null && errors === bestErrors && Math.abs(speed - currentSpeed) < Math.abs(best - currentSpeed))) {
      best = speed;
      bestErrors = errors;
    }
  }
  return best;
}

/** Capture complete press/release cycles and score the same speed signal as live detection. */
export function createIntentCalibration(currentSpeed: number) {
  const normal: number[] = [];
  const intent: number[] = [];
  let previous: DepthSample | undefined;
  let sawRelease = false;
  let reachedFallback = false;
  let peakSpeed = 0;

  return {
    sample(current: DepthSample, cueActive = true): IntentCalibrationProgress | null {
      if (intent.length >= INTENT_CALIBRATION_COUNT || !validDepthSample(current)) return null;
      const prior = previous;
      if (prior && current.t <= prior.t) return null;
      previous = current;
      if (!cueActive) {
        sawRelease = current.depth === 0;
        reachedFallback = false;
        peakSpeed = 0;
        return null;
      }
      if (current.depth > 0) {
        if (sawRelease && prior && !reachedFallback) {
          peakSpeed = Math.max(peakSpeed, earlyPressSpeed(prior, current));
          reachedFallback = current.depth >= INTENT_FALLBACK_STEP;
        }
        return null;
      }

      sawRelease = true;
      if (!reachedFallback) {
        peakSpeed = 0;
        return null;
      }
      const group = normal.length < INTENT_CALIBRATION_COUNT ? normal : intent;
      group.push(peakSpeed);
      reachedFallback = false;
      peakSpeed = 0;
      if (intent.length < INTENT_CALIBRATION_COUNT) {
        return normal.length < INTENT_CALIBRATION_COUNT
          ? { phase: "normal", count: normal.length }
          : { phase: "intent", count: intent.length };
      }
      const speed = calibratedSpeed(normal, intent, currentSpeed);
      return speed === null ? { phase: "failed" } : { phase: "done", speed };
    },
  };
}
