# X Follow Review

X の Following を整理するための Chrome 拡張です。

X の Following ページに `Review Mode` を追加し、フォロー中のユーザーを一覧で見ながら、その人の最近の投稿・ブックマーク・所属リストなどを確認して整理できます。

> この拡張は現在ベータ版です。X の非公開 Web API を利用しているため、X 側の仕様変更で一時的に動作しなくなる可能性があります。

## 主な機能

### Following を見ながら整理

Following 一覧に、通常の X ではまとめて見づらい情報を追加します。

- 名前 / `@handle`
- 自分がその人の投稿をブックマークした件数
- 所属している自分の X Lists の数
- 相手が自分をフォローしているか
- ユーザー検索

一覧は独立してスクロールでき、ユーザーを切り替えても作業位置を維持します。

### 選択したユーザーの詳細

一覧からユーザーを選ぶと、右側に詳細を表示します。

- プロフィール
- 最近の画像・動画
- 自分がブックマークした投稿
- 自分の Lists と所属状態
- List への追加 / 削除
- フォロー解除

名前または `@handle` をクリックすると、そのユーザーの X プロフィールを新しいタブで開きます。

### キャッシュ優先で高速表示

前回取得したデータを最初に表示し、その後で X の最新状態へ更新します。

Bookmarks や Lists も差分取得・キャッシュを利用するため、毎回すべてを取り直さない設計です。

### メンテナンス

Review Mode 上部から次の操作ができます。

- `強制再同期`: キャッシュ最適化を無視して X から最新データを取り直す
- `キャッシュ初期化`: Follow Review が保存したデータを削除して最初から取得し直す

表示がおかしい場合や、X 側で直接 Lists などを大きく変更した場合に使えます。

## インストール

現在は Chrome Web Store では配布していないため、パッケージ化されていない拡張機能として読み込みます。

### 1. リポジトリを clone

```powershell
git clone https://github.com/pealsha/x-follow-review.git
```

### 2. Chrome に読み込む

1. `chrome://extensions/` を開く
2. 「デベロッパー モード」を ON
3. 「パッケージ化されていない拡張機能を読み込む」を選択
4. clone した `x-follow-review` フォルダを指定
5. X のタブを再読み込み

## 使い方

1. X にログインする
2. `https://x.com/<username>/following` を開く
3. `Review Mode` を押す
4. 左の Following 一覧からユーザーを選ぶ
5. 右側で投稿・Bookmarks・Lists などを確認する

初回はデータ取得に時間がかかる場合があります。2 回目以降は保存済みキャッシュを先に表示します。

## 更新

リポジトリを更新した後、Chrome 側でも拡張機能を再読み込みします。

```powershell
cd C:\Users\perus\Documents\x-follow-review
git pull
```

その後:

1. `chrome://extensions/` で X Follow Review を再読み込み
2. 開いている X タブも再読み込み

MAIN world 側の処理が変わった更新では、新しい X タブを開き直す方が確実です。

## 保存するデータとプライバシー

高速表示のため、Following、Bookmarks、Lists、Media など Review Mode に必要なキャッシュを `chrome.storage.local` に保存します。

一方、次の認証情報は extension storage に保存しません。

- Authorization ヘッダーの値
- Cookie 本文
- CSRF トークン

X との認証済み通信に必要な情報は、X ページ内のメモリだけで扱います。

## 制限事項

- X の公式 API ではなく、X Web が内部で使っている GraphQL を利用しています
- X の仕様変更により突然動作しなくなる可能性があります
- 現在は Chrome での利用を前提としています
- 初回同期や強制再同期では、Following / Bookmarks / Lists の量に応じて時間がかかります

このプロジェクトは X Corp. 公式の拡張機能ではありません。

## 開発者向け

内部構成、GraphQL、キャッシュ、MAIN / ISOLATED world の役割分担などは [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) にまとめています。

拡張機能アイコンから開ける GraphQL 診断画面は、X の仕様変更時の調査用です。通常利用では開く必要はありません。

## バグ報告

不具合を報告する場合は、可能であれば次の情報を添えてください。

- 発生した操作
- 表示されたエラー
- X Follow Review のバージョン
- 再読み込みや強制再同期で直るか

GitHub Issues: https://github.com/pealsha/x-follow-review/issues
