import assert from 'node:assert/strict';
import admin from 'firebase-admin';

const projectId = 'demo-artics-refactor';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const functionsHost = process.env.FUNCTIONS_EMULATOR_HOST ?? '127.0.0.1:5001';
if (!authHost) throw new Error('FIREBASE_AUTH_EMULATOR_HOST is required');

admin.initializeApp({
  projectId,
  databaseURL: `https://${projectId}-default-rtdb.firebaseio.com`,
});

const db = admin.firestore();
const auth = admin.auth();
const adminUid = 'integration-admin';
const targetUid = 'integration-target';
const password = 'Integration-Password-123!';

async function signIn(email, passwordValue) {
  const response = await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: passwordValue, returnSecureToken: true }),
    },
  );
  const body = await response.json();
  if (!response.ok) throw new Error(`signIn failed: ${JSON.stringify(body)}`);
  return body.idToken;
}

async function callFunction(name, token, data) {
  const response = await fetch(`http://${functionsHost}/${projectId}/us-central1/${name}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ data }),
  });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(`${name} failed: ${JSON.stringify(body)}`);
  return body.result;
}

async function waitForOperation(operationId, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    const snapshot = await db.collection('userDeletionOperations').doc(operationId).get();
    latest = snapshot.data();
    if (latest?.state === 'completed') return latest;
    if (latest?.state === 'failed') throw new Error(`operation failed: ${JSON.stringify(latest)}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`operation timed out: ${JSON.stringify(latest)}`);
}

await Promise.all([
  auth.createUser({ uid: adminUid, email: 'admin@example.test', password }),
  auth.createUser({ uid: targetUid, email: 'target@example.test', password }),
]);
await auth.setCustomUserClaims(adminUid, { admin: true });

await Promise.all([
  db.collection('users').doc(adminUid).set({
    uid: adminUid,
    email: 'admin@example.test',
    displayName: 'Admin',
    lifecycleState: 'active',
    lifecycleVersion: 0,
  }),
  db.collection('users').doc(targetUid).set({
    uid: targetUid,
    email: 'target@example.test',
    displayName: 'Target',
  }),
  db.collection('settings').doc('clientCompatibility').set({ minAdminMutationVersion: '1.2.3' }),
  db.collection('chatRooms').doc('integration-room').set({
    members: [adminUid, targetUid],
    memberDetails: {
      [adminUid]: { displayName: 'Admin' },
      [targetUid]: { displayName: 'Target' },
    },
    unreadCounts: { [targetUid]: 3 },
  }),
  db.collection('schedules').doc('integration-schedule').set({
    title: 'Integration',
    targetUserIds: [targetUid],
  }),
  db.collection('processMembers').doc('integration-member').set({
    name: 'Target',
    linkedUserId: targetUid,
  }),
]);

const token = await signIn('admin@example.test', password);
const requested = await callFunction('requestUserDeletion', token, {
  targetUid,
  expectedLifecycleVersion: 0,
  clientVersion: '1.2.3',
});
assert.equal(requested.state, 'requested');

await waitForOperation(requested.operationId);

await assert.rejects(() => auth.getUser(targetUid), (error) => error?.code === 'auth/user-not-found');
const tombstone = (await db.collection('users').doc(targetUid).get()).data();
assert.deepEqual(Object.keys(tombstone).sort(), ['completedAt', 'lifecycleState', 'lifecycleVersion', 'uid']);
assert.equal(tombstone.lifecycleState, 'deleted');

const room = (await db.collection('chatRooms').doc('integration-room').get()).data();
assert.equal(room.members.includes(targetUid), false);
assert.equal(targetUid in room.memberDetails, false);
assert.equal(targetUid in room.unreadCounts, false);
const schedule = (await db.collection('schedules').doc('integration-schedule').get()).data();
assert.equal(schedule.targetUserIds.includes(targetUid), false);
const member = (await db.collection('processMembers').doc('integration-member').get()).data();
assert.equal(member.linkedUserId, null);

const projectRef = db.collection('projects').doc('integration-project');
await projectRef.set({
  name: 'Paged deletion',
  status: 'active',
  lifecycleState: 'active',
  lifecycleVersion: 0,
  createdBy: adminUid,
});
let taskBatch = db.batch();
for (let index = 0; index < 450; index += 1) {
  taskBatch.set(db.collection('tasks').doc(`integration-task-${String(index).padStart(3, '0')}`), {
    title: `Task ${index}`,
    projectId: projectRef.id,
    createdBy: adminUid,
  });
}
await taskBatch.commit();
await projectRef.update({
  lifecycleState: 'deleting',
  lifecycleVersion: 1,
  operationId: 'integration-project-operation',
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
});
const projectDeadline = Date.now() + 90_000;
while ((await projectRef.get()).exists && Date.now() < projectDeadline) {
  await new Promise((resolve) => setTimeout(resolve, 500));
}
assert.equal((await projectRef.get()).exists, false);
assert.equal((await db.collection('tasks').where('projectId', '==', projectRef.id).get()).size, 0);

console.log('USER_LIFECYCLE_EMULATOR_PASS', requested.operationId);
