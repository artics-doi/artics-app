// 工程管理メンバー（担当者マスタ）の購読と CRUD。
// TaskCard の担当者名は、このフックが返す members から id→name で解決する（描画時解決 / M2）。

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { PROCESS_COLLECTIONS } from '../../constants/process';
import { memberInputToCreateData, toMember } from '../../lib/process/converters';
import type { MemberOrderUpdate } from '../../lib/process/memberOrdering';
import type { ProcessMember, ProcessMemberInput } from '../../types/process';

export function useProcessMembers(currentUser: FirebaseUser | null) {
  const [members, setMembers] = useState<ProcessMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!currentUser) return;

    const q = query(collection(db, PROCESS_COLLECTIONS.members), orderBy('order', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setMembers(snapshot.docs.map((item) => toMember(item.id, item.data())));
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('[Process] メンバー取得エラー:', err);
        setError(err);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [currentUser]);

  // id → メンバー の早見表（TaskCard の名前解決を O(1) にする）。
  const memberById = useMemo(() => {
    const map = new Map<string, ProcessMember>();
    for (const m of members) map.set(m.id, m);
    return map;
  }, [members]);

  const createMember = useCallback(
    async (input: ProcessMemberInput) => {
      if (!currentUser) throw new Error('ログインが必要です');
      const order = members.length; // 末尾に追加
      console.info('[Process] createMember', { name: input.name });
      await addDoc(
        collection(db, PROCESS_COLLECTIONS.members),
        memberInputToCreateData(input, order),
      );
    },
    [currentUser, members],
  );

  const updateMember = useCallback(
    async (memberId: string, input: ProcessMemberInput) => {
      if (!currentUser) throw new Error('ログインが必要です');
      console.info('[Process] updateMember', { memberId });
      await updateDoc(doc(db, PROCESS_COLLECTIONS.members, memberId), {
        name: input.name,
        colorIndex: input.colorIndex,
        linkedUserId: input.linkedUserId,
      });
    },
    [currentUser],
  );

  const deleteMember = useCallback(
    async (memberId: string) => {
      if (!currentUser) throw new Error('ログインが必要です');
      console.info('[Process] deleteMember', { memberId });
      await deleteDoc(doc(db, PROCESS_COLLECTIONS.members, memberId));
    },
    [currentUser],
  );

  const reorderMembers = useCallback(
    async (updates: readonly MemberOrderUpdate[]) => {
      if (!currentUser) throw new Error('ログインが必要です');
      if (updates.length === 0) return;

      const batch = writeBatch(db);
      updates.forEach((update) => {
        batch.update(doc(db, PROCESS_COLLECTIONS.members, update.memberId), {
          order: update.order,
        });
      });
      console.info('[Process] reorderMembers', { count: updates.length });
      await batch.commit();
    },
    [currentUser],
  );

  return {
    members: currentUser ? members : [],
    memberById,
    loading: currentUser ? loading : false,
    error: currentUser ? error : null,
    createMember,
    updateMember,
    deleteMember,
    reorderMembers,
  };
}
