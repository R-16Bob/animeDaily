import type {
  Follow,
  FollowsPayload,
  ProbeResult,
  SearchPayload,
  Settings,
  SubjectDetail,
  TodayPayload,
  WeekPayload,
} from './types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text.slice(0, 200) };
  }
  if (!res.ok) {
    const message = (data as { error?: string })?.error ?? `请求失败 (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  today: () => request<TodayPayload>('/api/today'),
  week: () => request<WeekPayload>('/api/week'),
  follows: () => request<FollowsPayload>('/api/follows'),
  search: (q: string) => request<SearchPayload>(`/api/search?q=${encodeURIComponent(q)}`),
  subject: (id: number) => request<SubjectDetail>(`/api/subject/${id}`),
  addFollow: (subjectId: number, status = '在看') =>
    request<{ follow: Follow; created: boolean }>('/api/follows', json({ subjectId, status })),
  patchFollow: (id: number, patch: Partial<Pick<Follow, 'status' | 'epWatched' | 'note' | 'airWeekday'>>) =>
    request<{ follow: Follow }>(`/api/follows/${id}`, { ...json(patch), method: 'PATCH' }),
  removeFollow: (id: number) => request<{ removed: boolean }>(`/api/follows/${id}`, { method: 'DELETE' }),
  progress: (id: number, ep: number) => request<{ follow: Follow }>(`/api/follows/${id}/progress`, json({ ep })),
  importBangumi: (username: string) =>
    request<{ added: number; skipped: number; total: number; username: string }>('/api/import/bangumi', json({ username })),
  settings: () => request<{ settings: Settings }>('/api/settings'),
  saveSettings: (patch: Partial<Settings>) =>
    request<{ settings: Settings }>('/api/settings', { ...json(patch), method: 'PUT' }),
  probe: () => request<ProbeResult>('/api/network/probe', { method: 'POST' }),
  sync: (force = false) => request<{ sync: unknown }>(`/api/sync${force ? '?force=1' : ''}`, { method: 'POST' }),
  purge: () => request<{ ok: boolean }>('/api/cache/purge', { method: 'POST' }),
  health: () =>
    request<{ ok: boolean; cache: { files: number; bytes: number }; covers: { files: number; bytes: number }; follows: number }>(
      '/api/health',
    ),
};

export const coverUrl = (url: string) => (url ? `/api/img?u=${encodeURIComponent(url)}` : '');
