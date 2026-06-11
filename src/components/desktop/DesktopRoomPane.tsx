// デスクトップ3ペイン表示の左側チャット一覧ペイン。Chat.tsx から機械的に移動（挙動変更なし）。
// スタイルは親ページの Chat.module.css をそのまま使う。

import { useNavigate } from 'react-router-dom';
import type { ChatRoom, User } from '../../types';
import { getRoomAvatarLabel, getRoomAvatarUrl, getRoomDisplayName, getUnreadCount } from '../../utils/room';
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
}: DesktopRoomPaneProps) {
  const navigate = useNavigate();

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
        <button type="button" onClick={() => navigate('/schedule')} className={styles.desktopScheduleAction}>
          行動予定表
        </button>
        <button type="button" onClick={() => navigate('/process')} className={styles.desktopScheduleAction}>
          工程管理
        </button>
      </div>
      <div className={styles.desktopRoomSectionTitle}>
        <span>ルーム</span>
        <span aria-hidden="true">⌄</span>
      </div>
      <div className={styles.desktopRoomList}>
        {rooms.map((room) => {
          const unread = getUnreadCount(room, currentUserId);
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
              {isRoomMuted(room.id) && <span className={styles.desktopMuted} title="通知オフ">OFF</span>}
              {unread > 0 && <span className={styles.desktopUnread}>{unread}</span>}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
