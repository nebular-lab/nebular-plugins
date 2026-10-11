/**
 * SCR-004 イベント作成 の Playwright テスト
 *
 * 設計書: docs/screens/SCR-004_event-create/SCR-004_event-create.md
 * ワイヤーフレーム: docs/screens/SCR-004_event-create/SCR-004_event-create.html
 * メッセージ一覧: docs/screens/messages.md
 * 共通ルール: docs/screens/common-rules.md
 *
 * テスト名の先頭の [...] は、設計書のどこから作ったケースかを、場面・項目名・条件で示す。
 *   [初期表示 / GET /categories 401]                  … 5. 初期表示時の処理 の GET /categories、レスポンス 401
 *   [「下書き保存」ボタン押下 / POST /events リクエスト] … アクション「「下書き保存」ボタン押下」のリクエストの表
 *   [開催形式の選択を変更 / 「会場」を選んだとき]      … アクション「開催形式の選択を変更」の手順（API を呼ばない）
 *   [タイトル 50 文字以内]                              … バリデーションのチェック表の、タイトルの「50 文字以内」の行
 *   [定員 入力可能最大文字数]                           … 画面項目「定員」の入力可能最大文字数
 *   [「下書き保存」ボタン 活性条件]                     … 画面項目「「下書き保存」」の活性条件
 *   [閲覧権限 admin]                                        … 3. 閲覧権限 の admin の行
 * 2 つの出典に当たるケースは「/」で併記している。メッセージは文言をそのまま書いている。
 *
 * 実装についての前提:
 * - API はブラウザから fetch か XHR で呼ぶ（すべてモックし、バックエンドとは通信しない）
 * - 入力欄はラベルと関連付けられている
 * - 確認ダイアログ（離脱の確認）はダイアログとして見つかる（役割が dialog か alertdialog）
 * - 見出しは heading のロールを持つ
 * - 特定の属性（role、aria-*、data-*）やライブラリ固有の DOM の形は前提にしない。アクセシビリティは、名前・説明・フォーカスの位置・キー操作の結果で確かめる
 * - メッセージ（トーストを含む）は画面上のテキストとして 1 か所に表示され、遷移後も確かめられる間は表示されている
 * - 入力欄が受け付ける範囲は設計書の「入力可能文字種」「入力可能最大文字数」と共通ルールのとおり。それ以外は入力でき、バリデーションでエラーになる
 */
import type { Locator, Page } from '@playwright/test';
import { test, expect, deferred, type ApiMock, type MockReply } from '../api-mock';

// ---- メッセージ（docs/screens/messages.md）------------------------------------
// 変数（{v1}、{v2}…）のあるメッセージは関数にする。引数は変数の番号の順

const M = {
  MSG001: (v1: string) => `${v1}を入力してください`,
  MSG002: (v1: string) => `${v1}を選択してください`,
  MSG003: (v1: string, v2: number) => `${v1}は ${v2} 文字以上で入力してください`,
  MSG004: (v1: string, v2: number) => `${v1}は ${v2} 文字以内で入力してください`,
  MSG005: (v1: string) => `${v1}に使えない文字（絵文字など）が含まれています`,
  MSG006: (v1: string) => `${v1}は半角英数字と記号で入力してください`,
  MSG007: (v1: string) => `${v1}は https:// で始まる形式で入力してください`,
  MSG008: (v1: string) => `${v1}は今日以降の日付を入力してください`,
  MSG009: (v1: string, v2: number, v3: number) => `${v1}は ${v2}〜${v3} で入力してください`,
  MSG011: (v1: string, v2: number) => `${v1}は ${v2} つまで選べます`,
  MSG012: '入力内容が保存されていません。このページを離れますか？',
  MSG013: '下書きを保存しました',
  MSG014: 'イベントを公開しました',
  MSG020: 'イベントを作成・編集する権限がありません',
  MSG022: '通信に失敗しました。時間をおいてもう一度お試しください',
};

// ---- テストデータ（OpenAPI のスキーマに合わせる） ---------------------------

/** 「今日」。開催日の「今日以降」のチェックに使う */
const TODAY = '2026-10-01';
const YESTERDAY = '2026-09-30';

type User = { id: string; name: string; role: 'admin' | 'organizer' | 'member' };
type Event = {
  id: string;
  title: string;
  summary?: string;
  categoryId: string;
  format: 'onsite' | 'online';
  venueName?: string;
  onlineUrl?: string;
  startDate: string;
  capacity: number;
  tags: string[];
  status: 'draft' | 'published' | 'closed';
  organizerId: string;
  organizerName: string;
  participantCount: number;
  version: number;
  updatedAt: string;
};

const users: Record<User['role'], User> = {
  admin: { id: 'u-admin', name: '管理 太郎', role: 'admin' },
  organizer: { id: 'u-org', name: '山田 花子', role: 'organizer' },
  member: { id: 'u-member', name: '佐藤 一郎', role: 'member' },
};

const categories = {
  items: [
    { id: 'c-study', name: '勉強会' },
    { id: 'c-meetup', name: '交流会' },
  ],
};

/** POST /events の 201 の応答（fillValid() の値で作られたもの） */
const createdEvent: Event = {
  id: 'e-new',
  title: 'Go 勉強会',
  categoryId: 'c-study',
  format: 'onsite',
  venueName: '渋谷オフィス 5F',
  startDate: '2026-10-20',
  capacity: 20,
  tags: [],
  status: 'draft',
  organizerId: 'u-org',
  organizerName: '山田 花子',
  participantCount: 0,
  version: 1,
  updatedAt: '2026-10-01T03:00:00Z',
};

const apiError = (code: string) => ({ code, message: code });
const forbidden: MockReply = { status: 403, body: apiError('forbidden') };
const validationError = { errors: [{ field: 'title', message: 'このタイトルはすでに使われています' }] };

const CREATE_PATH = '/events/new';
const ONLINE_URL = 'https://meet.example.com/go';
const TAGS = ['初心者向け', 'ハンズオン', '交流', '無料', '英語'];

// ---- 部品（番号はワイヤーフレームの data-no） -------------------------------

const ui = (page: Page) => {
  const dialog = page.getByRole('dialog').or(page.getByRole('alertdialog'));
  return {
    header: page.getByText('イベント管理', { exact: true }), // 共通ヘッダー（HDR-001）のサービス名
    back: page.getByRole('link', { name: '← 一覧へ戻る' }), // No.1
    heading: page.getByRole('heading', { name: 'イベントを作成', exact: true }), // No.2
    title: page.getByLabel(/^タイトル/), // No.5（見出しは No.4）
    summary: page.getByLabel(/^概要/), // No.8（見出しは No.7）
    category: page.getByLabel(/^カテゴリ/), // No.11（見出しは No.10）
    onsite: page.getByRole('radio', { name: '会場', exact: true }), // No.14
    online: page.getByRole('radio', { name: 'オンライン', exact: true }), // No.14
    venue: page.getByLabel(/^会場名/), // No.18（見出しは No.17）
    onlineUrl: page.getByLabel(/^配信 URL/), // No.21（見出しは No.20）
    startDate: page.getByLabel(/^開催日/), // No.24（見出しは No.23）
    capacity: page.getByLabel(/^定員/), // No.27（見出しは No.26）
    tag: (name: string) => page.getByRole('checkbox', { name, exact: true }), // No.30
    draft: page.getByRole('button', { name: '下書き保存', exact: true }), // No.37
    publish: page.getByRole('button', { name: '公開する', exact: true }), // No.38
    dialog, // No.39（離脱の確認）
    dialogCancel: dialog.getByRole('button', { name: 'キャンセル', exact: true }), // No.41
    dialogLeave: dialog.getByRole('button', { name: '離れる', exact: true }), // No.42
    // エラー表示（No.3、7、10、13、18、21、24、27、30）はタグが「実装時に決める」なので、メッセージの文言で確かめる
  };
};
type UI = ReturnType<typeof ui>;

// ---- 画面を開く -------------------------------------------------------------

/** 初期表示で呼ぶ API に正常系の応答を登録する。異常系はテストの中で上書きする */
function mockInitial(api: ApiMock, user: User = users.organizer) {
  return {
    me: api.on('GET /me', { status: 200, body: user }),
    categories: api.on('GET /categories', { status: 200, body: categories }),
  };
}

async function open(page: Page, api: ApiMock, user: User = users.organizer) {
  mockInitial(api, user);
  await page.goto(CREATE_PATH);
  await expect(ui(page).title).toBeVisible();
}

/** 必須項目を正しい値で埋める（開催形式は初期値の「会場」のまま） */
async function fillValid(page: Page) {
  const u = ui(page);
  await u.title.fill('Go 勉強会');
  await u.category.selectOption({ label: '勉強会' });
  await u.venue.fill('渋谷オフィス 5F');
  await u.startDate.fill('2026-10-20');
  await u.capacity.fill('20');
}

