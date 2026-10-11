---
name: write-screen-spec
description: 画面設計書を 1 画面ずつ作る・更新する。構成はワイヤーフレーム（HTML）から、呼ぶ API は OpenAPI 定義から読み、まず案を SCR-NNN_<slug>.md に書いてから、ユーザーに読んでもらって違う箇所だけ直す形で、テンプレートと記述規則に沿って仕上げる。
argument-hint: "[画面 ID・画面名・ファイルパス]"
disable-model-invocation: true
---

# /write-screen-spec — 画面設計書の作成（1 画面ずつ）

画面の構成はワイヤーフレームから、API は OpenAPI 定義から、動作は会話から集めて、画面設計書を 1 画面 1 ファイルで書く。見た目はワイヤーフレームに任せ、設計書には「何があり、どう動くか」を書く。

以下の相対パスは、この SKILL.md があるディレクトリを起点にする。

- 記述規則: [references/writing-rules.md](references/writing-rules.md)
- テンプレート: [assets/template.md](assets/template.md)
- 整合性チェックのプロンプト: [references/consistency-check.md](references/consistency-check.md)
- サンプル: [../../examples/docs/](../../examples/docs/)（書き方は、規則よりもまずサンプルの設計書に合わせる）
- 関連する規則と雛形: [../write-screen-wireframe/references/wireframe-rules.md](../write-screen-wireframe/references/wireframe-rules.md)、[../write-screen-wireframe/assets/shared/](../write-screen-wireframe/assets/shared/)、[../write-screen-common-rules/assets/common-rules.md](../write-screen-common-rules/assets/common-rules.md)

## 手順

1. **準備**
   - 保存先を決める。`overview.md` や `SCR-NNN_*/` のフォルダがすでに置かれた場所があれば、そこを使う。なければ `docs/screens/` を作ってよいかを 1 度だけ確認する。
   - 記述規則と、サンプルの設計書を 1 つ読む。
   - 保存先の共有ファイル（`overview.md`、`messages.md`、`common-rules.md`。あれば `storage.md`）を読む。なければ雛形から作る。
   - 同じ画面の設計書がすでにあれば、更新として進める。
   - 共通ヘッダーの設計書を作る・直すときは、[assets/header-template.md](assets/header-template.md) を使い、画面と同じ手順で進める。画面の設計書では、冒頭の表の「共通ヘッダー」に、使うヘッダーと変数の値を書く。
2. **ワイヤーフレームを読む**: 保存先の、画面ごとのフォルダ `SCR-NNN_<slug>/` の中の `SCR-NNN_<slug>.html` から、番号・タグ・文言を拾う。番号は付け直さない。なければ、先に `/write-screen-wireframe` で作るよう勧める。
3. **OpenAPI 定義を読む**: 定義を探し、この画面が使う操作のパラメータ・リクエスト・ステータスを確かめる。推測で書かない。定義がなければ、API の部分を `TBD` にして進めてよいかを確認する。見つけた定義は、`overview.md` の冒頭の表に行がなければ足す。
4. **案をファイルに書く**: 会話で 1 項目ずつ聞く前に、読み取れることをテンプレートに埋めて、ワイヤーフレームと同じフォルダの `SCR-NNN_<slug>.md` に書く。共通ルールで決まっていることは、そのとおりに書く。推測できないものは `TBD` にし、未決事項に質問の形で残す。推測で埋めたものも、確認してほしい点として未決事項に書く。`overview.md` の画面一覧と、`messages.md` も更新する。画面がブラウザのストレージを使うなら、`storage.md` も更新する（なければ雛形から作り、例の行は消す）。
5. **読んでもらって直す**: ファイルのパスを伝え、会話には表を貼らず、確認してほしい点だけを短く伝える。設計者が決めること（入力させないのかエラーにするのか、バリデーションのタイミング、履歴に追加するか置き換えるか、どのボタンを `submit` にするか、`autocomplete`など）は、勝手に決めずに聞く。答えをファイルに反映する。
6. **整合性を確かめる**: [references/consistency-check.md](references/consistency-check.md) のプロンプトをサブエージェントに渡し、返ってきたエラーを直す（チェックは最大 3 回）。
7. **報告**: 作ったファイル、チェックの結果、未決事項、足したメッセージとストレージの項目、次に使う skill（遷移を変えたら `/write-screen-flow`、内容を変えたら `/write-screen-playwright-test`）。コミットはしない。

## 番号が変わったときの更新

ワイヤーフレームの部品が増減すると、部品番号がずれる。アクションが増減すると、アクション ID がずれる。

- 「旧 → 新」の対応表を作り、文言が変わっていて対応が推測になるものは、ユーザーに確認する。
- 設計書の中の番号と参照を、すべて一度に付け替える（順に置き換えると、置き換えたばかりの番号をまた置き換えてしまう）。
- 部品番号は、画面遷移図の ID と、Playwright テストのコメントでも使っている。変わったら、その更新が必要なことを報告する。
