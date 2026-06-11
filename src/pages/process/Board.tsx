// カンバンボード。@dnd-kit で列をまたぐドラッグ&ドロップ、列CRUD、インラインカード追加を行う。
//
// 並び順は order(fractional index) で管理し、ドラッグ確定時のみ Firestore に書き込む。
// 楽観更新: onSnapshot の反映を待たず、@dnd-kit の表示が即座に動く。確定後に購読が追いつく。

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Gantt as SvarGantt,
  Willow,
  WillowDark,
  type IApi,
  type ITask,
} from '@svar-ui/react-gantt';
import '@svar-ui/react-gantt/all.css';
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAuth } from '../../contexts/AuthContext';
import { useProject } from '../../hooks/process/useProject';
import { useProjectTasks } from '../../hooks/process/useProjectTasks';
import { useProcessMembers } from '../../hooks/process/useProcessMembers';
import { useIsDarkTheme } from '../../hooks/process/useIsDarkTheme';
import { toTaskInput } from '../../lib/process/converters';
import {
  buildGanttTimelineBounds,
  buildReorderedGanttTaskIds,
  ganttScalesForMode,
  resolveGanttUpdateTaskDates,
  sortProcessGanttTasks,
  toProcessGanttData,
  type ProcessGanttTask,
  type GanttSortMode,
  type GanttViewMode,
} from '../../lib/process/gantt';
import { buildGanttInstanceKey, ganttStatusColorVariables } from '../../lib/process/ganttBarColors';
import { startOfDay } from '../../lib/process/dashboard';
import { dateToInputValue } from '../../lib/process/dateInput';
import {
  EMPTY_TASK_FILTERS,
  filterTasks,
  hasTaskMissingFields,
  type TaskFilterState,
} from '../../lib/process/taskFilters';
import type { ProjectColumn, Task, TaskInput } from '../../types/process';
import TaskPanel from '../../components/process/TaskPanel';
import BoardColumn from '../../components/process/BoardColumn';
import ConfirmModal from '../../components/modals/ConfirmModal';
import { ChevronLeftIcon, PlusIcon } from '../../components/process/icons';
import styles from './Board.module.css';

const HOLD_COLUMN: ProjectColumn = { id: 'hold', name: '保留', order: 3 };
const GANTT_ROW_HEIGHT = 38;
const GANTT_SCALE_HEIGHT = 50;
const DEFAULT_GANTT_HEIGHT = 360;
const MIN_GANTT_HEIGHT = 220;
const MIN_BOARD_HEIGHT = 260;
const RESIZER_HEIGHT = 18;
const GANTT_GRID_WIDTH = 390;
const LOCKED_COLUMN_IDS = new Set(['todo', 'doing', 'done', 'hold']);
const GANTT_CELL_WIDTH: Record<GanttViewMode, number> = {
  day: 44,
  week: 72,
  month: 88,
};
const GANTT_CONFIRM_EVENT_TAG = Symbol('artics-gantt-confirm-date-change');
const GANTT_EDIT_EVENT_TAG = Symbol('artics-gantt-edit-panel');
const GANTT_SELECT_EVENT_TAG = Symbol('artics-gantt-disable-single-select');
const GANTT_STATUS_OPTIONS: Array<{
  id: ProcessGanttTask['processStatus'];
  label: string;
}> = [
  { id: 'todo', label: '未着手' },
  { id: 'doing', label: '進行中' },
  { id: 'done', label: '完了' },
  { id: 'hold', label: '保留' },
];
const GANTT_SORT_OPTIONS: Array<{ id: GanttSortMode; label: string }> = [
  { id: 'todo-first', label: '未着手順' },
  { id: 'start-asc', label: '開始日が近い順' },
  { id: 'end-asc', label: '終了日が近い順' },
  { id: 'assignee', label: '担当者順' },
  { id: 'status', label: 'ステータス順' },
];

type UpdateTaskEvent = {
  id?: string | number;
  task?: Partial<ITask>;
  diff?: number;
  inProgress?: boolean;
};

type DragTaskEvent = {
  id?: string | number;
  width?: number;
  left?: number;
  inProgress?: boolean;
};

type OpenGanttTaskEvent = {
  id?: string | number;
  task?: {
    id?: string | number;
  };
};

type PendingGanttDateChange = {
  taskId: string;
  taskTitle: string;
  nextDates: Pick<TaskInput, 'startDate' | 'endDate'>;
};

function formatTaskDateChange(dates: Pick<TaskInput, 'startDate' | 'endDate'>): string {
  const start = dates.startDate ? dateToInputValue(dates.startDate) : '未設定';
  const end = dates.endDate ? dateToInputValue(dates.endDate) : '未設定';
  return `${start} - ${end}`;
}

