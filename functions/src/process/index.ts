import * as admin from 'firebase-admin';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
export { createProcessTaskNotifications, sendProcessTaskNotification } from './notifications';

const TASKS_COLLECTION = 'tasks';
const PAGE_SIZE = 200;

async function processProjectDeletion(
  projectRef: admin.firestore.DocumentReference,
  projectId: string,
  cursor: string | null,
): Promise<void> {
  const db = admin.firestore();
  let query = db.collection(TASKS_COLLECTION)
    .where('projectId', '==', projectId)
    .orderBy(FieldPath.documentId())
    .limit(PAGE_SIZE);
  if (cursor) query = query.startAfter(cursor);
  const snapshot = await query.get();
  const batch = db.batch();
  snapshot.docs.forEach((task) => batch.delete(task.ref));

  if (snapshot.size < PAGE_SIZE) {
    batch.delete(projectRef);
  } else {
    batch.update(projectRef, {
      lifecycleCursor: snapshot.docs[snapshot.docs.length - 1]?.id ?? null,
      operationVersion: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  console.log(`[process] deletion page ${projectId}: ${snapshot.size}`);
}

async function processArchivePropagation(
  projectRef: admin.firestore.DocumentReference,
  projectId: string,
  archived: boolean,
  cursor: string | null,
): Promise<void> {
  const db = admin.firestore();
  let query = db.collection(TASKS_COLLECTION)
    .where('projectId', '==', projectId)
    .orderBy(FieldPath.documentId())
    .limit(PAGE_SIZE);
  if (cursor) query = query.startAfter(cursor);
  const snapshot = await query.get();
  const batch = db.batch();
  snapshot.docs.forEach((task) => batch.update(task.ref, { archived }));

  if (snapshot.size < PAGE_SIZE) {
    batch.update(projectRef, {
      archiveCursor: FieldValue.delete(),
      archiveTarget: FieldValue.delete(),
      archiveOperationVersion: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else {
    batch.update(projectRef, {
      archiveCursor: snapshot.docs[snapshot.docs.length - 1]?.id ?? null,
      archiveTarget: archived,
      archiveOperationVersion: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  console.log(`[process] archive page ${projectId}: archived=${archived}, count=${snapshot.size}`);
}

export const onProjectUpdated = onDocumentUpdated(
  { document: 'projects/{id}', retry: true },
  async (event) => {
    const before = event.data?.before.data();
    const afterSnapshot = event.data?.after;
    const after = afterSnapshot?.data();
    if (!before || !after || !afterSnapshot) return;

    const projectId = event.params.id;
    const projectRef = afterSnapshot.ref;
    const deleting = after.lifecycleState === 'deleting' || after.pendingDelete === true;
    if (deleting) {
      await processProjectDeletion(
        projectRef,
        projectId,
        typeof after.lifecycleCursor === 'string' ? after.lifecycleCursor : null,
      );
      return;
    }

    const statusChanged = before.status !== after.status;
    const archiveContinuation = typeof after.archiveTarget === 'boolean';
    if (statusChanged || archiveContinuation) {
      await processArchivePropagation(
        projectRef,
        projectId,
        archiveContinuation ? after.archiveTarget : after.status === 'archived',
        typeof after.archiveCursor === 'string' ? after.archiveCursor : null,
      );
    }
  },
);
