import { defineConfig } from "vitest/config";

export default defineConfig({
    define: {
        __ELZOZ_SUPABASE_URL__: JSON.stringify(""),
        __ELZOZ_SUPABASE_ANON_KEY__: JSON.stringify(""),
        __ELZOZ_WEBSITE_URL__: JSON.stringify(""),
        __ELZOZ_DEV__: "true"
    },
    test: {
        environment: "node",
        include: ["tests/**/*.test.js"]
    }
});
