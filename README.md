# pi-composio

A [pi](https://github.com/earendil-works/pi) extension that bridges pi's native tool system to [Composio](https://composio.dev)'s 1,000+ app integrations.

**One extension. 6 tools. 1,000+ apps.** No MCP required.

---

## How it works

Instead of writing separate MCP servers for Gmail, Slack, GitHub, Notion, etc., pi-composio registers **6 meta tools** that let pi search, connect, and execute across 1,000+ apps through a single Composio session.

The agent's tool list stays lean (~1,200 tokens for all schemas), and individual app tools are discovered on demand through `composio_search`.

### Available tools

| Tool | What it does |
|---|---|
| `composio_search` | Search 1,000+ app tools by describing your task in natural language |
| `composio_get_schema` | Get the full input schema for a specific tool slug |
| `composio_execute` | Execute an app tool (send email, create issue, post message, etc.) |
| `composio_connect` | Get an OAuth link to connect a new app account |
| `composio_workbench` | Run Python code in Composio's sandboxed workbench |
| `composio_bash` | Run shell commands in Composio's remote sandbox |

### Tool flow

```
You: "check my unread gmail"

1. pi calls composio_search("check unread gmail")
   → returns GMAIL_FETCH_MESSAGES schema + "connected" status

2. pi calls composio_execute("GMAIL_FETCH_MESSAGES", { query: "is:unread" })
   → returns your unread emails

3. pi reads the results to you
```

Only 6 tool schemas sit in context. Individual app schemas only arrive when the agent explicitly fetches them.

---

## Setup

### 1. Get a Composio API key

Go to [composio.dev](https://composio.dev) → Sign up → Copy your API key from Settings.

The **Totally Free** plan includes 20,000 tool calls/month — plenty for personal use.

### 2. Connect your apps

```bash
# Install the Composio CLI
curl -fsSL https://composio.dev/install | bash

# Sign in and connect apps
composio login
composio add gmail    # opens browser → click Allow
composio add github   # same
composio add slack    # same
```

You can also connect apps through [Composio's dashboard](https://app.composio.dev).

### 3. Install the extension

```bash
# Clone or copy the extension directory
cp -r pi-composio ~/.pi/agent/extensions/composio/

# Or use it directly with -e
COMPOSIO_API_KEY=your_key_here pi -e ./src/index.ts
```

### 4. Set your API key

Drop it in a config file (recommended):

```bash
mkdir -p ~/.config/pi-composio
echo '{"apiKey": "sk-..."}' > ~/.config/pi-composio/config.json
```

Or set an environment variable:

```bash
export COMPOSIO_API_KEY=your_key_here
```

Resolution order: `~/.config/pi-composio/config.json` → `~/.pi-composio.json` → `COMPOSIO_API_KEY` env var.

### 5. Start using it

```bash
pi
# "send an email to myself saying the extension is working"
```

---

## Architecture

```
Pi Agent        pi-composio Extension          Composio Backend      SaaS APIs
 │                      │                            │                  │
 │  "send email..."     │                            │                  │
 │── composio_search ──►│                            │                  │
 │                      │── POST execute_meta ──────►│                  │
 │                      │◁── [GMAIL_SEND_EMAIL] ────│                  │
 │                      │                            │                  │
 │── composio_execute ─►│                            │                  │
 │                      │── POST execute ──────────►│                  │
 │                      │                            │── Gmail API ───►│
 │                      │                            │◁── response ───│
 │                      │◁── result ────────────────│                  │
 │◁── "Email sent!" ───│                            │                  │
```

### Design decisions

| Decision | Choice | Why |
|---|---|---|
| Integration mode | **SDK** (`@composio/core`) | Pi doesn't do MCP. SDK is TypeScript-native, no JSON-RPC translation layer. |
| Tool pattern | **6 meta tools** | Composio's native architecture. Token-efficient (~1,200 tokens for all schemas vs 10K+ for 50 app tools). |
| Meta tool execution | **REST API** (`execute_meta`) | Direct control, no provider wrapping needed. |
| App tool execution | **SDK** (`executeSessionTool`) | Handles auth injection and schema translation. |
| Session init | **`composio.create()`** | Creates a server-side tool router session with connected accounts. |
| Auth | **Environment variable** | `COMPOSIO_API_KEY` in env or pi config. Simple, no extra auth prompts. |

---

## Development

```bash
# Install dependencies
npm install

# Run checks
make fmt        # Format with Prettier
make lint       # Lint with ESLint
make typecheck  # TypeScript type check
make check      # All of the above
make security   # npm audit
make ci         # Full pipeline (check + security)
```

### Project structure

```
pi-composio/
├── src/
│   └── index.ts        # Extension entry point (6 tools + session init)
├── .vscode/
│   ├── LOOP.md          # Local workflow (not pushed)
│   ├── SPEC.md           # Specification (not pushed)
│   └── PLAN-TODO.md      # Plan tracker (not pushed)
├── package.json
├── tsconfig.json
├── eslint.config.js
├── .prettierrc
├── Makefile
└── README.md
```

---

## Pricing

Composio pricing (as of 2026):

| Plan | Tool calls/month | Price |
|---|---|---|
| Totally Free | 20K (incl 1K premium) | $0 |
| Ridiculously Cheap | 200K | $29/mo |
| Serious Business | 2M | $229/mo |
| Enterprise | Custom | Custom |

Premium tools (search APIs, code sandboxes, ML inference) cost ~3x a standard tool call.

---

## License

MIT
