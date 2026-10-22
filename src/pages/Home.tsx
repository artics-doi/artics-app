// ホーム画面（チャット一覧）

import { useEffect, useState, useMemo, useRef } from 'react';
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
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
// Note: updateDoc is still used for group invitation, profile updates, etc.
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateProfile } from 'firebase/auth';
import { db, storage } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { setStorageUsageValue } from '../lib/storageUsage';
import { useElectronNotification, isElectronEnv } from '../hooks/useElectronNotification';
import { useFCMToken } from '../hooks/useFCMToken';
import { useNotificationDiagnostics } from '../hooks/useNotificationDiagnostics';
import { useRoomNotificationSettings } from '../hooks/useRoomNotificationSettings';
import { useUsers } from '../hooks/useUsers';
import { useInviteMembers } from '../hooks/useInviteMembers';
import { useHomeModals, type HomeModalName } from '../hooks/useHomeModals';
import { useChatRooms } from '../hooks/useChatRooms';
import { useSchedules } from '../hooks/useSchedules';
import { useAllProcessTasks } from '../hooks/process/useAllProcessTasks';
import { useProjects } from '../hooks/process/useProjects';
import { useTheme } from '../hooks/useTheme';
import { useReleaseNotes } from '../hooks/useReleaseNotes';
import { useStorageUsage } from '../hooks/useStorageUsage';
import { useAppVersion } from '../hooks/useAppVersion';
import { useAlwaysOnTop } from '../hooks/useAlwaysOnTop';
import { ChatRoomList, MobileTabBar } from '../components/home';
import type { User } from '../types';
import { getDirectRoomId, getDirectRoomKey, getRoomDisplayName, getUnreadCount, isDirectRoomForUsers } from '../utils/room';
import { handleGroupImageChange as convertGroupImageToBase64 } from '../utils/image';
import { SEARCH_LIMIT_PER_ROOM, SEARCH_RESULTS_LIMIT } from '../constants';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import {
  searchMessages as searchGlobalMessages,
  searchSchedules,
  searchTasks,
  sortGlobalSearchResults,
  type GlobalSearchResult,
  type SearchableMessage,
} from '../lib/search/globalSearch';
import styles from './Home.module.css';
import { SettingsModal, ThemeModal, ProfileEditModal, NotificationSettingsModal, ReleaseNotesModal, StorageEditModal, SearchModal, NewChatModal, NewGroupModal, InviteMemberModal, DeleteRoomConfirmModal, UsersListModal, UserManagementModal, UserEditModal, DeleteUserConfirmModal } from '../components/home/modals';
import { requestUserDeletion, watchUserDeletion } from '../lib/userLifecycle/client';
import { canDeleteChatRoom } from '../lib/chat/roomDeletion';
import { deleteChatRoom } from '../lib/chat/roomDeletionClient';

