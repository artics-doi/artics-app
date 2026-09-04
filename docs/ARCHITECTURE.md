# ArticsChat アーキテクチャガイド

AI コーディングエージェント（Claude Code / Codex）と開発者向けの「どこを見るか」索引。
2026-06 のリファクタリング（ブランチ refactor/agent-friendly-202606）時点の構成。

## アプリの形態

社内チャットアプリ。同一コードベースから2形態で提供する。

- **PWA**: Firebase Hosting で配信（`vite.config.ts`、Service Worker 2本構成）
- **Electron**: Windows デスクトップアプリ（`vite.electron.config.ts`、GitHub Releases + electron-updater）

ルーティングは file:// 対応のため全環境 **HashRouter**（`#/chat/xxx` 形式）。

## 機能 → ファイル対応表

| 機能 | 入口（ページ） | ロジック・部品 |
|---|---|---|
| チャット送受信 | `src/pages/Chat.tsx` | `hooks/useMessages.ts`（取得・楽観的更新）、`components/chat/ChatMessageList.tsx`（一覧表示）、`components/chat/messageText.tsx`（URL/NAS/メンション描画） |
| メッセージメニュー/リアクション | `src/pages/Chat.tsx` | `lib/chat/reactions.ts`（集計）、`lib/chat/menuPosition.ts`（位置計算）、`components/chat/modals/`（詳細モーダル群） |
| 既読・未読 | `src/hooks/useReadReceipt.ts` | サーバー側: `functions/src/unread.ts` + `functions/src/index.ts`（updateUnreadCountsOnNewMessage / normalizeUnreadCountOnReadStateWrite）。表示: `utils/room.ts` の `getUnreadCount` |
| ルーム一覧・管理 | `src/pages/Home.tsx` | `components/home/`（ChatRoomList ほか）、`components/home/modals/`（設定・プロフィール等16モーダル） |
| テーマ/バージョン/ストレージ表示 | `src/pages/Home.tsx` | `hooks/useTheme.ts` / `useAppVersion.ts` / `useStorageUsage.ts` / `useReleaseNotes.ts` / `useAlwaysOnTop.ts` |
| 通知（PWA） | `src/hooks/useFCMToken.ts` | `public/firebase-messaging-sw.js`（FCM SW）、`functions/src/index.ts`（sendPushNotificationOnNewMessage）、`functions/src/fcm.ts` |
| 通知（Electron） | `src/hooks/useGlobalNotification.ts` | `hooks/useElectronNotification.ts`（IPC）、`electron/notificationManager.ts`（通知ウィンドウ） |
| メモ | `src/pages/Memo.tsx` | `components/memo/`（MemoCard / MemoComposer / MemoEditModal）、`utils/memoUtils.tsx`、`constants/memoColors.ts` |
| 行動予定表 | `src/pages/Schedule.tsx` | `lib/schedule/calendar.ts`（日付計算）、`lib/schedule/events.ts`（並び替え・週レーン配置）、`lib/schedule/form.ts`（フォーム）、`hooks/useSchedules.ts` |
| 予定通知 | `src/hooks/useScheduleNotifications.ts`（Electron のみ） | サーバー側: `functions/src/scheduleTime.ts` + sendScheduleNotifications。クライアント計算: `utils/scheduleNotifications.ts`（仕様はサーバーと同一に保つこと） |
| 工程管理（カンバン/ガント） | `src/pages/process/Board.tsx` | `lib/process/`（純ロジック・テスト完備）、`hooks/process/`、`components/process/`（GanttViewMenu / TaskFilterBar ほか） |
| 工数レポート | `src/pages/process/EffortReport.tsx` | `lib/process/effortReport.ts` |
| 認証・ログアウト | `src/contexts/AuthContext.tsx` | `lib/firebase.ts`（初期化・FCMトークン削除） |
| 在席（オンライン）表示 | `src/hooks/usePresence.ts` / `useOnlineStatus.ts` | Realtime Database `status/{userId}`、ルールは `database.rules.json` |
| Electron 本体 | `electron/main.ts`（ウィンドウ/トレイ/IPC/自動更新） | `electron/store.ts`（設定永続化）、`electron/notificationManager.ts`、`electron/navigationPolicies.ts`（URL/NAS許可） |
| Cloud Functions | `functions/src/index.ts`（全トリガー定義） | ヘルパー: `storageUsage.ts` / `unread.ts` / `fcm.ts` / `scheduleTime.ts`、工程管理: `process/index.ts` |