/** fillValid() で送られるはずの body（title〜tags） */
const validBody = {
  title: 'Go 勉強会',
  categoryId: 'c-study',
  format: 'onsite',
  venueName: '渋谷オフィス 5F',
  startDate: '2026-10-20',
  capacity: 20,
  tags: [] as string[],
};

/** 「オンライン」を選び、配信 URL を入力する */
async function chooseOnline(u: UI, url: string = ONLINE_URL) {
  await u.online.check();
  await u.onlineUrl.fill(url);
}

/** ログイン画面へ、redirect に今いた画面のパスを付けて遷移したことを確かめる */
const toLogin = async (page: Page) => {
  await expect(page).toHaveURL(/\/login\?/);
  expect(new URL(page.url()).searchParams.get('redirect')).toContain(CREATE_PATH);
};
/** テスト名に入れるメッセージ */
const q = (message: string) => `「${message}」`;
/** 文言を含むことを確かめるための正規表現（説明にほかの文が混ざっていてもよい） */
const containing = (text: string) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const toList = async (page: Page) => expect(page).toHaveURL(/\/events$/);
const stays = async (page: Page) => expect(page).toHaveURL(/\/events\/new$/);
const shows = (text: string) => async (page: Page) => expect(page.getByText(text)).toBeVisible();
const showsAndToList = (text: string) => async (page: Page) => {
  await expect(page.getByText(text)).toBeVisible();
  await toList(page);
};
/** 画面の下端までスクロールしてから押す（最初のエラー項目までスクロールすることを確かめるため） */
async function scrollDownAndClick(page: Page, button: Locator) {
  await page.mouse.wheel(0, 10000);
  await button.click();
}

/**
 * 初期表示の API が定義にないステータスを返したときの画面を確かめる。
 * ヘッダー・「← 一覧へ戻る」・見出し・画面上部のエラーだけを表示し、入力項目とボタンは表示しない
 */
const showsOnlyTopError = async (page: Page) => {
  const u = ui(page);
  await expect(page.getByText(M.MSG022)).toBeVisible();
  await expect(u.header).toBeVisible();
  await expect(u.back).toBeVisible();
  await expect(u.heading).toBeVisible();
  const hidden = [u.title, u.summary, u.category, u.onsite, u.online, u.venue, u.onlineUrl, u.startDate, u.capacity, ...TAGS.map(u.tag), u.draft, u.publish];
  for (const part of hidden) await expect(part).toBeHidden();
};
/**
 * ブラウザ標準の離脱確認（beforeunload のダイアログ）が出たかどうかを記録する。
 * 出たときは受け入れて先へ進め、あとの shown の検証で落とす（待ち続けて時間切れにならないようにするため）
 */
function watchLeaveConfirm(page: Page) {
  const state = { shown: false };
  page.on('dialog', async (d) => {
    if (d.type() === 'beforeunload') state.shown = true;
    await d.accept();
  });
  return state;
}

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
  /** 出典に併記する権限の行 */
  also?: string;
  expect: (page: Page) => Promise<void>;
};
const statusLabel = (o: Outcome) => (o.other ? '上記以外' : String(o.status));
/** テスト名の「〜が返ると」の部分 */
const returns = (o: Outcome) => (o.other ? '定義にないステータスが返ると' : `${o.status} が返ると`);
const also = (o: Outcome) => (o.also ? ` / ${o.also}` : '');

/** 422 の応答で、errors[].message を表示し、その項目（タイトル）までスクロールしたことを確かめる */
const shows422 = async (page: Page) => {
  await expect(page.getByText(validationError.errors[0].message)).toBeVisible();
  await expect(ui(page).title).toBeInViewport();
};

// ---- テスト -----------------------------------------------------------------

test.use({ timezoneId: 'Asia/Tokyo', viewport: { width: 1280, height: 720 } });

