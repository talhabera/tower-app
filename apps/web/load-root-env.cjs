const { existsSync } = require("node:fs");
const path = require("node:path");

function findMonorepoRoot() {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(__dirname, "../..");
}

const root = findMonorepoRoot();
for (const name of [".env", ".env.local"]) {
  const file = path.join(root, name);
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}
