import { useEffect, useRef, useState, type ReactNode } from "react";
import { subscribeAnalogPress } from "../../device/controller";
import { t, tp } from "../../i18n/index";
import { StepperSlider, SwitchButton } from "../../shared/ui";
import type { InterfaceLocale } from "../settings/interface-preferences";
import {
  createIntentCalibration, INTENT_CALIBRATION_COUNT, type IntentCalibrationProgress,
} from "./intent-calibration";
import {
  createIntentTrigger, intentDepths, INTENT_SPEED_STEP, MAX_INTENT_SPEED, MIN_INTENT_SPEED, type IntentOutcome,
} from "./intent-trigger";

type PressStatus = IntentOutcome | "waiting" | "ready";

export function IntentClickControls({ locale, speed, actuation, maxActuation, onSpeedChange }: {
  locale: InterfaceLocale;
  speed: number;
  actuation: readonly [number, number];
  maxActuation: number;
  onSpeedChange: (speed: number) => void;
}): ReactNode {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [progress, setProgress] = useState<IntentCalibrationProgress | null>(null);
  const [results, setResults] = useState<[PressStatus, PressStatus]>(["waiting", "waiting"]);
  const [cue, setCue] = useState(false);
  const [retry, setRetry] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const cueActive = useRef(false);
  const cueTimer = useRef<number | undefined>(undefined);
  const earlyHeld = useRef(false);
  const target = useRef<HTMLDivElement>(null);
  const calibration = useRef<ReturnType<typeof createIntentCalibration> | null>(null);
  const calibrating = progress?.phase === "normal" || progress?.phase === "intent";
  const [leftActuation, rightActuation] = actuation;

  useEffect(() => {
    if (!calibrating || earlyHeld.current) return;
    cueTimer.current = window.setTimeout(() => {
      cueActive.current = true;
      setCue(true);
    }, 600 + Math.random() * 700);
    return () => {
      window.clearTimeout(cueTimer.current);
      cueActive.current = false;
    };
  }, [calibrating, progress, retryCount]);

  useEffect(() => {
    if (!detailsOpen) return;
    const leftTrigger = createIntentTrigger(speed, intentDepths(leftActuation, maxActuation));
    const rightTrigger = createIntentTrigger(speed, intentDepths(rightActuation, maxActuation));
    let leftWaiting = true;
    let rightWaiting = true;
    setResults(["waiting", "waiting"]);
    return subscribeAnalogPress((left, right) => {
      const t = performance.now();
      if (calibration.current) {
        const overTarget = target.current?.matches(":hover") === true;
        if (!cueActive.current && overTarget && (left >= leftActuation || right >= rightActuation) && !earlyHeld.current) {
          window.clearTimeout(cueTimer.current);
          earlyHeld.current = true;
          setRetry(true);
        }
        if (earlyHeld.current && left === 0 && right === 0) {
          earlyHeld.current = false;
          setRetryCount((count) => count + 1);
        }
        const next = calibration.current.sample(t, [left, right], cueActive.current && overTarget);
        if (!next) return;
        cueActive.current = false;
        setCue(false);
        setRetry(false);
        setProgress(next);
        if (next.phase === "done" || next.phase === "failed") {
          calibration.current = null;
          if (next.phase === "done") onSpeedChange(next.speed);
        }
      } else {
        const leftResult = leftTrigger.sample({ t, depth: left }) ?? (leftWaiting && left === 0 ? "ready" : null);
        const rightResult = rightTrigger.sample({ t, depth: right }) ?? (rightWaiting && right === 0 ? "ready" : null);
        leftWaiting &&= left !== 0;
        rightWaiting &&= right !== 0;
        if (leftResult || rightResult) setResults(([previousLeft, previousRight]) => [
          leftResult ?? previousLeft, rightResult ?? previousRight,
        ]);
      }
    });
  }, [detailsOpen, speed, leftActuation, rightActuation, maxActuation, calibrating, onSpeedChange]);

  const start = (): void => {
    calibration.current = createIntentCalibration(speed, [
      intentDepths(leftActuation, maxActuation), intentDepths(rightActuation, maxActuation),
    ]);
    setProgress({ phase: "normal", count: 0 });
  };
  const cancel = (): void => {
    cueActive.current = false;
    earlyHeld.current = false;
    setCue(false);
    setRetry(false);
    calibration.current = null;
    setProgress(null);
  };

  const speedText = (value: number): string =>
    tp(locale, "intent.speedValue", { speed: new Intl.NumberFormat(locale).format(value) });
  const range = progress?.phase === "done" ? progress.range : null;

  return (
    <section className="superstrike-intent" aria-labelledby="superstrike-intent-title">
      <div className="superstrike-intent-heading">
        <div>
          <h3 id="superstrike-intent-title">{t(locale, "intent.live")}</h3>
          <p className="setting-description">{t(locale, "intent.scope")}</p>
        </div>
        <SwitchButton value={false} label={t(locale, "intent.live")} disabled onChange={() => {}} />
      </div>
      <details className="superstrike-intent-details" onToggle={(event) => {
        const open = event.currentTarget.open;
        setDetailsOpen(open);
        if (!open && calibrating) cancel();
      }}>
        <summary>{t(locale, "intent.test")}</summary>
        <div onContextMenu={(event) => event.preventDefault()}>
          <p className="setting-description">{t(locale, "intent.testBoth")}</p>
          <StepperSlider
            id="superstrike-intent-speed"
            label={t(locale, "intent.speed")}
            min={MIN_INTENT_SPEED}
            max={MAX_INTENT_SPEED}
            step={INTENT_SPEED_STEP}
            value={speed}
            formatValue={speedText}
            scale={[speedText(MIN_INTENT_SPEED), "", speedText(MAX_INTENT_SPEED)]}
            disabled={calibrating}
            onCommit={(value) => {
              setProgress(null);
              onSpeedChange(value);
            }}
          />
          <div className="superstrike-intent-actions">
            {calibrating
              ? <button type="button" className="superstrike-apply-button" onClick={cancel}>{t(locale, "common.cancel")}</button>
              : <button type="button" className="superstrike-apply-button" onClick={start}>{t(locale, "intent.calibrate")}</button>}
          </div>
          {!calibrating ? (
            <div className="superstrike-intent-results">
              {(["adv.leftButton", "adv.rightButton"] as const).map((button, index) => (
                <div key={button}>
                  <span>{t(locale, button)}</span>
                  <output>{t(locale, `intent.${results[index]}`)}</output>
                </div>
              ))}
            </div>
          ) : null}
          {calibrating ? (
            <div ref={target} className={`hits-test-area superstrike-intent-target${cue ? " is-go" : ""}`}>
              {t(locale, cue ? "intent.goCue" : retry ? "intent.tooEarly" : "intent.waitCue")}
            </div>
          ) : null}
          {progress ? (
            <output className="setting-description">
              {progress.phase === "normal" || progress.phase === "intent"
                ? tp(locale, progress.phase === "normal" ? "intent.normalRound" : "intent.quickRound",
                  { count: progress.count, total: INTENT_CALIBRATION_COUNT })
                : progress.phase === "done"
                  ? tp(locale, "intent.calibrated", { speed: speedText(progress.speed) })
                  : tp(locale, "intent.calibrationFailed", { speed: speedText(speed) })}
            </output>
          ) : null}
          {range ? <p className="setting-description">{tp(locale, "intent.range", {
            min: new Intl.NumberFormat(locale).format(range[0]), max: speedText(range[1]),
          })}</p> : null}
        </div>
      </details>
    </section>
  );
}
