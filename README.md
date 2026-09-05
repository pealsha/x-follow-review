# X Follow Review

Xのフォロー整理を、Xの画面内だけで完結させるChrome拡張です。

`https://x.com/<username>/following` に `Review Mode` を追加し、通常のFollowing一覧に近い一覧からユーザーを選ぶと、右側にその人の詳細情報を表示します。

## 現在のReview Mode

Review ModeではXの左ナビを残し、その右側をレビュー用ワークスペースとして使います。

- 左側: Following一覧
- 右側: 選択ユーザーの詳細
  - プロフィール
  - 最近の画像・動画
  - 自分がブックマークしたその人の投稿
  - 自分のX Listsと所属状態
  - リストへの追加 / 削除
  - フォロー解除
- Following一覧の検索
- Xのライト / Dim / Lights outテーマに追従

## データ取得方式

通常利用ではバックグラウンドタブを開きません。

X Web自身が使っている内部GraphQLを、現在開いているXページのセッション内から直接呼びます。

queryIdは固定せず、次の情報から実行時に発見します。

1. Xが現在行っているGraphQL通信
2. Xの現在のJavaScript bundle

認証用ヘッダーはX自身のGraphQL通信からページ内メモリへ取得し、認証値をextension storageへ保存しません。

## 取得順

Review Modeを開くと次の順で動きます。

1. `Following` を最優先でGraphQL取得
   - 1ページ目から順次一覧へ反映
   - 全件取得完了を待たずに操作可能
2. Followingの取得開始後、`Bookmarks` と自分のListsを並行同期
3. 一覧でユーザーを選択した時だけ、その人について
   - `UserMedia`
   - `ListOwnerships`による自分のListsへの所属状態
   を取得

そのため、全フォロー相手のMediaを最初から取得することはありません。

## リスト操作

選択ユーザーの詳細画面に自分のリストをチェックボックスで表示します。

- ON: `ListAddMember`
- OFF: `ListRemoveMember`

をXのGraphQL mutationで直接実行します。

## フォロー解除

選択ユーザーの詳細画面からフォロー解除できます。誤操作防止の確認を挟んでから実行します。

## インストール

最初の一度だけcloneします。

```powershell
git clone https://github.com/pealsha/x-follow-review.git
```

Chromeで:

1. `chrome://extensions/` を開く
2. 「デベロッパー モード」をON
3. 「パッケージ化されていない拡張機能を読み込む」
4. cloneした `x-follow-review` フォルダを選択
5. Xのタブを再読み込み

以後の更新は:

```powershell
cd C:\Users\perus\Documents\x-follow-review
git pull
```

その後、`chrome://extensions/` で拡張を再読み込みし、Xタブも再読み込みします。

## GraphQL診断機能

拡張機能アイコンを押すと、X Webが使用したGraphQL operation・queryId・レスポンス構造を確認する診断画面を開けます。

これは開発・X仕様変更時の調査用です。通常のReview Mode利用では手動でBookmarksやListsページを開く必要はありません。

## プライバシー上の挙動

- Authorizationヘッダー値を `chrome.storage` に保存しません
- Cookie本文を保存しません
- CSRFトークン値を保存しません
- Review Mode用の認証ヘッダーはページ内メモリだけで利用します
- 診断ログでは認証ヘッダーの存在有無のみ記録します
- Review用のFollowing / Bookmarks / Lists / Mediaキャッシュは `chrome.storage.local` に保存します

## 現在の段階

- Following一覧 + 詳細ペインUI: 実装済み
- Following GraphQL同期: 実装済み
- Bookmarks GraphQL同期: 実装済み
- Lists GraphQL同期: 実装済み
- 選択ユーザーのUserMedia取得: 実装済み
- 選択ユーザーのList所属確認: 実装済み
- ListAddMember / ListRemoveMember: 実装済み
- フォロー解除: 実装済み
- バックグラウンド同期タブ: 廃止

Xの内部GraphQLは非公開仕様のため、operation名・variables・feature flags等は将来変更される可能性があります。queryIdについては実行時発見で追従する設計です。
