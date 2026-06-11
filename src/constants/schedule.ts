import type { ScheduleCategoryId, ScheduleNotificationTiming } from '../types/schedule';

export const SCHEDULE_CATEGORIES: Array<{
  id: ScheduleCategoryId;
  label: string;
  tone: string;
}> = [
  { id: 'vacation', label: '休暇', tone: 'green' },
  { id: 'holiday', label: '休日', tone: 'red' },
  { id: 'outing', label: '外出', tone: 'orange' },
  { id: 'fieldwork', label: '外勤', tone: 'olive' },
  { id: 'businessTrip', label: '出張', tone: 'yellow' },
  { id: 'vehicle', label: '車両', tone: 'navy' },
  { id: 'vehicleOuting', label: '車両・外出', tone: 'indigo' },
  { id: 'smallMeetingRoom', label: '中会議室', tone: 'gray' },
  { id: 'largeMeetingRoom', label: '大会議室', tone: 'brown' },
  { id: 'internalEvent', label: '社内イベント', tone: 'pink' },
  { id: 'maintenance', label: 'メンテナンス', tone: 'rose' },
  { id: 'other', label: 'その他', tone: 'slate' },
];

export const SCHEDULE_CATEGORY_BY_ID = Object.fromEntries(
  SCHEDULE_CATEGORIES.map((category) => [category.id, category]),
) as Record<ScheduleCategoryId, (typeof SCHEDULE_CATEGORIES)[number]>;

export const SCHEDULE_CATEGORY_LABEL_TO_ID: Record<string, ScheduleCategoryId> = {
  休暇: 'vacation',
  休日: 'holiday',
  外出: 'outing',
  外勤: 'fieldwork',
  出張: 'businessTrip',
  車両: 'vehicle',
  '車両・外出': 'vehicleOuting',
  中会議室: 'smallMeetingRoom',
  大会議室: 'largeMeetingRoom',
  社内イベント: 'internalEvent',
  メンテナンス: 'maintenance',
};

export const SCHEDULE_NOTIFICATION_TIMINGS: Array<{
  id: ScheduleNotificationTiming;
  label: string;
}> = [
  { id: 'atStart', label: '開始時刻' },
  { id: 'fiveMinutesBefore', label: '5分前' },
  { id: 'fifteenMinutesBefore', label: '15分前' },
  { id: 'thirtyMinutesBefore', label: '30分前' },
  { id: 'oneHourBefore', label: '1時間前' },
  { id: 'previousDayEvening', label: '前日 17:00' },
  { id: 'sameDayMorning', label: '当日 8:30' },
  { id: 'custom', label: '任意日時' },
];