## ディレクトリ規約

```
src/
├── pages/            # ルート単位のページ。状態と Firestore 書き込みはここに集約
├── components/<area>/ # ページ別の表示部品（chat/home/memo/desktop/process）。barrel index.ts あり
│   └── modals/       # 同領域のモーダル群
├── hooks/            # カスタムフック（購読・通知・UI状態）。process/ はサブディレクトリ
├── lib/              # 純ロジック（React 非依存）。tests/lib でテストする対象
├── utils/            # 小粒のユーティリティ（純関数中心）
├── constants/        # 定数
├── types/            # 型定義（index.ts = チャット系、process.ts、schedule.ts、memo.ts）
└── contexts/         # AuthContext / ToastContext / ActiveRoomContext
```

- **新しい純ロジックは `lib/` に置き、`tests/lib/` に特性テストを書く**（emulator 不要のもののみ）
- ページから部品を抽出するときは、状態と Firestore 操作を親に残し props で渡す（既存パターンに従う）

## CSS 規約（重要）

- CSS Modules（`*.module.css`）。Tailwind は不使用。フォントは Noto Sans JP
- **ページから抽出したコンポーネントは、親ページの module.css をそのまま import する**
  （例: `components/chat/ChatMessageList.tsx` → `import styles from '../../pages/Chat.module.css'`）。
  新しい CSS ファイルへの分割はカスケード順（後勝ち）が崩れるため行わない
- **動的クラス参照（`styles[式]`）があるファイル = セレクタ名の grep だけでは安全に消せない**:
  `Schedule.tsx` / `process/Board.tsx` / `process/ProjectList.tsx` / `Toast.tsx` / `StatusDot.tsx` / `PasswordStrengthMeter.tsx`
- 未使用セレクタの検出は `node scripts/find-unused-css.mjs`（対象は Home/Chat の module.css 限定。`--apply` で削除）

## データフローの要点

### メッセージと未読数
1. クライアントが `chatRooms/{roomId}/messages` に addDoc（楽観的表示は `local-` 接頭辞 ID + `_pending` フラグ）
2. Functions `updateUnreadCountsOnNewMessage` が **lastReadAt 基準の絶対値**で `unreadCounts` を再計算
3. 既読時はクライアントが `readStates/{uid}` に lastReadAt を書き、`normalizeUnreadCountOnReadStateWrite` が同じ計算式で正規化
   → **増分（increment）方式は使わない**。計算式は `functions/src/unread.ts` の1箇所のみ

### 通知の環境分岐
- PWA: Functions → FCM → `public/firebase-messaging-sw.js`（閲覧中ルームは表示抑制）
- Electron: `useGlobalNotification` が onSnapshot で検知 → IPC → `electron/notificationManager.ts` のカスタム通知ウィンドウ
- ミュート設定は `users/{uid}/notificationSettings/{roomId}`（Functions 側で送信前に確認）

### Firestore 主要構造

```
users/{userId}/fcmTokens/{tokenId}, notificationSettings/{roomId}
chatRooms/{roomId}: members[], memberDetails{}, unreadCounts{}（Functions 専用）, favorites[]
chatRooms/{roomId}/messages/{messageId}: readBy[], reactionsByUser{}, replyTo{}, isPinned
chatRooms/{roomId}/readStates/{userId}: lastReadAt
schedules/{scheduleId}, projects/{projectId}, tasks/{taskId}, settings/{releaseNotes,storageUsage}
```

