// Feature 8: images from links and store product exports.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { describeDownloadProblem, directLink, isLink, LINK_FOLDER_KEY, linkFileStem, linkShare, linksNeeded, MAX_IMAGE_BYTES, sniffImage } from "../../src/domain/linkImages.js";
import { downloadLinks } from "../../src/app/linkDownloader.js";
import { detectStore, firstImageLink, prepareStoreTable, stripHtml } from "../../src/domain/stores.js";
import { runPreflight } from "../../src/domain/preflight.js";
import { autoMap, createMapping, setImageMapping } from "../../src/domain/mapping.js";
import { createFakeHost, FakeFolder } from "../fakes/fakePhotoshop.js";
import { createPhotoshopPort } from "../../src/ps/port.js";
import { runDesignJob, ITEM } from "../../src/engine/designJob.js";

const JPG = new Uint8Array(fs.readFileSync("test-artifacts/fixtures/images/products/laptop.jpg"));
const PNG = new Uint8Array(fs.readFileSync("test-artifacts/fixtures/images/products/watch.png"));
const WEBP = new Uint8Array(fs.readFileSync("test-artifacts/fixtures/images/products/speaker.webp"));
const row = (i, values) => ({ index: i, sourceRow: i + 2, values, isEmpty: false });
const table = (headers, rows) => ({ headers: headers.map((k) => ({ key: k, label: k })), issues: [], rows: rows.map((v, i) => row(i, v)) });

describe("links", () => {
    it("recognises links and turns share links into direct downloads", () => {
        expect(isLink("https://x.test/a.jpg")).toBe(true);
        expect(isLink("laptop.jpg")).toBe(false);
        expect(isLink("ftp://x/a.jpg")).toBe(false);
        expect(directLink("https://drive.google.com/file/d/1AbC_d-9/view?usp=sharing")).toBe("https://drive.google.com/uc?export=download&id=1AbC_d-9");
        expect(directLink("https://drive.google.com/open?id=XYZ")).toBe("https://drive.google.com/uc?export=download&id=XYZ");
        expect(directLink("https://www.dropbox.com/s/abc/p.jpg?dl=0")).toBe("https://www.dropbox.com/s/abc/p.jpg?dl=1");
        expect(directLink("https://www.dropbox.com/scl/fi/abc/p.jpg?rlkey=k")).toBe("https://www.dropbox.com/scl/fi/abc/p.jpg?rlkey=k&dl=1");
        expect(directLink(" https://cdn.test/my photo.jpg ")).toBe("https://cdn.test/my%20photo.jpg");
        expect(directLink("not a link")).toBeNull();
    });
    it("names files stably and reads the real type from the bytes", () => {
        expect(linkFileStem("https://a.test/1.jpg")).toBe(linkFileStem("https://a.test/1.jpg"));
        expect(linkFileStem("https://a.test/1.jpg")).not.toBe(linkFileStem("https://a.test/2.jpg"));
        expect(sniffImage(JPG)).toBe("jpg");
        expect(sniffImage(PNG)).toBe("png");
        expect(sniffImage(WEBP)).toBe("webp");
        expect(sniffImage(new TextEncoder().encode("<!doctype html><html>"))).toBeNull();
    });
    it("explains why a download can't be used", () => {
        expect(describeDownloadProblem({ status: 403 })).toMatch(/login|shared publicly/);
        expect(describeDownloadProblem({ status: 404 })).toMatch(/404/);
        expect(describeDownloadProblem({ timedOut: true })).toMatch(/in time/);
        expect(describeDownloadProblem({ status: 200, bytes: new TextEncoder().encode("<html>.............."), contentType: "text/html" })).toMatch(/web page, not an image/);
        expect(describeDownloadProblem({ status: 200, bytes: { length: MAX_IMAGE_BYTES + 1 } })).toMatch(/larger than 30 MB/);
        expect(describeDownloadProblem({ status: 200, bytes: JPG })).toBeNull();
    });
    it("measures link columns and lists the links a mapping needs", () => {
        const t = table(["Photo", "Name"], [{ Photo: "https://a.test/1.jpg" }, { Photo: "https://a.test/1.jpg" }, { Photo: "x.jpg" }, { Photo: "" }]);
        expect(linkShare(t.rows, "Photo")).toBeCloseTo(2 / 3);
        const m = setImageMapping(createMapping(), 5, { column: "Photo", source: "link" });
        expect(linksNeeded(t.rows, m)).toEqual(["https://a.test/1.jpg"]);
        expect(linksNeeded(t.rows, setImageMapping(createMapping(), 5, { column: "Photo" }))).toEqual([]);
    });
    it("auto-map picks links for a column of links", () => {
        const t = table(["Photo"], [{ Photo: "https://a.test/1.jpg" }, { Photo: "https://a.test/2.jpg" }]);
        const m = autoMap(createMapping(), t.headers, [{ id: 7, name: "Photo", kind: "smartObject", path: ["Photo"] }], t.rows);
        expect(m.images[7]).toMatchObject({ column: "Photo", source: "link" });
    });
});

