# SCR-003 イベント詳細

| 項目 | 内容 |
| --- | --- |
| 画面 ID | SCR-003 |
| 画面名 | イベント詳細 |
| URL | `/events/{eventId}` |
| document.title | イベント詳細 |
| 共通ヘッダー | [HDR-001 ログイン後のヘッダー](../HDR-001_app-header/HDR-001_app-header.md)（v1: イベント詳細） |
| 初期フォーカス | - |
| ワイヤーフレーム | [SCR-003_event-detail.html](SCR-003_event-detail.html) |
| 更新日 | 2026-10-10 |

## 1. 概要

イベントの内容を確かめる画面。編集できる利用者は、ここからイベントの編集に進むか、イベントを削除する。

## 2. クエリパラメータ

なし

## 3. 閲覧権限

| 利用者の種類 | 閲覧 |
| --- | --- |
| admin | ○ |
| organizer | ○ |
| member | ○ |
| 未ログイン | × |

## 4. 画面項目

### 入力項目

なし

### ボタン・リンク

| No | 項目名 | タグ | `type` | `href` | `target` | 表示条件 | `disabled` | その他の属性 | 備考 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 「← 一覧へ戻る」 | `a` | - | `/events`（SCR-001 イベント一覧） | - | 常に表示 | - | - | - |
| 20 | 「編集」 | `button` | `button` | - | - | `GET /me` の `role` が `admin` のとき、または `GET /events/{eventId}` の `organizerId` が `GET /me` の `id` と同じとき | - | - | - |
| 21 | 「削除」 | `button` | `button` | - | - | No.20 と同じ | `GET /events/{eventId}` の `participantCount` が 1 以上のとき | - | - |
| 26 | 「キャンセル」 | `button` | `button` | - | - | No.23 を表示しているとき | - | - | - |
| 27 | 「削除する」 | `button` | `button` | - | - | No.23 を表示しているとき | - | - | - |

### テキスト

| No | 項目名 | タグ | 表示内容 | 表示条件 | その他の属性 | 備考 |
| --- | --- | --- | --- | --- | --- | --- |
| 3 | 見出し | `h1` | `GET /events/{eventId}` の `title` | 常に表示 | - | - |
| 4 | ステータス | `span` | `GET /events/{eventId}` の `status`<br>`draft` は「下書き」、`published` は「公開中」、`closed` は「終了」と表示する | 常に表示 | - | - |
| 5 | 主催者の見出し | `small` | 「主催」 | 常に表示 | - | - |
| 6 | 主催者 | `small` | `GET /events/{eventId}` の `organizerName` | 常に表示 | - | 省略表記: 31 文字以上なら、先頭 30 文字のあとに…を付ける |
| 7 | 概要 | `p` | `GET /events/{eventId}` の `summary` | `GET /events/{eventId}` の `summary` があるとき | - | - |
| 8 | カテゴリの見出し | `th` | 「カテゴリ」 | 常に表示 | `scope="row"` | - |
| 9 | カテゴリ | `td` | `GET /categories` の `items[]` のうち、`id` が `GET /events/{eventId}` の `categoryId` と同じものの `name` | 常に表示 | - | - |
| 10 | 開催形式の見出し | `th` | 「開催形式」 | 常に表示 | `scope="row"` | - |
| 11 | 開催形式 | `td` | `GET /events/{eventId}` の `format`<br>`onsite` は「会場」、`online` は「オンライン」と表示する | 常に表示 | - | - |
| 12 | 会場の見出し | `th` | 「会場」 | 常に表示 | `scope="row"` | - |
| 13 | 会場 | `td` | `GET /events/{eventId}` の `format` が `onsite` のとき、`GET /events/{eventId}` の `venueName`<br>`online` のとき、`GET /events/{eventId}` の `onlineUrl` | 常に表示 | - | - |
| 14 | 開催日の見出し | `th` | 「開催日」 | 常に表示 | `scope="row"` | - |
| 15 | 開催日 | `td` | `GET /events/{eventId}` の `startDate`<br>`YYYY/MM/DD` で表示する | 常に表示 | - | - |
| 16 | 参加者数の見出し | `th` | 「参加者」 | 常に表示 | `scope="row"` | - |
| 17 | 参加者数 | `td` | `GET /events/{eventId}` の `participantCount` と `capacity`<br>「{participantCount} / {capacity} 人」で表示する | 常に表示 | - | - |
| 18 | タグの見出し | `th` | 「タグ」 | 常に表示 | `scope="row"` | - |
| 19 | タグ | `td` | `GET /events/{eventId}` の `tags`<br>`beginner` は「初心者向け」、`hands-on` は「ハンズオン」、`networking` は「交流」、`free` は「無料」、`english` は「英語」と表示する<br>複数あるときは「、」で区切る。1 つもないときは「なし」と表示する | 常に表示 | - | - |
| 24 | 削除の確認の見出し | `h2` | MSG-017 の 1 行目 | No.23 と同じ | - | - |
| 25 | 削除の確認の文 | `p` | MSG-017 の 2 行目（v1: `GET /events/{eventId}` の `title`） | No.23 と同じ | - | 省略表記: `GET /events/{eventId}` の `title` が 21 文字以上なら、先頭 20 文字のあとに…を付ける |

