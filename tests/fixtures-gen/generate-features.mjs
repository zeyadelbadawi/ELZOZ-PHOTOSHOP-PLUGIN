// Fixtures for features 1-15 (scenario I). Separate from generate.mjs so the
// existing fixtures (and their recorded hashes) are not rewritten.
// Usage: node tests/fixtures-gen/generate-features.mjs
import fs from "node:fs";
import path from "node:path";
import { writePsdBuffer } from "ag-psd";

const OUT = path.resolve(process.argv[2] || "test-artifacts/fixtures");
const PSD = path.join(OUT, "templates");
fs.mkdirSync(PSD, { recursive: true });

// Deterministic ids, so regenerating gives identical files.
let seq = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

const rgba = (w, h, fn) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const [r, g, b, a] = fn(x, y);
            data.set([r, g, b, a], (y * w + x) * 4);
        }
    return { width: w, height: h, data };
};
const solid = (w, h, c) => rgba(w, h, () => [...c, 255]);
const placeholder = (w, h) => rgba(w, h, (x, y) => (Math.abs(x / w - y / h) < 0.01 || Math.abs(x / w - (1 - y / h)) < 0.01 ? [90, 90, 90, 255] : [200, 200, 200, 255]));
const gradient = (w, h, a, b) => rgba(w, h, (x, y) => {
    const t = y / h;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, 255];
});
const tiny = fs.readFileSync(path.join(OUT, "images/products/tiny.png"));

function smartObject(name, left, top, w, h, linked) {
    const id = nextId();
    linked.push({ id, name: `${name}.png`, data: new Uint8Array(tiny) });
    return { name, left, top, imageData: placeholder(w, h), placedLayer: { id, placed: id, type: "raster", transform: [left, top, left + w, top, left + w, top + h, left, top + h], width: 48, height: 48 } };
}
const text = (name, value, left, top, size, color = { r: 255, g: 255, b: 255 }) => ({
    name,
    text: { text: value, transform: [1, 0, 0, 1, left, top + size], style: { font: { name: "ArialMT" }, fontSize: size, fillColor: color } }
});
// A solid color fill layer (how Photoshop stores shape and Solid Color layers).
const fill = (name, left, top, w, h, color) => ({ name, left, top, imageData: solid(w, h, [color.r, color.g, color.b]), vectorFill: { type: "color", color } });

function write(file, w, h, children, linkedFiles, composite) {
    fs.writeFileSync(file, writePsdBuffer({ width: w, height: h, imageData: composite, children, linkedFiles }, { invalidateTextLayers: true, generateThumbnail: false }));
    console.log("wrote", path.relative(process.cwd(), file));
}

// ---------------------------------------------------------------- offer card (features 9, 10, 11, 6, 8)
{
    const linked = [];
    const bg = gradient(1080, 1350, [245, 245, 240], [225, 225, 218]);
    const children = [
        { name: "Background", imageData: bg, left: 0, top: 0 },
        fill("Accent", 0, 1150, 1080, 200, { r: 253, g: 185, b: 38 }),
        { name: "Media", opened: true, children: [smartObject("Photo", 140, 150, 800, 620, linked), smartObject("Logo", 60, 40, 220, 88, linked)] },
        { name: "Offer", opened: true, children: [fill("Badge Shape", 820, 40, 200, 200, { r: 227, g: 6, b: 19 }), text("Discount", "-0%", 850, 105, 56)] },
        {
            name: "Text",
            opened: true,
            children: [
                text("Name", "Product name", 80, 800, 64, { r: 20, g: 20, b: 30 }),
                text("Price", "0", 80, 900, 72, { r: 227, g: 6, b: 19 }),
                text("Old price", "0", 520, 920, 44, { r: 140, g: 140, b: 150 }),
                text("Ends", "Ends …", 80, 1010, 34, { r: 60, g: 60, b: 70 })
            ]
        },
        { name: "Codes", opened: true, children: [smartObject("QR", 860, 860, 180, 180, linked), smartObject("Barcode", 600, 1060, 420, 80, linked)] },
        text("Phone", "000 0000 0000", 80, 1210, 44, { r: 20, g: 20, b: 30 })
    ];
    write(path.join(PSD, "offer-card-1080x1350.psd"), 1080, 1350, children, linked, bg);
}

// Feature 8: a Shopify product export (documented CSV headers) whose images are links.
// images.example.test is served by the e2e harness's simulated internet.
const csvCell = (v) => (/[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const shopify = [
    ["Handle", "Title", "Body (HTML)", "Vendor", "Type", "Published", "Variant SKU", "Variant Price", "Variant Compare At Price", "Image Src", "Image Position"],
    ["aurora-laptop", "Aurora Laptop 14", "<p>Thin &amp; light, <strong>all-day</strong> battery.</p>", "Nova", "Laptops", "TRUE", "SH-001", "1299.00", "1500.00", "https://images.example.test/laptop.jpg", "1"],
    ["aurora-laptop", "", "", "", "", "", "SH-001-B", "1299.00", "", "https://images.example.test/laptop-side.jpg", "2"],
    ["pulse-phone", "Pulse Phone X", "<p>Bright display.</p>", "Nova", "Phones", "TRUE", "SH-002", "799.00", "", "https://images.example.test/phone.jpg", "1"],
    ["orbit-watch", "Orbit Watch", "<p>Fitness tracking.</p>", "Nova", "Watches", "TRUE", "SH-003", "249.00", "350.00", "https://images.example.test/missing.jpg", "1"],
    ["echo-headphones", "Echo Headphones", "<p>Noise cancelling.</p>", "Nova", "Audio", "TRUE", "SH-004", "199.00", "", "https://images.example.test/page", "1"],
    ["wireless-speaker", "سماعة لاسلكية", "<p>صوت نقي.</p>", "Nova", "Audio", "TRUE", "SH-005", "249.00", "300.00", "https://images.example.test/speaker.webp", "1"]
];
fs.mkdirSync(path.join(OUT, "spreadsheets"), { recursive: true });
fs.writeFileSync(path.join(OUT, "spreadsheets", "shopify-products.csv"), "﻿" + shopify.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n");
console.log("wrote spreadsheets/shopify-products.csv");
