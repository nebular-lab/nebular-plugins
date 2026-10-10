# 画面設計の概要

このディレクトリには、画面の設計書と、それに関わるファイルを置いている。画面ごとのファイル（ワイヤーフレーム、設計書、Playwright テスト）は、画面 ID のフォルダの中にある。

| ファイル | 内容 |
| --- | --- |
| [messages.md](messages.md) | メッセージ一覧。全画面で共通のメッセージ ID と文言 |
| [common-rules.md](common-rules.md) | 共通ルール。全画面で同じになる扱い（入力、react-hook-form と TanStack Query の設定など） |
| [wireframe.css](wireframe.css) | ワイヤーフレームの共通スタイル |

## 画面一覧

| 画面 ID | 画面名 | URL | ワイヤーフレーム | 設計書 | Playwright テスト |
| --- | --- | --- | --- | --- | --- |
| SCR-001 | ログイン | /login | [SCR-001_login.html](SCR-001_login/SCR-001_login.html) | [SCR-001_login.md](SCR-001_login/SCR-001_login.md) | - |
