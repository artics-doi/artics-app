// プロジェクト一覧。カードグリッド + ステータス切替 + 作成/編集/アーカイブ/削除。

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAuth } from '../../contexts/AuthContext';
import { useProjectTaskSummaries } from '../../hooks/process/useProjectTaskSummaries';
import { useProjects } from '../../hooks/process/useProjects';
import { PROCESS_COLOR_COUNT, PROCESS_COLORS, PROJECT_STATUS_SEGMENTS } from '../../constants/process';
import {
  EMPTY_PROJECT_TASK_SUMMARY,
  PROJECT_TASK_STATUS_LABELS,
  filterProjectsByQuery,
  type ProjectTaskSummary,
} from '../../lib/process/projectList';
import type { Project, ProjectInput, ProjectStatus } from '../../types/process';
import ProjectFormModal from '../../components/process/ProjectFormModal';
import ConfirmModal from '../../components/modals/ConfirmModal';
import { PlusIcon, MoreIcon } from '../../components/process/icons';
import styles from './ProjectList.module.css';

const PROJECT_LIST_DENSITY_STORAGE_KEY = 'artics.process.projectList.density';

type ProjectListDensity = 'standard' | 'compact';

function accentOf(colorIndex: number): string {
  const idx = ((colorIndex % PROCESS_COLOR_COUNT) + PROCESS_COLOR_COUNT) % PROCESS_COLOR_COUNT;
  return PROCESS_COLORS[idx].accent;
}

function readStoredDensity(): ProjectListDensity {
  if (typeof window === 'undefined') return 'standard';
  return window.localStorage.getItem(PROJECT_LIST_DENSITY_STORAGE_KEY) === 'compact'
    ? 'compact'
    : 'standard';
}

type ProjectCardProps = {
  project: Project;
  summary: ProjectTaskSummary;
  density: ProjectListDensity;
  isOwner: boolean;
  menuOpen: boolean;
  status: ProjectStatus;
  onOpen: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onToggleMenu: () => void;
};

