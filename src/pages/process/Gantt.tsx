import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Gantt as SvarGantt,
  Willow,
  WillowDark,
  type IApi,
  type ITask,
} from '@svar-ui/react-gantt';
import '@svar-ui/react-gantt/all.css';
import { useAuth } from '../../contexts/AuthContext';
import { useProject } from '../../hooks/process/useProject';
import { useProjectTasks } from '../../hooks/process/useProjectTasks';
import { useProcessMembers } from '../../hooks/process/useProcessMembers';
import {
  buildGanttTimelineBounds,
  formatProcessDate,
  ganttScalesForMode,
  resolveGanttUpdateTaskDates,
  toProcessGanttData,
  type GanttViewMode,
  type ProcessGanttTask,
} from '../../lib/process/gantt';
import { buildGanttInstanceKey, ganttStatusColorVariables } from '../../lib/process/ganttBarColors';
import { startOfDay } from '../../lib/process/dashboard';
import type { Task, TaskInput } from '../../types/process';
import TaskPanel from '../../components/process/TaskPanel';
import { BoardIcon, ChevronLeftIcon, PlusIcon } from '../../components/process/icons';
import styles from './Gantt.module.css';

type UpdateTaskEvent = {
  id?: string | number;
  task?: Partial<ITask>;
  diff?: number;
  inProgress?: boolean;
};

type DragTaskEvent = {
  id?: string | number;
  inProgress?: boolean;
};

type OpenGanttTaskEvent = {
  id?: string | number;
  task?: {
    id?: string | number;
  };
};

const GANTT_EDIT_EVENT_TAG = Symbol('artics-gantt-edit-panel');
const GANTT_SELECT_EVENT_TAG = Symbol('artics-gantt-disable-single-select');

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

function useIsDarkTheme() {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.getAttribute('data-theme') === 'dark',
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute('data-theme') === 'dark');
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

function toTaskInput(task: Task, updates: Partial<Pick<TaskInput, 'startDate' | 'endDate'>> = {}): TaskInput {
  return {
    title: task.title,
    columnId: task.columnId,
    assigneeIds: task.assigneeIds,
    startDate: updates.startDate ?? task.startDate,
    endDate: updates.endDate ?? task.endDate,
    description: task.description,
  };
}