export default function Home() {
  const { currentUser, isAdmin, logout } = useAuth();
  const { modals, openModal, closeModal } = useHomeModals();
  const { chatRooms, loading } = useChatRooms(currentUser);
  const searchUser = modals.showSearch ? currentUser : null;
  const { schedules } = useSchedules(searchUser);
  const { tasks: allProcessTasks } = useAllProcessTasks(searchUser);
  const { projects: activeProjects } = useProjects(searchUser, 'active');
  const { projects: archivedProjects } = useProjects(searchUser, 'archived');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GlobalSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviteRoomId, setInviteRoomId] = useState<string | null>(null);
  const [deleteRoomId, setDeleteRoomId] = useState<string | null>(null);
  const [startingDirectUserId, setStartingDirectUserId] = useState<string | null>(null);
  // M-16: 削除実行中フラグ
  const [isDeletingRoom, setIsDeletingRoom] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [groupImage, setGroupImage] = useState<string | null>(null);
  const [profileName, setProfileName] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { releaseNotes } = useReleaseNotes();
  const { setStorageUsage } = useStorageUsage();
  const { appVersion, updateStatus, checkForUpdates } = useAppVersion();
  const { alwaysOnTop, toggleAlwaysOnTop } = useAlwaysOnTop();
  const [storageEditValue, setStorageEditValue] = useState('');

  // ユーザー管理機能用
  const [usersTitleClickCount, setUsersTitleClickCount] = useState(0);
  const usersTitleClickTimerRef = useRef<number | null>(null);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<User | null>(null);
  const [editUserName, setEditUserName] = useState('');
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [userDeletionState, setUserDeletionState] = useState<string | null>(null);
  const userDeletionUnsubscribeRef = useRef<(() => void) | null>(null);

  const { showToast } = useToast();
  const navigate = useNavigate();
  const { users, fetchUsers } = useUsers();

  useEffect(() => () => {
    userDeletionUnsubscribeRef.current?.();
  }, []);
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

  // 1対1チャットを作成または開く
  async function startDirectChat(otherUser: User) {
    if (!currentUser || startingDirectUserId) return;
    setStartingDirectUserId(otherUser.uid);
    const directRoomId = getDirectRoomId(currentUser.uid, otherUser.uid);
    const directKey = getDirectRoomKey(currentUser.uid, otherUser.uid);

    try {
      const existingRoom = chatRooms.find(
        room => room.type === 'direct' &&
          (room.id === directRoomId || room.directKey === directKey ||
            isDirectRoomForUsers(room, currentUser.uid, otherUser.uid))
      );

      if (existingRoom) {
        closeModal('showNewChat');
        navigate(`/chat/${existingRoom.id}`);
        return;
      }

      const newRoom = {
        name: '',
        type: 'direct',
        createdBy: currentUser.uid,
        deletionState: 'active',
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
      try {
        // 存在しないルームへの事前 read はルールで拒否されるため、まず create を試す。
        await setDoc(roomRef, newRoom);
      } catch (createError) {
        // 購読反映前に既存ルームが見つからなかった競合時だけ、既存文書を確認して開く。
        const roomSnap = await getDoc(roomRef);
        const roomData = roomSnap.data();
        if (!roomSnap.exists() || !roomData || !isDirectRoomForUsers(roomData, currentUser.uid, otherUser.uid)) {
          throw createError;
        }
      }
      closeModal('showNewChat');
      navigate(`/chat/${directRoomId}`);
    } catch (error) {
      console.error('1対1チャット開始エラー:', error);
      showToast('error', 'チャットを開けませんでした。通信状態を確認して、もう一度お試しください');
    } finally {
      setStartingDirectUserId(null);
    }
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
        createdBy: currentUser.uid,
        deletionState: 'active',
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
    // 3秒でリセット（古いタイマーを残すと先にリセットが発火して5回に到達できない）
    if (usersTitleClickTimerRef.current !== null) {
      window.clearTimeout(usersTitleClickTimerRef.current);
    }
    usersTitleClickTimerRef.current = window.setTimeout(() => setUsersTitleClickCount(0), 3000);
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
      setUserDeletionState('requested');
      const operation = await requestUserDeletion(
        userToDelete.uid,
        userToDelete.lifecycleVersion ?? 0,
        appVersion,
      );
      userDeletionUnsubscribeRef.current?.();
      userDeletionUnsubscribeRef.current = watchUserDeletion(operation.operationId, (current) => {
        setUserDeletionState(current.state);
        if (current.state === 'completed') {
          userDeletionUnsubscribeRef.current?.();
          userDeletionUnsubscribeRef.current = null;
          closeModal('showDeleteUserConfirm');
          setUserToDelete(null);
          setUserDeletionState(null);
          void fetchUsers();
          showToast('success', 'ユーザーの削除が完了しました');
        } else if (current.state === 'failed') {
          userDeletionUnsubscribeRef.current?.();
          userDeletionUnsubscribeRef.current = null;
          setUserDeletionState(null);
          showToast('error', `ユーザー削除が停止しました: ${current.errorCode ?? 'unknown'}`);
        }
      });
    } catch (error) {
      console.error('ユーザー削除エラー:', error);
      setUserDeletionState(null);
      const code = (error as { code?: string }).code;
      showToast('error', code?.includes('failed-precondition')
        ? 'ユーザー削除を開始できません。アプリ更新または管理設定を確認してください'
        : 'ユーザーの削除開始に失敗しました');
    }
  }

  // 全体検索
  async function searchMessages() {
    if (!currentUser || !searchQuery.trim()) return;

    setSearching(true);
    setSearchResults([]);

    try {
      const searchableMessages: SearchableMessage[] = [];
      const targetRooms = chatRooms;
      const snapshots = await Promise.all(
        targetRooms.map((room) =>
          getDocs(query(
            collection(db, 'chatRooms', room.id, 'messages'),
            orderBy('createdAt', 'desc'),
            limit(SEARCH_LIMIT_PER_ROOM)
          ))
        )
      );

      snapshots.forEach((messagesSnapshot, index) => {
        const room = targetRooms[index];
        messagesSnapshot.forEach((messageDoc) => {
          const data = messageDoc.data();
          const text = data.text || '';
          searchableMessages.push({
            id: messageDoc.id,
            roomId: room.id,
            roomName: getRoomDisplayName(room, currentUser.uid),
            roomType: room.type,
            text,
            senderName: data.senderName || '',
            timestamp: data.createdAt?.toDate() || data.timestamp?.toDate() || new Date(0),
          });
        });
      });

      const projectNameById = new Map(
        [...activeProjects, ...archivedProjects].map((project) => [project.id, project.name]),
      );
      setSearchResults(sortGlobalSearchResults([
        ...searchGlobalMessages(searchableMessages, searchQuery),
        ...searchSchedules(schedules, searchQuery),
        ...searchTasks(allProcessTasks, searchQuery, projectNameById),
      ], SEARCH_RESULTS_LIMIT));
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

  // チャットルームをサーバー側で完全削除（M-16: 実行中 spinner）
  async function deleteRoom() {
    if (!deleteRoomId || isDeletingRoom) return;
    const targetRoom = chatRooms.find((room) => room.id === deleteRoomId);
    if (!targetRoom || !canDeleteChatRoom(targetRoom, currentUser?.uid)) {
      showToast('error', 'このルームを削除する権限がありません');
      return;
    }

    setIsDeletingRoom(true);
    try {
      const result = await deleteChatRoom(deleteRoomId);

      closeModal('showDeleteConfirm');
      setDeleteRoomId(null);
      showToast('success', result.status === 'already-deleted' ? 'ルームはすでに削除されています' : 'ルームを削除しました');
    } catch (error: unknown) {
      console.error('チャットルーム削除エラー:', error);
      const code = (error as { code?: string }).code ?? '';
      showToast('error', code.includes('permission-denied')
        ? 'このルームを削除する権限がありません'
        : 'ルームの完全削除に失敗しました。もう一度お試しください');
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

  function closeSettingsChildModal(name: HomeModalName) {
    closeModal(name);
    openModal('showSettings');
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

  // スマホ幅のタブバー / FAB とヘッダーで同じ導線を共有する
  const openNewChat = () => {
    openModal('showNewChat');
    void fetchUsers();
  };

  const openUsersList = () => {
    openModal('showUsers');
    void fetchUsers();
  };

  const openMemoRoom = () => {
    const memoRoom = chatRooms.find(r => r.type === 'memo');
    if (memoRoom) navigate(`/memo/${memoRoom.id}`, { state: { from: '/' } });
  };

  const openSchedule = () => {
    navigate('/schedule', { state: { allowNarrowSchedule: true } });
  };

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
        {/* スマホ幅用のスリムヘッダー。移動系は下部タブバーと FAB に任せ、ここは検索と設定だけ */}
        <div className={styles.mobileHeaderBar}>
          <span className={styles.mobileHeaderTitle}>ArticsChat</span>
          <div className={styles.mobileHeaderActions}>
            <button
              type="button"
              className={styles.mobileHeaderButton}
              onClick={() => openModal('showSearch')}
              title="検索"
              aria-label="検索"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </button>
            <button
              type="button"
              className={styles.mobileHeaderButton}
              onClick={() => openModal('showSettings')}
              title="設定"
              aria-label="設定"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>
        </div>
        <div className={styles.headerButtons}>
          <button
            className={styles.scheduleButton}
            onClick={openSchedule}
            title="行動予定表（Beta）"
          >
            行動予定表（Beta）
          </button>
          <button
            className={styles.newChatButton}
            onClick={openNewChat}
            title="チャット作成"
          >
            チャット作成
          </button>
          <button
            className={styles.usersButton}
            onClick={openUsersList}
            title="ユーザー"
          >
            ユーザー
          </button>
          <button
            className={styles.memoButton}
            onClick={openMemoRoom}
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
        getUnreadCount={(room) => getUnreadCount(room, currentUser?.uid)}
        onRoomClick={(roomId) => navigate(`/chat/${roomId}`)}
        onToggleFavorite={toggleFavorite}
        onInvite={openInviteModal}
        onDelete={openDeleteConfirm}
        canDeleteRoom={(room) => canDeleteChatRoom(room, currentUser?.uid)}
      />

      {/* スマホ幅のみ表示（CSS で切替）。チャット作成の FAB と下部タブバー */}
      <button
        type="button"
        className={styles.fab}
        onClick={openNewChat}
        title="チャット作成"
        aria-label="チャット作成"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
      <MobileTabBar
        activeTab="chat"
        onSelectChat={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        onSelectSchedule={openSchedule}
        onSelectMemo={openMemoRoom}
        onSelectMembers={openUsersList}
      />

      {/* 新規チャットモーダル */}
      <NewChatModal
        isOpen={modals.showNewChat}
        users={users}
        onClose={() => closeModal('showNewChat')}
        onStartDirectChat={startDirectChat}
        onShowNewGroup={() => openModal('showNewGroup')}
        startingUserId={startingDirectUserId}
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
      />

      {/* プロフィール編集モーダル */}
      <ProfileEditModal
        isOpen={modals.showProfile}
        profileName={profileName}
        profileImage={profileImage}
        savingProfile={savingProfile}
        currentUserEmail={currentUser?.email}
        onClose={() => closeSettingsChildModal('showProfile')}
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
        onClose={() => closeSettingsChildModal('showTheme')}
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
        onResultClick={(result) => navigate(result.path)}
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
        onClose={() => closeSettingsChildModal('showReleaseNotes')}
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
        onClose={() => closeSettingsChildModal('showNotificationSettings')}
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
        deletionState={userDeletionState}
      />
    </div>
  );
}
