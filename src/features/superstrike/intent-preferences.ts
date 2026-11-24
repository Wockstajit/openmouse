import { DEFAULT_INTENT_SPEED, INTENT_SPEED_STEP, MAX_INTENT_SPEED, MIN_INTENT_SPEED } from "./intent-trigger.ts";

export interface IntentPreferences {
  enabled: boolean;
  speed: number;
  side: 0 | 1;
}

function key(device: string): string {
  return `openmouse-intent-v1:${device}`;
}

export function loadIntentPreferences(storage: Storage, device: string): IntentPreferences {
  const defaults: IntentPreferences = { enabled: false, speed: DEFAULT_INTENT_SPEED, side: 0 };
  try {
    const stored: Partial<IntentPreferences> | null = JSON.parse(storage.getItem(key(device)) ?? "null");
    const speed = stored?.speed;
    return {
      enabled: stored?.enabled === true,
      side: stored?.side === 1 ? 1 : 0,
      speed: typeof speed === "number" && speed >= MIN_INTENT_SPEED && speed <= MAX_INTENT_SPEED
        && speed % INTENT_SPEED_STEP === 0 ? speed : defaults.speed,
    };
  } catch {
    return defaults;
  }
}

export function saveIntentPreferences(storage: Storage, device: string, preferences: IntentPreferences): void {
  try {
    storage.setItem(key(device), JSON.stringify(preferences));
  } catch {
    // The controls still work for the current session when storage is unavailable.
  }
}
