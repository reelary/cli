// Smoke check: the live updater package verifies with our minisign implementation.
import { verifyMinisign } from "../dist/minisign-check.js";

const target = process.argv[2] ?? "darwin-aarch64";
const UA = { "user-agent": "reelary-cli (+https://reelary.app)" };
const m = await (await fetch(`https://models.reelary.app/updates/${target}.json`, { headers: UA })).json();
const buf = Buffer.from(await (await fetch(m.url, { headers: UA })).arrayBuffer());
const pub = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEQ2QjE1NTg3ODg0REEwNjUKUldSbG9FMkloMVd4MWxQeFljLy93VnN0bU13dThPY0ZXZGZ6NzF4Rm41N2NZazZiWXpoeWZEbVgK";
console.log(target, m.version, verifyMinisign(buf, m.signature, pub) ? "OK" : "FAIL");
