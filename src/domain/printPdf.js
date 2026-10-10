// Print PDFs (feature 13) and client approval sheets (feature 14), built from
// the JPEGs Photoshop exports. Designs are streamed into the file as they are
// rendered; the page layout is written at the end.
import { createPdfWriter, latinOnly, MM, PageContent } from "./pdf.js";
import { designSizeMm, layoutSheet, MARK, sheetPages } from "./imposition.js";

const markArea = MARK.offset + MARK.length + 2; // mm of paper around a single page for its marks

/** Corner crop marks around a trim box (points, PDF coordinates). */
function cornerMarks(c, x, y, w, h) {
    const o = MARK.offset * MM;
    const l = MARK.length * MM;
    for (const [cx, sx] of [[x, -1], [x + w, 1]])
        for (const [cy, sy] of [[y, -1], [y + h, 1]]) {
            c.line(cx + sx * o, cy, cx + sx * (o + l), cy);
            c.line(cx, cy + sy * o, cx, cy + sy * (o + l));
        }
}

/**
 * @param {object} p
 * @param {(bytes: Uint8Array) => Promise<void>} p.write   appends to the PDF file
 * @param {object} p.print       DEFAULT_PRINT-shaped options
 * @param {{width, height}} p.size  design size in px (every design has the template's size)
 */
export function createPrintPdf({ write, print, size, title = "Elzoz print" }) {
    const pdf = createPdfWriter(write, { title });
    const design = designSizeMm(size.width, size.height, print.dpi, Number(print.bleedMm) || 0);
    const bleed = (Number(print.bleedMm) || 0) * MM;
    const images = [];
    const sheet = print.layout === "sheet" ? layoutSheet({ design, print }) : null;
    if (sheet && !sheet.ok) throw new Error(sheet.problems[0]);

    return {
        design,
        sheet,
        async addDesign(jpegBytes) {
            const im = await pdf.addJpeg(jpegBytes);
            images.push(im);
            if (sheet) return;
            const w = design.w * MM;
            const h = design.h * MM;
            const pad = print.marks ? markArea * MM : 0;
            const c = new PageContent().image(im.name, pad, pad, w, h);
            if (print.marks) cornerMarks(c, pad + bleed, pad + bleed, w - 2 * bleed, h - 2 * bleed);
            pdf.addPage({
                width: w + 2 * pad,
                height: h + 2 * pad,
                content: c,
                images: [im],
                trimBox: [pad + bleed, pad + bleed, pad + w - bleed, pad + h - bleed],
                bleedBox: [pad, pad, pad + w, pad + h]
            });
        },
        async finish() {
            if (sheet) {
                const pages = sheetPages(images.length, Math.round(Number(print.copies)) || 1, sheet.perSheet);
                const W = sheet.sheetW * MM;
                const H = sheet.sheetH * MM;
                pages.forEach((slots, pi) => {
                    const c = new PageContent();
                    const used = new Map();
                    slots.forEach((imgIndex, k) => {
                        const im = images[imgIndex];
                        used.set(im.name, im);
                        const cell = sheet.cells[k];
                        c.image(im.name, cell.x * MM, H - (cell.y + design.h) * MM, design.w * MM, design.h * MM);
                    });
                    if (print.marks) {
                        // Cut lines in the margin around the block, on every trim edge.
                        const b = sheet.block;
                        const top = H - b.y * MM;
                        const bottom = H - (b.y + b.h) * MM;
                        const left = b.x * MM;
                        const right = (b.x + b.w) * MM;
                        const o = MARK.offset * MM;
                        const l = MARK.length * MM;
                        for (const x of sheet.cutsX) {
                            c.line(x * MM, top + o, x * MM, top + o + l);
                            c.line(x * MM, bottom - o, x * MM, bottom - o - l);
                        }
                        for (const y of sheet.cutsY) {
                            const py = H - y * MM;
                            c.line(left - o, py, left - o - l, py);
                            c.line(right + o, py, right + o + l, py);
                        }
                    }
                    const slug = `Elzoz  |  sheet ${pi + 1}/${pages.length}  |  ${print.paper === "custom" ? `${print.customW}x${print.customH} mm` : print.paper}  |  ${sheet.perSheet}-up  |  ${print.dpi} dpi`;
                    if (sheet.margin >= 5) c.text(slug, W / 2, 2.2 * MM, { size: 6, gray: 0.45, align: "center" });
                    pdf.addPage({ width: W, height: H, content: c, images: [...used.values()] });
                });
            }
            return pdf.finish();
        }
    };
}

