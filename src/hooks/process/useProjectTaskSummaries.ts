import { useEffect, useMemo, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { PROCESS_COLLECTIONS } from '../../constants/process';
import { db } from '../../lib/firebase';
import { toTask } from '../../lib/process/converters';
import { buildProjectTaskSummaries } from '../../lib/process/projectList';
import type { Project, ProjectStatus, Task } from '../../types/process';

export function useProjectTaskSummaries(
  currentUser: FirebaseUser | null,
  status: ProjectStatus,
  projects: readonly Project[],
) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, PROCESS_COLLECTIONS.tasks),
      where('archived', '==', status === 'archived'),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setTasks(snapshot.docs.map((item) => toTask(item.id, item.data())));
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('[Process] プロジェクト別タスク集計取得エラー:', err);
        setError(err);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [currentUser, status]);

  const summaries = useMemo(() => buildProjectTaskSummaries(projects, tasks), [projects, tasks]);

  return {
    summaries: currentUser ? summaries : new Map(),
    loading: currentUser ? loading : false,
    error: currentUser ? error : null,
  };
}
