// 全プロジェクトのガントチャートを横断表示する一覧画面。

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useProjects } from '../../hooks/process/useProjects';
import { useAllProcessTasks } from '../../hooks/process/useAllProcessTasks';
import { useProcessMembers } from '../../hooks/process/useProcessMembers';
import {
  buildProjectOverviewTasks,
  buildTimelineWindow,
  normalizeTimelineStart,
  shiftTimelineStart,
  todayPositionPercent,
  type GanttGranularity,
  type UnplacedOverviewTask,
} from '../../lib/process/ganttOverview';
import { formatProcessDate } from '../../lib/process/gantt';
import { ChevronRightIcon, GanttIcon } from '../../components/process/icons';
import styles from './GanttOverview.module.css';

const GRANULARITY_STORAGE_KEY = 'artics.process.ganttOverview.granularity';
const COLLAPSED_STORAGE_KEY = 'artics.process.ganttOverview.collapsedProjects';
const GRANULARITY_LABELS: Record<GanttGranularity, string> = {
  week: '週',
  month: '月',
  quarter: '四半期',
};
const STATUS_LABELS = {
  todo: '未着手',
  doing: '進行中',
  done: '完了',
  hold: '保留',
} as const;
const TIMELINE_LEFT_COLUMN_WIDTH = 310;
const TIMELINE_TICK_WIDTH = 138;

function readStoredGranularity(): GanttGranularity {
  if (typeof window === 'undefined') return 'month';
  const value = window.localStorage.getItem(GRANULARITY_STORAGE_KEY);
  return value === 'week' || value === 'quarter' || value === 'month' ? value : 'month';
}

function readCollapsedProjectIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(COLLAPSED_STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function unplacedTaskDate(item: UnplacedOverviewTask): string {
  if (!item.start || !item.end) return '日付未設定';
  return `${formatProcessDate(item.start)} - ${formatProcessDate(item.end)}`;
}

function taskOpenPath(projectId: string, taskId: string): string {
  return `/process/projects/${projectId}/board?task=${taskId}`;
}

export default function GanttOverview() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const { projects, loading: projectsLoading } = useProjects(currentUser, 'active');
  const { tasks, loading: tasksLoading } = useAllProcessTasks(currentUser);
  const { members } = useProcessMembers(currentUser);
  const initialGranularity = useMemo(() => readStoredGranularity(), []);
  const [granularity, setGranularity] = useState<GanttGranularity>(initialGranularity);
  const [rangeStart, setRangeStart] = useState(() => normalizeTimelineStart(new Date(), initialGranularity));
  const [collapsedProjectIds, setCollapsedProjectIds] = useState<string[]>(() => readCollapsedProjectIds());

  useEffect(() => {
    window.localStorage.setItem(GRANULARITY_STORAGE_KEY, granularity);
  }, [granularity]);

  useEffect(() => {
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(collapsedProjectIds));
  }, [collapsedProjectIds]);

  const timelineWindow = useMemo(() => buildTimelineWindow(rangeStart, granularity), [granularity, rangeStart]);
  const todayLine = useMemo(() => todayPositionPercent(timelineWindow, new Date()), [timelineWindow]);
  const projectRows = useMemo(
    () => projects.map((project) => ({
      project,
      ...buildProjectOverviewTasks(project, tasks, members, timelineWindow),
    })),
    [members, projects, tasks, timelineWindow],
  );
  const totalVisibleTasks = projectRows.reduce((sum, row) => sum + row.visibleTasks.length, 0);
  const totalOutOfRangeTasks = projectRows.reduce((sum, row) => sum + row.outOfRangeTasks.length, 0);
  const totalUnscheduledTasks = projectRows.reduce((sum, row) => sum + row.unscheduledTasks.length, 0);

  const handleGranularityChange = (nextGranularity: GanttGranularity) => {
    setGranularity(nextGranularity);
    setRangeStart((current) => normalizeTimelineStart(current, nextGranularity));
  };

  const toggleProject = (projectId: string) => {
    setCollapsedProjectIds((current) => (
      current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId]
    ));
  };

  if (projectsLoading || tasksLoading) {
    return <p className={styles.loadingText}>読み込み中...</p>;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.pageTitle}>ガントチャート</h1>
          <p className={styles.subTitle}>
            {projects.length}プロジェクト / {totalVisibleTasks}件表示 / 期間外 {totalOutOfRangeTasks}件 / 日付未設定 {totalUnscheduledTasks}件
          </p>
        </div>
        <div className={styles.headerControls}>
          <div className={styles.segmentedControl} aria-label="日付粒度">
            {(['week', 'month', 'quarter'] as const).map((item) => (
              <button
                key={item}
                type="button"
                className={item === granularity ? styles.segmentButtonActive : styles.segmentButton}
                onClick={() => handleGranularityChange(item)}
                aria-pressed={item === granularity}
              >
                {GRANULARITY_LABELS[item]}
              </button>
            ))}
          </div>
          <div className={styles.headerActions}>
            <button type="button" className={styles.secondaryButton} onClick={() => setRangeStart((current) => shiftTimelineStart(current, granularity, -1))}>
              前の期間
            </button>
            <button type="button" className={styles.secondaryButton} onClick={() => setRangeStart(normalizeTimelineStart(new Date(), granularity))}>
              今月へ
            </button>
            <button type="button" className={styles.secondaryButton} onClick={() => setRangeStart((current) => shiftTimelineStart(current, granularity, 1))}>
              次の期間
            </button>
          </div>
        </div>
      </header>

      <div className={styles.legend} aria-label="状態の凡例">
        {Object.entries(STATUS_LABELS).map(([status, label]) => (
          <span key={status}>
            <i className={styles[`status_${status}`]} aria-hidden="true" />
            {label}
          </span>
        ))}
      </div>

      {projects.length === 0 ? (
        <section className={styles.empty}>
          <GanttIcon size={30} />
          <h2>表示できるプロジェクトがありません</h2>
          <p>プロジェクト一覧でプロジェクトを作成すると、ここにガントチャートが表示されます。</p>
          <button type="button" onClick={() => navigate('/process/projects')}>プロジェクト一覧へ</button>
        </section>
      ) : (
        <div className={styles.projectList}>
          {projectRows.map(({ project, visibleTasks, outOfRangeTasks, unscheduledTasks }) => {
            const isCollapsed = collapsedProjectIds.includes(project.id);
            const hasUnplacedTasks = outOfRangeTasks.length > 0 || unscheduledTasks.length > 0;
            return (
              <section key={project.id} className={styles.projectSection}>
                <div className={styles.projectHeader}>
                  <div className={styles.projectTitleGroup}>
                    <button
                      type="button"
                      className={styles.collapseButton}
                      onClick={() => toggleProject(project.id)}
                      aria-label={isCollapsed ? `${project.name}を展開` : `${project.name}を折りたたむ`}
                      aria-expanded={!isCollapsed}
                    >
                      <ChevronRightIcon className={isCollapsed ? styles.chevron : styles.chevronOpen} size={16} />
                    </button>
                    <button type="button" className={styles.projectTitle} onClick={() => navigate(`/process/projects/${project.id}/board`)}>
                      {project.name}
                    </button>
                  </div>
                  <div className={styles.projectStats} aria-label={`${project.name}のタスク件数`}>
                    <span>{visibleTasks.length}件表示</span>
                    <span>期間外 {outOfRangeTasks.length}件</span>
                    <span>日付未設定 {unscheduledTasks.length}件</span>
                  </div>
                </div>

                {!isCollapsed && (
                  <>
                    <div
                      className={styles.timeline}
                      style={{
                        '--tick-count': timelineWindow.ticks.length,
                        '--task-column-width': `${TIMELINE_LEFT_COLUMN_WIDTH}px`,
                        '--timeline-min-width': `${TIMELINE_LEFT_COLUMN_WIDTH + timelineWindow.ticks.length * TIMELINE_TICK_WIDTH}px`,
                      } as CSSProperties}
                    >
                      <div className={styles.timelineMonths}>
                        <div className={styles.taskMetaHeader}>タスク</div>
                        {timelineWindow.ticks.map((tick) => (
                          <div key={tick.key}>
                            <strong>{tick.label}</strong>
                            {granularity !== 'month' && <span>{tick.subLabel}</span>}
                          </div>
                        ))}
                      </div>
                      {visibleTasks.length === 0 ? (
                        <div className={styles.noTasks}>この期間に表示できる日付つきタスクはありません</div>
                      ) : visibleTasks.map((item) => {
                        const earlyPercent = item.earlyCompletionSolidPercent;
                        const hasEarlyCompletion =
                          typeof earlyPercent === 'number' && earlyPercent > 0 && earlyPercent < 100;
                        return (
                          <div key={item.task.id} className={styles.taskRow}>
                            <button type="button" className={styles.taskMeta} onClick={() => navigate(taskOpenPath(project.id, item.task.id))}>
                              <strong>{item.task.title}</strong>
                              <span>{item.columnName} / {item.assigneeText}</span>
                            </button>
                            <div className={styles.taskTrack}>
                              {todayLine !== null && (
                                <span className={styles.todayLine} style={{ left: `${todayLine}%` }} aria-label="今日" />
                              )}
                              <button
                                type="button"
                                className={`${styles.taskBar} ${styles[`status_${item.status}`]} ${hasEarlyCompletion ? styles.taskBarEarlyCompleted : ''}`}
                                style={{ left: `${item.left}%`, width: `${item.width}%` }}
                                onClick={() => navigate(taskOpenPath(project.id, item.task.id))}
                                title={`${item.task.title} / ${formatProcessDate(item.start)} - ${formatProcessDate(item.end)} / クリックでタスクを開く`}
                                aria-label={`タスクを開く: ${item.task.title}`}
                              >
                                {hasEarlyCompletion && (
                                  <>
                                    <span className={styles.taskBarActual} style={{ width: `${earlyPercent}%` }} aria-hidden="true" />
                                    <span className={styles.taskBarPlannedRemainder} style={{ left: `${earlyPercent}%` }} aria-hidden="true" />
                                  </>
                                )}
                                <span className={styles.taskBarText}>{item.task.title}</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {hasUnplacedTasks && (
                      <div className={styles.unplacedPanel}>
                        {outOfRangeTasks.length > 0 && (
                          <details>
                            <summary>期間外タスク {outOfRangeTasks.length}件</summary>
                            <div className={styles.unplacedList}>
                              {outOfRangeTasks.map((item) => (
                                <div key={item.task.id} className={styles.unplacedItem}>
                                  <button type="button" className={styles.unplacedTitle} onClick={() => navigate(taskOpenPath(project.id, item.task.id))}>
                                    {item.task.title}
                                  </button>
                                  <span>{unplacedTaskDate(item)} / {item.columnName} / {item.assigneeText}</span>
                                  {item.start && (
                                    <button
                                      type="button"
                                      className={styles.inlineButton}
                                      onClick={() => setRangeStart(normalizeTimelineStart(item.start as Date, granularity))}
                                    >
                                      この期間へ移動
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                        {unscheduledTasks.length > 0 && (
                          <details>
                            <summary>日付未設定タスク {unscheduledTasks.length}件</summary>
                            <div className={styles.unplacedList}>
                              {unscheduledTasks.map((item) => (
                                <div key={item.task.id} className={styles.unplacedItem}>
                                  <button type="button" className={styles.unplacedTitle} onClick={() => navigate(taskOpenPath(project.id, item.task.id))}>
                                    {item.task.title}
                                  </button>
                                  <span>{item.columnName} / {item.assigneeText}</span>
                                  <button type="button" className={styles.inlineButton} onClick={() => navigate(taskOpenPath(project.id, item.task.id))}>
                                    タスクを開く
                                  </button>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    )}
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