export const PROOF_GRIDS = { 4: [2, 2], 6: [2, 3], 9: [3, 3], 12: [3, 4] };

/**
 * Client approval sheet: numbered thumbnails on A4 pages.
 * Each thumbnail already carries its watermark and label (stamped in Photoshop).
 */
export function createProofPdf({ write, perPage = 6, title = "", dateText = "" }) {
    const pdf = createPdfWriter(write, { title: title || "Elzoz approval sheet" });
    const items = [];
    const [cols, rows] = PROOF_GRIDS[perPage] || PROOF_GRIDS[6];
    return {
        async addProof(jpegBytes, { number, label = "" }) {
            const im = await pdf.addJpeg(jpegBytes);
            items.push({ im, number, label });
        },
        async finish() {
            const W = 595.28;
            const H = 841.89;
            const m = 36;
            const headerH = 54;
            const footerH = 30;
            const gap = 14;
            const labelH = 16;
            const cellW = (W - 2 * m - (cols - 1) * gap) / cols;
            const cellH = (H - 2 * m - headerH - footerH - (rows - 1) * gap) / rows;
            const per = cols * rows;
            const pageCount = Math.max(1, Math.ceil(items.length / per));
            for (let p = 0; p < pageCount; p++) {
                const c = new PageContent();
                const used = [];
                c.text("APPROVAL SHEET", m, H - m - 16, { size: 16, bold: true });
                const sub = [latinOnly(title) && title ? title : "", dateText, `${items.length} design${items.length === 1 ? "" : "s"}`].filter(Boolean).join("  |  ");
                c.text(sub, m, H - m - 32, { size: 9, gray: 0.35 });
                c.line(m, H - m - headerH + 10, W - m, H - m - headerH + 10, { width: 0.5, gray: 0.8 });
                items.slice(p * per, (p + 1) * per).forEach((it, k) => {
                    used.push(it.im);
                    const col = k % cols;
                    const row = Math.floor(k / cols);
                    const x = m + col * (cellW + gap);
                    const yTop = H - m - headerH - row * (cellH + gap);
                    const boxH = cellH - labelH;
                    const scale = Math.min(cellW / it.im.width, boxH / it.im.height);
                    const w = it.im.width * scale;
                    const h = it.im.height * scale;
                    const ix = x + (cellW - w) / 2;
                    const iy = yTop - boxH + (boxH - h) / 2;
                    c.rect(ix - 0.5, iy - 0.5, w + 1, h + 1, { stroke: [0.82, 0.82, 0.82], width: 0.5 });
                    c.image(it.im.name, ix, iy, w, h);
                    const tag = `#${it.number}`;
                    c.rect(x, yTop - cellH + 1, 10 + tag.length * 6.4, 13, { fill: [0.12, 0.12, 0.14] });
                    c.text(tag, x + 5, yTop - cellH + 4.5, { size: 9, bold: true, gray: 1 });
                    if (it.label && latinOnly(it.label)) c.text(it.label.length > 38 ? `${it.label.slice(0, 37)}…`.replace("…", "...") : it.label, x + 16 + tag.length * 6.4, yTop - cellH + 4.5, { size: 8, gray: 0.3 });
                });
                c.text("Reply with the numbers that need changes, or OK to approve them all.", m, m - 8, { size: 8.5, gray: 0.35 });
                c.text(`${p + 1} / ${pageCount}`, W - m, m - 8, { size: 8.5, gray: 0.35, align: "right" });
                pdf.addPage({ width: W, height: H, content: c, images: used });
            }
            return pdf.finish();
        }
    };
}
