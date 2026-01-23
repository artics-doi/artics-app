// ストレージ使用量の追跡・取得

import { doc, getDoc, setDoc, increment } from 'firebase/firestore';
import { db } from './firebase';

// Firebase Storage無料枠: 5GB
export const STORAGE_FREE_LIMIT = 5 * 1024 * 1024 * 1024; // 5GB in bytes

// 使用量を追加
export async function addStorageUsage(bytes: number): Promise<void> {
  try {
    const docRef = doc(db, 'settings', 'storageUsage');
    await setDoc(docRef, {
      totalBytes: increment(bytes),
      lastUpdated: new Date()
    }, { merge: true });
  } catch (error) {
    console.error('ストレージ使用量の記録に失敗:', error);
  }
}

// 使用量を減少
export async function removeStorageUsage(bytes: number): Promise<void> {
  try {
    const docRef = doc(db, 'settings', 'storageUsage');
    await setDoc(docRef, {
      totalBytes: increment(-bytes),
      lastUpdated: new Date()
    }, { merge: true });
  } catch (error) {
    console.error('ストレージ使用量の更新に失敗:', error);
  }
}

// 現在の使用量を取得
export async function getStorageUsage(): Promise<number> {
  try {
    const docRef = doc(db, 'settings', 'storageUsage');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data().totalBytes || 0;
    }
    return 0;
  } catch (error) {
    console.error('ストレージ使用量の取得に失敗:', error);
    return 0;
  }
}

// 使用量を直接設定（管理者用）
export async function setStorageUsageValue(bytes: number): Promise<void> {
  try {
    const docRef = doc(db, 'settings', 'storageUsage');
    await setDoc(docRef, {
      totalBytes: bytes,
      lastUpdated: new Date()
    }, { merge: true });
  } catch (error) {
    console.error('ストレージ使用量の設定に失敗:', error);
    throw error;
  }
}

// バイトを読みやすい形式に変換
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 使用率を計算（パーセント）
export function calculateUsagePercent(usedBytes: number): number {
  return Math.min(100, (usedBytes / STORAGE_FREE_LIMIT) * 100);
}
