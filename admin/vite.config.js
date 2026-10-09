import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" lets the static build be hosted at any path (Netlify, Vercel, Cloudflare Pages, a sub-folder…).
export default defineConfig({
    plugins: [react()],
    base: process.env.ELZOZ_ADMIN_BASE || "./",
    build: { outDir: process.env.ELZOZ_ADMIN_OUT || "dist", emptyOutDir: true, sourcemap: false }
});
