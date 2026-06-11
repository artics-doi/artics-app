// FCM トークンの取得・無効トークン削除ヘルパー。index.ts から機械的に移動（挙動変更なし）。
// admin.initializeApp() は index.ts で1回だけ実行される前提のため、db は引数で受け取る。

import * as admin from 'firebase-admin';

export function isInvalidRegistrationToken(error: admin.FirebaseError | undefined): boolean {
  return error?.code === 'messaging/registration-token-not-registered' ||
    error?.code === 'messaging/invalid-registration-token' ||
    error?.code === 'messaging/invalid-argument';
}

export async function getFcmTokensForUsers(
  db: admin.firestore.Firestore,
  userIds: string[]
): Promise<{ tokens: string[]; tokenOwners: Map<string, Set<string>> }> {
  const tokens: string[] = [];
  const tokenOwners = new Map<string, Set<string>>();

  for (const userId of userIds) {
    const tokensSnapshot = await db
      .collection('users')
      .doc(userId)
      .collection('fcmTokens')
      .get();

    tokensSnapshot.docs.forEach((doc) => {
      const token = doc.data().token;
      if (!token) return;
      if (!tokens.includes(token)) tokens.push(token);
      const owners = tokenOwners.get(token) ?? new Set<string>();
      owners.add(userId);
      tokenOwners.set(token, owners);
    });
  }

  return { tokens, tokenOwners };
}

export async function deleteInvalidTokens(
  db: admin.firestore.Firestore,
  invalidTokens: string[],
  tokenOwners: Map<string, Set<string>>
): Promise<void> {
  for (const invalidToken of invalidTokens) {
    const owners = tokenOwners.get(invalidToken) ?? new Set<string>();
    for (const userId of owners) {
      await db
        .collection('users')
        .doc(userId)
        .collection('fcmTokens')
        .doc(invalidToken)
        .delete();
      console.log(`Deleted invalid token for user ${userId}`);
    }
  }
}
