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

---

## Setup

### 1. Get an API key

Go to the [Composio dashboard](https://dashboard.composio.dev) → Sign up → Copy your API key from **Settings**.

They offer a very generous free tier — 20,000 tool calls/month, plenty for personal use.

### 2. Connect your apps and get your user ID

Open [Composio's dashboard](https://dashboard.composio.dev) → **Toolkits** in the sidebar → pick your app → **Setup auth config** → authorize via API key or OAuth.

Once active, go to **Users** in the sidebar → copy your **user ID** (looks like `usr_...`) — you'll need it for `config.json`.

### 3. Install the extension

**Via git:**

```bash
pi install git:github.com/k3-2o/pi-composio@v0.1.0
```

**Via npm** (once published):

```bash
pi install npm:@k3_2o/pi-composio
```

**Manual clone** (if you prefer keeping the source around):

```bash
git clone https://github.com/k3-2o/pi-composio ~/.pi/agent/extensions/composio/
cd ~/.pi/agent/extensions/composio && npm install
```

### 4. Set your API key

Drop your key and user ID in `config.json` inside the extension directory:

```bash
echo '{"apiKey": "sk-...", "userId": "usr_..."}' > ~/.pi/agent/extensions/composio/config.json
```

The user ID is what links your session to the apps you connected on the dashboard — without it, pi-composio won't find your connected accounts.

---

## Project structure

```
composio/            # In ~/.pi/agent/extensions/
├── index.ts         # 6 tools + session init
├── package.json     # @composio/core dependency
├── config.json      # Your API key + user ID (create this)
└── README.md
```

## Dependencies

| Package | Role |
|---|---|
| `@composio/core` | Composio TypeScript SDK |
| `@earendil-works/pi-coding-agent` | Extension types (pi-provided) |
| `@earendil-works/pi-tui` | TUI components (pi-provided) |
| `typebox` | Tool parameter schemas (pi-provided) |

Pi provides `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, and `typebox` at runtime.

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
