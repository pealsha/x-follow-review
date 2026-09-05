# X Follow Review

Xのフォロー整理を、Xの画面内だけで完結させるChrome拡張です。

`https://x.com/<username>/following` に `Review Mode` を追加し、通常のFollowing一覧に近い一覧からユーザーを選ぶと、右側にその人の詳細情報を表示します。

## Review Mode

Review ModeではXの左ナビを残し、その右側をレビュー用ワークスペースとして使います。

- 左側: Following一覧
  - 名前 / @handle
  - ブックマーク件数
  - 所属リスト数
  - 相手が自分をフォローしているか（フォローされています / 被フォローなし）
  - 検索
  - 独立スクロール
- 右側: 選択ユーザーの詳細
  - プロフィール
  - 被フォロー状態
  - 最近の画像・動画
  - 自分がブックマークした投稿
  - 自分のX Listsと所属状態
  - リストへの追加 / 削除
  - フォロー解除
- Xのライト / Dim / Lights outテーマに追従

プロフィール上部の名前または `@handle` をクリックすると、その人のXプロフィールを新しいタブで開きます。

Following一覧の補助情報は `★ ブックマーク数 → リスト数 → 被フォロー状態` の順で固定表示します。

## データ取得方式

通常利用ではバックグラウンドタブを開きません。

X Web自身が使っている内部GraphQLを、現在開いているXページのセッション内から直接呼びます。

queryIdはXが現在行っているGraphQL通信とJavaScript bundleから実行時に発見し、見つからない場合だけ既知のqueryIdをフォールバックとして使用します。発見済みqueryIdはローカルにキャッシュし、400/404になった場合だけ再探索します。

認証用ヘッダーはX自身のGraphQL通信からページ内メモリへ取得し、認証値をextension storageへ保存しません。

被フォロー状態はFollowing/User GraphQLレスポンスの関係情報から取得します。被フォロー表示のためにフォロー相手ごとの追加APIリクエストは行いません。

## キャッシュ優先同期

Review Modeは「前回のデータを即表示してから、裏で差分更新する」方式です。

1. `chrome.storage.local` のFollowing / Bookmarks / Lists / ListMembers / Mediaを即表示
2. `Following` をバックグラウンドで更新
3. `Bookmarks` は前回取得済みのpost IDに到達した時点で停止
   - 通常は新しいブックマークだけ取得
   - 7日ごとを目安に全件同期し、解除済みBookmarkとの整合性も取り直す
4. Lists取得後、ListMembersキャッシュを利用して `userId -> 所属リスト一覧` を作成
   - ListMembersは24時間キャッシュ
   - キャッシュが新しければListMembersへのGraphQL通信は発生しない
   - 古いリストだけ再取得する
5. ユーザーを選択した時だけ `UserMedia` を取得
   - Mediaは30分キャッシュ
   - 次の1人だけアイドル時に先読み

FollowingやBookmarksのページング途中で発生するstorage書き込みは短時間まとめて保存し、UIの不要な再描画も減らしています。

## 強制再同期 / キャッシュ初期化

Review Mode上部にメンテナンス操作を用意しています。

- `強制再同期`
  - 現在の表示用キャッシュは残す
  - Bookmarksを全件同期する
  - ListMembers TTLを無効化して全リストを再取得する
  - Mediaも取り直す
  - ページ内メモリキャッシュも確実に捨てるため、Xタブを1回再読み込みしてReview Modeを自動再開する
- `キャッシュ初期化`
  - Follow ReviewのFollowing / Bookmarks / Lists / ListMembers / Media / 同期メタデータを削除
  - 保存済みqueryIdキャッシュも削除
  - Xタブを再読み込みして最初から取得し直す

## リスト取得・所属判定

自分のリスト一覧は `ListsManagementPageTimeline` から取得します。

全体の件数表示には各リストの `ListMembers` を逆引きして使います。取得結果は `chrome.storage.local` に24時間保存するため、Review Modeを開くたびに全リストを走査し直しません。

個別詳細では、必要に応じて次の順で所属状態を確認します。

1. `ListsManagementPageTimeline` のmembership情報
2. `ListMemberships`
3. キャッシュ済み `ListMembers`

## リスト操作

選択ユーザーの詳細画面に自分のリストをチェックボックスで表示します。

- ON: `ListAddMember`
- OFF: `ListRemoveMember`

をXのGraphQL mutationで直接実行します。

リストを変更した場合は、そのリストのListMembersキャッシュだけを無効化し、他のリストのキャッシュは維持します。

## フォロー解除

選択ユーザーの詳細画面からフォロー解除できます。確認ダイアログを挟んでから実行します。

## 構成

通常動作に必要なコードは役割ごとに分けています。

- `review-ui.js`: Review ModeのUI、テーマ、レイアウト、スクロール管理
- `graphql-page.js`: Xページ内で動くGraphQL Adapter、差分取得、queryIdキャッシュ
- `graphql-client.js`: キャッシュ優先同期、storage更新、ListMembersキャッシュ、Media先読み
- `graphql-bootstrap.js`: Bookmarks遅延chunkなどXの現在のGraphQL情報を早期捕捉
- `relationship-capture.js` / `relationship-client.js` / `followback-ui.js`: 被フォロー状態の取得・保存・表示
- `sync-controls.js` / `cache-control-page.js`: 強制再同期とキャッシュ初期化
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
- Review用のFollowing / Bookmarks / Lists / ListMembers / Mediaキャッシュは `chrome.storage.local` に保存します
- queryIdは認証情報ではないため、再探索を減らす目的でX originのlocalStorageに保存します

Xの内部GraphQLは非公開仕様のため、operation名・variables・feature flags等は将来変更される可能性があります。
