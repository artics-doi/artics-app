import type { Project, ProjectColumn, ProcessMember, Task } from '../../types/process';
import type { ScheduleEvent } from '../../types/schedule';
import { addDays, startOfDay } from './dashboard';
import { taskStatusFromColumn } from './gantt';

export const FISCAL_YEAR_START_MONTH = 7; // 0-based. 7 = August.
export const DEFAULT_HOURS_PER_BUSINESS_DAY = 8;
export const HOLIDAY_WARNING_MIN_DAYS = 10;

export interface FiscalYearPeriod {
  fiscalYear: number;
  start: Date;
  end: Date;
}

export interface EffortReportTaskDetail {
  taskId: string;
  taskTitle: string;
  projectId: string;
  memberId: string;
  status: 'doing' | 'done';
  businessDays: number;
  hours: number;
}

export interface EffortReportDailyDetail {
  date: Date;
  dateKey: string;
  taskId: string;
  taskTitle: string;
  projectId: string;
  memberId: string;
  status: 'doing' | 'done';
  hours: number;
}

export interface EffortReportCompressedDetail {
  startDate: Date;
  endDate: Date;
  startDateKey: string;
  endDateKey: string;
  taskId: string;
  taskTitle: string;
  projectId: string;
  memberId: string;
  status: 'doing' | 'done';
  days: number;
  hoursPerDay: number;
  totalHours: number;
}

export interface EffortReportMemberSummary {
  projectId: string;
  memberId: string;
  businessDays: number;
  totalHours: number;
  taskHours: number;
  unallocatedHours: number;
  taskDetails: EffortReportTaskDetail[];
  dailyDetails: EffortReportDailyDetail[];
}

export interface EffortReportProjectSummary {
  projectId: string;
  projectName: string;
  totalHours: number;
  memberSummaries: EffortReportMemberSummary[];
}

export interface EffortReportValidationIssue {
  id: string;
  severity: 'error' | 'warning';
  message: string;
  projectId?: string;
  memberId?: string;
  taskId?: string;
}

export interface EffortReportResult {
  period: FiscalYearPeriod;
  hoursPerBusinessDay: number;
  holidayDates: string[];
  totalHours: number;
  projects: EffortReportProjectSummary[];
  issues: EffortReportValidationIssue[];
}

