import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { TOOL_NAMES } from "../src/mcp.js";

// The skills repo is a sibling checkout (../reelary-skills); override with REELARY_SKILLS_DIR.
const ROOT = path.join(process.env.REELARY_SKILLS_DIR ?? path.resolve(__dirname, "../../reelary-skills"), "skills");
const EXPECTED = ["reelary", "find-footage", "broll-finder", "rough-cut", "script-to-video", "nle-export", "media-library",
  "photo-search", "montage-maker", "vertical-video", "dialogue-search", "footage-by-location", "face-search"];

// Parse frontmatter with a real YAML parser, like the skills CLI does (an unquoted ": " breaks it).
function front(md: string): Record<string, string> {
  const m = md.match(/^---\n([\s\S]*?)\n---\n/);
  return m ? (parseYaml(m[1]) as Record<string, string>) : {};
}

describe.skipIf(!fs.existsSync(ROOT))("skills", () => {
  it("has exactly the planned skills", () => {
    const dirs = fs.readdirSync(ROOT).filter((d) => fs.existsSync(path.join(ROOT, d, "SKILL.md")));
    expect(dirs.sort()).toEqual([...EXPECTED].sort());
  });

  for (const name of EXPECTED) {
    it(`${name}: valid frontmatter, triggers, known tools, no em dash`, () => {
      const md = fs.readFileSync(path.join(ROOT, name, "SKILL.md"), "utf8");
      const f = front(md);
      expect(f.name).toBe(name);
      expect(f.description.length).toBeGreaterThan(80);
      expect(f.description.length).toBeLessThanOrEqual(1024);
      expect(f.description).toMatch(/Trigger on/);
      expect(md).not.toContain("\u2014");
      for (const t of md.match(/reelary_[a-z_]+/g) ?? []) expect(TOOL_NAMES).toContain(t);
      for (const ref of md.match(/\]\((\.\.?\/[^)]+)\)/g) ?? []) {
        const rel = ref.slice(2, -1);
        expect(fs.existsSync(path.resolve(ROOT, name, rel))).toBe(true);
      }
    });
  }
});
