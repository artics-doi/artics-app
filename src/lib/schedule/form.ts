// 行動予定表の予定フォーム初期化とエラーメッセージ生成。
// Schedule.tsx から機械的に移動（挙動変更なし）。

import { FirebaseError } from 'firebase/app';
import type { ScheduleCategoryId, ScheduleEvent, ScheduleNotificationTiming } from '../../types/schedule';
import { toDateInputValue, toTimeInputValue } from './calendar';

export type ScheduleFormState = {
  title: string;
  categoryId: ScheduleCategoryId;
  targetUserIds: string[];
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  allDay: boolean;
  memo: string;
  notifyEnabled: boolean;
  notifyTiming: ScheduleNotificationTiming;
  customNotifyDate: string;
  customNotifyTime: string;
};

export function getScheduleErrorMessage(error: unknown, action: 'save' | 'delete' | 'load'): string {
  const actionText = action === 'save' ? '保存' : action === 'delete' ? '削除' : '取得';

  if (error instanceof FirebaseError) {
    if (error.code === 'permission-denied') {
      return `予定の${actionText}権限がありません。Firestoreルールに schedules の許可が反映されているか確認してください。`;
    }
    return `予定の${actionText}に失敗しました（${error.code}）`;
  }

  if (error instanceof Error && error.message) {
    return `予定の${actionText}に失敗しました: ${error.message}`;
  }

  return `予定の${actionText}に失敗しました`;
}

export function createInitialForm(date: Date, event?: ScheduleEvent): ScheduleFormState {
  const source = event ?? null;
  const customAt = source?.notification.customAt ?? null;
  return {
    title: source?.title ?? '',
    categoryId: source?.categoryId ?? 'vacation',
    targetUserIds: source?.targetUserIds ?? [],
    startDate: toDateInputValue(source?.startAt ?? date),
    startTime: source && !source.allDay ? toTimeInputValue(source.startAt) : '09:00',
    endDate: toDateInputValue(source?.endAt ?? source?.startAt ?? date),
    endTime: source?.endAt && !source.allDay ? toTimeInputValue(source.endAt) : '18:00',
    allDay: source?.allDay ?? true,
    memo: source?.memo ?? '',
    notifyEnabled: source?.notification.enabled ?? false,
    notifyTiming: source?.notification.timings[0] ?? 'sameDayMorning',
    customNotifyDate: customAt ? toDateInputValue(customAt) : toDateInputValue(date),
    customNotifyTime: customAt ? toTimeInputValue(customAt) : '08:30',
  };
}
