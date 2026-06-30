import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Composio } from "@composio/core";

import { resolveApiKey, resolveUserId } from "./lib/config.js";
import { executeMetaTool, guardSession, tryOrError } from "./lib/api.js";
import { renderSearchCall, renderSearchResult } from "./lib/tools/search.js";
import { renderSchemaCall, renderSchemaResult } from "./lib/tools/schema.js";
import { renderExecuteCall, renderExecuteResult } from "./lib/tools/execute.js";
import { renderConnectCall, renderConnectResult } from "./lib/tools/connect.js";
import { renderWorkbenchCall, renderWorkbenchResult } from "./lib/tools/workbench.js";
import { renderBashCall, renderBashResult } from "./lib/tools/bash.js";

export default function (pi: ExtensionAPI) {
  let apiKey = "";
  let sessionId = "";
  let composio: Composio | null = null;
  let sessionReady: Promise<void> | null = null;
  let initError: string | null = null;

  pi.on("session_start", async () => {
    try {
      apiKey = resolveApiKey();
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("unknown config key:")) {
        initError = err.message;
      }
      return;
    }
    if (!apiKey) return;
    sessionReady = (async () => {
      composio = new Composio({ apiKey, disableVersionCheck: true });
      const userId = resolveUserId();
      const session = await composio.create(userId);
      sessionId = session.sessionId;
    })().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      initError = msg.match(/^\d{3}/)?.[0] ?? (msg.split(/[\n\r{]/)[0] ?? msg).trim().slice(0, 40);
    });
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
    async execute(_toolCallId: string, params: { queries: string[] }, signal?: AbortSignal) {
      if (signal?.aborted) {
        throw new Error("composio_search: aborted");
      }
      return tryOrError(
        async (sig) => {
          if (sessionReady) await sessionReady;
          guardSession(sessionId, composio, initError);
          return executeMetaTool(
            apiKey,
            sessionId,
            "COMPOSIO_SEARCH_TOOLS",
            {
              queries: params.queries,
            },
            sig,
          );
        },
        signal,
        "composio_search",
      );
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
    async execute(_toolCallId: string, params: { tool_slugs: string[] }, signal?: AbortSignal) {
      if (signal?.aborted) {
        throw new Error("composio_get_schema: aborted");
      }
      return tryOrError(
        async (sig) => {
          if (sessionReady) await sessionReady;
          guardSession(sessionId, composio, initError);
          return executeMetaTool(
            apiKey,
            sessionId,
            "COMPOSIO_GET_TOOL_SCHEMAS",
            {
              tool_slugs: params.tool_slugs,
            },
            sig,
          );
        },
        signal,
        "composio_get_schema",
      );
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
        description: "JSON object or JSON string with the tool's input parameters.",
      }),
    }),
    renderCall: renderExecuteCall,
    renderResult: renderExecuteResult,
    async execute(
      _toolCallId: string,
      params: { tool: string; arguments: unknown },
      signal?: AbortSignal,
    ) {
      if (signal?.aborted) {
        throw new Error("composio_execute: aborted");
      }
      return tryOrError(
        async (sig) => {
          if (sessionReady) await sessionReady;
          guardSession(sessionId, composio, initError);
          if (sig?.aborted) {
            throw new Error("composio_execute: aborted");
          }
          let args = params.arguments;
          if (typeof args === "string") {
            try {
              args = JSON.parse(args);
            } catch {
              // keep as-is, composio will reject
            }
          }
          const result = await composio!.tools.executeSessionTool(params.tool, {
            sessionId,
            arguments: args as Record<string, unknown>,
          });
          return result;
        },
        signal,
        "composio_execute",
      );
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
    async execute(_toolCallId: string, params: { toolkits: string[] }, signal?: AbortSignal) {
      if (signal?.aborted) {
        throw new Error("composio_connect: aborted");
      }
      return tryOrError(
        async (sig) => {
          if (sessionReady) await sessionReady;
          guardSession(sessionId, composio, initError);
          return executeMetaTool(
            apiKey,
            sessionId,
            "COMPOSIO_MANAGE_CONNECTIONS",
            {
              toolkits: params.toolkits,
            },
            sig,
          );
        },
        signal,
        "composio_connect",
      );
    },
  });

  // ── Tool 5: composio_workbench (bash-like) ──────────────────────

  pi.registerTool({
    name: "composio_workbench",
    label: "🖥 composio_workbench",
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
    async execute(_toolCallId: string, params: { code_to_execute: string }, signal?: AbortSignal) {
      if (signal?.aborted) {
        throw new Error("composio_workbench: aborted");
      }
      return tryOrError(
        async (sig) => {
          if (sessionReady) await sessionReady;
          guardSession(sessionId, composio, initError);
          return executeMetaTool(
            apiKey,
            sessionId,
            "COMPOSIO_REMOTE_WORKBENCH",
            {
              code_to_execute: params.code_to_execute,
            },
            sig,
          );
        },
        signal,
        "composio_workbench",
      );
    },
  });

  // ── Tool 6: composio_bash ───────────────────────────────────────────

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
    async execute(_toolCallId: string, params: { command: string }, signal?: AbortSignal) {
      if (signal?.aborted) {
        throw new Error("composio_bash: aborted");
      }
      return tryOrError(
        async (sig) => {
          if (sessionReady) await sessionReady;
          guardSession(sessionId, composio, initError);
          return executeMetaTool(
            apiKey,
            sessionId,
            "COMPOSIO_REMOTE_BASH_TOOL",
            {
              command: params.command,
            },
            sig,
          );
        },
        signal,
        "composio_bash",
      );
    },
  });
}