describe("preflight with images from links", () => {
    const layers = [{ id: 7, name: "Photo", kind: "smartObject", path: ["Photo"] }];
    const t = table(["Photo"], [{ Photo: "https://a.test/ok.jpg" }, { Photo: "https://a.test/404.jpg" }, { Photo: "laptop.jpg" }, { Photo: "" }]);
    const m = setImageMapping(createMapping(), 7, { column: "Photo", source: "link" });
    const plan = (downloads) => runPreflight({ table: t, layers, mapping: m, folders: downloads ? { [LINK_FOLDER_KEY]: { name: "links", index: {}, downloads } } : {}, output: { name: "o", existingFileNames: [] }, formats: ["jpg"], namePattern: "{row}", pricing: { unitPrice: 1 } });
    it("needs no folder, but blocks until the links are downloaded", () => {
        const p = plan(null);
        expect(p.blocking.map((b) => b.code)).toEqual(["links_pending"]);
        expect(p.blocking[0].message).toMatch(/2 image\(s\) from links/);
    });
    it("uses downloaded files, skips failed links with the reason, and rows that aren't links", () => {
        const p = plan({ "https://a.test/ok.jpg": { file: "link-a.jpg" }, "https://a.test/404.jpg": { error: "Nothing at this link (404)." } });
        expect(p.ok).toBe(true);
        expect(p.items.map((i) => i.images)).toEqual([[{ layerId: 7, folderKey: LINK_FOLDER_KEY, file: "link-a.jpg", fit: "fit" }], []]);
        expect(p.warnings.find((w) => w.code === "link_failed").message).toMatch(/Nothing at this link \(404\)\..* in 1 row/);
        expect(p.warnings.find((w) => w.code === "not_a_link")).toMatchObject({ rows: [4] });
        expect(p.cost).toBe(2);
    });
});

describe("downloading links", () => {
    const response = (status, bytes, type = "image/jpeg", extra = {}) => ({
        ok: status >= 200 && status < 300,
        status,
        headers: { get: (h) => ({ "content-type": type, ...extra })[h.toLowerCase()] ?? null },
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    });
    it("downloads in parallel, retries once, explains failures and reuses earlier files", async () => {
        const calls = {};
        const fetchImpl = async (url) => {
            calls[url] = (calls[url] || 0) + 1;
            if (url.endsWith("/a.jpg")) return response(200, JPG, "application/octet-stream"); // wrong type header: bytes decide
            if (url.endsWith("/b.png")) return response(200, PNG, "image/png");
            if (url.endsWith("/flaky.jpg")) return calls[url] === 1 ? response(503, new Uint8Array(0)) : response(200, JPG);
            if (url.endsWith("/page")) return response(200, new TextEncoder().encode("<!doctype html><html>hello</html>"), "text/html");
            if (url.endsWith("/huge.jpg")) return response(200, JPG, "image/jpeg", { "content-length": String(MAX_IMAGE_BYTES + 5) });
            if (url.endsWith("/slow.jpg")) return new Promise(() => {});
            if (url.endsWith("/down.jpg")) throw new Error("getaddrinfo ENOTFOUND");
            return response(404, new Uint8Array(0), "text/html");
        };
        const folder = new FakeFolder("links");
        const urls = ["/a.jpg", "/b.png", "/flaky.jpg", "/page", "/huge.jpg", "/slow.jpg", "/down.jpg", "/missing.jpg"].map((p) => `https://x.test${p}`);
        const progress = [];
        const r = await downloadLinks({ urls, folder, fetch: fetchImpl, onProgress: (p) => progress.push(p), timeoutMs: 50 });
        expect(r["https://x.test/a.jpg"].file).toMatch(/^link-.*\.jpg$/);
        expect(r["https://x.test/b.png"].file).toMatch(/\.png$/);
        expect(r["https://x.test/flaky.jpg"].file).toBeTruthy();
        expect(calls["https://x.test/flaky.jpg"]).toBe(2);
        expect(r["https://x.test/page"].error).toMatch(/web page/);
        expect(r["https://x.test/huge.jpg"].error).toMatch(/30 MB/);
        expect(r["https://x.test/slow.jpg"].error).toMatch(/in time/);
        expect(r["https://x.test/down.jpg"].error).toMatch(/ENOTFOUND/);
        expect(calls["https://x.test/missing.jpg"]).toBe(1); // 404: no retry
        expect(progress[progress.length - 1]).toEqual({ done: 8, total: 8, failed: 5 });
        expect(folder.files.get(r["https://x.test/a.jpg"].file).bytes.length).toBe(JPG.length);
        // Next time: what worked is reused without a request.
        const again = await downloadLinks({ urls: ["https://x.test/a.jpg"], folder, fetch: fetchImpl, known: r });
        expect(again["https://x.test/a.jpg"]).toEqual(r["https://x.test/a.jpg"]);
        expect(calls["https://x.test/a.jpg"]).toBe(1);
    });
});

