import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ChatRoom, User } from '../../types';
import { getRoomAvatarLabel, getRoomAvatarUrl, getRoomDisplayName, getUnreadCount } from '../../utils/room';
import { formatRoomListPreview, formatRoomListTime } from '../../lib/chat/roomListPreview';
import styles from '../../pages/Chat.module.css';

interface DesktopChatLandingProps {
  rooms: ChatRoom[];
  currentUserId: string | undefined;
  users: User[];
  showSummary: boolean;
  onOpenNewChat: () => void;
  onOpenSummary: () => void;
  onCloseSummary: () => void;
}

function isFilePreview(room: ChatRoom): boolean {
  const text = room.lastMessage?.text ?? '';
  return text.startsWith('ファイル:') || text === '画像を送信しました';
}

export default function DesktopChatLanding({
  rooms,
  currentUserId,
  users,
  showSummary,
  onOpenNewChat,
  onOpenSummary,
  onCloseSummary,
}: DesktopChatLandingProps) {
  const navigate = useNavigate();
  const recentRooms = rooms.slice(0, 3);
  const firstUnreadRoom = rooms.find((room) => getUnreadCount(room, currentUserId) > 0);
  const summary = useMemo(() => ({
    unread: rooms.reduce((total, room) => total + getUnreadCount(room, currentUserId), 0),
    favorites: rooms.filter((room) => room.favorites?.includes(currentUserId ?? '')).length,
    recentFiles: rooms.filter(isFilePreview).slice(0, 2),
  }), [currentUserId, rooms]);

  return (
    <>
      <main className={styles.desktopLandingMain} id="main-content">
        {!showSummary && (
          <button type="button" className={styles.desktopLandingSummaryToggle} onClick={onOpenSummary}>
            チャット概要を表示
          </button>
        )}
        <section className={styles.desktopLandingHero} aria-labelledby="desktop-chat-welcome">
          <img className={styles.desktopLandingLogo} src="./icon-192x192.png" alt="" />
          <h1 id="desktop-chat-welcome">チャットを選択してください</h1>
          <p>左のルーム一覧から選ぶか、新しいチャットを開始できます</p>
          <div className={styles.desktopLandingActions}>
            <button type="button" className={styles.desktopLandingPrimary} onClick={onOpenNewChat}>
              ＋ 新しいチャット
            </button>
            <button
              type="button"
              className={styles.desktopLandingSecondary}
              onClick={() => firstUnreadRoom && navigate(`/chat/${firstUnreadRoom.id}`)}
              disabled={!firstUnreadRoom}
            >
              未読のチャットを見る
            </button>
          </div>
        </section>

        <section className={styles.desktopRecentSection} aria-labelledby="desktop-recent-heading">
          <h2 id="desktop-recent-heading">最近開いたチャット</h2>
          <div className={styles.desktopRecentRooms}>
            {recentRooms.map((room) => {
              const avatarUrl = getRoomAvatarUrl(room, currentUserId, users);
              return (
                <button key={room.id} type="button" onClick={() => navigate(`/chat/${room.id}`)} className={styles.desktopRecentRoom}>
                  <span className={styles.desktopRecentAvatar} aria-hidden="true">
                    {avatarUrl ? <img src={avatarUrl} alt="" /> : getRoomAvatarLabel(room, currentUserId, users)}
                  </span>
                  <span className={styles.desktopRecentText}>
                    <strong>{getRoomDisplayName(room, currentUserId)}</strong>
                    <span>{formatRoomListPreview(room.lastMessage, room.type, currentUserId)}</span>
                  </span>
                  <time dateTime={room.updatedAt?.toISOString()}>{formatRoomListTime(room.updatedAt)}</time>
                </button>
              );
            })}
            {recentRooms.length === 0 && <p className={styles.desktopLandingEmpty}>参加中のチャットはまだありません。</p>}
          </div>
        </section>
      </main>

      {showSummary && (
        <aside className={styles.desktopSummaryPane} aria-label="チャット概要">
          <div className={styles.desktopInfoPaneHeader}>
            <h2>チャット概要</h2>
            <button type="button" onClick={onCloseSummary} aria-label="チャット概要を閉じる">×</button>
          </div>
          <div className={styles.desktopSummaryMetrics}>
            <button type="button" onClick={() => firstUnreadRoom && navigate(`/chat/${firstUnreadRoom.id}`)} disabled={!firstUnreadRoom}>
              <span>未読メッセージ</span>
              <strong>{summary.unread}</strong>
            </button>
            <div>
              <span>メンション</span>
              <strong aria-label="ルームを開いて確認">—</strong>
            </div>
            <div>
              <span>お気に入り</span>
              <strong>{summary.favorites}</strong>
            </div>
          </div>
          <section className={styles.desktopSummarySection}>
            <h3>最近のファイル</h3>
            <div className={styles.desktopSummaryFiles}>
              {summary.recentFiles.map((room) => (
                <button key={room.id} type="button" onClick={() => navigate(`/chat/${room.id}`)}>
                  <span className={styles.desktopFileBadge} aria-hidden="true">FILE</span>
                  <span>
                    <strong>{room.lastMessage?.text.replace(/^ファイル:\s*/, '') || '画像'}</strong>
                    <small>{room.lastMessage?.senderName}・{formatRoomListTime(room.lastMessage?.timestamp)}</small>
                  </span>
                </button>
              ))}
              {summary.recentFiles.length === 0 && (
                <p className={styles.desktopLandingEmpty}>最近共有されたファイルはありません。</p>
              )}
            </div>
          </section>
        </aside>
      )}
    </>
  );
}
