// Drive the real app through the stdio MCP server: status -> add folder -> search -> cut -> save -> open -> export.
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const folder = process.argv[2];
if (!folder) throw new Error("usage: node scripts/e2e.mjs <folder-with-a-few-videos>");
const transport = new StdioClientTransport({ command: "node", args: ["dist/index.js", "mcp"], env: { ...process.env } });
const client = new Client({ name: "e2e", version: "0" });
await client.connect(transport);
const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
  console.log(`\n## ${name}${r.isError ? " (ERROR)" : ""}\n${text.slice(0, 800)}`);
  return { r, text };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await call("reelary_status");
const add = JSON.parse((await call("reelary_add_folder", { path: folder })).text);
for (;;) {
  const j = JSON.parse((await call("reelary_job_status", { job_id: add.job_id })).text);
  if (j.state !== "running") break;
  await sleep(3000);
}
const s = await call("reelary_search", { query: "people outdoors", limit: 3, include_thumbnails: true });
console.log("images:", s.r.content.filter((c) => c.type === "image").length);
const cut = JSON.parse((await call("reelary_rough_cut", { script: "People outdoors. A close-up detail. A wide shot.", aspect: "9:16" })).text);
const saved = JSON.parse((await call("reelary_save_project", { name: "E2E test", draft: cut.draft })).text);
await call("reelary_open_in_app", { project_id: saved.project.id });
const ex = JSON.parse((await call("reelary_export_video", { project_id: saved.project.id })).text);
for (;;) {
  const j = JSON.parse((await call("reelary_job_status", { job_id: ex.job_id })).text);
  if (j.state !== "running") break;
  await sleep(3000);
}
await call("reelary_list_people");
await client.close();
