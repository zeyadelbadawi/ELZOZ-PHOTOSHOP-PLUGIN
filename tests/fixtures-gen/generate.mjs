// Generates the Elzoz test-fixture package (spreadsheets, PSD templates, video
// configs) into test-artifacts/fixtures. Images come from images.py.
// All data is synthetic. Usage: node tests/fixtures-gen/generate.mjs
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import * as XLSX from "xlsx";
import { writePsdBuffer, readPsd } from "ag-psd";

const OUT = path.resolve(process.argv[2] || "test-artifacts/fixtures");
const dirs = { sheets: path.join(OUT, "spreadsheets"), psd: path.join(OUT, "templates"), video: path.join(OUT, "video") };
Object.values(dirs).forEach((d) => fs.mkdirSync(d, { recursive: true }));
const manifest = [];
const add = (file, kind, purpose, scenarios) => manifest.push({ file: path.relative(OUT, file), kind, purpose, scenarios });

// ---------------------------------------------------------------- spreadsheets
function writeXlsx(file, sheets) {
    const wb = XLSX.utils.book_new();
    for (const [name, aoa] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
    XLSX.writeFile(wb, file);
    return file;
}

const HEAD = ["Name", "Price", "Description", "Photo", "Logo", "Badge"];
const valid = [
    HEAD,
    ["Aurora Laptop 14", "$1,299", "Thin, light, all-day battery.", "laptop.jpg", "elzoz-logo.png", "NEW"],
    ["Pulse Phone X", "$799", "Bright display, fast charging.", "phone", "nova.png", "HOT"],
    ["Echo Headphones", "$199", "Noise cancelling, 30 h battery.", "headphones.png", "acme.png", "SALE"],
    ["Orbit Watch", "$249", "Fitness and sleep tracking.", "watch.png", "elzoz-logo.png", ""],
    ["Lens Pro Camera", "$1,899", "24 MP, weather sealed.", "camera.jpeg", "nova.png", "PRO"],
    ["Glow Desk Lamp", "$59", "Warm light, three levels.", "lamp.jpg", "acme.png", ""],
    ["سماعة لاسلكية", "٢٤٩ ر.س", "صوت نقي وبطارية تدوم طويلًا.", "speaker.webp", "elzoz-logo.png", "جديد"],
    ["Comfort Desk Chair", "$329", "Ergonomic, breathable mesh.", "Desk Chair.jpg", "acme.png", "NEW"]
];
add(writeXlsx(path.join(dirs.sheets, "products-valid.xlsx"), { Products: valid }), "xlsx", "8 valid rows: text, Arabic, image names with/without extension, case-insensitive and spaced names, logos", ["A", "C", "E"]);

const edge = [
    ["Name", "name", "Price", "", "Photo", "Logo", "Notes"],
    ["Missing image", "dup header", "$10", "data under empty header", "does-not-exist.jpg", "acme.png", ""],
    ["Path traversal", "", "$11", "", "../secret.jpg", "acme.png", ""],
    ["Not an image", "", "$12", "", "notes.txt", "acme.png", ""],
    ["Corrupt image", "", "$13", "", "broken.jpg", "acme.png", "fails at render time"],
    ["Ambiguous stem", "", "$14", "", "mug", "acme.png", "mug.jpg and mug.png exist"],
    ["", "", "", "", "", "", ""],
    ["Empty price", "", "", "", "laptop.jpg", "", "price cell empty"],
    ["Long text " + "lorem ipsum ".repeat(25), "", "$15", "", "tiny.png", "nova.png", "300+ characters"],
    ["Name/with:illegal*chars?", "", "$16", "", "banner-wide.jpg", "nova.png", "file-name sanitizing"],
    ["Extreme aspect", "", "$17", "", "tall-skinny.png", "nova.png", "1:5 image"],
    [42, "", 0.5, "", "laptop.jpg", "nova.png", "numeric cells"]
];
add(writeXlsx(path.join(dirs.sheets, "products-edge.xlsx"), { Edge: edge, Second: [["Other"], ["sheet"]] }), "xlsx", "Duplicate and empty headers, missing/traversal/non-image/corrupt/ambiguous image refs, blank row, empty cells, long and illegal names, numbers, second sheet", ["B", "edge"]);

const recovery = [
    ["Name", "Price", "Description", "Photo", "Logo", "Badge"],
    ["Aurora Laptop 14", "$1,299", "Thin and light.", "laptop.jpg", "elzoz-logo.png", "NEW"],
    ["Pulse Phone X", "$799", "Fast charging.", "phone.jpg", "nova.png", ""],
    ["Mystery Speaker", "$99", "Image file is missing.", "speaker-missing.jpg", "acme.png", ""],
    ["Broken Mug", "$19", "Image file is corrupt.", "broken.jpg", "acme.png", ""]
];
add(writeXlsx(path.join(dirs.sheets, "products-recovery.xlsx"), { Products: recovery }), "xlsx", "1 missing image (preflight skip) + 1 corrupt image (render-time failure, retry after fixing)", ["B", "D"]);

const large = [HEAD];
const names = ["Aurora", "Pulse", "Echo", "Orbit", "Lens", "Glow", "Nimbus", "Vertex", "Nova", "Zen"];
const photos = ["laptop.jpg", "phone.jpg", "headphones.png", "watch.png", "camera.jpeg", "Lamp.JPG", "speaker.webp", "Desk Chair.jpg"];
for (let i = 1; i <= 1000; i++) large.push([`${names[i % 10]} Model ${i}`, `$${(9.99 + i).toFixed(2)}`, `Synthetic item #${i}`, photos[i % photos.length], "elzoz-logo.png", i % 7 === 0 ? "SALE" : ""]);
add(writeXlsx(path.join(dirs.sheets, "products-1000.xlsx"), { Products: large }), "xlsx", "1000 rows for performance (preflight + simulated batch timing)", ["perf"]);

const tooMany = [["Name"]];
for (let i = 1; i <= 5001; i++) tooMany.push([`Row ${i}`]);
add(writeXlsx(path.join(dirs.sheets, "too-many-rows.xlsx"), { S: tooMany }), "xlsx", "5001 rows: exceeds the 5000-row job limit (blocking error)", ["edge"]);
add(writeXlsx(path.join(dirs.sheets, "headers-only.xlsx"), { S: [HEAD] }), "xlsx", "Headers but no data (blocking error)", ["edge"]);

const csv = [HEAD.join(","), ...valid.slice(1, 4).map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\r\n");
fs.writeFileSync(path.join(dirs.sheets, "products.csv"), "﻿" + csv);
add(path.join(dirs.sheets, "products.csv"), "csv", "UTF-8 CSV with BOM", ["edge"]);

fs.writeFileSync(path.join(dirs.sheets, "corrupt.xlsx"), Buffer.from("PK\u0003\u0004 this zip is truncated and not a workbook"));
add(path.join(dirs.sheets, "corrupt.xlsx"), "xlsx", "Corrupt workbook (load error state)", ["edge"]);

// ---------------------------------------------------------------- PSD templates
const rgba = (w, h, fn) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const [r, g, b, a] = fn(x, y);
            const i = (y * w + x) * 4;
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
            data[i + 3] = a;
        }
    return { width: w, height: h, data };
};
const solid = (w, h, c) => rgba(w, h, () => [...c, 255]);
// Placeholder: grey with a diagonal cross, so an un-replaced Smart Object is obvious.
const placeholder = (w, h) => rgba(w, h, (x, y) => (Math.abs(x / w - y / h) < 0.01 || Math.abs(x / w - (1 - y / h)) < 0.01 ? [90, 90, 90, 255] : [200, 200, 200, 255]));
const gradient = (w, h, a, b) => rgba(w, h, (x, y) => {
    const t = y / h;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, 255];
});

