// 工程管理（process management）の Cloud Functions。
//
// 【M0・重要】このファイルの export は functions/src/index.ts 末尾の
//   `export * from './process';` で再エクスポートされて初めてデプロイ対象になる。
//   再エクスポートを忘れると tsc は通るが Firebase に認識されず、無言で機能しない。
//   デプロイ後は `firebase functions:list` に onProjectUpdated が出ることを必ず確認する。
//
// admin.initializeApp() は functions/src/index.ts で1回だけ実行される前提。
// ここでは admin.firestore() を関数内で取得して使う（モジュール初期化順の事故を避ける）。

import * as admin from 'firebase-admin';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';

const TASKS_COLLECTION = 'tasks';
const PROJECTS_COLLECTION = 'projects';
const BATCH_CHUNK = 500; // Firestore のバッチ上限

/**
 * 指定プロジェクト配下の全タスクを 500件チャンクで物理削除する。
 * 途中失敗しても pendingDelete フラグが残るので、再実行で残りを回収できる（冪等）。
 */
async function deleteTasksOfProject(db: admin.firestore.Firestore, projectId: string): Promise<number> {
  const snapshot = await db
    .collection(TASKS_COLLECTION)
    .where('projectId', '==', projectId)
    .get();

  if (snapshot.empty) return 0;

  const docs = snapshot.docs;
  for (let i = 0; i < docs.length; i += BATCH_CHUNK) {
    const batch = db.batch();
    docs.slice(i, i + BATCH_CHUNK).forEach((taskDoc) => {
      batch.delete(taskDoc.ref);
    });
    await batch.commit();
  }
  return docs.length;
}

/**
 * 指定プロジェクト配下の全タスクの archived を 500件チャンクで一括更新する。
 * project ドキュメント自体には一切書き込まない（status 変更で project に書き戻すと無限ループ）。
 */
async function setArchivedForProjectTasks(
  db: admin.firestore.Firestore,
  projectId: string,
  archived: boolean,
): Promise<number> {
  const snapshot = await db
    .collection(TASKS_COLLECTION)
    .where('projectId', '==', projectId)
    .get();

  if (snapshot.empty) return 0;

  const docs = snapshot.docs;
  for (let i = 0; i < docs.length; i += BATCH_CHUNK) {
    const batch = db.batch();
    docs.slice(i, i + BATCH_CHUNK).forEach((taskDoc) => {
      batch.update(taskDoc.ref, { archived });
    });
    await batch.commit();
  }
  return docs.length;
}

/**
 * プロジェクト更新トリガー。削除分岐とアーカイブ同期分岐を early-return で相互排他にする（M5）。
 *
 * 順序（固定）:
 *   (1) before/after どちらか無ければ何もしない
 *   (2) 削除分岐（最優先・他と排他）: pendingDelete が false→true になったら
 *       配下タスクを全削除 → 最後に project doc を delete。末尾 return でアーカイブ分岐へ進ませない。
 *   (3) アーカイブ同期分岐（削除分岐と排他）: status が変わったら配下タスクの archived を追従更新。
 *       project doc は触らない（再帰防止）。
 *   (4) それ以外（name 変更等）は何もしない。
 */
export const onProjectUpdated = onDocumentUpdated('projects/{id}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return; // (1) early guard

  const projectId = event.params.id;
  const db = admin.firestore();

  // (2) 削除分岐（最優先・他と排他）
  if (before.pendingDelete !== true && after.pendingDelete === true) {
    console.log(
      `[process] onProjectUpdated: delete request for project ${projectId} ` +
        `(requested by ${typeof after.createdBy === 'string' ? after.createdBy : 'unknown'})`,
    );
    const deleted = await deleteTasksOfProject(db, projectId);
    // タスク削除が終わってから project 本体を物理削除（delete は onUpdate を引かない）。
    await db.collection(PROJECTS_COLLECTION).doc(projectId).delete();
    console.log(`[process] project ${projectId} deleted with ${deleted} tasks`);
    return; // 末尾 return でアーカイブ分岐に進ませない
  }

  // (3) アーカイブ同期分岐（削除分岐と排他）
  if (before.status !== after.status) {
    const archived = after.status === 'archived';
    const updated = await setArchivedForProjectTasks(db, projectId, archived);
    console.log(
      `[process] project ${projectId} status ${String(before.status)}→${String(after.status)}: ` +
        `archived=${archived} applied to ${updated} tasks`,
    );
    return;
  }

  // (4) それ以外（name/description/colorIndex/columns 変更等）は何もしない
  return;
});
