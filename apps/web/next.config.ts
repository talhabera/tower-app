import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import { existsSync } from "node:fs";
import path from "node:path";

function findMonorepoRoot(): string {
  const starts = [process.cwd(), __dirname];
  for (const start of starts) {
    let dir = path.resolve(start);
    for (let i = 0; i < 6; i++) {
      if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
        return dir;
      }
      const parent = path.resolve(dir, "..");
      if (parent === dir) break;
      dir = parent;
    }
  }
  return path.resolve(process.cwd(), "../..");
}

const repoRoot = findMonorepoRoot();
loadEnvConfig(repoRoot);

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: repoRoot,
  turbopack: {
    root: repoRoot,
  },
};

export default nextConfig;
