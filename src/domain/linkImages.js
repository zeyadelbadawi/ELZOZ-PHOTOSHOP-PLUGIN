// Images from links (feature 8). Pure helpers: which cells are links, how a
// share link becomes a direct download, what a downloaded file really is, and
// which links a job needs. The download itself is in services (UXP fetch).

export const LINK_FOLDER_KEY = "__links";
export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;

const URL_RE = /^https?:\/\/[^\s/$.?#][^\s]*$/i;
export const isLink = (v) => URL_RE.test(String(v ?? "").trim());

/**
 * Share links that point to a web page instead of the file become direct downloads:
 * Google Drive, Dropbox. Everything else is kept as is (trimmed, spaces encoded).
 */
export function directLink(raw) {
    // Spaces inside a pasted address are common (file names); encode them before checking.
    let u = String(raw ?? "").trim().replace(/ /g, "%20");
    if (!isLink(u)) return null;
    let m = u.match(/^https?:\/\/drive\.google\.com\/file\/d\/([\w-]+)/i) || u.match(/^https?:\/\/drive\.google\.com\/(?:open|uc)\?(?:.*&)?id=([\w-]+)/i);
    if (m) return `https://drive.google.com/uc?export=download&id=${m[1]}`;
    if (/^https?:\/\/(www\.)?dropbox\.com\//i.test(u)) {
        u = u.replace(/([?&])dl=0\b/, "$1dl=1");
        if (!/[?&]dl=1\b/.test(u) && !/[?&]raw=1\b/.test(u)) u += (u.includes("?") ? "&" : "?") + "dl=1";
        return u;
    }
    return u;
}

/** Stable, file-system-safe name for a link (FNV-1a, 2 × 32 bit). */
export function linkFileStem(url) {
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let i = 0; i < url.length; i++) {
        const c = url.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
        h2 = Math.imul(h2 ^ c, 0x811c9dc5) >>> 0;
    }
    return `link-${h1.toString(36)}${h2.toString(36)}`;
}

/** The real type of downloaded bytes (servers often send the wrong content type). */
export function sniffImage(bytes) {
    const b = bytes;
    if (!b || b.length < 12) return null;
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "gif";
    if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a)) return "tif";
    if (b[0] === 0x38 && b[1] === 0x42 && b[2] === 0x50 && b[3] === 0x53) return "psd";
    return null;
}

/** Why a download is not usable, in words a designer understands. */
export function describeDownloadProblem({ status = null, bytes = null, contentType = "", timedOut = false, error = null }) {
    if (timedOut) return "The site didn't answer in time.";
    if (error) return `Couldn't reach the site (${error}).`;
    if (status === 401 || status === 403) return "The link needs a login or isn't shared publicly.";
    if (status === 404 || status === 410) return "Nothing at this link (404).";
    if (status && (status < 200 || status >= 300)) return `The site answered ${status}.`;
    if (bytes && bytes.length > MAX_IMAGE_BYTES) return `The image is larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`;
    if (!bytes || !bytes.length) return "The link returned an empty file.";
    if (!sniffImage(bytes)) return /text\/html/i.test(contentType) ? "The link opens a web page, not an image. Use the image's own address (right-click the image → Copy image address)." : "The link isn't an image (JPG, PNG, WebP, GIF, TIFF or PSD).";
    return null;
}

/** Share of non-empty cells in a column that are links (0..1); used to switch an image rule to links. */
export function linkShare(rows, column) {
    let filled = 0;
    let links = 0;
    for (const r of rows) {
        if (r.isEmpty) continue;
        const v = String((r.values || {})[column] ?? "").trim();
        if (!v) continue;
        filled++;
        if (directLink(v)) links++;
    }
    return filled ? links / filled : 0;
}

/** The direct links a mapping needs from these rows (deduplicated, in order). */
export function linksNeeded(rows, mapping) {
    const rules = Object.values(mapping.images || {}).filter((r) => r.source === "link");
    const out = [];
    const seen = new Set();
    for (const r of rows) {
        if (r.isEmpty) continue;
        for (const rule of rules) {
            const url = directLink((r.values || {})[rule.column]);
            if (url && !seen.has(url)) {
                seen.add(url);
                out.push(url);
            }
        }
    }
    return out;
}
