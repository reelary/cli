// Find the running Reelary app (api.json), launch it headless if needed, and call its local API.
import fs from "node:fs";
import { apiInfoPath } from "./paths.js";
import { launchHeadless } from "./launch.js";

export type ApiInfo = { port: number; token: string; pid: number; version: string; headless: boolean };

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public upgradeUrl?: string, public jobId?: string) {
    super(message);
  }
}

export function readApiInfo(file = apiInfoPath()): ApiInfo | null {
  try {
    const v = JSON.parse(fs.readFileSync(file, "utf8"));
    return typeof v.port === "number" && typeof v.token === "string" ? (v as ApiInfo) : null;
  } catch {
    return null;
  }
}

export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

type Opts = {
  infoFile?: string;
  launch?: () => Promise<void>;
  timeoutMs?: number;
  pollMs?: number;
  fetchImpl?: typeof fetch;
  alive?: (pid: number) => boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Reelary {
  private info: ApiInfo | null = null;
  private o: Required<Opts>;

  constructor(opts: Opts = {}) {
    this.o = {
      infoFile: opts.infoFile ?? apiInfoPath(),
      launch: opts.launch ?? launchHeadless,
      timeoutMs: opts.timeoutMs ?? 30000,
      pollMs: opts.pollMs ?? 500,
      fetchImpl: opts.fetchImpl ?? fetch,
      alive: opts.alive ?? pidAlive,
    };
  }

  private usable(): ApiInfo | null {
    const i = readApiInfo(this.o.infoFile);
    return i && this.o.alive(i.pid) ? i : null;
  }

  private async ensure(forceLaunch = false): Promise<ApiInfo> {
    if (!forceLaunch) {
      const i = this.usable();
      if (i) return (this.info = i);
    }
    const before = readApiInfo(this.o.infoFile)?.token;
    await this.o.launch();
    const deadline = Date.now() + this.o.timeoutMs;
    while (Date.now() < deadline) {
      const i = this.usable();
      if (i && (!forceLaunch || i.token !== before)) return (this.info = i);
      await sleep(this.o.pollMs);
    }
    throw new Error("Reelary did not start within the timeout. Open Reelary once by hand, then retry.");
  }

  private async send<T>(info: ApiInfo, method: string, p: string, body?: unknown): Promise<T> {
    const r = await this.o.fetchImpl(`http://127.0.0.1:${info.port}${p}`, {
      method,
      headers: { authorization: `Bearer ${info.token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // Framework rejections (413/415/422) are plain text: still an answer from the app, not a dead connection.
      throw new ApiError(r.status, r.status >= 500 ? "internal" : "bad_request", text.trim() || `HTTP ${r.status}`);
    }
    if (!r.ok) throw new ApiError(r.status, data?.code ?? "internal", data?.error ?? `HTTP ${r.status}`, data?.upgrade_url, data?.job_id);
    return data as T;
  }

  async request<T>(method: string, p: string, body?: unknown): Promise<T> {
    const info = this.info ?? (await this.ensure());
    try {
      return await this.send<T>(info, method, p, body);
    } catch (e) {
      if (e instanceof ApiError) throw e;
      // Connection failed: the app quit or restarted. Relaunch (or pick up the new port) once.
      this.info = null;
      const fresh = this.usable();
      const next = fresh && fresh.token !== info.token ? fresh : await this.ensure(true);
      return await this.send<T>(next, method, p, body);
    }
  }
}
