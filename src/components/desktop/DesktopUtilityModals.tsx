import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { updateProfile, type User as FirebaseUser } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useElectronNotification, isElectronEnv } from '../../hooks/useElectronNotification';
import { useFCMToken } from '../../hooks/useFCMToken';
import { useNotificationDiagnostics } from '../../hooks/useNotificationDiagnostics';
import { useRoomNotificationSettings } from '../../hooks/useRoomNotificationSettings';
import { useSchedules } from '../../hooks/useSchedules';
import { useAllProcessTasks } from '../../hooks/process/useAllProcessTasks';
import { useProjects } from '../../hooks/process/useProjects';
import { SEARCH_LIMIT_PER_ROOM, SEARCH_RESULTS_LIMIT } from '../../constants';
import type { ChatRoom } from '../../types';
import { getRoomDisplayName } from '../../utils/room';
import {
  searchMessages as searchGlobalMessages,
  searchSchedules,
  searchTasks,
  sortGlobalSearchResults,
  type GlobalSearchResult,
  type SearchableMessage,
} from '../../lib/search/globalSearch';
import {
  NotificationSettingsModal,
  ProfileEditModal,
  ReleaseNotesModal,
  SearchModal,
  SettingsModal,
  ThemeModal,
} from '../home/modals';

interface DesktopUtilityModalsProps {
  currentUser: FirebaseUser | null;
  chatRooms: ChatRoom[];
  searchOpen: boolean;
  settingsOpen: boolean;
  onCloseSearch: () => void;
  onCloseSettings: () => void;
  onOpenSettings: () => void;
}

