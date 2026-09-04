import * as admin from 'firebase-admin';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

const db = admin.firestore();
const PAGE_SIZE = 200;

function requiredRoomId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpsError('invalid-argument', 'roomId is required.');
  }
  return value.trim();
}

function roomCreator(data: admin.firestore.DocumentData): string | null {
  if (typeof data.createdBy === 'string' && data.createdBy.trim()) return data.createdBy.trim();
  if (!Array.isArray(data.members)) return null;
  const firstMember = data.members.find((member: unknown): member is string => typeof member === 'string' && Boolean(member));
  return firstMember ?? null;
}

function roomMembers(data: admin.firestore.DocumentData): string[] {
  if (!Array.isArray(data.members)) return [];
  return [...new Set(data.members.filter((member: unknown): member is string => typeof member === 'string' && Boolean(member)))];
}

async function deleteStorageForRoom(roomId: string, photoStoragePath: unknown): Promise<void> {
  const bucket = admin.storage().bucket();
  const prefixes = [
    `chatFiles/${roomId}/`,
    `chatImages/${roomId}/`,
    `groupImages/${roomId}/`,
  ];
  await Promise.all(prefixes.map((prefix) => bucket.deleteFiles({ prefix, force: true })));
  if (typeof photoStoragePath === 'string' && photoStoragePath) {
    await bucket.file(photoStoragePath).delete({ ignoreNotFound: true });
  }
}

async function deleteNotificationSettings(roomId: string, members: readonly string[]): Promise<void> {
  if (members.length === 0) return;
  const writer = db.bulkWriter();
  members.forEach((uid) => writer.delete(db.collection('users').doc(uid).collection('notificationSettings').doc(roomId)));
  await writer.close();
}

async function deleteRoomSubcollections(roomRef: admin.firestore.DocumentReference): Promise<void> {
  const subcollections = await roomRef.listCollections();
  for (const subcollection of subcollections) {
    await db.recursiveDelete(subcollection);
  }
}

// 旧クライアントが createdBy を送らなくても、先頭メンバーを作成者として補完する。
export const backfillRoomCreatorOnCreate = onDocumentCreated(
  'chatRooms/{roomId}',
  async (event) => {
    const snapshot = event.data;
    const data = snapshot?.data();
    if (!snapshot || !data || data.type === 'memo') return;
    if (data.type !== 'direct' && data.type !== 'group') return;
    const createdBy = roomCreator(data);
    if (!createdBy) return;
    const updates: Record<string, unknown> = {};
    if (typeof data.createdBy !== 'string' || !data.createdBy.trim()) updates.createdBy = createdBy;
    if (typeof data.deletionState !== 'string') updates.deletionState = 'active';
    if (Object.keys(updates).length > 0) await snapshot.ref.update(updates);
  },
);

// ルーム参加者が呼べる完全削除。ルーム本体は最後に消し、途中失敗時は再試行可能にする。
export const deleteChatRoom = onCall(
  { timeoutSeconds: 540, memory: '512MiB' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.');
    const roomId = requiredRoomId(request.data?.roomId);
    const roomRef = db.collection('chatRooms').doc(roomId);
    const roomSnapshot = await roomRef.get();
    if (!roomSnapshot.exists) return { roomId, status: 'already-deleted' as const };

    const room = roomSnapshot.data() ?? {};
    if (room.type !== 'direct' && room.type !== 'group') {
      throw new HttpsError('failed-precondition', 'Memo rooms cannot be deleted.');
    }
    const members = roomMembers(room);
    if (!members.includes(request.auth.uid)) {
      throw new HttpsError('permission-denied', 'Only room members can delete rooms.');
    }

    await roomRef.update({
      deletionState: 'deleting',
      deletionRequestedBy: request.auth.uid,
      deletionStartedAt: FieldValue.serverTimestamp(),
      deletionErrorCode: FieldValue.delete(),
    });

    try {
      await deleteStorageForRoom(roomId, room.photoStoragePath);
      await deleteRoomSubcollections(roomRef);
      await deleteNotificationSettings(roomId, members);
      await roomRef.delete();
      return { roomId, status: 'deleted' as const };
    } catch (error) {
      console.error('[deleteChatRoom] cleanup failed', { roomId, error });
      await roomRef.update({
        deletionState: 'delete_failed',
        deletionErrorCode: (error as { code?: string }).code ?? 'room-delete-failed',
        deletionFailedAt: FieldValue.serverTimestamp(),
      }).catch((updateError) => console.error('[deleteChatRoom] failed state update failed', { roomId, updateError }));
      throw new HttpsError('internal', 'Room deletion failed. Retry is allowed.');
    }
  },
);

// 本番移行用。dryRun=true が既定で、既存 direct/group の members[0] を createdBy に設定する。
export const backfillRoomCreatorsBatch = onCall(async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Administrator privileges are required.');
  }
  const requestedLimit = Number.isInteger(request.data?.limit) ? Number(request.data.limit) : PAGE_SIZE;
  const limit = Math.min(PAGE_SIZE, Math.max(1, requestedLimit));
  const cursor = typeof request.data?.cursor === 'string' && request.data.cursor ? request.data.cursor : null;
  const dryRun = request.data?.dryRun !== false;
  let query = db.collection('chatRooms').orderBy(FieldPath.documentId()).limit(limit);
  if (cursor) query = query.startAfter(cursor);
  const snapshot = await query.get();
  const writer = dryRun ? null : db.bulkWriter();
  let missingCreator = 0;
  let writable = 0;
  let invalid = 0;

  for (const room of snapshot.docs) {
    const data = room.data();
    if (data.type !== 'direct' && data.type !== 'group') continue;
    if (typeof data.createdBy === 'string' && data.createdBy.trim()) continue;
    missingCreator += 1;
    const createdBy = roomCreator(data);
    if (!createdBy) {
      invalid += 1;
      continue;
    }
    writable += 1;
    writer?.update(room.ref, {
      createdBy,
      deletionState: typeof data.deletionState === 'string' ? data.deletionState : 'active',
    });
  }
  await writer?.close();

  return {
    dryRun,
    scanned: snapshot.size,
    missingCreator,
    writable,
    written: dryRun ? 0 : writable,
    invalid,
    nextCursor: snapshot.size === limit ? snapshot.docs[snapshot.docs.length - 1]?.id ?? null : null,
  };
});
