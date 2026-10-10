// Store product exports (feature 8): Shopify, WooCommerce, and Arabic stores
// (Salla / Zid) recognised by their column names, then prepared for designs:
// one row per product with ready columns Name, Price, Old price, Photo (a link,
// downloaded automatically), SKU, Description (plain text) and Category.
//
// Shopify and WooCommerce column names are their documented CSV headers.
// Salla and Zid don't publish a fixed export layout, so their files are
// recognised by common Arabic/English column names, not by exact headers.
import { directLink } from "./linkImages.js";
import { parseNumber } from "./transforms.js";

export const STORE_COLUMNS = ["Name", "Price", "Old price", "Photo", "SKU", "Description", "Category"];

const norm = (s) =>
    String(s ?? "")
        .toLowerCase()
        .replace(/[ً-ٰٟ]/g, "")
        .replace(/[أإآ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/[_\-:]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const SYNONYMS = {
    name: ["اسم المنتج", "المنتج", "الاسم", "اسم", "product name", "name", "title", "product title"],
    price: ["السعر", "سعر المنتج", "سعر البيع", "price", "regular price", "product price"],
    sale: ["سعر التخفيض", "السعر المخفض", "السعر بعد الخصم", "السعر بعد التخفيض", "سعر العرض", "سعر الخصم", "sale price", "discount price", "special price"],
    image: ["صوره المنتج", "الصوره", "الصور", "صور المنتج", "رابط الصوره", "الصوره الرئيسيه", "image", "images", "image url", "image link", "product image", "product images", "main image", "image src"],
    sku: ["رمز المنتج", "رمز التخزين", "sku", "كود المنتج", "الكود", "رقم المنتج", "product code", "barcode"],
    description: ["الوصف", "وصف المنتج", "الوصف المختصر", "description", "short description", "body"],
    category: ["التصنيف", "التصنيفات", "القسم", "الاقسام", "category", "categories", "type"]
};

function findColumn(headers, field) {
    const keys = headers.filter((h) => !h.derived).map((h) => h.key);
    const wanted = SYNONYMS[field].map(norm);
    for (const w of wanted) {
        const hit = keys.find((k) => norm(k) === w);
        if (hit) return hit;
    }
    return null;
}

const has = (headers, name) => headers.some((h) => norm(h.key) === norm(name));

/** Which store exported this file, and which column holds what. null if it doesn't look like a store export. */
export function detectStore(headers) {
    if (!headers || !headers.length) return null;
    if (has(headers, "Handle") && (has(headers, "Variant Price") || has(headers, "Image Src"))) {
        return { id: "shopify", label: "Shopify", cols: { name: "Title", price: "Variant Price", old: "Variant Compare At Price", image: "Image Src", sku: "Variant SKU", description: "Body (HTML)", category: has(headers, "Type") ? "Type" : null, group: "Handle", position: "Image Position" } };
    }
    if (has(headers, "Regular price") && (has(headers, "Images") || has(headers, "SKU"))) {
        return { id: "woocommerce", label: "WooCommerce", cols: { name: "Name", price: "Regular price", sale: "Sale price", image: "Images", sku: "SKU", description: has(headers, "Short description") ? "Short description" : "Description", category: "Categories", type: "Type" } };
    }
    const cols = { name: findColumn(headers, "name"), price: findColumn(headers, "price"), sale: findColumn(headers, "sale"), image: findColumn(headers, "image"), sku: findColumn(headers, "sku"), description: findColumn(headers, "description"), category: findColumn(headers, "category") };
    const arabic = headers.some((h) => /[؀-ۿ]/.test(h.key));
    // A store export has at least a product name, a price and an image or code.
    if (cols.name && cols.price && (cols.image || cols.sku)) return { id: arabic ? "arabic" : "generic", label: arabic ? "Salla / Zid" : "Store export", cols };
    return null;
}

/** Plain text from store HTML descriptions. */
export function stripHtml(html) {
    return String(html ?? "")
        .replace(/<\s*(br|\/p|\/div|\/li|\/h\d)\s*\/?>/gi, "\n")
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/[ \t]+/g, " ")
        .replace(/\s*\n\s*/g, "\n")
        .replace(/\n{2,}/g, "\n")
        .trim();
}

/** The first image link in a cell (stores list several, separated by commas or spaces). */
export function firstImageLink(cell) {
    const parts = String(cell ?? "")
        .split(/\s*[,|;]\s*|\s+(?=https?:\/\/)/)
        .map((s) => s.trim())
        .filter(Boolean);
    for (const p of parts) {
        const link = directLink(p.replace(/^.*?(https?:\/\/)/i, "$1"));
        if (link) return link;
    }
    return "";
}

const priceOf = (v) => {
    const n = parseNumber(v);
    return n === null ? null : n;
};

/**
 * Prepare a store export for designs.
 * @returns {{table, note: {store, products, merged, sale}}} the new table (store columns added) and a summary
 */
export function prepareStoreTable(table, store) {
    const c = store.cols;
    const get = (row, col) => (col ? String(row.values[col] ?? "").trim() : "");
    let rows = table.rows.filter((r) => !r.isEmpty);
    let merged = 0;
    const extraImage = new Map();
    if (store.id === "shopify") {
        // One product = rows sharing a Handle: the first has the title and price; later rows add images/variants.
        const byHandle = new Map();
        for (const r of rows) {
            const h = get(r, c.group);
            if (!h) continue;
            if (!byHandle.has(h)) byHandle.set(h, r);
            else {
                merged++;
                const img = get(r, c.image);
                const pos = Number(get(r, c.position));
                if (img && pos === 1) extraImage.set(h, img); // the main image can come on a later row
            }
        }
        rows = [...byHandle.values()];
    }
    if (store.id === "woocommerce" && c.type) {
        // Variations repeat their parent's name; keep simple and variable products.
        const before = rows.length;
        rows = rows.filter((r) => !/^variation$/i.test(get(r, c.type)));
        merged += before - rows.length;
    }
    let sale = 0;
    const out = rows.map((r) => {
        const values = { ...r.values };
        const regular = get(r, c.price);
        const old = store.id === "shopify" ? get(r, c.old) : "";
        const salePrice = get(r, c.sale);
        let price = regular;
        let oldPrice = "";
        if (store.id === "shopify" && old && priceOf(old) > priceOf(regular)) oldPrice = old;
        if (salePrice && priceOf(salePrice) !== null && priceOf(regular) !== null && priceOf(salePrice) < priceOf(regular)) {
            price = salePrice;
            oldPrice = regular;
        }
        if (oldPrice) sale++;
        const image = store.id === "shopify" ? directLink(get(r, c.image) || extraImage.get(get(r, c.group)) || "") || "" : firstImageLink(get(r, c.image));
        values.Name = get(r, c.name);
        values.Price = price;
        values["Old price"] = oldPrice;
        values.Photo = image;
        values.SKU = get(r, c.sku);
        values.Description = stripHtml(get(r, c.description));
        values.Category = get(r, c.category).split(/[,>|]/)[0].trim();
        return { ...r, values };
    });
    const added = STORE_COLUMNS.filter((k) => !table.headers.some((h) => h.key === k));
    const headers = [...table.headers.map((h) => (STORE_COLUMNS.includes(h.key) ? { ...h, store: true } : h)), ...added.map((k) => ({ key: k, label: k, store: true }))];
    return {
        table: { ...table, headers, rows: out.map((r, i) => ({ ...r, index: i })) },
        note: { store: store.label, products: out.length, merged, sale }
    };
}
