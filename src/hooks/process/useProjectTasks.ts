// 1つのプロジェクト配下のタスクを購読し、カンバン/ガントの CRUD を提供する。
//
// 購読は where('projectId','==',projectId) + orderBy('order')。
// これは firestore.indexes.json の tasks(projectId+order) 複合インデックスと一致する。
//
// ドラッグ操作（移動・並べ替え）は「確定時のみ write」する。楽観更新で UI を先に動かし、
// onSnapshot の反映を待たない。includeMetadataChanges:true で hasPendingWrites を見て、
// 自分の書き込み途中の doc はちらつかせない。

import { useCallback, useEffect, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  addDoc,
  writeBatch,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { PROCESS_COLLECTIONS } from '../../constants/process';
import {
  taskInputToCreateData,
  taskInputToUpdateData,
  toTask,
} from '../../lib/process/converters';
import { betweenOrderKey, rebuildOrderKeys } from '../../lib/process/order';
import { buildAppendedTaskOrderKeys } from '../../lib/process/taskOrdering';
import type { Task, TaskInput } from '../../types/process';

function creatorOf(user: FirebaseUser) {
  return {
    createdBy: user.uid,
    createdByName: user.displayName || user.email || 'Unknown',
  };
}

export function useProjectTasks(currentUser: FirebaseUser | null, projectId: string | null) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // projectId / ユーザーが無いときは購読しない。
    // その場合の「tasks は空・loading しない」扱いは戻り値側のガードで担保する
    // （effect 内で同期 setState すると cascading render になるため避ける）。
    if (!currentUser || !projectId) return;

    const q = query(
      collection(db, PROCESS_COLLECTIONS.tasks),
      where('projectId', '==', projectId),
      orderBy('order', 'asc'),
    );
    const unsubscribe = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snapshot) => {
        setTasks(snapshot.docs.map((item) => toTask(item.id, item.data())));
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('[Process] タスク取得エラー:', err);
        setError(err);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [currentUser, projectId]);

  // 指定列の末尾に新規タスクを作る。order は同列末尾、ganttOrder はガント全体末尾にする。
  // archived=false は converters で必ず埋まる。
  const createTask = useCallback(
    async (input: TaskInput) => {
      if (!currentUser || !projectId) throw new Error('ログインが必要です');
      const { order, ganttOrder } = buildAppendedTaskOrderKeys(tasks, input.columnId);
      console.info('[Process] createTask', { projectId, columnId: input.columnId });
      await addDoc(
        collection(db, PROCESS_COLLECTIONS.tasks),
        taskInputToCreateData(input, projectId, order, ganttOrder, creatorOf(currentUser)),
      );
    },
    [currentUser, projectId, tasks],
  );

  const duplicateTask = useCallback(
    async (sourceTask: Task) => {
      if (!currentUser || !projectId) throw new Error('ログインが必要です');
      const { order, ganttOrder } = buildAppendedTaskOrderKeys(tasks, sourceTask.columnId);
      console.info('[Process] duplicateTask', { projectId, sourceTaskId: sourceTask.id });
      await addDoc(
        collection(db, PROCESS_COLLECTIONS.tasks),
        taskInputToCreateData(
          {
            title: `${sourceTask.title} のコピー`,
            columnId: sourceTask.columnId,
            assigneeIds: sourceTask.assigneeIds,
            startDate: sourceTask.startDate,
            endDate: sourceTask.endDate,
            completedDate: sourceTask.completedDate,
            completionChecked: sourceTask.completionChecked,
            description: sourceTask.description,
          },
          projectId,
          order,
          ganttOrder,
          creatorOf(currentUser),
        ),
      );
    },
    [currentUser, projectId, tasks],
  );

  // タスクの基本情報を更新（projectId / createdBy は不変なので含めない）。
  const updateTask = useCallback(
    async (taskId: string, input: TaskInput) => {
      if (!currentUser) throw new Error('ログインが必要です');
      console.info('[Process] updateTask', { taskId });
      await updateDoc(doc(db, PROCESS_COLLECTIONS.tasks, taskId), taskInputToUpdateData(input));
    },
    [currentUser],
  );

  // 個別アーカイブは1ドキュメントだけを更新し、購読条件は増やさない。
  const setTaskArchived = useCallback(
    async (taskId: string, isArchived: boolean) => {
      if (!currentUser) throw new Error('ログインが必要です');
      console.info('[Process] setTaskArchived', { taskId, isArchived });
      await updateDoc(doc(db, PROCESS_COLLECTIONS.tasks, taskId), {
        isArchived,
        updatedAt: serverTimestamp(),
      });
    },
    [currentUser],
  );

  // 列をまたいだ移動 + 並び順を1回の更新で確定する。
  // targetColumnId 内の prevOrder/nextOrder の間に入るキーを採番する（どちらも null 可）。
  const moveTask = useCallback(
    async (
      taskId: string,
      targetColumnId: string,
      prevOrder: string | null,
      nextOrder: string | null,
      updates: Partial<Pick<TaskInput, 'completedDate' | 'completionChecked'>> = {},
    ) => {
      if (!currentUser) throw new Error('ログインが必要です');
      const order = betweenOrderKey(prevOrder, nextOrder);
      console.info('[Process] moveTask', { taskId, targetColumnId });
      const updateData: Record<string, unknown> = {
        columnId: targetColumnId,
        order,
        updatedAt: serverTimestamp(),
      };
      if ('completedDate' in updates) {
        updateData.completedDate = updates.completedDate;
      }
      if ('completionChecked' in updates) {
        updateData.completionChecked = updates.completionChecked === true;
      }
      await updateDoc(doc(db, PROCESS_COLLECTIONS.tasks, taskId), updateData);
    },
    [currentUser],
  );

  // 同一列内の並べ替え（列移動なし）。order のみ更新。
  const reorderTask = useCallback(
    async (taskId: string, prevOrder: string | null, nextOrder: string | null) => {
      if (!currentUser) throw new Error('ログインが必要です');
      const order = betweenOrderKey(prevOrder, nextOrder);
      console.info('[Process] reorderTask', { taskId });
      await updateDoc(doc(db, PROCESS_COLLECTIONS.tasks, taskId), {
        order,
        updatedAt: serverTimestamp(),
      });
    },
    [currentUser],
  );

  const setGanttOrderForTasks = useCallback(
    async (taskIds: readonly string[]) => {
      if (!currentUser) throw new Error('ログインが必要です');
      if (taskIds.length === 0) return;
      const taskIdSet = new Set(tasks.map((task) => task.id));
      const orderedIds = taskIds.filter((taskId) => taskIdSet.has(taskId));
      const keys = rebuildOrderKeys(orderedIds.length);
      const batch = writeBatch(db);
      let writeCount = 0;
      orderedIds.forEach((taskId, index) => {
        const currentTask = tasks.find((task) => task.id === taskId);
        if (currentTask?.ganttOrder === keys[index]) return;
        batch.update(doc(db, PROCESS_COLLECTIONS.tasks, taskId), {
          ganttOrder: keys[index],
          updatedAt: serverTimestamp(),
        });
        writeCount += 1;
      });
      if (writeCount === 0) return;
      console.info('[Process] setGanttOrderForTasks', { count: orderedIds.length });
      await batch.commit();
    },
    [currentUser, tasks],
  );

  // タスク削除（クライアント直接削除。サブコレクション無しなので Function 不要）。
  const deleteTask = useCallback(
    async (taskId: string) => {
      if (!currentUser) throw new Error('ログインが必要です');
      console.info('[Process] deleteTask', { taskId });
      await deleteDoc(doc(db, PROCESS_COLLECTIONS.tasks, taskId));
    },
    [currentUser],
  );

  return {
    tasks: currentUser && projectId ? tasks : [],
    loading: currentUser && projectId ? loading : false,
    error: currentUser && projectId ? error : null,
    createTask,
    duplicateTask,
    updateTask,
    setTaskArchived,
    moveTask,
    reorderTask,
    setGanttOrderForTasks,
    deleteTask,
  };
}
