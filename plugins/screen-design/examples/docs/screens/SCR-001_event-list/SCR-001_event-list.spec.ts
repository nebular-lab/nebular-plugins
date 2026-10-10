/**
 * SCR-001 イベント一覧 の Playwright テスト
 *
 * 設計書: docs/screens/SCR-001_event-list/SCR-001_event-list.md
 * ワイヤーフレーム: docs/screens/SCR-001_event-list/SCR-001_event-list.html
 * メッセージ一覧: docs/screens/messages.md
 * 共通ルール: docs/screens/common-rules.md
 *
 * テスト名の先頭の [...] は、設計書のどこから作ったケースかを、場面・項目名・条件で示す。
 *   [初期表示 / GET /events 400]                     … 5. 初期表示時の処理 の GET /events、レスポンス 400
 *   [「検索」ボタン押下 / GET /events リクエスト]    … アクション「「検索」ボタン押下」で呼ぶ GET /events のリクエスト
 *   [「検索」ボタン押下 / URL クエリの書き換え]      … アクション「「検索」ボタン押下」の手順（API を呼ばない）
 *   [ブラウザの戻る・進むで、この画面の URL クエリが変わる / キーワード] … アクション「ブラウザの戻る・進むで、この画面の URL クエリが変わる」の手順
 *   [キーワード 50 文字以内]                         … バリデーションのチェック表の、キーワードの「50 文字以内」の行
 *   [クエリパラメータ status 省略]                   … 2. クエリパラメータ の status を省略したとき
 *   [Enter キーで動くボタン]                         … 冒頭の表の「Enter キーで動くボタン」
 *   [「次へ」ボタン 活性条件]                        … 画面項目「「次へ」」の活性条件
 *   [権限 member]                                    … 3. 権限 の member の行
 * 2 つの出典に当たるケースは「/」で併記している。メッセージは文言をそのまま書いている。
 *
 * 実装についての前提:
 * - API はブラウザから fetch か XHR で呼ぶ（すべてモックし、バックエンドとは通信しない）
 * - 入力欄（キーワード）はラベルと関連付けられている
 * - ボタン・リンク・見出し・表・表の行・列の見出しは、役割と名前で見つかる
 * - ステータスのタブはタグが「実装時に決める」なので、文言で特定する。タブはイベントの表より前にある
 * - メッセージは画面上のテキストとして 1 か所に表示される
 * - 特定の属性（role、aria-*、data-*）やライブラリ固有の DOM の形は前提にしない。アクセシビリティは、名前・説明・フォーカスの位置・キー操作の結果で確かめる
 * - キーワードは、どの文字も何文字でも入力でき、違反はバリデーションでエラーになる
 */
import type { Page } from '@playwright/test';
import { test, expect, deferred, type ApiMock, type MockReply, type MockedOperation } from '../api-mock';

// ---- メッセージ（docs/screens/messages.md）------------------------------------
// 変数（{v1}、{v2}…）のあるメッセージは関数にする。引数は変数の番号の順

const M = {
  MSG004: (v1: string, v2: number) => `${v1}は ${v2} 文字以内で入力してください`,
  MSG005: (v1: string) => `${v1}に使えない文字（絵文字など）が含まれています`,
  MSG023: 'イベントを読み込めませんでした。',
  MSG024: '検索条件が正しくありません。条件を変えて検索してください',
};

// ---- テストデータ（OpenAPI のスキーマに合わせる） ---------------------------

type User = { id: string; name: string; role: 'admin' | 'organizer' | 'member' };
type EventSummary = {
  id: string;
  title: string;
  status: 'draft' | 'published' | 'closed';
  startDate: string;
  format: 'onsite' | 'online';
  venueName?: string;
  onlineUrl?: string;
  participantCount: number;
  capacity: number;
  organizerId: string;
};
type EventList = { items: EventSummary[]; total: number; page: number; perPage: number };

const users: Record<User['role'], User> = {
  admin: { id: 'u-admin', name: '管理 太郎', role: 'admin' },
  organizer: { id: 'u-org', name: '山田 花子', role: 'organizer' },
  member: { id: 'u-member', name: '佐藤 一郎', role: 'member' },
};

const ONLINE_URL = 'https://meet.example.com/ts-handson';

/** 公開中・オンライン */
const onlineEvent: EventSummary = {
  id: 'e-pub',
  title: 'はじめての TypeScript ハンズオン',
  status: 'published',
  startDate: '2026-10-12',
  format: 'online',
  onlineUrl: ONLINE_URL,
  participantCount: 18,
  capacity: 30,
  organizerId: 'u-org',
};

/** 下書き・会場 */
const onsiteEvent: EventSummary = {
  id: 'e-draft',
  title: 'エンジニア交流会 秋',
  status: 'draft',
  startDate: '2026-10-20',
  format: 'onsite',
  venueName: '渋谷オフィス 5F',
  participantCount: 0,
  capacity: 50,
  organizerId: 'u-org',
};

/** GET /events の 200 の body。page は、モックがリクエストの page に合わせて入れ直す */
const listOf = (items: EventSummary[], total: number = items.length): EventList => ({ items, total, page: 1, perPage: 20 });

/** 全 52 件（3 ページ）のうちの 1 ページ */
const defaultList = listOf([onlineEvent, onsiteEvent], 52);
/** 「公開中」だけの一覧。行に「下書き」の文言が出ないので、「下書き」タブの表示を確かめるときに使う */
const publishedOnlyList = listOf([onlineEvent], 1);
const emptyList = listOf([]);
/** 総ページ数（全 52 件 = 3 ページ）を超えるページを開いたときの一覧。items は 0 件で、total は 1 件以上 */
const outOfRangeList = listOf([], 52);
/** 1 ページ分（20 件）の一覧。開催日の昇順 */
const fullPageList = listOf(
  Array.from({ length: 20 }, (_, i) => ({
    ...onsiteEvent,
    id: `e-${20 - i}`,
    title: `イベント ${String.fromCharCode(0x41 + ((i * 7) % 20))}`,
    startDate: `2026-11-${String(i + 1).padStart(2, '0')}`,
  })),
  52,
);

const apiError = (code: string) => ({ code, message: code });

const LIST_PATH = '/events';

// ---- 部品（番号はワイヤーフレームの data-no） -------------------------------

const ui = (page: Page) => {
  const table = page.getByRole('table'); // No.17
  /** 表の 1 行。タイトルのリンク（No.23）の文言で特定する。データのセルは No.24〜21 */
  const row = (title: string) => table.getByRole('row').filter({ has: page.getByRole('link', { name: title, exact: true }) });
  return {
    /** ユーザー名（No.4）。文言で特定する */
    userName: (name: string) => page.getByText(name, { exact: true }),
    heading: page.getByRole('heading', { name: 'イベント一覧', exact: true }), // No.5
    create: page.getByRole('button', { name: 'イベントを作成', exact: true }), // No.6
    keyword: page.getByLabel(/^キーワード/), // No.9（見出しは No.8）
    search: page.getByRole('button', { name: '検索', exact: true }), // No.11
    /**
     * ステータスのタブ（No.12）。タグが「実装時に決める」なので文言で特定する。
     * 「公開中」「下書き」「終了」は表のステータス（No.24）にも出るので、表より前にあるタブを first() で選ぶ
     */
    tab: (name: string) => page.getByText(name, { exact: true }).first(),
    table,
    columnHeader: (name: string) => table.getByRole('columnheader', { name, exact: true }), // No.18〜16
    rows: table.getByRole('row'),
    row,
    titleLink: (title: string) => page.getByRole('link', { name: title, exact: true }), // No.23
    /** 読み上げ名は「{title} のオンライン会場」。画面に見える文言は「オンライン会場」 */
    onlineLink: (title: string) => row(title).getByRole('link', { name: `${title} のオンライン会場`, exact: true }), // No.27
    prev: page.getByRole('button', { name: '前へ', exact: true }), // No.29（ページ送りは No.28）
    pageInfo: (text: string) => page.getByText(text, { exact: true }), // No.30
    next: page.getByRole('button', { name: '次へ', exact: true }), // No.31
    /** 文言のない「？」のアイコンだけのリンク。読み上げ名「ヘルプ」で特定する */
    help: page.getByRole('link', { name: 'ヘルプ', exact: true }), // No.34
    noData: page.getByText('条件に合うイベントはありません'), // No.36
    reload: page.getByRole('button', { name: '再読み込み', exact: true }), // No.38
    // エラー表示（No.7、8、30）はタグが「実装時に決める」なので、メッセージの文言で確かめる。
    // 読み込み中の表示（No.35）はスピナーで、目印になる文言がない
  };
};

// ---- 画面を開く -------------------------------------------------------------

type OpenOptions = { user?: User; list?: EventList; query?: string };

/** GET /events の 200。body の page は、リクエストの page に合わせる */
const listReply = (list: EventList) => (req: { query: URLSearchParams }): MockReply => ({
  status: 200,
  body: { ...list, page: Number(req.query.get('page') ?? 1) },
});

/** 初期表示で呼ぶ API に正常系の応答を登録する。異常系はテストの中で上書きする */
function mockInitial(api: ApiMock, opts: OpenOptions = {}) {
  return {
    me: api.on('GET /me', { status: 200, body: opts.user ?? users.organizer }),
    events: api.on('GET /events', listReply(opts.list ?? defaultList)),
  };
}

const urlOf = (query: string = '') => `${LIST_PATH}${query}`;

async function open(page: Page, api: ApiMock, opts: OpenOptions = {}) {
  const mocks = mockInitial(api, opts);
  await page.goto(urlOf(opts.query));
  if ((opts.list ?? defaultList).items.length > 0) await expect(ui(page).table).toBeVisible();
  else await expect(ui(page).noData).toBeVisible();
  return mocks;
}

/** GET /me が失敗して終了した状態で開く。failedMe は失敗させた GET /me、events は GET /events のモック */
async function openMeFailed(page: Page, api: ApiMock, query: string = '') {
  const { events } = mockInitial(api);
  const failedMe = api.on('GET /me', { status: 500 });
  await page.goto(urlOf(query));
  await expect(page.getByText(M.MSG023)).toBeVisible();
  return { events, failedMe };
}

/** 操作をしたあと、GET /events がもう 1 回呼ばれるのを待ち、そのリクエストの query を返す */
async function nextQuery(op: MockedOperation, action: () => Promise<unknown>) {
  const before = op.requests.length;
  await action();
  await expect.poll(() => op.requests.length).toBe(before + 1);
  return Object.fromEntries(op.last().query);
}

