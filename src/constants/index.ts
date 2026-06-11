// アプリケーション定数

// リアクション絵文字（M-7: 主要 8 個 + 二次 14 個に分割）
// PRIMARY: ピッカー初期表示
// SECONDARY: 「もっと見る」展開後に表示
// REACTION_EMOJIS: 後方互換のため全件を残す（既存コード用、将来段階的に置換）
export const PRIMARY_REACTION_EMOJIS = [
  '👍',
  '❤️',
  '😊',
  '😂',
  '🙏',
  '👀',
  '✅',
  '🎉',
];

export const SECONDARY_REACTION_EMOJIS = [
  '🤔',
  '😮',
  '😢',
  '👏',
  '⚠️',
  '💡',
  '⏳',
  '📌',
  '🔍',
  '🛠️',
  '🙆',
  '🙋',
  '📝',
  '🔁',
];

export const REACTION_EMOJIS = [...PRIMARY_REACTION_EMOJIS, ...SECONDARY_REACTION_EMOJIS];

// ファイルアップロード
export const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB

// トースト表示時間（ミリ秒）（M-19: 2 秒 → 3 秒に延長して読み取りやすく）
export const TOAST_DURATION = 3000;

// テキストエリア（M-2: 120 → 200 で長文も見やすく）
export const MAX_TEXTAREA_HEIGHT = 200;
export const MIN_TEXTAREA_ROWS = 1;
export const MAX_EDIT_TEXTAREA_ROWS = 5;

// メッセージ
export const REPLY_TEXT_MAX_LENGTH = 50;
export const SEARCH_DEBOUNCE_MS = 500;
export const SEARCH_LIMIT_PER_ROOM = 100;
export const SEARCH_RESULTS_LIMIT = 50;

// ハイライトアニメーション時間（ミリ秒）（L-7: 2000 → 3500 で見落としを減らす）
export const HIGHLIGHT_DURATION = 3500;
