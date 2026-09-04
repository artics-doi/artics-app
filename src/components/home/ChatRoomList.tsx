// ホーム画面のチャットルーム一覧を描画するコンポーネント
//
// 役割:
// - Home.tsx から受け取った chatRooms（メモを除く）を一覧表示
// - 1対1チャットの相手のオンライン状態をドット表示
// - 行の右側に最終メッセージの時刻と未読バッジを表示
// - お気に入り / 招待 / 削除のアクションボタンを表示（スマホ幅では左スワイプで表示）
//
// スマホ幅のスワイプは Home.module.css 側で `.chatItem` を横スクロールコンテナにして実現する。
// JS 側では「スワイプで開いた状態のタップは遷移させず、閉じるだけにする」ガードだけを持つ。
//
// 状態は持たず、Home.tsx からハンドラを props で受け取るプレゼンテーションコンポーネント。

import { useRef } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import type { ChatRoom } from '../../types';
import { getRoomDisplayName } from '../../utils/room';
import { formatRoomListPreview, formatRoomListTime } from '../../lib/chat/roomListPreview';
import { useIsNarrowViewport } from '../../hooks/useIsNarrowViewport';
import { StatusDot } from '../StatusDot';
import statusDotStyles from '../StatusDot.module.css';
import styles from '../../pages/Home.module.css';

interface ChatRoomListProps {
  chatRooms: ChatRoom[];
  currentUser: FirebaseUser | null;
  onlineStatusMap: Record<string, boolean>;
  isRoomMuted: (roomId: string) => boolean;
  getUnreadCount: (room: ChatRoom) => number;
  onRoomClick: (roomId: string) => void;
  onToggleFavorite: (roomId: string, e: React.MouseEvent) => void;
  onInvite: (roomId: string, e: React.MouseEvent) => void;
  onDelete: (roomId: string, e: React.MouseEvent) => void;
  canDeleteRoom: (room: ChatRoom) => boolean;
}

// 横スクロール量がこの値を超えていたら「スワイプでアクションを開いた状態」と見なす
const SWIPE_OPEN_THRESHOLD_PX = 4;

export default function ChatRoomList({
  chatRooms,
  currentUser,
  onlineStatusMap,
  isRoomMuted,
  getUnreadCount,
  onRoomClick,
  onToggleFavorite,
  onInvite,
  onDelete,
  canDeleteRoom,
}: ChatRoomListProps) {
  const isNarrow = useIsNarrowViewport();
  // スワイプで開いている行。別の行を開いたら前の行を閉じる（同時に複数開かない）
  const openRowRef = useRef<HTMLDivElement | null>(null);
  const visibleRooms = chatRooms.filter((room) => room.type !== 'memo');

  // メモだけに所属している場合も一覧は空になるため、判定は表示対象の件数で行う
  if (visibleRooms.length === 0) {
    return (
      <div className={styles.chatList}>
        <div className={styles.empty}>
          <p>チャットがありません</p>
          <p>「+」ボタンから新しいチャットを始めましょう</p>
        </div>
      </div>
    );
  }

  // スワイプで開いている行のタップは遷移させず、閉じるだけにする
  const handleRoomClick = (roomId: string, event: React.MouseEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    if (container.scrollLeft > SWIPE_OPEN_THRESHOLD_PX) {
      container.scrollTo({ left: 0, behavior: 'smooth' });
      return;
    }
    onRoomClick(roomId);
  };

  const handleRowScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const row = event.currentTarget;
    if (row.scrollLeft <= SWIPE_OPEN_THRESHOLD_PX) {
      if (openRowRef.current === row) openRowRef.current = null;
      return;
    }
    const previous = openRowRef.current;
    if (previous && previous !== row) previous.scrollTo({ left: 0, behavior: 'smooth' });
    openRowRef.current = row;
  };

  return (
    <div className={styles.chatList}>
      {visibleRooms.map((room) => {
        const otherUid =
          room.type === 'direct' && currentUser
            ? room.members.find((uid) => uid !== currentUser.uid) ?? null
            : null;

        const avatarInner = (
          <div className={styles.avatar} style={otherUid ? { marginRight: 0 } : undefined}>
            {room.photoURL ? (
              <img src={room.photoURL} alt="" className={styles.avatarImage} />
            ) : otherUid ? (() => {
              const otherPhoto = room.memberDetails?.[otherUid]?.photoURL;
              return otherPhoto ? (
                <img src={otherPhoto} alt="" className={styles.avatarImage} />
              ) : (
                <svg className={styles.avatarSilhouette} viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                </svg>
              );
            })() : (
              <svg className={styles.avatarSilhouette} viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
              </svg>
            )}
          </div>
        );

        const avatar = otherUid ? (
          <div className={statusDotStyles.avatarWrapper} style={{ marginRight: 12 }}>
            {avatarInner}
            <StatusDot isOnline={onlineStatusMap[otherUid] ?? false} size={isNarrow ? 'sm' : 'md'} />
          </div>
        ) : (
          avatarInner
        );

        const isFavorited = room.favorites?.includes(currentUser?.uid || '') ?? false;
        const unread = getUnreadCount(room);
        const time = formatRoomListTime(room.lastMessage?.timestamp);

        return (
          <div
            key={room.id}
            className={styles.chatItem}
            onClick={(e) => handleRoomClick(room.id, e)}
            onScroll={handleRowScroll}
          >
            <div className={styles.chatItemBody}>
              {avatar}
              <div className={styles.chatInfo}>
                <div className={styles.chatHeader}>
                  <span className={styles.chatName}>
                    {getRoomDisplayName(room, currentUser?.uid)}
                    {isRoomMuted(room.id) && (
                      <span className={styles.mutedIndicator} title="通知オフ">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          width="14"
                          height="14"
                        >
                          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                          <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
                          <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
                          <path d="M18 8a6 6 0 0 0-9.33-5" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      </span>
                    )}
                    {room.type === 'group' && (
                      <span className={styles.memberCount}>({room.members.length}人)</span>
                    )}
                  </span>
                </div>
                <div className={styles.chatFooter}>
                  <p className={styles.lastMessage}>
                    {formatRoomListPreview(room.lastMessage, room.type, currentUser?.uid)}
                  </p>
                </div>
              </div>
              {(time || unread > 0) && (
                <div className={styles.chatMeta}>
                  {time && <span className={styles.chatTime}>{time}</span>}
                  {unread > 0 && (
                    <span
                      className={styles.unreadBadge}
                      aria-label={`未読メッセージ ${unread > 99 ? '99件以上' : `${unread}件`}`}
                    >
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className={styles.chatActions}>
              <button
                className={`${styles.favoriteButton} ${isFavorited ? styles.favorited : ''}`}
                onClick={(e) => onToggleFavorite(room.id, e)}
                title={isFavorited ? 'お気に入り解除' : 'お気に入りに追加'}
                aria-label={isFavorited ? 'お気に入り解除' : 'お気に入りに追加'}
              >
                {isFavorited ? '★' : '☆'}
              </button>
              {room.type === 'group' && (
                <button
                  className={styles.inviteButton}
                  onClick={(e) => onInvite(room.id, e)}
                  title="メンバー招待"
                  aria-label="メンバー招待"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="8.5" cy="7" r="4" />
                    <line x1="20" y1="8" x2="20" y2="14" />
                    <line x1="23" y1="11" x2="17" y2="11" />
                  </svg>
                </button>
              )}
              {canDeleteRoom(room) && (
                <button
                  className={styles.deleteButton}
                  onClick={(e) => onDelete(room.id, e)}
                  title="削除"
                  aria-label="削除"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
