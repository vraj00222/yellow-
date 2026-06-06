import type {
  Approval,
  CapsuleDetail,
  CapsuleMeta,
  DiagnoseResult,
  Health,
  NotifySettings,
  RestoreResult,
  StateDiff,
} from './types';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body && typeof body.error === 'string') detail = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

const q = (s: string) => encodeURIComponent(s);

export const api = {
  health: () => getJson<Health>('/api/health'),
  capsules: () => getJson<CapsuleMeta[]>('/api/capsules'),
  capsule: (id: string) => getJson<CapsuleDetail>(`/api/capsules/${q(id)}`),
  diff: (a: string, b: string) => getJson<StateDiff>(`/api/diff?a=${q(a)}&b=${q(b)}`),
  restore: async (id: string): Promise<RestoreResult> => {
    const res = await fetch(`/api/restore/${q(id)}`, { method: 'POST' });
    if (!res.ok) throw new Error(`Restore failed (${res.status})`);
    return (await res.json()) as RestoreResult;
  },
  diagnose: async (id: string): Promise<DiagnoseResult> => {
    const res = await fetch(`/api/capsules/${q(id)}/diagnose`, { method: 'POST' });
    if (!res.ok) {
      let detail = `Diagnose failed (${res.status})`;
      try {
        const body = await res.json();
        if (body && typeof body.error === 'string') detail = body.error;
      } catch {
        /* non-JSON error body */
      }
      throw new Error(detail);
    }
    return (await res.json()) as DiagnoseResult;
  },
  approvals: () => getJson<Record<string, Approval>>('/api/approvals'),
  settings: () => getJson<NotifySettings>('/api/settings'),
  testTelegram: async (): Promise<{ ok: boolean; error?: string }> => {
    const res = await fetch('/api/settings/test', { method: 'POST' });
    return (await res.json()) as { ok: boolean; error?: string };
  },
  notify: async (id: string): Promise<{ ok: boolean; error?: string }> => {
    const res = await fetch(`/api/capsules/${q(id)}/notify`, { method: 'POST' });
    return (await res.json()) as { ok: boolean; error?: string };
  },
  fixPr: async (id: string): Promise<{ ok: boolean; url?: string; error?: string }> => {
    const res = await fetch(`/api/capsules/${q(id)}/fix-pr`, { method: 'POST' });
    return (await res.json()) as { ok: boolean; url?: string; error?: string };
  },
};
