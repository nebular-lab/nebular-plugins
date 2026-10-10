---
name: write-screen-e2e
description: 画面設計書（Markdown）とワイヤーフレーム（HTML）から、Playwright の E2E テストコードを 1 画面ずつ生成する。API はすべて page.route() でモックし、バックエンドとは通信しない。設計書のどの記述からどのテストケースを作るかを規則で決め、テスト名に出典を付けて、どんなケースがあるかを明確にする。
argument-hint: "[画面 ID・設計書のパス]"
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

# /write-screen-e2e — 画面の E2E テストの生成（1 画面ずつ）

`/write-screen-spec` で書いた画面設計書と、`/write-screen-wireframe` で描いたワイヤーフレームから、Playwright のテストコードを生成する。目的は「どのテストケースを作るか」を明確にすること。設計書の記述から機械的にケースを洗い出し、テスト名の先頭に出典（設計書のどこから来たケースか）を、項目名・操作名・メッセージの文言で付けるので、テストコードを読めばケースの一覧になる。

- バックエンドとは通信しない。ブラウザからの API 通信（fetch / XHR）をすべてモックする（[assets/api-mock.ts](assets/api-mock.ts)）。
- サーバー側で API を呼ぶ画面（SSR）と、API のモックだけでは開けない認証が必要な画面は対象外。
- 部品は、ワイヤーフレームの文言と設計書のタグから、役割と文言（`getByRole`、`getByLabel`）で特定する。
- 生成したテストは実行しない。型チェックと、テスト一覧の出力（`playwright test --list`）までを行う。画面がまだ実装されていなくても使えるようにするため。

以下の相対パスは、この skill を読み込んだときに示される Base directory（この SKILL.md があるディレクトリ）を起点にする。

- テストケースの作り方: [references/test-case-rules.md](references/test-case-rules.md)
- モックの補助関数: [assets/api-mock.ts](assets/api-mock.ts)
- 漏れチェックのプロンプト: [references/coverage-check.md](references/coverage-check.md)
- サンプル: [../../examples/e2e/](../../examples/e2e/)（`screens/SCR-002_event-edit.spec.ts` が、[../../examples/docs/screens/SCR-002_event-edit.md](../../examples/docs/screens/SCR-002_event-edit.md) から生成したもの）

## 引数

`/write-screen-e2e [画面 ID・設計書のパス]`

画面 ID がなければ、画面一覧（`overview.md` の「画面一覧」）を見せてどの画面かを聞く。

## 手順

### 1. 入力を集める

1. 画面設計書（`SCR-NNN_<slug>.md`）とワイヤーフレーム（`SCR-NNN_<slug>.html`）を探して読む。既定の置き場所は `docs/screens/`。ワイヤーフレームがなければ、設計書だけで進めてよいかを確認する（部品の文言が推測になるため）。
2. 設計書の「API 定義」にある OpenAPI 定義から、この画面が呼ぶ操作のスキーマ（リクエスト・レスポンス・エラーの形）を読む。定義が大きいときは Grep で該当の操作だけを読む。
3. 共有ファイルを読む。メッセージ一覧（`messages.md`。設計書が参照している ID の文言と変数）と、共通ルール（`common-rules.md`。「入力」の節と「アクセシビリティ」のルールから、ケースを作る）。
4. [references/test-case-rules.md](references/test-case-rules.md) と、`write-screen-spec` の [writing-rules.md](../write-screen-spec/references/writing-rules.md) を読む。

### 2. Playwright の環境を確かめる

1. `playwright.config.*` を探し、`testDir` と `use.baseURL` を確かめる。複数ある（モノレポなど）ときは、どれを使うかをユーザーに聞く。
   - 設定がなければ、Playwright を導入するかをユーザーに確認する。勝手にインストールしない。
2. 実装があれば、この画面が対象外（SSR、モックだけでは開けない認証）でないかを確かめる。サーバー側のデータ取得（Next.js の Server Components や `getServerSideProps`、Nuxt の `useAsyncData` のサーバー実行など）や、画面を開く前にトークンや Cookie を必要とする作りなら、ユーザーに伝えて止まる。
3. アプリが API を呼ぶ先のベース URL を確かめる（環境変数、API クライアントの設定、OpenAPI の `servers` など）。わからなければユーザーに聞く。
   - 別のオリジンの API なら、そのオリジンとパス（例: `https://api.example.com/v1`）。
   - 画面と同じオリジンで `/api` などの相対パスで呼ぶなら、画面のオリジンとそのパス（例: `http://localhost:3000/api`）。接頭辞がなく画面と同じパスの空間で呼ぶなら、画面のオリジンだけ（例: `http://localhost:3000`）。モックは fetch / XHR だけを横取りするので、画面の HTML や JS は通る。
   - テストでは `E2E_API_BASE_URL` で渡す前提にし、決まった値を報告に書く。
