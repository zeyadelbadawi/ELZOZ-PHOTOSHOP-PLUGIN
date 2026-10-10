// Browser-only renderer for the simulator: composites the simulated document
// into a real JPEG/PNG with canvas, so outputs and video frames are genuine,
// decodable images. Every image is stamped "SIMULATED — not Photoshop".
// This approximates Photoshop rendering (no blend modes, effects or real text
// engine); it exists to make placement, text and animation visible.

export function createCanvasRenderer({ pixelStore, fileBytes, subjectOf = null, stamp = "SIMULATED — not Photoshop" }) {
    const bitmaps = new Map();
    const pixelCanvases = new Map();

    async function bitmap(name) {
        if (bitmaps.has(name)) return bitmaps.get(name);
        const bytes = fileBytes(name);
        let bm = null;
        if (bytes) {
            try {
                bm = await createImageBitmap(new Blob([bytes]));
            } catch (e) {
                bm = null;
            }
        }
        bitmaps.set(name, bm);
        return bm;
    }

    function pixelCanvas(key) {
        if (pixelCanvases.has(key)) return pixelCanvases.get(key);
        const px = pixelStore.get(key);
        let c = null;
        if (px && px.width && px.height) {
            c = new OffscreenCanvas(px.width, px.height);
            c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(px.data), px.width, px.height), 0, 0);
        }
        pixelCanvases.set(key, c);
        return c;
    }

    async function drawLayer(ctx, l, alpha) {
        if (!l.visible) return;
        const a = alpha * ((l.opacity ?? 100) / 100);
        if (a <= 0) return;
        if (l.kind === "group") {
            if (l.artboard) {
                // Artboards have a white background of their own.
                const r = l.artboard.rect;
                ctx.globalAlpha = 1;
                ctx.fillStyle = "#fff";
                ctx.fillRect(r.left, r.top, r.right - r.left, r.bottom - r.top);
            }
            for (const child of (l.layers || []).slice().reverse()) await drawLayer(ctx, child, a);
            return;
        }
        const b = l.b;
        const w = b.right - b.left;
        const h = b.bottom - b.top;
        ctx.globalAlpha = a;
        if (l.kind === "text") {
            const size = (l.fontSize || 24) * l.scaleFactor();
            ctx.font = `bold ${Math.max(1, size)}px "DejaVu Sans", Arial, sans-serif`;
            ctx.fillStyle = l.color || "#fff";
            ctx.textBaseline = "alphabetic";
            String(l._text ?? "").split(/\r|\n/).forEach((line, i) => ctx.fillText(line, b.left, b.top + size * (1 + i * 1.2), Math.max(w, size) * 3));
        } else if (l.kind === "solidColor") {
            ctx.fillStyle = l.fillColor || "#000";
            ctx.fillRect(b.left, b.top, w, h);
        } else if (l.kind === "smartObject" && l.content) {
            const bm = await bitmap(l.content);
            if (bm && l.mask === "subject" && subjectOf) {
                // Simulated Remove Background: only the subject box stays visible.
                const r = subjectOf(l.content) || { l: 0, t: 0, r: 1, b: 1 };
                ctx.save();
                ctx.beginPath();
                ctx.rect(b.left + r.l * w, b.top + r.t * h, (r.r - r.l) * w, (r.b - r.t) * h);
                ctx.clip();
                ctx.drawImage(bm, b.left, b.top, w, h);
                ctx.restore();
            } else if (bm) ctx.drawImage(bm, b.left, b.top, w, h);
        } else if (l.pixels) {
            const c = pixelCanvas(l.pixels);
            if (c && w > 0 && h > 0) ctx.drawImage(c, b.left, b.top, w, h);
        }
        ctx.globalAlpha = 1;
    }

    return async function render(doc, format) {
        const canvas = new OffscreenCanvas(Math.round(doc.width), Math.round(doc.height));
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (doc.canvasFill) {
            // Canvas added by Canvas Size shows the background color below the original area.
            ctx.fillStyle = doc.canvasFill;
            ctx.fillRect(0, doc.originalHeight || 0, canvas.width, canvas.height - (doc.originalHeight || 0));
        }
        for (const l of doc.layers.slice().reverse()) await drawLayer(ctx, l, 1);
        const s = Math.max(14, Math.round(canvas.width / 45));
        ctx.font = `bold ${s}px sans-serif`;
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        const tw = ctx.measureText(stamp).width;
        ctx.fillRect(canvas.width - tw - s * 1.2, canvas.height - s * 2, tw + s, s * 1.6);
        ctx.fillStyle = "#ffd75e";
        ctx.fillText(stamp, canvas.width - tw - s * 0.7, canvas.height - s * 0.8);
        const blob = await canvas.convertToBlob({ type: format === "png" ? "image/png" : "image/jpeg", quality: 0.88 });
        return new Uint8Array(await blob.arrayBuffer());
    };
}
