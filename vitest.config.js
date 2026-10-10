import { defineConfig } from "vitest/config";

// Tests that share the local test database run one file at a time (they reset
// shared tables and bot settings); everything else runs in parallel.
const SHARED_DB = ["tests/db/**/*.test.js", "tests/bot/**/*.test.js", "tests/e2e/**/*.test.js", "tests/admin/**/*.test.js"];

export default defineConfig({
    define: {
        __ELZOZ_SUPABASE_URL__: JSON.stringify(""),
        __ELZOZ_SUPABASE_ANON_KEY__: JSON.stringify(""),
        __ELZOZ_WEBSITE_URL__: JSON.stringify(""),
        __ELZOZ_DEV__: "true"
    },
    test: {
        environment: "node",
        projects: [
            { extends: true, test: { name: "unit", include: ["tests/**/*.test.js"], exclude: SHARED_DB } },
            { extends: true, test: { name: "database", include: SHARED_DB, fileParallelism: false } }
        ]
    }
});
