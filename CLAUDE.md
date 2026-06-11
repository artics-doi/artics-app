# CLAUDE.md（chat-app）

ArticsChat 本体のリポジトリ。**詳細な構成・規約・危険地帯は [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) を最初に読むこと。**

## 作業ルール

- 変更は最小限に。純ロジックは `src/lib/` に置き `tests/lib/` に特性テストを書く
- ページから部品を抽出するときは親ページの `*.module.css` をそのまま import（CSS 分割禁止）
- 完了ゲート: `npm run lint` / `npm run typecheck` / `npm run build` / `npm run test`。
  functions を触ったら `cd functions && npm run build` して lib/ を同一コミットに含める
- `npm run test:rules` は Java + emulator が必要（未導入環境ではスキップし、その旨を報告）
- **デプロイ禁止**: `firebase deploy` / functions の deploy / electron-builder の `--publish` / GH_TOKEN 設定は、ユーザーの明示的な指示があるまで実行しない
- `functions/src/index.ts` の export 名はデプロイされる関数名。変更禁止
- `.env` と `functions/serviceAccountKey.json` は秘密情報。コミットしない
