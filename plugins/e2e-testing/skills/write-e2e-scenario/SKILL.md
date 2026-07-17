---
name: write-e2e-scenario
description: E2E シナリオを画面単位で作る。e2e/screens.md の画面を1つ選び、コードを読んで主要ケースを提案し、調査結果 MD とシナリオ MD（自然言語）を書く。境界値は網羅せず、他テストでカバー済みの箇所は調査結果に明記して E2E から外す。ユーザーが /write-e2e-scenario と入力した時、または「E2E のシナリオを作って」「◯◯画面のシナリオを書いて」と依頼した時に呼ばれる。
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Task
---

# /write-e2e-scenario — E2E シナリオの作成（画面単位）

`e2e/screens.md` の画面を1つ選び、コードを読んで主要ケースを提案し、シナリオを書く。
実行は [/run-e2e-scenario](../run-e2e-scenario/SKILL.md)。技術・ドメインに依存しない。

- `<screen>` は `screens.md` の slug。1 画面 = 1 ファイル。
- 引数: `$ARGUMENTS`（未指定なら `screens.md` の一覧を提示して選んでもらう）
- ビューポート: mobile 390×844 / tablet 768×1024 / desktop 1440×900（プロジェクトで上書き可）。
  各シナリオは幅で UI が変わる箇所に応じて対象を選ぶ（例: mobile と desktop。tablet は切替がある画面のみ）。
- 大きい画面はコード調査を Task（サブエージェント）で並列化してよい。

## 手順

1. **調査**: 対象画面のコードを読み、`e2e/research/<screen>.md` に書く。
   - 主要な操作フローと、成功時に画面で観測できる結果（表示文言・URL・状態変化）
   - レスポンシブ挙動（幅で UI が切り替わる箇所・確認すべきビューポート）
   - 他テスト（`*.test.*` / spec 等）でカバー済みの箇所 → E2E から外す旨を明記
2. **提案 → シナリオ**: 「E2E にすべき主要ケース」を提案し、`e2e/scenarios/<screen>.md` に書く。
   - 各シナリオ = **対象ビューポート → 前提 → 手順 → 期待結果**
   - 手順は画面に見えるラベルで指示（セレクタ等の実装詳細は書かない）
   - 期待結果は観測可能な形で。ビューポート差があれば明記
   - 認証が要る画面は、前提に「ログイン済み状態が必要」と明記する（実行時にユーザーへ依頼される）
3. パスと「E2E から外した箇所」を提示し、[/run-e2e-scenario &lt;screen&gt;](../run-e2e-scenario/SKILL.md) を案内。

## research/&lt;screen&gt;.md の書式

```markdown
# 調査: <screen>（対象: `/xxx` / 認証: 要/不要）
## 操作フローと観測結果
- <操作> → 観測できる結果（表示文言 / URL / 状態変化）
## レスポンシブ
- <幅> で <UI の切替>。確認すべきビューポート: …
## E2E から外す（他テストでカバー済み）
- <箇所>（根拠: `path/to/foo.test`）
```

## scenarios/&lt;screen&gt;.md の書式

```markdown
# シナリオ: <screen>
対象: `/xxx` / 認証: 不要 ／ 調査: [research/<screen>.md](../research/<screen>.md)

## S1. <代表フロー>
- 対象ビューポート: mobile(390) と desktop(1440)
- 前提: （認証が要る画面はログイン済み状態）
- 手順: 1. `/xxx` を開く 2. 「◯◯」を押す …
- 期待結果: 「△△」が表示される / URL が `/yyy` / レイアウトが崩れない
```

## やらないこと

画面一覧の作成（/list-e2e-screens）・実行（/run-e2e-scenario）・テストコード。
境界値の網羅、他テストでカバー済み箇所の重複、対象ビューポートの書き忘れ。
