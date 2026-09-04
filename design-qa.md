# ArticsChat 3カラムUI Design QA

## 比較対象

- Source visual truth（未選択）: `reports/design-qa/chat-empty-reference.png`
- Source visual truth（選択済み）: `reports/design-qa/chat-selected-reference.png`
- Implementation（未選択）: `reports/design-qa/chat-empty-implementation.png`
- Implementation（選択済み）: `reports/design-qa/chat-selected-implementation.png`
- Full-view comparison（未選択）: `reports/design-qa/chat-empty-comparison.png`
- Full-view comparison（選択済み）: `reports/design-qa/chat-selected-comparison.png`

## キャプチャ条件

- Viewport: 1690 x 930 CSS px
- Source pixels: 未選択 1690 x 929、選択済み 1690 x 929
- Implementation pixels: 1690 x 930
- Device scale factor: 1
- Density normalization: 不要。同一幅で比較し、1pxの高さ差だけを許容した
- Theme: dark
- State: ルーム未選択 / グループルーム選択済み
- Capture: Codex in-app Browser。認証による本番データ変更を避けるため、実装と同じコンポーネント・CSSを使うローカルQA表示へ現実的なモックデータを渡した

## Full-view comparison evidence

- 3カラムの境界は、左約424px、右約380pxで参照画像と一致した。
- 未選択画面は中央案内、2つの主要操作、最近のチャット、右側の概要を同じ順序と階層で表示した。
- 選択画面は中央のヘッダー・メッセージ・入力欄と、右側のメンバー・共有ファイル・ピン留めを同じ構成で表示した。
- 1690px、1280px、1024px、640pxで横方向のオーバーフローがないことをDOM寸法で確認した。

## Focused region evidence

- 左ペイン: 上段ツール、`＋ 新しいチャット`、3機能タブ、ルーム名・プレビュー・時刻・未読数を原寸で確認した。
- 右ペイン: 見出し、閉じる操作、メンバーのオンライン表示、ファイル、ピン留めのカード密度を原寸で確認した。
- 入力欄: 選択画面で参照画像と同程度の高さを確保し、既存の添付・本文・送信機能を保持した。

## Required fidelity surfaces

- Fonts and typography: Noto Sans JPを維持。見出し・本文・補助テキストの階層、太さ、折返し、ルームプレビューの省略を確認した。
- Spacing and layout rhythm: 3カラム幅、ヘッダー高、カード間隔、角丸、入力欄高を参照画像へ合わせた。永続操作が画面外へ隠れない。
- Colors and visual tokens: 既存のdarkテーマ変数を使い、濃紺背景、薄い境界線、シアンのアクティブ状態を一致させた。
- Image quality and asset fidelity: ユーザー画像は実データのURLを優先し、未設定時だけ既存の文字アバターを使う。未選択中央は既存のArticsブランド画像を低彩度で使用した。
- Copy and content: `チャット`、`行動予定表（Beta）`、`工程管理（Beta）`、案内文、概要、ルーム情報の日本語を確認した。

## Interaction evidence

- チャット概要を閉じる → `チャット概要を表示`で再表示: 成功
- ルーム情報を閉じる → ヘッダーの`情報`で再表示: 成功
- 最近のチャットを選択 → `/chat/environment`へ遷移: 成功
- Browser console: 新規表示でerror/warnなし

## Comparison history

### Iteration 1

- [P2] 左右ペインが参照より細く、未選択画面の最近のチャットが下がり過ぎていた。
  - Fix: 左を`clamp(330px, 25vw, 424px)`、右を340–380pxへ変更し、案内領域の高さを固定して最近のチャット位置を揃えた。
- [P2] 選択画面のヘッダー・入力欄・右カードが参照より低密度だった。
  - Fix: ヘッダーを92px、入力欄を138pxへ調整し、右カードの最小高を増やした。

### Iteration 2

- Post-fix evidence: `chat-empty-comparison.png` / `chat-selected-comparison.png`
- P0/P1/P2: なし
- [P3] 参照の吹き出し装飾は、製品内の既存Articsブランド画像に置き換えた。機能・階層・視認性への影響はない。
- [P3] QAデータのプロフィール画像は文字アバターだが、実画面では保存済みプロフィール画像を優先表示する。

## Residual test gap

- 認証済みの実Firestoreデータを使ったローカル画面キャプチャは、ユーザーのログイン情報を扱わずに検証するため実施していない。表示コンポーネント、CSS、ナビゲーション操作、ビルドは同一コードで検証した。

## 追加検証: 左カラム境界リサイズ（2026-08-18）

### 比較対象

