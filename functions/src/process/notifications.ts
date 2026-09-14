import { createHash } from 'crypto';
import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { onDocumentCreated, onDocumentWrittenWithAuthContext } from 'firebase-functions/v2/firestore';
import { claimDelivery, finishDelivery } from '../notificationDelivery';
import { processNotificationUrl, processRecipientIds, resolveProcessEvent, type ProcessEvent } from './notificationPolicy';

// タスク更新をサーバーで判定し、宛先本人だけが読める受信箱へ格納する。
// Eventarc の同一イベント再配信でも受信箱を作り直さない。
export const createProcessTaskNotifications = onDocumentWrittenWithAuthContext(
  { document: 'tasks/{taskId}', retry: true, region: 'asia-northeast1', maxInstances: 3 },
  async event => {
    const after = event.data?.after.data();
    const before = event.data?.before.data();
    if (!after || (before && before.columnId === after.columnId
      && !(before.completionChecked !== true && after.completionChecked === true))) return;
    const db = admin.firestore();
    const projectId = after.projectId;
    if (typeof projectId !== 'string' || !projectId) return;
    const projectDoc = await db.collection('projects').doc(projectId).get();
    if (!projectDoc.exists) return;
    const project = projectDoc.data()!;
    const change = resolveProcessEvent(before, after, project);
    if (!change) return;
    const members = await db.collection('processMembers').get();
    const assigneeIds = Array.isArray(after.assigneeIds) ? after.assigneeIds.filter(id => typeof id === 'string') : [];
    const recipients = processRecipientIds(members.docs.map(doc => ({ ...doc.data(), id: doc.id })), change.event, assigneeIds);
    if (!recipients.length) return;
    // authId は実際の書き込み元。古いクライアントの残存 updatedBy は使わない。
    const actorId = event.authId || (!before && typeof after.createdBy === 'string' ? after.createdBy : '');
    const actor = actorId && !actorId.includes('/') ? await db.collection('users').doc(actorId).get() : null;
    const actorName = actor?.data()?.displayName || '不明なユーザー';
    const notificationId = createHash('sha256').update(event.id).digest('hex');
    const occurredAt = Timestamp.fromDate(new Date(event.time));
    // 遅れて再配信された古いイベントから新規通知を作らない。
    if (Date.now() - occurredAt.toMillis() > 24 * 60 * 60_000) return;
    for (const uid of recipients) {
      const ref = db.collection('users').doc(uid).collection('processNotifications').doc(notificationId);
      await db.runTransaction(async transaction => {
        const [existing, user] = await Promise.all([transaction.get(ref), transaction.get(db.collection('users').doc(uid))]);
        if (existing.exists || !user.exists || (user.data()?.lifecycleState ?? 'active') !== 'active') return;
        transaction.create(ref, {
          projectId, taskId: event.params.taskId, projectName: String(project.name || 'プロジェクト'),
          taskTitle: String(after.title || 'タスク'), ...change, actorName: String(actorName),
          occurredAt, createdAt: occurredAt, assigneeIds, recipientPolicyVersion: 2,
        });
      });
    }
  },
);

// PWA は FCM、Electron は本人の受信箱購読を使用する（2経路の二重表示を避ける）。
export const sendProcessTaskNotification = onDocumentCreated(
  { document: 'users/{userId}/processNotifications/{notificationId}', retry: true, region: 'asia-northeast1', maxInstances: 3 },
  async event => {
    const notification = event.data?.data();
    if (!notification) return;
    // 旧「全メンバー」仕様の保留通知を、新仕様で意図せず配信しない。
    if (notification.recipientPolicyVersion !== 2 || typeof notification.taskId !== 'string' || !notification.taskId || notification.taskId.includes('/')) return;
    const db = admin.firestore();
    const uid = event.params.userId;
    const [user, members, task] = await Promise.all([
      db.collection('users').doc(uid).get(),
      db.collection('processMembers').where('linkedUserId', '==', uid).get(),
      db.collection('tasks').doc(notification.taskId).get(),
    ]);
    if (!user.exists || (user.data()?.lifecycleState ?? 'active') !== 'active') return;
    const currentTask = task.data();
    if (!currentTask || currentTask.projectId !== notification.projectId || currentTask.archived === true || currentTask.isArchived === true) return;
    const currentMembers = members.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    // 設定・担当・管理者指定が解除されていたら、再試行時にも送信しない。
    if (!processRecipientIds(currentMembers, notification.event as ProcessEvent, notification.assigneeIds).includes(uid)
      || !processRecipientIds(currentMembers, notification.event as ProcessEvent, currentTask.assigneeIds).includes(uid)) return;
    const deliveryId = `process_${uid}_${event.params.notificationId}`;
    const claim = await claimDelivery(db, deliveryId);
    if (claim === 'already_sent' || claim === 'exhausted') return;
    if (claim === 'busy') throw new Error('notification-delivery-busy');
    try {
      const tokenDocs = await db.collection('users').doc(uid).collection('fcmTokens').get();
      // 成功済みトークンを個別に記録し、部分失敗時に成功分へ再送しない。
      const delivery = await db.collection('notificationDeliveries').doc(deliveryId).get();
      const sent = new Set<string>(delivery.data()?.sentTokenHashes ?? []);
      const unique = new Map<string, admin.firestore.DocumentReference[]>();
      tokenDocs.docs.forEach(doc => {
        const token = doc.data().token;
        if (typeof token === 'string' && token) unique.set(token, [...(unique.get(token) ?? []), doc.ref]);
      });
      const tokens = [...unique.keys()].filter(token => !sent.has(createHash('sha256').update(token).digest('hex')));
      const url = processNotificationUrl(notification.projectId, notification.taskId);
      let transientFailure = false;
      for (let i = 0; i < tokens.length; i += 500) {
        const chunk = tokens.slice(i, i + 500);
        const response = await admin.messaging().sendEachForMulticast({
          tokens: chunk,
          data: {
            title: `工程管理｜${notification.taskTitle}`,
            body: `${notification.projectName}\n${notification.event === 'created' ? '新タスク作成' : notification.event === 'approved' ? '完了承認' : `${notification.previousStatus} → ${notification.nextStatus}`}\n${notification.event === 'approved' ? '承認者' : '変更者'}：${notification.actorName}`,
            processNotificationId: event.params.notificationId,
            projectId: notification.projectId, taskId: notification.taskId, url,
          },
          webpush: { headers: { TTL: '86400', Urgency: 'high' }, fcmOptions: { link: url } },
        });
        for (let j = 0; j < response.responses.length; j++) {
          const result = response.responses[j];
          const token = chunk[j];
          if (result.success) sent.add(createHash('sha256').update(token).digest('hex'));
          else if (['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(result.error?.code ?? '')) {
            await Promise.all((unique.get(token) ?? []).map(ref => ref.delete()));
          } else transientFailure = true;
        }
        await db.collection('notificationDeliveries').doc(deliveryId).set({ sentTokenHashes: [...sent] }, { merge: true });
      }
      if (transientFailure) throw new Error('process-notification-partial-failure');
      await finishDelivery(db, deliveryId, 'sent');
    } catch (error) {
      await finishDelivery(db, deliveryId, 'failed', error instanceof Error ? error.message : 'unknown');
      throw error;
    }
  },
);
