// Verify Tauri updater (minisign) signatures with Node's built-in crypto.
import { createHash, createPublicKey, verify } from "node:crypto";

export function parsePublicKey(pubB64: string): { keyId: Buffer; key: Buffer } {
  const text = Buffer.from(pubB64, "base64").toString("utf8").trim();
  const line = text.split(/\r?\n/).pop() ?? "";
  const raw = Buffer.from(line, "base64");
  if (raw.length !== 42 || raw.subarray(0, 2).toString() !== "Ed") throw new Error("Invalid minisign public key");
  return { keyId: raw.subarray(2, 10), key: raw.subarray(10) };
}

export function verifyMinisign(data: Buffer, sigB64: string, pubB64: string): boolean {
  try {
    const pk = parsePublicKey(pubB64);
    const lines = Buffer.from(sigB64, "base64").toString("utf8").trim().split(/\r?\n/);
    if (lines.length < 4) return false;
    const sig = Buffer.from(lines[1], "base64");
    if (sig.length !== 74) return false;
    const alg = sig.subarray(0, 2).toString();
    if (!sig.subarray(2, 10).equals(pk.keyId)) return false;
    const s = sig.subarray(10);
    const msg = alg === "ED" ? createHash("blake2b512").update(data).digest() : alg === "Ed" ? data : null;
    if (!msg) return false;
    const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: pk.key.toString("base64url") }, format: "jwk" });
    if (!verify(null, msg, key, s)) return false;
    const trusted = lines[2].replace(/^trusted comment: /, "");
    const global = Buffer.from(lines[3], "base64");
    return verify(null, Buffer.concat([s, Buffer.from(trusted)]), key, global);
  } catch {
    return false;
  }
}
