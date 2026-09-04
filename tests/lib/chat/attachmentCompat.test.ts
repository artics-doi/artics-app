import { describe, expect, test } from 'vitest';
import {
  ATTACHMENT_ONLY_FIELDS,
  hasAttachmentOnlyFields,
  isPermissionDeniedError,
  withoutAttachmentFields,
} from '../../../src/lib/chat/attachmentCompat';

describe('isPermissionDeniedError', () => {
  test('Firestore の permission-denied を検出する', () => {
    expect(isPermissionDeniedError({ code: 'permission-denied' })).toBe(true);
    expect(isPermissionDeniedError({ code: 'firestore/permission-denied' })).toBe(true);
  });

  test('権限以外のエラーは対象外', () => {
    expect(isPermissionDeniedError({ code: 'unavailable' })).toBe(false);
    expect(isPermissionDeniedError(new Error('network'))).toBe(false);
    expect(isPermissionDeniedError(null)).toBe(false);
    expect(isPermissionDeniedError(undefined)).toBe(false);
    expect(isPermissionDeniedError('permission-denied')).toBe(false);
  });
});

describe('withoutAttachmentFields', () => {
  test('添付専用フィールドだけを落とし、旧ルールで許可される項目は残す', () => {
    const payload = {
      imageURL: 'https://example.com/a.png',
      fileURL: null,
      storagePath: 'chatFiles/room1/1/a.png',
      fileSize: 1234,
      attachmentState: 'ready',
      attachmentError: 'sentinel',
      updatedAt: 'server-timestamp',
    };

    expect(withoutAttachmentFields(payload)).toEqual({
      imageURL: 'https://example.com/a.png',
      fileURL: null,
      storagePath: 'chatFiles/room1/1/a.png',
      fileSize: 1234,
      updatedAt: 'server-timestamp',
    });
  });

  test('null や undefined の値も保持する（明示的なクリアを落とさない）', () => {
    expect(withoutAttachmentFields({ imageURL: null, fileSize: undefined })).toEqual({
      imageURL: null,
      fileSize: undefined,
    });
  });

  test('元の payload を変更しない', () => {
    const payload = { isDeleted: true, attachmentState: 'deleting' };
    withoutAttachmentFields(payload);
    expect(payload).toEqual({ isDeleted: true, attachmentState: 'deleting' });
  });

  test('添付専用フィールドが無ければそのまま', () => {
    const payload = { text: '', isDeleted: true };
    expect(withoutAttachmentFields(payload)).toEqual(payload);
  });
});

describe('hasAttachmentOnlyFields', () => {
  test('添付専用フィールドの有無を判定する', () => {
    expect(hasAttachmentOnlyFields({ attachmentOperationId: 'op1' })).toBe(true);
    expect(hasAttachmentOnlyFields({ text: '', isDeleted: true })).toBe(false);
    expect(hasAttachmentOnlyFields({})).toBe(false);
  });

  test('判定対象は3フィールド', () => {
    expect([...ATTACHMENT_ONLY_FIELDS]).toEqual([
      'attachmentState',
      'attachmentOperationId',
      'attachmentError',
    ]);
  });
});
