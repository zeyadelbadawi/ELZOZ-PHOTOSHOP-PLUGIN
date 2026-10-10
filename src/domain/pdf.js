// A small streaming PDF writer (features 13 and 14). Pure JS, no dependencies.
//
// It only needs what print PDFs and approval sheets use: JPEG images embedded
// as-is (DCTDecode, so no re-compression and no quality loss), vector lines,
// rectangles, Helvetica text (Latin only) and transparency. Objects are written
// as they are created (`write` appends to the file), so a 200-design print PDF
// never has to sit in memory: only page descriptions are kept until the end.

const enc = new TextEncoder();
export const MM = 72 / 25.4; // points per millimetre

/** Size and color model of a JPEG, read from its SOF marker. */
export function jpegInfo(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (b[0] !== 0xff || b[1] !== 0xd8) throw new Error("Not a JPEG file.");
    let adobe = false;
    let i = 2;
    while (i + 4 <= b.length) {
        if (b[i] !== 0xff) {
            i++;
            continue;
        }
        const marker = b[i + 1];
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) {
            i += marker === 0xff ? 1 : 2;
            continue;
        }
        const len = (b[i + 2] << 8) | b[i + 3];
        if (marker === 0xee && b[i + 4] === 0x41 && b[i + 5] === 0x64 && b[i + 6] === 0x6f && b[i + 7] === 0x62 && b[i + 8] === 0x65) adobe = true;
        // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC)
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            const height = (b[i + 5] << 8) | b[i + 6];
            const width = (b[i + 7] << 8) | b[i + 8];
            const components = b[i + 9];
            if (!width || !height) break;
            return { width, height, components, adobe };
        }
        if (marker === 0xda || marker === 0xd9) break;
        i += 2 + len;
    }
    throw new Error("This JPEG has no readable size.");
}

const num = (n) => {
    const r = Math.round(n * 1000) / 1000;
    return Object.is(r, -0) ? "0" : String(r);
};

/** Text that Helvetica (WinAnsi) can show; anything else becomes "?". */
export const latinOnly = (s) => /^[\x20-\x7e -ÿ]*$/.test(String(s));
const pdfString = (s) =>
    "(" +
    String(s)
        .replace(/[^\x20-\x7e -ÿ]/g, "?")
        .replace(/[\\()]/g, (c) => `\\${c}`)
        .replace(/[ -ÿ]/g, (c) => `\\${c.charCodeAt(0).toString(8).padStart(3, "0")}`) +
    ")";

