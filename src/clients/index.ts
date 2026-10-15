// The AI clients we can register the Reelary MCP server with.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { upsertJsonServer, removeJsonServer, type ServerEntry } from "./json-config.js";
import { upsertTomlServer, removeTomlServer } from "./codex-toml.js";

export const SERVER_NAME = "reelary";
export type ClientId = "claude-code" | "claude-desktop" | "cursor" | "codex";
export type McpClient = { id: ClientId; label: string; detect(): boolean; register(): string; unregister(): string };

export function mcpCommand(platform = process.platform): ServerEntry {
  const base = ["-y", "reelary", "mcp"];
  return platform === "win32" ? { command: "cmd", args: ["/c", "npx", ...base] } : { command: "npx", args: base };
}

function onPath(bin: string): boolean {
  return spawnSync(process.platform === "win32" ? "where" : "which", [bin], { stdio: "ignore" }).status === 0;
}

function describe(r: { changed: boolean; backup?: string }, file: string): string {
  if (!r.changed) return `already set in ${file}`;
  return r.backup ? `updated ${file} (backup: ${r.backup})` : `wrote ${file}`;
}

export function clients(env = process.env, home = os.homedir(), platform = process.platform): McpClient[] {
  const entry = mcpCommand(platform);
  const desktopCfg = platform === "darwin"
    ? path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")
    : path.join(env.APPDATA ?? path.join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  const cursorCfg = path.join(home, ".cursor", "mcp.json");
  const codexCfg = path.join(env.CODEX_HOME ?? path.join(home, ".codex"), "config.toml");
  return [
    {
      id: "claude-code",
      label: "Claude Code",
      detect: () => onPath("claude"),
      register: () => {
        spawnSync("claude", ["mcp", "remove", "--scope", "user", SERVER_NAME], { stdio: "ignore", shell: platform === "win32" });
        const r = spawnSync("claude", ["mcp", "add", "--scope", "user", SERVER_NAME, "--", entry.command, ...entry.args], { encoding: "utf8", shell: platform === "win32" });
        if (r.status !== 0) throw new Error(`claude mcp add failed: ${r.stderr || r.stdout}`);
        return "added with `claude mcp add --scope user`";
      },
      unregister: () => {
        const r = spawnSync("claude", ["mcp", "remove", "--scope", "user", SERVER_NAME], { encoding: "utf8", shell: platform === "win32" });
        return r.status === 0 ? "removed" : "not registered";
      },
    },
    {
      id: "claude-desktop",
      label: "Claude Desktop",
      detect: () => fs.existsSync(path.dirname(desktopCfg)),
      register: () => describe(upsertJsonServer(desktopCfg, SERVER_NAME, entry), desktopCfg) + " (restart Claude Desktop)",
      unregister: () => (removeJsonServer(desktopCfg, SERVER_NAME) ? "removed" : "not registered"),
    },
    {
      id: "cursor",
      label: "Cursor",
      detect: () => fs.existsSync(path.join(home, ".cursor")),
      register: () => describe(upsertJsonServer(cursorCfg, SERVER_NAME, entry), cursorCfg),
      unregister: () => (removeJsonServer(cursorCfg, SERVER_NAME) ? "removed" : "not registered"),
    },
    {
      id: "codex",
      label: "Codex",
      detect: () => fs.existsSync(path.dirname(codexCfg)),
      register: () => describe(upsertTomlServer(codexCfg, SERVER_NAME, entry), codexCfg),
      unregister: () => (removeTomlServer(codexCfg, SERVER_NAME) ? "removed" : "not registered"),
    },
  ];
}
