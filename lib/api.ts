// ── API helpers ───────────────────────────────────────────────────────

import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { ComposioSessionError, ComposioApiError } from "./errors.js";

const COMPOSIO_BASE = "https://backend.composio.dev/api/v3.1";

export type Details = { error?: string };
export type TextContent = { type: "text"; text: string };

export async function executeMetaTool(
  apiKey: string,
  sessionId: string,
  slug: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<unknown> {
  if (signal?.aborted) {
    throw new Error(`${slug}: aborted`);
  }
  const url = `${COMPOSIO_BASE}/tool_router/session/${sessionId}/execute_meta`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({ slug, arguments: args }),
    signal,
  });
  if (signal?.aborted) {
    throw new Error(`${slug}: aborted`);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new ComposioApiError(res.status, slug, text);
  }
  return res.json();
}

export function guardSession(
  sessionId: string,
  composio: unknown,
  initError?: string | null,
): asserts sessionId is string {
  if (!sessionId || !composio) {
    const hint =
      initError ??
      `composio: no config at ~/.config/pi-composio/config.json — needs {"apiKey":"ak_...","userId":"pg-..."}\n→ read https://github.com/k3-2o/pi-composio/blob/main/README.md`;
    throw new ComposioSessionError(hint);
  }
}

export async function tryOrError(
  fn: (signal?: AbortSignal) => Promise<unknown>,
  signal?: AbortSignal,
  toolName?: string,
): Promise<AgentToolResult<Details>> {
  try {
    if (signal?.aborted) {
      throw new Error(`${toolName ?? "tool"}: aborted`);
    }
    const data = await fn(signal);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      details: {},
    };
  } catch (err) {
    if (signal?.aborted) {
      const name = toolName ?? "tool";
      throw new Error(`${name}: aborted`);
    }
    const message =
      err instanceof ComposioSessionError || err instanceof ComposioApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    throw new Error(message);
  }
}