- Source visual truth: `reports/design-qa/chat-resizer-source.png`
- Implementation: `reports/design-qa/chat-resizer-implementation.png`
- Comparison: `reports/design-qa/chat-resizer-comparison.png`（上段が参照、下段が実装）

### キャプチャ条件

- Source original pixels: 134 x 1024
- Source normalized pixels: 134 x 943（実装と同じ高さへ上端基準で切り出し）
- Electron window: 1586 x 943 logical px
- Implementation comparison crop: 134 x 943
- Device scale factor: Windows Graphics Captureのlogical pixel基準、追加拡大縮小なし
- Theme: dark
- State: グループルーム選択済み、右情報ペイン表示、左ペイン359px
- Capture: 実際の認証済みElectron開発画面。参照画像自体が境界部分の切り出しのため、同じ134px幅の境界領域を比較対象とした

### Full-view / focused comparison evidence

- Electron全体表示で、左ルーム一覧・中央チャット・右ルーム情報が横方向にはみ出さず、リサイズ後も3カラム構造を維持した。
- 境界のfocused comparisonでは、通常時は参照と同じ細い1px線、ドラッグ中は操作位置が分かるシアンの3px線を表示した。
- 左ペイン側と中央ペイン側に重複していた境界線を除去し、通常時の二重線を解消した。
- 参照と実装で表示内容は異なるが、評価対象である境界位置、線の太さ、暗色背景とのコントラスト、スクロール領域の独立性は一致している。

### Required fidelity surfaces

- Fonts and typography: リサイズにより既存のNoto Sans JP、文字サイズ、ウェイト、ルーム名・プレビューの省略規則は変化しない。
- Spacing and layout rhythm: 8pxの操作領域内に1px境界線を配置し、見た目を細く保ちながらドラッグしやすい当たり判定を確保した。
- Colors and visual tokens: 通常線は既存境界色、hover・focus・drag中は既存アクセント色を使用した。
- Image quality and asset fidelity: 新しい画像資産は不要。参照画像内の既存プロフィール画像・カード表現は変更していない。
- Copy and content: ハンドルの見た目に文字を追加せず、アクセシブル名とツールチップだけを追加した。

### Interaction evidence

- 実際のElectron画面で左ペインを488pxから359pxへドラッグ: 成功
- `Ctrl+R`で再読み込み後も359pxを保持: 成功
- グループルーム選択状態でも中央チャット・右情報ペインが維持される: 成功
- 画面が狭い場合の最大幅制限、260pxの最小幅、520pxの上限: 純ロジックテストで確認

### Comparison history

#### Iteration 1

- [P2] ドラッグハンドルの線と中央ペインの既存左ボーダーが並び、境界が二重に見えた。
  - Fix: `chatMainPane`と`desktopLandingMain`の左ボーダーを外し、ドラッグハンドルの1px線へ統一した。

#### Iteration 2

- Post-fix evidence: `reports/design-qa/chat-resizer-comparison.png`
- P0/P1/P2: なし
- [P3] ドラッグ中の3px強調線は操作性を優先した意図的な追加で、通常時は参照と同じ細線に戻る。

final result: passed

---

# 工程管理 統合チャットサイドバー Design QA（2026-08-18）

## 比較対象

- Source visual truth: `C:/Users/info/AppData/Local/Temp/codex-clipboard-299f68eb-cd2b-4b1a-81cc-2eaeb14e4a06.png`
- Implementation screenshot: 未取得（認証済み画面のキャプチャ待ち）

## キャプチャ条件

- Source pixels: 1716 x 917
- Intended implementation viewport: 1716 x 917 CSS px
- Device scale factor: 1を予定
- Density normalization: 実装画像未取得のため未実施
- Theme: dark
- State: `/process` ダッシュボード、チャットルーム未選択

## Full-view comparison evidence

- 参照画像は、検索・メモ・設定、新しいチャット、3機能タブ、工程管理メニュー、チャット一覧を1つの左ペインに統合している。
- 実装は同じ情報順序と、共通の保存済み左ペイン幅・8pxリサイズ境界を採用した。
- Electron用Viteビルド、型チェック、Lint、全300単体テストは成功した。
- in-app Browserのローカル表示は認証画面へリダイレクトされ、工程管理画面の実装スクリーンショットを取得できなかった。

## Focused region comparison evidence

- 未取得。認証済みElectron画面で、左ペイン上段、工程管理ナビ、チャット一覧、境界、ダッシュボード先頭領域を同じ縮尺で確認する必要がある。

## Required fidelity surfaces

