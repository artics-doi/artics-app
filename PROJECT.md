# Toast導入対応（2026-02-09）

## 変更ファイル一覧
- `src/contexts/ToastContext.tsx`
- `src/components/Toast.tsx`
- `src/components/Toast.module.css`
- `src/App.tsx`
- `src/pages/Chat.tsx`
- `src/pages/Home.tsx`
- `src/pages/Chat.module.css`
- `PROJECT.md`

## 変更概要
- `ToastContext`を新規作成し、`success`/`error`/`warning`対応の`showToast()`と`useToast`フックを実装。
- トースト描画用の`Toast.tsx` + `Toast.module.css`を新規作成。
  - 画面下部`position: fixed`、`z-index: 9999`で複数トーストを積み上げ表示。
  - 種別ごとに配色を分離。
- `App.tsx`で`ToastProvider`を追加。
  - 配置は`AuthProvider`内、`HashRouter`外。
- `Chat.tsx`
  - `alert()` 8箇所を`showToast()`に置換。
  - `copyFeedback`関連state・タイマー・JSX表示を削除し、`showToast('success', 'コピーしました')`へ統合。
  - `confirm()`によるメッセージ削除確認を廃止し、`showDeleteConfirmMessage` state + `ConfirmModal`に置換。
- `Home.tsx`
  - `alert()` 14箇所を`showToast()`に置換。
- 不要化した`copyToast`スタイルを`Chat.module.css`から削除。

## 設計判断の理由
- 通知は画面横断の関心事のため、ローカルstateではなくContextで一元管理した。
- 表示時間はアプリ全体で揃えるため、`TOAST_DURATION`を`ToastContext`のデフォルト表示時間として使用した。
- 複数トースト同時表示が要件のため、単一メッセージ上書きではなく配列管理（キュー）を採用した。
- 削除確認はブラウザ標準`confirm()`の同期ブロックUIを避け、既存の`ConfirmModal`で統一して操作体験を揃えた。

# モーダルアクセシビリティ対応（2026-02-09）

## 変更ファイル一覧
- `src/hooks/useModal.ts`
- `src/components/home/modals/SettingsModal.tsx`
- `src/components/home/modals/ThemeModal.tsx`
- `src/components/home/modals/ProfileEditModal.tsx`
- `src/components/home/modals/NotificationSettingsModal.tsx`
- `src/components/home/modals/ReleaseNotesModal.tsx`
- `src/components/home/modals/ReleaseNotesEditModal.tsx`
- `src/components/home/modals/StorageEditModal.tsx`
- `src/components/home/modals/SearchModal.tsx`
- `src/components/home/modals/NewChatModal.tsx`
- `src/components/home/modals/NewGroupModal.tsx`
- `src/components/home/modals/InviteMemberModal.tsx`
- `src/components/home/modals/DeleteRoomConfirmModal.tsx`
- `src/components/home/modals/UsersListModal.tsx`
- `src/components/home/modals/UserManagementModal.tsx`
- `src/components/home/modals/UserEditModal.tsx`
- `src/components/home/modals/DeleteUserConfirmModal.tsx`
- `src/components/modals/ConfirmModal.tsx`
- `src/components/modals/ReadDetailModal.tsx`
- `src/components/modals/ReactionDetailModal.tsx`
- `src/components/ImagePreviewModal.tsx`
- `src/pages/Chat.tsx`
- `src/pages/Home.tsx`
- `PROJECT.md`

## 変更概要
- `useModal` フックを新規作成し、以下を共通化した。
  - `Escape` キーで `onClose` 呼び出し
  - `Tab`/`Shift+Tab` のフォーカストラップ循環
  - `isOpen` 時の `document.body.style.overflow = 'hidden'`
  - `modalProps`（`{ ref, role: 'dialog', 'aria-modal': true, tabIndex: -1 }`）返却
