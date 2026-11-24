import { DEFAULT_INTENT_SPEED, INTENT_SPEED_STEP, MAX_INTENT_SPEED, MIN_INTENT_SPEED } from "./intent-trigger.ts";

export interface IntentPreferences {
  enabled: boolean;
  speed: number;
}

function key(device: string): string {
  return `openmouse-intent-v1:${device}`;
}

export function loadIntentPreferences(storage: Storage, device: string): IntentPreferences {
  const defaults = { enabled: false, speed: DEFAULT_INTENT_SPEED };
  try {
    const stored: Partial<IntentPreferences> | null = JSON.parse(storage.getItem(key(device)) ?? "null");
    const speed = stored?.speed;
    return {
      enabled: stored?.enabled === true,
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
