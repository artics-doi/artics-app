import * as admin from 'firebase-admin';
import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';

const db = admin.firestore();
const auth = admin.auth();
const rtdb = admin.database();
const PAGE_SIZE = 200;
const LEASE_MS = 5 * 60 * 1000;
const ACTIVE_STATES = ['requested', 'auth_disabled', 'tokens_revoked', 'cleaning', 'auth_deleted'] as const;
type ActiveState = typeof ACTIVE_STATES[number];

interface OperationData {
  targetUid: string;
  requestedBy: string;
  state: ActiveState | 'failed' | 'cancelled' | 'completed';
  resumeFrom?: ActiveState;
  lifecycleVersion: number;
  version: number;
  lastProcessedVersion: number;
  leaseOwner?: string | null;
  leaseExpiresAt?: Timestamp | null;
  cleanupStep?: string;
  cursor?: string | null;
  targetWasAdmin?: boolean;
}

function requireAdmin(request: { auth?: { uid: string; token: Record<string, unknown> } }): string {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Administrator privileges are required.');
  }
  return request.auth.uid;
}

function integer(value: unknown, name: string): number {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new HttpsError('invalid-argument', `${name} must be a non-negative integer.`);
  }
  return Number(value);
}

function stringValue(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpsError('invalid-argument', `${name} is required.`);
  }
  return value.trim();
}

function parseSemver(value: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function compareSemver(left: [number, number, number], right: [number, number, number]): number {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

async function assertCompatibleClient(clientVersion: unknown): Promise<void> {
  const supplied = typeof clientVersion === 'string' ? parseSemver(clientVersion) : null;
  const compatibility = await db.collection('settings').doc('clientCompatibility').get();
  const minimumValue = compatibility.data()?.minAdminMutationVersion;
  const minimum = typeof minimumValue === 'string' ? parseSemver(minimumValue) : null;
  if (!supplied || !minimum) {
    throw new HttpsError('failed-precondition', 'Admin mutation compatibility is not configured.');
  }
  if (compareSemver(supplied, minimum) < 0) {
    throw new HttpsError('failed-precondition', 'update-required');
  }
}

async function countEnabledAdmins(): Promise<number> {
  let pageToken: string | undefined;
  let count = 0;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      if (!user.disabled && user.customClaims?.admin === true) count += 1;
      if (count >= 2) return count;
    }
    pageToken = page.pageToken;
  } while (pageToken);
  return count;
}

async function releaseAdminLock(operationId: string): Promise<void> {
  const lockRef = db.collection('systemLocks').doc('adminDeletion');
  await db.runTransaction(async (transaction) => {
    const lock = await transaction.get(lockRef);
    if (lock.data()?.operationId === operationId) transaction.delete(lockRef);
  });
}

