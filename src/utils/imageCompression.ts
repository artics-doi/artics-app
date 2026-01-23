// 画像圧縮ユーティリティ
// 送信前に画像を自動的に圧縮してストレージ容量を節約

import imageCompression from 'browser-image-compression';

// 圧縮オプション
const compressionOptions = {
  maxSizeMB: 0.5,          // 最大ファイルサイズ: 0.5MB (500KB)
  maxWidthOrHeight: 1920,  // 最大幅または高さ: 1920px
  useWebWorker: true,      // Web Workerを使用して処理を高速化
  fileType: 'image/jpeg',  // 出力形式
  initialQuality: 0.8,     // 初期品質: 80%
};

/**
 * 画像を圧縮する
 * @param file 圧縮する画像ファイル
 * @returns 圧縮された画像ファイル
 */
export async function compressImage(file: File): Promise<File> {
  // 画像ファイルでない場合はそのまま返す
  if (!file.type.startsWith('image/')) {
    return file;
  }

  // GIFは圧縮しない（アニメーションが壊れる可能性があるため）
  if (file.type === 'image/gif') {
    return file;
  }

  // すでに小さいファイルは圧縮しない（500KB以下）
  if (file.size <= 500 * 1024) {
    return file;
  }

  try {
    console.log(`圧縮前: ${(file.size / 1024 / 1024).toFixed(2)} MB`);

    const compressedFile = await imageCompression(file, compressionOptions);

    console.log(`圧縮後: ${(compressedFile.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`圧縮率: ${((1 - compressedFile.size / file.size) * 100).toFixed(1)}%`);

    return compressedFile;
  } catch (error) {
    console.error('画像圧縮エラー:', error);
    // エラー時は元のファイルを返す
    return file;
  }
}

/**
 * 複数の画像を圧縮する
 * @param files 圧縮する画像ファイルの配列
 * @returns 圧縮された画像ファイルの配列
 */
export async function compressImages(files: File[]): Promise<File[]> {
  const compressedFiles = await Promise.all(
    files.map(file => compressImage(file))
  );
  return compressedFiles;
}

/**
 * ファイルが画像かどうかを判定
 * @param file ファイル
 * @returns 画像の場合true
 */
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

/**
 * ファイルサイズを人間が読みやすい形式に変換
 * @param bytes バイト数
 * @returns フォーマットされた文字列
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
