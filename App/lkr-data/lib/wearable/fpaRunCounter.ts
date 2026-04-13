import AsyncStorage from '@react-native-async-storage/async-storage';

const FPA_RUN_COUNTER_STORAGE_KEY = 'wearableFpaRunCounter';

/**
 * Persistent run counter for FPA sessions.
 * Survives full app restarts via AsyncStorage.
 */
export async function nextPersistentFpaRunNumber(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(FPA_RUN_COUNTER_STORAGE_KEY);
    const current = raw ? Number.parseInt(raw, 10) : 0;
    const safeCurrent = Number.isFinite(current) && current > 0 ? current : 0;
    const next = safeCurrent + 1;
    await AsyncStorage.setItem(FPA_RUN_COUNTER_STORAGE_KEY, String(next));
    return next;
  } catch {
    // Fallback keeps behavior stable if storage is temporarily unavailable.
    return 1;
  }
}
