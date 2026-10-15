import os from "node:os";
import path from "node:path";

export const BUNDLE_ID = "com.reelary.app";
export type Target = "darwin-aarch64" | "darwin-x86_64" | "windows-x86_64";

export function detectTarget(platform = process.platform, arch = process.arch): Target | null {
  if (platform === "darwin") return arch === "arm64" ? "darwin-aarch64" : arch === "x64" ? "darwin-x86_64" : null;
  if (platform === "win32" && arch === "x64") return "windows-x86_64";
  return null;
}

export function appDataDir(platform = process.platform, env = process.env, home = os.homedir()): string {
  if (platform === "darwin") return path.join(home, "Library", "Application Support", BUNDLE_ID);
  if (platform === "win32") return path.win32.join(env.APPDATA ?? path.win32.join(home, "AppData", "Roaming"), BUNDLE_ID);
  return path.join(env.XDG_DATA_HOME ?? path.join(home, ".local", "share"), BUNDLE_ID);
}

export function apiInfoPath(platform = process.platform, env = process.env, home = os.homedir()): string {
  const dir = appDataDir(platform, env, home);
  return platform === "win32" ? path.win32.join(dir, "api.json") : path.join(dir, "api.json");
}

export function macAppCandidates(home = os.homedir()): string[] {
  return ["/Applications/Reelary.app", path.join(home, "Applications", "Reelary.app")];
}

export function winExeCandidates(env = process.env): string[] {
  const out: string[] = [];
  if (env.LOCALAPPDATA) out.push(path.win32.join(env.LOCALAPPDATA, "Reelary", "Reelary.exe"));
  out.push(path.win32.join(env.ProgramFiles ?? "C:\\Program Files", "Reelary", "Reelary.exe"));
  return out;
}
