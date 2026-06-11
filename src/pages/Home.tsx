// ホーム画面（チャット一覧）

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  query,
  orderBy,
  limit,
  serverTimestamp,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
// Note: updateDoc is still used for group invitation, profile updates, etc.
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateProfile } from 'firebase/auth';
import { db, storage } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { getStorageUsage, calculateUsagePercent, setStorageUsageValue } from '../lib/storageUsage';
import { useElectronNotification, isElectronEnv } from '../hooks/useElectronNotification';
import { useFCMToken } from '../hooks/useFCMToken';
import { useNotificationDiagnostics } from '../hooks/useNotificationDiagnostics';
import { useRoomNotificationSettings } from '../hooks/useRoomNotificationSettings';
import { useUsers } from '../hooks/useUsers';
import { useInviteMembers } from '../hooks/useInviteMembers';
import { useHomeModals } from '../hooks/useHomeModals';
import { useChatRooms } from '../hooks/useChatRooms';
import { ChatRoomList } from '../components/home';
import type { ChatRoom, User } from '../types';
import { getDirectRoomId, getDirectRoomKey, getRoomDisplayName } from '../utils/room';
import { handleGroupImageChange as convertGroupImageToBase64 } from '../utils/image';
import { SEARCH_LIMIT_PER_ROOM, SEARCH_RESULTS_LIMIT } from '../constants';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import styles from './Home.module.css';
import { SettingsModal, ThemeModal, ProfileEditModal, NotificationSettingsModal, ReleaseNotesModal, ReleaseNotesEditModal, StorageEditModal, SearchModal, NewChatModal, NewGroupModal, InviteMemberModal, DeleteRoomConfirmModal, UsersListModal, UserManagementModal, UserEditModal, DeleteUserConfirmModal } from '../components/home/modals';

