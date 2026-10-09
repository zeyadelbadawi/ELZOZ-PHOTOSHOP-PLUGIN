// Every UI string exists in both languages (plugin and admin dashboard).
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { STRINGS } from "../../admin/src/i18n.js";

const pluginKeys = (block) => {
    const src = fs.readFileSync("src/app/i18n.jsx", "utf8");
    const start = src.indexOf(`const ${block} = {`);
    const end = src.indexOf("\n};", start);
    return [...src.slice(start, end).matchAll(/^\s+"([^"]+)":/gm)].map((m) => m[1]).sort();
};

describe("translations", () => {
    it("plugin: Arabic and English have the same keys", () => {
        expect(pluginKeys("ar")).toEqual(pluginKeys("en"));
        expect(pluginKeys("en").length).toBeGreaterThan(100);
    });
    it("admin dashboard: Arabic and English have the same keys", () => {
        expect(Object.keys(STRINGS.ar).sort()).toEqual(Object.keys(STRINGS.en).sort());
    });
    it("every key used by the plugin UI exists", () => {
        const keys = new Set(pluginKeys("en"));
        const used = new Set();
        for (const dir of ["src/app", "src/app/screens", "src/app/steps", "src/dev"]) {
            for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".jsx"))) {
                for (const m of fs.readFileSync(`${dir}/${f}`, "utf8").matchAll(/\bt\("([a-zA-Z0-9_.]+)"/g)) used.add(m[1]);
            }
        }
        expect([...used].filter((k) => !keys.has(k))).toEqual([]);
    });
});
