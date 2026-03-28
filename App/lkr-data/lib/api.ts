type HelloResponse = { message: string };

function getApiBaseUrl() {
  const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (!baseUrl) return null;
  return baseUrl.replace(/\/+$/, '');
}

export async function fetchHelloMessage(signal?: AbortSignal): Promise<HelloResponse> {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    throw new Error('Missing EXPO_PUBLIC_API_BASE_URL');
  }

  const res = await fetch(`${baseUrl}/hello`, {
    method: 'GET',
    headers: { accept: 'application/json' },
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`);
  }

  const data = (await res.json()) as Partial<HelloResponse>;
  if (!data.message) throw new Error('Invalid response: missing "message"');
  return { message: data.message };
}

