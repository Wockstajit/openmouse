import { useEffect, useRef, useState, type ReactNode } from "react";
import { subscribeAnalogPress } from "../../device/controller";
import { t, tp } from "../../i18n/index";
import { StepperSlider, SwitchButton } from "../../shared/ui";
import type { InterfaceLocale } from "../settings/interface-preferences";
import {
  createIntentCalibration, INTENT_CALIBRATION_COUNT, type IntentCalibrationProgress,
} from "./intent-calibration";
import type { IntentPreferences } from "./intent-preferences";
import {
  createIntentTrigger, INTENT_SPEED_STEP, MAX_INTENT_SPEED, MIN_INTENT_SPEED, type IntentOutcome,
} from "./intent-trigger";

export function IntentClickControls({ locale, preferences, onChange }: {
  locale: InterfaceLocale;
  preferences: IntentPreferences;
  onChange: (update: Partial<IntentPreferences>) => void;
}): ReactNode {
  const [side, setSide] = useState<0 | 1>(0);
  const [progress, setProgress] = useState<IntentCalibrationProgress | null>(null);
  const [result, setResult] = useState<IntentOutcome | "waiting" | "ready">("waiting");
  const [cue, setCue] = useState(false);
  const cueActive = useRef(false);
  const target = useRef<HTMLDivElement>(null);
  const calibration = useRef<ReturnType<typeof createIntentCalibration> | null>(null);
  const calibrating = progress?.phase === "normal" || progress?.phase === "intent";
  const { enabled, speed } = preferences;

  useEffect(() => {
    if (!progress || (progress.phase !== "normal" && progress.phase !== "intent")) return;
    const timer = window.setTimeout(() => {
      cueActive.current = true;
      setCue(true);
    }, 600 + Math.random() * 700);
    return () => {
      window.clearTimeout(timer);
      cueActive.current = false;
    };
  }, [progress]);

  useEffect(() => {
    if (!enabled && !calibrating) return;
    const trigger = createIntentTrigger(speed);
    let waiting = true;
    setResult("waiting");
    return subscribeAnalogPress((left, right) => {
      const depth = side === 0 ? left : right;
      const sample = { t: performance.now(), depth };
      if (calibration.current) {
        const next = calibration.current.sample(sample, cueActive.current && target.current?.matches(":hover") === true);
        if (!next) return;
        cueActive.current = false;
        setCue(false);
        setProgress(next);
        if (next.phase === "done" || next.phase === "failed") {
          calibration.current = null;
          if (next.phase === "done") onChange({ speed: next.speed });
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
  }, [enabled, speed, side, calibrating, onChange]);

  const start = (): void => {
    calibration.current = createIntentCalibration(speed);
    setProgress({ phase: "normal", count: 0 });
  };
  const cancel = (): void => {
    cueActive.current = false;
    setCue(false);
    calibration.current = null;
    setProgress(null);
  };

  const speedText = (value: number): string =>
    tp(locale, "intent.speedValue", { speed: new Intl.NumberFormat(locale).format(value) });

  return (
    <section className="superstrike-intent" aria-labelledby="superstrike-intent-title">
      <div className="superstrike-intent-heading">
        <div>
          <h3 id="superstrike-intent-title">{t(locale, "intent.live")}</h3>
          <p className="setting-description">{t(locale, "intent.scope")}</p>
        </div>
        <SwitchButton value={enabled} label={t(locale, "intent.live")} onChange={(value) => onChange({ enabled: value })} />
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
          onChange({ speed: value });
        }}
      />
      <div className="superstrike-intent-actions">
        <select aria-label={t(locale, "intent.button")} value={side} disabled={calibrating}
          onChange={(event) => setSide(event.currentTarget.value === "1" ? 1 : 0)}>
          <option value={0}>{t(locale, "adv.leftButton")}</option>
          <option value={1}>{t(locale, "adv.rightButton")}</option>
        </select>
        {calibrating
          ? <button type="button" className="superstrike-apply-button" onClick={cancel}>{t(locale, "common.cancel")}</button>
          : <button type="button" className="superstrike-apply-button" onClick={start}>{t(locale, "intent.calibrate")}</button>}
        {enabled && !calibrating ? <output>{t(locale, `intent.${result}`)}</output> : null}
      </div>
      {enabled && !calibrating && result === "ignored"
        ? <p className="setting-description">{t(locale, "intent.haptics")}</p>
        : null}
      {calibrating ? (
        <div ref={target} className={`hits-test-area superstrike-intent-target${cue ? " is-go" : ""}`}>
          {t(locale, cue ? "intent.goCue" : "intent.waitCue")}
        </div>
      ) : null}
      {progress ? (
        <output className="setting-description">
          {progress.phase === "normal" || progress.phase === "intent"
            ? tp(locale, progress.phase === "normal" ? "intent.normalRound" : "intent.quickRound",
              { count: progress.count, total: INTENT_CALIBRATION_COUNT })
            : t(locale, progress.phase === "done" ? "intent.calibrated" : "intent.calibrationFailed")}
        </output>
      ) : null}
    </section>
  );
}
