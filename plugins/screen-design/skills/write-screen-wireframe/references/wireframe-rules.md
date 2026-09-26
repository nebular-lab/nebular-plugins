# ワイヤーフレームの記述規則

ワイヤーフレームは「何が、どの順に、どこに並ぶか」を示す図。見た目の作り込みはせず、共通の `wireframe.css` の範囲で描く。誰が描いても同じ見た目になるように、使える要素とクラスを決めておく。

## ファイル

- 1 画面 1 ファイル。`docs/screens/SCR-NNN_<slug>.html`。ID と slug は設計書（`.md`）と同じにする。
- `<head>` は [template.html](../assets/template.html) のまま。`<title>` だけ `SCR-NNN 画面名` に変える。
- `wireframe.css` は `docs/screens/wireframe.css` を共有する。

## 禁止事項

見た目の自由度を上げると実装の議論に寄っていくため、次は使わない。

- `style` 属性、`<style>` 要素、独自のクラス
- `<script>`、イベント属性（`onclick` など）
- 外部の画像・フォント・アイコン（`<img>` も使わず、画像は `.image` で表す）

`wireframe.css` で表せないものは `.note` に言葉で書く（例: 「ここに地図」「グラフ（月別の売上）」）。

## 使える要素とクラス

HTML の要素はそのまま使ってよい。フォームの部品は本物の `input` や `select` を使う。

状態を表すために、`value`、`placeholder`、`checked`、`selected`、`disabled`、`colspan` の属性は使ってよい。編集不可の入力欄や非活性のボタンは `disabled` を付けると点線・グレーで表示される。

| 用途 | 書き方 |
| --- | --- |
| 画面の枠 | `<section class="screen" data-title="状態名">`。PC 画面は `class="screen pc"` |
| 領域 | `<header>`、`<footer>`、`<nav>`、`<aside>`、その他のまとまりは `<div class="box">` |
| 横並び | `.row`（両端寄せは `.row.between`）。伸ばしたい子に `.grow` |
| 均等な列 | `.cols-2`、`.cols-3`、`.cols-4` |
| 縦並び | `.stack` |
| 下に寄せる | 手前に `<div class="spacer"></div>` |
| 見出し・文 | `<h1>`〜`<h3>`、`<p>`、`<strong>`、`<small>`、補足は `.muted` |
| リンク | `<a>`（`href` は付けない） |
| 入力欄 | `<label class="field">ラベル<input ...></label>`。`type` は text、email、password、number、date、search など実際に近いもの |
| 複数行入力 | `<label class="field">ラベル<textarea></textarea></label>` |
| 選択 | `<label class="field">ラベル<select><option>…</option></select></label>` |
| チェック・ラジオ | `<label class="check"><input type="checkbox">ラベル</label>` |
| ボタン | `<button>`、主ボタンは `<button class="primary">` |
| 画像 | `<div class="image">画像の説明</div>`。一覧の小さい画像は `.image.thumb` |
| アイコン | `<span class="icon">記号 1 文字</span>`（例: ≡、人、×、←） |
| 一覧 | `<ul class="list"><li>…</li></ul>` |
| 表 | `<table>`、`<th>`、`<td>` |
| タブ | `<div class="tabs"><span class="active">…</span><span>…</span></div>` |
| 言葉での説明 | `<div class="note">…</div>` |
| エラー文言 | 入力欄の `label` の中、入力欄の後ろに `<small class="error">文言</small>` |
| モーダル | `<div class="modal"><div class="dialog">…</div></div>`。`.screen` の中に置く |

## 部品番号

番号は設計書の No と共通。ワイヤーフレームで振った番号を、設計書でもそのまま使う。

- 番号を振る要素に `data-no="3"` を付けると、左上に赤い番号が出る。
- 振り順は、画面の上から下、同じ高さなら左から右。
- `input` や `select` には番号が表示されないので、包んでいる `label` に付ける。
- 番号は 1 から始まる整数の通し番号だけを使う。`5-1` のような枝番は使わない。
- 入れ子の部品も通し番号で振る。まとまり（一覧、ヘッダーなど）に番号を振ったら、その中の部品には続きの番号を振る（例: 一覧が 8 なら、1 行目のタイトルは 9、ステータスは 10）。
- 繰り返す部品（一覧の行など）は、1 行目の中の部品にだけ番号を振る。2 行目以降には振らない。
- モーダルは `.modal` ではなく `.dialog` に番号を振る。
- エラー文言（`.error`）には番号を振らない。エラーはメッセージとして設計書で扱うため。
- ヘッダーやフッターのように全画面で共通の領域は、まとまりで 1 つ番号を振る。中の部品は、その画面で意味を持つもの（ユーザー名、リンクなど）にだけ番号を振る。
- 番号を振るのは、利用者が見る・操作する部品。レイアウトのための `.row` や `.spacer` には振らない。

## 状態

- 通常の状態は必ず描き、最初の `.screen` に置く。`data-title` は「通常」で始める（補足は括弧で書く。例: `通常（公開済みを編集）`）。
- 読み込み中・データなし・エラー・モーダル表示など、見た目が大きく変わる状態は、`.screen` を横に並べて描く。`data-title` に状態名を書く。
- 2 つ目以降の `.screen` では、その状態で初めて出る部品にだけ番号を付け、通常と同じ部品には付けない（重複して読みにくくなるため）。
- ある状態でしか出ない部品の番号は、画面上の位置に合わせて通常の番号の間に割り込ませる（例: 会場名が配信 URL の上に出るなら、会場名を 10、配信 URL を 11 にする）。通常の状態の `.screen` では、その番号が欠番に見えてよい。

## モーダルだけの画面

独立した操作があり、別の画面 ID を振るモーダルは、次のように描く。

- `.screen` の中に、親画面を示す `<div class="note">親画面: SCR-NNN 画面名</div>` だけを置き、その上に `.modal` を重ねる。親画面の部品は描かない（親画面のワイヤーフレームで描くため）。
- 番号は `.dialog` を 1 番にし、その中の部品に続きの番号を振る。親画面を示す `.note` には振らない。
- 状態違い（入力エラーなど）も、同じ形の `.screen` を横に並べて描く。

```html
<section class="screen" data-title="通常">
  <div class="note">親画面: SCR-002 イベント編集</div>
  <div class="modal">
    <div class="dialog" data-no="1">
      <h2 data-no="2">参加者を追加</h2>
      <label class="field" data-no="3">メールアドレス<input type="email"></label>
      <div class="cols-2"><button data-no="4">キャンセル</button><button class="primary" data-no="5">追加する</button></div>
    </div>
  </div>
</section>
```

## 中身の文字

- ラベル・ボタン名・見出しは、実際に表示する文言で書く。「ボタン」「テキスト」のような仮の語は使わない。
- 一覧や表のデータは、それらしい例を 2〜3 件入れる。件数が多いことを示したいときは最後に `<li class="muted">…</li>` を置く。
- 決まっていない文言は `TBD` と書く。
