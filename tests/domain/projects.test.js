// Feature 15: saved projects and "only new rows".
import { describe, expect, it } from "vitest";
import { deleteProject, getProject, listProjects, markDone, partitionDone, putProject, rowKey, succeededKeys } from "../../src/domain/projects.js";
import { runPreflight } from "../../src/domain/preflight.js";
import { createMapping, setTextMapping } from "../../src/domain/mapping.js";
import { lastRunKeys, openProject, saveProject } from "../../src/app/projectIO.js";
import { initialState, reducer } from "../../src/app/state.js";
import { guessKeyColumn } from "../../src/app/screens/Projects.jsx";

const memory = () => {
    const m = new Map();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};
const row = (i, values) => ({ index: i, sourceRow: i + 2, values, isEmpty: false });
const table = (rows) => ({ headers: [{ key: "SKU" }, { key: "Name" }], issues: [], rows: rows.map((v, i) => row(i, v)) });

describe("project store", () => {
    it("inserts, updates (most recent first), keeps createdAt and deletes", () => {
        const s = memory();
        putProject(s, { id: "a", name: "A" }, 1);
        putProject(s, { id: "b", name: "B" }, 2);
        const a = putProject(s, { id: "a", name: "A2" }, 3);
        expect(a).toMatchObject({ name: "A2", createdAt: 1, updatedAt: 3 });
        expect(listProjects(s).map((p) => p.id)).toEqual(["a", "b"]);
        deleteProject(s, "a");
        expect(getProject(s, "a")).toBeNull();
    });
    it("survives broken or full storage", () => {
        expect(listProjects({ getItem: () => "{bad" })).toEqual([]);
        expect(putProject({ getItem: () => "[]", setItem: () => { throw new Error("quota"); } }, { id: "x", name: "x" })).toBeNull();
    });
});

describe("row keys", () => {
    it("are trimmed, case-insensitive and read Arabic digits", () => {
        expect(rowKey(row(0, { SKU: "  ELZ-0001 " }), "SKU")).toBe("elz-0001");
        expect(rowKey(row(0, { SKU: "١٢٣" }), "SKU")).toBe("123");
        expect(rowKey(row(0, { SKU: "" }), "SKU")).toBe("");
    });
    it("partitions done rows, never skips empty keys and reports duplicates", () => {
        const rows = table([{ SKU: "A" }, { SKU: "b" }, { SKU: "" }, { SKU: "B" }]).rows;
        const part = partitionDone(rows, "SKU", { a: "x" });
        expect([...part.skip]).toEqual([2]);
        expect(part.emptyKeyRows).toEqual([4]);
        expect(part.duplicateKeyRows).toEqual([5]);
    });
    it("marks done keys and caps the list, keeping the newest", () => {
        const done = markDone({ old: "2026-01-01" }, ["n1", "", "n2"], "2026-10-01");
        expect(done).toEqual({ old: "2026-01-01", n1: "2026-10-01", n2: "2026-10-01" });
        const many = markDone(Object.fromEntries(Array.from({ length: 20000 }, (_, i) => [`k${i}`, "2026-01-01"])), ["fresh"], "2026-10-01");
        expect(Object.keys(many)).toHaveLength(20000);
        expect(many.fresh).toBe("2026-10-01");
    });
    it("takes only the succeeded rows' keys from a run", () => {
        const plan = { items: [{ sourceRow: 2, rowKey: "a" }, { sourceRow: 3, rowKey: "b" }, { sourceRow: 4 }] };
        const result = { items: [{ sourceRow: 2, status: "succeeded" }, { sourceRow: 3, status: "failed" }, { sourceRow: 4, status: "succeeded" }] };
        expect(succeededKeys(result, plan)).toEqual(["a"]);
    });
});

