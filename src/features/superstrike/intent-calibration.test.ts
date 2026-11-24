import assert from "node:assert/strict";
import test from "node:test";
import { createIntentCalibration } from "./intent-calibration.ts";
import { createIntentTrigger } from "./intent-trigger.ts";

function calibrationFixture(currentSpeed: number) {
  const calibration = createIntentCalibration(currentSpeed);
  let t = 0;
  const sample = (depth: number, delay: number) => calibration.sample({ t: t += delay, depth });
  const press = (delay: number, full = true) => {
    sample(0, 20);
    sample(2, delay);
    if (full) sample(5, delay);
    return sample(0, delay);
  };
  return { sample, press };
}

test("uses 10 completed normal presses and 10 completed intent presses", () => {
  const { sample, press } = calibrationFixture(100);
  sample(5, 1);
  assert.equal(sample(0, 10), null);
  assert.equal(press(12, false), null);
  for (let count = 1; count < 10; count++) assert.deepEqual(press(20), { phase: "normal", count });
  assert.deepEqual(press(20), { phase: "intent", count: 0 });
  for (let count = 1; count < 10; count++) assert.deepEqual(press(10), { phase: "intent", count });
  assert.deepEqual(press(10), { phase: "done", speed: 105 });
  assert.equal(press(10), null);
});

test("preserves the existing speed when the two rounds cannot be distinguished", () => {
  const { press } = calibrationFixture(125);
  for (let click = 0; click < 19; click++) press(20);
  assert.deepEqual(press(20), { phase: "failed" });
});

test("only counts a full press and release made during the active cue", () => {
  const calibration = createIntentCalibration(100);
  assert.equal(calibration.sample({ t: 0, depth: 0 }, false), null);
  assert.equal(calibration.sample({ t: 10, depth: 5 }, false), null);
  assert.equal(calibration.sample({ t: 20, depth: 6 }), null);
  assert.equal(calibration.sample({ t: 30, depth: 0 }), null);
  assert.equal(calibration.sample({ t: 40, depth: 5 }), null);
  assert.equal(calibration.sample({ t: 50, depth: 0 }, false), null);
  assert.equal(calibration.sample({ t: 60, depth: 5 }), null);
  assert.deepEqual(calibration.sample({ t: 70, depth: 0 }), { phase: "normal", count: 1 });
});

test("the selected speed controls the early actuation decision", () => {
  const speedCheck = (speed: number) => {
    const trigger = createIntentTrigger(speed);
    trigger.sample({ t: 0, depth: 0 });
    return [trigger.sample({ t: 16, depth: 2 }), trigger.sample({ t: 32, depth: 5 })];
  };
  assert.deepEqual(speedCheck(120), ["early", null]);
  assert.deepEqual(speedCheck(130), [null, "fallback"]);
});
