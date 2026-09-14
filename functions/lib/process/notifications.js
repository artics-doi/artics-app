"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendProcessTaskNotification = exports.createProcessTaskNotifications = void 0;
const crypto_1 = require("crypto");
const admin = require("firebase-admin");
const firestore_1 = require("firebase-admin/firestore");
const firestore_2 = require("firebase-functions/v2/firestore");
const notificationDelivery_1 = require("../notificationDelivery");
const notificationPolicy_1 = require("./notificationPolicy");
// タスク更新をサーバーで判定し、宛先本人だけが読める受信箱へ格納する。
// Eventarc の同一イベント再配信でも受信箱を作り直さない。
exports.createProcessTaskNotifications = (0, firestore_2.onDocumentWrittenWithAuthContext)({ document: 'tasks/{taskId}', retry: true, region: 'asia-northeast1', maxInstances: 3 }, async (event) => {
    var _a, _b, _c;
    const after = (_a = event.data) === null || _a === void 0 ? void 0 : _a.after.data();
    const before = (_b = event.data) === null || _b === void 0 ? void 0 : _b.before.data();
    if (!after || (before && before.columnId === after.columnId
        && !(before.completionChecked !== true && after.completionChecked === true)))
        return;
    const db = admin.firestore();
    const projectId = after.projectId;
    if (typeof projectId !== 'string' || !projectId)
        return;
    const projectDoc = await db.collection('projects').doc(projectId).get();
    if (!projectDoc.exists)
        return;
    const project = projectDoc.data();
    const change = (0, notificationPolicy_1.resolveProcessEvent)(before, after, project);
    if (!change)
        return;
    const members = await db.collection('processMembers').get();
    const assigneeIds = Array.isArray(after.assigneeIds) ? after.assigneeIds.filter(id => typeof id === 'string') : [];
    const recipients = (0, notificationPolicy_1.processRecipientIds)(members.docs.map(doc => (Object.assign(Object.assign({}, doc.data()), { id: doc.id }))), change.event, assigneeIds);
    if (!recipients.length)
        return;
    // authId は実際の書き込み元。古いクライアントの残存 updatedBy は使わない。
    const actorId = event.authId || (!before && typeof after.createdBy === 'string' ? after.createdBy : '');
    const actor = actorId && !actorId.includes('/') ? await db.collection('users').doc(actorId).get() : null;
    const actorName = ((_c = actor === null || actor === void 0 ? void 0 : actor.data()) === null || _c === void 0 ? void 0 : _c.displayName) || '不明なユーザー';
    const notificationId = (0, crypto_1.createHash)('sha256').update(event.id).digest('hex');
    const occurredAt = firestore_1.Timestamp.fromDate(new Date(event.time));
    // 遅れて再配信された古いイベントから新規通知を作らない。
    if (Date.now() - occurredAt.toMillis() > 24 * 60 * 60000)
        return;
    for (const uid of recipients) {
        const ref = db.collection('users').doc(uid).collection('processNotifications').doc(notificationId);
        await db.runTransaction(async (transaction) => {
            var _a, _b;
            const [existing, user] = await Promise.all([transaction.get(ref), transaction.get(db.collection('users').doc(uid))]);
            if (existing.exists || !user.exists || ((_b = (_a = user.data()) === null || _a === void 0 ? void 0 : _a.lifecycleState) !== null && _b !== void 0 ? _b : 'active') !== 'active')
                return;
            transaction.create(ref, Object.assign(Object.assign({ projectId, taskId: event.params.taskId, projectName: String(project.name || 'プロジェクト'), taskTitle: String(after.title || 'タスク') }, change), { actorName: String(actorName), occurredAt, createdAt: occurredAt, assigneeIds, recipientPolicyVersion: 2 }));
        });
    }
});
// PWA は FCM、Electron は本人の受信箱購読を使用する（2経路の二重表示を避ける）。
exports.sendProcessTaskNotification = (0, firestore_2.onDocumentCreated)({ document: 'users/{userId}/processNotifications/{notificationId}', retry: true, region: 'asia-northeast1', maxInstances: 3 }, async (event) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const notification = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!notification)
        return;
    // 旧「全メンバー」仕様の保留通知を、新仕様で意図せず配信しない。
    if (notification.recipientPolicyVersion !== 2 || typeof notification.taskId !== 'string' || !notification.taskId || notification.taskId.includes('/'))
        return;
    const db = admin.firestore();
    const uid = event.params.userId;
    const [user, members, task] = await Promise.all([
        db.collection('users').doc(uid).get(),
        db.collection('processMembers').where('linkedUserId', '==', uid).get(),
        db.collection('tasks').doc(notification.taskId).get(),
    ]);
    if (!user.exists || ((_c = (_b = user.data()) === null || _b === void 0 ? void 0 : _b.lifecycleState) !== null && _c !== void 0 ? _c : 'active') !== 'active')
        return;
    const currentTask = task.data();
    if (!currentTask || currentTask.projectId !== notification.projectId || currentTask.archived === true || currentTask.isArchived === true)
        return;
    const currentMembers = members.docs.map(doc => (Object.assign(Object.assign({}, doc.data()), { id: doc.id })));
    // 設定・担当・管理者指定が解除されていたら、再試行時にも送信しない。
    if (!(0, notificationPolicy_1.processRecipientIds)(currentMembers, notification.event, notification.assigneeIds).includes(uid)
        || !(0, notificationPolicy_1.processRecipientIds)(currentMembers, notification.event, currentTask.assigneeIds).includes(uid))
        return;
    const deliveryId = `process_${uid}_${event.params.notificationId}`;
    const claim = await (0, notificationDelivery_1.claimDelivery)(db, deliveryId);
    if (claim === 'already_sent' || claim === 'exhausted')
        return;
    if (claim === 'busy')
        throw new Error('notification-delivery-busy');
    try {
        const tokenDocs = await db.collection('users').doc(uid).collection('fcmTokens').get();
        // 成功済みトークンを個別に記録し、部分失敗時に成功分へ再送しない。
        const delivery = await db.collection('notificationDeliveries').doc(deliveryId).get();
        const sent = new Set((_e = (_d = delivery.data()) === null || _d === void 0 ? void 0 : _d.sentTokenHashes) !== null && _e !== void 0 ? _e : []);
        const unique = new Map();
        tokenDocs.docs.forEach(doc => {
            var _a;
            const token = doc.data().token;
            if (typeof token === 'string' && token)
                unique.set(token, [...((_a = unique.get(token)) !== null && _a !== void 0 ? _a : []), doc.ref]);
        });
        const tokens = [...unique.keys()].filter(token => !sent.has((0, crypto_1.createHash)('sha256').update(token).digest('hex')));
        const url = (0, notificationPolicy_1.processNotificationUrl)(notification.projectId, notification.taskId);
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
                if (result.success)
                    sent.add((0, crypto_1.createHash)('sha256').update(token).digest('hex'));
                else if (['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes((_g = (_f = result.error) === null || _f === void 0 ? void 0 : _f.code) !== null && _g !== void 0 ? _g : '')) {
                    await Promise.all(((_h = unique.get(token)) !== null && _h !== void 0 ? _h : []).map(ref => ref.delete()));
                }
                else
                    transientFailure = true;
            }
            await db.collection('notificationDeliveries').doc(deliveryId).set({ sentTokenHashes: [...sent] }, { merge: true });
        }
        if (transientFailure)
            throw new Error('process-notification-partial-failure');
        await (0, notificationDelivery_1.finishDelivery)(db, deliveryId, 'sent');
    }
    catch (error) {
        await (0, notificationDelivery_1.finishDelivery)(db, deliveryId, 'failed', error instanceof Error ? error.message : 'unknown');
        throw error;
    }
});
//# sourceMappingURL=notifications.js.map