export default function Home() {
  const { currentUser, isAdmin, logout } = useAuth();
  const { chatRooms, loading } = useChatRooms(currentUser);
  const { modals, openModal, closeModal } = useHomeModals();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ roomId: string; roomName: string; messageId: string; text: string; senderName: string; timestamp: Date }[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviteRoomId, setInviteRoomId] = useState<string | null>(null);
  const [deleteRoomId, setDeleteRoomId] = useState<string | null>(null);
  // M-16: 削除実行中フラグ
  const [isDeletingRoom, setIsDeletingRoom] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [groupImage, setGroupImage] = useState<string | null>(null);
  const [profileName, setProfileName] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    return (saved === 'dark') ? 'dark' : 'light';
  });
  const [releaseNotes, setReleaseNotes] = useState('');
  const [releaseNotesEdit, setReleaseNotesEdit] = useState('');
  const [savingReleaseNotes, setSavingReleaseNotes] = useState(false);
  const [settingsTitleClickCount, setSettingsTitleClickCount] = useState(0);
  const [storageUsage, setStorageUsage] = useState<number>(0);
  const [storageEditValue, setStorageEditValue] = useState('');
  const [appVersion, setAppVersion] = useState<string>('');
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'latest' | 'error'>('idle');
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);

  // ユーザー管理機能用
  const [usersTitleClickCount, setUsersTitleClickCount] = useState(0);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<User | null>(null);
  const [editUserName, setEditUserName] = useState('');
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  const { showToast } = useToast();
  const navigate = useNavigate();
  const { users, fetchUsers } = useUsers();
  const {
    selectedUsers: inviteSelectedUsers,
    setSelectedUsers: setInviteSelectedUsers,
    getInvitableUsers,
    inviteMembers
  } = useInviteMembers(users);

  // Electron通知設定フック
  const { settings: notificationSettings, updateSettings: updateNotificationSettings } = useElectronNotification();
  const { requestPermissionAndRegister } = useFCMToken();
  const { diagnostics: notificationDiagnostics, refresh: refreshNotificationDiagnostics, loading: diagnosticsLoading } = useNotificationDiagnostics();

  // ルームごとの通知設定フック
  const { isRoomMuted, mutedRooms, toggleMute } = useRoomNotificationSettings();

  // 1対1チャットの相手ユーザーのオンラインステータスを購読
  const directUserIds = useMemo(() => {
    return chatRooms
      .filter(r => r.type === 'direct')
      .map(r => r.members.find(uid => uid !== currentUser?.uid))
      .filter((uid): uid is string => !!uid);
  }, [chatRooms, currentUser?.uid]);
  const onlineStatusMap = useOnlineStatus(directUserIds);

  // ユーザー一覧モーダル用のオンラインステータス（モーダル表示中のみ購読）
  const allUserIds = useMemo(() => {
    if (!modals.showUsers) return [];
    return users.map(u => u.uid);
  }, [modals.showUsers, users]);
  const allUsersOnlineStatusMap = useOnlineStatus(allUserIds);

  // chatRoomsから直接未読数を取得（Cloud Functionsが管理するunreadCountsフィールドを参照）
  const getUnreadCount = (room: ChatRoom): number => {
    return room.unreadCounts?.[currentUser?.uid || ''] ?? 0;
  };

  // 1対1チャットを作成または開く
  async function startDirectChat(otherUser: User) {
    if (!currentUser) return;
    const directRoomId = getDirectRoomId(currentUser.uid, otherUser.uid);
    const directKey = getDirectRoomKey(currentUser.uid, otherUser.uid);

    // 既存のチャットルームを探す
    const existingRoom = chatRooms.find(
      room => room.type === 'direct' &&
        (room.id === directRoomId || room.directKey === directKey ||
        (room.members.includes(otherUser.uid) &&
        room.members.includes(currentUser.uid)
        ))
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
      directKey,
      lastMessage: null,
      unreadCounts: {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    const roomRef = doc(db, 'chatRooms', directRoomId);
    const roomSnap = await getDoc(roomRef);
    if (!roomSnap.exists()) {
      await setDoc(roomRef, newRoom);
    }
    navigate(`/chat/${directRoomId}`);
    closeModal('showNewChat');
  }

  // グループチャットを作成
  async function createGroupChat() {
    if (!currentUser || selectedUsers.length === 0 || !groupName.trim()) return;

    try {
      const roomRef = doc(collection(db, 'chatRooms'));
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

      const newRoom = {
        name: groupName.trim(),
        type: 'group',
        photoURL: null,
        photoStoragePath: null,
        photoFileSize: null,
        members: [currentUser.uid, ...selectedUsers],
        memberDetails,
        lastMessage: null,
        unreadCounts: {},
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await setDoc(roomRef, newRoom);

      if (groupImage && groupImage.startsWith('data:')) {
        try {
          const response = await fetch(groupImage);
          const blob = await response.blob();
          const timestamp = Date.now();
          // ファイル名に日本語やスペースが入らないようにする
          const safeFileName = `group_${timestamp}`;
          const storagePath = `groupImages/${roomRef.id}/${safeFileName}`;
          const storageRef = ref(storage, storagePath);
          await uploadBytes(storageRef, blob);
          const groupPhotoURL = await getDownloadURL(storageRef);
          await updateDoc(roomRef, {
            photoURL: groupPhotoURL,
            photoStoragePath: storagePath,
            photoFileSize: blob.size,
            updatedAt: serverTimestamp(),
          });
        } catch (imageError) {
          console.error('グループ画像アップロードエラー:', imageError);
          showToast('warning', 'グループは作成しましたが、画像のアップロードに失敗しました');
        }
      }

      navigate(`/chat/${roomRef.id}`);
      closeModal('showNewGroup');
      setSelectedUsers([]);
      setGroupName('');
      setGroupImage(null);
    } catch (error: unknown) {
      console.error('グループ作成エラー:', error);
      const errorMessage = error instanceof Error ? error.message : '不明なエラー';
      showToast('error', `グループの作成に失敗しました: ${errorMessage}`);
    }
  }

  // グループ画像を選択
  async function handleGroupImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const imageData = await convertGroupImageToBase64(file);
      setGroupImage(imageData);
    } catch (error) {
      console.error('グループ画像変換エラー:', error);
      showToast('error', '画像の読み込みに失敗しました');
    }
  }

  async function handleLogout() {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('ログアウトエラー:', error);
    }
  }

  // お気に入り切り替え
  const toggleFavorite = async (roomId: string, e: React.MouseEvent) => {
    e.stopPropagation();  // チャット選択を防ぐ
    if (!currentUser) return;

    const roomRef = doc(db, 'chatRooms', roomId);
    const room = chatRooms.find(r => r.id === roomId);

    if (!room) return;

    const isFavorite = room.favorites?.includes(currentUser.uid);

    try {
      if (isFavorite) {
        await updateDoc(roomRef, {
          favorites: arrayRemove(currentUser.uid)
        });
      } else {
        await updateDoc(roomRef, {
          favorites: arrayUnion(currentUser.uid)
        });
      }
    } catch (error) {
      console.error('お気に入り更新エラー:', error);
    }
  };

  // テーマ切り替え
  function toggleTheme(newTheme: 'light' | 'dark') {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    // Electron環境ではWindowsのタイトルバー（ネイティブ枠）の明暗も連動させる
    window.electronAPI?.setTitleBarTheme?.(newTheme);
  }

  // 初期テーマ設定（マウント時に localStorage の値を一度だけ適用）
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // M-18: ストレージ 80% / 95% 警告（同一しきい値の連発を避けるため localStorage に最後の警告レベルを保存）
  useEffect(() => {
    if (storageUsage === 0) return;
    const percent = calculateUsagePercent(storageUsage);
    const STORAGE_KEY = 'artics:lastStorageWarnLevel';
    const lastLevel = localStorage.getItem(STORAGE_KEY) || 'none';
    let currentLevel: 'none' | 'warning' | 'danger' = 'none';
    if (percent > 95) currentLevel = 'danger';
    else if (percent > 80) currentLevel = 'warning';

    if (currentLevel === 'danger' && lastLevel !== 'danger') {
      showToast('error', `ストレージ使用量が ${Math.round(percent)}% です。古いファイルの削除をご検討ください。`);
      localStorage.setItem(STORAGE_KEY, 'danger');
    } else if (currentLevel === 'warning' && lastLevel === 'none') {
      showToast('warning', `ストレージ使用量が ${Math.round(percent)}% を超えました。`);
      localStorage.setItem(STORAGE_KEY, 'warning');
    } else if (currentLevel === 'none' && lastLevel !== 'none') {
      // 使用量が下がったらリセット
      localStorage.setItem(STORAGE_KEY, 'none');
    }
  }, [storageUsage, showToast]);

  // アプリバージョンを取得
  useEffect(() => {
    async function fetchAppVersion() {
      if (isElectronEnv() && window.electronAPI?.getAppVersion) {
        // Electron: IPCから取得
        const version = await window.electronAPI.getAppVersion();
        setAppVersion(version);
      } else {
        // PWA/ブラウザ: ビルド時にpackage.jsonのバージョンが埋め込まれる
        // @ts-expect-error __APP_VERSION__ is defined in vite.config.ts
        const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '';
        if (version) {
          setAppVersion(version);
        }
      }
    }
    fetchAppVersion();
  }, []);

  // 常に手前に表示の初期値を取得（Electron環境のみ）
  useEffect(() => {
    if (isElectronEnv() && window.electronAPI?.getAlwaysOnTop) {
      window.electronAPI.getAlwaysOnTop().then(setAlwaysOnTop);
    }
  }, []);

  // 常に手前に表示をトグル
  async function toggleAlwaysOnTop() {
    if (!isElectronEnv() || !window.electronAPI?.setAlwaysOnTop) return;
    const newValue = !alwaysOnTop;
    const success = await window.electronAPI.setAlwaysOnTop(newValue);
    if (success) {
      setAlwaysOnTop(newValue);
    }
  }

  // アップデートを確認
  async function checkForUpdates() {
    if (!isElectronEnv() || !window.electronAPI?.checkForUpdates) return;

    setUpdateStatus('checking');
    try {
      const result = await window.electronAPI.checkForUpdates();
      if (result.isDev) {
        setUpdateStatus('latest');
      } else if (result.error) {
        setUpdateStatus('error');
      } else if (result.available) {
        setUpdateStatus('available');
      } else {
        setUpdateStatus('latest');
      }
    } catch {
      setUpdateStatus('error');
    }
  }

  // ストレージ使用量を保存
  async function saveStorageUsage() {
    if (!isAdmin) {
      showToast('error', '管理者権限が必要です');
      return;
    }

    try {
      const mbValue = parseFloat(storageEditValue);
      if (isNaN(mbValue) || mbValue < 0) {
        showToast('warning', '正しい数値を入力してください');
        return;
      }
      const bytes = Math.round(mbValue * 1024 * 1024);
      await setStorageUsageValue(bytes);
      setStorageUsage(bytes);
      closeModal('showStorageEdit');
      showToast('success', 'ストレージ使用量を更新しました');
    } catch (error) {
      console.error('ストレージ使用量の更新エラー:', error);
      showToast('error', '更新に失敗しました');
    }
  }

  // 更新ノートを保存
  async function saveReleaseNotes() {
    if (!isAdmin) {
      showToast('error', '管理者権限が必要です');
      return;
    }

    setSavingReleaseNotes(true);
    try {
      await setDoc(doc(db, 'settings', 'releaseNotes'), {
        content: releaseNotesEdit,
        updatedAt: serverTimestamp()
      });
      setReleaseNotes(releaseNotesEdit);
      closeModal('showReleaseNotesEdit');
      showToast('success', '更新ノートを保存しました');
    } catch (error) {
      console.error('更新ノート保存エラー:', error);
      showToast('error', '更新ノートの保存に失敗しました');
    } finally {
      setSavingReleaseNotes(false);
    }
  }

  // 設定タイトルクリック処理（10回で編集モード）
  function handleSettingsTitleClick() {
    if (!isAdmin) return;
    const newCount = settingsTitleClickCount + 1;
    setSettingsTitleClickCount(newCount);
    if (newCount >= 10) {
      setSettingsTitleClickCount(0);
      setReleaseNotesEdit(releaseNotes);
      closeModal('showSettings');
      openModal('showReleaseNotesEdit');
    }
  }

  // ユーザー一覧タイトルの5回クリック処理
  function handleUsersTitleClick() {
    if (!isAdmin) return;
    const newCount = usersTitleClickCount + 1;
    setUsersTitleClickCount(newCount);
    if (newCount >= 5) {
      setUsersTitleClickCount(0);
      closeModal('showUsers');
      openModal('showUserManagement');
    }
    // 3秒でリセット
    setTimeout(() => setUsersTitleClickCount(0), 3000);
  }

  // ユーザー編集を開く
  function openUserEdit(user: User) {
    if (!isAdmin) {
      showToast('error', '管理者権限が必要です');
      return;
    }
    setSelectedUserForEdit(user);
    setEditUserName(user.displayName);
  }

  // ユーザー情報を保存
  async function saveUserEdit() {
    if (!selectedUserForEdit || !editUserName.trim()) return;
    if (!isAdmin) {
      showToast('error', '管理者権限が必要です');
      return;
    }

    try {
      await updateDoc(doc(db, 'users', selectedUserForEdit.uid), {
        displayName: editUserName.trim()
      });
      setSelectedUserForEdit(null);
      showToast('success', 'ユーザー情報を更新しました');
    } catch (error) {
      console.error('ユーザー更新エラー:', error);
      showToast('error', 'ユーザー情報の更新に失敗しました');
    }
  }

  // ユーザー削除確認を開く
  function openDeleteUserConfirm(user: User) {
    if (!isAdmin) {
      showToast('error', '管理者権限が必要です');
      return;
    }
    setUserToDelete(user);
    openModal('showDeleteUserConfirm');
  }

  // ユーザーを削除
  async function deleteUser() {
    if (!userToDelete) return;
    if (!isAdmin) {
      showToast('error', '管理者権限が必要です');
      return;
    }

    try {
      // Firestoreからユーザードキュメントを削除
      await deleteDoc(doc(db, 'users', userToDelete.uid));

      closeModal('showDeleteUserConfirm');
      setUserToDelete(null);
      showToast('success', 'ユーザーを削除しました（Firebase Authからの削除は管理コンソールで行ってください）');
    } catch (error) {
      console.error('ユーザー削除エラー:', error);
      showToast('error', 'ユーザーの削除に失敗しました');
    }
  }

  // メッセージ検索
  async function searchMessages() {
    if (!currentUser || !searchQuery.trim()) return;

    setSearching(true);
    setSearchResults([]);

    try {
      const results: { roomId: string; roomName: string; messageId: string; text: string; senderName: string; timestamp: Date }[] = [];
      const normalizedQuery = searchQuery.toLowerCase();

      // 全チャットルームのメッセージを検索
      for (const room of chatRooms) {
        const messagesQuery = query(
          collection(db, 'chatRooms', room.id, 'messages'),
          orderBy('createdAt', 'desc'),
          limit(SEARCH_LIMIT_PER_ROOM)
        );
        const messagesSnapshot = await getDocs(messagesQuery);

        messagesSnapshot.forEach((doc) => {
          const data = doc.data();
          const text = data.text || '';

          // キーワードが含まれているか確認（大文字小文字を区別しない）
          if (text.toLowerCase().includes(normalizedQuery)) {
            results.push({
              roomId: room.id,
              roomName: getRoomDisplayName(room, currentUser?.uid),
              messageId: doc.id,
              text: text,
              senderName: data.senderName || '',
              timestamp: data.createdAt?.toDate() || data.timestamp?.toDate() || new Date()
            });
          }
        });
      }

      // 新しい順にソート
      results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setSearchResults(results.slice(0, SEARCH_RESULTS_LIMIT));
    } catch (error) {
      console.error('検索エラー:', error);
      showToast('error', '検索に失敗しました');
    } finally {
      setSearching(false);
    }
  }

  // メンバー招待モーダルを開く
  function openInviteModal(roomId: string, e: React.MouseEvent) {
    e.stopPropagation();
    const room = chatRooms.find(r => r.id === roomId);
    if (!room) return;

    // 既にメンバーのユーザーを除外するために招待選択をリセット
    setInviteSelectedUsers([]);
    setInviteRoomId(roomId);
    openModal('showInvite');
    void fetchUsers();
  }

  // メンバーを招待
  async function handleInviteMembers() {
    if (!inviteRoomId || inviteSelectedUsers.length === 0) return;

    try {
      const room = chatRooms.find(r => r.id === inviteRoomId);
      if (!room) return;
      await inviteMembers(inviteRoomId, room);

      closeModal('showInvite');
      setInviteRoomId(null);
    } catch (error) {
      console.error('メンバー招待エラー:', error);
      showToast('error', 'メンバーの招待に失敗しました');
    }
  }

  // チャットルーム削除確認モーダルを開く
  function openDeleteConfirm(roomId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setDeleteRoomId(roomId);
    openModal('showDeleteConfirm');
  }

  // チャットルームを削除（M-16: 実行中 spinner）
  async function deleteRoom() {
    if (!deleteRoomId || isDeletingRoom) return;
    if (!isAdmin) {
      showToast('error', '管理者権限が必要です');
      return;
    }

    setIsDeletingRoom(true);
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

      closeModal('showDeleteConfirm');
      setDeleteRoomId(null);
    } catch (error: unknown) {
      console.error('チャットルーム削除エラー:', error);
      const errorMessage = error instanceof Error ? error.message : '不明なエラー';
      showToast('error', `チャットルームの削除に失敗しました: ${errorMessage}`);
    } finally {
      setIsDeletingRoom(false);
    }
  }

  // プロフィール編集を開く
  function openProfileEdit() {
    setProfileName(currentUser?.displayName || '');
    setProfileImage(currentUser?.photoURL || null);
    closeModal('showSettings');
    openModal('showProfile');
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

    const trimmedProfileName = profileName.trim();
    setSavingProfile(true);
    try {
      let photoURL = currentUser.photoURL;
      let photoStoragePath: string | null = null;
      let photoFileSize: number | null = null;

      // 新しい画像がある場合はアップロード
      if (profileImage && profileImage.startsWith('data:')) {
        const response = await fetch(profileImage);
        const blob = await response.blob();
        photoStoragePath = `profileImages/${currentUser.uid}`;
        photoFileSize = blob.size;
        const storageRef = ref(storage, photoStoragePath);
        await uploadBytes(storageRef, blob);
        photoURL = await getDownloadURL(storageRef);
      }

      // Firebase Authのプロフィールを更新
      await updateProfile(currentUser, {
        displayName: trimmedProfileName,
        photoURL: photoURL
      });

      // Firestoreのユーザー情報を更新
      const userUpdates: Record<string, unknown> = {
        displayName: trimmedProfileName,
        photoURL: photoURL
      };
      if (photoStoragePath && photoFileSize !== null) {
        userUpdates.photoStoragePath = photoStoragePath;
        userUpdates.photoFileSize = photoFileSize;
      }
      await updateDoc(doc(db, 'users', currentUser.uid), userUpdates);

      closeModal('showProfile');
      showToast('success', 'プロフィールを更新しました');
    } catch (error) {
      console.error('プロフィール更新エラー:', error);
      showToast('error', 'プロフィールの更新に失敗しました');
    } finally {
      setSavingProfile(false);
    }
  }

  const inviteRoom = inviteRoomId
    ? chatRooms.find((room) => room.id === inviteRoomId) ?? null
    : null;
  const invitableUsers = getInvitableUsers(inviteRoom, users);

  if (loading) {
    return <div className={styles.loading}>読み込み中...</div>;
  }

  return (
    <div className={styles.container}>
      {/* ヘッダー */}
      <header className={styles.header}>
        <div className={styles.headerButtons}>
          <button
            className={styles.scheduleButton}
            onClick={() => navigate('/schedule')}
            title="行動予定表"
          >
            行動予定表
          </button>
          <button
            className={styles.newChatButton}
            onClick={() => { openModal('showNewChat'); void fetchUsers(); }}
            title="チャット作成"
          >
            チャット作成
          </button>
          <button
            className={styles.usersButton}
            onClick={() => { openModal('showUsers'); void fetchUsers(); }}
            title="ユーザー"
          >
            ユーザー
          </button>
          <button
            className={styles.memoButton}
            onClick={() => {
              const memoRoom = chatRooms.find(r => r.type === 'memo');
              if (memoRoom) navigate(`/memo/${memoRoom.id}`, { state: { from: '/' } });
            }}
            title="メモ"
            aria-label="メモ"
          >
            メモ
          </button>
          <button
            className={styles.searchButton}
            onClick={() => openModal('showSearch')}
            title="検索"
            aria-label="検索"
          >
            <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <span className={styles.actionLabel}>検索</span>
          </button>
          <button
            className={styles.settingsButton}
            onClick={() => openModal('showSettings')}
            title="設定"
            aria-label="設定"
          >
            <span className={styles.settingsIcon}>
              <span></span>
              <span></span>
              <span></span>
            </span>
            <span className={styles.actionLabel}>設定</span>
          </button>
        </div>
      </header>

      {/* チャット一覧 */}
      <div className={styles.listHeader}>
        <h2>チャット</h2>
        <button type="button" className={styles.sortButton} aria-label="お気に入り順で表示">
          お気に入り順
          <span aria-hidden="true">⌄</span>
        </button>
      </div>
      <ChatRoomList
        chatRooms={chatRooms}
        currentUser={currentUser}
        onlineStatusMap={onlineStatusMap}
        isRoomMuted={isRoomMuted}
        getUnreadCount={getUnreadCount}
        onRoomClick={(roomId) => navigate(`/chat/${roomId}`)}
        onToggleFavorite={toggleFavorite}
        onInvite={openInviteModal}
        onDelete={openDeleteConfirm}
      />

      {/* 新規チャットモーダル */}
      <NewChatModal
        isOpen={modals.showNewChat}
        users={users}
        onClose={() => closeModal('showNewChat')}
        onStartDirectChat={startDirectChat}
        onShowNewGroup={() => openModal('showNewGroup')}
      />

      {/* グループ作成モーダル */}
      <NewGroupModal
        isOpen={modals.showNewGroup}
        users={users}
        selectedUsers={selectedUsers}
        groupName={groupName}
        groupImage={groupImage}
        onClose={() => closeModal('showNewGroup')}
        onSelectedUsersChange={setSelectedUsers}
        onGroupNameChange={setGroupName}
        onGroupImageChange={handleGroupImageChange}
        onCreate={createGroupChat}
      />

      {/* 設定モーダル */}
      <SettingsModal
        isOpen={modals.showSettings}
        appVersion={appVersion}
        updateStatus={updateStatus}
        alwaysOnTop={alwaysOnTop}
        currentUserName={currentUser?.displayName}
        currentUserEmail={currentUser?.email}
        currentUserPhotoURL={currentUser?.photoURL}
        onToggleAlwaysOnTop={toggleAlwaysOnTop}
        onClose={() => closeModal('showSettings')}
        onProfileEdit={openProfileEdit}
        onTheme={() => { closeModal('showSettings'); openModal('showTheme'); }}
        onNotificationSettings={() => { closeModal('showSettings'); openModal('showNotificationSettings'); }}
        onReleaseNotes={() => { closeModal('showSettings'); openModal('showReleaseNotes'); }}
        onCheckForUpdates={checkForUpdates}
        onLogout={handleLogout}
        onTitleClick={handleSettingsTitleClick}
      />

      {/* プロフィール編集モーダル */}
      <ProfileEditModal
        isOpen={modals.showProfile}
        profileName={profileName}
        profileImage={profileImage}
        savingProfile={savingProfile}
        currentUserEmail={currentUser?.email}
        onClose={() => closeModal('showProfile')}
        onProfileNameChange={setProfileName}
        onProfileImageChange={handleProfileImageChange}
        onSave={saveProfile}
      />

      {/* ストレージ使用量編集モーダル */}
      <StorageEditModal
        isOpen={modals.showStorageEdit && isAdmin}
        storageEditValue={storageEditValue}
        onClose={() => closeModal('showStorageEdit')}
        onStorageEditValueChange={setStorageEditValue}
        onSave={saveStorageUsage}
      />

      {/* テーマ設定モーダル */}
      <ThemeModal
        isOpen={modals.showTheme}
        theme={theme}
        onClose={() => closeModal('showTheme')}
        onToggleTheme={toggleTheme}
      />

      {/* 検索モーダル */}
      <SearchModal
        isOpen={modals.showSearch}
        searchQuery={searchQuery}
        searchResults={searchResults}
        searching={searching}
        onClose={() => { closeModal('showSearch'); setSearchResults([]); }}
        onSearchQueryChange={setSearchQuery}
        onSearch={searchMessages}
        onResultClick={(roomId, messageId) => navigate(`/chat/${roomId}?messageId=${messageId}`)}
      />

      {/* メンバー招待モーダル */}
      <InviteMemberModal
        isOpen={modals.showInvite && !!inviteRoomId}
        invitableUsers={invitableUsers}
        selectedUsers={inviteSelectedUsers}
        onClose={() => closeModal('showInvite')}
        onSelectedUsersChange={setInviteSelectedUsers}
        onInvite={handleInviteMembers}
      />

      {/* 削除確認モーダル（M-15: 文言分岐 / M-16: spinner） */}
      <DeleteRoomConfirmModal
        isOpen={modals.showDeleteConfirm && !!deleteRoomId}
        onClose={() => closeModal('showDeleteConfirm')}
        onDelete={deleteRoom}
        roomType={chatRooms.find((r) => r.id === deleteRoomId)?.type}
        roomName={(() => {
          const room = chatRooms.find((r) => r.id === deleteRoomId);
          return room ? getRoomDisplayName(room, currentUser?.uid) : undefined;
        })()}
        isDeleting={isDeletingRoom}
      />

      {/* ユーザー一覧モーダル */}
      <UsersListModal
        isOpen={modals.showUsers}
        users={users}
        onClose={() => closeModal('showUsers')}
        onUserClick={startDirectChat}
        onTitleClick={handleUsersTitleClick}
        onlineStatusMap={allUsersOnlineStatusMap}
      />

      {/* 更新ノート表示モーダル */}
      <ReleaseNotesModal
        isOpen={modals.showReleaseNotes}
        releaseNotes={releaseNotes}
        onClose={() => closeModal('showReleaseNotes')}
      />

      {/* 更新ノート編集モーダル */}
      <ReleaseNotesEditModal
        isOpen={modals.showReleaseNotesEdit && isAdmin}
        releaseNotesEdit={releaseNotesEdit}
        savingReleaseNotes={savingReleaseNotes}
        onClose={() => closeModal('showReleaseNotesEdit')}
        onReleaseNotesEditChange={setReleaseNotesEdit}
        onSave={saveReleaseNotes}
      />

      {/* 通知設定モーダル */}
      <NotificationSettingsModal
        isOpen={modals.showNotificationSettings}
        settings={notificationSettings}
        isElectron={isElectronEnv()}
        diagnostics={notificationDiagnostics}
        diagnosticsLoading={diagnosticsLoading}
        mutedRooms={chatRooms
          .filter((r) => mutedRooms.has(r.id))
          .map((r) => ({ id: r.id, name: getRoomDisplayName(r, currentUser?.uid) }))}
        onClose={() => closeModal('showNotificationSettings')}
        onUpdateSettings={updateNotificationSettings}
        onRefreshDiagnostics={refreshNotificationDiagnostics}
        onRequestPermission={requestPermissionAndRegister}
        onUnmuteRoom={async (roomId) => {
          await toggleMute(roomId);
          showToast('success', 'ミュートを解除しました');
        }}
      />

      {/* ユーザー管理モーダル */}
      <UserManagementModal
        isOpen={modals.showUserManagement && isAdmin}
        users={users}
        onClose={() => closeModal('showUserManagement')}
        onEditUser={openUserEdit}
        onDeleteUser={openDeleteUserConfirm}
      />

      {/* ユーザー編集モーダル */}
      <UserEditModal
        isOpen={!!selectedUserForEdit}
        userEmail={selectedUserForEdit?.email}
        editUserName={editUserName}
        onClose={() => setSelectedUserForEdit(null)}
        onEditUserNameChange={setEditUserName}
        onSave={saveUserEdit}
      />

      {/* ユーザー削除確認モーダル */}
      <DeleteUserConfirmModal
        isOpen={modals.showDeleteUserConfirm && !!userToDelete}
        userName={userToDelete?.displayName}
        onClose={() => closeModal('showDeleteUserConfirm')}
        onDelete={deleteUser}
      />
    </div>
  );
}
