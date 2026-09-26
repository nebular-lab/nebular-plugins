# 画面一覧

| 画面 ID | 画面名 | URL | 設計書 | ワイヤーフレーム |
| --- | --- | --- | --- | --- |
| SCR-001 | イベント一覧 | /events | [SCR-001_event-list.md](SCR-001_event-list.md) | [SCR-001_event-list.html](SCR-001_event-list.html) |
| SCR-002 | イベント編集 | /events/new<br>/events/{eventId}/edit | [SCR-002_event-edit.md](SCR-002_event-edit.md) | [SCR-002_event-edit.html](SCR-002_event-edit.html) |

## 入力の共通ルール

| 項目 | ルール |
| --- | --- |
| 文字数の数え方 | 見た目の 1 文字を 1 文字と数える（絵文字・結合文字も 1 文字）。全角・半角とも 1 文字 |
| 改行 | 1 文字と数える |
| 前後の空白 | 文字数に含めない。送る前に取り除く |
| 入力させない制約があるときの貼り付け | 上限を超える分は切り詰める。使用できない文字は取り除く |
| 日本語入力（IME）の変換中 | 変換を確定するまでは、入力制限も入力チェックも行わない |