/** Width of Helvetica text in points (approximate: average glyph widths). */
export function textWidth(text, size) {
    let w = 0;
    for (const ch of String(text)) w += /[iljtfI.,:;'| !]/.test(ch) ? 0.28 : /[mwMW@]/.test(ch) ? 0.85 : /[A-Z0-9#]/.test(ch) ? 0.64 : 0.53;
    return w * size;
}

/**
 * Page drawing commands. Coordinates are points from the bottom-left corner.
 */
export class PageContent {
    constructor() {
        this.ops = [];
        this.images = new Set();
        this.fonts = false;
        this.alphas = new Set();
    }
    image(name, x, y, w, h) {
        this.images.add(name);
        this.ops.push(`q ${num(w)} 0 0 ${num(h)} ${num(x)} ${num(y)} cm /${name} Do Q`);
        return this;
    }
    /** Clip the next drawing to a rectangle until restore(). */
    clip(x, y, w, h) {
        this.ops.push(`q ${num(x)} ${num(y)} ${num(w)} ${num(h)} re W n`);
        return this;
    }
    restore() {
        this.ops.push("Q");
        return this;
    }
    line(x1, y1, x2, y2, { width = 0.25, gray = 0 } = {}) {
        this.ops.push(`q ${num(width)} w ${num(gray)} G ${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S Q`);
        return this;
    }
    rect(x, y, w, h, { fill = null, stroke = null, width = 0.5 } = {}) {
        const f = fill ? `${fill.map(num).join(" ")} rg ` : "";
        const s = stroke ? `${stroke.map(num).join(" ")} RG ${num(width)} w ` : "";
        const op = fill && stroke ? "B" : fill ? "f" : "S";
        this.ops.push(`q ${f}${s}${num(x)} ${num(y)} ${num(w)} ${num(h)} re ${op} Q`);
        return this;
    }
    /** Helvetica text; `align` = left | center | right around x. Non-Latin characters show as "?". */
    text(str, x, y, { size = 10, bold = false, gray = 0, align = "left", alpha = null } = {}) {
        this.fonts = true;
        const w = textWidth(str, size);
        const tx = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
        let gs = "";
        if (alpha != null) {
            const name = `A${Math.round(alpha * 100)}`;
            this.alphas.add(name);
            gs = `/${name} gs `;
        }
        this.ops.push(`q ${gs}BT /${bold ? "F2" : "F1"} ${num(size)} Tf ${num(gray)} g ${num(tx)} ${num(y)} Td ${pdfString(str)} Tj ET Q`);
        return this;
    }
    toString() {
        return this.ops.join("\n");
    }
}

/**
 * Streaming writer. `write(Uint8Array)` must append to the output (it may be async).
 * Usage: const pdf = createPdfWriter(write, {title}); const im = await pdf.addJpeg(bytes);
 * pdf.addPage({width, height, content, trimBox}); await pdf.finish();
 */
export function createPdfWriter(write, { title = "", producer = "Elzoz" } = {}) {
    let offset = 0;
    const offsets = []; // object number -> byte offset
    let nextObj = 3; // 1 = catalog, 2 = page tree (written at the end)
    const pages = [];
    let imageCount = 0;
    const emit = async (data) => {
        const bytes = typeof data === "string" ? enc.encode(data) : data;
        offset += bytes.length;
        await write(bytes);
    };
    const begin = async (id) => {
        offsets[id] = offset;
        await emit(`${id} 0 obj\n`);
    };
    let started = false;
    const start = async () => {
        if (started) return;
        started = true;
        // Header + a binary comment so transfer tools treat the file as binary.
        await emit(new Uint8Array([...enc.encode("%PDF-1.4\n%"), 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
    };

    return {
        /** Embed a JPEG as-is. Returns {name, width, height}. */
        async addJpeg(bytes) {
            await start();
            const info = jpegInfo(bytes);
            const id = nextObj++;
            const name = `Im${++imageCount}`;
            const space = info.components === 1 ? "/DeviceGray" : info.components === 4 ? "/DeviceCMYK" : "/DeviceRGB";
            // Photoshop writes CMYK JPEGs inverted (Adobe APP14).
            const decode = info.components === 4 && info.adobe ? " /Decode [1 0 1 0 1 0 1 0]" : "";
            await begin(id);
            await emit(`<< /Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} /ColorSpace ${space} /BitsPerComponent 8 /Filter /DCTDecode${decode} /Length ${bytes.length} >>\nstream\n`);
            await emit(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
            await emit("\nendstream\nendobj\n");
            return { name, id, width: info.width, height: info.height };
        },
        /** Register a page; `content` is a PageContent. `images` maps names to addJpeg results. */
        addPage({ width, height, content, images = [], trimBox = null, bleedBox = null }) {
            pages.push({ width, height, content, images, trimBox, bleedBox });
        },
        get pageCount() {
            return pages.length;
        },
        get size() {
            return offset;
        },
        async finish() {
            await start();
            const fontIds = { F1: nextObj++, F2: nextObj++ };
            await begin(fontIds.F1);
            await emit("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n");
            await begin(fontIds.F2);
            await emit("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n");
            const pageIds = [];
            for (const p of pages) {
                const contentId = nextObj++;
                const pageId = nextObj++;
                pageIds.push(pageId);
                const stream = enc.encode(p.content.toString());
                await begin(contentId);
                await emit(`<< /Length ${stream.length} >>\nstream\n`);
                await emit(stream);
                await emit("\nendstream\nendobj\n");
                const xobjects = p.images.map((im) => `/${im.name} ${im.id} 0 R`).join(" ");
                const alphas = [...p.content.alphas].map((a) => `/${a} << /Type /ExtGState /ca ${Number(a.slice(1)) / 100} /CA ${Number(a.slice(1)) / 100} >>`).join(" ");
                const res = `<< /ProcSet [/PDF /Text /ImageC /ImageB] /Font << /F1 ${fontIds.F1} 0 R /F2 ${fontIds.F2} 0 R >>${xobjects ? ` /XObject << ${xobjects} >>` : ""}${alphas ? ` /ExtGState << ${alphas} >>` : ""} >>`;
                const box = (b) => `[${b.map(num).join(" ")}]`;
                await begin(pageId);
                await emit(
                    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(p.width)} ${num(p.height)}]${p.trimBox ? ` /TrimBox ${box(p.trimBox)}` : ""}${p.bleedBox ? ` /BleedBox ${box(p.bleedBox)}` : ""} /Resources ${res} /Contents ${contentId} 0 R >>\nendobj\n`
                );
            }
            await begin(2);
            await emit(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>\nendobj\n`);
            await begin(1);
            await emit("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
            const infoId = nextObj++;
            await begin(infoId);
            const now = new Date();
            const d = (n) => String(n).padStart(2, "0");
            const date = `D:${now.getUTCFullYear()}${d(now.getUTCMonth() + 1)}${d(now.getUTCDate())}${d(now.getUTCHours())}${d(now.getUTCMinutes())}${d(now.getUTCSeconds())}Z`;
            await emit(`<< /Producer ${pdfString(producer)} /Title ${pdfString(latinOnly(title) ? title : producer)} /CreationDate (${date}) >>\nendobj\n`);
            const xrefAt = offset;
            let xref = `xref\n0 ${nextObj}\n0000000000 65535 f \n`;
            for (let id = 1; id < nextObj; id++) xref += `${String(offsets[id] || 0).padStart(10, "0")} 00000 ${offsets[id] != null ? "n" : "f"} \n`;
            await emit(xref);
            await emit(`trailer\n<< /Size ${nextObj} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);
            return { pages: pages.length, size: offset };
        }
    };
}
