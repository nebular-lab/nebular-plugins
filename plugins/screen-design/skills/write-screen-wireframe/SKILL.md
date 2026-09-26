---
name: write-screen-wireframe
description: 画面設計書に添えるワイヤーフレームを 1 画面ずつ作る・更新する。画面の構成を聞いて、共通 CSS と決まった要素だけを使った簡易 HTML を SCR-NNN_<slug>.html に書く。部品に振った番号は画面設計書の No と共通。
argument-hint: "[画面名や説明・画面 ID・ファイルパス]"
disable-model-invocation: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Agent
---

# /write-screen-wireframe — ワイヤーフレームの作成（1 画面ずつ）

画面の見た目を、グレーの枠と本物のフォーム部品だけで描いた簡易 HTML として作る。デザインではなく「何が、どの順に、どこに並ぶか」を合意するための図。

ワイヤーフレームで振った部品番号は、画面設計書（`/write-screen-spec`）の No としてそのまま使われる。先にワイヤーフレームを作り、番号を固めてから設計書を書く流れを想定している。

以下の相対パスは、この skill を読み込んだときに示される Base directory（この SKILL.md があるディレクトリ）を起点にする。

- 記述規則: [references/wireframe-rules.md](references/wireframe-rules.md)
- ひな形: [assets/template.html](assets/template.html)
- 共通 CSS: [assets/wireframe.css](assets/wireframe.css)
- 画面一覧の雛形: [assets/screens-readme.md](assets/screens-readme.md)
- 整合性チェックのプロンプト: [../write-screen-spec/references/consistency-check.md](../write-screen-spec/references/consistency-check.md)
- サンプル: [../../examples/docs/screens/](../../examples/docs/screens/)（書き方に迷ったら見る）

## 引数

`/write-screen-wireframe [画面名や説明・画面 ID・ファイルパス]`

既存のワイヤーフレームを直す場合は、画面 ID かファイルパスを受け取る。

## 手順

### 1. 準備

1. 保存先を決める。既定は `docs/screens/`。
   - リポジトリの中に、画面一覧（`README.md`）と `SCR-NNN_*.md` / `SCR-NNN_*.html` が置かれた場所がすでにあれば、そこを使う。
   - どこにもなければ、`docs/screens/` を作ってよいかをユーザーに 1 度だけ確認する。別の場所を指定されたらそこを使う。
   - 以下、決まった場所を「保存先」と呼ぶ。
2. 保存先の `README.md`（画面一覧）を読み、既存の画面 ID と slug を確認する。なければ [screens-readme.md](assets/screens-readme.md) をもとに作る（例の行は消し、「入力の共通ルール」の節は残す。中身は `/write-screen-spec` で確認する）。
3. 保存先に `wireframe.css` がなければ [assets/wireframe.css](assets/wireframe.css) をコピーする。すでにあれば触らない。
4. 同じ画面のワイヤーフレームや設計書（`.md`）があれば読む。
5. 新規なら次の連番で ID を振る（`SCR-001` から 3 桁ゼロ埋め）。廃止した画面の ID も含め、一度使った ID は再利用しない。slug は英小文字とハイフン。
6. [references/wireframe-rules.md](references/wireframe-rules.md) を読む。

### 2. 下書きを描いて見せる

1 つずつ聞くより、下書きを描いて見せたほうが話が早い。ユーザーの説明、手書きのメモ、スクリーンショット、既存画面の URL など、渡されたものから下書きを描いてから確認する。

- スマホか PC かは、既存のワイヤーフレームの `.screen` に `.pc` があるかどうかから推測し、案として示す。
- 上から順に何が並ぶか、表示する文言、描いておくべき状態（データなし、エラー、モーダル表示など）を、下書きの中で案として示す。
- 決まっていない文言は `TBD` にして先へ進む。

下書きを見せて、違う箇所だけ指摘してもらう。往復は 2〜4 回程度に収める。

### 3. 描く

1. [assets/template.html](assets/template.html) をもとに、保存先の `SCR-NNN_<slug>.html` を書く。使える要素とクラスは規則の表の範囲に限る。
2. 部品に `data-no` で番号を振る。
3. 画面一覧の行を追加（更新時は該当行を更新）する。設計書がまだない画面は、「設計書」の列を `-` にする。

既存のワイヤーフレームに部品を足したり消したりして番号が変わった場合は、「旧 No → 新 No」の対応表を作っておく（報告で使う）。

### 4. 見た目を確かめる

ブラウザを操作するツール（built-in browser、Claude in Chrome、Playwright の MCP など）が使える場合は、描いた HTML を開いて見た目を確かめる。

1. ファイルを直接開けないツールなら、保存先で `python3 -m http.server <空いているポート>` をバックグラウンドで起動し、`http://localhost:<ポート>/SCR-NNN_<slug>.html` を開く。
2. 次を確かめる。
   - 部品が重なったり、はみ出したりしていないか
   - 番号が上から下、左から右の順になっているか
3. 起動したサーバーを止める。

ブラウザを操作するツールがない場合は、この手順を省き、報告で「ブラウザでの目視確認は未実施」と伝える。

### 5. 整合性を確かめる

[../write-screen-spec/references/consistency-check.md](../write-screen-spec/references/consistency-check.md) のプロンプトを埋めてサブエージェントに渡し、ワイヤーフレームの規則違反と、設計書との食い違いを探させる。

- ワイヤーフレーム単体の「エラー」（番号の重複・順序、規則にない書き方など）は、ここで直して繰り返す。
- 設計書との食い違いは、設計書を直さずに残し、報告で伝える。設計書は `/write-screen-spec` で直す。
- 設計書がまだない画面では、ワイヤーフレーム単体の観点だけを見てもらう。

### 6. 報告

次を短く報告する。

- 作成・更新したファイルと、ブラウザで開くためのパス
- 見た目の確認と整合性チェックの結果
- 振った番号と部品の対応（No と部品名の一覧）
- `TBD` にした箇所
- 設計書（`.md`）がすでにあり、番号が変わった場合は、「旧 No → 新 No」の対応表。設計書は書き換えず、`/write-screen-spec` で更新するよう伝える

コミットはしない。
