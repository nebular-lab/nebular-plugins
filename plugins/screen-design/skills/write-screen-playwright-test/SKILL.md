---
name: write-screen-playwright-test
description: 画面設計書（Markdown）とワイヤーフレーム（HTML）から、Playwright のテストコードを 1 画面ずつ生成する。API はすべてモックし、バックエンドとは通信しない。設計書のどの記述からどのテストケースを作ったかをテスト名に付けて、どんなケースがあるかを明確にする。
argument-hint: "[画面 ID・設計書のパス]"
disable-model-invocation: true
---

# /write-screen-playwright-test — 画面の Playwright テストの生成（1 画面ずつ）

`/write-screen-spec` で書いた画面設計書から、Playwright のテストコードを生成する。目的は「どのテストケースを作るか」を明確にすること。テスト名の先頭に出典を付けるので、テストコードを読めばケースの一覧になる。生成したテストは実行しない。

以下の相対パスは、この SKILL.md があるディレクトリを起点にする。

- テストケースの作り方: [references/test-case-rules.md](references/test-case-rules.md)
- モックの補助関数: [assets/api-mock.ts](assets/api-mock.ts)
- 漏れチェックのプロンプト: [references/coverage-check.md](references/coverage-check.md)
- サンプル: [../../examples/playwright-test/](../../examples/playwright-test/)（[../../examples/docs/screens/](../../examples/docs/screens/) の設計書から作ったもの。構成と書き方は、まずサンプルに合わせる）

## 手順

1. **入力を集める**: 対象の画面の設計書とワイヤーフレーム、`messages.md`、`common-rules.md`、OpenAPI 定義（`overview.md` の冒頭の表から探す）を読む。規則と、サンプルのテストコードを 1 つ読む。
2. **Playwright の環境を確かめる**
   - `playwright.config.*` から、テストの置き場所と画面のベース URL を確かめる。設定がなければ、導入するかをユーザーに確認する（勝手にインストールしない）。
   - この画面が対象外（規則の「前提」）でないかを確かめる。
   - アプリが API を呼ぶ先のベース URL を確かめる（わからなければ聞く）。テストには `PLAYWRIGHT_TEST_API_BASE_URL` で渡す。
   - テストの置き場所の下に、`screens/`（画面のテスト）と `support/`（補助）を置く。`support/api-mock.ts` がなければ、[assets/api-mock.ts](assets/api-mock.ts) をコピーする。
3. **ケースを洗い出して見せる**: 中身を書く前に、全ケースを名前だけの `test.fixme()` で並べた骨組みを `screens/SCR-NNN_<slug>.spec.ts` に作り、テスト一覧を出す。件数が多いので、会話には全件を並べず、分類ごとの件数、最後まで `test.fixme()` のまま残すもの、判断したこと、設計書があいまいで決めきれない点だけを伝える。足りないケース・要らないケースを指摘してもらう。
4. **テストコードを書く**: 骨組みを中身のあるテストに置き換える。合意したテスト名は変えない。既存のファイルを更新するときは、設計書から消えたケースを消し、増えたケースを足す。手で足されたテストは消さずに残す。
5. **型チェックとテスト一覧**: `tsc` で型チェックをする（テスト一覧の出力は型を見ない）。プロジェクトの `tsconfig.json` がテストを含んでいなければ、テストの置き場所の中に一時的な `tsconfig` を作って使い、終わったら消す。テスト一覧を出し、件数と、名前の重複がないことを確かめる。
6. **漏れを確かめる**: [references/coverage-check.md](references/coverage-check.md) のプロンプトをサブエージェントに渡し、返ってきた漏れと誤りを直す（チェックは最大 3 回）。
7. **報告**: 作ったファイル、分類ごとの件数、`test.fixme()` の一覧と理由、確認の結果、実行に必要なこと、設計書に反映したほうがよい点。`overview.md` の画面一覧に、テストファイルへのリンクを足す。コミットはしない。
