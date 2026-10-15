import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Reelary, ApiError } from "../src/api-client.js";

function tmpInfo(info: object | null): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reelary-"));
  const f = path.join(dir, "api.json");
  if (info) fs.writeFileSync(f, JSON.stringify(info));
  return f;
}
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("Reelary client", () => {
  it("sends the bearer token and parses JSON", async () => {
    const f = tmpInfo({ port: 5, token: "tok", pid: 1, version: "1.3.0", headless: true });
    const fetchImpl = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
      expect((init!.headers as Record<string, string>).authorization).toBe("Bearer tok");
      return ok({ hello: 1 });
    });
    const r = new Reelary({ infoFile: f, fetchImpl: fetchImpl as unknown as typeof fetch, alive: () => true, launch: async () => {} });
    expect(await r.request("GET", "/v1/status")).toEqual({ hello: 1 });
    expect(String(fetchImpl.mock.calls.at(-1)![0])).toBe("http://127.0.0.1:5/v1/status");
  });

  it("launches the app when api.json is missing, then waits for it", async () => {
    const f = tmpInfo(null);
    const launch = vi.fn(async () => {
      setTimeout(() => fs.writeFileSync(f, JSON.stringify({ port: 7, token: "t", pid: 2, version: "1", headless: true })), 20);
    });
    const r = new Reelary({ infoFile: f, launch, pollMs: 5, timeoutMs: 2000, alive: () => true, fetchImpl: (async () => ok({ ok: true })) as unknown as typeof fetch });
    expect(await r.request("GET", "/v1/status")).toEqual({ ok: true });
    expect(launch).toHaveBeenCalledTimes(1);
  });

  it("treats a stale api.json (dead pid) as not running", async () => {
    const f = tmpInfo({ port: 9, token: "old", pid: 999999, version: "1", headless: true });
    const launch = vi.fn(async () => {
      fs.writeFileSync(f, JSON.stringify({ port: 10, token: "new", pid: 3, version: "1", headless: true }));
    });
    const seen: string[] = [];
    const fetchImpl = (async (u: string | URL | Request) => { seen.push(String(u)); return ok({}); }) as unknown as typeof fetch;
    const r = new Reelary({ infoFile: f, launch, pollMs: 5, timeoutMs: 1000, alive: (pid) => pid !== 999999, fetchImpl });
    await r.request("GET", "/v1/status");
    expect(launch).toHaveBeenCalledTimes(1);
    expect(seen.every((u) => u.startsWith("http://127.0.0.1:10/"))).toBe(true);
  });

  it("relaunches and retries once when the app went away mid-session", async () => {
    const f = tmpInfo({ port: 11, token: "a", pid: 4, version: "1", headless: true });
    let calls = 0;
    const fetchImpl = (async (u: string | URL | Request) => {
      calls++;
      if (String(u).includes(":11/")) throw new TypeError("fetch failed");
      return ok({ again: true });
    }) as unknown as typeof fetch;
    const launch = vi.fn(async () => {
      fs.writeFileSync(f, JSON.stringify({ port: 12, token: "b", pid: 5, version: "1", headless: true }));
    });
    const r = new Reelary({ infoFile: f, launch, pollMs: 5, timeoutMs: 1000, alive: () => true, fetchImpl });
    expect(await r.request("POST", "/v1/search", { query: "x" })).toEqual({ again: true });
    expect(launch).toHaveBeenCalledTimes(1);
    expect(calls).toBeGreaterThan(1);
  });

  it("turns API errors into ApiError with code and upgrade url", async () => {
    const f = tmpInfo({ port: 13, token: "t", pid: 6, version: "1", headless: true });
    const fetchImpl = (async () => new Response(JSON.stringify({ error: "needs Pro", code: "pro_required", upgrade_url: "https://u" }), { status: 402 })) as unknown as typeof fetch;
    const r = new Reelary({ infoFile: f, alive: () => true, fetchImpl, launch: async () => {} });
    const e = (await r.request("GET", "/v1/people").catch((x) => x)) as ApiError;
    expect(e).toBeInstanceOf(ApiError);
    expect([e.status, e.code, e.upgradeUrl]).toEqual([402, "pro_required", "https://u"]);
  });

  it("reports a plain-text error body as ApiError without relaunching or resending", async () => {
    const f = tmpInfo({ port: 14, token: "t", pid: 7, version: "1", headless: true });
    let calls = 0;
    const fetchImpl = (async () => { calls++; return new Response("length limit exceeded", { status: 413 }); }) as unknown as typeof fetch;
    const launch = vi.fn(async () => {});
    const r = new Reelary({ infoFile: f, alive: () => true, fetchImpl, launch, timeoutMs: 50, pollMs: 5 });
    const e = (await r.request("POST", "/v1/search", { query: "x" }).catch((x) => x)) as ApiError;
    expect(e).toBeInstanceOf(ApiError);
    expect([e.status, e.message]).toEqual([413, "length limit exceeded"]);
    expect(launch).not.toHaveBeenCalled();
    expect(calls).toBe(1);
  });

  it("gives up with a clear message when the app never comes up", async () => {
    const f = tmpInfo(null);
    const r = new Reelary({ infoFile: f, launch: async () => {}, pollMs: 5, timeoutMs: 50, alive: () => true });
    await expect(r.request("GET", "/v1/status")).rejects.toThrow(/did not start/);
  });
});
