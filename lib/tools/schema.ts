// ── Tool: composio_get_schema ─────────────────────────────────────────

import type { AgentToolResult, Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { Details } from "../api.js";
import {
  callLine,
  expandHint,
  collapseHint,
  rawText,
  tryFormatJson,
  parseSchemaSummary,
} from "../render.js";

export function renderSchemaCall(args: { tool_slugs: string[] }, theme: Theme): Text {
  return new Text(
    callLine("\uD83D\uDCCB composio_get_schema", args.tool_slugs?.join(", ") ?? "...", theme),
    0,
    0,
  );
}

export function renderSchemaResult(
  result: AgentToolResult<Details>,
  { expanded, context }: { expanded: boolean; context?: { isError?: boolean } },
  theme: Theme,
): Text {
  if (context?.isError) {
    const errText =
      result.content?.[0]?.type === "text"
        ? result.content[0].text
        : "composio_get_schema: aborted";
    return new Text(theme.fg("error", `\u2717 ${errText}`), 0, 0);
  }
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
