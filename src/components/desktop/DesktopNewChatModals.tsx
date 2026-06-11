import { useEffect, useState } from 'react';
import { type User as FirebaseUser } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useNavigate } from 'react-router-dom';
import { db, storage } from '../../lib/firebase';
import { useToast } from '../../contexts/ToastContext';
import { useUsers } from '../../hooks/useUsers';
import type { ChatRoom, User } from '../../types';
import { getDirectRoomId, getDirectRoomKey } from '../../utils/room';
import { handleGroupImageChange as convertGroupImageToBase64 } from '../../utils/image';
import { NewChatModal, NewGroupModal } from '../home/modals';

interface DesktopNewChatModalsProps {
  currentUser: FirebaseUser | null;
  chatRooms: ChatRoom[];
  isOpen: boolean;
  onClose: () => void;
}

export default function DesktopNewChatModals({
  currentUser,
  chatRooms,
  isOpen,
  onClose,
}: DesktopNewChatModalsProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { users, fetchUsers } = useUsers();
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [groupImage, setGroupImage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen || showNewGroup) {
      void fetchUsers();
    }
  }, [fetchUsers, isOpen, showNewGroup]);

  function resetGroupForm() {
    setSelectedUsers([]);
    setGroupName('');
    setGroupImage(null);
  }

  function closeNewGroup() {
    setShowNewGroup(false);
    resetGroupForm();
  }

  async function startDirectChat(otherUser: User) {
    if (!currentUser) return;

    const directRoomId = getDirectRoomId(currentUser.uid, otherUser.uid);
    const directKey = getDirectRoomKey(currentUser.uid, otherUser.uid);
    const existingRoom = chatRooms.find(
      (room) => room.type === 'direct' &&
        (room.id === directRoomId ||
          room.directKey === directKey ||
          (room.members.includes(otherUser.uid) && room.members.includes(currentUser.uid))),
    );

    if (existingRoom) {
      onClose();
      navigate(`/chat/${existingRoom.id}`);
      return;
    }

    const newRoom = {
      name: '',
      type: 'direct',
      members: [currentUser.uid, otherUser.uid],
      memberDetails: {
        [currentUser.uid]: {
          displayName: currentUser.displayName || 'Unknown',
          photoURL: currentUser.photoURL,
        },
        [otherUser.uid]: {
          displayName: otherUser.displayName,
          photoURL: otherUser.photoURL,
        },
      },
      directKey,
      lastMessage: null,
      unreadCounts: {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const roomRef = doc(db, 'chatRooms', directRoomId);
    const roomSnap = await getDoc(roomRef);
    if (!roomSnap.exists()) {
      await setDoc(roomRef, newRoom);
    }

    onClose();
    navigate(`/chat/${directRoomId}`);
  }

  async function createGroupChat() {
    if (!currentUser || selectedUsers.length === 0 || !groupName.trim()) return;

    try {
      const roomRef = doc(collection(db, 'chatRooms'));
      const memberDetails: { [uid: string]: { displayName: string; photoURL: string | null } } = {
        [currentUser.uid]: {
          displayName: currentUser.displayName || 'Unknown',
          photoURL: currentUser.photoURL,
        },
      };

      selectedUsers.forEach((uid) => {
        const user = users.find((item) => item.uid === uid);
        if (user) {
          memberDetails[uid] = {
            displayName: user.displayName,
            photoURL: user.photoURL,
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
        updatedAt: serverTimestamp(),
      };

      await setDoc(roomRef, newRoom);

      if (groupImage && groupImage.startsWith('data:')) {
        try {
          const response = await fetch(groupImage);
          const blob = await response.blob();
          const timestamp = Date.now();
          const storagePath = `groupImages/${roomRef.id}/group_${timestamp}`;
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

      closeNewGroup();
      navigate(`/chat/${roomRef.id}`);
    } catch (error: unknown) {
      console.error('グループ作成エラー:', error);
      const errorMessage = error instanceof Error ? error.message : '不明なエラー';
      showToast('error', `グループの作成に失敗しました: ${errorMessage}`);
    }
  }

  async function handleGroupImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setGroupImage(await convertGroupImageToBase64(file));
    } catch (error) {
      console.error('グループ画像読み込みエラー:', error);
      showToast('error', '画像の読み込みに失敗しました');
    }
  }

  return (
    <>
      <NewChatModal
        isOpen={isOpen}
        users={users}
        onClose={onClose}
        onStartDirectChat={(user) => { void startDirectChat(user); }}
        onShowNewGroup={() => setShowNewGroup(true)}
      />
      <NewGroupModal
        isOpen={showNewGroup}
        users={users}
        selectedUsers={selectedUsers}
        groupName={groupName}
        groupImage={groupImage}
        onClose={closeNewGroup}
        onSelectedUsersChange={setSelectedUsers}
        onGroupNameChange={setGroupName}
        onGroupImageChange={(event) => { void handleGroupImageChange(event); }}
        onCreate={() => { void createGroupChat(); }}
      />
    </>
  );
}
