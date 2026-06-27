# pi-composio

A [pi](https://github.com/earendil-works/pi) extension that bridges pi's native tool system to [Composio](https://composio.dev)'s 1,000+ app integrations.

**One extension. 6 tools. 1,000+ apps.** No MCP required.

Depends on [Composio's TypeScript SDK](https://www.npmjs.com/package/@composio/core) (`@composio/core`).

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

Need an app you haven't connected yet? Use `composio_connect` in pi — it generates an OAuth link so you can authorise on the spot without leaving the chat.

---

## Setup

### 1. Get an API key

Go to the [Composio dashboard](https://dashboard.composio.dev) → Sign up → Copy your API key from **Settings**.

They offer a very generous free tier.

### 2. Connect your apps and get your user ID

Open [Composio's dashboard](https://dashboard.composio.dev) → **Toolkits** in the sidebar → pick your app → **Setup auth config** → authorize via API key or OAuth.

Once active, go to **Users** in the sidebar → copy your **user ID** (looks like `pg-...`) — you'll need it for config.

### 3. Install the extension

**Via git:**

```bash
pi install git:github.com/k3-2o/pi-composio.git
```

**Via npm** (once published):

```bash
pi install npm:@k3_2o/pi-composio
```

### 4. Create your config

Drop your key and user ID in the home directory config path:

```bash
mkdir -p ~/.config/pi-composio
echo '{"apiKey": "ak_...", "userId": "pg-..."}' > ~/.config/pi-composio/config.json
```

Config is read from `~/.config/pi-composio/config.json` first, then `~/.pi-composio.json`, then the extension directory — so your credentials survive any `pi update`.

The user ID links your session to the apps you connected on the dashboard — without it, pi-composio won't find your connected accounts.

---

## License

MIT
