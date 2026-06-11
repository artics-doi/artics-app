import { useEffect } from 'react';
import { ref, set, onValue, onDisconnect, serverTimestamp } from 'firebase/database';
import { rtdb } from '../lib/firebase';

export function usePresence(userId: string | null | undefined) {
  useEffect(() => {
    if (!userId) return;

    const statusRef = ref(rtdb, `/status/${userId}`);
    const connectedRef = ref(rtdb, '.info/connected');

    const unsubscribe = onValue(connectedRef, (snapshot) => {
      if (snapshot.val() === false) return;

      onDisconnect(statusRef).set({
        online: false,
        lastSeen: serverTimestamp()
      }).then(() => {
        set(statusRef, {
          online: true,
          lastSeen: serverTimestamp()
        });
      });
    });

    return () => {
      unsubscribe();
      set(statusRef, { online: false, lastSeen: serverTimestamp() });
    };
  }, [userId]);
}
