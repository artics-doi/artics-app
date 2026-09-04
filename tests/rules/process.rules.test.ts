import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

// 工程管理（process management）のセキュリティルール検証。
// 行動予定表(schedules)とは完全に独立したコレクション群（projects / tasks / processMembers）を対象とする。
const PROJECT_ID = 'demo-artics-refactor';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();

  // ルールを無効化したコンテキストで初期データをシードする。
  // alice が作成者のプロジェクトとタスクを1件ずつ用意する。
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users/alice'), { uid: 'alice', displayName: 'Alice' });
    await setDoc(doc(db, 'users/bob'), { uid: 'bob', displayName: 'Bob' });
    await setDoc(doc(db, 'projects/proj1'), {
      name: 'プロジェクト1',
      description: '',
      colorIndex: 0,
      status: 'active',
      lifecycleState: 'active',
      lifecycleVersion: 0,
      columns: [],
      order: 'a0',
      createdBy: 'alice',
      createdByName: 'Alice',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'tasks/task1'), {
      title: 'タスク1',
      projectId: 'proj1',
      columnId: 'col-todo',
      assigneeIds: [],
      startDate: null,
      endDate: null,
      description: '',
      order: 'a0',
      archived: false,
      isArchived: false,
      createdBy: 'alice',
      createdByName: 'Alice',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'processMembers/mem1'), {
      name: 'メンバー1',
      colorIndex: 0,
      order: 0,
      linkedUserId: null,
    });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('Process rules: projects', () => {
  it('ログイン者は read でき、非ログインは read/write 不可', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    const anonDb = testEnv.unauthenticatedContext().firestore();

    await assertSucceeds(getDoc(doc(aliceDb, 'projects/proj1')));
    await assertFails(getDoc(doc(anonDb, 'projects/proj1')));
    await assertFails(addDoc(collection(anonDb, 'projects'), { name: 'blocked', createdBy: 'x' }));
  });

  it('create は createdBy==auth.uid のときのみ許可（詐称は拒否）', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();

    // 正常: 自分を作成者に
    await assertSucceeds(addDoc(collection(aliceDb, 'projects'), {
      name: '新規PJ',
      createdBy: 'alice',
      createdByName: 'Alice',
      order: 'a1',
      status: 'active',
      lifecycleState: 'active',
      lifecycleVersion: 0,
      createdAt: serverTimestamp(),
    }));

    // 詐称: bob を作成者に偽装 → 拒否
    await assertFails(addDoc(collection(aliceDb, 'projects'), {
      name: '詐称PJ',
      createdBy: 'bob',
      order: 'a2',
      lifecycleState: 'active',
      lifecycleVersion: 0,
    }));
  });

  it('update で createdBy を改変するのは拒否（不変）', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();

    // createdBy を維持した更新は許可
    await assertSucceeds(updateDoc(doc(aliceDb, 'projects/proj1'), {
      name: 'リネーム',
      createdBy: 'alice',
      updatedAt: serverTimestamp(),
    }));

    // createdBy を別人に書き換え → 拒否
    await assertFails(updateDoc(doc(aliceDb, 'projects/proj1'), {
      createdBy: 'bob',
    }));
  });

  it('通常更新は許可し、旧pendingDelete更新は拒否する', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();

    await assertFails(updateDoc(doc(aliceDb, 'projects/proj1'), {
      pendingDelete: true,
    }));
    await assertSucceeds(updateDoc(doc(aliceDb, 'projects/proj1'), {
      status: 'archived',
    }));
    await assertSucceeds(updateDoc(doc(aliceDb, 'projects/proj1'), {
      columns: [{ id: 'c1', name: '未着手', order: 0 }],
    }));
  });

  it('削除はversion付き状態遷移だけを許可する', async () => {
    const bobDb = testEnv.authenticatedContext('bob').firestore();
    await assertSucceeds(updateDoc(doc(bobDb, 'projects/proj1'), {
      lifecycleState: 'deleting',
      lifecycleVersion: 1,
      operationId: 'operation-1',
      updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(doc(bobDb, 'projects/proj1'), {
      lifecycleVersion: 2,
    }));
  });

  it('クライアントからの delete は全面禁止（物理削除は Function のみ）', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    await assertFails(deleteDoc(doc(aliceDb, 'projects/proj1')));
  });
});

describe('Process rules: tasks', () => {
  it('create は createdBy==auth.uid のときのみ許可（詐称は拒否）', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();

    await assertSucceeds(addDoc(collection(aliceDb, 'tasks'), {
      title: '新規タスク',
      projectId: 'proj1',
      createdBy: 'alice',
      order: 'a1',
      archived: false,
      isArchived: false,
      createdAt: serverTimestamp(),
    }));

    await assertFails(addDoc(collection(aliceDb, 'tasks'), {
      title: '詐称タスク',
      projectId: 'proj1',
      createdBy: 'bob',
      order: 'a2',
    }));
  });

  it('update で projectId / createdBy を改変するのは拒否（不変）', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();

    // 通常更新（不変フィールドを維持）は許可
    await assertSucceeds(updateDoc(doc(aliceDb, 'tasks/task1'), {
      title: 'タスク更新',
      projectId: 'proj1',
      createdBy: 'alice',
      updatedAt: serverTimestamp(),
    }));

    // projectId 改変 → 拒否（別PJへの付け替え防止）
    await assertFails(updateDoc(doc(aliceDb, 'tasks/task1'), {
      projectId: 'proj2',
    }));
    // createdBy 改変 → 拒否
    await assertFails(updateDoc(doc(aliceDb, 'tasks/task1'), {
      createdBy: 'bob',
    }));
  });

  it('個別アーカイブ状態を1ドキュメント更新できる', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(updateDoc(doc(aliceDb, 'tasks/task1'), {
      isArchived: true,
      updatedAt: serverTimestamp(),
    }));
  });

  it('タスク単体の delete はログイン者なら許可（サブコレクション無し・Function不要）', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    const anonDb = testEnv.unauthenticatedContext().firestore();
    // 非ログインは不可
    await assertFails(deleteDoc(doc(anonDb, 'tasks/task1')));
    // ログイン者は可
    await assertSucceeds(deleteDoc(doc(aliceDb, 'tasks/task1')));
  });

  it('親プロジェクトが存在しないか削除中なら書き込みを拒否する', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();

    await assertFails(addDoc(collection(aliceDb, 'tasks'), {
      title: 'orphan',
      projectId: 'missing',
      createdBy: 'alice',
    }));

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'projects/proj1'), {
        lifecycleState: 'deleting',
      });
    });
    await assertFails(updateDoc(doc(aliceDb, 'tasks/task1'), { title: 'blocked' }));
    await assertFails(deleteDoc(doc(aliceDb, 'tasks/task1')));
  });
});

describe('Process rules: processMembers', () => {
  it('ログイン者は read/create/update/delete でき、非ログインは不可', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    const anonDb = testEnv.unauthenticatedContext().firestore();

    await assertSucceeds(getDoc(doc(aliceDb, 'processMembers/mem1')));
    await assertSucceeds(addDoc(collection(aliceDb, 'processMembers'), { name: '新メンバー', order: 1 }));
    await assertSucceeds(updateDoc(doc(aliceDb, 'processMembers/mem1'), { name: '改名' }));
    await assertSucceeds(deleteDoc(doc(aliceDb, 'processMembers/mem1')));

    await assertFails(getDoc(doc(anonDb, 'processMembers/mem1')));
    await assertFails(addDoc(collection(anonDb, 'processMembers'), { name: 'blocked' }));
  });
});
