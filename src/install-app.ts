// Download, verify and install the direct-download Reelary build (never the App Store one).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { verifyMinisign } from "./minisign.js";
import { macAppCandidates, winExeCandidates, type Target } from "./paths.js";

export const UPDATE_BASE = "https://models.reelary.app/updates";
export const UPDATER_PUBKEY =
  "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEQ2QjE1NTg3ODg0REEwNjUKUldSbG9FMkloMVd4MWxQeFljLy93VnN0bU13dThPY0ZXZGZ6NzF4Rm41N2NZazZiWXpoeWZEbVgK";
export const MIN_APP_VERSION = "1.3.0";
// Override for staging / local release testing; downloads are still checked against UPDATER_PUBKEY.
export function updateBase(env: NodeJS.ProcessEnv = process.env): string {
  return (env.REELARY_UPDATE_BASE || UPDATE_BASE).replace(/\/+$/, "");
}
const UA = { "user-agent": "reelary-cli (+https://reelary.app)" };

export type Manifest = { version: string; url: string; signature: string };
export type EnsureResult = { action: "kept" | "installed" | "updated"; version: string; path: string };

export function cmpVersion(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export function readPlistVersion(plist: string): string | null {
  const m = plist.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/);
  return m ? m[1].trim() : null;
}

export function isMasInstall(appPath: string, exists: (p: string) => boolean = fs.existsSync): boolean {
  return exists(path.join(appPath, "Contents", "_MASReceipt"));
}

export async function fetchManifest(target: Target): Promise<Manifest> {
  const r = await fetch(`${updateBase()}/${target}.json`, { headers: UA });
  if (!r.ok) throw new Error(`Could not read the release manifest (HTTP ${r.status}).`);
  return (await r.json()) as Manifest;
}

async function download(url: string): Promise<Buffer> {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`Download failed (HTTP ${r.status}): ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

function macInstalled(): { path: string; version: string | null } | null {
  const p = macAppCandidates().find((c) => fs.existsSync(c));
  if (!p) return null;
  const plist = path.join(p, "Contents", "Info.plist");
  return { path: p, version: fs.existsSync(plist) ? readPlistVersion(fs.readFileSync(plist, "utf8")) : null };
}

function winInstalledVersion(): string | null {
  const r = spawnSync("reg", ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Reelary", "/v", "DisplayVersion"], { encoding: "utf8" });
  const m = r.stdout?.match(/DisplayVersion\s+REG_SZ\s+(\S+)/);
  return m ? m[1] : null;
}

function winStoreVersion(): string | null {
  const r = spawnSync("powershell", ["-NoProfile", "-Command", "(Get-AppxPackage Reelary.Reelary).Version"], { encoding: "utf8" });
  const v = r.stdout?.trim();
  return v ? v : null;
}

async function installMac(buf: Buffer): Promise<string> {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "reelary-install-"));
  const tgz = path.join(work, "Reelary.app.tar.gz");
  fs.writeFileSync(tgz, buf);
  const x = spawnSync("tar", ["-xzf", tgz, "-C", work]);
  if (x.status !== 0) throw new Error("Could not unpack the app archive.");
  const src = path.join(work, "Reelary.app");
  spawnSync("osascript", ["-e", 'tell application "Reelary" to quit'], { stdio: "ignore" });
  for (const destDir of ["/Applications", path.join(os.homedir(), "Applications")]) {
    try {
      fs.mkdirSync(destDir, { recursive: true });
      const dest = path.join(destDir, "Reelary.app");
      fs.rmSync(dest, { recursive: true, force: true });
      const c = spawnSync("ditto", [src, dest]);
      if (c.status === 0) return dest;
    } catch {
      // Not writable: try the next location.
    }
  }
  throw new Error("Could not copy Reelary.app into /Applications or ~/Applications.");
}

async function installWindows(buf: Buffer): Promise<string> {
  const exe = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "reelary-install-")), "Reelary-setup.exe");
  fs.writeFileSync(exe, buf);
  const r = spawnSync(exe, ["/S"], { stdio: "ignore" });
  if (r.status !== 0) throw new Error(`The installer exited with code ${r.status}.`);
  const found = winExeCandidates().find((c) => fs.existsSync(c));
  if (!found) throw new Error("Installer finished but Reelary.exe was not found.");
  return found;
}

export async function ensureApp(target: Target, log: (s: string) => void = console.log): Promise<EnsureResult> {
  const m = await fetchManifest(target);
  if (target.startsWith("darwin")) {
    const cur = macInstalled();
    if (cur && isMasInstall(cur.path)) {
      throw new Error("The Mac App Store version of Reelary is installed. It cannot run in the background for AI agents. Delete it and re-run `npx reelary` to install the direct version from reelary.app (your library is kept).");
    }
    if (cur?.version && cmpVersion(cur.version, MIN_APP_VERSION) >= 0 && cmpVersion(cur.version, m.version) >= 0) {
      return { action: "kept", version: cur.version, path: cur.path };
    }
    log(`Downloading Reelary ${m.version}…`);
    const buf = await download(m.url);
    if (!verifyMinisign(buf, m.signature, UPDATER_PUBKEY)) throw new Error("Signature check failed; not installing.");
    const p = await installMac(buf);
    return { action: cur ? "updated" : "installed", version: m.version, path: p };
  }
  const store = winStoreVersion();
  if (store && !winInstalledVersion()) {
    throw new Error("The Microsoft Store version of Reelary is installed. Background mode for AI agents needs the direct version: uninstall the Store version, then re-run `npx reelary` (your library is kept).");
  }
  const cur = winInstalledVersion();
  if (cur && cmpVersion(cur, MIN_APP_VERSION) >= 0 && cmpVersion(cur, m.version) >= 0) {
    return { action: "kept", version: cur, path: winExeCandidates().find((c) => fs.existsSync(c)) ?? "" };
  }
  log(`Downloading Reelary ${m.version}…`);
  const buf = await download(m.url);
  if (!verifyMinisign(buf, m.signature, UPDATER_PUBKEY)) throw new Error("Signature check failed; not installing.");
  const p = await installWindows(buf);
  return { action: cur ? "updated" : "installed", version: m.version, path: p };
}