function ProjectCard({
  project,
  summary,
  density,
  isOwner,
  menuOpen,
  status,
  onOpen,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
  onToggleMenu,
}: ProjectCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
  });
  const style = {
    ['--card-accent' as string]: accentOf(project.colorIndex),
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      className={`${styles.card} ${density === 'compact' ? styles.cardCompact : ''} ${
        isDragging ? styles.cardDragging : ''
      }`}
      data-testid="process-project-card"
      style={style}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
    >
      <button
        type="button"
        className={styles.dragHandle}
        data-testid="process-project-drag-handle"
        aria-label={`${project.name} を並び替え`}
        onClick={(e) => e.stopPropagation()}
        {...attributes}
        {...listeners}
      >
        <span aria-hidden="true">::</span>
      </button>

      <button
        type="button"
        className={styles.menuButton}
        data-testid="process-project-menu-button"
        aria-label="メニュー"
        onClick={(e) => {
          e.stopPropagation();
          onToggleMenu();
        }}
      >
        <MoreIcon size={18} />
      </button>

      {menuOpen && (
        <div className={styles.menu} onClick={(e) => e.stopPropagation()}>
          <button type="button" className={styles.menuItem} onClick={onEdit}>
            編集
          </button>
          {status === 'active' ? (
            <button type="button" className={styles.menuItem} onClick={onArchive}>
              アーカイブ
            </button>
          ) : (
            <button type="button" className={styles.menuItem} onClick={onRestore}>
              進行中に戻す
            </button>
          )}
          {/* 【M6】削除ボタンは作成者のみ表示 */}
          {isOwner && (
            <button
              type="button"
              className={`${styles.menuItem} ${styles.menuItemDanger}`}
              data-testid="process-project-delete-button"
              onClick={onDelete}
            >
              削除
            </button>
          )}
        </div>
      )}

      <h2 className={styles.cardName}>{project.name}</h2>
      {project.description && <p className={styles.cardDesc}>{project.description}</p>}
      <div className={styles.summaryChips} aria-label="進捗サマリー">
        {PROJECT_TASK_STATUS_LABELS.map((item) => (
          <span key={item.id} className={`${styles.summaryChip} ${styles[`summaryChip_${item.id}`]}`}>
            {item.label} {summary[item.id]}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ProjectList() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<ProjectStatus>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [density, setDensity] = useState<ProjectListDensity>(readStoredDensity);
  const {
    projects,
    loading,
    createProject,
    updateProject,
    setProjectStatus,
    requestDeleteProject,
    reorderProject,
  } = useProjects(currentUser, status);
  const { summaries } = useProjectTaskSummaries(currentUser, status, projects);
  const filteredProjects = useMemo(
    () => filterProjectsByQuery(projects, searchQuery),
    [projects, searchQuery],
  );
  const projectIds = useMemo(() => filteredProjects.map((project) => project.id), [filteredProjects]);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  // モーダル状態
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  useEffect(() => {
    window.localStorage.setItem(PROJECT_LIST_DENSITY_STORAGE_KEY, density);
  }, [density]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (project: Project) => {
    setEditing(project);
    setFormOpen(true);
    setOpenMenuId(null);
  };

  const handleSubmit = async (input: ProjectInput) => {
    if (editing) {
      await updateProject(editing.id, input);
    } else {
      await createProject(input);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    await requestDeleteProject(deleteTarget.id);
    setDeleteTarget(null);
  };

  const handleProjectDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const oldIndex = filteredProjects.findIndex((project) => project.id === activeId);
    const newIndex = filteredProjects.findIndex((project) => project.id === overId);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = [...filteredProjects];
    const [moved] = reordered.splice(oldIndex, 1);
    if (!moved) return;
    reordered.splice(newIndex, 0, moved);

    const prevProject = newIndex > 0 ? reordered[newIndex - 1] : null;
    const nextProject = newIndex < reordered.length - 1 ? reordered[newIndex + 1] : null;
    void reorderProject(activeId, prevProject?.order ?? null, nextProject?.order ?? null);
  };

  return (
    <div className={styles.page} onClick={() => setOpenMenuId(null)}>
      <div className={styles.headerRow}>
        <h1 className={styles.pageTitle}>プロジェクト一覧</h1>
        <div className={styles.headerActions}>
          <div className={styles.segments} role="tablist" aria-label="表示するステータス">
            {PROJECT_STATUS_SEGMENTS.map((seg) => (
              <button
                key={seg.id}
                type="button"
                role="tab"
                aria-selected={status === seg.id}
                className={`${styles.segment} ${status === seg.id ? styles.segmentActive : ''}`}
                onClick={() => setStatus(seg.id)}
              >
                {seg.label}
              </button>
            ))}
          </div>
          <button type="button" className={styles.addButton} onClick={openCreate}>
            <PlusIcon size={16} />
            新規作成
          </button>
        </div>
      </div>
      {status === 'archived' && (
        <div className={styles.archiveNotice}>
          <strong>アーカイブ済みプロジェクト</strong>
          <span>完了・保留した案件を確認できます。カードのメニューから進行中に戻せます。</span>
        </div>
      )}
      <div className={styles.toolbar}>
        <label className={styles.searchWrap} htmlFor="process-project-search">
          <span>検索</span>
          <input
            id="process-project-search"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="プロジェクト名・説明を検索"
          />
        </label>
        <div className={styles.densitySwitch} role="group" aria-label="表示密度">
          <button
            type="button"
            className={`${styles.densityButton} ${density === 'standard' ? styles.densityButtonActive : ''}`}
            aria-pressed={density === 'standard'}
            onClick={() => setDensity('standard')}
          >
            標準
          </button>
          <button
            type="button"
            className={`${styles.densityButton} ${density === 'compact' ? styles.densityButtonActive : ''}`}
            aria-pressed={density === 'compact'}
            onClick={() => setDensity('compact')}
          >
            コンパクト
          </button>
        </div>
        <span className={styles.resultCount}>表示 {filteredProjects.length} / 全{projects.length}</span>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>読み込み中...</p>
      ) : projects.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>
            {status === 'active'
              ? 'プロジェクトがまだありません。'
              : 'アーカイブ済みプロジェクトはありません。進行中の案件をアーカイブするとここに表示されます。'}
          </p>
          {status === 'active' && (
            <button type="button" className={styles.addButton} onClick={openCreate}>
              <PlusIcon size={16} />
              最初のプロジェクトを作成
            </button>
          )}
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>該当するプロジェクトはありません。</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleProjectDragEnd}>
          <SortableContext items={projectIds} strategy={rectSortingStrategy}>
            <div className={styles.grid}>
              {filteredProjects.map((project) => {
                const isOwner = currentUser?.uid === project.createdBy;
                return (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    summary={summaries.get(project.id) ?? EMPTY_PROJECT_TASK_SUMMARY}
                    density={density}
                    isOwner={isOwner}
                    menuOpen={openMenuId === project.id}
                    status={status}
                    onOpen={() => navigate(`/process/projects/${project.id}/board`)}
                    onEdit={() => openEdit(project)}
                    onArchive={() => {
                      setProjectStatus(project.id, 'archived');
                      setOpenMenuId(null);
                    }}
                    onRestore={() => {
                      setProjectStatus(project.id, 'active');
                      setOpenMenuId(null);
                    }}
                    onDelete={() => {
                      setDeleteTarget(project);
                      setOpenMenuId(null);
                    }}
                    onToggleMenu={() => setOpenMenuId(openMenuId === project.id ? null : project.id)}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {formOpen && (
        <ProjectFormModal
          project={editing}
          onSubmit={handleSubmit}
          onClose={() => setFormOpen(false)}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="プロジェクトを削除"
          message={`「${deleteTarget.name}」と配下のすべてのタスクを削除します。この操作は取り消せません。`}
          confirmText="削除する"
          cancelText="キャンセル"
          isDestructive
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
