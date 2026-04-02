export type ProcessPacketResponse = {
  step: number;
  fpa_deg: number;
  rate_hz: number;
  print_message: string | null;
  in_feedback_window: boolean;
};

function getApiBaseUrl() {
  const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (!baseUrl) return null;
  return baseUrl.replace(/\/+$/, '');
}

export async function processBlePacket(
  payloadBase64: string,
  rateHz: number,
  signal?: AbortSignal,
): Promise<ProcessPacketResponse> {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    throw new Error('Missing EXPO_PUBLIC_API_BASE_URL');
  }

  const res = await fetch(`${baseUrl}/process`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      payload_b64: payloadBase64,
      rate_hz: rateHz,
    }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`);
  }

  const data = (await res.json()) as Partial<ProcessPacketResponse>;
  if (typeof data.step !== 'number') throw new Error('Invalid response: missing "step"');
  if (typeof data.fpa_deg !== 'number') throw new Error('Invalid response: missing "fpa_deg"');
  if (typeof data.rate_hz !== 'number') throw new Error('Invalid response: missing "rate_hz"');
  return {
    step: data.step,
    fpa_deg: data.fpa_deg,
    rate_hz: data.rate_hz,
    print_message: data.print_message ?? null,
    in_feedback_window: Boolean(data.in_feedback_window),
  };
}

