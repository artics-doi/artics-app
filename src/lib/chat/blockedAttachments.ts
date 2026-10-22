// 添付してよいファイル名かを決める。
// 拡張子の拒否リストは storage.rules の isBlockedExecutable と揃える。
// 判定するのは最後の拡張子。zip や gz にまとめたファイルは、ここでは止めない。

const BLOCKED_ATTACHMENT_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'com', 'scr', 'msi', 'dll',
  'js', 'jse', 'vbs', 'vbe', 'ps1', 'psm1', 'psd1', 'psc1',
  'hta', 'lnk', 'wsf', 'wsh', 'cpl', 'msc', 'jar',
]);

export function attachmentExtension(fileName: string): string {
  const baseName = fileName.replace(/\\/g, '/').split('/').pop() ?? '';
  const trimmed = baseName.trim().replace(/[. ]+$/g, '');
  const dot = trimmed.lastIndexOf('.');
  if (dot < 0) return '';
  return trimmed.slice(dot + 1).toLowerCase();
}

export function isBlockedAttachmentName(fileName: string): boolean {
  return BLOCKED_ATTACHMENT_EXTENSIONS.has(attachmentExtension(fileName));
}

export function blockedAttachmentMessage(fileNames: readonly string[]): string {
  const names = fileNames.map((fileName) => `「${fileName}」`).join('');
  return `${names}は実行形式のファイルのため送信できません。zipにまとめれば送れます。`;
}
