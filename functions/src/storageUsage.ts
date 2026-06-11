// ストレージ使用量の集計ヘルパー。index.ts から機械的に移動（挙動変更なし）。
// admin.initializeApp() は index.ts で1回だけ実行される前提のため、db は引数で受け取る
// （functions/src/process/index.ts と同じ規約。モジュール初期化順の事故を避ける）。

import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export function getTrackedFileSize(data: admin.firestore.DocumentData | undefined): number {
  if (!data?.storagePath || typeof data.fileSize !== 'number') return 0;
  return data.fileSize;
}

export function getTrackedPhotoFileSize(data: admin.firestore.DocumentData | undefined): number {
  if (!data?.photoStoragePath || typeof data.photoFileSize !== 'number') return 0;
  return data.photoFileSize;
}

export async function adjustStorageUsage(db: admin.firestore.Firestore, deltaBytes: number): Promise<void> {
  if (deltaBytes === 0) return;

  await db.collection('settings').doc('storageUsage').set({
    totalBytes: FieldValue.increment(deltaBytes),
    lastUpdated: FieldValue.serverTimestamp()
  }, { merge: true });
}
