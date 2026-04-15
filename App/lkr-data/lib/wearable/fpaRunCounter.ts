import AsyncStorage from '@react-native-async-storage/async-storage';

const FPA_RUN_COUNTER_STORAGE_KEY = 'wearableFpaRunCounter';
const FPA_BASE_CALIBRATION_STORAGE_KEY = 'wearableFpaBaseCalibrationDeg';
const memoryFallbackStore = new Map<string, string>();

async function safeGetItem(key: string): Promise<string | null> {
  try {
    const value = await AsyncStorage.getItem(key);
    if (value != null) {
      memoryFallbackStore.set(key, value);
    }
    return value;
  } catch {
    return memoryFallbackStore.get(key) ?? null;
  }
}

async function safeSetItem(key: string, value: string): Promise<void> {
  memoryFallbackStore.set(key, value);
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // Keep in-memory fallback when native storage is unavailable.
  }
}

/**
 * Persistent run counter for FPA sessions.
 * Survives full app restarts via AsyncStorage.
 */
export async function nextPersistentFpaRunNumber(): Promise<number> {
  const raw = await safeGetItem(FPA_RUN_COUNTER_STORAGE_KEY);
  const current = raw ? Number.parseInt(raw, 10) : 0;
  const safeCurrent = Number.isFinite(current) && current > 0 ? current : 0;
  const next = safeCurrent + 1;
  await safeSetItem(FPA_RUN_COUNTER_STORAGE_KEY, String(next));
  return next;
}

export async function setStoredBaseFpaDeg(value: number): Promise<void> {
  await safeSetItem(FPA_BASE_CALIBRATION_STORAGE_KEY, String(value));
}

export async function getStoredBaseFpaDeg(): Promise<number | null> {
  const raw = await safeGetItem(FPA_BASE_CALIBRATION_STORAGE_KEY);
  if (!raw) return null;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}
