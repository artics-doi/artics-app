// 年度工数用の全タスク横断購読。active/archived を問わず現存タスクを読む。

import { useEffect, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { PROCESS_COLLECTIONS } from '../../constants/process';
import { toTask } from '../../lib/process/converters';
import type { Task } from '../../types/process';

export function useAllProcessTasks(currentUser: FirebaseUser | null) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!currentUser) return;

    const q = query(collection(db, PROCESS_COLLECTIONS.tasks));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setTasks(snapshot.docs.map((item) => toTask(item.id, item.data())));
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('[Process] 全タスク取得エラー:', err);
        setError(err);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [currentUser]);

  return {
    tasks: currentUser ? tasks : [],
    loading: currentUser ? loading : false,
    error: currentUser ? error : null,
  };
}
