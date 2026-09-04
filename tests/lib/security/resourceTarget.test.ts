import { describe, expect, it } from 'vitest';
import {
  classifyResourceTarget,
  isAllowedHttpsUrl,
  isAllowedNasPath,
} from '../../../src/lib/security/resourceTarget';

describe('resource target policy', () => {
  it('allows only HTTPS external URLs', () => {
    expect(isAllowedHttpsUrl('https://example.com/path')).toBe(true);
    expect(isAllowedHttpsUrl('http://example.com')).toBe(false);
    expect(isAllowedHttpsUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedHttpsUrl('file:///C:/secret.txt')).toBe(false);
  });

  it('allows only configured NAS hosts with exact host matching', () => {
    expect(isAllowedNasPath('\\\\Nas-1\\shared\\file.txt')).toBe(true);
    expect(isAllowedNasPath('\\\\nas-3\\shared\\file.txt')).toBe(true);
    expect(isAllowedNasPath('\\\\Nas-10\\shared\\file.txt')).toBe(false);
    expect(isAllowedNasPath('\\\\evil\\shared\\file.txt')).toBe(false);
  });

  it('returns a stable rejection reason', () => {
    expect(classifyResourceTarget('')).toMatchObject({ kind: 'blocked', reason: 'empty' });
    expect(classifyResourceTarget('\\\\evil\\x')).toMatchObject({ kind: 'blocked', reason: 'nas-host' });
    expect(classifyResourceTarget('not a url')).toMatchObject({ kind: 'blocked', reason: 'invalid' });
  });
});
