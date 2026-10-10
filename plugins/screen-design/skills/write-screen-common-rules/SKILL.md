---
name: write-screen-common-rules
description: 全画面で共通のルール（common-rules.md）を作る・更新する。入力、表示形式、一覧、送信、通信、メッセージ、遷移、ライブラリの既定の設定などの決まった項目を、あらかじめ用意した選択肢（yes / no など）から選んで決める。アクセシビリティは、選択肢のない決まったルールとして書く。
argument-hint: "[保存先]"
disable-model-invocation: true
---

# /write-screen-common-rules — 共通ルールの作成

どの画面でも同じになる扱いを、1 つのファイル `common-rules.md` にまとめる。画面ごとに扱いがばらつくのを防ぐためのもの。決める項目と選択肢はあらかじめ決まっていて、項目ごとに選択肢から 1 つを選ぶだけにする。文章でルールを書き足さない。

以下の相対パスは、この SKILL.md があるディレクトリを起点にする。

- 項目と選択肢の一覧: [references/viewpoints.md](references/viewpoints.md)
- 雛形: [assets/common-rules.md](assets/common-rules.md)
- サンプル: [../../examples/docs/screens/common-rules.md](../../examples/docs/screens/common-rules.md)

## 手順

1. **準備**: 保存先を決める（`overview.md` や `SCR-NNN_*/` のフォルダが置かれた場所。なければ `docs/screens/` を作ってよいかを確認する）。項目の一覧を読む。保存先に `common-rules.md` がなければ、雛形をコピーする。
2. **選んでもらう**: 設定が `TBD` の項目を、節ごとにまとめて、選択肢で聞く。既存の設計書や実装から読み取れる値は、おすすめとして示す。読み取れない項目を勝手に決めない。「未定」と答えた項目は `TBD` のままにする。すでに設定が入っている項目と、選択肢のないルールは聞かない。
3. **書く**: 答えを「設定」に書く。`overview.md` の冒頭の表に、このファイルの行がなければ足す。既存の設計書が、決めた設定と食い違っていないかを確かめ、食い違いは直さずに一覧にする。
4. **報告**: 決まった設定、`TBD` のまま残した項目、設定と食い違っている設計書、次に使う skill（`/write-screen-wireframe`、食い違いを直すなら `/write-screen-spec`）。コミットはしない。
