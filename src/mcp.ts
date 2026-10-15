// stdio MCP server: each tool is a thin call into the running Reelary app's local API.
import fs from "node:fs";
import { McpServer, type ToolCallback } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod";
import { ApiError, Reelary } from "./api-client.js";

type Api = { request<T>(method: string, path: string, body?: unknown): Promise<T> };
type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
type ToolResult = { content: Content[]; isError?: boolean; [k: string]: unknown };
type Shot = { id: string; path: string; start: number; end: number; score: number; kind: string; thumb: string; source: string; speech?: string; caption?: string };

export const TOOL_NAMES = [
  "reelary_status", "reelary_list_folders", "reelary_add_folder", "reelary_remove_folder",
  "reelary_search", "reelary_rough_cut", "reelary_save_project", "reelary_open_in_app",
  "reelary_export_video", "reelary_export_nle", "reelary_job_status",
  "reelary_list_people", "reelary_person_clips", "reelary_list_places",
] as const;

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const matchType = (s: Shot) => (s.speech ? "dialogue" : s.caption ? "description" : "visual");
const json = (v: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(v, null, 2) }] });

function formatShots(results: Shot[]): string {
  if (!results.length) return "No matches.";
  return results
    .map((s, i) => {
      const range = s.kind === "image" ? "photo" : `${mmss(s.start)}-${mmss(s.end)} (start=${s.start.toFixed(2)}, end=${s.end.toFixed(2)})`;
      const extra = s.speech ? ` said: "${s.speech}"` : s.caption ? ` shows: ${s.caption}` : "";
      return `${i + 1}. ${s.path} ${range} score=${s.score.toFixed(3)} match=${matchType(s)}${extra}`;
    })
    .join("\n");
}

async function guarded(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError) {
      const link = e.upgradeUrl ? ` Upgrade: ${e.upgradeUrl}` : "";
      const job = e.jobId ? ` Running job: ${e.jobId}` : "";
      return { content: [{ type: "text", text: `${e.message}${link}${job}` }], isError: true };
    }
    return { content: [{ type: "text", text: (e as Error).message }], isError: true };
  }
}

const shotSchema = z.object({
  id: z.string(), path: z.string(), start: z.number(), end: z.number(),
  score: z.number().optional(), kind: z.string().optional(), thumb: z.string().optional(), source: z.string().optional(),
});
const draftSchema = z.object({
  aspect: z.enum(["16:9", "9:16", "1:1"]).optional(),
  scenes: z.array(z.object({ line: z.string(), picks: z.array(shotSchema), chosen: z.number().int().min(0).optional() })),
});

