// End-to-end harness (development tool, never shipped).
// The real Elzoz App + real services + real credits backend (through
// e2e-server.js), running on a SIMULATED Photoshop host in Chromium:
// - templates are the real fixture PSDs, parsed with ag-psd
// - images are the real fixture files (bytes), placed by the simulator
// - JPG/PNG/frames are rendered with canvas and stamped "SIMULATED"
// - PSD exports are written with ag-psd; videos are real MOV files
// Chromium is not UXP and the simulator is not Photoshop. A banner on every
// screen says so.
import React from "react";
import ReactDOM from "react-dom";
import * as XLSX from "xlsx";
import App from "../../src/app/App.jsx";
import { createServices } from "../../src/app/services.js";
import { createFakeHost, FakeFolder } from "../fakes/fakePhotoshop.js";
import { createPixelStore, templateFromPsd } from "../fakes/psdTemplate.js";
import { writeSimulatedPsd } from "../fakes/psdWriter.js";
import { createCanvasRenderer } from "../fakes/canvasRenderer.js";

const params = new URLSearchParams(location.search);
const THEMES = {
    // Approximations of Photoshop's darkest and lightest UI themes (simulated --uxp-host-* variables)
    dark: { bg: "#323232", text: "#e6e6e6", text2: "#a6a6a6", border: "#4b4b4b" },
    light: { bg: "#f0f0f0", text: "#2c2c2c", text2: "#6e6e6e", border: "#c8c8c8" }
};
const theme = THEMES[params.get("theme")] || THEMES.dark;
const rootStyle = document.documentElement.style;
rootStyle.setProperty("--uxp-host-background-color", theme.bg);
rootStyle.setProperty("--uxp-host-text-color", theme.text);
rootStyle.setProperty("--uxp-host-text-color-secondary", theme.text2);
rootStyle.setProperty("--uxp-host-border-color", theme.border);
document.body.style.background = theme.bg;
document.body.dataset.theme = params.get("theme") || "dark";

const pixelStore = createPixelStore();
const templateBytes = new Map(); // nativePath -> bytes
const allFiles = new Map(); // file name -> FakeFile (latest wins), for the renderer and PSD writer
// Files written by the plugin into the temporary folder (images downloaded from links) render too.
const tempFile = (name) => {
    const walk = (folder) => folder.files.get(name) || [...(folder.folders ? folder.folders.values() : [])].map(walk).find(Boolean) || null;
    return host && host.env.tempRoot ? walk(host.env.tempRoot) : null;
};
const fileBytes = (name) => (allFiles.get(name) || tempFile(name) || {}).bytes || null;

const host = createFakeHost({
    version: params.get("ps") || "26.11.0",
    loadTemplate: async (entry) => {
        const bytes = templateBytes.get(entry.nativePath);
        return bytes ? templateFromPsd(bytes, pixelStore, entry.name) : null;
    },
    // Select Subject results for the simulator (relative boxes): the laptop sits right of centre.
    subjects: { "laptop.jpg": { l: 0.5, t: 0.2, r: 0.95, b: 0.85 } },
    render: createCanvasRenderer({ pixelStore, fileBytes, subjectOf: (name) => (name in host.env.subjects ? host.env.subjects[name] : host.env.defaultSubject) }),
    writePsd: (doc) => writeSimulatedPsd(doc, { pixelStore, fileBytes })
});

const fetchBytes = async (rel) => {
    const res = await fetch(`/fixtures/${rel}`);
    if (!res.ok) throw new Error(`fixture missing: ${rel}`);
    return new Uint8Array(await res.arrayBuffer());
};

async function fixtureFolder(dir, name = dir.split("/").pop()) {
    const names = await (await fetch(`/fixtures-list/${dir}`)).json();
    const files = {};
    for (const n of names) files[n] = { bytes: await fetchBytes(`${dir}/${n}`) };
    const folder = new FakeFolder(name, files);
    folder.nativePath = `/Users/demo/Elzoz/${dir}`;
    for (const f of folder.files.values()) allFiles.set(f.name, f);
    return folder;
}

const queue = []; // what the next native picker returns, set by the test
const outputs = new Map();
const folders = new Map();

const secureStore = {
    async getItem(k) {
        const v = localStorage.getItem(`secure:${k}`);
        return v === null ? null : new TextEncoder().encode(v);
    },
    async setItem(k, v) {
        localStorage.setItem(`secure:${k}`, typeof v === "string" ? v : new TextDecoder().decode(v));
    },
    async removeItem(k) {
        localStorage.removeItem(`secure:${k}`);
    }
};

