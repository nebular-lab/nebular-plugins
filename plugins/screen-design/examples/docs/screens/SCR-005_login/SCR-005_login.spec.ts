/**
 * SCR-005 ログイン の Playwright テスト
 *
 * 設計書: docs/screens/SCR-005_login/SCR-005_login.md
 * ワイヤーフレーム: docs/screens/SCR-005_login/SCR-005_login.html
 * メッセージ一覧: docs/screens/messages.md
 * 共通ルール: docs/screens/common-rules.md
 *
 * テスト名の先頭の [...] は、設計書のどこから作ったケースかを、場面・項目名・条件で示す。
 *   [初期表示 / GET /me 401]                          … 5. 初期表示時の処理 の GET /me、レスポンス 401
 *   [「ログイン」ボタン押下 / POST /login リクエスト]   … アクション「「ログイン」ボタン押下」のリクエストの表
 *   [「ログイン」ボタン押下 / 送信中]                   … アクション「「ログイン」ボタン押下」の手順（API の前後）
 *   [メールアドレス 必須]                               … バリデーションのチェック表の、メールアドレスの「必須」の行
 *   [クエリパラメータ redirect 省略]                    … 2. クエリパラメータ の redirect を省略したとき
 *   [パスワード 備考]                                   … 画面項目「パスワード」の備考
 *   [Enter キーで動くボタン]                            … 冒頭の表の「Enter キーで動くボタン」
 *   [閲覧権限 admin]                                    … 3. 閲覧権限 の admin の行
 *   [共通ルール 送信時に前後の空白を取り除くか]         … 共通ルールの「入力」の行
 * 2 つの出典に当たるケースは「/」で併記している。メッセージは文言をそのまま書いている。
 *
 * 実装についての前提:
 * - API はブラウザから fetch か XHR で呼ぶ（すべてモックし、バックエンドとは通信しない）
 * - 入力欄はラベルと関連付けられている
 * - 見出しは heading のロールを持つ
 * - 特定の属性（role、aria-*、data-*）やライブラリ固有の DOM の形は前提にしない。アクセシビリティは、名前・説明・フォーカスの位置・キー操作の結果で確かめる
 * - メッセージは画面上のテキストとして 1 か所に表示される
 * - バリデーションのエラーは、ブラウザ標準の吹き出しではなく、設計書のメッセージで表示する
 * - 共通ヘッダー（ログイン前のヘッダー）の中身は、ここでは確かめない（ヘッダーの設計書から別に確かめる）
 * - 遷移先の画面の中身は確かめない。遷移先は URL で確かめる
 */
import type { Page } from '@playwright/test';
import { test, expect, deferred, type ApiMock, type MockReply } from '../api-mock';

// ---- メッセージ（docs/screens/messages.md）------------------------------------
// 変数（{v1}、{v2}…）のあるメッセージは関数にする。引数は変数の番号の順

const M = {
  MSG001: (v1: string) => `${v1}を入力してください`,
  MSG022: '通信に失敗しました。時間をおいてもう一度お試しください',
  MSG026: (v1: string) => `${v1}はメールアドレスの形式で入力してください`,
  MSG027: 'メールアドレスまたはパスワードが正しくありません',
};

// ---- テストデータ（OpenAPI のスキーマに合わせる） ---------------------------

type User = { id: string; name: string; role: 'admin' | 'organizer' | 'member' };

const users: Record<User['role'], User> = {
  admin: { id: 'u-admin', name: '管理 太郎', role: 'admin' },
  organizer: { id: 'u-org', name: '山田 花子', role: 'organizer' },
  member: { id: 'u-member', name: '佐藤 一郎', role: 'member' },
};

const apiError = (code: string) => ({ code, message: code });
const unauthorized: MockReply = { status: 401, body: apiError('unauthorized') };
const validationErrorOf = (...errors: { field: string; message: string }[]): MockReply => ({ status: 422, body: { errors } });

const LOGIN_PATH = '/login';
const LIST_PATH = '/events';
const EMAIL = 'taro@example.com';
const PASSWORD = 'correct-horse';
/** redirect に入れる、ほかのサイトのホスト */
const OTHER_SITE_HOST = 'evil.example.com';

const EMAIL_422 = 'このメールアドレスは使えません';
const PASSWORD_422 = 'パスワードの形式が正しくありません';
const OTHER_422 = 'この端末からはログインできません';

// ---- 部品（番号はワイヤーフレームの data-no） -------------------------------

