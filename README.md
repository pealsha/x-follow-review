# X Follow Review

Xのフォロー一覧を、1人ずつ判断しやすいレビュー画面に変えるChrome拡張です。

現在はMVP段階で、XのFollowingページに直接 `Review Mode` を追加します。既存のGraphQL観測プローブも残してあり、今後リスト所属・最近のメディア・自分のブックマークをレビュー画面に統合していきます。

## 現在できること

- `https://x.com/<username>/following` に `Review Mode` ボタンを表示
- Xの現在のFollowing DOMから、表示済みユーザーを収集
- 1人ずつプロフィールカードとして表示
- `K = 残す`
- `S = 保留`
- `D = 解除候補`
- 左右矢印で前後移動
- 判定結果を `chrome.storage.local` に保存
- `さらに読み込む` で背後のFollowing一覧をスクロールして追加収集
- XのSPA遷移に追従
- Shadow DOMでX本体のCSSとレビューUIを分離

現段階では、`解除候補` を付けても実際のフォロー解除は行いません。

## 今後レビュー画面に追加する情報

1. 自分がその人を入れているX Lists
2. 最近の画像・動画投稿
3. その人の投稿のうち、自分がブックマークしたもの
4. 最終投稿日などの補助情報
5. 最後に解除候補をまとめて再確認してからUnfollow

## GraphQL観測プローブ

X Webが実際に使っているGraphQL operation・queryId・リクエスト変数・レスポンスの**構造**を観測する診断機能も含まれています。

主に次の4系統を確認します。

1. Following
2. Bookmarks
3. UserMedia / UserTweets
4. ListsManagementPageTimeline / ListMembers などのList系

queryIdは固定せず、Xが実際に行った通信から取得します。

## インストール

最初の一度だけcloneします。

```powershell
git clone https://github.com/pealsha/x-follow-review.git
```

その後、Chromeで以下を行います。

1. `chrome://extensions/` を開く
2. 「デベロッパー モード」をON
3. 「パッケージ化されていない拡張機能を読み込む」
4. cloneした `x-follow-review` フォルダを選択
5. Xのタブを再読み込み

以後の更新は、リポジトリ内で以下を実行してChromeの拡張を再読み込みするだけです。

```powershell
git pull
```

## Review Modeの使い方

1. 自分のプロフィールから「フォロー中」を開く
2. 画面右上付近に出る `Review Mode` を押す
3. `残す / 保留 / 解除候補` を付ける
4. 必要なら `さらに読み込む` を押してFollowing一覧を下へ進める
5. `通常表示` で元のX画面へ戻る

現在はDOMに読み込まれたユーザーだけを対象にします。Following全件の自動ページネーションは今後GraphQL Adapter側で実装します。

## 診断画面

拡張機能アイコンをクリックすると診断画面を開けます。

別タブのXで以下を操作すると、使用されたGraphQL operationを観測できます。

1. 自分のプロフィール →「フォロー中」→ 少しスクロール
2. 「ブックマーク」→ 少しスクロール
3. 任意のフォロー相手 →「メディア」→ 少しスクロール
4. 「リスト」→ 自作リストを1つ開く → メンバー一覧も表示

## プライバシー上の挙動

- Authorizationヘッダーの値は保存しません
- Cookie本文は保存しません
- CSRFトークンの値は保存しません
- GraphQLレスポンス本文そのものは保存せず、構造を要約したshapeだけ保存します
- request variablesも値ではなく構造・型だけを保存します
- データは `chrome.storage.local` のみです

## 現在の段階

- Review Mode UI: 実装済み
- Following DOM収集: 実装済み
- 判定ローカル保存: 実装済み
- GraphQL operation観測: 実装済み
- Following GraphQL同期: 未実装
- Bookmarks同期: 未実装
- Lists同期: 未実装
- UserMedia同期: 未実装
- Unfollow実行: 未実装
