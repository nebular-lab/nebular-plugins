---
name: list-e2e-screens
description: E2E の対象となる画面一覧を作る。コードのルーティング定義を読んで画面ごとに URL・認証要否・動的パラメータを洗い出し、e2e/screens.md に一覧化する。ヘルスチェック・API・sitemap など画面でないものは除外する。ユーザーが /list-e2e-screens と入力した時、または「画面一覧を出して」「E2E の対象画面を洗い出して」と依頼した時に呼ばれる。
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
---

# /list-e2e-screens — 画面一覧の作成

コードのルーティング定義を読んで、E2E 対象の画面一覧を `e2e/screens.md` に書く。
E2E は日本語シナリオを AI が Playwright MCP でデプロイ環境に対して実行する仕組みで、
この skill はその起点。技術・ドメインに依存しない。

## 手順

1. プロジェクトのルーティングを特定して読む（ファイルベースルーター / ルート定義 / 生成物 等）。
   **推測せず、根拠のある URL** を列挙する。
2. 各画面の**認証要否**（ルートガード・ミドルウェア・リダイレクト等から判定）と、
   **動的パラメータ**（`:id` 等の開き方）を確認する。
3. **画面でないもの**（ヘルスチェック・API・sitemap・静的アセット）は除外する。
4. `e2e/screens.md` を作成 / 更新する。ルートが増減したら再実行。
   完了後、[/write-e2e-scenario &lt;screen&gt;](../write-e2e-scenario/SKILL.md) を案内する。

## screens.md の書式

```markdown
# 画面一覧（E2E 対象）
更新日: YYYY-MM-DD / 取得元: <ルート定義> / デプロイ環境 URL: <https://...>

| screen | URL | 認証 | 動的パラメータ / 開き方 | 備考 |
|--------|-----|------|------------------------|------|
| home | `/` | 不要 | — | |
| login | `/login` | 不要 | — | |
| dashboard | `/dashboard` | 要 | — | ログイン必須 |
| item-detail | `/items/:id` | 要 | :id=（取得方法） | |

## 非画面（対象外）
- `/health`（ヘルスチェック） / `/api/*`（API） / `/sitemap.xml`
```

## やらないこと

シナリオ作成（/write-e2e-scenario）・実行（/run-e2e-scenario）。画面でないものを一覧に混ぜる。URL の推測。