const ui = (page: Page) => ({
  heading: page.getByRole('heading', { name: 'ログイン', exact: true }), // No.1
  emailLabel: page.getByText('メールアドレス（必須）', { exact: true }), // No.3
  email: page.getByLabel(/^メールアドレス/), // No.4
  passwordLabel: page.getByText('パスワード（必須）', { exact: true }), // No.6
  password: page.getByLabel(/^パスワード/), // No.7
  login: page.getByRole('button', { name: 'ログイン', exact: true }), // No.9
  // エラー表示（No.2、5、8）はタグが「実装時に決める」なので、メッセージの文言で確かめる
});

// ---- 画面を開く -------------------------------------------------------------

/** redirect を付けた URL クエリ */
const redirectQuery = (value: string) => `?redirect=${encodeURIComponent(value)}`;

/** 初期表示で呼ぶ API に正常系（ログインしていない）の応答を登録する。異常系はテストの中で上書きする */
function mockInitial(api: ApiMock) {
  return { me: api.on('GET /me', unauthorized) };
}

/** ログインしていない状態で開く */
async function open(page: Page, api: ApiMock, query: string = '') {
  mockInitial(api);
  await page.goto(`${LOGIN_PATH}${query}`);
  await expect(ui(page).email).toBeVisible();
}

/**
 * POST /login の 200 を登録する。ログインできたあとは GET /me も 200 を返すようにする
 * （遷移先の画面が GET /me を呼んで、ログイン画面へ戻されないようにするため）
 */
function mockLoginOk(api: ApiMock, user: User = users.member) {
  return api.on('POST /login', () => {
    api.on('GET /me', { status: 200, body: user });
    return { status: 200, body: user };
  });
}

/** メールアドレスとパスワードを正しい値で埋める */
async function fillValid(page: Page) {
  await ui(page).email.fill(EMAIL);
  await ui(page).password.fill(PASSWORD);
}

/** テスト名に入れるメッセージ */
const q = (message: string) => `「${message}」`;
/** 文言を含むことを確かめるための正規表現（説明にほかの文が混ざっていてもよい） */
const containing = (text: string) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const stays = async (page: Page) => expect(page).toHaveURL((url) => url.pathname === LOGIN_PATH);
const shows = (text: string) => async (page: Page) => expect(page.getByText(text)).toBeVisible();

/**
 * このサイトの中の URL（パスとクエリ）へ遷移したことを確かめる。ほかのサイトへは遷移していないこと。
 * クエリは、並び順が変わっていても通るように、名前と値の組で比べる
 */
const arrivesAt = (pathAndQuery: string) => async (page: Page) => {
  const want = new URL(pathAndQuery, 'http://localhost');
  const entries = (params: URLSearchParams) => JSON.stringify([...params.entries()].sort());
  await expect(page).toHaveURL(
    (url) => url.hostname !== OTHER_SITE_HOST && url.pathname === want.pathname && entries(url.searchParams) === entries(want.searchParams),
  );
};

/** 先に開いておく別のページ（履歴を置き換えたかどうかを、ブラウザの戻るで確かめるため） */
const BEFORE_URL = 'data:text/html,<title>before</title>';

/** クエリパラメータ redirect の 1 ケース */
type RedirectCase = {
  /** 出典 */
  source: string;
  /** テスト名の「〜開く」の前の部分 */
  name: string;
  query: string;
  /** 遷移先（パスとクエリ） */
  to: string;
  /** テスト名に使う遷移先 */
  toLabel: string;
};
const redirectCases: RedirectCase[] = [
  // 値を付けたとき
  { source: 'クエリパラメータ redirect', name: 'redirect にこのサイトのパス（/events/e-1）を付けて', query: redirectQuery('/events/e-1'), to: '/events/e-1', toLabel: 'そのパス' },
  {
    source: 'クエリパラメータ redirect（クエリ付き）',
    name: 'redirect にこのサイトのパスとクエリ（/events?status=closed&page=2）を付けて',
    query: redirectQuery('/events?status=closed&page=2'),
    to: '/events?status=closed&page=2',
    toLabel: 'クエリも含めたその URL',
  },
  // 省略したとき
  { source: 'クエリパラメータ redirect 省略', name: 'redirect を省略して', query: '', to: LIST_PATH, toLabel: 'イベント一覧' },
  // 受け取れない値のとき（省略したときと同じに扱う）
  {
    source: 'クエリパラメータ redirect 受け取れない値（ほかのサイトの URL）',
    name: `redirect にほかのサイトの URL（https://${OTHER_SITE_HOST}/steal）を付けて`,
    query: redirectQuery(`https://${OTHER_SITE_HOST}/steal`),
    to: LIST_PATH,
    toLabel: 'ほかのサイトではなく、省略したときと同じイベント一覧',
  },
  {
    source: 'クエリパラメータ redirect 受け取れない値（// で始まる）',
    name: `redirect に // で始まる値（//${OTHER_SITE_HOST}/steal）を付けて`,
    query: redirectQuery(`//${OTHER_SITE_HOST}/steal`),
    to: LIST_PATH,
    toLabel: 'ほかのサイトではなく、省略したときと同じイベント一覧',
  },
  {
    source: 'クエリパラメータ redirect 受け取れない値（/ で始まらない）',
    name: 'redirect に / で始まらない値（events/e-1）を付けて',
    query: redirectQuery('events/e-1'),
    to: LIST_PATH,
    toLabel: '省略したときと同じイベント一覧',
  },
  { source: 'クエリパラメータ redirect 受け取れない値（空）', name: 'redirect を空にして', query: '?redirect=', to: LIST_PATH, toLabel: '省略したときと同じイベント一覧' },
];