test.describe('SCR-004 イベント作成', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00+09:00`));
  });

  test.describe('API: 初期表示', () => {
    // GET /me の 200（role を保持して判定に使う）は、member なら [初期表示 / member のとき / 閲覧権限 member]、
    // admin・organizer なら [閲覧権限 admin / 初期表示 / GET /me 200 / member でないとき] などで確かめている
    const meOutcomes: Outcome[] = [
      { status: 401, body: apiError('unauthorized'), label: 'ログイン画面へ遷移する', leaves: true, also: '閲覧権限 未ログイン', expect: toLogin },
      { status: 500, other: true, label: `ヘッダー・「← 一覧へ戻る」・見出しと ${q(M.MSG022)}だけを表示し、入力項目とボタンは表示せずに終了する`, expect: showsOnlyTopError },
    ];
    for (const o of meOutcomes) {
      test(`[初期表示 / GET /me ${statusLabel(o)}${also(o)}] GET /me で ${returns(o)}、${o.label}`, async ({ page, api }) => {
        const { categories: cat } = mockInitial(api);
        api.on('GET /me', { status: o.status, body: o.body });
        if (o.leaves) api.allowUnmockedCalls();
        await page.goto(CREATE_PATH);
        await o.expect(page);
        // 「終了する」ので、後続の GET /categories は呼ばない
        if (o.other) expect(cat.requests).toHaveLength(0);
      });
    }

    test('[初期表示 / GET /categories 200] items[] をカテゴリの選択肢にし、先頭に「選択してください」を置く', async ({ page, api }) => {
      await open(page, api);
      await expect(ui(page).category.locator('option')).toHaveText(['選択してください', '勉強会', '交流会']);
    });

    const categoriesOutcomes: Outcome[] = [
      { status: 401, body: apiError('unauthorized'), label: 'ログイン画面へ遷移する', leaves: true, expect: toLogin },
      { status: 500, other: true, label: `ヘッダー・「← 一覧へ戻る」・見出しと ${q(M.MSG022)}だけを表示し、入力項目とボタンは表示せずに終了する`, expect: showsOnlyTopError },
    ];
    for (const o of categoriesOutcomes) {
      test(`[初期表示 / GET /categories ${statusLabel(o)}] GET /categories で ${returns(o)}、${o.label}`, async ({ page, api }) => {
        mockInitial(api);
        api.on('GET /categories', { status: o.status, body: o.body });
        if (o.leaves) api.allowUnmockedCalls();
        await page.goto(CREATE_PATH);
        await o.expect(page);
      });
    }

    test('[初期表示 / 読み込み中] GET /categories の応答が返るまでフォームを表示せず、返ったら表示する', async ({ page, api }) => {
      mockInitial(api);
      const reply = deferred<MockReply>();
      const cat = api.on('GET /categories', () => reply.promise);
      await page.goto(CREATE_PATH);
      await expect.poll(() => cat.requests.length).toBe(1);
      const u = ui(page);
      await expect(u.title).toBeHidden();
      await expect(u.draft).toBeHidden();
      reply.resolve({ status: 200, body: categories });
      await expect(u.title).toBeVisible();
      await expect(u.draft).toBeVisible();
    });
  });

  test.describe('API: 「下書き保存」ボタン押下', () => {
    test('[「下書き保存」ボタン押下 / POST /events リクエスト] 入力値を body に入れ、status に draft を入れる', async ({ page, api }) => {
      await open(page, api);
      const post = api.on('POST /events', { status: 201, body: createdEvent });
      await fillValid(page);
      api.allowUnmockedCalls(); // 201 でイベント編集へ遷移するため
      await ui(page).draft.click();
      await expect.poll(() => post.requests.length).toBe(1);
      // 概要は空なので送らない、開催形式は「会場」なので onlineUrl は送らない、タグは空の配列
      expect(post.last().body).toEqual({ ...validBody, status: 'draft' });
    });

    const conditionalRequestCases: { cond: string; label: string; setup: (u: UI) => Promise<void>; expected: Record<string, unknown> }[] = [
      {
        cond: '概要あり',
        label: '概要を入力すると summary を送る',
        setup: (u) => u.summary.fill('Go の基本を学ぶ'),
        expected: { ...validBody, summary: 'Go の基本を学ぶ', status: 'draft' },
      },
      {
        cond: 'オンライン',
        label: '「オンライン」なら onlineUrl を送り、入力済みの venueName は送らない',
        setup: (u) => chooseOnline(u), // 会場名は fillValid() で入力済み（切り替えても値は残る）
        expected: (({ venueName: _, ...rest }) => ({ ...rest, format: 'online', onlineUrl: ONLINE_URL, status: 'draft' }))(validBody),
      },
      {
        cond: 'タグあり',
        label: 'タグを選ぶと、選んだ値の配列を tags に送る',
        setup: async (u) => {
          await u.tag('初心者向け').check();
          await u.tag('無料').check();
        },
        expected: { ...validBody, tags: ['beginner', 'free'], status: 'draft' },
      },
    ];
    for (const c of conditionalRequestCases) {
      test(`[「下書き保存」ボタン押下 / POST /events リクエスト（${c.cond}）] ${c.label}`, async ({ page, api }) => {
        await open(page, api);
        const post = api.on('POST /events', { status: 201, body: createdEvent });
        await fillValid(page);
        await c.setup(ui(page));
        api.allowUnmockedCalls(); // 201 でイベント編集へ遷移するため
        await ui(page).draft.click();
        await expect.poll(() => post.requests.length).toBe(1);
        expect(post.last().body).toEqual(c.expected);
      });
    }

    test(`[「下書き保存」ボタン押下 / POST /events 201] ${q(M.MSG013)}を表示し、返ってきた id のイベント編集（/events/{id}/edit）へ遷移する`, async ({ page, api }) => {
      await open(page, api);
      api.on('POST /events', { status: 201, body: createdEvent });
      await fillValid(page);
      api.allowUnmockedCalls(); // 遷移先の画面の通信は確かめない
      await ui(page).draft.click();
      await expect(page.getByText(M.MSG013)).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/events/${createdEvent.id}/edit$`));
    });

    test('[「下書き保存」ボタン押下 / POST /events 201] ブラウザの履歴は置き換えるので、ブラウザの戻るでイベント作成に戻らない', async ({ page, api }) => {
      // 先に別のページを開いておく（戻る先を作るため）
      await page.goto('data:text/html,<title>before</title>');
      await open(page, api);
      api.on('POST /events', { status: 201, body: createdEvent });
      await fillValid(page);
      api.allowUnmockedCalls(); // 遷移先の画面、戻った先の画面の通信は確かめない
      await ui(page).draft.click();
      await expect(page).toHaveURL(new RegExp(`/events/${createdEvent.id}/edit$`));
      await page.goBack();
      await expect(page).not.toHaveURL(/\/events\/new$/);
    });

    const postOutcomes: Outcome[] = [
      { status: 401, body: apiError('unauthorized'), label: 'ログイン画面へ遷移する', leaves: true, expect: toLogin },
      { status: 403, body: apiError('forbidden'), label: `${q(M.MSG020)}を表示する`, expect: shows(M.MSG020) },
      { status: 422, body: validationError, label: 'errors[].message を対応する項目のエラー表示に表示し、その項目までスクロールする', expect: shows422 },
      { status: 500, other: true, label: `${q(M.MSG022)}を表示する`, expect: shows(M.MSG022) },
    ];
    for (const o of postOutcomes) {
      test(`[「下書き保存」ボタン押下 / POST /events ${statusLabel(o)}] 下書き保存で ${returns(o)}、${o.label}`, async ({ page, api }) => {
        await open(page, api);
        api.on('POST /events', { status: o.status, body: o.body });
        await fillValid(page);
        if (o.leaves) api.allowUnmockedCalls();
        await scrollDownAndClick(page, ui(page).draft);
        await o.expect(page);
      });
    }

    test('[「下書き保存」ボタン押下 / POST /events 422（上記以外の field）] 表示先の決まっていない field（format）のエラーも、errors[].message を表示する', async ({ page, api }) => {
      await open(page, api);
      api.on('POST /events', { status: 422, body: { errors: [{ field: 'format', message: '開催形式が正しくありません' }] } });
      await fillValid(page);
      await ui(page).draft.click();
      await expect(page.getByText('開催形式が正しくありません')).toBeVisible();
    });

    test('[「下書き保存」ボタン押下 / 保存中] 保存中は「下書き保存」「公開する」ボタンを非活性にし、画面に残る応答のあと非活性を解除する', async ({ page, api }) => {
      await open(page, api);
      const reply = deferred<MockReply>();
      const post = api.on('POST /events', () => reply.promise);
      await fillValid(page);
      const u = ui(page);
      await u.draft.click();
      await expect.poll(() => post.requests.length).toBe(1);
      await expect(u.draft).toBeDisabled();
      await expect(u.publish).toBeDisabled();
      reply.resolve(forbidden); // 201 はイベント編集へ遷移するので、画面に残る 403 で確かめる
      await expect(page.getByText(M.MSG020)).toBeVisible();
      await expect(u.draft).toBeEnabled();
      await expect(u.publish).toBeEnabled();
    });

    test(`[「下書き保存」ボタン押下 / 画面上部のエラーの消去] ${q(M.MSG022)}を表示したあと、もう一度保存すると画面上部のエラー表示を消す`, async ({ page, api }) => {
      await open(page, api);
      api.on('POST /events', { status: 500 });
      await fillValid(page);
      await ui(page).draft.click();
      await expect(page.getByText(M.MSG022)).toBeVisible();
      api.on('POST /events', forbidden); // 201 はイベント編集へ遷移するので、画面に残る 403 で確かめる
      await ui(page).draft.click();
      await expect(page.getByText(M.MSG020)).toBeVisible();
      await expect(page.getByText(M.MSG022)).toBeHidden();
    });
  });

  test.describe('API: 「公開する」ボタン押下', () => {
    const published = { ...createdEvent, status: 'published' as const };

    test('[「公開する」ボタン押下 / POST /events リクエスト] 下書き保存と同じ body に、status は published を入れる', async ({ page, api }) => {
      await open(page, api);
      const post = api.on('POST /events', { status: 201, body: published });
      await fillValid(page);
      api.allowUnmockedCalls(); // 201 でイベント一覧へ遷移するため
      await ui(page).publish.click();
      await expect.poll(() => post.requests.length).toBe(1);
      expect(post.last().body).toEqual({ ...validBody, status: 'published' });
    });

    const postOutcomes: Outcome[] = [
      { status: 201, body: published, label: `${q(M.MSG014)}を表示し、イベント一覧へ遷移する`, leaves: true, expect: showsAndToList(M.MSG014) },
      { status: 401, body: apiError('unauthorized'), label: 'ログイン画面へ遷移する', leaves: true, expect: toLogin },
      { status: 403, body: apiError('forbidden'), label: `${q(M.MSG020)}を表示する`, expect: shows(M.MSG020) },
      { status: 422, body: validationError, label: 'errors[].message を対応する項目のエラー表示に表示し、その項目までスクロールする', expect: shows422 },
      { status: 500, other: true, label: `${q(M.MSG022)}を表示する`, expect: shows(M.MSG022) },
    ];
    for (const o of postOutcomes) {
      test(`[「公開する」ボタン押下 / POST /events ${statusLabel(o)}] 公開で ${returns(o)}、${o.label}`, async ({ page, api }) => {
        await open(page, api);
        api.on('POST /events', { status: o.status, body: o.body });
        await fillValid(page);
        if (o.leaves) api.allowUnmockedCalls();
        await scrollDownAndClick(page, ui(page).publish);
        await o.expect(page);
      });
    }

    test('[「公開する」ボタン押下 / 保存中] 保存中は「下書き保存」「公開する」ボタンを非活性にし、画面に残る応答のあと非活性を解除する', async ({ page, api }) => {
      await open(page, api);
      const reply = deferred<MockReply>();
      const post = api.on('POST /events', () => reply.promise);
      await fillValid(page);
      const u = ui(page);
      await u.publish.click();
      await expect.poll(() => post.requests.length).toBe(1);
      await expect(u.draft).toBeDisabled();
      await expect(u.publish).toBeDisabled();
      reply.resolve(forbidden); // 201 はイベント一覧へ遷移するので、画面に残る 403 で確かめる
      await expect(page.getByText(M.MSG020)).toBeVisible();
      await expect(u.draft).toBeEnabled();
      await expect(u.publish).toBeEnabled();
    });

    test(`[「公開する」ボタン押下 / 画面上部のエラーの消去] ${q(M.MSG022)}を表示したあと、もう一度押すと画面上部のエラー表示を消す`, async ({ page, api }) => {
      await open(page, api);
      api.on('POST /events', { status: 500 });
      await fillValid(page);
      await ui(page).publish.click();
      await expect(page.getByText(M.MSG022)).toBeVisible();
      api.on('POST /events', forbidden); // 201 はイベント一覧へ遷移するので、画面に残る 403 で確かめる
      await ui(page).publish.click();
      await expect(page.getByText(M.MSG020)).toBeVisible();
      await expect(page.getByText(M.MSG022)).toBeHidden();
    });
  });

  test.describe('API を呼ばない手順', () => {
    test(`[初期表示 / member のとき / 閲覧権限 member] member が開くと ${q(M.MSG020)}を表示する`, async ({ page, api }) => {
      mockInitial(api, users.member);
      api.allowUnmockedCalls(); // 次の手順でイベント一覧へ遷移するため
      await page.goto(CREATE_PATH);
      await expect(page.getByText(M.MSG020)).toBeVisible();
    });

    test('[初期表示 / member のとき / 閲覧権限 member] member が開くとイベント一覧へ遷移して終了する', async ({ page, api }) => {
      const { categories: cat } = mockInitial(api, users.member);
      api.allowUnmockedCalls(); // イベント一覧へ遷移するため
      await page.goto(CREATE_PATH);
      await toList(page);
      // 「終了する」ので、後続の GET /categories は呼ばない
      expect(cat.requests).toHaveLength(0);
    });

    test('[初期表示 / 入力項目 初期値] 各入力項目に、画面項目の表の初期値を入れる', async ({ page, api }) => {
      await open(page, api);
      const u = ui(page);
      await expect(u.title).toHaveValue('');
      await expect(u.summary).toHaveValue('');
      await expect(u.category.locator('option:checked')).toHaveText('選択してください');
      await expect(u.onsite).toBeChecked();
      await expect(u.online).not.toBeChecked();
      await expect(u.venue).toHaveValue('');
      await expect(u.startDate).toHaveValue('');
      await expect(u.capacity).toHaveValue('');
      for (const tag of TAGS) await expect(u.tag(tag)).not.toBeChecked();
      await u.online.check(); // 配信 URL は「オンライン」のときだけ表示される
      await expect(u.onlineUrl).toHaveValue('');
    });

    const formatCases = [
      { item: '会場名', field: 'venue' as const, select: '会場', visible: true },
      { item: '配信 URL', field: 'onlineUrl' as const, select: '会場', visible: false },
      { item: '配信 URL', field: 'onlineUrl' as const, select: 'オンライン', visible: true },
      { item: '会場名', field: 'venue' as const, select: 'オンライン', visible: false },
    ];
    for (const c of formatCases) {
      test(`[開催形式の選択を変更 / 「${c.select}」を選んだとき / ${c.item} 表示条件] 開催形式で「${c.select}」を選ぶと、${c.item}を${c.visible ? '表示する' : '非表示にする'}`, async ({ page, api }) => {
        await open(page, api);
        const u = ui(page);
        // 初期値は「会場」なので、いったん反対を選んでから選び直す
        await (c.select === '会場' ? u.online : u.onsite).check();
        await (c.select === '会場' ? u.onsite : u.online).check();
        if (c.visible) await expect(u[c.field]).toBeVisible();
        else await expect(u[c.field]).toBeHidden();
      });
    }

    test(`[開催形式の選択を変更 / 「会場」を選んだとき / 配信 URL のエラーの消去] ${q(M.MSG001('配信 URL'))}を表示したあと「会場」を選ぶと、配信 URL のエラー表示を非表示にする`, async ({ page, api }) => {
      await open(page, api);
      await fillValid(page);
      const u = ui(page);
      await u.online.check(); // 配信 URL は空のまま
      await u.draft.click();
      await expect(page.getByText(M.MSG001('配信 URL'))).toBeVisible();
      await u.onsite.check();
      await expect(u.venue).toBeVisible();
      await expect(page.getByText(M.MSG001('配信 URL'))).toBeHidden();
    });

    test(`[開催形式の選択を変更 / 「オンライン」を選んだとき / 会場名のエラーの消去] ${q(M.MSG001('会場名'))}を表示したあと「オンライン」を選ぶと、会場名のエラー表示を非表示にする`, async ({ page, api }) => {
      await open(page, api);
      await fillValid(page);
      const u = ui(page);
      await u.venue.fill('');
      await u.draft.click();
      await expect(page.getByText(M.MSG001('会場名'))).toBeVisible();
      await u.online.check();
      await expect(u.onlineUrl).toBeVisible();
      await expect(page.getByText(M.MSG001('会場名'))).toBeHidden();
    });

    // 選び直して表示した項目は空のまま（必須に違反したまま）なので、表示したときにバリデーションをやり直す実装なら、エラーがまた出る
    test('[開催形式の選択を変更 / 選び直して表示した項目のエラー表示 / 配信 URL のエラー] 配信 URL のエラーを表示したあと「会場」を選び、「オンライン」を選び直すと、配信 URL のエラー表示は非表示のままにする', async ({ page, api }) => {
      await open(page, api);
      await fillValid(page);
      const u = ui(page);
      await u.online.check(); // 配信 URL は空のまま
      await u.draft.click();
      await expect(page.getByText(M.MSG001('配信 URL'))).toBeVisible();
      await u.onsite.check();
      await expect(u.venue).toBeVisible();
      await u.online.check();
      await expect(u.onlineUrl).toBeVisible();
      await expect(u.onlineUrl).toHaveValue('');
      await expect(page.getByText(M.MSG001('配信 URL'))).toBeHidden();
    });

    test('[開催形式の選択を変更 / 選び直して表示した項目のエラー表示 / 会場名のエラー] 会場名のエラーを表示したあと「オンライン」を選び、「会場」を選び直すと、会場名のエラー表示は非表示のままにする', async ({ page, api }) => {
      await open(page, api);
      await fillValid(page);
      const u = ui(page);
      await u.venue.fill('');
      await u.draft.click();
      await expect(page.getByText(M.MSG001('会場名'))).toBeVisible();
      await u.online.check();
      await expect(u.onlineUrl).toBeVisible();
      await u.onsite.check();
      await expect(u.venue).toBeVisible();
      await expect(u.venue).toHaveValue('');
      await expect(page.getByText(M.MSG001('会場名'))).toBeHidden();
    });

    test('[開催形式の選択を変更 / 入力済みの値] 非表示にした項目の入力済みの値は残し、選び直すと戻る', async ({ page, api }) => {
      await open(page, api);
      const u = ui(page);
      await u.venue.fill('渋谷オフィス 5F');
      await u.online.check();
      await expect(u.venue).toBeHidden();
      await u.onsite.check();
      await expect(u.venue).toHaveValue('渋谷オフィス 5F');
    });

    test(`[タグの選択を変更 / 3 つ以下のとき / タグのエラーの消去] ${q(M.MSG011('タグ', 3))}を表示したあと選択を 1 つ外すと、タグのエラー表示を非表示にする`, async ({ page, api }) => {
      await open(page, api);
      const u = ui(page);
      for (const tag of ['初心者向け', 'ハンズオン', '交流']) await u.tag(tag).check();
      await u.tag('無料').click();
      await expect(page.getByText(M.MSG011('タグ', 3))).toBeVisible();
      await u.tag('交流').uncheck();
      await expect(u.tag('交流')).not.toBeChecked();
      await expect(page.getByText(M.MSG011('タグ', 3))).toBeHidden();
    });

    test('[タグの選択を変更 / 3 つ以下のとき] 3 つ目までは、選んだチェックを外さずに終了する', async ({ page, api }) => {
      await open(page, api);
      const u = ui(page);
      for (const tag of ['初心者向け', 'ハンズオン', '交流']) await u.tag(tag).click();
      for (const tag of ['初心者向け', 'ハンズオン', '交流']) await expect(u.tag(tag)).toBeChecked();
      await expect(page.getByText(M.MSG011('タグ', 3))).toBeHidden();
    });

    test('[タグの選択を変更 / 4 つ目を選んだとき] 4 つ目を選ぶと、今選んだチェックを外す', async ({ page, api }) => {
      await open(page, api);
      const u = ui(page);
      for (const tag of ['初心者向け', 'ハンズオン', '交流']) await u.tag(tag).check();
      await u.tag('無料').click();
      await expect(u.tag('無料')).not.toBeChecked();
      for (const tag of ['初心者向け', 'ハンズオン', '交流']) await expect(u.tag(tag)).toBeChecked();
    });

    test(`[タグの選択を変更 / 4 つ目を選んだとき] 4 つ目を選ぶと、${q(M.MSG011('タグ', 3))}を表示する`, async ({ page, api }) => {
      await open(page, api);
      const u = ui(page);
      for (const tag of ['初心者向け', 'ハンズオン', '交流']) await u.tag(tag).check();
      await u.tag('無料').click();
      await expect(page.getByText(M.MSG011('タグ', 3))).toBeVisible();
    });
  });

  test.describe('バリデーション・入力できる範囲', () => {
    // ---- タイトルからフォーカスが外れる ----
    const titleErrors = [M.MSG001('タイトル'), M.MSG003('タイトル', 2), M.MSG004('タイトル', 50), M.MSG005('タイトル')];
    const titleCases = [
      { cond: '必須', input: '空', value: '', error: M.MSG001('タイトル') },
      { cond: '2 文字以上', input: '1 文字', value: 'あ', error: M.MSG003('タイトル', 2) },
      { cond: '2 文字以上 境目', input: '2 文字', value: 'ああ', error: null },
      { cond: '50 文字以内', input: '51 文字', value: 'あ'.repeat(51), error: M.MSG004('タイトル', 50) },
      { cond: '50 文字以内 境目', input: '50 文字', value: 'あ'.repeat(50), error: null },
      { cond: '使える文字', input: '絵文字', value: 'ハンズオン😀', error: M.MSG005('タイトル') },
    ];
    for (const c of titleCases) {
      test(`[タイトル ${c.cond}] タイトルに${c.input}を入れてフォーカスを外すと、${c.error ? `${q(c.error)}を表示する` : 'エラーを表示しない'}`, async ({ page, api }) => {
        await open(page, api);
        const u = ui(page);
        if (c.error) {
          await u.title.fill('仮');
          await u.title.fill(c.value);
          await u.title.blur();
          await expect(page.getByText(c.error)).toBeVisible();
        } else {
          // 先にエラーを出しておき、境目の値に直すと消えることで、チェックが走ったことを確かめる
          await u.title.fill('あ');
          await u.title.blur();
          await expect(page.getByText(M.MSG003('タイトル', 2))).toBeVisible();
          await u.title.fill(c.value);
          await u.title.blur();
          for (const m of titleErrors) await expect(page.getByText(m)).toBeHidden();
        }
      });
    }

    test(`[タイトル 優先順位] 「50 文字以内」と「使える文字」に同時に違反すると、上の行の ${q(M.MSG004('タイトル', 50))}だけを表示する`, async ({ page, api }) => {
      await open(page, api);
      await ui(page).title.fill(`${'あ'.repeat(50)}😀`); // 51 文字（「50 文字以内」に違反）かつ絵文字（「使える文字」に違反）
      await ui(page).title.blur();
      await expect(page.getByText(M.MSG004('タイトル', 50))).toBeVisible();
      await expect(page.getByText(M.MSG005('タイトル'))).toBeHidden();
    });

    test('[タイトル エラーの消去] エラーのあと正しい値にしてフォーカスを外すと、タイトルのエラー表示を非表示にする', async ({ page, api }) => {
      await open(page, api);
      const u = ui(page);
      await u.title.fill('あ');
      await u.title.blur();
      await expect(page.getByText(M.MSG003('タイトル', 2))).toBeVisible();
      await u.title.fill('Go 勉強会');
      await u.title.blur();
      await expect(page.getByText(M.MSG003('タイトル', 2))).toBeHidden();
    });

    // ---- 定員に入力 ----
    const capacityCases = [
      { cond: '必須', input: '空', value: '', error: M.MSG001('定員') },
      { cond: '1〜999', input: '0', value: '0', error: M.MSG009('定員', 1, 999) },
      { cond: '1〜999 境目', input: '1', value: '1', error: null },
      { cond: '1〜999 境目', input: '999', value: '999', error: null },
    ];
    for (const c of capacityCases) {
      test(`[定員 ${c.cond}] 定員に ${c.input} を入力すると、${c.error ? `${q(c.error)}を表示する` : 'エラーを表示しない'}`, async ({ page, api }) => {
        await open(page, api);
        const u = ui(page);
        if (c.error) {
          await u.capacity.fill('5');
          await u.capacity.fill(c.value);
          await expect(page.getByText(c.error)).toBeVisible();
        } else {
          // 先にエラーを出しておき、境目の値に直すと消えることで、チェックが走ったことを確かめる
          await u.capacity.fill('0');
          await expect(page.getByText(M.MSG009('定員', 1, 999))).toBeVisible();
          await u.capacity.fill(c.value);
          for (const m of [M.MSG001('定員'), M.MSG009('定員', 1, 999)]) await expect(page.getByText(m)).toBeHidden();
        }
      });
    }

    test('[定員 エラーの消去] エラーのあと正しい値を入力すると、定員のエラー表示を非表示にする', async ({ page, api }) => {
      await open(page, api);
      const u = ui(page);
      await u.capacity.fill('0');
      await expect(page.getByText(M.MSG009('定員', 1, 999))).toBeVisible();
      await u.capacity.fill('10');
      await expect(page.getByText(M.MSG009('定員', 1, 999))).toBeHidden();
    });

    // ---- 定員の入力できる範囲 ----
    test('[定員 入力可能最大文字数] 4 桁目を入力しても入らない', async ({ page, api }) => {
      await open(page, api);
      await ui(page).capacity.pressSequentially('1234');
      await expect(ui(page).capacity).toHaveValue('123');
    });

    test('[定員 入力可能文字種] 半角数字以外は受け付けない', async ({ page, api }) => {
      await open(page, api);
      await ui(page).capacity.pressSequentially('1a2');
      await expect(ui(page).capacity).toHaveValue('12');
    });

    test('[定員 入力可能文字種（備考: 変換）] 全角数字は入力中に半角へ変換する', async ({ page, api }) => {
      await open(page, api);
      await ui(page).capacity.pressSequentially('１２');
      await expect(ui(page).capacity).toHaveValue('12');
    });

    test('[定員 入力可能最大文字数 / 共通ルール 入力可能文字種・入力可能最大文字数のある項目への貼り付け] 4 桁以上をまとめて入力すると、3 桁に収める', async ({ page, api }) => {
      await open(page, api);
      await ui(page).capacity.focus();
      await page.keyboard.insertText('12345');
      await expect(ui(page).capacity).toHaveValue('123');
    });

    test('[定員 入力可能文字種 / 共通ルール 入力可能文字種・入力可能最大文字数のある項目への貼り付け] 使えない文字を含めてまとめて入力すると、その文字を取り除く', async ({ page, api }) => {
      await open(page, api);
      await ui(page).capacity.focus();
      await page.keyboard.insertText('1a2');
      await expect(ui(page).capacity).toHaveValue('12');
    });

    // ---- 「下書き保存」ボタン押下のチェック表 ----
    // 必須項目を正しく埋めてから 1 項目だけ崩し、「下書き保存」を押す。
    // チェックを通ったときの保存は、画面に残る 403 を返す（201 はイベント編集へ遷移するため）
    const submitCases: { cond: string; input: string; error: string | null; setup: (u: UI) => Promise<unknown> }[] = [
      { cond: '概要 200 文字以内', input: '概要を 201 文字', error: M.MSG004('概要', 200), setup: (u) => u.summary.fill('あ'.repeat(201)) },
      { cond: '概要 200 文字以内 境目', input: '概要を 200 文字', error: null, setup: (u) => u.summary.fill('あ'.repeat(200)) },
      { cond: 'カテゴリ 必須', input: 'カテゴリを未選択', error: M.MSG002('カテゴリ'), setup: (u) => u.category.selectOption({ label: '選択してください' }) },
      { cond: '会場名 必須', input: '会場名を空', error: M.MSG001('会場名'), setup: (u) => u.venue.fill('') },
      { cond: '会場名 100 文字以内', input: '会場名を 101 文字', error: M.MSG004('会場名', 100), setup: (u) => u.venue.fill('あ'.repeat(101)) },
      { cond: '会場名 100 文字以内 境目', input: '会場名を 100 文字', error: null, setup: (u) => u.venue.fill('あ'.repeat(100)) },
      { cond: '会場名 使える文字', input: '会場名を絵文字入り', error: M.MSG005('会場名'), setup: (u) => u.venue.fill('渋谷オフィス🏢') },
      { cond: '配信 URL 必須', input: 'オンラインで配信 URL を空', error: M.MSG001('配信 URL'), setup: (u) => u.online.check() },
      { cond: '配信 URL 使える文字', input: '配信 URL を全角文字入り', error: M.MSG006('配信 URL'), setup: (u) => chooseOnline(u, 'https://例え.example.com') },
      { cond: '配信 URL https:// で始まる URL 形式', input: '配信 URL を http:// で始まる値', error: M.MSG007('配信 URL'), setup: (u) => chooseOnline(u, 'http://meet.example.com/go') },
      { cond: '配信 URL https:// で始まる URL 形式 境目', input: '配信 URL を https:// で始まる値', error: null, setup: (u) => chooseOnline(u) },
      { cond: '開催日 必須', input: '開催日を空', error: M.MSG001('開催日'), setup: (u) => u.startDate.fill('') },
      { cond: '開催日 今日以降', input: '開催日を昨日', error: M.MSG008('開催日'), setup: (u) => u.startDate.fill(YESTERDAY) },
      { cond: '開催日 今日以降 境目', input: '開催日を今日', error: null, setup: (u) => u.startDate.fill(TODAY) },
    ];
    for (const c of submitCases) {
      test(`[${c.cond}] ${c.input}にして「下書き保存」を押すと、${c.error ? `${q(c.error)}を表示し、API を呼ばない` : 'エラーを表示せず、API を呼ぶ'}`, async ({ page, api }) => {
        await open(page, api);
        const post = api.on('POST /events', forbidden);
        await fillValid(page);
        await c.setup(ui(page));
        await ui(page).draft.click();
        if (c.error) {
          await expect(page.getByText(c.error)).toBeVisible();
          expect(post.requests).toHaveLength(0);
        } else {
          await expect.poll(() => post.requests.length).toBe(1);
        }
      });
    }

    test.fixme('[配信 URL 文字数の上限] 配信 URL が上限の文字数を超えると、エラーを表示する（TBD: 配信 URL の最大文字数は何文字か）', async () => {});

    test(`[会場名 優先順位] 「100 文字以内」と「使える文字」に同時に違反すると、上の行の ${q(M.MSG004('会場名', 100))}だけを表示する`, async ({ page, api }) => {
      await open(page, api);
      await fillValid(page);
      await ui(page).venue.fill(`${'あ'.repeat(100)}😀`); // 101 文字（「100 文字以内」に違反）かつ絵文字（「使える文字」に違反）
      await ui(page).draft.click();
      await expect(page.getByText(M.MSG004('会場名', 100))).toBeVisible();
      await expect(page.getByText(M.MSG005('会場名'))).toBeHidden();
    });

    test(`[配信 URL 優先順位] 「使える文字」と「https:// で始まる URL 形式」に同時に違反すると、上の行の ${q(M.MSG006('配信 URL'))}だけを表示する`, async ({ page, api }) => {
      await open(page, api);
      await fillValid(page);
      await chooseOnline(ui(page), 'ｈｔｔｐｓ://meet'); // 全角文字（「使える文字」に違反）かつ https:// で始まらない（形式に違反）
      await ui(page).draft.click();
      await expect(page.getByText(M.MSG006('配信 URL'))).toBeVisible();
      await expect(page.getByText(M.MSG007('配信 URL'))).toBeHidden();
    });

    test(`[「下書き保存」ボタン押下 / タイトルのバリデーション] 送信時にもタイトルのバリデーションを行う（1 文字で「下書き保存」を押すと ${q(M.MSG003('タイトル', 2))}を表示し、API を呼ばない）`, async ({ page, api }) => {
      await open(page, api);
      const post = api.on('POST /events', forbidden);
      await fillValid(page);
      await ui(page).title.fill('あ');
      await ui(page).draft.click();
      await expect(page.getByText(M.MSG003('タイトル', 2))).toBeVisible();
      expect(post.requests).toHaveLength(0);
    });

    test(`[「下書き保存」ボタン押下 / 定員のバリデーション] 送信時にも定員のバリデーションを行う（0 で「下書き保存」を押すと ${q(M.MSG009('定員', 1, 999))}を表示し、API を呼ばない）`, async ({ page, api }) => {
      await open(page, api);
      const post = api.on('POST /events', forbidden);
      await fillValid(page);
      await ui(page).capacity.fill('0');
      await ui(page).draft.click();
      await expect(page.getByText(M.MSG009('定員', 1, 999))).toBeVisible();
      expect(post.requests).toHaveLength(0);
    });

    test('[「下書き保存」ボタン押下 / 非表示の項目] 「オンライン」のとき、非表示の会場名が空でもチェックしない', async ({ page, api }) => {
      await open(page, api);
      const post = api.on('POST /events', forbidden);
      await fillValid(page);
      const u = ui(page);
      await u.venue.fill('');
      await chooseOnline(u);
      await u.draft.click();
      await expect.poll(() => post.requests.length).toBe(1);
      await expect(page.getByText(M.MSG001('会場名'))).toBeHidden();
    });

    test('[「下書き保存」ボタン押下 / エラーの表示] 送信時、エラーのなくなった項目のエラー表示を非表示にし、エラーのある項目にはそれぞれ表示する', async ({ page, api }) => {
      await open(page, api);
      await fillValid(page);
      const u = ui(page);
      await u.venue.fill('');
      await u.startDate.fill('');
      await u.draft.click();
      await expect(page.getByText(M.MSG001('会場名'))).toBeVisible();
      await expect(page.getByText(M.MSG001('開催日'))).toBeVisible();
      await u.venue.fill('渋谷オフィス 5F');
      await u.draft.click();
      await expect(page.getByText(M.MSG001('会場名'))).toBeHidden();
      await expect(page.getByText(M.MSG001('開催日'))).toBeVisible();
    });

    // 送信時にだけチェックする項目の、エラー表示が非表示に戻る側。直したあとの保存は、画面に残る 403 を返して確かめる
    const clearCases: { item: string; message: string; breakIt: (u: UI) => Promise<unknown>; fixIt: (u: UI) => Promise<unknown> }[] = [
      { item: '概要', message: M.MSG004('概要', 200), breakIt: (u) => u.summary.fill('あ'.repeat(201)), fixIt: (u) => u.summary.fill('あ'.repeat(200)) },
      { item: 'カテゴリ', message: M.MSG002('カテゴリ'), breakIt: (u) => u.category.selectOption({ label: '選択してください' }), fixIt: (u) => u.category.selectOption({ label: '勉強会' }) },
      { item: '会場名', message: M.MSG001('会場名'), breakIt: (u) => u.venue.fill(''), fixIt: (u) => u.venue.fill('渋谷オフィス 5F') },
      { item: '配信 URL', message: M.MSG001('配信 URL'), breakIt: (u) => u.online.check(), fixIt: (u) => u.onlineUrl.fill(ONLINE_URL) },
      { item: '開催日', message: M.MSG001('開催日'), breakIt: (u) => u.startDate.fill(''), fixIt: (u) => u.startDate.fill('2026-10-20') },
    ];
    for (const c of clearCases) {
      test(`[${c.item} エラーの消去] 送信時のエラーのあと正しい値にして「下書き保存」を押すと、${c.item}のエラー表示を非表示にする`, async ({ page, api }) => {
        await open(page, api);
        api.on('POST /events', forbidden);
        await fillValid(page);
        const u = ui(page);
        await c.breakIt(u);
        await u.draft.click();
        await expect(page.getByText(c.message)).toBeVisible();
        await c.fixIt(u);
        await u.draft.click();
        await expect(page.getByText(M.MSG020)).toBeVisible();
        await expect(page.getByText(c.message)).toBeHidden();
      });
    }

    test('[「下書き保存」ボタン押下 / スクロール] 送信時にエラーがあれば、最初のエラー項目までスクロールする', async ({ page, api }) => {
      await open(page, api);
      await fillValid(page);
      await ui(page).title.fill('あ'); // 最初のエラー項目を、画面のいちばん上の入力項目（タイトル）にする
      await scrollDownAndClick(page, ui(page).draft);
      await expect(page.getByText(M.MSG003('タイトル', 2))).toBeVisible();
      await expect(ui(page).title).toBeInViewport();
    });

    // ---- 「公開する」ボタン押下 ----
    test(`[「公開する」ボタン押下 / 「下書き保存」ボタン押下のバリデーション] 「公開する」でも下書き保存と同じバリデーションを行う（概要 201 文字で ${q(M.MSG004('概要', 200))}を表示し、API を呼ばない）`, async ({ page, api }) => {
      // 必須項目が空だと「公開する」は非活性（「公開する」ボタンの活性条件）なので、必須以外の条件で確かめる
      await open(page, api);
      const post = api.on('POST /events', forbidden);
      await fillValid(page);
      await ui(page).summary.fill('あ'.repeat(201));
      await ui(page).publish.click();
      await expect(page.getByText(M.MSG004('概要', 200))).toBeVisible();
      expect(post.requests).toHaveLength(0);
    });

    test('[「公開する」ボタン押下 / 非表示の項目] 「オンライン」のとき、非表示の会場名が空でもチェックしない', async ({ page, api }) => {
      await open(page, api);
      const post = api.on('POST /events', forbidden);
      await fillValid(page);
      const u = ui(page);
      await u.venue.fill('');
      await chooseOnline(u);
      await u.publish.click();
      await expect.poll(() => post.requests.length).toBe(1);
      await expect(page.getByText(M.MSG001('会場名'))).toBeHidden();
    });

    // ---- 共通ルール（入力） ----
    test(`[共通ルール 改行を 1 文字と数えるか / 概要] 改行を含めて 201 文字になると、${q(M.MSG004('概要', 200))}を表示する`, async ({ page, api }) => {
      await open(page, api);
      const post = api.on('POST /events', forbidden);
      await fillValid(page);
      await ui(page).summary.fill(`${'あ'.repeat(100)}\n${'あ'.repeat(100)}`); // 200 文字 + 改行 1 文字
      await ui(page).draft.click();
      await expect(page.getByText(M.MSG004('概要', 200))).toBeVisible();
      expect(post.requests).toHaveLength(0);
    });

    test('[共通ルール 文字数のバリデーション時に前後の空白を取り除くか / タイトル] 前後の空白を除いて 50 文字なら、「50 文字以内」のエラーにならない', async ({ page, api }) => {
      await open(page, api);
      const u = ui(page);
      await u.title.fill('あ'.repeat(51));
      await u.title.blur();
      await expect(page.getByText(M.MSG004('タイトル', 50))).toBeVisible();
      await u.title.fill(`  ${'あ'.repeat(50)}  `); // 空白を含めると 54 文字、除くと 50 文字
      await u.title.blur();
      await expect(page.getByText(M.MSG004('タイトル', 50))).toBeHidden();
    });

    test('[共通ルール 送信時に前後の空白を取り除くか / タイトル] タイトルの前後に空白を付けて保存すると、取り除いた値を送る', async ({ page, api }) => {
      await open(page, api);
      const post = api.on('POST /events', forbidden);
      await fillValid(page);
      await ui(page).title.fill('  Go 勉強会  ');
      await ui(page).draft.click();
      await expect.poll(() => post.requests.length).toBe(1);
      expect(post.last().body.title).toBe('Go 勉強会');
    });
  });

  test.describe('画面項目の条件・値', () => {
    test('[document.title] 開くと、ページのタイトルを「イベントを作成」にする', async ({ page, api }) => {
      await open(page, api);
      await expect(page).toHaveTitle('イベントを作成');
    });

    test('[初期フォーカス] 開くと、タイトルにフォーカスがある', async ({ page, api }) => {
      await open(page, api);
      await expect(ui(page).title).toBeFocused();
    });

    const placeholderCases = [
      { item: 'タイトル', field: 'title' as const, text: '例: はじめての TypeScript ハンズオン' },
      { item: '概要', field: 'summary' as const, text: 'イベントの内容を 200 文字以内で入力' },
      { item: '会場名', field: 'venue' as const, text: '例: 渋谷オフィス 5F セミナールーム' },
      { item: '配信 URL', field: 'onlineUrl' as const, text: 'https://', online: true },
      { item: '定員', field: 'capacity' as const, text: '1〜999' },
    ];
    for (const c of placeholderCases) {
      test(`[${c.item} プレースホルダー] 「${c.text}」を表示する`, async ({ page, api }) => {
        await open(page, api);
        if (c.online) await ui(page).online.check(); // 配信 URL は「オンライン」のときだけ表示される
        await expect(ui(page)[c.field]).toHaveAttribute('placeholder', c.text);
      });
    }

    // 会場名・配信 URL の表示条件は、[開催形式の選択を変更 / 「会場」を選んだとき / 会場名 表示条件] などで確かめている

    const formatValueCases = [
      { label: '会場', value: 'onsite' },
      { label: 'オンライン', value: 'online' },
    ];
    for (const c of formatValueCases) {
      test(`[開催形式 対応表] 「${c.label}」を選んで保存すると、format に ${c.value} を送る`, async ({ page, api }) => {
        await open(page, api);
        const post = api.on('POST /events', forbidden); // 画面に残る 403 を返す
        await fillValid(page);
        if (c.value === 'online') await chooseOnline(ui(page));
        await ui(page).draft.click();
        await expect.poll(() => post.requests.length).toBe(1);
        expect(post.last().body.format).toBe(c.value);
      });
    }

    const tagValueCases = [
      { label: '初心者向け', value: 'beginner' },
      { label: 'ハンズオン', value: 'hands-on' },
      { label: '交流', value: 'networking' },
      { label: '無料', value: 'free' },
      { label: '英語', value: 'english' },
    ];
    for (const c of tagValueCases) {
      test(`[タグ 対応表] 「${c.label}」を選んで保存すると、tags に ${c.value} を送る`, async ({ page, api }) => {
        await open(page, api);
        const post = api.on('POST /events', forbidden); // 画面に残る 403 を返す
        await fillValid(page);
        await ui(page).tag(c.label).check();
        await ui(page).draft.click();
        await expect.poll(() => post.requests.length).toBe(1);
        expect(post.last().body.tags).toEqual([c.value]);
      });
    }

    test('[「下書き保存」ボタン 活性条件] タイトルが空なら非活性', async ({ page, api }) => {
      await open(page, api);
      await expect(ui(page).draft).toBeDisabled();
    });

    test('[「下書き保存」ボタン 活性条件] タイトルに 1 文字以上入力されていれば活性', async ({ page, api }) => {
      await open(page, api);
      await ui(page).title.fill('あ');
      await expect(ui(page).draft).toBeEnabled();
    });

    test('[「公開する」ボタン 活性条件] 表示中のタイトル・カテゴリ・会場名・開催日・定員がすべて入力されていれば活性', async ({ page, api }) => {
      await open(page, api);
      await fillValid(page);
      await expect(ui(page).publish).toBeEnabled();
    });

    test('[「公開する」ボタン 活性条件] 表示中の項目が 1 つでも空（会場名が空）なら非活性', async ({ page, api }) => {
      await open(page, api);
      await fillValid(page);
      await ui(page).venue.fill('');
      await expect(ui(page).publish).toBeDisabled();
    });

    test('[「公開する」ボタン 活性条件] 非表示の会場名が空でも、表示中の項目（配信 URL を含む）がすべて入力されていれば活性', async ({ page, api }) => {
      await open(page, api);
      await fillValid(page);
      const u = ui(page);
      await u.venue.fill('');
      await chooseOnline(u);
      await expect(u.publish).toBeEnabled();
    });

    test('[エラー表示 表示条件] 初期表示では、どのエラー表示も表示しない', async ({ page, api }) => {
      // エラー表示に出るメッセージが、どれも画面にないことで確かめる。表示される側・非表示に戻る側は、アクションのケースで確かめている
      const messages = [
        M.MSG022, // 画面上部のエラー
        M.MSG001('タイトル'), M.MSG003('タイトル', 2), M.MSG004('タイトル', 50), M.MSG005('タイトル'),
        M.MSG004('概要', 200),
        M.MSG002('カテゴリ'),
        M.MSG001('会場名'), M.MSG004('会場名', 100), M.MSG005('会場名'),
        M.MSG001('配信 URL'), M.MSG006('配信 URL'), M.MSG007('配信 URL'),
        M.MSG001('開催日'), M.MSG008('開催日'),
        M.MSG001('定員'), M.MSG009('定員', 1, 999),
        M.MSG011('タグ', 3),
      ];
      await open(page, api);
      for (const m of messages) await expect(page.getByText(m)).toBeHidden();
    });

    test('[離脱の確認 表示条件 / 「キャンセル」ボタン 表示条件 / 「離れる」ボタン 表示条件] 「← 一覧へ戻る」を押す前は、確認もその中のボタンも表示しない', async ({ page, api }) => {
      await open(page, api);
      const u = ui(page);
      await u.title.fill('変更したタイトル');
      await expect(u.back).toBeVisible();
      await expect(u.dialog).toBeHidden();
      await expect(u.dialogCancel).toBeHidden();
      await expect(u.dialogLeave).toBeHidden();
    });

    test('[離脱の確認 背面の操作] 表示中は背面のタイトルを操作できず、値も変わらない', async ({ page, api }) => {
      await open(page, api);
      const u = ui(page);
      await u.title.fill('変更したタイトル');
      await u.back.click();
      await expect(u.dialog).toBeVisible();
      await expect(u.title.click({ timeout: 1000 })).rejects.toThrow();
      await expect(u.title).toHaveValue('変更したタイトル');
    });

    // ---- 共通ルール（アクセシビリティ） ----
    test('[共通ルール アクセシビリティ / 入力項目のエラーの説明] タイトルのエラーの内容は、タイトルの入力欄の説明として伝わる', async ({ page, api }) => {
      await open(page, api);
      await ui(page).title.fill('あ');
      await ui(page).title.blur();
      await expect(page.getByText(M.MSG003('タイトル', 2))).toBeVisible();
      // どの属性で結び付けているかは見ない。読み上げソフトに伝わる「説明」にエラーの文言が入っていることを確かめる
      await expect(ui(page).title).toHaveAccessibleDescription(containing(M.MSG003('タイトル', 2)));
    });

    const submitFocusCases = [
      { name: '下書き保存', button: 'draft' as const },
      { name: '公開する', button: 'publish' as const },
    ];
    for (const c of submitFocusCases) {
      test(`[共通ルール アクセシビリティ / 送信時のエラーでのフォーカス / 「${c.name}」ボタン] エラーがあるまま「${c.name}」を押すと、最初のエラー項目のタイトルにフォーカスを移す`, async ({ page, api }) => {
        await open(page, api);
        await fillValid(page);
        await ui(page).title.fill('あ');
        await ui(page)[c.button].click();
        await expect(page.getByText(M.MSG003('タイトル', 2))).toBeVisible();
        await expect(ui(page).title).toBeFocused();
      });
    }

    test('[共通ルール アクセシビリティ / 確認ダイアログを開いたとき / 離脱の確認] 離脱の確認を開くと、最初のボタンの「キャンセル」にフォーカスを移す', async ({ page, api }) => {
      await open(page, api);
      const u = ui(page);
      await u.title.fill('変更したタイトル');
      await u.back.click();
      await expect(u.dialogCancel).toBeFocused();
    });

    test('[共通ルール アクセシビリティ / 確認ダイアログを閉じたとき / 離脱の確認] 離脱の確認を「キャンセル」で閉じると、「← 一覧へ戻る」リンクにフォーカスを戻す', async ({ page, api }) => {
      await open(page, api);
      const u = ui(page);
      await u.title.fill('変更したタイトル');
      await u.back.click();
      await u.dialogCancel.click();
      await expect(u.dialog).toBeHidden();
      await expect(u.back).toBeFocused();
    });

    test('[共通ルール アクセシビリティ / Esc キー / 離脱の確認] 離脱の確認で Esc キーを押すと、閉じて画面に残る', async ({ page, api }) => {
      await open(page, api);
      const u = ui(page);
      await u.title.fill('変更したタイトル');
      await u.back.click();
      await expect(u.dialog).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(u.dialog).toBeHidden();
      await stays(page);
    });

    test('[共通ルール アクセシビリティ / Tab キーの順序] タイトルから Tab キーを押すと、概要、カテゴリの順にフォーカスが移る', async ({ page, api }) => {
      await open(page, api);
      const u = ui(page);
      await u.title.focus();
      await page.keyboard.press('Tab');
      await expect(u.summary).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(u.category).toBeFocused();
    });
  });

  test.describe('遷移', () => {
    test('[「← 一覧へ戻る」リンク押下 / 入力内容に変更がないとき] 入力内容に変更がなければ、離脱の確認を出さずに同じタブでイベント一覧へ遷移する', async ({ page, api }) => {
      await open(page, api);
      api.allowUnmockedCalls();
      await ui(page).back.click();
      await toList(page);
    });

    test('[「← 一覧へ戻る」リンク押下 / 入力内容に変更がないとき] 値を変えたあと初期表示のときの値に戻すと、離脱の確認を出さずにイベント一覧へ遷移する', async ({ page, api }) => {
      await open(page, api);
      const u = ui(page);
      await u.title.fill('変更したタイトル');
      await u.title.fill(''); // タイトルの初期値は空
      api.allowUnmockedCalls();
      await u.back.click();
      await toList(page);
    });

    test(`[「← 一覧へ戻る」リンク押下 / 入力内容に変更があるとき] 入力内容に変更があれば、遷移せずに離脱の確認に ${q(M.MSG012)}を表示する`, async ({ page, api }) => {
      await open(page, api);
      await ui(page).title.fill('変更したタイトル');
      await ui(page).back.click();
      await expect(ui(page).dialog.getByText(M.MSG012)).toBeVisible();
      await stays(page);
    });

    test('[離脱の確認で「キャンセル」ボタン押下] 「キャンセル」を押すと、離脱の確認を閉じて画面に残り、入力内容を保つ', async ({ page, api }) => {
      await open(page, api);
      const u = ui(page);
      await u.title.fill('変更したタイトル');
      await u.back.click();
      await u.dialogCancel.click();
      await expect(u.dialog).toBeHidden();
      await stays(page);
      await expect(u.title).toHaveValue('変更したタイトル');
    });

    test('[離脱の確認で「離れる」ボタン押下] 「離れる」を押すと、イベント一覧へ遷移する', async ({ page, api }) => {
      await open(page, api);
      await ui(page).title.fill('変更したタイトル');
      await ui(page).back.click();
      api.allowUnmockedCalls();
      await ui(page).dialogLeave.click();
      await toList(page);
    });

    test('[離脱の確認で「離れる」ボタン押下 / ブラウザの戻る・再読み込み・タブを閉じる / 離脱確認] 入力内容に変更があっても、「離れる」を押したときは、ブラウザ標準の離脱確認を出さずにイベント一覧へ遷移する', async ({ page, api }) => {
      await open(page, api);
      await ui(page).title.fill('変更したタイトル');
      await ui(page).back.click(); // この操作が、ブラウザに離脱確認を出させるための「ユーザーの操作」を兼ねる
      const leaveConfirm = watchLeaveConfirm(page);
      api.allowUnmockedCalls();
      await ui(page).dialogLeave.click();
      await toList(page);
      expect(leaveConfirm.shown).toBe(false);
    });

    test('[ブラウザの戻る・再読み込み・タブを閉じる / 離脱確認] 入力内容に変更があれば、タブを閉じるときにブラウザ標準の離脱確認を出す', async ({ page, api }) => {
      await open(page, api);
      await ui(page).title.click(); // ブラウザは、ユーザーが操作していないページでは離脱確認を出さない
      await ui(page).title.fill('変更したタイトル');
      const dialog = page.waitForEvent('dialog');
      await page.close({ runBeforeUnload: true });
      const d = await dialog;
      expect(d.type()).toBe('beforeunload');
      await d.dismiss();
    });

    test('[ブラウザの戻る・再読み込み・タブを閉じる / 離脱確認] 入力内容に変更がなければ、タブを閉じても離脱確認を出さない', async ({ page, api }) => {
      await open(page, api);
      await ui(page).title.click(); // 操作はしたが、値は変えない
      let shown = false;
      page.on('dialog', async (d) => {
        shown = true;
        await d.dismiss();
      });
      const closed = page.waitForEvent('close');
      await page.close({ runBeforeUnload: true });
      await closed;
      expect(shown).toBe(false);
    });

    // アクションの処理による遷移。必須項目を入力したまま（変更あり）で操作し、ブラウザ標準の離脱確認が出ずに遷移することを確かめる。
    // ボタンを押す操作が、ブラウザに離脱確認を出させるための「ユーザーの操作」を兼ねる。
    // 遷移の種類ごとに代表の 1 つで確かめる（401 は、どちらのボタンでも同じ扱い）
    const actionLeaveCases: { source: string; when: string; to: string; reply: MockReply; button: 'draft' | 'publish'; arrives: (page: Page) => Promise<void> }[] = [
      {
        source: '「下書き保存」ボタン押下 / POST /events 201',
        when: '下書き保存に成功したとき',
        to: 'イベント編集',
        reply: { status: 201, body: createdEvent },
        button: 'draft',
        arrives: async (page) => expect(page).toHaveURL(new RegExp(`/events/${createdEvent.id}/edit$`)),
      },
      {
        source: '「公開する」ボタン押下 / POST /events 201',
        when: '公開に成功したとき',
        to: 'イベント一覧',
        reply: { status: 201, body: { ...createdEvent, status: 'published' } },
        button: 'publish',
        arrives: toList,
      },
      {
        source: '「下書き保存」ボタン押下 / POST /events 401',
        when: '下書き保存で 401 が返ったとき',
        to: 'ログイン画面',
        reply: { status: 401, body: apiError('unauthorized') },
        button: 'draft',
        arrives: toLogin,
      },
    ];
    for (const c of actionLeaveCases) {
      test(`[ブラウザの戻る・再読み込み・タブを閉じる / 離脱確認 / ${c.source}] 入力内容に変更があっても、${c.when}は、ブラウザ標準の離脱確認を出さずに${c.to}へ遷移する`, async ({ page, api }) => {
        await open(page, api);
        api.on('POST /events', c.reply);
        await fillValid(page);
        const leaveConfirm = watchLeaveConfirm(page);
        api.allowUnmockedCalls(); // 遷移先の画面の通信は確かめない
        await ui(page)[c.button].click();
        await c.arrives(page);
        expect(leaveConfirm.shown).toBe(false);
      });
    }
  });

  test.describe('共通ルール（遷移）', () => {
    test('[共通ルール ブラウザの戻るで画面に戻ったときに、入力内容を復元するか] 入力したまま一覧へ離れ、ブラウザの戻るで戻ると、入力内容は捨てて、初期表示の状態で表示する', async ({ page, api }) => {
      await open(page, api);
      const u = ui(page);
      await u.title.fill('入力途中のタイトル');
      await u.back.click();
      api.allowUnmockedCalls(); // 遷移先の一覧画面の通信は確かめない
      await u.dialogLeave.click();
      await expect(page).toHaveURL(/\/events$/);
      mockInitial(api); // 戻ったときに、初期表示時の処理をやり直す
      await page.goBack();
      await expect(page).toHaveURL(/\/events\/new$/);
      await expect(u.title).toBeVisible();
      await expect(u.title).toHaveValue('');
    });
  });

  test.describe('閲覧権限', () => {
    // member は [初期表示 / member のとき / 閲覧権限 member]、未ログインは [初期表示 / GET /me 401 / 閲覧権限 未ログイン] で確かめている
    const viewers = [
      { name: 'admin', user: users.admin },
      { name: 'organizer', user: users.organizer },
    ];
    for (const v of viewers) {
      test(`[閲覧権限 ${v.name} / 初期表示 / GET /me 200 / member でないとき] ${v.name} なら、${q(M.MSG020)}を表示せず、遷移せずに画面を開ける`, async ({ page, api }) => {
        await open(page, api, v.user);
        await expect(ui(page).heading).toBeVisible();
        await stays(page);
        await expect(page.getByText(M.MSG020)).toBeHidden();
      });
    }
  });
});