describe("store exports", () => {
    it("Shopify: one row per product, compare-at price as old price, main image from a later row, plain text", () => {
        const headers = ["Handle", "Title", "Body (HTML)", "Type", "Variant SKU", "Variant Price", "Variant Compare At Price", "Image Src", "Image Position"];
        const t = table(headers, [
            { Handle: "aurora", Title: "Aurora Laptop", "Body (HTML)": "<p>Thin &amp; light</p><ul><li>14 in</li></ul>", Type: "Laptops", "Variant SKU": "A1", "Variant Price": "1299.00", "Variant Compare At Price": "1500.00", "Image Src": "https://cdn.shopify.test/aurora.jpg", "Image Position": "1" },
            { Handle: "aurora", Title: "", "Variant SKU": "A1-B", "Variant Price": "1299.00", "Image Src": "https://cdn.shopify.test/aurora-2.jpg", "Image Position": "2" },
            { Handle: "pulse", Title: "Pulse Phone", "Variant Price": "799.00", "Variant Compare At Price": "", "Image Src": "", "Image Position": "" },
            { Handle: "pulse", Title: "", "Image Src": "https://cdn.shopify.test/pulse.jpg", "Image Position": "1" }
        ]);
        const store = detectStore(t.headers);
        expect(store.id).toBe("shopify");
        const { table: out, note } = prepareStoreTable(t, store);
        expect(note).toEqual({ store: "Shopify", products: 2, merged: 2, sale: 1 });
        expect(out.rows[0].values).toMatchObject({ Name: "Aurora Laptop", Price: "1299.00", "Old price": "1500.00", Photo: "https://cdn.shopify.test/aurora.jpg", SKU: "A1", Description: "Thin & light\n14 in", Category: "Laptops" });
        expect(out.rows[1].values).toMatchObject({ Name: "Pulse Phone", "Old price": "", Photo: "https://cdn.shopify.test/pulse.jpg" });
        expect(out.headers.filter((h) => h.store).map((h) => h.key)).toEqual(["Name", "Price", "Old price", "Photo", "SKU", "Description", "Category"]);
    });
    it("WooCommerce: sale price, first of several images, variations dropped", () => {
        const headers = ["ID", "Type", "SKU", "Name", "Short description", "Sale price", "Regular price", "Categories", "Images"];
        const t = table(headers, [
            { ID: "1", Type: "simple", SKU: "W1", Name: "Echo Headphones", "Short description": "<p>Noise cancelling</p>", "Sale price": "149", "Regular price": "199", Categories: "Audio > Headphones, Sale", Images: "https://shop.test/wp/echo.jpg, https://shop.test/wp/echo-2.jpg" },
            { ID: "2", Type: "variable", SKU: "W2", Name: "Orbit Watch", "Sale price": "", "Regular price": "350", Images: "https://shop.test/wp/orbit.jpg" },
            { ID: "3", Type: "variation", SKU: "W2-red", Name: "Orbit Watch - Red", "Regular price": "350" }
        ]);
        const store = detectStore(t.headers);
        expect(store.id).toBe("woocommerce");
        const { table: out, note } = prepareStoreTable(t, store);
        expect(note).toMatchObject({ products: 2, merged: 1, sale: 1 });
        expect(out.rows[0].values).toMatchObject({ Name: "Echo Headphones", Price: "149", "Old price": "199", Photo: "https://shop.test/wp/echo.jpg", Description: "Noise cancelling", Category: "Audio" });
        expect(out.rows[1].values).toMatchObject({ Price: "350", "Old price": "" });
    });
    it("Arabic store exports (Salla / Zid) are recognised by their column names", () => {
        const t = table(["اسم المنتج", "السعر", "السعر المخفض", "صورة المنتج", "رمز المنتج", "الوصف"], [
            { "اسم المنتج": "سماعة لاسلكية", "السعر": "٣٠٠", "السعر المخفض": "٢٤٩", "صورة المنتج": "https://cdn.salla.test/s.webp", "رمز المنتج": "S1", "الوصف": "<b>صوت</b> نقي" }
        ]);
        const store = detectStore(t.headers);
        expect(store).toMatchObject({ id: "arabic", label: "Salla / Zid" });
        const { table: out } = prepareStoreTable(t, store);
        expect(out.rows[0].values).toMatchObject({ Name: "سماعة لاسلكية", Price: "٢٤٩", "Old price": "٣٠٠", Photo: "https://cdn.salla.test/s.webp", SKU: "S1", Description: "صوت نقي" });
    });
    it("ordinary sheets are left alone; helpers handle messy cells", () => {
        expect(detectStore(table(["Name", "Price", "Photo"], []).headers)).toBeNull();
        expect(stripHtml("<p>a&nbsp;b</p><p>c</p>")).toBe("a b\nc");
        expect(firstImageLink("see https://a.test/1.jpg | https://a.test/2.jpg")).toBe("https://a.test/1.jpg");
        expect(firstImageLink("no links")).toBe("");
    });
});

