---
name: write-screen-flow
description: すべての画面設計書（Markdown）から遷移を読み取り、draw.io の画面遷移図（screen-flow.drawio）を作る・更新する。画面の枠の中に遷移のきっかけ（ボタン・リンク）を置き、遷移先の画面へ矢印を引くだけの簡単な図にする。処理・条件・確認ダイアログは描かない。
argument-hint: "[画面設計書の置き場所]"
disable-model-invocation: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
---

# /write-screen-flow — 画面遷移図の作成

`/write-screen-spec` で書いた画面設計書から、「どの画面の、どのボタンやリンクから、どの画面へ移るか」を 1 枚で見渡せる画面遷移図を、draw.io のファイルとして作る。

- 画面を枠で描き、その中に遷移のきっかけになるボタンやリンクを置く。
- きっかけから遷移先の画面へ、矢印を 1 本引く。処理・条件・確認ダイアログは描かない（画面設計書のアクションを読めばわかるため）。
- エラーのときの遷移や、初期表示での自動の遷移は図に描かず、「図に描いていない遷移」のメモにまとめる。
- 画面が変わらない操作は描かない。

以下の相対パスは、この skill を読み込んだときに示される Base directory（この SKILL.md があるディレクトリ）を起点にする。

- 描き方の規則: [references/flow-rules.md](references/flow-rules.md)
- サンプル: [../../examples/docs/screens/screen-flow.drawio](../../examples/docs/screens/screen-flow.drawio)（[../../examples/docs/screens/](../../examples/docs/screens/) の 3 画面から作ったもの）

## 引数

`/write-screen-flow [画面設計書の置き場所]`

置き場所を省くと、概要（`overview.md`）のある場所を探す。既定は `docs/screens/`。

## 手順

### 1. 入力を集める

1. 保存先を決める。概要（`overview.md`）と `SCR-NNN_*.md` が置かれた場所を探す。見つからなければユーザーに聞く。
2. `overview.md` の「画面一覧」を読み、画面の一覧（画面 ID、画面名、URL）を得る。
3. すべての画面設計書を読む（廃止した画面を除く）。画面が多いときは、設計書ごとに次の節だけを読む: 冒頭の表、「3. 権限」、「4. 画面項目」のボタン・リンクの表、「5. 初期表示時の処理」、「6. アクション」。
4. [references/flow-rules.md](references/flow-rules.md) を読む。
5. `screen-flow.drawio` がすでにあれば読む（更新として進める）。

### 2. 遷移を洗い出して見せる

図を描く前に、設計書から拾った遷移を表にして、ユーザーに見せる。図を描いてから直すより、ここで合意したほうが早いため。

| 遷移元 | きっかけ | 遷移先 | 開き方 | ラベル |
| --- | --- | --- | --- | --- |
| SCR-001 イベント一覧 | 「イベントを作成」ボタン | SCR-002 イベント編集 | 同一タブ | 新規作成 |
| SCR-001 イベント一覧 | 「オンライン会場」リンク | 外部: オンライン会場（イベントの配信 URL） | 別タブ | 別タブ |
| SCR-002 イベント編集 | 「削除」ボタン | SCR-001 イベント一覧 | 同一タブ | - |

あわせて、次も伝える。

- 「図に描いていない遷移」のメモに書くもの（エラーのときの遷移、初期表示での自動の遷移）
- 遷移先に設計書がなく、外部として描くもの（ヘルプなど）
- 設計書の記述があいまいで、遷移先を決めきれないもの（質問の形で）。答えで決まったことは、設計書にも反映すべきかを伝える（設計書は `/write-screen-spec` で直す）

### 3. 図を描く

1. 保存先の `screen-flow.drawio` に、規則の「部品と形」「遷移の描き方」「図に描いていない遷移」「配置」「XML の書き方」に従って書く。
2. すでにファイルがあるときは、規則の「更新するとき」に従う。先に、文言で照合してきっかけの ID を今の部品番号に付け替え、そのうえで ID が同じ部品の位置は変えない。ユーザーが draw.io で配置を直しているかもしれないため。
3. `overview.md` の冒頭のファイルの表に `screen-flow.drawio` の行がなければ足す（`| [screen-flow.drawio](screen-flow.drawio) | 画面遷移図（draw.io） |`）。

### 4. 確かめる

規則の「描き終えたら確かめること」を行う。

1. XML として正しいこと、ID が重複していないこと、矢印の `source` と `target` が存在する ID を指していることを、Bash で確かめる。
2. 手順 2 の表の遷移と、図の矢印を 1 つずつ突き合わせる。
3. ブラウザを操作するツール（built-in browser、Claude in Chrome、Playwright の MCP など）が使える場合は、draw.io のビューアで開いて、部品が重なっていないか、矢印が読めるかを確かめる。使えない場合は、報告で「見た目の確認は未実施」と伝える。
   - ビューアは外部のサイト（`viewer.diagrams.net`）なので、開く前に、開いてよいかをユーザーに確認する。図の内容は URL の `#` 以降に入れて渡す（`#` 以降はサーバーには送られず、ブラウザの中で描画される）が、了承なしには開かない。
   - URL は、次のコマンドで作る（XML を URL エンコードし、raw deflate で圧縮し、Base64 にしたものを `#R` の後ろに付ける）。

     ```bash
     python3 -c "import sys,zlib,base64,urllib.parse as u; x=u.quote(open(sys.argv[1],encoding='utf-8').read(),safe=''); c=zlib.compressobj(9,zlib.DEFLATED,-15); print('https://viewer.diagrams.net/?lightbox=1&nav=1#R'+u.quote(base64.b64encode(c.compress(x.encode())+c.flush()).decode(),safe=''))" <保存先>/screen-flow.drawio
     ```

### 5. 報告

次を短く報告する。

- 作成・更新したファイルと、開き方（draw.io デスクトップ、または VS Code の Draw.io Integration 拡張で開ける）
- 描いた画面の数、遷移の数、「図に描いていない遷移」にまとめたもの
- 更新の場合は、足した部品・消した部品と、ID の規則に合わないため残した部品
- 見た目を確かめたかどうか。配置は最初の置き方なので、draw.io で整えてよいこと（次に更新しても位置は保たれる）
- 設計書に反映したほうがよい点
- 設計書の遷移や部品番号を変えたら、この skill をもう一度使って図を更新すること

コミットはしない。
