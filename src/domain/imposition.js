// Print layout (feature 13): physical sizes, sheet imposition (N-up) and crop
// marks. Pure: all sizes in millimetres; the PDF builder converts to points.

export const PAPERS = {
    A4: { w: 210, h: 297 },
    A3: { w: 297, h: 420 },
    SRA3: { w: 320, h: 450 },
    A5: { w: 148, h: 210 },
    Letter: { w: 215.9, h: 279.4 },
    Legal: { w: 215.9, h: 355.6 }
};
export const MARK = { offset: 2, length: 4 }; // crop marks start 2 mm from the trim and are 4 mm long
export const MIN_PRINT_DPI = 150;

export const DEFAULT_PRINT = {
    enabled: false,
    layout: "pages", // "pages": one design per page | "sheet": several per sheet
    dpi: 300,
    bleedMm: 0, // bleed already inside the design, per side
    marks: true,
    paper: "A4",
    customW: 210,
    customH: 297,
    orientation: "auto", // auto | portrait | landscape
    gapMm: 4,
    marginMm: 10,
    copies: 1
};

const round1 = (n) => Math.round(n * 10) / 10;

/** Physical size of a design (px at dpi), with its trim size after removing the bleed. */
export function designSizeMm(widthPx, heightPx, dpi, bleedMm = 0) {
    const w = (widthPx / dpi) * 25.4;
    const h = (heightPx / dpi) * 25.4;
    return { w, h, trimW: w - 2 * bleedMm, trimH: h - 2 * bleedMm };
}

export function paperSize(print) {
    if (print.paper === "custom") return { w: Number(print.customW) || 0, h: Number(print.customH) || 0 };
    return PAPERS[print.paper] || PAPERS.A4;
}

function fit(sheetW, sheetH, cellW, cellH, pitchX, pitchY, margin) {
    const usableW = sheetW - 2 * margin;
    const usableH = sheetH - 2 * margin;
    if (cellW > usableW + 1e-6 || cellH > usableH + 1e-6) return { cols: 0, rows: 0 };
    return { cols: 1 + Math.floor((usableW - cellW) / pitchX + 1e-6), rows: 1 + Math.floor((usableH - cellH) / pitchY + 1e-6) };
}

/**
 * Lay designs out on a sheet.
 * Each placed design keeps its bleed; neighbours never overlap: trim boxes are
 * spaced by max(gap, 2 × bleed). Crop marks go in the outer margin, on every
 * cut line, so they never touch artwork (standard for guillotine cutting).
 * @returns {{ok, sheetW, sheetH, orientation, cols, rows, perSheet, cells:[{x,y}], cutsX:number[], cutsY:number[], design, problems:string[]}}
 *          cells are the top-left corners of each design (incl. bleed), from the sheet's top-left.
 */
