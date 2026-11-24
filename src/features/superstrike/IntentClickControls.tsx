import { useEffect, useRef, useState, type ReactNode } from "react";
import { stageLogitechFixedActuation, subscribeAnalogPress } from "../../device/controller";
import type { ControlSnapshot } from "../../device/types";
import { t, tp } from "../../i18n/index";
import { StepperSlider, SwitchButton } from "../../shared/ui";
import type { InterfaceLocale } from "../settings/interface-preferences";
import {
  createIntentCalibration, INTENT_CALIBRATION_COUNT, type IntentCalibrationProgress,
} from "./intent-calibration";
import type { IntentPreferences } from "./intent-preferences";
import {
  createIntentTrigger, intentDepths, INTENT_FALLBACK_STEP, INTENT_SPEED_STEP, MAX_INTENT_SPEED, MIN_INTENT_SPEED, type IntentOutcome,
} from "./intent-trigger";

export function IntentClickControls({ locale, preferences, actuation, maxActuation, hardwareTuning, hardwareReady, instantFlash, onChange }: {
  locale: InterfaceLocale;
  preferences: IntentPreferences;
  actuation: readonly [number, number];
  maxActuation: number;
  hardwareTuning: NonNullable<ControlSnapshot["deviceStatus"]>["analogButtonTuning"];
  hardwareReady: boolean;
  instantFlash: boolean;
  onChange: (update: Partial<IntentPreferences>) => void;
}): ReactNode {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [progress, setProgress] = useState<IntentCalibrationProgress | null>(null);
  const [result, setResult] = useState<IntentOutcome | "waiting" | "ready">("waiting");
  const [cue, setCue] = useState(false);
  const [retry, setRetry] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const cueActive = useRef(false);
  const cueTimer = useRef<number | undefined>(undefined);
  const earlyHeld = useRef(false);
  const target = useRef<HTMLDivElement>(null);
  const calibration = useRef<ReturnType<typeof createIntentCalibration> | null>(null);
  const calibrating = progress?.phase === "normal" || progress?.phase === "intent";
  const { enabled, speed, side } = preferences;
  const { early, fallback } = intentDepths(actuation[side], maxActuation);
  const hardwareStep = hardwareTuning?.buttons[side]?.actuation;
  const fixedStep = Math.min(INTENT_FALLBACK_STEP, maxActuation);

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
    if (!detailsOpen || (!enabled && !calibrating)) return;
    const trigger = createIntentTrigger(speed, { early, fallback });
    let waiting = true;
    setResult("waiting");
    return subscribeAnalogPress((left, right) => {
      const depth = side === 0 ? left : right;
      const sample = { t: performance.now(), depth };
      if (calibration.current) {
        const overTarget = target.current?.matches(":hover") === true;
        if (!cueActive.current && overTarget && depth >= early && !earlyHeld.current) {
          window.clearTimeout(cueTimer.current);
          earlyHeld.current = true;
          setRetry(true);
        }
        if (earlyHeld.current && depth === 0) {
          earlyHeld.current = false;
          setRetryCount((count) => count + 1);
        }
        const next = calibration.current.sample(sample, cueActive.current && overTarget);
        if (!next) return;
        cueActive.current = false;
        setCue(false);
        setRetry(false);
        setProgress(next);
        if (next.phase === "done" || next.phase === "failed") {
          calibration.current = null;
          if (next.phase === "done") onChange({ speed: next.speed, enabled: false });
        }
      } else if (enabled) {
        const outcome = trigger.sample(sample);
        if (outcome) setResult(outcome);
        else if (waiting && depth === 0) {
          waiting = false;
          setResult("ready");
        }
      }
    });
  }, [detailsOpen, enabled, speed, side, early, fallback, calibrating, onChange]);

  const start = (): void => {
    onChange({ enabled: false });
    calibration.current = createIntentCalibration(speed, { early, fallback });
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
    <section className="superstrike-intent" aria-label={t(locale, "intent.live")}>
      <div className="superstrike-intent-actions">
        <select aria-label={t(locale, "intent.button")} value={side} disabled={calibrating}
          onChange={(event) => {
            onChange({ enabled: false, side: event.currentTarget.value === "1" ? 1 : 0 });
            setProgress(null);
          }}>
          <option value={0}>{t(locale, "adv.leftButton")}</option>
          <option value={1}>{t(locale, "adv.rightButton")}</option>
        </select>
        {hardwareStep !== undefined ? (
          <>
            <p className="setting-description">{tp(locale, "intent.hardwareStep", { step: hardwareStep })}</p>
            {hardwareStep < fixedStep ? (
              <button type="button" className="superstrike-apply-button" disabled={!hardwareReady}
                onClick={() => stageLogitechFixedActuation(side, fixedStep)}>
                {tp(locale, instantFlash ? "intent.hardwareApply" : "intent.hardwareQueue", { step: fixedStep })}
              </button>
            ) : null}
          </>
        ) : null}
      </div>
      <details className="superstrike-intent-details" onToggle={(event) => {
        const open = event.currentTarget.open;
        setDetailsOpen(open);
        if (!open && calibrating) cancel();
      }}>
        <summary>{t(locale, "intent.title")}</summary>
        <div>
          <div className="superstrike-intent-heading">
            <div>
              <h3>{t(locale, "intent.live")}</h3>
              <p className="setting-description">{t(locale, "intent.scope")}</p>
              <p className="setting-description">{tp(locale, "intent.depths", { early, fallback })}</p>
            </div>
            <SwitchButton value={enabled} label={t(locale, "intent.live")} disabled={calibrating} onChange={(value) => onChange({ enabled: value })} />
          </div>
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
              onChange({ speed: value, enabled: false });
            }}
          />
          <div className="superstrike-intent-actions">
            {calibrating
              ? <button type="button" className="superstrike-apply-button" onClick={cancel}>{t(locale, "common.cancel")}</button>
              : <button type="button" className="superstrike-apply-button" onClick={start}>{t(locale, "intent.calibrate")}</button>}
            {enabled && !calibrating ? <output>{t(locale, `intent.${result}`)}</output> : null}
          </div>
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
