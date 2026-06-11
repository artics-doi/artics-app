import { useState, useEffect } from 'react';
import { ref, onValue, off } from 'firebase/database';
import { rtdb } from '../lib/firebase';

export function useOnlineStatus(userIds: string[]): Record<string, boolean> {
  const [statusMap, setStatusMap] = useState<Record<string, boolean>>({});

  const key = userIds.join(',');

  useEffect(() => {
    if (userIds.length === 0) return;

    const refs: Array<ReturnType<typeof ref>> = [];

    userIds.forEach((uid) => {
      const statusRef = ref(rtdb, `/status/${uid}/online`);
      refs.push(statusRef);
      onValue(statusRef, (snapshot) => {
        setStatusMap((prev) => ({ ...prev, [uid]: snapshot.val() === true }));
      });
    });

    return () => {
      refs.forEach((r) => off(r));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return statusMap;
}
