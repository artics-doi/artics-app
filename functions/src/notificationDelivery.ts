import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

export type DeliveryClaim = 'claimed' | 'already_sent' | 'busy' | 'exhausted';

export async function claimDelivery(
  db: admin.firestore.Firestore,
  deliveryId: string,
  maxAttempts = 5,
): Promise<DeliveryClaim> {
  const ref = db.collection('notificationDeliveries').doc(deliveryId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() ?? {};
    if (data.state === 'sent') return 'already_sent';
    const attempts = typeof data.attempts === 'number' ? data.attempts : 0;
    if (attempts >= maxAttempts) return 'exhausted';
    if (data.state === 'sending' && data.leaseExpiresAt instanceof Timestamp && data.leaseExpiresAt.toMillis() > Date.now()) {
      return 'busy';
    }
    transaction.set(ref, {
      state: 'sending',
      attempts: attempts + 1,
      leaseExpiresAt: Timestamp.fromMillis(Date.now() + 5 * 60_000),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return 'claimed';
  });
}

export async function finishDelivery(
  db: admin.firestore.Firestore,
  deliveryId: string,
  state: 'sent' | 'failed',
  errorCode?: string,
): Promise<void> {
  await db.collection('notificationDeliveries').doc(deliveryId).set({
    state,
    errorCode: errorCode ?? FieldValue.delete(),
    leaseExpiresAt: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
    ...(state === 'sent' ? { sentAt: FieldValue.serverTimestamp() } : {}),
  }, { merge: true });
}