export default function DesktopUtilityModals({
  currentUser,
  chatRooms,
  searchOpen,
  settingsOpen,
  onCloseSearch,
  onCloseSettings,
  onOpenSettings,
}: DesktopUtilityModalsProps) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { showToast } = useToast();
  const { settings: notificationSettings, updateSettings: updateNotificationSettings } = useElectronNotification();
  const { requestPermissionAndRegister } = useFCMToken();
  const {
    diagnostics: notificationDiagnostics,
    refresh: refreshNotificationDiagnostics,
    loading: diagnosticsLoading,
  } = useNotificationDiagnostics();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GlobalSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'dark' ? 'dark' : 'light';
  });
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false);
  const [releaseNotes, setReleaseNotes] = useState('');
  const [appVersion, setAppVersion] = useState('');
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'latest' | 'error'>('idle');
  const { mutedRooms, toggleMute } = useRoomNotificationSettings(settingsOpen || notificationOpen);
  const searchUser = searchOpen ? currentUser : null;
  const { schedules } = useSchedules(searchUser);
  const { tasks: allProcessTasks } = useAllProcessTasks(searchUser);
  const { projects: activeProjects } = useProjects(searchUser, 'active');
  const { projects: archivedProjects } = useProjects(searchUser, 'archived');

  useEffect(() => {
    if (!settingsOpen) return;
    if (isElectronEnv() && window.electronAPI) {
      void window.electronAPI.getAppVersion().then(setAppVersion).catch((error) => {
        console.error('アプリバージョン取得エラー:', error);
      });
      void window.electronAPI.getAlwaysOnTop().then(setAlwaysOnTop).catch((error) => {
        console.error('常に手前状態取得エラー:', error);
      });
    }
  }, [settingsOpen]);

  useEffect(() => {
    if (!releaseNotesOpen) return;
    void getDoc(doc(db, 'settings', 'releaseNotes'))
      .then((snapshot) => {
        setReleaseNotes(snapshot.exists() ? snapshot.data().content || '' : '');
      })
      .catch((error) => {
        console.error('更新ノート取得エラー:', error);
        setReleaseNotes('');
      });
  }, [releaseNotesOpen]);

  const searchMessages = useCallback(async () => {
    if (!currentUser || !searchQuery.trim()) return;

    setSearching(true);
    setSearchResults([]);
    try {
      const searchableMessages: SearchableMessage[] = [];
      for (const room of chatRooms) {
        const messagesQuery = query(
          collection(db, 'chatRooms', room.id, 'messages'),
          orderBy('createdAt', 'desc'),
          limit(SEARCH_LIMIT_PER_ROOM),
        );
        const messagesSnapshot = await getDocs(messagesQuery);
        messagesSnapshot.forEach((messageDoc) => {
          const data = messageDoc.data();
          const text = data.text || '';
          searchableMessages.push({
            id: messageDoc.id,
            roomId: room.id,
            roomName: getRoomDisplayName(room, currentUser.uid),
            roomType: room.type,
            text,
            senderName: data.senderName || 'Unknown',
            timestamp: data.createdAt?.toDate() || data.timestamp?.toDate() || new Date(0),
          });
        });
      }
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
  }, [activeProjects, allProcessTasks, archivedProjects, chatRooms, currentUser, schedules, searchQuery, showToast]);

  function openProfileEdit() {
    setProfileName(currentUser?.displayName || '');
    setProfileImage(currentUser?.photoURL || null);
    onCloseSettings();
    setProfileOpen(true);
  }

  function closeSettingsChildModal(closeChild: () => void) {
    closeChild();
    onOpenSettings();
  }

  async function handleProfileImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !currentUser) return;
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      setProfileImage(loadEvent.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function saveProfile() {
    if (!currentUser || !profileName.trim()) return;
    const trimmedProfileName = profileName.trim();
    setSavingProfile(true);
    try {
      let photoURL = currentUser.photoURL;
      let photoStoragePath: string | null = null;
      let photoFileSize: number | null = null;

      if (profileImage && profileImage.startsWith('data:')) {
        const response = await fetch(profileImage);
        const blob = await response.blob();
        photoStoragePath = `profileImages/${currentUser.uid}`;
        photoFileSize = blob.size;
        const storageRef = ref(storage, photoStoragePath);
        await uploadBytes(storageRef, blob);
        photoURL = await getDownloadURL(storageRef);
      }

      await updateProfile(currentUser, {
        displayName: trimmedProfileName,
        photoURL,
      });

      const userUpdates: Record<string, unknown> = {
        displayName: trimmedProfileName,
        photoURL,
      };
      if (photoStoragePath && photoFileSize !== null) {
        userUpdates.photoStoragePath = photoStoragePath;
        userUpdates.photoFileSize = photoFileSize;
      }
      await updateDoc(doc(db, 'users', currentUser.uid), userUpdates);
      setProfileOpen(false);
      showToast('success', 'プロフィールを更新しました');
    } catch (error) {
      console.error('プロフィール更新エラー:', error);
      showToast('error', 'プロフィールの更新に失敗しました');
    } finally {
      setSavingProfile(false);
    }
  }

  function toggleTheme(nextTheme: 'light' | 'dark') {
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  }

  async function toggleAlwaysOnTop() {
    if (!isElectronEnv() || !window.electronAPI) return;
    const next = !alwaysOnTop;
    try {
      const success = await window.electronAPI.setAlwaysOnTop(next);
      if (success) {
        setAlwaysOnTop(next);
        showToast('success', next ? '常に手前に表示します' : '常に手前表示を解除しました');
      }
    } catch (error) {
      console.error('常に手前切替エラー:', error);
      showToast('error', '常に手前表示の切り替えに失敗しました');
    }
  }

  async function checkForUpdates() {
    if (!isElectronEnv() || !window.electronAPI) return;
    setUpdateStatus('checking');
    try {
      const result = await window.electronAPI.checkForUpdates();
      setUpdateStatus(result.error ? 'error' : result.available ? 'available' : 'latest');
    } catch (error) {
      console.error('アップデート確認エラー:', error);
      setUpdateStatus('error');
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const mutedRoomList = chatRooms
    .filter((room) => mutedRooms.has(room.id))
    .map((room) => ({ id: room.id, name: getRoomDisplayName(room, currentUser?.uid) }));

  return (
    <>
      <SearchModal
        isOpen={searchOpen}
        searchQuery={searchQuery}
        searchResults={searchResults}
        searching={searching}
        onClose={() => {
          onCloseSearch();
          setSearchResults([]);
        }}
        onSearchQueryChange={setSearchQuery}
        onSearch={searchMessages}
        onResultClick={(result) => navigate(result.path)}
      />

      <SettingsModal
        isOpen={settingsOpen}
        appVersion={appVersion}
        updateStatus={updateStatus}
        alwaysOnTop={alwaysOnTop}
        currentUserName={currentUser?.displayName}
        currentUserEmail={currentUser?.email}
        currentUserPhotoURL={currentUser?.photoURL}
        onToggleAlwaysOnTop={toggleAlwaysOnTop}
        onClose={onCloseSettings}
        onProfileEdit={openProfileEdit}
        onTheme={() => {
          onCloseSettings();
          setThemeOpen(true);
        }}
        onNotificationSettings={() => {
          onCloseSettings();
          setNotificationOpen(true);
        }}
        onReleaseNotes={() => {
          onCloseSettings();
          setReleaseNotesOpen(true);
        }}
        onCheckForUpdates={checkForUpdates}
        onLogout={handleLogout}
        onTitleClick={() => undefined}
      />

      <ProfileEditModal
        isOpen={profileOpen}
        profileName={profileName}
        profileImage={profileImage}
        savingProfile={savingProfile}
        currentUserEmail={currentUser?.email}
        onClose={() => closeSettingsChildModal(() => setProfileOpen(false))}
        onProfileNameChange={setProfileName}
        onProfileImageChange={handleProfileImageChange}
        onSave={saveProfile}
      />

      <ThemeModal
        isOpen={themeOpen}
        theme={theme}
        onClose={() => closeSettingsChildModal(() => setThemeOpen(false))}
        onToggleTheme={toggleTheme}
      />

      <NotificationSettingsModal
        isOpen={notificationOpen}
        settings={notificationSettings}
        isElectron={isElectronEnv()}
        diagnostics={notificationDiagnostics}
        diagnosticsLoading={diagnosticsLoading}
        mutedRooms={mutedRoomList}
        onClose={() => closeSettingsChildModal(() => setNotificationOpen(false))}
        onUpdateSettings={(settings) => { void updateNotificationSettings(settings); }}
        onRefreshDiagnostics={refreshNotificationDiagnostics}
        onRequestPermission={requestPermissionAndRegister}
        onUnmuteRoom={async (roomId) => {
          await toggleMute(roomId);
          showToast('success', 'ミュートを解除しました');
        }}
      />

      <ReleaseNotesModal
        isOpen={releaseNotesOpen}
        releaseNotes={releaseNotes}
        onClose={() => closeSettingsChildModal(() => setReleaseNotesOpen(false))}
      />
    </>
  );
}
