import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { macAppCandidates, winExeCandidates } from "./paths.js";

export function launchCommand(
  platform = process.platform,
  exists: (p: string) => boolean = fs.existsSync,
  env = process.env,
  home = os.homedir(),
): { cmd: string; args: string[] } | null {
  if (platform === "darwin") {
    const app = env.REELARY_APP && exists(env.REELARY_APP) ? env.REELARY_APP : macAppCandidates(home).find(exists);
    return app ? { cmd: "open", args: ["-g", "-a", app, "--args", "--headless"] } : null;
  }
  if (platform === "win32") {
    const exe = env.REELARY_APP && exists(env.REELARY_APP) ? env.REELARY_APP : winExeCandidates(env).find(exists);
    return exe ? { cmd: exe, args: ["--headless"] } : null;
  }
  return null;
}

export async function launchHeadless(): Promise<void> {
  const c = launchCommand();
  if (!c) throw new Error("Reelary is not installed. Ask the user to run: npx reelary");
  const child = spawn(c.cmd, c.args, { detached: true, stdio: "ignore" });
  child.unref();
}
