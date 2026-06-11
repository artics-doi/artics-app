// メッセージメニューの表示位置（上下・左右）を画面端との距離から決める純ロジック。
// Chat.tsx の calculateMenuPosition から DOM 非依存部分を抽出（挙動変更なし）。

export type MenuPosition = {
  vertical: 'above' | 'below';
  horizontal: 'left' | 'right';
};

export function resolveMenuPosition(
  rect: Pick<DOMRect, 'top' | 'right'>,
  innerWidth: number,
): MenuPosition {
  const verticalThreshold = 150; // ヘッダー高さ + メニュー高さの余裕
  const horizontalThreshold = 200; // メニュー幅の余裕

  const vertical: 'above' | 'below' = rect.top < verticalThreshold ? 'below' : 'above';
  // 画面右端に近い場合は右寄せにしてはみ出しを防ぐ
  const horizontal: 'left' | 'right' =
    rect.right > innerWidth - horizontalThreshold ? 'right' : 'left';

  return { vertical, horizontal };
}
