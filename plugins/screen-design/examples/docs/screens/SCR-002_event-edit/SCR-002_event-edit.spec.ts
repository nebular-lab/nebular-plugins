/**
 * SCR-002 イベント編集 の Playwright テスト
 *
 * 設計書: docs/screens/SCR-002_event-edit/SCR-002_event-edit.md
 * ワイヤーフレーム: docs/screens/SCR-002_event-edit/SCR-002_event-edit.html
 * メッセージ一覧: docs/screens/messages.md
 * 共通ルール: docs/screens/common-rules.md
 *
 * テスト名の先頭の [...] は、設計書のどこから作ったケースかを、場面・項目名・条件で示す。
 *   [初期表示 / GET /events/{eventId} 404]            … 5. 初期表示時の処理 の GET /events/{eventId}、レスポンス 404
 *   [「下書き保存」ボタン押下 / PUT /events/{eventId} リクエスト] … アクション「「下書き保存」ボタン押下」のリクエストの表
 *   [「下書き保存」ボタン押下 / PUT /events/{eventId} 409] … アクション「「下書き保存」ボタン押下」のレスポンスの表の 409 の行
 *   [開催形式の選択を変更 / 「会場」を選んだとき]      … アクション「開催形式の選択を変更」の手順（API を呼ばない）
 *   [タイトル 50 文字以内]                              … バリデーションのチェック表の、タイトルの「50 文字以内」の行
 *   [定員 入力可能最大文字数]                           … 画面項目「定員」の入力可能最大文字数
 *   [「下書き保存」ボタン 表示条件]                     … 画面項目「「下書き保存」」の表示条件
 *   [閲覧権限 admin]                                        … 3. 閲覧権限 の admin の行
 * 2 つの出典に当たるケースは「/」で併記している。メッセージは文言をそのまま書いている。
 *
 * 実装についての前提:
 * - API はブラウザから fetch か XHR で呼ぶ（すべてモックし、バックエンドとは通信しない）
 * - 入力欄はラベルと関連付けられている
 * - 確認ダイアログ（削除の確認、離脱の確認）はダイアログとして見つかり（役割が dialog か alertdialog）、同時には 1 つしか表示されない
 * - 見出しは heading のロールを持つ
 * - 特定の属性（role、aria-*、data-*）やライブラリ固有の DOM の形は前提にしない。アクセシビリティは、名前・説明・フォーカスの位置・キー操作の結果で確かめる
 * - メッセージ（トーストを含む）は画面上のテキストとして 1 か所に表示され、遷移後も確かめられる間は表示されている
 * - 入力欄が受け付ける範囲は設計書の「入力可能文字種」「入力可能最大文字数」と共通ルールのとおり。それ以外は入力でき、バリデーションでエラーになる
 *
 * バリデーションや入力できる範囲など、イベントの状態によらないケースは、下書きのイベント（draftEvent）を開いて確かめる。
 * 下書きなら「下書き保存」ボタンが表示され、開催日も編集できるため。保存しても画面に残るので、送った値も確かめやすい。
 */
import type { Page } from '@playwright/test';
import { test, expect, deferred, type ApiMock } from '../api-mock';

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
  MSG010: (v1: number) => `定員は現在の参加者数（${v1} 人）以上にしてください`,
  MSG011: (v1: string, v2: number) => `${v1}は ${v2} つまで選べます`,
  MSG012: '入力内容が保存されていません。このページを離れますか？',
  MSG013: '下書きを保存しました',
  MSG014: 'イベントを公開しました',
  MSG015: 'イベントを更新しました',
  MSG016: 'イベントを削除しました',
  MSG017: (v1: string) => ['イベントを削除しますか？', `「${v1}」を削除します。この操作は取り消せません。`],
  MSG018: '他の人が先に更新しました。画面を再読み込みしてから、もう一度保存してください',
  MSG019: '参加者がいるイベントは削除できません',
  MSG020: 'イベントを作成・編集する権限がありません',
  MSG021: 'イベントが見つかりません',
  MSG022: '通信に失敗しました。時間をおいてもう一度お試しください',
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

/** 下書き・会場・参加者なし。必須項目はすべて正しい値で埋まっている */
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

/** draftEvent の下書き保存に対する 200 の応答（version が進む） */
const savedDraft: Event = { ...draftEvent, version: 2 };

const apiError = (code: string) => ({ code, message: code });
const validationError = { errors: [{ field: 'title', message: 'このタイトルはすでに使われています' }] };

// ---- 部品（番号はワイヤーフレームの data-no） -------------------------------

