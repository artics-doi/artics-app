"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mirrorNewUserAccessControl = exports.recoverStaleUserDeletions = exports.processUserDeletion = exports.backfillAccessControlBatch = exports.resumeUserDeletion = exports.cancelUserDeletion = exports.requestUserDeletion = void 0;
const admin = require("firebase-admin");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const firestore_2 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const db = admin.firestore();
const auth = admin.auth();
const rtdb = admin.database();
const PAGE_SIZE = 200;
const LEASE_MS = 5 * 60 * 1000;
const ACTIVE_STATES = ['requested', 'auth_disabled', 'tokens_revoked', 'cleaning', 'auth_deleted'];
function requireAdmin(request) {
    if (!request.auth || request.auth.token.admin !== true) {
        throw new https_1.HttpsError('permission-denied', 'Administrator privileges are required.');
    }
    return request.auth.uid;
}
function integer(value, name) {
    if (!Number.isInteger(value) || Number(value) < 0) {
        throw new https_1.HttpsError('invalid-argument', `${name} must be a non-negative integer.`);
    }
    return Number(value);
}
function stringValue(value, name) {
    if (typeof value !== 'string' || !value.trim()) {
        throw new https_1.HttpsError('invalid-argument', `${name} is required.`);
    }
    return value.trim();
}
function parseSemver(value) {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}
function compareSemver(left, right) {
    for (let index = 0; index < 3; index += 1) {
        if (left[index] !== right[index])
            return left[index] - right[index];
    }
    return 0;
}
async function assertCompatibleClient(clientVersion) {
    var _a;
    const supplied = typeof clientVersion === 'string' ? parseSemver(clientVersion) : null;
    const compatibility = await db.collection('settings').doc('clientCompatibility').get();
    const minimumValue = (_a = compatibility.data()) === null || _a === void 0 ? void 0 : _a.minAdminMutationVersion;
    const minimum = typeof minimumValue === 'string' ? parseSemver(minimumValue) : null;
    if (!supplied || !minimum) {
        throw new https_1.HttpsError('failed-precondition', 'Admin mutation compatibility is not configured.');
    }
    if (compareSemver(supplied, minimum) < 0) {
        throw new https_1.HttpsError('failed-precondition', 'update-required');
    }
}
async function countEnabledAdmins() {
    var _a;
    let pageToken;
    let count = 0;
    do {
        const page = await auth.listUsers(1000, pageToken);
        for (const user of page.users) {
            if (!user.disabled && ((_a = user.customClaims) === null || _a === void 0 ? void 0 : _a.admin) === true)
                count += 1;
            if (count >= 2)
                return count;
        }
        pageToken = page.pageToken;
    } while (pageToken);
    return count;
}
async function releaseAdminLock(operationId) {
    const lockRef = db.collection('systemLocks').doc('adminDeletion');
    await db.runTransaction(async (transaction) => {
        var _a;
        const lock = await transaction.get(lockRef);
        if (((_a = lock.data()) === null || _a === void 0 ? void 0 : _a.operationId) === operationId)
            transaction.delete(lockRef);
    });
}
exports.requestUserDeletion = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d;
    const requestedBy = requireAdmin(request);
    const targetUid = stringValue((_a = request.data) === null || _a === void 0 ? void 0 : _a.targetUid, 'targetUid');
    const expectedLifecycleVersion = integer((_b = request.data) === null || _b === void 0 ? void 0 : _b.expectedLifecycleVersion, 'expectedLifecycleVersion');
    if (targetUid === requestedBy)
        throw new https_1.HttpsError('failed-precondition', 'Self deletion is not allowed.');
    await assertCompatibleClient((_c = request.data) === null || _c === void 0 ? void 0 : _c.clientVersion);
    let authUser;
    try {
        authUser = await auth.getUser(targetUid);
    }
    catch (_e) {
        throw new https_1.HttpsError('not-found', 'Target Auth user was not found.');
    }
    const operationRef = db.collection('userDeletionOperations').doc();
    const userRef = db.collection('users').doc(targetUid);
    const lockRef = db.collection('systemLocks').doc('adminDeletion');
    const targetWasAdmin = ((_d = authUser.customClaims) === null || _d === void 0 ? void 0 : _d.admin) === true;
    await db.runTransaction(async (transaction) => {
        var _a;
        const [userSnapshot, lockSnapshot] = await Promise.all([
            transaction.get(userRef),
            transaction.get(lockRef),
        ]);
        if (!userSnapshot.exists)
            throw new https_1.HttpsError('not-found', 'Target user document was not found.');
        const userData = (_a = userSnapshot.data()) !== null && _a !== void 0 ? _a : {};
        const lifecycleVersion = typeof userData.lifecycleVersion === 'number' ? userData.lifecycleVersion : 0;
        const lifecycleState = typeof userData.lifecycleState === 'string' ? userData.lifecycleState : 'active';
        if (lifecycleVersion !== expectedLifecycleVersion)
            throw new https_1.HttpsError('aborted', 'Lifecycle version changed.');
        if (lifecycleState !== 'active' || userData.activeOperationId) {
            throw new https_1.HttpsError('already-exists', 'A lifecycle operation is already active.');
        }
        if (targetWasAdmin && lockSnapshot.exists)
            throw new https_1.HttpsError('aborted', 'Another admin deletion is active.');
        const nextLifecycleVersion = lifecycleVersion + 1;
        transaction.create(operationRef, {
            targetUid,
            requestedBy,
            state: 'requested',
            lifecycleVersion: nextLifecycleVersion,
            version: 1,
            lastProcessedVersion: 0,
            targetWasAdmin,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        transaction.update(userRef, {
            lifecycleVersion: nextLifecycleVersion,
            activeOperationId: operationRef.id,
        });
        if (targetWasAdmin) {
            transaction.create(lockRef, { operationId: operationRef.id, createdAt: firestore_1.FieldValue.serverTimestamp() });
        }
    });
    if (targetWasAdmin && await countEnabledAdmins() < 2) {
        await db.runTransaction(async (transaction) => {
            transaction.delete(operationRef);
            transaction.update(userRef, {
                lifecycleVersion: expectedLifecycleVersion,
                activeOperationId: firestore_1.FieldValue.delete(),
            });
            transaction.delete(lockRef);
        });
        throw new https_1.HttpsError('failed-precondition', 'The last enabled administrator cannot be deleted.');
    }
    return { operationId: operationRef.id, state: 'requested', lifecycleVersion: expectedLifecycleVersion + 1 };
});
exports.cancelUserDeletion = (0, https_1.onCall)(async (request) => {
    var _a, _b;
    requireAdmin(request);
    const operationId = stringValue((_a = request.data) === null || _a === void 0 ? void 0 : _a.operationId, 'operationId');
    const expectedLifecycleVersion = integer((_b = request.data) === null || _b === void 0 ? void 0 : _b.expectedLifecycleVersion, 'expectedLifecycleVersion');
    const operationRef = db.collection('userDeletionOperations').doc(operationId);
    const snapshot = await operationRef.get();
    if (!snapshot.exists)
        throw new https_1.HttpsError('not-found', 'Operation was not found.');
    const operation = snapshot.data();
    if (!['requested', 'auth_disabled', 'tokens_revoked'].includes(operation.state)) {
        throw new https_1.HttpsError('failed-precondition', 'Cleanup has started and cancellation is no longer possible.');
    }
    if (operation.lifecycleVersion !== expectedLifecycleVersion)
        throw new https_1.HttpsError('aborted', 'Lifecycle version changed.');
    await auth.updateUser(operation.targetUid, { disabled: false });
    await rtdb.ref(`accessControl/${operation.targetUid}`).set({ lifecycleState: 'active' });
    await db.runTransaction(async (transaction) => {
        const current = await transaction.get(operationRef);
        const data = current.data();
        if (!data || data.version !== operation.version)
            throw new https_1.HttpsError('aborted', 'Operation changed.');
        transaction.update(db.collection('users').doc(operation.targetUid), {
            lifecycleState: 'active',
            lifecycleVersion: expectedLifecycleVersion + 1,
            activeOperationId: firestore_1.FieldValue.delete(),
        });
        transaction.update(operationRef, {
            state: 'cancelled',
            version: data.version + 1,
            leaseOwner: firestore_1.FieldValue.delete(),
            leaseExpiresAt: firestore_1.FieldValue.delete(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            cancelledAt: firestore_1.FieldValue.serverTimestamp(),
            requiresReauthentication: true,
        });
    });
    if (operation.targetWasAdmin)
        await releaseAdminLock(operationId);
    return { operationId, state: 'cancelled', requiresReauthentication: true };
});
exports.resumeUserDeletion = (0, https_1.onCall)(async (request) => {
    var _a, _b;
    requireAdmin(request);
    const operationId = stringValue((_a = request.data) === null || _a === void 0 ? void 0 : _a.operationId, 'operationId');
    const expectedLifecycleVersion = integer((_b = request.data) === null || _b === void 0 ? void 0 : _b.expectedLifecycleVersion, 'expectedLifecycleVersion');
    const operationRef = db.collection('userDeletionOperations').doc(operationId);
    let state = '';
    await db.runTransaction(async (transaction) => {
        var _a;
        const snapshot = await transaction.get(operationRef);
        if (!snapshot.exists)
            throw new https_1.HttpsError('not-found', 'Operation was not found.');
        const data = snapshot.data();
        if (data.lifecycleVersion !== expectedLifecycleVersion)
            throw new https_1.HttpsError('aborted', 'Lifecycle version changed.');
        const leaseExpired = data.leaseExpiresAt instanceof firestore_1.Timestamp && data.leaseExpiresAt.toMillis() <= Date.now();
        if (data.state !== 'failed' && !(ACTIVE_STATES.includes(data.state) && leaseExpired)) {
            throw new https_1.HttpsError('failed-precondition', 'Operation is not resumable.');
        }
        state = data.state === 'failed' ? (_a = data.resumeFrom) !== null && _a !== void 0 ? _a : 'requested' : data.state;
        transaction.update(operationRef, {
            state,
            version: data.version + 1,
            leaseOwner: firestore_1.FieldValue.delete(),
            leaseExpiresAt: firestore_1.FieldValue.delete(),
            errorCode: firestore_1.FieldValue.delete(),
            resumeFrom: firestore_1.FieldValue.delete(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            resumedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
    return { operationId, state };
});
exports.backfillAccessControlBatch = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g;
    requireAdmin(request);
    const limit = Math.min(PAGE_SIZE, Math.max(1, integer((_b = (_a = request.data) === null || _a === void 0 ? void 0 : _a.limit) !== null && _b !== void 0 ? _b : PAGE_SIZE, 'limit')));
    const cursor = typeof ((_c = request.data) === null || _c === void 0 ? void 0 : _c.cursor) === 'string' && request.data.cursor ? request.data.cursor : null;
    const dryRun = ((_d = request.data) === null || _d === void 0 ? void 0 : _d.dryRun) !== false;
    let query = db.collection('users').orderBy(firestore_1.FieldPath.documentId()).limit(limit);
    if (cursor)
        query = query.startAfter(cursor);
    const snapshot = await query.get();
    let missing = 0;
    let written = 0;
    const updates = {};
    for (const user of snapshot.docs) {
        const state = (_e = user.data().lifecycleState) !== null && _e !== void 0 ? _e : 'active';
        if (state !== 'active')
            continue;
        const mirror = await rtdb.ref(`accessControl/${user.id}/lifecycleState`).get();
        if (mirror.val() !== 'active') {
            missing += 1;
            if (!dryRun) {
                updates[`accessControl/${user.id}/lifecycleState`] = 'active';
                written += 1;
            }
        }
    }
    if (!dryRun && Object.keys(updates).length)
        await rtdb.ref().update(updates);
    return {
        nextCursor: snapshot.size === limit ? (_g = (_f = snapshot.docs[snapshot.docs.length - 1]) === null || _f === void 0 ? void 0 : _f.id) !== null && _g !== void 0 ? _g : null : null,
        scanned: snapshot.size,
        written,
        missing,
    };
});
async function commitOperation(operationRef, leaseOwner, eventVersion, patch) {
    await db.runTransaction(async (transaction) => {
        const current = await transaction.get(operationRef);
        const data = current.data();
        if (!data || data.version !== eventVersion || data.leaseOwner !== leaseOwner) {
            throw new https_1.HttpsError('aborted', 'Operation lease changed.');
        }
        transaction.update(operationRef, Object.assign(Object.assign({}, patch), { version: eventVersion + 1, lastProcessedVersion: eventVersion, leaseOwner: firestore_1.FieldValue.delete(), leaseExpiresAt: firestore_1.FieldValue.delete(), updatedAt: firestore_1.FieldValue.serverTimestamp() }));
    });
}
async function deleteSubcollectionPage(userRef, collectionName, cursor) {
    var _a, _b;
    let query = userRef.collection(collectionName).orderBy(firestore_1.FieldPath.documentId()).limit(PAGE_SIZE);
    if (cursor)
        query = query.startAfter(cursor);
    const snapshot = await query.get();
    if (!snapshot.empty) {
        const batch = db.batch();
        snapshot.docs.forEach((document) => batch.delete(document.ref));
        await batch.commit();
    }
    return {
        cursor: snapshot.size === PAGE_SIZE ? (_b = (_a = snapshot.docs[snapshot.docs.length - 1]) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null : null,
        done: snapshot.size < PAGE_SIZE,
        count: snapshot.size,
    };
}
async function cleanQueryPage(query, cursor, mutate) {
    var _a, _b;
    let paged = query.orderBy(firestore_1.FieldPath.documentId()).limit(PAGE_SIZE);
    if (cursor)
        paged = paged.startAfter(cursor);
    const snapshot = await paged.get();
    if (!snapshot.empty) {
        const batch = db.batch();
        snapshot.docs.forEach((document) => mutate(batch, document));
        await batch.commit();
    }
    return {
        cursor: snapshot.size === PAGE_SIZE ? (_b = (_a = snapshot.docs[snapshot.docs.length - 1]) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null : null,
        done: snapshot.size < PAGE_SIZE,
        count: snapshot.size,
    };
}
async function processCleanup(operationRef, operation, leaseOwner, eventVersion) {
    var _a, _b, _c;
    const userRef = db.collection('users').doc(operation.targetUid);
    const step = (_a = operation.cleanupStep) !== null && _a !== void 0 ? _a : 'fcmTokens';
    const cursor = (_b = operation.cursor) !== null && _b !== void 0 ? _b : null;
    let result;
    let nextStep = step;
    if (step === 'fcmTokens' || step === 'notificationSettings') {
        result = await deleteSubcollectionPage(userRef, step, cursor);
        if (result.done)
            nextStep = step === 'fcmTokens' ? 'notificationSettings' : 'rooms';
    }
    else if (step === 'rooms') {
        result = await cleanQueryPage(db.collection('chatRooms').where('members', 'array-contains', operation.targetUid), cursor, (batch, document) => batch.update(document.ref, {
            members: firestore_1.FieldValue.arrayRemove(operation.targetUid),
            [`memberDetails.${operation.targetUid}`]: firestore_1.FieldValue.delete(),
            [`unreadCounts.${operation.targetUid}`]: firestore_1.FieldValue.delete(),
        }));
        if (result.done)
            nextStep = 'schedules';
    }
    else if (step === 'schedules') {
        result = await cleanQueryPage(db.collection('schedules').where('targetUserIds', 'array-contains', operation.targetUid), cursor, (batch, document) => batch.update(document.ref, {
            targetUserIds: firestore_1.FieldValue.arrayRemove(operation.targetUid),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }));
        if (result.done)
            nextStep = 'processMembers';
    }
    else if (step === 'processMembers') {
        result = await cleanQueryPage(db.collection('processMembers').where('linkedUserId', '==', operation.targetUid), cursor, (batch, document) => batch.update(document.ref, { linkedUserId: null }));
        if (result.done)
            nextStep = 'presenceAndStorage';
    }
    else {
        await rtdb.ref(`status/${operation.targetUid}`).remove();
        await rtdb.ref(`presenceConnections/${operation.targetUid}`).remove();
        const user = await userRef.get();
        const photoStoragePath = (_c = user.data()) === null || _c === void 0 ? void 0 : _c.photoStoragePath;
        if (typeof photoStoragePath === 'string' && photoStoragePath) {
            await admin.storage().bucket().file(photoStoragePath).delete({ ignoreNotFound: true });
        }
        await commitOperation(operationRef, leaseOwner, eventVersion, {
            state: 'cleaning',
            cleanupStep: 'auth',
            cursor: null,
            processedCount: firestore_1.FieldValue.increment(1),
        });
        return;
    }
    await commitOperation(operationRef, leaseOwner, eventVersion, {
        state: 'cleaning',
        cleanupStep: nextStep,
        cursor: result.done ? null : result.cursor,
        processedCount: firestore_1.FieldValue.increment(result.count),
    });
}
exports.processUserDeletion = (0, firestore_2.onDocumentWritten)({ document: 'userDeletionOperations/{operationId}', retry: true }, async (event) => {
    var _a, _b;
    const after = (_a = event.data) === null || _a === void 0 ? void 0 : _a.after;
    if (!(after === null || after === void 0 ? void 0 : after.exists))
        return;
    const operationRef = after.ref;
    const initial = after.data();
    if (!ACTIVE_STATES.includes(initial.state))
        return;
    const eventVersion = initial.version;
    const leaseOwner = event.id;
    let operation = null;
    await db.runTransaction(async (transaction) => {
        const current = await transaction.get(operationRef);
        const data = current.data();
        if (!data || data.lastProcessedVersion >= eventVersion)
            return;
        if (data.version !== eventVersion)
            return;
        if (data.leaseExpiresAt instanceof firestore_1.Timestamp && data.leaseExpiresAt.toMillis() > Date.now()) {
            throw new https_1.HttpsError('aborted', 'Operation already has an active lease.');
        }
        transaction.update(operationRef, {
            leaseOwner,
            leaseExpiresAt: firestore_1.Timestamp.fromMillis(Date.now() + LEASE_MS),
            attempt: firestore_1.FieldValue.increment(1),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        operation = data;
    });
    if (!operation)
        return;
    const data = operation;
    try {
        if (data.state === 'requested') {
            await rtdb.ref(`accessControl/${data.targetUid}`).set({ lifecycleState: 'disabling' });
            await db.collection('users').doc(data.targetUid).update({ lifecycleState: 'disabling' });
            await auth.updateUser(data.targetUid, { disabled: true });
            await commitOperation(operationRef, leaseOwner, eventVersion, { state: 'auth_disabled' });
        }
        else if (data.state === 'auth_disabled') {
            await auth.revokeRefreshTokens(data.targetUid);
            await commitOperation(operationRef, leaseOwner, eventVersion, { state: 'tokens_revoked' });
        }
        else if (data.state === 'tokens_revoked') {
            await commitOperation(operationRef, leaseOwner, eventVersion, {
                state: 'cleaning',
                cleanupStep: 'fcmTokens',
                cursor: null,
                cleaningStartedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }
        else if (data.state === 'cleaning' && data.cleanupStep !== 'auth') {
            await processCleanup(operationRef, data, leaseOwner, eventVersion);
        }
        else if (data.state === 'cleaning') {
            try {
                await auth.deleteUser(data.targetUid);
            }
            catch (error) {
                if (error.code !== 'auth/user-not-found')
                    throw error;
            }
            await commitOperation(operationRef, leaseOwner, eventVersion, { state: 'auth_deleted' });
        }
        else if (data.state === 'auth_deleted') {
            await db.runTransaction(async (transaction) => {
                const current = await transaction.get(operationRef);
                const currentData = current.data();
                if (!currentData || currentData.version !== eventVersion || currentData.leaseOwner !== leaseOwner) {
                    throw new https_1.HttpsError('aborted', 'Operation lease changed.');
                }
                transaction.set(db.collection('users').doc(data.targetUid), {
                    uid: data.targetUid,
                    lifecycleState: 'deleted',
                    lifecycleVersion: data.lifecycleVersion,
                    completedAt: firestore_1.FieldValue.serverTimestamp(),
                });
                transaction.update(operationRef, {
                    state: 'completed',
                    version: eventVersion + 1,
                    lastProcessedVersion: eventVersion,
                    leaseOwner: firestore_1.FieldValue.delete(),
                    leaseExpiresAt: firestore_1.FieldValue.delete(),
                    completedAt: firestore_1.FieldValue.serverTimestamp(),
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
                if (data.targetWasAdmin)
                    transaction.delete(db.collection('systemLocks').doc('adminDeletion'));
            });
        }
    }
    catch (error) {
        const errorCode = (_b = error.code) !== null && _b !== void 0 ? _b : 'unknown';
        await db.runTransaction(async (transaction) => {
            const current = await transaction.get(operationRef);
            const currentData = current.data();
            if (!currentData || currentData.version !== eventVersion || currentData.leaseOwner !== leaseOwner)
                return;
            transaction.update(operationRef, {
                state: 'failed',
                resumeFrom: data.state,
                errorCode,
                version: eventVersion + 1,
                lastProcessedVersion: eventVersion,
                leaseOwner: firestore_1.FieldValue.delete(),
                leaseExpiresAt: firestore_1.FieldValue.delete(),
                failedAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        });
        console.error(`[userLifecycle] ${operationRef.id} failed in ${data.state}`, error);
    }
});
exports.recoverStaleUserDeletions = (0, scheduler_1.onSchedule)('every 5 minutes', async () => {
    const cutoff = firestore_1.Timestamp.fromMillis(Date.now() - 60000);
    const snapshot = await db.collection('userDeletionOperations')
        .where('state', 'in', [...ACTIVE_STATES])
        .where('updatedAt', '<=', cutoff)
        .limit(100)
        .get();
    for (const operation of snapshot.docs) {
        const data = operation.data();
        if (!ACTIVE_STATES.includes(data.state))
            continue;
        const leaseExpired = !data.leaseExpiresAt || data.leaseExpiresAt.toMillis() <= Date.now();
        if (!leaseExpired)
            continue;
        await db.runTransaction(async (transaction) => {
            const current = await transaction.get(operation.ref);
            const currentData = current.data();
            if (!currentData || currentData.version !== data.version)
                return;
            transaction.update(operation.ref, {
                version: currentData.version + 1,
                leaseOwner: firestore_1.FieldValue.delete(),
                leaseExpiresAt: firestore_1.FieldValue.delete(),
                recoveryRequestedAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        });
    }
});
exports.mirrorNewUserAccessControl = (0, firestore_2.onDocumentCreated)('users/{userId}', async (event) => {
    var _a;
    const user = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!user)
        return;
    const lifecycleState = typeof user.lifecycleState === 'string' ? user.lifecycleState : 'active';
    await rtdb.ref(`accessControl/${event.params.userId}`).set({ lifecycleState });
});
//# sourceMappingURL=userLifecycle.js.map