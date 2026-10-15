// Merge our MCP server into a client's JSON config (Claude Desktop, Cursor) without touching the rest.
import fs from "node:fs";
import path from "node:path";

export type ServerEntry = { command: string; args: string[] };

function load(file: string): Record<string, unknown> | null {
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, "utf8");
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${file} is not valid JSON; fix it by hand, then re-run.`);
  }
}

export function backupOnce(file: string): string | undefined {
  if (!fs.existsSync(file)) return undefined;
  const b = `${file}.reelary.bak`;
  if (!fs.existsSync(b)) fs.copyFileSync(file, b);
  return b;
}

export function upsertJsonServer(file: string, name: string, entry: ServerEntry): { changed: boolean; backup?: string } {
  const cur = load(file) ?? {};
  const servers = (cur.mcpServers as Record<string, unknown> | undefined) ?? {};
  if (JSON.stringify(servers[name]) === JSON.stringify(entry)) return { changed: false };
  const backup = backupOnce(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ ...cur, mcpServers: { ...servers, [name]: entry } }, null, 2) + "\n");
  return { changed: true, backup };
}

export function removeJsonServer(file: string, name: string): boolean {
  const cur = load(file);
  const servers = cur?.mcpServers as Record<string, unknown> | undefined;
  if (!cur || !servers || !(name in servers)) return false;
  delete servers[name];
  fs.writeFileSync(file, JSON.stringify(cur, null, 2) + "\n");
  return true;
}
