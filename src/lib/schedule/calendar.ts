// 行動予定表のカレンダー・日付計算の純ロジック。
// Schedule.tsx から機械的に移動（挙動変更なし）。React や Firestore に依存しない。

export const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];

export function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export const HOURS = Array.from({ length: 24 }, (_, index) => pad2(index));
export const MINUTES = Array.from({ length: 12 }, (_, index) => pad2(index * 5));
export const DAY_MS = 24 * 60 * 60 * 1000;

export function toDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function toOrderDateKey(date: Date): string {
  return toDateInputValue(startOfDay(date));
}

export function toTimeInputValue(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function getMonthCalendarDays(monthDate: Date): Date[] {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const firstGridDay = addDays(first, -((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => addDays(firstGridDay, index));
}

export function getWeekDays(date: Date): Date[] {
  const start = addDays(startOfDay(date), -((date.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function getCalendarWeeks(days: Date[]): Date[][] {
  return Array.from({ length: Math.ceil(days.length / 7) }, (_, index) => days.slice(index * 7, index * 7 + 7));
}

export function formatMonthLabel(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

export function formatDayLabel(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function formatFullDayLabel(date: Date): string {
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

export function formatScheduleDateRangeLabel(startAt: Date, endAt: Date | null): string {
  const end = endAt ?? startAt;
  if (isSameDay(startAt, end)) {
    return formatFullDayLabel(startAt);
  }
  return `${formatFullDayLabel(startAt)} - ${formatFullDayLabel(end)}`;
}

export function buildDate(dateValue: string, timeValue: string, allDay: boolean, isEnd = false): Date {
  if (allDay) {
    const [year, month, day] = dateValue.split('-').map(Number);
    return isEnd
      ? new Date(year, month - 1, day, 23, 59, 59, 999)
      : new Date(year, month - 1, day);
  }
  return new Date(`${dateValue}T${timeValue || (isEnd ? '18:00' : '09:00')}`);
}

export function isValidDate(value: Date): boolean {
  return !Number.isNaN(value.getTime());
}

export function getCalendarDayDiff(start: Date, end: Date): number {
  return Math.max(0, Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / DAY_MS));
}

export function shiftDateByDayDiff(source: Date, targetDate: Date, dayDiff: number, allDay: boolean, isEnd = false): Date {
  const shifted = addDays(startOfDay(targetDate), dayDiff);
  if (allDay) {
    return isEnd ? endOfDay(shifted) : shifted;
  }
  shifted.setHours(source.getHours(), source.getMinutes(), 0, 0);
  return shifted;
}
