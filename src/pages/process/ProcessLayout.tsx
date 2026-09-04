// 工程管理の共通レイアウト（左サイドバー + メイン領域 + Outlet）。
// /process 配下の全画面で共有する。PrivateRoute + Suspense は App.tsx 側で1回だけ包むので、
// このコンポーネントは「常に認証済み」前提で描画してよい。

import { useCallback, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import DesktopNewChatModals from '../../components/desktop/DesktopNewChatModals';
import DesktopUtilityModals from '../../components/desktop/DesktopUtilityModals';
import { canUseProcess } from '../../utils/process/canUseProcess';
import { DashboardIcon, ListIcon, UsersIcon, GanttIcon } from '../../components/process/icons';
import { useAuth } from '../../contexts/AuthContext';
import { useChatRooms } from '../../hooks/useChatRooms';
import { useDesktopRoomPaneResize } from '../../hooks/useDesktopRoomPaneResize';
import { useRoomNotificationSettings } from '../../hooks/useRoomNotificationSettings';
import { formatRoomListPreview, formatRoomListTime } from '../../lib/chat/roomListPreview';
import {
  getRoomAvatarLabel,
  getRoomAvatarUrl,
  getRoomDisplayName,
  getUnreadCount,
} from '../../utils/room';
import Chat from '../Chat';
import '../../styles/process-tokens.css';
import styles from './ProcessLayout.module.css';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  // 現在地がこの prefix で始まるならアクティブ
  matchPrefix: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'ダッシュボード', path: '/process', icon: <DashboardIcon />, matchPrefix: '/process' },
  { label: 'プロジェクト一覧', path: '/process/projects', icon: <ListIcon />, matchPrefix: '/process/projects' },
  { label: 'ガントチャート', path: '/process/gantt', icon: <GanttIcon />, matchPrefix: '/process/gantt' },
  { label: 'メンバー管理', path: '/process/members', icon: <UsersIcon />, matchPrefix: '/process/members' },
  { label: '年度工数', path: '/process/effort-report', icon: <ListIcon />, matchPrefix: '/process/effort-report' },
];

