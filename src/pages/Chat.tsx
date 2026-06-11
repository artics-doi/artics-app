// チャット画面

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  deleteField,
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
import { useVisualViewport } from '../hooks/useVisualViewport';
import type { ChatRoom, ExtendedMessage } from '../types';
import { compressImage, isImageFile } from '../utils/imageCompression';
import { getRoomDisplayName } from '../utils/room';
import { formatTimeSmart } from '../utils/dateUtils';
import { getAppEntryPath } from '../utils/navigation';
import { MAX_FILE_SIZE, HIGHLIGHT_DURATION, MAX_TEXTAREA_HEIGHT } from '../constants';
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
import DesktopUtilityModals from '../components/desktop/DesktopUtilityModals';
import DesktopNewChatModals from '../components/desktop/DesktopNewChatModals';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { resolveMenuPosition } from '../lib/chat/menuPosition';
import styles from './Chat.module.css';

export default function Chat() {
  const { roomId } = useParams<{ roomId: string }>();
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
  const lastMessageCountRef = useRef(0);
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
    setIsAtBottom(atBottom);
    if (atBottom) setNewMessageCount(0);
  }, [handleScroll, messageListRef]);

  // 新着メッセージ数の追跡
  useEffect(() => {
    const newCount = messages.length - lastMessageCountRef.current;
    if (newCount > 0 && !isAtBottom) {
      setNewMessageCount((prev) => prev + newCount);
    }
    lastMessageCountRef.current = messages.length;
  }, [messages.length, isAtBottom]);

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

  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const { isRoomMuted, toggleMute } = useRoomNotificationSettings();
  const { chatRooms: desktopChatRooms } = useChatRooms(currentUser);
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const { users, fetchUsers } = useUsers();
  const {
    selectedUsers: inviteSelectedUsers,
    setSelectedUsers: setInviteSelectedUsers,
    getInvitableUsers,
    inviteMembers
  } = useInviteMembers(users);
  const { setTyping, clearTyping } = useTypingIndicator(roomId, currentUser?.uid);
  const [desktopSidePanelOpen, setDesktopSidePanelOpen] = useState(false);
  const [desktopSearchOpen, setDesktopSearchOpen] = useState(false);
  const [desktopSettingsOpen, setDesktopSettingsOpen] = useState(false);
  const [desktopNewChatOpen, setDesktopNewChatOpen] = useState(false);

  // オンラインステータス
  const memberIds = useMemo(() => chatRoom?.members ?? [], [chatRoom?.members]);
  const onlineStatusMap = useOnlineStatus(memberIds);
  const otherUserId = useMemo(() => {
    if (chatRoom?.type !== 'direct' || !currentUser) return null;
    return chatRoom.members.find(uid => uid !== currentUser.uid) ?? null;
  }, [chatRoom, currentUser]);

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
        return;
      }

      const data = roomDoc.data();
      // メモルームの場合はメモページにリダイレクト
      if (data.type === 'memo') {
        navigate(`/memo/${roomId}`, { replace: true });
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
  }, [roomId, navigate]);

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
  const prevMessagesLengthRef = useRef(0);

  // ルーム切替時にスクロール関連の記憶をリセット。
  // 漏れると別ルームで初回スクロールが走らず、新着件数も誤検出する
  useEffect(() => {
    initialScrollDoneRef.current = false;
    prevMessagesLengthRef.current = 0;
    lastMessageCountRef.current = 0;
    isAtBottomRef.current = true;
    setIsAtBottom(true);
    setNewMessageCount(0);
  }, [roomId]);

  useEffect(() => {
    // 検索パラメータがある場合はスクロールしない
    if (searchParams.get('messageId')) return;

    if (!initialScrollDoneRef.current && messages.length > 0) {
      // 初回読み込み時
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }, 100);
      initialScrollDoneRef.current = true;
    } else if (messages.length > prevMessagesLengthRef.current) {
      // 新着での自動スクロールは「最下部にいる」か「自分の送信」のときだけ。
      // 過去ログ閲覧中まで強制スクロールすると「N件の新着」ボタンが機能しない
      const lastMessage = messages[messages.length - 1];
      if (isAtBottomRef.current || lastMessage?.senderId === currentUser?.uid) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }

    prevMessagesLengthRef.current = messages.length;
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
    if (!newMessage.trim() || !currentUser || !roomId || sending) return;

    setSending(true);
    const text = newMessage.trim();
    const mentions = extractMentions(newMessage);
    const replyToSnapshot = replyingTo
      ? {
          messageId: replyingTo.id,
          text: replyingTo.text.substring(0, 50) + (replyingTo.text.length > 50 ? '...' : ''),
          senderName: replyingTo.senderName,
        }
      : null;

    // (1) ローカルで即時表示（送信中フラグ付き）
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

    // (2) UI 側のリセットは送信完了を待たずに行う（入力欄を即クリア）
    setNewMessage('');
    setReplyingTo(null);
    if (messageInputRef.current) {
      messageInputRef.current.style.height = 'auto';
    }

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

      // チャットルームの最終メッセージを更新
      await updateDoc(doc(db, 'chatRooms', roomId), {
        lastMessage: {
          text,
          senderId: currentUser.uid,
          senderName: currentUser.displayName || 'Unknown',
          timestamp: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      });

      await clearTyping();

      // (3) 送信成功: ローカル側を消す（Firestore 版が onSnapshot で入ってくる）
      confirmOptimistic(localId);
    } catch (error) {
      console.error('メッセージ送信エラー:', error);
      // (4) 送信失敗: ローカル側を failed 状態にして UI で再送/破棄を促す
      failOptimistic(localId);
      showToast('error', 'メッセージの送信に失敗しました');
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
          await deleteObject(ref(storage, targetMessage.storagePath)).catch((error) => {
            if (error?.code !== 'storage/object-not-found') throw error;
          });
        }

        await updateDoc(doc(db, 'chatRooms', roomId, 'messages', messageId), {
          text: '',
          isDeleted: true,
          imageURL: null,
          fileURL: null,
          storagePath: null,
          fileSize: null,
        });

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
      navigate(getAppEntryPath());
      showToast('success', 'グループから退出しました');
    } catch (error) {
      console.error('グループ退出エラー:', error);
      showToast('error', '退出に失敗しました');
    }
  }

  // ファイルを送信
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0 || !currentUser || !roomId) return;
    await uploadFiles(Array.from(files));
  }

  // ドラッグ&ドロップでファイルアップロード
  const uploadFiles = async (files: File[]) => {
    if (!currentUser || !roomId) return;

    // ファイルサイズチェック
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > MAX_FILE_SIZE) {
      const sizeMB = (totalSize / (1024 * 1024)).toFixed(1);
      showToast('warning', `ファイルサイズが制限を超えています。\n\n選択されたファイル: ${sizeMB}MB\n制限: 30MB\n\n30MB以下のファイルを選択してください。`);
      return;
    }

    // 個別ファイルのサイズもチェック
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        showToast('warning', `ファイル「${file.name}」のサイズが制限を超えています。\n\nファイルサイズ: ${sizeMB}MB\n制限: 30MB\n\n30MB以下のファイルを選択してください。`);
        return;
      }
    }

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

        // Storageにアップロード
        const timestamp = Date.now();
        const filePath = `chatFiles/${roomId}/${timestamp}/${file.name}`;
        const storageRef = ref(storage, filePath);
        await uploadBytes(storageRef, fileToUpload, {
          cacheControl: 'public, max-age=604800'
        });
        const downloadURL = await getDownloadURL(storageRef);

        // メッセージとして保存
        const messageData = {
          chatRoomId: roomId,
          senderId: currentUser.uid,
          senderName: currentUser.displayName || 'Unknown',
          senderPhotoURL: currentUser.photoURL,
          text: isImage ? '' : `ファイル: ${file.name}`,
          imageURL: isImage ? downloadURL : null,
          fileURL: isImage ? null : downloadURL,
          storagePath: filePath,
          fileSize: fileToUpload.size,
          fileName: file.name,
          fileType: file.type,
          readBy: [currentUser.uid],
          createdAt: serverTimestamp(),
          isEdited: false,
          isDeleted: false,
          reactions: {},
          reactionsByUser: {},
          replyTo: replyingTo ? {
            messageId: replyingTo.id,
            text: replyingTo.text.substring(0, 50),
            senderName: replyingTo.senderName
          } : null,
          isPinned: false,
          mentions: []
        };

        await addDoc(collection(db, 'chatRooms', roomId, 'messages'), messageData);

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
      setReplyingTo(null);
    } catch (error) {
      console.error('ファイルアップロードエラー:', error);
      showToast('error', 'ファイルの送信に失敗しました');
    } finally {
      setUploadProgress(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      uploadFiles(files);
    }
    // uploadFiles はコンポーネント内の関数で毎レンダリング再生成されるため意図的に除外
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, currentUser, replyingTo]);

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
  function handleBackToRooms() {
    navigate(getAppEntryPath());
  }

  if (loading) {
    return <div className={styles.loading}>読み込み中...</div>;
  }

  return (
    <div className={`${styles.container} ${desktopSidePanelOpen ? styles.withDesktopSidePanel : ''}`}>
      {/* M-9: D&D は入力エリア周辺ゾーンに限定（メッセージ閲覧中の誤操作を防止） */}

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

      <main className={styles.chatMainPane}>

      {/* ヘッダー */}
      <header className={styles.header}>
        <button className={styles.backButton} onClick={handleBackToRooms} aria-label="戻る">
          ←
          <span className={styles.headerActionLabel}>戻る</span>
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
          title={desktopSidePanelOpen ? '右枠を閉じる' : 'ファイルを開く'}
          aria-label={desktopSidePanelOpen ? '右枠を閉じる' : 'ファイルを開く'}
          aria-expanded={desktopSidePanelOpen}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
            <path d="M4 4h16v16H4z" />
            <path d="M9 4v16" />
            <path d="M13 9h4" />
            <path d="M13 13h4" />
          </svg>
          <span className={styles.headerActionLabel}>ファイル</span>
        </button>
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
              <p>ファイルをドロップして送信</p>
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
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          style={{ display: 'none' }}
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
        />
        <button
          type="button"
          className={styles.attachButton}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title={uploadProgress ? `アップロード中 ${uploadProgress.current}/${uploadProgress.total}` : 'ファイルを添付'}
          aria-label={uploadProgress ? `アップロード中 ${uploadProgress.current}/${uploadProgress.total}` : 'ファイルを添付'}
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
          onKeyDown={(e) => {
            // Enter で送信、Shift+Enter で改行（IME 変換中の Enter は無視）
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing &&
              newMessage.trim() &&
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
          disabled={!newMessage.trim() || sending}
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

      <aside className={`${styles.desktopUtilityPane} ${desktopSidePanelOpen ? styles.open : ''}`} aria-label="ファイル">
        <section className={styles.desktopUtilityCard}>
          <div className={styles.desktopSectionHeader}>
            <h2>ファイル</h2>
            <button type="button" onClick={() => setDesktopSidePanelOpen(false)} className={styles.desktopSubtleButton}>
              閉じる
            </button>
          </div>
          <div className={styles.desktopResultList}>
            {desktopAttachments.length > 0 ? (
              desktopAttachments.map((message) => (
                <button
                  key={message.id}
                  type="button"
                  onClick={() => document.getElementById(`message-${message.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                  className={styles.desktopResultItem}
                >
                  <span className={styles.desktopResultAvatar} aria-hidden="true">
                    {message.imageURL ? '画像' : 'FILE'}
                  </span>
                  <span className={styles.desktopResultBody}>
                    <span>
                      <strong>{message.fileName || '画像'}</strong>
                      <em>{message.senderName}</em>
                    </span>
                    <span>{formatTimeSmart(message.createdAt)}</span>
                  </span>
                </button>
              ))
            ) : (
                <p className={styles.desktopEmptyPanel}>このルームのファイルはまだありません。</p>
            )}
          </div>
        </section>
      </aside>

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

      <DesktopUtilityModals
        currentUser={currentUser}
        chatRooms={desktopChatRooms}
        searchOpen={desktopSearchOpen}
        settingsOpen={desktopSettingsOpen}
        onCloseSearch={() => setDesktopSearchOpen(false)}
        onCloseSettings={() => setDesktopSettingsOpen(false)}
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
