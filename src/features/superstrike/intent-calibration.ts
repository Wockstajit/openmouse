import type { DepthSample } from "./hits-test.ts";
import {
  earlyPressSpeed, intentDepths, INTENT_SPEED_STEP, MAX_INTENT_SPEED, MIN_INTENT_SPEED, validDepthSample,
} from "./intent-trigger.ts";

export const INTENT_CALIBRATION_COUNT = 10;
const MAX_ERRORS_PER_ROUND = 2;
export type IntentCalibrationProgress =
  | { phase: "normal" | "intent"; count: number }
  | { phase: "done"; speed: number; range: readonly [number, number] }
  | { phase: "failed"; range: readonly [number, number] | null };

function calibratedSpeed(normal: readonly number[], intent: readonly number[], currentSpeed: number): number | null {
  let best: number | null = null;
  let bestWidth = 0;
  let runStart = MIN_INTENT_SPEED;
  let bestErrors = Infinity;
  for (let speed = MIN_INTENT_SPEED; speed <= MAX_INTENT_SPEED; speed += INTENT_SPEED_STEP) {
    const normalErrors = normal.filter((observed) => observed >= speed).length;
    const intentErrors = intent.filter((observed) => observed < speed).length;
    if (normalErrors > MAX_ERRORS_PER_ROUND || intentErrors > MAX_ERRORS_PER_ROUND) {
      runStart = speed + INTENT_SPEED_STEP;
      continue;
    }
    const errors = normalErrors + intentErrors;
    if (errors < bestErrors) {
      bestErrors = errors;
      bestWidth = 0;
      runStart = speed;
    }
    if (errors !== bestErrors) {
      runStart = speed + INTENT_SPEED_STEP;
      continue;
    }
    const width = speed - runStart + INTENT_SPEED_STEP;
    const center = Math.round((runStart + speed) / (2 * INTENT_SPEED_STEP)) * INTENT_SPEED_STEP;
    if (width > bestWidth
      || (width === bestWidth && best !== null && Math.abs(center - currentSpeed) < Math.abs(best - currentSpeed))) {
      best = center;
      bestWidth = width;
    }
  }
  return best;
}

/** Capture complete press/release cycles and score the same speed signal as live detection. */
export function createIntentCalibration(currentSpeed: number, depths = intentDepths()) {
  const normal: number[] = [];
  const intent: number[] = [];
  let previous: DepthSample | undefined;
  let sawRelease = false;
  let reachedActuation = false;
  let peakSpeed = 0;

  return {
    sample(current: DepthSample, cueActive = true): IntentCalibrationProgress | null {
      if (intent.length >= INTENT_CALIBRATION_COUNT || !validDepthSample(current)) return null;
      const prior = previous;
      if (prior && current.t <= prior.t) return null;
      previous = current;
      if (!cueActive) {
        sawRelease = current.depth === 0;
        reachedActuation = false;
        peakSpeed = 0;
        return null;
      }
      if (current.depth > 0) {
        if (sawRelease && prior) {
          peakSpeed = Math.max(peakSpeed, earlyPressSpeed(prior, current, depths));
          reachedActuation ||= current.depth >= depths.early;
          if (current.depth >= depths.fallback) sawRelease = false;
        }
        return null;
      }

      sawRelease = true;
      if (!reachedActuation) {
        peakSpeed = 0;
        return null;
      }
      const group = normal.length < INTENT_CALIBRATION_COUNT ? normal : intent;
      group.push(peakSpeed);
      reachedActuation = false;
      peakSpeed = 0;
      if (intent.length < INTENT_CALIBRATION_COUNT) {
        return normal.length < INTENT_CALIBRATION_COUNT
          ? { phase: "normal", count: normal.length }
          : { phase: "intent", count: intent.length };
      }
      const speed = calibratedSpeed(normal, intent, currentSpeed);
      const measured = intent.filter((value) => value > 0);
      const range = measured.length ? [Math.round(Math.min(...measured)), Math.round(Math.max(...measured))] as const : null;
      return speed === null || range === null ? { phase: "failed", range } : { phase: "done", speed, range };
    },
  };
}
