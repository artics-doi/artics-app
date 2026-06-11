export const MEMO_COLORS = [
  { id: 'default', name: 'デフォルト', light: 'var(--bg-secondary)', dark: 'var(--bg-secondary)' },
  { id: 'coral',   name: 'コーラル',   light: '#faafa8', dark: '#77172e' },
  { id: 'peach',   name: 'ピーチ',     light: '#f39f76', dark: '#692b17' },
  { id: 'sand',    name: 'サンド',     light: '#fff8b8', dark: '#7c4a03' },
  { id: 'mint',    name: 'ミント',     light: '#e2f6d3', dark: '#264d3b' },
  { id: 'sage',    name: 'セージ',     light: '#b4ddd3', dark: '#0c625d' },
  { id: 'fog',     name: 'フォグ',     light: '#d4e4ed', dark: '#256377' },
  { id: 'storm',   name: 'ストーム',   light: '#aeccdc', dark: '#284255' },
  { id: 'dusk',    name: 'ダスク',     light: '#d3bfdb', dark: '#472e5b' },
  { id: 'blossom', name: 'ブロッサム', light: '#f6e2dd', dark: '#6c394f' },
  { id: 'clay',    name: 'クレイ',     light: '#e9e3d4', dark: '#4b443a' },
  { id: 'chalk',   name: 'チョーク',   light: '#efeff1', dark: '#232427' },
] as const;

export type MemoColorId = typeof MEMO_COLORS[number]['id'];

export function getMemoColor(colorId: string | null, isDark: boolean): string | undefined {
  if (!colorId || colorId === 'default') return undefined;
  const color = MEMO_COLORS.find(c => c.id === colorId);
  if (!color) return undefined;
  return isDark ? color.dark : color.light;
}
