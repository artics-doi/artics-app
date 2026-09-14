import { describe, expect, it } from 'vitest';
import { processRecipientIds, resolveProcessEvent, processNotificationUrl, PROCESS_EVENTS } from '../../../functions/src/process/notificationPolicy';
import { normalizeProcessNotification, processTaskPath, PROCESS_NOTIFICATION_EVENTS } from '../../../src/lib/process/notifications';
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
  it('通知の初期値は全アクション、旧ON/OFFは廃止し不正値・重複を除く', () => {
    expect(normalizeProcessNotification(undefined)).toEqual({ events: ['created', 'todo', 'doing', 'done', 'approved', 'hold'] });
    expect(normalizeProcessNotification({ enabled: false, events: ['doing', 'bad', 'doing'] })).toEqual({ events: ['doing'] });
    expect(PROCESS_EVENTS).toEqual(PROCESS_NOTIFICATION_EVENTS.map(item => item.value));
  });
  it('新タスクは状態変更と二重計上しない', () => {
    expect(resolveProcessEvent(undefined, task, project)?.event).toBe('created');
  });
  it('既存の通知設定には完了承認を自動追加しない', () => {
    const existing = { enabled: true, events: ['created', 'todo', 'doing', 'done', 'hold'] };
    expect(normalizeProcessNotification(existing)).toEqual({ events: existing.events });
    expect(normalizeProcessNotification({ enabled: true, events: ['approved'] }).events).toEqual(['approved']);
  });
  it.each([false, undefined])('完了列の未承認(%s)からチェックを入れたときは完了承認', completionChecked => {
    const before = { ...task, columnId: 'c', completionChecked };
    expect(resolveProcessEvent(before, { ...before, completionChecked: true }, project)).toEqual({
      event: 'approved', previousStatus: '承認前', nextStatus: '完了承認',
    });
  });
  it('承認解除・承認済みの編集・完了以外のチェックでは承認通知しない', () => {
    const approved = { ...task, columnId: 'c', completionChecked: true };
    expect(resolveProcessEvent(approved, { ...approved, completionChecked: false }, project)).toBeNull();
    expect(resolveProcessEvent(approved, { ...approved, title: '編集' }, project)).toBeNull();
    expect(resolveProcessEvent(task, { ...task, completionChecked: true }, project)).toBeNull();
    expect(resolveProcessEvent(approved, { ...approved, isArchived: true }, project)).toBeNull();
    expect(resolveProcessEvent({ ...approved, completionChecked: false, isArchived: true }, approved, project)).toBeNull();
  });
  it('作成・完了列への移動とチェックが同時でも元のイベント1件だけ', () => {
    const approved = { ...task, columnId: 'c', completionChecked: true };
    expect(resolveProcessEvent(undefined, approved, project)?.event).toBe('created');
    expect(resolveProcessEvent(task, approved, project)?.event).toBe('done');
  });
  it('旧形式の完了列でも承認を判定する', () => {
    const before = { ...task, columnId: 'c' };
    expect(resolveProcessEvent(before, { ...before, completionChecked: true }, { columns: [{ id: 'c', name: '完了' }] })?.event).toBe('approved');
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
  it('該当アクションを選んだ担当者だけ、複数担当・UID重複を扱う', () => {
    const enabled = { notification: { enabled: true, events: ['doing'] } };
    expect(processRecipientIds([
      { ...enabled, id: 'a', linkedUserId: 'alice' }, { ...enabled, id: 'a2', linkedUserId: 'alice' },
      { ...enabled, id: 'b', linkedUserId: 'bob' }, { ...enabled, id: 'missing', linkedUserId: null },
      { id: 'unassigned', linkedUserId: 'unassigned' }, { id: 'other', linkedUserId: 'other', notification: { events: ['created'] } },
    ], 'doing', ['a', 'a2', 'b', 'missing', 'other'])).toEqual(['alice', 'bob']);
  });
  it.each(PROCESS_EVENTS)('進捗管理者は担当と個別設定に関係なく%sを受信する', event => {
    expect(processRecipientIds([
      { id: 'a', linkedUserId: 'alice', isTaskProgressManager: true, notification: { enabled: false, events: [] } },
      { id: 'b', linkedUserId: 'bob', isTaskProgressManager: true },
      { id: 'dup', linkedUserId: 'alice', isTaskProgressManager: true },
      { id: 'c', linkedUserId: 'other', isTaskProgressManager: false },
      { id: 'bad', linkedUserId: null, isTaskProgressManager: true },
    ], event, [])).toEqual(['alice', 'bob']);
  });
  it('旧OFFでも担当なら選択アクションを受信し、全解除は受信しない', () => {
    expect(processRecipientIds([
      { id: 'a', linkedUserId: 'alice', notification: { enabled: false, events: ['done'] } },
      { id: 'b', linkedUserId: 'bob', notification: { events: [] } },
      { id: 'c', linkedUserId: 'carol' },
    ], 'done', ['a', 'b', 'c'])).toEqual(['alice', 'carol']);
  });
  it('担当IDはAuth UIDと混同せず、欠損・不正な担当や連携IDへは送らない', () => {
    const members = [{ id: 'member-a', linkedUserId: 'alice' }, { id: 'bad', linkedUserId: 'a/b', isTaskProgressManager: true }];
    expect(processRecipientIds(members, 'done', ['alice', 'bad'])).toEqual([]);
    expect(processRecipientIds(members, 'done', undefined)).toEqual([]);
    expect(processRecipientIds(members, 'done', 'member-a')).toEqual([]);
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
    expect(parseProcessNotification({ ...details, event: 'approved' })?.event).toBe('approved');
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
