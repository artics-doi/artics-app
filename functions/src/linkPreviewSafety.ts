// 送信時のURLプレビューで使う、ネットワークを持たない判定。
// 取得そのものは linkPreview.ts が行う。ここは「取ってよいか」と「HTMLから文字だけ抜く」だけを決める。

const TITLE_LIMIT = 120;
const DESCRIPTION_LIMIT = 240;
const SITE_NAME_LIMIT = 80;
const MAX_REDIRECTS = 3;

export type LinkPreviewFields = {
  url: string;
  title: string;
  description: string;
  siteName: string;
};

export type PreviewPage =
  | { type: 'redirect'; location: string }
  | { type: 'html'; body: string }
  | { type: 'ignore' };

export type PreviewDependencies = {
  lookup: (hostname: string) => Promise<string[]>;
  fetchPage: (url: string) => Promise<PreviewPage>;
};

type NormalizedPreviewUrl = {
  url: string;
  hostname: string;
};

function ipv4ToInt(address: string): number | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  const numbers = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN));
  if (numbers.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (((numbers[0] << 24) >>> 0) + (numbers[1] << 16) + (numbers[2] << 8) + numbers[3]) >>> 0;
}

function inCidr(ip: number, base: string, bits: number): boolean {
  const baseInt = ipv4ToInt(base);
  if (baseInt === null) return false;
  const mask = bits === 0 ? 0 : ((0xffffffff << (32 - bits)) >>> 0);
  return (ip & mask) === (baseInt & mask);
}

export function isBlockedIpv4(address: string): boolean {
  const ip = ipv4ToInt(address);
  if (ip === null) return true;
  return (
    inCidr(ip, '0.0.0.0', 8) ||
    inCidr(ip, '10.0.0.0', 8) ||
    inCidr(ip, '100.64.0.0', 10) ||
    inCidr(ip, '127.0.0.0', 8) ||
    inCidr(ip, '169.254.0.0', 16) ||
    inCidr(ip, '172.16.0.0', 12) ||
    inCidr(ip, '192.0.0.0', 24) ||
    inCidr(ip, '192.0.2.0', 24) ||
    inCidr(ip, '192.168.0.0', 16) ||
    inCidr(ip, '198.18.0.0', 15) ||
    inCidr(ip, '198.51.100.0', 24) ||
    inCidr(ip, '203.0.113.0', 24) ||
    inCidr(ip, '224.0.0.0', 4) ||
    inCidr(ip, '240.0.0.0', 4)
  );
}

export function isBlockedIpAddress(address: string): boolean {
  const value = address.toLowerCase().split('%')[0];
  if (!value) return true;
  if (value.includes(':')) return isBlockedIpv6(value);
  return isBlockedIpv4(value);
}

function isBlockedIpv6(address: string): boolean {
  if (address === '::' || address === '::1') return true;
  if (address.startsWith('::ffff:')) {
    return isBlockedIpv4(address.slice('::ffff:'.length));
  }
  if (address.startsWith('2001:db8')) return true;
  const first = address.split(':').find((part) => part.length > 0) ?? '';
  if (!/^[0-9a-f]{1,4}$/.test(first)) return true;
  if (first.startsWith('fc') || first.startsWith('fd')) return true;
  if (/^fe[89ab]/.test(first)) return true;
  if (first.startsWith('ff')) return true;
  return false;
}

export function isBlockedPreviewHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (host === 'metadata.google.internal' || host === 'metadata.google.com') return true;
  const labels = host.split('.');
  if (labels.every((label) => /^\d+$/.test(label))) {
    return isBlockedIpv4(host);
  }
  if (host.includes(':')) return isBlockedIpAddress(host);
  return !host.includes('.');
}

export function normalizePreviewUrl(raw: string): NormalizedPreviewUrl | null {
  if (raw.length === 0 || raw.length > 2000) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.port && parsed.port !== '443') return null;
  const hostname = parsed.hostname.toLowerCase();
  if (isBlockedPreviewHostname(hostname)) return null;
  parsed.hash = '';
  parsed.hostname = hostname;
  return { url: parsed.toString(), hostname };
}

function resolveRedirect(currentUrl: string, location: string): string | null {
  if (!location.trim()) return null;
  try {
    return new URL(location, currentUrl).toString();
  } catch {
    return null;
  }
}

function safeCodePoint(code: number): string {
  if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff) return '';
  if (code >= 0xd800 && code <= 0xdfff) return '';
  return String.fromCodePoint(code);
}

export function previewPlainText(value: string, limit: number): string {
  const decoded = value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => safeCodePoint(Number.parseInt(dec, 10)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
  return decoded.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function readAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([:\w-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  for (const match of tag.matchAll(pattern)) {
    const name = match[1]?.toLowerCase();
    if (!name) continue;
    attributes[name] = match[3] ?? match[4] ?? match[5] ?? '';
  }
  return attributes;
}

function metaContent(html: string, key: string): string {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const attributes = readAttributes(tag);
    const name = (attributes.property || attributes.name || '').toLowerCase();
    if (name === key && attributes.content) {
      return previewPlainText(attributes.content, key.endsWith('description') ? DESCRIPTION_LIMIT : TITLE_LIMIT);
    }
  }
  return '';
}

export function extractLinkPreview(html: string, hostname: string): Omit<LinkPreviewFields, 'url'> {
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '';
  const title = metaContent(html, 'og:title')
    || metaContent(html, 'twitter:title')
    || previewPlainText(titleTag, TITLE_LIMIT);
  const description = metaContent(html, 'og:description')
    || metaContent(html, 'twitter:description')
    || metaContent(html, 'description');
  const siteName = metaContent(html, 'og:site_name') || previewPlainText(hostname, SITE_NAME_LIMIT);
  return {
    title,
    description,
    siteName: siteName.slice(0, SITE_NAME_LIMIT),
  };
}

export async function resolveLinkPreview(
  rawUrl: string,
  deps: PreviewDependencies,
): Promise<LinkPreviewFields | null> {
  const initial = normalizePreviewUrl(rawUrl);
  if (!initial) return null;
  let current = initial.url;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const destination = normalizePreviewUrl(current);
    if (!destination) return null;
    let addresses: string[] = [];
    try {
      addresses = await deps.lookup(destination.hostname);
    } catch {
      return null;
    }
    if (addresses.length === 0 || addresses.some((address) => isBlockedIpAddress(address))) return null;

    const page = await deps.fetchPage(destination.url);
    if (page.type === 'redirect') {
      if (redirectCount === MAX_REDIRECTS) return null;
      const next = resolveRedirect(destination.url, page.location);
      if (!next) return null;
      current = next;
      continue;
    }
    if (page.type !== 'html') return null;
    const fields = extractLinkPreview(page.body, destination.hostname);
    if (!fields.title && !fields.description) return null;
    return { url: initial.url, ...fields };
  }

  return null;
}
