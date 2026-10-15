import { describe, expect, it } from "vitest";
import { parseCommand, formatHit } from "../src/commands.js";

describe("parseCommand", () => {
  it("defaults to setup", () => {
    expect(parseCommand([]).cmd).toBe("setup");
    expect(parseCommand(["--yes"]).cmd).toBe("setup");
  });
  it("treats an unknown first word as a typo, not as setup", () => {
    expect(parseCommand(["serch", "dogs"]).cmd).toBe("unknown");
    expect(parseCommand(["--skip-app"]).cmd).toBe("setup");
  });
  it("splits positionals and flags", () => {
    const c = parseCommand(["cut", "a sunset. a dog.", "--aspect", "9:16", "--save=Trip", "--json"]);
    expect(c.cmd).toBe("cut");
    expect(c.args).toEqual(["a sunset. a dog."]);
    expect(c.flags).toEqual({ aspect: "9:16", save: "Trip", json: true });
  });
  it("prints clip ranges for videos and no range for photos", () => {
    expect(formatHit({ path: "/v/a.mov", kind: "clip", start: 1, end: 13, score: 1.0091 })).toBe("/v/a.mov  1.0-13.0s  1.009");
    expect(formatHit({ path: "/p/dog.jpg", kind: "image", start: 0, end: 2, score: 0.959 })).toBe("/p/dog.jpg  photo  0.959");
  });
});