/** この画面のままで、URL のクエリが期待どおりであること（null は、そのパラメータがないこと） */
const hasQuery = (expected: Record<string, string | null>) => (url: URL) =>
  url.pathname === LIST_PATH && Object.entries(expected).every(([key, value]) => url.searchParams.get(key) === value);

/** この画面のままで、URL のクエリが文字列としてそのままであること */
const hasSearch = (search: string) => (url: URL) => url.pathname === LIST_PATH && url.search === search;

/** キーワードのバリデーションに違反する値（51 文字）と、そのメッセージ。キーワードのエラー表示を出しておくのに使う */
const TOO_LONG_KEYWORD = 'あ'.repeat(51);
const KEYWORD_ERROR = M.MSG004('キーワード', 50);

/** 401 のケースで開く URL のクエリ。redirect が固定の /events ではなく、現在の URL であることを確かめるために付ける */
const LOGIN_FROM_QUERY = '?keyword=Go&status=closed&page=2';

/**
 * ログイン画面へ、redirect に現在の URL（イベント一覧のパスと、開いたときのクエリ）を付けて遷移したことを確かめる。
 * redirect がパスからの形でも、オリジンからの形でも通るように、URL として解釈してから比べる
 */
const toLogin = (query: string) => async (page: Page) => {
  await expect(page).toHaveURL(/\/login\?/);
  const redirect = new URL(page.url()).searchParams.get('redirect') ?? '';
  const from = new URL(redirect, page.url());
  expect(from.pathname).toBe(LIST_PATH);
  expect(Object.fromEntries(from.searchParams)).toEqual(Object.fromEntries(new URLSearchParams(query)));
};
/** テスト名に入れるメッセージ */
const q = (message: string) => `「${message}」`;
/** 文言を含むことを確かめるための正規表現（説明にほかの文が混ざっていてもよい） */
const containing = (text: string) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const stays = async (page: Page) => expect(page).toHaveURL((url) => url.pathname === LIST_PATH);
const shows = (text: string) => async (page: Page) => expect(page.getByText(text)).toBeVisible();

/** レスポンスの表の 1 行 */
type Outcome = {
  status: number;
  /** 「上記以外」の行なら true */
  other?: boolean;
  body?: unknown;
  /** テスト名に使う期待結果 */
  label: string;
  /** 別の画面へ遷移するなら true */
  leaves?: boolean;
  /** 開くときに付ける URL のクエリ */
  query?: string;
  /** 出典に併記する権限の行 */
  also?: string;
  expect: (page: Page) => Promise<void>;
};
const statusLabel = (o: Outcome) => (o.other ? '上記以外' : String(o.status));
/** テスト名の「〜が返ると」の部分 */
const returns = (o: Outcome) => (o.other ? '定義にないステータスが返ると' : `${o.status} が返ると`);
const also = (o: Outcome) => (o.also ? ` / ${o.also}` : '');

/** タブの文言と、GET /events の status・URL クエリの status の対応 */
const TABS = [
  { label: '公開中', status: 'published' },
  { label: '下書き', status: 'draft' },
  { label: '終了', status: 'closed' },
];

/** ページ送りのボタン。from は押す前の page、to は押したあとの page（全 52 件 = 3 ページ） */
const PAGERS = [
  { name: '前へ', key: 'prev' as const, change: '1 減らした値', from: 3, to: 2 },
  { name: '次へ', key: 'next' as const, change: '1 増やした値', from: 2, to: 3 },
];

// ---- テスト -----------------------------------------------------------------

test.use({ timezoneId: 'Asia/Tokyo', viewport: { width: 1280, height: 720 } });

