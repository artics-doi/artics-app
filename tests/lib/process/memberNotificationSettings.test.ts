import { describe, expect, it } from 'vitest';
import { toMember, memberInputToCreateData } from '../../../src/lib/process/converters';
import { normalizeProcessNotification } from '../../../src/lib/process/notifications';

describe('メンバー通知設定の互換性', () => {
  it('既存メンバーは管理者へ自動昇格しない', () => {
    expect(toMember('m', { name: '佐藤', linkedUserId: 'u', notification: { enabled: false, events: ['done'] } }))
      .toMatchObject({ isTaskProgressManager: false, notification: { events: ['done'] } });
    expect(toMember('m', { isTaskProgressManager: 'true' }).isTaskProgressManager).toBe(false);
    expect(toMember('m', { isTaskProgressManager: true }).isTaskProgressManager).toBe(true);
  });
  it('新規メンバーは非管理者・アクション6種類で作成し、enabledを保存しない', () => {
    const data = memberInputToCreateData({ name: '佐藤', linkedUserId: 'u', colorIndex: 0 }, 0);
    expect(data.isTaskProgressManager).toBe(false);
    expect(data.notification.events).toHaveLength(6);
    expect(data.notification).not.toHaveProperty('enabled');
  });
  it('全解除を保存でき、旧設定のON/OFFに左右されない', () => {
    expect(normalizeProcessNotification({ enabled: true, events: [] })).toEqual({ events: [] });
    expect(normalizeProcessNotification({ enabled: false, events: ['done'] })).toEqual({ events: ['done'] });
  });
});
