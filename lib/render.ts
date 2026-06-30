// ── Rendering primitives (matches built-in read/bash pattern) ─────────

import type { AgentToolResult, Theme } from "@earendil-works/pi-coding-agent";
import type { TextContent } from "./api.js";

/**
 * Collapse multi-line text into a single-line preview.
 * Replaces newlines/tabs with spaces, truncates to fit.
 */
export function previewLine(text: string, maxLen = 60): string {
  const clean = text.replace(/[\n\r\t]+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 3) + "...";
}

/**
 * Build the "ctrl+o to expand" hint seen in built-in tools.
 */
export function expandHint(theme: Theme): string {
  return theme.fg("dim", "ctrl+o") + theme.fg("muted", " to expand");
}

/**
 * Build the "ctrl+o to collapse" hint.
 */
export function collapseHint(theme: Theme): string {
  return theme.fg("dim", "ctrl+o") + theme.fg("muted", " to collapse");
}

/**
 * Format a tool call line matching the built-in read tool pattern:
 *   toolTitle(bold "tool ") + accent(args)
 */
export function callLine(label: string, argDisplay: string, theme: Theme): string {
  return theme.fg("toolTitle", theme.bold(label + " ")) + theme.fg("accent", argDisplay);
}

export function rawText(result: AgentToolResult<unknown>): string {
  return result.content?.find((c): c is TextContent => c.type === "text")?.text ?? "";
}

// ── Result summary parsers ────────────────────────────────────────────

export function parseSearchSummary(raw: string): string {
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

export function parseSchemaSummary(raw: string): string {
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

export function parseExecuteSummary(raw: string): string {
  try {
    const r = JSON.parse(raw);
    if (r?.error) return `error: ${String(r.error).slice(0, 60)}`;
    return "executed";
  } catch {
    return "executed";
  }
}

export function parseSandboxSummary(raw: string): string {
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
      const clean = String(d.results)
        .replace(/[\n\r\t]+/g, " ")
        .trim();
      return clean ? previewLine(clean, 40) : "(empty)";
    }
    return "executed";
  } catch {
    return "executed";
  }
}

// ── Formatting helpers ────────────────────────────────────────────────

export function tryFormatJson(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw.slice(0, 2000);
  }
}

export function tryFormatSandboxOutput(raw: string): string {
  try {
    const r = JSON.parse(raw);
    const d = r?.data as { stdout?: string; stderr?: string; results?: string } | undefined;
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
