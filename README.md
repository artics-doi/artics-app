# ArticsChat

社内チャットアプリケーション。Windows PC 向け Electron デスクトップアプリとスマートフォン向け PWA の2形態で提供する。

- チャット（1対1 / グループ / メモ）、リアクション、返信、ピン留め、既読、画像・ファイル送信
- 行動予定表（カレンダー・予定通知）、工程管理（カンバン / ガント / 工数レポート）
- プッシュ通知（PWA: FCM / Electron: カスタム通知ウィンドウ）

## 技術スタック

React 19 / TypeScript / Vite / Firebase（Auth, Firestore, Storage, RTDB, Cloud Functions, FCM, Hosting）/ Electron

## セットアップ

```bash
cd chat-app
npm install
cp .env.example .env   # Firebase 設定を記入（VITE_FIREBASE_* / VITE_FIREBASE_VAPID_KEY）
```

## 開発コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | PWA 開発サーバー（http://127.0.0.1:5173） |
| `npm run dev:electron` | Electron 開発モード |
| `npm run build` | typecheck + Web ビルド |
| `npm run build:electron` | Electron インストーラー生成（release/） |
| `npm run lint` / `npm run typecheck` | 静的チェック |
| `npm run test` | ユニットテスト（vitest、emulator 不要） |
| `npm run test:rules` | セキュリティルールテスト（Java + emulator 必須） |

## ドキュメント

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — 構成・規約・データフロー・危険地帯の索引（開発前に必読）
- `PROJECT.md` — 過去の設計判断と変更履歴
- 公開手順 — `.claude/skills/artics-deploy/skill.md`（デプロイは手順書に従い明示的に行う）
