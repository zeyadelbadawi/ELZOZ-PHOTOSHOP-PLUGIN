// Behavioral fake of the parts of the Photoshop DOM / UXP storage that the
// adapters use. It models documented semantics (duplicate creates a new
// document, history states can be restored, saveAs(asCopy) writes a file,
// batchPlay file arguments are session tokens) so contract tests can check
// call order and invariants. It is NOT evidence that Photoshop behaves this way.

import { imageInfo } from "./imageInfo.js";

let nextId = 1000;

/** A structurally valid JPEG (SOI, COM with payload, SOF0 with size, EOI). Not decodable pixels. */
export function fakeJpeg(width, height, payload = "") {
    const data = new TextEncoder().encode(payload).slice(0, 60000);
    const com = [0xff, 0xfe, ((data.length + 2) >> 8) & 0xff, (data.length + 2) & 0xff, ...data];
    const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
    return Uint8Array.from([0xff, 0xd8, ...com, ...sof, 0xff, 0xd9]);
}

/** Read the document state embedded by fakeJpeg. */
export function readFakeJpeg(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const len = (b[4] << 8) | b[5];
    return JSON.parse(new TextDecoder().decode(b.subarray(6, 4 + len)));
}

class FakeFile {
    constructor(folder, name, meta = {}) {
        this.folder = folder;
        this.name = name;
        this.isFile = true;
        this.isFolder = false;
        this.nativePath = `${folder.nativePath}/${name}`;
        this.size = 0;
        this.bytes = meta.bytes || null;
        // {width, height}: given explicitly, or read from real image bytes (null = not decodable)
        this.image = meta.image || (meta.bytes ? imageInfo(meta.bytes) : null);
    }
    async read() {
        if (!this.folder.files.has(this.name)) throw new Error("not found");
        const b = this.bytes || new Uint8Array(this.size);
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    }
    async write(data, { append = false } = {}) {
        const add = new Uint8Array(data);
        const prev = append && this.bytes ? this.bytes : new Uint8Array(0);
        const next = new Uint8Array(prev.length + add.length);
        next.set(prev);
        next.set(add, prev.length);
        this.bytes = next;
        this.size = next.length;
        this.folder.files.set(this.name, this);
        return add.length;
    }
    async delete() {
        this.folder.files.delete(this.name);
    }
    async getMetadata() {
        if (!this.folder.files.has(this.name)) throw new Error("not found");
        return { size: this.size, name: this.name };
    }
}

export class FakeFolder {
    constructor(name, files = {}) {
        this.name = name;
        this.isFolder = true;
        this.isFile = false;
        this.nativePath = `/fake/${name}`;
        this.files = new Map();
        this.failWrites = false;
        for (const [fname, meta] of Object.entries(files)) {
            const f = new FakeFile(this, fname, meta);
            f.size = meta.bytes ? meta.bytes.length : meta.size ?? 1000;
            this.files.set(fname, f);
        }
    }
    async getEntries() {
        return [...this.files.values()];
    }
    async getEntry(name) {
        const f = this.files.get(name);
        if (!f) throw new Error(`Could not find an entry of '${name}'`);
        return f;
    }
    async createFile(name, { overwrite = false } = {}) {
        if (this.files.has(name) && !overwrite) throw new Error(`file exists: ${name}`);
        return new FakeFile(this, name);
    }
    async createFolder(name) {
        if (!this.folders) this.folders = new Map();
        const f = new FakeFolder(`${this.name}/${name}`);
        f.parent = this;
        f.shortName = name;
        this.folders.set(name, f);
        return f;
    }
    async delete() {
        if (this.files.size) throw new Error("folder not empty");
        if (this.parent) this.parent.folders.delete(this.shortName);
        this.deleted = true;
    }
}