describe("only new rows in preflight", () => {
    const layers = [{ id: 1, name: "Name", kind: "text", path: ["Name"] }];
    const mapping = setTextMapping(createMapping(), 1, "Name");
    const plan = (extra, rows = [{ SKU: "A", Name: "a" }, { SKU: "B", Name: "b" }, { SKU: "", Name: "c" }]) =>
        runPreflight({ table: table(rows), layers, mapping, output: { name: "o", existingFileNames: [] }, formats: ["jpg"], namePattern: "{row}", pricing: { unitPrice: 1 }, ...extra });
    it("skips rows generated before, says how many, and keeps rows without a key", () => {
        const p = plan({ keyColumn: "SKU", doneKeys: { a: "x" }, onlyNew: true });
        expect(p.items.map((i) => i.sourceRow)).toEqual([3, 4]);
        expect(p.items.map((i) => i.rowKey)).toEqual(["b", ""]);
        expect(p.warnings.find((w) => w.code === "already_done")).toMatchObject({ rows: [2] });
        expect(p.warnings.find((w) => w.code === "empty_key")).toMatchObject({ rows: [4] });
        expect(p.cost).toBe(2);
    });
    it("generates everything when the switch is off, and keys rows for next time", () => {
        const p = plan({ keyColumn: "SKU", doneKeys: { a: "x" }, onlyNew: false });
        expect(p.items).toHaveLength(3);
        expect(p.items[0].rowKey).toBe("a");
    });
    it("blocks when every row was generated before", () => {
        const p = plan({ keyColumn: "SKU", doneKeys: { a: 1, b: 1 }, onlyNew: true }, [{ SKU: "A", Name: "a" }, { SKU: "b", Name: "b" }]);
        expect(p.blocking.map((b) => b.code)).toContain("nothing_new");
        expect(p.blocking.map((b) => b.code)).not.toContain("nothing_to_generate");
    });
    it("warns when the key column is gone from the spreadsheet", () => {
        const p = plan({ keyColumn: "Code", doneKeys: { a: 1 }, onlyNew: true });
        expect(p.warnings.map((w) => w.code)).toContain("key_missing");
        expect(p.items).toHaveLength(3);
    });
});

