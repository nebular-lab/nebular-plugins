/**
 * SCR-002 イベント編集 の E2E テスト
 *
 * 設計書: docs/screens/SCR-002_event-edit.md
 * ワイヤーフレーム: docs/screens/SCR-002_event-edit.html
 * 入力の共通ルール: docs/screens/README.md
 *
 * テスト名の先頭の [...] は、設計書のどこから作ったケースかを、場面・項目名・条件で示す。
 *   [初期表示 / GET /events/{eventId} 404]            … 4. 初期表示時の処理 の GET /events/{eventId}、レスポンス 404
 *   [「下書き保存」ボタン押下（新規作成） / POST /events リクエスト] … アクション「「下書き保存」ボタン押下」のリクエストの表
 *   [開催形式の選択を変更 / 「会場」を選んだとき]      … アクション「開催形式の選択を変更」の手順（API を呼ばない）
 *   [タイトル 最大文字数]                               … 入力チェックの表の、タイトルの最大文字数の行
 *   [定員 入力制限 最大文字数]                          … 画面項目「定員」の入力制限
 *   [「下書き保存」ボタン 表示条件]                     … 画面項目「「下書き保存」」の表示条件
 *   [権限 admin]                                        … 2. 権限 の admin の行
 * 2 つの出典に当たるケースは「/」で併記している。メッセージは文言をそのまま書いている。
 *
 * 実装についての前提:
 * - API はブラウザから fetch か XHR で呼ぶ（すべてモックし、バックエンドとは通信しない）
 * - 入力欄はラベルと関連付けられている
 * - 確認ダイアログ（削除の確認、離脱の確認）は role="dialog" を持つ
 * - 見出しは heading のロールを持つ
 * - メッセージ（トーストを含む）は画面上のテキストとして 1 か所に表示され、遷移後も確かめられる間は表示されている
 * - 入力制限は設計書の「入力制限」の列と入力の共通ルールのとおり。それ以外の制約は入力でき、チェックでエラーになる
 */
import type { Page } from '@playwright/test';
import { test, expect, deferred, type ApiMock } from '../support/api-mock';

// ---- 6. メッセージ ----------------------------------------------------------

const M = {
  M1: 'タイトルを入力してください',
  M2: 'タイトルは 2 文字以上で入力してください',
  M3: 'タイトルは 50 文字以内で入力してください',
  M4: 'タイトルに使えない文字（絵文字など）が含まれています',
  M5: '概要は 200 文字以内で入力してください',
  M6: 'カテゴリを選択してください',
  M7: '会場名を入力してください',
  M8: '会場名は 100 文字以内で入力してください',
  M9: '配信 URL を入力してください',
  M10: '配信 URL は https:// で始まる形式で入力してください',
  M11: '開催日を入力してください',
  M12: '開催日は今日以降の日付を入力してください',
  M13: '定員を入力してください',
  M14: '定員は 1〜999 で入力してください',
  M15: (participantCount: number) => `定員は現在の参加者数（${participantCount} 人）以上にしてください`,
  M16: 'タグは 3 つまで選べます',
  M17: '入力内容が保存されていません。このページを離れますか？',
  M18: '下書きを保存しました',
  M19: 'イベントを公開しました',
  M20: 'イベントを更新しました',
  M21: '他の人が先に更新しました。画面を再読み込みしてから、もう一度保存してください',
  M22: '参加者がいるイベントは削除できません',
  M23: 'イベントを削除しました',
  M24: 'イベントを作成・編集する権限がありません',
  M25: 'イベントが見つかりません',
  M26: '通信に失敗しました。時間をおいてもう一度お試しください',
  M27: '会場名に使えない文字（絵文字など）が含まれています',
  M28: '配信 URL は半角英数字と記号で入力してください',
  M29: (title: string) => ['イベントを削除しますか？', `「${title}」を削除します。この操作は取り消せません。`],
};

// ---- テストデータ（OpenAPI のスキーマに合わせる） ---------------------------

/** 「今日」。開催日の「今日以降」のチェックに使う */
const TODAY = '2026-10-01';

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

/** 公開中・オンライン・参加者あり */
const publishedEvent: Event = {
  id: 'e-pub',
  title: 'はじめての TypeScript ハンズオン',
  summary: '型の基本を手を動かして学ぶ',
  categoryId: 'c-study',
  format: 'online',
  onlineUrl: 'https://meet.example.com/ts-handson',
  startDate: '2026-10-12',
  capacity: 30,
  tags: ['beginner', 'hands-on'],
  status: 'published',
  organizerId: 'u-org',
  organizerName: '山田 花子',
  participantCount: 18,
  version: 3,
  updatedAt: '2026-09-20T10:00:00Z',
};

/** 下書き・会場・参加者なし */
const draftEvent: Event = {
  id: 'e-draft',
  title: 'エンジニア交流会 秋',
  categoryId: 'c-meetup',
  format: 'onsite',
  venueName: '渋谷オフィス 5F',
  startDate: '2026-10-20',
  capacity: 50,
  tags: [],
  status: 'draft',
  organizerId: 'u-org',
  organizerName: '山田 花子',
  participantCount: 0,
  version: 1,
  updatedAt: '2026-09-21T10:00:00Z',
};

/** 新規作成の下書き保存に対する 201 の応答（fillValidNew() の値で作られたもの） */
const createdEvent: Event = { ...draftEvent, id: 'e-new', title: 'Go 勉強会', categoryId: 'c-study', startDate: '2026-10-20', capacity: 20 };

const apiError = (code: string) => ({ code, message: code });
const validationError = { errors: [{ field: 'title', message: 'このタイトルはすでに使われています' }] };

// ---- 部品（番号はワイヤーフレームの data-no） -------------------------------

const ui = (page: Page) => {
  const dialog = page.getByRole('dialog');
  return {
    back: page.getByRole('link', { name: '← 一覧へ戻る' }), // No.2
    heading: (name: string) => page.getByRole('heading', { name, exact: true }), // No.3
    organizer: page.getByText(/^主催: /), // No.5
    title: page.getByLabel(/^タイトル/), // No.6
    summary: page.getByLabel(/^概要/), // No.7
    category: page.getByLabel(/^カテゴリ/), // No.8
    onsite: page.getByRole('radio', { name: '会場', exact: true }), // No.9
    online: page.getByRole('radio', { name: 'オンライン', exact: true }), // No.9
    venue: page.getByLabel(/^会場名/), // No.10
    onlineUrl: page.getByLabel(/^配信 URL/), // No.11
    startDate: page.getByLabel(/^開催日/), // No.12
    capacity: page.getByLabel(/^定員/), // No.13
    tag: (name: string) => page.getByRole('checkbox', { name, exact: true }), // No.14
    notify: page.getByRole('checkbox', { name: '変更を参加者にメールで通知する' }), // No.15
    draft: page.getByRole('button', { name: '下書き保存', exact: true }), // No.16
    publish: page.getByRole('button', { name: '公開する', exact: true }), // No.17（新規・下書き）
    update: page.getByRole('button', { name: '更新する', exact: true }), // No.17（公開中・終了）
    del: page.getByRole('button', { name: '削除', exact: true }), // No.18
    dialog, // No.19
    dialogCancel: dialog.getByRole('button', { name: 'キャンセル', exact: true }), // No.20
    dialogDelete: dialog.getByRole('button', { name: '削除する', exact: true }), // No.21
  };
};

// ---- 画面を開く -------------------------------------------------------------

/** 初期表示で呼ぶ API に正常系の応答を登録する。異常系はテストの中で上書きする */
function mockInitial(api: ApiMock, opts: { user?: User; event?: Event } = {}) {
  return {
    me: api.on('GET /me', { status: 200, body: opts.user ?? users.organizer }),
    categories: api.on('GET /categories', { status: 200, body: categories }),
    event: api.on('GET /events/{eventId}', { status: 200, body: opts.event ?? draftEvent }),
  };
}

async function openNew(page: Page, api: ApiMock, user: User = users.organizer) {
  mockInitial(api, { user });
  await page.goto('/events/new');
  await expect(ui(page).title).toBeVisible();
}

async function openEdit(page: Page, api: ApiMock, event: Event, user: User = users.organizer) {
  mockInitial(api, { user, event });
  await page.goto(`/events/${event.id}/edit`);
  await expect(ui(page).title).toHaveValue(event.title);
}

/** 新規作成で、必須項目を正しい値で埋める（開催形式は初期値の「会場」のまま） */
async function fillValidNew(page: Page) {
  const u = ui(page);
  await u.title.fill('Go 勉強会');
  await u.category.selectOption({ label: '勉強会' });
  await u.venue.fill('渋谷オフィス 5F');
  await u.startDate.fill('2026-10-20');
  await u.capacity.fill('20');
}

/** fillValidNew() で送られるはずの body */
const validNewBody = {
  title: 'Go 勉強会',
  categoryId: 'c-study',
  format: 'onsite',
  venueName: '渋谷オフィス 5F',
  startDate: '2026-10-20',
  capacity: 20,
  tags: [],
};

/** 編集で、初期値のまま保存したときに送られるはずの body（title〜tags） */
function bodyOf(event: Event) {
  const { title, summary, categoryId, format, venueName, onlineUrl, startDate, capacity, tags } = event;
  return {
    title,
    ...(summary ? { summary } : {}),
    categoryId,
    format,
    ...(format === 'onsite' ? { venueName } : { onlineUrl }),
    startDate,
    capacity,
    tags,
  };
}

