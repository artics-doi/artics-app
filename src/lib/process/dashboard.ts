// ダッシュボード/カンバンで使う純ロジック。
// 「今日」を引数で受け取れるようにして、テスト可能（Date.now() 非依存）にする。

import type { ProcessMember, Task } from '../../types/process';

// 1週間の日数（ダッシュボードの週ウィンドウ列数）。
export const DASHBOARD_WEEK_DAYS = 7;

// ダッシュボードの表示粒度。週=日列、月=週列、年=月列。
export type DashboardDisplayMode = 'week' | 'month' | 'year';

export interface DashboardPeriodBucket {
  key: string;
  label: string;
  subLabel: string;
  start: Date;
  end: Date;
}

// 指定日の0時を返す（時分秒を切り捨て、日付比較を安定させる）。
export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// 指定日に days 日を足した新しい Date を返す（元の Date は壊さない）。
export function addDays(date: Date, days: number): Date {
  const d = startOfDay(date);
  d.setDate(d.getDate() + days);
  return d;
}

// 指定日に months か月を足した月初を返す。
export function addMonths(date: Date, months: number): Date {
  const d = startOfDay(date);
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  return d;
}

// 指定日に years 年を足した年初を返す。
export function addYears(date: Date, years: number): Date {
  const d = startOfDay(date);
  d.setMonth(0, 1);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

export function startOfMonth(date: Date): Date {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

export function endOfMonth(date: Date): Date {
  const d = startOfMonth(date);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return startOfDay(d);
}

export function startOfYear(date: Date): Date {
  const d = startOfDay(date);
  d.setMonth(0, 1);
  return d;
}

// 2つの日付が同じ日か（時分秒は無視）。
export function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

// 「今日」を含む週の起点（=今日の0時）から DASHBOARD_WEEK_DAYS 日分の Date 配列を返す。
// 仕様: 週ウィンドウは「今日」を先頭にした直近7日（先週ではなく今日起点）。
//   こうすると、開発スケジュール管理で「今日からの予定」が常に左端に来て見やすい。
export function buildWeekWindow(today: Date, offsetWeeks = 0): Date[] {
  const start = addDays(today, offsetWeeks * DASHBOARD_WEEK_DAYS);
  const days: Date[] = [];
  for (let i = 0; i < DASHBOARD_WEEK_DAYS; i++) {
    days.push(addDays(start, i));
  }
  return days;
}

// 曜日ラベル（日本語の短縮形）。getDay() の 0=日 … 6=土 に対応。
const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

// Date → 曜日ラベル（「月」など）。
export function weekdayLabel(date: Date): string {
  return WEEKDAY_LABELS[date.getDay()];
}

// 土日か（カレンダー列の薄い背景づけ用）。
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shortMonthDate(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function createDayBucket(date: Date): DashboardPeriodBucket {
  const day = startOfDay(date);
  return {
    key: dateKey(day),
    label: weekdayLabel(day),
    subLabel: shortMonthDate(day),
    start: day,
    end: day,
  };
}

// 今日起点の7日を、日単位バケットとして返す。
export function buildWeekBuckets(today: Date, offsetWeeks = 0): DashboardPeriodBucket[] {
  return buildWeekWindow(today, offsetWeeks).map(createDayBucket);
}

// 月間表示は、月を7日ごとの週バケットに分ける。31列にしないことで視認性を保つ。
export function buildMonthBuckets(today: Date, offsetMonths = 0): DashboardPeriodBucket[] {
  const monthStart = addMonths(today, offsetMonths);
  const monthEnd = endOfMonth(monthStart);
  const buckets: DashboardPeriodBucket[] = [];
  let cursor = monthStart;

  while (cursor.getTime() <= monthEnd.getTime()) {
    const bucketStart = cursor;
    const bucketEnd = new Date(Math.min(addDays(bucketStart, 6).getTime(), monthEnd.getTime()));
    buckets.push({
      key: `${dateKey(bucketStart)}:${dateKey(bucketEnd)}`,
      label: `${bucketStart.getMonth() + 1}/${bucketStart.getDate()}週`,
      subLabel: `${shortMonthDate(bucketStart)}-${shortMonthDate(bucketEnd)}`,
      start: bucketStart,
      end: bucketEnd,
    });
    cursor = addDays(bucketEnd, 1);
  }

  return buckets;
}

// 年間表示は、1月〜12月の月バケットで表示する。
export function buildYearBuckets(today: Date, offsetYears = 0): DashboardPeriodBucket[] {
  const yearStart = addYears(today, offsetYears);
  const year = yearStart.getFullYear();
  const buckets: DashboardPeriodBucket[] = [];

  for (let month = 0; month < 12; month++) {
    const start = startOfDay(new Date(year, month, 1));
    const end = endOfMonth(start);
    buckets.push({
      key: `${year}-${String(month + 1).padStart(2, '0')}`,
      label: `${month + 1}月`,
      subLabel: `${year}`,
      start,
      end,
    });
  }

  return buckets;
}

export function buildDashboardPeriodBuckets(
  today: Date,
  mode: DashboardDisplayMode,
  offset = 0,
): DashboardPeriodBucket[] {
  if (mode === 'month') return buildMonthBuckets(today, offset);
  if (mode === 'year') return buildYearBuckets(today, offset);
  return buildWeekBuckets(today, offset);
}

export function dashboardPeriodLabel(
  today: Date,
  mode: DashboardDisplayMode,
  offset = 0,
): string {
  const buckets = buildDashboardPeriodBuckets(today, mode, offset);
  if (buckets.length === 0) return '';

  if (mode === 'year') {
    return `${buckets[0].start.getFullYear()}年`;
  }
  if (mode === 'month') {
    return `${buckets[0].start.getFullYear()}年${buckets[0].start.getMonth() + 1}月`;
  }

  const first = buckets[0].start;
  const last = buckets[buckets.length - 1].end;
  return `${shortMonthDate(first)} - ${shortMonthDate(last)}`;
}

export function bucketContainsDate(bucket: DashboardPeriodBucket, date: Date): boolean {
  const target = startOfDay(date).getTime();
  return bucket.start.getTime() <= target && target <= bucket.end.getTime();
}

/**
 * レーン表示でカード数が上限を超えたとき、「表示する分」と「+N 件」に分ける。
 * 例: 7件・上限5 → { visible: 先頭5件, overflow: 2 }
 * @param items 並んだタスク配列
 * @param limit 1レーンに表示する最大件数（1以上）
 */
export function splitWithOverflow<T>(
  items: readonly T[],
  limit: number,
): { visible: T[]; overflow: number } {
  if (limit <= 0) return { visible: [], overflow: items.length };
  if (items.length <= limit) return { visible: [...items], overflow: 0 };
  return { visible: items.slice(0, limit), overflow: items.length - limit };
}

// ===== ダッシュボードの週レーン割当 =====
//
// ダッシュボードは「担当者（行）× 週の各日（列）」のグリッド。
// 各タスクは startDate〜endDate の範囲を、週ウィンドウ内に収めて棒（バー）として描く。
// 純ロジックとして「どのタスクがどの列範囲を占めるか」を計算し、UI は結果を描くだけにする。

// タスクの「実効期間」を求める。startDate/endDate のどちらかが欠けても破綻しないよう補完する。
//   - 両方ある: そのまま [start, end]
//   - start のみ: その日だけ [start, start]
//   - end のみ: その日だけ [end, end]
//   - 両方なし: null（期間が決まらない＝週グリッドに置けない。別枠「日付未設定」で扱う）
export function taskEffectiveRange(task: Task): { start: Date; end: Date } | null {
  const s = task.startDate;
  const e = task.endDate;
  if (s && e) {
    // 終了が開始より前の壊れたデータは、開始日だけの1日扱いにフォールバック。
    return startOfDay(e).getTime() < startOfDay(s).getTime()
      ? { start: startOfDay(s), end: startOfDay(s) }
      : { start: startOfDay(s), end: startOfDay(e) };
  }
  if (s) return { start: startOfDay(s), end: startOfDay(s) };
  if (e) return { start: startOfDay(e), end: startOfDay(e) };
  return null;
}

// タスクの期間が週ウィンドウ [windowStart, windowEnd]（両端含む）と少しでも重なるか。
export function overlapsWindow(task: Task, windowStart: Date, windowEnd: Date): boolean {
  const range = taskEffectiveRange(task);
  if (!range) return false;
  const ws = startOfDay(windowStart).getTime();
  const we = startOfDay(windowEnd).getTime();
  return range.start.getTime() <= we && range.end.getTime() >= ws;
}

/**
 * タスクのバーを週ウィンドウ（days）の列インデックスにマッピングする。
 * 返す startCol/endCol は days 配列内の 0始まりインデックス（両端含む）。
 * 期間がウィンドウから一部はみ出す場合はウィンドウ端でクランプする。
 * ウィンドウと全く重ならない / 日付未設定なら null。
 */
export function taskBarColumns(
  task: Task,
  days: readonly Date[],
): { startCol: number; endCol: number } | null {
  if (days.length === 0) return null;
  const range = taskEffectiveRange(task);
  if (!range) return null;

  const windowStart = startOfDay(days[0]);
  const windowEnd = startOfDay(days[days.length - 1]);
  if (!overlapsWindow(task, windowStart, windowEnd)) return null;

  // ウィンドウ端でクランプしてから列インデックスへ。
  const clampedStart = Math.max(range.start.getTime(), windowStart.getTime());
  const clampedEnd = Math.min(range.end.getTime(), windowEnd.getTime());

  const startCol = days.findIndex((d) => startOfDay(d).getTime() === clampedStart);
  // endCol は「clampedEnd 以下で最大の列」。findIndex の逆引き。
  let endCol = startCol;
  for (let i = days.length - 1; i >= 0; i--) {
    if (startOfDay(days[i]).getTime() <= clampedEnd) {
      endCol = i;
      break;
    }
  }
  if (startCol < 0) return null;
  return { startCol, endCol: Math.max(startCol, endCol) };
}

/**
 * タスクのバーを任意の期間バケット（日/週/月）へマッピングする。
 * 月間は週列、年間は月列として扱うため、タスク開始日がバケット先頭と一致しなくても
 * 「重なった最初/最後のバケット」を列として返す。
 */
export function taskBarBucketColumns(
  task: Task,
  buckets: readonly DashboardPeriodBucket[],
): { startCol: number; endCol: number } | null {
  if (buckets.length === 0) return null;
  const range = taskEffectiveRange(task);
  if (!range) return null;

  const windowStart = buckets[0].start;
  const windowEnd = buckets[buckets.length - 1].end;
  if (!overlapsWindow(task, windowStart, windowEnd)) return null;

  const startTime = range.start.getTime();
  const endTime = range.end.getTime();
  const startCol = buckets.findIndex(
    (bucket) => bucket.start.getTime() <= endTime && bucket.end.getTime() >= startTime,
  );
  let endCol = startCol;

  for (let i = buckets.length - 1; i >= 0; i--) {
    const bucket = buckets[i];
    if (bucket.start.getTime() <= endTime && bucket.end.getTime() >= startTime) {
      endCol = i;
      break;
    }
  }

  if (startCol < 0) return null;
  return { startCol, endCol: Math.max(startCol, endCol) };
}

// ダッシュボードの1行（担当者レーン）。member が null の行は「担当者未設定」。
export interface DashboardLane {
  member: ProcessMember | null;
  tasks: Task[];
}

/**
 * タスク群を担当者ごとのレーンに振り分ける。
 *   - 1タスクが複数担当者を持つ場合は、それぞれの担当者レーンに重複して入れる
 *     （ダッシュボードは「誰がいつ何を抱えているか」を見る画面なので、各担当者の行に出すのが自然）。
 *   - assigneeIds が空のタスクは「担当者未設定」レーン（member=null）にまとめる。
 *   - レーンの順序は members の順（order 昇順で渡される前提）。末尾に未設定レーン。
 *   - タスクが1件もない担当者レーンは含めない（空行で画面が間延びしないように）。
 * @param tasks 週ウィンドウで絞り込み済みのタスク（呼び出し側でフィルタ）
 * @param members 表示対象の担当者（並び順そのまま使う）
 */
export function buildDashboardLanes(
  tasks: readonly Task[],
  members: readonly ProcessMember[],
): DashboardLane[] {
  const lanes: DashboardLane[] = [];

  for (const member of members) {
    const laneTasks = tasks.filter((t) => t.assigneeIds.includes(member.id));
    if (laneTasks.length > 0) {
      lanes.push({ member, tasks: laneTasks });
    }
  }

  const unassigned = tasks.filter((t) => t.assigneeIds.length === 0);
  if (unassigned.length > 0) {
    lanes.push({ member: null, tasks: unassigned });
  }

  return lanes;
}

/**
 * 週ウィンドウに重なるタスクだけを残す（日付未設定・範囲外は除外）。
 * @param tasks archived=false 済みのタスク
 * @param days 週ウィンドウの日付配列
 */
export function filterTasksInWindow(tasks: readonly Task[], days: readonly Date[]): Task[] {
  if (days.length === 0) return [];
  const windowStart = days[0];
  const windowEnd = days[days.length - 1];
  return tasks.filter((t) => overlapsWindow(t, windowStart, windowEnd));
}

export function filterTasksInBuckets(
  tasks: readonly Task[],
  buckets: readonly DashboardPeriodBucket[],
): Task[] {
  if (buckets.length === 0) return [];
  const windowStart = buckets[0].start;
  const windowEnd = buckets[buckets.length - 1].end;
  return tasks.filter((t) => overlapsWindow(t, windowStart, windowEnd));
}