describe("images from links in a job (SIMULATED host)", () => {
    it("places the downloaded image like any other file", async () => {
        const PATH = "/fake/t.psd";
        const host = createFakeHost({ templates: { [PATH]: { title: "t.psd", width: 800, height: 800, layers: [{ name: "Photo", kind: "smartObject", content: "old.jpg", bounds: { left: 100, top: 100, right: 500, bottom: 500 } }] } } });
        const port = createPhotoshopPort(host);
        const template = { entry: { nativePath: PATH, name: "t.psd" } };
        const info = await port.inspectTemplate(template);
        const links = new FakeFolder("links");
        const downloads = await downloadLinks({ urls: ["https://x.test/a.jpg"], folder: links, fetch: async () => ({ ok: true, status: 200, headers: { get: () => null }, arrayBuffer: async () => JPG.buffer.slice(JPG.byteOffset, JPG.byteOffset + JPG.byteLength) }) });
        const id = info.layers[0].id;
        const m = setImageMapping(createMapping(), id, { column: "Photo", source: "link", fit: "fill" });
        const p = runPreflight({ table: table(["Photo"], [{ Photo: "https://x.test/a.jpg" }]), layers: info.layers, mapping: m, folders: { [LINK_FOLDER_KEY]: { name: "links", index: {}, downloads } }, output: { name: "o", existingFileNames: [] }, formats: ["jpg"], namePattern: "{row}", pricing: { unitPrice: 1 } });
        const out = new FakeFolder("out");
        const r = await runDesignJob({ port, billing: { startJob: async () => ({ jobId: "j" }), reportItem: async () => {}, finishJob: async () => ({}) }, template, templateLayers: info.layers, plan: p, folders: { [LINK_FOLDER_KEY]: { name: "links", entry: links } }, output: { entry: out } });
        expect(r.items[0].status).toBe(ITEM.succeeded);
        const placed = JSON.parse(new TextDecoder().decode(out.files.get("1.jpg").bytes.subarray(6, 4 + ((out.files.get("1.jpg").bytes[4] << 8) | out.files.get("1.jpg").bytes[5]))));
        expect(placed[0].content).toBe(downloads["https://x.test/a.jpg"].file);
    });
});
