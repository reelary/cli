import { describe, expect, it } from "vitest";
import { cmpVersion, readPlistVersion, isMasInstall, updateBase, UPDATE_BASE } from "../src/install-app.js";
import { skillsSource, SKILLS_REPO } from "../src/skills.js";

describe("install-app helpers", () => {
  it("compares semver-ish versions", () => {
    expect(cmpVersion("1.3.0", "1.2.2")).toBeGreaterThan(0);
    expect(cmpVersion("1.2.10", "1.2.9")).toBeGreaterThan(0);
    expect(cmpVersion("1.3", "1.3.0")).toBe(0);
    expect(cmpVersion("1.2.2", "1.3.0")).toBeLessThan(0);
  });
  it("reads CFBundleShortVersionString from Info.plist", () => {
    const plist = "<dict><key>CFBundleShortVersionString</key>\n\t<string>1.2.2</string><key>CFBundleVersion</key><string>23</string></dict>";
    expect(readPlistVersion(plist)).toBe("1.2.2");
    expect(readPlistVersion("<dict></dict>")).toBeNull();
  });
  it("detects the App Store build by its receipt", () => {
    expect(isMasInstall("/Applications/Reelary.app", (p) => p.endsWith("Contents/_MASReceipt"))).toBe(true);
    expect(isMasInstall("/Applications/Reelary.app", () => false)).toBe(false);
  });
  it("reads release and skills sources from env overrides (staging / local testing)", () => {
    expect(updateBase({})).toBe(UPDATE_BASE);
    expect(updateBase({ REELARY_UPDATE_BASE: "http://127.0.0.1:8765/updates/" })).toBe("http://127.0.0.1:8765/updates");
    expect(skillsSource({})).toBe(SKILLS_REPO);
    expect(skillsSource({ REELARY_SKILLS_SOURCE: "/src/reelary-skills" })).toBe("/src/reelary-skills");
  });
});
