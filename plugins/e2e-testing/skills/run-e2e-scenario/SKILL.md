---
name: run-e2e-scenario
description: E2E シナリオ（自然言語 MD）を Playwright MCP でデプロイ環境に対して実行する。e2e/scenarios/ のシナリオを読み、対象ビューポートごとに手順を進め、動作のたびにスクショを撮り、期待結果を検証して結果を e2e/results/ に残す。テストコードは書かない。ユーザーが /run-e2e-scenario と入力した時、または「E2E を実行して」「◯◯のシナリオを回して」と依頼した時に呼ばれる。
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Glob
  - Bash
  - mcp__plugin_e2e-testing_playwright__browser_navigate
  - mcp__plugin_e2e-testing_playwright__browser_snapshot
  - mcp__plugin_e2e-testing_playwright__browser_click
  - mcp__plugin_e2e-testing_playwright__browser_type
  - mcp__plugin_e2e-testing_playwright__browser_fill_form
  - mcp__plugin_e2e-testing_playwright__browser_select_option
  - mcp__plugin_e2e-testing_playwright__browser_press_key
  - mcp__plugin_e2e-testing_playwright__browser_wait_for
  - mcp__plugin_e2e-testing_playwright__browser_take_screenshot
  - mcp__plugin_e2e-testing_playwright__browser_console_messages
  - mcp__plugin_e2e-testing_playwright__browser_resize
---

# /run-e2e-scenario — E2E シナリオの実行（Playwright MCP / デプロイ環境）

[/write-e2e-scenario](../write-e2e-scenario/SKILL.md) が書いたシナリオを **Playwright MCP** で実行する。
対象は**デプロイ環境**（staging 等。URL は `screens.md` から）。

- 引数: `$ARGUMENTS`（`<screen>` / 任意でシナリオ番号。未指定なら `scenarios/` の一覧を提示）
- ビューポート: mobile 390×844 / tablet 768×1024 / desktop 1440×900。
- 本文の `browser_*` は `mcp__plugin_e2e-testing_playwright__browser_*` の略記。
- 日付取得・`e2e/results/` の作成には `Bash`（`date +%F` / `mkdir`）を使う。

## 手順

1. `e2e/scenarios/<screen>.md` を読む。デプロイ環境 URL を確認する。
   **認証が要る画面は、ログインが必要な旨をユーザーに伝え、ログイン済みの状態を用意してもらう**
   （認証情報は AI が入力しない）。用意できなければそのシナリオは BLOCKED とする。
2. シナリオごと × 対象ビューポートごとに実行する:
   - `browser_resize` でビューポート設定 → `browser_navigate` で URL を開く
   - 操作の前に `browser_snapshot` で要素を特定（座標クリックは避ける）、
     非同期は `browser_wait_for` で待つ
   - **動作のたびに `browser_take_screenshot`**（開いた直後・各操作後・最終状態）。
     保存名 `e2e/results/YYYY-MM-DD-<screen>/s1-mobile-01-<step>.png`
   - 期待結果を snapshot / 表示 / URL で検証。レイアウト崩れも各サイズで確認
   - 要素が見つからない時は座標に頼らず、`browser_snapshot` を撮り直して `browser_wait_for` で待つ
3. 判定する。**FAIL を勝手にコード修正で PASS にしない**。
   - **PASS**: 期待結果を観測できた
   - **FAIL**: 操作は完了したが期待結果と異なる（差分・console エラーを記録）
   - **BLOCKED**: 環境要因で手順を進められない（URL 到達不可・要ログイン未用意・要素が現れ続けない）。
     詰まった手順番号を残す
4. `e2e/results/YYYY-MM-DD-<screen>.md` に結果を書く（**スクショを相対パスで埋め込む**）。
5. サマリーを提示。**落ちたものは FAIL と正直に報告**。

## results の書式

```markdown
# 実行結果: <screen>（YYYY-MM-DD / 対象環境: https://...）
サマリー: PASS n / FAIL n / BLOCKED n

## S1 — mobile: PASS / desktop: FAIL
| # | 操作 | スクショ |
|---|------|----------|
| 01 | `/xxx` を開く | ![](YYYY-MM-DD-<screen>/s1-mobile-01-open.png) |
- 検証: … （FAIL 時は差分・console エラー）
```

## やらないこと

シナリオ / 一覧の作成・テストコード。FAIL の隠蔽やコードでの取り繕い。
認証情報の入力（ログインはユーザーに依頼する）。
スクショなしで PASS と書く。指定ビューポートを一部しか回さない。`results/` のコミット。