export default function ProcessLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const processEnabled = canUseProcess();
  const { chatRooms } = useChatRooms(processEnabled ? currentUser : null);
  const { isRoomMuted } = useRoomNotificationSettings(processEnabled);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [embeddedRoomId, setEmbeddedRoomId] = useState<string | null>(null);
  const closeEmbeddedChat = useCallback(() => setEmbeddedRoomId(null), []);
  const processContainerRef = useRef<HTMLDivElement>(null);
  const {
    paneWidth,
    isResizing,
    paneStyle,
    handleResizePointerDown,
    handleResizeKeyDown,
  } = useDesktopRoomPaneResize(processContainerRef, false);

  const visibleRooms = useMemo(
    () => chatRooms.filter((room) => room.type !== 'memo'),
    [chatRooms],
  );
  const memoRoom = useMemo(
    () => chatRooms.find((room) => room.type === 'memo'),
    [chatRooms],
  );
  const returnPath = `${location.pathname}${location.search}`;

  // PC 以外（スマホ等）では案内カードのみ表示する。
  if (!processEnabled) {
    return (
      <div className={styles.guard}>
        <div className={styles.guardCard}>
          <p className={styles.guardTitle}>工程管理はPCでご利用ください</p>
          <p className={styles.guardText}>
            工程管理（プロジェクト・カンバン・ガント）は画面の広いパソコンでの操作に最適化されています。
            お手元のPC、またはデスクトップアプリからアクセスしてください。
          </p>
          <button type="button" className={styles.guardLink} onClick={() => navigate('/schedule')}>
            ホームに戻る
          </button>
        </div>
      </div>
    );
  }

  // ダッシュボード(index)はパス完全一致、それ以外は prefix 一致でアクティブ判定。
  function isActive(item: NavItem): boolean {
    if (item.path === '/process') {
      return location.pathname === '/process' || location.pathname === '/process/';
    }
    return location.pathname.startsWith(item.matchPrefix);
  }

  return (
    <div ref={processContainerRef} className={styles.container} style={paneStyle}>
      <aside className={styles.sidebar} aria-label="チャット一覧と工程管理メニュー">
        <div className={styles.quickActions}>
          <button type="button" onClick={() => setSearchOpen(true)}>検索</button>
          <button
            type="button"
            onClick={() => {
              if (memoRoom) {
                navigate(`/memo/${memoRoom.id}`, { state: { from: returnPath } });
              }
            }}
            disabled={!memoRoom}
          >
            メモ
          </button>
          <button type="button" onClick={() => setSettingsOpen(true)}>設定</button>
        </div>

        <div className={styles.workspaceActions}>
          <button type="button" className={styles.newChatButton} onClick={() => setNewChatOpen(true)}>
            ＋ 新しいチャット
          </button>
          <button type="button" className={styles.workspaceTab} onClick={() => navigate('/chat')}>
            チャット
          </button>
          <button type="button" className={styles.workspaceTab} onClick={() => navigate('/schedule')}>
            行動予定表（Beta）
          </button>
          <button type="button" className={`${styles.workspaceTab} ${styles.workspaceTabActive}`} onClick={() => navigate('/process')}>
            工程管理（Beta）
          </button>
        </div>

        <nav className={styles.processNav} aria-label="工程管理メニュー">
          {NAV_ITEMS.map((item) => (
            <button
              type="button"
              key={item.path}
              className={`${styles.navItem} ${isActive(item) ? styles.navItemActive : ''}`}
              aria-current={isActive(item) ? 'page' : undefined}
              onClick={() => navigate(item.path)}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        {embeddedRoomId ? (
          <div className={styles.embeddedChatSlot}>
            <Chat
              embeddedRoomId={embeddedRoomId}
              onEmbeddedBack={closeEmbeddedChat}
            />
          </div>
        ) : (
          <>
            <div className={styles.chatSectionHeader}>
              <span>チャット</span>
              <span aria-hidden="true">⌃</span>
            </div>

            <div className={styles.roomList}>
              {visibleRooms.map((room) => {
                const unread = getUnreadCount(room, currentUser?.uid);
                const favorited = room.favorites?.includes(currentUser?.uid || '') ?? false;
                const avatarUrl = getRoomAvatarUrl(room, currentUser?.uid);
                return (
                  <button
                    key={room.id}
                    type="button"
                    className={styles.roomItem}
                    onClick={() => setEmbeddedRoomId(room.id)}
                  >
                    <span className={styles.roomAvatar} aria-hidden="true">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="" />
                      ) : (
                        getRoomAvatarLabel(room, currentUser?.uid)
                      )}
                    </span>
                    <span className={styles.roomText}>
                      <span className={styles.roomName}>
                        {favorited && <span className={styles.favorite} aria-hidden="true">★</span>}
                        {getRoomDisplayName(room, currentUser?.uid)}
                      </span>
                      <span className={styles.roomLast}>
                        {formatRoomListPreview(room.lastMessage, room.type, currentUser?.uid)}
                      </span>
                    </span>
                    <span className={styles.roomMeta}>
                      {room.lastMessage?.timestamp && (
                        <time dateTime={room.lastMessage.timestamp.toISOString()}>
                          {formatRoomListTime(room.lastMessage.timestamp)}
                        </time>
                      )}
                      {isRoomMuted(room.id) && <span className={styles.muted} title="通知オフ">OFF</span>}
                      {unread > 0 && <span className={styles.unread}>{unread}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </aside>

      <button
        type="button"
        className={`${styles.sidebarResizeHandle} ${isResizing ? styles.dragging : ''}`}
        onPointerDown={handleResizePointerDown}
        onKeyDown={handleResizeKeyDown}
        aria-label={`チャット一覧の幅を調整（現在${paneWidth}px）`}
        title="左右にドラッグしてチャット一覧の幅を調整"
      />

      <main className={styles.main} id="main-content">
        <Outlet />
      </main>

      <DesktopUtilityModals
        currentUser={currentUser}
        chatRooms={chatRooms}
        searchOpen={searchOpen}
        settingsOpen={settingsOpen}
        onCloseSearch={() => setSearchOpen(false)}
        onCloseSettings={() => setSettingsOpen(false)}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <DesktopNewChatModals
        currentUser={currentUser}
        chatRooms={chatRooms}
        isOpen={newChatOpen}
        onClose={() => setNewChatOpen(false)}
      />
    </div>
  );
}
