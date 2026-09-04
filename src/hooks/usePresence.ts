import { useEffect } from 'react';
import { ref, set, remove, onValue, onDisconnect, serverTimestamp } from 'firebase/database';
import { rtdb } from '../lib/firebase';

export function usePresence(userId: string | null | undefined) {
  useEffect(() => {
    if (!userId) return;

    const connectionId = crypto.randomUUID();
    const connectionRef = ref(rtdb, `/presenceConnections/${userId}/${connectionId}`);
    const connectedRef = ref(rtdb, '.info/connected');

    const unsubscribe = onValue(connectedRef, (snapshot) => {
      if (snapshot.val() === false) return;

      onDisconnect(connectionRef).remove().then(() => {
        set(connectionRef, {
          online: true,
          connectedAt: serverTimestamp()
        });
      });
    });

    return () => {
      unsubscribe();
      void remove(connectionRef);
    };
  }, [userId]);
}
