import { useCallback, useState } from 'react';
import { arrayUnion, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { ChatRoom, User } from '../types';

interface InviteMembersResult {
  invitedUserIds: string[];
  memberDetails: ChatRoom['memberDetails'];
}

export function useInviteMembers(allUsers: User[]) {
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  const getInvitableUsers = useCallback((room: ChatRoom | null, users: User[]) => {
    if (!room) return [];
    return users.filter((user) => !room.members.includes(user.uid));
  }, []);

  const inviteMembers = useCallback(async (roomId: string, room: ChatRoom | null): Promise<InviteMembersResult> => {
    if (!room || !roomId || selectedUsers.length === 0) {
      return {
        invitedUserIds: [],
        memberDetails: room?.memberDetails ?? {}
      };
    }

    const memberDetails = { ...room.memberDetails };
    selectedUsers.forEach((uid) => {
      const user = allUsers.find((candidate) => candidate.uid === uid);
      if (user) {
        memberDetails[uid] = {
          displayName: user.displayName,
          photoURL: user.photoURL
        };
      }
    });

    const invitedUserIds = [...selectedUsers];

    await updateDoc(doc(db, 'chatRooms', roomId), {
      members: arrayUnion(...invitedUserIds),
      memberDetails,
      updatedAt: serverTimestamp()
    });

    setSelectedUsers([]);

    return {
      invitedUserIds,
      memberDetails
    };
  }, [allUsers, selectedUsers]);

  return {
    selectedUsers,
    setSelectedUsers,
    getInvitableUsers,
    inviteMembers
  };
}
