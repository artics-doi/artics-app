"use strict";
// 送信時のURLプレビューで使う、ネットワークを持たない判定。
// 取得そのものは linkPreview.ts が行う。ここは「取ってよいか」と「HTMLから文字だけ抜く」だけを決める。
Object.defineProperty(exports, "__esModule", { value: true });
exports.isBlockedIpv4 = isBlockedIpv4;
exports.isBlockedIpAddress = isBlockedIpAddress;
exports.isBlockedPreviewHostname = isBlockedPreviewHostname;
exports.normalizePreviewUrl = normalizePreviewUrl;
exports.previewPlainText = previewPlainText;
exports.extractLinkPreview = extractLinkPreview;
exports.resolveLinkPreview = resolveLinkPreview;
const TITLE_LIMIT = 120;
const DESCRIPTION_LIMIT = 240;
const SITE_NAME_LIMIT = 80;
const MAX_REDIRECTS = 3;
function ipv4ToInt(address) {
    const parts = address.split('.');
    if (parts.length !== 4)
        return null;
    const numbers = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN));
    if (numbers.some((part) => !Number.isInteger(part) || part < 0 || part > 255))
        return null;
    return (((numbers[0] << 24) >>> 0) + (numbers[1] << 16) + (numbers[2] << 8) + numbers[3]) >>> 0;
}
function inCidr(ip, base, bits) {
    const baseInt = ipv4ToInt(base);
    if (baseInt === null)
        return false;
    const mask = bits === 0 ? 0 : ((0xffffffff << (32 - bits)) >>> 0);
    return (ip & mask) === (baseInt & mask);
}
function isBlockedIpv4(address) {
    const ip = ipv4ToInt(address);
    if (ip === null)
        return true;
    return (inCidr(ip, '0.0.0.0', 8) ||
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
        inCidr(ip, '240.0.0.0', 4));
}
function isBlockedIpAddress(address) {
    const value = address.toLowerCase().split('%')[0];
    if (!value)
        return true;
    if (value.includes(':'))
        return isBlockedIpv6(value);
    return isBlockedIpv4(value);
}
function isBlockedIpv6(address) {
    var _a;
    if (address === '::' || address === '::1')
        return true;
    if (address.startsWith('::ffff:')) {
        return isBlockedIpv4(address.slice('::ffff:'.length));
    }
    if (address.startsWith('2001:db8'))
        return true;
    const first = (_a = address.split(':').find((part) => part.length > 0)) !== null && _a !== void 0 ? _a : '';
    if (!/^[0-9a-f]{1,4}$/.test(first))
        return true;
    if (first.startsWith('fc') || first.startsWith('fd'))
        return true;
    if (/^fe[89ab]/.test(first))
        return true;
    if (first.startsWith('ff'))
        return true;
    return false;
}
function isBlockedPreviewHostname(hostname) {
    const host = hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
    if (!host || host === 'localhost' || host.endsWith('.localhost'))
        return true;
    if (host.endsWith('.local') || host.endsWith('.internal'))
        return true;
    if (host === 'metadata.google.internal' || host === 'metadata.google.com')
        return true;
    const labels = host.split('.');
    if (labels.every((label) => /^\d+$/.test(label))) {
        return isBlockedIpv4(host);
    }
    if (host.includes(':'))
        return isBlockedIpAddress(host);
    return !host.includes('.');
}
function normalizePreviewUrl(raw) {
    if (raw.length === 0 || raw.length > 2000)
        return null;
    let parsed;
    try {
        parsed = new URL(raw.trim());
    }
    catch (_a) {
        return null;
    }
    if (parsed.protocol !== 'https:')
        return null;
    if (parsed.username || parsed.password)
        return null;
    if (parsed.port && parsed.port !== '443')
        return null;
    const hostname = parsed.hostname.toLowerCase();
    if (isBlockedPreviewHostname(hostname))
        return null;
    parsed.hash = '';
    parsed.hostname = hostname;
    return { url: parsed.toString(), hostname };
}
function resolveRedirect(currentUrl, location) {
    if (!location.trim())
        return null;
    try {
        return new URL(location, currentUrl).toString();
    }
    catch (_a) {
        return null;
    }
}
function safeCodePoint(code) {
    if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff)
        return '';
    if (code >= 0xd800 && code <= 0xdfff)
        return '';
    return String.fromCodePoint(code);
}
function previewPlainText(value, limit) {
    const decoded = value
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(Number.parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(Number.parseInt(dec, 10)))
        .replace(/&quot;/gi, '"')
        .replace(/&apos;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&amp;/gi, '&');
    return decoded.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}
function readAttributes(tag) {
    var _a, _b, _c, _d;
    const attributes = {};
    const pattern = /([:\w-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
    for (const match of tag.matchAll(pattern)) {
        const name = (_a = match[1]) === null || _a === void 0 ? void 0 : _a.toLowerCase();
        if (!name)
            continue;
        attributes[name] = (_d = (_c = (_b = match[3]) !== null && _b !== void 0 ? _b : match[4]) !== null && _c !== void 0 ? _c : match[5]) !== null && _d !== void 0 ? _d : '';
    }
    return attributes;
}
function metaContent(html, key) {
    var _a;
    const tags = (_a = html.match(/<meta\b[^>]*>/gi)) !== null && _a !== void 0 ? _a : [];
    for (const tag of tags) {
        const attributes = readAttributes(tag);
        const name = (attributes.property || attributes.name || '').toLowerCase();
        if (name === key && attributes.content) {
            return previewPlainText(attributes.content, key.endsWith('description') ? DESCRIPTION_LIMIT : TITLE_LIMIT);
        }
    }
    return '';
}
function extractLinkPreview(html, hostname) {
    var _a, _b;
    const titleTag = (_b = (_a = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)) === null || _a === void 0 ? void 0 : _a[1]) !== null && _b !== void 0 ? _b : '';
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
async function resolveLinkPreview(rawUrl, deps) {
    const initial = normalizePreviewUrl(rawUrl);
    if (!initial)
        return null;
    let current = initial.url;
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
        const destination = normalizePreviewUrl(current);
        if (!destination)
            return null;
        let addresses = [];
        try {
            addresses = await deps.lookup(destination.hostname);
        }
        catch (_a) {
            return null;
        }
        if (addresses.length === 0 || addresses.some((address) => isBlockedIpAddress(address)))
            return null;
        const page = await deps.fetchPage(destination.url);
        if (page.type === 'redirect') {
            if (redirectCount === MAX_REDIRECTS)
                return null;
            const next = resolveRedirect(destination.url, page.location);
            if (!next)
                return null;
            current = next;
            continue;
        }
        if (page.type !== 'html')
            return null;
        const fields = extractLinkPreview(page.body, destination.hostname);
        if (!fields.title && !fields.description)
            return null;
        return Object.assign({ url: initial.url }, fields);
    }
    return null;
}
//# sourceMappingURL=linkPreviewSafety.js.map