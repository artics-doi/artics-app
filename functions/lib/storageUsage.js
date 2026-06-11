"use strict";
// ストレージ使用量の集計ヘルパー。index.ts から機械的に移動（挙動変更なし）。
// admin.initializeApp() は index.ts で1回だけ実行される前提のため、db は引数で受け取る
// （functions/src/process/index.ts と同じ規約。モジュール初期化順の事故を避ける）。
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTrackedFileSize = getTrackedFileSize;
exports.getTrackedPhotoFileSize = getTrackedPhotoFileSize;
exports.adjustStorageUsage = adjustStorageUsage;
const firestore_1 = require("firebase-admin/firestore");
function getTrackedFileSize(data) {
    if (!(data === null || data === void 0 ? void 0 : data.storagePath) || typeof data.fileSize !== 'number')
        return 0;
    return data.fileSize;
}
function getTrackedPhotoFileSize(data) {
    if (!(data === null || data === void 0 ? void 0 : data.photoStoragePath) || typeof data.photoFileSize !== 'number')
        return 0;
    return data.photoFileSize;
}
async function adjustStorageUsage(db, deltaBytes) {
    if (deltaBytes === 0)
        return;
    await db.collection('settings').doc('storageUsage').set({
        totalBytes: firestore_1.FieldValue.increment(deltaBytes),
        lastUpdated: firestore_1.FieldValue.serverTimestamp()
    }, { merge: true });
}
//# sourceMappingURL=storageUsage.js.map