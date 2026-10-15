// Add/replace a `[mcp_servers.<name>]` block in Codex's config.toml with line edits (no TOML dependency).
import fs from "node:fs";
import path from "node:path";
import { backupOnce, type ServerEntry } from "./json-config.js";

const q = (s: string) => JSON.stringify(s);

function strip(text: string, name: string): { rest: string; found: boolean } {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let skipping = false;
  let found = false;
  for (const line of lines) {
    const header = line.trim().match(/^\[(.+)\]$/);
    if (header) skipping = header[1].trim() === `mcp_servers.${name}` || header[1].trim().startsWith(`mcp_servers.${name}.`);
    if (skipping) {
      found = true;
      continue;
    }
    out.push(line);
  }
  return { rest: out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd(), found };
}

export function upsertTomlServer(file: string, name: string, entry: ServerEntry): { changed: boolean; backup?: string } {
  const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const block = `[mcp_servers.${name}]\ncommand = ${q(entry.command)}\nargs = [${entry.args.map(q).join(", ")}]\n`;
  if (text.includes(block)) return { changed: false };
  const backup = backupOnce(file);
  const { rest } = strip(text, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, (rest ? `${rest}\n\n` : "") + block);
  return { changed: true, backup };
}

export function removeTomlServer(file: string, name: string): boolean {
  if (!fs.existsSync(file)) return false;
  const { rest, found } = strip(fs.readFileSync(file, "utf8"), name);
  if (found) fs.writeFileSync(file, rest + "\n");
  return found;
}
