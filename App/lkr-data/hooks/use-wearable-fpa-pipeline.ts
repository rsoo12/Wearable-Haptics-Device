import { useCallback, useEffect, useRef, useState } from 'react';
import type { Device, Subscription } from 'react-native-ble-plx';

import {
  FpaPipeline,
  type FpaPipelineOutput,
} from '@/lib/wearable/fpaPipeline';
import { nextPersistentFpaRunNumber } from '@/lib/wearable/fpaRunCounter';
import {
  NORDIC_UART_RX_CHAR_UUID,
  NORDIC_UART_SERVICE_UUID,
} from '@/lib/wearable/nordicUart';

function monoSeconds(): number {
  if (typeof globalThis.performance !== 'undefined' && performance.now) {
    return performance.now() / 1000;
  }
  return Date.now() / 1000;
}

type Options = {
  datarate?: number;
  isRightFoot?: boolean;
  rateWindow?: number;
};

/**
 * Subscribe to Nordic UART RX and run the same FPA + gait pipeline as
 * `Bluetooth/vqf_processor.py` on each notification (on-device, no backend).
 */
export function useWearableFpaPipeline(options?: Options) {
  const pipelinesRef = useRef(new Map<string, FpaPipeline>());
  const subsRef = useRef(new Map<string, Subscription>());
  const activeRunNumberRef = useRef<number | null>(null);
  const [latest, setLatest] = useState<FpaPipelineOutput | null>(null);

  const stop = useCallback(() => {
    for (const sub of subsRef.current.values()) {
      sub.remove();
    }
    subsRef.current.clear();
    for (const sub of subsRef.current.values()) {
      sub.remove();
    }
    subsRef.current.clear();
  }, []);

  const start = useCallback(
    async (device: Device) => {
      const existingSub = subsRef.current.get(device.id);
      existingSub?.remove();

      let pipeline = pipelinesRef.current.get(device.id);
      if (!pipeline) {
        if (activeRunNumberRef.current == null) {
          activeRunNumberRef.current = await nextPersistentFpaRunNumber();
        }
        pipeline = new FpaPipeline({ ...options, globalRunNumber: activeRunNumberRef.current });
        pipelinesRef.current.set(device.id, pipeline);
      }

      const sub = device.monitorCharacteristicForService(
        NORDIC_UART_SERVICE_UUID,
        NORDIC_UART_RX_CHAR_UUID,
        (err, characteristic) => {
          if (err) {
            return;
          }
          const currentPipeline = pipelinesRef.current.get(device.id);
          if (!currentPipeline) return;
          const out = currentPipeline.processPayloadBase64(
            characteristic?.value,
            monoSeconds(),
          );
          if (out) {
            setLatest(out);
          }
        },
      );
      subsRef.current.set(device.id, sub);
    },
    [options],
    [options],
  );

  const reset = useCallback(() => {
    stop();
    pipelinesRef.current.clear();
    activeRunNumberRef.current = null;
    setLatest(null);
  }, [stop]);

  useEffect(() => () => stop(), [stop]);

  return { latest, start, stop, reset };
}
