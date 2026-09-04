# AGENTS.md（chat-app）

ArticsChat（社内チャットアプリ、React 19 + TypeScript + Vite + Firebase + Electron/PWA）。
**構成・規約・危険地帯の索引は [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) を最初に読むこと。**

## ルール

- 応答・コメントは日本語。UI に絵文字を使わない。フォントは Noto Sans JP
- 変更は最小限に。純ロジックは `src/lib/` + `tests/lib/`（vitest、emulator 不要）
- 抽出コンポーネントは親ページの `*.module.css` をそのまま import（CSS ファイル分割禁止）
- 完了ゲート: `npm run lint` / `npm run typecheck` / `npm run build` / `npm run test`。
  functions 変更時は `cd functions && npm run build` で lib/ を再生成して同一コミットへ
- **デプロイ禁止**: `firebase deploy` 全種 / functions の deploy / electron-builder `--publish` / GH_TOKEN 設定は、ユーザーの明示的な指示なしに実行しない
- `functions/src/index.ts` の export 名 = デプロイされる関数名。変更禁止
- `.env` / `functions/serviceAccountKey.json` はコミットしない
- 教訓は `tasks/lessons.md` に記録する。作業開始時と完了前に関連項目を確認する
- 作業中に判明した再発可能なミスは「問題・原因・次回の予防または確認方法」を重複なく `tasks/lessons.md` に追記する