### その他

| No | 項目名 | タグ | 表示内容 | 表示条件 | その他の属性 | 備考 |
| --- | --- | --- | --- | --- | --- | --- |
| 2 | 画面上部のエラー | 実装時に決める | アクションで指定したメッセージ | 「5. 初期表示時の処理」、A5 で切り替える | - | - |
| 22 | 読み込み中の表示 | `div` | スピナー | 「5. 初期表示時の処理」で切り替える | - | 内容の位置に表示する |
| 23 | 削除の確認 | 実装時に決める | - | A3 で表示し、A4、A5 で閉じる | - | 表示中は背面の操作をできなくする |

## 5. 初期表示時の処理

1. No.3〜21 の代わりに No.22 を表示する。
2. `GET /me`（operationId: `getMe`）を呼ぶ。

   リクエスト: なし

   レスポンス

   | ステータス | 処理 |
   | --- | --- |
   | 200 | `id` と `role` を画面の表示条件の判定用に保持する |
   | 401 | SCR-005 ログインへ遷移する（`redirect` に現在の URL を渡す） |
   | 上記以外 | No.22 を非表示にする<br>MSG-022 を No.2 に表示して終了する |

3. `GET /categories`（operationId: `listCategories`）を呼ぶ。

   リクエスト: なし

   レスポンス

   | ステータス | 処理 |
   | --- | --- |
   | 200 | `items[]` を No.9 の表示用に保持する |
   | 401 | SCR-005 ログインへ遷移する（`redirect` に現在の URL を渡す） |
   | 上記以外 | No.22 を非表示にする<br>MSG-022 を No.2 に表示して終了する |

4. `GET /events/{eventId}`（operationId: `getEvent`）を呼ぶ。

   リクエスト

   | 場所 | パラメータ | 値 |
   | --- | --- | --- |
   | path | `eventId` | URL パラメータ `eventId` |

   レスポンス

   | ステータス | 処理 |
   | --- | --- |
   | 200 | `organizerId` と `participantCount` を保持する<br>No.22 を非表示にする<br>No.3〜19 に、画面項目の表の表示内容を表示する<br>表示条件を満たすとき、No.20 と No.21 を表示する |
   | 401 | SCR-005 ログインへ遷移する（`redirect` に現在の URL を渡す） |
   | 403 | MSG-025 をトーストで表示する<br>SCR-001 イベント一覧へ遷移する |
   | 404 | MSG-021 をトーストで表示する<br>SCR-001 イベント一覧へ遷移する |
   | 上記以外 | No.22 を非表示にする<br>MSG-022 を No.2 に表示する |

## 6. アクション

### アクション一覧

| ID | 操作 | 対象 |
| --- | --- | --- |
| A1 | 「← 一覧へ戻る」リンク押下 | No.1 |
| A2 | 「編集」ボタン押下 | No.20 |
| A3 | 「削除」ボタン押下 | No.21 |
| A4 | 削除の確認で「キャンセル」ボタン押下 | No.26 |
| A5 | 削除の確認で「削除する」ボタン押下 | No.27 |

### A1. 「← 一覧へ戻る」リンク押下

1. No.1 の `href` へ遷移する。

### A2. 「編集」ボタン押下

1. SCR-002 イベント編集へ遷移する（`eventId` に URL パラメータ `eventId` を渡す）。

### A3. 「削除」ボタン押下

1. No.23 を表示する。

### A4. 削除の確認で「キャンセル」ボタン押下

1. No.23 を閉じる。

### A5. 削除の確認で「削除する」ボタン押下

1. No.2 を非表示にする。
2. No.27 を非活性にする。
3. `DELETE /events/{eventId}`（operationId: `deleteEvent`）を呼ぶ。

   リクエスト

   | 場所 | パラメータ | 値 |
   | --- | --- | --- |
   | path | `eventId` | URL パラメータ `eventId` |

   レスポンス

   | ステータス | 処理 |
   | --- | --- |
   | 204 | MSG-016 をトーストで表示する<br>SCR-001 イベント一覧へ遷移する |
   | 401 | SCR-005 ログインへ遷移する（`redirect` に現在の URL を渡す） |
   | 403 | No.23 を閉じる<br>MSG-020 をトーストで表示する |
   | 404 | MSG-021 をトーストで表示する<br>SCR-001 イベント一覧へ遷移する |
   | 409 | No.23 を閉じる<br>MSG-019 を No.2 に表示する |
   | 上記以外 | No.23 を閉じる<br>MSG-022 を No.2 に表示する |

4. 画面に残っているとき、No.27 の非活性を解除する。

## 7. 未決事項

- [ ] 参加の申し込みは、この画面から行うか（今は表示だけ）
