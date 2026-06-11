// 更新ノート（settings/releaseNotes）の取得。Home.tsx から機械的に移動（挙動変更なし）。
// 保存（管理者機能）はモーダル制御と密結合のため Home.tsx 側に残し、setReleaseNotes を返す。

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function useReleaseNotes() {
  const [releaseNotes, setReleaseNotes] = useState('');

  // 更新ノートを取得
  useEffect(() => {
    async function fetchReleaseNotes() {
      try {
        const docRef = doc(db, 'settings', 'releaseNotes');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setReleaseNotes(docSnap.data().content || '');
        }
      } catch (error) {
        console.error('更新ノート取得エラー:', error);
      }
    }
    fetchReleaseNotes();
  }, []);

  return { releaseNotes, setReleaseNotes };
}
