# e2e-testing プラグイン

自然言語（日本語）で書いたシナリオを、AI が **Playwright MCP** でデプロイ環境に対して実行する
E2E テスト。テストコードは書かない。**画面単位**で扱い、次の 3 skill で回す。

| skill（プラグイン導入後の呼び名）          | 役割                                                         |
| ------------------------------------------ | ------------------------------------------------------------ |
| `/e2e-testing:list-e2e-screens`            | コードのルーティングを読み、画面一覧 `e2e/screens.md` を作る |
| `/e2e-testing:write-e2e-scenario <screen>` | 画面ごとに調査結果 MD とシナリオ MD を書く                   |
| `/e2e-testing:run-e2e-scenario <screen>`   | シナリオを Playwright MCP で実行し、結果とスクショを残す     |

> プラグインの skill は `プラグイン名:skill名` で名前空間化される。自然言語（「画面一覧を出して」等）でも起動する。

## 同梱している Playwright MCP

このプラグインは `.mcp.json` で Playwright MCP サーバー（`@playwright/mcp`）を同梱している。
インストール時に MCP サーバーの承認が一度求められる。別途 Playwright MCP を入れる必要はない。

- 前提: `npx`（Node.js）が使えること。初回は `@playwright/mcp` が取得される。
- `run-e2e-scenario` が使うツールは `mcp__plugin_e2e-testing_playwright__browser_*` に名前空間化される。
  もし「tool not found」が出る場合は、実際の名前空間が `mcp__plugin_<導入したプラグイン名>_playwright__...`
  になっていないか確認する（このプラグイン名を変えた場合に該当）。

## 成果物の置き場（利用先プロジェクト）

skill は利用先プロジェクトの `e2e/` に成果物を作る。

```
e2e/
  screens.md            # list-e2e-screens
  research/<screen>.md  # write-e2e-scenario
  scenarios/<screen>.md # write-e2e-scenario → run-e2e-scenario が読む
  results/              # run-e2e-scenario（スクショ含む）
```

## 認証が要る画面

ログインが必要な画面は、実行時に**ユーザーへログインを依頼する**（認証情報は AI が入力しない）。
用意できない場合、そのシナリオは BLOCKED として記録される。
