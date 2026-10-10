---
name: write-screen-common-rules
description: 全画面で共通のルール（common-rules.md）を作る・更新する。入力、react-hook-form のデフォルト設定、TanStack Query の既定の設定、表示形式、一覧、送信、遷移の決まった項目を、あらかじめ用意した選択肢（yes / no など）から選んで決める。アクセシビリティは、選択肢のない決まったルールとして書く。画面設計書・ワイヤーフレーム・E2E テストは、このルールを既定として使う。
argument-hint: "[保存先]"
disable-model-invocation: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
---

# /write-screen-common-rules — 共通ルールの作成

どの画面でも同じになる扱い（改行を 1 文字と数えるか、バリデーションをいつ行うか、送信中にボタンを非活性にするか、など）を、1 つのファイル `common-rules.md` にまとめる。画面ごとの設計書で扱いがばらつくのを防ぐ。

決める項目と選択肢は、あらかじめ決まっている。あったほうがよいこと（アクセシビリティ）は、選ばせずに、決まったルールとして最初から書いてある。項目ごとに、選択肢から 1 つを選ぶだけにする（`yes` / `no`、または決まった値のどれか）。文章でルールを書かない。

以下の相対パスは、この skill を読み込んだときに示される Base directory（この SKILL.md があるディレクトリ）を起点にする。

- 項目と選択肢の一覧: [references/viewpoints.md](references/viewpoints.md)
- 雛形: [assets/common-rules.md](assets/common-rules.md)（すべての項目の設定を `TBD` にしたもの）
- サンプル: [../../examples/docs/screens/common-rules.md](../../examples/docs/screens/common-rules.md)

## 引数

`/write-screen-common-rules [保存先]`

## 手順

### 1. 準備

1. 保存先を決める。既定は `docs/screens/`。概要（`overview.md`）や `SCR-NNN_*.md` が置かれた場所がすでにあれば、そこを使う。どこにもなければ、`docs/screens/` を作ってよいかをユーザーに 1 度だけ確認する。
2. [references/viewpoints.md](references/viewpoints.md) を読む。
3. 保存先に `common-rules.md` があれば読む（更新として進める）。なければ [assets/common-rules.md](assets/common-rules.md) をコピーする。

### 2. 選んでもらう

設定が `TBD` の項目を、ユーザーに選んでもらう。

- 選択肢で質問するツール（AskUserQuestion など）が使えれば使う。選択肢は viewpoints.md のとおりにし、意味を説明に添える。使えなければ、項目と選択肢を表にして見せ、番号や値で答えてもらう。
- 節ごとにまとめて聞く（入力、react-hook-form のデフォルト設定、TanStack Query の設定、そのほか）。数値を入れる項目（`staleTime`、`gcTime`、`retry` の回数）は、TanStack Query の既定値を選択肢の 1 つに出し、ほかの値は自由に入力してもらう。1 項目ずつ会話を往復しない。
- 既存の画面設計書や実装から読み取れる項目は、その値を「おすすめ」として先頭に出す。読み取れない項目に、おすすめは付けない。勝手に決めない。
- ユーザーが「未定」「あとで」と答えた項目は `TBD` のままにする。
- 選択肢のないルール（アクセシビリティ）は聞かない。雛形の文のまま置く。
- すでに設定が入っている項目は聞かない。変えたいと言われた項目だけ変える。

### 3. 書く

1. 答えを `common-rules.md` の「設定」に、選択肢の文字のまま書く。項目・選択肢・順序は変えない。
2. `overview.md` があり、冒頭のファイルの表に `common-rules.md` の行がなければ足す（`| [common-rules.md](common-rules.md) | 共通ルール。全画面で同じになる扱い |`）。
3. 既存の画面設計書が、決めた設定と食い違っていないかを確かめる（バリデーションのタイミング、ボタンの非活性、離脱確認など）。食い違いは直さずに一覧にし、報告で伝える。設計書は `/write-screen-spec` で直す。

### 4. 報告

次を短く報告する。

- 作成・更新したファイルと、決まった設定の一覧
- `TBD` のまま残した項目
- 設定と食い違っている既存の画面設計書（画面 ID と箇所）
- 次に使う skill。画面をこれから作るなら `/write-screen-wireframe`、食い違いを直すなら `/write-screen-spec`

コミットはしない。
