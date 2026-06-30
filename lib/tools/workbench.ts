// ── Tool: composio_workbench (bash-like rendering) ────────────────────

import type { AgentToolResult, Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { Details } from "../api.js";
import {
  previewLine,
  expandHint,
  collapseHint,
  rawText,
  tryFormatSandboxOutput,
  parseSandboxSummary,
} from "../render.js";

export function renderWorkbenchCall(args: { code_to_execute: string }, theme: Theme): Text {
  const preview = previewLine(args.code_to_execute, 60);
  return new Text(
    theme.fg("toolTitle", theme.bold("\uD83D\uDDA5 ")) + theme.fg("accent", preview),
    0,
    0,
  );
}

export function renderWorkbenchResult(
  result: AgentToolResult<Details>,
  { expanded, context }: { expanded: boolean; context?: { isError?: boolean } },
  theme: Theme,
): Text {
  if (context?.isError) {
    const errText =
      result.content?.[0]?.type === "text" ? result.content[0].text : "composio_workbench: aborted";
    return new Text(theme.fg("error", `\u2717 ${errText}`), 0, 0);
  }
  const raw = rawText(result);
  if (result.details?.error) {
    const errPreview =
      result.details.error.length > 120
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
