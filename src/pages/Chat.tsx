// チャット画面

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  collection,
  onSnapshot,
  addDoc,
  setDoc,
  updateDoc,
  doc,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  deleteField,
  type DocumentReference,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useActiveRoom } from '../contexts/ActiveRoomContext';
import { useToast } from '../contexts/ToastContext';
import { useRoomNotificationSettings } from '../hooks/useRoomNotificationSettings';
import { useUsers } from '../hooks/useUsers';
import { useInviteMembers } from '../hooks/useInviteMembers';
import { useTypingIndicator } from '../hooks/useTypingIndicator';
import { useMessages } from '../hooks/useMessages';
import { useChatRooms } from '../hooks/useChatRooms';
import { useReadReceipt } from '../hooks/useReadReceipt';
import { useSchedules } from '../hooks/useSchedules';
import { useProjects } from '../hooks/process/useProjects';
import { useProjectTasks } from '../hooks/process/useProjectTasks';
import { useProcessMembers } from '../hooks/process/useProcessMembers';
import { useVisualViewport } from '../hooks/useVisualViewport';
import { useIsNarrowViewport } from '../hooks/useIsNarrowViewport';
import { isElectronEnv } from '../hooks/useElectronNotification';
import { useDesktopRoomPaneResize } from '../hooks/useDesktopRoomPaneResize';
import type { ChatRoom, ExtendedMessage, User } from '../types';
import type { ScheduleCategoryId } from '../types/schedule';
import type { TaskInput } from '../types/process';
import { compressImage, isImageFile } from '../utils/imageCompression';
import { getRoomDisplayName } from '../utils/room';
import { ELECTRON_COMPACT_MAX_WIDTH, getAppEntryPath } from '../utils/navigation';
import { MAX_FILE_SIZE, HIGHLIGHT_DURATION, MAX_TEXTAREA_HEIGHT } from '../constants';
import { SCHEDULE_CATEGORIES } from '../constants/schedule';
import ImagePreviewModal from '../components/ImagePreviewModal';
import ConfirmModal from '../components/modals/ConfirmModal';
import {
  ChatMessageList,
  GroupEditModal,
  InviteMembersModal,
  MemberListModal,
  ReactionDetailModal,
  ReadDetailModal,
  TypingIndicator,
} from '../components/chat';
import DesktopRoomPane from '../components/desktop/DesktopRoomPane';
import DesktopChatLanding from '../components/desktop/DesktopChatLanding';
import DesktopRoomInfoPane from '../components/desktop/DesktopRoomInfoPane';
import DesktopUtilityModals from '../components/desktop/DesktopUtilityModals';
import DesktopNewChatModals from '../components/desktop/DesktopNewChatModals';
import TaskPanel from '../components/process/TaskPanel';
import { DeleteRoomConfirmModal } from '../components/home/modals';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { resolveMenuPosition } from '../lib/chat/menuPosition';
import { createScheduleFormFromMessage, createTaskInputFromMessage } from '../lib/chat/createFromMessage';
import { isPermissionDeniedError, withoutAttachmentFields } from '../lib/chat/attachmentCompat';
import { getClipboardImageFiles, validatePendingAttachments } from '../lib/chat/pendingAttachments';
import { canDeleteChatRoom } from '../lib/chat/roomDeletion';
import { deleteChatRoom } from '../lib/chat/roomDeletionClient';
import { getArrivingMessages } from '../lib/chat/messageScroll';
import { buildDate, isValidDate } from '../lib/schedule/calendar';
import type { ScheduleFormState } from '../lib/schedule/form';
import styles from './Chat.module.css';

/**
 * メッセージ更新を書き込む。attachmentState などの新フィールドを許可しない
 * 旧 firestore.rules 環境では permission-denied になるため、その場合だけ
 * 添付専用フィールドを外して再試行する（段階移行用）。
 *
 * @returns フォールバックで書き込んだ場合 true。ルール反映後は常に false になる。
 */
async function updateMessageWithAttachmentCompat(
  messageRef: DocumentReference,
  payload: Record<string, unknown>
): Promise<boolean> {
  try {
    await updateDoc(messageRef, payload);
    return false;
  } catch (error) {
    if (!isPermissionDeniedError(error)) throw error;
    console.warn('[attachment] 旧ルール互換モードで再試行します（firestore.rules 未反映）');
    await updateDoc(messageRef, withoutAttachmentFields(payload));
    return true;
  }
}

interface ChatProps {
  embeddedRoomId?: string;
  onEmbeddedBack?: () => void;
}