const ui = (page: Page) => {
  const dialog = page.getByRole('dialog').or(page.getByRole('alertdialog'));
  return {
    header: page.getByText('イベント管理', { exact: true }), // 共通ヘッダー（HDR-001）のサービス名
    back: page.getByRole('link', { name: '← 一覧へ戻る' }), // No.1
    heading: (name: string) => page.getByRole('heading', { name, exact: true }), // No.2
    /** ステータス（No.3）。文言で特定する */
    status: (label: string) => page.getByText(label, { exact: true }),
    /** 主催者の見出し（No.4）。見出しとデータは別の部品 */
    organizerLabel: page.getByText('主催', { exact: true }),
    /** 主催者（No.5）。文言で特定する */
    organizer: (name: string) => page.getByText(name, { exact: true }),
    title: page.getByLabel(/^タイトル/), // No.8
    summary: page.getByLabel(/^概要/), // No.11
    category: page.getByLabel(/^カテゴリ/), // No.14
    onsite: page.getByRole('radio', { name: '会場', exact: true }), // No.17
    online: page.getByRole('radio', { name: 'オンライン', exact: true }), // No.17
    venue: page.getByLabel(/^会場名/), // No.21
    onlineUrl: page.getByLabel(/^配信 URL/), // No.24
    startDate: page.getByLabel(/^開催日/), // No.27
    capacity: page.getByLabel(/^定員/), // No.30
    tag: (name: string) => page.getByRole('checkbox', { name, exact: true }), // No.33
    notify: page.getByRole('checkbox', { name: '変更を参加者にメールで通知する' }), // No.40
    draft: page.getByRole('button', { name: '下書き保存', exact: true }), // No.41
    publish: page.getByRole('button', { name: '公開する', exact: true }), // No.42（下書き）
    update: page.getByRole('button', { name: '更新する', exact: true }), // No.42（公開中・終了）
    del: page.getByRole('button', { name: '削除', exact: true }), // No.43
    dialog, // No.44（削除の確認）、No.49（離脱の確認）。同時には 1 つしか表示されない
    dialogCancel: dialog.getByRole('button', { name: 'キャンセル', exact: true }), // No.47、No.51
    dialogDelete: dialog.getByRole('button', { name: '削除する', exact: true }), // No.48
    dialogLeave: dialog.getByRole('button', { name: '離れる', exact: true }), // No.52
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

const editPath = (event: Event) => `/events/${event.id}/edit`;

async function openEdit(page: Page, api: ApiMock, event: Event, user: User = users.organizer) {
  mockInitial(api, { user, event });
  await page.goto(editPath(event));
  await expect(ui(page).title).toHaveValue(event.title);
}

/** 初期値のまま保存したときに送られるはずの body（title〜tags） */
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

/** draftEvent を初期値のまま「下書き保存」したときに送られるはずの body */
const draftSaveBody = { ...bodyOf(draftEvent), status: 'draft', version: 1 };

/** ログイン画面へ、redirect に今いた画面のパスを付けて遷移したことを確かめる */
const toLogin = (fromPath: string) => async (page: Page) => {
  await expect(page).toHaveURL(/\/login\?/);
  expect(new URL(page.url()).searchParams.get('redirect')).toContain(fromPath);
};
/** テスト名に入れるメッセージ */
const q = (message: string) => `「${message}」`;
/** 文言を含むことを確かめるための正規表現（説明にほかの文が混ざっていてもよい） */
const containing = (text: string) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const toList = async (page: Page) => expect(page).toHaveURL(/\/events$/);
/** この画面に残っていることを確かめる */
const staysOn = (page: Page, event: Event) => expect(page).toHaveURL(new RegExp(`${editPath(event)}$`));
const shows = (text: string) => async (page: Page) => expect(page.getByText(text)).toBeVisible();
/** 画面の下端までスクロールしてから押す（最初のエラー項目までスクロールすることを確かめるため） */
async function scrollDownAndClick(page: Page, button: ReturnType<Page['getByRole']>) {
  await page.mouse.wheel(0, 10000);
  await button.click();
}

/**
 * 初期表示の API が定義にないステータスを返したときの画面を確かめる。
 * ヘッダー・「← 一覧へ戻る」・見出し・画面上部のエラーだけを表示し、入力項目とボタン（ステータス・主催者も）は表示しない
 */
const showsOnlyTopError = async (page: Page) => {
  const u = ui(page);
  await expect(page.getByText(M.MSG022)).toBeVisible();
  await expect(u.header).toBeVisible();
  await expect(u.back).toBeVisible();
  await expect(u.heading('イベントを編集')).toBeVisible();
  const hidden = [
    u.organizerLabel,
    u.title, u.summary, u.category, u.onsite, u.online, u.venue, u.onlineUrl, u.startDate, u.capacity,
    u.tag('初心者向け'), u.tag('ハンズオン'), u.tag('交流'), u.tag('無料'), u.tag('英語'),
    u.notify, u.draft, u.publish, u.update, u.del,
  ];
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

/** 422 の応答で、errors[].message を表示し、その項目までスクロールしたことを確かめる */
const shows422 = async (page: Page) => {
  await expect(page.getByText(validationError.errors[0].message)).toBeVisible();
  await expect(ui(page).title).toBeInViewport();
};

// ---- テスト -----------------------------------------------------------------

test.use({ timezoneId: 'Asia/Tokyo', viewport: { width: 1280, height: 720 } });

test.describe('SCR-002 イベント編集', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00+09:00`));
  });

  test.describe('API: 初期表示', () => {
    const meOutcomes: Outcome[] = [
      { status: 401, body: apiError('unauthorized'), label: 'ログイン画面へ遷移する', leaves: true, also: '閲覧権限 未ログイン', expect: toLogin(editPath(draftEvent)) },
      { status: 500, other: true, label: `ヘッダー・「← 一覧へ戻る」・見出しと ${q(M.MSG022)}だけを表示し、入力項目とボタンは表示せずに終了する`, expect: showsOnlyTopError },
    ];
    for (const o of meOutcomes) {
      test(`[初期表示 / GET /me ${statusLabel(o)}${also(o)}] GET /me で ${returns(o)}、${o.label}`, async ({ page, api }) => {
        const { categories } = mockInitial(api);
        api.on('GET /me', { status: o.status, body: o.body });
        if (o.leaves) api.allowUnmockedCalls();
        await page.goto(editPath(draftEvent));
        await o.expect(page);
        // 「終了する」ので、後続の GET /categories は呼ばない
        if (o.other) expect(categories.requests).toHaveLength(0);
      });
    }

    test('[初期表示 / GET /me 200] 保持した role を表示条件に使う（admin なら、主催者でなくても「削除」ボタンを表示する）', async ({ page, api }) => {
      await openEdit(page, api, { ...draftEvent, organizerId: 'u-other' }, users.admin);
      await expect(ui(page).del).toBeVisible();
    });

    test('[初期表示 / GET /categories 200] items[] をカテゴリの選択肢にし、先頭に「選択してください」を置く', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await expect(ui(page).category.locator('option')).toHaveText(['選択してください', '勉強会', '交流会']);
    });

    const categoriesOutcomes: Outcome[] = [
      { status: 401, body: apiError('unauthorized'), label: 'ログイン画面へ遷移する', leaves: true, expect: toLogin(editPath(draftEvent)) },
      { status: 500, other: true, label: `ヘッダー・「← 一覧へ戻る」・見出しと ${q(M.MSG022)}だけを表示し、入力項目とボタンは表示せずに終了する`, expect: showsOnlyTopError },
    ];
    for (const o of categoriesOutcomes) {
      test(`[初期表示 / GET /categories ${statusLabel(o)}] GET /categories で ${returns(o)}、${o.label}`, async ({ page, api }) => {
        const { event } = mockInitial(api);
        api.on('GET /categories', { status: o.status, body: o.body });
        if (o.leaves) api.allowUnmockedCalls();
        await page.goto(editPath(draftEvent));
        await o.expect(page);
        // 「終了する」ので、後続の GET /events/{eventId} は呼ばない
        if (o.other) expect(event.requests).toHaveLength(0);
      });
    }

    test('[初期表示 / GET /events/{eventId} リクエスト] path の eventId に URL パラメータ eventId を入れる', async ({ page, api }) => {
      const { event } = mockInitial(api, { event: publishedEvent });
      await page.goto(editPath(publishedEvent));
      await expect.poll(() => event.requests.length).toBe(1);
      expect(event.last().pathParams).toEqual({ eventId: publishedEvent.id });
    });

    test('[初期表示 / GET /events/{eventId} 200 / 入力項目 初期値] 各入力項目に、取得したイベントの値を入れる（参加者への通知は未選択）', async ({ page, api }) => {
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

    test('[初期表示 / GET /events/{eventId} 200 / 開催形式・会場名 初期値] 会場のイベントなら、「会場」を選び、会場名に venueName を入れる', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await expect(ui(page).onsite).toBeChecked();
      await expect(ui(page).venue).toHaveValue(draftEvent.venueName!);
    });

    test('[初期表示 / GET /events/{eventId} 200] status をステータスに、organizerName を主催者に表示する', async ({ page, api }) => {
      await openEdit(page, api, publishedEvent);
      await expect(ui(page).status('公開中')).toBeVisible();
      await expect(ui(page).organizer('山田 花子')).toBeVisible();
    });

    const eventOutcomes: Outcome[] = [
      { status: 401, body: apiError('unauthorized'), label: 'ログイン画面へ遷移する', leaves: true, expect: toLogin(editPath(publishedEvent)) },
      {
        status: 403,
        body: apiError('forbidden'),
        label: `${q(M.MSG020)}を表示し、イベント一覧へ遷移する`,
        leaves: true,
        also: '閲覧権限 organizer（他の人のイベント）',
        expect: async (page) => {
          await expect(page.getByText(M.MSG020)).toBeVisible();
          await toList(page);
        },
      },
      {
        status: 404,
        body: apiError('not_found'),
        label: `${q(M.MSG021)}を表示し、イベント一覧へ遷移する`,
        leaves: true,
        expect: async (page) => {
          await expect(page.getByText(M.MSG021)).toBeVisible();
          await toList(page);
        },
      },
      { status: 500, other: true, label: `ヘッダー・「← 一覧へ戻る」・見出しと ${q(M.MSG022)}だけを表示し、入力項目とボタンは表示しない`, expect: showsOnlyTopError },
    ];
    for (const o of eventOutcomes) {
      test(`[初期表示 / GET /events/{eventId} ${statusLabel(o)}${also(o)}] GET /events/{eventId} で ${returns(o)}、${o.label}`, async ({ page, api }) => {
        mockInitial(api, { event: publishedEvent });
        api.on('GET /events/{eventId}', { status: o.status, body: o.body });
        if (o.leaves) api.allowUnmockedCalls();
        await page.goto(editPath(publishedEvent));
        await o.expect(page);
      });
    }

    test('[初期表示 / 読み込み中] GET /events/{eventId} の応答が返るまでフォームを表示せず、返ったら表示する', async ({ page, api }) => {
      mockInitial(api);
      const reply = deferred<{ status: number; body: unknown }>();
      const event = api.on('GET /events/{eventId}', () => reply.promise);
      await page.goto(editPath(draftEvent));
      await expect.poll(() => event.requests.length).toBe(1);
      await expect(ui(page).title).toBeHidden();
      reply.resolve({ status: 200, body: draftEvent });
      await expect(ui(page).title).toHaveValue(draftEvent.title);
    });
  });

  test.describe('API: 「下書き保存」ボタン押下', () => {
    test('[「下書き保存」ボタン押下 / PUT /events/{eventId} リクエスト] path に eventId、body に入力値・draft・保持した version を入れる', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      const put = api.on('PUT /events/{eventId}', { status: 200, body: savedDraft });
      await ui(page).draft.click();
      await expect.poll(() => put.requests.length).toBe(1);
      expect(put.last().pathParams).toEqual({ eventId: draftEvent.id });
      // 概要は空なので送らない、開催形式は「会場」なので onlineUrl は送らない、タグは空の配列
      expect(put.last().body).toEqual(draftSaveBody);
    });

    const conditionalRequestCases: { cond: string; label: string; setup: (page: Page) => Promise<void>; expected: Record<string, unknown> }[] = [
      {
        cond: '概要あり',
        label: '概要を入力すると summary を送る',
        setup: (p) => ui(p).summary.fill('秋の交流会です'),
        expected: { ...draftSaveBody, summary: '秋の交流会です' },
      },
      {
        cond: 'オンライン',
        label: '「オンライン」なら onlineUrl を送り、入力済みの venueName は送らない',
        setup: async (p) => {
          await ui(p).online.check(); // 会場名は初期値が入っている（切り替えても値は残る）
          await ui(p).onlineUrl.fill('https://meet.example.com/autumn');
        },
        expected: {
          ...bodyOf({ ...draftEvent, format: 'online', venueName: undefined, onlineUrl: 'https://meet.example.com/autumn' }),
          status: 'draft',
          version: 1,
        },
      },
      {
        cond: 'タグあり',
        label: 'タグを選ぶと、選んだ値の配列を tags に送る',
        setup: async (p) => {
          await ui(p).tag('初心者向け').check();
          await ui(p).tag('無料').check();
        },
        expected: { ...draftSaveBody, tags: ['beginner', 'free'] },
      },
    ];
    for (const c of conditionalRequestCases) {
      test(`[「下書き保存」ボタン押下 / PUT /events/{eventId} リクエスト（${c.cond}）] ${c.label}`, async ({ page, api }) => {
        await openEdit(page, api, draftEvent);
        const put = api.on('PUT /events/{eventId}', { status: 200, body: savedDraft });
        await c.setup(page);
        await ui(page).draft.click();
        await expect.poll(() => put.requests.length).toBe(1);
        expect(put.last().body).toEqual(c.expected);
      });
    }

    test(`[「下書き保存」ボタン押下 / PUT /events/{eventId} 200] ${q(M.MSG013)}を表示し、返ってきた version を次の保存で送る`, async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      const put = api.on('PUT /events/{eventId}', { status: 200, body: savedDraft });
      await ui(page).draft.click();
      await expect(page.getByText(M.MSG013)).toBeVisible();
      await ui(page).draft.click();
      await expect.poll(() => put.requests.length).toBe(2);
      expect(put.last().body.version).toBe(2);
    });

    const putOutcomes: Outcome[] = [
      { status: 401, body: apiError('unauthorized'), label: 'ログイン画面へ遷移する', leaves: true, expect: toLogin(editPath(draftEvent)) },
      { status: 403, body: apiError('forbidden'), label: `${q(M.MSG020)}を表示する`, expect: shows(M.MSG020) },
      {
        status: 404,
        body: apiError('not_found'),
        label: `${q(M.MSG021)}を表示し、イベント一覧へ遷移する`,
        leaves: true,
        expect: async (page) => {
          await expect(page.getByText(M.MSG021)).toBeVisible();
          await toList(page);
        },
      },
      { status: 409, body: apiError('conflict'), label: `${q(M.MSG018)}を表示する`, expect: shows(M.MSG018) },
      { status: 422, body: validationError, label: 'errors[].message を対応する項目のエラー表示に表示し、その項目までスクロールする', expect: shows422 },
      { status: 500, other: true, label: `${q(M.MSG022)}を表示する`, expect: shows(M.MSG022) },
    ];
    for (const o of putOutcomes) {
      test(`[「下書き保存」ボタン押下 / PUT /events/{eventId} ${statusLabel(o)}] 下書き保存で ${returns(o)}、${o.label}`, async ({ page, api }) => {
        await openEdit(page, api, draftEvent);
        api.on('PUT /events/{eventId}', { status: o.status, body: o.body });
        if (o.leaves) api.allowUnmockedCalls();
        await scrollDownAndClick(page, ui(page).draft);
        await o.expect(page);
      });
    }

    test('[「下書き保存」ボタン押下 / PUT /events/{eventId} 422（上記以外の field）] 表示先の決まっていない field（format）のエラーも、errors[].message を表示する', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      api.on('PUT /events/{eventId}', { status: 422, body: { errors: [{ field: 'format', message: '開催形式が正しくありません' }] } });
      await ui(page).draft.click();
      await expect(page.getByText('開催形式が正しくありません')).toBeVisible();
    });

    test('[「下書き保存」ボタン押下 / 保存中] 保存中は「下書き保存」「公開する」「削除」ボタンを非活性にし、応答後に非活性を解除する', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      const reply = deferred<{ status: number; body: unknown }>();
      const put = api.on('PUT /events/{eventId}', () => reply.promise);
      const u = ui(page);
      await u.draft.click();
      await expect.poll(() => put.requests.length).toBe(1);
      await expect(u.draft).toBeDisabled();
      await expect(u.publish).toBeDisabled();
      await expect(u.del).toBeDisabled();
      reply.resolve({ status: 200, body: savedDraft });
      await expect(page.getByText(M.MSG013)).toBeVisible();
      await expect(u.draft).toBeEnabled();
      await expect(u.publish).toBeEnabled();
      await expect(u.del).toBeEnabled();
    });

    test(`[「下書き保存」ボタン押下 / 画面上部のエラーの消去] ${q(M.MSG018)}を表示したあと、もう一度保存すると画面上部のエラー表示を消す`, async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      api.on('PUT /events/{eventId}', { status: 409, body: apiError('conflict') });
      await ui(page).draft.click();
      await expect(page.getByText(M.MSG018)).toBeVisible();
      api.on('PUT /events/{eventId}', { status: 200, body: savedDraft });
      await ui(page).draft.click();
      await expect(page.getByText(M.MSG013)).toBeVisible();
      await expect(page.getByText(M.MSG018)).toBeHidden();
    });
  });

  test.describe('API: 「公開する」／「更新する」ボタン押下', () => {
    test('[「公開する」／「更新する」ボタン押下 / PUT /events/{eventId} リクエスト（下書き）] 下書きの公開で、status に published を入れ、notifyParticipants は送らない', async ({ page, api }) => {
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
      test(`[「公開する」／「更新する」ボタン押下 / PUT /events/{eventId} リクエスト（公開中・${c.name}）] 公開中の更新で、status は保持した値のまま、notifyParticipants に ${c.checked} を入れる`, async ({ page, api }) => {
        await openEdit(page, api, publishedEvent);
        const put = api.on('PUT /events/{eventId}', { status: 200, body: publishedEvent });
        if (c.checked) await ui(page).notify.check();
        api.allowUnmockedCalls(); // 200 で一覧へ遷移するため
        await ui(page).update.click();
        await expect.poll(() => put.requests.length).toBe(1);
        expect(put.last().body).toEqual({ ...bodyOf(publishedEvent), status: 'published', version: 3, notifyParticipants: c.checked });
      });
    }

    test('[「公開する」／「更新する」ボタン押下 / PUT /events/{eventId} リクエスト（終了）] 終了したイベントの更新で、status は保持した closed のまま送り、notifyParticipants は送らない', async ({ page, api }) => {
      const closed = { ...publishedEvent, status: 'closed' as const };
      await openEdit(page, api, closed);
      const put = api.on('PUT /events/{eventId}', { status: 200, body: closed });
      api.allowUnmockedCalls(); // 200 で一覧へ遷移するため
      await ui(page).update.click();
      await expect.poll(() => put.requests.length).toBe(1);
      expect(put.last().body).toEqual({ ...bodyOf(closed), status: 'closed', version: 3 });
    });

    const okCases = [
      { event: draftEvent, name: '下書き', button: 'publish' as const, message: M.MSG014 },
      { event: publishedEvent, name: '公開中', button: 'update' as const, message: M.MSG015 },
    ];
    for (const c of okCases) {
      test(`[「公開する」／「更新する」ボタン押下 / PUT /events/{eventId} 200（${c.name}）] ${c.name}のイベントで 200 が返ると、${q(c.message)}を表示し、イベント一覧へ遷移する`, async ({ page, api }) => {
        await openEdit(page, api, c.event);
        api.on('PUT /events/{eventId}', { status: 200, body: c.event });
        api.allowUnmockedCalls();
        await ui(page)[c.button].click();
        await expect(page.getByText(c.message)).toBeVisible();
        await toList(page);
      });
    }

    const putOutcomes: Outcome[] = [
      { status: 401, body: apiError('unauthorized'), label: 'ログイン画面へ遷移する', leaves: true, expect: toLogin(editPath(publishedEvent)) },
      { status: 403, body: apiError('forbidden'), label: `${q(M.MSG020)}を表示する`, expect: shows(M.MSG020) },
      {
        status: 404,
        body: apiError('not_found'),
        label: `${q(M.MSG021)}を表示し、イベント一覧へ遷移する`,
        leaves: true,
        expect: async (page) => {
          await expect(page.getByText(M.MSG021)).toBeVisible();
          await toList(page);
        },
      },
      { status: 409, body: apiError('conflict'), label: `${q(M.MSG018)}を表示する`, expect: shows(M.MSG018) },
      { status: 422, body: validationError, label: 'errors[].message を対応する項目のエラー表示に表示し、その項目までスクロールする', expect: shows422 },
      { status: 500, other: true, label: `${q(M.MSG022)}を表示する`, expect: shows(M.MSG022) },
    ];
    for (const o of putOutcomes) {
      test(`[「公開する」／「更新する」ボタン押下 / PUT /events/{eventId} ${statusLabel(o)}] 公開中の更新で ${returns(o)}、${o.label}`, async ({ page, api }) => {
        await openEdit(page, api, publishedEvent);
        api.on('PUT /events/{eventId}', { status: o.status, body: o.body });
        if (o.leaves) api.allowUnmockedCalls();
        await scrollDownAndClick(page, ui(page).update);
        await o.expect(page);
      });
    }

    test('[「公開する」／「更新する」ボタン押下 / 保存中] 保存中は「下書き保存」「公開する」「削除」ボタンを非活性にし、画面に残る応答のあと非活性を解除する', async ({ page, api }) => {
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
      await expect(page.getByText(M.MSG018)).toBeVisible();
      await expect(u.draft).toBeEnabled();
      await expect(u.publish).toBeEnabled();
      await expect(u.del).toBeEnabled();
    });

    test(`[「公開する」／「更新する」ボタン押下 / 画面上部のエラーの消去] ${q(M.MSG018)}を表示したあと、もう一度押すと画面上部のエラー表示を消す`, async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      api.on('PUT /events/{eventId}', { status: 409, body: apiError('conflict') });
      await ui(page).publish.click();
      await expect(page.getByText(M.MSG018)).toBeVisible();
      api.on('PUT /events/{eventId}', { status: 403, body: apiError('forbidden') }); // 200 は一覧へ遷移するので、画面に残る 403 で確かめる
      await ui(page).publish.click();
      await expect(page.getByText(M.MSG020)).toBeVisible();
      await expect(page.getByText(M.MSG018)).toBeHidden();
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
        label: `${q(M.MSG016)}を表示し、イベント一覧へ遷移する`,
        leaves: true,
        expect: async (page) => {
          await expect(page.getByText(M.MSG016)).toBeVisible();
          await toList(page);
        },
      },
      { status: 401, body: apiError('unauthorized'), label: 'ログイン画面へ遷移する', leaves: true, expect: toLogin(editPath(draftEvent)) },
      { status: 403, body: apiError('forbidden'), label: `削除の確認を閉じ、${q(M.MSG020)}を表示する`, expect: closesDialog(M.MSG020) },
      {
        status: 404,
        body: apiError('not_found'),
        label: `${q(M.MSG021)}を表示し、イベント一覧へ遷移する`,
        leaves: true,
        expect: async (page) => {
          await expect(page.getByText(M.MSG021)).toBeVisible();
          await toList(page);
        },
      },
      { status: 409, body: apiError('conflict'), label: `削除の確認を閉じ、${q(M.MSG019)}を表示する`, expect: closesDialog(M.MSG019) },
      { status: 500, other: true, label: `削除の確認を閉じ、${q(M.MSG022)}を表示する`, expect: closesDialog(M.MSG022) },
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

    test('[削除の確認で「削除する」ボタン押下 / 削除中] 画面に残る応答のあと、「削除する」ボタンの非活性を解除する', async ({ page, api }) => {
      await openDeleteDialog(page, api);
      api.on('DELETE /events/{eventId}', { status: 409, body: apiError('conflict') }); // 204 は一覧へ遷移するので、画面に残る 409 で確かめる
      await ui(page).dialogDelete.click();
      await expect(page.getByText(M.MSG019)).toBeVisible();
      await ui(page).del.click();
      await expect(ui(page).dialogDelete).toBeEnabled();
    });

    test(`[削除の確認で「削除する」ボタン押下 / 画面上部のエラーの消去] ${q(M.MSG019)}を表示したあと、もう一度削除すると画面上部のエラー表示を消す`, async ({ page, api }) => {
      await openDeleteDialog(page, api);
      api.on('DELETE /events/{eventId}', { status: 409, body: apiError('conflict') });
      await ui(page).dialogDelete.click();
      await expect(page.getByText(M.MSG019)).toBeVisible();
      api.on('DELETE /events/{eventId}', { status: 403, body: apiError('forbidden') });
      await ui(page).del.click();
      await ui(page).dialogDelete.click();
      await expect(page.getByText(M.MSG020)).toBeVisible();
      await expect(page.getByText(M.MSG019)).toBeHidden();
    });
  });

  test.describe('API を呼ばない手順', () => {
    test(`[初期表示 / member のとき / 閲覧権限 member] member が開くと ${q(M.MSG020)}を表示する`, async ({ page, api }) => {
      mockInitial(api, { user: users.member });
      api.allowUnmockedCalls(); // 続く手順で一覧へ遷移するため
      await page.goto(editPath(draftEvent));
      await expect(page.getByText(M.MSG020)).toBeVisible();
    });

    test('[初期表示 / member のとき / 閲覧権限 member] member が開くとイベント一覧へ遷移して終了する', async ({ page, api }) => {
      const { categories } = mockInitial(api, { user: users.member });
      api.allowUnmockedCalls(); // 一覧へ遷移するため
      await page.goto(editPath(draftEvent));
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
        await openEdit(page, api, draftEvent);
        const u = ui(page);
        // いったん反対を選んでから選び直す（初期値のままでは、切り替えたことにならないため）
        await (c.select === '会場' ? u.online : u.onsite).check();
        await (c.select === '会場' ? u.onsite : u.online).check();
        if (c.visible) await expect(u[c.field]).toBeVisible();
        else await expect(u[c.field]).toBeHidden();
      });
    }

    test(`[開催形式の選択を変更 / 「オンライン」を選んだとき / 会場名のエラー] 会場名のエラーを表示したあと「オンライン」を選ぶと、会場名のエラー表示を消す`, async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      const u = ui(page);
      await u.venue.fill('');
      await u.draft.click();
      await expect(page.getByText(M.MSG001('会場名'))).toBeVisible();
      await u.online.check();
      await expect(u.onlineUrl).toBeVisible();
      await expect(page.getByText(M.MSG001('会場名'))).toBeHidden();
    });

    test(`[開催形式の選択を変更 / 「会場」を選んだとき / 配信 URL のエラー] 配信 URL のエラーを表示したあと「会場」を選ぶと、配信 URL のエラー表示を消す`, async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      const u = ui(page);
      await u.online.check(); // 配信 URL は空のまま
      await u.draft.click();
      await expect(page.getByText(M.MSG001('配信 URL'))).toBeVisible();
      await u.onsite.check();
      await expect(u.venue).toBeVisible();
      await expect(page.getByText(M.MSG001('配信 URL'))).toBeHidden();
    });

    // 選び直して表示した項目は空のまま（必須に違反したまま）なので、表示したときにバリデーションをやり直す実装なら、エラーがまた出る
    test('[開催形式の選択を変更 / 選び直して表示した項目のエラー表示 / 会場名のエラー] 会場名のエラーを表示したあと「オンライン」を選び、「会場」を選び直すと、会場名のエラー表示は非表示のままにする', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
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

    test('[開催形式の選択を変更 / 選び直して表示した項目のエラー表示 / 配信 URL のエラー] 配信 URL のエラーを表示したあと「会場」を選び、「オンライン」を選び直すと、配信 URL のエラー表示は非表示のままにする', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
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

    test('[開催形式の選択を変更 / 入力値の保持] 非表示にした項目の入力値は消さずに残し、選び直すと戻る', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      const u = ui(page);
      await u.venue.fill('品川オフィス 3F'); // 初期値と違う値にして、初期値に戻っていないことも確かめる
      await u.online.check();
      await u.onsite.check();
      await expect(u.venue).toHaveValue('品川オフィス 3F');
    });

    test('[タグの選択を変更 / 4 つ目を選んだとき] 4 つ目を選ぶと、そのチェックを外す', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      const u = ui(page);
      for (const tag of ['初心者向け', 'ハンズオン', '交流']) await u.tag(tag).check();
      await u.tag('無料').click();
      await expect(u.tag('無料')).not.toBeChecked();
      for (const tag of ['初心者向け', 'ハンズオン', '交流']) await expect(u.tag(tag)).toBeChecked();
    });

    test('[タグの選択を変更 / 3 つ以下のとき] 3 つ目までは、選んだチェックを外さない', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      const u = ui(page);
      for (const tag of ['初心者向け', 'ハンズオン', '交流']) await u.tag(tag).click();
      for (const tag of ['初心者向け', 'ハンズオン', '交流']) await expect(u.tag(tag)).toBeChecked();
    });

    test(`[タグの選択を変更 / 4 つ目を選んだとき] 4 つ目を選ぶと、${q(M.MSG011('タグ', 3))}を表示する`, async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      const u = ui(page);
      for (const tag of ['初心者向け', 'ハンズオン', '交流']) await u.tag(tag).check();
      await u.tag('無料').click();
      await expect(page.getByText(M.MSG011('タグ', 3))).toBeVisible();
    });

    test(`[タグの選択を変更 / 3 つ以下のとき / タグのエラーの消去] ${q(M.MSG011('タグ', 3))}を表示したあと選択を 1 つ外すと、タグのエラー表示を消す`, async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      const u = ui(page);
      for (const tag of ['初心者向け', 'ハンズオン', '交流']) await u.tag(tag).check();
      await u.tag('無料').click();
      await expect(page.getByText(M.MSG011('タグ', 3))).toBeVisible();
      await u.tag('交流').uncheck();
      await expect(u.tag('交流')).not.toBeChecked();
      await expect(page.getByText(M.MSG011('タグ', 3))).toBeHidden();
    });

    test(`[「削除」ボタン押下] 「削除」を押すと、削除の確認に ${q(M.MSG017(draftEvent.title).join(''))}を表示する`, async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await ui(page).del.click();
      for (const line of M.MSG017(draftEvent.title)) await expect(ui(page).dialog.getByText(line)).toBeVisible();
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

  test.describe('バリデーション・入力できる範囲', () => {
    const titleErrors = [M.MSG001('タイトル'), M.MSG003('タイトル', 2), M.MSG004('タイトル', 50), M.MSG005('タイトル')];
    const titleCases = [
      { cond: '必須', input: '空', value: '', error: M.MSG001('タイトル') },
      { cond: '2 文字以上', input: '1 文字', value: 'A', error: M.MSG003('タイトル', 2) },
      { cond: '2 文字以上 境目', input: '2 文字', value: 'AB', error: null },
      { cond: '50 文字以内', input: '51 文字', value: 'あ'.repeat(51), error: M.MSG004('タイトル', 50) },
      { cond: '50 文字以内 境目', input: '50 文字', value: 'あ'.repeat(50), error: null },
      { cond: '使える文字', input: '絵文字', value: 'ハンズオン😀', error: M.MSG005('タイトル') },
    ];
    for (const c of titleCases) {
      test(`[タイトル ${c.cond}] タイトルに${c.input}を入れてフォーカスを外すと、${c.error ? `${q(c.error)}を表示する` : 'エラーを表示しない'}`, async ({ page, api }) => {
        await openEdit(page, api, draftEvent);
        const u = ui(page);
        if (c.error) {
          await u.title.fill(c.value);
          await u.title.blur();
          await expect(page.getByText(c.error)).toBeVisible();
        } else {
          // 先にエラーを出しておき、境目の値に直すと消えることで、チェックが走ったことを確かめる
          await u.title.fill('A');
          await u.title.blur();
          await expect(page.getByText(M.MSG003('タイトル', 2))).toBeVisible();
          await u.title.fill(c.value);
          await u.title.blur();
          for (const m of titleErrors) await expect(page.getByText(m)).toBeHidden();
        }
      });
    }

    test(`[タイトル 優先順位] 「2 文字以上」と「使える文字」に同時に違反すると、上の行の ${q(M.MSG003('タイトル', 2))}だけを表示する`, async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await ui(page).title.fill('😀'); // 1 文字（「2 文字以上」に違反）かつ絵文字（「使える文字」に違反）
      await ui(page).title.blur();
      await expect(page.getByText(M.MSG003('タイトル', 2))).toBeVisible();
      await expect(page.getByText(M.MSG005('タイトル'))).toBeHidden();
    });

    test('[タイトル エラーの消去] エラーのあと正しい値にしてフォーカスを外すと、タイトルのエラー表示を消す', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      const u = ui(page);
      await u.title.fill('A');
      await u.title.blur();
      await expect(page.getByText(M.MSG003('タイトル', 2))).toBeVisible();
      await u.title.fill('Go 勉強会');
      await u.title.blur();
      await expect(page.getByText(M.MSG003('タイトル', 2))).toBeHidden();
    });

    // 「参加者数以上」は、参加者のいるイベント（publishedEvent。参加者 18 人）で確かめる。draftEvent は参加者が 0 人で、違反する値を作れないため
    const capacityCases = [
      { cond: '必須', input: '空', value: '', event: draftEvent, error: M.MSG001('定員') },
      { cond: '1〜999', input: '0', value: '0', event: draftEvent, error: M.MSG009('定員', 1, 999) },
      { cond: '1〜999 境目', input: '1', value: '1', event: draftEvent, error: null },
      { cond: '1〜999 境目', input: '999', value: '999', event: draftEvent, error: null },
      { cond: '参加者数以上', input: '参加者数 − 1（17）', value: '17', event: publishedEvent, error: M.MSG010(18) },
      { cond: '参加者数以上 境目', input: '参加者数（18）', value: '18', event: publishedEvent, error: null },
    ];
    for (const c of capacityCases) {
      const where = c.event.participantCount > 0 ? `参加者が ${c.event.participantCount} 人のイベントで、` : '';
      test(`[定員 ${c.cond}] ${where}定員に ${c.input} を入力すると、${c.error ? `${q(c.error)}を表示する` : 'エラーを表示しない'}`, async ({ page, api }) => {
        await openEdit(page, api, c.event);
        const u = ui(page);
        if (c.error) {
          await u.capacity.fill(c.value);
          await expect(page.getByText(c.error)).toBeVisible();
        } else {
          // 先にエラーを出しておき、境目の値に直すと消えることで、チェックが走ったことを確かめる
          await u.capacity.fill('0');
          await expect(page.getByText(M.MSG009('定員', 1, 999))).toBeVisible();
          await u.capacity.fill(c.value);
          for (const m of [M.MSG001('定員'), M.MSG009('定員', 1, 999), M.MSG010(18)]) await expect(page.getByText(m)).toBeHidden();
        }
      });
    }

    test(`[定員 優先順位] 「1〜999」と「参加者数以上」に同時に違反すると、上の行の ${q(M.MSG009('定員', 1, 999))}だけを表示する`, async ({ page, api }) => {
      await openEdit(page, api, publishedEvent);
      await ui(page).capacity.fill('0'); // 範囲外、かつ参加者数（18）より小さい
      await expect(page.getByText(M.MSG009('定員', 1, 999))).toBeVisible();
      await expect(page.getByText(M.MSG010(18))).toBeHidden();
    });

    test('[定員 エラーの消去] エラーのあと正しい値を入力すると、定員のエラー表示を消す', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      const u = ui(page);
      await u.capacity.fill('0');
      await expect(page.getByText(M.MSG009('定員', 1, 999))).toBeVisible();
      await u.capacity.fill('10');
      await expect(page.getByText(M.MSG009('定員', 1, 999))).toBeHidden();
    });

    // 定員には初期値が入っているので、空にしてから入力する
    test('[定員 入力可能最大文字数] 4 桁目を入力しても入らない', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await ui(page).capacity.fill('');
      await ui(page).capacity.pressSequentially('1234');
      await expect(ui(page).capacity).toHaveValue('123');
    });

    test('[定員 入力可能文字種] 半角数字以外は受け付けない', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await ui(page).capacity.fill('');
      await ui(page).capacity.pressSequentially('1a2');
      await expect(ui(page).capacity).toHaveValue('12');
    });

    test('[定員 入力可能文字種（備考: 変換）] 全角数字は入力中に半角へ変換する', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await ui(page).capacity.fill('');
      await ui(page).capacity.pressSequentially('１２');
      await expect(ui(page).capacity).toHaveValue('12');
    });

    test('[定員 入力可能最大文字数（共通ルール: 貼り付け）] 4 桁以上をまとめて入力すると、3 桁で切り詰める', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await ui(page).capacity.fill('');
      await ui(page).capacity.focus();
      await page.keyboard.insertText('12345');
      await expect(ui(page).capacity).toHaveValue('123');
    });

    test('[定員 入力可能文字種（共通ルール: 貼り付け）] 使えない文字を含めてまとめて入力すると、その文字を取り除く', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await ui(page).capacity.fill('');
      await ui(page).capacity.focus();
      await page.keyboard.insertText('1a2');
      await expect(ui(page).capacity).toHaveValue('12');
    });

    // 「下書き保存」ボタン押下のバリデーションのチェック表。必須項目が正しく埋まっている下書きを開き、1 項目だけ崩して「下書き保存」を押す
    const submitCases: { cond: string; input: string; error: string | null; setup: (page: Page) => Promise<void> }[] = [
      { cond: '概要 200 文字以内', input: '概要に 201 文字', error: M.MSG004('概要', 200), setup: (p) => ui(p).summary.fill('あ'.repeat(201)) },
      { cond: '概要 200 文字以内 境目', input: '概要に 200 文字', error: null, setup: (p) => ui(p).summary.fill('あ'.repeat(200)) },
      { cond: 'カテゴリ 必須', input: 'カテゴリを未選択', error: M.MSG002('カテゴリ'), setup: async (p) => void (await ui(p).category.selectOption({ label: '選択してください' })) },
      { cond: '会場名 必須', input: '会場名を空', error: M.MSG001('会場名'), setup: (p) => ui(p).venue.fill('') },
      { cond: '会場名 100 文字以内', input: '会場名に 101 文字', error: M.MSG004('会場名', 100), setup: (p) => ui(p).venue.fill('あ'.repeat(101)) },
      { cond: '会場名 100 文字以内 境目', input: '会場名に 100 文字', error: null, setup: (p) => ui(p).venue.fill('あ'.repeat(100)) },
      { cond: '会場名 使える文字', input: '会場名に絵文字', error: M.MSG005('会場名'), setup: (p) => ui(p).venue.fill('渋谷オフィス🏢') },
      { cond: '配信 URL 必須', input: 'オンラインで配信 URL を空', error: M.MSG001('配信 URL'), setup: (p) => ui(p).online.check() },
      {
        cond: '配信 URL 使える文字',
        input: '配信 URL に全角文字',
        error: M.MSG006('配信 URL'),
        setup: async (p) => {
          await ui(p).online.check();
          await ui(p).onlineUrl.fill('https://例え.example.com');
        },
      },
      {
        cond: '配信 URL https:// で始まる URL 形式',
        input: '配信 URL が https:// で始まらない',
        error: M.MSG007('配信 URL'),
        setup: async (p) => {
          await ui(p).online.check();
          await ui(p).onlineUrl.fill('http://meet.example.com/autumn');
        },
      },
      {
        cond: '配信 URL https:// で始まる URL 形式 境目',
        input: '配信 URL が https:// で始まる',
        error: null,
        setup: async (p) => {
          await ui(p).online.check();
          await ui(p).onlineUrl.fill('https://meet.example.com/autumn');
        },
      },
      { cond: '開催日 必須', input: '開催日を空', error: M.MSG001('開催日'), setup: (p) => ui(p).startDate.fill('') },
      { cond: '開催日 今日以降', input: '開催日を昨日', error: M.MSG008('開催日'), setup: (p) => ui(p).startDate.fill('2026-09-30') },
      { cond: '開催日 今日以降 境目', input: '開催日を今日', error: null, setup: (p) => ui(p).startDate.fill(TODAY) },
    ];
    for (const c of submitCases) {
      test(`[${c.cond}] ${c.input}にして「下書き保存」を押すと、${c.error ? `${q(c.error)}を表示し、API を呼ばない` : 'エラーを表示せず、API を呼ぶ'}`, async ({ page, api }) => {
        await openEdit(page, api, draftEvent);
        const put = api.on('PUT /events/{eventId}', { status: 200, body: savedDraft });
        await c.setup(page);
        await ui(page).draft.click();
        if (c.error) {
          await expect(page.getByText(c.error)).toBeVisible();
          expect(put.requests).toHaveLength(0);
        } else {
          await expect.poll(() => put.requests.length).toBe(1);
        }
      });
    }

    test(`[会場名 優先順位] 「100 文字以内」と「使える文字」に同時に違反すると、上の行の ${q(M.MSG004('会場名', 100))}だけを表示する`, async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await ui(page).venue.fill(`${'あ'.repeat(100)}😀`); // 101 文字（「100 文字以内」に違反）かつ絵文字（「使える文字」に違反）
      await ui(page).draft.click();
      await expect(page.getByText(M.MSG004('会場名', 100))).toBeVisible();
      await expect(page.getByText(M.MSG005('会場名'))).toBeHidden();
    });

    test(`[配信 URL 優先順位] 「使える文字」と「https:// で始まる URL 形式」に同時に違反すると、上の行の ${q(M.MSG006('配信 URL'))}だけを表示する`, async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await ui(page).online.check();
      await ui(page).onlineUrl.fill('ｈｔｔｐｓ://meet'); // 全角文字（「使える文字」に違反）かつ https:// で始まらない（形式に違反）
      await ui(page).draft.click();
      await expect(page.getByText(M.MSG006('配信 URL'))).toBeVisible();
      await expect(page.getByText(M.MSG007('配信 URL'))).toBeHidden();
    });

    test.fixme('[配信 URL 文字数の上限]（TBD: 配信 URL の最大文字数は何文字か）', async () => {});

    test(`[共通ルール 改行を 1 文字と数えるか / 概要] 改行を含めて 201 文字になると、${q(M.MSG004('概要', 200))}を表示する`, async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      const put = api.on('PUT /events/{eventId}', { status: 200, body: savedDraft });
      await ui(page).summary.fill(`${'あ'.repeat(100)}\n${'あ'.repeat(100)}`); // 200 文字 + 改行 1 文字
      await ui(page).draft.click();
      await expect(page.getByText(M.MSG004('概要', 200))).toBeVisible();
      expect(put.requests).toHaveLength(0);
    });

    test('[共通ルール 文字数のバリデーション時に前後の空白を取り除くか / タイトル] 前後の空白を除いて 50 文字なら、「50 文字以内」のエラーにならない', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      const u = ui(page);
      await u.title.fill('あ'.repeat(51));
      await u.title.blur();
      await expect(page.getByText(M.MSG004('タイトル', 50))).toBeVisible();
      await u.title.fill(`  ${'あ'.repeat(50)}  `); // 空白を含めると 54 文字、除くと 50 文字
      await u.title.blur();
      await expect(page.getByText(M.MSG004('タイトル', 50))).toBeHidden();
    });

    test('[共通ルール 送信時に前後の空白を取り除くか / タイトル] タイトルの前後に空白を付けて保存すると、取り除いた値を送る', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      const put = api.on('PUT /events/{eventId}', { status: 200, body: savedDraft });
      await ui(page).title.fill('  Go 勉強会  ');
      await ui(page).draft.click();
      await expect.poll(() => put.requests.length).toBe(1);
      expect(put.last().body.title).toBe('Go 勉強会');
    });

    test(`[「下書き保存」ボタン押下 / タイトルのバリデーション] 送信時にもタイトルのバリデーションを行う（1 文字で「下書き保存」を押すと ${q(M.MSG003('タイトル', 2))}を表示し、API を呼ばない）`, async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      const put = api.on('PUT /events/{eventId}', { status: 200, body: savedDraft });
      await ui(page).title.fill('A');
      await ui(page).draft.click();
      await expect(page.getByText(M.MSG003('タイトル', 2))).toBeVisible();
      expect(put.requests).toHaveLength(0);
    });

    test(`[「下書き保存」ボタン押下 / 定員のバリデーション] 送信時にも定員のバリデーションを行う（0 で「下書き保存」を押すと ${q(M.MSG009('定員', 1, 999))}を表示し、API を呼ばない）`, async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      const put = api.on('PUT /events/{eventId}', { status: 200, body: savedDraft });
      await ui(page).capacity.fill('0');
      await ui(page).draft.click();
      await expect(page.getByText(M.MSG009('定員', 1, 999))).toBeVisible();
      expect(put.requests).toHaveLength(0);
    });

    test('[「下書き保存」ボタン押下 / 非表示の項目] オンラインのとき、非表示の会場名が空でもチェックしない', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      const put = api.on('PUT /events/{eventId}', { status: 200, body: savedDraft });
      const u = ui(page);
      await u.venue.fill('');
      await u.online.check();
      await u.onlineUrl.fill('https://meet.example.com/autumn');
      await u.draft.click();
      await expect.poll(() => put.requests.length).toBe(1);
      await expect(page.getByText(M.MSG001('会場名'))).toBeHidden();
    });

    test('[「下書き保存」ボタン押下 / エラーの消去] 送信時、エラーのなくなった項目のエラー表示を消し、残っている項目のエラーは表示する', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      const u = ui(page);
      await u.venue.fill('');
      await u.startDate.fill('');
      await u.draft.click();
      await expect(page.getByText(M.MSG001('会場名'))).toBeVisible();
      await expect(page.getByText(M.MSG001('開催日'))).toBeVisible();
      await u.venue.fill('渋谷オフィス 5F');
      await u.draft.click();
      await expect(page.getByText(M.MSG001('開催日'))).toBeVisible();
      await expect(page.getByText(M.MSG001('会場名'))).toBeHidden();
    });

    // 送信時にだけチェックする項目の、エラー表示が非表示に戻る側。直したあとの保存は、画面に残る 403 を返して確かめる
    const clearCases: { item: string; message: string; breakIt: (u: ReturnType<typeof ui>) => Promise<unknown>; fixIt: (u: ReturnType<typeof ui>) => Promise<unknown> }[] = [
      { item: '概要', message: M.MSG004('概要', 200), breakIt: (u) => u.summary.fill('あ'.repeat(201)), fixIt: (u) => u.summary.fill('あ'.repeat(200)) },
      { item: 'カテゴリ', message: M.MSG002('カテゴリ'), breakIt: (u) => u.category.selectOption({ label: '選択してください' }), fixIt: (u) => u.category.selectOption({ label: '勉強会' }) },
      { item: '会場名', message: M.MSG001('会場名'), breakIt: (u) => u.venue.fill(''), fixIt: (u) => u.venue.fill('渋谷オフィス 5F') },
      { item: '配信 URL', message: M.MSG001('配信 URL'), breakIt: (u) => u.online.check(), fixIt: (u) => u.onlineUrl.fill('https://meet.example.com/autumn') },
      { item: '開催日', message: M.MSG001('開催日'), breakIt: (u) => u.startDate.fill(''), fixIt: (u) => u.startDate.fill('2026-10-20') },
    ];
    for (const c of clearCases) {
      test(`[${c.item} エラーの消去] 送信時のエラーのあと正しい値にして「下書き保存」を押すと、${c.item}のエラー表示を消す`, async ({ page, api }) => {
        await openEdit(page, api, draftEvent);
        api.on('PUT /events/{eventId}', { status: 403, body: apiError('forbidden') });
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
      await openEdit(page, api, draftEvent);
      await ui(page).title.fill('A'); // 最初のエラー項目を、画面のいちばん上の入力項目（タイトル）にする
      await scrollDownAndClick(page, ui(page).draft);
      await expect(page.getByText(M.MSG003('タイトル', 2))).toBeVisible();
      await expect(ui(page).title).toBeInViewport();
    });

    test(`[「公開する」ボタン押下 / 下書き保存と同じバリデーション] 「公開する」でも下書き保存と同じバリデーションを行う（概要 201 文字で ${q(M.MSG004('概要', 200))}を表示し、API を呼ばない）`, async ({ page, api }) => {
      // 必須項目が空だと「公開する」は非活性（「公開する」ボタンの活性条件）なので、必須以外の条件で確かめる
      await openEdit(page, api, draftEvent);
      const put = api.on('PUT /events/{eventId}', { status: 200, body: { ...draftEvent, status: 'published' } });
      await ui(page).summary.fill('あ'.repeat(201));
      await ui(page).publish.click();
      await expect(page.getByText(M.MSG004('概要', 200))).toBeVisible();
      expect(put.requests).toHaveLength(0);
    });

    test('[「公開する」ボタン押下 / 非表示の項目] オンラインのとき、非表示の会場名が空でも「公開する」でチェックしない', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      const put = api.on('PUT /events/{eventId}', { status: 200, body: { ...draftEvent, status: 'published' } });
      const u = ui(page);
      await u.venue.fill('');
      await u.online.check();
      await u.onlineUrl.fill('https://meet.example.com/autumn');
      api.allowUnmockedCalls(); // 200 で一覧へ遷移するため
      await u.publish.click();
      await expect.poll(() => put.requests.length).toBe(1);
    });

    test('[「更新する」ボタン押下 / 非活性の項目] 公開中で非活性の開催日が今日より前でも、「更新する」でチェックしない', async ({ page, api }) => {
      const past = { ...publishedEvent, startDate: '2026-09-15' };
      await openEdit(page, api, past);
      const put = api.on('PUT /events/{eventId}', { status: 200, body: past });
      api.allowUnmockedCalls(); // 200 で一覧へ遷移するため
      await ui(page).update.click();
      await expect.poll(() => put.requests.length).toBe(1);
    });
  });

  test.describe('画面項目の条件・値', () => {
    test('[document.title] 開くと、ページのタイトルを「イベントを編集」にする', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await expect(page).toHaveTitle('イベントを編集');
    });

    test('[エラー表示 表示条件] 初期表示では、どのエラー表示も表示しない', async ({ page, api }) => {
      // エラー表示に出るメッセージが、どれも画面にないことで確かめる。表示される側・非表示に戻る側は、アクションのケースで確かめている
      const messages = [
        M.MSG018, M.MSG019, M.MSG022, // 画面上部のエラー
        M.MSG001('タイトル'), M.MSG003('タイトル', 2), M.MSG004('タイトル', 50), M.MSG005('タイトル'),
        M.MSG004('概要', 200),
        M.MSG002('カテゴリ'),
        M.MSG001('会場名'), M.MSG004('会場名', 100), M.MSG005('会場名'),
        M.MSG001('配信 URL'), M.MSG006('配信 URL'), M.MSG007('配信 URL'),
        M.MSG001('開催日'), M.MSG008('開催日'),
        M.MSG001('定員'), M.MSG009('定員', 1, 999), M.MSG010(0),
        M.MSG011('タグ', 3),
      ];
      await openEdit(page, api, draftEvent);
      for (const m of messages) await expect(page.getByText(m)).toBeHidden();
    });

    test('[共通ルール アクセシビリティ / 入力項目のエラーの説明] タイトルのエラーの内容は、タイトルの入力欄の説明として伝わる', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await ui(page).title.fill('A');
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
        await openEdit(page, api, draftEvent);
        await ui(page).title.fill('A');
        await ui(page)[c.button].click();
        await expect(page.getByText(M.MSG003('タイトル', 2))).toBeVisible();
        await expect(ui(page).title).toBeFocused();
      });
    }

    // 確認ダイアログごとに、開く操作と、開いたボタン・リンク
    const dialogCases = [
      { name: '削除の確認', opener: (u: ReturnType<typeof ui>) => u.del, prepare: async (_u: ReturnType<typeof ui>) => {} },
      { name: '離脱の確認', opener: (u: ReturnType<typeof ui>) => u.back, prepare: async (u: ReturnType<typeof ui>) => u.title.fill('変更したタイトル') },
    ];
    for (const c of dialogCases) {
      test(`[共通ルール アクセシビリティ / 確認ダイアログを開いたとき / ${c.name}] ${c.name}を開くと、最初のボタンの「キャンセル」にフォーカスを移す`, async ({ page, api }) => {
        await openEdit(page, api, draftEvent);
        const u = ui(page);
        await c.prepare(u);
        await c.opener(u).click();
        await expect(u.dialogCancel).toBeFocused();
      });

      test(`[共通ルール アクセシビリティ / 確認ダイアログを閉じたとき / ${c.name}] ${c.name}を「キャンセル」で閉じると、開いたボタン・リンクにフォーカスを戻す`, async ({ page, api }) => {
        await openEdit(page, api, draftEvent);
        const u = ui(page);
        await c.prepare(u);
        await c.opener(u).click();
        await u.dialogCancel.click();
        await expect(u.dialog).toBeHidden();
        await expect(c.opener(u)).toBeFocused();
      });

      test(`[共通ルール アクセシビリティ / Esc キー / ${c.name}] ${c.name}で Esc キーを押すと、閉じて画面に残る`, async ({ page, api }) => {
        await openEdit(page, api, draftEvent);
        const u = ui(page);
        await c.prepare(u);
        await c.opener(u).click();
        await expect(u.dialog).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(u.dialog).toBeHidden();
        await staysOn(page, draftEvent);
      });
    }

    test('[共通ルール アクセシビリティ / Tab キーの順序] タイトルから Tab キーを押すと、概要、カテゴリの順にフォーカスが移る', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      const u = ui(page);
      await u.title.focus();
      await page.keyboard.press('Tab');
      await expect(u.summary).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(u.category).toBeFocused();
    });

    test('[見出し 表示内容] 「イベントを編集」と表示する', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await expect(ui(page).heading('イベントを編集')).toBeVisible();
    });

    const statusLabels = [
      { status: 'draft' as const, label: '下書き' },
      { status: 'published' as const, label: '公開中' },
      { status: 'closed' as const, label: '終了' },
    ];
    for (const s of statusLabels) {
      test(`[ステータス 表示形式] status が ${s.status} なら「${s.label}」と表示する`, async ({ page, api }) => {
        await openEdit(page, api, { ...draftEvent, status: s.status });
        await expect(ui(page).status(s.label)).toBeVisible();
      });
    }

    test('[主催者の見出し 表示内容 / 主催者 表示内容] 見出しの「主催」と organizerName を表示する', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await expect(ui(page).organizerLabel).toBeVisible();
      await expect(ui(page).organizer(draftEvent.organizerName)).toBeVisible();
    });

    test('[主催者 省略表記 境目] organizerName が 30 文字ちょうどなら省略しない', async ({ page, api }) => {
      const name = 'あ'.repeat(30);
      await openEdit(page, api, { ...draftEvent, organizerName: name });
      await expect(ui(page).organizer(name)).toBeVisible();
    });

    test('[主催者 省略表記] organizerName が 31 文字なら、先頭 30 文字のあとに…を付ける', async ({ page, api }) => {
      await openEdit(page, api, { ...draftEvent, organizerName: 'あ'.repeat(31) });
      await expect(ui(page).organizer(`${'あ'.repeat(30)}…`)).toBeVisible();
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
        await openEdit(page, api, draftEvent);
        if ('online' in c) await ui(page).online.check(); // No.24 は「オンライン」のときだけ表示される
        await expect(ui(page)[c.field]).toHaveAttribute('placeholder', c.text);
      });
    }

    const formatValueCases = [
      { label: '会場', value: 'onsite' },
      { label: 'オンライン', value: 'online' },
    ];
    for (const c of formatValueCases) {
      test(`[開催形式 対応表] 「${c.label}」を選んで保存すると、format に ${c.value} を送る`, async ({ page, api }) => {
        // 「会場」は「オンライン」の、「オンライン」は「会場」のイベントを開いて選び直す（初期値のままでは、選んだことにならないため）
        const event: Event = c.value === 'onsite' ? { ...draftEvent, format: 'online', venueName: undefined, onlineUrl: 'https://meet.example.com/autumn' } : draftEvent;
        await openEdit(page, api, event);
        const put = api.on('PUT /events/{eventId}', { status: 200, body: savedDraft });
        const u = ui(page);
        if (c.value === 'onsite') {
          await u.onsite.check();
          await u.venue.fill('渋谷オフィス 5F');
        } else {
          await u.online.check();
          await u.onlineUrl.fill('https://meet.example.com/autumn');
        }
        await u.draft.click();
        await expect.poll(() => put.requests.length).toBe(1);
        expect(put.last().body.format).toBe(c.value);
      });
    }

    test('[開催形式 活性条件] participantCount が 1 以上なら非活性（開催形式を選べない）', async ({ page, api }) => {
      await openEdit(page, api, { ...draftEvent, participantCount: 1 });
      await expect(ui(page).onsite).toBeDisabled();
      await expect(ui(page).online).toBeDisabled();
    });

    test('[開催形式 活性条件] participantCount が 0 なら活性（開催形式を選べる）', async ({ page, api }) => {
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
      test(`[開催日 活性条件] status が ${c.status} なら開催日は${c.disabled ? '非活性（編集できない）' : '活性（編集できる）'}`, async ({ page, api }) => {
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
      test(`[定員 活性条件] status が ${c.status} なら定員は${c.disabled ? '非活性（編集できない）' : '活性（編集できる）'}`, async ({ page, api }) => {
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
        await openEdit(page, api, draftEvent);
        const put = api.on('PUT /events/{eventId}', { status: 200, body: savedDraft });
        await ui(page).tag(c.label).check();
        await ui(page).draft.click();
        await expect.poll(() => put.requests.length).toBe(1);
        expect(put.last().body.tags).toEqual([c.value]);
      });
    }

    const notifyVisibleCases = [
      { status: 'published', event: publishedEvent, visible: true },
      { status: 'draft', event: draftEvent, visible: false },
    ];
    for (const c of notifyVisibleCases) {
      test(`[参加者への通知 表示条件] status が ${c.status} なら${c.visible ? '表示する' : '表示しない'}`, async ({ page, api }) => {
        await openEdit(page, api, c.event);
        if (c.visible) await expect(ui(page).notify).toBeVisible();
        else await expect(ui(page).notify).toBeHidden();
      });
    }

    const draftVisibleCases = [
      { status: 'draft', event: draftEvent, visible: true },
      { status: 'published', event: publishedEvent, visible: false },
    ];
    for (const c of draftVisibleCases) {
      test(`[「下書き保存」ボタン 表示条件] status が ${c.status} なら${c.visible ? '表示する' : '表示しない'}`, async ({ page, api }) => {
        await openEdit(page, api, c.event);
        if (c.visible) await expect(ui(page).draft).toBeVisible();
        else await expect(ui(page).draft).toBeHidden();
      });
    }

    test('[「下書き保存」ボタン 活性条件] タイトルが空なら非活性', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await ui(page).title.fill('');
      await expect(ui(page).draft).toBeDisabled();
    });

    test('[「下書き保存」ボタン 活性条件] タイトルが 1 文字以上なら活性', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      // いったん空にして非活性にしてから、1 文字を入れる
      await ui(page).title.fill('');
      await expect(ui(page).draft).toBeDisabled();
      await ui(page).title.fill('A');
      await expect(ui(page).draft).toBeEnabled();
    });

    const buttonLabelCases = [
      { status: 'draft', event: draftEvent, label: '公開する' },
      { status: 'published', event: publishedEvent, label: '更新する' },
    ];
    for (const c of buttonLabelCases) {
      test(`[「公開する」／「更新する」ボタン 文言] status が ${c.status} なら「${c.label}」と表示する`, async ({ page, api }) => {
        await openEdit(page, api, c.event);
        await expect(page.getByRole('button', { name: c.label, exact: true })).toBeVisible();
      });
    }

    test('[「公開する」／「更新する」ボタン 活性条件] 表示中の必須項目がすべて入力されていれば活性', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await expect(ui(page).publish).toBeEnabled();
    });

    test('[「公開する」／「更新する」ボタン 活性条件] 表示中の必須項目が 1 つでも空なら非活性', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await ui(page).venue.fill('');
      await expect(ui(page).publish).toBeDisabled();
    });

    test('[「公開する」／「更新する」ボタン 活性条件] 非表示の必須項目（会場名）が空でも、表示中の必須項目が入力されていれば活性', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      const u = ui(page);
      await u.venue.fill('');
      await u.online.check();
      await u.onlineUrl.fill('https://meet.example.com/autumn');
      await expect(u.publish).toBeEnabled();
    });

    const deleteVisibleCases = [
      { name: 'admin（主催者ではない）', user: users.admin, organizerId: 'u-org', visible: true },
      { name: 'organizer で自分が主催', user: users.organizer, organizerId: 'u-org', visible: true },
      // 実際には GET /events/{eventId} が 403 を返すので起きないが、条件の組み合わせとしてモックで作る
      { name: 'organizer で他の人が主催', user: users.organizer, organizerId: 'u-other', visible: false },
    ];
    for (const c of deleteVisibleCases) {
      test(`[「削除」ボタン 表示条件] ${c.name}なら${c.visible ? '表示する' : '表示しない'}`, async ({ page, api }) => {
        await openEdit(page, api, { ...draftEvent, organizerId: c.organizerId }, c.user);
        if (c.visible) await expect(ui(page).del).toBeVisible();
        else await expect(ui(page).del).toBeHidden();
      });
    }

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
      await expect(ui(page).dialog.getByText(M.MSG017(title)[1])).toBeVisible();
    });

    test('[削除の確認 省略表記] title が 21 文字なら、先頭 20 文字のあとに…を付ける', async ({ page, api }) => {
      await openEdit(page, api, { ...draftEvent, title: 'あ'.repeat(21) });
      await ui(page).del.click();
      await expect(ui(page).dialog.getByText(M.MSG017(`${'あ'.repeat(20)}…`)[1])).toBeVisible();
    });

    test('[削除の確認 背面の操作] 表示中は背面のタイトルを操作できず、値も変わらない', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await ui(page).del.click();
      await expect(ui(page).dialog).toBeVisible();
      await expect(ui(page).title.click({ timeout: 1000 })).rejects.toThrow();
      await expect(ui(page).title).toHaveValue(draftEvent.title);
    });

    test('[離脱の確認 表示条件 / 「キャンセル」ボタン 表示条件 / 「離れる」ボタン 表示条件] 「← 一覧へ戻る」を押す前は、確認もその中のボタンも表示しない', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await ui(page).title.fill('変更したタイトル');
      await expect(ui(page).back).toBeVisible();
      await expect(ui(page).dialog).toBeHidden();
      await expect(ui(page).dialogCancel).toBeHidden();
      await expect(ui(page).dialogLeave).toBeHidden();
    });

    test('[離脱の確認 背面の操作] 表示中は背面のタイトルを操作できず、値も変わらない', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await ui(page).title.fill('変更したタイトル');
      await ui(page).back.click();
      await expect(ui(page).dialog).toBeVisible();
      await expect(ui(page).title.click({ timeout: 1000 })).rejects.toThrow();
      await expect(ui(page).title).toHaveValue('変更したタイトル');
    });
  });

  test.describe('共通ルール（通信・メッセージ）', () => {
    test(`[共通ルール トーストが表示されている間に、次のトーストを表示するとき] ${q(M.MSG013)}のトーストが出ている間に次のトーストを出すと、前のトーストを消して、新しいものだけを表示する`, async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      api.on('PUT /events/{eventId}', { status: 200, body: { ...draftEvent, version: 2 } });
      api.on('DELETE /events/{eventId}', { status: 403, body: apiError('forbidden') });
      const u = ui(page);
      await u.draft.click();
      await expect(page.getByText(M.MSG013)).toBeVisible();
      // 前のトーストが自動で消えるのを待たずに、次のトースト（削除の 403）を出す
      await u.del.click();
      await u.dialogDelete.click();
      await expect(page.getByText(M.MSG020)).toBeVisible();
      await expect(page.getByText(M.MSG013)).toBeHidden();
    });
  });

  test.describe('遷移', () => {
    /**
     * タイトルを変えて「下書き保存」を押し、保存に成功するまで待つ。
     * 保存に成功したときの入力欄の値が「入力内容に変更があるかどうか」の基準になるので、このあとは、
     * 保存した値と同じなら「変更なし」、初期表示のときの値に戻しても「変更あり」
     */
    async function changeAndSaveDraft(page: Page, api: ApiMock) {
      const title = '保存したタイトル';
      api.on('PUT /events/{eventId}', { status: 200, body: { ...savedDraft, title } });
      await ui(page).title.fill(title);
      await ui(page).draft.click();
      await expect(page.getByText(M.MSG013)).toBeVisible();
    }

    test('[「← 一覧へ戻る」リンク押下 / 入力内容に変更がないとき] 入力内容に変更がなければ、離脱の確認を出さずに同じタブでイベント一覧へ遷移する', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      api.allowUnmockedCalls();
      await ui(page).back.click();
      await toList(page);
    });

    test('[「← 一覧へ戻る」リンク押下 / 入力内容に変更がないとき] 値を変えたあと初期表示のときの値に戻すと、離脱の確認を出さずにイベント一覧へ遷移する', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      const u = ui(page);
      await u.title.fill('変更したタイトル');
      await u.title.fill(draftEvent.title);
      api.allowUnmockedCalls();
      await u.back.click();
      await toList(page);
    });

    test('[「← 一覧へ戻る」リンク押下 / 入力内容に変更がないとき / 「下書き保存」ボタン押下 / PUT /events/{eventId} 200] 値を変えて下書き保存に成功したあと、値を変えなければ、離脱の確認を出さずにイベント一覧へ遷移する', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await changeAndSaveDraft(page, api);
      api.allowUnmockedCalls();
      await ui(page).back.click();
      await toList(page);
    });

    test(`[「← 一覧へ戻る」リンク押下 / 入力内容に変更があるとき] 入力内容に変更があれば、遷移せずに離脱の確認に ${q(M.MSG012)}を表示する`, async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await ui(page).title.fill('変更したタイトル');
      await ui(page).back.click();
      await expect(ui(page).dialog.getByText(M.MSG012)).toBeVisible();
      await staysOn(page, draftEvent);
    });

    test(`[「← 一覧へ戻る」リンク押下 / 入力内容に変更があるとき / 「下書き保存」ボタン押下 / PUT /events/{eventId} 200] 下書き保存に成功したあとで値を変えると、遷移せずに離脱の確認に ${q(M.MSG012)}を表示する`, async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await changeAndSaveDraft(page, api);
      await ui(page).title.fill('保存したあとに変更したタイトル');
      await ui(page).back.click();
      await expect(ui(page).dialog.getByText(M.MSG012)).toBeVisible();
      await staysOn(page, draftEvent);
    });

    test(`[「← 一覧へ戻る」リンク押下 / 入力内容に変更があるとき / 「下書き保存」ボタン押下 / PUT /events/{eventId} 200] 別の値で下書き保存に成功したあと、初期表示のときの値へ戻すと、遷移せずに離脱の確認に ${q(M.MSG012)}を表示する`, async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await changeAndSaveDraft(page, api);
      await ui(page).title.fill(draftEvent.title); // 基準は保存したときの値に変わっているので、初期表示のときの値は「変更あり」
      await ui(page).back.click();
      await expect(ui(page).dialog.getByText(M.MSG012)).toBeVisible();
      await staysOn(page, draftEvent);
    });

    test('[離脱の確認で「キャンセル」ボタン押下] 「キャンセル」を押すと、離脱の確認を閉じて画面に残り、入力内容を保つ', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await ui(page).title.fill('変更したタイトル');
      await ui(page).back.click();
      await ui(page).dialogCancel.click();
      await expect(ui(page).dialog).toBeHidden();
      await staysOn(page, draftEvent);
      await expect(ui(page).title).toHaveValue('変更したタイトル');
    });

    test('[離脱の確認で「離れる」ボタン押下] 「離れる」を押すと、イベント一覧へ遷移する', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await ui(page).title.fill('変更したタイトル');
      await ui(page).back.click();
      api.allowUnmockedCalls();
      await ui(page).dialogLeave.click();
      await toList(page);
    });

    test('[離脱の確認で「離れる」ボタン押下 / ブラウザの戻る・再読み込み・タブを閉じる / 離脱確認] 入力内容に変更があっても、「離れる」を押したときは、ブラウザ標準の離脱確認を出さずにイベント一覧へ遷移する', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await ui(page).title.fill('変更したタイトル');
      await ui(page).back.click(); // この操作が、ブラウザに離脱確認を出させるための「ユーザーの操作」を兼ねる
      const leaveConfirm = watchLeaveConfirm(page);
      api.allowUnmockedCalls();
      await ui(page).dialogLeave.click();
      await toList(page);
      expect(leaveConfirm.shown).toBe(false);
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

    // 「下書き保存」を押す操作が、ブラウザに離脱確認を出させるための「ユーザーの操作」を兼ねる
    test('[ブラウザの戻る・再読み込み・タブを閉じる / 離脱確認 / 「下書き保存」ボタン押下 / PUT /events/{eventId} 200] 値を変えて下書き保存に成功したあと、値を変えなければ、タブを閉じても離脱確認を出さない', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await changeAndSaveDraft(page, api);
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

    test('[ブラウザの戻る・再読み込み・タブを閉じる / 離脱確認 / 「下書き保存」ボタン押下 / PUT /events/{eventId} 200] 下書き保存に成功したあとで値を変えると、タブを閉じるときにブラウザ標準の離脱確認を出す', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await changeAndSaveDraft(page, api);
      await ui(page).title.fill('保存したあとに変更したタイトル');
      const dialog = page.waitForEvent('dialog');
      await page.close({ runBeforeUnload: true });
      const d = await dialog;
      expect(d.type()).toBe('beforeunload');
      await d.dismiss();
    });

    test('[ブラウザの戻る・再読み込み・タブを閉じる / 離脱確認 / 「下書き保存」ボタン押下 / PUT /events/{eventId} 200] 別の値で下書き保存に成功したあと、初期表示のときの値へ戻すと、タブを閉じるときにブラウザ標準の離脱確認を出す', async ({ page, api }) => {
      await openEdit(page, api, draftEvent);
      await changeAndSaveDraft(page, api);
      await ui(page).title.fill(draftEvent.title); // 基準は保存したときの値に変わっているので、初期表示のときの値は「変更あり」
      const dialog = page.waitForEvent('dialog');
      await page.close({ runBeforeUnload: true });
      const d = await dialog;
      expect(d.type()).toBe('beforeunload');
      await d.dismiss();
    });

    // アクションの処理による遷移。タイトルを変えたまま（変更あり）で操作し、ブラウザ標準の離脱確認が出ずに遷移することを確かめる。
    // ボタンを押す操作が、ブラウザに離脱確認を出させるための「ユーザーの操作」を兼ねる。
    // 遷移の種類ごとに代表の 1 つで確かめる（同じ遷移は、どのボタン・どの API でも同じ扱い）
    const actionLeaveCases: { source: string; operation: string; when: string; to: string; reply: { status: number; body?: unknown }; act: (u: ReturnType<typeof ui>) => Promise<void>; arrives: (page: Page) => Promise<void> }[] = [
      {
        source: '「公開する」／「更新する」ボタン押下 / PUT /events/{eventId} 200',
        operation: 'PUT /events/{eventId}',
        when: '公開に成功したとき',
        to: 'イベント一覧',
        reply: { status: 200, body: { ...draftEvent, status: 'published' } },
        act: (u) => u.publish.click(),
        arrives: toList,
      },
      {
        source: '削除の確認で「削除する」ボタン押下 / DELETE /events/{eventId} 204',
        operation: 'DELETE /events/{eventId}',
        when: '削除に成功したとき',
        to: 'イベント一覧',
        reply: { status: 204 },
        act: async (u) => {
          await u.del.click();
          await u.dialogDelete.click();
        },
        arrives: toList,
      },
      {
        source: '「下書き保存」ボタン押下 / PUT /events/{eventId} 401',
        operation: 'PUT /events/{eventId}',
        when: '下書き保存で 401 が返ったとき',
        to: 'ログイン画面',
        reply: { status: 401, body: apiError('unauthorized') },
        act: (u) => u.draft.click(),
        arrives: toLogin(editPath(draftEvent)),
      },
      {
        source: '「下書き保存」ボタン押下 / PUT /events/{eventId} 404',
        operation: 'PUT /events/{eventId}',
        when: '下書き保存で 404 が返ったとき',
        to: 'イベント一覧',
        reply: { status: 404, body: apiError('not_found') },
        act: (u) => u.draft.click(),
        arrives: toList,
      },
    ];
    for (const c of actionLeaveCases) {
      test(`[ブラウザの戻る・再読み込み・タブを閉じる / 離脱確認 / ${c.source}] 入力内容に変更があっても、${c.when}は、ブラウザ標準の離脱確認を出さずに${c.to}へ遷移する`, async ({ page, api }) => {
        await openEdit(page, api, draftEvent);
        api.on(c.operation, c.reply);
        await ui(page).title.fill('変更したタイトル');
        const leaveConfirm = watchLeaveConfirm(page);
        api.allowUnmockedCalls(); // 遷移先の画面の通信は確かめない
        await c.act(ui(page));
        await c.arrives(page);
        expect(leaveConfirm.shown).toBe(false);
      });
    }
  });

  test.describe('閲覧権限', () => {
    // member は [初期表示 / member のとき / 閲覧権限 member]、未ログインは [初期表示 / GET /me 401 / 閲覧権限 未ログイン]、
    // organizer（他の人のイベント）は [初期表示 / GET /events/{eventId} 403 / 閲覧権限 organizer（他の人のイベント）] で確かめている
    const viewers = [
      { name: 'admin', user: users.admin },
      { name: 'organizer', user: users.organizer },
    ];
    for (const v of viewers) {
      test(`[閲覧権限 ${v.name} / 初期表示 / member でないとき] ${v.name} なら、${q(M.MSG020)}を表示せず、遷移せずに画面を開ける`, async ({ page, api }) => {
        await openEdit(page, api, draftEvent, v.user);
        await expect(ui(page).heading('イベントを編集')).toBeVisible();
        await staysOn(page, draftEvent);
        await expect(page.getByText(M.MSG020)).toBeHidden();
      });
    }
  });
});
