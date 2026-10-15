// Install the Reelary skills through the `skills` CLI so installs count on the skills.sh leaderboard.
import { spawnSync } from "node:child_process";

export const SKILLS_REPO = "reelary/agent";

// A local checkout or another repo for testing; the public repo is what counts on skills.sh.
export function skillsSource(env: NodeJS.ProcessEnv = process.env): string {
  return env.REELARY_SKILLS_SOURCE || SKILLS_REPO;
}

export function installSkills(): boolean {
  const r = spawnSync("npx", ["-y", "skills", "add", skillsSource(), "-g", "-y", "--skill", "*"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return r.status === 0;
}

export function skillsInstallHint(): string {
  return `npx skills add ${SKILLS_REPO} -g`;
}

export function skillsRemoveHint(): string {
  return `npx skills remove -g reelary find-footage broll-finder rough-cut script-to-video nle-export media-library photo-search montage-maker vertical-video dialogue-search footage-by-location face-search`;
}
