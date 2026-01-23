// チャット画面

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  getDoc,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import type { Message, ChatRoom, User } from '../types';
import { compressImage, isImageFile } from '../utils/imageCompression';
import { addStorageUsage } from '../lib/storageUsage';
import ImagePreviewModal from '../components/ImagePreviewModal';
import styles from './Chat.module.css';

// 拡張されたメッセージ型
interface ExtendedMessage extends Message {
  isEdited?: boolean;
  isDeleted?: boolean;
  reactions?: { [emoji: string]: string[] }; // emoji -> userIds
  replyTo?: {
    messageId: string;
    text: string;
    senderName: string;
  } | null;
  isPinned?: boolean;
  mentions?: string[]; // mentioned userIds
}

export default function Chat() {
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();
  const [messages, setMessages] = useState<ExtendedMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatRoom, setChatRoom] = useState<ChatRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ url: string; fileName: string } | null>(null);

  // 編集・削除機能
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [showMessageMenu, setShowMessageMenu] = useState<string | null>(null);

  // リアクション機能
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
  const reactionEmojis = ['👍', '❤️', '😊', '😂', '😮', '😢', '🎉', '👏'];

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
  const groupImageInputRef = useRef<HTMLInputElement>(null);

  // メンバー招待
  const [showInvite, setShowInvite] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [inviteSelectedUsers, setInviteSelectedUsers] = useState<string[]>([]);

  // メンバー一覧
  const [showMemberList, setShowMemberList] = useState(false);

  // 相手のオンライン状態（1対1チャット用）
  const [otherUserOnline, setOtherUserOnline] = useState<boolean | null>(null);

  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);


  // チャットルーム情報を取得
  useEffect(() => {
    if (!roomId) return;

    const fetchRoom = async () => {
      const roomDoc = await getDoc(doc(db, 'chatRooms', roomId));
      if (roomDoc.exists()) {
        const data = roomDoc.data();
        setChatRoom({
          id: roomDoc.id,
          ...data,
          createdAt: data.createdAt?.toDate(),
          updatedAt: data.updatedAt?.toDate()
        } as ChatRoom);
      }
    };

    fetchRoom();
  }, [roomId]);

  // 1対1チャットの相手のオンライン状態をリアルタイム監視
  useEffect(() => {
    if (!chatRoom || chatRoom.type !== 'direct' || !currentUser) {
      setOtherUserOnline(null);
      return;
    }

    const otherUserId = chatRoom.members.find(id => id !== currentUser.uid);
    if (!otherUserId) {
      setOtherUserOnline(null);
      return;
    }

    const unsubscribe = onSnapshot(doc(db, 'users', otherUserId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setOtherUserOnline(data.isOnline ?? false);
      } else {
        setOtherUserOnline(false);
      }
    });

    return () => unsubscribe();
  }, [chatRoom, currentUser]);

  // ユーザー一覧を取得（招待用）
  useEffect(() => {
    if (!currentUser) return;

    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const userList: User[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.uid !== currentUser.uid) {
          userList.push({
            ...data,
            lastSeen: data.lastSeen?.toDate()
          } as User);
        }
      });
      setUsers(userList);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // メッセージを取得（リアルタイム）
  useEffect(() => {
    if (!roomId) return;

    const q = query(
      collection(db, 'chatRooms', roomId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: ExtendedMessage[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        msgs.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate()
        } as ExtendedMessage);
      });

      setMessages(msgs);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [roomId]);

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
        }, 2000);
        handledJumpRef.current = targetMessageId;
      }
    }
  }, [searchParams, messages]);

  // 初回読み込み時のみ最下部にスクロール
  const initialScrollDoneRef = useRef(false);
  useEffect(() => {
    if (!initialScrollDoneRef.current && messages.length > 0 && !searchParams.get('messageId')) {
      // 少し遅延させてDOMが安定してからスクロール
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }, 100);
      initialScrollDoneRef.current = true;
    }
  }, [messages.length, searchParams]);

  // メッセージを既読にする（処理済みIDを追跡して重複防止）
  const processedReadIdsRef = useRef<Set<string>>(new Set());
  const currentRoomIdRef = useRef<string | null>(null);

  useEffect(() => {
    // ルームが変わったらリセット
    if (currentRoomIdRef.current !== roomId) {
      processedReadIdsRef.current.clear();
      currentRoomIdRef.current = roomId || null;
    }

    if (!currentUser || !roomId || messages.length === 0) return;

    const unreadMessages = messages.filter(
      msg => msg.senderId !== currentUser.uid &&
             !msg.readBy?.includes(currentUser.uid) &&
             !processedReadIdsRef.current.has(msg.id)
    );

    if (unreadMessages.length === 0) return;

    // 既読処理を実行
    const markAsRead = async () => {
      for (const msg of unreadMessages) {
        // 処理済みとしてマーク（先にマークして重複防止）
        processedReadIdsRef.current.add(msg.id);
        try {
          await updateDoc(doc(db, 'chatRooms', roomId, 'messages', msg.id), {
            readBy: arrayUnion(currentUser.uid)
          });
        } catch (error) {
          // エラー時は処理済みから削除して再試行可能に
          processedReadIdsRef.current.delete(msg.id);
          console.error('既読処理エラー:', error);
        }
      }
    };

    markAsRead();
  }, [messages, currentUser, roomId]);

  // メッセージ入力でメンション検出
  const handleMessageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewMessage(value);

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
  const insertMention = (userName: string, _userId: string) => {
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
    const mentions: string[] = [];
    const mentionPattern = /@(\S+)/g;
    let match;
    while ((match = mentionPattern.exec(text)) !== null) {
      const mentionName = match[1];
      const user = Object.entries(chatRoom.memberDetails).find(
        ([, details]) => details.displayName === mentionName
      );
      if (user) {
        mentions.push(user[0]);
      }
    }
    return mentions;
  };

  // メッセージを送信
  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || !currentUser || !roomId || sending) return;

    setSending(true);
    try {
      const mentions = extractMentions(newMessage);

      const messageData: Record<string, unknown> = {
        chatRoomId: roomId,
        senderId: currentUser.uid,
        senderName: currentUser.displayName || 'Unknown',
        senderPhotoURL: currentUser.photoURL,
        text: newMessage.trim(),
        imageURL: null,
        fileURL: null,
        fileName: null,
        fileType: null,
        readBy: [currentUser.uid],
        createdAt: serverTimestamp(),
        isEdited: false,
        isDeleted: false,
        reactions: {},
        replyTo: replyingTo ? {
          messageId: replyingTo.id,
          text: replyingTo.text.substring(0, 50) + (replyingTo.text.length > 50 ? '...' : ''),
          senderName: replyingTo.senderName
        } : null,
        isPinned: false,
        mentions: mentions
      };

      await addDoc(collection(db, 'chatRooms', roomId, 'messages'), messageData);

      // チャットルームの最終メッセージを更新
      await updateDoc(doc(db, 'chatRooms', roomId), {
        lastMessage: {
          text: newMessage.trim(),
          senderId: currentUser.uid,
          senderName: currentUser.displayName || 'Unknown',
          timestamp: serverTimestamp()
        },
        updatedAt: serverTimestamp()
      });

      setNewMessage('');
      setReplyingTo(null);

      // ブラウザ通知（メンションされたユーザーへ）
      if (mentions.length > 0 && 'Notification' in window && Notification.permission === 'granted') {
        // 通知はメンションされた本人のブラウザで処理される
      }
    } catch (error) {
      console.error('メッセージ送信エラー:', error);
      alert('メッセージの送信に失敗しました');
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
      alert('メッセージの編集に失敗しました');
    }
  }

  // メッセージを削除
  async function deleteMessage(messageId: string) {
    if (!roomId) return;

    if (!confirm('このメッセージを削除しますか？')) return;

    try {
      await updateDoc(doc(db, 'chatRooms', roomId, 'messages', messageId), {
        text: '',
        isDeleted: true,
        imageURL: null,
        fileURL: null
      });
      setShowMessageMenu(null);
    } catch (error) {
      console.error('メッセージ削除エラー:', error);
      alert('メッセージの削除に失敗しました');
    }
  }

  // リアクションを追加/削除
  async function toggleReaction(messageId: string, emoji: string) {
    if (!currentUser || !roomId) return;

    const message = messages.find(m => m.id === messageId);
    if (!message) return;

    const reactions = message.reactions || {};
    const emojiReactions = reactions[emoji] || [];
    const hasReacted = emojiReactions.includes(currentUser.uid);

    try {
      if (hasReacted) {
        await updateDoc(doc(db, 'chatRooms', roomId, 'messages', messageId), {
          [`reactions.${emoji}`]: arrayRemove(currentUser.uid)
        });
      } else {
        await updateDoc(doc(db, 'chatRooms', roomId, 'messages', messageId), {
          [`reactions.${emoji}`]: arrayUnion(currentUser.uid)
        });
      }
      setShowReactionPicker(null);
    } catch (error) {
      console.error('リアクションエラー:', error);
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
    setShowGroupEdit(true);
  }

  // グループ画像を選択
  function handleGroupImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setEditGroupImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  // グループ情報を保存
  async function saveGroupEdit() {
    if (!roomId || !chatRoom || !editGroupName.trim()) return;

    setSavingGroup(true);
    try {
      let photoURL = chatRoom.photoURL;

      // 新しい画像がある場合はアップロード
      if (editGroupImage && editGroupImage.startsWith('data:')) {
        const response = await fetch(editGroupImage);
        const blob = await response.blob();
        const timestamp = Date.now();
        const storageRef = ref(storage, `groupImages/${roomId}_${timestamp}`);
        await uploadBytes(storageRef, blob);
        photoURL = await getDownloadURL(storageRef);
      }

      await updateDoc(doc(db, 'chatRooms', roomId), {
        name: editGroupName.trim(),
        photoURL: photoURL,
        updatedAt: serverTimestamp()
      });

      // ローカルのchatRoomも更新
      setChatRoom({
        ...chatRoom,
        name: editGroupName.trim(),
        photoURL: photoURL
      });

      setShowGroupEdit(false);
    } catch (error) {
      console.error('グループ編集エラー:', error);
      alert('グループ情報の更新に失敗しました');
    } finally {
      setSavingGroup(false);
    }
  }

  // 招待可能なユーザーを取得（既存メンバー以外）
  function getInvitableUsers() {
    if (!chatRoom) return [];
    return users.filter(user => !chatRoom.members.includes(user.uid));
  }

  // 招待モーダルを開く
  function openInviteModal() {
    setInviteSelectedUsers([]);
    setShowInvite(true);
  }

  // メンバーを招待
  async function inviteMembers() {
    if (!roomId || !chatRoom || inviteSelectedUsers.length === 0) return;

    try {
      // memberDetailsを更新
      const newMemberDetails = { ...chatRoom.memberDetails };
      inviteSelectedUsers.forEach(uid => {
        const user = users.find(u => u.uid === uid);
        if (user) {
          newMemberDetails[uid] = {
            displayName: user.displayName,
            photoURL: user.photoURL
          };
        }
      });

      await updateDoc(doc(db, 'chatRooms', roomId), {
        members: arrayUnion(...inviteSelectedUsers),
        memberDetails: newMemberDetails,
        updatedAt: serverTimestamp()
      });

      // ローカルのchatRoomも更新
      setChatRoom({
        ...chatRoom,
        members: [...chatRoom.members, ...inviteSelectedUsers],
        memberDetails: newMemberDetails
      });

      setShowInvite(false);
      setInviteSelectedUsers([]);
    } catch (error) {
      console.error('メンバー招待エラー:', error);
      alert('メンバーの招待に失敗しました');
    }
  }

  // ファイルを送信
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0 || !currentUser || !roomId) return;
    await uploadFiles(Array.from(files));
  }

  // ドラッグ&ドロップでファイルアップロード
  const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB

  const uploadFiles = async (files: File[]) => {
    if (!currentUser || !roomId) return;

    // ファイルサイズチェック
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > MAX_FILE_SIZE) {
      const sizeMB = (totalSize / (1024 * 1024)).toFixed(1);
      alert(`ファイルサイズが制限を超えています。\n\n選択されたファイル: ${sizeMB}MB\n制限: 30MB\n\n30MB以下のファイルを選択してください。`);
      return;
    }

    // 個別ファイルのサイズもチェック
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        alert(`ファイル「${file.name}」のサイズが制限を超えています。\n\nファイルサイズ: ${sizeMB}MB\n制限: 30MB\n\n30MB以下のファイルを選択してください。`);
        return;
      }
    }

    setUploading(true);
    try {
      for (const file of files) {
        let fileToUpload = file;
        let isImage = isImageFile(file);

        // 画像の場合は圧縮
        if (isImage) {
          fileToUpload = await compressImage(file);
        }

        // Storageにアップロード
        const timestamp = Date.now();
        const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filePath = `chatFiles/${roomId}/${timestamp}_${safeFileName}`;
        const storageRef = ref(storage, filePath);
        await uploadBytes(storageRef, fileToUpload, {
          cacheControl: 'public, max-age=604800'
        });
        const downloadURL = await getDownloadURL(storageRef);

        // ストレージ使用量を記録
        await addStorageUsage(fileToUpload.size);

        // メッセージとして保存
        const messageData = {
          chatRoomId: roomId,
          senderId: currentUser.uid,
          senderName: currentUser.displayName || 'Unknown',
          senderPhotoURL: currentUser.photoURL,
          text: isImage ? '' : `ファイル: ${file.name}`,
          imageURL: isImage ? downloadURL : null,
          fileURL: isImage ? null : downloadURL,
          fileName: file.name,
          fileType: file.type,
          readBy: [currentUser.uid],
          createdAt: serverTimestamp(),
          isEdited: false,
          isDeleted: false,
          reactions: {},
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
      alert('ファイルの送信に失敗しました');
    } finally {
      setUploading(false);
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
  }, [roomId, currentUser, replyingTo]);

  // チャットルームの表示名を取得
  function getRoomDisplayName(): string {
    if (!chatRoom) return '';
    if (chatRoom.type === 'group') {
      return chatRoom.name;
    }
    const otherUserId = chatRoom.members.find(id => id !== currentUser?.uid);
    if (otherUserId && chatRoom.memberDetails[otherUserId]) {
      return chatRoom.memberDetails[otherUserId].displayName;
    }
    return 'Unknown';
  }

  // 時刻のフォーマット
  function formatTime(date: Date | undefined): string {
    if (!date) return '';
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const time = date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    return `${year}/${month}/${day} ${time}`;
  }

  // 既読表示
  function getReadStatus(message: ExtendedMessage): string {
    if (message.senderId !== currentUser?.uid) return '';
    const readCount = message.readBy.length - 1;
    if (readCount === 0) return '';
    if (chatRoom?.type === 'direct') {
      return '既読';
    }
    return `既読 ${readCount}`;
  }

  // メッセージテキストをレンダリング（メンションをハイライト）
  function renderMessageText(text: string): React.ReactNode {
    if (!text) return null;

    const parts = text.split(/(@\S+)/g);
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        return (
          <span key={index} className={styles.mention}>
            {part}
          </span>
        );
      }
      return part;
    });
  }

  // ピン留めされたメッセージを取得
  const pinnedMessages = messages.filter(m => m.isPinned);

  if (loading) {
    return <div className={styles.loading}>読み込み中...</div>;
  }

  return (
    <div
      className={styles.container}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* ドラッグオーバーレイ */}
      {isDragging && (
        <div className={styles.dragOverlay}>
          <div className={styles.dragContent}>
            <p>ファイルをドロップして送信</p>
          </div>
        </div>
      )}

      {/* ヘッダー */}
      <header className={styles.header}>
        <button className={styles.backButton} onClick={() => navigate('/')}>
          ←
        </button>
        <div className={styles.roomInfo}>
          <div className={styles.roomNameContainer}>
            <h1 className={styles.roomName}>{getRoomDisplayName()}</h1>
            {chatRoom?.type === 'direct' && otherUserOnline !== null && (
              <span className={otherUserOnline ? styles.headerOnlineIndicator : styles.headerOfflineIndicator}></span>
            )}
          </div>
          {chatRoom?.type === 'group' && (
            <span className={styles.memberCount}>
              {chatRoom.members.length}人のメンバー
            </span>
          )}
          {chatRoom?.type === 'direct' && otherUserOnline !== null && (
            <span className={otherUserOnline ? styles.onlineStatus : styles.offlineStatus}>
              {otherUserOnline ? 'オンライン' : 'オフライン'}
            </span>
          )}
        </div>
        {chatRoom?.type === 'group' && (
          <>
            <button
              className={styles.memberListButton}
              onClick={() => setShowMemberList(true)}
              title="メンバー一覧"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </button>
            <button
              className={styles.editGroupButton}
              onClick={openGroupEdit}
              title="グループを編集"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <button
              className={styles.inviteButton}
              onClick={openInviteModal}
              title="メンバーを招待"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="20" y1="8" x2="20" y2="14" />
                <line x1="23" y1="11" x2="17" y2="11" />
              </svg>
            </button>
          </>
        )}
        {pinnedMessages.length > 0 && (
          <button
            className={styles.pinButton}
            onClick={() => setShowPinnedMessages(!showPinnedMessages)}
            title="ピン留めメッセージ"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
            </svg>
            <span className={styles.pinCount}>{pinnedMessages.length}</span>
          </button>
        )}
      </header>

      {/* ピン留めメッセージ表示 */}
      {showPinnedMessages && pinnedMessages.length > 0 && (
        <div className={styles.pinnedSection}>
          <div className={styles.pinnedHeader}>
            <span>ピン留めメッセージ</span>
            <button onClick={() => setShowPinnedMessages(false)}>×</button>
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
      <div className={styles.messageList} ref={messageListRef}>
        {messages.length === 0 ? (
          <div className={styles.empty}>
            <p>メッセージがありません</p>
            <p>最初のメッセージを送信しましょう</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              id={`message-${message.id}`}
              className={`${styles.messageWrapper} ${
                message.senderId === currentUser?.uid ? styles.own : ''
              } ${message.isPinned ? styles.pinned : ''}`}
            >
              {message.senderId !== currentUser?.uid && chatRoom?.type === 'group' && (
                <span className={styles.senderName}>{message.senderName}</span>
              )}

              {/* 返信元の表示 */}
              {message.replyTo && (
                <div
                  className={styles.replyPreview}
                  onClick={() => {
                    const element = document.getElementById(`message-${message.replyTo?.messageId}`);
                    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                >
                  <span className={styles.replyLabel}>返信: {message.replyTo.senderName}</span>
                  <p className={styles.replyText}>{message.replyTo.text}</p>
                </div>
              )}

              <div className={styles.messageRow}>
                {message.senderId === currentUser?.uid && (
                  <div className={styles.messageInfo}>
                    <span className={styles.readStatus}>{getReadStatus(message)}</span>
                    <span className={styles.messageTime}>{formatTime(message.createdAt)}</span>
                  </div>
                )}

                <div
                  className={styles.messageContainer}
                  onClick={() => setShowMessageMenu(showMessageMenu === message.id ? null : message.id)}
                >
                  {/* メッセージメニュー */}
                  {showMessageMenu === message.id && (
                    <div className={styles.messageMenu} onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => {
                        setReplyingTo(message);
                        setShowMessageMenu(null);
                        messageInputRef.current?.focus();
                      }}>
                        返信
                      </button>
                      <button onClick={() => {
                        setShowReactionPicker(message.id);
                        setShowMessageMenu(null);
                      }}>
                        リアクション
                      </button>
                      <button onClick={() => {
                        togglePin(message.id);
                        setShowMessageMenu(null);
                      }}>
                        {message.isPinned ? 'ピン解除' : 'ピン留め'}
                      </button>
                      {message.senderId === currentUser?.uid && !message.isDeleted && (
                        <>
                          <button onClick={() => {
                            setEditingMessageId(message.id);
                            setEditText(message.text);
                            setShowMessageMenu(null);
                          }}>
                            編集
                          </button>
                          <button
                            className={styles.deleteOption}
                            onClick={() => deleteMessage(message.id)}
                          >
                            削除
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* リアクションピッカー */}
                  {showReactionPicker === message.id && (
                    <div className={styles.reactionPicker} onClick={(e) => e.stopPropagation()}>
                      {reactionEmojis.map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => toggleReaction(message.id, emoji)}
                          className={message.reactions?.[emoji]?.includes(currentUser?.uid || '') ? styles.reacted : ''}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className={styles.message}>
                    {message.isDeleted ? (
                      <p className={styles.deletedMessage}>このメッセージは削除されました</p>
                    ) : (
                      <>
                        {message.imageURL && (
                          <img
                            src={message.imageURL}
                            alt="送信画像"
                            className={styles.messageImage}
                            onClick={() => setPreviewImage({ url: message.imageURL!, fileName: message.fileName || '画像' })}
                          />
                        )}
                        {message.fileURL && (
                          <a
                            href={message.fileURL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.fileLink}
                          >
                            {message.fileName}
                          </a>
                        )}
                        {(message as ExtendedMessage & { fileDeleted?: boolean }).fileDeleted && !message.imageURL && !message.fileURL && (
                          <p className={styles.deletedFile}>このファイルは期限切れのため削除されました</p>
                        )}
                        {editingMessageId === message.id ? (
                          <div className={styles.editArea}>
                            <input
                              type="text"
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              className={styles.editInput}
                              autoFocus
                            />
                            <div className={styles.editButtons}>
                              <button onClick={() => saveEdit(message.id)}>保存</button>
                              <button onClick={() => setEditingMessageId(null)}>キャンセル</button>
                            </div>
                          </div>
                        ) : (
                          message.text && (
                            <p className={styles.messageText}>
                              {renderMessageText(message.text)}
                              {message.isEdited && <span className={styles.editedLabel}>(編集済み)</span>}
                            </p>
                          )
                        )}
                      </>
                    )}
                  </div>

                  {/* リアクション表示 */}
                  {message.reactions && Object.keys(message.reactions).length > 0 && (
                    <div className={styles.reactions}>
                      {Object.entries(message.reactions).map(([emoji, users]) =>
                        users.length > 0 && (
                          <button
                            key={emoji}
                            className={`${styles.reactionBadge} ${users.includes(currentUser?.uid || '') ? styles.myReaction : ''}`}
                            onClick={() => toggleReaction(message.id, emoji)}
                          >
                            {emoji} {users.length}
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>

                {message.senderId !== currentUser?.uid && (
                  <div className={styles.messageInfo}>
                    <span className={styles.messageTime}>{formatTime(message.createdAt)}</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 返信プレビュー */}
      {replyingTo && (
        <div className={styles.replyingBar}>
          <div className={styles.replyingContent}>
            <span className={styles.replyingLabel}>返信: {replyingTo.senderName}</span>
            <p className={styles.replyingText}>{replyingTo.text.substring(0, 50)}{replyingTo.text.length > 50 ? '...' : ''}</p>
          </div>
          <button className={styles.cancelReply} onClick={() => setReplyingTo(null)}>×</button>
        </div>
      )}

      {/* メンションリスト */}
      {showMentionList && getFilteredMembers().length > 0 && (
        <div className={styles.mentionList}>
          {getFilteredMembers().map(member => (
            <button
              key={member.uid}
              className={styles.mentionItem}
              onClick={() => insertMention(member.displayName, member.uid)}
            >
              @{member.displayName}
            </button>
          ))}
        </div>
      )}

      {/* 入力エリア */}
      <form className={styles.inputArea} onSubmit={sendMessage}>
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
          title="ファイルを添付"
        >
          {uploading ? (
            <span className={styles.uploadingSpinner}>...</span>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
          )}
        </button>
        <input
          type="text"
          ref={messageInputRef}
          value={newMessage}
          onChange={handleMessageChange}
          placeholder="メッセージを入力... (@でメンション)"
          className={styles.messageInput}
          disabled={sending}
        />
        <button
          type="submit"
          className={styles.sendButton}
          disabled={!newMessage.trim() || sending}
        >
          {sending ? '...' : '送信'}
        </button>
      </form>

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
          }}
        />
      )}

      {/* グループ編集モーダル */}
      {showGroupEdit && chatRoom?.type === 'group' && (
        <div className={styles.groupEditOverlay} onClick={() => setShowGroupEdit(false)}>
          <div className={styles.groupEditModal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.groupEditTitle}>グループを編集</h2>

            {/* グループ画像 */}
            <div className={styles.groupEditImageSection}>
              <input
                type="file"
                ref={groupImageInputRef}
                onChange={handleGroupImageChange}
                accept="image/*"
                style={{ display: 'none' }}
              />
              <div
                className={styles.groupEditImagePreview}
                onClick={() => groupImageInputRef.current?.click()}
              >
                {editGroupImage ? (
                  <img src={editGroupImage} alt="グループ画像" />
                ) : (
                  <span className={styles.groupEditImagePlaceholder}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="32" height="32">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  </span>
                )}
                <div className={styles.groupEditImageOverlay}>
                  <span>変更</span>
                </div>
              </div>
              <p className={styles.groupEditImageHint}>タップして画像を変更</p>
            </div>

            {/* グループ名 */}
            <div className={styles.groupEditNameSection}>
              <label>グループ名</label>
              <input
                type="text"
                value={editGroupName}
                onChange={(e) => setEditGroupName(e.target.value)}
                placeholder="グループ名を入力"
                className={styles.groupEditNameInput}
              />
            </div>

            {/* ボタン */}
            <div className={styles.groupEditButtons}>
              <button
                className={styles.groupEditSaveButton}
                onClick={saveGroupEdit}
                disabled={savingGroup || !editGroupName.trim()}
              >
                {savingGroup ? '保存中...' : '保存'}
              </button>
              <button
                className={styles.groupEditCancelButton}
                onClick={() => setShowGroupEdit(false)}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* メンバー招待モーダル */}
      {showInvite && chatRoom?.type === 'group' && (
        <div className={styles.groupEditOverlay} onClick={() => setShowInvite(false)}>
          <div className={styles.groupEditModal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.groupEditTitle}>メンバーを招待</h2>
            <div className={styles.inviteUserList}>
              {getInvitableUsers().length === 0 ? (
                <p className={styles.noInvitableUsers}>招待可能なユーザーがいません</p>
              ) : (
                getInvitableUsers().map((user) => (
                  <div
                    key={user.uid}
                    className={`${styles.inviteUserItem} ${inviteSelectedUsers.includes(user.uid) ? styles.selected : ''}`}
                    onClick={() => {
                      if (inviteSelectedUsers.includes(user.uid)) {
                        setInviteSelectedUsers(inviteSelectedUsers.filter(id => id !== user.uid));
                      } else {
                        setInviteSelectedUsers([...inviteSelectedUsers, user.uid]);
                      }
                    }}
                  >
                    <span className={styles.inviteUserAvatar}>
                      <span className={user.isOnline ? styles.onlineIndicator : styles.offlineIndicator}></span>
                    </span>
                    <span className={styles.inviteUserName}>{user.displayName}</span>
                    {inviteSelectedUsers.includes(user.uid) && <span className={styles.checkmark}>✓</span>}
                  </div>
                ))
              )}
            </div>
            <div className={styles.groupEditButtons}>
              <button
                className={styles.groupEditSaveButton}
                onClick={inviteMembers}
                disabled={inviteSelectedUsers.length === 0}
              >
                招待
              </button>
              <button
                className={styles.groupEditCancelButton}
                onClick={() => setShowInvite(false)}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* メンバー一覧モーダル */}
      {showMemberList && chatRoom?.type === 'group' && (
        <div className={styles.groupEditOverlay} onClick={() => setShowMemberList(false)}>
          <div className={styles.memberListModal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.groupEditTitle}>メンバー一覧</h2>
            <div className={styles.memberListContent}>
              {chatRoom.members.map((memberId) => {
                const memberDetails = chatRoom.memberDetails[memberId];
                const memberUser = users.find(u => u.uid === memberId);
                const isCurrentUser = memberId === currentUser?.uid;
                const isOnline = isCurrentUser ? true : (memberUser?.isOnline ?? false);
                const displayName = memberDetails?.displayName || (isCurrentUser ? currentUser?.displayName : 'Unknown');
                const photoURL = memberDetails?.photoURL || (isCurrentUser ? currentUser?.photoURL : null);

                return (
                  <div key={memberId} className={styles.memberListItem}>
                    <div className={styles.memberListAvatar}>
                      {photoURL ? (
                        <img src={photoURL} alt="" className={styles.memberListAvatarImage} />
                      ) : null}
                      <span className={isOnline ? styles.memberOnlineIndicator : styles.memberOfflineIndicator}></span>
                    </div>
                    <div className={styles.memberListInfo}>
                      <span className={styles.memberListName}>
                        {displayName}
                        {isCurrentUser && <span className={styles.memberYouLabel}>(あなた)</span>}
                      </span>
                      <span className={isOnline ? styles.memberListStatusOnline : styles.memberListStatusOffline}>
                        {isOnline ? 'オンライン' : 'オフライン'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              className={styles.groupEditCancelButton}
              onClick={() => setShowMemberList(false)}
              style={{ width: '100%', marginTop: '16px' }}
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
