import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { deleteObject, ref, uploadBytes } from 'firebase/storage';

const PROJECT_ID = 'demo-artics-refactor';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
    },
    storage: {
      rules: readFileSync('storage.rules', 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users/alice'), {
      uid: 'alice',
      displayName: 'Alice',
      photoURL: null,
    });
    await setDoc(doc(db, 'users/bob'), {
      uid: 'bob',
      displayName: 'Bob',
      photoURL: null,
    });
    await setDoc(doc(db, 'users/admin'), {
      uid: 'admin',
      displayName: 'Admin',
      photoURL: null,
    });
    await setDoc(doc(db, 'users/disabled'), {
      uid: 'disabled',
      displayName: 'Disabled',
      photoURL: null,
      lifecycleState: 'disabling',
      lifecycleVersion: 1,
      activeOperationId: 'op1',
    });
    await setDoc(doc(db, 'chatRooms/room1'), {
      name: 'Room 1',
      type: 'group',
      createdBy: 'alice',
      deletionState: 'active',
      members: ['alice'],
      memberDetails: {
        alice: { displayName: 'Alice', photoURL: null },
      },
      unreadCounts: {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'chatRooms/room1/messages/message1'), {
      chatRoomId: 'room1',
      senderId: 'alice',
      senderName: 'Alice',
      text: 'hello',
      readBy: ['alice'],
      reactionsByUser: {},
      isPinned: false,
      isDeleted: false,
      createdAt: serverTimestamp(),
    });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('Firestore rules', () => {
  it('restricts room and message access to members', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    const bobDb = testEnv.authenticatedContext('bob').firestore();

    await assertSucceeds(getDoc(doc(aliceDb, 'chatRooms/room1')));
    await assertFails(getDoc(doc(bobDb, 'chatRooms/room1')));

    await assertFails(addDoc(collection(bobDb, 'chatRooms/room1/messages'), {
      chatRoomId: 'room1',
      senderId: 'bob',
      text: 'blocked',
      readBy: ['bob'],
      createdAt: serverTimestamp(),
    }));

    await assertFails(addDoc(collection(aliceDb, 'chatRooms/room1/messages'), {
      chatRoomId: 'room1',
      senderId: 'bob',
      text: 'spoofed',
      readBy: ['alice'],
      createdAt: serverTimestamp(),
    }));

    await assertSucceeds(addDoc(collection(aliceDb, 'chatRooms/room1/messages'), {
      chatRoomId: 'room1',
      senderId: 'alice',
      text: 'allowed',
      readBy: ['alice'],
      createdAt: serverTimestamp(),
    }));
  });

  it('requires admin claims for management operations and keeps room deletion server-only', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    const adminDb = testEnv.authenticatedContext('admin', { admin: true }).firestore();

    await assertFails(updateDoc(doc(aliceDb, 'users/bob'), {
      displayName: 'Edited',
    }));
    await assertFails(setDoc(doc(aliceDb, 'settings/releaseNotes'), {
      content: 'blocked',
    }));
    await assertFails(deleteDoc(doc(aliceDb, 'chatRooms/room1')));

    await assertSucceeds(updateDoc(doc(adminDb, 'users/bob'), {
      displayName: 'Edited',
    }));
    await assertSucceeds(setDoc(doc(adminDb, 'settings/releaseNotes'), {
      content: 'allowed',
    }));
    await assertFails(deleteDoc(doc(adminDb, 'chatRooms/room1')));
  });

  it('prevents creator spoofing while accepting legacy room creation without createdBy', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    const baseRoom = {
      name: 'Room',
      type: 'group',
      members: ['alice'],
      memberDetails: {},
      lastMessage: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await assertSucceeds(setDoc(doc(aliceDb, 'chatRooms/legacy'), baseRoom));
    await assertSucceeds(setDoc(doc(aliceDb, 'chatRooms/owned'), { ...baseRoom, createdBy: 'alice' }));
    await assertFails(setDoc(doc(aliceDb, 'chatRooms/spoofed'), { ...baseRoom, createdBy: 'bob' }));
  });

  it('blocks disabled users and protects server-owned lifecycle state', async () => {
    const disabledDb = testEnv.authenticatedContext('disabled').firestore();
    const adminDb = testEnv.authenticatedContext('admin', { admin: true }).firestore();

    await assertFails(getDoc(doc(disabledDb, 'users/alice')));
    await assertFails(updateDoc(doc(adminDb, 'users/alice'), {
      lifecycleState: 'disabling',
      lifecycleVersion: 1,
      activeOperationId: 'op1',
    }));
    await assertFails(deleteDoc(doc(adminDb, 'users/alice')));
    await assertFails(setDoc(doc(adminDb, 'userDeletionOperations/op1'), {
      targetUid: 'alice',
      state: 'requested',
    }));
  });

  it('allows signed-in users to manage shared schedules', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    const anonymousDb = testEnv.unauthenticatedContext().firestore();

    const scheduleRef = await assertSucceeds(addDoc(collection(aliceDb, 'schedules'), {
      title: '営業会議',
      categoryId: 'largeMeetingRoom',
      targetUserIds: ['alice'],
      targetUserNames: ['Alice'],
      startAt: serverTimestamp(),
      endAt: null,
      allDay: false,
      memo: '',
      notification: {
        enabled: false,
        timings: [],
        customAt: null,
      },
      createdBy: 'alice',
      createdByName: 'Alice',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));

    await assertSucceeds(updateDoc(scheduleRef, {
      title: '営業会議 更新',
      updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(deleteDoc(scheduleRef));

    await assertFails(addDoc(collection(anonymousDb, 'schedules'), {
      title: 'blocked',
    }));
  });

  it('allows only own read state, own reactions, and member pin updates', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    const messageRef = doc(aliceDb, 'chatRooms/room1/messages/message1');

    await assertSucceeds(setDoc(doc(aliceDb, 'chatRooms/room1/readStates/alice'), {
      lastReadAt: serverTimestamp(),
      version: 1,
      eventId: 'read-event-1',
    }));
    await assertFails(setDoc(doc(aliceDb, 'chatRooms/room1/readStates/bob'), {
      lastReadAt: serverTimestamp(),
      version: 1,
      eventId: 'spoofed-read-event',
    }));

    await assertSucceeds(updateDoc(messageRef, {
      readBy: arrayUnion('alice'),
    }));
    await assertFails(updateDoc(messageRef, {
      readBy: arrayUnion('bob'),
    }));

    await assertSucceeds(updateDoc(messageRef, {
      'reactionsByUser.alice': arrayUnion('👍'),
    }));
    await assertFails(updateDoc(messageRef, {
      'reactionsByUser.bob': arrayUnion('👍'),
    }));

    await assertSucceeds(updateDoc(messageRef, {
      isPinned: true,
    }));
  });

  it('blocks message update/delete by senders removed from the room', async () => {
    // bob が送信者のメッセージを用意する（room1 の members は alice のみ＝退出済み相当）
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'chatRooms/room1/messages/bobMessage'), {
        chatRoomId: 'room1',
        senderId: 'bob',
        senderName: 'Bob',
        text: 'from bob',
        readBy: ['bob'],
        reactionsByUser: {},
        isPinned: false,
        isDeleted: false,
        createdAt: serverTimestamp(),
      });
    });

    const bobDb = testEnv.authenticatedContext('bob').firestore();
    const bobMessageRef = doc(bobDb, 'chatRooms/room1/messages/bobMessage');

    await assertFails(updateDoc(bobMessageRef, { text: 'tampered' }));
    await assertFails(updateDoc(bobMessageRef, { text: '', isDeleted: true }));
    await assertFails(deleteDoc(bobMessageRef));
  });

  it('allows current members to update and delete their own messages', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    const messageRef = doc(aliceDb, 'chatRooms/room1/messages/message1');

    await assertSucceeds(updateDoc(messageRef, { text: 'edited', isEdited: true }));
    await assertSucceeds(deleteDoc(messageRef));
  });

  it('blocks members from updating unreadCounts directly', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();

    // unreadCounts は Cloud Functions（Admin SDK）だけが書く
    await assertFails(updateDoc(doc(aliceDb, 'chatRooms/room1'), {
      'unreadCounts.alice': 0,
    }));
    // ホワイトリスト内の通常更新は引き続き許可される
    await assertSucceeds(updateDoc(doc(aliceDb, 'chatRooms/room1'), {
      name: 'Renamed',
      updatedAt: serverTimestamp(),
    }));
  });

  it('blocks new messages and read-state writes while a room is being deleted', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'chatRooms/room1'), { deletionState: 'deleting' });
    });
    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    await assertFails(addDoc(collection(aliceDb, 'chatRooms/room1/messages'), {
      chatRoomId: 'room1',
      senderId: 'alice',
      text: 'blocked',
      readBy: ['alice'],
      createdAt: serverTimestamp(),
    }));
    await assertFails(setDoc(doc(aliceDb, 'chatRooms/room1/readStates/alice'), {
      lastReadAt: serverTimestamp(),
      version: 1,
      eventId: 'blocked-read',
    }));
  });
});

