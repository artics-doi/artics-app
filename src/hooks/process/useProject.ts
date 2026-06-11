// 単一プロジェクトの購読 + 列(columns)更新。カンバン/ガント画面で使う。
// 一覧購読の useProjects とは別に、特定 projectId の doc を直接見る
// （アーカイブ済みプロジェクトのカンバンも開けるようにするため）。

import { useCallback, useEffect, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { PROCESS_COLLECTIONS } from '../../constants/process';
import { toProject } from '../../lib/process/converters';
import type { Project, ProjectColumn } from '../../types/process';

export function useProject(currentUser: FirebaseUser | null, projectId: string | null) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!currentUser || !projectId) return;

    const ref = doc(db, PROCESS_COLLECTIONS.projects, projectId);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setProject(null);
          setNotFound(true);
          setLoading(false);
          return;
        }
        const p = toProject(snap.id, snap.data());
        // 削除処理中（pendingDelete）のプロジェクトは「無い」扱いにして一覧へ戻せるようにする。
        if (p.pendingDelete) {
          setProject(null);
          setNotFound(true);
          setLoading(false);
          return;
        }
        setProject(p);
        setNotFound(false);
        setLoading(false);
      },
      (err) => {
        console.error('[Process] プロジェクト購読エラー:', err);
        setNotFound(true);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [currentUser, projectId]);

  // 列の追加/リネーム/並べ替え/削除をまとめて確定する（runTransaction でレース防止）。
  const updateColumns = useCallback(
    async (nextColumns: ProjectColumn[]) => {
      if (!currentUser || !projectId) throw new Error('ログインが必要です');
      const ref = doc(db, PROCESS_COLLECTIONS.projects, projectId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('プロジェクトが見つかりません');
        tx.update(ref, { columns: nextColumns, updatedAt: serverTimestamp() });
      });
    },
    [currentUser, projectId],
  );

  return {
    project: currentUser && projectId ? project : null,
    loading: currentUser && projectId ? loading : false,
    notFound,
    updateColumns,
  };
}
