// 工程管理ダッシュボード（Phase 2）。
// 全プロジェクト横断のタスクを「担当者（行）× 期間（列）」のグリッドで俯瞰する。
// 開発課の開発スケジュール管理で「誰がいつ何を抱えているか」を一目で見るための画面。
//
// 設計:
//   - データは useDashboardTasks（archived=false のみ購読）+ クライアントフィルタ。
//   - 週/月/年の表示粒度を持ち、月は週単位、年は月単位の列で表示する。
//   - 各タスクは startDate〜endDate を表示期間内にクランプしてバー表示（dashboard.ts の純ロジック）。
//   - レーンごとに表示行数の上限を設け、超過分は「+N件」チップにまとめる。
//   - タスクバーをクリックすると、そのタスクが属するプロジェクト画面を開く。

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useDashboardTasks } from '../../hooks/process/useDashboardTasks';
import { useProcessMembers } from '../../hooks/process/useProcessMembers';
import { useProjects } from '../../hooks/process/useProjects';
import { accentOf } from '../../lib/process/colors';
import {
  bucketContainsDate,
  buildDashboardLanes,
  buildDashboardPeriodBuckets,
  dashboardPeriodLabel,
  filterTasksInBuckets,
  isWeekend,
  splitWithOverflow,
  taskBarBucketColumns,
} from '../../lib/process/dashboard';
import { dateToInputValue } from '../../lib/process/dateInput';
import type { DashboardDisplayMode, DashboardPeriodBucket } from '../../lib/process/dashboard';
import type { ProcessMember, Task } from '../../types/process';
import styles from './Dashboard.module.css';

// 1レーンに表示する最大タスク行数（超過は「+N件」に集約）。
const LANE_TASK_LIMIT = 6;
const DASHBOARD_DISPLAY_MODE_STORAGE_KEY = 'artics.process.dashboard.displayMode';

const PERIOD_NAV_COPY: Record<
  DashboardDisplayMode,
  {
    previous: string;
    current: string;
    next: string;
    previousAria: string;
    currentAria: string;
    nextAria: string;
  }
> = {
  week: {
    previous: '前週',
    current: '今週',
    next: '翌週',
    previousAria: '前の週',
    currentAria: '今週に戻る',
    nextAria: '次の週',
  },
  month: {
    previous: '前月',
    current: '今月',
    next: '翌月',
    previousAria: '前の月',
    currentAria: '今月に戻る',
    nextAria: '次の月',
  },
  year: {
    previous: '前年',
    current: '今年',
    next: '翌年',
    previousAria: '前の年',
    currentAria: '今年に戻る',
    nextAria: '次の年',
  },
};

const PERIOD_MODE_LABELS: Array<{ mode: DashboardDisplayMode; label: string }> = [
  { mode: 'week', label: '週' },
  { mode: 'month', label: '月' },
  { mode: 'year', label: '年' },
];

// 今日の0時（描画基準）。レンダリングごとに作るが、日付比較は startOfDay で吸収される。
function useToday(): Date {
  // useMemo で固定し、再レンダリングでの揺れを防ぐ。
  return useMemo(() => new Date(), []);
}

function readStoredDisplayMode(): DashboardDisplayMode {
  if (typeof window === 'undefined') return 'week';
  const stored = window.localStorage.getItem(DASHBOARD_DISPLAY_MODE_STORAGE_KEY);
  return stored === 'month' || stored === 'year' ? stored : 'week';
}

