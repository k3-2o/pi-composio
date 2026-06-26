import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, AgentToolResult } from "@earendil-works/pi-coding-agent";
import { Theme } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Text } from "@earendil-works/pi-tui";
import { Composio } from "@composio/core";

const COMPOSIO_BASE = "https://backend.composio.dev/api/v3.1";
const PI_USER_ID = "pi-user";

// ── Config resolution ─────────────────────────────────────────────────

const EXTENSION_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const CONFIG_PATH = join(EXTENSION_DIR, "config.json");

interface Config {
  apiKey?: string;
}

function resolveApiKey(): string {
  // 1. Check config.json in the extension directory
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = readFileSync(CONFIG_PATH, "utf-8");
      const config = JSON.parse(raw) as Config;
      if (config.apiKey) return config.apiKey;
    }
  } catch {
    // skip unreadable config
  }

  // 2. Fallback to environment variable
  return process.env.COMPOSIO_API_KEY ?? "";
}

function configHint(): string {
  return `Create ${CONFIG_PATH} with:
{
  "apiKey": "your-composio-api-key"
}`;
}

// ── Error classes ─────────────────────────────────────────────────────

class ComposioSessionError extends Error {
  constructor(action: string) {
    super(`Composio session not initialized. ` + configHint() + ` Action attempted: ${action}`);
    this.name = "ComposioSessionError";
  }
}

class ComposioApiError extends Error {
  constructor(
    public status: number,
    slug: string,
    body: string,
  ) {
    super(`Composio API error (${status}) on ${slug}: ${body.slice(0, 200)}`);
    this.name = "ComposioApiError";
  }
}

// ── API helpers ───────────────────────────────────────────────────────

/** Execute a Composio meta tool via the REST execute_meta endpoint. */
async function executeMetaTool(
  apiKey: string,
  sessionId: string,
  slug: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const url = `${COMPOSIO_BASE}/tool_router/session/${sessionId}/execute_meta`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({ slug, arguments: args }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new ComposioApiError(res.status, slug, text);
  }
  return res.json();
}

/** Guard: throw if session not initialized. */
function guardSession(
  sessionId: string,
  composio: Composio | null,
  action: string,
): asserts sessionId is string {
  if (!sessionId || !composio) throw new ComposioSessionError(action);
}

type TextContent = { type: "text"; text: string };
type Details = { error?: string };

/** Wrap an async operation with error handling for tool execute. */
async function tryOrError(fn: () => Promise<unknown>): Promise<AgentToolResult<Details>> {
  try {
    const data = await fn();
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      details: {},
    };
  } catch (err) {
    const message =
      err instanceof ComposioSessionError
        ? err.message
        : err instanceof ComposioApiError
          ? `Composio returned an error: ${err.message}\n\nTry reconnecting the app with composio_connect or check your API key.`
          : err instanceof Error
            ? err.message
            : String(err);
    return {
      content: [{ type: "text", text: message }],
      details: { error: message },
    };
  }
}

// ── TUI rendering helpers ─────────────────────────────────────────────

function renderCallLine(toolLabel: string, valueText: string, theme: Theme): Text {
  const preview = valueText.length > 80 ? valueText.slice(0, 77) + "..." : valueText;
  return new Text(
    theme.fg("toolTitle", theme.bold(toolLabel + " ")) + theme.fg("dim", `"${preview}"`),
    0,
    0,
  );
}

function renderResultLine(toolLabel: string, result: AgentToolResult<Details>, theme: Theme): Text {
  if (result.details?.error) {
    return new Text(
      theme.fg("warning", "⚠️") +
        " " +
        theme.fg("dim", toolLabel + " failed — " + result.details.error),
      0,
      0,
    );
  }
  const text = result.content?.find((c): c is TextContent => c.type === "text")?.text ?? "";
  const preview = text.length > 100 ? text.slice(0, 97) + "..." : text;
  return new Text(
    theme.fg("success", "✓") + " " + theme.fg("dim", toolLabel + " " + preview),
    0,
    0,
  );
}

// ── Tool definitions ──────────────────────────────────────────────────

interface ExecuteParams {
  tool: string;
  arguments: unknown;
}

interface CommandParams {
  command: string;
}