export default function Chat({ embeddedRoomId, onEmbeddedBack }: ChatProps = {}) {
  const { roomId: routeRoomId } = useParams<{ roomId: string }>();
  const roomId = embeddedRoomId ?? routeRoomId;
  const isEmbedded = Boolean(embeddedRoomId);
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { setActiveRoomId } = useActiveRoom();
  // 仮想キーボード表示時に --keyboard-height を CSS 変数として注入する（H-5）
  useVisualViewport();
  const {
    messages,
    loading,
    loadingMore,
    handleScroll,
    messageListRef,
    addOptimistic,
    confirmOptimistic,
    failOptimistic,
    dismissOptimistic,
  } = useMessages(roomId);
  const [newMessage, setNewMessage] = useState('');
  const [chatRoom, setChatRoom] = useState<ChatRoom | null>(null);
  const [sending, setSending] = useState(false);
  // M-10: アップロード進捗を構造化（"N / total" 表示用）
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const uploading = uploadProgress !== null;
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [previewImage, setPreviewImage] = useState<{ url: string; fileName: string } | null>(null);

  // 編集・削除機能
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [showMessageMenu, setShowMessageMenu] = useState<string | null>(null);
  const [showDeleteConfirmMessage, setShowDeleteConfirmMessage] = useState<string | null>(null);

  // 削除予約中のメッセージ ID 群（H-8 Undo: 5 秒後に Firestore 反映）
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
  const pendingDeleteTimersRef = useRef<Map<string, number>>(new Map());

  // リアクション機能
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
  // M-7: リアクションピッカーで二次絵文字（14 個）を展開しているか
  const [showSecondaryReactions, setShowSecondaryReactions] = useState(false);

  // M-8: メッセージリストが最下部にいるか / 新着件数
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const previousMessagesRef = useRef<ExtendedMessage[]>([]);
  // スクロール effect から最新の isAtBottom を参照するためのミラー
  const isAtBottomRef = useRef(true);
  useEffect(() => {
    isAtBottomRef.current = isAtBottom;
  }, [isAtBottom]);

  // スクロールハンドラ（M-8 isAtBottom 判定を上乗せ）
  const handleScrollEnhanced = useCallback(() => {
    // 既存の上端追加読み込み
    handleScroll();
    // 下端判定（30px のしきい値）
    const el = messageListRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom < 30;
    isAtBottomRef.current = atBottom;
    setIsAtBottom(atBottom);
    if (atBottom) setNewMessageCount(0);
  }, [handleScroll, messageListRef]);

  // 「最下部にジャンプ」
  const scrollToBottom = useCallback(() => {
    const el = messageListRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setNewMessageCount(0);
  }, [messageListRef]);

  // メニュー表示位置（上/下）
  // メニュー表示位置（上/下 + 左/右）。画面端でのはみ出しを防ぐ。
  const [menuPosition, setMenuPosition] = useState<{
    vertical: 'above' | 'below';
    horizontal: 'left' | 'right';
  }>({ vertical: 'above', horizontal: 'left' });

  // リアクション詳細モーダル
  const [showReactionDetail, setShowReactionDetail] = useState<{
    messageId: string;
    emoji: string;
    users: string[];
  } | null>(null);

  // 既読詳細モーダル
  const [showReadDetail, setShowReadDetail] = useState<{
    messageId: string;
    readBy: string[];
  } | null>(null);

  // 返信機能
  const [replyingTo, setReplyingTo] = useState<ExtendedMessage | null>(null);

  // ピン留め
  const [showPinnedMessages, setShowPinnedMessages] = useState(false);

  // メンション
  const [showMentionList, setShowMentionList] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');

  // ドラッグ&ドロップ
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  // グループ編集
  const [showGroupEdit, setShowGroupEdit] = useState(false);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupImage, setEditGroupImage] = useState<string | null>(null);
  const [savingGroup, setSavingGroup] = useState(false);

  // メンバー招待
  const [showInvite, setShowInvite] = useState(false);

  // メンバー一覧
  const [showMemberList, setShowMemberList] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showDeleteRoomConfirm, setShowDeleteRoomConfirm] = useState(false);
  const [isDeletingRoom, setIsDeletingRoom] = useState(false);

  const { currentUser } = useAuth();
  const isNarrowViewport = useIsNarrowViewport(ELECTRON_COMPACT_MAX_WIDTH);
  const isElectronCompact = isElectronEnv() && isNarrowViewport;
  const { showToast } = useToast();
  const { isRoomMuted, toggleMute } = useRoomNotificationSettings();
  const { chatRooms: desktopChatRooms } = useChatRooms(isEmbedded ? null : currentUser);
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const { users, fetchUsers } = useUsers();
  const {
    selectedUsers: inviteSelectedUsers,
    setSelectedUsers: setInviteSelectedUsers,
    getInvitableUsers,
    inviteMembers
  } = useInviteMembers(users);
  const { setTyping, clearTyping } = useTypingIndicator(roomId, currentUser?.uid);
  const [desktopSidePanelOpen, setDesktopSidePanelOpen] = useState(() => !isEmbedded);
  const {
    paneWidth: desktopRoomPaneWidth,
    isResizing: desktopRoomPaneResizing,
    paneStyle: desktopChatLayoutStyle,
    handleResizePointerDown: handleDesktopRoomPaneResizePointerDown,
    handleResizeKeyDown: handleDesktopRoomPaneResizeKeyDown,
  } = useDesktopRoomPaneResize(chatContainerRef, desktopSidePanelOpen);
  const [desktopSearchOpen, setDesktopSearchOpen] = useState(false);
  const [desktopSettingsOpen, setDesktopSettingsOpen] = useState(false);
  const [desktopNewChatOpen, setDesktopNewChatOpen] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleFormState | null>(null);
  const [scheduleDraftSaving, setScheduleDraftSaving] = useState(false);
  const [scheduleDraftUserIds, setScheduleDraftUserIds] = useState<string[]>([]);
  const [taskDraftMessage, setTaskDraftMessage] = useState<ExtendedMessage | null>(null);
  const [taskProjectId, setTaskProjectId] = useState('');

  // オンラインステータス
  const memberIds = useMemo(() => chatRoom?.members ?? [], [chatRoom?.members]);
  const onlineStatusMap = useOnlineStatus(memberIds);
  const otherUserId = useMemo(() => {
    if (chatRoom?.type !== 'direct' || !currentUser) return null;
    return chatRoom.members.find(uid => uid !== currentUser.uid) ?? null;
  }, [chatRoom, currentUser]);
  const { createSchedule } = useSchedules(currentUser, { subscribe: false });
  const { projects: activeProjects } = useProjects(currentUser, 'active');
  const selectedTaskProject = activeProjects.find((project) => project.id === taskProjectId) ?? activeProjects[0] ?? null;
  const selectedTaskProjectId = taskDraftMessage ? selectedTaskProject?.id ?? null : null;
  const {
    createTask: createChatTask,
  } = useProjectTasks(currentUser, selectedTaskProjectId);
  const { members: processMembers } = useProcessMembers(currentUser);
  const scheduleTargetUsers = useMemo<User[]>(() => {
    if (!currentUser) return users;
    const currentAsUser: User = {
      uid: currentUser.uid,
      email: currentUser.email || '',
      displayName: currentUser.displayName || currentUser.email || '自分',
      photoURL: currentUser.photoURL,
      createdAt: new Date(),
    };
    const unique = new Map<string, User>();
    [currentAsUser, ...users].forEach((user) => unique.set(user.uid, user));
    return Array.from(unique.values()).sort((a, b) => a.displayName.localeCompare(b.displayName, 'ja'));
  }, [currentUser, users]);

  const desktopRoomPaneResizeHandle = (
    <button
      type="button"
      className={`${styles.desktopRoomPaneResizeHandle} ${desktopRoomPaneResizing ? styles.dragging : ''}`}
      onPointerDown={handleDesktopRoomPaneResizePointerDown}
      onKeyDown={handleDesktopRoomPaneResizeKeyDown}
      aria-label={`チャット一覧の幅を調整（現在${desktopRoomPaneWidth}px）`}
      title="左右にドラッグしてチャット一覧の幅を調整"
    />
  );

  // 現在閲覧中のルームをグローバルに設定（通知抑制用）
  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (roomId) {
      setActiveRoomId(roomId);
    }
    return () => {
      setActiveRoomId(null);
    };
  }, [roomId, setActiveRoomId]);

  // 画面離脱時に pending な削除を即 Firestore に反映（H-8）
  // roomId が変わる or アンマウントされる場合にタイマーをクリアして
  // 待機中の削除をその場で commit する。
  useEffect(() => {
    const timers = pendingDeleteTimersRef.current;
    const activeRoomId = roomId;
    return () => {
      if (!activeRoomId) {
        timers.clear();
        return;
      }
      // 残っているタイマーを即時 commit
      timers.forEach((timer, messageId) => {
        window.clearTimeout(timer);
        void updateDoc(doc(db, 'chatRooms', activeRoomId, 'messages', messageId), {
          text: '',
          isDeleted: true,
          imageURL: null,
          fileURL: null,
        }).catch((err) => console.error('離脱時の削除フラッシュエラー:', err));
      });
      timers.clear();
    };
  }, [roomId]);

  // チャットルーム情報を取得（リアルタイム）
  useEffect(() => {
    if (!roomId) return;

    const roomRef = doc(db, 'chatRooms', roomId);
    const unsubscribe = onSnapshot(roomRef, (roomDoc) => {
      if (!roomDoc.exists()) {
        setChatRoom(null);
        if (isEmbedded) {
          onEmbeddedBack?.();
        } else {
          navigate(getAppEntryPath(), { replace: true });
        }
        return;
      }

      const data = roomDoc.data();
      // メモルームの場合はメモページにリダイレクト
      if (data.type === 'memo') {
        if (isEmbedded) {
          onEmbeddedBack?.();
        } else {
          navigate(`/memo/${roomId}`, { replace: true });
        }
        return;
      }
      setChatRoom({
        id: roomDoc.id,
        ...data,
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate()
      } as ChatRoom);
    });

    return () => unsubscribe();
  }, [isEmbedded, navigate, onEmbeddedBack, roomId]);

  // 検索からのジャンプ対応（searchParamsが変わった時のみ）
  const handledJumpRef = useRef<string | null>(null);
  useEffect(() => {
    const targetMessageId = searchParams.get('messageId');
    if (targetMessageId && targetMessageId !== handledJumpRef.current && messages.length > 0) {
      const targetElement = document.getElementById(`message-${targetMessageId}`);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetElement.classList.add(styles.highlighted);
        setTimeout(() => {
          targetElement.classList.remove(styles.highlighted);
        }, HIGHLIGHT_DURATION);
        handledJumpRef.current = targetMessageId;
      }
    }
  }, [searchParams, messages]);

  // 既読書き込み + 最初の未読 ID 取得（hook 化）
  const { getFirstUnreadMessageId } = useReadReceipt({ roomId, messages, currentUser });

  // 未読位置ジャンプ済みフラグ
  const hasJumpedToUnreadRef = useRef(false);

  // ルーム変更時のフラグリセット
  useEffect(() => {
    hasJumpedToUnreadRef.current = false;
    setPendingFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [roomId]);

  // 未読位置への自動ジャンプ
  useEffect(() => {
    // URLパラメータでのジャンプがある場合はスキップ
    const targetMessageId = searchParams.get('messageId');
    if (targetMessageId) return;

    // 既にジャンプ済みならスキップ
    if (hasJumpedToUnreadRef.current) return;

    // メッセージ読み込み完了を待つ
    if (messages.length === 0) return;

    const firstUnreadId = getFirstUnreadMessageId();

    if (firstUnreadId) {
      // 少し遅延させてDOMの描画完了を待つ
      setTimeout(() => {
        const targetElement = document.getElementById(`message-${firstUnreadId}`);
        if (targetElement) {
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetElement.classList.add(styles.highlighted);
          setTimeout(() => {
            targetElement.classList.remove(styles.highlighted);
          }, HIGHLIGHT_DURATION);
        }
      }, 100);

      hasJumpedToUnreadRef.current = true;
    }
  }, [messages, searchParams, getFirstUnreadMessageId]);

  // 初回読み込み時のみ最下部にスクロール
  const initialScrollDoneRef = useRef(false);

  // ルーム切替時にスクロール関連の記憶をリセット。
  // 漏れると別ルームで初回スクロールが走らず、新着件数も誤検出する
  useEffect(() => {
    initialScrollDoneRef.current = false;
    previousMessagesRef.current = [];
    isAtBottomRef.current = true;
    setIsAtBottom(true);
    setNewMessageCount(0);
  }, [roomId]);

  useEffect(() => {
    const arrivingMessages = getArrivingMessages(previousMessagesRef.current, messages);
    previousMessagesRef.current = messages;
    if (!isAtBottomRef.current) {
      const receivedCount = arrivingMessages.filter((message) => message.senderId !== currentUser?.uid).length;
      if (receivedCount > 0) setNewMessageCount((count) => count + receivedCount);
    }
    // 検索パラメータがある場合はスクロールしない
    if (searchParams.get('messageId')) return;

    if (!initialScrollDoneRef.current && messages.length > 0) {
      // 初回読み込み時
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }, 100);
      initialScrollDoneRef.current = true;
    } else if (arrivingMessages.length > 0) {
      // 新着での自動スクロールは「最下部にいる」か「自分の送信」のときだけ。
      // 過去ログ閲覧中まで強制スクロールすると「N件の新着」ボタンが機能しない
      const hasOwnNewMessage = arrivingMessages.some((message) => message.senderId === currentUser?.uid);
      if (isAtBottomRef.current || hasOwnNewMessage) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        setNewMessageCount(0);
      }
    }

  }, [messages, currentUser, searchParams]);


  // メッセージ入力でメンション検出
  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNewMessage(value);

    if (value.trim()) {
      void setTyping();
    } else {
      void clearTyping();
    }

    // テキストエリアの高さを自動調整
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;

    // @の後の文字列を検出
    const mentionMatch = value.match(/@(\S*)$/);
    if (mentionMatch) {
      setMentionFilter(mentionMatch[1].toLowerCase());
      setShowMentionList(true);
    } else {
      setShowMentionList(false);
    }
  };

  // メンションを挿入
  const insertMention = (userName: string) => {
    const mentionText = `@${userName} `;
    const newText = newMessage.replace(/@\S*$/, mentionText);
    setNewMessage(newText);
    setShowMentionList(false);
    messageInputRef.current?.focus();
  };

  // メンション対象のユーザーをフィルタ
  const getFilteredMembers = () => {
    if (!chatRoom) return [];
    return Object.entries(chatRoom.memberDetails)
      .filter(([uid, details]) =>
        uid !== currentUser?.uid &&
        details.displayName.toLowerCase().includes(mentionFilter)
      )
      .map(([uid, details]) => ({ uid, ...details }));
  };

  // メッセージからメンションを抽出
  const extractMentions = (text: string): string[] => {
    if (!chatRoom) return [];
    // \S+ の正規表現では空白を含む表示名が途中で切れて解決できないため、
    // 「@表示名」がそのまま本文に含まれるかで判定する
    return Object.entries(chatRoom.memberDetails)
      .filter(([, details]) => details.displayName && text.includes(`@${details.displayName}`))
      .map(([uid]) => uid);
  };

  // 失敗した楽観的メッセージを再送（H-2）
  async function retryFailedMessage(failed: ExtendedMessage) {
    if (!currentUser || !roomId) return;
    // 旧 pending を破棄してから本文を入力欄に戻し再送（メンションも再計算）
    dismissOptimistic(failed.id);
    setNewMessage(failed.text);
    setReplyingTo(null);
    // textarea にフォーカス
    setTimeout(() => messageInputRef.current?.focus(), 0);
  }

  // メッセージを送信（H-2: 楽観的更新で即時表示）
  async function sendMessage() {
    const text = newMessage.trim();
    const filesToSend = [...pendingFiles];
    if ((!text && filesToSend.length === 0) || !currentUser || !roomId || sending) return;

    setSending(true);
    try {
    const mentions = text ? extractMentions(newMessage) : [];
    const replyToSnapshot = replyingTo
      ? {
          messageId: replyingTo.id,
          text: replyingTo.text.substring(0, 50) + (replyingTo.text.length > 50 ? '...' : ''),
          senderName: replyingTo.senderName,
        }
      : null;

    let sentAnything = false;

    if (text) {
      // (1) 本文はローカルで即時表示（送信中フラグ付き）
      const localId = addOptimistic({
        chatRoomId: roomId,
        senderId: currentUser.uid,
        senderName: currentUser.displayName || 'Unknown',
        senderPhotoURL: currentUser.photoURL,
        text,
        imageURL: null,
        fileURL: null,
        storagePath: null,
        fileSize: null,
        fileName: null,
        fileType: null,
        readBy: [currentUser.uid],
        createdAt: new Date(),
        isEdited: false,
        isDeleted: false,
        reactions: {},
        reactionsByUser: {},
        replyTo: replyToSnapshot,
        isPinned: false,
        mentions,
      });

      // (2) 本文は従来どおり、送信完了を待たずに入力欄からクリアする
      setNewMessage('');
      if (messageInputRef.current) messageInputRef.current.style.height = 'auto';

      try {
        const messageData: Record<string, unknown> = {
          chatRoomId: roomId,
          senderId: currentUser.uid,
          senderName: currentUser.displayName || 'Unknown',
          senderPhotoURL: currentUser.photoURL,
          text,
          imageURL: null,
          fileURL: null,
          storagePath: null,
          fileSize: null,
          fileName: null,
          fileType: null,
          readBy: [currentUser.uid],
          createdAt: serverTimestamp(),
          isEdited: false,
          isDeleted: false,
          reactions: {},
          reactionsByUser: {},
          replyTo: replyToSnapshot,
          isPinned: false,
          mentions,
        };

        await addDoc(collection(db, 'chatRooms', roomId, 'messages'), messageData);
        await updateDoc(doc(db, 'chatRooms', roomId), {
          lastMessage: {
            text,
            senderId: currentUser.uid,
            senderName: currentUser.displayName || 'Unknown',
            timestamp: serverTimestamp(),
          },
          updatedAt: serverTimestamp(),
        });
        confirmOptimistic(localId);
        sentAnything = true;
      } catch (error) {
        console.error('メッセージ送信エラー:', error);
        failOptimistic(localId);
        showToast('error', 'メッセージの送信に失敗しました');
      }
    }

    if (filesToSend.length > 0) {
      const filesSent = await uploadFiles(filesToSend, replyToSnapshot);
      if (filesSent) {
        setPendingFiles([]);
        sentAnything = true;
      }
    }

    if (sentAnything) {
      setReplyingTo(null);
      await clearTyping();
    }
    } finally {
      setSending(false);
    }
  }

  // メッセージを編集
  async function saveEdit(messageId: string) {
    if (!editText.trim() || !roomId) return;

    try {
      await updateDoc(doc(db, 'chatRooms', roomId, 'messages', messageId), {
        text: editText.trim(),
        isEdited: true
      });
      setEditingMessageId(null);
      setEditText('');
    } catch (error) {
      console.error('メッセージ編集エラー:', error);
      showToast('error', 'メッセージの編集に失敗しました');
    }
  }

  // メッセージを削除（H-8: 5 秒以内なら Undo 可能）
  async function deleteMessage(messageId: string) {
    if (!roomId) return;
    const targetMessage = messages.find((message) => message.id === messageId);

    // 確認モーダルとメニューを閉じる
    setShowDeleteConfirmMessage(null);
    setShowMessageMenu(null);

    // ローカルで非表示にする（5 秒後に Firestore に反映）
    setPendingDeleteIds((prev) => {
      const next = new Set(prev);
      next.add(messageId);
      return next;
    });

    // 既存のタイマーがあれば一度クリア（誤って複数回呼ばれた時の保険）
    const existingTimer = pendingDeleteTimersRef.current.get(messageId);
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer);
    }

    const commitDelete = async () => {
      pendingDeleteTimersRef.current.delete(messageId);
      try {
        if (targetMessage?.storagePath) {
          const messageRef = doc(db, 'chatRooms', roomId, 'messages', messageId);
          const usedLegacyRules = await updateMessageWithAttachmentCompat(messageRef, {
            text: '',
            isDeleted: true,
            attachmentState: 'deleting',
            attachmentOperationId: crypto.randomUUID(),
            updatedAt: serverTimestamp(),
          });
          if (usedLegacyRules) {
            // 旧ルール環境では cleanupDeletingAttachment が実体を消さないため、
            // 旧実装どおりクライアントから削除して参照も外す
            await deleteObject(ref(storage, targetMessage.storagePath)).catch((error) => {
              if (error?.code !== 'storage/object-not-found') {
                console.error('添付削除エラー（旧ルール互換モード）:', error);
              }
            });
            await updateDoc(messageRef, {
              imageURL: null,
              fileURL: null,
              storagePath: null,
              fileSize: null,
            });
          }
        } else {
          await updateDoc(doc(db, 'chatRooms', roomId, 'messages', messageId), {
            text: '',
            isDeleted: true,
            imageURL: null,
            fileURL: null,
            storagePath: null,
            fileSize: null,
          });
        }

        // 反映後は非表示を解除し、他ユーザーと同じ「削除されました」表示に揃える
        setPendingDeleteIds((prev) => {
          const next = new Set(prev);
          next.delete(messageId);
          return next;
        });
      } catch (error) {
        console.error('メッセージ削除エラー:', error);
        // 失敗したら非表示状態を解除して再表示
        setPendingDeleteIds((prev) => {
          const next = new Set(prev);
          next.delete(messageId);
          return next;
        });
        showToast('error', 'メッセージの削除に失敗しました');
      }
    };

    const timer = window.setTimeout(() => {
      void commitDelete();
    }, 5000);
    pendingDeleteTimersRef.current.set(messageId, timer);

    // 「元に戻す」トースト
    showToast('success', 'メッセージを削除しました', 5000, {
      label: '元に戻す',
      onClick: () => {
        const t = pendingDeleteTimersRef.current.get(messageId);
        if (t !== undefined) {
          window.clearTimeout(t);
          pendingDeleteTimersRef.current.delete(messageId);
        }
        setPendingDeleteIds((prev) => {
          const next = new Set(prev);
          next.delete(messageId);
          return next;
        });
      },
    });
  }

  function openDeleteMessageConfirm(messageId: string) {
    setShowDeleteConfirmMessage(messageId);
    setShowMessageMenu(null);
  }

  // リアクションを追加（リアクションピッカーから）
  async function addReaction(messageId: string, emoji: string) {
    if (!currentUser || !roomId) return;

    try {
      await updateDoc(doc(db, 'chatRooms', roomId, 'messages', messageId), {
        [`reactionsByUser.${currentUser.uid}`]: arrayUnion(emoji)
      });
      setShowReactionPicker(null);
      setShowSecondaryReactions(false);
    } catch (error) {
      console.error('リアクション追加エラー:', error);
    }
  }

  // リアクションを削除（詳細モーダルから）
  async function removeReaction(messageId: string, emoji: string) {
    if (!currentUser || !roomId) return;

    try {
      await updateDoc(doc(db, 'chatRooms', roomId, 'messages', messageId), {
        [`reactionsByUser.${currentUser.uid}`]: arrayRemove(emoji)
      });
      setShowReactionDetail(null);
    } catch (error) {
      console.error('リアクション削除エラー:', error);
    }
  }

  // リアクション詳細を表示
  function showReactionUsers(messageId: string, emoji: string, userIds: string[]) {
    setShowReactionDetail({ messageId, emoji, users: userIds });
  }

  // ユーザーIDから表示名を取得
  function getUserDisplayName(userId: string): string {
    if (userId === currentUser?.uid) {
      return currentUser.displayName || 'あなた';
    }
    if (chatRoom?.memberDetails[userId]) {
      return chatRoom.memberDetails[userId].displayName;
    }
    const user = users.find(u => u.uid === userId);
    return user?.displayName || '不明なユーザー';
  }

  // メッセージテキストをコピー
  async function copyMessageText(text: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showToast('success', 'コピーしました');
      setShowMessageMenu(null);
    } catch {
      // フォールバック: execCommand
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      showToast('success', 'コピーしました');
      setShowMessageMenu(null);
    }
  }

  // ピン留め/解除
  async function togglePin(messageId: string) {
    if (!roomId) return;

    const message = messages.find(m => m.id === messageId);
    if (!message) return;

    try {
      await updateDoc(doc(db, 'chatRooms', roomId, 'messages', messageId), {
        isPinned: !message.isPinned
      });
      setShowMessageMenu(null);
    } catch (error) {
      console.error('ピン留めエラー:', error);
    }
  }

  // グループ編集モーダルを開く
  function openGroupEdit() {
    if (!chatRoom || chatRoom.type !== 'group') return;
    setEditGroupName(chatRoom.name);
    setEditGroupImage(chatRoom.photoURL || null);
    setSavingGroup(false);
    setShowGroupEdit(true);
  }

  function handleGroupEditSaved(updated: { name: string; photoURL: string | null }) {
    setChatRoom((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        name: updated.name,
        photoURL: updated.photoURL
      };
    });
    setEditGroupName(updated.name);
    setEditGroupImage(updated.photoURL);
    setShowGroupEdit(false);
  }

  // 招待モーダルを開く
  function openInviteModal() {
    setInviteSelectedUsers([]);
    setShowInvite(true);
    void fetchUsers();
  }

  // メンバーを招待
  async function handleInviteMembers() {
    if (!roomId || !chatRoom || inviteSelectedUsers.length === 0) return;

    const currentSelectedUsers = [...inviteSelectedUsers];

    try {
      const { memberDetails } = await inviteMembers(roomId, chatRoom);

      setChatRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          members: Array.from(new Set([...prev.members, ...currentSelectedUsers])),
          memberDetails
        };
      });

      setShowInvite(false);
    } catch (error) {
      console.error('メンバー招待エラー:', error);
      showToast('error', 'メンバーの招待に失敗しました');
    }
  }

  // グループから退出
  async function leaveRoom() {
    if (!roomId || !chatRoom || !currentUser) return;
    if (chatRoom.type === 'direct' || chatRoom.type === 'memo') return;

    try {
      const roomRef = doc(db, 'chatRooms', roomId);
      await updateDoc(roomRef, {
        members: arrayRemove(currentUser.uid),
        [`memberDetails.${currentUser.uid}`]: deleteField()
      });

      setShowLeaveConfirm(false);
      if (isEmbedded) {
        onEmbeddedBack?.();
      } else {
        navigate(getAppEntryPath());
      }
      showToast('success', 'グループから退出しました');
    } catch (error) {
      console.error('グループ退出エラー:', error);
      showToast('error', '退出に失敗しました');
    }
  }

  async function handleDeleteRoom() {
    if (!roomId || !chatRoom || isDeletingRoom) return;
    if (!canDeleteChatRoom(chatRoom, currentUser?.uid)) {
      showToast('error', 'このルームを削除する権限がありません');
      return;
    }

    setIsDeletingRoom(true);
    try {
      const result = await deleteChatRoom(roomId);
      setShowDeleteRoomConfirm(false);
      if (isEmbedded) {
        onEmbeddedBack?.();
      } else {
        navigate(getAppEntryPath(), { replace: true });
      }
      showToast('success', result.status === 'already-deleted' ? 'ルームはすでに削除されています' : 'ルームを削除しました');
    } catch (error) {
      console.error('チャットルーム削除エラー:', error);
      const code = (error as { code?: string }).code ?? '';
      showToast('error', code.includes('permission-denied')
        ? 'このルームを削除する権限がありません'
        : 'ルームの完全削除に失敗しました。もう一度お試しください');
    } finally {
      setIsDeletingRoom(false);
    }
  }

  // ファイルは選択時点では送信せず、送信ボタンが押されるまで入力欄に保持する。
  function queueFiles(files: File[]) {
    if (files.length === 0) return;
    const nextFiles = [...pendingFiles, ...files];
    const validation = validatePendingAttachments(nextFiles, MAX_FILE_SIZE);
    if (!validation.valid) {
      const sizeMB = (validation.size / (1024 * 1024)).toFixed(1);
      if (validation.reason === 'file-too-large') {
        showToast('warning', `ファイル「${validation.fileName}」のサイズが制限を超えています。\n\nファイルサイズ: ${sizeMB}MB\n制限: 25MB\n\n25MB以下のファイルを選択してください。`);
      } else {
        showToast('warning', `保留中のファイル合計が制限を超えています。\n\n合計サイズ: ${sizeMB}MB\n制限: 25MB\n\n合計25MB以下になるようにファイルを選択してください。`);
      }
      return;
    }
    setPendingFiles(nextFiles);
  }

  function handleFileSelection(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    queueFiles(files);
    e.target.value = '';
  }

  function handleMessagePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (sending || uploading) return;
    const imageFiles = getClipboardImageFiles(Array.from(e.clipboardData.items));
    if (imageFiles.length === 0) return;

    // 画像貼り付け時にブラウザ固有の代替テキストやHTMLが入力されないようにする。
    e.preventDefault();
    queueFiles(imageFiles);
  }

  function removePendingFile(index: number) {
    if (sending) return;
    setPendingFiles((files) => files.filter((_, fileIndex) => fileIndex !== index));
  }

  // 送信ボタン押下後に、保留していたファイルを順番に送信する。
  const uploadFiles = async (
    files: File[],
    replyToSnapshot: ExtendedMessage['replyTo'],
  ): Promise<boolean> => {
    if (!currentUser || !roomId) return false;
    setUploadProgress({ current: 0, total: files.length });
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress({ current: i + 1, total: files.length });
        let fileToUpload = file;
        const isImage = isImageFile(file);

        // 画像の場合は圧縮
        if (isImage) {
          fileToUpload = await compressImage(file);
        }

        const timestamp = Date.now();
        const filePath = `chatFiles/${roomId}/${timestamp}/${file.name}`;
        const storageRef = ref(storage, filePath);
        const operationId = crypto.randomUUID();
        const messageRef = doc(collection(db, 'chatRooms', roomId, 'messages'));
        const messageData = {
          chatRoomId: roomId,
          senderId: currentUser.uid,
          senderName: currentUser.displayName || 'Unknown',
          senderPhotoURL: currentUser.photoURL,
          text: isImage ? '' : `ファイル: ${file.name}`,
          imageURL: null,
          fileURL: null,
          storagePath: filePath,
          fileSize: null,
          fileName: file.name,
          fileType: file.type,
          readBy: [currentUser.uid],
          createdAt: serverTimestamp(),
          isEdited: false,
          isDeleted: false,
          reactions: {},
          reactionsByUser: {},
          replyTo: replyToSnapshot ?? null,
          isPinned: false,
          mentions: [],
          attachmentState: 'uploading',
          attachmentOperationId: operationId,
        };

        await setDoc(messageRef, messageData);
        try {
          await uploadBytes(storageRef, fileToUpload, {
            cacheControl: 'public, max-age=604800',
            contentType: fileToUpload.type || 'application/octet-stream',
          });
          const downloadURL = await getDownloadURL(storageRef);
          await updateMessageWithAttachmentCompat(messageRef, {
            imageURL: isImage ? downloadURL : null,
            fileURL: isImage ? null : downloadURL,
            storagePath: filePath,
            fileSize: fileToUpload.size,
            attachmentState: 'ready',
            attachmentError: deleteField(),
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          await deleteObject(storageRef).catch((cleanupError) => {
            if (cleanupError?.code !== 'storage/object-not-found') {
              console.error('アップロード補償削除エラー:', cleanupError);
            }
          });
          await updateMessageWithAttachmentCompat(messageRef, {
            imageURL: null,
            fileURL: null,
            storagePath: null,
            fileSize: null,
            attachmentState: 'failed',
            attachmentError: 'upload-or-finalize-failed',
            updatedAt: serverTimestamp(),
          }).catch(() => undefined);
          throw error;
        }

        await updateDoc(doc(db, 'chatRooms', roomId), {
          lastMessage: {
            text: isImage ? '画像を送信しました' : `ファイル: ${file.name}`,
            senderId: currentUser.uid,
            senderName: currentUser.displayName || 'Unknown',
            timestamp: serverTimestamp()
          },
          updatedAt: serverTimestamp()
        });
      }
      return true;
    } catch (error) {
      console.error('ファイルアップロードエラー:', error);
      showToast('error', 'ファイルの送信に失敗しました');
      return false;
    } finally {
      setUploadProgress(null);
    }
  };

  // ドラッグ&ドロップハンドラ
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      queueFiles(files);
    }
  };

  // 時刻のフォーマット（L-1: 当日/当年/それ以前で分岐）


  // 既読表示
  function getReadStatus(message: ExtendedMessage): string {
    if (chatRoom?.type === 'memo') return '';
    if (message.senderId !== currentUser?.uid) return '';
    const readCount = message.readBy.length - 1;
    if (readCount === 0) return '';
    if (chatRoom?.type === 'direct') {
      return '既読';
    }
    // L-5: 「既読 N」→「N人が既読」で読みやすく
    return `${readCount}人が既読`;
  }

  // メニュー表示位置を計算（上下 + 左右）。判定ロジックは lib/chat/menuPosition.ts
  function calculateMenuPosition(messageId: string): {
    vertical: 'above' | 'below';
    horizontal: 'left' | 'right';
  } {
    const element = document.getElementById(`message-${messageId}`);
    if (!element) return { vertical: 'above', horizontal: 'left' };

    return resolveMenuPosition(element.getBoundingClientRect(), window.innerWidth);
  }

  // ピン留めされたメッセージを取得
  const pinnedMessages = messages.filter(m => m.isPinned);
  const firstUnreadMessageId = getFirstUnreadMessageId();
  const invitableUsers = getInvitableUsers(chatRoom, users);
  const desktopVisibleRooms = desktopChatRooms.filter((room) => room.type !== 'memo');
  const desktopMemoRoom = desktopChatRooms.find((room) => room.type === 'memo');
  const desktopMemoReturnPath = `${location.pathname}${location.search}`;
  const desktopAttachments = useMemo(
    () => messages
      .filter((message) => Boolean(message.fileURL || message.imageURL))
      .slice(-12)
      .reverse(),
    [messages],
  );

  function openScheduleFromMessage(message: ExtendedMessage) {
    setScheduleDraft(createScheduleFormFromMessage(message));
    setScheduleDraftUserIds([]);
  }

  function openTaskFromMessage(message: ExtendedMessage) {
    const project = selectedTaskProject ?? activeProjects[0] ?? null;
    if (!project) {
      showToast('warning', 'タスク作成先のプロジェクトがありません');
      return;
    }
    setTaskProjectId(project?.id ?? '');
    setTaskDraftMessage(message);
  }

  async function saveScheduleDraft() {
    if (!scheduleDraft) return;
    if (!scheduleDraft.title.trim()) {
      showToast('warning', 'タイトルを入力してください');
      return;
    }
    if (!scheduleDraft.categoryId) {
      showToast('warning', 'カテゴリを選択してください');
      return;
    }
    if (!scheduleDraft.startDate) {
      showToast('warning', '開始日を入力してください');
      return;
    }
    const startAt = buildDate(scheduleDraft.startDate, scheduleDraft.startTime, scheduleDraft.allDay);
    const endAt = scheduleDraft.endDate
      ? buildDate(scheduleDraft.endDate, scheduleDraft.endTime, scheduleDraft.allDay, true)
      : null;
    if (!isValidDate(startAt) || (endAt && !isValidDate(endAt))) {
      showToast('warning', '日付が正しくありません');
      return;
    }
    if (endAt && endAt < startAt) {
      showToast('warning', '終了日は開始日以降にしてください');
      return;
    }

    setScheduleDraftSaving(true);
    try {
      const targetUsers = scheduleTargetUsers.filter((user) => scheduleDraftUserIds.includes(user.uid));
      await createSchedule({
        title: scheduleDraft.title.trim(),
        categoryId: scheduleDraft.categoryId,
        targetUserIds: scheduleDraftUserIds,
        targetUserNames: targetUsers.map((user) => user.displayName),
        startAt,
        endAt,
        allDay: scheduleDraft.allDay,
        memo: scheduleDraft.memo.trim(),
        notification: { enabled: false, timings: [], customAt: null },
      });
      showToast('success', 'チャットから予定を追加しました');
      setScheduleDraft(null);
      setScheduleDraftUserIds([]);
    } catch (error) {
      console.error('チャットから予定作成エラー:', error);
      showToast('error', '予定の作成に失敗しました');
    } finally {
      setScheduleDraftSaving(false);
    }
  }

  function currentTaskInitialInput(): TaskInput | undefined {
    if (!taskDraftMessage || !selectedTaskProject) return undefined;
    const columnId = selectedTaskProject.columns[0]?.id ?? 'todo';
    return createTaskInputFromMessage(taskDraftMessage, columnId);
  }

  function handleBackToRooms() {
    if (isEmbedded) {
      onEmbeddedBack?.();
      return;
    }
    navigate(getAppEntryPath());
  }

  if (roomId && loading) {
    return <div className={`${styles.loading} ${isEmbedded ? styles.embeddedLoading : ''}`}>読み込み中...</div>;
  }

  if (!roomId && isElectronCompact) {
    return (
      <div ref={chatContainerRef} className={styles.electronCompactChatList}>
        <DesktopRoomPane
          rooms={desktopVisibleRooms}
          activeRoomId={undefined}
          currentUserId={currentUser?.uid}
          users={users}
          isRoomMuted={isRoomMuted}
          memoRoom={desktopMemoRoom}
          memoReturnPath={desktopMemoReturnPath}
          onOpenSearch={() => setDesktopSearchOpen(true)}
          onOpenSettings={() => setDesktopSettingsOpen(true)}
          onOpenNewChat={() => setDesktopNewChatOpen(true)}
          compactMode
        />
        <DesktopUtilityModals
          currentUser={currentUser}
          chatRooms={desktopChatRooms}
          searchOpen={desktopSearchOpen}
          settingsOpen={desktopSettingsOpen}
          onCloseSearch={() => setDesktopSearchOpen(false)}
          onCloseSettings={() => setDesktopSettingsOpen(false)}
          onOpenSettings={() => setDesktopSettingsOpen(true)}
        />
        <DesktopNewChatModals
          currentUser={currentUser}
          chatRooms={desktopChatRooms}
          isOpen={desktopNewChatOpen}
          onClose={() => setDesktopNewChatOpen(false)}
        />
      </div>
    );
  }

  if (!roomId) {
    return (
      <div
        ref={chatContainerRef}
        className={`${styles.container} ${desktopSidePanelOpen ? styles.withDesktopSidePanel : ''}`}
        style={desktopChatLayoutStyle}
      >
        <DesktopRoomPane
          rooms={desktopVisibleRooms}
          activeRoomId={undefined}
          currentUserId={currentUser?.uid}
          users={users}
          isRoomMuted={isRoomMuted}
          memoRoom={desktopMemoRoom}
          memoReturnPath={desktopMemoReturnPath}
          onOpenSearch={() => setDesktopSearchOpen(true)}
          onOpenSettings={() => setDesktopSettingsOpen(true)}
          onOpenNewChat={() => setDesktopNewChatOpen(true)}
        />
        {desktopRoomPaneResizeHandle}
        <DesktopChatLanding
          rooms={desktopVisibleRooms}
          currentUserId={currentUser?.uid}
          users={users}
          showSummary={desktopSidePanelOpen}
          onOpenNewChat={() => setDesktopNewChatOpen(true)}
          onOpenSummary={() => setDesktopSidePanelOpen(true)}
          onCloseSummary={() => setDesktopSidePanelOpen(false)}
        />
        <DesktopUtilityModals
          currentUser={currentUser}
          chatRooms={desktopChatRooms}
          searchOpen={desktopSearchOpen}
          settingsOpen={desktopSettingsOpen}
          onCloseSearch={() => setDesktopSearchOpen(false)}
          onCloseSettings={() => setDesktopSettingsOpen(false)}
          onOpenSettings={() => setDesktopSettingsOpen(true)}
        />
        <DesktopNewChatModals
          currentUser={currentUser}
          chatRooms={desktopChatRooms}
          isOpen={desktopNewChatOpen}
          onClose={() => setDesktopNewChatOpen(false)}
        />
      </div>
    );
  }

  return (
    <div
      ref={chatContainerRef}
      className={isEmbedded
        ? `${styles.container} ${styles.embeddedChatContainer}`
        : `${styles.container} ${desktopSidePanelOpen ? styles.withDesktopSidePanel : ''}`}
      style={isEmbedded ? undefined : desktopChatLayoutStyle}
    >
      {/* M-9: D&D は入力エリア周辺ゾーンに限定（メッセージ閲覧中の誤操作を防止） */}

      {!isEmbedded && (
        <>
          <DesktopRoomPane
            rooms={desktopVisibleRooms}
            activeRoomId={roomId}
            currentUserId={currentUser?.uid}
            users={users}
            isRoomMuted={isRoomMuted}
            memoRoom={desktopMemoRoom}
            memoReturnPath={desktopMemoReturnPath}
            onOpenSearch={() => setDesktopSearchOpen(true)}
            onOpenSettings={() => setDesktopSettingsOpen(true)}
            onOpenNewChat={() => setDesktopNewChatOpen(true)}
          />
          {desktopRoomPaneResizeHandle}
        </>
      )}

      <main className={`${styles.chatMainPane} ${isEmbedded ? styles.embeddedChatMainPane : ''}`}>

      {/* ヘッダー */}
      <header className={`${styles.header} ${isEmbedded ? styles.embeddedHeader : ''}`}>
        <button
          className={styles.backButton}
          onClick={handleBackToRooms}
          aria-label={isEmbedded ? 'チャット一覧へ戻る' : '戻る'}
          title={isEmbedded ? 'チャット一覧へ戻る' : '戻る'}
        >
          <span aria-hidden="true">←</span>
          <span className={styles.headerActionLabel}>{isEmbedded ? 'チャット一覧' : '戻る'}</span>
        </button>
        <div className={styles.roomInfo}>
          <div className={styles.roomNameContainer}>
            <h1 className={styles.roomName}>
              {chatRoom?.type === 'memo' && <span style={{ marginRight: 6 }}>&#128221;</span>}
              {chatRoom ? getRoomDisplayName(chatRoom, currentUser?.uid) : ''}
            </h1>
          </div>
          {chatRoom?.type === 'direct' && otherUserId && (
            <span className={onlineStatusMap[otherUserId] ? styles.statusOnline : styles.statusOffline}>
              {onlineStatusMap[otherUserId] ? 'オンライン' : 'オフライン'}
            </span>
          )}
          {chatRoom?.type === 'group' && (
            <span className={styles.memberCount}>
              {chatRoom.members.length}人のメンバー
            </span>
          )}
        </div>
        {!isEmbedded && (
          <>
        {chatRoom?.type === 'group' && (
          <>
            <button
              className={styles.memberListButton}
              onClick={() => setShowMemberList(true)}
              title="メンバー一覧"
              aria-label="メンバー一覧"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span className={styles.headerActionLabel}>メンバー</span>
            </button>
            <button
              className={styles.editGroupButton}
              onClick={openGroupEdit}
              title="グループを編集"
              aria-label="グループを編集"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              <span className={styles.headerActionLabel}>編集</span>
            </button>
            <button
              className={styles.inviteButton}
              onClick={openInviteModal}
              title="メンバーを招待"
              aria-label="メンバーを招待"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="20" y1="8" x2="20" y2="14" />
                <line x1="23" y1="11" x2="17" y2="11" />
              </svg>
              <span className={styles.headerActionLabel}>招待</span>
            </button>
          </>
        )}
        {pinnedMessages.length > 0 && (
          <button
            className={styles.pinButton}
            onClick={() => setShowPinnedMessages(!showPinnedMessages)}
            title="ピン留めメッセージ"
            aria-label="ピン留めメッセージ"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
            </svg>
            <span className={styles.pinCount}>{pinnedMessages.length}</span>
            <span className={styles.headerActionLabel}>ピン</span>
          </button>
        )}
        <button
          className={`${styles.desktopPanelToggle} ${desktopSidePanelOpen ? styles.active : ''}`}
          onClick={() => setDesktopSidePanelOpen((open) => !open)}
          title={desktopSidePanelOpen ? 'ルーム情報を閉じる' : 'ルーム情報を開く'}
          aria-label={desktopSidePanelOpen ? 'ルーム情報を閉じる' : 'ルーム情報を開く'}
          aria-expanded={desktopSidePanelOpen}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
          <span className={styles.headerActionLabel}>情報</span>
        </button>
        {chatRoom && canDeleteChatRoom(chatRoom, currentUser?.uid) && (
          <button
            className={styles.deleteRoomButton}
            onClick={() => setShowDeleteRoomConfirm(true)}
            title="ルームを削除"
            aria-label="ルームを削除"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            <span className={styles.headerActionLabel}>削除</span>
          </button>
        )}
        {roomId && (
          <button
            className={`${styles.notificationToggle} ${isRoomMuted(roomId) ? styles.muted : ''}`}
            onClick={async () => {
              // M-29: ミュート操作後にトースト表示
              const wasMuted = isRoomMuted(roomId);
              await toggleMute(roomId);
              showToast('success', wasMuted ? '通知をオンにしました' : '通知をオフにしました');
            }}
            title={isRoomMuted(roomId) ? '通知をオンにする' : '通知をオフにする'}
            aria-label={isRoomMuted(roomId) ? '通知をオンにする' : '通知をオフにする'}
          >
            {isRoomMuted(roomId) ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
                <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
                <path d="M18 8a6 6 0 0 0-9.33-5" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            )}
            <span className={styles.headerActionLabel}>{isRoomMuted(roomId) ? '通知オン' : '通知オフ'}</span>
          </button>
        )}
          </>
        )}
      </header>

      {/* ピン留めメッセージ表示 */}
      {showPinnedMessages && pinnedMessages.length > 0 && (
        <div className={styles.pinnedSection}>
          <div className={styles.pinnedHeader}>
            <span>ピン留めメッセージ</span>
            <button onClick={() => setShowPinnedMessages(false)} aria-label="ピン留め一覧を閉じる">×</button>
          </div>
          {pinnedMessages.map(msg => (
            <div
              key={msg.id}
              className={styles.pinnedItem}
              onClick={() => {
                const element = document.getElementById(`message-${msg.id}`);
                element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setShowPinnedMessages(false);
              }}
            >
              <span className={styles.pinnedSender}>{msg.senderName}</span>
              <p className={styles.pinnedText}>{msg.text}</p>
            </div>
          ))}
        </div>
      )}

      {/* メッセージ一覧 */}
      {/* メッセージ一覧（本体は components/chat/ChatMessageList.tsx） */}
      <ChatMessageList
        messages={messages}
        pendingDeleteIds={pendingDeleteIds}
        firstUnreadMessageId={firstUnreadMessageId}
        currentUser={currentUser}
        chatRoom={chatRoom}
        loadingMore={loadingMore}
        messageListRef={messageListRef}
        messagesEndRef={messagesEndRef}
        messageInputRef={messageInputRef}
        onScroll={handleScrollEnhanced}
        getReadStatus={getReadStatus}
        calculateMenuPosition={calculateMenuPosition}
        menuPosition={menuPosition}
        setMenuPosition={setMenuPosition}
        showMessageMenu={showMessageMenu}
        setShowMessageMenu={setShowMessageMenu}
        showReactionPicker={showReactionPicker}
        setShowReactionPicker={setShowReactionPicker}
        showSecondaryReactions={showSecondaryReactions}
        setShowSecondaryReactions={setShowSecondaryReactions}
        editingMessageId={editingMessageId}
        setEditingMessageId={setEditingMessageId}
        editText={editText}
        setEditText={setEditText}
        setReplyingTo={setReplyingTo}
        setShowReadDetail={setShowReadDetail}
        setPreviewImage={setPreviewImage}
        copyMessageText={copyMessageText}
        openScheduleFromMessage={openScheduleFromMessage}
        openTaskFromMessage={openTaskFromMessage}
        togglePin={togglePin}
        openDeleteMessageConfirm={openDeleteMessageConfirm}
        saveEdit={saveEdit}
        addReaction={addReaction}
        removeReaction={removeReaction}
        showReactionUsers={showReactionUsers}
        retryFailedMessage={retryFailedMessage}
        dismissOptimistic={dismissOptimistic}
        showToast={showToast}
      />

      {/* 返信プレビュー */}
      {replyingTo && (
        <div className={styles.replyingBar}>
          <div className={styles.replyingContent}>
            <span className={styles.replyingLabel}>返信: {replyingTo.senderName}</span>
            <p className={styles.replyingText}>{replyingTo.text.substring(0, 50)}{replyingTo.text.length > 50 ? '...' : ''}</p>
          </div>
          <button className={styles.cancelReply} onClick={() => setReplyingTo(null)} aria-label="返信をキャンセル">×</button>
        </div>
      )}

      {/* M-8: 新着メッセージフローティングボタン */}
      {!isAtBottom && newMessageCount > 0 && (
        <button
          type="button"
          className={styles.newMessagesButton}
          onClick={scrollToBottom}
          aria-label={`${newMessageCount} 件の新着メッセージへ移動`}
        >
          ↓ {newMessageCount} 件の新着
        </button>
      )}

      <TypingIndicator
        typing={chatRoom?.typing}
        memberDetails={chatRoom?.memberDetails}
        currentUserUid={currentUser?.uid}
      />

      {/* 入力エリア（M-9: D&D 受付ゾーン） */}
      <div
        className={styles.inputArea}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* ドラッグオーバーレイ（M-9: 入力エリア内に限定） */}
        {isDragging && (
          <div className={styles.dragOverlay}>
            <div className={styles.dragContent}>
              <p>ファイルをドロップして添付</p>
            </div>
          </div>
        )}
        {/* メンションリスト */}
        {showMentionList && getFilteredMembers().length > 0 && (
          <div className={styles.mentionList}>
            {getFilteredMembers().map(member => (
              <button
                key={member.uid}
                type="button"
                className={styles.mentionItem}
                onClick={() => insertMention(member.displayName)}
              >
                @{member.displayName}
              </button>
            ))}
          </div>
        )}
        {pendingFiles.length > 0 && (
          <div className={styles.pendingAttachments} aria-label="送信前の添付ファイル" aria-live="polite">
            {pendingFiles.map((file, index) => (
              <div className={styles.pendingAttachment} key={`${file.name}-${file.lastModified}-${index}`}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
                <span className={styles.pendingAttachmentName} title={file.name}>{file.name}</span>
                <span className={styles.pendingAttachmentSize}>
                  {file.size >= 1024 * 1024
                    ? `${(file.size / (1024 * 1024)).toFixed(1)}MB`
                    : `${Math.max(1, Math.round(file.size / 1024))}KB`}
                </span>
                <button
                  type="button"
                  className={styles.removePendingAttachment}
                  onClick={() => removePendingFile(index)}
                  disabled={sending}
                  title={`${file.name}の添付を取り消す`}
                  aria-label={`${file.name}の添付を取り消す`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelection}
          style={{ display: 'none' }}
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
        />
        <button
          type="button"
          className={styles.attachButton}
          onClick={() => fileInputRef.current?.click()}
          disabled={sending || uploading}
          title={uploadProgress ? `アップロード中 ${uploadProgress.current}/${uploadProgress.total}` : pendingFiles.length > 0 ? `ファイルを追加（${pendingFiles.length}件保留中）` : 'ファイルを添付'}
          aria-label={uploadProgress ? `アップロード中 ${uploadProgress.current}/${uploadProgress.total}` : pendingFiles.length > 0 ? `ファイルを追加（${pendingFiles.length}件保留中）` : 'ファイルを添付'}
          aria-busy={uploading}
        >
          {uploading && uploadProgress ? (
            <span className={styles.uploadingWrapper}>
              <span className={styles.uploadingSpinner} aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              </span>
              <span className={styles.uploadingProgress} aria-hidden="true">
                {uploadProgress.current}/{uploadProgress.total}
              </span>
            </span>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
          )}
        </button>
        <textarea
          ref={messageInputRef}
          value={newMessage}
          onChange={handleMessageChange}
          onPaste={handleMessagePaste}
          onKeyDown={(e) => {
            // Enter で送信、Shift+Enter で改行（IME 変換中の Enter は無視）
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing &&
              (newMessage.trim() || pendingFiles.length > 0) &&
              !sending
            ) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder="メッセージを入力... (Enterで送信 / Shift+Enterで改行)"
          className={styles.messageInput}
          disabled={sending}
          rows={1}
        />
        <button
          type="button"
          className={styles.sendButton}
          disabled={(!newMessage.trim() && pendingFiles.length === 0) || sending}
          onClick={sendMessage}
          aria-busy={sending}
          aria-label={sending ? '送信中' : '送信'}
        >
          {sending ? (
            <span className={styles.sendButtonSpinner} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            </span>
          ) : (
            '送信'
          )}
        </button>
      </div>

      </main>

      {!isEmbedded && chatRoom && (
        <DesktopRoomInfoPane
          room={chatRoom}
          currentUserId={currentUser?.uid}
          currentUserName={currentUser?.displayName}
          currentUserPhotoURL={currentUser?.photoURL}
          onlineStatusMap={onlineStatusMap}
          attachments={desktopAttachments}
          pinnedMessages={pinnedMessages}
          isOpen={desktopSidePanelOpen}
          onClose={() => setDesktopSidePanelOpen(false)}
          onInvite={openInviteModal}
          onOpenMessage={(messageId) => document.getElementById(`message-${messageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
        />
      )}

      {scheduleDraft && (
        <div className={styles.chatCreateOverlay} onClick={() => setScheduleDraft(null)} role="presentation">
          <div className={styles.chatCreateModal} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="chat-schedule-title">
            <div className={styles.chatCreateHeader}>
              <h2 id="chat-schedule-title">チャットから予定を追加</h2>
              <button type="button" onClick={() => setScheduleDraft(null)} aria-label="閉じる">×</button>
            </div>
            <label className={styles.chatCreateField}>
              <span>タイトル</span>
              <input value={scheduleDraft.title} onChange={(event) => setScheduleDraft((prev) => prev ? { ...prev, title: event.target.value } : prev)} />
            </label>
            <label className={styles.chatCreateField}>
              <span>カテゴリ</span>
              <select
                value={scheduleDraft.categoryId}
                onChange={(event) => setScheduleDraft((prev) => prev ? { ...prev, categoryId: event.target.value as ScheduleCategoryId | '' } : prev)}
              >
                <option value="" disabled>選択してください</option>
                {SCHEDULE_CATEGORIES.map((category) => (
                  <option key={category.id} value={category.id}>{category.label}</option>
                ))}
              </select>
            </label>
            <div className={styles.chatCreateGrid}>
              <label className={styles.chatCreateField}>
                <span>開始日</span>
                <input type="date" value={scheduleDraft.startDate} onChange={(event) => setScheduleDraft((prev) => prev ? { ...prev, startDate: event.target.value, endDate: event.target.value } : prev)} />
              </label>
              <label className={styles.chatCreateField}>
                <span>終了日</span>
                <input type="date" value={scheduleDraft.endDate} onChange={(event) => setScheduleDraft((prev) => prev ? { ...prev, endDate: event.target.value } : prev)} />
              </label>
            </div>
            <label className={styles.chatCreateCheck}>
              <input type="checkbox" checked={scheduleDraft.allDay} onChange={(event) => setScheduleDraft((prev) => prev ? { ...prev, allDay: event.target.checked } : prev)} />
              終日
            </label>
            <div className={styles.chatCreateField}>
              <span>対象ユーザー</span>
              <div className={styles.chatCreateUserList}>
                {scheduleTargetUsers.map((user) => (
                  <button
                    key={user.uid}
                    type="button"
                    className={scheduleDraftUserIds.includes(user.uid) ? styles.chatCreateUserSelected : ''}
                    onClick={() => setScheduleDraftUserIds((current) => (
                      current.includes(user.uid)
                        ? current.filter((id) => id !== user.uid)
                        : [...current, user.uid]
                    ))}
                  >
                    {user.displayName}
                  </button>
                ))}
                {scheduleTargetUsers.length === 0 && <span>未選択のままでも登録できます</span>}
              </div>
            </div>
            <label className={styles.chatCreateField}>
              <span>メモ</span>
              <textarea value={scheduleDraft.memo} onChange={(event) => setScheduleDraft((prev) => prev ? { ...prev, memo: event.target.value } : prev)} rows={5} />
            </label>
            <div className={styles.chatCreateActions}>
              <button type="button" onClick={() => setScheduleDraft(null)}>キャンセル</button>
              <button type="button" onClick={() => void saveScheduleDraft()} disabled={scheduleDraftSaving}>
                {scheduleDraftSaving ? '保存中...' : '予定を追加'}
              </button>
            </div>
          </div>
        </div>
      )}

      {taskDraftMessage && selectedTaskProject && (
        <>
          <div className={styles.taskProjectPicker}>
            <label>
              <span>作成先プロジェクト</span>
              <select value={selectedTaskProject.id} onChange={(event) => setTaskProjectId(event.target.value)}>
                {activeProjects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </label>
          </div>
          <TaskPanel
            key={`${taskDraftMessage.id}-${selectedTaskProject.id}`}
            task={null}
            initialInput={currentTaskInitialInput()}
            columns={selectedTaskProject.columns}
            defaultColumnId={selectedTaskProject.columns[0]?.id ?? 'todo'}
            members={processMembers}
            onSubmit={async (input) => {
              await createChatTask(input);
              showToast('success', 'チャットからタスクを追加しました');
            }}
            onClose={() => setTaskDraftMessage(null)}
          />
        </>
      )}

      {/* 画像プレビューモーダル */}
      {previewImage && (
        <ImagePreviewModal
          imageURL={previewImage.url}
          fileName={previewImage.fileName}
          onClose={() => setPreviewImage(null)}
        />
      )}

      {/* メニュー外クリックで閉じる */}
      {(showMessageMenu || showReactionPicker) && (
        <div
          className={styles.menuOverlay}
          onClick={() => {
            setShowMessageMenu(null);
            setShowReactionPicker(null);
            setShowSecondaryReactions(false);
          }}
        />
      )}

      {/* グループ編集モーダル */}
      {showGroupEdit && roomId && chatRoom?.type === 'group' && (
        <GroupEditModal
          isOpen={showGroupEdit}
          roomId={roomId}
          chatRoom={chatRoom}
          editGroupName={editGroupName}
          editGroupImage={editGroupImage}
          savingGroup={savingGroup}
          onEditGroupNameChange={setEditGroupName}
          onEditGroupImageChange={setEditGroupImage}
          onSavingGroupChange={setSavingGroup}
          onClose={() => setShowGroupEdit(false)}
          onSaved={handleGroupEditSaved}
        />
      )}

      {/* メンバー招待モーダル */}
      {showInvite && chatRoom?.type === 'group' && (
        <InviteMembersModal
          invitableUsers={invitableUsers}
          inviteSelectedUsers={inviteSelectedUsers}
          setInviteSelectedUsers={setInviteSelectedUsers}
          onInvite={handleInviteMembers}
          onClose={() => setShowInvite(false)}
        />
      )}

      {/* メンバー一覧モーダル */}
      {showMemberList && chatRoom?.type === 'group' && (
        <MemberListModal
          isOpen={showMemberList}
          chatRoom={chatRoom}
          currentUserId={currentUser?.uid}
          currentUserName={currentUser?.displayName}
          currentUserPhotoURL={currentUser?.photoURL}
          onlineStatusMap={onlineStatusMap}
          onLeave={() => {
            setShowMemberList(false);
            setShowLeaveConfirm(true);
          }}
          onClose={() => setShowMemberList(false)}
        />
      )}

      {/* リアクション詳細モーダル */}
      {showReactionDetail && (
        <ReactionDetailModal
          detail={showReactionDetail}
          chatRoom={chatRoom}
          currentUserId={currentUser?.uid}
          getUserDisplayName={getUserDisplayName}
          onRemoveReaction={removeReaction}
          onClose={() => setShowReactionDetail(null)}
        />
      )}

      {/* 既読詳細モーダル */}
      {showReadDetail && (
        <ReadDetailModal
          detail={showReadDetail}
          chatRoom={chatRoom}
          getUserDisplayName={getUserDisplayName}
          onClose={() => setShowReadDetail(null)}
        />
      )}

      {/* メッセージ削除確認モーダル */}
      {showDeleteConfirmMessage && (
        <ConfirmModal
          title="メッセージを削除"
          message="このメッセージを削除しますか？"
          confirmText="削除"
          cancelText="キャンセル"
          onConfirm={() => {
            if (showDeleteConfirmMessage) {
              void deleteMessage(showDeleteConfirmMessage);
            }
          }}
          onCancel={() => setShowDeleteConfirmMessage(null)}
          isDestructive
        />
      )}

      {showLeaveConfirm && (
        <ConfirmModal
          title="グループを退出"
          message="このグループから退出しますか？退出すると再招待されるまでメッセージを確認できなくなります。"
          onConfirm={leaveRoom}
          onCancel={() => setShowLeaveConfirm(false)}
          isDestructive
        />
      )}

      <DeleteRoomConfirmModal
        isOpen={showDeleteRoomConfirm && Boolean(chatRoom)}
        onClose={() => setShowDeleteRoomConfirm(false)}
        onDelete={() => { void handleDeleteRoom(); }}
        roomType={chatRoom?.type}
        roomName={chatRoom ? getRoomDisplayName(chatRoom, currentUser?.uid) : undefined}
        isDeleting={isDeletingRoom}
      />

      {!isEmbedded && (
        <>
          <DesktopUtilityModals
            currentUser={currentUser}
            chatRooms={desktopChatRooms}
            searchOpen={desktopSearchOpen}
            settingsOpen={desktopSettingsOpen}
            onCloseSearch={() => setDesktopSearchOpen(false)}
            onCloseSettings={() => setDesktopSettingsOpen(false)}
            onOpenSettings={() => setDesktopSettingsOpen(true)}
          />
          <DesktopNewChatModals
            currentUser={currentUser}
            chatRooms={desktopChatRooms}
            isOpen={desktopNewChatOpen}
            onClose={() => setDesktopNewChatOpen(false)}
          />
        </>
      )}
    </div>
  );
}