test.describe('SCR-001 イベント一覧', () => {
  test.describe('API: 初期表示', () => {
    test('[初期表示 / GET /me 200] name をユーザー名に表示する', async ({ page, api }) => {
      await open(page, api, { user: users.organizer });
      await expect(ui(page).userName(users.organizer.name)).toBeVisible();
    });

    // GET /me の 200 で保持した role を表示条件の判定に使うことは、[「イベントを作成」ボタン 表示条件]、[ステータスのタブ 表示条件] で確かめている
    const meOutcomes: Outcome[] = [
      { status: 401, body: apiError('unauthorized'), label: 'ログイン画面（redirect は現在の URL）へ遷移する', leaves: true, query: LOGIN_FROM_QUERY, also: '権限 未ログイン', expect: toLogin(LOGIN_FROM_QUERY) },
      { status: 500, other: true, label: `${q(M.MSG023)}を表示して終了する`, expect: shows(M.MSG023) },
    ];
    for (const o of meOutcomes) {
      test(`[初期表示 / GET /me ${statusLabel(o)}${also(o)}] GET /me で ${returns(o)}、${o.label}`, async ({ page, api }) => {
        const { events } = mockInitial(api);
        api.on('GET /me', { status: o.status, body: o.body });
        if (o.leaves) api.allowUnmockedCalls();
        await page.goto(urlOf(o.query));
        await o.expect(page);
        // 「終了する」ので、後続の GET /events は呼ばない
        if (o.other) expect(events.requests).toHaveLength(0);
      });
    }

    test('[初期表示 / GET /me 上記以外（キーワード・「検索」ボタン・ステータスのタブ）] GET /me で定義にないステータスが返って終了しても、キーワード・「検索」ボタン・ステータスのタブは表示したままにする', async ({ page, api }) => {
      mockInitial(api);
      api.on('GET /me', { status: 500 });
      await page.goto(urlOf());
      await expect(page.getByText(M.MSG023)).toBeVisible();
      const u = ui(page);
      await expect(u.keyword).toBeVisible(); // 見出しで特定しているので、キーワードの見出しの確かめも兼ねる
      await expect(u.search).toBeVisible();
      for (const name of ['すべて', '公開中', '終了']) await expect(u.tab(name)).toBeVisible();
    });

    test('[初期表示 / GET /me 上記以外（「下書き」のタブ）] GET /me で定義にないステータスが返って終了したとき、ステータスのタブに「下書き」を表示しない', async ({ page, api }) => {
      mockInitial(api);
      api.on('GET /me', { status: 500 });
      await page.goto(urlOf('?status=draft'));
      await expect(page.getByText(M.MSG023)).toBeVisible();
      const u = ui(page);
      await expect(u.tab('すべて')).toBeVisible();
      await expect(u.tab('下書き')).toBeHidden(); // 一覧を表示していないので、「下書き」の文言はタブにしか出ない
    });

    test.fixme('[初期表示 / GET /me 上記以外（タブの選択）] GET /me で定義にないステータスが返って終了したとき、URL クエリに status が付いていても「すべて」のタブを選んだ状態にする（選択状態の目印が設計書にないため。特定の属性を前提にせずには確かめられない）', async () => {});

    // URL クエリ keyword をキーワードに入れるのは GET /me より前なので、GET /me が失敗して終了しても入っている
    test('[初期表示 / GET /me 上記以外（キーワードの値）] GET /me で定義にないステータスが返って終了しても、キーワードには URL クエリ keyword の値（前後の空白は除く）が入っている', async ({ page, api }) => {
      mockInitial(api);
      api.on('GET /me', { status: 500 });
      await page.goto(urlOf(`?keyword=${encodeURIComponent('  Go  ')}`));
      await expect(page.getByText(M.MSG023)).toBeVisible();
      await expect(ui(page).keyword).toHaveValue('Go');
    });

    // GET /events の keyword・status・page は、整えたあとの URL クエリの値をそのまま使う。
    // 受け取れない値・前後の空白を除いた値で呼ぶことは、[クエリパラメータ …] のケースで確かめている
    test('[初期表示 / GET /events リクエスト] keyword・status・page を付けて開くと、query に URL クエリの keyword・status・page と、perPage 20 を入れる', async ({ page, api }) => {
      const { events } = await open(page, api, { query: '?keyword=Go&status=closed&page=2' });
      expect(Object.fromEntries(events.requests[0].query)).toEqual({ keyword: 'Go', status: 'closed', page: '2', perPage: '20' });
    });

    test('[初期表示 / GET /events リクエスト（クエリパラメータなし）] 何も付けずに開くと、keyword と status は送らず、page は 1、perPage は 20 を入れる', async ({ page, api }) => {
      const { events } = await open(page, api);
      expect(Object.fromEntries(events.requests[0].query)).toEqual({ page: '1', perPage: '20' });
    });

    test('[初期表示 / GET /events 200（items が 1 件以上） / イベントの表 表示条件] items が 1 件以上なら、items[] をイベントの表に入れて表示する', async ({ page, api }) => {
      await open(page, api);
      const u = ui(page);
      await expect(u.table).toBeVisible();
      await expect(u.rows).toHaveCount(defaultList.items.length + 1); // 見出しの行 + items[]
      for (const item of defaultList.items) await expect(u.row(item.title)).toBeVisible();
    });

    test('[初期表示 / GET /events 200（total が 1 件以上） / ページ送り 表示条件 / 「前へ」ボタン 表示条件 / ページ数 表示条件 / 「次へ」ボタン 表示条件] total が 1 件以上なら、ページ送り（「前へ」・ページ数・「次へ」）を表示する', async ({ page, api }) => {
      await open(page, api);
      const u = ui(page);
      await expect(u.prev).toBeVisible();
      await expect(u.pageInfo('1 / 3 ページ（全 52 件）')).toBeVisible();
      await expect(u.next).toBeVisible();
    });

    test('[初期表示 / GET /events 200（items が 0 件） / データなしの表示 表示条件] items が 0 件なら「条件に合うイベントはありません」を表示する', async ({ page, api }) => {
      await open(page, api, { list: emptyList });
      await expect(ui(page).noData).toBeVisible();
    });

    test('[初期表示 / GET /events 200（items が 0 件で total が 1 件以上） / ページ送り 表示条件] 総ページ数を超えるページを開いて items が 0 件でも、total が 1 件以上なら、「条件に合うイベントはありません」とページ送り（「前へ」・ページ数・「次へ」）の両方を表示する', async ({ page, api }) => {
      await open(page, api, { list: outOfRangeList, query: '?page=99' }); // 全 52 件 = 3 ページ
      const u = ui(page);
      await expect(u.noData).toBeVisible();
      await expect(u.table).toBeHidden();
      await expect(u.prev).toBeVisible();
      await expect(u.pageInfo('99 / 3 ページ（全 52 件）')).toBeVisible();
      await expect(u.next).toBeVisible();
    });

    const eventsOutcomes: Outcome[] = [
      { status: 400, body: apiError('bad_request'), label: `${q(M.MSG024)}を表示する`, expect: shows(M.MSG024) },
      { status: 401, body: apiError('unauthorized'), label: 'ログイン画面（redirect は現在の URL）へ遷移する', leaves: true, query: LOGIN_FROM_QUERY, expect: toLogin(LOGIN_FROM_QUERY) },
      { status: 500, other: true, label: `${q(M.MSG023)}を表示する`, expect: shows(M.MSG023) },
    ];
    for (const o of eventsOutcomes) {
      test(`[初期表示 / GET /events ${statusLabel(o)}] GET /events で ${returns(o)}、${o.label}`, async ({ page, api }) => {
        mockInitial(api);
        api.on('GET /events', { status: o.status, body: o.body });
        if (o.leaves) api.allowUnmockedCalls();
        await page.goto(urlOf(o.query));
        await o.expect(page);
      });
    }

    test.fixme('[初期表示 / 読み込み中 / 読み込み中の表示 表示条件] GET /events の応答を待っている間、一覧の位置に読み込み中の表示（スピナー）を出し、応答が返ったら消す（スピナーの目印が設計書・ワイヤーフレームにないため）', async () => {});

    test('[初期表示 / 読み込み中] GET /events の応答が返るまで、イベントの表・ページ送り・データなしの表示・読み込みのエラーを表示せず、返ったら表を表示する', async ({ page, api }) => {
      mockInitial(api);
      const reply = deferred<MockReply>();
      const events = api.on('GET /events', () => reply.promise);
      await page.goto(urlOf());
      await expect.poll(() => events.requests.length).toBe(1);
      const u = ui(page);
      await expect(u.table).toBeHidden();
      await expect(u.prev).toBeHidden();
      await expect(u.next).toBeHidden();
      await expect(u.noData).toBeHidden();
      await expect(page.getByText(M.MSG023)).toBeHidden();
      reply.resolve({ status: 200, body: defaultList });
      await expect(u.table).toBeVisible();
      await expect(u.prev).toBeVisible();
    });
  });

  test.describe('API: 「検索」ボタン押下', () => {
    // 初期表示の手順と同じく GET /events を呼ぶので、レスポンスのケースは繰り返さない
    test('[「検索」ボタン押下 / GET /events リクエスト] キーワードを入力して「検索」を押すと、keyword に入力値、page に 1 を入れ、status は URL クエリのままで呼ぶ', async ({ page, api }) => {
      const { events } = await open(page, api, { query: '?status=published&page=3' });
      const u = ui(page);
      await u.keyword.fill('Go');
      const query = await nextQuery(events, () => u.search.click());
      expect(query).toEqual({ keyword: 'Go', status: 'published', page: '1', perPage: '20' });
    });

    test('[「検索」ボタン押下 / GET /events リクエスト（キーワードが空）] キーワードを空にして「検索」を押すと、keyword を送らず、page に 1 を入れ、status は URL クエリのままで呼ぶ', async ({ page, api }) => {
      const { events } = await open(page, api, { query: '?keyword=Go&status=published&page=3' });
      const u = ui(page);
      await u.keyword.fill('');
      const query = await nextQuery(events, () => u.search.click());
      expect(query).toEqual({ status: 'published', page: '1', perPage: '20' });
    });

    test('[「検索」ボタン押下 / GET /me が失敗していたとき] 初期表示時の処理を GET /me からやり直し、入力したキーワードと page 1 で GET /events を呼ぶ', async ({ page, api }) => {
      const { events } = await openMeFailed(page, api, '?status=closed&page=3');
      const me = api.on('GET /me', { status: 200, body: users.organizer });
      const u = ui(page);
      await u.keyword.fill('Go');
      const query = await nextQuery(events, () => u.search.click());
      expect(query).toEqual({ keyword: 'Go', status: 'closed', page: '1', perPage: '20' });
      expect(me.requests).toHaveLength(1);
      await expect(u.userName(users.organizer.name)).toBeVisible();
      await expect(u.table).toBeVisible();
    });

    test('[「検索」ボタン押下 / GET /me が成功していたとき] GET /me は呼び直さずに GET /events を呼ぶ', async ({ page, api }) => {
      const { me, events } = await open(page, api);
      const u = ui(page);
      await u.keyword.fill('Go');
      await nextQuery(events, () => u.search.click());
      await expect(u.search).toBeEnabled(); // 検索が終わるまで待つ
      expect(me.requests).toHaveLength(1);
    });

    test('[「検索」ボタン押下 / 検索中] 検索中は「検索」ボタンを非活性にし、応答のあと非活性を解除する', async ({ page, api }) => {
      await open(page, api);
      const reply = deferred<MockReply>();
      const events = api.on('GET /events', () => reply.promise);
      const u = ui(page);
      await u.keyword.fill('Go');
      await u.search.click();
      await expect.poll(() => events.requests.length).toBe(1);
      await expect(u.search).toBeDisabled();
      reply.resolve({ status: 200, body: defaultList });
      await expect(u.table).toBeVisible();
      await expect(u.search).toBeEnabled();
    });

    test(`[「検索」ボタン押下 / 画面上部のエラーの消去] ${q(M.MSG024)}を表示したあと、もう一度検索すると画面上部のエラー表示を消す`, async ({ page, api }) => {
      await open(page, api);
      const u = ui(page);
      api.on('GET /events', { status: 400, body: apiError('bad_request') });
      await u.keyword.fill('Go');
      await u.search.click();
      await expect(page.getByText(M.MSG024)).toBeVisible();
      api.on('GET /events', listReply(defaultList));
      await u.search.click();
      await expect(u.table).toBeVisible();
      await expect(page.getByText(M.MSG024)).toBeHidden();
    });
  });

  test.describe('API: タブの切り替え', () => {
    // 初期表示の手順と同じく GET /events を呼ぶので、レスポンスのケースは繰り返さない
    for (const t of TABS) {
      test(`[タブの切り替え / GET /events リクエスト（「${t.label}」）] 「${t.label}」のタブを選ぶと、status に ${t.status}、page に 1 を入れて呼ぶ`, async ({ page, api }) => {
        const { events } = await open(page, api, { query: '?keyword=Go&page=3' });
        const query = await nextQuery(events, () => ui(page).tab(t.label).click());
        expect(query).toEqual({ keyword: 'Go', status: t.status, page: '1', perPage: '20' });
      });
    }

    test('[タブの切り替え / GET /events リクエスト（「すべて」）] 「すべて」のタブを選ぶと、status を送らず、page に 1 を入れて呼ぶ', async ({ page, api }) => {
      const { events } = await open(page, api, { query: '?keyword=Go&status=published&page=3' });
      const query = await nextQuery(events, () => ui(page).tab('すべて').click());
      expect(query).toEqual({ keyword: 'Go', page: '1', perPage: '20' });
    });

    test('[タブの切り替え / GET /events リクエスト（キーワードを入力途中）] キーワードを書き換えたまま「検索」を押さずに「公開中」のタブを選ぶと、keyword は入力途中の値ではなく、URL クエリの値のままで呼ぶ', async ({ page, api }) => {
      const { events } = await open(page, api, { query: '?keyword=Go&page=3' });
      const u = ui(page);
      await u.keyword.fill('Rust');
      const query = await nextQuery(events, () => u.tab('公開中').click());
      expect(query).toEqual({ keyword: 'Go', status: 'published', page: '1', perPage: '20' });
    });

    test('[タブの切り替え / GET /events リクエスト（URL クエリに keyword がなく、キーワードを入力途中）] URL クエリに keyword がないとき、キーワードを入力したまま「公開中」のタブを選ぶと、keyword を送らずに呼ぶ', async ({ page, api }) => {
      const { events } = await open(page, api);
      const u = ui(page);
      await u.keyword.fill('Rust');
      const query = await nextQuery(events, () => u.tab('公開中').click());
      expect(query).toEqual({ status: 'published', page: '1', perPage: '20' });
    });

    test('[タブの切り替え / GET /me が失敗していたとき] 初期表示時の処理を GET /me からやり直し、選んだタブの status と page 1 で GET /events を呼ぶ', async ({ page, api }) => {
      const { events } = await openMeFailed(page, api, '?keyword=Go&page=3');
      const me = api.on('GET /me', { status: 200, body: users.organizer });
      const u = ui(page);
      const query = await nextQuery(events, () => u.tab('公開中').click()); // 一覧を表示していないので、「公開中」の文言はタブにしか出ない
      expect(query).toEqual({ keyword: 'Go', status: 'published', page: '1', perPage: '20' });
      expect(me.requests).toHaveLength(1);
      await expect(u.userName(users.organizer.name)).toBeVisible();
      await expect(u.table).toBeVisible();
    });

    test('[タブの切り替え / GET /me が成功していたとき] GET /me は呼び直さずに GET /events を呼ぶ', async ({ page, api }) => {
      const { me, events } = await open(page, api);
      const u = ui(page);
      await nextQuery(events, () => u.tab('終了').click());
      await expect(u.pageInfo('1 / 3 ページ（全 52 件）')).toBeVisible();
      expect(me.requests).toHaveLength(1);
    });
  });

  for (const p of PAGERS) {
    test.describe(`API: 「${p.name}」ボタン押下`, () => {
      // 初期表示の手順と同じく GET /events を呼ぶので、レスポンスのケースは繰り返さない
      test(`[「${p.name}」ボタン押下 / GET /events リクエスト] ${p.from} ページ目で「${p.name}」を押すと、page に ${p.to}（URL クエリの page を ${p.change}）を入れ、keyword と status はそのままで呼ぶ`, async ({ page, api }) => {
        const { events } = await open(page, api, { query: `?keyword=Go&status=published&page=${p.from}` });
        const query = await nextQuery(events, () => ui(page)[p.key].click());
        expect(query).toEqual({ keyword: 'Go', status: 'published', page: String(p.to), perPage: '20' });
      });

      if (p.key === 'next') {
        test('[「次へ」ボタン押下 / GET /events リクエスト（URL クエリに page がないとき）] URL クエリに page がないときに「次へ」を押すと、page を 1 とみなして 1 増やした 2 を入れて呼ぶ', async ({ page, api }) => {
          const { events } = await open(page, api);
          const query = await nextQuery(events, () => ui(page).next.click());
          expect(query).toEqual({ page: '2', perPage: '20' });
        });
      }
    });
  }

  test.describe('API: 「再読み込み」ボタン押下', () => {
    test('[「再読み込み」ボタン押下 / GET /me が失敗していたとき] 初期表示時の処理を GET /me からやり直す', async ({ page, api }) => {
      const { events } = mockInitial(api);
      api.on('GET /me', { status: 500 });
      await page.goto(urlOf());
      await expect(page.getByText(M.MSG023)).toBeVisible();
      const me = api.on('GET /me', { status: 200, body: users.organizer });
      await ui(page).reload.click();
      await expect(ui(page).table).toBeVisible();
      expect(me.requests).toHaveLength(1);
      expect(events.requests).toHaveLength(1);
      await expect(ui(page).userName(users.organizer.name)).toBeVisible();
    });

    test('[「再読み込み」ボタン押下 / GET /me が成功していたとき / GET /events リクエスト] GET /me は呼び直さず、同じ keyword・status・page で GET /events を呼ぶ', async ({ page, api }) => {
      const { me } = mockInitial(api);
      api.on('GET /events', { status: 500 });
      await page.goto(urlOf('?keyword=Go&status=published&page=2'));
      await expect(page.getByText(M.MSG023)).toBeVisible();
      const events = api.on('GET /events', listReply(defaultList));
      const query = await nextQuery(events, () => ui(page).reload.click());
      expect(query).toEqual({ keyword: 'Go', status: 'published', page: '2', perPage: '20' });
      await expect(ui(page).table).toBeVisible();
      expect(me.requests).toHaveLength(1);
    });

    test(`[「再読み込み」ボタン押下 / 読み込みのエラーの消去] ${q(M.MSG023)}を表示したあと「再読み込み」を押すと、読み込みのエラー表示を消す`, async ({ page, api }) => {
      mockInitial(api);
      api.on('GET /events', { status: 500 });
      await page.goto(urlOf());
      await expect(page.getByText(M.MSG023)).toBeVisible();
      api.on('GET /events', listReply(defaultList));
      await ui(page).reload.click();
      await expect(ui(page).table).toBeVisible();
      await expect(page.getByText(M.MSG023)).toBeHidden();
    });
  });

  test.describe('API: ブラウザの戻る・進むで、この画面の URL クエリが変わる', () => {
    // 初期表示の手順と同じく GET /events を呼ぶので、レスポンスのケースは繰り返さない。
    // 変わったあとの URL クエリでタブを選び直すことは、送る status で確かめる（選択状態そのものは [初期表示 / タブの選択] を見る）
    test('[ブラウザの戻る・進むで、この画面の URL クエリが変わる / GET /events リクエスト（戻る）] 検索したあとブラウザの戻るで戻ると、戻ったあとの URL クエリの keyword・status・page で呼ぶ', async ({ page, api }) => {
      const { events } = await open(page, api, { query: '?status=closed&page=2' });
      const u = ui(page);
      await u.keyword.fill('Go');
      await nextQuery(events, () => u.search.click());
      await expect(page).toHaveURL(hasQuery({ keyword: 'Go', status: 'closed', page: '1' }));
      const query = await nextQuery(events, () => page.goBack());
      expect(query).toEqual({ status: 'closed', page: '2', perPage: '20' });
      await expect(u.pageInfo('2 / 3 ページ（全 52 件）')).toBeVisible();
    });

    test('[ブラウザの戻る・進むで、この画面の URL クエリが変わる / GET /events リクエスト（進む）] タブを切り替えてブラウザの戻るで戻ったあと、ブラウザの進むで進むと、進んだあとの URL クエリの keyword・status・page で呼ぶ', async ({ page, api }) => {
      const { events } = await open(page, api, { query: '?keyword=Go&page=2' });
      const u = ui(page);
      await nextQuery(events, () => u.tab('終了').click());
      await nextQuery(events, () => page.goBack());
      await expect(page).toHaveURL(hasQuery({ keyword: 'Go', status: null, page: '2' }));
      const query = await nextQuery(events, () => page.goForward());
      expect(query).toEqual({ keyword: 'Go', status: 'closed', page: '1', perPage: '20' });
      await expect(u.pageInfo('1 / 3 ページ（全 52 件）')).toBeVisible();
    });

    test('[ブラウザの戻る・進むで、この画面の URL クエリが変わる / GET /me が失敗していたとき] 初期表示時の処理を GET /me からやり直し、戻ったあとの URL クエリで GET /events を呼ぶ', async ({ page, api }) => {
      // GET /me が失敗したままで検索して、履歴を 1 つ増やしておく（検索でも GET /me を呼び直して、また失敗する）
      const { events, failedMe } = await openMeFailed(page, api, '?status=closed');
      const u = ui(page);
      await u.keyword.fill('Go');
      await u.search.click();
      await expect(page).toHaveURL(hasQuery({ keyword: 'Go', status: 'closed' }));
      await expect.poll(() => failedMe.requests.length).toBe(2);
      const me = api.on('GET /me', { status: 200, body: users.organizer });
      const query = await nextQuery(events, () => page.goBack());
      expect(query).toEqual({ status: 'closed', page: '1', perPage: '20' });
      expect(me.requests).toHaveLength(1);
      await expect(u.userName(users.organizer.name)).toBeVisible();
      await expect(u.table).toBeVisible();
    });

    test('[ブラウザの戻る・進むで、この画面の URL クエリが変わる / GET /me が成功していたとき] GET /me は呼び直さずに GET /events を呼ぶ', async ({ page, api }) => {
      const { me, events } = await open(page, api, { query: '?page=2' });
      const u = ui(page);
      await nextQuery(events, () => u.next.click());
      await nextQuery(events, () => page.goBack());
      await expect(u.pageInfo('2 / 3 ページ（全 52 件）')).toBeVisible();
      expect(me.requests).toHaveLength(1);
    });
  });

  test.describe('API を呼ばない手順', () => {
    // 初期表示の「URL クエリ keyword をキーワードに入れる」「URL クエリ status に対応するタブを選ぶ」は、
    // [クエリパラメータ keyword]、[クエリパラメータ status] のケースで確かめている。
    // キーワードに入れるのが GET /me より前であることは、[初期表示 / GET /me 上記以外（キーワードの値）] で確かめている

    // ---- 初期表示: URL クエリを整える ----
    // 省略したときと同じに扱う値のパラメータだけを消し、ほかのパラメータは変えない。
    // 受け取れない値の境目（どの値を受け取れないとみなすか）は、[クエリパラメータ status 受け取れない値]、[クエリパラメータ page 受け取れない値] で確かめている
    const tidyCases = [
      { cond: 'keyword が空', label: 'keyword を空にして開くと、URL クエリの keyword を消す', query: '?keyword=&status=closed&page=2', expected: { keyword: null, status: 'closed', page: '2' } },
      { cond: 'keyword が空白だけ', label: 'keyword を空白だけにして開くと、URL クエリの keyword を消す', query: `?keyword=${encodeURIComponent('   ')}&status=closed&page=2`, expected: { keyword: null, status: 'closed', page: '2' } },
      { cond: 'keyword の前後の空白', label: 'keyword の前後に空白を付けて開くと、URL クエリの keyword を、前後の空白を除いた値に書き換える', query: `?keyword=${encodeURIComponent('  Go  ')}&status=closed&page=2`, expected: { keyword: 'Go', status: 'closed', page: '2' } },
      { cond: 'status が受け取れない値', label: 'status=archived を付けて開くと、URL クエリの status を消す', query: '?keyword=Go&status=archived&page=2', expected: { keyword: 'Go', status: null, page: '2' } },
      { cond: 'page が受け取れない値', label: 'page=0 を付けて開くと、URL クエリの page を消す', query: '?keyword=Go&status=closed&page=0', expected: { keyword: 'Go', status: 'closed', page: null } },
    ];
    for (const c of tidyCases) {
      test(`[初期表示 / URL クエリを整える（${c.cond}）] ${c.label}`, async ({ page, api }) => {
        await open(page, api, { query: c.query });
        await expect(page).toHaveURL(hasQuery(c.expected));
      });
    }

    test('[初期表示 / URL クエリを整える（member で status が draft）] member が status=draft を付けて開くと、URL クエリの status を消す', async ({ page, api }) => {
      await open(page, api, { user: users.member, list: publishedOnlyList, query: '?keyword=Go&status=draft&page=2' });
      await expect(page).toHaveURL(hasQuery({ keyword: 'Go', status: null, page: '2' }));
    });

    test('[初期表示 / URL クエリを整える（organizer で status が draft）] organizer が status=draft を付けて開いても、URL クエリの status は消さない', async ({ page, api }) => {
      await open(page, api, { user: users.organizer, query: '?keyword=Go&status=draft&page=2' });
      await expect(page).toHaveURL(hasQuery({ keyword: 'Go', status: 'draft', page: '2' }));
    });

    test('[初期表示 / URL クエリを整える（変えるところがないとき）] 受け取れる値だけを付けて開くと、URL クエリを変えない', async ({ page, api }) => {
      const query = '?keyword=Go&status=closed&page=2';
      await open(page, api, { query });
      await expect(page).toHaveURL(hasSearch(query));
    });

    test('[初期表示 / URL クエリを整える / ブラウザの履歴] ブラウザの履歴を置き換えるので、ブラウザの戻るで、整える前の URL クエリではなく、この画面を開く前に見ていた URL に戻る', async ({ page, api }) => {
      // 先に別の URL（2 ページ目）を開いてから、整えられる URL クエリで開き直す
      await open(page, api, { query: '?page=2' });
      await open(page, api, { query: '?status=archived' });
      await expect(page).toHaveURL(hasQuery({ status: null, page: null }));
      await page.goBack();
      await expect(page).toHaveURL(hasQuery({ status: null, page: '2' }));
    });

    test.fixme('[初期表示 / タブの選択] URL クエリ status に対応するタブを選択状態にする（選択状態の目印が設計書にないため。特定の属性を前提にせずには確かめられない。送る status は [クエリパラメータ status] で確かめている）', async () => {});

    test('[「検索」ボタン押下 / URL クエリの書き換え] 「検索」を押すと、URL クエリの keyword をキーワードの入力値に、page を 1 に書き換える', async ({ page, api }) => {
      await open(page, api, { query: '?page=3' });
      const u = ui(page);
      await u.keyword.fill('Go');
      await u.search.click();
      await expect(page).toHaveURL(hasQuery({ keyword: 'Go', page: '1' }));
    });

    test('[「検索」ボタン押下 / URL クエリの書き換え（前後の空白）] キーワードの前後に空白を付けて「検索」を押すと、URL クエリの keyword を、前後の空白を除いた値に書き換える', async ({ page, api }) => {
      await open(page, api);
      const u = ui(page);
      await u.keyword.fill('  Go  ');
      await u.search.click();
      await expect(page).toHaveURL(hasQuery({ keyword: 'Go', page: '1' }));
    });

    const emptyKeywordCases = [
      { name: '空', value: '' },
      { name: '空白だけ', value: '   ' },
    ];
    for (const c of emptyKeywordCases) {
      test(`[「検索」ボタン押下 / URL クエリの書き換え（キーワードが${c.name}）] キーワードを${c.name}にして「検索」を押すと、URL クエリの keyword を消し、page を 1 に書き換える`, async ({ page, api }) => {
        await open(page, api, { query: '?keyword=Go&page=3' });
        const u = ui(page);
        await u.keyword.fill(c.value);
        await u.search.click();
        await expect(page).toHaveURL(hasQuery({ keyword: null, page: '1' }));
      });
    }

    test('[「検索」ボタン押下 / URL クエリの書き換え（status）] 「検索」を押しても、URL クエリの status は変えない', async ({ page, api }) => {
      await open(page, api, { query: '?status=published&page=3' });
      const u = ui(page);
      await u.keyword.fill('Go');
      await u.search.click();
      await expect(page).toHaveURL(hasQuery({ keyword: 'Go', status: 'published', page: '1' }));
    });

    test('[「検索」ボタン押下 / ブラウザの履歴] ブラウザの履歴に追加するので、ブラウザの戻るで、検索する前の URL クエリのイベント一覧に戻る', async ({ page, api }) => {
      await open(page, api, { query: '?page=3' });
      const u = ui(page);
      await u.keyword.fill('Go');
      await u.search.click();
      await expect(page).toHaveURL(hasQuery({ keyword: 'Go', page: '1' }));
      await page.goBack();
      await expect(page).toHaveURL(hasQuery({ keyword: null, page: '3' }));
    });

    test.fixme('[タブの切り替え / タブの選択] 選んだタブを選択状態にする（選択状態の目印が設計書にないため。特定の属性を前提にせずには確かめられない。送る status は [タブの切り替え / GET /events リクエスト] で確かめている）', async () => {});

    test('[タブの切り替え / URL クエリの書き換え] 「公開中」のタブを選ぶと、URL クエリの status を published に、page を 1 に書き換える', async ({ page, api }) => {
      await open(page, api, { query: '?page=3' });
      await ui(page).tab('公開中').click();
      await expect(page).toHaveURL(hasQuery({ status: 'published', page: '1' }));
    });

    test('[タブの切り替え / URL クエリの書き換え（「すべて」）] 「すべて」のタブを選ぶと、URL クエリの status を消し、page を 1 に書き換える', async ({ page, api }) => {
      await open(page, api, { query: '?status=published&page=3' });
      await ui(page).tab('すべて').click();
      await expect(page).toHaveURL(hasQuery({ status: null, page: '1' }));
    });

    test('[タブの切り替え / URL クエリの書き換え（keyword）] タブを切り替えても、URL クエリの keyword は変えない', async ({ page, api }) => {
      await open(page, api, { query: '?keyword=Go&page=3' });
      await ui(page).tab('公開中').click();
      await expect(page).toHaveURL(hasQuery({ keyword: 'Go', status: 'published', page: '1' }));
    });

    test('[タブの切り替え / URL クエリの書き換え（キーワードを入力途中）] キーワードを書き換えたまま「検索」を押さずにタブを切り替えても、URL クエリの keyword は入力途中の値にしない', async ({ page, api }) => {
      await open(page, api, { query: '?keyword=Go&page=3' });
      const u = ui(page);
      await u.keyword.fill('Rust');
      await u.tab('公開中').click();
      await expect(page).toHaveURL(hasQuery({ keyword: 'Go', status: 'published', page: '1' }));
    });

    test('[タブの切り替え / ブラウザの履歴] ブラウザの履歴に追加するので、ブラウザの戻るで、タブを切り替える前の URL クエリのイベント一覧に戻る', async ({ page, api }) => {
      await open(page, api, { query: '?page=3' });
      await ui(page).tab('公開中').click();
      await expect(page).toHaveURL(hasQuery({ status: 'published', page: '1' }));
      await page.goBack();
      await expect(page).toHaveURL(hasQuery({ status: null, page: '3' }));
    });

    test('[タブの切り替え / キーワードを戻す] キーワードを書き換えたまま「検索」を押さずにタブを切り替えると、入力途中の値を捨てて、キーワードを URL クエリ keyword の値に戻す', async ({ page, api }) => {
      const { events } = await open(page, api, { query: '?keyword=Go' });
      const u = ui(page);
      await u.keyword.fill('Rust');
      await nextQuery(events, () => u.tab('終了').click());
      await expect(u.keyword).toHaveValue('Go');
    });

    test('[タブの切り替え / キーワードを戻す（URL クエリに keyword がないとき）] URL クエリに keyword がないとき、キーワードを入力したままタブを切り替えると、キーワードを空にする', async ({ page, api }) => {
      const { events } = await open(page, api);
      const u = ui(page);
      await u.keyword.fill('Rust');
      await nextQuery(events, () => u.tab('終了').click());
      await expect(u.keyword).toHaveValue('');
    });

    test(`[タブの切り替え / キーワードのエラーの消去] ${q(KEYWORD_ERROR)}を表示したあとタブを切り替えると、キーワードのエラー表示を非表示にする`, async ({ page, api }) => {
      const { events } = await open(page, api);
      const u = ui(page);
      await u.keyword.fill(TOO_LONG_KEYWORD);
      await u.search.click();
      await expect(page.getByText(KEYWORD_ERROR)).toBeVisible();
      await nextQuery(events, () => u.tab('終了').click());
      await expect(page.getByText(KEYWORD_ERROR)).toBeHidden();
    });

    for (const p of PAGERS) {
      test(`[「${p.name}」ボタン押下 / URL クエリの書き換え] ${p.from} ページ目で「${p.name}」を押すと、URL クエリの page を ${p.change}（${p.to}）にする`, async ({ page, api }) => {
        await open(page, api, { query: `?page=${p.from}` });
        await ui(page)[p.key].click();
        await expect(page).toHaveURL(hasQuery({ page: String(p.to) }));
      });

      test(`[「${p.name}」ボタン押下 / ブラウザの履歴] ブラウザの履歴に追加するので、「${p.name}」のあとブラウザの戻るで、押す前の page のイベント一覧に戻る`, async ({ page, api }) => {
        await open(page, api, { query: `?page=${p.from}` });
        await ui(page)[p.key].click();
        await expect(page).toHaveURL(hasQuery({ page: String(p.to) }));
        await page.goBack();
        await expect(page).toHaveURL(hasQuery({ page: String(p.from) }));
      });

      test(`[「${p.name}」ボタン押下 / キーワードを戻す] キーワードを書き換えたまま「検索」を押さずに「${p.name}」を押すと、入力途中の値を捨てて、キーワードを URL クエリ keyword の値に戻す`, async ({ page, api }) => {
        const { events } = await open(page, api, { query: `?keyword=Go&page=${p.from}` });
        const u = ui(page);
        await u.keyword.fill('Rust');
        const query = await nextQuery(events, () => u[p.key].click());
        await expect(u.keyword).toHaveValue('Go');
        expect(query.keyword).toBe('Go'); // 入力途中の値は検索にも使わない
      });

      test(`[「${p.name}」ボタン押下 / キーワードを戻す（URL クエリに keyword がないとき）] URL クエリに keyword がないとき、キーワードを入力したまま「${p.name}」を押すと、キーワードを空にする`, async ({ page, api }) => {
        const { events } = await open(page, api, { query: `?page=${p.from}` });
        const u = ui(page);
        await u.keyword.fill('Rust');
        const query = await nextQuery(events, () => u[p.key].click());
        await expect(u.keyword).toHaveValue('');
        expect(query.keyword).toBeUndefined();
      });

      test(`[「${p.name}」ボタン押下 / キーワードのエラーの消去] ${q(KEYWORD_ERROR)}を表示したあと「${p.name}」を押すと、キーワードのエラー表示を非表示にする`, async ({ page, api }) => {
        const { events } = await open(page, api, { query: `?page=${p.from}` });
        const u = ui(page);
        await u.keyword.fill(TOO_LONG_KEYWORD);
        await u.search.click();
        await expect(page.getByText(KEYWORD_ERROR)).toBeVisible();
        await nextQuery(events, () => u[p.key].click());
        await expect(page.getByText(KEYWORD_ERROR)).toBeHidden();
      });

      test(`[「${p.name}」ボタン押下 / スクロール] 「${p.name}」を押すと、画面の一番上までスクロールする`, async ({ page, api }) => {
        // 20 行の一覧にして、押す前に画面の下端までスクロールしておく
        await open(page, api, { list: fullPageList, query: `?page=${p.from}` });
        const u = ui(page);
        await page.mouse.wheel(0, 10000);
        await u[p.key].click();
        await expect(u.pageInfo(`${p.to} / 3 ページ（全 52 件）`)).toBeVisible();
        await expect(u.heading).toBeInViewport();
      });
    }

    test('[「次へ」ボタン押下 / URL クエリの書き換え（URL クエリに page がないとき）] URL クエリに page がないときに「次へ」を押すと、page を 1 とみなして 1 増やし、URL クエリの page を 2 にする', async ({ page, api }) => {
      await open(page, api);
      await ui(page).next.click();
      await expect(page).toHaveURL(hasQuery({ page: '2' }));
    });

    test('[ブラウザの戻る・進むで、この画面の URL クエリが変わる / キーワード] 検索したあとブラウザの戻るで戻ると、キーワードを、戻ったあとの URL クエリ keyword の値にする', async ({ page, api }) => {
      const { events } = await open(page, api, { query: '?keyword=Go' });
      const u = ui(page);
      await u.keyword.fill('Rust');
      await nextQuery(events, () => u.search.click());
      await expect(page).toHaveURL(hasQuery({ keyword: 'Rust' }));
      await nextQuery(events, () => page.goBack());
      await expect(u.keyword).toHaveValue('Go');
    });

    test('[ブラウザの戻る・進むで、この画面の URL クエリが変わる / キーワード（URL クエリに keyword がないとき）] 検索したあとブラウザの戻るで、keyword のない URL クエリに戻ると、キーワードを空にする', async ({ page, api }) => {
      const { events } = await open(page, api);
      const u = ui(page);
      await u.keyword.fill('Go');
      await nextQuery(events, () => u.search.click());
      await expect(page).toHaveURL(hasQuery({ keyword: 'Go' }));
      await nextQuery(events, () => page.goBack());
      await expect(u.keyword).toHaveValue('');
    });

    test(`[ブラウザの戻る・進むで、この画面の URL クエリが変わる / キーワードのエラーの消去] ${q(KEYWORD_ERROR)}を表示したあとブラウザの戻るで戻ると、キーワードのエラー表示を非表示にする`, async ({ page, api }) => {
      const { events } = await open(page, api);
      const u = ui(page);
      await nextQuery(events, () => u.tab('終了').click()); // 戻る先の履歴を作っておく
      await u.keyword.fill(TOO_LONG_KEYWORD);
      await u.search.click();
      await expect(page.getByText(KEYWORD_ERROR)).toBeVisible();
      await nextQuery(events, () => page.goBack());
      await expect(page.getByText(KEYWORD_ERROR)).toBeHidden();
    });
  });

  test.describe('バリデーション・入力できる範囲', () => {
    // ---- 「検索」ボタン押下のチェック表 ----
    const keywordCases = [
      { cond: '50 文字以内', input: ' 51 文字', value: 'あ'.repeat(51), error: M.MSG004('キーワード', 50) },
      { cond: '使える文字', input: '絵文字入りの値', value: 'ハンズオン😀', error: M.MSG005('キーワード') },
    ];
    for (const c of keywordCases) {
      test(`[キーワード ${c.cond}] キーワードに${c.input}を入れて「検索」を押すと、${q(c.error)}を表示し、API を呼ばない`, async ({ page, api }) => {
        const { events } = await open(page, api);
        const before = events.requests.length;
        const u = ui(page);
        await u.keyword.fill(c.value);
        await u.search.click();
        await expect(page.getByText(c.error)).toBeVisible();
        expect(events.requests).toHaveLength(before);
      });
    }

    test('[キーワード 50 文字以内 境目] キーワードに 50 文字を入れて「検索」を押すと、エラーを表示せず、API を呼ぶ', async ({ page, api }) => {
      const { events } = await open(page, api);
      const u = ui(page);
      await u.keyword.fill('あ'.repeat(50));
      const query = await nextQuery(events, () => u.search.click());
      expect(query.keyword).toBe('あ'.repeat(50));
      await expect(page.getByText(M.MSG004('キーワード', 50))).toBeHidden();
    });

    test(`[キーワード 優先順位] 「50 文字以内」と「使える文字」に同時に違反すると、上の行の ${q(M.MSG004('キーワード', 50))}だけを表示する`, async ({ page, api }) => {
      await open(page, api);
      const u = ui(page);
      await u.keyword.fill(`${'あ'.repeat(50)}😀`); // 51 文字（「50 文字以内」に違反）かつ絵文字（「使える文字」に違反）
      await u.search.click();
      await expect(page.getByText(M.MSG004('キーワード', 50))).toBeVisible();
      await expect(page.getByText(M.MSG005('キーワード'))).toBeHidden();
    });

    test('[キーワード エラーの消去] エラーのあと正しい値にして「検索」を押すと、キーワードのエラー表示を非表示にする', async ({ page, api }) => {
      const { events } = await open(page, api);
      const u = ui(page);
      await u.keyword.fill('あ'.repeat(51));
      await u.search.click();
      await expect(page.getByText(M.MSG004('キーワード', 50))).toBeVisible();
      await u.keyword.fill('Go');
      await nextQuery(events, () => u.search.click());
      await expect(u.table).toBeVisible();
      await expect(page.getByText(M.MSG004('キーワード', 50))).toBeHidden();
    });

    // ---- 共通ルール（入力） ----
    // 「改行を 1 文字と数えるか」は、キーワードが 1 行の入力欄なので当てはまらない。
    // 貼り付け・IME は、入力可能文字種・入力可能最大文字数のある項目も、入力するたびにバリデーションをする項目もないので当てはまらない
    test('[共通ルール 文字数のバリデーション時に前後の空白を取り除くか / キーワード] 前後の空白を除いて 50 文字なら、「50 文字以内」のエラーにならず、API を呼ぶ', async ({ page, api }) => {
      const { events } = await open(page, api);
      const u = ui(page);
      await u.keyword.fill(`  ${'あ'.repeat(50)}  `); // 空白を含めると 54 文字、除くと 50 文字
      await nextQuery(events, () => u.search.click());
      await expect(page.getByText(M.MSG004('キーワード', 50))).toBeHidden();
    });

    test('[共通ルール 送信時に前後の空白を取り除くか / キーワード] キーワードの前後に空白を付けて検索すると、取り除いた値を送る', async ({ page, api }) => {
      const { events } = await open(page, api);
      const u = ui(page);
      await u.keyword.fill('  Go  ');
      const query = await nextQuery(events, () => u.search.click());
      expect(query.keyword).toBe('Go');
    });
  });

  test.describe('画面項目の条件・値', () => {
    // ---- 2. クエリパラメータ ----
    test('[クエリパラメータ keyword] keyword を付けて開くと、その値をキーワードの初期値にし、GET /events の keyword に送る', async ({ page, api }) => {
      const { events } = await open(page, api, { query: '?keyword=Go' });
      await expect(ui(page).keyword).toHaveValue('Go');
      expect(events.requests[0].query.get('keyword')).toBe('Go');
    });

    test('[クエリパラメータ keyword 省略] keyword を省略して開くと、キーワードは空で、GET /events に keyword を送らない', async ({ page, api }) => {
      const { events } = await open(page, api);
      await expect(ui(page).keyword).toHaveValue('');
      expect(events.requests[0].query.has('keyword')).toBe(false);
    });

    test('[クエリパラメータ keyword 前後の空白] keyword の前後に空白を付けて開くと、空白を除いた値をキーワードの初期値にし、GET /events の keyword に送る', async ({ page, api }) => {
      const { events } = await open(page, api, { query: `?keyword=${encodeURIComponent('  Go  ')}` });
      await expect(ui(page).keyword).toHaveValue('Go');
      expect(events.requests[0].query.get('keyword')).toBe('Go');
    });

    const blankKeywordCases = [
      { name: '空', value: '' },
      { name: '空白だけ', value: '   ' },
    ];
    for (const c of blankKeywordCases) {
      test(`[クエリパラメータ keyword ${c.name}] keyword を${c.name}にして開くと、省略したときと同じく、キーワードは空で、GET /events に keyword を送らない`, async ({ page, api }) => {
        const { events } = await open(page, api, { query: `?keyword=${encodeURIComponent(c.value)}` });
        await expect(ui(page).keyword).toHaveValue('');
        expect(events.requests[0].query.has('keyword')).toBe(false);
      });
    }

    // どのタブを選んだかは、GET /events に送る status で確かめる（選択状態そのものは [初期表示 / タブの選択] を見る）
    for (const t of TABS) {
      test(`[クエリパラメータ status] status=${t.status} を付けて開くと、「${t.label}」のタブを選び、GET /events の status に ${t.status} を送る`, async ({ page, api }) => {
        const { events } = await open(page, api, { query: `?status=${t.status}` });
        expect(events.requests[0].query.get('status')).toBe(t.status);
      });
    }

    test('[クエリパラメータ status 省略] status を省略して開くと、「すべて」のタブを選び、GET /events に status を送らない', async ({ page, api }) => {
      const { events } = await open(page, api);
      expect(events.requests[0].query.has('status')).toBe(false);
    });

    // published・draft・closed と完全に一致しない値は受け取れない
    const invalidStatusCases = [
      { name: 'archived（published・draft・closed 以外）', value: 'archived' },
      { name: 'Published（大文字と小文字が違う）', value: 'Published' },
      { name: '空', value: '' },
    ];
    for (const c of invalidStatusCases) {
      test(`[クエリパラメータ status 受け取れない値] status を${c.name}にして開くと、省略したときと同じく「すべて」のタブを選び、GET /events に status を送らない`, async ({ page, api }) => {
        const { events } = await open(page, api, { query: `?status=${encodeURIComponent(c.value)}` });
        expect(events.requests[0].query.has('status')).toBe(false);
      });
    }

    test('[クエリパラメータ status（member で draft）] member が status=draft を付けて開くと、省略したときと同じく「すべて」のタブを選び、GET /events に status を送らない', async ({ page, api }) => {
      const { events } = await open(page, api, { user: users.member, list: publishedOnlyList, query: '?status=draft' });
      expect(events.requests[0].query.has('status')).toBe(false);
    });

    test('[クエリパラメータ page] page=3 を付けて開くと、3 ページ目を表示する（GET /events の page に 3 を送る）', async ({ page, api }) => {
      const { events } = await open(page, api, { query: '?page=3' });
      expect(events.requests[0].query.get('page')).toBe('3');
      await expect(ui(page).pageInfo('3 / 3 ページ（全 52 件）')).toBeVisible();
    });

    test('[クエリパラメータ page 省略] page を省略して開くと、1 ページ目を表示する（GET /events の page に 1 を送る）', async ({ page, api }) => {
      const { events } = await open(page, api);
      expect(events.requests[0].query.get('page')).toBe('1');
      await expect(ui(page).pageInfo('1 / 3 ページ（全 52 件）')).toBeVisible();
    });

    // 受け取れるのは、半角数字だけで先頭が 0 でないもの
    const invalidPageCases = [
      { name: '0', value: '0' },
      { name: '負の数（-1）', value: '-1' },
      { name: '小数（1.5）', value: '1.5' },
      { name: '数字でない値（abc）', value: 'abc' },
      { name: '空', value: '' },
      { name: '先頭が 0 の値（02）', value: '02' },
      { name: '符号の付いた値（+2）', value: '+2' },
      { name: '指数の書き方の値（1e2）', value: '1e2' },
      { name: '全角数字（２）', value: '２' },
    ];
    for (const c of invalidPageCases) {
      test(`[クエリパラメータ page 受け取れない値] page を${c.name}にして開くと、省略したときと同じく 1 ページ目を表示する（GET /events の page に 1 を送る）`, async ({ page, api }) => {
        const { events } = await open(page, api, { query: `?page=${encodeURIComponent(c.value)}` });
        expect(events.requests[0].query.get('page')).toBe('1');
        await expect(ui(page).pageInfo('1 / 3 ページ（全 52 件）')).toBeVisible();
      });
    }

    test('[クエリパラメータ page 受け取れない値 境目] page=10（半角数字だけで、先頭が 0 でない）を付けて開くと、そのまま GET /events の page に 10 を送る', async ({ page, api }) => {
      const { events } = await open(page, api, { list: outOfRangeList, query: '?page=10' }); // 全 52 件 = 3 ページ
      expect(events.requests[0].query.get('page')).toBe('10');
    });

    test('[クエリパラメータ page 総ページ数を超える値] 3 ページしかないときに page=99 を付けて開くと、そのまま GET /events の page に 99 を送る', async ({ page, api }) => {
      const { events } = await open(page, api, { list: outOfRangeList, query: '?page=99' }); // 全 52 件 = 3 ページ
      expect(events.requests[0].query.get('page')).toBe('99');
    });

    // ---- 冒頭の表 ----
    test('[document.title] 開くと、ページのタイトルを「イベント一覧」にする', async ({ page, api }) => {
      await open(page, api);
      await expect(page).toHaveTitle('イベント一覧');
    });

    test('[初期フォーカス] 開くと、キーワードにフォーカスがある', async ({ page, api }) => {
      await open(page, api);
      await expect(ui(page).keyword).toBeFocused();
    });

    // 「検索」ボタンは常に活性なので、非活性のときに Enter キーを押すケースはない
    test('[Enter キーで動くボタン] キーワードに値を入れて Enter キーを押すと、「検索」を押したときと同じ GET /events（keyword に入力値、page に 1）を呼ぶ', async ({ page, api }) => {
      const { events } = await open(page, api, { query: '?page=3' });
      const u = ui(page);
      await u.keyword.fill('Go');
      const query = await nextQuery(events, () => u.keyword.press('Enter'));
      expect(query).toEqual({ keyword: 'Go', page: '1', perPage: '20' });
    });

    // ---- 入力項目 ----
    test('[キーワード プレースホルダー] 「タイトル・概要で検索」を表示する', async ({ page, api }) => {
      await open(page, api);
      await expect(ui(page).keyword).toHaveAttribute('placeholder', 'タイトル・概要で検索');
    });

    // ---- ボタン・リンク ----
    const roleCases = [
      { role: 'admin' as const, visible: true, also: '' },
      { role: 'organizer' as const, visible: true, also: '' },
      { role: 'member' as const, visible: false, also: ' / 権限 member' },
    ];
    for (const c of roleCases) {
      test(`[「イベントを作成」ボタン 表示条件${c.also}] role が ${c.role} なら${c.visible ? '表示する' : '表示しない'}`, async ({ page, api }) => {
        await open(page, api, { user: users[c.role] });
        if (c.visible) await expect(ui(page).create).toBeVisible();
        else await expect(ui(page).create).toBeHidden();
      });
    }

    test('[タイトル 省略表記 境目] title が 30 文字ちょうどなら省略しない', async ({ page, api }) => {
      const title = 'あ'.repeat(30);
      await open(page, api, { list: listOf([{ ...onlineEvent, title }]) });
      await expect(ui(page).titleLink(title)).toBeVisible();
    });

    test('[タイトル 省略表記] title が 31 文字なら、先頭 30 文字のあとに…を付ける', async ({ page, api }) => {
      await open(page, api, { list: listOf([{ ...onlineEvent, title: 'あ'.repeat(31) }]) });
      await expect(ui(page).titleLink(`${'あ'.repeat(30)}…`)).toBeVisible();
    });

    test('[会場 表示条件] format が online なら、「オンライン会場」をリンクで表示する', async ({ page, api }) => {
      await open(page, api, { list: listOf([onlineEvent]) });
      await expect(ui(page).onlineLink(onlineEvent.title)).toBeVisible();
    });

    test('[会場 読み上げ名] 「オンライン会場」のリンクは、「{title} のオンライン会場」という名前で見つかる（どの行のリンクかがわかる）', async ({ page, api }) => {
      await open(page, api, { list: listOf([onlineEvent]) });
      const link = page.getByRole('link', { name: `${onlineEvent.title} のオンライン会場`, exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveText('オンライン会場');
    });

    test('[ヘルプ 読み上げ名] 文言のないアイコンだけのリンクは、「ヘルプ」という名前で見つかる', async ({ page, api }) => {
      await open(page, api);
      await expect(ui(page).help).toBeVisible();
    });

    test('[共通ルール ブラウザの戻るで画面に戻ったときに、スクロール位置を復元するか] 一覧をスクロールしてから詳細へ移り、ブラウザの戻るで戻ると、離れたときのスクロール位置で表示する', async ({ page, api }) => {
      await open(page, api, { list: fullPageList });
      const target = fullPageList.items[10];
      await page.mouse.wheel(0, 400);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
      const before = await page.evaluate(() => window.scrollY);
      api.allowUnmockedCalls(); // 遷移先の詳細画面の通信は確かめない
      await ui(page).titleLink(target.title).click();
      await expect(page).toHaveURL(new RegExp(`/events/${target.id}$`));
      await page.goBack();
      await expect(ui(page).table).toBeVisible();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(before);
    });

    test('[会場 表示条件] format が onsite なら、リンクにせず venueName を文字で表示する', async ({ page, api }) => {
      await open(page, api, { list: listOf([onsiteEvent]) });
      const u = ui(page);
      const venueName = onsiteEvent.venueName ?? '';
      await expect(u.row(onsiteEvent.title).getByText(venueName, { exact: true })).toBeVisible();
      await expect(u.row(onsiteEvent.title).getByRole('link', { name: venueName })).toBeHidden();
      await expect(u.onlineLink(onsiteEvent.title)).toBeHidden();
    });

    // 「前へ」「ページ数」「次へ」の表示条件はページ送りと同じ。表示する側は [初期表示 / GET /events 200（total が 1 件以上） / ページ送り 表示条件 …] と、[初期表示 / GET /events 200（items が 0 件で total が 1 件以上） / ページ送り 表示条件] で確かめている
    test('[ページ送り 表示条件 / 「前へ」ボタン 表示条件 / ページ数 表示条件 / 「次へ」ボタン 表示条件] total が 0 件なら、ページ送り（「前へ」・ページ数・「次へ」）を表示しない', async ({ page, api }) => {
      await open(page, api, { list: emptyList });
      const u = ui(page);
      await expect(u.noData).toBeVisible();
      await expect(u.prev).toBeHidden();
      await expect(u.next).toBeHidden();
      await expect(page.getByText(/ページ（全/)).toBeHidden();
    });

    const pagerEnabledCases = [
      { item: '「前へ」ボタン', key: 'prev' as const, name: 'page が 2 以上（2 ページ目）なら活性', query: '?page=2', enabled: true },
      { item: '「前へ」ボタン', key: 'prev' as const, name: 'page が 1 なら非活性', query: '?page=1', enabled: false },
      { item: '「次へ」ボタン', key: 'next' as const, name: 'page が総ページ数より小さい（3 ページ中の 2 ページ目）なら活性', query: '?page=2', enabled: true },
      { item: '「次へ」ボタン', key: 'next' as const, name: 'page が総ページ数と同じ（3 ページ中の 3 ページ目）なら非活性', query: '?page=3', enabled: false },
    ];
    for (const c of pagerEnabledCases) {
      test(`[${c.item} 活性条件] ${c.name}`, async ({ page, api }) => {
        await open(page, api, { query: c.query }); // 全 52 件 = 3 ページ
        if (c.enabled) await expect(ui(page)[c.key]).toBeEnabled();
        else await expect(ui(page)[c.key]).toBeDisabled();
      });
    }

    test('[「次へ」ボタン 活性条件] page が総ページ数より大きい（3 ページ中の 99 ページ目）なら非活性', async ({ page, api }) => {
      await open(page, api, { list: outOfRangeList, query: '?page=99' });
      await expect(ui(page).next).toBeDisabled();
    });

    // 活性条件の page は、URL クエリではなく GET /events の応答の page。
    // 応答の page が URL クエリの page と違う、モックで作った状態で確かめる（実際の API は、リクエストの page をそのまま返す）
    const responsePageCases = [
      { item: '「前へ」ボタン', key: 'prev' as const, name: 'URL クエリの page が 3 でも、応答の page が 1 なら非活性', query: '?page=3', responsePage: 1 },
      { item: '「次へ」ボタン', key: 'next' as const, name: 'URL クエリの page が 1 でも、応答の page が総ページ数と同じ 3 なら非活性', query: '?page=1', responsePage: 3 },
    ];
    for (const c of responsePageCases) {
      test(`[${c.item} 活性条件（応答の page）] ${c.name}`, async ({ page, api }) => {
        mockInitial(api);
        api.on('GET /events', { status: 200, body: { ...defaultList, page: c.responsePage } }); // 全 52 件 = 3 ページ
        await page.goto(urlOf(c.query));
        const u = ui(page);
        await expect(u.pageInfo(`${c.responsePage} / 3 ページ（全 52 件）`)).toBeVisible();
        await expect(u[c.key]).toBeDisabled();
      });
    }

    test('[「再読み込み」ボタン 表示条件] 読み込みのエラーを表示しているときは表示する', async ({ page, api }) => {
      mockInitial(api);
      api.on('GET /events', { status: 500 });
      await page.goto(urlOf());
      await expect(page.getByText(M.MSG023)).toBeVisible();
      await expect(ui(page).reload).toBeVisible();
    });

    test('[「再読み込み」ボタン 表示条件] 読み込みのエラーを表示していないときは表示しない', async ({ page, api }) => {
      await open(page, api);
      await expect(ui(page).reload).toBeHidden();
    });

    // ---- テキスト ----
    test('[ユーザー名 省略表記 境目] name が 10 文字ちょうどなら省略しない', async ({ page, api }) => {
      const name = 'あ'.repeat(10);
      await open(page, api, { user: { ...users.organizer, name } });
      await expect(ui(page).userName(name)).toBeVisible();
    });

    test('[ユーザー名 省略表記] name が 11 文字なら、先頭 10 文字のあとに…を付ける', async ({ page, api }) => {
      await open(page, api, { user: { ...users.organizer, name: 'あ'.repeat(11) } });
      await expect(ui(page).userName(`${'あ'.repeat(10)}…`)).toBeVisible();
    });

    const columnCases = [
      { item: 'タイトルの見出し', label: 'タイトル' },
      { item: 'ステータスの見出し', label: 'ステータス' },
      { item: '開催日の見出し', label: '開催日' },
      { item: '参加者数の見出し', label: '参加者' },
      { item: '会場の見出し', label: '会場' },
    ];
    for (const c of columnCases) {
      test(`[${c.item} 表示内容] 列の見出しの「${c.label}」を表示する`, async ({ page, api }) => {
        await open(page, api);
        await expect(ui(page).columnHeader(c.label)).toBeVisible();
      });
    }

    const statusCases = [
      { status: 'draft' as const, label: '下書き' },
      { status: 'published' as const, label: '公開中' },
      { status: 'closed' as const, label: '終了' },
    ];
    for (const s of statusCases) {
      test(`[ステータス 表示形式] status が ${s.status} なら「${s.label}」と表示する`, async ({ page, api }) => {
        await open(page, api, { list: listOf([{ ...onlineEvent, status: s.status }]) });
        await expect(ui(page).row(onlineEvent.title).getByText(s.label, { exact: true })).toBeVisible();
      });
    }

    test('[開催日 表示形式] startDate を YYYY/MM/DD で表示する', async ({ page, api }) => {
      await open(page, api, { list: listOf([onlineEvent]) });
      await expect(ui(page).row(onlineEvent.title).getByText('2026/10/12', { exact: true })).toBeVisible();
    });

    test('[参加者数 表示形式] 「{participantCount} / {capacity} 人」で表示する', async ({ page, api }) => {
      await open(page, api, { list: listOf([onlineEvent]) });
      await expect(ui(page).row(onlineEvent.title).getByText('18 / 30 人', { exact: true })).toBeVisible();
    });

    test('[ページ数 表示形式] 「{page} / {総ページ数} ページ（全 {total} 件）」で表示する', async ({ page, api }) => {
      await open(page, api, { query: '?page=2' }); // 全 52 件
      await expect(ui(page).pageInfo('2 / 3 ページ（全 52 件）')).toBeVisible();
    });

    test('[ページ数 総ページ数の計算] 総ページ数は total ÷ perPage の切り上げにする（41 件で 20 件ずつなら 3 ページ）', async ({ page, api }) => {
      await open(page, api, { list: listOf([onlineEvent], 41) });
      await expect(ui(page).pageInfo('1 / 3 ページ（全 41 件）')).toBeVisible();
    });

    test('[ページ数 件数のカンマ区切り] 件数は 3 桁ごとにカンマで区切る（1234 件なら「1,234」）', async ({ page, api }) => {
      await open(page, api, { list: listOf([onlineEvent], 1234) });
      await expect(ui(page).pageInfo('1 / 62 ページ（全 1,234 件）')).toBeVisible();
    });

    // 表示する側は [初期表示 / GET /events 200（items が 0 件） / データなしの表示 表示条件] で確かめている
    test('[データなしの表示 表示条件] items が 1 件以上なら表示しない', async ({ page, api }) => {
      await open(page, api);
      await expect(ui(page).table).toBeVisible();
      await expect(ui(page).noData).toBeHidden();
    });

    // ---- その他 ----
    test('[エラー表示 表示条件] 初期表示では、どのエラー表示も表示しない', async ({ page, api }) => {
      // エラー表示に出るメッセージが、どれも画面にないことで確かめる。表示される側・非表示に戻る側は、API・バリデーションのケースで確かめている
      const messages = [
        M.MSG024, // 画面上部のエラー
        M.MSG004('キーワード', 50), M.MSG005('キーワード'), // キーワードのエラー
        M.MSG023, // 読み込みのエラー
      ];
      await open(page, api);
      for (const m of messages) await expect(page.getByText(m)).toBeHidden();
    });

    // 行に「下書き」の文言が出ない一覧で確かめる（タブを文言で特定しているため）。member は API が下書きを返さない
    for (const c of roleCases) {
      test(`[ステータスのタブ 表示条件${c.also}] role が ${c.role} なら「下書き」のタブを${c.visible ? '表示する' : '表示しない'}`, async ({ page, api }) => {
        await open(page, api, { user: users[c.role], list: publishedOnlyList });
        const u = ui(page);
        await expect(u.tab('すべて')).toBeVisible();
        if (c.visible) await expect(u.tab('下書き')).toBeVisible();
        else await expect(u.tab('下書き')).toBeHidden();
      });
    }

    // 表示する側は [初期表示 / GET /events 200（items が 1 件以上） / イベントの表 表示条件] で確かめている。列の見出しの表示条件は表と同じ
    test('[イベントの表 表示条件] items が 0 件なら、イベントの表も列の見出しも表示しない', async ({ page, api }) => {
      await open(page, api, { list: emptyList });
      const u = ui(page);
      await expect(u.noData).toBeVisible();
      await expect(u.table).toBeHidden();
      await expect(page.getByRole('columnheader')).toHaveCount(0);
    });

    test('[イベントの表 並び順] API の並び順のまま（開催日の昇順）で行を並べる', async ({ page, api }) => {
      // 開催日の昇順。タイトルの順でも id の順でもない
      const items = [
        { ...onsiteEvent, id: 'e-3', title: 'もくもく会', startDate: '2026-10-05' },
        { ...onsiteEvent, id: 'e-1', title: 'あいさつ会', startDate: '2026-10-12' },
        { ...onsiteEvent, id: 'e-2', title: 'たこ焼き会', startDate: '2026-10-20' },
      ];
      await open(page, api, { list: listOf(items) });
      const u = ui(page);
      await expect(u.rows).toHaveCount(items.length + 1);
      for (const [i, item] of items.entries()) await expect(u.rows.nth(i + 1)).toContainText(item.title); // 0 行目は見出しの行
    });

    test('[イベントの表 1 ページあたりの件数] items が 20 件なら、20 行を表示する', async ({ page, api }) => {
      await open(page, api, { list: fullPageList });
      await expect(ui(page).rows).toHaveCount(20 + 1); // 見出しの行 + 20 件
    });

    // ---- 共通ルール（アクセシビリティ） ----
    test('[共通ルール アクセシビリティ / 入力項目のエラーの説明] キーワードのエラーの内容は、キーワードの入力欄の説明として伝わる', async ({ page, api }) => {
      await open(page, api);
      const u = ui(page);
      await u.keyword.fill('あ'.repeat(51));
      await u.search.click();
      await expect(page.getByText(M.MSG004('キーワード', 50))).toBeVisible();
      // どの属性で結び付けているかは見ない。読み上げソフトに伝わる「説明」にエラーの文言が入っていることを確かめる
      await expect(u.keyword).toHaveAccessibleDescription(containing(M.MSG004('キーワード', 50)));
    });

    test.fixme('[共通ルール アクセシビリティ / 入力項目に結び付かないエラー表示の通知] 画面上部のエラー・読み込みのエラーを表示したとき、読み上げで通知する（通知のしかたは実装によって違うため、読み上げソフトで手で確かめる）', async () => {});

    test('[共通ルール アクセシビリティ / 送信時のエラーでのフォーカス / 「検索」ボタン] エラーがあるまま「検索」を押すと、最初のエラー項目のキーワードにフォーカスを移す', async ({ page, api }) => {
      await open(page, api);
      const u = ui(page);
      await u.keyword.fill('あ'.repeat(51));
      await u.search.click();
      await expect(page.getByText(M.MSG004('キーワード', 50))).toBeVisible();
      await expect(u.keyword).toBeFocused();
    });

    test.fixme('[共通ルール アクセシビリティ / 一覧を取り直したときの通知] 検索・タブの切り替え・ページ送りで一覧を取り直したとき、結果（件数、または 0 件のときの文言）を読み上げで通知する（通知のしかたは実装によって違うため、読み上げソフトで手で確かめる）', async () => {});

    test('[共通ルール アクセシビリティ / Tab キーの順序] キーワードから Tab キーを押すと、「検索」ボタン、ステータスのタブの順にフォーカスが移る', async ({ page, api }) => {
      await open(page, api);
      const u = ui(page);
      await u.keyword.focus();
      await page.keyboard.press('Tab');
      await expect(u.search).toBeFocused();
      await page.keyboard.press('Tab');
      // タブはタグが「実装時に決める」なので、フォーカスのある部品の文言で確かめる（選んでいる「すべて」のタブ）
      await expect(page.locator(':focus')).toHaveText('すべて');
    });
  });

  test.describe('遷移', () => {
    test('[「イベントを作成」ボタン押下] 同じタブでイベント作成へ遷移する', async ({ page, api }) => {
      await open(page, api);
      api.allowUnmockedCalls();
      await ui(page).create.click();
      await expect(page).toHaveURL(/\/events\/new$/);
    });

    test('[タイトルのリンク押下] 同じタブで、その行の id のイベント詳細へ遷移する', async ({ page, api }) => {
      await open(page, api);
      api.allowUnmockedCalls();
      await ui(page).titleLink(onsiteEvent.title).click();
      await expect(page).toHaveURL(new RegExp(`/events/${onsiteEvent.id}$`));
    });

    test('[「オンライン会場」リンク押下] その行の onlineUrl を別タブで開き、もとのタブはイベント一覧に残る', async ({ page, api }) => {
      await open(page, api);
      // 外部のページは実際には読み込まない
      await page.context().route(ONLINE_URL, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '' }));
      const opened = page.waitForEvent('popup');
      await ui(page).onlineLink(onlineEvent.title).click();
      const popup = await opened;
      await expect(popup).toHaveURL(ONLINE_URL);
      await stays(page);
    });

    test.fixme('[ヘルプのリンク押下] ヘルプを別タブで開く（TBD: ヘルプのリンクの遷移先 URL はどこか）', async () => {});
  });

  test.describe('権限', () => {
    // member の備考（「イベントを作成」と「下書き」タブは表示しない）は [「イベントを作成」ボタン 表示条件 / 権限 member]、[ステータスのタブ 表示条件 / 権限 member] で、
    // 未ログインは [初期表示 / GET /me 401 / 権限 未ログイン] で確かめている
    const viewerCases = [
      { role: 'admin' as const },
      { role: 'organizer' as const },
      { role: 'member' as const },
    ];
    for (const c of viewerCases) {
      test(`[権限 ${c.role}] ${c.role} は、イベント一覧を開ける`, async ({ page, api }) => {
        await open(page, api, { user: users[c.role], list: publishedOnlyList });
        await expect(ui(page).heading).toBeVisible();
        await stays(page);
      });
    }
  });
});
