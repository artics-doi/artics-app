// プロジェクト一覧の購読と CRUD。useSchedules.ts のパターン（onSnapshot + loading/error +
// useCallback CRUD）を踏襲する。
//
// 購読は status ごとに分離する: where('status','==',status) + orderBy('order')。
// これは firestore.indexes.json の projects(status+order) 複合インデックスと一致する。

import { useCallback, useEffect, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { PROCESS_COLLECTIONS, createDefaultColumns } from '../../constants/process';
import {
  projectInputToCreateData,
  projectInputToUpdateData,
  toProject,
} from '../../lib/process/converters';
import { betweenOrderKey, nextOrderKeyForList } from '../../lib/process/order';
import type { Project, ProjectColumn, ProjectInput, ProjectStatus } from '../../types/process';

function creatorOf(user: FirebaseUser) {
  return {
    createdBy: user.uid,
    createdByName: user.displayName || user.email || 'Unknown',
  };
}

export function useProjects(currentUser: FirebaseUser | null, status: ProjectStatus) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, PROCESS_COLLECTIONS.projects),
      where('status', '==', status),
      orderBy('order', 'asc'),
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setProjects(
          snapshot.docs
            .map((item) => toProject(item.id, item.data()))
            // pendingDelete のものは削除処理中なので一覧から隠す
            .filter((p) => p.pendingDelete !== true),
        );
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('[Process] プロジェクト取得エラー:', err);
        setError(err);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [currentUser, status]);

  // 新規作成: デフォルト3列込みで1 addDoc。order は active 一覧の末尾キー。
  const createProject = useCallback(
    async (input: ProjectInput) => {
      if (!currentUser) throw new Error('ログインが必要です');
      const order = nextOrderKeyForList(projects.map((p) => p.order));
      const columns = createDefaultColumns();
      console.info('[Process] createProject', { name: input.name });
      await addDoc(
        collection(db, PROCESS_COLLECTIONS.projects),
        projectInputToCreateData(input, columns, order, creatorOf(currentUser)),
      );
    },
    [currentUser, projects],
  );

  // 基本情報の更新（name/description/colorIndex）。
  const updateProject = useCallback(
    async (projectId: string, input: ProjectInput) => {
      if (!currentUser) throw new Error('ログインが必要です');
      console.info('[Process] updateProject', { projectId });
      await updateDoc(
        doc(db, PROCESS_COLLECTIONS.projects, projectId),
        projectInputToUpdateData(input),
      );
    },
    [currentUser],
  );

  // ステータス変更（アーカイブ / 復帰）。配下タスクの archived は Cloud Function が追従。
  const setProjectStatus = useCallback(
    async (projectId: string, nextStatus: ProjectStatus) => {
      if (!currentUser) throw new Error('ログインが必要です');
      console.info('[Process] setProjectStatus', { projectId, nextStatus });
      await updateDoc(doc(db, PROCESS_COLLECTIONS.projects, projectId), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
    },
    [currentUser],
  );

  // 削除リクエスト: pendingDelete:true を立てるだけ。物理削除は Cloud Function。
  const requestDeleteProject = useCallback(
    async (projectId: string) => {
      if (!currentUser) throw new Error('ログインが必要です');
      console.info('[Process] requestDeleteProject', { projectId, by: currentUser.uid });
      await updateDoc(doc(db, PROCESS_COLLECTIONS.projects, projectId), {
        pendingDelete: true,
        updatedAt: serverTimestamp(),
      });
    },
    [currentUser],
  );

  // プロジェクト一覧の並び替え。前後の order の間に入るキーだけを1件更新する。
  const reorderProject = useCallback(
    async (projectId: string, prevOrder: string | null, nextOrder: string | null) => {
      if (!currentUser) throw new Error('ログインが必要です');
      console.info('[Process] reorderProject', { projectId });
      await updateDoc(doc(db, PROCESS_COLLECTIONS.projects, projectId), {
        order: betweenOrderKey(prevOrder, nextOrder),
        updatedAt: serverTimestamp(),
      });
    },
    [currentUser],
  );

  // 列の追加・並べ替え・リネーム・削除をまとめて行う。
  // 列は配列フィールドなので、同時編集での欠損を防ぐため runTransaction で
  // read-modify-write する。
  const updateColumns = useCallback(
    async (projectId: string, nextColumns: ProjectColumn[]) => {
      if (!currentUser) throw new Error('ログインが必要です');
      const ref = doc(db, PROCESS_COLLECTIONS.projects, projectId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('プロジェクトが見つかりません');
        tx.update(ref, {
          columns: nextColumns,
          updatedAt: serverTimestamp(),
        });
      });
    },
    [currentUser],
  );

  return {
    projects: currentUser ? projects : [],
    loading: currentUser ? loading : false,
    error: currentUser ? error : null,
    createProject,
    updateProject,
    setProjectStatus,
    requestDeleteProject,
    reorderProject,
    updateColumns,
  };
}