class FakeLayer {
    constructor(doc, spec) {
        this.doc = doc;
        this.id = spec.id ?? nextId++;
        this.name = spec.name;
        this.kind = spec.kind;
        this.visible = spec.visible ?? true;
        this.opacity = spec.opacity ?? 100;
        this.locked = false;
        this.b = { ...(spec.bounds || { left: 0, top: 0, right: 100, bottom: 100 }) };
        this.content = spec.content ?? null;
        this.embedded = spec.embedded ?? null;
        this.pixels = spec.pixels ?? null;
        this.fontSize = spec.fontSize ?? null;
        this.color = spec.color ?? null;
        // Text scales with its box: remember the designed box height.
        this.baseHeight = spec.baseHeight ?? this.b.bottom - this.b.top;
        this.layers = spec.layers ? spec.layers.map((s) => new FakeLayer(doc, s)) : null;
        if (spec.kind === "text") {
            const layer = this;
            this._text = spec.text ?? "";
            if (doc.env.domText) {
                this.textItem = {
                    get contents() {
                        return layer._text;
                    },
                    set contents(v) {
                        if (doc.env.rejectText) return; // simulate Photoshop ignoring the write
                        layer._text = v;
                    }
                };
            }
        }
    }
    scaleFactor() {
        return this.baseHeight > 0 ? (this.b.bottom - this.b.top) / this.baseHeight : 1;
    }
    get boundsNoEffects() {
        return { ...this.b };
    }
    async scale(wPct, hPct) {
        this.doc.requireModal();
        const cx = (this.b.left + this.b.right) / 2;
        const cy = (this.b.top + this.b.bottom) / 2;
        const w = ((this.b.right - this.b.left) * wPct) / 100;
        const h = ((this.b.bottom - this.b.top) * hPct) / 100;
        this.b = { left: cx - w / 2, top: cy - h / 2, right: cx + w / 2, bottom: cy + h / 2 };
    }
    async translate(dx, dy) {
        this.doc.requireModal();
        this.b = { left: this.b.left + dx, top: this.b.top + dy, right: this.b.right + dx, bottom: this.b.bottom + dy };
    }
    toSpec(keepIds) {
        return {
            id: keepIds ? this.id : undefined,
            name: this.name,
            kind: this.kind,
            visible: this.visible,
            opacity: this.opacity,
            bounds: { ...this.b },
            content: this.content,
            embedded: this.embedded,
            pixels: this.pixels,
            fontSize: this.fontSize,
            color: this.color,
            baseHeight: this.baseHeight,
            text: this._text,
            layers: this.layers ? this.layers.map((l) => l.toSpec(keepIds)) : undefined
        };
    }
}

