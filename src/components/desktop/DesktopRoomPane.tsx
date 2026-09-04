// デスクトップ3ペイン表示の左側チャット一覧ペイン。Chat.tsx から機械的に移動（挙動変更なし）。
// スタイルは親ページの Chat.module.css をそのまま使う。

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ChatRoom, User } from '../../types';
import { getRoomAvatarLabel, getRoomAvatarUrl, getRoomDisplayName, getUnreadCount } from '../../utils/room';
import { formatRoomListTime } from '../../lib/chat/roomListPreview';
import { NARROW_WINDOW_QUERY } from '../../utils/navigation';
import styles from '../../pages/Chat.module.css';

interface DesktopRoomPaneProps {
  rooms: ChatRoom[];
  activeRoomId: string | undefined;
  currentUserId: string | undefined;
  users: User[];
  isRoomMuted: (roomId: string) => boolean;
  memoRoom: ChatRoom | undefined;
  memoReturnPath: string;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onOpenNewChat: () => void;
  compactMode?: boolean;
}

type WorkspacePath = '/schedule' | '/process';

function waitForWorkspaceViewport(): Promise<boolean> {
  const mediaQuery = window.matchMedia(NARROW_WINDOW_QUERY);
  if (!mediaQuery.matches) return Promise.resolve(true);

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      mediaQuery.removeEventListener('change', handleChange);
      resolve(!mediaQuery.matches);
    };
    const handleChange = () => {
      if (!mediaQuery.matches) finish();
    };
    const timeoutId = window.setTimeout(finish, 800);
    mediaQuery.addEventListener('change', handleChange);
  });
}

export default function DesktopRoomPane({
  rooms,
  activeRoomId,
  currentUserId,
  users,
  isRoomMuted,
  memoRoom,
  memoReturnPath,
  onOpenSearch,
  onOpenSettings,
  onOpenNewChat,
  compactMode = false,
}: DesktopRoomPaneProps) {
  const navigate = useNavigate();
  const [openingWorkspacePath, setOpeningWorkspacePath] = useState<WorkspacePath | null>(null);

  async function openWorkspace(path: WorkspacePath) {
    if (!compactMode) {
      navigate(path);
      return;
    }

    setOpeningWorkspacePath(path);
    try {
      const expanded = await window.electronAPI?.expandToWorkspace?.();
      if (expanded === false) return;
      if (await waitForWorkspaceViewport()) navigate(path);
    } finally {
      setOpeningWorkspacePath(null);
    }
  }

  return (
    <aside className={styles.desktopRoomPane} aria-label="チャット一覧">
      <div className={styles.desktopQuickActions}>
        <button type="button" onClick={onOpenSearch} className={styles.desktopQuickButton}>
          検索
        </button>
        <button
          type="button"
          onClick={() => {
            if (memoRoom) {
              navigate(`/memo/${memoRoom.id}`, { state: { from: memoReturnPath } });
            }
          }}
          className={styles.desktopQuickButton}
          disabled={!memoRoom}
        >
          メモ
        </button>
        <button type="button" onClick={onOpenSettings} className={styles.desktopQuickButton}>
          設定
        </button>
      </div>
      <div className={styles.desktopPaneHeader}>
        <button type="button" onClick={onOpenNewChat} className={styles.desktopPrimaryAction}>
          ＋ 新しいチャット
        </button>
        <button type="button" onClick={() => navigate('/chat')} className={`${styles.desktopScheduleAction} ${styles.active}`}>
          チャット
        </button>
        <button
          type="button"
          onClick={() => { void openWorkspace('/schedule'); }}
          className={styles.desktopScheduleAction}
          disabled={openingWorkspacePath !== null}
          title={compactMode ? '画面を広げて開きます' : undefined}
          aria-label={compactMode ? '行動予定表（Beta）。画面を広げて開きます' : '行動予定表（Beta）'}
        >
          <span>行動予定表（Beta）</span>
          {compactMode && <span className={styles.desktopWorkspaceHint}>画面を広げて開きます</span>}
        </button>
        <button
          type="button"
          onClick={() => { void openWorkspace('/process'); }}
          className={styles.desktopScheduleAction}
          disabled={openingWorkspacePath !== null}
          title={compactMode ? '画面を広げて開きます' : undefined}
          aria-label={compactMode ? '工程管理（Beta）。画面を広げて開きます' : '工程管理（Beta）'}
        >
          <span>工程管理（Beta）</span>
          {compactMode && <span className={styles.desktopWorkspaceHint}>画面を広げて開きます</span>}
        </button>
      </div>
      <div className={styles.desktopRoomSectionTitle}>
        <span>ルーム</span>
        <span aria-hidden="true">⌄</span>
      </div>
      <div className={styles.desktopRoomList}>
        {rooms.map((room) => {
          const unread = getUnreadCount(room, currentUserId, activeRoomId);
          const favorited = room.favorites?.includes(currentUserId || '') ?? false;
          const avatarUrl = getRoomAvatarUrl(room, currentUserId, users);
          return (
            <button
              key={room.id}
              type="button"
              className={`${styles.desktopRoomItem} ${room.id === activeRoomId ? styles.active : ''}`}
              onClick={() => navigate(`/chat/${room.id}`)}
            >
              <span className={styles.desktopRoomAvatar} aria-hidden="true">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" />
                ) : (
                  getRoomAvatarLabel(room, currentUserId, users)
                )}
              </span>
              <span className={styles.desktopRoomText}>
                <span className={styles.desktopRoomName}>
                  {favorited && <span className={styles.desktopFavorite} aria-hidden="true">★</span>}
                  {getRoomDisplayName(room, currentUserId)}
                </span>
                <span className={styles.desktopRoomLast}>
                  {room.lastMessage
                    ? `${room.lastMessage.senderName}: ${room.lastMessage.text}`
                    : 'メッセージがありません'}
                </span>
              </span>
              <span className={styles.desktopRoomMeta}>
                {room.lastMessage?.timestamp && (
                  <time dateTime={room.lastMessage.timestamp.toISOString()}>
                    {formatRoomListTime(room.lastMessage.timestamp)}
                  </time>
                )}
                {isRoomMuted(room.id) && <span className={styles.desktopMuted} title="通知オフ">OFF</span>}
                {unread > 0 && <span className={styles.desktopUnread}>{unread}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
