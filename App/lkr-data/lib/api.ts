export type ProcessPacketResponse = {
  step: number;
  fpa_deg: number;
  rate_hz: number;
  print_message: string | null;
  in_feedback_window: boolean;
};

export type SessionSummaryInput = {
  session_id: string;
  started_at: string;
  ended_at: string;
  csv_data: string;
};

export type SessionSummaryEntry = {
  session_id: string;
  started_at: string;
  ended_at: string;
  created_at: string;
  duration_sec: number;
  step_count: number;
  avg_fpa_deg: number;
  min_fpa_deg: number;
  max_fpa_deg: number;
  variability_deg: number;
};

export type DeleteSessionSummaryResponse = {
  deleted_session_ids: string[];
  deleted_count: number;
  aggregates: {
    session_count: number;
    avg_fpa_all_time_deg: number | null;
    avg_session_duration_sec: number | null;
    total_steps: number;
    min_fpa_all_time_deg: number | null;
    max_fpa_all_time_deg: number | null;
  };
};

function getApiBaseUrl() {
  const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (!baseUrl) return null;
  return baseUrl.replace(/\/+$/, '');
}

async function requestJson<TResponse>(
  path: string,
  init?: RequestInit,
  signal?: AbortSignal,
): Promise<TResponse> {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    throw new Error('Missing EXPO_PUBLIC_API_BASE_URL');
  }
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`);
  }
  return (await res.json()) as TResponse;
}

export async function processBlePacket(
  _payloadBase64: string,
  _rateHz: number,
  _signal?: AbortSignal,
): Promise<ProcessPacketResponse> {
  throw new Error('The /process backend path has been removed; FPA processing is now on-device.');
}

export async function createSessionSummary(input: SessionSummaryInput, signal?: AbortSignal): Promise<SessionSummaryEntry> {
  const entry = await requestJson<Partial<SessionSummaryEntry>>(
    '/session-summary',
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(input),
    },
    signal,
  );
  if (!entry.session_id || typeof entry.avg_fpa_deg !== 'number') {
    throw new Error('Invalid response: session summary was not persisted');
  }
  return entry as SessionSummaryEntry;
}

export async function listSessionSummaries(signal?: AbortSignal): Promise<SessionSummaryEntry[]> {
  const data = await requestJson<{ items?: SessionSummaryEntry[] }>(
    '/session-summaries',
    {
      method: 'GET',
      headers: {
        accept: 'application/json',
      },
    },
    signal,
  );
  return Array.isArray(data.items) ? data.items : [];
}

export async function deleteSessionSummary(
  sessionId: string,
  signal?: AbortSignal,
): Promise<DeleteSessionSummaryResponse> {
  return requestJson<DeleteSessionSummaryResponse>(
    '/session-summary',
    {
      method: 'DELETE',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ session_id: sessionId }),
    },
    signal,
  );
}