export default function Gantt() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const ganttApiRef = useRef<IApi | null>(null);

  const { project, loading: projectLoading, notFound } = useProject(currentUser, projectId ?? null);
  const { tasks, loading: tasksLoading, createTask, duplicateTask, updateTask, deleteTask } = useProjectTasks(
    currentUser,
    projectId ?? null,
  );
  const { members } = useProcessMembers(currentUser);

  const [viewMode, setViewMode] = useState<GanttViewMode>('day');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [ganttLayoutVersion, setGanttLayoutVersion] = useState(0);
  const isDark = useIsDarkTheme();

  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const taskByIdRef = useRef(taskById);
  useEffect(() => {
    taskByIdRef.current = taskById;
  }, [taskById]);
  const ganttData = useMemo(
    () => toProcessGanttData(tasks, project?.columns ?? [], members),
    [members, project?.columns, tasks],
  );
  const timelineBounds = useMemo(
    () => buildGanttTimelineBounds(ganttData.tasks, new Date()),
    [ganttData.tasks],
  );
  const ganttScales = useMemo(() => ganttScalesForMode(viewMode), [viewMode]);
  const ganttInstanceKey = useMemo(
    () => buildGanttInstanceKey(viewMode, ganttLayoutVersion, ganttData.tasks),
    [ganttData.tasks, ganttLayoutVersion, viewMode],
  );

  if (notFound) {
    navigate('/process/projects', { replace: true });
    return null;
  }

  if (projectLoading || tasksLoading || !project) {
    return <p className={styles.loadingText}>読み込み中...</p>;
  }

  const defaultColumnId = project.columns[0]?.id ?? 'todo';
  const Theme = isDark ? WillowDark : Willow;

  const refreshGanttLayout = () => {
    setGanttLayoutVersion((version) => version + 1);
    window.dispatchEvent(new Event('resize'));
  };

  const commitGanttTaskDates = async (
    taskId: string,
    taskPatch: (Partial<ITask> & { diff?: number }) | null = null,
  ) => {
    const sourceTask = taskById.get(taskId);
    if (!sourceTask) return;
    const liveTask = ganttApiRef.current?.getTask(taskId);
    const nextDates = resolveGanttUpdateTaskDates(sourceTask, taskPatch ?? {}, liveTask);
    if (!nextDates) return;
    if (
      sourceTask.startDate?.getTime() === nextDates.startDate?.getTime() &&
      sourceTask.endDate?.getTime() === nextDates.endDate?.getTime()
    ) {
      return;
    }
    await updateTask(sourceTask.id, toTaskInput(sourceTask, nextDates));
  };

  const handleUpdateTask = async (event: UpdateTaskEvent) => {
    const eventId = event.id ?? event.task?.id;
    if (event.inProgress || !eventId) return;
    await commitGanttTaskDates(String(eventId), { ...(event.task ?? {}), diff: event.diff });
  };

  const handleDragTask = (event: DragTaskEvent) => {
    if (event.inProgress || !event.id) return;
    window.setTimeout(() => {
      void commitGanttTaskDates(String(event.id));
    }, 0);
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
              {ganttData.tasks.length}件表示 / 日付未設定 {ganttData.unscheduledTasks.length}件
            </p>
          </div>
        </div>

        <div className={styles.headerActions}>
          <div className={styles.segmented} aria-label="表示単位">
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
            className={styles.secondaryButton}
            onClick={() => navigate(`/process/projects/${project.id}/board`)}
          >
            <BoardIcon size={14} /> カンバン
          </button>
          <button type="button" className={styles.primaryButton} onClick={() => setCreatingTask(true)}>
            <PlusIcon size={14} /> タスク
          </button>
        </div>
      </div>

      <div className={styles.ganttShell}>
        {ganttData.tasks.length > 0 ? (
          <Theme fonts={false}>
            <div className={styles.ganttTheme} onDoubleClickCapture={handleGanttDomDoubleClick}>
              <SvarGantt
                key={ganttInstanceKey}
                init={initGanttApi}
                tasks={ganttData.tasks}
                scales={ganttScales}
                start={timelineBounds.start}
                end={timelineBounds.end}
                cellWidth={viewMode === 'day' ? 48 : viewMode === 'week' ? 76 : 92}
                cellHeight={42}
                scaleHeight={54}
                gridWidth={420}
                columns={[
                  { id: 'text', header: 'タスク', width: 220 },
                  { id: 'columnName', header: '状態', width: 96 },
                  { id: 'assigneeText', header: '担当', width: 120 },
                ]}
                taskTemplate={GanttTaskBarTemplate}
                markers={[{ start: startOfDay(new Date()), text: '今日', css: 'articsTodayMarker' }]}
                highlightTime={(date, unit) =>
                  unit === 'day' && (date.getDay() === 0 || date.getDay() === 6)
                    ? 'articsWeekend'
                    : ''
                }
                onupdatetask={(event) => {
                  void handleUpdateTask(event);
                }}
                ondragtask={(event) => {
                  handleDragTask(event);
                }}
                onshoweditor={handleOpenGanttTask}
              />
            </div>
          </Theme>
        ) : (
          <div className={styles.emptyPanel}>
            <h2>日付が入ったタスクがありません</h2>
            <p>タスクに開始日または終了日を入れると、ここにガントバーが表示されます。</p>
          </div>
        )}
      </div>

      <details className={styles.taskListPanel}>
        <summary>タスク一覧（{tasks.length}件）</summary>
        {tasks.length > 0 ? (
          <div className={styles.unscheduledList}>
            {tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                className={styles.unscheduledItem}
                onClick={() => setEditingTask(task)}
              >
                <span>{task.title}</span>
                <small>
                  {formatProcessDate(task.startDate)} - {formatProcessDate(task.endDate)}
                </small>
              </button>
            ))}
          </div>
        ) : (
          <p className={styles.unscheduledEmpty}>タスクはありません。</p>
        )}
      </details>

      <details className={styles.unscheduled} open={ganttData.unscheduledTasks.length > 0}>
        <summary>日付未設定（{ganttData.unscheduledTasks.length}件）</summary>
        {ganttData.unscheduledTasks.length > 0 ? (
          <div className={styles.unscheduledList}>
            {ganttData.unscheduledTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                className={styles.unscheduledItem}
                onClick={() => setEditingTask(task)}
              >
                <span>{task.title}</span>
                <small>{formatProcessDate(task.startDate)} - {formatProcessDate(task.endDate)}</small>
              </button>
            ))}
          </div>
        ) : (
          <p className={styles.unscheduledEmpty}>日付未設定のタスクはありません。</p>
        )}
      </details>

      {editingTask && (
        <TaskPanel
          task={editingTask}
          columns={project.columns}
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
          onClose={() => {
            setEditingTask(null);
            window.setTimeout(refreshGanttLayout, 0);
          }}
        />
      )}

      {creatingTask && (
        <TaskPanel
          task={null}
          columns={project.columns}
          defaultColumnId={defaultColumnId}
          members={members}
          onSubmit={(input) => createTask(input)}
          onClose={() => setCreatingTask(false)}
        />
      )}
    </div>
  );
}
