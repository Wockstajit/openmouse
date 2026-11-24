import assert from "node:assert/strict";
import test from "node:test";
import { createIntentCalibration } from "./intent-calibration.ts";
import { createIntentTrigger, intentDepths } from "./intent-trigger.ts";

function calibrationFixture(currentSpeed: number) {
  const calibration = createIntentCalibration(currentSpeed);
  let t = 0;
  const sample = (depth: number, delay: number) => calibration.sample(t += delay, [depth, 0]);
  const press = (delay: number, full = true) => {
    sample(0, 20);
    sample(full ? 2 : 0.5, delay);
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
  assert.deepEqual(press(10), { phase: "done", speed: 155, range: [200, 200] });
  assert.equal(press(10), null);
});

test("preserves the existing speed when the two rounds cannot be distinguished", () => {
  const { press } = calibrationFixture(125);
  for (let click = 0; click < 19; click++) press(20);
  assert.deepEqual(press(20), { phase: "failed" });
});

test("does not calibrate from one fast outlier in the intent round", () => {
  const { press } = calibrationFixture(125);
  for (let click = 0; click < 19; click++) press(20);
  assert.deepEqual(press(10), { phase: "failed" });
});

test("only counts a press and release made during the active cue", () => {
  const calibration = createIntentCalibration(100);
  assert.equal(calibration.sample(0, [0, 0], false), null);
  assert.equal(calibration.sample(10, [5, 0], false), null);
  assert.equal(calibration.sample(20, [6, 0]), null);
  assert.equal(calibration.sample(30, [0, 0]), null);
  assert.equal(calibration.sample(40, [5, 0]), null);
  assert.equal(calibration.sample(50, [0, 0], false), null);
  assert.equal(calibration.sample(60, [5, 0]), null);
  assert.deepEqual(calibration.sample(70, [0, 0]), { phase: "normal", count: 1 });
});

test("counts presses that reach the configured actuation point and then release", () => {
  const calibration = createIntentCalibration(100, [intentDepths(3), intentDepths()]);
  calibration.sample(0, [0, 0]);
  calibration.sample(10, [2, 0]);
  assert.equal(calibration.sample(20, [0, 0]), null);
  calibration.sample(30, [3, 0]);
  assert.deepEqual(calibration.sample(40, [0, 0]), { phase: "normal", count: 1 });
  const trigger = createIntentTrigger(100, intentDepths(3));
  trigger.sample({ t: 0, depth: 0 });
  assert.equal(trigger.sample({ t: 8, depth: 2 }), null);
  assert.equal(trigger.sample({ t: 16, depth: 3 }), "early");
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

test("accepts either button with its own actuation and counts one press per cue", () => {
  const calibration = createIntentCalibration(100, [intentDepths(3), intentDepths(2)]);
  calibration.sample(0, [0, 0]);
  calibration.sample(10, [2, 1]);
  assert.equal(calibration.sample(20, [0, 0]), null);
  calibration.sample(30, [0, 2]);
  assert.deepEqual(calibration.sample(40, [0, 0]), { phase: "normal", count: 1 });
  calibration.sample(50, [3, 2]);
  assert.deepEqual(calibration.sample(60, [0, 2]), { phase: "normal", count: 2 });
  assert.equal(calibration.sample(70, [0, 0]), null);
  calibration.sample(80, [3, 2]);
  assert.deepEqual(calibration.sample(90, [0, 0]), { phase: "normal", count: 3 });
});