- `src/components/home/modals/` 配下の16モーダルすべてに `useModal` を適用し、オーバーレイ `div` へ `modalProps` をスプレッド、`h2` に `id` を付与して `aria-labelledby` で関連付けた。
- `src/components/modals/ConfirmModal.tsx`、`src/components/modals/ReadDetailModal.tsx`、`src/components/modals/ReactionDetailModal.tsx` に `useModal` を適用した。
- `src/components/ImagePreviewModal.tsx` に `useModal` を適用し、既存の `Escape`/`body overflow` 管理は削除（`+`/`-`/`0` のズームショートカットは維持）。
- `Chat.tsx` と `Home.tsx` のアイコンボタン（戻る、メンバー一覧、編集、招待、通知トグル、ファイル添付、お気に入り、削除、検索、設定など）に `aria-label` を追加した。

## 設計判断の理由
- モーダルのキーボード操作と背景スクロール制御を各コンポーネントで重複実装すると差異が出るため、`useModal` に集約して挙動を統一した。
- フォーカストラップはモーダル外へのフォーカス逸脱を防ぎ、`Escape` クローズと合わせてキーボード操作の一貫性を担保するために実装した。
- タイトル参照を `aria-labelledby` で統一し、スクリーンリーダーがモーダルの文脈を把握しやすい構成にした。
- `SearchModal` は閉じる際に検索クエリ初期化が必要なため、`useModal` の `onClose` には `handleClose` を渡して既存仕様を維持した。
- `ImagePreviewModal` は既存ショートカット操作を保持しつつ、モーダル共通責務（`Escape` と `overflow`）のみ `useModal` に移譲して責務分離した。

# 共通フック/ユーティリティ導入対応（2026-02-09）

## 変更ファイル一覧
- `src/hooks/useUsers.ts`
- `src/hooks/useInviteMembers.ts`
- `src/utils/room.ts`
- `src/utils/image.ts`
- `src/pages/Chat.tsx`
- `src/pages/Home.tsx`
- `PROJECT.md`

## 変更概要
- `src/hooks/useUsers.ts` を新規作成し、`useAuth()` の `currentUser` を使って Firestore `users` コレクション（`collection(db, 'users')` + `getDocs`）から一覧取得する `fetchUsers()` と `users` state を共通化。
- `src/utils/room.ts` を新規作成し、`getRoomDisplayName(room, currentUserId)` を実装。
  - `room.type === 'direct'` の場合は `memberDetails` から相手名を返却。
  - `room.type === 'group'` の場合は `room.name` を返却。
- `src/hooks/useInviteMembers.ts` を新規作成し、`selectedUsers` state、`getInvitableUsers(room, allUsers)`、`inviteMembers(roomId, room)` を共通化。
  - 招待反映は Firestore の `arrayUnion` と `updateDoc` で実装し、`memberDetails` と `updatedAt` も更新。
- `src/utils/image.ts` を新規作成し、`handleGroupImageChange(file): Promise<string>` を実装。
  - `FileReader.readAsDataURL()` による Base64 変換を共通化。
- `src/pages/Chat.tsx` / `src/pages/Home.tsx` の重複関数を削除し、上記フック/ユーティリティを利用する構成に変更。
  - 既存挙動維持のため、`Chat.tsx` では招待成功後にローカル `chatRoom` state も更新。
  - `Home.tsx` では既存モーダル操作フローを維持したまま、招待処理を新フックに委譲。

## 設計判断の理由
- 同一責務（ユーザー取得、ルーム表示名決定、メンバー招待、グループ画像の Base64 変換）が `Chat.tsx` と `Home.tsx` に分散していたため、重複実装による修正漏れリスクを下げる目的で責務別に分離した。
- `useInviteMembers` は Firestore 更新ロジックを一元化し、呼び出し側は UI 状態遷移（モーダル表示/非表示など）に集中できるようにした。
- `getRoomDisplayName` を純粋関数化することで、検索結果表示と一覧表示、チャットヘッダー表示で同一ルールを再利用できるようにした。
- `handleGroupImageChange(file)` を Promise 化して `FileReader` の非同期処理を統一し、`Chat` と `Home` の画像選択処理を同じエラーハンドリング方針で扱えるようにした。

