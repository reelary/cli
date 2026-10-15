// `npx reelary` / `npx reelary uninstall`
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import fs from "node:fs";
import { detectTarget, macAppCandidates } from "./paths.js";
import { ensureApp } from "./install-app.js";
import { clients, type ClientId } from "./clients/index.js";
import { installSkills, skillsInstallHint, skillsRemoveHint } from "./skills.js";
import { Reelary } from "./api-client.js";

type Flags = { yes: boolean; skipApp: boolean; skipSkills: boolean; only: ClientId[] | null; app: boolean };

export function parseFlags(argv: string[]): Flags {
  const f: Flags = { yes: false, skipApp: false, skipSkills: false, only: null, app: false };
  for (const a of argv) {
    if (a === "--yes" || a === "-y") f.yes = true;
    else if (a === "--skip-app") f.skipApp = true;
    else if (a === "--skip-skills") f.skipSkills = true;
    else if (a === "--app") f.app = true;
    else if (a.startsWith("--clients=")) f.only = a.slice(10).split(",").filter(Boolean) as ClientId[];
  }
  return f;
}

async function confirm(q: string, yes: boolean): Promise<boolean> {
  if (yes || !stdin.isTTY) return true;
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const a = (await rl.question(`${q} [Y/n] `)).trim().toLowerCase();
  rl.close();
  return a === "" || a === "y" || a === "yes";
}

export async function runSetup(argv: string[]): Promise<number> {
  const f = parseFlags(argv);
  const target = detectTarget();
  if (!target) {
    console.error("Reelary runs on macOS (Apple Silicon / Intel) and Windows x64.");
    return 1;
  }
  console.log("Reelary: talk to your footage. 100% local.\n");
  if (!f.skipApp) {
    try {
      const r = await ensureApp(target);
      console.log(`✓ App ${r.action === "kept" ? "up to date" : r.action}: Reelary ${r.version}`);
    } catch (e) {
      console.error(`✗ ${(e as Error).message}`);
      return 1;
    }
    try {
      const st = await new Reelary().request<{ version: string; tier: string }>("GET", "/v1/status");
      console.log(`✓ Running in the background (tray icon), ${st.tier} plan`);
    } catch (e) {
      console.error(`✗ Could not reach the app: ${(e as Error).message}`);
      return 1;
    }
  }
  const found = clients().filter((c) => (f.only ? f.only.includes(c.id) : c.detect()));
  if (!found.length) console.log("No AI clients detected. Add the MCP server by hand: command `npx -y reelary mcp`.");
  else if (await confirm(`Connect Reelary to ${found.map((c) => c.label).join(", ")}?`, f.yes)) {
    for (const c of found) {
      try {
        console.log(`✓ ${c.label}: ${c.register()}`);
      } catch (e) {
        console.log(`✗ ${c.label}: ${(e as Error).message}`);
      }
    }
  }
  if (!f.skipSkills) {
    if (await confirm("Install the Reelary skills for your agents (via skills.sh)?", f.yes)) {
      if (!installSkills()) console.log(`✗ Skills install failed. Run it yourself: ${skillsInstallHint()}`);
    }
  }
  console.log('\nNext: ask your agent "Index ~/Movies with Reelary and find drone shots of the coast."');
  return 0;
}

export async function runUninstall(argv: string[]): Promise<number> {
  const f = parseFlags(argv);
  for (const c of clients()) {
    try {
      console.log(`${c.label}: ${c.unregister()}`);
    } catch (e) {
      console.log(`${c.label}: ${(e as Error).message}`);
    }
  }
  console.log(`Skills: remove them with \`${skillsRemoveHint()}\``);
  if (f.app && process.platform === "darwin") {
    for (const p of macAppCandidates()) if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
    console.log("Removed Reelary.app (your library data is kept).");
  } else if (f.app) {
    console.log("Uninstall Reelary from Settings > Apps (your library data is kept).");
  }
  return 0;
}
