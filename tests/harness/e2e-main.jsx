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
const fileBytes = (name) => (allFiles.get(name) || {}).bytes || null;

const host = createFakeHost({
    version: params.get("ps") || "26.11.0",
    loadTemplate: async (entry) => {
        const bytes = templateBytes.get(entry.nativePath);
        return bytes ? templateFromPsd(bytes, pixelStore, entry.name) : null;
    },
    render: createCanvasRenderer({ pixelStore, fileBytes }),
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
Object.assign(host.uxp.storage.localFileSystem, {
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

ReactDOM.render(<App services={createServices({ photoshop: host.photoshop, uxp: host.uxp })} />, document.getElementById("root"));