function dateKey(date: Date): string {
  const d = startOfDay(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function eachDay(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  let cursor = startOfDay(start);
  const last = startOfDay(end);
  while (cursor.getTime() <= last.getTime()) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

function intersects(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return startOfDay(aStart).getTime() <= startOfDay(bEnd).getTime() &&
    startOfDay(aEnd).getTime() >= startOfDay(bStart).getTime();
}

function clampRange(start: Date, end: Date, min: Date, max: Date): { start: Date; end: Date } | null {
  if (!intersects(start, end, min, max)) return null;
  const s = new Date(Math.max(startOfDay(start).getTime(), startOfDay(min).getTime()));
  const e = new Date(Math.min(startOfDay(end).getTime(), startOfDay(max).getTime()));
  return { start: s, end: e };
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function nextBusinessDate(date: Date, holidayKeys: ReadonlySet<string>): Date {
  let cursor = addDays(startOfDay(date), 1);
  while (isWeekend(cursor) || holidayKeys.has(dateKey(cursor))) {
    cursor = addDays(cursor, 1);
  }
  return cursor;
}

export function buildFiscalYearPeriod(fiscalYear: number): FiscalYearPeriod {
  return {
    fiscalYear,
    start: startOfDay(new Date(fiscalYear, FISCAL_YEAR_START_MONTH, 1)),
    end: startOfDay(new Date(fiscalYear + 1, FISCAL_YEAR_START_MONTH, 0)),
  };
}

export function formatEffortDate(date: Date): string {
  const d = startOfDay(date);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export function formatEffortInputDate(date: Date): string {
  const d = startOfDay(date);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

export function effortReportFileName(period: FiscalYearPeriod): string {
  return `開発工数_${period.fiscalYear}年度_${formatEffortInputDate(period.start)}-${formatEffortInputDate(period.end)}.pdf`;
}

export function scheduleHolidayDateKeys(
  schedules: readonly ScheduleEvent[],
  period: FiscalYearPeriod,
): Set<string> {
  const keys = new Set<string>();
  for (const schedule of schedules) {
    if (schedule.categoryId !== 'holiday') continue;
    const endAt = schedule.endAt ?? schedule.startAt;
    const clipped = clampRange(schedule.startAt, endAt, period.start, period.end);
    if (!clipped) continue;
    eachDay(clipped.start, clipped.end).forEach((day) => keys.add(dateKey(day)));
  }
  return keys;
}

export function businessDaysInRange(
  start: Date,
  end: Date,
  holidayKeys: ReadonlySet<string>,
): Date[] {
  return eachDay(start, end).filter((day) => !isWeekend(day) && !holidayKeys.has(dateKey(day)));
}

function columnsByProject(projects: readonly Project[]): Map<string, ProjectColumn[]> {
  return new Map(projects.map((project) => [project.id, project.columns]));
}

function memberName(memberById: Map<string, ProcessMember>, memberId: string): string {
  return memberById.get(memberId)?.name ?? '不明な担当者';
}

function projectName(projectById: Map<string, Project>, projectId: string): string {
  return projectById.get(projectId)?.name ?? '不明なプロジェクト';
}

function effortIssueId(...parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(':');
}

function normalizeHoursPerBusinessDay(hoursPerBusinessDay: number | null | undefined): number {
  return typeof hoursPerBusinessDay === 'number' && Number.isFinite(hoursPerBusinessDay) && hoursPerBusinessDay > 0
    ? hoursPerBusinessDay
    : DEFAULT_HOURS_PER_BUSINESS_DAY;
}

function addHours(
  map: Map<string, EffortReportTaskDetail>,
  task: Task,
  memberId: string,
  status: 'doing' | 'done',
  hours: number,
  hoursPerBusinessDay: number,
) {
  const key = `${task.id}__${memberId}`;
  const current = map.get(key);
  if (current) {
    current.hours += hours;
    current.businessDays += hours / hoursPerBusinessDay;
    return;
  }
  map.set(key, {
    taskId: task.id,
    taskTitle: task.title || '(無題)',
    projectId: task.projectId,
    memberId,
    status,
    businessDays: hours / hoursPerBusinessDay,
    hours,
  });
}

function eligibleTaskStatus(task: Task, projectColumns: Map<string, ProjectColumn[]>): 'doing' | 'done' | null {
  const column = projectColumns.get(task.projectId)?.find((item) => item.id === task.columnId) ?? null;
  const status = taskStatusFromColumn(column);
  return status === 'doing' || status === 'done' ? status : null;
}

export function buildEffortReport(params: {
  fiscalYear: number;
  projects: readonly Project[];
  members: readonly ProcessMember[];
  tasks: readonly Task[];
  schedules: readonly ScheduleEvent[];
  hoursPerBusinessDay?: number;
}): EffortReportResult {
  const period = buildFiscalYearPeriod(params.fiscalYear);
  const hoursPerBusinessDay = normalizeHoursPerBusinessDay(params.hoursPerBusinessDay);
  const projectById = new Map(params.projects.map((project) => [project.id, project]));
  const memberById = new Map(params.members.map((member) => [member.id, member]));
  const projectColumns = columnsByProject(params.projects);
  const holidayKeys = scheduleHolidayDateKeys(params.schedules, period);
  const issues: EffortReportValidationIssue[] = [];

  if (holidayKeys.size < HOLIDAY_WARNING_MIN_DAYS) {
    issues.push({
      id: 'holidays:low-count',
      severity: 'warning',
      message: `${period.fiscalYear}年度の休日予定が${holidayKeys.size}日です。行動予定表の休日登録を確認してください。`,
    });
  }

  const projectSummaries = new Map<string, EffortReportProjectSummary>();

  params.tasks.forEach((task) => {
    if (!projectById.has(task.projectId)) return;
    const status = eligibleTaskStatus(task, projectColumns);
    if (!status) return;
    if (task.assigneeIds.length === 0) return;
    if (task.startDate && task.endDate) return;
    for (const memberId of task.assigneeIds) {
      issues.push({
        id: effortIssueId('task:missing-date', task.id, memberId),
        severity: 'warning',
        message: `${projectName(projectById, task.projectId)} / ${task.title || '(無題)'} は開始日または終了日が未入力のため、工数明細から除外しました。`,
        projectId: task.projectId,
        memberId,
        taskId: task.id,
      });
    }
  });

  for (const project of params.projects) {
    const memberIds = new Set<string>();
    params.tasks.forEach((task) => {
      if (task.projectId !== project.id) return;
      if (!eligibleTaskStatus(task, projectColumns)) return;
      task.assigneeIds.forEach((memberId) => memberIds.add(memberId));
    });

    for (const memberId of memberIds) {
      const taskDetailsById = new Map<string, EffortReportTaskDetail>();
      const dailyDetails: EffortReportDailyDetail[] = [];
      const activeDayKeys = new Set<string>();

      for (const day of businessDaysInRange(period.start, period.end, holidayKeys)) {
        const dayTasks = params.tasks.filter((task) => {
          if (task.projectId !== project.id) return false;
          if (!task.assigneeIds.includes(memberId)) return false;
          const status = eligibleTaskStatus(task, projectColumns);
          if (!status) return false;
          if (!task.startDate || !task.endDate) return false;
          return intersects(task.startDate, task.endDate, day, day);
        });
        if (dayTasks.length === 0) continue;
        const dayKey = dateKey(day);
        activeDayKeys.add(dayKey);
        const perTaskHours = hoursPerBusinessDay / dayTasks.length;
        for (const task of dayTasks) {
          const status = eligibleTaskStatus(task, projectColumns);
          if (!status) continue;
          addHours(taskDetailsById, task, memberId, status, perTaskHours, hoursPerBusinessDay);
          dailyDetails.push({
            date: day,
            dateKey: dayKey,
            taskId: task.id,
            taskTitle: task.title || '(無題)',
            projectId: task.projectId,
            memberId,
            status,
            hours: perTaskHours,
          });
        }
      }

      const taskDetails = [...taskDetailsById.values()].sort((a, b) => {
        if (a.status !== b.status) return a.status === 'doing' ? -1 : 1;
        return a.taskTitle.localeCompare(b.taskTitle, 'ja');
      });
      if (taskDetails.length === 0) continue;
      const taskHours = taskDetails.reduce((sum, detail) => sum + detail.hours, 0);
      const memberSummary: EffortReportMemberSummary = {
        projectId: project.id,
        memberId,
        businessDays: activeDayKeys.size,
        totalHours: taskHours,
        taskHours,
        unallocatedHours: 0,
        taskDetails,
        dailyDetails: dailyDetails.sort((a, b) => {
          if (a.dateKey !== b.dateKey) return a.dateKey.localeCompare(b.dateKey);
          return a.taskTitle.localeCompare(b.taskTitle, 'ja');
        }),
      };

      const projectSummary = projectSummaries.get(project.id) ?? {
        projectId: project.id,
        projectName: projectName(projectById, project.id),
        totalHours: 0,
        memberSummaries: [],
      };
      projectSummary.totalHours += taskHours;
      projectSummary.memberSummaries.push(memberSummary);
      projectSummaries.set(project.id, projectSummary);
    }
  }

  const projects = [...projectSummaries.values()]
    .map((project) => ({
      ...project,
      memberSummaries: project.memberSummaries.sort((a, b) => memberName(memberById, a.memberId).localeCompare(memberName(memberById, b.memberId), 'ja')),
    }))
    .sort((a, b) => a.projectName.localeCompare(b.projectName, 'ja'));

  return {
    period,
    hoursPerBusinessDay,
    holidayDates: [...holidayKeys].sort(),
    totalHours: projects.reduce((sum, project) => sum + project.totalHours, 0),
    projects,
    issues: [...new Map(issues.map((issue) => [issue.id, issue])).values()],
  };
}

function compressedDetailGroupKey(detail: EffortReportDailyDetail): string {
  return [
    detail.projectId,
    detail.memberId,
    detail.taskId,
    detail.status,
    detail.hours.toFixed(6),
  ].join('__');
}

export function compressEffortDailyDetails(report: EffortReportResult): EffortReportCompressedDetail[] {
  const holidayKeys = new Set(report.holidayDates);
  const dailyDetails = report.projects
    .flatMap((project) => project.memberSummaries.flatMap((summary) => summary.dailyDetails))
    .sort((a, b) => {
      if (a.memberId !== b.memberId) return a.memberId.localeCompare(b.memberId);
      if (a.projectId !== b.projectId) return a.projectId.localeCompare(b.projectId);
      if (a.taskTitle !== b.taskTitle) return a.taskTitle.localeCompare(b.taskTitle, 'ja');
      if (a.status !== b.status) return a.status === 'doing' ? -1 : 1;
      return a.dateKey.localeCompare(b.dateKey);
    });

  const compressed: EffortReportCompressedDetail[] = [];
  let current: EffortReportCompressedDetail | null = null;
  let currentGroupKey = '';

  for (const detail of dailyDetails) {
    const groupKey = compressedDetailGroupKey(detail);
    const isConsecutive = current
      ? dateKey(nextBusinessDate(current.endDate, holidayKeys)) === detail.dateKey
      : false;

    if (current && currentGroupKey === groupKey && isConsecutive) {
      current.endDate = detail.date;
      current.endDateKey = detail.dateKey;
      current.days += 1;
      current.totalHours += detail.hours;
      continue;
    }

    current = {
      startDate: detail.date,
      endDate: detail.date,
      startDateKey: detail.dateKey,
      endDateKey: detail.dateKey,
      taskId: detail.taskId,
      taskTitle: detail.taskTitle,
      projectId: detail.projectId,
      memberId: detail.memberId,
      status: detail.status,
      days: 1,
      hoursPerDay: detail.hours,
      totalHours: detail.hours,
    };
    currentGroupKey = groupKey;
    compressed.push(current);
  }

  return compressed;
}

export function formatEffortHours(hours: number): string {
  return `${(Math.round(hours * 10) / 10).toFixed(1)}時間`;
}
