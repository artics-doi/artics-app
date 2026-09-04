import assert from 'node:assert/strict';
import admin from 'firebase-admin';

const projectId = 'demo-artics-refactor';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const functionsHost = process.env.FUNCTIONS_EMULATOR_HOST ?? '127.0.0.1:5001';
if (!authHost) throw new Error('FIREBASE_AUTH_EMULATOR_HOST is required');

admin.initializeApp({
  projectId,
  storageBucket: `${projectId}.appspot.com`,
});

const db = admin.firestore();
const auth = admin.auth();
const bucket = admin.storage().bucket();
const password = 'Integration-Password-123!';
const users = {
  creator: { uid: 'room-creator', email: 'room-creator@example.test' },
  member: { uid: 'room-member', email: 'room-member@example.test' },
  admin: { uid: 'room-admin', email: 'room-admin@example.test' },
};

async function signIn(email) {
  const response = await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
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
  if (!response.ok || body.error) {
    const error = new Error(`${name} failed: ${JSON.stringify(body)}`);
    error.payload = body;
    throw error;
  }
  return body.result;
}

await Promise.all(Object.values(users).map((user) => auth.createUser({ ...user, password })));
await auth.setCustomUserClaims(users.admin.uid, { admin: true });
await Promise.all(Object.values(users).map((user) => db.collection('users').doc(user.uid).set({
  uid: user.uid,
  email: user.email,
  displayName: user.uid,
  lifecycleState: 'active',
})));

const [creatorToken, memberToken, adminToken] = await Promise.all([
  signIn(users.creator.email),
  signIn(users.member.email),
  signIn(users.admin.email),
]);

const roomId = 'creator-room';
const roomRef = db.collection('chatRooms').doc(roomId);
await roomRef.set({
  name: 'Creator room',
  type: 'group',
  createdBy: users.creator.uid,
  deletionState: 'active',
  members: [users.creator.uid, users.member.uid],
  memberDetails: {},
  photoStoragePath: `groupImages/${roomId}/photo.png`,
  photoFileSize: 3,
});
await Promise.all([
  roomRef.collection('messages').doc('message1').set({
    chatRoomId: roomId,
    senderId: users.creator.uid,
    text: 'message',
    storagePath: `chatFiles/${roomId}/message1.txt`,
    fileSize: 3,
  }),
  roomRef.collection('readStates').doc(users.member.uid).set({ lastReadAt: admin.firestore.Timestamp.now() }),
  db.collection('users').doc(users.creator.uid).collection('notificationSettings').doc(roomId).set({ muted: true }),
  db.collection('users').doc(users.member.uid).collection('notificationSettings').doc(roomId).set({ muted: true }),
  bucket.file(`chatFiles/${roomId}/message1.txt`).save(Buffer.from('abc')),
  bucket.file(`chatImages/${roomId}/legacy.png`).save(Buffer.from('abc')),
  bucket.file(`groupImages/${roomId}/photo.png`).save(Buffer.from('abc')),
]);

await assert.rejects(
  () => callFunction('deleteChatRoom', adminToken, { roomId }),
  (error) => error?.payload?.error?.status === 'PERMISSION_DENIED',
);
assert.equal((await roomRef.get()).exists, true);

const deleted = await callFunction('deleteChatRoom', memberToken, { roomId });
assert.equal(deleted.status, 'deleted');
assert.equal((await roomRef.get()).exists, false);
assert.equal((await roomRef.collection('messages').get()).empty, true);
assert.equal((await roomRef.collection('readStates').get()).empty, true);
assert.equal((await db.collection('users').doc(users.creator.uid).collection('notificationSettings').doc(roomId).get()).exists, false);
assert.equal((await db.collection('users').doc(users.member.uid).collection('notificationSettings').doc(roomId).get()).exists, false);
for (const path of [
  `chatFiles/${roomId}/message1.txt`,
  `chatImages/${roomId}/legacy.png`,
  `groupImages/${roomId}/photo.png`,
]) {
  assert.equal((await bucket.file(path).exists())[0], false);
}
assert.equal((await callFunction('deleteChatRoom', memberToken, { roomId })).status, 'already-deleted');

const adminRoomRef = db.collection('chatRooms').doc('admin-room');
await adminRoomRef.set({
  name: 'Admin room',
  type: 'direct',
  createdBy: users.creator.uid,
  deletionState: 'active',
  members: [users.creator.uid, users.admin.uid],
});
assert.equal((await callFunction('deleteChatRoom', adminToken, { roomId: adminRoomRef.id })).status, 'deleted');

const memoRef = db.collection('chatRooms').doc('memo-room');
await memoRef.set({ type: 'memo', members: [users.creator.uid] });
await assert.rejects(
  () => callFunction('deleteChatRoom', adminToken, { roomId: memoRef.id }),
  (error) => error?.payload?.error?.status === 'FAILED_PRECONDITION',
);

const legacyRef = db.collection('chatRooms').doc('legacy-room');
await legacyRef.set({
  name: 'Legacy',
  type: 'group',
  members: [users.creator.uid, users.member.uid],
});
const deadline = Date.now() + 20_000;
let legacyData;
while (Date.now() < deadline) {
  legacyData = (await legacyRef.get()).data();
  if (legacyData?.createdBy === users.creator.uid) break;
  await new Promise((resolve) => setTimeout(resolve, 250));
}
assert.equal(legacyData?.createdBy, users.creator.uid);
assert.equal(legacyData?.deletionState, 'active');

const usageDeadline = Date.now() + 20_000;
let storageUsage;
while (Date.now() < usageDeadline) {
  storageUsage = (await db.collection('settings').doc('storageUsage').get()).data();
  if (storageUsage?.totalBytes === 0) break;
  await new Promise((resolve) => setTimeout(resolve, 250));
}
assert.equal(storageUsage?.totalBytes, 0);

console.log('ROOM_LIFECYCLE_EMULATOR_PASS');