const pngPlaceholder = fs.readFileSync(path.join(OUT, "images/products/tiny.png"));
function smartObject(name, left, top, w, h, linked) {
    const id = crypto.randomUUID();
    linked.push({ id, name: `${name}.png`, data: new Uint8Array(pngPlaceholder) });
    return {
        name,
        left,
        top,
        imageData: placeholder(w, h),
        placedLayer: { id, placed: id, type: "raster", transform: [left, top, left + w, top, left + w, top + h, left, top + h], width: 48, height: 48 }
    };
}
const text = (name, value, left, top, size, color = { r: 255, g: 255, b: 255 }) => ({
    name,
    text: { text: value, transform: [1, 0, 0, 1, left, top + size], style: { font: { name: "ArialMT" }, fontSize: size, fillColor: color } }
});

function writeTemplate(file, w, h, children, linkedFiles, composite) {
    const psd = { width: w, height: h, imageData: composite, children, linkedFiles };
    fs.writeFileSync(file, writePsdBuffer(psd, { invalidateTextLayers: true, generateThumbnail: false }));
    return file;
}

{
    const linked = [];
    const children = [
        { name: "Background", imageData: gradient(1080, 1350, [24, 28, 40], [60, 70, 100]), left: 0, top: 0 },
        {
            name: "Media",
            opened: true,
            children: [smartObject("Photo", 140, 300, 800, 600, linked), smartObject("Logo", 60, 60, 240, 96, linked)]
        },
        {
            name: "Card",
            opened: true,
            children: [
                { name: "Badge", imageData: solid(180, 64, [253, 185, 38]), left: 860, top: 60 },
                {
                    name: "Text",
                    opened: true,
                    children: [text("Name", "Product name", 80, 960, 64), text("Price", "$0.00", 80, 1060, 56, { r: 253, g: 185, b: 38 }), text("Description", "Short description", 80, 1150, 34, { r: 200, g: 205, b: 215 })]
                }
            ]
        },
        { name: "Footer", children: [text("Name", "Brand footer (duplicate name)", 80, 1270, 26, { r: 150, g: 150, b: 160 })] }
    ];
    const f = writeTemplate(path.join(dirs.psd, "product-card-1080x1350.psd"), 1080, 1350, children, linked, gradient(1080, 1350, [24, 28, 40], [60, 70, 100]));
    add(f, "psd", "Design template 4:5: nested groups (Card/Text), 3 text layers, 2 Smart Objects, pixel Badge (pixel placement target), Background, duplicate layer name 'Name' in Footer", ["A", "B", "D", "E"]);
}
{
    const linked = [];
    const children = [
        { name: "Background", imageData: gradient(1080, 1920, [10, 12, 20], [40, 30, 70]), left: 0, top: 0 },
        smartObject("Photo", 90, 520, 900, 900, linked),
        smartObject("Logo", 60, 80, 300, 120, linked),
        text("Name", "Product name", 90, 1500, 72),
        text("Price", "$0.00", 90, 1620, 64, { r: 253, g: 185, b: 38 })
    ];
    const f = writeTemplate(path.join(dirs.psd, "reel-1080x1920.psd"), 1080, 1920, children, linked, gradient(1080, 1920, [10, 12, 20], [40, 30, 70]));
    add(f, "psd", "Video template 9:16 (Reel/Story): Photo and Logo Smart Objects, Name and Price text", ["C"]);
}
{
    const linked = [];
    const children = [
        { name: "Background", imageData: solid(1080, 1080, [240, 240, 236]), left: 0, top: 0 },
        smartObject("Photo", 140, 140, 800, 600, linked),
        text("Name", "Product name", 140, 800, 60, { r: 20, g: 20, b: 30 })
    ];
    const f = writeTemplate(path.join(dirs.psd, "square-1080x1080.psd"), 1080, 1080, children, linked, solid(1080, 1080, [240, 240, 236]));
    add(f, "psd", "Square 1:1 template (aspect-mismatch case for Reel video; valid for Square)", ["C", "edge"]);
}
{
    const f = writeTemplate(path.join(dirs.psd, "no-mappable-layers.psd"), 800, 600, [{ name: "Background", imageData: solid(800, 600, [80, 80, 80]), left: 0, top: 0 }], [], solid(800, 600, [80, 80, 80]));
    add(f, "psd", "Only a background pixel layer: no text layers; the pixel layer can still take an image (minimal-template state)", ["edge"]);
}

