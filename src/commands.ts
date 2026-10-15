// Human-friendly CLI over the same local API the MCP server uses.
import path from "node:path";
import { Reelary, ApiError } from "./api-client.js";

const COMMANDS = new Set(["setup", "install", "mcp", "status", "index", "search", "cut", "export", "open", "uninstall", "help"]);
const VALUE_FLAGS = new Set(["aspect", "save", "nle", "limit", "out"]);

export function parseCommand(argv: string[]): { cmd: string; args: string[]; flags: Record<string, string | true> } {
  const first = argv[0];
  // Only an empty argv or flags mean setup; an unknown word is a typo (never start an install for it).
  const cmd = !first || first.startsWith("-") ? "setup" : COMMANDS.has(first) ? first : "unknown";
  const rest = cmd === "setup" ? argv : argv.slice(1);
  const args: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith("--")) { args.push(a); continue; }
    const [k, v] = a.slice(2).split(/=(.*)/s, 2);
    if (v !== undefined) flags[k] = v;
    else if (VALUE_FLAGS.has(k) && rest[i + 1] !== undefined) flags[k] = rest[++i];
    else flags[k] = true;
  }
  return { cmd, args, flags };
}

export function formatHit(s: { path: string; kind: string; start: number; end: number; score: number }): string {
  const where = s.kind === "image" ? "photo" : `${s.start.toFixed(1)}-${s.end.toFixed(1)}s`;
  return `${s.path}  ${where}  ${s.score.toFixed(3)}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitJob(api: Reelary, id: string): Promise<any> {
  for (;;) {
    const j = await api.request<any>("GET", `/v1/jobs/${id}`);
    process.stderr.write(`\r${j.state} ${(j.progress * 100).toFixed(0)}% ${j.detail ?? ""}`.slice(0, 100).padEnd(100));
    if (j.state !== "running") { process.stderr.write("\n"); return j; }
    await sleep(1000);
  }
}

export async function runCommand(cmd: string, args: string[], flags: Record<string, string | true>): Promise<number> {
  const api = new Reelary();
  const out = (v: unknown) => console.log(typeof v === "string" ? v : JSON.stringify(v, null, 2));
  try {
    switch (cmd) {
      case "status":
        out(await api.request("GET", "/v1/status"));
        return 0;
      case "index": {
        if (!args[0]) throw new Error("Usage: reelary index <folder>");
        const { job_id } = await api.request<{ job_id: string }>("POST", "/v1/sources", { path: path.resolve(args[0]) });
        const j = await waitJob(api, job_id);
        out(j.result ?? j.error);
        return j.state === "done" ? 0 : 1;
      }
      case "search": {
        if (!args[0]) throw new Error('Usage: reelary search "<description>"');
        const r = await api.request<any>("POST", "/v1/search", { query: args.join(" "), limit: Number(flags.limit ?? 10) });
        if (flags.json) out(r);
        else for (const s of r.results) out(formatHit(s));
        return 0;
      }
      case "cut": {
        if (!args[0]) throw new Error('Usage: reelary cut "<script>" [--aspect 9:16] [--save <name>]');
        const r = await api.request<any>("POST", "/v1/cut", { script: args.join(" "), aspect: flags.aspect });
        if (typeof flags.save === "string") {
          const p = await api.request<any>("POST", "/v1/projects", { name: flags.save, draft: r.draft });
          out(`Saved project ${p.project.id} (${r.total_seconds.toFixed(1)}s). Open it: reelary open ${p.project.id}`);
        } else out(r);
        return 0;
      }
      case "export": {
        if (!args[0]) throw new Error("Usage: reelary export <project_id> [--nle fcpxml|edl] [--out <path>]");
        const body = { project_id: args[0], out_path: typeof flags.out === "string" ? path.resolve(flags.out) : undefined };
        if (flags.nle) {
          out(await api.request("POST", "/v1/export/nle", { ...body, format: flags.nle === true ? "fcpxml" : flags.nle }));
          return 0;
        }
        const { job_id } = await api.request<{ job_id: string }>("POST", "/v1/export/mp4", body);
        const j = await waitJob(api, job_id);
        out(j.result ?? j.error);
        return j.state === "done" ? 0 : 1;
      }
      case "open":
        out(await api.request("POST", "/v1/open", args[0] ? { project_id: args[0] } : {}));
        return 0;
      default:
        return 2;
    }
  } catch (e) {
    const link = e instanceof ApiError && e.upgradeUrl ? `\nUpgrade: ${e.upgradeUrl}` : "";
    console.error(`${(e as Error).message}${link}`);
    return 1;
  }
}

export const HELP = `reelary - talk to your footage (100% local)

  npx reelary                     install the app, connect your AI clients, add skills
  npx reelary mcp                 run the MCP server (used by AI clients)
  npx reelary status
  npx reelary index <folder>
  npx reelary search "<description>" [--json]
  npx reelary cut "<script>" [--aspect 9:16] [--save <name>]
  npx reelary export <project_id> [--nle fcpxml|edl] [--out <path>]
  npx reelary open [project_id]
  npx reelary uninstall [--app]

Setup flags: --yes  --skip-app  --skip-skills  --clients=claude-code,claude-desktop,cursor,codex`;
