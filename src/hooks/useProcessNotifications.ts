import { useEffect, useRef } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { collection, limit, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useElectronNotification } from './useElectronNotification';
import { parseProcessNotification } from '../../electron/notificationTypes';

export function useProcessNotifications(currentUser: FirebaseUser | null) {
  const { isElectron, settings } = useElectronNotification();
  const session = useRef<{ uid: string; since: Timestamp } | null>(null);
  useEffect(() => {
    if (!currentUser) { session.current = null; return; }
    if (!isElectron || !window.electronAPI) return;
    if (!settings.enableNotifications) { session.current = null; return; }
    const uid = currentUser.uid;
    if (session.current?.uid !== uid) session.current = { uid, since: Timestamp.now() };
    const storageKey = `artics-process-notifications:${uid}`;
    let seen = new Set<string>();
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
      if (Array.isArray(stored)) seen = new Set(stored.filter((item): item is string => typeof item === 'string'));
    } catch { /* 破損したローカル記録でも通知購読を停止しない。 */ }
    const pending = new Set<string>();
    let disposed = false;
    const inbox = query(collection(db, 'users', uid, 'processNotifications'),
      where('createdAt', '>=', session.current.since), orderBy('createdAt', 'desc'), limit(100));
    const unsubscribe = onSnapshot(inbox, { includeMetadataChanges: true }, snapshot => {
      // キャッシュだけのスナップショットからは通知しない。
      if (snapshot.metadata.fromCache) return;
      snapshot.docs.slice().reverse().forEach(item => {
        if (seen.has(item.id) || pending.has(item.id)) return;
        const data = item.data();
        const process = parseProcessNotification({ ...data,
          occurredAt: data.occurredAt instanceof Timestamp ? data.occurredAt.toDate().toISOString() : '',
        });
        if (!process) return;
        pending.add(item.id);
        void (async () => {
          try {
            if (disposed) return;
            const shown = await window.electronAPI!.showNotification({
              kind: 'process', title: typeof data.taskTitle === 'string' ? data.taskTitle : 'タスク', body: '', process,
            });
            if (shown) {
              seen.add(item.id);
              try { localStorage.setItem(storageKey, JSON.stringify([...seen].slice(-1000))); }
              catch { /* 同一セッション内の重複防止はメモリー側で維持する。 */ }
            }
          } catch (error) { console.error('[Process] 通知表示に失敗:', error); }
          finally { pending.delete(item.id); }
        })();
      });
    }, error => console.error('[Process] 通知の購読に失敗:', error));
    return () => { disposed = true; unsubscribe(); };
  }, [currentUser, isElectron, settings.enableNotifications]);
}
