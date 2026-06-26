# pi-composio — Architecture

Bridges pi's tool system to Composio's 1,000+ app integrations via the TypeScript SDK.

---

## Overview

Pi doesn't support MCP. Composio provides two integration paths: MCP and a TypeScript SDK (`@composio/core`). This extension uses the SDK directly — no MCP server process, no JSON-RPC translation layer, in-process with pi.

---

## Architecture

The request chain:

| Step | From → To | Method |
|---|---|---|
| 1 | Pi Agent → pi-composio | Agent calls a meta tool |
| 2 | pi-composio → Composio Backend | Meta tools: `POST /execute_meta` ; App tools: `executeSessionTool()` |
| 3 | Composio Backend → SaaS API | Injects stored OAuth token, proxies request |
| 4 | SaaS API → pi-composio | Response flows back through Composio |
| 5 | pi-composio → Pi Agent | Renders result in TUI |

Two execution paths:
- **Meta tools** (search, schema, connect, workbench, bash) — REST `execute_meta` endpoint
- **App tools** (Gmail, GitHub, etc.) — SDK `executeSessionTool()` with OAuth injection

---

## Session Model

A session ties a user identity to their connected accounts. On startup:

```typescript
const composio = new Composio({ apiKey });
const session = await composio.create(config.userId);
```

Composio scopes OAuth connections to user IDs. The platform auto-generates a user ID (`usr_...`) when apps are connected. The extension reads this ID from `config.json` — without the correct user ID, sessions are blank slates.

### User ID Deep-Dive

Platform-connected apps show as "active" on composio.dev but are invisible to SDK sessions created under a different user ID.

**Root cause:** Composio's SDK `composio.create("pi-user")` creates sessions for a different identity than the one the platform used when the user connected apps through the dashboard. Connections don't cross user boundaries. In MCP mode this is invisible — the MCP endpoint has the right user ID baked in. In SDK mode, we're responsible for user identity.

**Solution:** User copies their ID from dashboard → Users. Extension passes it to `composio.create()`. Platform connections are then visible via the session precedence chain.

---

## Design Decisions

| Decision | Choice | Why |
|---|---|---|
| Integration mode | SDK (`@composio/core`) | Pi doesn't do MCP. TypeScript-to-TypeScript, no JSON-RPC overhead. |
| Tool pattern | 6 meta tools | Composio's native architecture. ~1,200 tokens vs. 10K+ for direct tools. |
| Meta tool execution | REST `execute_meta` | Direct control over parameter names. |
| App tool execution | SDK `executeSessionTool()` | Handles OAuth injection and schema translation. |
| Parameter names | Match backend exactly | `queries`, `tool_slugs`, `toolkits`, `code_to_execute` must match what the API expects or double-validation errors occur. |
| Auth | `config.json` with apiKey + userId | One-time setup. No env var support for userId. |

---

## Meta Tool Parameter Names

Parameter names must match the Composio backend's `execute_meta` expectations exactly.

| Tool | Parameter | Type |
|---|---|---|
| `composio_search` | `queries` | `string[]` |
| `composio_get_schema` | `tool_slugs` | `string[]` |
| `composio_execute` | `tool`, `arguments` | `string`, `any` |
| `composio_connect` | `toolkits` | `string[]` |
| `composio_workbench` | `code_to_execute` | `string` |
| `composio_bash` | `command` | `string` |

---

## Future: Push-Based Agent

Currently pull-based — user types, agent acts. Composio Triggers (e.g., `gmail.message.new`, `github.issue.opened`) enable a push-based model where external events drive agent actions. Combined with pi's `--mode rpc`, a watcher daemon could bridge Composio webhooks into pi prompts. This extension provides the tools layer; a separate watcher layer would provide the event layer.
