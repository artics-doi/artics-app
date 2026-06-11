export type ScheduleCategoryId =
  | 'vacation'
  | 'holiday'
  | 'outing'
  | 'fieldwork'
  | 'businessTrip'
  | 'vehicle'
  | 'vehicleOuting'
  | 'smallMeetingRoom'
  | 'largeMeetingRoom'
  | 'internalEvent'
  | 'maintenance'
  | 'other';

export type ScheduleNotificationTiming =
  | 'atStart'
  | 'fiveMinutesBefore'
  | 'fifteenMinutesBefore'
  | 'thirtyMinutesBefore'
  | 'oneHourBefore'
  | 'previousDayEvening'
  | 'sameDayMorning'
  | 'custom';

export interface ScheduleNotificationSetting {
  enabled: boolean;
  timings: ScheduleNotificationTiming[];
  customAt: Date | null;
}

export interface ScheduleEvent {
  id: string;
  title: string;
  categoryId: ScheduleCategoryId;
  targetUserIds: string[];
  targetUserNames: string[];
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
  memo: string;
  notification: ScheduleNotificationSetting;
  createdBy: string;
  createdByName: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  manualOrderDate?: string | null;
  manualOrder?: number | null;
  sentNotificationKeys?: string[];
}

export interface ScheduleEventInput {
  title: string;
  categoryId: ScheduleCategoryId;
  targetUserIds: string[];
  targetUserNames: string[];
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
  memo: string;
  notification: ScheduleNotificationSetting;
}
