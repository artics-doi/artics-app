import { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { rtdb } from '../lib/firebase';

export function useOnlineStatus(userIds: string[]): Record<string, boolean> {
  const [statusMap, setStatusMap] = useState<Record<string, boolean>>({});

  const key = userIds.join(',');

  useEffect(() => {
    if (userIds.length === 0) return;

    // off(ref) はそのパスの全リスナーを解除してしまい、同じユーザーを監視する
    // 他のフックインスタンスまで巻き添えになるため、onValue の戻り値で個別解除する
    const unsubscribers: Array<() => void> = [];

    userIds.forEach((uid) => {
      const statusRef = ref(rtdb, `/status/${uid}/online`);
      unsubscribers.push(
        onValue(statusRef, (snapshot) => {
          setStatusMap((prev) => ({ ...prev, [uid]: snapshot.val() === true }));
        })
      );
    });

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return statusMap;
}
