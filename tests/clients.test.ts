import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { upsertJsonServer, removeJsonServer } from "../src/clients/json-config.js";
import { upsertTomlServer, removeTomlServer } from "../src/clients/codex-toml.js";
import { mcpCommand } from "../src/clients/index.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "reelary-clients-"));
const entry = { command: "npx", args: ["-y", "reelary", "mcp"] };

describe("json config", () => {
  it("creates the file when missing", () => {
    const f = path.join(tmp(), "sub", "mcp.json");
    expect(upsertJsonServer(f, "reelary", entry).changed).toBe(true);
    expect(JSON.parse(fs.readFileSync(f, "utf8"))).toEqual({ mcpServers: { reelary: entry } });
  });

  it("keeps other servers and settings, backs up once, is idempotent", () => {
    const f = path.join(tmp(), "claude_desktop_config.json");
    fs.writeFileSync(f, JSON.stringify({ theme: "dark", mcpServers: { other: { command: "x" } } }));
    const r1 = upsertJsonServer(f, "reelary", entry);
    expect(r1.backup && fs.existsSync(r1.backup)).toBeTruthy();
    const v = JSON.parse(fs.readFileSync(f, "utf8"));
    expect(v.theme).toBe("dark");
    expect(v.mcpServers.other).toEqual({ command: "x" });
    expect(v.mcpServers.reelary).toEqual(entry);
    expect(upsertJsonServer(f, "reelary", entry).changed).toBe(false);
  });

  it("refuses to overwrite malformed JSON", () => {
    const f = path.join(tmp(), "bad.json");
    fs.writeFileSync(f, "{ not json");
    expect(() => upsertJsonServer(f, "reelary", entry)).toThrow(/not valid JSON/);
    expect(fs.readFileSync(f, "utf8")).toBe("{ not json");
  });

  it("removes only our server", () => {
    const f = path.join(tmp(), "m.json");
    fs.writeFileSync(f, JSON.stringify({ mcpServers: { other: { command: "x" }, reelary: entry } }));
    expect(removeJsonServer(f, "reelary")).toBe(true);
    expect(JSON.parse(fs.readFileSync(f, "utf8")).mcpServers).toEqual({ other: { command: "x" } });
    expect(removeJsonServer(path.join(tmp(), "none.json"), "reelary")).toBe(false);
  });
});

describe("codex toml", () => {
  it("appends a block and replaces it in place on re-run", () => {
    const f = path.join(tmp(), "config.toml");
    fs.writeFileSync(f, 'model = "gpt-5"\n\n[mcp_servers.other]\ncommand = "x"\n');
    upsertTomlServer(f, "reelary", entry);
    upsertTomlServer(f, "reelary", { command: "cmd", args: ["/c", "npx", "-y", "reelary", "mcp"] });
    const t = fs.readFileSync(f, "utf8");
    expect(t.match(/\[mcp_servers\.reelary\]/g)!.length).toBe(1);
    expect(t).toContain('model = "gpt-5"');
    expect(t).toContain("[mcp_servers.other]");
    expect(t).toContain('command = "cmd"');
    expect(t).toContain('args = ["/c", "npx", "-y", "reelary", "mcp"]');
  });

  it("removes only our block", () => {
    const f = path.join(tmp(), "config.toml");
    fs.writeFileSync(f, '[mcp_servers.reelary]\ncommand = "npx"\nargs = ["-y"]\n\n[mcp_servers.other]\ncommand = "x"\n');
    expect(removeTomlServer(f, "reelary")).toBe(true);
    const t = fs.readFileSync(f, "utf8");
    expect(t).not.toContain("reelary");
    expect(t).toContain("[mcp_servers.other]");
  });
});

describe("mcpCommand", () => {
  it("wraps npx with cmd on Windows", () => {
    expect(mcpCommand("darwin")).toEqual({ command: "npx", args: ["-y", "reelary", "mcp"] });
    expect(mcpCommand("win32")).toEqual({ command: "cmd", args: ["/c", "npx", "-y", "reelary", "mcp"] });
  });
});
