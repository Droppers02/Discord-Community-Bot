import { defineConfig } from "vitest/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

// The runtime resolves the `#` subpath imports to ./build/*; for tests we point
// the infra-facing ones at lightweight stubs so importing a service never spins up
// the real Postgres pool, env validation, or HTTP server.
export default defineConfig({
    resolve: {
        alias: {
            "#env": resolve(dir, "tests/stubs/env.ts"),
            "#database": resolve(dir, "tests/stubs/database.ts"),
            "#base": resolve(dir, "tests/stubs/base.ts"),
        },
    },
    test: {
        include: ["tests/**/*.test.ts"],
        environment: "node",
    },
});
