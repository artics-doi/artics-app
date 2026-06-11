// 工程管理を利用できる環境か判定する専用ガード。
//
// なぜ専用関数を作るか:
//   既存の isDesktopWorkspace()（navigation.ts）は「Electron か min-width:1024px」だけで
//   UA やタッチを考慮しないため、「スマホを除外する」用途には使えない
//   （大画面タブレットや横向きスマホを通してしまう）。工程管理は PC 専用なので、
//   スマホ／小型タッチ端末を確実に弾く独自判定を持つ。
//
// 判定方針（5パターン）:
//   1. Electron            → 常に許可（最優先で短絡。小窓でも横スクロールで使う設計）
//   2. PCブラウザ・広い幅   → 許可
//   3. PCブラウザ・狭い幅   → 許可（タッチでなければ「縮めた PC ウィンドウ」とみなす）
//   4. スマホ（縦）        → 不許可（UA or タッチ かつ 狭幅）
//   5. タブレット（タッチ） → 不許可（タッチ かつ 狭め）
//
// すなわち「タッチ可能 かつ 画面が狭い」ものだけをモバイル扱いにして弾く。

import { isElectronEnv } from '../../hooks/useElectronNotification';

// 工程管理を「狭い」と判断する幅のしきい値（px）。これ未満かつタッチならモバイル扱い。
const PROCESS_MIN_WIDTH = 1024;

// UA がスマホ／タブレットらしいか（補助的なシグナル。主判定はタッチ＋幅）。
function isMobileUserAgent(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

// タッチ可能な端末か。
function isTouchDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.maxTouchPoints > 0;
}

// 画面（ウィンドウ）が工程管理に十分な幅を持つか。
function isWideEnough(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(`(min-width: ${PROCESS_MIN_WIDTH}px)`).matches;
}

/**
 * 工程管理を利用できる環境かどうか。
 * - Electron は無条件で true。
 * - それ以外は「モバイル端末でない」ことを条件にする。
 *   モバイル端末 = (タッチ可能) かつ (狭幅 もしくは モバイルUA)。
 */
export function canUseProcess(): boolean {
  // 1. Electron は最優先で許可（短絡）。
  if (isElectronEnv()) return true;

  if (typeof window === 'undefined') return false;

  const touch = isTouchDevice();
  const wide = isWideEnough();
  const mobileUa = isMobileUserAgent();

  // モバイル端末判定: タッチ可能で、かつ「狭い」または「モバイル UA」。
  // （タッチ非対応の PC は幅が狭くても許可する＝縮めたウィンドウ扱い）
  const isMobile = touch && (!wide || mobileUa);

  return !isMobile;
}
