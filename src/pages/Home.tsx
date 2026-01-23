// ホーム画面（チャット一覧）

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  serverTimestamp,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  arrayUnion
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateProfile } from 'firebase/auth';
import { db, storage } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { cleanupOldFiles, shouldRunCleanup, recordCleanupRun } from '../lib/cleanupOldFiles';
import { getStorageUsage, formatBytes, calculateUsagePercent, STORAGE_FREE_LIMIT, addStorageUsage } from '../lib/storageUsage';
import { useElectronNotification, useStartupSettings, isElectronEnv } from '../hooks/useElectronNotification';
import type { ChatRoom, User } from '../types';
import styles from './Home.module.css';

export default function Home() {
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<{ [roomId: string]: number }>({});
  const [users, setUsers] = useState<User[]>([]);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ roomId: string; roomName: string; messageId: string; text: string; senderName: string; timestamp: Date }[]>([]);
  const [searching, setSearching] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteRoomId, setInviteRoomId] = useState<string | null>(null);
  const [inviteSelectedUsers, setInviteSelectedUsers] = useState<string[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteRoomId, setDeleteRoomId] = useState<string | null>(null);
  const [showUsers, setShowUsers] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [groupImage, setGroupImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileName, setProfileName] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    return (saved === 'dark') ? 'dark' : 'light';
  });
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const [showReleaseNotesEdit, setShowReleaseNotesEdit] = useState(false);
  const [releaseNotes, setReleaseNotes] = useState('');
  const [releaseNotesEdit, setReleaseNotesEdit] = useState('');
  const [savingReleaseNotes, setSavingReleaseNotes] = useState(false);
  const [settingsTitleClickCount, setSettingsTitleClickCount] = useState(0);
  const [storageUsage, setStorageUsage] = useState<number>(0);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);

  const profileImageInputRef = useRef<HTMLInputElement>(null);
  const groupImageInputRef = useRef<HTMLInputElement>(null);
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  // Electron通知・スタートアップ設定フック
  const { settings: notificationSettings, updateSettings: updateNotificationSettings } = useElectronNotification();
  const { enabled: startupEnabled, setStartupEnabled } = useStartupSettings();

  // チャットルーム一覧を取得
  useEffect(() => {
    if (!currentUser) return;

    // インデックス不要のシンプルなクエリを使用
    const q = query(
      collection(db, 'chatRooms'),
      where('members', 'array-contains', currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rooms: ChatRoom[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        rooms.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate(),
          updatedAt: data.updatedAt?.toDate(),
          lastMessage: data.lastMessage ? {
            ...data.lastMessage,
            timestamp: data.lastMessage.timestamp?.toDate()
          } : null
        } as ChatRoom);
      });
      // クライアント側でソート
      rooms.sort((a, b) => {
        const timeA = a.updatedAt?.getTime() || 0;
        const timeB = b.updatedAt?.getTime() || 0;
        return timeB - timeA;
      });
      setChatRooms(rooms);
      setLoading(false);
    }, (error) => {
      console.error('チャットルーム取得エラー:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // 各チャットルームの未読数を取得
  useEffect(() => {
    if (!currentUser || chatRooms.length === 0) return;

    const unsubscribes: (() => void)[] = [];

    chatRooms.forEach((room) => {
      const messagesQuery = query(
        collection(db, 'chatRooms', room.id, 'messages')
      );

      const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
        let unreadCount = 0;
        snapshot.forEach((doc) => {
          const data = doc.data();
          // 自分以外が送信したメッセージで、自分が既読していないもの
          if (data.senderId !== currentUser.uid && !data.readBy?.includes(currentUser.uid)) {
            unreadCount++;
          }
        });
        setUnreadCounts((prev) => ({
          ...prev,
          [room.id]: unreadCount
        }));
      });

      unsubscribes.push(unsubscribe);
    });

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [currentUser, chatRooms]);

  // ユーザー一覧を取得（リアルタイム）
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

  // 1対1チャットを作成または開く
  async function startDirectChat(otherUser: User) {
    if (!currentUser) return;

    // 既存のチャットルームを探す
    const existingRoom = chatRooms.find(
      room => room.type === 'direct' &&
        room.members.includes(otherUser.uid) &&
        room.members.includes(currentUser.uid)
    );

    if (existingRoom) {
      navigate(`/chat/${existingRoom.id}`);
      return;
    }

    // 新しいチャットルームを作成
    const newRoom = {
      name: '',
      type: 'direct',
      members: [currentUser.uid, otherUser.uid],
      memberDetails: {
        [currentUser.uid]: {
          displayName: currentUser.displayName || 'Unknown',
          photoURL: currentUser.photoURL
        },
        [otherUser.uid]: {
          displayName: otherUser.displayName,
          photoURL: otherUser.photoURL
        }
      },
      lastMessage: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    const docRef = await addDoc(collection(db, 'chatRooms'), newRoom);
    navigate(`/chat/${docRef.id}`);
    setShowNewChat(false);
  }

  // グループチャットを作成
  async function createGroupChat() {
    if (!currentUser || selectedUsers.length === 0 || !groupName.trim()) return;

    try {
      const memberDetails: { [uid: string]: { displayName: string; photoURL: string | null } } = {
        [currentUser.uid]: {
          displayName: currentUser.displayName || 'Unknown',
          photoURL: currentUser.photoURL
        }
      };

      selectedUsers.forEach(uid => {
        const user = users.find(u => u.uid === uid);
        if (user) {
          memberDetails[uid] = {
            displayName: user.displayName,
            photoURL: user.photoURL
          };
        }
      });

      // グループ画像をアップロード
      let groupPhotoURL: string | null = null;
      if (groupImage && groupImage.startsWith('data:')) {
        const response = await fetch(groupImage);
        const blob = await response.blob();
        const timestamp = Date.now();
        // ファイル名に日本語やスペースが入らないようにする
        const safeFileName = `group_${timestamp}`;
        const storageRef = ref(storage, `groupImages/${safeFileName}`);
        await uploadBytes(storageRef, blob);
        groupPhotoURL = await getDownloadURL(storageRef);
        // ストレージ使用量を記録
        await addStorageUsage(blob.size);
        setStorageUsage(prev => prev + blob.size);
      }

      const newRoom = {
        name: groupName.trim(),
        type: 'group',
        photoURL: groupPhotoURL,
        members: [currentUser.uid, ...selectedUsers],
        memberDetails,
        lastMessage: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'chatRooms'), newRoom);
      navigate(`/chat/${docRef.id}`);
      setShowNewGroup(false);
      setSelectedUsers([]);
      setGroupName('');
      setGroupImage(null);
    } catch (error: unknown) {
      console.error('グループ作成エラー:', error);
      const errorMessage = error instanceof Error ? error.message : '不明なエラー';
      alert(`グループの作成に失敗しました: ${errorMessage}`);
    }
  }

  // グループ画像を選択
  function handleGroupImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setGroupImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  // チャットルームの表示名を取得
  function getRoomDisplayName(room: ChatRoom): string {
    if (room.type === 'group') {
      return room.name;
    }
    // 1対1の場合は相手の名前を表示
    const otherUserId = room.members.find(id => id !== currentUser?.uid);
    if (otherUserId && room.memberDetails[otherUserId]) {
      return room.memberDetails[otherUserId].displayName;
    }
    return 'Unknown';
  }

  // 1対1チャットの相手のオンライン状態を取得
  function getDirectChatPartnerOnlineStatus(room: ChatRoom): boolean | null {
    if (room.type !== 'direct') return null;
    const otherUserId = room.members.find(id => id !== currentUser?.uid);
    if (!otherUserId) return null;
    const otherUser = users.find(u => u.uid === otherUserId);
    return otherUser?.isOnline ?? false;
  }

  // 最終アクセス時刻のフォーマット
  function formatLastSeen(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return 'たった今';
    if (minutes < 60) return `${minutes}分前`;
    if (hours < 24) return `${hours}時間前`;
    if (days < 7) return `${days}日前`;
    return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
  }

  async function handleLogout() {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('ログアウトエラー:', error);
    }
  }

  // テーマ切り替え
  function toggleTheme(newTheme: 'light' | 'dark') {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  }

  // 初期テーマ設定
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, []);

  // ブラウザ通知の許可をリクエスト
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // オンライン状態の更新
  useEffect(() => {
    if (!currentUser) return;

    const updateOnlineStatus = async (isOnline: boolean) => {
      try {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          isOnline: isOnline,
          lastSeen: serverTimestamp()
        });
      } catch (error) {
        console.error('オンライン状態更新エラー:', error);
      }
    };

    // オンラインに設定
    updateOnlineStatus(true);

    // ページを離れる時にオフラインに設定
    const handleBeforeUnload = () => {
      updateOnlineStatus(false);
    };

    // 可視性が変わった時の処理
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        updateOnlineStatus(true);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      updateOnlineStatus(false);
    };
  }, [currentUser]);

  // 30日経過したファイルの自動クリーンアップ
  useEffect(() => {
    if (!currentUser) return;

    async function runCleanup() {
      if (shouldRunCleanup()) {
        console.log('古いファイルのクリーンアップを開始...');
        const result = await cleanupOldFiles();
        recordCleanupRun();
        if (result.deletedCount > 0) {
          console.log(`クリーンアップ完了: ${result.deletedCount}件のファイルを削除`);
        }
      }
    }

    runCleanup();
  }, [currentUser]);

  // 更新ノートを取得
  useEffect(() => {
    async function fetchReleaseNotes() {
      try {
        const docRef = doc(db, 'settings', 'releaseNotes');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setReleaseNotes(docSnap.data().content || '');
        }
      } catch (error) {
        console.error('更新ノート取得エラー:', error);
      }
    }
    fetchReleaseNotes();
  }, []);

  // ストレージ使用量を取得
  useEffect(() => {
    async function fetchStorageUsage() {
      const usage = await getStorageUsage();
      setStorageUsage(usage);
    }
    fetchStorageUsage();
  }, []);

  // 更新ノートを保存
  async function saveReleaseNotes() {
    setSavingReleaseNotes(true);
    try {
      await setDoc(doc(db, 'settings', 'releaseNotes'), {
        content: releaseNotesEdit,
        updatedAt: serverTimestamp()
      });
      setReleaseNotes(releaseNotesEdit);
      setShowReleaseNotesEdit(false);
      alert('更新ノートを保存しました');
    } catch (error) {
      console.error('更新ノート保存エラー:', error);
      alert('更新ノートの保存に失敗しました');
    } finally {
      setSavingReleaseNotes(false);
    }
  }

  // 設定タイトルクリック処理（10回で編集モード）
  function handleSettingsTitleClick() {
    const newCount = settingsTitleClickCount + 1;
    setSettingsTitleClickCount(newCount);
    if (newCount >= 10) {
      setSettingsTitleClickCount(0);
      setReleaseNotesEdit(releaseNotes);
      setShowSettings(false);
      setShowReleaseNotesEdit(true);
    }
  }

  // メッセージ検索
  async function searchMessages() {
    if (!currentUser || !searchQuery.trim()) return;

    setSearching(true);
    setSearchResults([]);

    try {
      const results: { roomId: string; roomName: string; messageId: string; text: string; senderName: string; timestamp: Date }[] = [];

      // 全チャットルームのメッセージを検索
      for (const room of chatRooms) {
        const messagesSnapshot = await getDocs(collection(db, 'chatRooms', room.id, 'messages'));

        messagesSnapshot.forEach((doc) => {
          const data = doc.data();
          const text = data.text || '';

          // キーワードが含まれているか確認（大文字小文字を区別しない）
          if (text.toLowerCase().includes(searchQuery.toLowerCase())) {
            results.push({
              roomId: room.id,
              roomName: getRoomDisplayName(room),
              messageId: doc.id,
              text: text,
              senderName: data.senderName || '',
              timestamp: data.timestamp?.toDate() || new Date()
            });
          }
        });
      }

      // 新しい順にソート
      results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setSearchResults(results);
    } catch (error) {
      console.error('検索エラー:', error);
    } finally {
      setSearching(false);
    }
  }

  // 検索結果の時刻フォーマット
  function formatSearchTime(date: Date): string {
    return `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  }

  // メンバー招待モーダルを開く
  function openInviteModal(roomId: string, e: React.MouseEvent) {
    e.stopPropagation();
    const room = chatRooms.find(r => r.id === roomId);
    if (!room) return;

    // 既にメンバーのユーザーを除外するために招待選択をリセット
    setInviteSelectedUsers([]);
    setInviteRoomId(roomId);
    setShowInvite(true);
  }

  // メンバーを招待
  async function inviteMembers() {
    if (!inviteRoomId || inviteSelectedUsers.length === 0) return;

    try {
      const room = chatRooms.find(r => r.id === inviteRoomId);
      if (!room) return;

      // memberDetailsを更新
      const newMemberDetails = { ...room.memberDetails };
      inviteSelectedUsers.forEach(uid => {
        const user = users.find(u => u.uid === uid);
        if (user) {
          newMemberDetails[uid] = {
            displayName: user.displayName,
            photoURL: user.photoURL
          };
        }
      });

      await updateDoc(doc(db, 'chatRooms', inviteRoomId), {
        members: arrayUnion(...inviteSelectedUsers),
        memberDetails: newMemberDetails,
        updatedAt: serverTimestamp()
      });

      setShowInvite(false);
      setInviteRoomId(null);
      setInviteSelectedUsers([]);
    } catch (error) {
      console.error('メンバー招待エラー:', error);
      alert('メンバーの招待に失敗しました');
    }
  }

  // 招待可能なユーザーを取得（既存メンバー以外）
  function getInvitableUsers(roomId: string) {
    const room = chatRooms.find(r => r.id === roomId);
    if (!room) return [];
    return users.filter(user => !room.members.includes(user.uid));
  }

  // チャットルーム削除確認モーダルを開く
  function openDeleteConfirm(roomId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setDeleteRoomId(roomId);
    setShowDeleteConfirm(true);
  }

  // チャットルームを削除
  async function deleteRoom() {
    if (!deleteRoomId) return;

    try {
      // メッセージを全て削除（並列処理）
      const messagesSnapshot = await getDocs(
        collection(db, 'chatRooms', deleteRoomId, 'messages')
      );

      const deletePromises = messagesSnapshot.docs.map(msgDoc =>
        deleteDoc(doc(db, 'chatRooms', deleteRoomId, 'messages', msgDoc.id))
      );
      await Promise.all(deletePromises);

      // チャットルームを削除
      await deleteDoc(doc(db, 'chatRooms', deleteRoomId));

      setShowDeleteConfirm(false);
      setDeleteRoomId(null);
    } catch (error: unknown) {
      console.error('チャットルーム削除エラー:', error);
      const errorMessage = error instanceof Error ? error.message : '不明なエラー';
      alert(`チャットルームの削除に失敗しました: ${errorMessage}`);
    }
  }

  // プロフィール編集を開く
  function openProfileEdit() {
    setProfileName(currentUser?.displayName || '');
    setProfileImage(currentUser?.photoURL || null);
    setShowSettings(false);
    setShowProfile(true);
  }

  // プロフィール画像を選択
  async function handleProfileImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;

    // プレビュー用にBase64変換
    const reader = new FileReader();
    reader.onload = (event) => {
      setProfileImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  // プロフィールを保存
  async function saveProfile() {
    if (!currentUser || !profileName.trim()) return;

    setSavingProfile(true);
    try {
      let photoURL = currentUser.photoURL;

      // 新しい画像がある場合はアップロード
      if (profileImage && profileImage.startsWith('data:')) {
        const response = await fetch(profileImage);
        const blob = await response.blob();
        const storageRef = ref(storage, `profileImages/${currentUser.uid}`);
        await uploadBytes(storageRef, blob);
        photoURL = await getDownloadURL(storageRef);
        // ストレージ使用量を記録
        await addStorageUsage(blob.size);
        setStorageUsage(prev => prev + blob.size);
      }

      // Firebase Authのプロフィールを更新
      await updateProfile(currentUser, {
        displayName: profileName.trim(),
        photoURL: photoURL
      });

      // Firestoreのユーザー情報を更新
      await updateDoc(doc(db, 'users', currentUser.uid), {
        displayName: profileName.trim(),
        photoURL: photoURL
      });

      setShowProfile(false);
      alert('プロフィールを更新しました');
    } catch (error) {
      console.error('プロフィール更新エラー:', error);
      alert('プロフィールの更新に失敗しました');
    } finally {
      setSavingProfile(false);
    }
  }

  if (loading) {
    return <div className={styles.loading}>読み込み中...</div>;
  }

  return (
    <div className={styles.container}>
      {/* ヘッダー */}
      <header className={styles.header}>
        <div className={styles.storageIndicator}>
          <div className={styles.storageBarContainer}>
            <div
              className={`${styles.storageBar} ${
                calculateUsagePercent(storageUsage) > 80 ? styles.warning : ''
              } ${calculateUsagePercent(storageUsage) > 95 ? styles.danger : ''}`}
              style={{ width: `${Math.min(100, calculateUsagePercent(storageUsage))}%` }}
            />
          </div>
          <span className={styles.storageText}>
            {formatBytes(storageUsage)} / {formatBytes(STORAGE_FREE_LIMIT)}
          </span>
        </div>
        <div className={styles.headerButtons}>
          <button
            className={styles.newChatButton}
            onClick={() => setShowNewChat(true)}
            title="チャット作成"
          >
            チャット作成
          </button>
          <button
            className={styles.usersButton}
            onClick={() => setShowUsers(true)}
            title="ユーザー"
          >
            ユーザー
          </button>
          <button
            className={styles.searchButton}
            onClick={() => setShowSearch(true)}
            title="検索"
          >
            <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </button>
          <button
            className={styles.settingsButton}
            onClick={() => setShowSettings(true)}
            title="設定"
          >
            <span className={styles.settingsIcon}>
              <span></span>
              <span></span>
              <span></span>
            </span>
          </button>
        </div>
      </header>

      {/* チャット一覧 */}
      <div className={styles.chatList}>
        {chatRooms.length === 0 ? (
          <div className={styles.empty}>
            <p>チャットがありません</p>
            <p>右上の「+」ボタンから新しいチャットを始めましょう</p>
          </div>
        ) : (
          chatRooms.map((room) => (
            <div
              key={room.id}
              className={styles.chatItem}
              onClick={() => navigate(`/chat/${room.id}`)}
            >
              <div className={styles.avatar}>
                {room.photoURL ? (
                  <img src={room.photoURL} alt="" className={styles.avatarImage} />
                ) : null}
              </div>
              <div className={styles.chatInfo}>
                <div className={styles.chatHeader}>
                  <span className={styles.chatName}>
                    {unreadCounts[room.id] > 0 && (
                      <span className={styles.unreadBadge}>{unreadCounts[room.id]}</span>
                    )}
                    {getRoomDisplayName(room)}
                    {room.type === 'direct' && getDirectChatPartnerOnlineStatus(room) !== null && (
                      <span className={getDirectChatPartnerOnlineStatus(room) ? styles.chatNameIndicatorOnline : styles.chatNameIndicatorOffline}></span>
                    )}
                    {room.type === 'group' && (
                      <span className={styles.memberCount}>({room.members.length}人)</span>
                    )}
                  </span>
                </div>
                <div className={styles.chatFooter}>
                  <p className={styles.lastMessage}>
                    {room.lastMessage
                      ? `${room.lastMessage.senderName}: ${room.lastMessage.text}`
                      : 'メッセージがありません'}
                  </p>
                </div>
              </div>
              <div className={styles.chatActions}>
                {room.type === 'group' && (
                  <button
                    className={styles.inviteButton}
                    onClick={(e) => openInviteModal(room.id, e)}
                    title="メンバー招待"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="8.5" cy="7" r="4" />
                      <line x1="20" y1="8" x2="20" y2="14" />
                      <line x1="23" y1="11" x2="17" y2="11" />
                    </svg>
                  </button>
                )}
                <button
                  className={styles.deleteButton}
                  onClick={(e) => openDeleteConfirm(room.id, e)}
                  title="削除"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 新規チャットモーダル */}
      {showNewChat && (
        <div className={styles.modal} onClick={() => setShowNewChat(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2>新しいチャット</h2>
            <div className={styles.modalButtons}>
              <button onClick={() => { setShowNewChat(false); setShowNewGroup(true); }}>
                グループを作成
              </button>
            </div>
            <h3>ユーザーを選択</h3>
            <div className={styles.userList}>
              {users.length === 0 ? (
                <p className={styles.noUsers}>他のユーザーがいません</p>
              ) : (
                users.map((user) => (
                  <div
                    key={user.uid}
                    className={styles.userItem}
                    onClick={() => startDirectChat(user)}
                  >
                    <span className={styles.userAvatar}>
                      <span className={user.isOnline ? styles.onlineIndicator : styles.offlineIndicator}></span>
                    </span>
                    <span className={styles.userName}>{user.displayName}</span>
                  </div>
                ))
              )}
            </div>
            <button className={styles.closeButton} onClick={() => setShowNewChat(false)}>
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* グループ作成モーダル */}
      {showNewGroup && (
        <div className={styles.modal} onClick={() => setShowNewGroup(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2>グループを作成</h2>

            {/* グループ画像選択 */}
            <div className={styles.groupImageSection}>
              <input
                type="file"
                ref={groupImageInputRef}
                onChange={handleGroupImageChange}
                accept="image/*"
                style={{ display: 'none' }}
              />
              <div
                className={styles.groupImagePreview}
                onClick={() => groupImageInputRef.current?.click()}
              >
                {groupImage ? (
                  <img src={groupImage} alt="グループ画像" />
                ) : (
                  <span className={styles.groupImagePlaceholder}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  </span>
                )}
                <div className={styles.groupImageOverlay}>
                  <span>画像を選択</span>
                </div>
              </div>
              <p className={styles.groupImageHint}>タップして画像を設定（任意）</p>
            </div>

            <div className={styles.inputGroup}>
              <input
                type="text"
                placeholder="グループ名"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className={styles.groupNameInput}
              />
              {!groupName.trim() && (
                <p className={styles.inputHint}>グループ名を入力してください</p>
              )}
            </div>
            <h3>メンバーを選択</h3>
            <div className={styles.userList}>
              {users.map((user) => (
                <div
                  key={user.uid}
                  className={`${styles.userItem} ${selectedUsers.includes(user.uid) ? styles.selected : ''}`}
                  onClick={() => {
                    if (selectedUsers.includes(user.uid)) {
                      setSelectedUsers(selectedUsers.filter(id => id !== user.uid));
                    } else {
                      setSelectedUsers([...selectedUsers, user.uid]);
                    }
                  }}
                >
                  <span className={styles.userAvatar}>
                    <span className={user.isOnline ? styles.onlineIndicator : styles.offlineIndicator}></span>
                  </span>
                  <span className={styles.userName}>{user.displayName}</span>
                  {selectedUsers.includes(user.uid) && <span className={styles.checkmark}>✓</span>}
                </div>
              ))}
            </div>
            <div className={styles.modalActions}>
              <button
                className={styles.createButton}
                onClick={createGroupChat}
                disabled={selectedUsers.length === 0 || !groupName.trim()}
              >
                作成
              </button>
              <button className={styles.closeButton} onClick={() => setShowNewGroup(false)}>
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 設定モーダル */}
      {showSettings && (
        <div className={styles.modal} onClick={() => setShowSettings(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 onClick={handleSettingsTitleClick} style={{ cursor: 'default' }}>設定</h2>

            <div className={styles.settingsMenu}>
              <button className={styles.settingsMenuItem} onClick={openProfileEdit}>
                <span className={styles.menuText}>プロフィール</span>
                <span className={styles.menuArrow}>›</span>
              </button>
              <button className={styles.settingsMenuItem} onClick={() => { setShowSettings(false); setShowTheme(true); }}>
                <span className={styles.menuText}>テーマ</span>
                <span className={styles.menuArrow}>›</span>
              </button>
              <button className={styles.settingsMenuItem} onClick={() => { setShowSettings(false); setShowNotificationSettings(true); }}>
                <span className={styles.menuText}>通知設定</span>
                <span className={styles.menuArrow}>›</span>
              </button>
              <button className={styles.settingsMenuItem} onClick={() => { setShowSettings(false); setShowReleaseNotes(true); }}>
                <span className={styles.menuText}>更新ノート</span>
                <span className={styles.menuArrow}>›</span>
              </button>
              <button className={styles.settingsMenuItemLogout} onClick={handleLogout}>
                <span className={styles.menuText}>ログアウト</span>
              </button>
            </div>

            <button className={styles.closeButton} onClick={() => setShowSettings(false)}>
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* プロフィール編集モーダル */}
      {showProfile && (
        <div className={styles.modal} onClick={() => setShowProfile(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2>プロフィール編集</h2>

            <div className={styles.profileEditSection}>
              <div className={styles.profileImageEdit}>
                <input
                  type="file"
                  ref={profileImageInputRef}
                  onChange={handleProfileImageChange}
                  accept="image/*"
                  style={{ display: 'none' }}
                />
                <div
                  className={styles.profileImagePreview}
                  onClick={() => profileImageInputRef.current?.click()}
                >
                  {profileImage ? (
                    <img src={profileImage} alt="プロフィール" />
                  ) : (
                    <span className={styles.profileImagePlaceholder}></span>
                  )}
                  <div className={styles.profileImageOverlay}>
                    <span>変更</span>
                  </div>
                </div>
                <p className={styles.profileImageHint}>タップして画像を変更</p>
              </div>

              <div className={styles.profileNameEdit}>
                <label>表示名</label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="名前を入力"
                  className={styles.profileNameInput}
                />
              </div>

              <p className={styles.profileEmail}>{currentUser?.email}</p>
            </div>

            <div className={styles.modalActions}>
              <button
                className={styles.createButton}
                onClick={saveProfile}
                disabled={savingProfile || !profileName.trim()}
              >
                {savingProfile ? '保存中...' : '保存'}
              </button>
              <button className={styles.closeButton} onClick={() => setShowProfile(false)}>
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* テーマ設定モーダル */}
      {showTheme && (
        <div className={styles.modal} onClick={() => setShowTheme(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2>テーマ設定</h2>

            <div className={styles.themeOptions}>
              <button
                className={`${styles.themeOptionButton} ${theme === 'light' ? styles.active : ''}`}
                onClick={() => toggleTheme('light')}
              >
                <span className={styles.themeName}>ライトモード</span>
                {theme === 'light' && <span className={styles.themeCheck}>✓</span>}
              </button>
              <button
                className={`${styles.themeOptionButton} ${theme === 'dark' ? styles.active : ''}`}
                onClick={() => toggleTheme('dark')}
              >
                <span className={styles.themeName}>ダークモード</span>
                {theme === 'dark' && <span className={styles.themeCheck}>✓</span>}
              </button>
            </div>

            <button className={styles.closeButton} onClick={() => setShowTheme(false)}>
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* 検索モーダル */}
      {showSearch && (
        <div className={styles.modal} onClick={() => setShowSearch(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2>メッセージ検索</h2>

            <div className={styles.searchInputArea}>
              <input
                type="text"
                placeholder="キーワードを入力"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchMessages()}
                className={styles.searchInput}
                autoFocus
              />
              <button
                className={styles.searchSubmitButton}
                onClick={searchMessages}
                disabled={searching || !searchQuery.trim()}
              >
                {searching ? '検索中...' : '検索'}
              </button>
            </div>

            <div className={styles.searchResults}>
              {searching ? (
                <p className={styles.searchStatus}>検索中...</p>
              ) : searchResults.length === 0 && searchQuery.trim() ? (
                <p className={styles.searchStatus}>検索結果がありません</p>
              ) : (
                searchResults.map((result, index) => (
                  <div
                    key={`${result.roomId}-${result.messageId}-${index}`}
                    className={styles.searchResultItem}
                    onClick={() => {
                      navigate(`/chat/${result.roomId}?messageId=${result.messageId}`);
                      setShowSearch(false);
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                  >
                    <div className={styles.searchResultHeader}>
                      <span className={styles.searchResultRoom}>{result.roomName}</span>
                      <span className={styles.searchResultTime}>{formatSearchTime(result.timestamp)}</span>
                    </div>
                    <p className={styles.searchResultSender}>{result.senderName}</p>
                    <p className={styles.searchResultText}>{result.text}</p>
                  </div>
                ))
              )}
            </div>

            <button
              className={styles.closeButton}
              onClick={() => {
                setShowSearch(false);
                setSearchQuery('');
                setSearchResults([]);
              }}
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* メンバー招待モーダル */}
      {showInvite && inviteRoomId && (
        <div className={styles.modal} onClick={() => setShowInvite(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2>メンバー招待</h2>
            <h3>招待するユーザーを選択</h3>
            <div className={styles.userList}>
              {getInvitableUsers(inviteRoomId).length === 0 ? (
                <p className={styles.noUsers}>招待可能なユーザーがいません</p>
              ) : (
                getInvitableUsers(inviteRoomId).map((user) => (
                  <div
                    key={user.uid}
                    className={`${styles.userItem} ${inviteSelectedUsers.includes(user.uid) ? styles.selected : ''}`}
                    onClick={() => {
                      if (inviteSelectedUsers.includes(user.uid)) {
                        setInviteSelectedUsers(inviteSelectedUsers.filter(id => id !== user.uid));
                      } else {
                        setInviteSelectedUsers([...inviteSelectedUsers, user.uid]);
                      }
                    }}
                  >
                    <span className={styles.userAvatar}>
                      <span className={user.isOnline ? styles.onlineIndicator : styles.offlineIndicator}></span>
                    </span>
                    <span className={styles.userName}>{user.displayName}</span>
                    {inviteSelectedUsers.includes(user.uid) && <span className={styles.checkmark}>✓</span>}
                  </div>
                ))
              )}
            </div>
            <div className={styles.modalActions}>
              <button
                className={styles.createButton}
                onClick={inviteMembers}
                disabled={inviteSelectedUsers.length === 0}
              >
                招待
              </button>
              <button className={styles.closeButton} onClick={() => setShowInvite(false)}>
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 削除確認モーダル */}
      {showDeleteConfirm && deleteRoomId && (
        <div className={styles.modal} onClick={() => setShowDeleteConfirm(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2>チャットルームを削除</h2>
            <p className={styles.deleteWarning}>
              このチャットルームを削除しますか？<br />
              すべてのメッセージが削除され、元に戻すことはできません。
            </p>
            <div className={styles.modalActions}>
              <button
                className={styles.deleteConfirmButton}
                onClick={deleteRoom}
              >
                削除
              </button>
              <button className={styles.closeButton} onClick={() => setShowDeleteConfirm(false)}>
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ユーザー一覧モーダル */}
      {showUsers && (
        <div className={styles.modal} onClick={() => setShowUsers(false)}>
          <div className={styles.usersModalContent} onClick={(e) => e.stopPropagation()}>
            <h2>ユーザー</h2>
            {users.length === 0 ? (
              <p className={styles.noUsers}>他のユーザーがいません</p>
            ) : (
              <div className={styles.usersModalList}>
                {/* オンラインユーザー */}
                {users.filter(u => u.isOnline).length > 0 && (
                  <div className={styles.userSection}>
                    <div className={styles.userSectionHeader}>
                      <span className={styles.onlineDot}></span>
                      オンライン ({users.filter(u => u.isOnline).length})
                    </div>
                    {users.filter(u => u.isOnline).map((user) => (
                      <div
                        key={user.uid}
                        className={styles.userListItem}
                        onClick={() => { startDirectChat(user); setShowUsers(false); }}
                      >
                        <div className={styles.userListAvatar}>
                          {user.photoURL ? (
                            <img src={user.photoURL} alt="" className={styles.userListAvatarImage} />
                          ) : null}
                        </div>
                        <div className={styles.userListInfo}>
                          <span className={styles.userListName}>
                            {user.displayName}
                            <span className={styles.userListNameIndicatorOnline}></span>
                          </span>
                          <span className={styles.userListStatus}>オンライン</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* オフラインユーザー */}
                {users.filter(u => !u.isOnline).length > 0 && (
                  <div className={styles.userSection}>
                    <div className={styles.userSectionHeader}>
                      <span className={styles.offlineDot}></span>
                      オフライン ({users.filter(u => !u.isOnline).length})
                    </div>
                    {users.filter(u => !u.isOnline).map((user) => (
                      <div
                        key={user.uid}
                        className={styles.userListItem}
                        onClick={() => { startDirectChat(user); setShowUsers(false); }}
                      >
                        <div className={styles.userListAvatar}>
                          {user.photoURL ? (
                            <img src={user.photoURL} alt="" className={styles.userListAvatarImage} />
                          ) : null}
                        </div>
                        <div className={styles.userListInfo}>
                          <span className={styles.userListName}>
                            {user.displayName}
                            <span className={styles.userListNameIndicatorOffline}></span>
                          </span>
                          <span className={styles.userListStatusOffline}>
                            {user.lastSeen
                              ? `最終アクセス: ${formatLastSeen(user.lastSeen)}`
                              : 'オフライン'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button className={styles.closeButton} onClick={() => setShowUsers(false)}>
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* 更新ノート表示モーダル */}
      {showReleaseNotes && (
        <div className={styles.modal} onClick={() => setShowReleaseNotes(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2>更新ノート</h2>
            <div className={styles.releaseNotesContent}>
              {releaseNotes ? (
                <pre className={styles.releaseNotesText}>{releaseNotes}</pre>
              ) : (
                <p className={styles.noReleaseNotes}>更新ノートはありません</p>
              )}
            </div>
            <button className={styles.closeButton} onClick={() => setShowReleaseNotes(false)}>
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* 更新ノート編集モーダル */}
      {showReleaseNotesEdit && (
        <div className={styles.modal} onClick={() => setShowReleaseNotesEdit(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2>更新ノート編集</h2>
            <textarea
              className={styles.releaseNotesTextarea}
              value={releaseNotesEdit}
              onChange={(e) => setReleaseNotesEdit(e.target.value)}
              placeholder="更新ノートを入力してください..."
              rows={10}
            />
            <div className={styles.modalActions}>
              <button
                className={styles.createButton}
                onClick={saveReleaseNotes}
                disabled={savingReleaseNotes}
              >
                {savingReleaseNotes ? '保存中...' : '保存'}
              </button>
              <button className={styles.closeButton} onClick={() => setShowReleaseNotesEdit(false)}>
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 通知設定モーダル */}
      {showNotificationSettings && (
        <div className={styles.modal} onClick={() => setShowNotificationSettings(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2>通知設定</h2>

            <div className={styles.notificationSettings}>
              {/* 通知の有効/無効 */}
              <div className={styles.notificationOption}>
                <div className={styles.notificationOptionText}>
                  <span className={styles.notificationOptionLabel}>通知を有効にする</span>
                  <span className={styles.notificationOptionDescription}>
                    新しいメッセージの通知を受け取ります
                  </span>
                </div>
                <label className={styles.toggleSwitch}>
                  <input
                    type="checkbox"
                    checked={notificationSettings.enableNotifications}
                    onChange={(e) => {
                      updateNotificationSettings({
                        ...notificationSettings,
                        enableNotifications: e.target.checked
                      });
                    }}
                  />
                  <span className={styles.toggleSlider}></span>
                </label>
              </div>

              {/* メッセージ内容の表示 */}
              <div className={styles.notificationOption}>
                <div className={styles.notificationOptionText}>
                  <span className={styles.notificationOptionLabel}>メッセージ内容を表示</span>
                  <span className={styles.notificationOptionDescription}>
                    通知にメッセージ内容を表示します（OFFで「メッセージが届きました」と表示）
                  </span>
                </div>
                <label className={styles.toggleSwitch}>
                  <input
                    type="checkbox"
                    checked={notificationSettings.showMessageContent}
                    disabled={!notificationSettings.enableNotifications}
                    onChange={(e) => {
                      updateNotificationSettings({
                        ...notificationSettings,
                        showMessageContent: e.target.checked
                      });
                    }}
                  />
                  <span className={styles.toggleSlider}></span>
                </label>
              </div>

              {/* Electron専用: スタートアップ設定 */}
              {isElectronEnv() && (
                <>
                  <div className={styles.notificationSeparator}></div>
                  <div className={styles.startupOption}>
                    <div className={styles.notificationOptionText}>
                      <span className={styles.notificationOptionLabel}>
                        スタートアップに登録
                        <span className={styles.startupBadge}>デスクトップ</span>
                      </span>
                      <span className={styles.notificationOptionDescription}>
                        Windows起動時にアプリを自動で起動します
                      </span>
                    </div>
                    <label className={styles.toggleSwitch}>
                      <input
                        type="checkbox"
                        checked={startupEnabled}
                        onChange={(e) => setStartupEnabled(e.target.checked)}
                      />
                      <span className={styles.toggleSlider}></span>
                    </label>
                  </div>
                </>
              )}
            </div>

            <button className={styles.closeButton} onClick={() => setShowNotificationSettings(false)}>
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