- Fonts and typography: 既存のNoto Sans JPと工程管理の文字トークンを継続使用。実画面で折返しと省略表示の確認が必要。
- Spacing and layout rhythm: モックと同じ3段構成の左ペインを実装。1716 x 917での実測比較は未実施。
- Colors and visual tokens: 既存のdarkテーマ変数、境界色、シアンのアクティブ色を使用。実画像との比較は未実施。
- Image quality and asset fidelity: ルーム画像URLを優先し、未設定時は既存の文字アバターを使用。実データ画像の描画確認が必要。
- Copy and content: `チャット`、`行動予定表（Beta）`、`工程管理（Beta）`、工程管理5メニュー、ルーム名・本文・時刻・未読を実装した。

## Findings

- [P2] 実装スクリーンショットがなく、モックとの同一状態比較を完了できない。
  - Location: `/process` の統合サイドバーとダッシュボード全体。
  - Evidence: ローカルURLはFirebase認証により `#/login` へ遷移した。
  - Impact: 左ペインの実データ密度、最終幅、縦スクロール、ダッシュボードの可読幅を視覚的に保証できない。
  - Fix: 認証済みElectron開発画面のスクリーンショットを1716 x 917相当で取得し、参照画像と1枚の比較画像にして再評価する。

## Comparison history

- Iteration 1: 実装・自動検証まで完了。認証済み実装画像がないため視覚比較を開始できず、結果をblockedとした。

final result: blocked

---

# 左チャット枠 最大幅拡張 Design QA（2026-08-18）

## 比較対象

- Source visual truth: `C:/Users/info/AppData/Local/Temp/codex-clipboard-f30f86d0-230f-428a-acfb-5d19ad436a7e.png`
- Implementation screenshot: 未取得
- State: 行動予定表を表示し、左チャット枠をドラッグで拡幅

## Full-view / focused comparison evidence

- 提供画像では左チャット枠が既存の最大幅に達しており、メッセージ本文をさらに広く表示できない。
- 共通リサイズ処理の最大幅を520pxから760pxへ拡張し、チャット・行動予定表・工程管理の3画面へ同じ上限を適用した。
- 狭いウィンドウでは中央画面を最低360px残す既存制約を維持するため、画面外へ押し出さない。

## Findings

- [P2] 修正後の認証済みElectron画面を同一状態で取得していない。
  - Impact: 実データを表示した最大760px時の文章密度と予定表の残存幅を視覚的に保証できない。
  - Fix: 起動中のElectron開発版で境界を右へドラッグし、チャット・行動予定表・工程管理の最大幅が共通で広がることを手動確認する。

## Comparison history

- Iteration 1: 最大幅を520pxから760pxへ拡張。Lint、型チェック、Web/Electronビルド、302単体テストは成功。ユーザー指定によりComputer Useを使用せず、修正後の実装画像がないため視覚比較はblocked。

final result: blocked

---

# 予定表・工程管理 枠内チャット Design QA（2026-08-18）

## 比較対象

- Source visual truth（予定表）: `C:/Users/info/.codex/generated_images/019f8d20-c189-7e03-830e-8e54cb974742/exec-26438e1e-da40-430b-8841-09f6e645feaf.png`
- Source visual truth（工程管理）: `C:/Users/info/.codex/generated_images/019f8d20-c189-7e03-830e-8e54cb974742/exec-43f6fdc2-e8f0-4c7a-b006-5180dd02d716.png`
- Source visual truth（拡幅状態）: `C:/Users/info/.codex/generated_images/019f8d20-c189-7e03-830e-8e54cb974742/exec-7dfe9659-1a2c-4f50-a0ce-e36a733f3bc2.png`
- Implementation screenshot: 未取得

## キャプチャ条件

- Intended viewport: 1920 x 1024 CSS px（予定表・拡幅状態）、1716 x 917 CSS px（工程管理）
- Theme: dark
- State: 行動予定表または工程管理を表示したまま、左ペイン内でルームを選択済み
- Electron development runtime: port 5173、HTTP 200、`Articsチャット`ウィンドウ起動を確認

## Full-view / focused comparison evidence

- 実装は、予定表と工程管理のルーム行を`/chat/:roomId`遷移から左ペイン内の選択状態へ変更した。
- 埋め込み表示は既存チャット本体を再利用し、ルーム見出し、メッセージ購読、返信、添付保留、送信、一覧へ戻る操作を左ペイン内に限定した。
- `チャット`タブは従来どおり`/chat`へ遷移し、全画面チャットの3カラム表示を維持した。
- 左ペイン幅は3画面共通の保存キーとリサイズhookを継続使用する。
- ユーザー指定によりComputer Useを使わず、認証済み実画面の自動操作・同一状態スクリーンショット比較は実施していない。

