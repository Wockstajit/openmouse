import { DEFAULT_INTENT_SPEED, INTENT_SPEED_STEP, MAX_INTENT_SPEED, MIN_INTENT_SPEED } from "./intent-trigger.ts";

function key(device: string): string {
  return `openmouse-intent-v1:${device}`;
}

export function loadIntentSpeed(storage: Storage, device: string): number {
  try {
    const stored: { speed?: unknown } | null = JSON.parse(storage.getItem(key(device)) ?? "null");
    const speed = stored?.speed;
    return typeof speed === "number" && speed >= MIN_INTENT_SPEED && speed <= MAX_INTENT_SPEED
      && speed % INTENT_SPEED_STEP === 0 ? speed : DEFAULT_INTENT_SPEED;
  } catch {
    return DEFAULT_INTENT_SPEED;
  }
}

export function saveIntentSpeed(storage: Storage, device: string, speed: number): void {
  try {
    storage.setItem(key(device), JSON.stringify({ speed }));
  } catch {
    // The controls still work for the current session when storage is unavailable.
  }
}
