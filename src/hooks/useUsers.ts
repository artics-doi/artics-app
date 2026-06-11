import { useCallback, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import type { User } from '../types';

interface UseUsersOptions {
  includeSelf?: boolean;
}

function asDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof value.toDate === 'function'
  ) {
    return value.toDate();
  }
  return new Date(0);
}

function userFromCurrentUser(currentUser: FirebaseUser): User {
  return {
    uid: currentUser.uid,
    email: currentUser.email ?? '',
    displayName: currentUser.displayName || currentUser.email || '自分',
    photoURL: currentUser.photoURL,
    createdAt: new Date(0),
  };
}

function userFromDoc(docId: string, data: Record<string, unknown>): User {
  const uid = typeof data.uid === 'string' && data.uid.trim() ? data.uid : docId;
  const email = typeof data.email === 'string' ? data.email : '';
  const displayName =
    typeof data.displayName === 'string' && data.displayName.trim()
      ? data.displayName
      : email || uid || '名前未設定';
  return {
    uid,
    email,
    displayName,
    photoURL: typeof data.photoURL === 'string' ? data.photoURL : null,
    createdAt: asDate(data.createdAt),
  };
}

export function useUsers(options: UseUsersOptions = {}) {
  const { currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const includeSelf = options.includeSelf ?? false;

  const fetchUsers = useCallback(async () => {
    if (!currentUser) return;

    try {
      const snapshot = await getDocs(collection(db, 'users'));
      const userList: User[] = [];
      let hasCurrentUser = false;
      snapshot.forEach((doc) => {
        const user = userFromDoc(doc.id, doc.data());
        if (user.uid === currentUser.uid) {
          hasCurrentUser = true;
          if (includeSelf) userList.push(user);
        } else {
          userList.push(user);
        }
      });
      if (includeSelf && !hasCurrentUser) {
        userList.push(userFromCurrentUser(currentUser));
      }
      userList.sort((a, b) => a.displayName.localeCompare(b.displayName, 'ja'));
      setUsers(userList);
    } catch (error) {
      console.error('ユーザー取得エラー:', error);
    }
  }, [currentUser, includeSelf]);

  return {
    users,
    fetchUsers
  };
}
