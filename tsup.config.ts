import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", "minisign-check": "src/minisign.ts" },
  format: ["esm"],
  target: "node18",
  platform: "node",
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
  noExternal: [/.*/],
});