function withRequiredColumns(columns: readonly ProjectColumn[]): ProjectColumn[] {
  const sorted = [...columns].sort((a, b) => a.order - b.order);
  if (sorted.some((column) => column.name === HOLD_COLUMN.name || column.id === HOLD_COLUMN.id)) {
    return sorted;
  }
  const maxOrder = sorted.reduce((max, column) => Math.max(max, column.order), -1);
  return [...sorted, { ...HOLD_COLUMN, order: maxOrder + 1 }];
}

function statusSetFromAll() {
  return new Set<ProcessGanttTask['processStatus']>(GANTT_STATUS_OPTIONS.map((option) => option.id));
}

function GanttInlineReorderHandle({
  task,
}: {
  task: ProcessGanttTask;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`${styles.ganttInlineReorderRow} ${isDragging ? styles.ganttInlineReorderRowDragging : ''}`}
    >
      <button
        type="button"
        className={styles.ganttInlineReorderHandle}
        aria-label={`${task.text} を並び替え`}
        {...attributes}
        {...listeners}
      >
        <span aria-hidden="true">::</span>
      </button>
    </li>
  );
}

function GanttTaskBarTemplate({ data }: { data: ITask }) {
  const task = data as ProcessGanttTask;
  return (
    <div
      className={styles.ganttTaskBarTemplate}
      style={ganttStatusColorVariables(task.processStatus) as CSSProperties}
      data-task-id={task.id}
      data-task-status={task.processStatus}
    >
      <span className={styles.ganttTaskBarText}>{task.text}</span>
    </div>
  );
}

