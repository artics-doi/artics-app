// ダッシュボード用の全プロジェクト横断タスク購読（Phase 2）。
//
// 【M1/重大3 修正】購読条件は where('archived','==',false) のみ。
//   週/月/年ウィンドウの絞り込みは「クライアント側フィルタ」で行う。
//   理由: endDate に範囲 where を掛けると
//     (a) endDate=null（締切未設定だが今週着手）のタスク、
//     (b) 期間の途中から始まる複数日タスク
//   がインデックス条件次第で見えなくなる。横断母数は active タスクのみ
//   （開発課規模なら数百件程度）なのでクライアントフィルタが安全かつシンプル。
//
// 必要インデックス: tasks: archived(asc) の単一フィールド（Firestore が自動作成。複合不要）。
//
// 前提（M1）: 全タスクは作成時に archived=false を持つ（converters の taskInputToCreateData が必ず埋める）。
//   等値 where はフィールド未設定 doc にマッチしないため、この前提が崩れると脱落する。

import { useEffect, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { PROCESS_COLLECTIONS } from '../../constants/process';
import { toTask } from '../../lib/process/converters';
import type { Task } from '../../types/process';

export function useDashboardTasks(currentUser: FirebaseUser | null) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // 未ログイン時は購読しない。「tasks 空・loading しない」扱いは戻り値側のガードで担保する
    // （effect 内で同期 setState すると cascading render になるため避ける）。
    if (!currentUser) return;

    // orderBy は付けない（クライアント側で期間/担当者別に並べ替えるため）。
    // archived 単一フィールドの等値 where なのでインデックスは自動。
    const q = query(
      collection(db, PROCESS_COLLECTIONS.tasks),
      where('archived', '==', false),
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setTasks(snapshot.docs.map((item) => toTask(item.id, item.data())));
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('[Process] ダッシュボードタスク取得エラー:', err);
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
