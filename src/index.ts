import type { ExtensionAPI, AgentToolResult } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Composio } from "@composio/core";

const COMPOSIO_BASE = "https://backend.composio.dev/api/v3.1";
const PI_USER_ID = "pi-user";

/**
 * Execute a Composio meta tool via the REST API.
 * Meta tools (COMPOSIO_SEARCH_TOOLS, COMPOSIO_MULTI_EXECUTE_TOOL, etc.)
 * use the execute_meta endpoint rather than the regular execute endpoint.
 */
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
    throw new Error(`Composio API error ${res.status}: ${text}`);
  }
  return res.json();
}

export default function (pi: ExtensionAPI) {
  let apiKey = "";
  let sessionId = "";
  let composio: Composio | null = null;

  // ── Session Init ──────────────────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    apiKey = process.env.COMPOSIO_API_KEY ?? "";
    if (!apiKey) {
      ctx.ui.notify("pi-composio: set COMPOSIO_API_KEY environment variable", "error");
      return;
    }

    try {
      composio = new Composio({ apiKey });
      const session = await composio.create(PI_USER_ID);
      sessionId = session.sessionId;
      ctx.ui.notify("pi-composio: session ready", "info");
    } catch (err) {
      ctx.ui.notify(
        `pi-composio: session init failed — ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
    }
  });

  // ── Tool 1: composio_search ──────────────────────────────────────────

  pi.registerTool({
    name: "composio_search",
    label: "Search Tools",
    description:
      "Search Composio's 1,000+ app tools by describing what you want to do. " +
      "Returns matching tool slugs, their input schemas, and connection status. " +
      "Use the results to call composio_execute.",
    parameters: Type.Object({
      task: Type.String({
        description:
          "What you want to do, e.g. 'find my latest github issues' or 'send an email to bob'",
      }),
    }),
    async execute(
      _toolCallId,
      params,
      _signal,
      _onUpdate,
    ): Promise<AgentToolResult<Record<string, never>>> {
      if (!sessionId) throw new Error("Composio session not initialized");
      const result = await executeMetaTool(apiKey, sessionId, "COMPOSIO_SEARCH_TOOLS", {
        text: params.task,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: {},
      };
    },
  });

  // ── Tool 2: composio_get_schema ─────────────────────────────────────

  pi.registerTool({
    name: "composio_get_schema",
    label: "Get Tool Schema",
    description:
      "Get the full input schema for a specific tool slug. " +
      "Use after composio_search to understand what parameters a tool expects.",
    parameters: Type.Object({
      slug: Type.String({
        description: "Tool slug, e.g. GMAIL_SEND_EMAIL or GITHUB_LIST_ISSUES",
      }),
    }),
    async execute(
      _toolCallId,
      params,
      _signal,
      _onUpdate,
    ): Promise<AgentToolResult<Record<string, never>>> {
      if (!sessionId) throw new Error("Composio session not initialized");
      const result = await executeMetaTool(apiKey, sessionId, "COMPOSIO_GET_TOOL_SCHEMAS", {
        slug: params.slug,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: {},
      };
    },
  });

  // ── Tool 3: composio_execute ────────────────────────────────────────

  pi.registerTool({
    name: "composio_execute",
    label: "Execute Tool",
    description:
      "Execute an app tool by slug with the required arguments. " +
      "Use after composio_search to find the right tool and composio_get_schema " +
      "to see what arguments it needs.",
    parameters: Type.Object({
      tool: Type.String({
        description: "Tool slug to execute, e.g. GMAIL_SEND_EMAIL or GITHUB_LIST_ISSUES",
      }),
      arguments: Type.Any({
        description:
          "Tool arguments matching the tool's input schema. " +
          "Use composio_get_schema to see the expected format.",
      }),
    }),
    async execute(
      _toolCallId,
      params,
      _signal,
      _onUpdate,
    ): Promise<AgentToolResult<Record<string, never>>> {
      if (!sessionId || !composio) {
        throw new Error("Composio session not initialized");
      }
      // Use the SDK for app tool execution (handles auth, schema translation)
      const result = await composio.tools.executeSessionTool(params.tool, {
        sessionId,
        arguments: params.arguments as Record<string, unknown>,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: {},
      };
    },
  });

  // ── Tool 4: composio_connect ────────────────────────────────────────

  pi.registerTool({
    name: "composio_connect",
    label: "Connect App",
    description:
      "Get an OAuth link to connect a new app account. " +
      "Returns a URL the user clicks to authorize. " +
      "After authorization, the app is available for composio_search and composio_execute.",
    parameters: Type.Object({
      app: Type.String({
        description: "App name to connect, e.g. 'gmail', 'slack', 'github', 'notion'",
      }),
    }),
    async execute(
      _toolCallId,
      params,
      _signal,
      _onUpdate,
    ): Promise<AgentToolResult<Record<string, never>>> {
      if (!sessionId) throw new Error("Composio session not initialized");
      const result = await executeMetaTool(apiKey, sessionId, "COMPOSIO_MANAGE_CONNECTIONS", {
        app: params.app,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: {},
      };
    },
  });

  // ── Tool 5: composio_workbench ──────────────────────────────────────

  pi.registerTool({
    name: "composio_workbench",
    label: "Workbench",
    description:
      "Run Python code in Composio's sandboxed workbench. " +
      "The workbench has access to the session's connected accounts, " +
      "so you can process data from tools, transform responses, or run bulk operations.",
    parameters: Type.Object({
      code: Type.String({
        description: "Python code to execute in the workbench sandbox",
      }),
    }),
    async execute(
      _toolCallId,
      params,
      _signal,
      _onUpdate,
    ): Promise<AgentToolResult<Record<string, never>>> {
      if (!sessionId) throw new Error("Composio session not initialized");
      const result = await executeMetaTool(apiKey, sessionId, "COMPOSIO_REMOTE_WORKBENCH", {
        code: params.code,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: {},
      };
    },
  });

  // ── Tool 6: composio_bash ───────────────────────────────────────────

  pi.registerTool({
    name: "composio_bash",
    label: "Remote Bash",
    description:
      "Run shell commands in Composio's remote sandbox. " +
      "Useful for scripting, file operations, or any command-line task " +
      "that needs to run outside the local environment.",
    parameters: Type.Object({
      command: Type.String({
        description: "Shell command to execute in the remote sandbox",
      }),
    }),
    async execute(
      _toolCallId,
      params,
      _signal,
      _onUpdate,
    ): Promise<AgentToolResult<Record<string, never>>> {
      if (!sessionId) throw new Error("Composio session not initialized");
      const result = await executeMetaTool(apiKey, sessionId, "COMPOSIO_REMOTE_BASH_TOOL", {
        command: params.command,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: {},
      };
    },
  });
}
