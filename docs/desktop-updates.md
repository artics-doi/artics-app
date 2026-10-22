# Windows 版の更新配信

ArticsChat のデスクトップ版は、起動したときに「新しいインストーラーはどこにあるか」を自分で見に行きます。その住所は、アプリをビルドしたときに中へ書き込まれます。あとからサーバー側だけを変えても、すでに配ったアプリの住所は変わりません。

| 入っている版 | 見に行く場所 |
|---|---|
| v1.3.4 以前 | GitHub Releases（`artics-doi/artics-app`） |
| v1.3.6 以降 | `https://company-chat-a9cf0-updates.web.app/` |

v1.3.6 は、古いアプリがまだ届く GitHub Release と、これからの置き場である Firebase Hosting の両方に出します。v1.3.7 以降は Firebase だけで足ります。

この文書のコマンドは手順です。リポジトリを非公開にすること、Firebase への公開、GitHub Release の作成は、リリース担当者が別に行います。

## なぜ Web 版と同じサイトの `/updates/` に置かないか

Web 版（PWA）は `firebase.json` の Hosting で、`dist` フォルダをそのまま公開しています。ここへ更新ファイルを足すと、次の問題が起きます。

1. Hosting の公開は、フォルダの中身を全部入れ替えます。チャット画面の公開で更新ファイルを入れ忘れると、デスクトップの更新先が消えます。
2. 存在しない URL は `index.html` に戻す設定があります。更新情報のファイルが無いとき、アプリは HTML を更新情報として読んで失敗します。
3. インストーラーは大きいので、チャット画面を出すたびに一緒にアップロードすることになります。

同じ Firebase プロジェクトの中に、更新専用のサイトを分けます。Web 版の公開コマンドとは別です。専用サイトにはログインを付けません。リポジトリを非公開にしても、この URL を知っていれば更新ファイルを取れます。社外にインストーラーが届き得る点は、これまで公開リポジトリの Release に置いていたときと同じです。

住所は `electron-builder.json` の `publish.url` と `firebase.desktop-updates.json` の `hosting.site` で一致させます。サイト ID を変えたら、インストーラーを作り直してください。作ったあとのアプリには、古い住所が残ります。

## 初回だけ: 更新専用サイトを作る

Firebase のサイト ID は世界で1つです。長さは 4〜30 文字です。このリポジトリでは `company-chat-a9cf0-updates` にしています。

```bash
npx firebase login
npx firebase hosting:sites:create company-chat-a9cf0-updates --project company-chat-a9cf0
```

名前が既に使われていた場合は、`firebase.desktop-updates.json` の `site` と `electron-builder.json` の `url`（`https://<サイトID>.web.app/`）を同じ新しい ID に変えてから、インストーラーをビルドします。末尾の `/` は付けてください。

この作成は空のサイトを作るだけで、ファイルはまだ上がりません。

## v1.3.6 を出す

Windows で行います。インストーラーは Windows 用（NSIS、x64）です。electron-builder の Windows ターゲットは Windows 上で作る前提で、Linux から Wine でクロスビルドする手順はこのリポジトリでは使いません。Wine を足しても展開や署名で失敗しやすく、できた exe の更新先が generic であることを別途確認する必要があります。コマンドは Node.js 22 で動きます。Functions と同じ世代です。

ルール、プレビュー関数、Web 版 Hosting は、利用者へこの版を渡す前に出します。手順は [v1.3.6-backend.md](v1.3.6-backend.md) です。更新専用サイトの作成は、サイト ID が取れなかったときにインストーラーへ書き込む URL を変えるため、Windows ビルドより前です。

1. 依存関係を入れ、バージョンが `1.3.6` であることを `package.json` で確認する。

   ```bash
   npm ci
   ```

2. インストーラーを作る。`electron-builder` の provider は `generic` なので、このコマンドは GitHub へアップロードしません。`release/latest.yml` と exe、blockmap ができます。

   ```bash
   npm run build:electron
   ```

3. アプリに書き込まれた住所を確認する。`release/win-unpacked/resources/app-update.yml` が次のようになっていれば、このビルドは Firebase を見ます。

   ```yaml
   provider: generic
   url: https://company-chat-a9cf0-updates.web.app/
   useMultipleRangeRequest: false
   ```

   `provider: github` のままなら、そのインストーラーは非公開化のあと更新できません。ビルド設定を直して作り直します。`useMultipleRangeRequest: false` は、更新ファイルを一度に何箇所も取りに行かない設定です。Firebase Hosting ではその取り方が失敗しやすいので切っています。差分が取れないときは、インストーラー全体をダウンロードして更新します。

4. 配信するファイルを揃える。`latest.yml` のバージョンとファイル名が、隣にある実ファイルと `package.json` に一致しないときはここで止まります。

   ```bash
   npm run stage:desktop-updates
   ```

   `desktop-updates/` に `latest.yml`、`ArticsChat.Setup.1.3.6.exe`、`ArticsChat.Setup.1.3.6.exe.blockmap` がコピーされます。

