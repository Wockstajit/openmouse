import assert from "node:assert/strict";
import test from "node:test";
import { createIntentTrigger } from "./intent-trigger.ts";

function outcomes(trace: readonly (readonly [number, number])[]) {
  const trigger = createIntentTrigger();
  return trace.map(([t, depth]) => trigger.sample({ t, depth })).filter((outcome) => outcome !== null);
}

test("fires early once on a fast press and rearms after release", () => {
  assert.deepEqual(outcomes([[0, 0], [16, 2], [32, 6], [48, 3], [64, 7], [80, 0], [96, 2]]), ["early", "early"]);
});

test("fires at the fallback on a slow full press and ignores a slow light press", () => {
  assert.deepEqual(outcomes([[0, 0], [16, 1], [32, 2], [48, 3], [64, 4], [80, 5], [96, 0], [112, 1], [128, 0]]),
    ["fallback", "ignored"]);
});

test("does not infer an early click when a report already crosses the fallback", () => {
  assert.deepEqual(outcomes([[0, 0], [16, 7], [32, 0]]), ["fallback"]);
});

test("waits for release and ignores stale or non-increasing velocity samples", () => {
  assert.deepEqual(outcomes([[0, 8], [10, 5], [20, 0], [120, 3], [120, 4], [110, 9], [136, 0]]), ["ignored"]);
});
