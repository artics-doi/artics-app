export const ALLOWED_NAS_HOSTS = ['nas-1', 'nas-3'] as const;

export type ResourceTarget =
  | { kind: 'https'; value: string }
  | { kind: 'nas'; value: string }
  | { kind: 'blocked'; value: string; reason: 'empty' | 'protocol' | 'nas-host' | 'invalid' };

function normalizeNasHost(value: string): string | null {
  if (!value.startsWith('\\\\')) return null;
  const host = value.slice(2).split('\\', 1)[0]?.toLowerCase();
  return host || null;
}

export function classifyResourceTarget(value: string): ResourceTarget {
  const target = value.trim();
  if (!target) return { kind: 'blocked', value, reason: 'empty' };

  const nasHost = normalizeNasHost(target);
  if (nasHost) {
    return (ALLOWED_NAS_HOSTS as readonly string[]).includes(nasHost)
      ? { kind: 'nas', value: target }
      : { kind: 'blocked', value: target, reason: 'nas-host' };
  }

  try {
    const url = new URL(target);
    if (url.protocol !== 'https:') {
      return { kind: 'blocked', value: target, reason: 'protocol' };
    }
    return { kind: 'https', value: url.toString() };
  } catch {
    return { kind: 'blocked', value: target, reason: 'invalid' };
  }
}

export function isAllowedHttpsUrl(value: string): boolean {
  return classifyResourceTarget(value).kind === 'https';
}

export function isAllowedNasPath(value: string): boolean {
  return classifyResourceTarget(value).kind === 'nas';
}