export const requestUserDeletion = onCall(async (request) => {
  const requestedBy = requireAdmin(request);
  const targetUid = stringValue(request.data?.targetUid, 'targetUid');
  const expectedLifecycleVersion = integer(request.data?.expectedLifecycleVersion, 'expectedLifecycleVersion');
  if (targetUid === requestedBy) throw new HttpsError('failed-precondition', 'Self deletion is not allowed.');
  await assertCompatibleClient(request.data?.clientVersion);

  let authUser: admin.auth.UserRecord;
  try {
    authUser = await auth.getUser(targetUid);
  } catch {
    throw new HttpsError('not-found', 'Target Auth user was not found.');
  }

  const operationRef = db.collection('userDeletionOperations').doc();
  const userRef = db.collection('users').doc(targetUid);
  const lockRef = db.collection('systemLocks').doc('adminDeletion');
  const targetWasAdmin = authUser.customClaims?.admin === true;

  await db.runTransaction(async (transaction) => {
    const [userSnapshot, lockSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(lockRef),
    ]);
    if (!userSnapshot.exists) throw new HttpsError('not-found', 'Target user document was not found.');
    const userData = userSnapshot.data() ?? {};
    const lifecycleVersion = typeof userData.lifecycleVersion === 'number' ? userData.lifecycleVersion : 0;
    const lifecycleState = typeof userData.lifecycleState === 'string' ? userData.lifecycleState : 'active';
    if (lifecycleVersion !== expectedLifecycleVersion) throw new HttpsError('aborted', 'Lifecycle version changed.');
    if (lifecycleState !== 'active' || userData.activeOperationId) {
      throw new HttpsError('already-exists', 'A lifecycle operation is already active.');
    }
    if (targetWasAdmin && lockSnapshot.exists) throw new HttpsError('aborted', 'Another admin deletion is active.');

    const nextLifecycleVersion = lifecycleVersion + 1;
    transaction.create(operationRef, {
      targetUid,
      requestedBy,
      state: 'requested',
      lifecycleVersion: nextLifecycleVersion,
      version: 1,
      lastProcessedVersion: 0,
      targetWasAdmin,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(userRef, {
      lifecycleVersion: nextLifecycleVersion,
      activeOperationId: operationRef.id,
    });
    if (targetWasAdmin) {
      transaction.create(lockRef, { operationId: operationRef.id, createdAt: FieldValue.serverTimestamp() });
    }
  });

  if (targetWasAdmin && await countEnabledAdmins() < 2) {
    await db.runTransaction(async (transaction) => {
      transaction.delete(operationRef);
      transaction.update(userRef, {
        lifecycleVersion: expectedLifecycleVersion,
        activeOperationId: FieldValue.delete(),
      });
      transaction.delete(lockRef);
    });
    throw new HttpsError('failed-precondition', 'The last enabled administrator cannot be deleted.');
  }

  return { operationId: operationRef.id, state: 'requested', lifecycleVersion: expectedLifecycleVersion + 1 };
});

export const cancelUserDeletion = onCall(async (request) => {
  requireAdmin(request);
  const operationId = stringValue(request.data?.operationId, 'operationId');
  const expectedLifecycleVersion = integer(request.data?.expectedLifecycleVersion, 'expectedLifecycleVersion');
  const operationRef = db.collection('userDeletionOperations').doc(operationId);
  const snapshot = await operationRef.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Operation was not found.');
  const operation = snapshot.data() as OperationData;
  if (!['requested', 'auth_disabled', 'tokens_revoked'].includes(operation.state)) {
    throw new HttpsError('failed-precondition', 'Cleanup has started and cancellation is no longer possible.');
  }
  if (operation.lifecycleVersion !== expectedLifecycleVersion) throw new HttpsError('aborted', 'Lifecycle version changed.');

  await auth.updateUser(operation.targetUid, { disabled: false });
  await rtdb.ref(`accessControl/${operation.targetUid}`).set({ lifecycleState: 'active' });
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(operationRef);
    const data = current.data() as OperationData | undefined;
    if (!data || data.version !== operation.version) throw new HttpsError('aborted', 'Operation changed.');
    transaction.update(db.collection('users').doc(operation.targetUid), {
      lifecycleState: 'active',
      lifecycleVersion: expectedLifecycleVersion + 1,
      activeOperationId: FieldValue.delete(),
    });
    transaction.update(operationRef, {
      state: 'cancelled',
      version: data.version + 1,
      leaseOwner: FieldValue.delete(),
      leaseExpiresAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      cancelledAt: FieldValue.serverTimestamp(),
      requiresReauthentication: true,
    });
  });
  if (operation.targetWasAdmin) await releaseAdminLock(operationId);
  return { operationId, state: 'cancelled', requiresReauthentication: true };
});

export const resumeUserDeletion = onCall(async (request) => {
  requireAdmin(request);
  const operationId = stringValue(request.data?.operationId, 'operationId');
  const expectedLifecycleVersion = integer(request.data?.expectedLifecycleVersion, 'expectedLifecycleVersion');
  const operationRef = db.collection('userDeletionOperations').doc(operationId);
  let state = '';
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(operationRef);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Operation was not found.');
    const data = snapshot.data() as OperationData;
    if (data.lifecycleVersion !== expectedLifecycleVersion) throw new HttpsError('aborted', 'Lifecycle version changed.');
    const leaseExpired = data.leaseExpiresAt instanceof Timestamp && data.leaseExpiresAt.toMillis() <= Date.now();
    if (data.state !== 'failed' && !(ACTIVE_STATES.includes(data.state as ActiveState) && leaseExpired)) {
      throw new HttpsError('failed-precondition', 'Operation is not resumable.');
    }
    state = data.state === 'failed' ? data.resumeFrom ?? 'requested' : data.state;
    transaction.update(operationRef, {
      state,
      version: data.version + 1,
      leaseOwner: FieldValue.delete(),
      leaseExpiresAt: FieldValue.delete(),
      errorCode: FieldValue.delete(),
      resumeFrom: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      resumedAt: FieldValue.serverTimestamp(),
    });
  });
  return { operationId, state };
});

