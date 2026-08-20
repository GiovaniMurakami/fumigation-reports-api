const esbuild = require("esbuild");

esbuild.build({
  entryPoints: ["src/handler.ts", "src/local.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  outdir: "build",
  sourcemap: true,
  external: ["@aws-sdk/*"],
}).catch(() => process.exit(1));
