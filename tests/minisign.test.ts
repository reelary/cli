import { describe, expect, it } from "vitest";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { verifyMinisign, parsePublicKey } from "../src/minisign.js";

// Build a minisign keypair + signature the way `tauri signer sign` does (algorithm "ED").
function fixture(data: Buffer, alg: "ED" | "Ed" = "ED") {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url");
  const keyId = Buffer.from("0123456789abcdef", "hex");
  const pubLine = Buffer.concat([Buffer.from("Ed"), keyId, raw]).toString("base64");
  const pub = Buffer.from(`untrusted comment: minisign public key: 0123456789ABCDEF\n${pubLine}\n`).toString("base64");
  const msg = alg === "ED" ? createHash("blake2b512").update(data).digest() : data;
  const sig = sign(null, msg, privateKey);
  const trusted = "timestamp:1\tfile:x.tar.gz";
  const global = sign(null, Buffer.concat([sig, Buffer.from(trusted)]), privateKey);
  const sigLine = Buffer.concat([Buffer.from(alg), keyId, sig]).toString("base64");
  const text = `untrusted comment: signature from tauri secret key\n${sigLine}\ntrusted comment: ${trusted}\n${global.toString("base64")}\n`;
  return { pub, sig: Buffer.from(text).toString("base64") };
}

describe("minisign", () => {
  const data = Buffer.from("hello reelary");

  it("parses the real updater public key", () => {
    const k = parsePublicKey("dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEQ2QjE1NTg3ODg0REEwNjUKUldSbG9FMkloMVd4MWxQeFljLy93VnN0bU13dThPY0ZXZGZ6NzF4Rm41N2NZazZiWXpoeWZEbVgK");
    expect(k.key.length).toBe(32);
    expect(k.keyId.length).toBe(8);
  });

  it("accepts a valid prehashed signature", () => {
    const f = fixture(data);
    expect(verifyMinisign(data, f.sig, f.pub)).toBe(true);
  });

  it("accepts a legacy non-prehashed signature", () => {
    const f = fixture(data, "Ed");
    expect(verifyMinisign(data, f.sig, f.pub)).toBe(true);
  });

  it("rejects tampered data", () => {
    const f = fixture(data);
    expect(verifyMinisign(Buffer.from("hello reelarY"), f.sig, f.pub)).toBe(false);
  });

  it("rejects a signature from another key", () => {
    const a = fixture(data);
    const b = fixture(data);
    expect(verifyMinisign(data, a.sig, b.pub)).toBe(false);
  });

  it("rejects garbage instead of throwing", () => {
    const f = fixture(data);
    expect(verifyMinisign(data, "bm90IGEgc2ln", f.pub)).toBe(false);
  });
});
