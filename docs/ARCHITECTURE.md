# Architecture

この文書は Hn X Follow Review の内部構成とデータ取得方式をまとめた開発者向け資料です。

README は利用者がインストールして使い始めるための情報に絞り、実装詳細はここで扱います。

## 全体構成

Chrome Manifest V3 の content script を、X ページと同じ JavaScript world で動く処理と、拡張機能側の isolated world で動く処理に分けています。

### MAIN world

X のページセッションと同じ環境で動き、X Web が利用している内部 GraphQL と通信します。

主なファイル（`src/main/`）:

- `graphql-response.js`: 再帰探索、User / Tweet / List の正規化、cursor 抽出。`window.__xfrGraphqlResponse` に公開する、フックを持たない通常 script
- `graphql-bootstrap.js`: GraphQL operation / queryId の早期捕捉
- `page-hook.js`: X Web の通信観測
- `relationship-capture.js`: follow-back 関係情報の捕捉
- `graphql-page.js`: queryId 管理、通信、ページ巡回、同期と action の振り分け
- `graphql-xhr.js`: XHR から認証済み GraphQL ヘッダーをページ内メモリへ捕捉
- `actions-page.js`: フォロー解除などの操作
- `cache-control-page.js`: 強制再同期・キャッシュ初期化時のページ側処理

### ISOLATED world

UI、Chrome extension storage、MAIN world とのメッセージングを担当します。

主なファイル（`src/isolated/`）:

- `shared.js`: storage キー、メッセージマーカー、ホスト ID、ユーザー索引の正規化。`window.__xfrIsolatedShared` を初期化
- `probe-bridge.js`: ページ側の診断観測を background へ転送
- `review-styles.js`: Review Mode の CSS 文字列を同じ共有名前空間へ登録。Shadow DOM への挿入は `review-ui.js` が担当
- `review-ui.js`: Review Mode の UI
- `graphql-client.js`: 同期制御とキャッシュ管理
- `ui-metadata.js`: 一覧の補助表示
- `relationship-client.js`: follow-back 情報の保存
- `followback-ui.js`: follow-back 状態の表示
- `sync-controls.js`: 強制再同期・キャッシュ初期化 UI

### その他と検証

- `src/background.js`: 診断画面を開く、診断イベントの保存、webRequest の観測
- `src/probe/probe.html` / `probe.js`: operation ごとの診断情報の表示・コピー・消去
- `biome.json`: 整形・lint。未宣言変数を検査し、`chrome` の global は background・ISOLATED・probe のみに許可
- `scripts/check-project.js`: manifest の参照ファイルの存在と、`src/` の全 JS の構文検査
- `tests/graphql-response.test.js`: 通信せず、通常 script を評価して手書き fixture で解析結果を検査

`bun run check` で Biome、ファイル・構文検査、`bun test` を順に実行します。Biome の `--error-on-warnings` は警告も失敗として扱う指定です。Biome は固定済みの 2.6.3 を使用し、Markdown は検査・整形の対象外です。

構文検査は Bun から導入済みの Node を起動し、`node:vm` の `Script` で通常 script として解析します。ソースは実行しません。Bun の `new Script()` だけでは構文エラーを検出しなかったため、Node を使います。検証環境には Bun と Node が必要です。

### 読み込み順と world の境界

manifest の配列が入口です。MAIN は `graphql-response` を先に置き、既存の `graphql-bootstrap → page-hook → relationship-capture → graphql-page → graphql-xhr → actions-page → cache-control-page` の相対順を維持します。各フックは直前の fetch / XHR を保持するため、並び替えは通信の観測経路も変えます。

ISOLATED は `shared → probe-bridge → review-styles → review-ui → graphql-client → ui-metadata → relationship-client → followback-ui → sync-controls` です。`review-ui` は以前と同じ5キーを取得・監視し、同期・初期化側は9キーを扱います。共有定義の追加でこの範囲を広げないようにします。

content script は ES module へ変えず、同じ world の名前空間を参照します。world 間の共有は従来どおり `window.postMessage` です。Lists の bootstrap 側の補完は通常の List 正規化と戻り値が違うため、そのまま残しています。

## データフロー

Review Mode を開くと、まず `chrome.storage.local` に保存済みのデータを表示し、その後バックグラウンドで X の最新状態へ更新します。

概略:

```text
chrome.storage.local
       ↓
  即時表示
       ↓
Following 更新
   ├─ Bookmarks 更新
   ├─ Lists 更新
   └─ ListMembers 更新
       ↓
選択ユーザーだけ UserMedia / 詳細更新
```

## キャッシュ方針

体感速度と X へのリクエスト数を抑えるため、cache-first で動作します。

- Following: 前回値を即表示した後で更新
- Bookmarks: 通常は既知の投稿までで差分取得し、ときどき完全同期
- ListMembers: TTL 付きで永続キャッシュし、古いリストだけ再取得
- Media: 短時間キャッシュし、選択ユーザーを中心に取得
- queryId: X の通信や JavaScript bundle から取得し、再利用可能な値だけ保存

強制再同期では通常のキャッシュ最適化を無効化して最新状態を取り直します。キャッシュ初期化では Follow Review が保存したデータを削除して初期状態から再取得します。

## 被フォロー状態

相手が自分をフォローしているかどうかは、X の User / Following レスポンスに含まれる relationship 情報を利用します。

被フォロー表示のために、Following の各ユーザーへ個別リクエストを追加する設計にはしていません。

## Lists

自分の Lists と各ユーザーの所属状態を取得し、Following 一覧では所属リスト数を表示します。

詳細画面ではチェックボックスから List への追加・削除ができます。変更した List のキャッシュだけを無効化し、他の List のキャッシュは維持します。

## GraphQL

X Web が使用している内部 GraphQL を、現在開いている X ページのログイン済みセッションから利用します。

queryId は可能な限り実行時に次から取得します。

1. X の実際の GraphQL 通信
2. X の JavaScript bundle
3. 既知の fallback

保存済み queryId が無効になった場合は再探索します。

X の内部 GraphQL は公開 API ではないため、operation 名、variables、feature flags、レスポンス構造などは予告なく変わる可能性があります。

## 保存するデータ

Review Mode の高速表示に必要な以下のデータを `chrome.storage.local` に保存します。

- Following
- Bookmarks の著者別インデックス
- Lists
- ListMembers / membership インデックス
- Media キャッシュ
- 同期メタデータ

認証用の Authorization ヘッダー、Cookie 本文、CSRF トークンは extension storage に保存しません。GraphQL 通信に必要な認証情報はページ内メモリだけで扱います。

## 診断機能

拡張機能アイコンから GraphQL 診断画面を開けます。X の仕様変更時に、operation / queryId / レスポンス構造を確認するための開発用機能です。

通常利用では診断画面を開く必要はありません。
