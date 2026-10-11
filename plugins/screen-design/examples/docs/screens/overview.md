# 画面設計の概要

このディレクトリには、画面の設計書と、それに関わるファイルを置いている。画面ごと・共通ヘッダーごとのファイル（ワイヤーフレーム、設計書、Playwright テスト、手動テスト）は、それぞれの ID のフォルダの中にある。

| ファイル | 内容 |
| --- | --- |
| [messages.md](messages.md) | メッセージ一覧。全画面で共通のメッセージ ID と文言 |
| [common-rules.md](common-rules.md) | 共通ルール。全画面で同じになる扱い（入力、react-hook-form と TanStack Query の設定など） |
| [screen-flow.drawio](screen-flow.drawio) | 画面遷移図（draw.io） |
| [wireframe.css](wireframe.css) | ワイヤーフレームの共通スタイル |
| [api-mock.ts](api-mock.ts) | Playwright テストで API をモックする補助 |
| [openapi.yaml](../api/openapi.yaml) | API 定義（OpenAPI） |

## 共通ヘッダー

複数の画面で使うヘッダー。種類ごとに、画面と同じ形でワイヤーフレームと設計書を作る。どの画面がどのヘッダーを使うかは、下の画面一覧の「共通ヘッダー」に書く。

| ヘッダー ID | ヘッダー名 | ワイヤーフレーム | 設計書 | Playwright テスト | 手動テスト |
| --- | --- | --- | --- | --- | --- |
| HDR-001 | ログイン後のヘッダー | [HDR-001_app-header.html](HDR-001_app-header/HDR-001_app-header.html) | [HDR-001_app-header.md](HDR-001_app-header/HDR-001_app-header.md) | [HDR-001_app-header.spec.ts](HDR-001_app-header/HDR-001_app-header.spec.ts) | [HDR-001_app-header.manual-test.md](HDR-001_app-header/HDR-001_app-header.manual-test.md) |
| HDR-002 | ログイン前のヘッダー | [HDR-002_public-header.html](HDR-002_public-header/HDR-002_public-header.html) | [HDR-002_public-header.md](HDR-002_public-header/HDR-002_public-header.md) | - | - |

## 画面一覧

| 画面 ID | 画面名 | URL | 共通ヘッダー | ワイヤーフレーム | 設計書 | Playwright テスト | 手動テスト |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SCR-001 | イベント一覧 | /events | HDR-001 | [SCR-001_event-list.html](SCR-001_event-list/SCR-001_event-list.html) | [SCR-001_event-list.md](SCR-001_event-list/SCR-001_event-list.md) | [SCR-001_event-list.spec.ts](SCR-001_event-list/SCR-001_event-list.spec.ts) | [SCR-001_event-list.manual-test.md](SCR-001_event-list/SCR-001_event-list.manual-test.md) |
| SCR-002 | イベント編集 | /events/{eventId}/edit | HDR-001 | [SCR-002_event-edit.html](SCR-002_event-edit/SCR-002_event-edit.html) | [SCR-002_event-edit.md](SCR-002_event-edit/SCR-002_event-edit.md) | [SCR-002_event-edit.spec.ts](SCR-002_event-edit/SCR-002_event-edit.spec.ts) | [SCR-002_event-edit.manual-test.md](SCR-002_event-edit/SCR-002_event-edit.manual-test.md) |
| SCR-003 | イベント詳細 | /events/{eventId} | HDR-001 | [SCR-003_event-detail.html](SCR-003_event-detail/SCR-003_event-detail.html) | [SCR-003_event-detail.md](SCR-003_event-detail/SCR-003_event-detail.md) | [SCR-003_event-detail.spec.ts](SCR-003_event-detail/SCR-003_event-detail.spec.ts) | [SCR-003_event-detail.manual-test.md](SCR-003_event-detail/SCR-003_event-detail.manual-test.md) |
| SCR-004 | イベント作成 | /events/new | HDR-001 | [SCR-004_event-create.html](SCR-004_event-create/SCR-004_event-create.html) | [SCR-004_event-create.md](SCR-004_event-create/SCR-004_event-create.md) | [SCR-004_event-create.spec.ts](SCR-004_event-create/SCR-004_event-create.spec.ts) | [SCR-004_event-create.manual-test.md](SCR-004_event-create/SCR-004_event-create.manual-test.md) |
| SCR-005 | ログイン | /login | HDR-002 | [SCR-005_login.html](SCR-005_login/SCR-005_login.html) | [SCR-005_login.md](SCR-005_login/SCR-005_login.md) | [SCR-005_login.spec.ts](SCR-005_login/SCR-005_login.spec.ts) | [SCR-005_login.manual-test.md](SCR-005_login/SCR-005_login.manual-test.md) |