export const backfillAccessControlBatch = onCall(async (request) => {
  requireAdmin(request);
  const limit = Math.min(PAGE_SIZE, Math.max(1, integer(request.data?.limit ?? PAGE_SIZE, 'limit')));
  const cursor = typeof request.data?.cursor === 'string' && request.data.cursor ? request.data.cursor : null;
  const dryRun = request.data?.dryRun !== false;
  let query = db.collection('users').orderBy(FieldPath.documentId()).limit(limit);
  if (cursor) query = query.startAfter(cursor);
  const snapshot = await query.get();
  let missing = 0;
  let written = 0;
  const updates: Record<string, unknown> = {};
  for (const user of snapshot.docs) {
    const state = user.data().lifecycleState ?? 'active';
    if (state !== 'active') continue;
    const mirror = await rtdb.ref(`accessControl/${user.id}/lifecycleState`).get();
    if (mirror.val() !== 'active') {
      missing += 1;
      if (!dryRun) {
        updates[`accessControl/${user.id}/lifecycleState`] = 'active';
        written += 1;
      }
    }
  }
  if (!dryRun && Object.keys(updates).length) await rtdb.ref().update(updates);
  return {
    nextCursor: snapshot.size === limit ? snapshot.docs[snapshot.docs.length - 1]?.id ?? null : null,
    scanned: snapshot.size,
    written,
    missing,
  };
});

