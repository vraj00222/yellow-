// Deep-link builders + clipboard copy for shareable capsule links.
// Mirrors App.tsx's URL parsing: ?capsule=<id> opens Inspect, ?from&to opens Diff.

const origin = (): string => (typeof window === 'undefined' ? '' : window.location.origin);

export function inspectLink(id: string): string {
  return `${origin()}/?capsule=${encodeURIComponent(id)}`;
}

export function diffLink(a: string, b: string): string {
  return `${origin()}/?from=${encodeURIComponent(a)}&to=${encodeURIComponent(b)}`;
}

/** Copy text to the clipboard; falls back for non-secure contexts. Returns success. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
