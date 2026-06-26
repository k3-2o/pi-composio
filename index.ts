import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, AgentToolResult, Theme } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Text } from "@earendil-works/pi-tui";
import { Composio } from "@composio/core";

const COMPOSIO_BASE = "https://backend.composio.dev/api/v3.1";
const PI_USER_ID = "pi-user";

// ── Config resolution ─────────────────────────────────────────────────

const EXTENSION_DIR = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(EXTENSION_DIR, "config.json");

interface Config {
  apiKey?: string;
  userId?: string;
}

function resolveConfig(): Config {
  try {
    if (existsSync(CONFIG_PATH)) {
      return JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as Config;
    }
  } catch {
    /* skip unreadable config */
  }
  return {};
}

function resolveApiKey(): string {
  return resolveConfig().apiKey ?? process.env.COMPOSIO_API_KEY ?? "";
}

function configHint(): string {
  return `Create ${CONFIG_PATH} with:
{
  "apiKey": "your-composio-api-key",
  "userId": "your-user-id"
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

async function executeMetaTool(
  apiKey: string,
  sessionId: string,
  slug: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const url = `${COMPOSIO_BASE}/tool_router/session/${sessionId}/execute_meta`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({ slug, arguments: args }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new ComposioApiError(res.status, slug, text);
  }
  return res.json();
}

function guardSession(
  sessionId: string,
  composio: Composio | null,
  action: string,
): asserts sessionId is string {
  if (!sessionId || !composio) throw new ComposioSessionError(action);
}

type TextContent = { type: "text"; text: string };
type Details = { error?: string };

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

// ── Rendering primitives (matches built-in read/bash pattern) ─────────

/**
 * Collapse multi-line text into a single-line preview.
 * Replaces newlines/tabs with spaces, truncates to fit.
 */
function previewLine(text: string, maxLen = 60): string {
  const clean = text.replace(/[\n\r\t]+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 3) + "...";
}

/**
 * Build the "ctrl+o to expand" hint seen in built-in tools.
 */
function expandHint(theme: Theme): string {
  return theme.fg("dim", "ctrl+o") + theme.fg("muted", " to expand");
}

/**
 * Build the "ctrl+o to collapse" hint.
 */
function collapseHint(theme: Theme): string {
  return theme.fg("dim", "ctrl+o") + theme.fg("muted", " to collapse");
}

/**
 * Format a tool call line matching the built-in read tool pattern:
 *   toolTitle(bold "tool " ) + accent(args)
 */
function callLine(label: string, argDisplay: string, theme: Theme): string {
  return theme.fg("toolTitle", theme.bold(label + " ")) + theme.fg("accent", argDisplay);
}

/**
 * Format the bash-style call line matching the built-in bash pattern:
 *   toolTitle(bold "$ ") + accent(command)
 */
// ── Result summary parsers ────────────────────────────────────────────

function rawText(result: AgentToolResult<Details>): string {
  return result.content?.find((c): c is TextContent => c.type === "text")?.text ?? "";
}

function parseSearchSummary(raw: string): string {
  try {
    const r = JSON.parse(raw);
    const results = r?.data?.results as Array<{ tool_slug?: string }> | undefined;
    if (!results?.length) return "0 results";
    const statuses: Array<{ toolkit: string; has_active_connection: boolean }> =
      r?.data?.toolkit_connection_statuses ?? [];
    const connectedMap = new Map<string, boolean>();
    for (const s of statuses) connectedMap.set(s.toolkit, s.has_active_connection);
    const parts = [...connectedMap.entries()].map(([tk, on]) => `${tk} ${on ? "on" : "off"}`);
    const status = parts.length > 0 ? ` \u00b7 ${parts.join(", ")}` : "";
    return `${results.length} tool${results.length > 1 ? "s" : ""}${status}`;
  } catch {
    /* not parseable */
  }
  return "results found";
}

function parseSchemaSummary(raw: string): string {
  try {
    const r = JSON.parse(raw);
    const tools = r?.data?.tools as
      | Array<{ slug?: string; input_schema?: { properties?: Record<string, unknown> } }>
      | undefined;
    const t = tools?.[0];
    if (!t) {
      const schemas = r?.data?.tool_schemas as
        | Record<string, { input_schema?: { properties?: Record<string, unknown> } }>
        | undefined;
      if (schemas) {
        const slugs = Object.keys(schemas);
        const first = schemas[slugs[0]!];
        const params = Object.keys(first?.input_schema?.properties ?? {});
        return `${slugs[0]} \u00b7 ${params.length} params`;
      }
      return "tool not found";
    }
    const params = Object.keys(t.input_schema?.properties ?? {});
    return `${t.slug ?? "tool"} \u00b7 ${params.length} params`;
  } catch {
    /* not parseable */
  }
  return "schema loaded";
}

function parseExecuteSummary(raw: string): string {
  try {
    const r = JSON.parse(raw);
    if (r?.error) return `error: ${String(r.error).slice(0, 60)}`;
    return "executed";
  } catch {
    return "executed";
  }
}

function parseSandboxSummary(raw: string): string {
  try {
    const r = JSON.parse(raw);
    const d = r?.data as
      | { stdoutLines?: number; stderrLines?: number; stdout?: string; results?: string }
      | undefined;
    if (!d) return "executed";
    if (d.stdoutLines != null || d.stderrLines != null)
      return `stdout: ${d.stdoutLines ?? 0}, stderr: ${d.stderrLines ?? 0}`;
    if (d.stdout) {
      const clean = d.stdout.replace(/[\n\r\t]+/g, " ").trim();
      return clean ? previewLine(clean, 40) : "(empty)";
    }
    if (d.results) {
      const clean = String(d.results).replace(/[\n\r\t]+/g, " ").trim();
      return clean ? previewLine(clean, 40) : "(empty)";
    }
    return "executed";
  } catch {
    return "executed";
  }
}

// ── Tool 1: composio_search ───────────────────────────────────────────

function renderSearchCall(args: { queries: string[] }, theme: Theme): Text {
  return new Text(callLine("🔍 composio_search", args.queries?.join(", ") ?? "...", theme), 0, 0);
}

function renderSearchResult(
  result: AgentToolResult<Details>,
  { expanded }: { expanded: boolean },
  theme: Theme,
): Text {
  const raw = rawText(result);
  if (result.details?.error) {
    return new Text(theme.fg("error", "\u2717 ") + theme.fg("dim", result.details.error), 0, 0);
  }
  const summary = parseSearchSummary(raw);
  let lines = theme.fg("success", "\u2713 ") + theme.fg("muted", summary);
  if (expanded) {
    const json = tryFormatJson(raw);
    lines += "\n" + theme.fg("dim", json);
    lines += "\n" + collapseHint(theme);
  } else {
    lines += "  " + expandHint(theme);
  }
  return new Text(lines, 0, 0);
}

// ── Tool 2: composio_get_schema ───────────────────────────────────────

function renderSchemaCall(args: { tool_slugs: string[] }, theme: Theme): Text {
  return new Text(callLine("📋 composio_get_schema", args.tool_slugs?.join(", ") ?? "...", theme), 0, 0);
}

function renderSchemaResult(
  result: AgentToolResult<Details>,
  { expanded }: { expanded: boolean },
  theme: Theme,
): Text {
  const raw = rawText(result);
  if (result.details?.error) {
    return new Text(theme.fg("error", "\u2717 ") + theme.fg("dim", result.details.error), 0, 0);
  }
  const summary = parseSchemaSummary(raw);
  let lines = theme.fg("success", "\u2713 ") + theme.fg("muted", summary);
  if (expanded) {
    const json = tryFormatJson(raw);
    lines += "\n" + theme.fg("dim", json);
    lines += "\n" + collapseHint(theme);
  } else {
    lines += "  " + expandHint(theme);
  }
  return new Text(lines, 0, 0);
}

// ── Tool 3: composio_execute ──────────────────────────────────────────

function renderExecuteCall(args: { tool: string; arguments: unknown }, theme: Theme): Text {
  return new Text(callLine("⚡ composio_execute", args.tool, theme), 0, 0);
}

function renderExecuteResult(
  result: AgentToolResult<Details>,
  { expanded }: { expanded: boolean },
  theme: Theme,
): Text {
  const raw = rawText(result);
  if (result.details?.error) {
    return new Text(theme.fg("error", "\u2717 ") + theme.fg("dim", result.details.error), 0, 0);
  }
  const summary = parseExecuteSummary(raw);
  let lines = theme.fg("success", "\u2713 ") + theme.fg("muted", summary);
  if (expanded) {
    const json = tryFormatJson(raw);
    lines += "\n" + theme.fg("dim", json);
    lines += "\n" + collapseHint(theme);
  } else {
    lines += "  " + expandHint(theme);
  }
  return new Text(lines, 0, 0);
}

// ── Tool 4: composio_connect ──────────────────────────────────────────

function renderConnectCall(args: { toolkits: string[] }, theme: Theme): Text {
  return new Text(callLine("↗ composio_connect", args.toolkits?.join(", ") ?? "...", theme), 0, 0);
}

function renderConnectResult(
  result: AgentToolResult<Details>,
  { expanded }: { expanded: boolean },
  theme: Theme,
): Text {
  const raw = rawText(result);
  if (result.details?.error) {
    return new Text(theme.fg("error", "\u2717 ") + theme.fg("dim", result.details.error), 0, 0);
  }
  let lines = theme.fg("success", "\u2713 ") + theme.fg("muted", "connected");
  if (expanded) {
    const json = tryFormatJson(raw);
    lines += "\n" + theme.fg("dim", json);
    lines += "\n" + collapseHint(theme);
  } else {
    lines += "  " + expandHint(theme);
  }
  return new Text(lines, 0, 0);
}

// ── Tool 5: composio_workbench (bash-like rendering) ──────────────────

/**
 * Workbench renderCall matches the built-in bash tool pattern:
 *   $ python_code_preview
 * No "..." wrapping to avoid breaking on Python code with internal quotes.
 */
function renderWorkbenchCall(args: { code_to_execute: string }, theme: Theme): Text {
  const preview = previewLine(args.code_to_execute, 80);
  return new Text(
    theme.fg("toolTitle", theme.bold("🖥️ ")) + theme.fg("accent", preview),
    0,
    0,
  );
}

function renderWorkbenchResult(
  result: AgentToolResult<Details>,
  { expanded }: { expanded: boolean },
  theme: Theme,
): Text {
  const raw = rawText(result);
  if (result.details?.error) {
    const errPreview = result.details.error.length > 120
      ? result.details.error.slice(0, 117) + "..."
      : result.details.error;
    return new Text(theme.fg("error", "\u2717 ") + theme.fg("dim", errPreview), 0, 0);
  }
  const summary = parseSandboxSummary(raw);
  let lines = theme.fg("success", "\u2713 ") + theme.fg("muted", summary);
  if (expanded) {
    const output = tryFormatSandboxOutput(raw);
    lines += "\n" + theme.fg("dim", output);
    lines += "\n" + collapseHint(theme);
  } else {
    lines += "  " + expandHint(theme);
  }
  return new Text(lines, 0, 0);
}

// ── Tool 6: composio_bash (bash-like rendering) ───────────────────────

function renderBashCall(args: { command: string }, theme: Theme): Text {
  const preview = previewLine(args.command, 80);
  return new Text(
    theme.fg("toolTitle", theme.bold("💻 ")) + theme.fg("accent", preview),
    0,
    0,
  );
}

function renderBashResult(
  result: AgentToolResult<Details>,
  { expanded }: { expanded: boolean },
  theme: Theme,
): Text {
  const raw = rawText(result);
  if (result.details?.error) {
    const errPreview = result.details.error.length > 120
      ? result.details.error.slice(0, 117) + "..."
      : result.details.error;
    return new Text(theme.fg("error", "\u2717 ") + theme.fg("dim", errPreview), 0, 0);
  }
  const summary = parseSandboxSummary(raw);
  let lines = theme.fg("success", "\u2713 ") + theme.fg("muted", summary);
  if (expanded) {
    const output = tryFormatSandboxOutput(raw);
    lines += "\n" + theme.fg("dim", output);
    lines += "\n" + collapseHint(theme);
  } else {
    lines += "  " + expandHint(theme);
  }
  return new Text(lines, 0, 0);
}

// ── Formatting helpers ────────────────────────────────────────────────

function tryFormatJson(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw.slice(0, 2000);
  }
}

function tryFormatSandboxOutput(raw: string): string {
  try {
    const r = JSON.parse(raw);
    const d = r?.data as
      | { stdout?: string; stderr?: string; results?: string }
      | undefined;
    if (!d) return raw.slice(0, 2000);
    const parts: string[] = [];
    if (d.stdout?.trim()) parts.push(d.stdout.trim());
    if (d.stderr?.trim()) parts.push(d.stderr.trim());
    if (d.results?.trim()) parts.push(d.results.trim());
    return parts.join("\n").slice(0, 2000) || raw.slice(0, 2000);
  } catch {
    return raw.slice(0, 2000);
  }
}

// ── Extension entry point ─────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let apiKey = "";
  let sessionId = "";
  let composio: Composio | null = null;

  pi.on("session_start", async (_event, ctx) => {
    apiKey = resolveApiKey();
    if (!apiKey) {
      ctx.ui.notify("pi-composio: " + configHint(), "error");
      return;
    }
    try {
      composio = new Composio({ apiKey });
      const userId = resolveConfig().userId ?? PI_USER_ID;
      const session = await composio.create(userId);
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
    label: "🔍 composio_search",
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
    renderCall: renderSearchCall,
    renderResult: renderSearchResult,
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
    label: "📋 composio_get_schema",
    description: `Get the full input schema for one or more tool slugs.

Use after composio_search to see exactly what parameters a tool expects.
The schema shows required vs optional parameters, types, and descriptions.`,
    parameters: Type.Object({
      tool_slugs: Type.Array(Type.String(), {
        description: "Tool slugs, e.g. ['GMAIL_SEND_EMAIL'] or ['GITHUB_LIST_ISSUES']",
      }),
    }),
    renderCall: renderSchemaCall,
    renderResult: renderSchemaResult,
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
    label: "⚡ composio_execute",
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
        description: "JSON object with the tool's input parameters.",
      }),
    }),
    renderCall: renderExecuteCall,
    renderResult: renderExecuteResult,
    async execute(
      _toolCallId: string,
      params: { tool: string; arguments: unknown },
    ): Promise<AgentToolResult<Details>> {
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
    label: "↗ composio_connect",
    description: `Get an OAuth link to connect a new app account.

After authorization, the app becomes available for composio_search and composio_execute.
You only need to connect an app once — Composio persists the OAuth token.

Common apps: gmail, slack, github, notion, linear, stripe, jira, discord, figma, salesforce`,
    parameters: Type.Object({
      toolkits: Type.Array(Type.String(), {
        description: "App name(s) to connect, e.g. ['gmail'], ['slack'], ['github', 'notion']",
      }),
    }),
    renderCall: renderConnectCall,
    renderResult: renderConnectResult,
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

  // ── Tool 5: composio_workbench (bash-like) ──────────────────────

  pi.registerTool({
    name: "composio_workbench",
    label: "🖥️ composio_workbench",
    description: `Run Python code in Composio's sandboxed workbench environment.

The workbench shares the session's connected accounts, so you can:
- Process and transform tool responses
- Run bulk operations across connected apps
- Chain multiple tool calls together

Results and variables persist across calls within the same session.`,
    parameters: Type.Object({
      code_to_execute: Type.String({
        description: "Python code to execute in the workbench sandbox",
      }),
    }),
    renderCall: renderWorkbenchCall,
    renderResult: renderWorkbenchResult,
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

  // ── Tool 6: composio_bash (bash-like) ───────────────────────────

  pi.registerTool({
    name: "composio_bash",
    label: "💻 composio_bash",
    description: `Run shell commands in Composio's remote sandbox environment.

Useful for:
- File operations and data processing
- Scripting and automation tasks
- Running CLI tools available in the sandbox

The sandbox is scoped to the session and persists state between calls.`,
    parameters: Type.Object({
      command: Type.String({
        description: "Shell command to execute in the remote sandbox",
      }),
    }),
    renderCall: renderBashCall,
    renderResult: renderBashResult,
    async execute(
      _toolCallId: string,
      params: { command: string },
    ): Promise<AgentToolResult<Details>> {
      return tryOrError(async () => {
        guardSession(sessionId, composio, "composio_bash");
        return executeMetaTool(apiKey, sessionId, "COMPOSIO_REMOTE_BASH_TOOL", {
          command: params.command,
        });
      });
    },
  });
}
