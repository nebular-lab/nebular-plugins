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
- 共有ファイルの雛形: [assets/shared/](assets/shared/)（`overview.md`、`messages.md`）と、共通ルールの雛形 [../write-screen-common-rules/assets/common-rules.md](../write-screen-common-rules/assets/common-rules.md)
- 整合性チェックのプロンプト: [../write-screen-spec/references/consistency-check.md](../write-screen-spec/references/consistency-check.md)
- サンプル: [../../examples/docs/screens/](../../examples/docs/screens/)（書き方に迷ったら見る）

## 引数

`/write-screen-wireframe [画面名や説明・画面 ID・ファイルパス]`

既存のワイヤーフレームを直す場合は、画面 ID かファイルパスを受け取る。

## 手順

### 1. 準備

1. 保存先を決める。既定は `docs/screens/`。
   - リポジトリの中に、概要（`overview.md`）と `SCR-NNN_*.md` / `SCR-NNN_*.html` が置かれた場所がすでにあれば、そこを使う。
   - どこにもなければ、`docs/screens/` を作ってよいかをユーザーに 1 度だけ確認する。別の場所を指定されたらそこを使う。
   - 以下、決まった場所を「保存先」と呼ぶ。
2. 保存先の `overview.md` の「画面一覧」を読み、既存の画面 ID と slug を確認する。共有ファイルがなければ、雛形をコピーして作る（`overview.md` と `messages.md` は [assets/shared/](assets/shared/) から。例の行は消す。`common-rules.md` は [../write-screen-common-rules/assets/common-rules.md](../write-screen-common-rules/assets/common-rules.md) から）。
   - `common-rules.md` の設定が `TBD` のままなら、先に `/write-screen-common-rules` で決めておくとよいことを伝える（決めずに進めてもよい）。
3. 保存先に `wireframe.css` がなければ [assets/wireframe.css](assets/wireframe.css) をコピーする。すでにあれば触らない。
4. 同じ画面のワイヤーフレームや設計書（`.md`）があれば読む。
5. 新規なら次の連番で ID を振る（`SCR-001` から 3 桁ゼロ埋め）。廃止した画面の ID も含め、一度使った ID は再利用しない。slug は英小文字とハイフン。
6. [references/wireframe-rules.md](references/wireframe-rules.md) を読む。

### 2. 下書きを描いて見せる

1 つずつ聞くより、下書きを描いて見せたほうが話が早い。ユーザーの説明、手書きのメモ、スクリーンショット、既存画面の URL など、渡されたものから下書きを描いてから確認する。

- すべて PC 表示の前提で描く（`.screen` は幅 1024px の枠）。スマホ向けの画面は対象にしない。
- 上から順に何が並ぶか、表示する文言、描いておくべき状態（読み込み中、データなし、モーダル表示など）を、下書きの中で案として示す。
- エラー表示は、最初から全部描いておく。画面上部に 1 つと、すべての入力項目の下に 1 つずつ（規則の「エラー表示」）。あとから足すと番号がずれるため。要らないものがあれば、下書きを見せるときに消すかを聞く。
- 確認ダイアログ（削除の確認、未保存での離脱の確認など）が要りそうなら、`.screen` を足して描く（規則の「確認ダイアログ」）。
- 決まっていない文言は `TBD` にして先へ進む。

下書きを見せて、違う箇所だけ指摘してもらう。往復は 2〜4 回程度に収める。

### 3. 描く

1. [assets/template.html](assets/template.html) をもとに、保存先の `SCR-NNN_<slug>.html` を書く。使える要素とクラスは規則の表の範囲に限る。
2. 部品に `data-no` で番号を振る。
3. `overview.md` の「画面一覧」に行を追加（更新時は該当行を更新）する。まだないもの（設計書、Playwright テスト）の列は `-` にする。

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

- ワイヤーフレーム単体の「エラー」（番号の重複・順序、規則にない書き方など）は、ここで直してもう一度チェックする。チェックは最大 3 回までにし、それでも残ったエラーは報告で伝える。
- 設計書との食い違いは、設計書を直さずに残し、報告で伝える。設計書は `/write-screen-spec` で直す。
- 設計書がまだない画面では、ワイヤーフレーム単体の観点だけを見てもらう。

### 6. 報告

次を短く報告する。

- 作成・更新したファイルと、ブラウザで開くためのパス
- 見た目の確認と整合性チェックの結果
- 振った番号と部品の対応（No と部品名の一覧）
- `TBD` にした箇所
- 設計書（`.md`）がすでにあり、番号が変わった場合は、「旧 No → 新 No」の対応表。設計書は書き換えず、`/write-screen-spec` で更新するよう伝える（そのあと `/write-screen-flow` と `/write-screen-playwright-test` の更新も必要になる）
- 次に使う skill。設計書がまだなければ `/write-screen-spec`

コミットはしない。
