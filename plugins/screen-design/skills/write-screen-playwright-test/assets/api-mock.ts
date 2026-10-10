/**
 * 画面の Playwright テスト用の API モック。
 *
 * バックエンドとは通信せず、ブラウザからの API 通信（fetch / XHR）を横取りして、
 * テストごとに決めた応答を返す。
 *
 * - api.on('PUT /events/{eventId}', { status: 409, body: {...} }) で応答を登録する。
 *   同じ操作に後から登録したものが優先されるので、正常系を登録しておき、
 *   テストの中で異常系を上書きできる。
 * - 登録した操作が受け取ったリクエストは、戻り値の requests に記録される。
 *   設計書のリクエストの表（どの値をどのパラメータに入れるか）の検証に使う。
 * - 登録していない API への通信は失敗させ、テストの終わりに検出する。
 *   設計書に書いていない通信が紛れ込んでいないかを確かめるため。
 *
 * 横取りするのは fetch と XHR だけで、HTML・JS・CSS・画像は通す。API が画面と同じオリジンにあっても、
 * 画面の URL と API のパスが重なっていても使える。ブラウザのコンテキスト全体に仕掛けるので、
 * 別タブの通信も対象になる。Service Worker は止める（Service Worker 経由の通信は横取りできないため）。
 *
 * 前提: API はブラウザから呼ぶ（サーバー側で呼ぶ SSR は対象外）。認証は API のモックだけで通る。
 */
import { test as base, expect, type BrowserContext, type Route } from '@playwright/test';

/** 横取りする API のベース URL。アプリが API を呼ぶ先に合わせる（例: http://localhost:3000/api） */
export const API_BASE_URL = process.env.PLAYWRIGHT_TEST_API_BASE_URL ?? 'http://localhost:8080';

export type MockReply =
  | {
      status: number;
      /** オブジェクトや配列は JSON にして返す。文字列は content-type を指定すればそのまま返す */
      body?: unknown;
      headers?: Record<string, string>;
    }
  /** 通信エラー（レスポンスが返らない）を起こす */
  | { networkError: true };

export type CapturedRequest = {
  method: string;
  /** ベース URL を除いたパス（例: /events/e1）。末尾のスラッシュは除く */
  path: string;
  /** パスの {eventId} などに当たる値 */
  pathParams: Record<string, string>;
  query: URLSearchParams;
  /** body。JSON なら解析した値、それ以外は文字列、なければ undefined */
  body: any;
};

type ReplyFn = (req: CapturedRequest) => MockReply | Promise<MockReply>;

export type MockedOperation = {
  /** この操作が受け取ったリクエスト（古い順） */
  readonly requests: CapturedRequest[];
  /** 最後に受け取ったリクエスト。まだ呼ばれていなければ例外 */
  last(): CapturedRequest;
};

type Handler = MockedOperation & {
  method: string;
  pattern: RegExp;
  names: string[];
  reply: MockReply | ReplyFn;
};

const OPERATION = /^([A-Z]+)\s+(\/\S*)$/;

export class ApiMock {
  private readonly handlers: Handler[] = [];
  /** 登録していない API への通信（`GET /foo` の形）と、モックの中で起きた例外 */
  readonly unexpected: string[] = [];
  private unmockedAllowed = false;
  private readonly origin: string;
  private readonly basePath: string;

  private constructor(baseUrl: string) {
    const url = new URL(baseUrl);
    this.origin = url.origin;
    this.basePath = url.pathname.replace(/\/+$/, '');
  }

  static async setup(context: BrowserContext, baseUrl: string = API_BASE_URL): Promise<ApiMock> {
    if (!baseUrl) throw new Error('API のベース URL が空です。PLAYWRIGHT_TEST_API_BASE_URL を設定してください');
    const mock = new ApiMock(baseUrl);
    await context.route(
      (url) => mock.isApiUrl(url),
      (route) => mock.handle(route),
    );
    return mock;
  }

