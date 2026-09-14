import { beforeEach, describe, expect, it, vi } from 'vitest';

// 完全インメモリー。ネットワーク、認証情報、本番Firestore、FCMには接続しない。
const fake = vi.hoisted(() => {
  type Data = Record<string, unknown>;
  const records = new Map<string, Data>();
  const messaging = vi.fn();
  function snapshot(path: string) {
    return { exists: records.has(path), id: path.split('/').at(-1), data: () => records.get(path), ref: ref(path) };
  }
  function ref(path: string) {
    return {
      path, get: async () => snapshot(path), collection: (name: string) => collection(`${path}/${name}`),
      set: async (data: Data, options?: { merge?: boolean }) => { records.set(path, options?.merge ? { ...records.get(path), ...data } : data); },
      delete: async () => { records.delete(path); },
    };
  }
  function collection(path: string, filters: [string, unknown][] = []) {
    return {
      doc: (id: string) => ref(`${path}/${id}`),
      where: (key: string, _op: string, value: unknown) => collection(path, [...filters, [key, value]]),
      get: async () => ({ docs: [...records.keys()].filter(key => key.startsWith(path + '/') && !key.slice(path.length + 1).includes('/'))
        .filter(key => filters.every(([field, value]) => records.get(key)?.[field] === value)).map(snapshot) }),
    };
  }
  const db = {
    collection,
    runTransaction: async <T>(run: (transaction: {
      get: (target: ReturnType<typeof ref>) => ReturnType<ReturnType<typeof ref>['get']>;
      create: (target: ReturnType<typeof ref>, data: Data) => void;
      set: (target: ReturnType<typeof ref>, data: Data, options?: { merge?: boolean }) => void;
    }) => Promise<T>) => run({
      get: target => target.get(),
      create: (target, data) => { if (records.has(target.path)) throw new Error('exists'); records.set(target.path, data); },
      set: (target, data, options) => { records.set(target.path, options?.merge ? { ...records.get(target.path), ...data } : data); },
    }),
  };
  return { db, records, messaging };
});

vi.mock('../../../functions/node_modules/firebase-admin/lib/index.js', () => ({ firestore: () => fake.db, messaging: () => ({ sendEachForMulticast: fake.messaging }) }));
import { createProcessTaskNotifications, sendProcessTaskNotification } from '../../../functions/src/process/notifications';

type CreateEvent = Parameters<typeof createProcessTaskNotifications.run>[0];
type PushEvent = Parameters<typeof sendProcessTaskNotification.run>[0];
const task = { title: '図面確認', projectId: 'p1', columnId: 'todo', createdBy: 'alice', assigneeIds: ['not-a-recipient'] };
function change(before: object | undefined, after: object | undefined, id = 'event-1') {
  return { id, time: new Date().toISOString(), authId: 'alice', params: { taskId: 't1' }, data: {
    before: { data: () => before }, after: { data: () => after },
  } } as unknown as CreateEvent;
}
function inbox() { return [...fake.records.entries()].filter(([key]) => key.includes('/processNotifications/')); }
function pushEvent(path: string, data: object) {
  const parts = path.split('/');
  return { params: { userId: parts[1], notificationId: parts[3] }, data: { data: () => data } } as unknown as PushEvent;
}
beforeEach(() => {
  fake.records.clear(); fake.messaging.mockReset();
  fake.records.set('projects/p1', { name: '製品A', status: 'active', columns: [{ id: 'todo', name: '未着手', kind: 'todo' }, { id: 'doing', name: '進行中', kind: 'doing' }] });
  fake.records.set('users/alice', { displayName: '佐藤' });
  fake.records.set('users/bob', { displayName: '山田' });
  fake.records.set('users/off', { displayName: 'OFF' });
  fake.records.set('processMembers/a', { linkedUserId: 'alice', notification: { enabled: true, events: ['created', 'doing'] } });
  fake.records.set('processMembers/b', { linkedUserId: 'bob', notification: { enabled: true, events: ['doing'] } });
  fake.records.set('processMembers/off', { linkedUserId: 'off', notification: { enabled: false, events: ['doing'] } });
});
describe('工程管理通知のサーバー処理（外部接続なし）', () => {
  it('新規作成は選択したメンバーだけに通知データを作る', async () => {
    await createProcessTaskNotifications.run(change(undefined, task));
    expect(inbox()).toHaveLength(1);
    expect(inbox()[0][0]).toContain('users/alice/');
    expect(inbox()[0][1]).toMatchObject({ event: 'created', actorName: '佐藤', projectId: 'p1', taskId: 't1' });
    expect(fake.messaging).not.toHaveBeenCalled();
  });
  it('担当者に関係なくONの全メンバーへ。同一イベント再配信で二重作成しない', async () => {
    const event = change(task, { ...task, columnId: 'doing' });
    await createProcessTaskNotifications.run(event);
    await createProcessTaskNotifications.run(event);
    expect(inbox()).toHaveLength(2);
  });
  it('停止ユーザーや同じ列内の更新では通知データを作らない', async () => {
    fake.records.set('users/bob', { lifecycleState: 'deleted' });
    await createProcessTaskNotifications.run(change(task, { ...task, order: 'z' }));
    expect(inbox()).toHaveLength(0);
    await createProcessTaskNotifications.run(change(task, { ...task, columnId: 'doing' }));
    expect(inbox()).toHaveLength(1);
  });
  it('PWAへ工程管理用の識別子とタスクURLを送り、再配信時は送らない', async () => {
    await createProcessTaskNotifications.run(change(undefined, task));
    const [path, data] = inbox()[0];
    fake.records.set('users/alice/fcmTokens/token', { token: 'token-a' });
    fake.messaging.mockResolvedValue({ responses: [{ success: true }] });
    await sendProcessTaskNotification.run(pushEvent(path, data));
    await sendProcessTaskNotification.run(pushEvent(path, data));
    expect(fake.messaging).toHaveBeenCalledTimes(1);
    expect(fake.messaging.mock.calls[0][0].data).toMatchObject({ title: '工程管理｜図面確認', url: '/#/process/projects/p1/board?task=t1&from=notification' });
  });
  it('通知が作られた後でもOFFになったメンバーにはPushしない', async () => {
    await createProcessTaskNotifications.run(change(undefined, task));
    const [path, data] = inbox()[0];
    fake.records.set('processMembers/a', { linkedUserId: 'alice', notification: { enabled: false, events: ['created'] } });
    await sendProcessTaskNotification.run(pushEvent(path, data));
    expect(fake.messaging).not.toHaveBeenCalled();
  });
  it('部分失敗時は失敗トークンだけ再試行する', async () => {
    await createProcessTaskNotifications.run(change(undefined, task));
    const [path, data] = inbox()[0];
    fake.records.set('users/alice/fcmTokens/a', { token: 'a' });
    fake.records.set('users/alice/fcmTokens/b', { token: 'b' });
    fake.messaging.mockResolvedValueOnce({ responses: [{ success: true }, { success: false, error: { code: 'messaging/server-unavailable' } }] })
      .mockResolvedValueOnce({ responses: [{ success: true }] });
    await expect(sendProcessTaskNotification.run(pushEvent(path, data))).rejects.toThrow('partial-failure');
    await sendProcessTaskNotification.run(pushEvent(path, data));
    expect(fake.messaging.mock.calls[1][0].tokens).toEqual(['b']);
  });
});
