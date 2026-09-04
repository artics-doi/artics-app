// 添付フィールドの段階移行ヘルパー
//
// 添付アップロード・削除では attachmentState / attachmentOperationId / attachmentError を書くが、
// これらは firestore.rules の senderUpdatesOwnMessage ホワイトリストに追加された新しいフィールド。
// ルールが未反映の環境ではメッセージ更新が permission-denied になり、添付送信と添付付きメッセージの
// 削除がまとめて失敗する。ルール反映前後どちらでも動くよう、拒否されたときだけ旧フィールド構成で
// 再試行するために使う（readStates の lastReadAt と同じ段階移行パターン）。

/** senderUpdatesOwnMessage の旧ホワイトリストに存在しないフィールド。 */
export const ATTACHMENT_ONLY_FIELDS = [
  'attachmentState',
  'attachmentOperationId',
  'attachmentError',
] as const;

/** Firestore の権限拒否かどうか。ネットワーク断など他のエラーはフォールバックさせない。 */
export function isPermissionDeniedError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return code === 'permission-denied' || code === 'firestore/permission-denied';
}

/** 旧ルールでも通る構成にするため、添付専用フィールドだけを落とした payload を返す。 */
export function withoutAttachmentFields(
  payload: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if ((ATTACHMENT_ONLY_FIELDS as readonly string[]).includes(key)) continue;
    result[key] = value;
  }
  return result;
}

/** 添付専用フィールドを含むか。含まない payload は拒否されてもフォールバックの意味がない。 */
export function hasAttachmentOnlyFields(payload: Record<string, unknown>): boolean {
  return Object.keys(payload).some((key) =>
    (ATTACHMENT_ONLY_FIELDS as readonly string[]).includes(key)
  );
}
