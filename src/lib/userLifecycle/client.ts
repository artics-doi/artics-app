import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';

export type UserDeletionState =
  | 'requested'
  | 'auth_disabled'
  | 'tokens_revoked'
  | 'cleaning'
  | 'auth_deleted'
  | 'failed'
  | 'cancelled'
  | 'completed';

export interface UserDeletionOperation {
  operationId: string;
  state: UserDeletionState;
  lifecycleVersion: number;
  errorCode?: string;
  requiresReauthentication?: boolean;
}

const requestDeletion = httpsCallable<
  { targetUid: string; expectedLifecycleVersion: number; clientVersion: string },
  { operationId: string; state: UserDeletionState; lifecycleVersion: number }
>(functions, 'requestUserDeletion');

export async function requestUserDeletion(
  targetUid: string,
  expectedLifecycleVersion: number,
  clientVersion: string,
): Promise<UserDeletionOperation> {
  const result = await requestDeletion({ targetUid, expectedLifecycleVersion, clientVersion });
  return { ...result.data };
}

export function watchUserDeletion(
  operationId: string,
  callback: (operation: UserDeletionOperation) => void,
): Unsubscribe {
  return onSnapshot(doc(db, 'userDeletionOperations', operationId), (snapshot) => {
    if (!snapshot.exists()) return;
    const data = snapshot.data();
    callback({
      operationId,
      state: data.state as UserDeletionState,
      lifecycleVersion: typeof data.lifecycleVersion === 'number' ? data.lifecycleVersion : 0,
      errorCode: typeof data.errorCode === 'string' ? data.errorCode : undefined,
      requiresReauthentication: data.requiresReauthentication === true,
    });
  });
}
