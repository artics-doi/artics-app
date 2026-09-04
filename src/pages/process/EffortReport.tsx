import { useMemo, useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import { useAuth } from '../../contexts/AuthContext';
import { useProjects } from '../../hooks/process/useProjects';
import { useProcessMembers } from '../../hooks/process/useProcessMembers';
import { useAllProcessTasks } from '../../hooks/process/useAllProcessTasks';
import { useSchedules } from '../../hooks/useSchedules';
import EffortReportPdfDocument from '../../components/process/EffortReportPdfDocument';
import {
  buildEffortReport,
  buildFiscalYearPeriod,
  DEFAULT_HOURS_PER_BUSINESS_DAY,
  effortReportFileName,
  formatEffortDate,
  formatEffortHours,
  memberUniqueBusinessDays,
} from '../../lib/process/effortReport';
import type { ProcessMember } from '../../types/process';
import { ChevronLeftIcon, ChevronRightIcon } from '../../components/process/icons';
import styles from './EffortReport.module.css';

function defaultFiscalYear(today = new Date()): number {
  return today.getMonth() >= 7 ? today.getFullYear() : today.getFullYear() - 1;
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function memberName(memberById: Map<string, ProcessMember>, memberId: string): string {
  return memberById.get(memberId)?.name ?? '不明な担当者';
}

function normalizeDecimalInput(value: string): string {
  const normalized = value.replace(/[^\d.]/g, '');
  const [integerPart, ...decimalParts] = normalized.split('.');
  return decimalParts.length === 0 ? integerPart : `${integerPart}.${decimalParts.join('')}`;
}

type MemberTotal = {
  memberId: string;
  businessDays: number;
  totalHours: number;
};

export default function EffortReport() {
  const { currentUser } = useAuth();
  const [fiscalYear, setFiscalYear] = useState(defaultFiscalYear);
  const [hoursPerBusinessDay, setHoursPerBusinessDay] = useState(DEFAULT_HOURS_PER_BUSINESS_DAY);
  const [hoursPerDayInput, setHoursPerDayInput] = useState(String(DEFAULT_HOURS_PER_BUSINESS_DAY));
  const [generating, setGenerating] = useState(false);
  const period = useMemo(() => buildFiscalYearPeriod(fiscalYear), [fiscalYear]);
  const scheduleRangeEnd = useMemo(
    () => new Date(period.end.getFullYear(), period.end.getMonth(), period.end.getDate() + 1),
    [period],
  );

  const activeProjects = useProjects(currentUser, 'active');
  const archivedProjects = useProjects(currentUser, 'archived');
  const { members } = useProcessMembers(currentUser);
  const { tasks, loading: tasksLoading } = useAllProcessTasks(currentUser);
  const { schedules, loading: schedulesLoading } = useSchedules(currentUser, {
    startAt: period.start,
    endAt: scheduleRangeEnd,
  });

  const projects = useMemo(
    () => uniqueById([...activeProjects.projects, ...archivedProjects.projects]),
    [activeProjects.projects, archivedProjects.projects],
  );

  const report = useMemo(
    () => buildEffortReport({
      fiscalYear,
      projects,
      members,
      tasks,
      schedules,
      hoursPerBusinessDay,
    }),
    [fiscalYear, hoursPerBusinessDay, members, projects, schedules, tasks],
  );

  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const loading = activeProjects.loading || archivedProjects.loading || tasksLoading || schedulesLoading;
  const errors = report.issues.filter((issue) => issue.severity === 'error');
  const warnings = report.issues.filter((issue) => issue.severity === 'warning');
  const canExport = !loading && errors.length === 0 && report.projects.length > 0;
  const memberTotals = useMemo(() => {
    // 営業日はプロジェクト横断のユニーク日数。businessDays の単純加算だと
    // 同一日に複数プロジェクトを担当した日が二重に数えられ、暦日数を超え得る
    const uniqueDays = memberUniqueBusinessDays(report);
    const totals = new Map<string, MemberTotal>();
    report.projects.forEach((project) => {
      project.memberSummaries.forEach((summary) => {
        const current = totals.get(summary.memberId) ?? {
          memberId: summary.memberId,
          businessDays: uniqueDays.get(summary.memberId) ?? 0,
          totalHours: 0,
        };
        current.totalHours += summary.totalHours;
        totals.set(summary.memberId, current);
      });
    });
    return [...totals.values()].sort((a, b) =>
      memberName(memberById, a.memberId).localeCompare(memberName(memberById, b.memberId), 'ja'),
    );
  }, [memberById, report]);

  const downloadPdf = async () => {
    if (!currentUser || !canExport) return;
    setGenerating(true);
    try {
      const createdAt = new Date();
      const createdByName = currentUser.displayName || currentUser.email || 'Unknown';
      const blob = await pdf(
        <EffortReportPdfDocument
          report={report}
          members={members}
          createdAt={createdAt}
          createdByName={createdByName}
        />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = effortReportFileName(report.period);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } finally {
      setGenerating(false);
    }
  };

  const moveFiscalYear = (delta: number) => {
    setFiscalYear((year) => year + delta);
  };

  const handleHoursPerDayChange = (value: string) => {
    const normalized = normalizeDecimalInput(value);
    setHoursPerDayInput(normalized);
    const parsed = Number(normalized);
    if (Number.isFinite(parsed) && parsed > 0) {
      setHoursPerBusinessDay(parsed);
    }
  };

  const restoreHoursPerDayInput = () => {
    const parsed = Number(hoursPerDayInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setHoursPerDayInput(String(hoursPerBusinessDay));
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.pageTitle}>年度工数</h1>
          <p className={styles.subTitle}>
            年度内の進行中・完了タスクから、開発工数を自動集計します。
          </p>
        </div>
      </div>

      <section className={styles.fiscalToolbar} aria-label="年度切り替え">
        <button
          type="button"
          className={styles.yearNavButton}
          onClick={() => moveFiscalYear(-1)}
        >
          <ChevronLeftIcon size={16} />
          前年度
        </button>

        <label className={styles.yearCenter}>
          <span>集計年度</span>
          <div className={styles.yearInputWrap}>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={fiscalYear}
              onChange={(event) => {
                const normalized = event.target.value.replace(/\D/g, '').slice(0, 4);
                setFiscalYear(Number(normalized) || defaultFiscalYear());
              }}
              aria-label="集計年度"
            />
            <strong>年度</strong>
          </div>
          <small>{formatEffortDate(period.start)} - {formatEffortDate(period.end)}</small>
        </label>

        <button
          type="button"
          className={styles.yearNavButton}
          onClick={() => moveFiscalYear(1)}
        >
          次年度
          <ChevronRightIcon size={16} />
        </button>

        <label className={styles.hoursControl}>
          <span>1日あたり</span>
          <div className={styles.hoursInputWrap}>
            <input
              type="text"
              inputMode="decimal"
              value={hoursPerDayInput}
              onBlur={restoreHoursPerDayInput}
              onChange={(event) => handleHoursPerDayChange(event.target.value)}
              aria-label="1日あたりの工数"
            />
            <strong>時間</strong>
          </div>
        </label>

        <button
          type="button"
          className={styles.primaryButton}
          disabled={!canExport || generating}
          onClick={() => {
            void downloadPdf();
          }}
        >
          {generating ? 'PDF生成中...' : 'PDFをダウンロード'}
        </button>
      </section>

      <section className={styles.summaryBand}>
        <div className={styles.summaryCard}>
          <span>対象期間</span>
          <strong>{formatEffortDate(period.start)} - {formatEffortDate(period.end)}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span>年度合計</span>
          <strong>{formatEffortHours(report.totalHours)}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span>計算条件</span>
          <strong>1日 = {formatEffortHours(report.hoursPerBusinessDay)}</strong>
        </div>
      </section>

      <section className={styles.validationSection} aria-label="事前チェック">
        <div className={styles.sectionHeader}>
          <h2>事前チェック</h2>
        </div>
        {loading ? (
          <p className={styles.stateText}>読み込み中...</p>
        ) : (
          <div className={styles.issueGrid}>
            <div className={`${styles.issuePanel} ${errors.length > 0 ? styles.issuePanelError : ''}`}>
              <strong>エラー {errors.length}件</strong>
              {errors.length === 0 ? (
                <p>PDF出力を止めるエラーはありません。</p>
              ) : (
                errors.map((issue) => <p key={issue.id}>{issue.message}</p>)
              )}
            </div>
            <div className={`${styles.issuePanel} ${warnings.length > 0 ? styles.issuePanelWarning : ''}`}>
              <strong>警告 {warnings.length}件</strong>
              {warnings.length === 0 ? (
                <p>注意が必要な項目はありません。</p>
              ) : (
                warnings.map((issue) => <p key={issue.id}>{issue.message}</p>)
              )}
            </div>
          </div>
        )}
      </section>

      <section className={styles.reportSection}>
        <h2>プロジェクト別集計</h2>
        {report.projects.length === 0 ? (
          <p className={styles.stateText}>対象年度に日付つきの進行中・完了タスクはありません。</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>プロジェクト</th>
                  <th>総工数</th>
                </tr>
              </thead>
              <tbody>
                {report.projects.map((project) => (
                  <tr key={project.projectId}>
                    <td>{project.projectName}</td>
                    <td>{formatEffortHours(project.totalHours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.reportSection}>
        <h2>人別集計</h2>
        {memberTotals.length === 0 ? (
          <p className={styles.stateText}>対象年度に日付つきの進行中・完了タスクはありません。</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>担当者</th>
                  <th>営業日</th>
                  <th>総工数</th>
                </tr>
              </thead>
              <tbody>
                {memberTotals.map((summary) => (
                  <tr key={summary.memberId}>
                    <td>{memberName(memberById, summary.memberId)}</td>
                    <td>{summary.businessDays}日</td>
                    <td>{formatEffortHours(summary.totalHours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </div>
  );
}
