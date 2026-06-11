// Home.module.css / Chat.module.css 限定の未使用セレクタ検出・削除スクリプト（P10 用）。
// 方針（安全側に倒す）:
//   - src/ 全体で styles.<name> / styles['<name>'] として一度も参照されないクラスのみ「未使用」とする
//     （どの CSS Modules を import しているかは区別しない = 消しすぎない方向の誤差のみ許容）
//   - セレクタ内のクラストークンが「すべて未使用」のルールだけ削除。1つでも使用中なら残す
//   - :global を含むセレクタ、@keyframes、クラスを含まないセレクタは無条件で残す
//   - ハイフン入りなど styles.x で書けない名前は残す
// 使い方: node scripts/find-unused-css.mjs [--apply]

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const TARGETS = [
  path.join(ROOT, 'src/pages/Home.module.css'),
  path.join(ROOT, 'src/pages/Chat.module.css'),
];
const APPLY = process.argv.includes('--apply');

// --- src/ 内で使われているクラス名を収集 ---
function collectFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(p, out);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(p);
  }
  return out;
}

const used = new Set();
for (const file of collectFiles(path.join(ROOT, 'src'))) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/styles\.([A-Za-z_$][A-Za-z0-9_$]*)/g)) used.add(m[1]);
  for (const m of text.matchAll(/styles\[\s*['"`]([^'"`]+)['"`]\s*\]/g)) used.add(m[1]);
}

// --- CSS をルール単位にパースして判定 ---
function processCss(cssPath) {
  const css = fs.readFileSync(cssPath, 'utf8');
  const removals = []; // {start, end, selector}

  function parseBlock(start, end) {
    let i = start;
    while (i < end) {
      // 次のルールの開始（セレクタの先頭）を探す
      while (i < end && /\s/.test(css[i])) i++;
      if (i >= end) break;
      // コメントはスキップ
      if (css.startsWith('/*', i)) {
        const close = css.indexOf('*/', i + 2);
        i = close === -1 ? end : close + 2;
        continue;
      }
      const braceOpen = css.indexOf('{', i);
      if (braceOpen === -1 || braceOpen >= end) break;
      const selector = css.slice(i, braceOpen).trim();
      // 対応する閉じ括弧を探す
      let depth = 1;
      let j = braceOpen + 1;
      while (j < end && depth > 0) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}') depth--;
        j++;
      }
      const blockEnd = j; // '}' の次
      if (selector.startsWith('@media') || selector.startsWith('@supports')) {
        parseBlock(braceOpen + 1, blockEnd - 1); // 中のルールを個別判定
      } else if (selector.startsWith('@')) {
        // @keyframes 等は無条件で残す
      } else if (!selector.includes(':global')) {
        const tokens = [...selector.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
        const identTokens = tokens.filter((t) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(t));
        // クラストークンがあり、全トークンが識別子形式かつすべて未使用なら削除対象
        if (
          tokens.length > 0 &&
          identTokens.length === tokens.length &&
          tokens.every((t) => !used.has(t))
        ) {
          removals.push({ start: i, end: blockEnd, selector });
        }
      }
      i = blockEnd;
    }
  }

  parseBlock(0, css.length);

  console.log(`\n=== ${path.basename(cssPath)}: 削除候補 ${removals.length} ルール ===`);
  for (const r of removals) console.log('  ' + r.selector.replace(/\s+/g, ' '));

  if (APPLY && removals.length > 0) {
    let out = '';
    let pos = 0;
    for (const r of removals) {
      out += css.slice(pos, r.start);
      pos = r.end;
    }
    out += css.slice(pos);
    // 3行以上連続する空行を1行に圧縮
    out = out.replace(/(\r?\n){3,}/g, '\n\n');
    fs.writeFileSync(cssPath, out, 'utf8');
    console.log(`  → 適用済み`);
  }
}

for (const target of TARGETS) processCss(target);
console.log(`\n使用中クラス総数: ${used.size}`);
