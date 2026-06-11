export function handleGroupImageChange(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('画像の読み込み結果が不正です'));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error('画像の読み込みに失敗しました'));
    };

    reader.readAsDataURL(file);
  });
}