async function commitOperation(
  operationRef: admin.firestore.DocumentReference,
  leaseOwner: string,
  eventVersion: number,
  patch: Record<string, unknown>,
): Promise<void> {
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(operationRef);
    const data = current.data() as OperationData | undefined;
    if (!data || data.version !== eventVersion || data.leaseOwner !== leaseOwner) {
      throw new HttpsError('aborted', 'Operation lease changed.');
    }
    transaction.update(operationRef, {
      ...patch,
      version: eventVersion + 1,
      lastProcessedVersion: eventVersion,
      leaseOwner: FieldValue.delete(),
      leaseExpiresAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

async function deleteSubcollectionPage(
  userRef: admin.firestore.DocumentReference,
  collectionName: string,
  cursor: string | null,
): Promise<{ cursor: string | null; done: boolean; count: number }> {
  let query = userRef.collection(collectionName).orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
  if (cursor) query = query.startAfter(cursor);
  const snapshot = await query.get();
  if (!snapshot.empty) {
    const batch = db.batch();
    snapshot.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
  }
  return {
    cursor: snapshot.size === PAGE_SIZE ? snapshot.docs[snapshot.docs.length - 1]?.id ?? null : null,
    done: snapshot.size < PAGE_SIZE,
    count: snapshot.size,
  };
}

async function cleanQueryPage(
  query: admin.firestore.Query,
  cursor: string | null,
  mutate: (batch: admin.firestore.WriteBatch, document: admin.firestore.QueryDocumentSnapshot) => void,
): Promise<{ cursor: string | null; done: boolean; count: number }> {
  let paged = query.orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
  if (cursor) paged = paged.startAfter(cursor);
  const snapshot = await paged.get();
  if (!snapshot.empty) {
    const batch = db.batch();
    snapshot.docs.forEach((document) => mutate(batch, document));
    await batch.commit();
  }
  return {
    cursor: snapshot.size === PAGE_SIZE ? snapshot.docs[snapshot.docs.length - 1]?.id ?? null : null,
    done: snapshot.size < PAGE_SIZE,
    count: snapshot.size,
  };
}

async function processCleanup(
  operationRef: admin.firestore.DocumentReference,
  operation: OperationData,
  leaseOwner: string,
  eventVersion: number,
): Promise<void> {
  const userRef = db.collection('users').doc(operation.targetUid);
  const step = operation.cleanupStep ?? 'fcmTokens';
  const cursor = operation.cursor ?? null;
  let result: { cursor: string | null; done: boolean; count: number };
  let nextStep = step;

  if (step === 'fcmTokens' || step === 'notificationSettings') {
    result = await deleteSubcollectionPage(userRef, step, cursor);
    if (result.done) nextStep = step === 'fcmTokens' ? 'notificationSettings' : 'rooms';
  } else if (step === 'rooms') {
    result = await cleanQueryPage(
      db.collection('chatRooms').where('members', 'array-contains', operation.targetUid),
      cursor,
      (batch, document) => batch.update(document.ref, {
        members: FieldValue.arrayRemove(operation.targetUid),
        [`memberDetails.${operation.targetUid}`]: FieldValue.delete(),
        [`unreadCounts.${operation.targetUid}`]: FieldValue.delete(),
      }),
    );
    if (result.done) nextStep = 'schedules';
  } else if (step === 'schedules') {
    result = await cleanQueryPage(
      db.collection('schedules').where('targetUserIds', 'array-contains', operation.targetUid),
      cursor,
      (batch, document) => batch.update(document.ref, {
        targetUserIds: FieldValue.arrayRemove(operation.targetUid),
        updatedAt: FieldValue.serverTimestamp(),
      }),
    );
    if (result.done) nextStep = 'processMembers';
  } else if (step === 'processMembers') {
    result = await cleanQueryPage(
      db.collection('processMembers').where('linkedUserId', '==', operation.targetUid),
      cursor,
      (batch, document) => batch.update(document.ref, { linkedUserId: null }),
    );
    if (result.done) nextStep = 'presenceAndStorage';
  } else {
    await rtdb.ref(`status/${operation.targetUid}`).remove();
    await rtdb.ref(`presenceConnections/${operation.targetUid}`).remove();
    const user = await userRef.get();
    const photoStoragePath = user.data()?.photoStoragePath;
    if (typeof photoStoragePath === 'string' && photoStoragePath) {
      await admin.storage().bucket().file(photoStoragePath).delete({ ignoreNotFound: true });
    }
    await commitOperation(operationRef, leaseOwner, eventVersion, {
      state: 'cleaning',
      cleanupStep: 'auth',
      cursor: null,
      processedCount: FieldValue.increment(1),
    });
    return;
  }

  await commitOperation(operationRef, leaseOwner, eventVersion, {
    state: 'cleaning',
    cleanupStep: nextStep,
    cursor: result.done ? null : result.cursor,
    processedCount: FieldValue.increment(result.count),
  });
}

export const processUserDeletion = onDocumentWritten(
  { document: 'userDeletionOperations/{operationId}', retry: true },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const operationRef = after.ref;
    const initial = after.data() as OperationData;
    if (!ACTIVE_STATES.includes(initial.state as ActiveState)) return;
    const eventVersion = initial.version;
    const leaseOwner = event.id;
    let operation: OperationData | null = null;

    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(operationRef);
      const data = current.data() as OperationData | undefined;
      if (!data || data.lastProcessedVersion >= eventVersion) return;
      if (data.version !== eventVersion) return;
      if (data.leaseExpiresAt instanceof Timestamp && data.leaseExpiresAt.toMillis() > Date.now()) {
        throw new HttpsError('aborted', 'Operation already has an active lease.');
      }
      transaction.update(operationRef, {
        leaseOwner,
        leaseExpiresAt: Timestamp.fromMillis(Date.now() + LEASE_MS),
        attempt: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
      operation = data;
    });
    if (!operation) return;

    const data = operation as OperationData;
    try {
      if (data.state === 'requested') {
        await rtdb.ref(`accessControl/${data.targetUid}`).set({ lifecycleState: 'disabling' });
        await db.collection('users').doc(data.targetUid).update({ lifecycleState: 'disabling' });
        await auth.updateUser(data.targetUid, { disabled: true });
        await commitOperation(operationRef, leaseOwner, eventVersion, { state: 'auth_disabled' });
      } else if (data.state === 'auth_disabled') {
        await auth.revokeRefreshTokens(data.targetUid);
        await commitOperation(operationRef, leaseOwner, eventVersion, { state: 'tokens_revoked' });
      } else if (data.state === 'tokens_revoked') {
        await commitOperation(operationRef, leaseOwner, eventVersion, {
          state: 'cleaning',
          cleanupStep: 'fcmTokens',
          cursor: null,
          cleaningStartedAt: FieldValue.serverTimestamp(),
        });
      } else if (data.state === 'cleaning' && data.cleanupStep !== 'auth') {
        await processCleanup(operationRef, data, leaseOwner, eventVersion);
      } else if (data.state === 'cleaning') {
        try {
          await auth.deleteUser(data.targetUid);
        } catch (error) {
          if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
        }
        await commitOperation(operationRef, leaseOwner, eventVersion, { state: 'auth_deleted' });
      } else if (data.state === 'auth_deleted') {
        await db.runTransaction(async (transaction) => {
          const current = await transaction.get(operationRef);
          const currentData = current.data() as OperationData | undefined;
          if (!currentData || currentData.version !== eventVersion || currentData.leaseOwner !== leaseOwner) {
            throw new HttpsError('aborted', 'Operation lease changed.');
          }
          transaction.set(db.collection('users').doc(data.targetUid), {
            uid: data.targetUid,
            lifecycleState: 'deleted',
            lifecycleVersion: data.lifecycleVersion,
            completedAt: FieldValue.serverTimestamp(),
          });
          transaction.update(operationRef, {
            state: 'completed',
            version: eventVersion + 1,
            lastProcessedVersion: eventVersion,
            leaseOwner: FieldValue.delete(),
            leaseExpiresAt: FieldValue.delete(),
            completedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          if (data.targetWasAdmin) transaction.delete(db.collection('systemLocks').doc('adminDeletion'));
        });
      }
    } catch (error) {
      const errorCode = (error as { code?: string }).code ?? 'unknown';
      await db.runTransaction(async (transaction) => {
        const current = await transaction.get(operationRef);
        const currentData = current.data() as OperationData | undefined;
        if (!currentData || currentData.version !== eventVersion || currentData.leaseOwner !== leaseOwner) return;
        transaction.update(operationRef, {
          state: 'failed',
          resumeFrom: data.state,
          errorCode,
          version: eventVersion + 1,
          lastProcessedVersion: eventVersion,
          leaseOwner: FieldValue.delete(),
          leaseExpiresAt: FieldValue.delete(),
          failedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      console.error(`[userLifecycle] ${operationRef.id} failed in ${data.state}`, error);
    }
  },
);

export const recoverStaleUserDeletions = onSchedule('every 5 minutes', async () => {
  const cutoff = Timestamp.fromMillis(Date.now() - 60_000);
  const snapshot = await db.collection('userDeletionOperations')
    .where('state', 'in', [...ACTIVE_STATES])
    .where('updatedAt', '<=', cutoff)
    .limit(100)
    .get();
  for (const operation of snapshot.docs) {
    const data = operation.data() as OperationData;
    if (!ACTIVE_STATES.includes(data.state as ActiveState)) continue;
    const leaseExpired = !data.leaseExpiresAt || data.leaseExpiresAt.toMillis() <= Date.now();
    if (!leaseExpired) continue;
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(operation.ref);
      const currentData = current.data() as OperationData | undefined;
      if (!currentData || currentData.version !== data.version) return;
      transaction.update(operation.ref, {
        version: currentData.version + 1,
        leaseOwner: FieldValue.delete(),
        leaseExpiresAt: FieldValue.delete(),
        recoveryRequestedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  }
});

export const mirrorNewUserAccessControl = onDocumentCreated('users/{userId}', async (event) => {
  const user = event.data?.data();
  if (!user) return;
  const lifecycleState = typeof user.lifecycleState === 'string' ? user.lifecycleState : 'active';
  await rtdb.ref(`accessControl/${event.params.userId}`).set({ lifecycleState });
});
