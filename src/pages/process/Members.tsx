// 工程管理メンバー（担当者マスタ）の管理ページ。
// ここで登録した担当者が、カンバンの担当者選択（MemberPicker）や
// ダッシュボードの担当者レーンに表示される。
// 新規追加はアプリ登録済みユーザー選択式。削除は確認ダイアログのみ（担当タスクの走査はしない）。

import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAuth } from '../../contexts/AuthContext';
import { useUsers } from '../../hooks/useUsers';
import { useProcessMembers } from '../../hooks/process/useProcessMembers';
import { accentOf } from '../../lib/process/colors';
import { buildMemberReorderUpdates } from '../../lib/process/memberOrdering';
import type { ProcessMember, ProcessMemberInput } from '../../types/process';
import MemberFormModal from '../../components/process/MemberFormModal';
import ProcessNotificationSettingsModal from '../../components/process/ProcessNotificationSettingsModal';
import ConfirmModal from '../../components/modals/ConfirmModal';
import { GripVerticalIcon, PlusIcon, MoreIcon } from '../../components/process/icons';
import styles from './Members.module.css';

// 名前の先頭1文字をアバターに表示（空なら「？」）。
function initialOf(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed[0] : '？';
}

type SortableMemberRowProps = {
  member: ProcessMember;
  linkedUserEmail: string | null;
  menuOpen: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleMenu: () => void;
  onNotification: () => void;
};

function SortableMemberRow({
  member,
  linkedUserEmail,
  menuOpen,
  onEdit,
  onDelete,
  onToggleMenu,
  onNotification,
}: SortableMemberRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: member.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      className={`${styles.row} ${isDragging ? styles.rowDragging : ''}`}
      data-testid="process-member-row"
      data-member-name={member.name}
      style={style}
    >
      <button
        type="button"
        className={styles.dragHandle}
        data-testid="process-member-drag-handle"
        aria-label={`${member.name} を並び替え`}
        onClick={(e) => e.stopPropagation()}
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon size={18} />
      </button>
      <span className={styles.avatar} style={{ background: accentOf(member.colorIndex) }}>
        {initialOf(member.name)}
      </span>
      <span className={styles.memberText}>
        <span className={styles.name}>{member.name}</span>
        {member.linkedUserId && (
          <span className={styles.linkedUserText}>{linkedUserEmail ?? '登録ユーザー'}</span>
        )}
      </span>
      <div className={styles.spacer} />
      <button type="button" className={`${styles.notificationButton} ${member.notification?.enabled ? styles.notificationEnabled : ''}`}
        aria-label={`${member.name} の通知設定（${member.notification?.enabled ? 'ON' : 'OFF'}）`}
        onClick={onNotification}>
        通知 {member.notification?.enabled ? 'ON' : 'OFF'}
      </button>
      <button
        type="button"
        className={styles.menuButton}
        data-testid="process-member-menu-button"
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
          <button
            type="button"
            className={`${styles.menuItem} ${styles.menuItemDanger}`}
            data-testid="process-member-delete-button"
            onClick={onDelete}
          >
            削除
          </button>
        </div>
      )}
    </div>
  );
}

export default function Members() {
  const { currentUser } = useAuth();
  const { members, loading, createMember, updateMember, deleteMember, reorderMembers, updateNotification } =
    useProcessMembers(currentUser);
  const { users, fetchUsers } = useUsers({ includeSelf: true });

  const [formOpen, setFormOpen] = useState(false);
  const [notificationMember, setNotificationMember] = useState<ProcessMember | null>(null);
  const [editing, setEditing] = useState<ProcessMember | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProcessMember | null>(null);
  const userById = useMemo(() => new Map(users.map((user) => [user.uid, user])), [users]);
  const memberIds = useMemo(() => members.map((member) => member.id), [members]);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );
  const existingLinkedUserIds = useMemo(
    () => new Set(members.map((member) => member.linkedUserId).filter((id): id is string => !!id)),
    [members],
  );

  useEffect(() => {
    if (!currentUser) return;
    void fetchUsers();
  }, [currentUser, fetchUsers]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (member: ProcessMember) => {
    setEditing(member);
    setFormOpen(true);
    setOpenMenuId(null);
  };

  const handleSubmit = async (input: ProcessMemberInput) => {
    if (editing) {
      await updateMember(editing.id, input);
    } else {
      await createMember(input);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteMember(deleteTarget.id);
    setDeleteTarget(null);
  };

  const handleMemberDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const updates = buildMemberReorderUpdates(members, String(active.id), String(over.id));
    if (updates.length === 0) return;
    void reorderMembers(updates);
  };

  return (
    <div className={styles.page} onClick={() => setOpenMenuId(null)}>
      <div className={styles.headerRow}>
        <h1 className={styles.pageTitle}>メンバー管理</h1>
        <button type="button" className={styles.addButton} onClick={openCreate}>
          <PlusIcon size={16} />
          メンバーを追加
        </button>
      </div>
      <p className={styles.subTitle}>
        ここで登録した担当者を、カンバンのタスクやダッシュボードに割り当てられます。
        通知は登録メンバーのみが対象です。「通知 OFF / ON」から、受け取るアクションを設定できます。
      </p>

      {loading ? (
        <p className={styles.loadingText}>読み込み中...</p>
      ) : members.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>メンバーがまだ登録されていません</p>
          <p className={styles.emptyText}>
            担当者を追加すると、タスクの担当者として割り当てられるようになります。
          </p>
          <button type="button" className={styles.addButton} onClick={openCreate}>
            <PlusIcon size={16} />
            最初のメンバーを追加
          </button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={() => setOpenMenuId(null)}
          onDragEnd={handleMemberDragEnd}
        >
          <SortableContext items={memberIds} strategy={verticalListSortingStrategy}>
            <div className={styles.list}>
              {members.map((member) => (
                <SortableMemberRow
                  key={member.id}
                  member={member}
                  linkedUserEmail={
                    member.linkedUserId ? (userById.get(member.linkedUserId)?.email ?? null) : null
                  }
                  menuOpen={openMenuId === member.id}
                  onEdit={() => openEdit(member)}
                  onNotification={() => setNotificationMember(member)}
                  onDelete={() => {
                    setDeleteTarget(member);
                    setOpenMenuId(null);
                  }}
                  onToggleMenu={() => setOpenMenuId(openMenuId === member.id ? null : member.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {formOpen && (
        <MemberFormModal
          member={editing}
          users={users}
          existingLinkedUserIds={existingLinkedUserIds}
          onSubmit={handleSubmit}
          onClose={() => setFormOpen(false)}
        />
      )}

      {notificationMember && (
        <ProcessNotificationSettingsModal member={notificationMember}
          onSave={settings => updateNotification(notificationMember.id, settings)}
          onClose={() => setNotificationMember(null)} />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="メンバーを削除"
          message={`「${deleteTarget.name}」を削除します。担当中のタスクからは表示されなくなります。この操作は取り消せません。`}
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
