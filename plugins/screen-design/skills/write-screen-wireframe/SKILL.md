---
name: write-screen-wireframe
description: 画面設計書に添えるワイヤーフレームを 1 画面ずつ作る・更新する。画面の構成を聞いて、共通 CSS と決まった要素だけを使った簡易 HTML を SCR-NNN_<slug>.html に書く。部品に振った番号は画面設計書の No と共通。
argument-hint: "[画面名や説明・画面 ID・ファイルパス]"
disable-model-invocation: true
---

# /write-screen-wireframe — ワイヤーフレームの作成（1 画面ずつ）

画面の見た目を、グレーの枠と本物のフォーム部品だけで描いた簡易 HTML として作る。デザインではなく「何が、どの順に、どこに並ぶか」を合意するための図。ここで振った部品番号が、画面設計書（`/write-screen-spec`）の No になる。

以下の相対パスは、この SKILL.md があるディレクトリを起点にする。

- 記述規則: [references/wireframe-rules.md](references/wireframe-rules.md)
- ひな形と共通 CSS: [assets/template.html](assets/template.html)、[assets/wireframe.css](assets/wireframe.css)
- 共有ファイルの雛形: [assets/shared/](assets/shared/)、[../write-screen-common-rules/assets/common-rules.md](../write-screen-common-rules/assets/common-rules.md)
- サンプル: [../../examples/docs/screens/](../../examples/docs/screens/)（書き方は、規則よりもまずサンプルに合わせる）

## 手順

1. **準備**
   - 保存先を決める。`overview.md` や `SCR-NNN_*/` のフォルダがすでに置かれた場所があれば、そこを使う。なければ `docs/screens/` を作ってよいかを 1 度だけ確認する。
   - 保存先に `overview.md`、`messages.md`、`common-rules.md`、`wireframe.css` がなければ、雛形をコピーして作る（例の行は消す）。すでにあれば触らない。
   - 規則と、サンプルのワイヤーフレームを 1 つ読む。同じ画面のワイヤーフレームや設計書があれば読む。
   - 新規なら、`overview.md` の画面一覧を見て次の画面 ID を振る。一度使った ID は再利用しない。
   - ヘッダーは、`overview.md` の共通ヘッダーの一覧にあるものを使う。合うものがなければ、先に共通ヘッダーのワイヤーフレーム（`HDR-NNN_<slug>/`）を作る。共通ヘッダーだけを作る・直す依頼にも、同じ手順で応える。
2. **下書きを描いて見せる**: 渡された説明やスクリーンショットから、先に下書きを描く。1 つずつ聞くより早いため。違う箇所だけ指摘してもらい、直す。エラー表示と確認ダイアログは、規則どおり最初から描いておく。
3. **描く**: 保存先の、画面ごとのフォルダ `SCR-NNN_<slug>/` を作り、その中の `SCR-NNN_<slug>.html` に書き、`overview.md` の画面一覧の行を足す（まだないものの列は `-`）。既存の番号が変わった場合は、「旧 No → 新 No」の対応表を作っておく。
4. **見た目を確かめる**: ブラウザを操作するツールが使えれば、HTML を開いて、部品の重なりやはみ出しがないか、番号の順が規則どおりかを確かめる。使えなければ、報告で未実施と伝える。
5. **整合性を確かめる**: [../write-screen-spec/references/consistency-check.md](../write-screen-spec/references/consistency-check.md) のプロンプトをサブエージェントに渡す。ワイヤーフレーム単体の問題はここで直す（チェックは最大 3 回）。設計書との食い違いは、設計書を直さずに報告する。
6. **報告**: 作ったファイル、確認の結果、番号と部品の対応、`TBD` の箇所、番号が変わった場合の対応表、次に使う skill（`/write-screen-spec`）。コミットはしない。