  /**
   * 操作の応答を登録する。
   * @param operation `メソッド パス` の形。パスは OpenAPI の書き方のまま（例: `PUT /events/{eventId}`）
   * @param reply 返す応答。リクエストを見て応答を変えたいとき、応答を遅らせたいときは関数にする
   */
  on(operation: string, reply: MockReply | ReplyFn): MockedOperation {
    const m = OPERATION.exec(operation.trim());
    if (!m) throw new Error(`操作の書き方が違います: "${operation}"（例: "GET /events/{eventId}"）`);
    const [, method, template] = m;
    const names: string[] = [];
    const source = normalizePath(template)
      .split(/(\{[^}/]+\})/)
      .map((part) => {
        const param = /^\{([^}/]+)\}$/.exec(part);
        if (param) {
          names.push(param[1]);
          return '([^/]+)';
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('');
    const requests: CapturedRequest[] = [];
    const handler: Handler = {
      method,
      pattern: new RegExp(`^${source}$`),
      names,
      reply,
      requests,
      last() {
        const req = requests.at(-1);
        if (!req) throw new Error(`${operation} はまだ呼ばれていません`);
        return req;
      },
    };
    this.handlers.push(handler);
    return handler;
  }

  /**
   * これ以降、登録していない API への通信を失敗扱いにしない（通信自体は失敗させる）。
   * 別の画面へ遷移するケースで、遷移先の画面が呼ぶ API を無視するために、遷移させる操作の直前に呼ぶ。
   */
  allowUnmockedCalls(): void {
    this.unmockedAllowed = true;
  }

  /** 登録していない API への通信がなかったことを確かめる */
  expectNoUnexpectedCalls(): void {
    expect(this.unexpected, 'モックしていない API が呼ばれた、またはモックの中で例外が起きた').toEqual([]);
  }

  private isApiUrl(url: URL): boolean {
    if (url.origin !== this.origin) return false;
    const bp = this.basePath;
    return bp === '' || url.pathname === bp || url.pathname.startsWith(`${bp}/`);
  }

  private async handle(route: Route): Promise<void> {
    const request = route.request();
    // fetch / XHR 以外（HTML・JS・CSS・画像など）は横取りしない
    if (!['fetch', 'xhr'].includes(request.resourceType())) {
      await route.fallback();
      return;
    }

    const method = request.method();
    const url = new URL(request.url());
    const path = normalizePath(url.pathname.slice(this.basePath.length));

    try {
      // 後から登録したものを優先する
      for (const handler of [...this.handlers].reverse()) {
        if (handler.method !== method) continue;
        const match = handler.pattern.exec(path);
        if (!match) continue;

        const captured: CapturedRequest = {
          method,
          path,
          pathParams: Object.fromEntries(handler.names.map((name, i) => [name, safeDecode(match[i + 1])])),
          query: url.searchParams,
          body: parseBody(request.postData()),
        };
        handler.requests.push(captured);

        const reply = typeof handler.reply === 'function' ? await handler.reply(captured) : handler.reply;
        if ('networkError' in reply) {
          await route.abort('failed');
          return;
        }
        await route.fulfill(toResponse(reply, request.headers()));
        return;
      }
    } catch (error) {
      this.unexpected.push(`${method} ${path} でモックの中で例外: ${String(error)}`);
      await route.abort('failed');
      return;
    }

    if (!this.unmockedAllowed) this.unexpected.push(`${method} ${path}`);
    await route.abort('failed');
  }
}

function toResponse(reply: { status: number; body?: unknown; headers?: Record<string, string> }, requestHeaders: Record<string, string>) {
  const headers: Record<string, string> = {
    'access-control-allow-origin': requestHeaders['origin'] ?? '*',
    'access-control-allow-credentials': 'true',
    ...reply.headers,
  };
  const noBody = reply.status === 204 || reply.status === 304 || reply.body === undefined;
  if (noBody) return { status: reply.status, headers, body: '' };

  const contentType = Object.entries(headers).find(([k]) => k.toLowerCase() === 'content-type')?.[1];
  if (typeof reply.body === 'string' && contentType && !contentType.includes('json')) {
    return { status: reply.status, headers, body: reply.body };
  }
  return {
    status: reply.status,
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(reply.body),
  };
}

/** 末尾のスラッシュを除き、空なら / にする */
function normalizePath(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseBody(raw: string | null): any {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** 応答を手動で返すための仕掛け。「保存中」「読み込み中」の表示を確かめるときに使う */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/**
 * api フィクスチャ付きの test。
 * - Service Worker を止める（Service Worker 経由の通信は横取りできないため）
 * - 各テストの終わりに、モックしていない API が呼ばれていないかを確かめる
 */
export const test = base.extend<{ api: ApiMock }>({
  serviceWorkers: 'block',
  api: async ({ context }, use) => {
    const api = await ApiMock.setup(context);
    await use(api);
    api.expectNoUnexpectedCalls();
  },
});

export { expect };