/** レスポンスの表の 1 行（画面に残るもの） */
type Outcome = {
  status: number;
  /** 「上記以外」の行なら true */
  other?: boolean;
  body?: unknown;
  /** テスト名に使う期待結果 */
  label: string;
  expect: (page: Page) => Promise<void>;
};
const statusLabel = (o: Outcome) => (o.other ? '上記以外' : String(o.status));
/** テスト名の「〜が返ると」の部分 */
const returns = (o: Outcome) => (o.other ? '定義にないステータスが返ると' : `${o.status} が返ると`);

// ---- テスト -----------------------------------------------------------------

test.use({ timezoneId: 'Asia/Tokyo', viewport: { width: 1280, height: 720 } });

test.describe('SCR-005 ログイン', () => {
  test.describe('API: 初期表示', () => {
    // GET /me の 200（すでにログインしている）。redirect の値ごとの遷移先を確かめる
    for (const c of redirectCases) {
      test(`[初期表示 / GET /me 200 / ${c.source}] すでにログインしているとき、${c.name}開くと、${c.toLabel}へ遷移する`, async ({ page, api }) => {
        api.on('GET /me', { status: 200, body: users.member });
        api.allowUnmockedCalls(); // 遷移先の画面の通信は確かめない
        await page.goto(`${LOGIN_PATH}${c.query}`);
        await arrivesAt(c.to)(page);
      });
    }

    test('[初期表示 / GET /me 200] すでにログインしているときの遷移は、ブラウザの履歴を置き換えるので、ブラウザの戻るでログインに戻らない', async ({ page, api }) => {
      // 先に別のページを開いておく（戻る先を作るため）
      await page.goto(BEFORE_URL);
      api.on('GET /me', { status: 200, body: users.member });
      api.allowUnmockedCalls(); // 遷移先の画面の通信は確かめない
      await page.goto(LOGIN_PATH);
      await arrivesAt(LIST_PATH)(page);
      await page.goBack();
      // 履歴に追加していると、ログインに戻る（戻ったあと、もう一度イベント一覧へ進む）
      await expect(page).toHaveURL(/^data:/);
    });

    test('[初期表示 / GET /me 401 / 閲覧権限 未ログイン] GET /me で 401 が返ると、遷移せずに、見出し・メールアドレス・パスワード・「ログイン」ボタンを表示する', async ({ page, api }) => {
      const { me } = mockInitial(api);
      await page.goto(LOGIN_PATH);
      const u = ui(page);
      await expect(u.heading).toBeVisible();
      await expect(u.emailLabel).toBeVisible();
      await expect(u.email).toBeVisible();
      await expect(u.passwordLabel).toBeVisible();
      await expect(u.password).toBeVisible();
      await expect(u.login).toBeVisible();
      await stays(page);
      expect(me.requests).toHaveLength(1);
    });

    test(`[初期表示 / GET /me 上記以外] GET /me で定義にないステータスが返ると、${q(M.MSG022)}を表示せずに、ログインできるように画面を表示する`, async ({ page, api }) => {
      mockInitial(api);
      const me = api.on('GET /me', { status: 500 });
      await page.goto(LOGIN_PATH);
      const u = ui(page);
      await expect(u.heading).toBeVisible();
      await expect(u.email).toBeVisible();
      await expect(u.password).toBeVisible();
      await expect(u.login).toBeVisible();
      await stays(page);
      expect(me.requests).toHaveLength(1);
      await expect(page.getByText(M.MSG022)).toBeHidden();
    });
  });

  test.describe('API: 「ログイン」ボタン押下', () => {
    test('[「ログイン」ボタン押下 / POST /login リクエスト] メールアドレスの入力値を email に、パスワードの入力値を password に入れる', async ({ page, api }) => {
      await open(page, api);
      const post = mockLoginOk(api);
      await fillValid(page);
      api.allowUnmockedCalls(); // 200 でイベント一覧へ遷移するため
      await ui(page).login.click();
      await expect.poll(() => post.requests.length).toBe(1);
      expect(post.last().body).toEqual({ email: EMAIL, password: PASSWORD });
    });

    // POST /login の 200。redirect の値ごとの遷移先を確かめる
    for (const c of redirectCases) {
      test(`[「ログイン」ボタン押下 / POST /login 200 / ${c.source}] ${c.name}開き、ログインできると、${c.toLabel}へ遷移する`, async ({ page, api }) => {
        await open(page, api, c.query);
        mockLoginOk(api);
        await fillValid(page);
        api.allowUnmockedCalls(); // 遷移先の画面の通信は確かめない
        await ui(page).login.click();
        await arrivesAt(c.to)(page);
      });
    }

    test('[「ログイン」ボタン押下 / POST /login 200] ブラウザの履歴は置き換えるので、ブラウザの戻るでログインに戻らない', async ({ page, api }) => {
      // 先に別のページを開いておく（戻る先を作るため）
      await page.goto(BEFORE_URL);
      await open(page, api);
      mockLoginOk(api);
      await fillValid(page);
      api.allowUnmockedCalls(); // 遷移先の画面、戻った先の画面の通信は確かめない
      await ui(page).login.click();
      await arrivesAt(LIST_PATH)(page);
      await page.goBack();
      await expect(page).toHaveURL(/^data:/);
    });

    const postOutcomes: Outcome[] = [
      { status: 401, body: apiError('unauthorized'), label: `${q(M.MSG027)}を表示し、画面に残る`, expect: shows(M.MSG027) },
      { status: 500, other: true, label: `${q(M.MSG022)}を表示し、画面に残る`, expect: shows(M.MSG022) },
    ];
    for (const o of postOutcomes) {
      test(`[「ログイン」ボタン押下 / POST /login ${statusLabel(o)}] ログインで ${returns(o)}、${o.label}`, async ({ page, api }) => {
        await open(page, api);
        api.on('POST /login', { status: o.status, body: o.body });
        await fillValid(page);
        await ui(page).login.click();
        await o.expect(page);
        await stays(page);
      });
    }

    test('[「ログイン」ボタン押下 / POST /login 401（パスワードの値）] ログインで 401 が返ると、パスワードの入力済みの値を消す', async ({ page, api }) => {
      await open(page, api);
      api.on('POST /login', unauthorized);
      await fillValid(page);
      await ui(page).login.click();
      await expect(page.getByText(M.MSG027)).toBeVisible();
      await expect(ui(page).password).toHaveValue('');
    });

    // 422 の表示先。入力項目のエラー表示に出たことは、その入力項目の説明に文言が入っていることで確かめる
    const fieldErrorCases = [
      { field: 'email', item: 'メールアドレス', part: 'email' as const, message: EMAIL_422 },
      { field: 'password', item: 'パスワード', part: 'password' as const, message: PASSWORD_422 },
    ];
    for (const c of fieldErrorCases) {
      test(`[「ログイン」ボタン押下 / POST /login 422（field が ${c.field}）] field が ${c.field} のエラーは、errors[].message を${c.item}のエラー表示に表示する`, async ({ page, api }) => {
        await open(page, api);
        api.on('POST /login', validationErrorOf({ field: c.field, message: c.message }));
        await fillValid(page);
        await ui(page).login.click();
        await expect(page.getByText(c.message)).toBeVisible();
        await expect(ui(page)[c.part]).toHaveAccessibleDescription(containing(c.message));
      });
    }

    test('[「ログイン」ボタン押下 / POST /login 422（上記以外の field）] 表示先の決まっていない field のエラーは、errors[].message を画面上部のエラー表示に表示する（入力項目のエラー表示には出さない）', async ({ page, api }) => {
      await open(page, api);
      api.on('POST /login', validationErrorOf({ field: 'device', message: OTHER_422 }));
      await fillValid(page);
      const u = ui(page);
      await u.login.click();
      await expect(page.getByText(OTHER_422)).toBeVisible();
      await expect(u.email).not.toHaveAccessibleDescription(containing(OTHER_422));
      await expect(u.password).not.toHaveAccessibleDescription(containing(OTHER_422));
    });

    test('[「ログイン」ボタン押下 / POST /login 422（表示先ごと）] field の違うエラーが複数あるときは、それぞれの表示先に表示する', async ({ page, api }) => {
      await open(page, api);
      api.on(
        'POST /login',
        validationErrorOf({ field: 'email', message: EMAIL_422 }, { field: 'password', message: PASSWORD_422 }, { field: 'device', message: OTHER_422 }),
      );
      await fillValid(page);
      await ui(page).login.click();
      for (const m of [EMAIL_422, PASSWORD_422, OTHER_422]) await expect(page.getByText(m)).toBeVisible();
    });

    test('[「ログイン」ボタン押下 / POST /login 422（同じ表示先に複数）] 同じ表示先のエラーが複数あるときは、最初の 1 件だけを表示する', async ({ page, api }) => {
      await open(page, api);
      const second = 'メールアドレスが長すぎます';
      api.on('POST /login', validationErrorOf({ field: 'email', message: EMAIL_422 }, { field: 'email', message: second }));
      await fillValid(page);
      await ui(page).login.click();
      await expect(page.getByText(EMAIL_422)).toBeVisible();
      await expect(page.getByText(second)).toBeHidden();
    });

    test('[「ログイン」ボタン押下 / POST /login 422（スクロール）] 422 が返ると、最初のエラー項目までスクロールする', async ({ page, api }) => {
      // 画面を低くして、「ログイン」ボタンを押した時点ではメールアドレスが画面の外にあるようにする
      await page.setViewportSize({ width: 1280, height: 100 });
      await open(page, api);
      api.on('POST /login', validationErrorOf({ field: 'email', message: EMAIL_422 }));
      await fillValid(page);
      await ui(page).login.click();
      await expect(page.getByText(EMAIL_422)).toBeVisible();
      await expect(ui(page).email).toBeInViewport();
    });

    test('[「ログイン」ボタン押下 / 送信中] 応答を待つ間は「ログイン」ボタンを非活性にし、画面に残る応答のあと非活性を解除する', async ({ page, api }) => {
      await open(page, api);
      const reply = deferred<MockReply>();
      const post = api.on('POST /login', () => reply.promise);
      await fillValid(page);
      const u = ui(page);
      await u.login.click();
      await expect.poll(() => post.requests.length).toBe(1);
      await expect(u.login).toBeDisabled();
      reply.resolve(unauthorized); // 200 は別の画面へ遷移するので、画面に残る 401 で確かめる
      await expect(page.getByText(M.MSG027)).toBeVisible();
      await expect(u.login).toBeEnabled();
    });

    test(`[「ログイン」ボタン押下 / 画面上部のエラーの消去] ${q(M.MSG022)}を表示したあと、もう一度押すと画面上部のエラー表示を非表示にする`, async ({ page, api }) => {
      await open(page, api);
      api.on('POST /login', { status: 500 });
      await fillValid(page);
      await ui(page).login.click();
      await expect(page.getByText(M.MSG022)).toBeVisible();
      // 2 回目は、画面上部のエラー表示を使わない応答（メールアドレスのエラー）にして、消えたままになることを確かめる
      api.on('POST /login', validationErrorOf({ field: 'email', message: EMAIL_422 }));
      await ui(page).login.click();
      await expect(page.getByText(EMAIL_422)).toBeVisible();
      await expect(page.getByText(M.MSG022)).toBeHidden();
    });

    test('[「ログイン」ボタン押下 / 422 のエラーの消去] 422 のエラーをメールアドレスのエラー表示に表示したあと、もう一度押すと、エラーがなければ非表示にする', async ({ page, api }) => {
      await open(page, api);
      api.on('POST /login', validationErrorOf({ field: 'email', message: EMAIL_422 }));
      await fillValid(page);
      await ui(page).login.click();
      await expect(page.getByText(EMAIL_422)).toBeVisible();
      api.on('POST /login', unauthorized); // 画面に残る 401 で確かめる
      await ui(page).login.click();
      await expect(page.getByText(M.MSG027)).toBeVisible();
      await expect(page.getByText(EMAIL_422)).toBeHidden();
    });
  });

  test.describe('バリデーション・入力できる範囲', () => {
    // ---- 「ログイン」ボタン押下のチェック表 ----
    // 正しい値で埋めてから 1 項目だけ崩し、「ログイン」を押す。
    // チェックを通ったときのログインは、画面に残る 401 を返す（200 は別の画面へ遷移するため）
    const submitCases: { cond: string; input: string; error: string | null; setup: (page: Page) => Promise<unknown> }[] = [
      { cond: 'メールアドレス 必須', input: 'メールアドレスを空', error: M.MSG001('メールアドレス'), setup: (page) => ui(page).email.fill('') },
      { cond: 'メールアドレス メールアドレス形式', input: 'メールアドレスを @ のない値', error: M.MSG026('メールアドレス'), setup: (page) => ui(page).email.fill('taro.example.com') },
      { cond: 'メールアドレス メールアドレス形式 境目', input: 'メールアドレスをメールアドレスの形式の値', error: null, setup: (page) => ui(page).email.fill(EMAIL) },
      { cond: 'パスワード 必須', input: 'パスワードを空', error: M.MSG001('パスワード'), setup: (page) => ui(page).password.fill('') },
      { cond: 'パスワード 必須 境目', input: 'パスワードを 1 文字', error: null, setup: (page) => ui(page).password.fill('a') },
    ];
    for (const c of submitCases) {
      test(`[${c.cond}] ${c.input}にして「ログイン」を押すと、${c.error ? `${q(c.error)}を表示し、API を呼ばない` : 'エラーを表示せず、API を呼ぶ'}`, async ({ page, api }) => {
        await open(page, api);
        const post = api.on('POST /login', unauthorized);
        await fillValid(page);
        await c.setup(page);
        await ui(page).login.click();
        if (c.error) {
          await expect(page.getByText(c.error)).toBeVisible();
          expect(post.requests).toHaveLength(0);
        } else {
          await expect.poll(() => post.requests.length).toBe(1);
        }
      });
    }

    test(`[メールアドレス 優先順位] メールアドレスが空で「必須」と「メールアドレス形式」に同時に違反すると、上の行の ${q(M.MSG001('メールアドレス'))}だけを表示する`, async ({ page, api }) => {
      await open(page, api);
      await ui(page).password.fill(PASSWORD);
      await ui(page).login.click();
      await expect(page.getByText(M.MSG001('メールアドレス'))).toBeVisible();
      await expect(page.getByText(M.MSG026('メールアドレス'))).toBeHidden();
    });

    test('[「ログイン」ボタン押下 / エラーの表示] エラーのある項目にはそれぞれ表示し、もう一度押すと、エラーのなくなった項目のエラー表示だけを非表示にする', async ({ page, api }) => {
      await open(page, api);
      const u = ui(page);
      await u.login.click();
      await expect(page.getByText(M.MSG001('メールアドレス'))).toBeVisible();
      await expect(page.getByText(M.MSG001('パスワード'))).toBeVisible();
      await u.email.fill(EMAIL);
      await u.login.click();
      await expect(page.getByText(M.MSG001('メールアドレス'))).toBeHidden();
      await expect(page.getByText(M.MSG001('パスワード'))).toBeVisible();
    });

    // エラー表示が非表示に戻る側。直したあとのログインは、画面に残る 401 を返して確かめる
    const clearCases: { item: string; message: string; breakIt: (page: Page) => Promise<unknown>; fixIt: (page: Page) => Promise<unknown> }[] = [
      { item: 'メールアドレス', message: M.MSG026('メールアドレス'), breakIt: (page) => ui(page).email.fill('taro.example.com'), fixIt: (page) => ui(page).email.fill(EMAIL) },
      { item: 'パスワード', message: M.MSG001('パスワード'), breakIt: (page) => ui(page).password.fill(''), fixIt: (page) => ui(page).password.fill(PASSWORD) },
    ];
    for (const c of clearCases) {
      test(`[${c.item} エラーの消去] エラーのあと正しい値にして「ログイン」を押すと、${c.item}のエラー表示を非表示にする`, async ({ page, api }) => {
        await open(page, api);
        api.on('POST /login', unauthorized);
        await fillValid(page);
        await c.breakIt(page);
        await ui(page).login.click();
        await expect(page.getByText(c.message)).toBeVisible();
        await c.fixIt(page);
        await ui(page).login.click();
        await expect(page.getByText(M.MSG027)).toBeVisible();
        await expect(page.getByText(c.message)).toBeHidden();
      });
    }

    test('[「ログイン」ボタン押下 / スクロール] エラーがあれば、最初のエラー項目までスクロールする', async ({ page, api }) => {
      // 画面を低くして、「ログイン」ボタンを押した時点ではメールアドレスが画面の外にあるようにする
      await page.setViewportSize({ width: 1280, height: 100 });
      await open(page, api);
      await ui(page).login.click();
      await expect(page.getByText(M.MSG001('メールアドレス'))).toBeVisible();
      await expect(ui(page).email).toBeInViewport();
    });

    // ---- 共通ルール（入力）と、パスワードだけ違う扱い ----
    // 改行・文字数・貼り付け・IME の行は、当てはまる項目がこの画面にない（1 行の入力欄だけで、文字数と入力の制限がなく、バリデーションは送信時だけ）
    test('[共通ルール 送信時に前後の空白を取り除くか / メールアドレス] メールアドレスの前後に空白を付けてログインすると、取り除いた値を送る', async ({ page, api }) => {
      await open(page, api);
      const post = api.on('POST /login', unauthorized); // 画面に残る 401 を返す
      await ui(page).email.fill(`  ${EMAIL}  `);
      await ui(page).password.fill(PASSWORD);
      await ui(page).login.click();
      await expect.poll(() => post.requests.length).toBe(1);
      expect(post.last().body.email).toBe(EMAIL);
    });

    test('[パスワード 備考 / 「ログイン」ボタン押下 / POST /login リクエスト（前後の空白）] パスワードの前後に空白を付けてログインすると、共通ルールと違い、空白を取り除かずにそのまま送る', async ({ page, api }) => {
      await open(page, api);
      const post = api.on('POST /login', unauthorized); // 画面に残る 401 を返す
      await ui(page).email.fill(EMAIL);
      await ui(page).password.fill(`  ${PASSWORD}  `);
      await ui(page).login.click();
      await expect.poll(() => post.requests.length).toBe(1);
      expect(post.last().body.password).toBe(`  ${PASSWORD}  `);
    });
  });

  test.describe('画面項目の条件・値', () => {
    test('[document.title] 開くと、ページのタイトルを「ログイン」にする', async ({ page, api }) => {
      await open(page, api);
      await expect(page).toHaveTitle('ログイン');
    });

    test('[初期フォーカス] 開くと、メールアドレスにフォーカスがある', async ({ page, api }) => {
      await open(page, api);
      await expect(ui(page).email).toBeFocused();
    });

    const enterCases = [
      { item: 'メールアドレス', part: 'email' as const },
      { item: 'パスワード', part: 'password' as const },
    ];
    for (const c of enterCases) {
      test(`[Enter キーで動くボタン] ${c.item}にフォーカスがあるときに Enter キーを押すと、「ログイン」を押したときと同じ POST /login を呼ぶ`, async ({ page, api }) => {
        await open(page, api);
        const post = api.on('POST /login', unauthorized); // 画面に残る 401 を返す
        await fillValid(page);
        await ui(page)[c.part].press('Enter');
        await expect.poll(() => post.requests.length).toBe(1);
        expect(post.last().body).toEqual({ email: EMAIL, password: PASSWORD });
      });
    }

    test('[Enter キーで動くボタン / 「ログイン」ボタンが非活性のとき] 応答を待つ間（「ログイン」ボタンが非活性）に Enter キーを押しても、何も起きない（POST /login をもう一度呼ばない）', async ({ page, api }) => {
      await open(page, api);
      const reply = deferred<MockReply>();
      const post = api.on('POST /login', () => reply.promise);
      await fillValid(page);
      const u = ui(page);
      await u.login.click();
      await expect.poll(() => post.requests.length).toBe(1);
      await expect(u.login).toBeDisabled();
      await u.email.press('Enter');
      reply.resolve(unauthorized);
      await expect(page.getByText(M.MSG027)).toBeVisible();
      expect(post.requests).toHaveLength(1);
    });

    test('[見出し 表示内容 / メールアドレスの見出し 表示内容 / パスワードの見出し 表示内容] 見出しに「ログイン」、項目の見出しに「メールアドレス（必須）」「パスワード（必須）」を表示する', async ({ page, api }) => {
      await open(page, api);
      const u = ui(page);
      await expect(u.heading).toBeVisible();
      await expect(u.emailLabel).toBeVisible();
      await expect(u.passwordLabel).toBeVisible();
    });

    test('[入力項目 初期値] メールアドレスとパスワードは、どちらも空', async ({ page, api }) => {
      await open(page, api);
      await expect(ui(page).email).toHaveValue('');
      await expect(ui(page).password).toHaveValue('');
    });

    test('[メールアドレス プレースホルダー] 「例: taro@example.com」を表示する', async ({ page, api }) => {
      await open(page, api);
      await expect(ui(page).email).toHaveAttribute('placeholder', '例: taro@example.com');
    });

    // 「ログイン」ボタンが応答を待つ間だけ非活性になり、そのあと解除されることは、[「ログイン」ボタン押下 / 送信中] で確かめている
    test('[メールアドレス 活性条件 / パスワード 活性条件 / 「ログイン」ボタン 活性条件] 何も入力していなくても、メールアドレス・パスワード・「ログイン」ボタンは活性', async ({ page, api }) => {
      await open(page, api);
      const u = ui(page);
      await expect(u.email).toBeEnabled();
      await expect(u.password).toBeEnabled();
      await expect(u.login).toBeEnabled();
    });

    test('[エラー表示 表示条件] 初期表示では、どのエラー表示も表示しない', async ({ page, api }) => {
      // エラー表示に出るメッセージが、どれも画面にないことで確かめる。表示される側・非表示に戻る側は、アクションのケースで確かめている
      const messages = [
        M.MSG022, M.MSG027, // 画面上部のエラー
        M.MSG001('メールアドレス'), M.MSG026('メールアドレス'),
        M.MSG001('パスワード'),
      ];
      await open(page, api);
      for (const m of messages) await expect(page.getByText(m)).toBeHidden();
    });

    // ---- 共通ルール（アクセシビリティ） ----
    // 確認ダイアログ・トースト・一覧・文言のない部品の行は、当てはまる部品がこの画面にない
    const descriptionCases = [
      { item: 'メールアドレス', part: 'email' as const, message: M.MSG001('メールアドレス') },
      { item: 'パスワード', part: 'password' as const, message: M.MSG001('パスワード') },
    ];
    for (const c of descriptionCases) {
      test(`[共通ルール アクセシビリティ / 入力項目のエラーの説明 / ${c.item}] ${c.item}のエラーの内容は、${c.item}の入力欄の説明として伝わる`, async ({ page, api }) => {
        await open(page, api);
        await ui(page).login.click();
        await expect(page.getByText(c.message)).toBeVisible();
        // どの属性で結び付けているかは見ない。読み上げソフトに伝わる「説明」にエラーの文言が入っていることを確かめる
        await expect(ui(page)[c.part]).toHaveAccessibleDescription(containing(c.message));
      });
    }

    test.fixme('[共通ルール アクセシビリティ / 画面上部のエラーの通知] 画面上部のエラー表示を表示したとき、読み上げで通知する（通知のしかたは実装によって違うため、読み上げソフトで手で確かめる）', async () => {});

    const submitFocusCases = [
      { cond: 'メールアドレスとパスワードが空', item: 'メールアドレス', part: 'email' as const, setup: async (_page: Page) => {} },
      { cond: 'パスワードだけが空', item: 'パスワード', part: 'password' as const, setup: (page: Page) => ui(page).email.fill(EMAIL) },
    ];
    for (const c of submitFocusCases) {
      test(`[共通ルール アクセシビリティ / 送信時のエラーでのフォーカス] ${c.cond}のまま「ログイン」を押すと、最初のエラー項目の${c.item}にフォーカスを移す`, async ({ page, api }) => {
        await open(page, api);
        await c.setup(page);
        await ui(page).login.click();
        await expect(page.getByText(M.MSG001(c.item))).toBeVisible();
        await expect(ui(page)[c.part]).toBeFocused();
      });
    }

    test('[共通ルール アクセシビリティ / Tab キーの順序] メールアドレスから Tab キーを押すと、パスワード、「ログイン」ボタンの順にフォーカスが移る', async ({ page, api }) => {
      await open(page, api);
      const u = ui(page);
      await u.email.focus();
      await page.keyboard.press('Tab');
      await expect(u.password).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(u.login).toBeFocused();
    });
  });

  test.describe('共通ルール（遷移）', () => {
    test('[共通ルール ブラウザの戻るで画面に戻ったときに、入力内容を復元するか] 入力したまま別の画面へ離れ、ブラウザの戻るで戻ると、入力内容は捨てて、初期表示の状態で表示する', async ({ page, api }) => {
      await open(page, api);
      const u = ui(page);
      await u.email.fill(EMAIL);
      api.allowUnmockedCalls(); // 離れた先の画面の通信は確かめない
      await page.goto(LIST_PATH); // この画面には、別の画面へ進むリンクがないので、URL を直接開いて離れる
      mockInitial(api); // 戻ったときに、初期表示時の処理をやり直す
      await page.goBack();
      await stays(page);
      await expect(u.email).toBeVisible();
      await expect(u.email).toHaveValue('');
    });
  });

  test.describe('閲覧権限', () => {
    // 未ログインは [初期表示 / GET /me 401 / 閲覧権限 未ログイン] で確かめている。
    // admin・organizer・member は、ログインしているので、開くと初期表示時の処理でイベント一覧へ遷移する（エラーにはならない）
    const viewers = [
      { name: 'admin', user: users.admin },
      { name: 'organizer', user: users.organizer },
      { name: 'member', user: users.member },
    ];
    for (const v of viewers) {
      test(`[閲覧権限 ${v.name} / 初期表示 / GET /me 200] ${v.name} でログインしているときに開くと、エラーを表示せずに、イベント一覧へ遷移する`, async ({ page, api }) => {
        api.on('GET /me', { status: 200, body: v.user });
        api.allowUnmockedCalls(); // 遷移先の画面の通信は確かめない
        await page.goto(LOGIN_PATH);
        await arrivesAt(LIST_PATH)(page);
      });
    }
  });
});
