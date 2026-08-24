const esbuild = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");

async function build() {
  await esbuild.build({
    entryPoints: ["src/handler.ts", "src/local.ts"],
    bundle: true,
    platform: "node",
    target: "node22",
    outdir: "build",
    sourcemap: true,
    external: ["@aws-sdk/*"],
  });

  const fontsDir = path.resolve("build/standard-fonts");
  const dataDir = path.resolve("build/data");
  fs.mkdirSync(fontsDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.cpSync(path.resolve("node_modules/pdfkit/js/standard-fonts"), fontsDir, { recursive: true });
  fs.copyFileSync(
    path.resolve("node_modules/pdfkit/js/data/sRGB_IEC61966_2_1.icc"),
    path.join(dataDir, "sRGB_IEC61966_2_1.icc"),
  );
  fs.writeFileSync(
    path.resolve("build/package.json"),
    JSON.stringify({ type: "commonjs", imports: { "#standard-fonts/*": "./standard-fonts/*.cjs" } }),
  );
}

build().catch(() => process.exit(1));