class FakeDocument {
    constructor(env, { title, path, width = 1000, height = 1000, layers }) {
        this.env = env;
        this.id = nextId++;
        this.title = title;
        this.path = path;
        this.width = width;
        this.height = height;
        this.layers = layers.map((s) => new FakeLayer(this, s));
        this.history = [this.serialize()];
        this.historyIndex = 0;
        this.closed = false;
        this.saveCalls = 0;
        this.activeLayers = [];
        const doc = this;
        this.saveAs = {};
        for (const fmt of ["jpg", "png", "psd"]) {
            this.saveAs[fmt] = async (entry, options, asCopy) => {
                doc.requireModal();
                env.calls.push({ op: "saveAs", fmt, doc: doc.id, name: entry.name, options, asCopy });
                if (!asCopy) throw new Error("test: saveAs must be called with asCopy=true");
                if (entry.folder.failWrites || env.failFormats.includes(fmt)) throw new Error("disk full");
                env.jpgCount = (env.jpgCount || 0) + (fmt === "jpg" ? 1 : 0);
                if (fmt === "jpg" && env.failJpgAt && env.jpgCount === env.failJpgAt) throw new Error("Photoshop could not save the JPEG");
                entry.snapshot = doc.serialize(); // what the file "contains"
                if ((fmt === "jpg" || fmt === "png") && env.render) {
                    entry.bytes = await env.render(doc, fmt);
                    if (env.wrongFrameSize) entry.bytes = fakeJpeg(doc.width + 2, doc.height, "");
                    entry.size = env.zeroByteFormats.includes(fmt) ? 0 : entry.bytes.length;
                } else if (fmt === "psd" && env.writePsd) {
                    entry.bytes = env.writePsd(doc);
                    entry.size = env.zeroByteFormats.includes(fmt) ? 0 : entry.bytes.length;
                } else if (fmt === "jpg") {
                    entry.bytes = fakeJpeg(env.wrongFrameSize ? doc.width + 2 : doc.width, doc.height, entry.snapshot);
                    entry.size = entry.bytes.length;
                } else {
                    entry.size = env.zeroByteFormats.includes(fmt) ? 0 : 2048;
                }
                entry.folder.files.set(entry.name, entry);
            };
        }
    }
    requireModal() {
        if (!this.env.modalDepth) throw new Error("test: Photoshop state changed outside executeAsModal");
    }
    serialize() {
        return JSON.stringify(this.layers.map((l) => l.toSpec(true)));
    }
    // Real DOM Layer objects are id-based proxies that stay valid across history
    // changes, so restore updates existing objects in place instead of replacing them.
    restore(json) {
        const existing = new Map(this.allLayers().map((l) => [l.id, l]));
        const build = (spec) => {
            const layer = existing.get(spec.id) || new FakeLayer(this, spec);
            layer.name = spec.name;
            layer.visible = spec.visible;
            layer.opacity = spec.opacity;
            layer.b = { ...spec.bounds };
            layer.content = spec.content;
            if (spec.kind === "text") layer._text = spec.text;
            layer.layers = spec.layers ? spec.layers.map(build) : null;
            return layer;
        };
        this.layers = JSON.parse(json).map(build);
    }
    allLayers() {
        const out = [];
        const walk = (ls) => ls.forEach((l) => (out.push(l), l.layers && walk(l.layers)));
        walk(this.layers);
        return out;
    }
    findLayer(id) {
        return this.allLayers().find((l) => l.id === id);
    }
    get activeHistoryState() {
        return { index: this.historyIndex };
    }
    set activeHistoryState(state) {
        this.requireModal();
        this.historyIndex = state.index;
        this.restore(this.history[state.index]);
        this.env.calls.push({ op: "revert", doc: this.id, to: state.index });
    }
    async suspendHistory(fn, name) {
        this.requireModal();
        try {
            await fn({ document: this });
        } finally {
            this.history = this.history.slice(0, this.historyIndex + 1);
            this.history.push(this.serialize());
            this.historyIndex = this.history.length - 1;
            this.env.calls.push({ op: "suspendHistory", doc: this.id, name });
        }
    }
    async duplicate(name) {
        this.requireModal();
        const copy = new FakeDocument(this.env, { title: name, path: "", width: this.width, height: this.height, layers: this.layers.map((l) => l.toSpec(false)) });
        this.env.app.documents.push(copy);
        this.env.calls.push({ op: "duplicate", from: this.id, to: copy.id });
        return copy;
    }
    async resizeImage(width, height) {
        this.requireModal();
        const fx = width / this.width;
        const fy = height / this.height;
        for (const l of this.allLayers()) l.b = { left: l.b.left * fx, top: l.b.top * fy, right: l.b.right * fx, bottom: l.b.bottom * fy };
        this.width = width;
        this.height = height;
        this.env.calls.push({ op: "resizeImage", doc: this.id, width, height });
    }
    async save() {
        this.saveCalls++;
        this.env.calls.push({ op: "save", doc: this.id });
    }
    async closeWithoutSaving() {
        this.requireModal();
        this.closed = true;
        this.env.app.documents = this.env.app.documents.filter((d) => d !== this);
        this.env.calls.push({ op: "close", doc: this.id });
    }
}

/**
 * @param {object} cfg
 * @param {string} cfg.version         Photoshop version string
 * @param {object} cfg.templates       { nativePath: {title, layers:[spec]} }
 * @param {Function} [cfg.loadTemplate] async (entry) -> spec, e.g. from a real PSD via psdTemplate.js
 */