# Chatモーダル分離とHomeモーダル状態管理統合（2026-02-09）

## 変更ファイル一覧
- `src/components/chat/modals/GroupEditModal.tsx`
- `src/components/chat/modals/MemberListModal.tsx`
- `src/components/chat/modals/index.ts`
- `src/components/chat/index.ts`
- `src/hooks/useHomeModals.ts`
- `src/pages/Chat.tsx`
- `src/pages/Home.tsx`
- `PROJECT.md`

## 変更概要
- `src/components/chat/modals/GroupEditModal.tsx` を新規作成し、`Chat.tsx` にあったグループ編集モーダルの JSX と保存処理を移設。
  - `useModal` を適用し、`aria-labelledby="group-edit-modal-title"` を追加。
  - `roomId` / `chatRoom` / `onClose` / `onSaved` を受け取り、保存後に親へ更新結果を返す構成にした。
- `src/components/chat/modals/MemberListModal.tsx` を新規作成し、`Chat.tsx` のメンバー一覧モーダル JSX を移設。
  - `useModal` を適用し、`aria-labelledby="member-list-modal-title"` を追加。
  - `chatRoom` / `currentUserId` / `onClose` を受け取る構成にした。
- `src/components/chat/modals/index.ts` を新規作成してモーダルをバレルエクスポート。
- `src/components/chat/index.ts` に `./modals` のエクスポートを追加。
- `src/hooks/useHomeModals.ts` を新規作成し、`Home.tsx` の15個の `showXxx` を `useReducer` で一元管理。
  - `openModal(name)` / `closeModal(name)` / `closeAll()` を型安全 (`HomeModalName`) に提供。
- `src/pages/Chat.tsx`
  - インラインのグループ編集モーダル JSX とメンバー一覧モーダル JSX を削除。
  - `GroupEditModal` / `MemberListModal` を import して表示委譲。
  - 既存の `showGroupEdit` / `editGroupName` / `editGroupImage` / `savingGroup` / `showMemberList` state は維持し、モーダル props 経由で利用。
- `src/pages/Home.tsx`
  - `useHomeModals` を導入。
  - `showXxx` / `setShowXxx` の個別 state 操作を `modals.showXxx` / `openModal('showXxx')` / `closeModal('showXxx')` に置換。

## 設計判断の理由
- `Chat.tsx` のモーダル JSX を分離して責務を明確化し、チャット本体ロジックとモーダル UI/保存処理の結合を下げた。
- `GroupEditModal` / `MemberListModal` に `useModal` と `aria-labelledby` を適用し、既存モーダル群と同じアクセシビリティ基準へ揃えた。
- `Home.tsx` の多数の boolean state は増減時に変更漏れが起きやすいため、`useReducer` で統一的に開閉管理する構成へ変更した。
- `HomeModalName` を `keyof` から導出することで、存在しないモーダル名の dispatch を型レベルで防止した。

# 検索処理のデバウンス・件数制限対応（2026-02-09）

## 変更ファイル一覧
- `src/constants/index.ts`
- `src/pages/Home.tsx`
- `src/components/home/modals/SearchModal.tsx`
- `PROJECT.md`

## 変更概要
- `src/constants/index.ts` に検索関連定数を追加。
  - `SEARCH_DEBOUNCE_MS = 500`
  - `SEARCH_LIMIT_PER_ROOM = 100`
  - `SEARCH_RESULTS_LIMIT = 50`
- `src/pages/Home.tsx` の `searchMessages` を改修。
  - 各ルームのメッセージ取得を `query(collection(...), orderBy('createdAt', 'desc'), limit(SEARCH_LIMIT_PER_ROOM))` に変更。
  - 検索結果を新しい順にソート後、`SEARCH_RESULTS_LIMIT` 件に制限。
  - 失敗時に `showToast('error', '検索に失敗しました')` を表示。
  - 必要な import（`orderBy`, `limit`, 検索定数）を追加。
