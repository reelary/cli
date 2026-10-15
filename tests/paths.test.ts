import { describe, expect, it } from "vitest";
import { detectTarget, apiInfoPath, winExeCandidates } from "../src/paths.js";

describe("paths", () => {
  it("maps platforms to updater targets", () => {
    expect(detectTarget("darwin", "arm64")).toBe("darwin-aarch64");
    expect(detectTarget("darwin", "x64")).toBe("darwin-x86_64");
    expect(detectTarget("win32", "x64")).toBe("windows-x86_64");
    expect(detectTarget("linux", "x64")).toBeNull();
    expect(detectTarget("win32", "arm64")).toBeNull();
  });
  it("finds api.json in the Tauri app data dir", () => {
    expect(apiInfoPath("darwin", {}, "/Users/me")).toBe("/Users/me/Library/Application Support/com.reelary.app/api.json");
    expect(apiInfoPath("win32", { APPDATA: "C:\\Users\\me\\AppData\\Roaming" }, "C:\\Users\\me")).toBe("C:\\Users\\me\\AppData\\Roaming\\com.reelary.app\\api.json");
  });
  it("prefers the per-user NSIS install", () => {
    expect(winExeCandidates({ LOCALAPPDATA: "C:\\L" })[0]).toBe("C:\\L\\Reelary\\Reelary.exe");
  });
});
