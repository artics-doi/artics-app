import { describe, expect, it } from 'vitest';
import { processRecipientIds, resolveProcessEvent, processNotificationUrl } from '../../../functions/src/process/notificationPolicy';
import { normalizeProcessNotification, processTaskPath } from '../../../src/lib/process/notifications';
import { parseProcessNotification } from '../../../electron/notificationTypes';
import { generateNotificationHTML } from '../../../electron/notificationHtml';

const project = { status: 'active', columns: [
  { id: 'a', name: '未着手', kind: 'todo' }, { id: 'b', name: '進行中', kind: 'doing' },
  { id: 'c', name: '完了', kind: 'done' }, { id: 'd', name: '保留', kind: 'hold' },
  { id: 'custom', name: '承認', kind: 'custom' },
] };
const task = { title: '確認', columnId: 'a', archived: false, isArchived: false, assigneeIds: ['someone'] };
const details = { projectId: 'p', taskId: 't', projectName: '製品A', event: 'doing' as const, previousStatus: '未着手', nextStatus: '進行中', actorName: '佐藤', occurredAt: '2026-09-14T05:32:00Z' };

describe('工程管理通知の判定', () => {
  it('既存・新規メンバーの通知は初期OFF', () => {
    expect(normalizeProcessNotification(undefined)).toEqual({ enabled: false, events: ['created', 'todo', 'doing', 'done', 'hold'] });
    expect(normalizeProcessNotification({ enabled: 'true', events: ['doing', 'bad', 'doing'] })).toEqual({ enabled: false, events: ['doing'] });
  });
  it('新タスクは状態変更と二重計上しない', () => {
    expect(resolveProcessEvent(undefined, task, project)?.event).toBe('created');
  });
  it.each([['b', 'doing'], ['c', 'done'], ['d', 'hold'], ['a', 'todo']])('%sへの移動は%s', (id, event) => {
    expect(resolveProcessEvent({ ...task, columnId: id === 'a' ? 'd' : 'a' }, { ...task, columnId: id }, project)?.event).toBe(event);
  });
  it('並べ替え・日付/担当者編集・削除は通知しない', () => {
    expect(resolveProcessEvent(task, { ...task, order: 'z', assigneeIds: [] }, project)).toBeNull();
    expect(resolveProcessEvent(task, undefined, project)).toBeNull();
  });
  it('アーカイブ・復元・削除処理では通知しない', () => {
    expect(resolveProcessEvent(task, { ...task, columnId: 'b', isArchived: true }, project)).toBeNull();
    expect(resolveProcessEvent({ ...task, archived: true }, { ...task, columnId: 'b' }, project)).toBeNull();
    expect(resolveProcessEvent(undefined, task, { ...project, status: 'archived' })).toBeNull();
    expect(resolveProcessEvent(undefined, task, { ...project, lifecycleState: 'deleting' })).toBeNull();
  });
  it('旧形式の列名も判定し、カスタム列/不明列には誤通知しない', () => {
    expect(resolveProcessEvent(task, { ...task, columnId: 'b' }, { columns: [{ id: 'b', name: '対応中' }] })?.event).toBe('doing');
    expect(resolveProcessEvent(task, { ...task, columnId: 'custom' }, project)).toBeNull();
    expect(resolveProcessEvent(task, { ...task, columnId: 'missing' }, project)).toBeNull();
  });
  it('ON・該当アクション・紐付け済みメンバーだけ、重複なし、担当は無関係', () => {
    const enabled = { notification: { enabled: true, events: ['doing'] } };
    expect(processRecipientIds([
      { ...enabled, linkedUserId: 'alice' }, { ...enabled, linkedUserId: 'alice' },
      { ...enabled, linkedUserId: 'bob' }, { ...enabled, linkedUserId: null },
      { linkedUserId: 'off' }, { linkedUserId: 'other', notification: { enabled: true, events: ['created'] } },
    ], 'doing')).toEqual(['alice', 'bob']);
  });
  it('PWA/Electronで同じタスクへ、IDはURLエンコードする', () => {
    expect(processNotificationUrl('日本 #', 'task?')).toBe('/#' + processTaskPath('日本 #', 'task?'));
  });
});

describe('通知表示の安全性', () => {
  it('不正な宛先や未知イベントは破棄', () => {
    expect(parseProcessNotification({ ...details, taskId: '../x' })).toBeUndefined();
    expect(parseProcessNotification({ ...details, event: 'bogus' })).toBeUndefined();
    expect(parseProcessNotification(details)).toEqual(details);
  });
  it('HTMLを実行せずtextContentで表示する、既存の経路を維持', () => {
    const html = generateNotificationHTML([{ id: 1, kind: 'process', title: '</script><script>alert(1)</script>', body: '', process: details }]);
    expect(html).not.toContain('</script><script>alert(1)');
    expect(html).toContain('sender.textContent = notif.title');
    expect(html).toContain('openProcessTask');
    expect(html).toContain('openSchedule');
    expect(html).toContain('openRoom');
    expect(html).toContain('#f3efff');
  });
});