describe("saving and reopening a project", () => {
    const entry = (name) => ({ name, nativePath: `/x/${name}` });
    const fakeServices = (alive = () => true) => {
        const tokens = new Map();
        return {
            persistEntry: async (e) => {
                const t = `tok:${e.name}`;
                tokens.set(t, e);
                return t;
            },
            entryFromToken: async (t) => (alive(t) ? tokens.get(t) || null : null),
            loadSpreadsheet: async (e) => ({ entry: e, fileName: e.name, workbook: {}, sheetNames: ["Offers"] }),
            readSheet: () => table([{ SKU: "A", Name: "a" }, { SKU: "B", Name: "b" }, { SKU: "C", Name: "new" }]),
            loadTemplate: async (e) => ({ entry: e, title: e.name, layers: [{ id: 1, name: "Name", kind: "text", path: ["Name"] }] }),
            loadImageFolder: async (e) => ({ entry: e, name: e.name, index: {} }),
            loadOutputFolder: async (e) => ({ entry: e, name: e.name, existingFileNames: [] })
        };
    };
    const jobState = () => ({
        ...initialState(),
        data: { entry: entry("offers.xlsx"), fileName: "offers.xlsx", sheetName: "Offers", headerRow: 1, table: table([{ SKU: "A", Name: "a" }, { SKU: "B", Name: "b" }]) },
        template: { entry: entry("card.psd"), title: "card.psd", layers: [{ id: 1, name: "Name", kind: "text", path: ["Name"] }] },
        folders: { "img:Photo": { entry: entry("photos"), name: "photos" } },
        output: { entry: entry("out"), name: "out" },
        mapping: setTextMapping(createMapping(), 1, "Name"),
        settings: { ...initialState().settings, rowSelection: "1-2", namePattern: "{SKU}" }
    });

    it("stores tokens, mapping and settings (not the one-off row selection), and marks a just-finished run as done", async () => {
        const s = memory();
        const state = { ...jobState(), run: { status: "done", result: { items: [{ sourceRow: 2, status: "succeeded" }, { sourceRow: 3, status: "failed" }] } } };
        const keys = lastRunKeys(state, state.data.table, "SKU");
        expect(keys).toEqual(["a"]);
        const p = await saveProject({ storage: s, services: fakeServices(), state, name: " Weekly ", keyColumn: "SKU", justGenerated: keys, now: 5 });
        expect(p).toMatchObject({ name: "Weekly", keyColumn: "SKU", onlyNew: true, sources: { data: { token: "tok:offers.xlsx", sheetName: "Offers" }, template: { token: "tok:card.psd" }, output: { token: "tok:out" } } });
        expect(p.sources.folders["img:Photo"]).toEqual({ name: "photos", token: "tok:photos" });
        expect(Object.keys(p.done)).toEqual(["a"]);
        expect(p.settings.rowSelection).toBeUndefined();
        expect(p.settings.namePattern).toBe("{SKU}");
    });

    it("reopens everything, re-reads the spreadsheet (new rows) and lands on Check", async () => {
        const s = memory();
        const services = fakeServices();
        const saved = await saveProject({ storage: s, services, state: jobState(), name: "W", keyColumn: "SKU", justGenerated: ["a", "b"] });
        const loaded = await openProject({ storage: s, services, id: saved.id });
        expect(loaded.missing).toEqual([]);
        expect(loaded.data.table.rows).toHaveLength(3);
        const next = reducer(initialState(), { type: "project-loaded", loaded });
        expect(next.step).toBe("check");
        expect(next.project).toMatchObject({ id: saved.id, keyColumn: "SKU", onlyNew: true });
        expect(Object.keys(next.mapping.text)).toEqual(["1"]);
        expect(next.folders["img:Photo"].name).toBe("photos");
    });

    it("lists what moved and sends the user to pick it again", async () => {
        const s = memory();
        const services = fakeServices((t) => t !== "tok:card.psd" && t !== "tok:photos");
        const saved = await saveProject({ storage: s, services, state: jobState(), name: "W", keyColumn: "SKU" });
        const loaded = await openProject({ storage: s, services, id: saved.id });
        expect(loaded.missing).toEqual(["template", "folder:photos"]);
        expect(reducer(initialState(), { type: "project-loaded", loaded }).step).toBe("template");
    });

    it("a template taken from the open document is always picked again", async () => {
        const s = memory();
        const state = jobState();
        state.template = { ...state.template, entry: null };
        const saved = await saveProject({ storage: s, services: fakeServices(), state, name: "W" });
        const loaded = await openProject({ storage: s, services: fakeServices(), id: saved.id });
        expect(loaded.missing).toContain("template");
    });

    it("an automatic save after a run keeps the project's name", async () => {
        const s = memory();
        const first = await saveProject({ storage: s, services: fakeServices(), state: jobState(), name: "Weekly" });
        const again = await saveProject({ storage: s, services: fakeServices(), state: { ...jobState(), project: { id: first.id, name: "Weekly", done: { a: 1 } } } });
        expect(again).toMatchObject({ id: first.id, name: "Weekly", done: { a: 1 } });
        expect(listProjects(s)).toHaveLength(1);
    });

    it("refuses a deleted project", async () => {
        await expect(openProject({ storage: memory(), services: fakeServices(), id: "nope" })).rejects.toThrow(/no longer exists/);
    });
});

describe("guessKeyColumn", () => {
    it("prefers SKU / code / id columns and ignores smart columns", () => {
        expect(guessKeyColumn([{ key: "Name" }, { key: "SKU" }, { key: "Key" }])).toBe("SKU");
        expect(guessKeyColumn([{ key: "Name" }, { key: "كود" }])).toBe("كود");
        expect(guessKeyColumn([{ key: "Name" }, { key: "Product code" }])).toBe("Product code");
        expect(guessKeyColumn([{ key: "✦ Code", derived: "x" }, { key: "Name" }])).toBe("");
    });
});
