import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { globals: true, environment: "node" },
  resolve: {
    alias: {
      "server-only": new URL("./src/test/server-only-stub.ts", import.meta.url).pathname,
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
});