describe('Storage rules', () => {
  it('restricts room files to room members or admins', async () => {
    const aliceStorage = testEnv.authenticatedContext('alice').storage();
    const bobStorage = testEnv.authenticatedContext('bob').storage();
    const adminStorage = testEnv.authenticatedContext('admin', { admin: true }).storage();

    await assertSucceeds(uploadBytes(ref(aliceStorage, 'chatFiles/room1/a.txt'), new Uint8Array([1]), { contentType: 'text/plain' }));
    await assertFails(uploadBytes(ref(bobStorage, 'chatFiles/room1/b.txt'), new Uint8Array([1])));
    await assertSucceeds(uploadBytes(ref(adminStorage, 'chatImages/room1/admin.png'), new Uint8Array([1]), { contentType: 'image/png' }));
    await assertFails(uploadBytes(ref(aliceStorage, 'chatImages/room1/not-image.txt'), new Uint8Array([1]), { contentType: 'text/plain' }));
    await assertSucceeds(deleteObject(ref(adminStorage, 'chatFiles/room1/a.txt')));
  });

  it('restricts profile image writes to self or admins', async () => {
    const aliceStorage = testEnv.authenticatedContext('alice').storage();
    const bobStorage = testEnv.authenticatedContext('bob').storage();
    const adminStorage = testEnv.authenticatedContext('admin', { admin: true }).storage();

    await assertSucceeds(uploadBytes(ref(aliceStorage, 'profileImages/alice'), new Uint8Array([1]), { contentType: 'image/png' }));
    await assertFails(uploadBytes(ref(bobStorage, 'profileImages/alice'), new Uint8Array([1])));
    await assertSucceeds(uploadBytes(ref(adminStorage, 'profileImages/alice'), new Uint8Array([2]), { contentType: 'image/png' }));
  });

  it('blocks storage access for disabled users', async () => {
    const disabledStorage = testEnv.authenticatedContext('disabled').storage();
    await assertFails(uploadBytes(
      ref(disabledStorage, 'profileImages/disabled'),
      new Uint8Array([1]),
      { contentType: 'image/png' },
    ));
  });

  it('blocks new room files while deletion is in progress', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'chatRooms/room1'), { deletionState: 'deleting' });
    });
    const aliceStorage = testEnv.authenticatedContext('alice').storage();
    await assertFails(uploadBytes(
      ref(aliceStorage, 'chatFiles/room1/blocked.txt'),
      new Uint8Array([1]),
      { contentType: 'text/plain' },
    ));
  });
});

it('uses the expected rules test project', () => {
  expect(PROJECT_ID).toBe('demo-artics-refactor');
});
