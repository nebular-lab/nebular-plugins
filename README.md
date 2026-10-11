# nebular-plugins

Claude Code のプラグインを置いているマーケットプレイス。

## インストール

Claude Code で次を実行する。

```
/plugin marketplace add nebular-lab/nebular-plugins
/plugin install screen-design@nebular-plugins
```

## screen-design

画面の設計書を、会話しながら決まった形で作るための skill 集。どの skill も、ユーザーが `/skill 名` で呼んだときにだけ動く。

| skill | 作るもの |
| --- | --- |
| `/write-screen-common-rules` | 共通ルール（Markdown）。全画面で同じになる扱い（入力、react-hook-form と TanStack Query の設定など）を、決まった項目ごとに選択肢から選んで決める |
| `/write-screen-wireframe` | ワイヤーフレーム（簡易 HTML）。1 画面 1 ファイル。部品に番号を振る |
| `/write-screen-spec` | 画面設計書（Markdown）。1 画面 1 ファイル。ワイヤーフレームの番号と OpenAPI 定義をもとに、画面項目・初期表示時の処理・アクションを書く |
| `/write-screen-flow` | 画面遷移図（draw.io）。すべての画面設計書から、どのボタン・リンクでどの画面へ移るかを 1 枚にまとめる |
| `/write-screen-playwright-test` | Playwright のテスト。画面設計書からテストケースを洗い出し、API をモックしたテストコードを生成する |

### 使う順番

1. `/write-screen-common-rules` で共通ルールを決める（決まっていない項目は、あとから書き足せる）。
2. `/write-screen-wireframe` で画面の見た目と部品番号を決める。
3. `/write-screen-spec` で画面設計書を書く。
4. 画面がそろってきたら `/write-screen-flow` で画面遷移図を作る。
5. `/write-screen-playwright-test` で画面ごとのテストを作る。

4 と 5 はどちらが先でもよい。

### 直したあとにやり直すもの

設計書どうしは番号や文言でつながっているので、上流を直したら下流も更新する。

| 直したもの | やり直すもの |
| --- | --- |
| ワイヤーフレーム（部品を足した・消した） | `/write-screen-spec`（部品番号の付け替え）→ `/write-screen-flow`、`/write-screen-playwright-test` |
| 画面設計書の遷移（遷移先、ボタン・リンクの文言） | `/write-screen-flow` |
| 画面設計書の内容（処理、バリデーション、条件、メッセージ） | `/write-screen-playwright-test` |
| 共通ルール | 食い違う画面の `/write-screen-spec` → `/write-screen-playwright-test` |
| メッセージ一覧の文言 | そのメッセージを使っている画面の `/write-screen-playwright-test` |
| ブラウザストレージ一覧（キー、値の形式） | その項目を使っている画面の `/write-screen-playwright-test` |

### 作られるファイル

既定では `docs/screens/` に置く。画面ごとのファイルは、画面 ID のフォルダにまとめる。

| ファイル | 内容 |
| --- | --- |
| `overview.md` | 概要。ファイルの説明と、画面一覧 |
| `messages.md` | メッセージ一覧（全画面で共通） |
| `storage.md` | ブラウザストレージ一覧（ブラウザに保存する値のキーと形式。使う画面があるときだけ） |
| `common-rules.md` | 共通ルール（全画面で同じになる扱い） |
| `screen-flow.drawio` | 画面遷移図 |
| `wireframe.css` | ワイヤーフレームの共通スタイル |
| `api-mock.ts` | Playwright テストで API をモックする補助 |
| `HDR-NNN_<slug>/` | 共通ヘッダー（複数の画面で使うヘッダー。種類ごとに、ワイヤーフレーム・設計書・Playwright テスト） |
| `SCR-NNN_<slug>/SCR-NNN_<slug>.html` | ワイヤーフレーム |
| `SCR-NNN_<slug>/SCR-NNN_<slug>.md` | 画面設計書 |
| `SCR-NNN_<slug>/SCR-NNN_<slug>.spec.ts` | Playwright テスト |

### サンプル

イベント管理の 5 画面（一覧、編集、詳細、作成、ログイン）と、共通ヘッダー 2 種類で作った例が [plugins/screen-design/examples/](plugins/screen-design/examples/) にある。

- [docs/screens/](plugins/screen-design/examples/docs/screens/): 共有ファイル、画面遷移図と、画面ごとのフォルダ（ワイヤーフレーム、画面設計書、Playwright テスト）
- [docs/api/openapi.yaml](plugins/screen-design/examples/docs/api/openapi.yaml): API 定義

## 開発

プラグインの中の TypeScript（Playwright テストのサンプルとモックの補助関数）を型チェックする。

```bash
npm install
npm run typecheck
```