export default function Board() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentUser } = useAuth();
  const workspaceRef = useRef<HTMLElement | null>(null);
  const ganttApiRef = useRef<IApi | null>(null);
  const ganttRootRef = useRef<HTMLDivElement | null>(null);
  const ganttScrollProxyRef = useRef<HTMLDivElement | null>(null);
  const ganttScrollInnerRef = useRef<HTMLDivElement | null>(null);
  const ganttInlineReorderListRef = useRef<HTMLUListElement | null>(null);

  const { project, loading: projectLoading, notFound, updateColumns } = useProject(
    currentUser,
    projectId ?? null,
  );
  const {
    tasks,
    loading: tasksLoading,
    createTask,
    duplicateTask,
    updateTask,
    moveTask,
    reorderTask,
    setGanttOrderForTasks,
    deleteTask,
  } = useProjectTasks(currentUser, projectId ?? null);
  const { members, memberById } = useProcessMembers(currentUser);

  // タスク編集パネル
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [createInColumn, setCreateInColumn] = useState<string | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [viewMode, setViewMode] = useState<GanttViewMode>('day');
  const [ganttHeight, setGanttHeight] = useState(DEFAULT_GANTT_HEIGHT);
  const [ganttLayoutVersion, setGanttLayoutVersion] = useState(0);
  const [ganttManualReorderEnabled, setGanttManualReorderEnabled] = useState(false);
  const [ganttViewMenuOpen, setGanttViewMenuOpen] = useState(false);
  const [visibleGanttStatuses, setVisibleGanttStatuses] = useState(statusSetFromAll);
  const [draftVisibleGanttStatuses, setDraftVisibleGanttStatuses] = useState(statusSetFromAll);
  const [ganttSortMode, setGanttSortMode] = useState<GanttSortMode | null>(null);
  const [draftGanttSortMode, setDraftGanttSortMode] = useState<GanttSortMode | null>(null);
  const [pendingGanttDateChange, setPendingGanttDateChange] =
    useState<PendingGanttDateChange | null>(null);
  const [taskFilters, setTaskFilters] = useState<TaskFilterState>(EMPTY_TASK_FILTERS);
  const isDark = useIsDarkTheme();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // 列ごとにタスクをグルーピング（各列内は order 昇順。tasks は購読時点で order 昇順）。
  const columns = useMemo(
    () => withRequiredColumns(project?.columns ?? []),
    [project?.columns],
  );

  const filteredTasks = useMemo(() => filterTasks(tasks, taskFilters), [taskFilters, tasks]);
  const hasActiveFilters = useMemo(
    () => taskFilters.query.trim() !== '' ||
      taskFilters.assigneeId !== 'all' ||
      taskFilters.columnId !== 'all' ||
      taskFilters.dateFilter !== 'all' ||
      taskFilters.missingOnly,
    [taskFilters],
  );
  const missingTaskCount = useMemo(
    () => tasks.filter((task) => hasTaskMissingFields(task)).length,
    [tasks],
  );

  const tasksByColumn = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const col of columns) map.set(col.id, []);
    for (const task of filteredTasks) {
      const list = map.get(task.columnId);
      if (list) list.push(task);
      // 所属列が存在しない（列削除後の孤児）タスクは表示しない（列削除時に移動済みのはず）
    }
    return map;
  }, [columns, filteredTasks]);

  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const taskByIdRef = useRef(taskById);
  useEffect(() => {
    taskByIdRef.current = taskById;
  }, [taskById]);
  const ganttData = useMemo(
    () => toProcessGanttData(filteredTasks, columns, members),
    [columns, filteredTasks, members],
  );
  const visibleGanttTasks = useMemo(
    () => ganttData.tasks.filter((task) => visibleGanttStatuses.has(task.processStatus)),
    [ganttData.tasks, visibleGanttStatuses],
  );
  const timelineBounds = useMemo(
    () => buildGanttTimelineBounds(visibleGanttTasks, new Date()),
    [visibleGanttTasks],
  );
  const ganttScales = useMemo(() => ganttScalesForMode(viewMode), [viewMode]);
  const ganttCellWidth = GANTT_CELL_WIDTH[viewMode];
  const ganttGridColumns = useMemo(() => [
    ...(ganttManualReorderEnabled ? [{ id: 'sortHandle', header: '', width: 36 }] : []),
    { id: 'text', header: 'タスク', width: ganttManualReorderEnabled ? 174 : 210 },
    { id: 'columnName', header: '状態', width: 86 },
    { id: 'assigneeText', header: '担当', width: 110 },
  ], [ganttManualReorderEnabled]);
  const ganttInstanceKey = useMemo(
    () => buildGanttInstanceKey(viewMode, ganttLayoutVersion, visibleGanttTasks),
    [ganttLayoutVersion, viewMode, visibleGanttTasks],
  );

  useEffect(() => {
    const root = ganttRootRef.current;
    const proxy = ganttScrollProxyRef.current;
    const inner = ganttScrollInnerRef.current;
    if (!root || !proxy || !inner) return undefined;

    let chart: HTMLElement | null = null;
    let frame = 0;

    const syncSize = () => {
      chart = root.querySelector<HTMLElement>('.wx-chart');
      if (!chart) {
        frame = requestAnimationFrame(syncSize);
        return;
      }

      const hasHorizontalOverflow = chart.scrollWidth > chart.clientWidth + 1;
      const rootRect = root.getBoundingClientRect();
      const chartRect = chart.getBoundingClientRect();
      inner.style.width = `${chart.scrollWidth}px`;
      proxy.style.left = `${Math.max(0, chartRect.left - rootRect.left)}px`;
      proxy.style.right = `${Math.max(0, rootRect.right - chartRect.right)}px`;
      proxy.style.display = hasHorizontalOverflow ? 'block' : 'none';
      proxy.scrollLeft = chart.scrollLeft;
    };

    const syncChartScroll = () => {
      if (chart) chart.scrollLeft = proxy.scrollLeft;
    };

    const syncProxyScroll = () => {
      if (chart) proxy.scrollLeft = chart.scrollLeft;
    };

    const attachChartListener = () => {
      chart = root.querySelector<HTMLElement>('.wx-chart');
      if (!chart) {
        frame = requestAnimationFrame(attachChartListener);
        return;
      }
      chart.addEventListener('scroll', syncProxyScroll);
      resizeObserver.observe(chart);
      syncSize();
    };

    const observer = new MutationObserver(syncSize);
    const resizeObserver = new ResizeObserver(syncSize);

    proxy.addEventListener('scroll', syncChartScroll);
    observer.observe(root, { childList: true, subtree: true });
    resizeObserver.observe(root);
    frame = requestAnimationFrame(attachChartListener);

    return () => {
      cancelAnimationFrame(frame);
      proxy.removeEventListener('scroll', syncChartScroll);
      if (chart) chart.removeEventListener('scroll', syncProxyScroll);
      observer.disconnect();
      resizeObserver.disconnect();
    };
  }, [
    ganttCellWidth,
    visibleGanttTasks.length,
    ganttHeight,
    ganttLayoutVersion,
    timelineBounds.end,
    timelineBounds.start,
    viewMode,
  ]);

  useEffect(() => {
    if (ganttViewMenuOpen) {
      setDraftVisibleGanttStatuses(new Set(visibleGanttStatuses));
      setDraftGanttSortMode(ganttSortMode);
    }
  }, [ganttSortMode, ganttViewMenuOpen, visibleGanttStatuses]);

  useEffect(() => {
    const taskId = searchParams.get('task');
    if (!taskId || tasksLoading) return;
    const target = taskById.get(taskId);
    if (target && editingTask?.id !== target.id) {
      setEditingTask(target);
    }
  }, [editingTask?.id, searchParams, taskById, tasksLoading]);

  useEffect(() => {
    const root = ganttRootRef.current;
    const list = ganttInlineReorderListRef.current;
    if (!root || !list || !ganttManualReorderEnabled) return undefined;

    let ganttScroller: HTMLElement | null = null;
    let frame = 0;

    const sync = () => {
      ganttScroller = root.querySelector<HTMLElement>('.wx-gantt');
      if (!ganttScroller) {
        frame = requestAnimationFrame(sync);
        return;
      }
      list.style.transform = `translateY(-${ganttScroller.scrollTop}px)`;
    };

    const attach = () => {
      ganttScroller = root.querySelector<HTMLElement>('.wx-gantt');
      if (!ganttScroller) {
        frame = requestAnimationFrame(attach);
        return;
      }
      ganttScroller.addEventListener('scroll', sync);
      sync();
    };

    frame = requestAnimationFrame(attach);
    return () => {
      cancelAnimationFrame(frame);
      if (ganttScroller) ganttScroller.removeEventListener('scroll', sync);
    };
  }, [ganttLayoutVersion, ganttManualReorderEnabled, visibleGanttTasks.length, viewMode]);

  // 不正/削除済みプロジェクトは一覧へ戻す。
  if (notFound) {
    navigate('/process/projects', { replace: true });
    return null;
  }

  if (projectLoading || tasksLoading || !project) {
    return <p className={styles.loadingText}>読み込み中...</p>;
  }

  const defaultColumnId = columns[0]?.id ?? 'todo';
  const Theme = isDark ? WillowDark : Willow;
  const openedFromDashboard = searchParams.get('from') === 'dashboard';

  const resizeGantt = (clientY: number) => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const rect = workspace.getBoundingClientRect();
    const maxHeight = Math.max(MIN_GANTT_HEIGHT, rect.height - MIN_BOARD_HEIGHT - RESIZER_HEIGHT);
    const nextHeight = Math.min(Math.max(clientY - rect.top, MIN_GANTT_HEIGHT), maxHeight);
    setGanttHeight(nextHeight);
  };

  const refreshGanttLayout = () => {
    setGanttLayoutVersion((version) => version + 1);
    window.dispatchEvent(new Event('resize'));
  };

  const handleResizePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    resizeGantt(event.clientY);
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const handleMove = (moveEvent: PointerEvent) => resizeGantt(moveEvent.clientY);
    const handleUp = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      refreshGanttLayout();
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
  };

  // ドラッグ確定。over がカードか列かで前後を判定して order を採番する。
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const activeTask = tasks.find((t) => t.id === activeId);
    if (!activeTask) return;

    // over が列ID（空の列など）か、カードIDかを判定。
    const overColumn = columns.find((c) => c.id === overId);
    const overTask = tasks.find((t) => t.id === overId);
    const targetColumnId = overColumn ? overColumn.id : overTask?.columnId;
    if (!targetColumnId) return;

    // ターゲット列のタスク（active を除く）を order 昇順で。
    const targetTasks = tasks
      .filter((t) => t.columnId === targetColumnId && t.id !== activeId)
      .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));

    // 挿入位置を決める: 列にドロップ＝末尾、カードにドロップ＝そのカードの直前。
    let prevOrder: string | null = null;
    let nextOrder: string | null = null;
    if (overColumn) {
      // 列の空き領域 → 末尾
      prevOrder = targetTasks.length ? targetTasks[targetTasks.length - 1].order : null;
      nextOrder = null;
    } else if (overTask) {
      const idx = targetTasks.findIndex((t) => t.id === overTask.id);
      if (idx >= 0) {
        prevOrder = idx > 0 ? targetTasks[idx - 1].order : null;
        nextOrder = targetTasks[idx].order;
      }
    }

    if (targetColumnId !== activeTask.columnId) {
      moveTask(activeId, targetColumnId, prevOrder, nextOrder);
    } else {
      reorderTask(activeId, prevOrder, nextOrder);
    }
  };

  const handleGanttReorderEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const reorderedIds = buildReorderedGanttTaskIds(ganttData.tasks, activeId, overId);
    void setGanttOrderForTasks(reorderedIds);
  };

  const handleApplyGanttViewSettings = () => {
    const nextStatuses = new Set(draftVisibleGanttStatuses);
    setVisibleGanttStatuses(nextStatuses);
    setGanttSortMode(draftGanttSortMode);
    setGanttViewMenuOpen(false);
    if (draftGanttSortMode) {
      const sortedIds = sortProcessGanttTasks(ganttData.tasks, draftGanttSortMode).map((task) => task.id);
      void setGanttOrderForTasks(sortedIds);
    }
  };

  const closeTaskPanel = () => {
    setEditingTask(null);
    window.setTimeout(refreshGanttLayout, 0);
    const openedTaskId = searchParams.get('task');
    if (!openedTaskId) return;
    if (openedFromDashboard) {
      navigate('/process');
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.delete('task');
    next.delete('from');
    setSearchParams(next, { replace: true });
  };

  const updateTaskFilter = <K extends keyof TaskFilterState>(key: K, value: TaskFilterState[K]) => {
    setTaskFilters((current) => ({ ...current, [key]: value }));
  };

  const toggleDraftStatus = (status: ProcessGanttTask['processStatus']) => {
    setDraftVisibleGanttStatuses((current) => {
      const next = new Set(current);
      if (next.has(status)) {
        if (next.size === 1) return next;
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  const resolveGanttTaskDateChange = (
    taskId: string,
    taskPatch: (Partial<ITask> & { diff?: number }) | null = null,
    liveTask: ITask | undefined = ganttApiRef.current?.getTask(taskId),
  ) => {
    const sourceTask = taskByIdRef.current.get(taskId);
    if (!sourceTask) return null;
    const nextDates = resolveGanttUpdateTaskDates(sourceTask, taskPatch ?? {}, liveTask);
    if (!nextDates) return null;
    if (
      sourceTask.startDate?.getTime() === nextDates.startDate?.getTime() &&
      sourceTask.endDate?.getTime() === nextDates.endDate?.getTime()
    ) {
      return null;
    }
    return {
      taskId,
      taskTitle: sourceTask.title,
      nextDates,
    };
  };

  const handleUpdateTaskDates = async (event: UpdateTaskEvent) => {
    const eventId = event.id ?? event.task?.id;
    if (event.inProgress || !eventId) return;
    const change = resolveGanttTaskDateChange(String(eventId), {
      ...(event.task ?? {}),
      diff: event.diff,
    });
    if (change) setPendingGanttDateChange(change);
  };

  const openTaskPanelById = (taskId: string | number | null | undefined) => {
    if (taskId == null) return false;
    const rawTaskId = String(taskId);
    const task = taskByIdRef.current.get(rawTaskId) ?? taskByIdRef.current.get(rawTaskId.replace(/^:/, ''));
    if (!task) return false;
    setEditingTask(task);
    return true;
  };

  const handleOpenGanttTask = (event: OpenGanttTaskEvent) => {
    openTaskPanelById(event.id ?? event.task?.id);
    return false;
  };

  const handleGanttDomDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element)) return;
    const taskElement = event.target.closest('[data-task-id]');
    const taskId = taskElement?.getAttribute('data-task-id');
    if (taskId) openTaskPanelById(taskId);
  };

  const initGanttApi = (api: IApi) => {
    ganttApiRef.current = api;
    api.detach(GANTT_CONFIRM_EVENT_TAG);
    api.detach(GANTT_EDIT_EVENT_TAG);
    api.detach(GANTT_SELECT_EVENT_TAG);
    api.intercept('select-task', () => false, { tag: GANTT_SELECT_EVENT_TAG });
    api.intercept(
      'show-editor',
      (event: OpenGanttTaskEvent) => {
        if (!openTaskPanelById(event.id ?? event.task?.id)) return true;
        return false;
      },
      { tag: GANTT_EDIT_EVENT_TAG },
    );
    api.intercept(
      'update-task',
      (event: UpdateTaskEvent) => {
        const eventId = event.id ?? event.task?.id;
        if (event.inProgress || !eventId) return true;
        const taskId = String(eventId);
        const liveTaskBeforeUpdate = api.getTask(taskId);
        const change = resolveGanttTaskDateChange(
          taskId,
          { ...(event.task ?? {}), diff: event.diff },
          liveTaskBeforeUpdate,
        );
        if (!change) return true;
        setPendingGanttDateChange(change);
        return false;
      },
      { tag: GANTT_CONFIRM_EVENT_TAG },
    );
  };

  const handleDragTaskDates = (event: DragTaskEvent) => {
    if (!event.id) return;
    const taskId = String(event.id);
    if (event.inProgress) return;
    window.setTimeout(() => {
      const change = resolveGanttTaskDateChange(taskId);
      if (change) setPendingGanttDateChange(change);
    }, 0);
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <button
            type="button"
            className={styles.backButton}
            aria-label="一覧に戻る"
            onClick={() => navigate('/process/projects')}
          >
            <ChevronLeftIcon size={18} />
          </button>
          <div className={styles.titleText}>
            <h1 className={styles.projectName}>{project.name}</h1>
            <p className={styles.subtitle}>
              ガント {visibleGanttTasks.length}件 / 表示{filteredTasks.length}件 / 日付未設定 {ganttData.unscheduledTasks.length}件
            </p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.segmented} aria-label="ガント表示単位">
            {(['day', 'week', 'month'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={viewMode === mode ? styles.segmentActive : ''}
                onClick={() => setViewMode(mode)}
              >
                {mode === 'day' ? '日' : mode === 'week' ? '週' : '月'}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => ganttApiRef.current?.exec('scroll-chart', { date: startOfDay(new Date()) })}
          >
            今日
          </button>
          <button
            type="button"
            className={`${styles.secondaryButton} ${ganttManualReorderEnabled ? styles.secondaryButtonActive : ''}`}
            onClick={() => setGanttManualReorderEnabled((enabled) => !enabled)}
          >
            並び替え
          </button>
          <div className={styles.ganttViewMenuWrap}>
            <button
              type="button"
              className={`${styles.secondaryButton} ${ganttViewMenuOpen ? styles.secondaryButtonActive : ''}`}
              onClick={() => setGanttViewMenuOpen((open) => !open)}
            >
              表示・並び順
            </button>
            {ganttViewMenuOpen && (
              <div className={styles.ganttViewMenu} role="dialog" aria-label="表示・並び順">
                <div className={styles.ganttViewMenuHeader}>
                  <h2>表示・並び順</h2>
                  <span className={styles.visibilityChip}>
                    表示中 {visibleGanttTasks.length}件 / 全{ganttData.tasks.length}件
                  </span>
                </div>
                <section className={styles.ganttViewMenuSection}>
                  <h3>表示するステータス</h3>
                  <div className={styles.statusFilterList}>
                    {GANTT_STATUS_OPTIONS.map((status) => (
                      <label key={status.id} className={styles.statusFilterItem}>
                        <input
                          type="checkbox"
                          checked={draftVisibleGanttStatuses.has(status.id)}
                          onChange={() => toggleDraftStatus(status.id)}
                        />
                        <span
                          className={`${styles.statusDot} ${styles[`statusDot_${status.id}`]}`}
                          aria-hidden="true"
                        />
                        {status.label}
                      </label>
                    ))}
                  </div>
                </section>
                <section className={styles.ganttViewMenuSection}>
                  <h3>一括並び替え</h3>
                  <div className={styles.sortOptionList}>
                    {GANTT_SORT_OPTIONS.map((option) => (
                      <label key={option.id} className={styles.sortOptionItem}>
                        <input
                          type="radio"
                          name="ganttSortMode"
                          checked={draftGanttSortMode === option.id}
                          onChange={() => setDraftGanttSortMode(option.id)}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </section>
                <p className={styles.ganttViewHint}>
                  ドラッグ操作も一括並び替えもガント順だけ変更します。
                </p>
                <div className={styles.ganttViewMenuActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => {
                      setDraftVisibleGanttStatuses(statusSetFromAll());
                      setDraftGanttSortMode(null);
                    }}
                  >
                    リセット
                  </button>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={handleApplyGanttViewSettings}
                  >
                    適用
                  </button>
                </div>
              </div>
            )}
          </div>
          <button type="button" className={styles.primaryButton} onClick={() => setCreatingTask(true)}>
            <PlusIcon size={14} /> タスク
          </button>
        </div>
      </div>

      <section className={styles.taskFilterBar} aria-label="タスク検索と絞り込み">
        <div className={styles.searchFieldWrap}>
          <label className={styles.filterLabel} htmlFor="process-task-search">
            タスク検索
          </label>
          <input
            id="process-task-search"
            className={styles.searchInput}
            type="search"
            value={taskFilters.query}
            onChange={(event) => updateTaskFilter('query', event.target.value)}
            placeholder="タイトル・説明を検索"
          />
        </div>
        <label className={styles.compactFilter}>
          <span>担当者</span>
          <select
            value={taskFilters.assigneeId}
            onChange={(event) => updateTaskFilter('assigneeId', event.target.value)}
          >
            <option value="all">すべて</option>
            <option value="unassigned">未担当</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.compactFilter}>
          <span>ステータス</span>
          <select
            value={taskFilters.columnId}
            onChange={(event) => updateTaskFilter('columnId', event.target.value)}
          >
            <option value="all">すべて</option>
            {columns.map((column) => (
              <option key={column.id} value={column.id}>
                {column.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.compactFilter}>
          <span>日付</span>
          <select
            value={taskFilters.dateFilter}
            onChange={(event) => updateTaskFilter('dateFilter', event.target.value as TaskFilterState['dateFilter'])}
          >
            <option value="all">すべて</option>
            <option value="complete">開始・終了あり</option>
            <option value="missing">日付未設定あり</option>
          </select>
        </label>
        <label className={styles.missingToggle}>
          <input
            type="checkbox"
            checked={taskFilters.missingOnly}
            onChange={(event) => updateTaskFilter('missingOnly', event.target.checked)}
          />
          未設定のみ
          <span className={styles.missingCount}>{missingTaskCount}</span>
        </label>
        {hasActiveFilters && (
          <button
            type="button"
            className={styles.clearFiltersButton}
            onClick={() => setTaskFilters(EMPTY_TASK_FILTERS)}
          >
            クリア
          </button>
        )}
        <span className={styles.filterResultCount}>
          表示 {filteredTasks.length} / 全{tasks.length}
        </span>
      </section>

      <main
        ref={workspaceRef}
        className={styles.workspace}
        data-testid="process-board-workspace"
        style={{ ['--gantt-height' as string]: `${ganttHeight}px` }}
      >
        <section className={styles.ganttSection} aria-label="ガントチャート">
          {visibleGanttTasks.length > 0 ? (
            <div ref={ganttRootRef} className={styles.ganttTheme} onDoubleClickCapture={handleGanttDomDoubleClick}>
              <Theme fonts={false}>
                <SvarGantt
                  key={ganttInstanceKey}
                  init={(api) => {
                    initGanttApi(api);
                  }}
                  tasks={visibleGanttTasks}
                  scales={ganttScales}
                  start={timelineBounds.start}
                  end={timelineBounds.end}
                  cellWidth={ganttCellWidth}
                  cellHeight={GANTT_ROW_HEIGHT}
                  scaleHeight={GANTT_SCALE_HEIGHT}
                  gridWidth={GANTT_GRID_WIDTH}
                  columns={ganttGridColumns}
                  taskTemplate={GanttTaskBarTemplate}
                  markers={[{ start: startOfDay(new Date()), text: '今日', css: 'articsTodayMarker' }]}
                  highlightTime={(date, unit) =>
                    unit === 'day' && (date.getDay() === 0 || date.getDay() === 6)
                      ? 'articsWeekend'
                      : ''
                  }
                  onupdatetask={(event) => {
                    void handleUpdateTaskDates(event);
                  }}
                  ondragtask={(event) => {
                    handleDragTaskDates(event);
                  }}
                  onshoweditor={handleOpenGanttTask}
                />
              </Theme>
              {ganttManualReorderEnabled && (
                <div className={styles.ganttInlineReorderLayer} aria-label="ガント行の手動並び替え">
                  <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleGanttReorderEnd}>
                    <SortableContext
                      items={visibleGanttTasks.map((task) => task.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <ul ref={ganttInlineReorderListRef} className={styles.ganttInlineReorderList}>
                        {visibleGanttTasks.map((task) => (
                          <GanttInlineReorderHandle key={task.id} task={task} />
                        ))}
                      </ul>
                    </SortableContext>
                  </DndContext>
                </div>
              )}
              <div
                ref={ganttScrollProxyRef}
                className={styles.ganttHorizontalScrollProxy}
                data-testid="process-gantt-horizontal-scroll"
                aria-label="ガントチャートの横スクロール"
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                tabIndex={0}
                onKeyDown={(event) => {
                  const proxy = ganttScrollProxyRef.current;
                  if (!proxy) return;
                  const step = event.shiftKey ? ganttCellWidth * 5 : ganttCellWidth;
                  if (event.key === 'ArrowLeft') {
                    event.preventDefault();
                    proxy.scrollLeft -= step;
                  }
                  if (event.key === 'ArrowRight') {
                    event.preventDefault();
                    proxy.scrollLeft += step;
                  }
                  if (event.key === 'PageUp') {
                    event.preventDefault();
                    proxy.scrollLeft -= proxy.clientWidth;
                  }
                  if (event.key === 'PageDown') {
                    event.preventDefault();
                    proxy.scrollLeft += proxy.clientWidth;
                  }
                  if (event.key === 'Home') {
                    event.preventDefault();
                    proxy.scrollLeft = 0;
                  }
                  if (event.key === 'End') {
                    event.preventDefault();
                    proxy.scrollLeft = proxy.scrollWidth;
                  }
                }}
              >
                <div ref={ganttScrollInnerRef} className={styles.ganttHorizontalScrollInner} />
              </div>
            </div>
          ) : (
            <div className={styles.ganttEmpty}>
              <h2>{ganttData.tasks.length > 0 ? '表示条件に一致するタスクがありません' : '日付が入ったタスクがありません'}</h2>
              <p>
                {ganttData.tasks.length > 0
                  ? '表示・並び順でステータスの表示条件を変更してください。'
                  : '下のカンバンでタスクに開始日または終了日を入れると、ここに表示されます。'}
              </p>
            </div>
          )}
        </section>

        <button
          type="button"
          className={styles.resizeHandle}
          aria-label="ガントとカンバンの表示範囲を調整"
          title="上下にドラッグして表示範囲を調整"
          onPointerDown={handleResizePointerDown}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setGanttHeight((height) => Math.max(MIN_GANTT_HEIGHT, height - 24));
              refreshGanttLayout();
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              const workspace = workspaceRef.current;
              const maxHeight = workspace
                ? Math.max(
                  MIN_GANTT_HEIGHT,
                  workspace.getBoundingClientRect().height - MIN_BOARD_HEIGHT - RESIZER_HEIGHT,
                )
                : DEFAULT_GANTT_HEIGHT;
              setGanttHeight((height) => Math.min(maxHeight, height + 24));
              refreshGanttLayout();
            }
          }}
        >
          <span aria-hidden="true" />
        </button>

        <section className={styles.boardSection} aria-label="カンバン">
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
            <div className={styles.board}>
              {columns.map((column) => (
                <BoardColumn
                  key={column.id}
                  column={column}
                  columns={columns}
                  tasks={tasksByColumn.get(column.id) ?? []}
                  memberById={memberById}
                  isLocked={LOCKED_COLUMN_IDS.has(column.id)}
                  isCreating={createInColumn === column.id}
                  onStartCreate={() => setCreateInColumn(column.id)}
                  onCancelCreate={() => setCreateInColumn(null)}
                  onCreateTask={async (title) => {
                    await createTask({
                      title,
                      columnId: column.id,
                      assigneeIds: [],
                      startDate: null,
                      endDate: null,
                      description: '',
                    });
                    setCreateInColumn(null);
                  }}
                  onTaskClick={(task) => setEditingTask(task)}
                  onRenameColumn={(name) => {
                    updateColumns(columns.map((c) => (c.id === column.id ? { ...c, name } : c)));
                  }}
                  onDeleteColumn={() => {
                    // 列内にタスクがある場合は削除させない（安全側）。
                    const inColumn = tasks.filter((t) => t.columnId === column.id);
                    if (inColumn.length > 0) {
                      window.alert('この列にタスクが残っています。先にタスクを移動または削除してください。');
                      return;
                    }
                    updateColumns(columns.filter((c) => c.id !== column.id));
                  }}
                />
              ))}
            </div>
          </DndContext>
        </section>
      </main>

      {editingTask && (
        <TaskPanel
          task={editingTask}
          columns={columns}
          defaultColumnId={editingTask.columnId}
          members={members}
          onSubmit={async (input) => {
            await updateTask(editingTask.id, input);
            refreshGanttLayout();
          }}
          onDelete={async () => {
            await deleteTask(editingTask.id);
            refreshGanttLayout();
          }}
          onDuplicate={async () => {
            await duplicateTask(editingTask);
            refreshGanttLayout();
          }}
          onClose={closeTaskPanel}
        />
      )}

      {creatingTask && (
        <TaskPanel
          task={null}
          columns={columns}
          defaultColumnId={defaultColumnId}
          members={members}
          onSubmit={(input) => createTask(input)}
          onClose={() => setCreatingTask(false)}
        />
      )}

      {pendingGanttDateChange && (
        <ConfirmModal
          title="タスク日程が変更されました"
          message={`${pendingGanttDateChange.taskTitle} の日程を ${formatTaskDateChange(
            pendingGanttDateChange.nextDates,
          )} に反映しますか？`}
          confirmText="はい"
          cancelText="いいえ"
          onConfirm={() => {
            const sourceTask = taskById.get(pendingGanttDateChange.taskId);
            if (sourceTask) {
              void updateTask(
                sourceTask.id,
                toTaskInput(sourceTask, pendingGanttDateChange.nextDates),
              );
            }
            setPendingGanttDateChange(null);
          }}
          onCancel={() => {
            setPendingGanttDateChange(null);
            refreshGanttLayout();
          }}
        />
      )}
    </div>
  );
}
