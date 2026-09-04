/** 未読件数バッジの PNG dataURL を生成する。canvas が使えない環境では null。 */
export function createBadgeIconDataUrl(label: string): string | null {
  try {
    if (typeof document === 'undefined') return null;

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 背景の青い円（中心 16,16 / 半径 15）。色はアプリのテーマカラーに合わせる
    ctx.beginPath();
    ctx.arc(16, 16, 15, 0, Math.PI * 2);
    ctx.fillStyle = '#1a73e8';
    ctx.fill();

    // 白の縁取り（暗いタスクバー上でも輪郭が見えるように）
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // 文字サイズ: 1文字 20px / 2文字 17px / 3文字（99+）13px
    const fontSize = label.length <= 1 ? 20 : label.length === 2 ? 17 : 13;
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${fontSize}px "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 16, 16);

    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