// ---------------------------------------------------------------- video configurations
const videoConfigs = [
    { id: "reel-6s-30fps", valid: true, template: "reel-1080x1920.psd", spec: { format: "reel", fps: 30, durationMs: 6000, fadeOutMs: 500, tracks: { Name: { preset: "slideUp", startMs: 300, lengthMs: 800, easing: "easeOut" }, Price: { preset: "fadeIn", startMs: 900, lengthMs: 600, easing: "easeInOut" }, Photo: { preset: "kenBurns" }, Logo: { preset: "pop", startMs: 0, lengthMs: 500, easing: "backOut" } } }, expect: { width: 1080, height: 1920, frames: 180, durationMs: 6000, units: 2 } },
    { id: "reel-2s-24fps-preview", valid: true, template: "reel-1080x1920.psd", spec: { format: "reel", fps: 24, durationMs: 2000, fadeOutMs: 0, tracks: { Name: { preset: "slideLeft", startMs: 0, lengthMs: 700, easing: "linear" }, Photo: { preset: "zoomIn", startMs: 0, lengthMs: 800, easing: "easeOut" } } }, expect: { width: 1080, height: 1920, frames: 48, durationMs: 2000, units: 1 } },
    { id: "square-3s-25fps", valid: true, template: "square-1080x1080.psd", spec: { format: "square", fps: 25, durationMs: 3000, fadeOutMs: 300, tracks: { Name: { preset: "slideDown", startMs: 0, lengthMs: 600, easing: "easeOut" }, Photo: { preset: "slideRight", startMs: 200, lengthMs: 800, easing: "easeInOut" } } }, expect: { width: 1080, height: 1080, frames: 75, durationMs: 3000, units: 1 } },
    { id: "reel-on-square-template", valid: false, template: "square-1080x1080.psd", spec: { format: "reel", fps: 30, durationMs: 3000, tracks: {} }, expectError: "aspect_mismatch" },
    { id: "fps-60", valid: false, spec: { format: "reel", fps: 60, durationMs: 3000, tracks: {} }, expectError: "bad_fps" },
    { id: "too-short", valid: false, spec: { format: "reel", fps: 30, durationMs: 500, tracks: {} }, expectError: "bad_duration" },
    { id: "too-long", valid: false, spec: { format: "reel", fps: 30, durationMs: 61000, tracks: {} }, expectError: "bad_duration" },
    { id: "track-overflow", valid: false, spec: { format: "reel", fps: 30, durationMs: 2000, tracks: { Name: { preset: "fadeIn", startMs: 1800, lengthMs: 600 } } }, expectError: "track_overflow" },
    { id: "fade-too-long", valid: false, spec: { format: "reel", fps: 30, durationMs: 2000, fadeOutMs: 1500, tracks: {} }, expectError: "bad_fade" },
    { id: "max-60s-4k-pricing", valid: true, pricingOnly: true, spec: { durationMs: 60000, width: 3840, height: 2160 }, expect: { units: 24 } }
];
fs.writeFileSync(path.join(dirs.video, "video-configs.json"), JSON.stringify(videoConfigs, null, 2));
add(path.join(dirs.video, "video-configs.json"), "json", "Video configurations: 3 valid (durations 2-6 s, 24/25/30 fps, 9:16 and 1:1, all presets) and 6 invalid cases with the expected error code", ["C", "video"]);

