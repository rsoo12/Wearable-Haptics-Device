import { useCallback, useRef } from 'react';
import type { BleManager, Device } from 'react-native-ble-plx';

import { writeNordicUartTx } from '@/lib/wearable/nordicUart';

/**
 * Writes vibration / command payloads to the **haptics** peripheral over Nordic UART TX.
 * Pair with `assignReceiverAndSenderDevices`: only the sender device should be configured here.
 */
export function useWearableHapticsWriter() {
  const senderIdRef = useRef<string | null>(null);

  const configureSender = useCallback((device: Device | null) => {
    senderIdRef.current = device?.id ?? null;
  }, []);

  const reset = useCallback(() => {
    senderIdRef.current = null;
  }, []);

  const send = useCallback(async (manager: BleManager, payload: string) => {
    const id = senderIdRef.current;
    if (!id) {
      throw new Error('No haptics (sender) device is connected.');
    }
    await writeNordicUartTx(manager, id, payload);
  }, []);

  return { configureSender, send, reset };
}