## Required fidelity surfaces

- Fonts and typography: 既存のNoto Sans JPとチャット本文の階層を再利用。実画面で狭幅時の折返し確認が必要。
- Spacing and layout rhythm: 62pxのコンパクトヘッダー、縮小した入力欄、最大92%の吹き出し幅を追加。実画像比較は未実施。
- Colors and visual tokens: 既存のdarkテーマ変数、境界色、アクセント色を使用。
- Image quality and asset fidelity: 既存のプロフィール画像URLとメッセージ添付表示をそのまま再利用し、新しい代替画像は追加していない。
- Copy and content: `← チャット一覧`、ルーム名、オンライン状態またはメンバー数、既存の入力・送信文言を表示する。

## Findings

- [P2] 認証済みの予定表・工程管理で、枠内チャットを開いた同一状態の実装スクリーンショットがない。
  - Location: `Schedule` / `ProcessLayout`内の埋め込み`Chat`。
  - Impact: 実データ量での縦密度、260px最小幅から760px最大幅までの見た目、モックとの最終差を視覚的に保証できない。
  - Fix: 起動済みElectron開発画面で、予定表と工程管理から各1ルームを開き、一覧へ戻る・送信欄・境界リサイズを手動確認する。

- [resolved P1] デスクトップ幅の埋め込みチャットで戻る操作が表示されなかった。
  - Location: 埋め込み`Chat`のヘッダー左端。
  - Evidence: デスクトップ用`.chatMainPane > .header .backButton { display: none; }`が、埋め込み用指定より高い詳細度で適用されていた。
  - Fix: 埋め込みヘッダーでは同等以上の詳細度で`display: inline-flex`を指定し、操作名を`← チャット一覧`へ明確化した。クリック時は親画面を維持して左ペインだけ一覧へ戻る。

## Comparison history

- Iteration 1: 実装、型、Lint、Web/Electronビルド、301単体テストまで完了。Computer Useを使わない条件のため視覚比較はblocked。
- Iteration 2: ユーザー提供の実装画像で戻る導線欠落を確認。CSS詳細度を修正し、戻る操作の表示回帰テストを追加。型、Lint、Web/Electronビルド、302単体テストは成功。修正後の認証済み実画面画像は未取得のため視覚比較は引き続きblocked。

final result: blocked

---

# Electron狭幅 ワークスペース自動拡張 Design QA（2026-08-18）

## 比較対象

- Source visual truth: `C:/Users/info/AppData/Local/Temp/codex-clipboard-279c36a9-fa3f-4a52-8d98-e2232e9486a0.png`
- Source pixels: 420 x 956
- Implementation screenshot: 未取得
- State: Electronを狭幅にしたチャット一覧から、行動予定表または工程管理を選択

## Full-view / focused comparison evidence

- 参照画像では約420px幅のElectron専用チャット一覧に3機能ボタンが表示されている。
- 狭幅時のみ予定表・工程管理ボタンへ`画面を広げて開きます`を追加し、1200pxまたはディスプレイ内に収まる最大幅へ広げてから遷移するよう変更した。
- 実装後の認証済みElectron画像は取得していないため、同一状態の画像比較は未実施。

## Required fidelity surfaces

- Fonts and typography: 既存ボタンの書体・太さを維持し、補足は9px・中太字で追加。実画面での可読性確認が必要。
- Spacing and layout rhythm: 狭幅時だけ機能ボタンを58px高へ揃え、補足を2段目へ配置。実画像比較は未実施。
- Colors and visual tokens: 既存のアクセント色と文字色を継続使用。
- Image quality and asset fidelity: 新規画像・アイコンは追加していない。
- Copy and content: 行動予定表・工程管理に限り、狭幅時だけ`画面を広げて開きます`を表示する。

## Findings

- [P2] 自動拡張後の画面遷移を実画面で確認できていない。
  - Impact: Windowsの実ディスプレイ環境で、拡張アニメーション、補足文の折返し、予定表・工程管理への遷移完了を視覚的に保証できない。
  - Fix: 起動中のElectron開発版を420px付近まで縮め、両ボタンで1200px付近へ拡張して目的画面が開くことを手動確認する。

## Comparison history

- Iteration 1: IPCによる安全なウィンドウ拡張、狭幅限定の補足表示、幅変更待機後の遷移を実装。Lint、型、Web/Electronビルド、307単体テストは成功。Computer Useを使用しない条件のため視覚比較はblocked。

final result: blocked