// ---------------------------------------------------------------- read-back check (ag-psd) and manifest
const psdCheck = {};
for (const f of fs.readdirSync(dirs.psd).filter((n) => n.endsWith(".psd"))) {
    const psd = readPsd(fs.readFileSync(path.join(dirs.psd, f)), { skipCompositeImageData: true, skipLayerImageData: true, skipThumbnail: true, useImageData: true });
    const walk = (ls, p = []) => (ls || []).flatMap((l) => [{ path: [...p, l.name].join("/"), kind: l.children ? "group" : l.text ? "text" : l.placedLayer ? "smartObject" : "pixel" }, ...walk(l.children, [...p, l.name])]);
    psdCheck[f] = { width: psd.width, height: psd.height, layers: walk(psd.children) };
}
fs.writeFileSync(path.join(dirs.psd, "ag-psd-readback.json"), JSON.stringify(psdCheck, null, 2));

const images = [];
for (const sub of ["products", "logos"]) for (const n of fs.readdirSync(path.join(OUT, "images", sub)).sort()) images.push({ file: `images/${sub}/${n}`, bytes: fs.statSync(path.join(OUT, "images", sub, n)).size });
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({ generated: new Date().toISOString().slice(0, 10), synthetic: true, fixtures: manifest, images }, null, 2));
console.log(`fixtures: ${manifest.length} files + ${images.length} images -> ${OUT}`);
for (const [f, c] of Object.entries(psdCheck)) console.log(f, c.width + "x" + c.height, c.layers.map((l) => `${l.path}:${l.kind}`).join(", "));