Object.assign(host.uxp, {
    shell: { openExternal: (u) => console.log("openExternal", u) },
    versions: { ...host.uxp.versions, plugin: "1.0.0-e2e" }
});
host.uxp.storage.secureStorage = secureStore;
const tokens = new Map(); // persistent tokens (saved projects); "revoked" ones simulate a moved file
Object.assign(host.uxp.storage.localFileSystem, {
    async createPersistentToken(entry) {
        const token = `tok-${tokens.size + 1}-${entry.name}`;
        tokens.set(token, entry);
        return token;
    },
    async getEntryForPersistentToken(token) {
        const entry = tokens.get(token);
        if (!entry) throw new Error("Invalid token");
        return entry;
    },
    async getFileForOpening() {
        const next = queue.shift();
        if (!next) return null; // user cancelled the dialog
        const bytes = await fetchBytes(next.file);
        const name = next.file.split("/").pop();
        const nativePath = `/Users/demo/Elzoz/${next.file}`;
        if (/\.ps[db]$/i.test(name)) templateBytes.set(nativePath, bytes);
        return { name, nativePath, isFile: true, read: async () => bytes.buffer.slice(0) };
    },
    async getFolder() {
        const next = queue.shift();
        if (!next) return null;
        if (next.output) {
            const out = outputs.get(next.output) || new FakeFolder(next.output);
            out.nativePath = `/Users/demo/Desktop/${next.output}`;
            outputs.set(next.output, out);
            return out;
        }
        const f = folders.get(next.folder) || (await fixtureFolder(next.folder));
        folders.set(next.folder, f);
        return f;
    }
});

window.__harness = {
    simulated: true,
    host,
    queue: (...items) => queue.push(...items),
    /** Simulate a file/folder that was moved since the project was saved. */
    revokeTokens: (match) => [...tokens.keys()].filter((k) => k.includes(match)).forEach((k) => tokens.delete(k)),
    /** Append rows to a picked spreadsheet (the client sent more products); its saved project sees them. */
    async addRows(fileName, rows) {
        const entry = [...tokens.values()].find((e) => e.name === fileName);
        const wb = XLSX.read(new Uint8Array(await entry.read()), { type: "array" });
        XLSX.utils.sheet_add_aoa(wb.Sheets[wb.SheetNames[0]], rows, { origin: -1 });
        const bytes = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
        entry.read = async () => bytes.buffer.slice(0);
    },
    /** Copy a fixture file into a loaded folder under a new name (the user fixing a missing/corrupt file). */
    async putFile(folder, name, fixture) {
        const f = folders.get(folder);
        const bytes = await fetchBytes(fixture);
        const file = await f.createFile(name, { overwrite: true });
        await file.write(bytes);
        file.image = (await import("../fakes/imageInfo.js")).imageInfo(bytes);
        allFiles.set(name, file);
    },
    outputNames: (out) => {
        // Relative paths, including subfolders ("NEW/1_Name.jpg").
        const walk = (f, prefix) => [...f.files.keys()].map((n) => prefix + n).concat(...[...(f.folders ? f.folders.entries() : [])].map(([n, sub]) => walk(sub, `${prefix}${n}/`)));
        const root = outputs.get(out);
        return root ? walk(root, "") : [];
    },
    async outputBase64(out, name) {
        let f = outputs.get(out);
        const parts = name.split("/");
        for (const seg of parts.slice(0, -1)) f = f.folders.get(seg);
        const b = f.files.get(parts[parts.length - 1]).bytes;
        let s = "";
        for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
        return btoa(s);
    }
};

const banner = document.getElementById("sim-banner");
banner.textContent = `SIMULATED Photoshop host · Chromium, not UXP · theme: ${document.body.dataset.theme} · credits: local test server`;

// Simulated internet for images from links: images.example.test serves the fixture product images;
// "/page" is a web page (not an image) and anything else is a 404.
const internet = { requests: [] };
async function simulatedFetch(url) {
    internet.requests.push(url);
    const u = new URL(url);
    const reply = (status, bytes, type) => ({ ok: status >= 200 && status < 300, status, headers: { get: (h) => (h.toLowerCase() === "content-type" ? type : null) }, arrayBuffer: async () => bytes.buffer.slice(0) });
    await new Promise((r) => setTimeout(r, 120)); // network latency, so progress is visible
    if (u.hostname === "docs.google.com") {
        // Google Sheets export: "OFFERS…" is shared (the offers fixture), anything else asks for a login (HTML).
        const m = u.pathname.match(/^\/spreadsheets\/d\/([\w-]+)\/export$/);
        if (m && m[1].startsWith("OFFERS")) {
            const bytes = await fetchBytes("spreadsheets/offers.xlsx");
            return { ok: true, status: 200, headers: { get: (h) => (h.toLowerCase() === "content-disposition" ? `attachment; filename="Weekly offers.xlsx"; filename*=UTF-8''${encodeURIComponent("عروض الأسبوع")}.xlsx` : null) }, arrayBuffer: async () => bytes.buffer.slice(0) };
        }
        return reply(200, new TextEncoder().encode("<!doctype html><title>Sign in - Google Accounts</title>"), "text/html");
    }
    if (u.hostname !== "images.example.test") throw new Error("getaddrinfo ENOTFOUND " + u.hostname);
    if (u.pathname === "/page") return reply(200, new TextEncoder().encode("<!doctype html><html><body>Product page</body></html>"), "text/html");
    internet.files = internet.files || (await (await fetch("/fixtures-list/images/products")).json());
    const name = decodeURIComponent(u.pathname.slice(1));
    if (!internet.files.includes(name)) return reply(404, new Uint8Array(0), "text/html");
    return reply(200, await fetchBytes(`images/products/${name}`), "image/*");
}
window.__harness.internet = internet;

ReactDOM.render(<App services={createServices({ photoshop: host.photoshop, uxp: host.uxp, os: { homedir: () => "/Users/demo" }, fetch: simulatedFetch })} />, document.getElementById("root"));
