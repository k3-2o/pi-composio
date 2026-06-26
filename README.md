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
| `composio_search` | Find tools in 1,000+ app catalog |
| `composio_get_schema` | Inspect tool schemas |
| `composio_execute` | Run any connected app tool |
| `composio_connect` | OAuth link for new apps |
| `composio_workbench` | Python sandbox (remote) |
| `composio_bash` | Shell in remote sandbox |

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
# Clone directly to pi's extension directory:
git clone https://github.com/your-username/pi-composio ~/.pi/agent/extensions/composio/
cd ~/.pi/agent/extensions/composio && npm install

# Or add to settings.json for auto-install:
# ~/.pi/agent/settings.json
# {
#   "packages": [
#     "git:github.com/your-username/pi-composio@v0.1.0"
#   ]
# }
```

### 4. Set your API key

Drop your key in `config.json` inside the extension directory:

```bash
echo '{"apiKey": "sk-..."}' > ~/.pi/agent/extensions/composio/config.json
```

Or set an environment variable:

```bash
export COMPOSIO_API_KEY=your_key_here
```

Resolution: `config.json` (extension dir) → `COMPOSIO_API_KEY` env var.

### 5. Start using it

```bash
pi
/reload
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
├── index.ts             # Extension entry point (6 tools + session init)
├── docs/
│   └── ARCHITECTURE.md  # Architecture document
├── package.json
├── tsconfig.json
├── eslint.config.js
├── .prettierrc
├── Makefile
├── .gitignore
├── config.json          # Your API key (gitignored)
└── README.md
```

## Dependencies

| Package | Role |
|---|---|
| `@composio/core` | Composio TypeScript SDK |
| `@earendil-works/pi-coding-agent` | Extension types (pi-provided) |
| `@earendil-works/pi-tui` | TUI components (pi-provided) |
| `typebox` | Tool parameter schemas (pi-provided) |

Pi provides `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, and `typebox` at runtime — you don't install them separately.

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
