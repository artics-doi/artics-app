// 工程管理メンバー（担当者）の新規作成 / 編集モーダル。
// 新規作成はアプリ登録済みユーザーから選択し、linkedUserId で紐付ける。
// 既存の手入力メンバー（linkedUserId:null）は互換性のため編集を維持する。

import { useEffect, useRef, useState } from 'react';
import { PROCESS_COLORS } from '../../constants/process';
import type { User } from '../../types';
import type { ProcessMember, ProcessMemberInput } from '../../types/process';
import { CloseIcon } from './icons';
import styles from './ProcessModal.module.css';

interface MemberFormModalProps {
  // 編集対象。null なら新規作成。
  member: ProcessMember | null;
  users: User[];
  existingLinkedUserIds: Set<string>;
  onSubmit: (input: ProcessMemberInput) => Promise<void>;
  onClose: () => void;
}

function initialOf(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed[0] : '？';
}

export default function MemberFormModal({
  member,
  users,
  existingLinkedUserIds,
  onSubmit,
  onClose,
}: MemberFormModalProps) {
  const [name, setName] = useState(member?.name ?? '');
  const [selectedUserId, setSelectedUserId] = useState(member?.linkedUserId ?? '');
  const [colorIndex, setColorIndex] = useState(member?.colorIndex ?? 0);
  const [submitting, setSubmitting] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const firstUserInputRef = useRef<HTMLInputElement>(null);
  const selectedUser = users.find((user) => user.uid === selectedUserId) ?? null;
  const linkedUser = users.find((user) => user.uid === member?.linkedUserId) ?? null;
  const isLinkedMember = member?.linkedUserId != null;
  const isManualMemberEdit = member != null && !isLinkedMember;
  const canCreateUser = !member && users.some((user) => !existingLinkedUserIds.has(user.uid));
  const firstSelectableUserId = users.find((user) => !existingLinkedUserIds.has(user.uid))?.uid ?? null;

  // 開いたら最初の入力にフォーカス（autoFocus 属性は a11y ルールで禁止のため ref で行う）。
  useEffect(() => {
    if (isManualMemberEdit) {
      nameInputRef.current?.focus();
    } else {
      firstUserInputRef.current?.focus();
    }
  }, [isManualMemberEdit]);

  // Esc で閉じる。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const canSubmit = isManualMemberEdit
    ? name.trim().length > 0 && !submitting
    : !!(member ? linkedUser || member.linkedUserId : selectedUser) && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const input = (() => {
        if (isManualMemberEdit) {
          return {
            name: name.trim(),
            colorIndex,
            linkedUserId: null,
          };
        }
        if (member) {
          return {
            name: linkedUser?.displayName || member.name,
            colorIndex,
            linkedUserId: member.linkedUserId,
          };
        }
        if (!selectedUser) throw new Error('追加するユーザーを選択してください');
        return {
          name: selectedUser.displayName,
          colorIndex,
          linkedUserId: selectedUser.uid,
        };
      })();
      await onSubmit({
        ...input,
      });
      onClose();
    } catch (err) {
      console.error('[Process] メンバー保存エラー:', err);
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-form-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id="member-form-title" className={styles.title}>
            {member ? 'メンバーを編集' : '新しいメンバー'}
          </h2>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="閉じる">
            <CloseIcon size={18} />
          </button>
        </div>

        {isManualMemberEdit ? (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="member-name">
              担当者名
            </label>
            <input
              ref={nameInputRef}
              id="member-name"
              className={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit();
              }}
              placeholder="例: 山田 太郎"
              maxLength={50}
            />
          </div>
        ) : (
          <div className={styles.field}>
            <span className={styles.label}>登録済みユーザー</span>
            {member ? (
              <div className={styles.linkedUserCard}>
                {linkedUser?.photoURL ? (
                  <img className={styles.userAvatarImage} src={linkedUser.photoURL} alt="" />
                ) : (
                  <span className={styles.userAvatar}>{initialOf(linkedUser?.displayName || member.name)}</span>
                )}
                <span className={styles.userText}>
                  <span className={styles.userName}>{linkedUser?.displayName || member.name}</span>
                  <span className={styles.userEmail}>
                    {linkedUser?.email || '登録ユーザー情報を取得中'}
                  </span>
                </span>
              </div>
            ) : canCreateUser ? (
              <div className={styles.userSelectList} role="radiogroup" aria-label="追加する登録済みユーザー">
                {users.map((user) => {
                  const alreadyAdded = existingLinkedUserIds.has(user.uid);
                  const selected = selectedUserId === user.uid;
                  return (
                    <label
                      key={user.uid}
                      className={`${styles.userOption} ${selected ? styles.userOptionSelected : ''} ${
                        alreadyAdded ? styles.userOptionDisabled : ''
                      }`}
                    >
                      <input
                        ref={user.uid === firstSelectableUserId ? firstUserInputRef : undefined}
                        type="radio"
                        name="process-member-user"
                        value={user.uid}
                        checked={selected}
                        disabled={alreadyAdded}
                        onChange={() => setSelectedUserId(user.uid)}
                        data-testid="process-member-user-option"
                        data-user-name={user.displayName}
                      />
                      {user.photoURL ? (
                        <img className={styles.userAvatarImage} src={user.photoURL} alt="" />
                      ) : (
                        <span className={styles.userAvatar}>{initialOf(user.displayName)}</span>
                      )}
                      <span className={styles.userText}>
                        <span className={styles.userName}>{user.displayName}</span>
                        <span className={styles.userEmail}>{user.email}</span>
                      </span>
                      {alreadyAdded && <span className={styles.userStatus}>追加済み</span>}
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className={styles.emptyText}>追加できる登録ユーザーがありません。</p>
            )}
          </div>
        )}

        <div className={styles.field}>
          <span className={styles.label}>識別色</span>
          <div className={styles.colorRow}>
            {PROCESS_COLORS.map((color, idx) => (
              <button
                key={color.name}
                type="button"
                className={`${styles.colorSwatch} ${idx === colorIndex ? styles.colorSwatchSelected : ''}`}
                style={{ background: color.accent }}
                onClick={() => setColorIndex(idx)}
                aria-label={color.name}
                aria-pressed={idx === colorIndex}
              />
            ))}
          </div>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.secondaryButton} onClick={onClose}>
            キャンセル
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {member ? '保存' : '作成'}
          </button>
        </div>
      </div>
    </div>
  );
}
