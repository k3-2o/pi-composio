// ── Tool: composio_connect ────────────────────────────────────────────

import type { AgentToolResult, Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { Details } from "../api.js";
import { callLine, expandHint, collapseHint, rawText, tryFormatJson } from "../render.js";

export function renderConnectCall(args: { toolkits: string[] }, theme: Theme): Text {
  return new Text(
    callLine("\u2197 composio_connect", args.toolkits?.join(", ") ?? "...", theme),
    0,
    0,
  );
}

export function renderConnectResult(
  result: AgentToolResult<Details>,
  { expanded, context }: { expanded: boolean; context?: { isError?: boolean } },
  theme: Theme,
): Text {
  if (context?.isError) {
    const errText =
      result.content?.[0]?.type === "text" ? result.content[0].text : "composio_connect: aborted";
    return new Text(theme.fg("error", `\u2717 ${errText}`), 0, 0);
  }
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
