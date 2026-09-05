# X Follow Review

Xのフォロー整理を、Xの画面内だけで完結させるChrome拡張です。

`https://x.com/<username>/following` に `Review Mode` を追加し、通常のFollowing一覧に近い一覧からユーザーを選ぶと、右側にその人の詳細情報を表示します。

## Review Mode

Review ModeではXの左ナビを残し、その右側をレビュー用ワークスペースとして使います。

- 左側: Following一覧
  - 名前 / @handle
  - ブックマーク件数
  - 所属リスト数
  - 検索
  - 独立スクロール
- 右側: 選択ユーザーの詳細
  - プロフィール
  - 最近の画像・動画
  - 自分がブックマークした投稿
  - 自分のX Listsと所属状態
  - リストへの追加 / 削除
  - フォロー解除
- Xのライト / Dim / Lights outテーマに追従

プロフィール上部の名前または `@handle` をクリックすると、その人のXプロフィールを新しいタブで開きます。

## データ取得方式

通常利用ではバックグラウンドタブを開きません。

X Web自身が使っている内部GraphQLを、現在開いているXページのセッション内から直接呼びます。

queryIdはXが現在行っているGraphQL通信とJavaScript bundleから実行時に発見し、見つからない場合だけ既知のqueryIdをフォールバックとして使用します。

認証用ヘッダーはX自身のGraphQL通信からページ内メモリへ取得し、認証値をextension storageへ保存しません。

## 取得順

Review Modeを開くと次のように動きます。

1. `Following` を最優先で取得
   - 取得できたユーザーから順次一覧へ反映
2. `Bookmarks` と自分のListsを並行同期
3. Lists取得後、各リストの `ListMembers` を一度ずつ取得
   - `userId -> 所属リスト一覧` の逆引きを作成
   - Following一覧に、クリック前からリスト数を表示
4. ユーザーを選択した時だけ、その人の `UserMedia` を取得
   - 全フォロー相手のMediaを最初から取得しない

ブックマークも全件同期後に著者ごとへ逆引きするため、Following一覧でクリック前から件数を確認できます。

## リスト取得・所属判定

自分のリスト一覧は `ListsManagementPageTimeline` から取得します。

全体の件数表示には各リストの `ListMembers` を一度ずつ取得して逆引きを作ります。個別詳細では、必要に応じて次の順で所属状態を確認します。

1. `ListsManagementPageTimeline` のmembership情報
2. `ListMemberships`
3. キャッシュ済み `ListMembers`

`ListMembers` の結果はページ内メモリにキャッシュするため、同じリストをユーザーごとに最初から走査しません。

## リスト操作

選択ユーザーの詳細画面に自分のリストをチェックボックスで表示します。

- ON: `ListAddMember`
- OFF: `ListRemoveMember`

をXのGraphQL mutationで直接実行します。

## フォロー解除

選択ユーザーの詳細画面からフォロー解除できます。確認ダイアログを挟んでから実行します。

## 構成

通常動作に必要なコードは役割ごとに集約しています。

- `review-ui.js`: Review ModeのUI、テーマ、レイアウト、スクロール管理
- `graphql-page.js`: Xページ内で動くGraphQL Adapter
- `graphql-client.js`: 同期の順序、キャッシュ更新、選択ユーザーの遅延取得
- `graphql-xhr.js`: XHRから現在のGraphQL認証情報をページ内メモリへ捕捉
- `actions-page.js`: フォロー解除などGraphQL外の操作
- `page-hook.js` / `bridge.js` / `background.js` / `probe.*`: 開発用GraphQL診断

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

Xの内部GraphQLは非公開仕様のため、operation名・variables・feature flags等は将来変更される可能性があります。