// ── Extension entry point ─────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let apiKey = "";
  let sessionId = "";
  let composio: Composio | null = null;

  // ── Session Init ──────────────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    apiKey = resolveApiKey();
    if (!apiKey) {
      ctx.ui.notify("pi-composio: " + configHint(), "error");
      return;
    }

    try {
      composio = new Composio({ apiKey });
      const session = await composio.create(PI_USER_ID);
      sessionId = session.sessionId;
      ctx.ui.notify("pi-composio: session ready", "info");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error creating session";
      ctx.ui.notify(`pi-composio: session init failed — ${msg}`, "error");
    }
  });

  // ── Tool 1: composio_search ──────────────────────────────────────

  pi.registerTool({
    name: "composio_search",
    label: "🔍 Search Tools",
    description: `Search Composio's catalog of 1,000+ app tools by describing your task in natural language.

Returns matching tool slugs, their input schemas, and whether each app is connected.
Use the results with composio_execute to run the tool.

Examples:
  "find my latest github issues"
  "send an email to bob about the deploy"
  "list open pull requests in composiohq/composio"`,
    parameters: Type.Object({
      queries: Type.Array(Type.String(), {
        description:
          "Natural language descriptions of what you want to do. Use a single query as an array: ['find my latest github issues']",
      }),
    }),
    renderCall(args: { queries: string[] }, theme: Theme) {
      return renderCallLine("🔍 Search", args.queries?.join(", ") ?? "", theme);
    },
    renderResult(
      result: AgentToolResult<Details>,
      _options: { expanded: boolean; isPartial: boolean },
      theme: Theme,
    ) {
      return renderResultLine("🔍 Search", result, theme);
    },
    async execute(
      _toolCallId: string,
      params: { queries: string[] },
    ): Promise<AgentToolResult<Details>> {
      return tryOrError(async () => {
        guardSession(sessionId, composio, "composio_search");
        return executeMetaTool(apiKey, sessionId, "COMPOSIO_SEARCH_TOOLS", {
          queries: params.queries,
        });
      });
    },
  });

  // ── Tool 2: composio_get_schema ─────────────────────────────────

  pi.registerTool({
    name: "composio_get_schema",
    label: "📋 Get Schema",
    description: `Get the full input schema for one or more tool slugs.

Use after composio_search to see exactly what parameters a tool expects.
The schema shows required vs optional parameters, types, and descriptions.

Example: ["GMAIL_SEND_EMAIL"] shows { to, subject, body } parameters.`,
    parameters: Type.Object({
      tool_slugs: Type.Array(Type.String(), {
        description:
          "Tool slugs from composio_search results, e.g. ['GMAIL_SEND_EMAIL'] or ['GITHUB_LIST_ISSUES']",
      }),
    }),
    renderCall(args: { tool_slugs: string[] }, theme: Theme) {
      return renderCallLine("📋 Schema", args.tool_slugs?.join(", ") ?? "", theme);
    },
    renderResult(
      result: AgentToolResult<Details>,
      _options: { expanded: boolean; isPartial: boolean },
      theme: Theme,
    ) {
      return renderResultLine("📋 Schema", result, theme);
    },
    async execute(
      _toolCallId: string,
      params: { tool_slugs: string[] },
    ): Promise<AgentToolResult<Details>> {
      return tryOrError(async () => {
        guardSession(sessionId, composio, "composio_get_schema");
        return executeMetaTool(apiKey, sessionId, "COMPOSIO_GET_TOOL_SCHEMAS", {
          tool_slugs: params.tool_slugs,
        });
      });
    },
  });

  // ── Tool 3: composio_execute ────────────────────────────────────

  pi.registerTool({
    name: "composio_execute",
    label: "⚡ Execute",
    description: `Execute an app tool by its slug with the required arguments.

Use after:
1. composio_search — find the right tool for your task
2. composio_get_schema — understand what parameters it expects
3. composio_execute — run it with the correct arguments

The tool must have been connected via composio_connect first.`,
    parameters: Type.Object({
      tool: Type.String({
        description: "Tool slug to execute, e.g. GMAIL_SEND_EMAIL or GITHUB_LIST_ISSUES",
      }),
      arguments: Type.Any({
        description:
          "JSON object with the tool's input parameters. " +
          "Use composio_get_schema to see the expected format.",
      }),
    }),
    renderCall(args: ExecuteParams, theme: Theme) {
      return renderCallLine("⚡ Execute", args.tool, theme);
    },
    renderResult(
      result: AgentToolResult<Details>,
      _options: { expanded: boolean; isPartial: boolean },
      theme: Theme,
    ) {
      return renderResultLine("⚡ Execute", result, theme);
    },
    async execute(_toolCallId: string, params: ExecuteParams): Promise<AgentToolResult<Details>> {
      return tryOrError(async () => {
        guardSession(sessionId, composio, "composio_execute");
        const result = await composio!.tools.executeSessionTool(params.tool, {
          sessionId,
          arguments: params.arguments as Record<string, unknown>,
        });
        return result;
      });
    },
  });

  // ── Tool 4: composio_connect ────────────────────────────────────

  pi.registerTool({
    name: "composio_connect",
    label: "🔗 Connect App",
    description: `Get an OAuth link to connect a new app account.

After authorization, the app becomes available for composio_search and composio_execute.
You only need to connect an app once — Composio persists the OAuth token.

Common apps: gmail, slack, github, notion, linear, stripe, jira, discord, figma, salesforce`,
    parameters: Type.Object({
      toolkits: Type.Array(Type.String(), {
        description: "App name(s) to connect, e.g. ['gmail'], ['slack'], ['github', 'notion']",
      }),
    }),
    renderCall(args: { toolkits: string[] }, theme: Theme) {
      return renderCallLine("🔗 Connect", args.toolkits?.join(", ") ?? "", theme);
    },
    renderResult(
      result: AgentToolResult<Details>,
      _options: { expanded: boolean; isPartial: boolean },
      theme: Theme,
    ) {
      return renderResultLine("🔗 Connect", result, theme);
    },
    async execute(
      _toolCallId: string,
      params: { toolkits: string[] },
    ): Promise<AgentToolResult<Details>> {
      return tryOrError(async () => {
        guardSession(sessionId, composio, "composio_connect");
        return executeMetaTool(apiKey, sessionId, "COMPOSIO_MANAGE_CONNECTIONS", {
          toolkits: params.toolkits,
        });
      });
    },
  });

  // ── Tool 5: composio_workbench ──────────────────────────────────

  pi.registerTool({
    name: "composio_workbench",
    label: "🖥️ Workbench",
    description: `Run Python code in Composio's sandboxed workbench environment.

The workbench shares the session's connected accounts, so you can:
- Process and transform tool responses
- Run bulk operations across connected apps
- Chain multiple tool calls together
- Test API requests before committing to them

Results and variables persist across calls within the same session.`,
    parameters: Type.Object({
      code_to_execute: Type.String({
        description: "Python code to execute in the workbench sandbox",
      }),
    }),
    renderCall(args: { code_to_execute: string }, theme: Theme) {
      return renderCallLine("🖥️ Workbench", args.code_to_execute, theme);
    },
    renderResult(
      result: AgentToolResult<Details>,
      _options: { expanded: boolean; isPartial: boolean },
      theme: Theme,
    ) {
      return renderResultLine("🖥️ Workbench", result, theme);
    },
    async execute(
      _toolCallId: string,
      params: { code_to_execute: string },
    ): Promise<AgentToolResult<Details>> {
      return tryOrError(async () => {
        guardSession(sessionId, composio, "composio_workbench");
        return executeMetaTool(apiKey, sessionId, "COMPOSIO_REMOTE_WORKBENCH", {
          code_to_execute: params.code_to_execute,
        });
      });
    },
  });

  // ── Tool 6: composio_bash ───────────────────────────────────────

  pi.registerTool({
    name: "composio_bash",
    label: "💻 Remote Bash",
    description: `Run shell commands in Composio's remote sandbox environment.

Useful for:
- File operations and data processing
- Scripting and automation tasks
- Running CLI tools available in the sandbox
- Any command-line task that shouldn't run on your local machine

The sandbox is scoped to the session and persists state between calls.`,
    parameters: Type.Object({
      command: Type.String({
        description: "Shell command to execute in the remote sandbox",
      }),
    }),
    renderCall(args: CommandParams, theme: Theme) {
      return renderCallLine("💻 Bash", args.command, theme);
    },
    renderResult(
      result: AgentToolResult<Details>,
      _options: { expanded: boolean; isPartial: boolean },
      theme: Theme,
    ) {
      return renderResultLine("💻 Bash", result, theme);
    },
    async execute(_toolCallId: string, params: CommandParams): Promise<AgentToolResult<Details>> {
      return tryOrError(async () => {
        guardSession(sessionId, composio, "composio_bash");
        return executeMetaTool(apiKey, sessionId, "COMPOSIO_REMOTE_BASH_TOOL", {
          command: params.command,
        });
      });
    },
  });
}