export default function Dashboard() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const today = useToday();

  const { tasks, loading } = useDashboardTasks(currentUser);
  const { members } = useProcessMembers(currentUser);
  // プロジェクト id → 名前/色 の早見表（バーの色付けと遷移先に使う）。
  const { projects } = useProjects(currentUser, 'active');

  // 表示粒度（週=日列 / 月=週列 / 年=月列）。
  const [displayMode, setDisplayMode] = useState<DashboardDisplayMode>(readStoredDisplayMode);
  // 期間オフセット（週/月/年それぞれで 0=今, -1=前, +1=次）。
  const [periodOffset, setPeriodOffset] = useState(0);
  // 担当者フィルタ（null=全員）。
  const [filterMemberId, setFilterMemberId] = useState<string | null>(null);
  // 「+N件」を展開したレーンの key 集合。
  const [expandedLanes, setExpandedLanes] = useState<Set<string>>(new Set());

  const buckets = useMemo(
    () => buildDashboardPeriodBuckets(today, displayMode, periodOffset),
    [today, displayMode, periodOffset],
  );

  const projectById = useMemo(() => {
    const map = new Map<string, { name: string; colorIndex: number }>();
    for (const p of projects) map.set(p.id, { name: p.name, colorIndex: p.colorIndex });
    return map;
  }, [projects]);

  // 担当者フィルタ適用後のメンバー一覧。
  const visibleMembers = useMemo(() => {
    if (!filterMemberId) return members;
    return members.filter((m) => m.id === filterMemberId);
  }, [members, filterMemberId]);

  // 表示期間に重なるタスク（クライアントフィルタ）。
  const tasksInWindow = useMemo(() => filterTasksInBuckets(tasks, buckets), [tasks, buckets]);

  // 担当者フィルタが「全員」のときだけ未設定レーンも出す。特定担当者選択時は本人のみ。
  const lanes = useMemo(() => {
    const built = buildDashboardLanes(tasksInWindow, visibleMembers);
    if (filterMemberId) {
      // 特定担当者選択時は未設定レーン（member=null）を隠す。
      return built.filter((l) => l.member !== null);
    }
    return built;
  }, [tasksInWindow, visibleMembers, filterMemberId]);

  useEffect(() => {
    window.localStorage.setItem(DASHBOARD_DISPLAY_MODE_STORAGE_KEY, displayMode);
  }, [displayMode]);

  const toggleExpand = (key: string) => {
    setExpandedLanes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const periodRangeLabel = dashboardPeriodLabel(today, displayMode, periodOffset);
  const navCopy = PERIOD_NAV_COPY[displayMode];

  const periodGridStyle = {
    ['--day-count' as string]: String(buckets.length),
    ['--bucket-min' as string]:
      displayMode === 'year' ? '92px' : displayMode === 'month' ? '132px' : '110px',
  };

  const handleModeChange = (mode: DashboardDisplayMode) => {
    setDisplayMode(mode);
    setPeriodOffset(0);
    setExpandedLanes(new Set());
  };

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <h1 className={styles.pageTitle}>ダッシュボード</h1>
        <div className={styles.headerActions}>
          <div className={styles.periodSwitch} role="group" aria-label="表示期間">
            {PERIOD_MODE_LABELS.map(({ mode, label }) => (
              <button
                key={mode}
                type="button"
                className={`${styles.periodModeButton} ${
                  displayMode === mode ? styles.periodModeButtonActive : ''
                }`}
                onClick={() => handleModeChange(mode)}
                aria-pressed={displayMode === mode}
              >
                {label}
              </button>
            ))}
          </div>
          <div className={styles.weekNav}>
            <button
              type="button"
              className={styles.weekNavButton}
              onClick={() => setPeriodOffset((w) => w - 1)}
              aria-label={navCopy.previousAria}
            >
              {navCopy.previous}
            </button>
            <button
              type="button"
              className={styles.weekNavButton}
              onClick={() => setPeriodOffset(0)}
              aria-label={navCopy.currentAria}
            >
              {navCopy.current}
            </button>
            <span className={styles.weekRangeLabel}>{periodRangeLabel}</span>
            <button
              type="button"
              className={styles.weekNavButton}
              onClick={() => setPeriodOffset((w) => w + 1)}
              aria-label={navCopy.nextAria}
            >
              {navCopy.next}
            </button>
          </div>
        </div>
      </div>
      <p className={styles.subTitle}>担当者ごとの予定です。バーをクリックするとプロジェクト画面を開けます。</p>

      <div className={styles.toolbar}>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>担当者</span>
          <button
            type="button"
            className={`${styles.filterChip} ${filterMemberId === null ? styles.filterChipActive : ''}`}
            onClick={() => setFilterMemberId(null)}
          >
            全員
          </button>
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`${styles.filterChip} ${filterMemberId === m.id ? styles.filterChipActive : ''}`}
              onClick={() => setFilterMemberId(m.id)}
            >
              <span className={styles.filterDot} style={{ background: accentOf(m.colorIndex) }} aria-hidden="true" />
              {m.name}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className={styles.stateBox}>
          <p className={styles.stateText}>読み込み中...</p>
        </div>
      ) : members.length === 0 ? (
        <div className={styles.stateBox}>
          <p className={styles.stateTitle}>担当者が登録されていません</p>
          <p className={styles.stateText}>
            担当者を登録すると、担当者ごとの予定がここに表示されます。
          </p>
        </div>
      ) : lanes.length === 0 ? (
        <div className={styles.stateBox}>
          <p className={styles.stateTitle}>この期間に予定はありません</p>
          <p className={styles.stateText}>
            {displayMode === 'week'
              ? 'タスクに開始日・終了日を設定すると、この週のレーンに表示されます。'
              : displayMode === 'month'
                ? 'タスクに開始日・終了日を設定すると、この月の週レーンに表示されます。'
                : 'タスクに開始日・終了日を設定すると、この年の月レーンに表示されます。'}
          </p>
        </div>
      ) : (
        <div className={styles.gridScroll}>
          <div className={styles.grid} style={periodGridStyle}>
            {/* ヘッダー行 */}
            <div className={styles.headerCellLane}>担当者</div>
            {buckets.map((bucket) => {
              const todayCol = bucketContainsDate(bucket, today);
              const weekend = displayMode === 'week' && isWeekend(bucket.start);
              return (
                <div
                  key={bucket.key}
                  className={`${styles.headerCellDay} ${
                    todayCol ? styles.headerCellToday : weekend ? styles.headerCellWeekend : ''
                  }`}
                >
                  <div
                    className={`${styles.dayWeekday} ${
                      displayMode === 'week' && bucket.start.getDay() === 0
                        ? styles.dayWeekdaySun
                        : displayMode === 'week' && bucket.start.getDay() === 6
                          ? styles.dayWeekdaySat
                          : ''
                    }`}
                  >
                    {bucket.label}
                  </div>
                  <div className={styles.dayDate}>
                    {bucket.subLabel}
                  </div>
                  {todayCol && <span className={styles.dayTodayMark}>今日</span>}
                </div>
              );
            })}

            {/* レーン（担当者）行 */}
            {lanes.map((lane) => {
              const laneKey = lane.member ? lane.member.id : '__unassigned__';
              const expanded = expandedLanes.has(laneKey);
              const limit = expanded ? lane.tasks.length : LANE_TASK_LIMIT;
              const { visible, overflow } = splitWithOverflow(lane.tasks, limit);
              return (
                <LaneRow
                  key={laneKey}
                  member={lane.member}
                  totalCount={lane.tasks.length}
                  visibleTasks={visible}
                  overflow={overflow}
                  buckets={buckets}
                  today={today}
                  projectById={projectById}
                  periodGridStyle={periodGridStyle}
                  displayMode={displayMode}
                  onBarClick={(task) => navigate(`/process/projects/${task.projectId}/board`)}
                  onOverflowClick={() => toggleExpand(laneKey)}
                  expanded={expanded}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ===== レーン1行（担当者ラベル + タスクバー領域） =====

interface LaneRowProps {
  member: ProcessMember | null;
  totalCount: number;
  visibleTasks: Task[];
  overflow: number;
  buckets: DashboardPeriodBucket[];
  today: Date;
  projectById: Map<string, { name: string; colorIndex: number }>;
  periodGridStyle: React.CSSProperties;
  displayMode: DashboardDisplayMode;
  onBarClick: (task: Task) => void;
  onOverflowClick: () => void;
  expanded: boolean;
}

function LaneRow({
  member,
  totalCount,
  visibleTasks,
  overflow,
  buckets,
  today,
  projectById,
  periodGridStyle,
  displayMode,
  onBarClick,
  onOverflowClick,
  expanded,
}: LaneRowProps) {
  return (
    <>
      <div className={styles.laneLabel}>
        {member ? (
          <>
            <span
              className={styles.laneDot}
              style={{ background: accentOf(member.colorIndex) }}
              aria-hidden="true"
            />
            <span className={styles.laneName}>{member.name}</span>
          </>
        ) : (
          <span className={`${styles.laneName} ${styles.laneNameUnassigned}`}>担当者未設定</span>
        )}
        <span className={styles.laneCount}>{totalCount}</span>
      </div>
      <div className={styles.laneTrack} style={periodGridStyle}>
        {/* 背景帯（週末・今日列） */}
        <div className={styles.laneTrackBg} style={periodGridStyle} aria-hidden="true">
          {buckets.map((bucket) => (
            <div
              key={bucket.key}
              className={`${styles.laneTrackBgCell} ${
                bucketContainsDate(bucket, today)
                  ? styles.laneTrackBgToday
                  : displayMode === 'week' && isWeekend(bucket.start)
                    ? styles.laneTrackBgWeekend
                    : ''
              }`}
            />
          ))}
        </div>

        {/* タスクバー（各タスク1行） */}
        {visibleTasks.map((task) => {
          const cols = taskBarBucketColumns(task, buckets);
          if (!cols) return null;
          const project = projectById.get(task.projectId);
          const barColor = project ? accentOf(project.colorIndex) : undefined;
          const taskTitle = task.title || '(無題)';
          const barLabel = project ? `${project.name} / ${taskTitle}` : taskTitle;
          // CSS Grid は 1始まり。startCol(0始まり)+1 〜 endCol+2。
          const gridColumn = `${cols.startCol + 1} / ${cols.endCol + 2}`;
          return (
            <button
              key={task.id}
              type="button"
              className={styles.bar}
              style={{
                gridColumn,
                ...(barColor ? { ['--bar-color' as string]: barColor } : {}),
              }}
              onClick={() => onBarClick(task)}
              title={`${barLabel}${
                task.endDate ? ` 〜${dateToInputValue(task.endDate)}` : ''
              }`}
            >
              <span className={styles.barTitle}>{barLabel}</span>
            </button>
          );
        })}

        {/* 「+N件」オーバーフロー（展開トグル） */}
        {(overflow > 0 || expanded) && (totalCount > LANE_TASK_LIMIT) && (
          <button type="button" className={styles.overflowChip} onClick={onOverflowClick}>
            {expanded ? '折りたたむ' : `+${overflow} 件`}
          </button>
        )}
      </div>
    </>
  );
}
