// M-13: 新規チャット作成を 2 ステップ化
// ステップ 1: 「1対1 チャット」「グループチャット」の選択
// ステップ 2: 1対1 を選んだ場合のユーザー一覧（グループは別モーダル）

import { useState, useEffect } from 'react';
import styles from '../../../pages/Home.module.css';
import type { User } from '../../../types';
import useModal from '../../../hooks/useModal';

interface NewChatModalProps {
  isOpen: boolean;
  users: User[];
  onClose: () => void;
  onStartDirectChat: (user: User) => void;
  onShowNewGroup: () => void;
  startingUserId?: string | null;
}

type Step = 'select-type' | 'select-user';

export default function NewChatModal({
  isOpen,
  users,
  onClose,
  onStartDirectChat,
  onShowNewGroup,
  startingUserId = null,
}: NewChatModalProps) {
  const { modalProps } = useModal({ isOpen, onClose });
  const [step, setStep] = useState<Step>('select-type');

  // モーダル開閉時にステップを初期化
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isOpen) setStep('select-type');
  }, [isOpen]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!isOpen) return null;

  return (
    <div
      {...modalProps}
      className={styles.modal}
      onClick={onClose}
      aria-labelledby="new-chat-modal-title"
    >
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <h2 id="new-chat-modal-title">
          {step === 'select-type' ? '新しいチャット' : 'チャット相手を選択'}
        </h2>

        {step === 'select-type' && (
          <div className={styles.newChatTypeChoices}>
            <button
              type="button"
              className={styles.newChatTypeChoice}
              onClick={() => setStep('select-user')}
              aria-label="1対1のチャットを開始"
            >
              <span className={styles.newChatTypeIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </span>
              <span className={styles.newChatTypeLabel}>1対1 チャット</span>
              <span className={styles.newChatTypeHint}>個別の相手と会話</span>
            </button>
            <button
              type="button"
              className={styles.newChatTypeChoice}
              onClick={() => {
                onClose();
                onShowNewGroup();
              }}
              aria-label="グループチャットを作成"
            >
              <span className={styles.newChatTypeIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </span>
              <span className={styles.newChatTypeLabel}>グループチャット</span>
              <span className={styles.newChatTypeHint}>複数メンバーで会話</span>
            </button>
          </div>
        )}

        {step === 'select-user' && (
          <>
            <button
              type="button"
              className={styles.newChatBackButton}
              onClick={() => setStep('select-type')}
              aria-label="チャットの種類選択に戻る"
            >
              ← 戻る
            </button>
            <div className={styles.userList}>
              {users.length === 0 ? (
                <p className={styles.noUsers}>他のユーザーがいません</p>
              ) : (
                users.map((user) => (
                  <button
                    key={user.uid}
                    type="button"
                    className={styles.userItem}
                    onClick={() => onStartDirectChat(user)}
                    disabled={startingUserId !== null}
                    aria-busy={startingUserId === user.uid}
                  >
                    <span className={styles.userAvatar} aria-hidden="true">
                      {user.photoURL ? (
                        <img src={user.photoURL} alt="" className={styles.userAvatarImage} />
                      ) : (
                        <span className={styles.userAvatarInitial}>
                          {user.displayName.trim().slice(0, 1).toUpperCase() || 'U'}
                        </span>
                      )}
                    </span>
                    <span className={styles.userName}>
                      {startingUserId === user.uid ? 'チャットを開いています…' : user.displayName}
                    </span>
                  </button>
                ))
              )}
            </div>
          </>
        )}

        <button className={styles.closeButton} onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}