/** ログイン画面へ、redirect に今いた画面のパスを付けて遷移したことを確かめる */
const toLogin = (fromPath: string) => async (page: Page) => {
  await expect(page).toHaveURL(/\/login\?/);
  expect(new URL(page.url()).searchParams.get('redirect')).toContain(fromPath);
};
/** テスト名に入れるメッセージ */
const q = (message: string) => `「${message}」`;
const toList = async (page: Page) => expect(page).toHaveURL(/\/events$/);
const shows = (text: string) => async (page: Page) => expect(page.getByText(text)).toBeVisible();
/** 画面の下端までスクロールしてから押す（最初のエラー項目までスクロールすることを確かめるため） */
async function scrollDownAndClick(page: Page, button: ReturnType<Page['getByRole']>) {
  await page.mouse.wheel(0, 10000);
  await button.click();
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

/** 422 の応答で、errors[].message を表示し、その項目までスクロールしたことを確かめる */
const shows422 = async (page: Page) => {
  await expect(page.getByText(validationError.errors[0].message)).toBeVisible();
  await expect(ui(page).title).toBeInViewport();
};

// ---- テスト -----------------------------------------------------------------

test.use({ timezoneId: 'Asia/Tokyo', viewport: { width: 375, height: 667 } });

test.describe('SCR-002 イベント編集', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00+09:00`));
  });

  test.describe('API: 初期表示', () => {
    const meOutcomes: Outcome[] = [
      { status: 401, body: apiError('unauthorized'), label: 'ログイン画面へ遷移する', leaves: true, also: '権限 未ログイン', expect: toLogin('/events/new') },
      { status: 500, other: true, label: `${q(M.M26)}を表示して終了する`, expect: shows(M.M26) },
    ];
    for (const o of meOutcomes) {
      test(`[初期表示 / GET /me ${statusLabel(o)}${also(o)}] ${o.label}`, async ({ page, api }) => {
        const { categories } = mockInitial(api);
        api.on('GET /me', { status: o.status, body: o.body });
        if (o.leaves) api.allowUnmockedCalls();
        await page.goto('/events/new');
        await o.expect(page);
        // 「終了する」ので、後続の GET /categories は呼ばない
        if (!o.leaves) expect(categories.requests).toHaveLength(0);
      });
    }

    test('[初期表示 / GET /me 200] 保持した role を表示条件に使う（admin なら、主催者でなくても「削除」ボタンを表示する）', async ({ page, api }) => {
      await openEdit(page, api, { ...draftEvent, organizerId: 'u-other' }, users.admin);
      await expect(ui(page).del).toBeVisible();
    });

    test('[初期表示 / GET /categories 200] items[].name をカテゴリの選択肢にする', async ({ page, api }) => {
      await openNew(page, api);
      await expect(ui(page).category.locator('option')).toHaveText(['選択してください', '勉強会', '交流会']);
    });

    const categoriesOutcomes: Outcome[] = [
      { status: 401, body: apiError('unauthorized'), label: 'ログイン画面へ遷移する', leaves: true, expect: toLogin(`/events/${draftEvent.id}/edit`) },
      { status: 500, other: true, label: `${q(M.M26)}を表示して終了する`, expect: shows(M.M26) },
    ];
    for (const o of categoriesOutcomes) {
      test(`[初期表示 / GET /categories ${statusLabel(o)}] ${o.label}`, async ({ page, api }) => {
        const { event } = mockInitial(api);
        api.on('GET /categories', { status: o.status, body: o.body });
        if (o.leaves) api.allowUnmockedCalls();
        await page.goto(`/events/${draftEvent.id}/edit`);
        await o.expect(page);
        // 「終了する」ので、後続の GET /events/{eventId} は呼ばない
        if (!o.leaves) expect(event.requests).toHaveLength(0);
      });
    }

    test('[初期表示 / eventId がないとき / 入力項目 初期値（新規作成）] URL に eventId がなければ新規作成として、新規の初期値を入れる', async ({ page, api }) => {
      const { event } = mockInitial(api);
      await page.goto('/events/new');
      const u = ui(page);
      await expect(u.title).toHaveValue('');
      await expect(u.summary).toHaveValue('');
      await expect(u.category.locator('option:checked')).toHaveText('選択してください');
      await expect(u.onsite).toBeChecked();
      await expect(u.venue).toHaveValue('');
      await expect(u.startDate).toHaveValue('');
      await expect(u.capacity).toHaveValue('');
      for (const tag of ['初心者向け', 'ハンズオン', '交流', '無料', '英語']) await expect(u.tag(tag)).not.toBeChecked();
      await u.online.check(); // No.11 は「オンライン」のときだけ表示される
      await expect(u.onlineUrl).toHaveValue('');
      // 新規作成では GET /events/{eventId} を呼ばない（手順 9 で終了する）
      expect(event.requests).toHaveLength(0);
    });

    test('[初期表示 / eventId があるとき / GET /events/{eventId} リクエスト] path の eventId に URL パラメータ eventId を入れる', async ({ page, api }) => {
      const { event } = mockInitial(api, { event: publishedEvent });
      await page.goto(`/events/${publishedEvent.id}/edit`);
      await expect.poll(() => event.requests.length).toBe(1);
      expect(event.last().pathParams).toEqual({ eventId: publishedEvent.id });
    });

    test('[初期表示 / GET /events/{eventId} 200 / 入力項目 初期値（編集）] 各入力項目に編集の初期値を入れる', async ({ page, api }) => {
      await openEdit(page, api, publishedEvent);
      const u = ui(page);
      await expect(u.title).toHaveValue(publishedEvent.title);
      await expect(u.summary).toHaveValue(publishedEvent.summary!);
      await expect(u.category.locator('option:checked')).toHaveText('勉強会');
      await expect(u.online).toBeChecked();
      await expect(u.onlineUrl).toHaveValue(publishedEvent.onlineUrl!);
      await expect(u.startDate).toHaveValue(publishedEvent.startDate);
      await expect(u.capacity).toHaveValue(String(publishedEvent.capacity));
      await expect(u.tag('初心者向け')).toBeChecked();
      await expect(u.tag('ハンズオン')).toBeChecked();
      for (const tag of ['交流', '無料', '英語']) await expect(u.tag(tag)).not.toBeChecked();
      await expect(u.notify).not.toBeChecked();
    });

    test('[初期表示 / GET /events/{eventId} 200 / 開催形式・会場名 初期値（編集）] 会場のイベントなら、「会場」を選び、会場名に venueName を入れる', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await expect(ui(page).onsite).toBeChecked();
      await expect(ui(page).venue).toHaveValue(draftEvent.venueName!);
    });

    test('[初期表示 / GET /events/{eventId} 200] status をステータスに、organizerName を主催者に表示する', async ({ page, api }) => {
      await openEdit(page, api, publishedEvent);
      await expect(page.getByText('公開中', { exact: true })).toBeVisible();
      await expect(ui(page).organizer).toHaveText('主催: 山田 花子');
    });

    const eventOutcomes: Outcome[] = [
      { status: 401, body: apiError('unauthorized'), label: 'ログイン画面へ遷移する', leaves: true, expect: toLogin(`/events/${publishedEvent.id}/edit`) },
      {
        status: 403,
        body: apiError('forbidden'),
        label: `${q(M.M24)}を表示し、イベント一覧へ遷移する`,
        leaves: true,
        also: '権限 organizer（他の人のイベント）',
        expect: async (page) => {
          await expect(page.getByText(M.M24)).toBeVisible();
          await toList(page);
        },
      },
      {
        status: 404,
        body: apiError('not_found'),
        label: `${q(M.M25)}を表示し、イベント一覧へ遷移する`,
        leaves: true,
        expect: async (page) => {
          await expect(page.getByText(M.M25)).toBeVisible();
          await toList(page);
        },
      },
      { status: 500, other: true, label: `${q(M.M26)}を表示する`, expect: shows(M.M26) },
    ];
    for (const o of eventOutcomes) {
      test(`[初期表示 / GET /events/{eventId} ${statusLabel(o)}${also(o)}] ${o.label}`, async ({ page, api }) => {
        mockInitial(api, { event: publishedEvent });
        api.on('GET /events/{eventId}', { status: o.status, body: o.body });
        if (o.leaves) api.allowUnmockedCalls();
        await page.goto(`/events/${publishedEvent.id}/edit`);
        await o.expect(page);
      });
    }

    test('[初期表示 / 読み込み中] GET /events/{eventId} の応答が返るまでフォームを表示せず、返ったら表示する', async ({ page, api }) => {
      mockInitial(api);
      const reply = deferred<{ status: number; body: unknown }>();
      const event = api.on('GET /events/{eventId}', () => reply.promise);
      await page.goto(`/events/${draftEvent.id}/edit`);
      await expect.poll(() => event.requests.length).toBe(1);
      await expect(ui(page).title).toBeHidden();
      reply.resolve({ status: 200, body: draftEvent });
      await expect(ui(page).title).toHaveValue(draftEvent.title);
    });
  });

  test.describe('API: 「下書き保存」ボタン押下', () => {
    test('[「下書き保存」ボタン押下（新規作成） / POST /events リクエスト] 新規作成の下書き保存で、入力値を body に入れ、status に draft を入れる', async ({ page, api }) => {
      await openNew(page, api);
      const post = api.on('POST /events', { status: 201, body: createdEvent });
      api.on('GET /events/{eventId}', { status: 200, body: createdEvent });
      await fillValidNew(page);
      await ui(page).draft.click();
      await expect.poll(() => post.requests.length).toBe(1);
      // 概要は空なので送らない、開催形式は「会場」なので onlineUrl は送らない、タグは空の配列
      expect(post.last().body).toEqual({ ...validNewBody, status: 'draft' });
    });

    const conditionalRequestCases: { cond: string; label: string; setup: (page: Page) => Promise<void>; expected: Record<string, unknown> }[] = [
      {
        cond: '概要あり',
        label: '概要を入力すると summary を送る',
        setup: (p) => ui(p).summary.fill('Go の基本を学ぶ'),
        expected: { ...validNewBody, summary: 'Go の基本を学ぶ', status: 'draft' },
      },
      {
        cond: 'オンライン',
        label: '「オンライン」なら onlineUrl を送り、入力済みの venueName は送らない',
        setup: async (p) => {
          await ui(p).online.check(); // 会場名は fillValidNew() で入力済み（切り替えても値は残る）
          await ui(p).onlineUrl.fill('https://meet.example.com/go');
        },
        expected: (({ venueName: _, ...rest }) => ({ ...rest, format: 'online', onlineUrl: 'https://meet.example.com/go', status: 'draft' }))(validNewBody),
      },
      {
        cond: 'タグあり',
        label: 'タグを選ぶと、選んだ値の配列を tags に送る',
        setup: async (p) => {
          await ui(p).tag('初心者向け').check();
          await ui(p).tag('無料').check();
        },
        expected: { ...validNewBody, tags: ['beginner', 'free'], status: 'draft' },
      },
    ];
    for (const c of conditionalRequestCases) {
      test(`[「下書き保存」ボタン押下（新規作成） / POST /events リクエスト（${c.cond}）] ${c.label}`, async ({ page, api }) => {
        await openNew(page, api);
        const post = api.on('POST /events', { status: 201, body: createdEvent });
        api.on('GET /events/{eventId}', { status: 200, body: createdEvent });
        await fillValidNew(page);
        await c.setup(page);
        await ui(page).draft.click();
        await expect.poll(() => post.requests.length).toBe(1);
        expect(post.last().body).toEqual(c.expected);
      });
    }

    test(`[「下書き保存」ボタン押下（新規作成） / POST /events 201] ${q(M.M18)}を表示し、/events/{id}/edit に URL を置き換えて編集として開き直す`, async ({ page, api }) => {
      await openNew(page, api);
      api.on('POST /events', { status: 201, body: createdEvent });
      api.on('GET /events/{eventId}', { status: 200, body: createdEvent });
      await fillValidNew(page);
      await ui(page).draft.click();
      await expect(page.getByText(M.M18)).toBeVisible();
      await expect(page).toHaveURL(/\/events\/e-new\/edit$/);
      await expect(ui(page).heading('イベントを編集')).toBeVisible();
    });

    test('[「下書き保存」ボタン押下（新規作成） / POST /events 201] URL は置き換えるので、ブラウザの戻るで新規作成に戻らない', async ({ page, api }) => {
      await openNew(page, api);
      api.on('POST /events', { status: 201, body: createdEvent });
      api.on('GET /events/{eventId}', { status: 200, body: createdEvent });
      await fillValidNew(page);
      await ui(page).draft.click();
      await expect(page).toHaveURL(/\/events\/e-new\/edit$/);
      api.allowUnmockedCalls(); // 戻った先の画面の通信は確かめない
      await page.goBack();
      await expect(page).not.toHaveURL(/\/events\/new$/);
    });

    const postOutcomes: Outcome[] = [
      { status: 401, body: apiError('unauthorized'), label: 'ログイン画面へ遷移する', leaves: true, expect: toLogin('/events/new') },
      { status: 403, body: apiError('forbidden'), label: `${q(M.M24)}を表示する`, expect: shows(M.M24) },
      { status: 422, body: validationError, label: 'errors[].message を対応する項目の下に表示し、その項目までスクロールする', expect: shows422 },
      { status: 500, other: true, label: `${q(M.M26)}を表示する`, expect: shows(M.M26) },
    ];
    for (const o of postOutcomes) {
      test(`[「下書き保存」ボタン押下（新規作成） / POST /events ${statusLabel(o)}] 新規作成の下書き保存で ${returns(o)}、${o.label}`, async ({ page, api }) => {
        await openNew(page, api);
        api.on('POST /events', { status: o.status, body: o.body });
        await fillValidNew(page);
        if (o.leaves) api.allowUnmockedCalls();
        await scrollDownAndClick(page, ui(page).draft);
        await o.expect(page);
      });
    }

    test('[「下書き保存」ボタン押下（編集） / PUT /events/{eventId} リクエスト] 編集の下書き保存で、path に eventId、body に入力値・draft・保持した version を入れる', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      const put = api.on('PUT /events/{eventId}', { status: 200, body: { ...draftEvent, version: 2 } });
      await ui(page).draft.click();
      await expect.poll(() => put.requests.length).toBe(1);
      expect(put.last().pathParams).toEqual({ eventId: draftEvent.id });
      expect(put.last().body).toEqual({ ...bodyOf(draftEvent), status: 'draft', version: 1 });
    });

    test(`[「下書き保存」ボタン押下（編集） / PUT /events/{eventId} 200] ${q(M.M18)}を表示し、返ってきた version を次の保存で送る`, async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      const put = api.on('PUT /events/{eventId}', { status: 200, body: { ...draftEvent, version: 2 } });
      await ui(page).draft.click();
      await expect(page.getByText(M.M18)).toBeVisible();
      await ui(page).draft.click();
      await expect.poll(() => put.requests.length).toBe(2);
      expect(put.last().body.version).toBe(2);
    });

    const putOutcomes: Outcome[] = [
      { status: 401, body: apiError('unauthorized'), label: 'ログイン画面へ遷移する', leaves: true, expect: toLogin(`/events/${draftEvent.id}/edit`) },
      { status: 403, body: apiError('forbidden'), label: `${q(M.M24)}を表示する`, expect: shows(M.M24) },
      {
        status: 404,
        body: apiError('not_found'),
        label: `${q(M.M25)}を表示し、イベント一覧へ遷移する`,
        leaves: true,
        expect: async (page) => {
          await expect(page.getByText(M.M25)).toBeVisible();
          await toList(page);
        },
      },
      { status: 409, body: apiError('conflict'), label: `${q(M.M21)}を表示する`, expect: shows(M.M21) },
      { status: 422, body: validationError, label: 'errors[].message を対応する項目の下に表示し、その項目までスクロールする', expect: shows422 },
      { status: 500, other: true, label: `${q(M.M26)}を表示する`, expect: shows(M.M26) },
    ];
    for (const o of putOutcomes) {
      test(`[「下書き保存」ボタン押下（編集） / PUT /events/{eventId} ${statusLabel(o)}] 編集の下書き保存で ${returns(o)}、${o.label}`, async ({ page, api }) => {
        await openEdit(page, api, draftEvent);
        api.on('PUT /events/{eventId}', { status: o.status, body: o.body });
        if (o.leaves) api.allowUnmockedCalls();
        await scrollDownAndClick(page, ui(page).draft);
        await o.expect(page);
      });
    }

    test('[「下書き保存」ボタン押下 / 保存中] 保存中は「下書き保存」「公開する」「削除」ボタンを非活性にし、応答後に活性に戻す', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      const reply = deferred<{ status: number; body: unknown }>();
      const put = api.on('PUT /events/{eventId}', () => reply.promise);
      const u = ui(page);
      await u.draft.click();
      await expect.poll(() => put.requests.length).toBe(1);
      await expect(u.draft).toBeDisabled();
      await expect(u.publish).toBeDisabled();
      await expect(u.del).toBeDisabled();
      reply.resolve({ status: 200, body: { ...draftEvent, version: 2 } });
      await expect(page.getByText(M.M18)).toBeVisible();
      await expect(u.draft).toBeEnabled();
      await expect(u.publish).toBeEnabled();
      await expect(u.del).toBeEnabled();
    });
  });

  test.describe('API: 「公開する」／「更新する」ボタン押下', () => {
    test('[「公開する」ボタン押下（新規作成） / POST /events リクエスト] 新規作成の公開で、下書き保存と同じ body に status published を入れる', async ({ page, api }) => {
      await openNew(page, api);
      const post = api.on('POST /events', { status: 201, body: { ...createdEvent, status: 'published' } });
      await fillValidNew(page);
      api.allowUnmockedCalls(); // 201 で一覧へ遷移するため
      await ui(page).publish.click();
      await expect.poll(() => post.requests.length).toBe(1);
      expect(post.last().body).toEqual({ ...validNewBody, status: 'published' });
    });

    const postOutcomes: Outcome[] = [
      {
        status: 201,
        body: { ...createdEvent, status: 'published' },
        label: `${q(M.M19)}を表示し、イベント一覧へ遷移する`,
        leaves: true,
        expect: async (page) => {
          await expect(page.getByText(M.M19)).toBeVisible();
          await toList(page);
        },
      },
      { status: 401, body: apiError('unauthorized'), label: 'ログイン画面へ遷移する', leaves: true, expect: toLogin('/events/new') },
      { status: 403, body: apiError('forbidden'), label: `${q(M.M24)}を表示する`, expect: shows(M.M24) },
      { status: 422, body: validationError, label: 'errors[].message を対応する項目の下に表示し、その項目までスクロールする', expect: shows422 },
      { status: 500, other: true, label: `${q(M.M26)}を表示する`, expect: shows(M.M26) },
    ];
    for (const o of postOutcomes) {
      test(`[「公開する」ボタン押下（新規作成） / POST /events ${statusLabel(o)}] 新規作成の公開で ${returns(o)}、${o.label}`, async ({ page, api }) => {
        await openNew(page, api);
        api.on('POST /events', { status: o.status, body: o.body });
        await fillValidNew(page);
        if (o.leaves) api.allowUnmockedCalls();
        await scrollDownAndClick(page, ui(page).publish);
        await o.expect(page);
      });
    }

    test('[「公開する」／「更新する」ボタン押下（編集） / PUT /events/{eventId} リクエスト（下書き）] 下書きの公開で、status に published を入れ、notifyParticipants は送らない', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      const put = api.on('PUT /events/{eventId}', { status: 200, body: { ...draftEvent, status: 'published' } });
      api.allowUnmockedCalls(); // 200 で一覧へ遷移するため
      await ui(page).publish.click();
      await expect.poll(() => put.requests.length).toBe(1);
      expect(put.last().pathParams).toEqual({ eventId: draftEvent.id });
      expect(put.last().body).toEqual({ ...bodyOf(draftEvent), status: 'published', version: 1 });
    });

    const notifyCases = [
      { checked: false, name: '参加者への通知を未選択' },
      { checked: true, name: '参加者への通知を選択' },
    ];
    for (const c of notifyCases) {
      test(`[「公開する」／「更新する」ボタン押下（編集） / PUT /events/{eventId} リクエスト（公開中・${c.name}）] 公開中の更新で、status は保持した値のまま、notifyParticipants に ${c.checked} を入れる`, async ({ page, api }) => {
        await openEdit(page, api, publishedEvent);
        const put = api.on('PUT /events/{eventId}', { status: 200, body: publishedEvent });
        if (c.checked) await ui(page).notify.check();
        api.allowUnmockedCalls(); // 200 で一覧へ遷移するため
        await ui(page).update.click();
        await expect.poll(() => put.requests.length).toBe(1);
        expect(put.last().body).toEqual({ ...bodyOf(publishedEvent), status: 'published', version: 3, notifyParticipants: c.checked });
      });
    }

    test('[「公開する」／「更新する」ボタン押下（編集） / PUT /events/{eventId} リクエスト（終了）] 終了したイベントの更新で、status は保持した closed のまま送り、notifyParticipants は送らない', async ({ page, api }) => {
      const closed = { ...publishedEvent, status: 'closed' as const };
      await openEdit(page, api, closed);
      const put = api.on('PUT /events/{eventId}', { status: 200, body: closed });
      api.allowUnmockedCalls(); // 200 で一覧へ遷移するため
      await ui(page).update.click();
      await expect.poll(() => put.requests.length).toBe(1);
      expect(put.last().body).toEqual({ ...bodyOf(closed), status: 'closed', version: 3 });
    });

    const okCases = [
      { event: draftEvent, name: '下書き', button: 'publish' as const, id: 'M19', message: M.M19 },
      { event: publishedEvent, name: '公開中', button: 'update' as const, id: 'M20', message: M.M20 },
    ];
    for (const c of okCases) {
      test(`[「公開する」／「更新する」ボタン押下（編集） / PUT /events/{eventId} 200（${c.name}）] ${c.name}のイベントで 200 が返ると、${q(c.message)}を表示し、イベント一覧へ遷移する`, async ({ page, api }) => {
        await openEdit(page, api, c.event);
        api.on('PUT /events/{eventId}', { status: 200, body: c.event });
        api.allowUnmockedCalls();
        await ui(page)[c.button].click();
        await expect(page.getByText(c.message)).toBeVisible();
        await toList(page);
      });
    }

    const putOutcomes: Outcome[] = [
      { status: 401, body: apiError('unauthorized'), label: 'ログイン画面へ遷移する', leaves: true, expect: toLogin(`/events/${publishedEvent.id}/edit`) },
      { status: 403, body: apiError('forbidden'), label: `${q(M.M24)}を表示する`, expect: shows(M.M24) },
      {
        status: 404,
        body: apiError('not_found'),
        label: `${q(M.M25)}を表示し、イベント一覧へ遷移する`,
        leaves: true,
        expect: async (page) => {
          await expect(page.getByText(M.M25)).toBeVisible();
          await toList(page);
        },
      },
      { status: 409, body: apiError('conflict'), label: `${q(M.M21)}を表示する`, expect: shows(M.M21) },
      { status: 422, body: validationError, label: 'errors[].message を対応する項目の下に表示し、その項目までスクロールする', expect: shows422 },
      { status: 500, other: true, label: `${q(M.M26)}を表示する`, expect: shows(M.M26) },
    ];
    for (const o of putOutcomes) {
      test(`[「公開する」／「更新する」ボタン押下（編集） / PUT /events/{eventId} ${statusLabel(o)}] 公開中の更新で ${returns(o)}、${o.label}`, async ({ page, api }) => {
        await openEdit(page, api, publishedEvent);
        api.on('PUT /events/{eventId}', { status: o.status, body: o.body });
        if (o.leaves) api.allowUnmockedCalls();
        await scrollDownAndClick(page, ui(page).update);
        await o.expect(page);
      });
    }

    test('[「公開する」／「更新する」ボタン押下 / 保存中] 保存中は「下書き保存」「公開する」「削除」ボタンを非活性にし、画面に残る応答のあと活性に戻す', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      const reply = deferred<{ status: number; body: unknown }>();
      const put = api.on('PUT /events/{eventId}', () => reply.promise);
      const u = ui(page);
      await u.publish.click();
      await expect.poll(() => put.requests.length).toBe(1);
      await expect(u.draft).toBeDisabled();
      await expect(u.publish).toBeDisabled();
      await expect(u.del).toBeDisabled();
      reply.resolve({ status: 409, body: apiError('conflict') }); // 200 は一覧へ遷移するので、画面に残る 409 で確かめる
      await expect(page.getByText(M.M21)).toBeVisible();
      await expect(u.draft).toBeEnabled();
      await expect(u.publish).toBeEnabled();
      await expect(u.del).toBeEnabled();
    });
  });

  test.describe('API: 削除の確認で「削除する」ボタン押下', () => {
    async function openDeleteDialog(page: Page, api: ApiMock) {
      await openEdit(page, api, draftEvent);
      await ui(page).del.click();
      await expect(ui(page).dialog).toBeVisible();
    }

    test('[削除の確認で「削除する」ボタン押下 / DELETE /events/{eventId} リクエスト] path の eventId に URL パラメータ eventId を入れる', async ({ page, api }) => {
      await openDeleteDialog(page, api);
      const del = api.on('DELETE /events/{eventId}', { status: 204 });
      api.allowUnmockedCalls(); // 204 で一覧へ遷移するため
      await ui(page).dialogDelete.click();
      await expect.poll(() => del.requests.length).toBe(1);
      expect(del.last().pathParams).toEqual({ eventId: draftEvent.id });
    });

    const closesDialog = (message: string) => async (page: Page) => {
      await expect(page.getByText(message)).toBeVisible();
      await expect(ui(page).dialog).toBeHidden();
    };
    const outcomes: Outcome[] = [
      {
        status: 204,
        label: `${q(M.M23)}を表示し、イベント一覧へ遷移する`,
        leaves: true,
        expect: async (page) => {
          await expect(page.getByText(M.M23)).toBeVisible();
          await toList(page);
        },
      },
      { status: 401, body: apiError('unauthorized'), label: 'ログイン画面へ遷移する', leaves: true, expect: toLogin(`/events/${draftEvent.id}/edit`) },
      { status: 403, body: apiError('forbidden'), label: `削除の確認を閉じ、${q(M.M24)}を表示する`, expect: closesDialog(M.M24) },
      {
        status: 404,
        body: apiError('not_found'),
        label: `${q(M.M25)}を表示し、イベント一覧へ遷移する`,
        leaves: true,
        expect: async (page) => {
          await expect(page.getByText(M.M25)).toBeVisible();
          await toList(page);
        },
      },
      { status: 409, body: apiError('conflict'), label: `削除の確認を閉じ、${q(M.M22)}を表示する`, expect: closesDialog(M.M22) },
      { status: 500, other: true, label: `削除の確認を閉じ、${q(M.M26)}を表示する`, expect: closesDialog(M.M26) },
    ];
    for (const o of outcomes) {
      test(`[削除の確認で「削除する」ボタン押下 / DELETE /events/{eventId} ${statusLabel(o)}] 削除で ${returns(o)}、${o.label}`, async ({ page, api }) => {
        await openDeleteDialog(page, api);
        api.on('DELETE /events/{eventId}', { status: o.status, body: o.body });
        if (o.leaves) api.allowUnmockedCalls();
        await ui(page).dialogDelete.click();
        await o.expect(page);
      });
    }

    test('[削除の確認で「削除する」ボタン押下 / 削除中] 削除中は「削除する」ボタンを非活性にする', async ({ page, api }) => {
      await openDeleteDialog(page, api);
      const reply = deferred<{ status: number }>();
      const del = api.on('DELETE /events/{eventId}', () => reply.promise);
      await ui(page).dialogDelete.click();
      await expect.poll(() => del.requests.length).toBe(1);
      await expect(ui(page).dialogDelete).toBeDisabled();
      api.allowUnmockedCalls();
      reply.resolve({ status: 204 });
      await toList(page);
    });
  });

  test.describe('API を呼ばない手順', () => {
    test(`[初期表示 / member のとき / 権限 member] member が開くと ${q(M.M24)}を表示する`, async ({ page, api }) => {
      mockInitial(api, { user: users.member });
      api.allowUnmockedCalls(); // 手順 4 で一覧へ遷移するため
      await page.goto('/events/new');
      await expect(page.getByText(M.M24)).toBeVisible();
    });

    test('[初期表示 / member のとき / 権限 member] member が開くとイベント一覧へ遷移して終了する', async ({ page, api }) => {
      const { categories } = mockInitial(api, { user: users.member });
      api.allowUnmockedCalls(); // 一覧へ遷移するため
      await page.goto('/events/new');
      await toList(page);
      // 「終了する」ので、後続の GET /categories は呼ばない
      expect(categories.requests).toHaveLength(0);
    });

    const formatCases = [
      { item: '会場名', field: 'venue' as const, select: '会場', visible: true },
      { item: '会場名', field: 'venue' as const, select: 'オンライン', visible: false },
      { item: '配信 URL', field: 'onlineUrl' as const, select: 'オンライン', visible: true },
      { item: '配信 URL', field: 'onlineUrl' as const, select: '会場', visible: false },
    ];
    for (const c of formatCases) {
      test(`[開催形式の選択を変更 / 「${c.select}」を選んだとき / ${c.item} 表示条件] 開催形式で「${c.select}」を選ぶと、${c.item}を${c.visible ? '表示する' : '表示しない'}`, async ({ page, api }) => {
        await openNew(page, api);
        const u = ui(page);
        // 初期値は「会場」なので、いったん反対を選んでから選び直す
        await (c.select === '会場' ? u.online : u.onsite).check();
        await (c.select === '会場' ? u.onsite : u.online).check();
        if (c.visible) await expect(u[c.field]).toBeVisible();
        else await expect(u[c.field]).toBeHidden();
      });
    }

    test('[開催形式の選択を変更 / 入力値の保持] 非表示にした項目の入力値は消さずに残し、選び直すと戻る', async ({ page, api }) => {
      await openNew(page, api);
      const u = ui(page);
      await u.venue.fill('渋谷オフィス 5F');
      await u.online.check();
      await u.onsite.check();
      await expect(u.venue).toHaveValue('渋谷オフィス 5F');
    });

    test('[タグの選択を変更 / 4 つ目を選んだとき / タグ 入力制限 最大選択数] 4 つ目を選ぶと、そのチェックを外す', async ({ page, api }) => {
      await openNew(page, api);
      const u = ui(page);
      for (const tag of ['初心者向け', 'ハンズオン', '交流']) await u.tag(tag).check();
      await u.tag('無料').click();
      await expect(u.tag('無料')).not.toBeChecked();
      for (const tag of ['初心者向け', 'ハンズオン', '交流']) await expect(u.tag(tag)).toBeChecked();
    });

    test('[タグの選択を変更 / 3 つ目までのとき] 3 つ目までは、選んだチェックを外さない', async ({ page, api }) => {
      await openNew(page, api);
      const u = ui(page);
      for (const tag of ['初心者向け', 'ハンズオン', '交流']) await u.tag(tag).click();
      for (const tag of ['初心者向け', 'ハンズオン', '交流']) await expect(u.tag(tag)).toBeChecked();
    });

    test(`[タグの選択を変更 / 4 つ目を選んだとき] 4 つ目を選ぶと、${q(M.M16)}を表示する`, async ({ page, api }) => {
      await openNew(page, api);
      const u = ui(page);
      for (const tag of ['初心者向け', 'ハンズオン', '交流']) await u.tag(tag).check();
      await u.tag('無料').click();
      await expect(page.getByText(M.M16)).toBeVisible();
    });

    test(`[タグの選択を変更 / 3 つ目までのとき] 3 つ目までは ${q(M.M16)}を表示しない`, async ({ page, api }) => {
      await openNew(page, api);
      const u = ui(page);
      for (const tag of ['初心者向け', 'ハンズオン', '交流']) await u.tag(tag).check();
      await expect(u.tag('交流')).toBeChecked();
      await expect(page.getByText(M.M16)).toBeHidden();
    });

    test(`[「削除」ボタン押下] 「削除」を押すと、削除の確認に ${q(M.M29(draftEvent.title).join(''))}を表示する`, async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await ui(page).del.click();
      for (const line of M.M29(draftEvent.title)) await expect(ui(page).dialog.getByText(line)).toBeVisible();
    });

    test('[削除の確認で「キャンセル」ボタン押下] 「キャンセル」を押すと、削除の確認を閉じ、API を呼ばない', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      const del = api.on('DELETE /events/{eventId}', { status: 204 });
      await ui(page).del.click();
      await expect(ui(page).dialog).toBeVisible();
      await ui(page).dialogCancel.click();
      await expect(ui(page).dialog).toBeHidden();
      expect(del.requests).toHaveLength(0);
    });
  });

  test.describe('入力チェック・入力制限', () => {
    const titleErrors = [M.M1, M.M2, M.M3, M.M4];
    const titleCases = [
      { cond: '必須', input: '空', value: '', error: M.M1 },
      { cond: '最小文字数', input: '1 文字', value: 'A', error: M.M2 },
      { cond: '最小文字数 境目', input: '2 文字', value: 'AB', error: null },
      { cond: '最大文字数', input: '51 文字', value: 'あ'.repeat(51), error: M.M3 },
      { cond: '最大文字数 境目', input: '50 文字', value: 'あ'.repeat(50), error: null },
      { cond: '使用できる文字種', input: '絵文字', value: 'ハンズオン😀', error: M.M4 },
    ];
    for (const c of titleCases) {
      test(`[タイトル ${c.cond}] タイトルに${c.input}を入れてフォーカスを外すと、${c.error ? `${q(c.error)}を表示する` : 'エラーを表示しない'}`, async ({ page, api }) => {
        await openNew(page, api);
        const u = ui(page);
        if (c.error) {
          await u.title.fill('仮');
          await u.title.fill(c.value);
          await u.title.blur();
          await expect(page.getByText(c.error)).toBeVisible();
        } else {
          // 先にエラーを出しておき、境目の値に直すと消えることで、チェックが走ったことを確かめる
          await u.title.fill('A');
          await u.title.blur();
          await expect(page.getByText(M.M2)).toBeVisible();
          await u.title.fill(c.value);
          await u.title.blur();
          for (const m of titleErrors) await expect(page.getByText(m)).toBeHidden();
        }
      });
    }

    test(`[タイトル 優先順位] 最小文字数と使用できる文字種に同時に違反すると、上の行の ${q(M.M2)}だけを表示する`, async ({ page, api }) => {
      await openNew(page, api);
      await ui(page).title.fill('😀'); // 1 文字（最小文字数）かつ絵文字（使用できる文字種）
      await ui(page).title.blur();
      await expect(page.getByText(M.M2)).toBeVisible();
      await expect(page.getByText(M.M4)).toBeHidden();
    });

    test('[タイトル エラーの消去] エラーのあと正しい値にしてフォーカスを外すと、タイトルのエラー表示を消す', async ({ page, api }) => {
      await openNew(page, api);
      const u = ui(page);
      await u.title.fill('A');
      await u.title.blur();
      await expect(page.getByText(M.M2)).toBeVisible();
      await u.title.fill('Go 勉強会');
      await u.title.blur();
      await expect(page.getByText(M.M2)).toBeHidden();
    });

    const capacityCases = [
      { cond: '必須', input: '空', value: '', event: undefined, error: M.M13 },
      { cond: '範囲', input: '0', value: '0', event: undefined, error: M.M14 },
      { cond: '範囲 境目', input: '1', value: '1', event: undefined, error: null },
      { cond: '範囲 境目', input: '999', value: '999', event: undefined, error: null },
      { cond: '参加者数以上', input: '参加者数 − 1（17）', value: '17', event: publishedEvent, error: M.M15(18) },
      { cond: '参加者数以上 境目', input: '参加者数（18）', value: '18', event: publishedEvent, error: null },
    ];
    for (const c of capacityCases) {
      const where = c.event ? '編集で' : '新規作成で';
      test(`[定員 ${c.cond}] ${where}定員に ${c.input} を入力すると、${c.error ? `${q(c.error)}を表示する` : 'エラーを表示しない'}`, async ({ page, api }) => {
        if (c.event) await openEdit(page, api, c.event);
        else await openNew(page, api);
        const u = ui(page);
        if (c.error) {
          await u.capacity.fill('5');
          await u.capacity.fill(c.value);
          await expect(page.getByText(c.error)).toBeVisible();
        } else {
          // 先にエラーを出しておき、境目の値に直すと消えることで、チェックが走ったことを確かめる
          await u.capacity.fill('0');
          await expect(page.getByText(M.M14)).toBeVisible();
          await u.capacity.fill(c.value);
          for (const m of [M.M13, M.M14, M.M15(18)]) await expect(page.getByText(m)).toBeHidden();
        }
      });
    }

    test.fixme(`[定員 範囲] 1000 を入力すると ${q(M.M14)}を表示する（入力制限で 3 桁までしか入力できないため確かめられない）`, async () => {});

    test(`[定員 優先順位] 編集で範囲と参加者数以上に同時に違反すると、上の行の ${q(M.M14)}だけを表示する`, async ({ page, api }) => {
      await openEdit(page, api, publishedEvent);
      await ui(page).capacity.fill('0'); // 範囲外、かつ参加者数（18）より小さい
      await expect(page.getByText(M.M14)).toBeVisible();
      await expect(page.getByText(M.M15(18))).toBeHidden();
    });

    test('[定員 エラーの消去] エラーのあと正しい値を入力すると、定員のエラー表示を消す', async ({ page, api }) => {
      await openNew(page, api);
      const u = ui(page);
      await u.capacity.fill('0');
      await expect(page.getByText(M.M14)).toBeVisible();
      await u.capacity.fill('10');
      await expect(page.getByText(M.M14)).toBeHidden();
    });

    test('[定員 入力制限 最大文字数] 4 桁目を入力しても入らない', async ({ page, api }) => {
      await openNew(page, api);
      await ui(page).capacity.pressSequentially('1234');
      await expect(ui(page).capacity).toHaveValue('123');
    });

    test('[定員 入力制限 使用できる文字種] 半角数字以外は受け付けない', async ({ page, api }) => {
      await openNew(page, api);
      await ui(page).capacity.pressSequentially('1a2');
      await expect(ui(page).capacity).toHaveValue('12');
    });

    test('[定員 入力制限 使用できる文字種] 全角数字は入力中に半角へ変換する', async ({ page, api }) => {
      await openNew(page, api);
      await ui(page).capacity.pressSequentially('１２');
      await expect(ui(page).capacity).toHaveValue('12');
    });

    test.fixme('[定員 入力制限（入力の共通ルール: IME の変換中）] 変換を確定するまでは入力制限を行わない（Playwright で IME の変換中を再現しにくいため）', async () => {});

    test.fixme('[定員 入力チェック（入力の共通ルール: IME の変換中）] 変換を確定するまでは入力チェックを行わない（Playwright で IME の変換中を再現しにくいため）', async () => {});

    test('[定員 入力制限 最大文字数（入力の共通ルール: 貼り付け）] 4 桁以上をまとめて入力すると、3 桁で切り詰める', async ({ page, api }) => {
      await openNew(page, api);
      await ui(page).capacity.focus();
      await page.keyboard.insertText('12345');
      await expect(ui(page).capacity).toHaveValue('123');
    });

    test('[定員 入力制限 使用できる文字種（入力の共通ルール: 貼り付け）] 使えない文字を含めてまとめて入力すると、その文字を取り除く', async ({ page, api }) => {
      await openNew(page, api);
      await ui(page).capacity.focus();
      await page.keyboard.insertText('1a2');
      await expect(ui(page).capacity).toHaveValue('12');
    });

    // A5 の手順 1 のチェック表。新規作成で必須項目を正しく埋めてから 1 項目だけ崩し、「下書き保存」を押す
    const submitCases: { cond: string; input: string; error: string | null; setup: (page: Page) => Promise<void> }[] = [
      { cond: '概要 最大文字数', input: '概要に 201 文字', error: M.M5, setup: (p) => ui(p).summary.fill('あ'.repeat(201)) },
      { cond: '概要 最大文字数 境目', input: '概要に 200 文字', error: null, setup: (p) => ui(p).summary.fill('あ'.repeat(200)) },
      { cond: 'カテゴリ 必須', input: 'カテゴリを未選択', error: M.M6, setup: async (p) => void (await ui(p).category.selectOption({ label: '選択してください' })) },
      { cond: '会場名 必須', input: '会場名を空', error: M.M7, setup: (p) => ui(p).venue.fill('') },
      { cond: '会場名 最大文字数', input: '会場名に 101 文字', error: M.M8, setup: (p) => ui(p).venue.fill('あ'.repeat(101)) },
      { cond: '会場名 最大文字数 境目', input: '会場名に 100 文字', error: null, setup: (p) => ui(p).venue.fill('あ'.repeat(100)) },
      { cond: '会場名 使用できる文字種', input: '会場名に絵文字', error: M.M27, setup: (p) => ui(p).venue.fill('渋谷オフィス🏢') },
      { cond: '配信 URL 必須', input: 'オンラインで配信 URL を空', error: M.M9, setup: (p) => ui(p).online.check() },
      {
        cond: '配信 URL 使用できる文字種',
        input: '配信 URL に全角文字',
        error: M.M28,
        setup: async (p) => {
          await ui(p).online.check();
          await ui(p).onlineUrl.fill('https://例え.example.com');
        },
      },
      {
        cond: '配信 URL 形式',
        input: '配信 URL が https:// で始まらない',
        error: M.M10,
        setup: async (p) => {
          await ui(p).online.check();
          await ui(p).onlineUrl.fill('http://meet.example.com/go');
        },
      },
      {
        cond: '配信 URL 形式 境目',
        input: '配信 URL が https:// で始まる',
        error: null,
        setup: async (p) => {
          await ui(p).online.check();
          await ui(p).onlineUrl.fill('https://meet.example.com/go');
        },
      },
      { cond: '開催日 必須', input: '開催日を空', error: M.M11, setup: (p) => ui(p).startDate.fill('') },
      { cond: '開催日 範囲', input: '開催日を昨日', error: M.M12, setup: (p) => ui(p).startDate.fill('2026-09-30') },
      { cond: '開催日 範囲 境目', input: '開催日を今日', error: null, setup: (p) => ui(p).startDate.fill(TODAY) },
    ];
    for (const c of submitCases) {
      test(`[${c.cond}] ${c.input}にして「下書き保存」を押すと、${c.error ? `${q(c.error)}を表示し、API を呼ばない` : 'エラーを表示せず、API を呼ぶ'}`, async ({ page, api }) => {
        await openNew(page, api);
        const post = api.on('POST /events', { status: 201, body: createdEvent });
        api.on('GET /events/{eventId}', { status: 200, body: createdEvent });
        await fillValidNew(page);
        await c.setup(page);
        await ui(page).draft.click();
        if (c.error) {
          await expect(page.getByText(c.error)).toBeVisible();
          expect(post.requests).toHaveLength(0);
        } else {
          await expect.poll(() => post.requests.length).toBe(1);
        }
      });
    }

    test(`[配信 URL 優先順位] 使用できる文字種と形式に同時に違反すると、上の行の ${q(M.M28)}だけを表示する`, async ({ page, api }) => {
      await openNew(page, api);
      await fillValidNew(page);
      await ui(page).online.check();
      await ui(page).onlineUrl.fill('ｈｔｔｐｓ://meet'); // 全角文字（使用できる文字種）かつ https:// で始まらない（形式）
      await ui(page).draft.click();
      await expect(page.getByText(M.M28)).toBeVisible();
      await expect(page.getByText(M.M10)).toBeHidden();
    });

    test('[入力の共通ルール 前後の空白 / タイトル] タイトルの前後に空白を付けて保存すると、取り除いた値を送る', async ({ page, api }) => {
      await openNew(page, api);
      const post = api.on('POST /events', { status: 201, body: createdEvent });
      api.on('GET /events/{eventId}', { status: 200, body: createdEvent });
      await fillValidNew(page);
      await ui(page).title.fill('  Go 勉強会  ');
      await ui(page).draft.click();
      await expect.poll(() => post.requests.length).toBe(1);
      expect(post.last().body.title).toBe('Go 勉強会');
    });

    test('[入力の共通ルール 文字数の数え方 / タイトル] 結合文字（か＋濁点）を含む 50 文字は、最大文字数のエラーにならない', async ({ page, api }) => {
      await openNew(page, api);
      const u = ui(page);
      await u.title.fill('A');
      await u.title.blur();
      await expect(page.getByText(M.M2)).toBeVisible();
      await u.title.fill('\u304B\u3099'.repeat(50)); // 見た目は「が」が 50 文字（コードポイントは 100）
      await u.title.blur();
      await expect(page.getByText(M.M2)).toBeHidden();
      await expect(page.getByText(M.M3)).toBeHidden();
    });

    test('[入力の共通ルール 文字数の数え方 / 概要] 絵文字を含む 200 文字は、最大文字数のエラーにならない', async ({ page, api }) => {
      await openNew(page, api);
      const post = api.on('POST /events', { status: 201, body: createdEvent });
      api.on('GET /events/{eventId}', { status: 200, body: createdEvent });
      await fillValidNew(page);
      await ui(page).summary.fill('😀'.repeat(200)); // 1 文字が UTF-16 で 2 単位
      await ui(page).draft.click();
      await expect.poll(() => post.requests.length).toBe(1);
    });

    test(`[入力の共通ルール 改行 / 概要] 改行を含めて 201 文字になると、${q(M.M5)}を表示する`, async ({ page, api }) => {
      await openNew(page, api);
      const post = api.on('POST /events', { status: 201, body: createdEvent });
      await fillValidNew(page);
      await ui(page).summary.fill(`${'あ'.repeat(100)}\n${'あ'.repeat(100)}`); // 200 文字 + 改行 1 文字
      await ui(page).draft.click();
      await expect(page.getByText(M.M5)).toBeVisible();
      expect(post.requests).toHaveLength(0);
    });

    test.fixme('[配信 URL 最大文字数]（TBD: 配信 URL の最大文字数は何文字か）', async () => {});

    test(`[「下書き保存」ボタン押下 / タイトルのチェック] 送信時にもタイトルのチェックを行う（1 文字で「下書き保存」を押すと ${q(M.M2)}を表示し、API を呼ばない）`, async ({ page, api }) => {
      await openNew(page, api);
      const post = api.on('POST /events', { status: 201, body: createdEvent });
      await fillValidNew(page);
      await ui(page).title.fill('A');
      await ui(page).draft.click();
      await expect(page.getByText(M.M2)).toBeVisible();
      expect(post.requests).toHaveLength(0);
    });

    test(`[「下書き保存」ボタン押下 / 定員のチェック] 送信時にも定員のチェックを行う（0 で「下書き保存」を押すと ${q(M.M14)}を表示し、API を呼ばない）`, async ({ page, api }) => {
      await openNew(page, api);
      const post = api.on('POST /events', { status: 201, body: createdEvent });
      await fillValidNew(page);
      await ui(page).capacity.fill('0');
      await ui(page).draft.click();
      await expect(page.getByText(M.M14)).toBeVisible();
      expect(post.requests).toHaveLength(0);
    });

    test('[「下書き保存」ボタン押下 / 非表示の項目] オンラインのとき、非表示の会場名が空でもチェックしない', async ({ page, api }) => {
      await openNew(page, api);
      const post = api.on('POST /events', { status: 201, body: createdEvent });
      api.on('GET /events/{eventId}', { status: 200, body: createdEvent });
      await fillValidNew(page);
      const u = ui(page);
      await u.venue.fill('');
      await u.online.check();
      await u.onlineUrl.fill('https://meet.example.com/go');
      await u.draft.click();
      await expect.poll(() => post.requests.length).toBe(1);
      await expect(page.getByText(M.M7)).toBeHidden();
    });

    test('[「下書き保存」ボタン押下 / エラーの消去] 送信時、エラーのなくなった項目のエラー表示を消し、残っている項目のエラーは表示する', async ({ page, api }) => {
      await openNew(page, api);
      await fillValidNew(page);
      const u = ui(page);
      await u.venue.fill('');
      await u.startDate.fill('');
      await u.draft.click();
      await expect(page.getByText(M.M7)).toBeVisible();
      await expect(page.getByText(M.M11)).toBeVisible();
      await u.venue.fill('渋谷オフィス 5F');
      await u.draft.click();
      await expect(page.getByText(M.M11)).toBeVisible();
      await expect(page.getByText(M.M7)).toBeHidden();
    });

    test('[「下書き保存」ボタン押下 / スクロール] 送信時にエラーがあれば、最初のエラー項目までスクロールする', async ({ page, api }) => {
      await openNew(page, api);
      await fillValidNew(page);
      await ui(page).title.fill('A'); // 最初のエラー項目を画面の一番上の No.6 にする
      await scrollDownAndClick(page, ui(page).draft);
      await expect(page.getByText(M.M2)).toBeVisible();
      await expect(ui(page).title).toBeInViewport();
    });

    test(`[「公開する」ボタン押下 / 下書き保存と同じチェック] 「公開する」でも下書き保存と同じ入力チェックを行う（概要 201 文字で ${q(M.M5)}を表示し、API を呼ばない）`, async ({ page, api }) => {
      // 必須項目が空だと「公開する」は非活性（No.17 活性条件）なので、必須以外の条件で確かめる
      await openNew(page, api);
      const post = api.on('POST /events', { status: 201, body: createdEvent });
      await fillValidNew(page);
      await ui(page).summary.fill('あ'.repeat(201));
      await ui(page).publish.click();
      await expect(page.getByText(M.M5)).toBeVisible();
      expect(post.requests).toHaveLength(0);
    });

    test('[「公開する」ボタン押下 / 非表示の項目] オンラインのとき、非表示の会場名が空でも「公開する」でチェックしない', async ({ page, api }) => {
      await openNew(page, api);
      const post = api.on('POST /events', { status: 201, body: { ...createdEvent, status: 'published' } });
      await fillValidNew(page);
      const u = ui(page);
      await u.venue.fill('');
      await u.online.check();
      await u.onlineUrl.fill('https://meet.example.com/go');
      api.allowUnmockedCalls(); // 201 で一覧へ遷移するため
      await u.publish.click();
      await expect.poll(() => post.requests.length).toBe(1);
    });

    test('[「更新する」ボタン押下 / 編集不可の項目] 公開中で編集不可の開催日が今日より前でも、「更新する」でチェックしない', async ({ page, api }) => {
      const past = { ...publishedEvent, startDate: '2026-09-15' };
      await openEdit(page, api, past);
      const put = api.on('PUT /events/{eventId}', { status: 200, body: past });
      api.allowUnmockedCalls(); // 200 で一覧へ遷移するため
      await ui(page).update.click();
      await expect.poll(() => put.requests.length).toBe(1);
    });
  });

  test.describe('画面項目の条件・値', () => {
    test('[見出し 文言] 新規作成なら「イベントを作成」と表示する', async ({ page, api }) => {
      await openNew(page, api);
      await expect(ui(page).heading('イベントを作成')).toBeVisible();
    });

    test('[見出し 文言] 編集なら「イベントを編集」と表示する', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await expect(ui(page).heading('イベントを編集')).toBeVisible();
    });

    const statusLabels = [
      { status: 'draft' as const, label: '下書き' },
      { status: 'published' as const, label: '公開中' },
      { status: 'closed' as const, label: '終了' },
    ];
    for (const s of statusLabels) {
      test(`[ステータス 表示形式 / ステータス 表示条件] 編集で status が ${s.status} なら「${s.label}」と表示する`, async ({ page, api }) => {
        await openEdit(page, api, { ...draftEvent, status: s.status });
        await expect(page.getByText(s.label, { exact: true })).toBeVisible();
      });
    }

    test('[ステータス 表示条件] 新規作成では表示しない', async ({ page, api }) => {
      await openNew(page, api);
      for (const s of statusLabels) await expect(page.getByText(s.label, { exact: true })).toHaveCount(0);
    });

    test('[主催者 表示条件] 編集なら「主催: {organizerName}」を表示する', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await expect(ui(page).organizer).toHaveText(`主催: ${draftEvent.organizerName}`);
    });

    test('[主催者 表示条件] 新規作成では表示しない', async ({ page, api }) => {
      await openNew(page, api);
      await expect(ui(page).organizer).toHaveCount(0);
    });

    test('[主催者 省略表記 境目] organizerName が 30 文字ちょうどなら省略しない', async ({ page, api }) => {
      const name = 'あ'.repeat(30);
      await openEdit(page, api, { ...draftEvent, organizerName: name });
      await expect(ui(page).organizer).toHaveText(`主催: ${name}`);
    });

    test('[主催者 省略表記] organizerName が 31 文字なら、先頭 30 文字のあとに…を付ける', async ({ page, api }) => {
      await openEdit(page, api, { ...draftEvent, organizerName: 'あ'.repeat(31) });
      await expect(ui(page).organizer).toHaveText(`主催: ${'あ'.repeat(30)}…`);
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
        await openNew(page, api);
        if ('online' in c) await ui(page).online.check(); // No.11 は「オンライン」のときだけ表示される
        await expect(ui(page)[c.field]).toHaveAttribute('placeholder', c.text);
      });
    }

    const formatValueCases = [
      { label: '会場', value: 'onsite' },
      { label: 'オンライン', value: 'online' },
    ];
    for (const c of formatValueCases) {
      test(`[開催形式 対応表] 「${c.label}」を選んで保存すると、format に ${c.value} を送る`, async ({ page, api }) => {
        await openNew(page, api);
        const post = api.on('POST /events', { status: 201, body: createdEvent });
        api.on('GET /events/{eventId}', { status: 200, body: createdEvent });
        await fillValidNew(page);
        const u = ui(page);
        if (c.value === 'online') {
          await u.online.check();
          await u.onlineUrl.fill('https://meet.example.com/go');
        }
        await u.draft.click();
        await expect.poll(() => post.requests.length).toBe(1);
        expect(post.last().body.format).toBe(c.value);
      });
    }

    test('[開催形式 編集不可条件] participantCount が 1 以上なら開催形式を選べない', async ({ page, api }) => {
      await openEdit(page, api, { ...draftEvent, participantCount: 1 });
      await expect(ui(page).onsite).toBeDisabled();
      await expect(ui(page).online).toBeDisabled();
    });

    test('[開催形式 編集不可条件] participantCount が 0 なら開催形式を選べる', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await expect(ui(page).onsite).toBeEnabled();
      await expect(ui(page).online).toBeEnabled();
    });

    const startDateCases = [
      { status: 'published' as const, disabled: true },
      { status: 'closed' as const, disabled: true },
      { status: 'draft' as const, disabled: false },
    ];
    for (const c of startDateCases) {
      test(`[開催日 編集不可条件] status が ${c.status} なら開催日を${c.disabled ? '編集できない' : '編集できる'}`, async ({ page, api }) => {
        await openEdit(page, api, { ...draftEvent, status: c.status });
        if (c.disabled) await expect(ui(page).startDate).toBeDisabled();
        else await expect(ui(page).startDate).toBeEnabled();
      });
    }

    const capacityEditCases = [
      { status: 'closed' as const, disabled: true },
      { status: 'published' as const, disabled: false },
    ];
    for (const c of capacityEditCases) {
      test(`[定員 編集不可条件] status が ${c.status} なら定員を${c.disabled ? '編集できない' : '編集できる'}`, async ({ page, api }) => {
        await openEdit(page, api, { ...publishedEvent, status: c.status });
        if (c.disabled) await expect(ui(page).capacity).toBeDisabled();
        else await expect(ui(page).capacity).toBeEnabled();
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
        await openNew(page, api);
        const post = api.on('POST /events', { status: 201, body: createdEvent });
        api.on('GET /events/{eventId}', { status: 200, body: createdEvent });
        await fillValidNew(page);
        await ui(page).tag(c.label).check();
        await ui(page).draft.click();
        await expect.poll(() => post.requests.length).toBe(1);
        expect(post.last().body.tags).toEqual([c.value]);
      });
    }

    const notifyVisibleCases = [
      { name: '編集で status が published', event: publishedEvent as Event | undefined, visible: true },
      { name: '編集で status が draft', event: draftEvent as Event | undefined, visible: false },
      { name: '新規作成', event: undefined, visible: false },
    ];
    for (const c of notifyVisibleCases) {
      test(`[参加者への通知 表示条件] ${c.name}なら${c.visible ? '表示する' : '表示しない'}`, async ({ page, api }) => {
        if (c.event) await openEdit(page, api, c.event);
        else await openNew(page, api);
        if (c.visible) await expect(ui(page).notify).toBeVisible();
        else await expect(ui(page).notify).toBeHidden();
      });
    }

    const draftVisibleCases = [
      { name: '新規作成', event: undefined as Event | undefined, visible: true },
      { name: '編集で status が draft', event: draftEvent as Event | undefined, visible: true },
      { name: '編集で status が published', event: publishedEvent as Event | undefined, visible: false },
    ];
    for (const c of draftVisibleCases) {
      test(`[「下書き保存」ボタン 表示条件] ${c.name}なら${c.visible ? '表示する' : '表示しない'}`, async ({ page, api }) => {
        if (c.event) await openEdit(page, api, c.event);
        else await openNew(page, api);
        if (c.visible) await expect(ui(page).draft).toBeVisible();
        else await expect(ui(page).draft).toBeHidden();
      });
    }

    test('[「下書き保存」ボタン 活性条件] タイトルが空なら非活性', async ({ page, api }) => {
      await openNew(page, api);
      await expect(ui(page).draft).toBeDisabled();
    });

    test('[「下書き保存」ボタン 活性条件] タイトルが 1 文字以上なら活性', async ({ page, api }) => {
      await openNew(page, api);
      await ui(page).title.fill('A');
      await expect(ui(page).draft).toBeEnabled();
    });

    test.fixme('[「下書き保存」ボタン 保存中の表示] 保存中はボタンの中にスピナーを表示する（スピナーの目印が設計書・ワイヤーフレームにないため）', async () => {});

    const buttonLabelCases = [
      { name: '新規作成', event: undefined as Event | undefined, label: '公開する' },
      { name: 'status が draft', event: draftEvent as Event | undefined, label: '公開する' },
      { name: 'status が published', event: publishedEvent as Event | undefined, label: '更新する' },
    ];
    for (const c of buttonLabelCases) {
      test(`[「公開する」／「更新する」ボタン 文言] ${c.name}なら「${c.label}」と表示する`, async ({ page, api }) => {
        if (c.event) await openEdit(page, api, c.event);
        else await openNew(page, api);
        await expect(page.getByRole('button', { name: c.label, exact: true })).toBeVisible();
      });
    }

    test('[「公開する」／「更新する」ボタン 活性条件] 表示中の必須項目がすべて入力されていれば活性', async ({ page, api }) => {
      await openNew(page, api);
      await fillValidNew(page);
      await expect(ui(page).publish).toBeEnabled();
    });

    test('[「公開する」／「更新する」ボタン 活性条件] 表示中の必須項目が 1 つでも空なら非活性', async ({ page, api }) => {
      await openNew(page, api);
      await fillValidNew(page);
      await ui(page).venue.fill('');
      await expect(ui(page).publish).toBeDisabled();
    });

    test('[「公開する」／「更新する」ボタン 活性条件] 非表示の必須項目（会場名）が空でも、表示中の必須項目が入力されていれば活性', async ({ page, api }) => {
      await openNew(page, api);
      await fillValidNew(page);
      const u = ui(page);
      await u.venue.fill('');
      await u.online.check();
      await u.onlineUrl.fill('https://meet.example.com/go');
      await expect(u.publish).toBeEnabled();
    });

    const deleteVisibleCases = [
      { name: 'admin（主催者ではない）', user: users.admin, organizerId: 'u-org', visible: true },
      { name: 'organizer で自分が主催', user: users.organizer, organizerId: 'u-org', visible: true },
      // 実際には GET /events/{eventId} が 403 を返すので起きないが、条件の組み合わせとしてモックで作る
      { name: 'organizer で他の人が主催', user: users.organizer, organizerId: 'u-other', visible: false },
    ];
    for (const c of deleteVisibleCases) {
      test(`[「削除」ボタン 表示条件] 編集で ${c.name}なら${c.visible ? '表示する' : '表示しない'}`, async ({ page, api }) => {
        await openEdit(page, api, { ...draftEvent, organizerId: c.organizerId }, c.user);
        if (c.visible) await expect(ui(page).del).toBeVisible();
        else await expect(ui(page).del).toBeHidden();
      });
    }

    test('[「削除」ボタン 表示条件] 新規作成では表示しない', async ({ page, api }) => {
      await openNew(page, api);
      await expect(ui(page).del).toBeHidden();
    });

    test('[「削除」ボタン 活性条件] participantCount が 0 なら活性', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await expect(ui(page).del).toBeEnabled();
    });

    test('[「削除」ボタン 活性条件] participantCount が 1 以上なら非活性', async ({ page, api }) => {
      await openEdit(page, api, { ...draftEvent, participantCount: 1 });
      await expect(ui(page).del).toBeDisabled();
    });

    test('[削除の確認 表示条件 / 「キャンセル」ボタン 表示条件 / 「削除する」ボタン 表示条件] 「削除」を押す前は、確認もその中のボタンも表示しない', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await expect(ui(page).del).toBeVisible();
      await expect(ui(page).dialog).toBeHidden();
      await expect(ui(page).dialogCancel).toBeHidden();
      await expect(ui(page).dialogDelete).toBeHidden();
    });

    test('[削除の確認 省略表記 境目] title が 20 文字ちょうどなら省略しない', async ({ page, api }) => {
      const title = 'あ'.repeat(20);
      await openEdit(page, api, { ...draftEvent, title });
      await ui(page).del.click();
      await expect(ui(page).dialog.getByText(M.M29(title)[1])).toBeVisible();
    });

    test('[削除の確認 省略表記] title が 21 文字なら、先頭 20 文字のあとに…を付ける', async ({ page, api }) => {
      await openEdit(page, api, { ...draftEvent, title: 'あ'.repeat(21) });
      await ui(page).del.click();
      await expect(ui(page).dialog.getByText(M.M29(`${'あ'.repeat(20)}…`)[1])).toBeVisible();
    });

    test('[削除の確認 背面の操作] 表示中は背面のタイトルを操作できず、値も変わらない', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await ui(page).del.click();
      await expect(ui(page).dialog).toBeVisible();
      await expect(ui(page).title.click({ timeout: 1000 })).rejects.toThrow();
      await expect(ui(page).title).toHaveValue(draftEvent.title);
    });
  });

  test.describe('遷移・リンク', () => {
    test('[「← 一覧へ戻る」 遷移 / 「← 一覧へ戻る」 遷移前の確認] 入力内容に変更がなければ、確認を出さずに同じタブでイベント一覧へ遷移する', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      api.allowUnmockedCalls();
      await ui(page).back.click();
      await toList(page);
    });

    test(`[「← 一覧へ戻る」 遷移前の確認] 入力内容に変更があれば ${q(M.M17)}の確認を出す`, async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await ui(page).title.fill('変更したタイトル');
      await ui(page).back.click();
      await expect(page.getByRole('dialog').getByText(M.M17)).toBeVisible();
    });

    test('[「← 一覧へ戻る」 遷移前の確認] 確認で「離れる」を押すとイベント一覧へ遷移する', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await ui(page).title.fill('変更したタイトル');
      await ui(page).back.click();
      api.allowUnmockedCalls();
      await page.getByRole('dialog').getByRole('button', { name: '離れる', exact: true }).click();
      await toList(page);
    });

    test('[「← 一覧へ戻る」 遷移前の確認] 確認で「キャンセル」を押すと画面に残り、入力内容を保つ', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await ui(page).title.fill('変更したタイトル');
      await ui(page).back.click();
      await page.getByRole('dialog').getByRole('button', { name: 'キャンセル', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/events/${draftEvent.id}/edit$`));
      await expect(ui(page).title).toHaveValue('変更したタイトル');
    });

    test('[ブラウザの戻る・再読み込み・タブを閉じる / 離脱確認] 入力内容に変更があれば、タブを閉じるときにブラウザ標準の離脱確認を出す', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await ui(page).title.click(); // ブラウザは、ユーザーが操作していないページでは離脱確認を出さない
      await ui(page).title.fill('変更したタイトル');
      const dialog = page.waitForEvent('dialog');
      await page.close({ runBeforeUnload: true });
      const d = await dialog;
      expect(d.type()).toBe('beforeunload');
      await d.dismiss();
    });

    test('[ブラウザの戻る・再読み込み・タブを閉じる / 離脱確認] 入力内容に変更がなければ、タブを閉じても離脱確認を出さない', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
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
  });

  test.describe('権限', () => {
    // member は [初期表示 / member のとき / 権限 member]、未ログインは [初期表示 / GET /me 401 / 権限 未ログイン]、
    // organizer（他の人のイベント）は [初期表示 / GET /events/{eventId} 403 / 権限 organizer（他の人のイベント）] で確かめている
    const viewers = [
      { name: 'admin', user: users.admin },
      { name: 'organizer', user: users.organizer },
    ];
    for (const v of viewers) {
      test(`[権限 ${v.name} / 初期表示 / member でないとき] ${v.name} なら、${q(M.M24)}を表示せず、遷移せずに画面を開ける`, async ({ page, api }) => {
        await openEdit(page, api, draftEvent, v.user);
        await expect(ui(page).heading('イベントを編集')).toBeVisible();
        await expect(page).toHaveURL(new RegExp(`/events/${draftEvent.id}/edit$`));
        await expect(page.getByText(M.M24)).toBeHidden();
      });
    }
  });
});