- `src/components/home/modals/SearchModal.tsx` にデバウンス検索を追加。
  - `searchQuery` 変更時、`SEARCH_DEBOUNCE_MS` 後に自動で `onSearch()` を実行。
  - `setTimeout` / `clearTimeout` でデバウンス。
  - 既存の Enter キー検索は維持。

## 設計判断の理由
- ルームごとの取得に `orderBy + limit` を適用し、全件走査を避けて検索時の Firestore 読み取り負荷と待ち時間を抑える構成にした。
- 最終表示件数を上限化し、検索結果描画コストとモーダル内での可読性を一定に保つようにした。
- デバウンス自動検索をモーダル側に実装することで、入力体験を改善しつつ既存の明示検索（Enter/検索ボタン）操作を壊さないようにした。

# グループ退出機能追加（2026-02-09）

## 変更ファイル一覧
- `src/pages/Chat.tsx`
- `src/components/chat/modals/MemberListModal.tsx`
- `PROJECT.md`

## 変更概要
- `src/pages/Chat.tsx`
  - `showLeaveConfirm` state（初期値 `false`）を追加。
  - `leaveRoom` を追加し、`chatRoom.type === 'direct'` の場合は即時 return。
  - 退出時に `updateDoc` で `members: arrayRemove(currentUser.uid)` と `memberDetails` の当該UIDキー削除（`deleteField()`）を同時に実行。
  - 退出後の残りメンバー数が1人以下の場合、`getDocs(collection(..., 'messages'))` で取得した全メッセージを `writeBatch` で削除してから `deleteDoc` でルーム本体を削除。
  - 成功時は `navigate('/')` と `showToast('success', 'グループから退出しました')`、失敗時は `showToast('error', '退出に失敗しました')` を実装。
  - `MemberListModal` に `onLeave` を渡し、クリック時にメンバー一覧を閉じて退出確認モーダルを開くようにした。
  - 退出確認に `ConfirmModal` を追加（`title='グループを退出'`、`message='このグループから退出しますか？退出すると再招待されるまでメッセージを確認できなくなります。'`、`isDestructive`、`onConfirm=leaveRoom`、`onCancel` で `showLeaveConfirm` を閉じる）。
- `src/components/chat/modals/MemberListModal.tsx`
  - `onLeave?: () => void` props を追加。
  - `chatRoom.type === 'group'` かつ `onLeave` が渡された場合のみ「グループを退出」ボタンを表示し、クリック時に `onLeave` を呼び出すようにした。

## 設計判断の理由
- 退出確認は既存の `ConfirmModal` に統一し、破壊的操作の UX を既存削除操作と同じ操作体系に揃えた。
- メンバー削除と `memberDetails` 削除を同時に実行し、`members` 配列と詳細マップの整合性が崩れないようにした。
- 残りメンバーが1人以下のときにメッセージ削除後ルーム削除を行うことで、実質利用不能なグループのデータを残さない設計にした。

# プロフィール変更のmemberDetails同期対応（2026-02-09）

## 変更ファイル一覧
- `src/pages/Home.tsx`
- `functions/src/index.ts`
- `PROJECT.md`

## 変更概要
- `src/pages/Home.tsx`
  - `firebase/firestore` の import に `writeBatch` を追加（`query` / `where` は既存利用を継続）。
  - `saveProfile()` 内で `users/{uid}` 更新後に `query(collection(db, 'chatRooms'), where('members', 'array-contains', currentUser.uid))` を実行し、参加中ルームの `memberDetails.{uid}.displayName` / `memberDetails.{uid}.photoURL` を `writeBatch()` で更新する処理を追加。
  - ルーム反映だけ失敗した場合は `showToast('warning', 'プロフィールは更新されましたが一部のチャットルームへの反映に失敗しました')` を表示し、成功時は既存の `showToast('success', 'プロフィールを更新しました')` を維持。
