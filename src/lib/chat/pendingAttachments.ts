export type AttachmentLike = Pick<File, 'name' | 'size'>;

export type ClipboardItemLike = Pick<DataTransferItem, 'kind' | 'type' | 'getAsFile'>;

export type PendingAttachmentValidation =
  | { valid: true }
  | { valid: false; reason: 'file-too-large'; fileName: string; size: number }
  | { valid: false; reason: 'total-too-large'; size: number };

export function validatePendingAttachments(
  files: readonly AttachmentLike[],
  maxBytes: number,
): PendingAttachmentValidation {
  const oversizedFile = files.find((file) => file.size > maxBytes);
  if (oversizedFile) {
    return {
      valid: false,
      reason: 'file-too-large',
      fileName: oversizedFile.name,
      size: oversizedFile.size,
    };
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > maxBytes) {
    return { valid: false, reason: 'total-too-large', size: totalSize };
  }

  return { valid: true };
}

/** クリップボード内の画像だけを、既存の添付処理へ渡せる File として取り出す。 */
export function getClipboardImageFiles(items: readonly ClipboardItemLike[]): File[] {
  return items.flatMap((item) => {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) return [];
    const file = item.getAsFile();
    return file ? [file] : [];
  });
}
