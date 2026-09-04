"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.claimDelivery = claimDelivery;
exports.finishDelivery = finishDelivery;
const firestore_1 = require("firebase-admin/firestore");
async function claimDelivery(db, deliveryId, maxAttempts = 5) {
    const ref = db.collection('notificationDeliveries').doc(deliveryId);
    return db.runTransaction(async (transaction) => {
        var _a;
        const snapshot = await transaction.get(ref);
        const data = (_a = snapshot.data()) !== null && _a !== void 0 ? _a : {};
        if (data.state === 'sent')
            return 'already_sent';
        const attempts = typeof data.attempts === 'number' ? data.attempts : 0;
        if (attempts >= maxAttempts)
            return 'exhausted';
        if (data.state === 'sending' && data.leaseExpiresAt instanceof firestore_1.Timestamp && data.leaseExpiresAt.toMillis() > Date.now()) {
            return 'busy';
        }
        transaction.set(ref, {
            state: 'sending',
            attempts: attempts + 1,
            leaseExpiresAt: firestore_1.Timestamp.fromMillis(Date.now() + 5 * 60000),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        return 'claimed';
    });
}
async function finishDelivery(db, deliveryId, state, errorCode) {
    await db.collection('notificationDeliveries').doc(deliveryId).set(Object.assign({ state, errorCode: errorCode !== null && errorCode !== void 0 ? errorCode : firestore_1.FieldValue.delete(), leaseExpiresAt: firestore_1.FieldValue.delete(), updatedAt: firestore_1.FieldValue.serverTimestamp() }, (state === 'sent' ? { sentAt: firestore_1.FieldValue.serverTimestamp() } : {})), { merge: true });
}
//# sourceMappingURL=notificationDelivery.js.map