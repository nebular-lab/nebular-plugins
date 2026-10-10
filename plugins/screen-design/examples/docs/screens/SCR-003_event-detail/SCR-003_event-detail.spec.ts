/**
 * SCR-003 イベント詳細 の Playwright テスト
 *
 * 設計書: docs/screens/SCR-003_event-detail/SCR-003_event-detail.md
 * ワイヤーフレーム: docs/screens/SCR-003_event-detail/SCR-003_event-detail.html
 * メッセージ一覧: docs/screens/messages.md
 * 共通ルール: docs/screens/common-rules.md
 *
 * テスト名の先頭の [...] は、設計書のどこから作ったケースかを、場面・項目名・条件で示す。
 *   [初期表示 / GET /events/{eventId} 404]   … 5. 初期表示時の処理 の GET /events/{eventId}、レスポンス 404
 *   [「削除」ボタン押下]                      … アクション「「削除」ボタン押下」の手順（API を呼ばない）
 *   [「編集」ボタン 表示条件]                 … 画面項目「「編集」」の表示条件
 *   [ステータス 表示形式]                     … 画面項目「ステータス」の備考
 *   [閲覧権限 member]                             … 3. 閲覧権限 の member の行
 * 2 つの出典に当たるケースは「/」で併記している。メッセージは文言をそのまま書いている。
 *
 * 実装についての前提:
 * - API はブラウザから fetch か XHR で呼ぶ（すべてモックし、バックエンドとは通信しない）
 * - ボタン・リンク・見出し・表の行は、役割と名前で見つかる
 * - 確認ダイアログ（削除の確認）はダイアログとして見つかる（役割が dialog か alertdialog）
 * - メッセージ（トーストを含む）は画面上のテキストとして 1 か所に表示され、遷移後も確かめられる間は表示されている
 * - 特定の属性（role、aria-*、data-*）やライブラリ固有の DOM の形は前提にしない。アクセシビリティは、名前・フォーカスの位置・キー操作の結果で確かめる
 */
import type { Page } from '@playwright/test';
import { test, expect, deferred, type ApiMock } from '../api-mock';

// ---- メッセージ（docs/screens/messages.md）------------------------------------
// 変数（{v1}、{v2}…）のあるメッセージは関数にする。引数は変数の番号の順

const M = {
  MSG016: 'イベントを削除しました',
  MSG017: (v1: string) => ['イベントを削除しますか？', `「${v1}」を削除します。この操作は取り消せません。`],
  MSG019: '参加者がいるイベントは削除できません',
  MSG020: 'イベントを作成・編集する権限がありません',
  MSG021: 'イベントが見つかりません',
  MSG022: '通信に失敗しました。時間をおいてもう一度お試しください',
  MSG025: 'このイベントを表示する権限がありません',
};

// ---- テストデータ（OpenAPI のスキーマに合わせる） ---------------------------

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

/** 公開中・オンライン・参加者あり（「削除」は非活性） */
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

/** 下書き・会場・参加者なし・概要なし・タグなし（「削除」は活性） */
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

const apiError = (code: string) => ({ code, message: code });

// ---- 部品（番号はワイヤーフレームの data-no） -------------------------------

