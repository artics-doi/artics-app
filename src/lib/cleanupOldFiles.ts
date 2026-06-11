// 7日経過したファイルを自動削除するユーティリティ

import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from './firebase';

const DAYS_TO_KEEP = 7;

// 指定日数以上前かどうかをチェック
function isOlderThanDays(date: Date, days: number): boolean {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  return date < cutoffDate;
}

// Storage内のファイルを削除
async function deleteStorageFile(fileUrl: string): Promise<boolean> {
  try {
    // Firebase Storage URLからパスを抽出
    const urlObj = new URL(fileUrl);
    const pathMatch = urlObj.pathname.match(/\/o\/(.+?)(\?|$)/);
    if (!pathMatch) return false;

    const filePath = decodeURIComponent(pathMatch[1]);
    const fileRef = ref(storage, filePath);
    await deleteObject(fileRef);
    return true;
  } catch (error) {
    console.error('ファイル削除エラー:', error);
    return false;
  }
}

// 古いファイルをクリーンアップ
export async function cleanupOldFiles(): Promise<{ deletedCount: number; errorCount: number }> {
  let deletedCount = 0;
  let errorCount = 0;

  try {
    // 全チャットルームを取得
    const roomsSnapshot = await getDocs(collection(db, 'chatRooms'));

    for (const roomDoc of roomsSnapshot.docs) {
      // 各ルームのメッセージを取得
      const messagesSnapshot = await getDocs(
        collection(db, 'chatRooms', roomDoc.id, 'messages')
      );

      for (const messageDoc of messagesSnapshot.docs) {
        const data = messageDoc.data();
        const timestamp = data.createdAt?.toDate?.() || data.timestamp?.toDate?.();

        if (!timestamp) continue;

        // 指定日数以上前のメッセージのファイルをチェック
        if (isOlderThanDays(timestamp, DAYS_TO_KEEP)) {
          let needsUpdate = false;
          const updates: Record<string, null | boolean | Date> = {};
          const imageUrl = data.imageURL || data.imageUrl;
          const fileUrl = data.fileURL || data.fileUrl;

          // 画像ファイルの削除
          if (imageUrl) {
            const deleted = await deleteStorageFile(imageUrl);
            if (deleted) {
              if ('imageURL' in data) updates.imageURL = null;
              if ('imageUrl' in data) updates.imageUrl = null;
              needsUpdate = true;
              deletedCount++;
            } else {
              errorCount++;
            }
          }

          // 添付ファイルの削除
          if (fileUrl) {
            const deleted = await deleteStorageFile(fileUrl);
            if (deleted) {
              if ('fileURL' in data) updates.fileURL = null;
              if ('fileUrl' in data) updates.fileUrl = null;
              updates.fileName = null;
              updates.fileType = null;
              needsUpdate = true;
              deletedCount++;
            } else {
              errorCount++;
            }
          }

          // メッセージドキュメントを更新（ファイル参照を削除、テキストは残す）
          if (needsUpdate) {
            await updateDoc(
              doc(db, 'chatRooms', roomDoc.id, 'messages', messageDoc.id),
              {
                ...updates,
                fileDeleted: true,
                fileDeletedAt: new Date()
              }
            );
          }
        }
      }
    }
  } catch (error) {
    console.error('クリーンアップエラー:', error);
  }

  return { deletedCount, errorCount };
}

// 最後のクリーンアップ実行日をチェック
export function shouldRunCleanup(): boolean {
  const lastCleanup = localStorage.getItem('lastFileCleanup');
  if (!lastCleanup) return true;

  const lastDate = new Date(lastCleanup);
  const now = new Date();
  const hoursSinceLastCleanup = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60);

  // 24時間以上経過していたらクリーンアップを実行
  return hoursSinceLastCleanup >= 24;
}

// クリーンアップ実行日を記録
export function recordCleanupRun(): void {
  localStorage.setItem('lastFileCleanup', new Date().toISOString());
}
