import { parseCommand, runCommand, HELP } from "./commands.js";
import { runSetup, runUninstall } from "./setup.js";
import { runMcp } from "./mcp.js";

const VERSION = "0.1.0";

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.includes("--version")) { console.log(VERSION); return 0; }
  if (argv.includes("--help") || argv[0] === "help") { console.log(HELP); return 0; }
  const { cmd, args, flags } = parseCommand(argv);
  if (cmd === "mcp") { await runMcp(); return -1; }
  if (cmd === "setup" || cmd === "install") return runSetup(argv.filter((a) => a !== cmd));
  if (cmd === "uninstall") return runUninstall(argv.slice(1));
  if (cmd === "unknown") { console.error(`Unknown command: ${argv[0]}\n\n${HELP}`); return 2; }
  return runCommand(cmd, args, flags);
}

main().then((code) => { if (code >= 0) process.exit(code); }, (e) => { console.error(e); process.exit(1); });