5. **先に** Firebase へ公開する。v1.3.6 を起動した瞬間にこの URL を見に行くためです。公開スイッチは、コマンドを打ち間違えて上がるのを防ぐためのものです。

   PowerShell:

   ```powershell
   $env:ARTICS_DEPLOY_DESKTOP_UPDATES = '1'
   npm run publish:desktop-updates
   ```

   コマンドプロンプト:

   ```bat
   set ARTICS_DEPLOY_DESKTOP_UPDATES=1
   npm run publish:desktop-updates
   ```

   macOS や Linux のシェル:

   ```bash
   ARTICS_DEPLOY_DESKTOP_UPDATES=1 npm run publish:desktop-updates
   ```

   中で実行されるのは、更新専用の設定ファイルだけを対象にした次のコマンドです。Web 版の `dist` や Functions は含みません。

   ```bash
   npx firebase deploy --only hosting --config firebase.desktop-updates.json --project company-chat-a9cf0 --non-interactive
   ```

6. 認証なしで取れることを確認する。

   ```bash
   curl -fsS https://company-chat-a9cf0-updates.web.app/latest.yml
   curl -I https://company-chat-a9cf0-updates.web.app/ArticsChat.Setup.1.3.6.exe
   curl -I https://company-chat-a9cf0-updates.web.app/ArticsChat.Setup.1.3.6.exe.blockmap
   ```

   1つ目の応答本文の `version` が `1.3.6` であること。あとの2つは `HTTP/2 200`（または `HTTP/1.1 200`）であること。HTML が返ってきたら、ファイルが無いか、Web 版のサイトの方を見ています。

7. v1.3.6 の更新ノートは、公開時に管理者がアプリへ保存しました。v1.3.7 以降の正本は `src/data/releaseNotes.ts` です。設定タイトルの10回クリックによる編集画面はありません。新しい版を出すときは、このファイルの先頭に「日付：バージョン：見出し」と「・」の項目を足します。

8. **そのあと** GitHub Release を作る。タグは `v1.3.6`、下書きやプレリリースにはしません。載せるファイルは Firebase に置いた3つと同じものです。ファイル名は変えないでください。説明文は `docs/release-notes/v1.3.6-github.md` を使えます。

   ```bash
   gh release create v1.3.6 release/latest.yml release/ArticsChat.Setup.1.3.6.exe release/ArticsChat.Setup.1.3.6.exe.blockmap --title "v1.3.6" --notes-file docs/release-notes/v1.3.6-github.md --repo artics-doi/artics-app
   ```

9. v1.3.4 の端末でトレイアイコンを右クリックし、「アップデートを確認」を押す。v1.3.6 が入ったら、設定の「現在のバージョン」が v1.3.6 になること。もう一度確認すると「最新バージョンです」となり、失敗の赤文字が出ないこと。これで、新しいアプリが Firebase を読めています。

## リポジトリを非公開にしてよいとき

次が全部そろってからです。

- v1.3.6 の3ファイルが、上の Firebase URL で認証なしに取れる
- GitHub Release `v1.3.6` が下書きではない
- 更新を続けたい端末のバージョンが、すべて v1.3.6 以上である

バージョンは、各 PC の設定画面「現在のバージョン」、またはトレイメニューの「バージョン」で見ます。このアプリは端末の版をサーバーで集計していないので、人が確認します。電源が入っていない PC は、非公開にしたあと自動では更新できません。

非公開にすると、v1.3.4 以前は GitHub からインストーラーを取れなくなります。その PC には、ブラウザで次のファイルを保存して手作業でインストールします。

`https://company-chat-a9cf0-updates.web.app/ArticsChat.Setup.1.3.6.exe`

非公開にしてよいのは「もう GitHub を見に行く端末が残っていない」と分かったあとです。早めに閉じる判断は、残った端末を手作業で入れる覚悟とセットです。

## v1.3.7 を出す

関数、Web 版、Windows の更新ファイルを出します。GitHub Release は作りません。コマンドは [v1.3.7-backend.md](v1.3.7-backend.md) です。更新ノートは `src/data/releaseNotes.ts` に入っているので、Firestore へ貼り直す操作はありません。

## v1.3.8 以降

1. `package.json` のバージョンを上げ、`src/data/releaseNotes.ts` の先頭にその版の項目を足す
2. Windows で `npm run build:electron`
3. `npm run stage:desktop-updates`
4. 上と同じ公開スイッチを付けて `npm run publish:desktop-updates`
5. `curl` で `latest.yml` の `version` が新しい番号であることを確認する

画面や関数も変えた版は、その変更に必要な公開を更新ファイルより先に出します。v1.3.7 の例は [v1.3.7-backend.md](v1.3.7-backend.md) です。

GitHub Release は作りません。作ると、まだ v1.3.4 の端末がその版へ直接飛びます。そのビルドも Firebase を見るなら動きますが、Firebase への置き忘れがあると、その端末は次の更新を受け取れません。非公開のあとは GitHub Release のファイル自体が認証なしでは取れません。

ソースのタグを Git に残すことと、更新ファイルの置き場は別です。タグを打っても、Hosting にファイルを置くまでアプリは更新されません。

## やってはいけないこと

- `npm run build:electron` のあと、その `dist/` を Web 版として Hosting に出さない。Electron 用の中身になり、チャット画面の Service Worker が欠けます。
- 更新ファイルを `dist/updates/` にコピーして、Web 版と一緒に公開しない。
- `electron-builder --publish always` で GitHub へ出そうとしない。v1.3.6 以降の設定は generic なので、そこからはアップロードされません。v1.3.6 の GitHub Release は、上の `gh release create` でファイルを添付します。
- `.env` の値を手順やリリースノートに貼らない。