export function buildServer(api: Api, readFile: (p: string) => Buffer = (p) => fs.readFileSync(p)): McpServer {
  const server = new McpServer({ name: "reelary", version: "0.1.0" }, { capabilities: { tools: {} } });
  const tool = <S extends z.ZodObject>(name: (typeof TOOL_NAMES)[number], description: string, inputSchema: S, run: (a: z.infer<S>) => Promise<ToolResult>) =>
    // The SDK infers args via StandardSchema; inside this generic helper TS cannot prove that equals z.infer<S>.
    server.registerTool(name, { description, inputSchema }, ((a: z.infer<S>) => guarded(() => run(a))) as unknown as ToolCallback<S>);

  tool("reelary_status", "Reelary app status: version, free/pro plan, indexed folders and library size, running index/export jobs, export limits. Call first if unsure Reelary is ready.",
    z.object({}), async () => json(await api.request("GET", "/v1/status")));

  tool("reelary_list_folders", "List the folders in the user's local Reelary media library.",
    z.object({}), async () => json(await api.request("GET", "/v1/sources")));

  tool("reelary_add_folder", "Add a folder of videos/photos to the local library and index it (runs in the background; poll reelary_job_status). Indexing is free and unlimited.",
    z.object({ path: z.string().describe("Absolute folder path, e.g. /Users/me/Movies") }),
    async (a) => json(await api.request("POST", "/v1/sources", { path: a.path })));

  tool("reelary_remove_folder", "Remove a folder from the library index (files on disk are not touched).",
    z.object({ path: z.string() }), async (a) => json(await api.request("DELETE", "/v1/sources", { path: a.path })));

  tool("reelary_search", "Search the user's own footage and photos by meaning (what is shown; also what is said for Pro). Returns clips with exact start/end seconds.",
    z.object({
      query: z.string().describe("Plain-language description, e.g. 'kids laughing at a birthday party'"),
      limit: z.number().int().min(1).max(60).optional(),
      include_thumbnails: z.boolean().optional().describe("Attach up to 8 small preview images"),
    }),
    async (a) => {
      const r = await api.request<{ terms: string[]; results: Shot[] }>("POST", "/v1/search", { query: a.query, limit: a.limit ?? 10 });
      const content: Content[] = [{ type: "text", text: `Search terms: ${r.terms.join(" | ")}\n${formatShots(r.results)}` }];
      if (a.include_thumbnails) {
        for (const s of r.results.slice(0, 8)) {
          try {
            content.push({ type: "image", data: readFile(s.thumb).toString("base64"), mimeType: "image/jpeg" });
          } catch {
            // Thumbnail missing on disk: skip it.
          }
        }
      }
      return { content };
    });

  tool("reelary_rough_cut", "Turn a script into a rough cut from the user's own footage: one scene per line, each with the best clip and 2 alternatives. Returns a draft to save or export.",
    z.object({
      script: z.string(),
      aspect: z.enum(["16:9", "9:16", "1:1"]).optional(),
      max_clip_seconds: z.number().positive().max(120).optional().describe("Cap each shot's length (default 6)"),
    }),
    async (a) => json(await api.request("POST", "/v1/cut", a)));

  tool("reelary_save_project", "Save a rough-cut draft as a Reelary project the user can open and fine-tune in the editor.",
    z.object({ name: z.string(), draft: draftSchema }),
    async (a) => json(await api.request("POST", "/v1/projects", { name: a.name, draft: a.draft })));

  tool("reelary_open_in_app", "Show the Reelary window, optionally opening a saved project in the editor for hand edits.",
    z.object({ project_id: z.string().optional() }),
    async (a) => json(await api.request("POST", "/v1/open", a.project_id ? { project_id: a.project_id } : {})));

  tool("reelary_export_video", "Render an MP4 from a saved project (preferred, keeps the user's edits) or a draft. Runs in the background; poll reelary_job_status. Free plan: 720p, watermark, 60s, 5 per month.",
    z.object({ project_id: z.string().optional(), draft: draftSchema.optional(), aspect: z.enum(["16:9", "9:16", "1:1"]).optional(), out_path: z.string().optional().describe("Absolute path; must not exist unless overwrite is true"), overwrite: z.boolean().optional() }),
    async (a) => json(await api.request("POST", "/v1/export/mp4", a)));

  tool("reelary_export_nle", "Export a project or draft as an editing project for Premiere Pro / Final Cut Pro / DaVinci Resolve (FCPXML or EDL), referencing the original files. Pro.",
    z.object({ project_id: z.string().optional(), draft: draftSchema.optional(), format: z.enum(["fcpxml", "xml", "edl"]).optional(), out_path: z.string().optional().describe("Absolute path; must not exist unless overwrite is true"), overwrite: z.boolean().optional() }),
    async (a) => json(await api.request("POST", "/v1/export/nle", a)));

  tool("reelary_job_status", "Progress of a background job (indexing or export).",
    z.object({ job_id: z.string() }), async (a) => json(await api.request("GET", `/v1/jobs/${encodeURIComponent(a.job_id)}`)));

  tool("reelary_list_people", "People recognised in the library (face search). Pro.",
    z.object({}), async () => json(await api.request("GET", "/v1/people")));

  tool("reelary_person_clips", "Every clip a recognised person appears in. Pro.",
    z.object({ person_id: z.string() }),
    async (a) => {
      const r = await api.request<{ results: Shot[] }>("GET", `/v1/people/${encodeURIComponent(a.person_id)}/clips`);
      return { content: [{ type: "text", text: formatShots(r.results) }] };
    });

  tool("reelary_list_places", "Where footage was shot (GPS from phones, drones, GoPro) with place names. Pro.",
    z.object({}), async () => json(await api.request("GET", "/v1/places")));

  return server;
}

export async function runMcp(): Promise<void> {
  const server = buildServer(new Reelary());
  await server.connect(new StdioServerTransport());
}
