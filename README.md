# X Follow Review

X でフォロー整理を楽にするための Chrome 拡張機能です。自分用に作ったので、使いたい方がいれば使ってください。
一つの画面から、その人の投稿した画像・その人の投稿で自分がブックマークしているものなどのフォロー整理に参考になる情報を見ることができます。

## できること

X の Following ページに `Review Mode` を追加します。Review Mode では、左にフォロー一覧、右に選択した人の情報が並びます。

左の一覧では、各ユーザーについて次のことが分かります。

- 相手が自分をフォローしているか
- その人の投稿を自分がブックマークした件数
- その人を入れている自分のリストの数

ユーザー検索も可能です。

右の詳細では、選択した人について次のことができます。

- プロフィール、最近の画像・動画を見る
- その人の投稿のうち、自分がブックマークしたものを見る
- 自分のリストへの追加・削除
- フォロー解除

名前か `@handle` をクリックすると、その人の X のプロフィールが新しいタブで開きます。

## 注意事項

- Chrome での利用を前提としています。Chrome Web Store では配布していません。
- この拡張は現在ベータ版です。X の非公開 Web API を利用しているため、X 側の仕様変更で一時的に動作しなくなる可能性があります。
- このプロジェクトは X Corp. 公式の拡張機能ではありません。
- 初回は、フォロー・ブックマーク・リストの量に応じて読み込みに時間がかかります。2 回目以降は保存済みのデータから先に表示します。
- 取得したデータはブラウザ内（`chrome.storage.local`）に保存します。Cookie やトークンなどの認証情報は保存しません。

## インストール

### ZIP からインストールする

1. [Releases](https://github.com/pealsha/x-follow-review/releases/latest) から `x-follow-review-v〇〇.zip` をダウンロードして展開する
2. Chrome で `chrome://extensions/` を開く
3. 右上の「デベロッパー モード」を ON にする
4. 「パッケージ化されていない拡張機能を読み込む」を押し、展開した `x-follow-review` フォルダを選ぶ
5. 開いている X のタブを再読み込みする

展開したフォルダは、拡張機能を使っている間は削除せずに置いておいてください。

### git でインストールする

```powershell
git clone https://github.com/pealsha/x-follow-review.git
```

その後、上の 2〜5 と同じ手順で、clone した `x-follow-review` フォルダを読み込みます。

## 使い方

1. X にログインした状態で `https://x.com/<自分のユーザー名>/following` を開く
2. `Review Mode` を押す
3. 左の一覧からユーザーを選択する

## 表示を最新の状態にしたいとき

X の画面で直接リストを編集した後などは、Review Mode 上部のボタンで表示を更新できます。

- `強制再同期`: 保存済みのデータは表示したまま、X から最新の情報を取り直します
- `キャッシュ初期化`: この拡張が保存したデータをすべて消して、最初から取得し直します

## 新しいバージョンへの更新

### ZIP でインストールした場合

1. [Releases](https://github.com/pealsha/x-follow-review/releases/latest) から新しい ZIP をダウンロードして展開する
2. 前の `x-follow-review` フォルダの中身を、新しいフォルダの中身で置き換える
3. `chrome://extensions/` で X Follow Review を再読み込みし、X のタブを閉じて開き直す

同じ場所のフォルダを置き換えると、保存済みのデータもそのまま使えます。

### git でインストールした場合

```powershell
cd x-follow-review
git pull
```

その後、`chrome://extensions/` で X Follow Review を再読み込みし、X のタブを閉じて開き直してください。

## 不具合の報告

[GitHub Issues](https://github.com/pealsha/x-follow-review/issues) へどうぞ。次の情報が分かれば添えてください。

- どの操作をしたか
- 表示されたエラー
- バージョン（`chrome://extensions/` の X Follow Review の欄に表示されます）
- 強制再同期で直るかどうか

## 開発者向け

内部構成やデータの取得方式は [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) にまとめています。

拡張機能アイコンから開ける GraphQL 診断画面は、X の仕様変更時の調査用です。通常利用では開く必要はありません。
