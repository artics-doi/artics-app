"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onProjectUpdated = void 0;
const admin = require("firebase-admin");
const firestore_1 = require("firebase-admin/firestore");
const firestore_2 = require("firebase-functions/v2/firestore");
const TASKS_COLLECTION = 'tasks';
const PAGE_SIZE = 200;
async function processProjectDeletion(projectRef, projectId, cursor) {
    var _a, _b;
    const db = admin.firestore();
    let query = db.collection(TASKS_COLLECTION)
        .where('projectId', '==', projectId)
        .orderBy(firestore_1.FieldPath.documentId())
        .limit(PAGE_SIZE);
    if (cursor)
        query = query.startAfter(cursor);
    const snapshot = await query.get();
    const batch = db.batch();
    snapshot.docs.forEach((task) => batch.delete(task.ref));
    if (snapshot.size < PAGE_SIZE) {
        batch.delete(projectRef);
    }
    else {
        batch.update(projectRef, {
            lifecycleCursor: (_b = (_a = snapshot.docs[snapshot.docs.length - 1]) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null,
            operationVersion: firestore_1.FieldValue.increment(1),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    }
    await batch.commit();
    console.log(`[process] deletion page ${projectId}: ${snapshot.size}`);
}
async function processArchivePropagation(projectRef, projectId, archived, cursor) {
    var _a, _b;
    const db = admin.firestore();
    let query = db.collection(TASKS_COLLECTION)
        .where('projectId', '==', projectId)
        .orderBy(firestore_1.FieldPath.documentId())
        .limit(PAGE_SIZE);
    if (cursor)
        query = query.startAfter(cursor);
    const snapshot = await query.get();
    const batch = db.batch();
    snapshot.docs.forEach((task) => batch.update(task.ref, { archived }));
    if (snapshot.size < PAGE_SIZE) {
        batch.update(projectRef, {
            archiveCursor: firestore_1.FieldValue.delete(),
            archiveTarget: firestore_1.FieldValue.delete(),
            archiveOperationVersion: firestore_1.FieldValue.increment(1),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    }
    else {
        batch.update(projectRef, {
            archiveCursor: (_b = (_a = snapshot.docs[snapshot.docs.length - 1]) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null,
            archiveTarget: archived,
            archiveOperationVersion: firestore_1.FieldValue.increment(1),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    }
    await batch.commit();
    console.log(`[process] archive page ${projectId}: archived=${archived}, count=${snapshot.size}`);
}
exports.onProjectUpdated = (0, firestore_2.onDocumentUpdated)({ document: 'projects/{id}', retry: true }, async (event) => {
    var _a, _b;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const afterSnapshot = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after;
    const after = afterSnapshot === null || afterSnapshot === void 0 ? void 0 : afterSnapshot.data();
    if (!before || !after || !afterSnapshot)
        return;
    const projectId = event.params.id;
    const projectRef = afterSnapshot.ref;
    const deleting = after.lifecycleState === 'deleting' || after.pendingDelete === true;
    if (deleting) {
        await processProjectDeletion(projectRef, projectId, typeof after.lifecycleCursor === 'string' ? after.lifecycleCursor : null);
        return;
    }
    const statusChanged = before.status !== after.status;
    const archiveContinuation = typeof after.archiveTarget === 'boolean';
    if (statusChanged || archiveContinuation) {
        await processArchivePropagation(projectRef, projectId, archiveContinuation ? after.archiveTarget : after.status === 'archived', typeof after.archiveCursor === 'string' ? after.archiveCursor : null);
    }
});
//# sourceMappingURL=index.js.map