import { describe, expect, test } from 'vitest';
import { FirebaseError } from 'firebase/app';
import { createInitialForm, getScheduleErrorMessage } from '../../../src/lib/schedule/form';
import type { ScheduleEvent } from '../../../src/types/schedule';

function d(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute);
}

function event(partial: Partial<ScheduleEvent> = {}): ScheduleEvent {
  return {
    id: 'e1',
    title: '出張',
    categoryId: 'businessTrip',
    targetUserIds: ['u1'],
    targetUserNames: ['ユーザー1'],
    startAt: d(2026, 6, 10, 9, 0),
    endAt: d(2026, 6, 10, 17, 30),
    allDay: false,
    memo: 'メモ',
    notification: { enabled: true, timings: ['previousDayEvening'], customAt: null },
    createdBy: 'u1',
    createdByName: 'ユーザー1',
    createdAt: d(2026, 6, 1),
    updatedAt: null,
    ...partial,
  };
}

describe('createInitialForm', () => {
  test('新規作成時のデフォルト値', () => {
    const form = createInitialForm(d(2026, 6, 11));
    expect(form).toEqual({
      title: '',
      categoryId: 'vacation',
      targetUserIds: [],
      startDate: '2026-06-11',
      startTime: '09:00',
      endDate: '2026-06-11',
      endTime: '18:00',
      allDay: true,
      memo: '',
      notifyEnabled: false,
      notifyTiming: 'sameDayMorning',
      customNotifyDate: '2026-06-11',
      customNotifyTime: '08:30',
    });
  });

  test('時刻指定イベントの編集時はイベントの時刻を引き継ぐ', () => {
    const form = createInitialForm(d(2026, 6, 11), event());
    expect(form.title).toBe('出張');
    expect(form.categoryId).toBe('businessTrip');
    expect(form.startDate).toBe('2026-06-10');
    expect(form.startTime).toBe('09:00');
    expect(form.endDate).toBe('2026-06-10');
    expect(form.endTime).toBe('17:30');
    expect(form.allDay).toBe(false);
    expect(form.notifyEnabled).toBe(true);
    expect(form.notifyTiming).toBe('previousDayEvening');
  });

  test('終日イベントの編集時は時刻がデフォルトに戻る', () => {
    const form = createInitialForm(d(2026, 6, 11), event({ allDay: true }));
    expect(form.startTime).toBe('09:00');
    expect(form.endTime).toBe('18:00');
    expect(form.allDay).toBe(true);
  });

  test('カスタム通知日時はイベントの customAt を引き継ぐ', () => {
    const form = createInitialForm(
      d(2026, 6, 11),
      event({ notification: { enabled: true, timings: ['custom'], customAt: d(2026, 6, 9, 7, 15) } }),
    );
    expect(form.customNotifyDate).toBe('2026-06-09');
    expect(form.customNotifyTime).toBe('07:15');
  });
});

describe('getScheduleErrorMessage', () => {
  test('permission-denied はルール確認を促す文言', () => {
    const error = new FirebaseError('permission-denied', 'denied');
    expect(getScheduleErrorMessage(error, 'save')).toBe(
      '予定の保存権限がありません。Firestoreルールに schedules の許可が反映されているか確認してください。',
    );
  });

  test('その他の FirebaseError はコード付き文言', () => {
    const error = new FirebaseError('unavailable', 'down');
    expect(getScheduleErrorMessage(error, 'delete')).toBe('予定の削除に失敗しました（unavailable）');
  });

  test('一般エラーはメッセージを付与、不明値は汎用文言', () => {
    expect(getScheduleErrorMessage(new Error('boom'), 'load')).toBe('予定の取得に失敗しました: boom');
    expect(getScheduleErrorMessage('unknown', 'save')).toBe('予定の保存に失敗しました');
  });
});
