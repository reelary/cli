import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// The skills repo is a sibling checkout (../reelary-skills); override with REELARY_SKILLS_DIR.
const A = process.env.REELARY_SKILLS_DIR ?? path.resolve(__dirname, "../../reelary-skills");
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(A, p), "utf8"));
const skillExists = (s: string) => fs.existsSync(path.join(A, "skills", s, "SKILL.md"));

describe.skipIf(!fs.existsSync(A))("manifests", () => {
  it("plugin root ships the MCP server in .mcp.json", () => {
    expect(read(".mcp.json").mcpServers.reelary).toEqual({ command: "npx", args: ["-y", "reelary", "mcp"] });
  });

  it("claude marketplace lists every skill of the one plugin", () => {
    expect(read(".claude-plugin/plugin.json").name).toBe("reelary");
    const m = read(".claude-plugin/marketplace.json");
    expect(m.plugins[0].name).toBe("reelary");
    expect(m.plugins[0].skills).toHaveLength(6);
    for (const s of m.plugins[0].skills) expect(fs.existsSync(path.join(A, s, "SKILL.md"))).toBe(true);
  });

  it("codex plugin points at the skills dir and the MCP config", () => {
    const c = read(".codex-plugin/plugin.json");
    expect(c.name).toBe("reelary");
    expect(c.skills).toBe("./skills/");
    expect(c.mcpServers).toBe("./.mcp.json");
  });

  it("skills.sh.json follows the published schema and names real skills", () => {
    const g = read("skills.sh.json");
    expect(Object.keys(g).every((k) => ["$schema", "notGrouped", "groupings"].includes(k))).toBe(true);
    for (const grp of g.groupings) {
      expect(typeof grp.title).toBe("string");
      for (const s of grp.skills) expect(skillExists(s)).toBe(true);
    }
  });
});
