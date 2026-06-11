"use strict";
// FCM トークンの取得・無効トークン削除ヘルパー。index.ts から機械的に移動（挙動変更なし）。
// admin.initializeApp() は index.ts で1回だけ実行される前提のため、db は引数で受け取る。
Object.defineProperty(exports, "__esModule", { value: true });
exports.isInvalidRegistrationToken = isInvalidRegistrationToken;
exports.getFcmTokensForUsers = getFcmTokensForUsers;
exports.deleteInvalidTokens = deleteInvalidTokens;
function isInvalidRegistrationToken(error) {
    return (error === null || error === void 0 ? void 0 : error.code) === 'messaging/registration-token-not-registered' ||
        (error === null || error === void 0 ? void 0 : error.code) === 'messaging/invalid-registration-token' ||
        (error === null || error === void 0 ? void 0 : error.code) === 'messaging/invalid-argument';
}
async function getFcmTokensForUsers(db, userIds) {
    const tokens = [];
    const tokenOwners = new Map();
    for (const userId of userIds) {
        const tokensSnapshot = await db
            .collection('users')
            .doc(userId)
            .collection('fcmTokens')
            .get();
        tokensSnapshot.docs.forEach((doc) => {
            var _a;
            const token = doc.data().token;
            if (!token)
                return;
            if (!tokens.includes(token))
                tokens.push(token);
            const owners = (_a = tokenOwners.get(token)) !== null && _a !== void 0 ? _a : new Set();
            owners.add(userId);
            tokenOwners.set(token, owners);
        });
    }
    return { tokens, tokenOwners };
}
async function deleteInvalidTokens(db, invalidTokens, tokenOwners) {
    var _a;
    for (const invalidToken of invalidTokens) {
        const owners = (_a = tokenOwners.get(invalidToken)) !== null && _a !== void 0 ? _a : new Set();
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
//# sourceMappingURL=fcm.js.map