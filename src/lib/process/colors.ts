import { PROCESS_COLORS, PROCESS_COLOR_COUNT } from '../../constants/process';

// カラーインデックスからアクセントカラーを取得（負数や範囲外もラップする）
export function accentOf(colorIndex: number): string {
  const idx = ((colorIndex % PROCESS_COLOR_COUNT) + PROCESS_COLOR_COUNT) % PROCESS_COLOR_COUNT;
  return PROCESS_COLORS[idx].accent;
}
