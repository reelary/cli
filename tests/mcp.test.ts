import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { buildServer, TOOL_NAMES } from "../src/mcp.js";
import { ApiError } from "../src/api-client.js";

type Call = { m: string; p: string; b?: unknown };

async function connect(handler: (c: Call) => unknown, readFile = (_p: string) => Buffer.from([0xff, 0xd8])) {
  const calls: Call[] = [];
  const api = { request: async <T,>(m: string, p: string, b?: unknown) => { const c = { m, p, b }; calls.push(c); return (await handler(c)) as T; } };
  const server = buildServer(api, readFile);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(ct);
  return { client, calls };
}

const text = (r: any) => r.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");

describe("reelary MCP server", () => {
  it("lists every tool", async () => {
    const { client } = await connect(() => ({}));
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual([...TOOL_NAMES].sort());
  });

  it("search forwards the query and attaches thumbnails on request", async () => {
    const results = [
      { id: "a", path: "/v/a.mov", start: 1, end: 4, score: 0.3, kind: "clip", thumb: "/t/a.jpg", source: "a.mov" },
      { id: "b", path: "/v/b.jpg", start: 0, end: 0, score: 0.2, kind: "image", thumb: "/t/b.jpg", source: "b.jpg", caption: "a dog" },
    ];
    const { client, calls } = await connect(() => ({ terms: ["dog"], results }));
    const r: any = await client.callTool({ name: "reelary_search", arguments: { query: "dog on beach", limit: 5, include_thumbnails: true } });
    expect(calls[0]).toEqual({ m: "POST", p: "/v1/search", b: { query: "dog on beach", limit: 5 } });
    expect(text(r)).toContain("/v/a.mov");
    expect(text(r)).toContain("00:01-00:04");
    expect(text(r)).toContain("description");
    expect(r.content.filter((c: any) => c.type === "image")).toHaveLength(2);
  });

  it("returns Pro errors as readable tool errors with the upgrade link", async () => {
    const { client } = await connect(() => { throw new ApiError(402, "pro_required", "People (face search) needs Reelary Pro.", "https://reelary.app/pricing?plan=pro"); });
    const r: any = await client.callTool({ name: "reelary_list_people", arguments: {} });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("needs Reelary Pro");
    expect(text(r)).toContain("https://reelary.app/pricing?plan=pro");
  });

  it("rough_cut -> save_project -> export_video passes the draft and project id through", async () => {
    const draft = { aspect: "9:16", scenes: [{ line: "sunset", chosen: 0, picks: [{ id: "a", path: "/v/a.mov", start: 0, end: 5, score: 0.3, kind: "clip", thumb: "", source: "a" }] }] };
    const { client, calls } = await connect((c) => {
      if (c.p === "/v1/cut") return { draft, total_seconds: 5, empty_scenes: [], export_note: null };
      if (c.p === "/v1/projects") return { project: { id: "p1", name: "Trip" } };
      if (c.p === "/v1/export/mp4") return { job_id: "j1", out_path: "/Movies/Reelary/Trip.mp4" };
      return {};
    });
    const cut: any = await client.callTool({ name: "reelary_rough_cut", arguments: { script: "sunset", aspect: "9:16" } });
    expect(text(cut)).toContain('"total_seconds": 5');
    await client.callTool({ name: "reelary_save_project", arguments: { name: "Trip", draft } });
    expect(calls[1]).toEqual({ m: "POST", p: "/v1/projects", b: { name: "Trip", draft } });
    const ex: any = await client.callTool({ name: "reelary_export_video", arguments: { project_id: "p1", out_path: "/tmp/a.mp4", overwrite: true } });
    expect(calls[2].b).toEqual({ project_id: "p1", out_path: "/tmp/a.mp4", overwrite: true });
    expect(text(ex)).toContain("j1");
  });

  it("job_status and add_folder hit the right endpoints", async () => {
    const { client, calls } = await connect((c) => (c.p.startsWith("/v1/jobs/") ? { id: "j1", state: "running", progress: 0.5 } : { job_id: "j9" }));
    await client.callTool({ name: "reelary_add_folder", arguments: { path: "/Users/me/Movies" } });
    await client.callTool({ name: "reelary_job_status", arguments: { job_id: "j1" } });
    expect(calls.map((c) => `${c.m} ${c.p}`)).toEqual(["POST /v1/sources", "GET /v1/jobs/j1"]);
  });
});