セキュリティルール: `firestore.rules`（messages の更新は送信者のみ全フィールド可・他者は readBy/reactionsByUser/isPinned のみ。unreadCounts はクライアント書き込み禁止）

## 危険地帯（変更前に必ず周辺を読む）

| 場所 | 理由 |
|---|---|
| `hooks/useMessages.ts`・通知フック群（useGlobalNotification / useFCMToken / useElectronNotification / useScheduleNotifications） | 2026-06 の不具合修正で安定化済み。楽観的更新の merge と通知の初回判定はタイミング依存 |
| `pages/process/Board.tsx` の DOM 同期 effect（MutationObserver / ResizeObserver）と Symbol タグ | SVAR Gantt の内部 DOM に依存。抽出・並べ替え禁止 |
| `functions/src/index.ts` の export 名 | **export 名 = デプロイされる関数名**。変更・削除はデプロイ事故になる。`export * from './process'` を消すと工程管理の関数が無言で消える |
| `functions/lib/` | Git 管理されたビルド成果物。`functions/src` を変えたら `cd functions && npm run build` して**同一コミットに含める** |
| `admin.initializeApp()` の初期化順 | `functions/src/index.ts` で1回だけ実行。ヘルパーモジュールはモジュールスコープで `admin.firestore()` を呼ばず、db を引数で受け取る |
| メッセージの `local-` 接頭辞 ID / `_pending` | 楽観的更新中の仮 ID。Firestore 操作（更新・削除・リアクション）に渡してはいけない |
| Service Worker 2本構成 | `src/sw-custom.ts`（Workbox・push 非対応）と `public/firebase-messaging-sw.js`（FCM 専用）。統合禁止 |

## テストマップ

| テスト | 対象 | 実行 |
|---|---|---|
| `tests/lib/utils/` | dateUtils / room / passwordStrength | `npm run test`（vitest、emulator 不要） |
| `tests/lib/chat/` | reactions / menuPosition / messageText | 同上 |
| `tests/lib/schedule/` | calendar / events / form | 同上 |
| `tests/lib/process/` | 工程管理の純ロジック 11 ファイル | 同上 |
| `tests/rules/` | firestore.rules / storage.rules | `npm run test:rules`（**Java + emulator 必須**） |
| `tests/e2e/` | Playwright スモーク | `npm run test:e2e`（環境構築が別途必要） |

## 検証コマンド（完了ゲート）

`chat-app/` で実行:

```bash
npm run lint          # ESLint（1件でも違反で失敗）
npm run typecheck     # tsc -b + tsconfig.node.json
npm run build         # typecheck + vite build（PWA）
npm run test          # vitest（tests/lib、200件超）
cd functions && npm run build   # Functions の tsc（lib/ を再生成）
npx tsc -p tsconfig.electron.json --noEmit          # Electron typecheck
npx vite build --config vite.electron.config.ts     # Electron バンドル（publish なし）
```

## 実行してはいけないコマンド（デプロイ・公開）

ユーザーの明示的な指示なしに以下を実行しない:

- `firebase deploy`（全種。--only hosting / functions / firestore:rules 含む）
- `functions/` の `npm run deploy`
- `npm run build:electron` の electron-builder で `--publish` を付けること、`GH_TOKEN` / `GITHUB_TOKEN` の設定
- GitHub Releases の作成・更新

公開手順は `.claude/skills/artics-chat-release/skill.md` を参照（特に latest.yml とファイル名の一致確認）。

`npm run build`（PWA）と `npm run build:electron` は同じ `dist/` に出力する。`build:electron` 後の `dist/` は `manifest.webmanifest` と生成 SW を持たない Electron 用バンドルなので、その状態で Hosting に出さない。
