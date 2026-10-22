// 更新ノート。正本は同梱文字列で、Firestore は同梱に無い過去の版を1回だけ足す。

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { BUNDLED_RELEASE_NOTES } from '../data/releaseNotes';
import { db } from '../lib/firebase';
import { mergeReleaseNotes } from '../lib/releaseNotes';

export function useReleaseNotes() {
  const [releaseNotes, setReleaseNotes] = useState(BUNDLED_RELEASE_NOTES);

  useEffect(() => {
    async function fetchReleaseNotes() {
      try {
        const docSnap = await getDoc(doc(db, 'settings', 'releaseNotes'));
        const remote = docSnap.exists() ? String(docSnap.data().content || '') : '';
        setReleaseNotes(mergeReleaseNotes(BUNDLED_RELEASE_NOTES, remote));
      } catch (error) {
        console.error('更新ノート取得エラー:', error);
        setReleaseNotes(BUNDLED_RELEASE_NOTES);
      }
    }
    fetchReleaseNotes();
  }, []);

  return { releaseNotes };
}