const ui = (page: Page) => {
  const dialog = page.getByRole('dialog').or(page.getByRole('alertdialog'));
  return {
    back: page.getByRole('link', { name: '← 一覧へ戻る' }), // No.1
    heading: (name: string) => page.getByRole('heading', { name, exact: true }), // No.3
    /** 主催者の見出し（No.5） */
    organizerLabel: page.getByText('主催', { exact: true }),
    /** 主催者（No.6）。文言で特定する */
    organizer: (name: string) => page.getByText(name, { exact: true }),
    /** 表の 1 行。見出しのセル（No.8、11、13、15、17、19）の文言で特定する。データのセルは No.9、12、14、16、18、20 */
    row: (label: string) => page.getByRole('row').filter({ hasText: new RegExp(`^\\s*${label}`) }),
    edit: page.getByRole('button', { name: '編集', exact: true }), // No.20
    del: page.getByRole('button', { name: '削除', exact: true }), // No.21
    dialog, // No.23
    dialogCancel: dialog.getByRole('button', { name: 'キャンセル', exact: true }), // No.26
    dialogDelete: dialog.getByRole('button', { name: '削除する', exact: true }), // No.27
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

const pathOf = (event: Event) => `/events/${event.id}`;

async function open(page: Page, api: ApiMock, event: Event, user: User = users.organizer) {
  mockInitial(api, { user, event });
  await page.goto(pathOf(event));
  await expect(ui(page).heading(event.title)).toBeVisible();
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
const showsAndToList = (text: string) => async (page: Page) => {
  await expect(page.getByText(text)).toBeVisible();
  await toList(page);
};

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

// ---- テスト -----------------------------------------------------------------

test.use({ timezoneId: 'Asia/Tokyo', viewport: { width: 1280, height: 720 } });

test.describe('SCR-003 イベント詳細', () => {
  test.describe('API: 初期表示', () => {
    const detailPath = pathOf(draftEvent);

    const meOutcomes: Outcome[] = [
      { status: 401, body: apiError('unauthorized'), label: 'ログイン画面へ遷移する', leaves: true, also: '閲覧権限 未ログイン', expect: toLogin(detailPath) },
      { status: 500, other: true, label: `${q(M.MSG022)}を表示して終了する`, expect: shows(M.MSG022) },
    ];
    for (const o of meOutcomes) {
      test(`[初期表示 / GET /me ${statusLabel(o)}${also(o)}] GET /me で ${returns(o)}、${o.label}`, async ({ page, api }) => {
        const { categories: cat } = mockInitial(api);
        api.on('GET /me', { status: o.status, body: o.body });
        if (o.leaves) api.allowUnmockedCalls();
        await page.goto(detailPath);
        await o.expect(page);
        // 「終了する」ので、後続の GET /categories は呼ばない
        if (o.other) expect(cat.requests).toHaveLength(0);
      });
    }

    const categoriesOutcomes: Outcome[] = [
      { status: 401, body: apiError('unauthorized'), label: 'ログイン画面へ遷移する', leaves: true, expect: toLogin(detailPath) },
      { status: 500, other: true, label: `${q(M.MSG022)}を表示して終了する`, expect: shows(M.MSG022) },
    ];
    for (const o of categoriesOutcomes) {
      test(`[初期表示 / GET /categories ${statusLabel(o)}] GET /categories で ${returns(o)}、${o.label}`, async ({ page, api }) => {
        const { event } = mockInitial(api);
        api.on('GET /categories', { status: o.status, body: o.body });
        if (o.leaves) api.allowUnmockedCalls();
        await page.goto(detailPath);
        await o.expect(page);
        // 「終了する」ので、後続の GET /events/{eventId} は呼ばない
        if (o.other) expect(event.requests).toHaveLength(0);
      });
    }

    test('[初期表示 / GET /events/{eventId} リクエスト] path の eventId に URL パラメータ eventId を入れる', async ({ page, api }) => {
      const { event } = mockInitial(api);
      await page.goto(detailPath);
      await expect.poll(() => event.requests.length).toBe(1);
      expect(event.last().pathParams).toEqual({ eventId: draftEvent.id });
    });

    test('[初期表示 / GET /events/{eventId} 200] 取得した内容（タイトル）を見出しに表示する', async ({ page, api }) => {
      await open(page, api, publishedEvent);
      await expect(ui(page).heading(publishedEvent.title)).toBeVisible();
    });

    const eventOutcomes: Outcome[] = [
      { status: 401, body: apiError('unauthorized'), label: 'ログイン画面へ遷移する', leaves: true, expect: toLogin(detailPath) },
      { status: 403, body: apiError('forbidden'), label: `${q(M.MSG025)}を表示し、イベント一覧へ遷移する`, leaves: true, expect: showsAndToList(M.MSG025) },
      { status: 404, body: apiError('not_found'), label: `${q(M.MSG021)}を表示し、イベント一覧へ遷移する`, leaves: true, expect: showsAndToList(M.MSG021) },
      { status: 500, other: true, label: `${q(M.MSG022)}を表示する`, expect: shows(M.MSG022) },
    ];
    for (const o of eventOutcomes) {
      test(`[初期表示 / GET /events/{eventId} ${statusLabel(o)}] GET /events/{eventId} で ${returns(o)}、${o.label}`, async ({ page, api }) => {
        mockInitial(api);
        api.on('GET /events/{eventId}', { status: o.status, body: o.body });
        if (o.leaves) api.allowUnmockedCalls();
        await page.goto(detailPath);
        await o.expect(page);
      });
    }

    test.fixme('[初期表示 / 読み込み中] 取得が終わるまで、内容の代わりに読み込み中の表示を出し、終わったら消す（スピナーの目印が設計書・ワイヤーフレームにないため）', async () => {});

    test('[初期表示 / 読み込み中] 取得が終わるまで、見出しも「編集」「削除」ボタンも表示しない', async ({ page, api }) => {
      mockInitial(api);
      const reply = deferred<{ status: number; body: unknown }>();
      const event = api.on('GET /events/{eventId}', () => reply.promise);
      await page.goto(detailPath);
      await expect.poll(() => event.requests.length).toBe(1);
      const u = ui(page);
      await expect(u.heading(draftEvent.title)).toBeHidden();
      await expect(u.edit).toBeHidden();
      await expect(u.del).toBeHidden();
      reply.resolve({ status: 200, body: draftEvent });
      await expect(u.heading(draftEvent.title)).toBeVisible();
      await expect(u.edit).toBeVisible();
    });
  });

  test.describe('API: 削除の確認で「削除する」ボタン押下', () => {
    async function openDeleteDialog(page: Page, api: ApiMock) {
      await open(page, api, draftEvent);
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
      { status: 204, label: `${q(M.MSG016)}を表示し、イベント一覧へ遷移する`, leaves: true, expect: showsAndToList(M.MSG016) },
      { status: 401, body: apiError('unauthorized'), label: 'ログイン画面へ遷移する', leaves: true, expect: toLogin(pathOf(draftEvent)) },
      { status: 403, body: apiError('forbidden'), label: `削除の確認を閉じ、${q(M.MSG020)}を表示する`, expect: closesDialog(M.MSG020) },
      { status: 404, body: apiError('not_found'), label: `${q(M.MSG021)}を表示し、イベント一覧へ遷移する`, leaves: true, expect: showsAndToList(M.MSG021) },
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
    test(`[「削除」ボタン押下] 「削除」を押すと、削除の確認に ${q(M.MSG017(draftEvent.title).join(''))}を表示する`, async ({ page, api }) => {
      await open(page, api, draftEvent);
      await ui(page).del.click();
      for (const line of M.MSG017(draftEvent.title)) await expect(ui(page).dialog.getByText(line)).toBeVisible();
    });

    test('[削除の確認で「キャンセル」ボタン押下] 「キャンセル」を押すと、削除の確認を閉じ、API を呼ばない', async ({ page, api }) => {
      await open(page, api, draftEvent);
      const del = api.on('DELETE /events/{eventId}', { status: 204 });
      await ui(page).del.click();
      await expect(ui(page).dialog).toBeVisible();
      await ui(page).dialogCancel.click();
      await expect(ui(page).dialog).toBeHidden();
      expect(del.requests).toHaveLength(0);
    });
  });

  test.describe('画面項目の条件・値', () => {
    test('[document.title] 開くと、ページのタイトルを「イベント詳細」にする', async ({ page, api }) => {
      await open(page, api, draftEvent);
      await expect(page).toHaveTitle('イベント詳細');
    });

    test('[エラー表示 表示条件] 初期表示では、画面上部のエラー表示を表示しない', async ({ page, api }) => {
      await open(page, api, draftEvent);
      for (const m of [M.MSG019, M.MSG022]) await expect(page.getByText(m)).toBeHidden();
    });

    const statusCases = [
      { status: 'draft' as const, label: '下書き' },
      { status: 'published' as const, label: '公開中' },
      { status: 'closed' as const, label: '終了' },
    ];
    for (const s of statusCases) {
      test(`[ステータス 表示形式] status が ${s.status} なら「${s.label}」と表示する`, async ({ page, api }) => {
        await open(page, api, { ...draftEvent, status: s.status });
        await expect(page.getByText(s.label, { exact: true })).toBeVisible();
      });
    }

    test('[主催者の見出し 表示内容 / 主催者 表示内容] 見出しの「主催」と organizerName を表示する', async ({ page, api }) => {
      await open(page, api, draftEvent);
      await expect(ui(page).organizerLabel).toBeVisible();
      await expect(ui(page).organizer(draftEvent.organizerName)).toBeVisible();
    });

    test('[主催者 省略表記 境目] organizerName が 30 文字ちょうどなら省略しない', async ({ page, api }) => {
      const name = 'あ'.repeat(30);
      await open(page, api, { ...draftEvent, organizerName: name });
      await expect(ui(page).organizer(name)).toBeVisible();
    });

    test('[主催者 省略表記] organizerName が 31 文字なら、先頭 30 文字のあとに…を付ける', async ({ page, api }) => {
      await open(page, api, { ...draftEvent, organizerName: 'あ'.repeat(31) });
      await expect(ui(page).organizer(`${'あ'.repeat(30)}…`)).toBeVisible();
    });

    const headingCases = ['カテゴリ', '開催形式', '会場', '開催日', '参加者', 'タグ'];
    for (const label of headingCases) {
      test(`[${label === '参加者' ? '参加者数' : label}の見出し 表示内容] 見出しの「${label}」を表示する`, async ({ page, api }) => {
        await open(page, api, draftEvent);
        await expect(ui(page).row(label)).toBeVisible();
      });
    }

    test('[概要 表示条件] summary があれば表示する', async ({ page, api }) => {
      await open(page, api, publishedEvent);
      await expect(page.getByText(publishedEvent.summary ?? '', { exact: true })).toBeVisible();
    });

    test('[概要 表示条件] summary がなければ表示しない', async ({ page, api }) => {
      // 概要のない下書きと、概要のある公開中とで、同じ文言が出ないことを確かめる
      await open(page, api, { ...draftEvent, title: publishedEvent.title });
      await expect(ui(page).heading(publishedEvent.title)).toBeVisible();
      await expect(page.getByText(publishedEvent.summary ?? '', { exact: true })).toBeHidden();
    });

    test('[カテゴリ 表示内容] categoryId に対応するカテゴリの name を表示する', async ({ page, api }) => {
      await open(page, api, draftEvent);
      await expect(ui(page).row('カテゴリ')).toContainText('交流会');
    });

    const formatCases = [
      { name: 'onsite', event: draftEvent, format: '会場', venue: draftEvent.venueName ?? '' },
      { name: 'online', event: publishedEvent, format: 'オンライン', venue: publishedEvent.onlineUrl ?? '' },
    ];
    for (const c of formatCases) {
      test(`[開催形式 表示形式] format が ${c.name} なら「${c.format}」と表示する`, async ({ page, api }) => {
        await open(page, api, c.event);
        await expect(ui(page).row('開催形式')).toContainText(c.format);
      });

      test(`[会場 表示内容] format が ${c.name} なら ${c.name === 'onsite' ? 'venueName' : 'onlineUrl'} を表示する`, async ({ page, api }) => {
        await open(page, api, c.event);
        await expect(ui(page).row('会場')).toContainText(c.venue);
      });
    }

    test('[開催日 表示形式] startDate を YYYY/MM/DD で表示する', async ({ page, api }) => {
      await open(page, api, draftEvent);
      await expect(ui(page).row('開催日')).toContainText('2026/10/20');
    });

    test('[参加者数 表示形式] 「{participantCount} / {capacity} 人」で表示する', async ({ page, api }) => {
      await open(page, api, publishedEvent);
      await expect(ui(page).row('参加者')).toContainText('18 / 30 人');
    });

    const tagCases = [
      { value: 'beginner', label: '初心者向け' },
      { value: 'hands-on', label: 'ハンズオン' },
      { value: 'networking', label: '交流' },
      { value: 'free', label: '無料' },
      { value: 'english', label: '英語' },
    ];
    for (const c of tagCases) {
      test(`[タグ 対応表] tags が ${c.value} なら「${c.label}」と表示する`, async ({ page, api }) => {
        await open(page, api, { ...draftEvent, tags: [c.value] });
        await expect(ui(page).row('タグ')).toContainText(c.label);
      });
    }

    test('[タグ 表示形式] 複数あるときは「、」で区切って表示する', async ({ page, api }) => {
      await open(page, api, publishedEvent);
      await expect(ui(page).row('タグ')).toContainText('初心者向け、ハンズオン');
    });

    test('[タグ 表示形式] 1 つもないときは「なし」と表示する', async ({ page, api }) => {
      await open(page, api, draftEvent);
      await expect(ui(page).row('タグ')).toContainText('なし');
    });

    // 「編集」の表示条件。「削除」の表示条件は「編集」と同じ
    const ownerCases = [
      { name: 'role が admin（主催者ではない）', user: users.admin, visible: true },
      { name: 'organizerId が自分の id と同じ', user: users.organizer, visible: true },
      { name: 'role が organizer で、主催者が別の人', user: { ...users.organizer, id: 'u-other' }, visible: false },
      { name: 'role が member', user: users.member, visible: false },
    ];
    for (const c of ownerCases) {
      for (const b of [
        { item: '「編集」ボタン', key: 'edit' as const },
        { item: '「削除」ボタン', key: 'del' as const },
      ]) {
        test(`[${b.item} 表示条件] ${c.name}なら${c.visible ? '表示する' : '表示しない'}`, async ({ page, api }) => {
          await open(page, api, draftEvent, c.user);
          if (c.visible) await expect(ui(page)[b.key]).toBeVisible();
          else await expect(ui(page)[b.key]).toBeHidden();
        });
      }
    }

    test('[「削除」ボタン 活性条件] participantCount が 0 なら活性', async ({ page, api }) => {
      await open(page, api, draftEvent);
      await expect(ui(page).del).toBeEnabled();
    });

    test('[「削除」ボタン 活性条件] participantCount が 1 以上なら非活性', async ({ page, api }) => {
      await open(page, api, { ...draftEvent, participantCount: 1 });
      await expect(ui(page).del).toBeDisabled();
    });

    test('[削除の確認 表示条件 / 「キャンセル」ボタン 表示条件 / 「削除する」ボタン 表示条件] 「削除」を押す前は、確認もその中のボタンも表示しない', async ({ page, api }) => {
      await open(page, api, draftEvent);
      await expect(ui(page).del).toBeVisible();
      await expect(ui(page).dialog).toBeHidden();
      await expect(ui(page).dialogCancel).toBeHidden();
      await expect(ui(page).dialogDelete).toBeHidden();
    });

    test('[削除の確認 省略表記 境目] title が 20 文字ちょうどなら省略しない', async ({ page, api }) => {
      const title = 'あ'.repeat(20);
      await open(page, api, { ...draftEvent, title });
      await ui(page).del.click();
      await expect(ui(page).dialog.getByText(M.MSG017(title)[1])).toBeVisible();
    });

    test('[削除の確認 省略表記] title が 21 文字なら、先頭 20 文字のあとに…を付ける', async ({ page, api }) => {
      await open(page, api, { ...draftEvent, title: 'あ'.repeat(21) });
      await ui(page).del.click();
      await expect(ui(page).dialog.getByText(M.MSG017(`${'あ'.repeat(20)}…`)[1])).toBeVisible();
    });

    test('[削除の確認 背面の操作] 表示中は背面の「編集」ボタンを操作できず、画面も移らない', async ({ page, api }) => {
      await open(page, api, draftEvent);
      await ui(page).del.click();
      await expect(ui(page).dialog).toBeVisible();
      await expect(ui(page).edit.click({ timeout: 1000 })).rejects.toThrow();
      await expect(page).toHaveURL(new RegExp(`${pathOf(draftEvent)}$`));
    });

    test.fixme('[共通ルール アクセシビリティ / 画面上部のエラーの通知] 画面上部のエラー表示を表示したとき、読み上げで通知する（通知のしかたは実装によって違うため、読み上げソフトで手で確かめる）', async () => {});

    test.fixme('[共通ルール アクセシビリティ / トーストの通知] トーストを表示したとき、読み上げで通知する（通知のしかたは実装によって違うため、読み上げソフトで手で確かめる）', async () => {});

    test('[共通ルール アクセシビリティ / 確認ダイアログを開いたとき / 削除の確認] 削除の確認を開くと、最初のボタンの「キャンセル」にフォーカスを移す', async ({ page, api }) => {
      await open(page, api, draftEvent);
      await ui(page).del.click();
      await expect(ui(page).dialogCancel).toBeFocused();
    });

    test('[共通ルール アクセシビリティ / 確認ダイアログを閉じたとき / 削除の確認] 削除の確認を「キャンセル」で閉じると、「削除」ボタンにフォーカスを戻す', async ({ page, api }) => {
      await open(page, api, draftEvent);
      await ui(page).del.click();
      await ui(page).dialogCancel.click();
      await expect(ui(page).dialog).toBeHidden();
      await expect(ui(page).del).toBeFocused();
    });

    test('[共通ルール アクセシビリティ / Esc キー / 削除の確認] 削除の確認で Esc キーを押すと、閉じて画面に残る', async ({ page, api }) => {
      await open(page, api, draftEvent);
      await ui(page).del.click();
      await expect(ui(page).dialog).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(ui(page).dialog).toBeHidden();
      await expect(page).toHaveURL(new RegExp(`${pathOf(draftEvent)}$`));
    });

    test('[共通ルール アクセシビリティ / Tab キーの順序] 「← 一覧へ戻る」から Tab キーを押すと、「編集」「削除」の順にフォーカスが移る', async ({ page, api }) => {
      await open(page, api, draftEvent);
      const u = ui(page);
      await u.back.focus();
      await page.keyboard.press('Tab');
      await expect(u.edit).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(u.del).toBeFocused();
    });
  });

  test.describe('遷移', () => {
    test('[「← 一覧へ戻る」リンク押下] 同じタブでイベント一覧へ遷移する', async ({ page, api }) => {
      await open(page, api, draftEvent);
      api.allowUnmockedCalls();
      await ui(page).back.click();
      await toList(page);
    });

    test('[「編集」ボタン押下] 同じタブで、この eventId のイベント編集へ遷移する', async ({ page, api }) => {
      await open(page, api, draftEvent);
      api.allowUnmockedCalls();
      await ui(page).edit.click();
      await expect(page).toHaveURL(new RegExp(`/events/${draftEvent.id}/edit$`));
    });
  });

  test.describe('閲覧権限', () => {
    const viewerCases = [
      { role: 'admin' as const },
      { role: 'organizer' as const },
      { role: 'member' as const },
    ];
    for (const c of viewerCases) {
      test(`[閲覧権限 ${c.role}] ${c.role} は、公開中のイベントの詳細を開ける`, async ({ page, api }) => {
        await open(page, api, publishedEvent, users[c.role]);
        await expect(ui(page).heading(publishedEvent.title)).toBeVisible();
        await expect(page).toHaveURL(new RegExp(`${pathOf(publishedEvent)}$`));
      });
    }
  });
});
