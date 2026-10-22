# デスクトップ更新の配信フォルダ

このフォルダは、Windows 版 ArticsChat の更新ファイルを Firebase Hosting の更新専用サイトへ出す直前の置き場です。

`npm run stage:desktop-updates` が、`release/` にある次のファイルだけをここへコピーします。

- `latest.yml`（今のバージョンと、ダウンロードするファイル名）
- `ArticsChat.Setup.<version>.exe`（インストーラー）
- `ArticsChat.Setup.<version>.exe.blockmap`（差分更新用の地図）

インストーラーは大きいので Git には入れません。Web 版の `dist/` にも混ぜません。手順は [docs/desktop-updates.md](../docs/desktop-updates.md) です。
