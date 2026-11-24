import { APIRequestContext } from '@playwright/test';

export const API_BASE = 'http://127.0.0.1:5080/api';

let cachedToken: string | null = null;

export async function localToken(request: APIRequestContext): Promise<string> {
  if (cachedToken) return cachedToken;
  const response = await request.post(`${API_BASE}/auth/local`);
  if (!response.ok()) throw new Error(`local auth failed: ${response.status()}`);
  const body = await response.json();
  cachedToken = body.accessToken as string;
  return cachedToken;
}

export async function api(
  request: APIRequestContext,
  method: string,
  path: string,
  token?: string,
  data?: unknown,
) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (data !== undefined && !(data instanceof FormData)) headers['Content-Type'] = 'application/json';
  return request.fetch(`${API_BASE}${path}`, {
    method,
    headers,
    data: data instanceof FormData ? undefined : data,
    multipart: data instanceof FormData ? { ...Object.fromEntries(data.entries()) } as any : undefined,
  });
}

/** Keep integration tests fast and deterministic: use the smallest installed chat model. */
let cachedFastModelId: string | null = null;

export async function resetFastModel(request: APIRequestContext): Promise<void> {
  const token = await localToken(request);
  if (!cachedFastModelId) {
    const models = await (await api(request, 'GET', '/models', token)).json();
    const fast = models.find((m: any) => m.name === 'qwen2.5:3b') ?? models[0];
    cachedFastModelId = fast?.id ?? null;
  }
  if (cachedFastModelId) await api(request, 'PUT', '/settings', token, { defaultModelId: cachedFastModelId });
}

export async function resetEnglish(request: APIRequestContext): Promise<void> {
  const token = await localToken(request);
  await api(request, 'PUT', '/settings', token, { language: 'en' });
}

export async function cleanupCreated(
  request: APIRequestContext,
  token: string,
  ids: { chats?: string[]; projects?: string[]; skills?: string[]; files?: string[] },
): Promise<void> {
  for (const id of ids.chats ?? []) await api(request, 'DELETE', `/chats/${id}`, token);
  for (const id of ids.projects ?? []) await api(request, 'DELETE', `/projects/${id}`, token);
  for (const id of ids.skills ?? []) await api(request, 'DELETE', `/skills/${id}`, token);
  for (const id of ids.files ?? []) await api(request, 'DELETE', `/files/${id}`, token);
}
