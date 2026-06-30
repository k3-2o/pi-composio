// ── Config resolution ─────────────────────────────────────────────────

import { readFileSync, existsSync } from "node:fs";
import * as os from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const _thisFile = fileURLToPath(import.meta.url);
const EXTENSION_DIR = resolve(dirname(_thisFile), "..");

const HOME_CONFIG_PATHS = [
  join(os.homedir(), ".config", "pi-composio", "config.json"),
  join(os.homedir(), ".pi-composio.json"),
];

export interface Config {
  apiKey?: string;
  userId?: string;
}

const CONFIG_KEYS = new Set(["apiKey", "userId"]);

export function parseConfig(raw: string): Config {
  const parsed = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) return {};
  // --- warn on unknown keys (e.g. "apikey" instead of "apiKey") ---
  for (const key of Object.keys(parsed)) {
    if (!CONFIG_KEYS.has(key) && typeof key === "string") {
      const lower = key.toLowerCase();
      const suggestion =
        lower === "apikey" ? "apiKey" : lower === "userid" || lower === "user_id" ? "userId" : "";
      throw new Error(
        `unknown config key: "${key}"` + (suggestion ? ` (did you mean "${suggestion}"?)` : ""),
      );
    }
  }
  return { apiKey: parsed.apiKey, userId: parsed.userId };
}

function resolveConfig(): Config {
  // --- home-dir configs (outside git, never wiped) ---
  for (const p of HOME_CONFIG_PATHS) {
    try {
      if (existsSync(p)) {
        return parseConfig(readFileSync(p, "utf-8"));
      }
    } catch (err) {
      // --- surface schema errors (wrong key names), skip filesystem errors ---
      if (err instanceof SyntaxError) continue;
      if (err instanceof Error && err.message.startsWith("unknown config key:")) throw err;
    }
  }
  // --- fallback: extension-dir config (inside git, resets on update) ---
  try {
    const localPath = join(EXTENSION_DIR, "config.json");
    if (existsSync(localPath)) {
      return parseConfig(readFileSync(localPath, "utf-8"));
    }
  } catch (err) {
    if (err instanceof SyntaxError) return {};
    if (err instanceof Error && err.message.startsWith("unknown config key:")) throw err;
  }
  return {};
}

export function resolveApiKey(): string {
  const cfg = resolveConfig();
  if (cfg.apiKey && cfg.apiKey.length > 0) return cfg.apiKey;
  return process.env.COMPOSIO_API_KEY ?? "";
}

export function resolveUserId(): string {
  const cfg = resolveConfig();
  if (cfg.userId && cfg.userId.length > 0) return cfg.userId;
  return process.env.COMPOSIO_USER_ID ?? "pi-user";
}