- `functions/src/index.ts`
  - `firebase-functions/v2/firestore` から `onDocumentUpdated` を追加 import。
  - `syncMemberDetailsOnProfileUpdate` を追加し、`users/{userId}` 更新時に `displayName` または `photoURL` が変わった場合のみ、`chatRooms` の `members array-contains userId` 条件で参加ルームを取得して `memberDetails` をバッチ更新。
  - 変更がない更新イベントは早期 return。

## 設計判断の理由
- プロフィール本体（Auth / users）更新は成功しているのにチャットルーム反映のみ失敗したケースを区別するため、`saveProfile()` 内で反映処理を分離して warning 通知にした。
- クライアント更新時の即時反映（Home）に加え、Cloud Functions 側でも同期処理を実装し、管理画面や他クライアント経由で `users/{userId}` が更新された場合でも `memberDetails` の整合性を維持できるようにした。
- Firestore のバッチ書き込み上限（500件）を超える可能性を考慮し、ルーム更新は 500 件単位の複数バッチで全件反映する構成にした。

# 入力中インジケーター対応（2026-02-09）

## 変更ファイル一覧
- `src/hooks/useTypingIndicator.ts`
- `src/components/chat/TypingIndicator.tsx`
- `src/components/chat/TypingIndicator.module.css`
- `src/types/index.ts`
- `src/pages/Chat.tsx`
- `src/components/chat/index.ts`
- `PROJECT.md`

## 変更概要
- `src/hooks/useTypingIndicator.ts` を新規作成し、`TYPING_TIMEOUT = 5000` を定義。
  - `setTyping()` は `isTypingRef` が `false` のときのみ `updateDoc` で `typing.{uid}: serverTimestamp()` を書き込み。
  - 入力継続時は Firestore 再書き込みをせず、タイマーだけを再設定してタイムアウトを延長。
  - タイムアウト時と `clearTyping()` 実行時に `deleteField()` で `typing.{uid}` を即時削除。
  - `useEffect` cleanup で `clearTyping()` を呼び、アンマウント/ルーム切替時の残留を防止。
- `src/components/chat/TypingIndicator.tsx` と `TypingIndicator.module.css` を新規作成。
  - `typing` から `currentUserUid` 以外の UID を抽出し、`memberDetails` の表示名へ変換。
  - `Timestamp.toMillis()` で現在時刻との差分を判定し、5秒超過エントリを除外。
  - 1人時は `〇〇が入力中...`、複数人時は `〇〇、△△が入力中...` を表示。
  - 3点ドットのアニメーションを追加し、`min-height` 固定で表示有無によるレイアウトシフトを抑制。
- `src/types/index.ts` の `ChatRoom` に `typing?: Record<string, import('firebase/firestore').Timestamp>` を追加。
- `src/pages/Chat.tsx`
  - ルーム取得を `getDoc` 単発取得から `onSnapshot` に変更し、`typing` を含むルーム情報をリアルタイム購読。
  - `handleMessageChange` で `setTyping()` を呼び出し、入力が空になった場合は `clearTyping()` を呼び出し。
  - `sendMessage()` 成功時に `clearTyping()` を実行。
  - 入力エリア直上に `TypingIndicator` を配置（`chatRoom.typing` / `chatRoom.memberDetails` / `currentUser.uid` を渡す）。
- `src/components/chat/index.ts` に `TypingIndicator` のエクスポートを追加。

## 設計判断の理由
- 入力中状態はキーストロークごとに Firestore 書き込みするとコストが高いため、「初回のみ書き込み + タイマー延長」で書き込み頻度を抑えた。
- タイムアウト判定を表示側でも実施し、クライアント切断や通信遅延で削除更新が遅れた場合でも古い入力中表示が残りにくい構成にした。
- ルーム購読を `onSnapshot` に統一し、`typing` だけでなく将来のルームメタデータ更新にも同じリアルタイム経路で追従できるようにした。
