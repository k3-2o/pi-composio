# pi-composio — Architecture Document

A [pi](https://github.com/earendil-works/pi) extension that bridges pi's native tool system to [Composio](https://composio.dev)'s 1,000+ app integrations via the TypeScript SDK.

---

## Overview

Pi doesn't support the Model Context Protocol (MCP). Composio provides two integration paths: MCP (for clients like Claude Code and Cursor) and a TypeScript SDK (`@composio/core`). This extension uses the SDK to register Composio's 6 meta tools as native pi tools, giving pi access to Gmail, Slack, GitHub, Notion, Linear, Stripe, and 1,000+ other services.

**One extension. Six tools. One thousand apps.**

---

## Architecture

```
Pi Agent                  pi-composio                    Composio Backend      SaaS APIs
 │                            │                               │                    │
 │  "send email to bob"       │                               │                    │
 │── composio_search ─────────►                               │                    │
 │                            │── POST /execute_meta ────────►                    │
 │                            │◁── [GMAIL_SEND_EMAIL] ───────│                    │
 │                            │                               │                    │
 │── composio_execute ───────►                               │                    │
 │                            │── executeSessionTool() ──────►                    │
 │                            │                               │── Gmail API ──────►│
 │                            │                               │◁── response ──────│
 │                            │◁── result ───────────────────│                    │
 │◁── "Email sent" ──────────│                               │                    │
```

Two execution paths:
- **Meta tools** (search, schema, connect, workbench, bash) use the REST `execute_meta` endpoint directly
- **App tools** (Gmail, GitHub, etc.) use the SDK's `executeSessionTool()` which handles OAuth injection

---

## Tool Reference

Six meta tools registered in pi's context (~1,200 tokens total). Individual app tools are discovered on demand via `composio_search`.

| Tool | Meta Tool | Purpose |
|---|---|---|
| `composio_search` | `COMPOSIO_SEARCH_TOOLS` | Natural language tool search across 1,000+ apps |
| `composio_get_schema` | `COMPOSIO_GET_TOOL_SCHEMAS` | Get input schema for a specific tool slug |
| `composio_execute` | SDK `executeSessionTool()` | Execute an app tool with OAuth injection |
| `composio_connect` | `COMPOSIO_MANAGE_CONNECTIONS` | Generate OAuth link to connect a new app |
| `composio_workbench` | `COMPOSIO_REMOTE_WORKBENCH` | Run Python in Composio's sandboxed environment |
| `composio_bash` | `COMPOSIO_REMOTE_BASH_TOOL` | Run shell commands in Composio's sandbox |

### Tool Flow

```
User: "check my unread gmail"

1. composio_search(["check unread gmail"])
   → returns GMAIL_FETCH_MESSAGES schema + connection status

2. composio_execute("GMAIL_FETCH_MESSAGES", { query: "is:unread", maxResults: 5 })
   → returns email data from Gmail API
```

---

## Session Model

A session ties a user identity to their connected accounts. On startup:

```typescript
const composio = new Composio({ apiKey });
const userId = config.userId ?? "pi-user";
const session = await composio.create(userId);
```

**User ID scoping:** Composio stores OAuth connections under user IDs. The platform's "Switch to Connect" portal auto-generates a user ID (e.g., `usr_9x2kLm7`). The extension reads this ID from `config.json` to create sessions that automatically see all platform-connected apps. Without the correct user ID, sessions are blank slates with no connections visible.

---

## Configuration

`config.json` in the extension directory (`.gitignore`'d):

```json
{
  "apiKey": "sk-...",
  "userId": "usr_..."
}
```

Resolution:
1. `config.json` in the extension directory
2. `COMPOSIO_API_KEY` environment variable (fallback only, no userId support)

---

## Error Handling

Two custom error classes:

- **`ComposioSessionError`** — session not initialized (missing API key, failed creation)
- **`ComposioApiError`** — backend returned 4xx/5xx (includes status code and response body)

All six tools wrap execution in `tryOrError()` which catches both and returns user-friendly messages. TUI rendering shows ⚠️ for errors and ✓ for successes.

---

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Integration mode | SDK (`@composio/core`) | Pi doesn't do MCP. TypeScript-to-TypeScript, no JSON-RPC overhead. |
| Tool pattern | 6 meta tools | Composio's native architecture. ~1,200 tokens vs. 10K+ for direct tools. |
| Meta tool execution | REST `execute_meta` endpoint | Direct control over parameter names, no provider wrapping. |
| App tool execution | SDK `executeSessionTool()` | Handles OAuth injection, schema translation, error mapping. |
| Parameter names | Match backend exactly | `queries`, `tool_slugs`, `toolkits`, `code_to_execute`: must match what the API expects or double-validation errors occur. |
| Auth | `config.json` with apiKey + userId | User ID from dashboard → Users. One-time setup. |
| CLI dependency | None | User connects apps on composio.dev dashboard. No CLI required. |

---

## Meta Tool Parameter Names

Critical: the parameter names in pi's tool schemas must match the Composio backend's `execute_meta` expectations exactly. Mismatches cause confusing double-validation errors (local schema says `task` is required, backend says `queries` is required).

| Tool | Correct parameter | Type |
|---|---|---|
| `composio_search` | `queries` | `string[]` |
| `composio_get_schema` | `tool_slugs` | `string[]` |
| `composio_execute` | `tool`, `arguments` | `string`, `any` |
| `composio_connect` | `toolkits` | `string[]` |
| `composio_workbench` | `code_to_execute` | `string` |
| `composio_bash` | `command` | `string` |

---

## User ID Deep-Dive

### Problem

Platform-connected apps (Gmail, GitHub) show as "active" on composio.dev but are invisible to SDK sessions. `composio_execute` returns *"No active connection found for toolkit(s) 'gmail' in this session."*

### Root Cause

Composio scopes connected accounts to user IDs. The dashboard's "Switch to Connect" portal auto-generates a user ID (`usr_9x2kLm7`) and stores connections under it. The SDK's `composio.create("pi-user")` creates sessions for a different user. Connections don't cross user boundaries.

In MCP mode this is invisible — the MCP endpoint is a stable session with the right user ID baked in. In SDK mode, we're responsible for user identity on every session creation.

### Approaches That Don't Work

- `connectedAccounts.list()` — returns account IDs but never exposes user IDs
- `connectedAccounts.get(accountId)` — full account details, still no user ID field
- Disk-based session persistence — adds complexity for no gain
- Per-session OAuth links — user already authed on platform

### Solution

User finds their ID at **dashboard.composio.dev → Users** (format: `usr_9x2kLm7`). Places it in `config.json` as `"userId"`. Extension reads it and creates sessions for the correct user. All platform connections automatically visible via the session precedence chain.

---

## Future: Push-Based Agent

Currently pull-based — user types, agent acts. Composio Triggers (e.g., `gmail.message.new`, `github.issue.opened`) enable a push-based model where external events drive agent actions. Combined with pi's `--mode rpc` and SDK for programmatic control, a watcher daemon could bridge Composio webhooks into pi prompts.

This extension provides the **tools layer** (pi can act on services). A separate **watcher layer** would provide the **event layer** (pi reacts to events automatically).

---

## Project Structure

```
pi-composio/
├── 
│ └── index.ts              # Extension entry point (~460 lines)
├── docs/
│   └── ARCHITECTURE.md        # This document
├── package.json               # @composio/core dependency + dev tooling
├── tsconfig.json              # Strict TypeScript, NodeNext modules
├── eslint.config.js           # Flat config, typescript-eslint
├── .prettierrc                # Consistent formatting
├── Makefile                   # fmt / lint / typecheck / check / security / ci
├── config.json                # API key + user ID (gitignored)
└── README.md                  # User-facing setup guide
```

---

## Development

```bash
make fmt        # Prettier
make lint       # ESLint
make typecheck  # tsc --noEmit
make check      # All three above
make security   # npm audit
make ci         # Full pipeline
```

---

## Dependencies

| Package | Version | Purpose |
|---|---|---|
| `@composio/core` | ^0.10.0 | Composio TypeScript SDK |
| `typebox` | (pi-supplied) | Tool parameter schemas |
| `@earendil-works/pi-coding-agent` | (pi-supplied) | Extension types |
| `@earendil-works/pi-tui` | (pi-supplied) | TUI rendering components |

Dev tooling: `typescript` 5.7+, `eslint` 9.x, `typescript-eslint` 8.x, `prettier` 3.x.
