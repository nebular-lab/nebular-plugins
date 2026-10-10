# 画面設計の概要

このディレクトリには、画面の設計書と、それに関わるファイルを置いている。

| ファイル | 内容 |
| --- | --- |
| [messages.md](messages.md) | メッセージ一覧。全画面で共通のメッセージ ID と文言 |
| [common-rules.md](common-rules.md) | 共通ルール。全画面で同じになる扱い（入力、react-hook-form と TanStack Query の設定など） |
| [screen-flow.drawio](screen-flow.drawio) | 画面遷移図（draw.io） |
| [wireframe.css](wireframe.css) | ワイヤーフレームの共通スタイル |
| [openapi.yaml](../api/openapi.yaml) | API 定義（OpenAPI） |

## 画面一覧

| 画面 ID | 画面名 | URL | ワイヤーフレーム | 設計書 | Playwright テスト |
| --- | --- | --- | --- | --- | --- |
| SCR-001 | イベント一覧 | /events | [SCR-001_event-list.html](SCR-001_event-list.html) | [SCR-001_event-list.md](SCR-001_event-list.md) | [SCR-001_event-list.spec.ts](../../playwright-test/screens/SCR-001_event-list.spec.ts) |
| SCR-002 | イベント編集 | /events/{eventId}/edit | [SCR-002_event-edit.html](SCR-002_event-edit.html) | [SCR-002_event-edit.md](SCR-002_event-edit.md) | [SCR-002_event-edit.spec.ts](../../playwright-test/screens/SCR-002_event-edit.spec.ts) |
| SCR-003 | イベント詳細 | /events/{eventId} | [SCR-003_event-detail.html](SCR-003_event-detail.html) | [SCR-003_event-detail.md](SCR-003_event-detail.md) | [SCR-003_event-detail.spec.ts](../../playwright-test/screens/SCR-003_event-detail.spec.ts) |
| SCR-004 | イベント作成 | /events/new | [SCR-004_event-create.html](SCR-004_event-create.html) | [SCR-004_event-create.md](SCR-004_event-create.md) | [SCR-004_event-create.spec.ts](../../playwright-test/screens/SCR-004_event-create.spec.ts) |
