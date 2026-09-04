"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.backfillRoomCreatorsBatch = exports.deleteChatRoom = exports.backfillRoomCreatorOnCreate = void 0;
const admin = require("firebase-admin");
const firestore_1 = require("firebase-admin/firestore");
const firestore_2 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const db = admin.firestore();
const PAGE_SIZE = 200;
function requiredRoomId(value) {
    if (typeof value !== 'string' || !value.trim()) {
        throw new https_1.HttpsError('invalid-argument', 'roomId is required.');
    }
    return value.trim();
}
function roomCreator(data) {
    if (typeof data.createdBy === 'string' && data.createdBy.trim())
        return data.createdBy.trim();
    if (!Array.isArray(data.members))
        return null;
    const firstMember = data.members.find((member) => typeof member === 'string' && Boolean(member));
    return firstMember !== null && firstMember !== void 0 ? firstMember : null;
}
function roomMembers(data) {
    if (!Array.isArray(data.members))
        return [];
    return [...new Set(data.members.filter((member) => typeof member === 'string' && Boolean(member)))];
}
async function deleteStorageForRoom(roomId, photoStoragePath) {
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
async function deleteNotificationSettings(roomId, members) {
    if (members.length === 0)
        return;
    const writer = db.bulkWriter();
    members.forEach((uid) => writer.delete(db.collection('users').doc(uid).collection('notificationSettings').doc(roomId)));
    await writer.close();
}
async function deleteRoomSubcollections(roomRef) {
    const subcollections = await roomRef.listCollections();
    for (const subcollection of subcollections) {
        await db.recursiveDelete(subcollection);
    }
}
// 旧クライアントが createdBy を送らなくても、先頭メンバーを作成者として補完する。
exports.backfillRoomCreatorOnCreate = (0, firestore_2.onDocumentCreated)('chatRooms/{roomId}', async (event) => {
    const snapshot = event.data;
    const data = snapshot === null || snapshot === void 0 ? void 0 : snapshot.data();
    if (!snapshot || !data || data.type === 'memo')
        return;
    if (data.type !== 'direct' && data.type !== 'group')
        return;
    const createdBy = roomCreator(data);
    if (!createdBy)
        return;
    const updates = {};
    if (typeof data.createdBy !== 'string' || !data.createdBy.trim())
        updates.createdBy = createdBy;
    if (typeof data.deletionState !== 'string')
        updates.deletionState = 'active';
    if (Object.keys(updates).length > 0)
        await snapshot.ref.update(updates);
});
// ルーム参加者が呼べる完全削除。ルーム本体は最後に消し、途中失敗時は再試行可能にする。
exports.deleteChatRoom = (0, https_1.onCall)({ timeoutSeconds: 540, memory: '512MiB' }, async (request) => {
    var _a, _b, _c;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication is required.');
    const roomId = requiredRoomId((_a = request.data) === null || _a === void 0 ? void 0 : _a.roomId);
    const roomRef = db.collection('chatRooms').doc(roomId);
    const roomSnapshot = await roomRef.get();
    if (!roomSnapshot.exists)
        return { roomId, status: 'already-deleted' };
    const room = (_b = roomSnapshot.data()) !== null && _b !== void 0 ? _b : {};
    if (room.type !== 'direct' && room.type !== 'group') {
        throw new https_1.HttpsError('failed-precondition', 'Memo rooms cannot be deleted.');
    }
    const members = roomMembers(room);
    if (!members.includes(request.auth.uid)) {
        throw new https_1.HttpsError('permission-denied', 'Only room members can delete rooms.');
    }
    await roomRef.update({
        deletionState: 'deleting',
        deletionRequestedBy: request.auth.uid,
        deletionStartedAt: firestore_1.FieldValue.serverTimestamp(),
        deletionErrorCode: firestore_1.FieldValue.delete(),
    });
    try {
        await deleteStorageForRoom(roomId, room.photoStoragePath);
        await deleteRoomSubcollections(roomRef);
        await deleteNotificationSettings(roomId, members);
        await roomRef.delete();
        return { roomId, status: 'deleted' };
    }
    catch (error) {
        console.error('[deleteChatRoom] cleanup failed', { roomId, error });
        await roomRef.update({
            deletionState: 'delete_failed',
            deletionErrorCode: (_c = error.code) !== null && _c !== void 0 ? _c : 'room-delete-failed',
            deletionFailedAt: firestore_1.FieldValue.serverTimestamp(),
        }).catch((updateError) => console.error('[deleteChatRoom] failed state update failed', { roomId, updateError }));
        throw new https_1.HttpsError('internal', 'Room deletion failed. Retry is allowed.');
    }
});
// 本番移行用。dryRun=true が既定で、既存 direct/group の members[0] を createdBy に設定する。
exports.backfillRoomCreatorsBatch = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e;
    if (!request.auth || request.auth.token.admin !== true) {
        throw new https_1.HttpsError('permission-denied', 'Administrator privileges are required.');
    }
    const requestedLimit = Number.isInteger((_a = request.data) === null || _a === void 0 ? void 0 : _a.limit) ? Number(request.data.limit) : PAGE_SIZE;
    const limit = Math.min(PAGE_SIZE, Math.max(1, requestedLimit));
    const cursor = typeof ((_b = request.data) === null || _b === void 0 ? void 0 : _b.cursor) === 'string' && request.data.cursor ? request.data.cursor : null;
    const dryRun = ((_c = request.data) === null || _c === void 0 ? void 0 : _c.dryRun) !== false;
    let query = db.collection('chatRooms').orderBy(firestore_1.FieldPath.documentId()).limit(limit);
    if (cursor)
        query = query.startAfter(cursor);
    const snapshot = await query.get();
    const writer = dryRun ? null : db.bulkWriter();
    let missingCreator = 0;
    let writable = 0;
    let invalid = 0;
    for (const room of snapshot.docs) {
        const data = room.data();
        if (data.type !== 'direct' && data.type !== 'group')
            continue;
        if (typeof data.createdBy === 'string' && data.createdBy.trim())
            continue;
        missingCreator += 1;
        const createdBy = roomCreator(data);
        if (!createdBy) {
            invalid += 1;
            continue;
        }
        writable += 1;
        writer === null || writer === void 0 ? void 0 : writer.update(room.ref, {
            createdBy,
            deletionState: typeof data.deletionState === 'string' ? data.deletionState : 'active',
        });
    }
    await (writer === null || writer === void 0 ? void 0 : writer.close());
    return {
        dryRun,
        scanned: snapshot.size,
        missingCreator,
        writable,
        written: dryRun ? 0 : writable,
        invalid,
        nextCursor: snapshot.size === limit ? (_e = (_d = snapshot.docs[snapshot.docs.length - 1]) === null || _d === void 0 ? void 0 : _d.id) !== null && _e !== void 0 ? _e : null : null,
    };
});
//# sourceMappingURL=roomLifecycle.js.map