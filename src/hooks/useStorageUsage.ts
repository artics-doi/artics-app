// ストレージ使用量の取得と 80% / 95% 警告トースト。Home.tsx から機械的に移動（挙動変更なし）。
// 管理者による手動上書き（saveStorageUsage）は Home.tsx 側に残し、setStorageUsage を返す。

import { useEffect, useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { getStorageUsage, calculateUsagePercent } from '../lib/storageUsage';

export function useStorageUsage() {
  const [storageUsage, setStorageUsage] = useState<number>(0);
  const { showToast } = useToast();

  // ストレージ使用量を取得
  useEffect(() => {
    async function fetchStorageUsage() {
      const usage = await getStorageUsage();
      setStorageUsage(usage);
    }
    fetchStorageUsage();
  }, []);

  // M-18: ストレージ 80% / 95% 警告（同一しきい値の連発を避けるため localStorage に最後の警告レベルを保存）
  useEffect(() => {
    if (storageUsage === 0) return;
    const percent = calculateUsagePercent(storageUsage);
    const STORAGE_KEY = 'artics:lastStorageWarnLevel';
    const lastLevel = localStorage.getItem(STORAGE_KEY) || 'none';
    let currentLevel: 'none' | 'warning' | 'danger' = 'none';
    if (percent > 95) currentLevel = 'danger';
    else if (percent > 80) currentLevel = 'warning';

    if (currentLevel === 'danger' && lastLevel !== 'danger') {
      showToast('error', `ストレージ使用量が ${Math.round(percent)}% です。古いファイルの削除をご検討ください。`);
      localStorage.setItem(STORAGE_KEY, 'danger');
    } else if (currentLevel === 'warning' && lastLevel === 'none') {
      showToast('warning', `ストレージ使用量が ${Math.round(percent)}% を超えました。`);
      localStorage.setItem(STORAGE_KEY, 'warning');
    } else if (currentLevel === 'none' && lastLevel !== 'none') {
      // 使用量が下がったらリセット
      localStorage.setItem(STORAGE_KEY, 'none');
    }
  }, [storageUsage, showToast]);

  return { storageUsage, setStorageUsage };
}