4. テストの置き場所を決める。`testDir` の下に `screens/`（画面のテスト）と `support/`（補助関数）を置く。
5. `support/api-mock.ts` がなければ、[assets/api-mock.ts](assets/api-mock.ts) をコピーし、`API_BASE_URL` の既定値を 3. の値にする。すでにあれば触らない。

### 3. テストケースを洗い出し、骨組みを書いて見せる

コードの中身を書く前に、テストケースを洗い出して合意する。目的は「どのケースを作るか」を明確にすることなので、ここで合意しておく。1 画面で 100 件を超えることもあるので、全件はチャットに並べず、ファイルで見てもらう。

1. 設計書を上から読み、[references/test-case-rules.md](references/test-case-rules.md) の分類ごとに、テスト名（出典付き）を洗い出す。
2. `testDir/screens/SCR-NNN_<slug>.spec.ts` に、全ケースを中身のない `test.fixme('テスト名', async () => {})` として書いた骨組みを作る。ケースの配列でまとめるものは、配列まで書く。
3. `npx playwright test --list <ファイル>` でテスト一覧を出す。
4. チャットでは次だけを見せる。
   - 分類ごとの件数と、骨組みのファイルのパス（全件はファイルと一覧で見てもらう）
   - 最終的にも `test.fixme()` のまま残すもの（TBD、自動で確かめられないもの）と理由
   - 規則から機械的に決まらず、判断したこと
   - 設計書の記述があいまいで、期待値を決めきれないもの（質問の形で）。ユーザーの答えで決まった期待値は、設計書にも反映すべきかを伝える（設計書は `/write-screen-spec` で直す）
5. 足りないケース・要らないケースを指摘してもらい、骨組みを直す。

### 4. テストコードを書く

1. 3. の骨組みの `test.fixme()` を、中身のある `test()` に置き換えていく。構成（メッセージ、テストデータ、部品、画面を開く関数、`test.use()`、`test.describe` の分け方）は [references/test-case-rules.md](references/test-case-rules.md) の「ファイルの構成」とサンプルに合わせる。
2. 3. で合意したテスト名は変えない。最終的にも `test.fixme()` のまま残すものだけ残す。
3. ファイルの先頭のコメントに、設計書・ワイヤーフレームのパス、出典の読み方、実装についての前提（test-case-rules.md の「実装についての前提」）を書く。
4. 設計書の保存先の `overview.md` の「画面一覧」で、この画面の行の「E2E テスト」の列を、テストファイルへのリンクにする（`[SCR-002_event-edit.spec.ts](../../e2e/screens/SCR-002_event-edit.spec.ts)`。パスは `overview.md` から見た相対パス）。
5. 既存のテストファイルを更新する場合は、設計書から消えたケースを削除し、増えたケースを足す。設計書の部品番号が変わっていたら、コメントの部品番号（`// No.7`）も直す。手で足されたテスト（出典のないテスト）は消さずに残し、報告で伝える。

### 5. 型チェックとテスト一覧

1. 型チェックをする。`playwright test --list` は型を見ないので、必ず `tsc` を使う。
   - プロジェクトの `tsconfig.json` が、テストのファイルを含んでいれば `npx tsc --noEmit -p <tsconfig>`。
   - 含んでいない、または `tsconfig.json` がなければ、一時的な tsconfig を `testDir` の中に作って（例: `<testDir>/tsconfig.e2e-check.json`）、`npx tsc --noEmit -p <その tsconfig>` する。プロジェクトの外に置くと、`@playwright/test` や `@types/node` を `node_modules` から見つけられず失敗するため。終わったら消す。中身は次のとおり。

     ```json
     {
       "compilerOptions": { "strict": true, "noEmit": true, "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler", "types": ["node"], "skipLibCheck": true },
       "include": ["screens/SCR-NNN_<slug>.spec.ts", "support/api-mock.ts"]
     }
     ```
   - `tsc` や `@types/node` がプロジェクトになければ、入れてよいかをユーザーに確認する。
2. `npx playwright test --list <ファイル>` でテスト一覧を出し、3. で合意した件数と一致することを確かめる。
3. 失敗したら直して繰り返す。テストは実行しない。

### 6. 漏れを確かめる

[references/coverage-check.md](references/coverage-check.md) のプロンプトを埋めてサブエージェントに渡し、ケースの漏れと誤りを探させる。「漏れ」「誤り」を直し、もう一度チェックする。チェックは最大 3 回までにし、それでも残ったものは報告でユーザーに伝える。

### 7. 報告

次を短く報告する。

- 作成・更新したファイル（テストコード、`support/api-mock.ts` をコピーしたか）
- 分類ごとのケース数と、`test.fixme()` の一覧（理由付き）
- 型チェックと漏れチェックの結果
- 実行に必要なこと（アプリの起動方法、`baseURL`、`E2E_API_BASE_URL` の値）
- 設計書に反映したほうがよい点（期待値を決めるためにユーザーに確認したことなど）
- 設計書を直したら、この skill をもう一度使ってテストを更新すること

コミットはしない。