export function createFakeHost(cfg = {}) {
    const env = {
        render: cfg.render || null, // async (doc, "jpg"|"png") -> Uint8Array (browser canvas renderer)
        writePsd: cfg.writePsd || null, // (doc) -> Uint8Array (ag-psd writer)
        calls: [],
        modalDepth: 0,
        domText: cfg.domText ?? true,
        rejectText: false,
        failFormats: [],
        zeroByteFormats: [],
        failReplace: new Set(),
        cancelAfterItems: null,
        tokens: new Map()
    };
    const app = {
        version: cfg.version || "26.11.0",
        documents: [],
        async open(entry) {
            if (!env.modalDepth) throw new Error("test: open outside modal");
            const spec = (cfg.templates && cfg.templates[entry.nativePath]) || (cfg.loadTemplate && (await cfg.loadTemplate(entry)));
            if (!spec) throw new Error("Could not open the document because the file is not a valid Photoshop document.");
            const doc = new FakeDocument(env, { ...spec, path: entry.nativePath, layers: spec.layers });
            app.documents.push(doc);
            env.calls.push({ op: "open", doc: doc.id });
            return doc;
        }
    };
    Object.defineProperty(app, "activeDocument", { get: () => app.documents[app.documents.length - 1] || null });
    env.app = app;

    let progressCalls = 0;
    const core = {
        async executeAsModal(fn, opts) {
            if (!opts || !opts.commandName) throw new Error("test: executeAsModal requires commandName");
            env.modalDepth++;
            const ctx = {
                get isCancelled() {
                    return env.cancelAfterItems !== null && progressCalls > env.cancelAfterItems;
                },
                reportProgress(p) {
                    progressCalls++;
                    env.calls.push({ op: "progress", value: p.value });
                }
            };
            try {
                return await fn(ctx);
            } finally {
                env.modalDepth--;
            }
        }
    };

    const activeDoc = () => app.documents[app.documents.length - 1];
    const action = {
        async batchPlay(descriptors) {
            const doc = activeDoc();
            doc.requireModal();
            const out = [];
            for (const d of descriptors) {
                env.calls.push({ op: "batchPlay", _obj: d._obj, layerID: d.layerID });
                if (d._obj === "select") {
                    doc.activeLayers = [doc.findLayer(d._target[0]._id)];
                    out.push({});
                } else if (d._obj === "set" && d._target[0]._ref === "textLayer") {
                    doc.findLayer(d._target[0]._id)._text = d.to.textKey;
                    out.push({});
                } else if (d._obj === "placedLayerReplaceContents") {
                    const file = env.tokens.get(d.null._path);
                    if (!file || d.null._kind !== "local") throw new Error("Invalid file token used");
                    const layer = doc.activeLayers[0];
                    if (!layer || layer.id !== d.layerID) {
                        out.push({ _obj: "error", result: -25920, message: "The command “Replace Contents” is not currently available." });
                        continue;
                    }
                    if (env.failReplace.has(file.name) || !file.image) throw new Error("Could not complete the Replace Contents command because the file is not compatible.");
                    // Replace keeps the transform; content size follows the image.
                    const cx = (layer.b.left + layer.b.right) / 2;
                    const cy = (layer.b.top + layer.b.bottom) / 2;
                    layer.b = { left: cx - file.image.width / 2, top: cy - file.image.height / 2, right: cx + file.image.width / 2, bottom: cy + file.image.height / 2 };
                    layer.content = file.name;
                    out.push({});
                } else if (d._obj === "placeEvent") {
                    const file = env.tokens.get(d.null._path);
                    if (!file || !file.image || env.failReplace.has(file.name)) throw new Error("Could not complete the Place command because the file is not compatible.");
                    const target = doc.activeLayers[0];
                    const placed = new FakeLayer(doc, {
                        name: file.name,
                        kind: "smartObject",
                        content: file.name,
                        bounds: { left: 0, top: 0, right: file.image.width, bottom: file.image.height }
                    });
                    const siblings = parentList(doc, target);
                    siblings.splice(siblings.indexOf(target), 0, placed);
                    doc.activeLayers = [placed];
                    out.push({});
                } else {
                    out.push({ _obj: "error", result: -1, message: `unknown descriptor ${d._obj}` });
                }
            }
            return out;
        }
    };

    function parentList(doc, layer) {
        const search = (list) => {
            if (list.includes(layer)) return list;
            for (const l of list) if (l.layers) {
                const r = search(l.layers);
                if (r) return r;
            }
            return null;
        };
        return search(doc.layers);
    }

    const photoshop = {
        app,
        core,
        action,
        constants: {
            LayerKind: { TEXT: "text", SMARTOBJECT: "smartObject", NORMAL: "pixel", GROUP: "group" },
            AnchorPosition: { MIDDLECENTER: "middleCenter" }
        }
    };
    const tempRoot = new FakeFolder("temp");
    env.tempRoot = tempRoot;
    const uxp = {
        versions: { uxp: "uxp-9.0.2" },
        storage: {
            secureStorage: {},
            formats: { binary: Symbol("binary"), utf8: Symbol("utf8") },
            localFileSystem: {
                async getTemporaryFolder() {
                    return tempRoot;
                },
                createSessionToken(entry) {
                    const t = `token-${env.tokens.size + 1}`;
                    env.tokens.set(t, entry);
                    return t;
                }
            }
        }
    };
    return { photoshop, uxp, env };
}
