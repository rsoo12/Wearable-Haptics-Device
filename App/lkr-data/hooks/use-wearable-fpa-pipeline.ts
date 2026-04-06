import { useCallback, useEffect, useRef, useState } from 'react';
import type { Device, Subscription } from 'react-native-ble-plx';

import {
  FpaPipeline,
  type FpaPipelineOutput,
} from '@/lib/wearable/fpaPipeline';
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
  const pipelineRef = useRef(new FpaPipeline(options));
  const [latest, setLatest] = useState<FpaPipelineOutput | null>(null);
  const subRef = useRef<Subscription | null>(null);

  const stop = useCallback(() => {
    subRef.current?.remove();
    subRef.current = null;
  }, []);

  const start = useCallback(
    (device: Device) => {
      stop();
      const sub = device.monitorCharacteristicForService(
        NORDIC_UART_SERVICE_UUID,
        NORDIC_UART_RX_CHAR_UUID,
        (err, characteristic) => {
          if (err) {
            return;
          }
          const out = pipelineRef.current.processPayloadBase64(
            characteristic?.value,
            monoSeconds(),
          );
          if (out) {
            setLatest(out);
          }
        },
      );
      subRef.current = sub;
    },
    [stop],
  );

  const reset = useCallback(() => {
    pipelineRef.current.reset();
    setLatest(null);
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { latest, start, stop, reset };
}
