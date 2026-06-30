// ── Tool: composio_search ─────────────────────────────────────────────

import type { AgentToolResult, Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { Details } from "../api.js";
import {
  callLine,
  expandHint,
  collapseHint,
  rawText,
  tryFormatJson,
  parseSearchSummary,
} from "../render.js";

export function renderSearchCall(args: { queries: string[] }, theme: Theme): Text {
  return new Text(
    callLine("\uD83D\uDD0D composio_search", args.queries?.join(", ") ?? "...", theme),
    0,
    0,
  );
}

export function renderSearchResult(
  result: AgentToolResult<Details>,
  { expanded, context }: { expanded: boolean; context?: { isError?: boolean } },
  theme: Theme,
): Text {
  if (context?.isError) {
    const errText =
      result.content?.[0]?.type === "text" ? result.content[0].text : "composio_search: aborted";
    return new Text(theme.fg("error", `\u2717 ${errText}`), 0, 0);
  }
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