export function layoutSheet({ design, print }) {
    const problems = [];
    const paper = paperSize(print);
    const bleed = Math.max(0, Number(print.bleedMm) || 0);
    const margin = Math.max(Number(print.marginMm) || 0, print.marks ? MARK.offset + MARK.length + 1 : 0);
    const space = Math.max(Number(print.gapMm) || 0, 2 * bleed);
    const trimW = design.trimW;
    const trimH = design.trimH;
    // Design incl. bleed; with bleed, neighbours are spaced so bleeds don't overlap.
    const pitchX = trimW + space;
    const pitchY = trimH + space;
    const cellW = design.w;
    const cellH = design.h;
    const portrait = { w: Math.min(paper.w, paper.h), h: Math.max(paper.w, paper.h) };
    const options = [
        { orientation: "portrait", sheetW: portrait.w, sheetH: portrait.h },
        { orientation: "landscape", sheetW: portrait.h, sheetH: portrait.w }
    ].filter((o) => print.orientation === "auto" || o.orientation === print.orientation);
    let best = null;
    for (const o of options) {
        const { cols, rows } = fit(o.sheetW, o.sheetH, cellW, cellH, pitchX, pitchY, margin);
        if (!best || cols * rows > best.cols * best.rows) best = { ...o, cols, rows };
    }
    const perSheet = best.cols * best.rows;
    if (!perSheet) {
        problems.push(`The design (${round1(design.w)} × ${round1(design.h)} mm) doesn't fit on ${print.paper === "custom" ? `${paper.w} × ${paper.h} mm` : print.paper} with ${round1(margin)} mm margins. Choose a bigger paper, a lower resolution (dpi) or "one design per page".`);
        return { ok: false, ...best, perSheet: 0, cells: [], cutsX: [], cutsY: [], design, margin, problems };
    }
    // Centre the block on the sheet.
    const blockW = (best.cols - 1) * pitchX + cellW;
    const blockH = (best.rows - 1) * pitchY + cellH;
    const x0 = (best.sheetW - blockW) / 2;
    const y0 = (best.sheetH - blockH) / 2;
    const cells = [];
    for (let r = 0; r < best.rows; r++) for (let c = 0; c < best.cols; c++) cells.push({ x: x0 + c * pitchX, y: y0 + r * pitchY });
    const cutsX = [];
    const cutsY = [];
    for (let c = 0; c < best.cols; c++) cutsX.push(x0 + c * pitchX + bleed, x0 + c * pitchX + bleed + trimW);
    for (let r = 0; r < best.rows; r++) cutsY.push(y0 + r * pitchY + bleed, y0 + r * pitchY + bleed + trimH);
    const dedupe = (a) => [...new Set(a.map((v) => Math.round(v * 1000) / 1000))].sort((p, q) => p - q);
    return { ok: true, ...best, perSheet, cells, cutsX: dedupe(cutsX), cutsY: dedupe(cutsY), design, margin, block: { x: x0, y: y0, w: blockW, h: blockH }, problems };
}

/** Which design goes where: each design repeated `copies` times, filling sheets in order. */
export function sheetPages(count, copies, perSheet) {
    const slots = [];
    for (let i = 0; i < count; i++) for (let k = 0; k < Math.max(1, copies); k++) slots.push(i);
    const pages = [];
    for (let i = 0; i < slots.length; i += perSheet) pages.push(slots.slice(i, i + perSheet));
    return pages;
}

/**
 * Validate the print options against the template size. Returns
 * { blocking: [], warnings: [], design, layout } for the Check step.
 */
export function checkPrint(print, templateSize, count = 1) {
    const blocking = [];
    const warnings = [];
    if (!print || !print.enabled) return { blocking, warnings, design: null, layout: null };
    const dpi = Number(print.dpi);
    if (!(dpi >= 72 && dpi <= 1200)) {
        blocking.push("Print resolution must be between 72 and 1200 dpi.");
        return { blocking, warnings, design: null, layout: null };
    }
    if (!templateSize) return { blocking, warnings, design: null, layout: null };
    const bleed = Number(print.bleedMm) || 0;
    const design = designSizeMm(templateSize.width, templateSize.height, dpi, bleed);
    if (bleed < 0 || bleed > 20 || design.trimW <= 0 || design.trimH <= 0) blocking.push(`Bleed must be between 0 and 20 mm and smaller than half the design (${round1(design.w)} × ${round1(design.h)} mm).`);
    if (dpi < MIN_PRINT_DPI) warnings.push(`${dpi} dpi is low for print; text and edges may look soft. 300 dpi is the standard.`);
    let layout = null;
    if (print.layout === "sheet" && !blocking.length) {
        const copies = Math.round(Number(print.copies));
        if (!(copies >= 1 && copies <= 500)) blocking.push("Copies of each design must be between 1 and 500.");
        if (print.paper === "custom" && !(print.customW >= 50 && print.customH >= 50 && print.customW <= 1500 && print.customH <= 1500)) blocking.push("Custom paper must be between 50 and 1500 mm on each side.");
        if (!blocking.length) {
            layout = layoutSheet({ design, print });
            blocking.push(...layout.problems);
            if (layout.ok) {
                const sheets = Math.ceil((count * copies) / layout.perSheet);
                layout.sheets = sheets;
                const used = (layout.perSheet * design.trimW * design.trimH) / (layout.sheetW * layout.sheetH);
                if (layout.perSheet === 1 && used < 0.25) warnings.push(`Only one design fits per sheet and it covers ${Math.round(used * 100)}% of the paper. "One design per page" may suit better.`);
            }
        }
    }
    return { blocking, warnings, design, layout };
}
