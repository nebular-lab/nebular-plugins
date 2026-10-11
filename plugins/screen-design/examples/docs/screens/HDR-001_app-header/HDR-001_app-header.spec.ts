/**
 * HDR-001 ログイン後のヘッダー の Playwright テスト
 *
 * 設計書: docs/screens/HDR-001_app-header/HDR-001_app-header.md
 * ワイヤーフレーム: docs/screens/HDR-001_app-header/HDR-001_app-header.html
 *
 * 共通ヘッダーには URL がないので、このヘッダーを使う画面を 1 つ開いて確かめる。
 * ここでは SCR-001 イベント一覧（/events。変数 v1 は「イベント一覧」）を使う。
 * 画面の側の動きは、その画面のテストで確かめるので、ここでは確かめない。
 *
 * テスト名の先頭の [...] は、設計書のどこから作ったケースかを、項目名と列名で示す。
 *   [画面名 表示内容]        … 画面項目「画面名」の表示内容
 *   [メニュー 読み上げ名]    … 画面項目「メニュー」の備考の読み上げ名
 *   [メニュー type]          … 画面項目「メニュー」の type の列
 *
 * 実装についての前提:
 * - API はブラウザから fetch か XHR で呼ぶ（すべてモックし、バックエンドとは通信しない）
 * - ヘッダーは、ヘッダーの役割（banner）で見つかる。中の部品は、役割と名前で見つかる
 * - 設計書の画面項目に書かれた属性（type）は、書かれた値になっていることを確かめる
 * - 設計書に書かれていない属性（role、aria-*、data-*）やライブラリ固有の DOM の形は前提にしない
 * - ユーザーのアイコンは飾り（alt=""）で、役割と名前では探せないので、手動テスト（HDR-001_app-header.manual-test.md）で確かめる
 */
import type { Page } from '@playwright/test';
import { test, expect, type ApiMock } from '../api-mock';

// ---- テストデータ（OpenAPI のスキーマに合わせる） ---------------------------

type User = { id: string; name: string; role: 'admin' | 'organizer' | 'member' };
const organizer: User = { id: 'u-org', name: '山田 花子', role: 'organizer' };
const emptyList = { items: [], total: 0, page: 1, perPage: 20 };

/** このヘッダーを使う画面（SCR-001 イベント一覧）と、その画面が指定する変数 v1 */
const HOST_PATH = '/events';
const HOST_SCREEN_NAME = 'イベント一覧';

// ---- 部品（番号はワイヤーフレームの data-no） -------------------------------

const ui = (page: Page) => {
  const header = page.getByRole('banner'); // No.1
  return {
    header,
    menu: header.getByRole('button', { name: 'メニューを開く', exact: true }), // No.2
    serviceName: header.getByText('イベント管理', { exact: true }), // No.3
    screenName: header.getByText(HOST_SCREEN_NAME, { exact: true }), // No.4
    userName: (name: string) => header.getByText(name, { exact: true }), // No.6（アイコンは No.5）
  };
};

// ---- ヘッダーを置いた画面を開く ---------------------------------------------

async function open(page: Page, api: ApiMock, user: User = organizer) {
  api.on('GET /me', { status: 200, body: user });
  api.on('GET /events', { status: 200, body: emptyList });
  await page.goto(HOST_PATH);
  await expect(ui(page).header).toBeVisible();
}

// ---- テスト -----------------------------------------------------------------

test.use({ timezoneId: 'Asia/Tokyo', viewport: { width: 1280, height: 720 } });

test.describe('HDR-001 ログイン後のヘッダー', () => {
  test.describe('画面項目の条件・値', () => {
    test('[サービス名 表示内容] 「イベント管理」と表示する', async ({ page, api }) => {
      await open(page, api);
      await expect(ui(page).serviceName).toBeVisible();
    });

    test('[画面名 表示内容] ヘッダーを置いた画面が指定した画面名（イベント一覧）を表示する', async ({ page, api }) => {
      await open(page, api);
      await expect(ui(page).screenName).toBeVisible();
    });

    test('[メニュー 読み上げ名] 文言のないアイコンだけのボタンは、「メニューを開く」という名前で見つかる', async ({ page, api }) => {
      await open(page, api);
      await expect(ui(page).menu).toBeVisible();
    });

    test('[メニュー type] メニューのボタンの type は「button」', async ({ page, api }) => {
      await open(page, api);
      await expect(ui(page).menu).toHaveAttribute('type', 'button');
    });

    test('[ユーザー名 表示内容 / ユーザー名 表示条件] GET /me が 200 を返すと、name を表示する', async ({ page, api }) => {
      await open(page, api);
      await expect(ui(page).userName(organizer.name)).toBeVisible();
    });

    test('[ユーザー名 表示条件] GET /me が 200 を返さないと、ユーザー名を表示しない', async ({ page, api }) => {
      api.on('GET /me', { status: 500 });
      api.on('GET /events', { status: 200, body: emptyList });
      await page.goto(HOST_PATH);
      // ヘッダーそのものは表示されるので、それを待ってから「表示しない」を確かめる
      await expect(ui(page).serviceName).toBeVisible();
      await expect(ui(page).userName(organizer.name)).toBeHidden();
    });

    test('[ユーザー名 省略表記 境目] name が 10 文字ちょうどなら省略しない', async ({ page, api }) => {
      const name = 'あ'.repeat(10);
      await open(page, api, { ...organizer, name });
      await expect(ui(page).userName(name)).toBeVisible();
    });

    test('[ユーザー名 省略表記] name が 11 文字なら、先頭 10 文字のあとに…を付ける', async ({ page, api }) => {
      await open(page, api, { ...organizer, name: 'あ'.repeat(11) });
      await expect(ui(page).userName(`${'あ'.repeat(10)}…`)).toBeVisible();
    });
  });

  test.describe('API を呼ばない手順', () => {
    test.fixme('[メニューのボタン押下] 全画面で共通のメニューを開く（TBD: メニューに何を並べるか）', async () => {});
  });
});
